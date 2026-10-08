require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { OAuth2Client } = require('google-auth-library');
const { db, seedUser } = require('./db');
const { encryptJson, decryptJson, randomId, signCookie, verifyCookie } = require('./crypto');
const v = require('./validate');
const sim = require('./simulate');
const catalog = require('../catalog');
const { tryLive, tryWithRotation, keyPresence, callGemini, callGitHubModels } = require('./providers');

const PORT = Number(process.env.PORT || 3847);
const ORIGIN = process.env.APP_ORIGIN || `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const UPLOADS = path.join(ROOT, 'uploads');
const PUBLIC_FILES = new Set(['index.html', 'app.js', 'styles.css', 'README.md', 'catalog.js']);
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const AUDIO_FILES = {
  hello: 'hello_how_can_i_help_you.mp3',
  today: 'what_i_can_do_for_you_today.mp3',
  online: 'noahs_online.mp3',
  offline: 'noahs_offline.mp3'
};
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.md', '.docx']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${randomId()}${ALLOWED_EXT.has(ext) ? ext : ''}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      return cb(Object.assign(new Error('File type not allowed'), { status: 400 }));
    }
    cb(null, true);
  }
});

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com', 'https://cdn.lr-in.com', 'https://cdn.lr-ingest.io', 'https://cdn.logrocket.io'],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      connectSrc: ["'self'", 'https://accounts.google.com', 'https://*.logrocket.io', 'https://*.lr-ingest.io', 'https://*.logrocket.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com']
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

const apiLimit = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: true,
  legacyHeaders: false
});
const chatLimit = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimit);
app.use('/audio', express.static(AUDIO_DIR, { index: false, fallthrough: true }));
app.use('/audio', (_req, res) => res.status(204).end());

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000
  };
}

function currentUser(req) {
  const signed = verifyCookie(req.cookies.noahs_session || '');
  if (!signed) return null;
  const row = db.prepare('SELECT s.user_id, s.expires_at, u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(signed);
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  next();
}

function createSession(res, userId) {
  const id = randomId();
  const expires = Date.now() + 14 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expires);
  res.cookie('noahs_session', signCookie(id), cookieOptions());
}

function parseActiveModels(raw) {
  if (!raw) return ['deepseek'];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* legacy single id */ }
  if (raw === 'all') return ['chatgpt', 'claude', 'deepseek', 'gemini'];
  return [String(raw)];
}

function parseJson(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function audioAvailability() {
  const out = {};
  for (const [key, file] of Object.entries(AUDIO_FILES)) {
    out[key] = fs.existsSync(path.join(AUDIO_DIR, file));
  }
  return out;
}

function getSettings(userId) {
  let row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
  }
  return row;
}

function keysFor(userId) {
  return decryptJson(getSettings(userId).encrypted_keys);
}

function compactFromFeedback(userId) {
  const rows = db.prepare('SELECT rating FROM feedback_log WHERE user_id = ? ORDER BY id DESC LIMIT 5').all(userId);
  return rows.length >= 3 && rows.slice(0, 3).every((row) => row.rating === 'down');
}

function notify(userId, body) {
  db.prepare('INSERT INTO notifications (user_id, body) VALUES (?, ?)').run(userId, body);
}

app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    allowLocalOwner: process.env.ALLOW_LOCAL_OWNER === 'true',
    origin: ORIGIN,
    logRocketAppId: process.env.LOGROCKET_APP_ID || '',
    audio: audioAvailability(),
    catalog: {
      direct: catalog.DIRECT_MODELS,
      roles: catalog.ROLE_POOLS,
      agents: catalog.CODING_AGENTS,
      groups: catalog.AGENT_GROUPS
    }
  });
});

app.post('/api/auth/google', async (req, res, next) => {
  try {
    if (!googleClient) return res.status(503).json({ error: 'Google sign-in is not configured on the server' });
    const body = v.parse(v.idToken, req.body);
    const ticket = await googleClient.verifyIdToken({ idToken: body.credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return res.status(401).json({ error: 'Invalid Google token' });
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(payload.sub);
    if (!user) {
      const inserted = db.prepare('INSERT INTO users (google_id, email, display_name) VALUES (?, ?, ?)').run(payload.sub, payload.email, payload.name || payload.email);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(inserted.lastInsertRowid);
      seedUser(user.id);
    }
    createSession(res, user.id);
    res.json({ id: user.id, email: user.email, display_name: user.display_name });
  } catch (err) { next(err); }
});

app.post('/api/auth/local', (req, res) => {
  if (process.env.ALLOW_LOCAL_OWNER !== 'true') return res.status(403).json({ error: 'Local owner mode is disabled' });
  let user = db.prepare("SELECT * FROM users WHERE google_id = 'local-owner'").get();
  if (!user) {
    const inserted = db.prepare("INSERT INTO users (google_id, email, display_name) VALUES ('local-owner', 'owner@local', 'Farees')").run();
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(inserted.lastInsertRowid);
    seedUser(user.id);
  }
  createSession(res, user.id);
  res.json({ id: user.id, email: user.email, display_name: user.display_name, local: true });
});

app.post('/api/auth/logout', requireUser, (req, res) => {
  const signed = verifyCookie(req.cookies.noahs_session || '');
  if (signed) db.prepare('DELETE FROM sessions WHERE id = ?').run(signed);
  res.clearCookie('noahs_session', { ...cookieOptions(), maxAge: 0 });
  res.json({ ok: true });
});

app.get('/api/me', requireUser, (req, res) => {
  const settings = getSettings(req.user.id);
  const keys = keyPresence(keysFor(req.user.id));
  const greeting = db.prepare('SELECT last_greeting_index FROM users WHERE id = ?').get(req.user.id);
  res.json({
    user: { id: req.user.id, email: req.user.email, display_name: req.user.display_name },
    settings: {
      theme: settings.theme,
      reply_mode: settings.reply_mode,
      voice_enabled: Boolean(settings.voice_enabled),
      active_model: settings.active_model,
      active_models: parseActiveModels(settings.active_model),
      master_power: Boolean(settings.master_power),
      personality_preset: settings.personality_preset,
      voice_pitch: settings.voice_pitch,
      voice_rate: settings.voice_rate,
      auto_submit_voice: Boolean(settings.auto_submit_voice),
      layout_mode: settings.layout_mode || 'home',
      cube_visible: settings.cube_visible == null ? true : Boolean(settings.cube_visible),
      role_pools: parseJson(settings.role_pools, catalog.defaultRolePools()),
      active_agents: parseJson(settings.active_agents, [])
    },
    keys,
    compact: compactFromFeedback(req.user.id),
    lastGreetingIndex: greeting?.last_greeting_index || 0
  });
});

app.post('/api/greeting/next', requireUser, (req, res) => {
  const row = db.prepare('SELECT last_greeting_index FROM users WHERE id = ?').get(req.user.id);
  const current = row?.last_greeting_index ? 1 : 0;
  const next = current === 0 ? 1 : 0;
  db.prepare('UPDATE users SET last_greeting_index = ? WHERE id = ?').run(next, req.user.id);
  res.json({ clip: current === 0 ? 'hello' : 'today', nextIndex: next });
});

app.patch('/api/profile', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.profileBody, req.body);
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(body.display_name, req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/bootstrap', requireUser, (req, res) => {
  const uid = req.user.id;
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ?').all(uid);
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC').all(uid);
  const memories = db.prepare('SELECT * FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(uid);
  const conversations = db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC').all(uid);
  const latest = conversations[0];
  const messages = latest
    ? db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(latest.id)
    : [];
  const approvals = db.prepare("SELECT * FROM approvals WHERE user_id = ? AND status = 'pending'").all(uid);
  const files = db.prepare('SELECT id, original_name, mime_type, size, tag, created_at FROM files WHERE user_id = ? ORDER BY id DESC').all(uid);
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(uid);
  res.json({ projects, tasks, memories, conversations, messages, approvals, files, notifications });
});

app.put('/api/settings', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.settingsBody, req.body);
    const current = getSettings(req.user.id);
    const models = body.active_models || (body.active_model ? parseActiveModels(body.active_model) : parseActiveModels(current.active_model));
    const nextSettings = {
      theme: body.theme ?? current.theme,
      reply_mode: body.reply_mode ?? current.reply_mode,
      voice_enabled: body.voice_enabled == null ? current.voice_enabled : (body.voice_enabled ? 1 : 0),
      active_model: JSON.stringify(models),
      master_power: body.master_power == null ? current.master_power : (body.master_power ? 1 : 0),
      personality_preset: body.personality_preset ?? current.personality_preset,
      voice_pitch: body.voice_pitch ?? current.voice_pitch,
      voice_rate: body.voice_rate ?? current.voice_rate,
      auto_submit_voice: body.auto_submit_voice == null ? current.auto_submit_voice : (body.auto_submit_voice ? 1 : 0),
      layout_mode: body.layout_mode ?? current.layout_mode ?? 'home',
      cube_visible: body.cube_visible == null ? (current.cube_visible == null ? 1 : current.cube_visible) : (body.cube_visible ? 1 : 0),
      role_pools: body.role_pools ? JSON.stringify(body.role_pools) : (current.role_pools || JSON.stringify(catalog.defaultRolePools())),
      active_agents: body.active_agents ? JSON.stringify(body.active_agents) : (current.active_agents || '[]')
    };
    db.prepare(`UPDATE settings SET theme=?, reply_mode=?, voice_enabled=?, active_model=?, master_power=?, personality_preset=?, voice_pitch=?, voice_rate=?, auto_submit_voice=?, layout_mode=?, cube_visible=?, role_pools=?, active_agents=? WHERE user_id=?`).run(
      nextSettings.theme, nextSettings.reply_mode, nextSettings.voice_enabled, nextSettings.active_model,
      nextSettings.master_power, nextSettings.personality_preset, nextSettings.voice_pitch, nextSettings.voice_rate,
      nextSettings.auto_submit_voice, nextSettings.layout_mode, nextSettings.cube_visible, nextSettings.role_pools,
      nextSettings.active_agents, req.user.id
    );
    if (body.master_power === false) notify(req.user.id, 'NOAH\'S dipindah ke OFFLINE.');
    if (body.master_power === true) notify(req.user.id, 'NOAH\'S ONLINE.');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.put('/api/keys', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.keysBody, req.body);
    const current = keysFor(req.user.id);
    const merged = { ...current };
    for (const name of ['chatgpt', 'claude', 'deepseek', 'gemini', 'github_models', 'openrouter']) {
      if (typeof body[name] === 'string' && body[name].trim()) merged[name] = body[name].trim();
      if (body[name] === '') merged[name] = '';
    }
    db.prepare('UPDATE settings SET encrypted_keys = ? WHERE user_id = ?').run(encryptJson(merged), req.user.id);
    res.json({ keys: keyPresence(merged) });
  } catch (err) { next(err); }
});

app.post('/api/projects', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.projectBody, req.body);
    const id = `project-${Date.now()}`;
    db.prepare('INSERT INTO projects (id, user_id, name, progress, color, summary, next_step, mode) VALUES (?, ?, ?, 0, ?, ?, ?, ?)').run(
      id, req.user.id, body.name, 'violet', 'A fresh project, ready for its first clear decision.', 'Describe the outcome you want', body.mode || 'combination'
    );
    res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  } catch (err) { next(err); }
});

app.post('/api/tasks', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.taskBody, req.body);
    if (body.id != null) {
      db.prepare('UPDATE tasks SET done = ? WHERE id = ? AND user_id = ?').run(body.done ? 1 : 0, body.id, req.user.id);
      return res.json({ ok: true });
    }
    const result = db.prepare('INSERT INTO tasks (user_id, project_id, text, tag, done) VALUES (?, ?, ?, ?, 0)').run(
      req.user.id, body.project_id || null, body.text, body.tag || 'Now'
    );
    res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { next(err); }
});

app.post('/api/memories', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.memoryBody, req.body);
    const result = db.prepare('INSERT INTO memories (user_id, project_id, body, tag) VALUES (?, ?, ?, ?)').run(req.user.id, body.project_id || null, body.body, body.tag || 'general');
    res.json(db.prepare('SELECT * FROM memories WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { next(err); }
});

app.delete('/api/memories/:id', requireUser, (req, res) => {
  db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

app.get('/api/conversations', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id));
});

app.get('/api/conversations/:id', requireUser, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(conv.id);
  res.json({ conversation: conv, messages });
});

app.patch('/api/conversations/:id', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.conversationPatch, req.body);
    db.prepare('UPDATE conversations SET title = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(body.title, Number(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.delete('/api/conversations/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/chat', requireUser, chatLimit, async (req, res, next) => {
  try {
    const body = v.parse(v.chatBody, req.body);
    const settings = getSettings(req.user.id);
    if (!settings.master_power) return res.status(409).json({ error: 'NOAH\'S is offline' });
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(body.projectId || 'ai-hub', req.user.id)
      || db.prepare('SELECT * FROM projects WHERE user_id = ? LIMIT 1').get(req.user.id);
    const wanted = body.models.slice(0, 4);
    let convId = body.conversationId;
    if (convId) {
      const owned = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(convId, req.user.id);
      if (!owned) return res.status(404).json({ error: 'Conversation not found' });
    } else {
      const created = db.prepare('INSERT INTO conversations (user_id, project_id, mode, model, title) VALUES (?, ?, ?, ?, ?)').run(
        req.user.id, project?.id, body.mode, JSON.stringify(wanted), body.input.slice(0, 72)
      );
      convId = created.lastInsertRowid;
    }
    db.prepare('UPDATE conversations SET mode=?, model=?, updated_at=datetime(\'now\') WHERE id=?').run(body.mode, JSON.stringify(wanted), convId);
    db.prepare('INSERT INTO messages (conversation_id, role, content, model_used) VALUES (?, ?, ?, ?)').run(
      convId, 'user', JSON.stringify({ text: body.input, fileIds: body.fileIds || [] }), null
    );
    const compact = compactFromFeedback(req.user.id);
    const keys = keysFor(req.user.id);
    const rolePools = parseJson(settings.role_pools, catalog.defaultRolePools());
    const extraSystem = body.mode === 'analysis'
      ? 'Security/quality review only. Never execute or change files. State a confidence level (low/medium/high) for every finding. Remind the user this is discussion, not a real scanner.'
      : '';
    const liveResults = {};
    await Promise.all(wanted.map(async (id) => {
      liveResults[id] = await tryWithRotation(id, keys, body.input, settings.personality_preset, rolePools, extraSystem);
    }));

    let payload = null;
    let text = '';
    let anyLive = wanted.some((id) => liveResults[id]?.live);
    const projectView = { name: project?.name || 'Project' };
    const labelVia = (id) => liveResults[id]?.via ? `<span class="route-tag">via ${liveResults[id].via}</span>` : '';

    if (body.mode === 'learning') {
      text = sim.createLearningResponse(body.input, projectView, compact);
      if (liveResults[wanted[0]]?.live) {
        text = `${liveResults[wanted[0]].text}<br><span class="live-badge">LIVE</span>${labelVia(wanted[0])}<p class="check-question"><b>Cek pemahaman:</b> Coba jelaskan ulang dengan kata-katamu apa yang baru saja kamu pelajari?</p>`;
        anyLive = true;
      }
    } else if (body.mode === 'ghost') {
      text = liveResults[wanted[0]]?.live
        ? `${liveResults[wanted[0]].text}<br><span class="live-badge">LIVE</span>${labelVia(wanted[0])}<span class="route-tag">Ghost · live</span>`
        : sim.createGhostResponse(body.input, projectView, wanted.join(', '));
    } else if (body.mode === 'analysis') {
      text = liveResults[wanted[0]]?.live
        ? `${liveResults[wanted[0]].text}<br><span class="live-badge">LIVE</span>${labelVia(wanted[0])}<p class="privacy-note">Gemini tier gratis: data boleh dipakai Google. Bukan pengganti Aikido/DeepSource/CodeRabbit.</p>`
        : sim.createAnalysisResponse(body.input, projectView, compact);
    } else if (body.mode === 'builder' || body.mode === 'combination' || body.mode === 'auto') {
      const mode = body.mode === 'auto'
        ? (body.input.toLowerCase().includes('jelaskan') ? 'learning' : 'combination')
        : body.mode;
      if (mode === 'learning') {
        text = sim.createLearningResponse(body.input, projectView, compact);
      } else {
        const mock = sim.createModelProposals(body.input, projectView, compact);
        const proposals = wanted.map((id) => {
          const found = catalog.findModel(id);
          const mockItem = mock.find((item) => item.id === id);
          const live = liveResults[id];
          return {
            id,
            name: found?.label || mockItem?.name || id,
            text: live?.live ? live.text : (mockItem?.text || `Usulan simulasi untuk ${found?.label || id}.`),
            live: Boolean(live?.live),
            via: live?.via || ''
          };
        });
        const reviews = wanted.length > 1 ? sim.createCrossReviews(proposals) : [];
        const draft = sim.createCombinedDraft(body.input, projectView, proposals);
        const groupDrafts = sim.createGroupDrafts(body.input, projectView, proposals);
        payload = {
          type: wanted.length > 1 ? 'ensemble' : 'proposal',
          intro: wanted.length > 1
            ? `${wanted.length} model menyusun usulan terpisah, lalu saling meninjau. Label LIVE hanya untuk model yang benar-benar menjawab lewat backend.`
            : `Satu proposal dari ${proposals[0].name}.`,
          proposals,
          reviews,
          draft,
          groupDrafts,
          sourceInput: body.input,
          live: anyLive
        };
      }
    } else {
      text = `Captured for ${projectView.name}.`;
    }

    const assistant = db.prepare('INSERT INTO messages (conversation_id, role, content, model_used, live) VALUES (?, ?, ?, ?, ?)').run(
      convId, 'assistant', JSON.stringify(payload ? { payload } : { text }), JSON.stringify(wanted), anyLive ? 1 : 0
    );
    const habit = /catat kebiasaan|simpan sebagai kebiasaan/i.test(body.input);
    db.prepare('INSERT INTO memories (user_id, project_id, body, tag) VALUES (?, ?, ?, ?)').run(
      req.user.id, project?.id, `User direction: ${body.input.slice(0, 90)}`, habit ? 'habit' : 'general'
    );
    res.json({
      conversationId: convId,
      messageId: assistant.lastInsertRowid,
      payload,
      text,
      live: anyLive,
      openReview: Boolean(payload && (body.mode === 'builder' || body.mode === 'combination'))
    });
  } catch (err) { next(err); }
});

app.post('/api/files', requireUser, (req, res, next) => {
  upload.array('files', 6)(req, res, (err) => {
    if (err) return next(Object.assign(err, { status: err.status || 400 }));
    const saved = (req.files || []).map((file) => {
      const result = db.prepare('INSERT INTO files (user_id, project_id, filename, original_name, mime_type, size, tag, storage_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.body.projectId || null, file.filename, file.originalname, file.mimetype, file.size, 'project', file.filename
      );
      return db.prepare('SELECT id, original_name, mime_type, size, tag, created_at FROM files WHERE id = ?').get(result.lastInsertRowid);
    });
    res.json({ files: saved });
  });
});

app.patch('/api/files/:id', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.fileTagBody, req.body);
    db.prepare('UPDATE files SET tag = ? WHERE id = ? AND user_id = ?').run(body.tag, Number(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/files/:id', requireUser, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  const abs = path.join(UPLOADS, path.basename(file.storage_path));
  if (!abs.startsWith(UPLOADS) || !fs.existsSync(abs)) return res.status(404).json({ error: 'Missing file' });
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
  fs.createReadStream(abs).pipe(res);
});

app.post('/api/approvals', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.approvalBody, req.body);
    const result = db.prepare('INSERT INTO approvals (user_id, conversation_id, target_agent, instruction, status) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, body.conversationId || null, body.target_agent, body.instruction, 'pending'
    );
    notify(req.user.id, `Approval queued for ${body.target_agent} (external / not connected).`);
    res.json(db.prepare('SELECT * FROM approvals WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { next(err); }
});

app.post('/api/approvals/:id/decide', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM approvals WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const status = req.body.status === 'approved' ? 'approved' : 'cancelled';
  db.prepare('UPDATE approvals SET status = ? WHERE id = ?').run(status, id);
  res.json({ ok: true, status });
});

app.post('/api/feedback', requireUser, (req, res, next) => {
  try {
    const body = v.parse(v.feedbackBody, req.body);
    const msg = db.prepare('SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ? AND c.user_id = ?').get(body.messageId, req.user.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE messages SET feedback = ? WHERE id = ?').run(body.rating, body.messageId);
    db.prepare('INSERT INTO feedback_log (user_id, message_id, rating) VALUES (?, ?, ?)').run(req.user.id, body.messageId, body.rating);
    res.json({ compact: compactFromFeedback(req.user.id) });
  } catch (err) { next(err); }
});

app.get('/api/notifications', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(req.user.id));
});

app.get('/api/export/:id', requireUser, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id').all(conv.id);
  res.json({ conversation: conv, messages });
});

app.post('/api/insights/generate', requireUser, chatLimit, async (req, res, next) => {
  try {
    const body = v.parse(v.insightsBody, req.body);
    const uid = req.user.id;
    const habits = db.prepare("SELECT body FROM memories WHERE user_id = ? AND tag = 'habit' ORDER BY id DESC LIMIT 12").all(uid);
    const tagCounts = db.prepare('SELECT tag, COUNT(*) AS n FROM memories WHERE user_id = ? GROUP BY tag').all(uid);
    const modes = db.prepare('SELECT mode, COUNT(*) AS n FROM conversations WHERE user_id = ? GROUP BY mode').all(uid);
    const hours = db.prepare(`SELECT strftime('%H', m.created_at) AS h, COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? GROUP BY h ORDER BY n DESC LIMIT 5`).all(uid);
    const fb = db.prepare('SELECT rating, COUNT(*) AS n FROM feedback_log WHERE user_id = ? GROUP BY rating').all(uid);
    const tasks = db.prepare('SELECT done, COUNT(*) AS n FROM tasks WHERE user_id = ? GROUP BY done').all(uid);
    const projects = db.prepare('SELECT project_id, COUNT(*) AS n FROM conversations WHERE user_id = ? GROUP BY project_id ORDER BY n DESC LIMIT 3').all(uid);
    const summary = {
      habitSnippets: habits.map((row) => String(row.body).slice(0, 80)),
      memoryTags: tagCounts,
      favoriteModes: modes,
      activeHours: hours,
      feedback: fb,
      tasks,
      frequentProjects: projects
    };
    const keys = keysFor(uid);
    const settings = getSettings(uid);
    const rolePools = parseJson(settings.role_pools, catalog.defaultRolePools());
    const preferred = body.model && catalog.findModel(body.model)?.kind === 'chat' ? body.model : 'gemini';
    const prompt = `Analisis pola kebiasaan dari ringkasan JSON ini. Jujur jika data belum cukup. Jangan mengarang angka. Beri 2-4 kesimpulan actionable.\n${JSON.stringify(summary)}`;
    let result = await tryWithRotation(preferred, keys, prompt, settings.personality_preset, rolePools, 'Habit insight only. Be honest if the sample is thin.');
    if (!result.live) {
      result = {
        live: false,
        via: 'simulasi',
        text: habits.length < 2
          ? 'Data kebiasaan masih terlalu sedikit untuk kesimpulan yang jujur. Ketik “catat kebiasaan: …” di chat, lalu ulangi analisis.'
          : 'Simulasi insight: kamu sudah mulai mencatat kebiasaan, tapi sampel masih kecil. Lanjutkan catat yang berulang (jam kerja, mode favorit, jenis task) sebelum mengklaim pola kuat.'
      };
    }
    const bodyText = `${result.text}\n\nvia ${result.via || 'simulasi'}`;
    const inserted = db.prepare("INSERT INTO memories (user_id, project_id, body, tag) VALUES (?, NULL, ?, 'insight')").run(uid, bodyText);
    res.json(db.prepare('SELECT * FROM memories WHERE id = ?').get(inserted.lastInsertRowid));
  } catch (err) { next(err); }
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const name = path.basename(req.path);
  if (req.path === '/' || req.path === '/index.html') return res.sendFile(path.join(ROOT, 'index.html'));
  if (PUBLIC_FILES.has(name)) return res.sendFile(path.join(ROOT, name));
  next();
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('server_error');
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : (err.message || 'Request failed') });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`NOAH'S listening on ${ORIGIN}`);
});
