const CATALOG = window.NOAHS_CATALOG || { DIRECT_MODELS: [], ROLE_POOLS: {}, CODING_AGENTS: [], AGENT_GROUPS: {}, findModel: () => null, defaultRolePools: () => ({}) };
const MODES = {
  learning: { label: 'Learning', icon: '◌', short: 'Learning', glyph: '◌', description: 'Understand concepts step by step before you build.' },
  builder: { label: 'Alien Builder', icon: '⌘', short: 'Builder', glyph: '⌘', description: 'Move from goal to implementation with focused momentum.' },
  combination: { label: 'Alien Combination', icon: '◈', short: 'Combination', glyph: '◈', description: 'Build with context and learn along the way.' },
  ghost: { label: 'Silence Ghost', icon: '✧', short: 'Ghost', glyph: '✧', description: 'Pressure-test ideas, strategy, risks, and next actions.' },
  analysis: { label: 'Analysis/Security', icon: '⛨', short: 'Analysis', glyph: '⛨', description: 'Diskusi celah keamanan & kualitas. Bukan scanner sungguhan. Gemini 2.5 Flash default (tier gratis: data boleh dipakai Google).' },
  auto: { label: 'Auto Mode', icon: '✦', short: 'Auto', glyph: '✦', description: 'Choose a thoughtful route from the request itself.' }
};

let PROJECTS = {
  'ai-hub': { name: 'AI Learning Hub', progress: 68, color: 'violet', summary: 'A practical learning workspace.', next: 'Write the first onboarding lesson', mode: 'combination' },
  portfolio: { name: 'Portfolio Website', progress: 42, color: 'teal', summary: 'A visual portfolio.', next: 'Create the work showcase layout', mode: 'builder' },
  inventory: { name: 'Inventory App', progress: 60, color: 'amber', summary: 'A small inventory tool.', next: 'Design the authentication endpoint', mode: 'learning' }
};

const MODEL_PROVIDERS = (CATALOG.DIRECT_MODELS || []).map((m) => ({
  id: m.id, name: m.label, type: m.type || 'Model AI', logo: m.logo, capability: m.note, color: m.color
}));
const CODING_AGENTS = (CATALOG.CODING_AGENTS || []).map((a) => ({
  ...a, type: 'Coding agent', name: a.name || a.label
}));
const AUDIO_URLS = {
  hello: '/audio/hello_how_can_i_help_you.mp3',
  today: '/audio/what_i_can_do_for_you_today.mp3',
  online: '/audio/noahs_online.mp3',
  offline: '/audio/noahs_offline.mp3'
};

const STARTING_MESSAGES = [
  { role: 'assistant', text: 'I found your project context and last decision. <b>We can make the MVP feel real before we add integrations.</b><br><span class="route-tag">Context loaded · project memory</span>' },
  { role: 'user', text: 'I want a simple learning flow, but I also want the first version to be useful right away.' },
  { role: 'assistant', text: 'That suggests <b>Alien Combination</b>: we can ship a small flow while making the design choices visible.' }
];

const memoryStore = {};
let storageAvailable = true;
function storageGet(key) {
  try {
    if (!storageAvailable) return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    return localStorage.getItem(key);
  } catch { storageAvailable = false; return memoryStore[key] ?? null; }
}
function storageSet(key, value) {
  try {
    if (!storageAvailable) { memoryStore[key] = String(value); return; }
    localStorage.setItem(key, value);
  } catch { storageAvailable = false; memoryStore[key] = String(value); }
}
function storageGetJson(key, fallback) {
  try {
    const raw = storageGet(key);
    if (raw == null || raw === 'null') return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function migrateModels() {
  const stored = storageGetJson('noahs.models', null);
  if (Array.isArray(stored) && stored.length) return stored.filter((id) => id !== 'all');
  const old = storageGet('noahs.model') || 'deepseek';
  if (old === 'all') return ['chatgpt', 'claude', 'deepseek', 'gemini'];
  return [old];
}

const state = {
  user: null,
  onlineApi: false,
  conversationId: null,
  activeProject: storageGet('noahs.project') || 'ai-hub',
  activeMode: storageGet('noahs.mode') || 'combination',
  activeModel: storageGet('noahs.model') || 'deepseek',
  activeModels: migrateModels(),
  messages: storageGetJson('noahs.messages', STARTING_MESSAGES),
  memories: storageGetJson('noahs.memories', ['Start with a manual onboarding flow before automating integrations.']),
  approvals: Number(storageGet('noahs.approvals') || 1),
  tasks: storageGetJson('noahs.tasks', [
    { id: 1, text: 'Define the first learner moment', tag: 'Now', done: false },
    { id: 2, text: 'Sketch the onboarding lesson', tag: 'Next', done: false },
    { id: 3, text: 'Save the MVP decision to memory', tag: 'Done', done: true }
  ]),
  files: [],
  keys: { chatgpt: false, claude: false, deepseek: false, gemini: false, github_models: false, openrouter: false },
  layoutMode: storageGet('noahs.layout') || 'home',
  cubeVisible: storageGet('noahs.cube') !== '0',
  rolePools: storageGetJson('noahs.roles', CATALOG.defaultRolePools ? CATALOG.defaultRolePools() : {}),
  activeAgents: storageGetJson('noahs.agents', ['cursor', 'windsurf', 'copilot', 'devin']),
  audioAvailable: {},
  pickerQuery: '',
  pickerListMode: storageGet('noahs.pickerList') === '1',
  highlightedId: null,
  modelsTouched: false,
  replyMode: storageGet('noahs.replyMode') || 'text',
  theme: storageGet('noahs.theme') || 'dark',
  masterPower: storageGet('noahs.power') !== '0',
  personality: storageGet('noahs.personality') || 'hangat',
  voicePitch: Number(storageGet('noahs.pitch') || 0.8),
  voiceRate: Number(storageGet('noahs.rate') || 0.9),
  autoSubmitVoice: storageGet('noahs.autoMic') === '1',
  compact: false,
  chatZoom: Number(storageGet('noahs.zoom') || 11),
  pendingFiles: [],
  notifications: [],
  conversations: []
};

let pendingReview = null;
let pendingDispatch = null;
let lastAssistantIndex = -1;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function persist() {
  storageSet('noahs.project', state.activeProject);
  storageSet('noahs.mode', state.activeMode);
  storageSet('noahs.model', state.activeModels[0] || 'deepseek');
  storageSet('noahs.models', JSON.stringify(state.activeModels));
  storageSet('noahs.layout', state.layoutMode);
  storageSet('noahs.cube', state.cubeVisible ? '1' : '0');
  storageSet('noahs.agents', JSON.stringify(state.activeAgents));
  storageSet('noahs.messages', JSON.stringify(state.messages));
  storageSet('noahs.memories', JSON.stringify(state.memories));
  storageSet('noahs.approvals', String(state.approvals));
  storageSet('noahs.tasks', JSON.stringify(state.tasks));
  storageSet('noahs.replyMode', state.replyMode);
  storageSet('noahs.theme', state.theme);
  storageSet('noahs.power', state.masterPower ? '1' : '0');
  storageSet('noahs.personality', state.personality);
  storageSet('noahs.pitch', String(state.voicePitch));
  storageSet('noahs.rate', String(state.voiceRate));
  storageSet('noahs.zoom', String(state.chatZoom));
  storageSet('noahs.pickerList', state.pickerListMode ? '1' : '0');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function api(path, opts = {}) {
  const headers = { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) };
  const res = await fetch(path, { credentials: 'include', ...opts, headers, body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined) });
  if (res.status === 401) throw Object.assign(new Error('auth'), { status: 401 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status });
  return data;
}

function getModel(id) {
  const found = CATALOG.findModel?.(id) || MODEL_PROVIDERS.find((m) => m.id === id);
  return found ? { id: found.id, name: found.label || found.name, logo: found.logo, capability: found.note || found.capability, color: found.color, kind: found.kind, provider: found.provider, pros: found.pros, cons: found.cons, sub: found.sub, badge: found.badge, note: found.note } : { id, name: id, logo: '✦', capability: '' };
}
function getAgent(id) { return CODING_AGENTS.find((a) => a.id === id) || { id, name: id === 'teamwork' ? 'Teamwork' : id, capability: 'External' }; }
function isLearning() { return state.activeMode === 'learning'; }
function isBuildMode(mode = state.activeMode) { return mode === 'builder' || mode === 'combination'; }
function chatModels() { return state.activeModels.filter((id) => getModel(id).kind !== 'tts' && getModel(id).kind !== 'agent'); }
function modelLive(id) {
  const m = getModel(id);
  if (m.provider === 'github_models') return Boolean(state.keys.github_models);
  if (m.provider === 'openrouter') return Boolean(state.keys.openrouter);
  return Boolean(state.keys[id] || state.keys[m.provider]);
}
function statusBadge(live) { return live ? '<span class="live-badge">LIVE</span>' : '<span class="sim-badge">SIMULASI</span>'; }

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.style.setProperty('--chat-font-size', `${state.chatZoom}px`);
}

let audioEl = null;
let audioQueue = [];
let audioBusy = false;
let greetingPlayed = false;
function stopClips() {
  audioQueue = [];
  audioBusy = false;
  if (!audioEl) return;
  audioEl.onerror = null;
  audioEl.onended = null;
  try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch { /* ignore */ }
}
function clipReady(key) {
  return Boolean(key && AUDIO_URLS[key] && state.audioAvailable[key] === true);
}
async function refreshAudioAvailability() {
  try {
    const cfg = await api('/api/config');
    state.audioAvailable = cfg.audio || state.audioAvailable;
  } catch { /* stay with last known map */ }
}
function playClip(key) {
  return new Promise((resolve) => {
    if (!key || !AUDIO_URLS[key]) return resolve();
    audioQueue.push({ key, resolve });
    drainClips();
  });
}
function drainClips() {
  if (audioBusy || !audioQueue.length) return;
  const item = audioQueue.shift();
  if (!clipReady(item.key)) {
    item.resolve();
    drainClips();
    return;
  }
  audioBusy = true;
  if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch { /* ignore */ }
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  const finish = () => {
    audioEl.onerror = null;
    audioEl.onended = null;
    audioBusy = false;
    item.resolve();
    drainClips();
  };
  audioEl.onerror = () => {
    state.audioAvailable[item.key] = false;
    finish();
  };
  audioEl.onended = finish;
  try {
    audioEl.src = AUDIO_URLS[item.key];
    const play = audioEl.play();
    if (play && typeof play.catch === 'function') play.catch(() => finish());
  } catch {
    finish();
  }
}
async function playGreeting() {
  if (greetingPlayed) return;
  greetingPlayed = true;
  try {
    const data = await api('/api/greeting/next', { method: 'POST' });
    await playClip(data.clip === 'today' ? 'today' : 'hello');
  } catch { /* missing file or offline — skip silently */ }
}
async function announceOnline() {
  await playClip('online');
}
async function announceOffline() {
  stopClips();
  await playClip('offline');
}
function speak(text, force = false) {
  if (!window.speechSynthesis) return;
  if (!force && state.replyMode === 'text') return;
  const utter = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ' '));
  utter.pitch = state.voicePitch;
  utter.rate = state.voiceRate;
  const voices = speechSynthesis.getVoices();
  const us = voices.find((v) => /en-US/i.test(v.lang))
    || voices.find((v) => /microsoft david|google us english|alex|samantha/i.test(v.name))
    || voices.find((v) => v.lang.startsWith('en'))
    || voices[0];
  if (us) utter.voice = us;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

function maybeSpeakReply(html) {
  if (state.replyMode === 'voice' || state.replyMode === 'both') speak(html);
}

function renderPower() {
  $('#statusLabel').textContent = state.masterPower ? "NOAH'S ONLINE" : "NOAH'S OFFLINE";
  $('#liveDot').classList.toggle('off', !state.masterPower);
  $('#masterPowerBtn').classList.toggle('off', !state.masterPower);
  $('#chatInput').disabled = !state.masterPower;
  $('#chatInput').placeholder = state.masterPower ? 'Tulis pesan atau pilih action di atas…' : "NOAH'S sedang offline";
}

function renderModeSelector() {
  $('#modeSelector').innerHTML = Object.entries(MODES).map(([id, mode]) => `<button class="mode-option ${id === state.activeMode ? 'active' : ''}" data-mode="${id}"><i>${mode.icon}</i>${mode.short}</button>`).join('');
}
function renderModelSelector() {
  const chatIds = (CATALOG.DIRECT_MODELS || []).map((m) => m.id);
  $('#modelSelector').innerHTML = chatIds.map((id) => {
    const model = getModel(id);
    return `<button type="button" class="model-option ${state.activeModels.includes(id) ? 'active' : ''}" data-model="${id}">${escapeHtml(model.name)}</button>`;
  }).join('') + `<button type="button" class="model-option" id="selectAllModels">Pilih semua</button>`;
  const n = chatModels().length;
  $('#costNote').textContent = n > 1 ? `${n} model aktif sekaligus — biaya lebih tinggi kalau LIVE. Coding agent tetap tidak mengeksekusi file.` : '';
  $('#costNote').classList.toggle('show', n > 1);
  $('#costNote').hidden = n <= 1;
  $('#selectAllModels')?.addEventListener('click', () => {
    state.activeModels = [...chatIds];
    state.modelsTouched = true;
    saveSettings();
    renderState();
  });
}
function renderReplyMini() {
  $('#replyMini').innerHTML = ['text', 'voice', 'both'].map((id) => `<button type="button" class="${id === state.replyMode ? 'active' : ''}" data-reply="${id}">${id}</button>`).join('');
}

function renderChat() {
  const container = $('#chatWindow');
  container.innerHTML = state.messages.map((message, index) => {
    const live = message.live || message.payload?.live || message.payload?.proposals?.some((p) => p.live);
    const bubble = message.payload ? renderPayloadBubble(message.payload, index, live) : message.text;
    const actions = message.role === 'assistant' ? `<div class="msg-actions"><button type="button" data-copy="${index}">Salin</button><button type="button" data-fb="up" data-idx="${index}">👍</button><button type="button" data-fb="down" data-idx="${index}">👎</button>${index === state.messages.length - 1 ? `<button type="button" data-regen="${index}">Regenerate</button>` : ''}</div>` : '';
    return `<article class="message ${message.role}"><span class="message-avatar">${message.role === 'assistant' ? 'N' : 'FZ'}</span><div class="message-body"><p class="message-name">${message.role === 'assistant' ? "NOAH'S AI" : 'You'}</p><div class="message-bubble">${message.role === 'assistant' ? statusBadge(live) : ''}${bubble}${renderAttachments(message)}${actions}</div></div></article>`;
  }).join('');
  $$('[data-open-review]').forEach((b) => b.addEventListener('click', () => showDispatchReviewModal(state.messages[Number(b.dataset.openReview)]?.payload)));
  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const msg = state.messages[Number(b.dataset.copy)];
    const text = (msg?.text || msg?.payload?.draft || '').replace(/<[^>]+>/g, ' ');
    navigator.clipboard.writeText(text.trim());
  }));
  $$('[data-fb]').forEach((b) => b.addEventListener('click', () => sendFeedback(state.messages[Number(b.dataset.idx)], b.dataset.fb)));
  $$('[data-regen]').forEach((b) => b.addEventListener('click', () => {
    const prev = [...state.messages].reverse().find((m) => m.role === 'user');
    if (prev) submitMessage(prev.text.replace(/<[^>]+>/g, ''));
  }));
  $$('[data-open-file]').forEach((b) => b.addEventListener('click', () => openFile(Number(b.dataset.openFile))));
  lastAssistantIndex = state.messages.map((m) => m.role).lastIndexOf('assistant');
  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}

function renderAttachments(message) {
  const files = message.fileIds ? state.files.filter((f) => message.fileIds.includes(f.id)) : message.files || [];
  if (!files.length) return '';
  return `<div class="attach-preview">${files.map((f) => `<button type="button" class="file-chip" data-open-file="${f.id}">${escapeHtml(f.original_name || f.name)} · ${Math.round((f.size || 0) / 1024)}kb</button>`).join('')}</div>`;
}

function renderPayloadBubble(payload, index, live) {
  const cards = (payload.proposals || []).map((p) => `<article class="model-proposal-card"><header><span class="provider-logo ${p.id}">${getModel(p.id).logo}</span><b>${escapeHtml(p.name)}</b>${statusBadge(p.live || live)}${p.via ? `<small>via ${escapeHtml(p.via)}</small>` : ''}</header><p>${p.text}</p></article>`).join('');
  const reviews = (payload.reviews || []).map((r) => `<p class="cross-review">${escapeHtml(r.from)} meninjau usulan ${escapeHtml(r.of)}: ${escapeHtml(r.text)}</p>`).join('');
  const groups = (payload.groupDrafts || []).map((g) => `<details class="review-proposal" open><summary>${escapeHtml(g.label)}</summary><p>${escapeHtml(g.text).replace(/\n/g, '<br>')}</p></details>`).join('');
  const draft = payload.draft ? `<div class="combined-draft">${statusBadge(live)}<p><b>Draft gabungan</b><br>${escapeHtml(payload.draft).replace(/\n/g, '<br>')}</p></div>` : '';
  const action = isBuildMode() && !isLearning() ? `<button type="button" class="chat-action" data-open-review="${index}">Lanjut ke review manusia</button>` : '';
  return `<p>${payload.intro || ''}</p><div class="proposal-stack">${cards}</div>${reviews}${groups}${draft}${action}`;
}

function renderProviders() {
  const models = MODEL_PROVIDERS.filter((m) => !['chatgpt', 'claude', 'deepseek'].includes(m.id)).map((m) => `<div class="provider-item selectable" data-select-model="${m.id}"><span class="provider-logo ${m.id}">${m.logo}</span><div><b>${m.name}</b><small>${m.type} · ${m.capability}</small></div><span class="provider-status ${state.activeModels.includes(m.id) ? 'ready' : 'attention'}">${state.activeModels.includes(m.id) ? 'Selected' : (modelLive(m.id) ? 'Key saved · LIVE possible' : 'Needs API key · SIMULASI')}</span></div>`).join('');
  const agents = CODING_AGENTS.map((a) => `<div class="provider-item"><span class="provider-logo ${a.id}">${a.logo}</span><div><b>${a.name}</b><small>${a.type} · ${a.capability}</small></div><span class="provider-status ${a.className}">${a.state}</span></div>`).join('');
  $('#providerList').innerHTML = `<p class="provider-group-label">Model AI</p>${models}<p class="provider-group-label">Coding Agent</p>${agents}`;
  $$('#providerList [data-select-model]').forEach((row) => row.addEventListener('click', () => setModel(row.dataset.selectModel)));
}

function renderTasks() {
  $('#taskList').innerHTML = state.tasks.map((task, index) => `<button class="task ${task.done ? 'done' : ''}" data-task="${index}"><span class="task-check">✓</span><span class="task-text">${escapeHtml(task.text)}</span><span class="task-tag ${task.done ? 'teal' : ''}">${escapeHtml(task.tag)}</span></button>`).join('');
}

function renderSidebarProjects() {
  const links = Object.entries(PROJECTS).map(([id, p]) => `<button class="project-link ${id === state.activeProject ? 'selected' : ''}" data-project="${id}"><i class="dot ${p.color || 'violet'}"></i><span>${escapeHtml(p.name)}</span></button>`).join('');
  const label = `<div class="section-label"><span>RECENT PROJECTS</span><button id="newProjectBtn" title="Buat project baru">+</button></div>`;
  $('#sidebarProjects').innerHTML = label + links;
  $('#newProjectBtn').addEventListener('click', showNewProjectModal);
  $$('#sidebarProjects .project-link').forEach((b) => b.addEventListener('click', () => selectProject(b.dataset.project)));
  $('#projectCount').textContent = Object.keys(PROJECTS).length;
}

function renderProject() {
  const project = PROJECTS[state.activeProject] || Object.values(PROJECTS)[0];
  if (!project) return;
  $('#breadcrumbProject').textContent = project.name;
  $('#activeProjectName').textContent = project.name;
  $('#projectProgress').textContent = `${project.progress || 0}%`;
  $('#progressBar').style.width = `${project.progress || 0}%`;
}

function renderRouteFlow() {
  const learning = isLearning();
  const ensemble = isBuildMode() && chatModels().length > 1;
  const building = isBuildMode();
  const step3 = learning ? { current: false, skipped: true, detail: 'Tidak dipakai di Learning mode', icon: '' }
    : ensemble ? { current: true, skipped: false, detail: '4 model + saling cek', icon: '✓' }
    : building ? { current: true, skipped: false, detail: `${chatModels().map((id) => getModel(id).name).join(', ')}`, icon: '✓' }
    : { current: false, skipped: false, detail: 'Compare candidates', icon: '→' };
  const step4 = learning ? { current: false, skipped: true, detail: 'Tidak dipakai di Learning mode', icon: '' }
    : ensemble ? { current: true, skipped: false, detail: 'Draft gabungan · review manusia', icon: '→' }
    : building ? { current: true, skipped: false, detail: 'Review manusia sebelum kirim', icon: '→' }
    : { current: false, skipped: false, detail: 'Approval if needed', icon: '' };
  $('#routeFlow').innerHTML = `<div class="route-step current"><span>1</span><div><b>Understand</b><small>Requirement & context</small></div><i>✓</i></div><div class="route-line active"></div><div class="route-step current"><span>2</span><div><b>Choose mode</b><small>${MODES[state.activeMode].short}</small></div><i>✓</i></div><div class="route-line ${step3.current ? 'active' : ''}"></div><div class="route-step ${step3.current ? 'current' : ''} ${step3.skipped ? 'skipped' : ''}"><span>3</span><div><b>Route providers</b><small>${step3.detail}</small></div>${step3.icon ? `<i>${step3.icon}</i>` : ''}</div><div class="route-line ${step4.current ? 'active' : ''}"></div><div class="route-step ${step4.current ? 'current' : ''} ${step4.skipped ? 'skipped' : ''}"><span>4</span><div><b>Propose action</b><small>${step4.detail}</small></div>${step4.icon ? `<i>${step4.icon}</i>` : ''}</div>`;
}

function renderFilesView() {
  const groups = [
    ['important', 'Penting'],
    ['project', 'Proyek'],
    ['work', 'Kerja'],
    ['school', 'Sekolah']
  ];
  $('#filesContent').innerHTML = groups.map(([tag, label]) => {
    const rows = state.files.filter((f) => f.tag === tag).map((f) => `<div class="list-row"><span class="list-icon">▣</span><div><strong>${escapeHtml(f.original_name)}</strong><small>${Math.round((f.size || 0) / 1024)}kb · ${escapeHtml(f.mime_type || '')}</small></div><select data-file-tag="${f.id}"><option value="important"${tag === 'important' ? ' selected' : ''}>Penting</option><option value="project"${tag === 'project' ? ' selected' : ''}>Proyek</option><option value="work"${tag === 'work' ? ' selected' : ''}>Kerja</option><option value="school"${tag === 'school' ? ' selected' : ''}>Sekolah</option></select><button class="row-action" data-open-file="${f.id}">Buka</button></div>`).join('') || '<p>Belum ada file di grup ini.</p>';
    return `<p class="content-section-label">${label}</p>${rows}`;
  }).join('');
  $$('[data-file-tag]').forEach((sel) => sel.addEventListener('change', async () => {
    const id = Number(sel.dataset.fileTag);
    try { await api(`/api/files/${id}`, { method: 'PATCH', body: { tag: sel.value } }); } catch { /* local */ }
    const file = state.files.find((f) => f.id === id);
    if (file) file.tag = sel.value;
    renderFilesView();
  }));
  $$('#filesContent [data-open-file]').forEach((b) => b.addEventListener('click', () => openFile(Number(b.dataset.openFile))));
}

function renderViews() {
  $('#sessionsContent').innerHTML = (state.conversations.length ? state.conversations : [{ id: 0, title: 'Ship a beginner-friendly MVP', mode: state.activeMode }]).map((c) => `<div class="list-row"><span class="list-icon">◷</span><div><strong>${escapeHtml(c.title || 'Session')}</strong><small>${escapeHtml(c.mode || '')} · ${escapeHtml(c.model || '')}</small></div><button class="row-action" data-open-conv="${c.id}">Resume</button></div>`).join('');
  $('#projectsContent').innerHTML = Object.entries(PROJECTS).map(([id, p]) => `<div class="list-row"><span class="list-icon">⌘</span><div><strong>${escapeHtml(p.name)}</strong><small>${p.progress || 0}% · Next: ${escapeHtml(p.next || p.next_step || '')}</small></div><button class="row-action" data-project-open="${id}">Open</button></div>`).join('');
  $('#memoryContent').innerHTML = `<div class="modal-footer" style="justify-content:flex-start"><button class="primary" type="button" id="insightBtn">Analisis kebiasaanku</button></div>` + ((state.memories || []).map((m, i) => {
    const tag = typeof m === 'object' ? m.tag : 'general';
    return `<div class="list-row ${tag === 'insight' ? 'insight-row' : tag === 'habit' ? 'habit-row' : ''}"><span class="list-icon">${tag === 'insight' ? '◈' : '✧'}</span><div><strong>${tag === 'insight' ? 'Insight' : tag === 'habit' ? 'Kebiasaan' : (i === 0 ? 'Latest' : 'Saved')}</strong><small>${escapeHtml(typeof m === 'string' ? m : m.body)}</small></div><button class="row-action" data-forget="${i}">Forget</button></div>`;
  }).join('') || '<p>No long-term memory has been saved.</p>');
  const modelRows = MODEL_PROVIDERS.map((m) => `<div class="list-row"><span class="list-icon">${m.logo}</span><div><strong>${m.name}</strong><small>${m.capability}</small></div><button class="row-action" data-provider-select="${m.id}">${state.activeModels.includes(m.id) ? 'Selected' : 'Select'}</button></div>`).join('');
  const agentRows = CODING_AGENTS.map((a) => `<div class="list-row"><span class="list-icon">${a.logo}</span><div><strong>${a.name}</strong><small>${a.capability} · ${a.state}</small></div><span class="provider-status offline">External</span></div>`).join('');
  $('#providersContent').innerHTML = `<p class="content-section-label">Model AI</p>${modelRows}<p class="content-section-label">Coding Agent</p>${agentRows}`;
  renderFilesView();
  $('#settingsContent').innerHTML = `
    <div class="setting-row"><div><h3>Tema terang</h3><p>Tema gelap tidak diubah; ini palet tambahan.</p></div><button class="toggle ${state.theme === 'light' ? 'on' : ''}" id="themeToggle" type="button"><i></i></button></div>
    <div class="setting-row stack"><h3>Mode balasan</h3><div class="mode-selector" id="replyModeSettings">${['text', 'voice', 'both'].map((id) => `<button class="mode-option ${state.replyMode === id ? 'active' : ''}" data-set-reply="${id}">${id}</button>`).join('')}</div></div>
    <div class="setting-row stack"><h3>Suara NOAH'S</h3><p>Suara sintetis orisinal (bukan tiruan karakter). Pitch ${state.voicePitch} · rate ${state.voiceRate}.</p><label>Pitch <input id="pitchSlider" type="range" min="0.5" max="1.4" step="0.05" value="${state.voicePitch}" /></label><label>Rate <input id="rateSlider" type="range" min="0.5" max="1.4" step="0.05" value="${state.voiceRate}" /></label><label><input id="autoMic" type="checkbox" ${state.autoSubmitVoice ? 'checked' : ''}/> Kirim otomatis setelah bicara</label></div>
    <div class="setting-row stack"><h3>Kepribadian</h3><div>${['formal', 'santai', 'tegas', 'hangat'].map((id) => `<button class="mode-option ${state.personality === id ? 'active' : ''}" data-persona="${id}">${id}</button>`).join('')}</div><p>Kalau API LIVE, ini jadi system prompt. Preferensi disesuaikan dari feedback tersimpan — bukan pelatihan ulang model.</p></div>
    <div class="setting-row stack"><h3>API keys (disimpan terenkripsi di server)</h3><p class="api-warning">Key tidak boleh muncul di Network tab sebagai body chat. Backend yang memanggil provider. Jangan pakai di komputer bersama.</p>
      ${['chatgpt', 'claude', 'deepseek', 'gemini', 'github_models', 'openrouter'].map((id) => `<label>${id}<input class="api-field" data-api-key="${id}" type="password" autocomplete="off" placeholder="${state.keys[id] ? 'tersimpan — isi untuk mengganti' : 'opsional'}" /></label>`).join('')}
      <div class="modal-footer"><button class="primary" type="button" id="saveApiKeys">Simpan key ke server</button></div></div>
    <div class="setting-row stack"><h3>Control Unit</h3><p>Urutan cadangan per role. domain_khusus dipilih manual, tidak ikut rotasi otomatis. Preferensi disesuaikan dari feedback tersimpan — bukan pelatihan ulang model.</p>${renderControlUnit()}</div>`;
  $$('[data-project-open]').forEach((b) => b.addEventListener('click', () => { selectProject(b.dataset.projectOpen); setView('dashboard'); }));
  $$('[data-forget]').forEach((b) => b.addEventListener('click', async () => {
    const mem = state.memories[Number(b.dataset.forget)];
    if (mem?.id) try { await api(`/api/memories/${mem.id}`, { method: 'DELETE' }); } catch { /* ignore */ }
    state.memories.splice(Number(b.dataset.forget), 1); renderState();
  }));
  $$('[data-provider-select]').forEach((b) => b.addEventListener('click', () => setModel(b.dataset.providerSelect)));
  $$('[data-open-conv]').forEach((b) => b.addEventListener('click', () => openConversation(Number(b.dataset.openConv))));
  $('#themeToggle')?.addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; applyTheme(); saveSettings(); renderState(); });
  $$('[data-set-reply]').forEach((b) => b.addEventListener('click', () => { state.replyMode = b.dataset.setReply; saveSettings(); renderState(); }));
  $$('[data-persona]').forEach((b) => b.addEventListener('click', () => { state.personality = b.dataset.persona; saveSettings(); renderState(); }));
  $('#pitchSlider')?.addEventListener('change', (e) => { state.voicePitch = Number(e.target.value); saveSettings(); });
  $('#rateSlider')?.addEventListener('change', (e) => { state.voiceRate = Number(e.target.value); saveSettings(); });
  $('#autoMic')?.addEventListener('change', (e) => { state.autoSubmitVoice = e.target.checked; persist(); });
  $('#saveApiKeys')?.addEventListener('click', saveKeys);
  $('#insightBtn')?.addEventListener('click', generateInsight);
  bindControlUnit();
}

function renderControlUnit() {
  const roles = CATALOG.ROLE_POOLS || {};
  return Object.entries(roles).map(([role, list]) => {
    const order = state.rolePools[role] || list.map((m) => m.id);
    const note = role === 'domain_khusus' ? 'Dipilih manual, tidak ikut rotasi otomatis.' : '';
    return `<p class="content-section-label">${role} ${note}</p>${order.map((id, idx) => {
      const m = list.find((item) => item.id === id) || getModel(id);
      return `<div class="list-row"><span class="list-icon">${m.logo || '✦'}</span><div><strong>${escapeHtml(m.label || m.name || id)}</strong><small>${escapeHtml(m.note || '')}</small></div>
        <button class="row-action" data-role-up="${role}" data-idx="${idx}">↑</button>
        <button class="row-action" data-role-drop="${role}" data-id="${id}">✕</button></div>`;
    }).join('')}`;
  }).join('');
}
function pickerCategories() {
  const gemini = (CATALOG.DIRECT_MODELS || []).filter((m) => m.id === 'gemini');
  return [
    { id: 'direct', title: 'Model chat langsung', hint: 'Akses langsung', items: gemini },
    { id: 'general', title: 'General', hint: 'GitHub Models', items: CATALOG.ROLE_POOLS?.general || [] },
    { id: 'coding', title: 'Coding', hint: 'GitHub Models', items: CATALOG.ROLE_POOLS?.coding || [] },
    { id: 'domain', title: 'Domain khusus', hint: 'GitHub Models', items: CATALOG.ROLE_POOLS?.domain_khusus || [] },
    { id: 'voice', title: 'Voice / TTS', hint: 'GitHub Models', items: CATALOG.ROLE_POOLS?.voice_tts || [] },
    { id: 'agents', title: 'Coding agent / Teamwork', hint: 'Kolaborasi & agent', items: CODING_AGENTS }
  ];
}
const STAR_POS = {
  1: [{ x: 6, y: 22 }],
  2: [{ x: 6, y: 22 }, { x: 56, y: 58 }],
  3: [{ x: 6, y: 14 }, { x: 56, y: 18 }, { x: 6, y: 62 }],
  4: [{ x: 6, y: 10 }, { x: 56, y: 16 }, { x: 8, y: 58 }, { x: 56, y: 64 }],
  5: [{ x: 6, y: 6 }, { x: 54, y: 12 }, { x: 6, y: 40 }, { x: 54, y: 48 }, { x: 6, y: 74 }]
};
const STAR_LINKS = {
  general: [[0, 1], [0, 2], [2, 3], [4, 2]],
  coding: [[0, 1], [0, 2], [2, 3]],
  domain: [[0, 1], [0, 2], [1, 2]],
  voice: [[0, 1]],
  agents: [[0, 1], [0, 2], [1, 3], [2, 3]]
};
function recommendedRasi() {
  return { models: ['gemini', 'gemma-4-26b-a4b', 'laguna-s-2.1'], agents: ['copilot'] };
}
function isSelectedChip(item) {
  if (item.kind === 'agent' || item.state) return state.activeAgents.includes(item.id);
  return state.activeModels.includes(item.id);
}
function renderPicker() {
  const grid = $('#pickerGrid');
  const rail = $('#pickerRail');
  if (!grid || !rail) return;
  const q = (state.pickerQuery || '').toLowerCase();
  const cats = pickerCategories();
  const totalAi = cats.reduce((n, cat) => n + cat.items.length, 0);
  if ($('#pickerMeta')) $('#pickerMeta').textContent = `${totalAi} AI · ${cats.length} kategori`;
  grid.innerHTML = cats.map((cat) => {
    const items = cat.items.filter((m) => !q || `${m.label || m.name} ${m.note || ''} ${m.sub || ''}`.toLowerCase().includes(q));
    const pos = STAR_POS[items.length] || STAR_POS[4];
    const pairs = STAR_LINKS[cat.id] || [];
    const lines = pairs.map(([a, b]) => {
      const p = pos[a];
      const r = pos[b];
      if (!p || !r) return '';
      return `<line x1="${p.x + 3}" y1="${p.y + 6}" x2="${r.x + 3}" y2="${r.y + 6}" />`;
    }).join('');
    const chips = items.map((m, i) => {
      const label = m.label || m.name;
      const selected = isSelectedChip(m);
      const place = pos[i] || { x: 8, y: 12 + i * 18 };
      const featured = cat.id === 'direct' && m.id === 'gemini';
      return `<button type="button" class="model-chip ${selected ? 'selected' : ''} ${featured ? 'featured' : ''}" data-chip="${m.id}" style="left:${place.x}%;top:${place.y}%" ${state.highlightedId === m.id ? 'aria-current="true"' : ''}>
        <i class="swatch" style="background:${m.color || '#87ADFF'}"></i>
        <span><b>${escapeHtml(label)}${selected ? ' ✓' : ''}</b><small>${escapeHtml(m.sub || m.note || m.capability || '')}</small>${m.badge ? `<em>${escapeHtml(m.badge)}</em>` : ''}${featured ? `<small class="chip-copy">${escapeHtml(m.note || '')}</small>` : ''}</span>
      </button>`;
    }).join('');
    return `<article class="picker-card"><header><div><b>${escapeHtml(cat.title)}</b><small>${escapeHtml(cat.hint)}</small></div><small>${items.length} AI</small></header><div class="picker-nodes ${state.pickerListMode ? 'list-mode' : ''}">${items.length ? `<svg class="links" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${chips}` : '<p>Tidak ada hasil.</p>'}</div></article>`;
  }).join('');
  const selectedModels = state.activeModels.map((id) => getModel(id));
  const selectedAgents = state.activeAgents.map((id) => getAgent(id));
  const selected = [...selectedModels, ...selectedAgents];
  const catCount = cats.filter((cat) => cat.items.some((item) => isSelectedChip(item))).length;
  const hi = CATALOG.findModel?.(state.highlightedId) || getModel(state.highlightedId) || getAgent(state.highlightedId);
  const enabled = Boolean(state.highlightedId);
  const startOptions = (CATALOG.DIRECT_MODELS || []).concat(CATALOG.ROLE_POOLS?.general || []).map((m) => `<option value="${m.id}" ${state.activeModels[0] === m.id ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('');
  rail.innerHTML = `<div class="picker-rail-head"><span>RASI PILIHANMU</span><span class="picker-badge">${selected.length} AI dipilih</span></div>
    <span class="picker-badge faint">${catCount} kategori</span>
    <div class="picker-icons">
      <button type="button" data-pick-act="info" ${enabled ? '' : 'disabled'} title="Info">ℹ️</button>
      <button type="button" data-pick-act="up" ${enabled ? '' : 'disabled'} title="Prioritas">↑</button>
      <button type="button" data-pick-act="key" ${enabled ? '' : 'disabled'} title="Atur key">🔑</button>
      <button type="button" data-pick-act="drop" ${enabled ? '' : 'disabled'} title="Hapus">✕</button>
    </div>
    <hr />
    <div class="picker-selected">${selected.map((m) => `<button type="button" data-hi="${m.id}"><i class="swatch" style="background:${m.color || '#87ADFF'}"></i><span>${escapeHtml(m.name || m.label)}<small>${escapeHtml(m.kind === 'agent' ? 'Coding agent' : (m.sub || m.capability || ''))}</small></span><span data-drop-sel="${m.id}" class="drop-x">✕</span></button>`).join('') || '<p>Belum ada pilihan.</p>'}</div>
    <label class="picker-start-label">Mulai percakapan dengan</label>
    <select id="pickerStart">${startOptions}</select>
    <p class="picker-hint">Pilihan lain tetap ada di workspace-mu.</p>
    <button type="button" class="picker-apply" id="pickerApply">Lanjut ke workspace →</button>
    <button type="button" class="picker-reset" id="pickerReset">Atur ulang pilihan</button>
    <div class="picker-pros"><b>Rasi yang saat kamu</b><br>${state.highlightedId ? `${escapeHtml(hi.name || hi.label || '')}<br>✓ ${escapeHtml(hi.pros || hi.note || hi.capability || '')}<br>✕ ${escapeHtml(hi.cons || '')}` : 'Tak perlu memilih semuanya. Mulai dari kebutuhan utama, lalu tambahkan AI dari kategori lain saat diperlukan.<br><br>Akses dan tier gratis mengikuti penyedia. Periksa ketersediaan sebelum menggantungkan model.'}</div>`;
  $$('#pickerGrid [data-chip]').forEach((b) => b.addEventListener('click', () => { state.highlightedId = b.dataset.chip; toggleChatModel(b.dataset.chip); }));
  $$('#pickerRail [data-hi]').forEach((b) => b.addEventListener('click', (e) => {
    if (e.target.closest('[data-drop-sel]')) return;
    state.highlightedId = b.dataset.hi;
    renderPicker();
  }));
  $$('[data-drop-sel]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    state.highlightedId = b.dataset.dropSel;
    pickerAction('drop');
  }));
  $$('[data-pick-act]').forEach((b) => b.addEventListener('click', () => pickerAction(b.dataset.pickAct)));
  $('#pickerApply')?.addEventListener('click', () => { saveSettings(); setView('dashboard'); showToast('Pilihan AI diterapkan.'); });
  $('#pickerReset')?.addEventListener('click', applyRecommendedRasi);
  $('#pickerStart')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!state.activeModels.includes(id)) state.activeModels = [id, ...state.activeModels].slice(0, 4);
    else state.activeModels = [id, ...state.activeModels.filter((m) => m !== id)];
    saveSettings();
    renderState();
  });
}
function applyRecommendedRasi() {
  const rasi = recommendedRasi();
  state.activeModels = [...rasi.models];
  state.activeAgents = [...rasi.agents];
  state.modelsTouched = true;
  saveSettings();
  renderState();
}
function pickerAction(act) {
  const id = state.highlightedId;
  if (!id) return;
  const found = CATALOG.findModel?.(id) || getModel(id);
  if (act === 'info') openModal(`<h2>${escapeHtml(found.name || found.label)}</h2><p>${escapeHtml(found.note || found.capability || '')}</p><p>✓ ${escapeHtml(found.pros || '')}</p><p>✕ ${escapeHtml(found.cons || '')}</p>`);
  if (act === 'key') setView('settings');
  if (act === 'drop') {
    state.activeModels = state.activeModels.filter((m) => m !== id);
    state.activeAgents = state.activeAgents.filter((m) => m !== id);
    if (!chatModels().length) state.activeModels = ['gemini'];
    saveSettings();
    renderState();
  }
  if (act === 'up') {
    for (const [role, list] of Object.entries(state.rolePools || {})) {
      const idx = list.indexOf(id);
      if (idx > 0) {
        const copy = [...list];
        [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
        state.rolePools[role] = copy;
        saveSettings();
        renderState();
        return;
      }
    }
    showToast('Model ini tidak ada di rotasi Control Unit.');
  }
}
async function generateInsight() {
  try {
    const row = await api('/api/insights/generate', { method: 'POST', body: { model: chatModels()[0] || 'gemini' } });
    state.memories.unshift(row);
    renderState();
    showToast('Insight disimpan di Memory.');
  } catch {
    showToast('Tidak bisa membuat insight sekarang.');
  }
}
function bindCube() {
  const cube = $('#chatCube');
  if (!cube || cube.dataset.bound) return;
  cube.dataset.bound = '1';
  let rotX = -18;
  let rotY = 24;
  let dragging = false;
  let last = null;
  const apply = () => { cube.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`; };
  cube.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-face]') && e.detail === 0) { /* drag still ok */ }
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    cube.classList.add('dragging');
    cube.setPointerCapture(e.pointerId);
  });
  cube.addEventListener('pointermove', (e) => {
    if (!dragging || !last) return;
    rotY += e.clientX - last.x;
    rotX -= e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    apply();
  });
  const end = () => { dragging = false; last = null; cube.classList.remove('dragging'); };
  cube.addEventListener('pointerup', end);
  cube.addEventListener('pointercancel', end);
  cube.querySelectorAll('[data-face]').forEach((face) => {
    face.addEventListener('click', (e) => {
      e.stopPropagation();
      face.classList.toggle('open');
    });
  });
}

function bindControlUnit() {
  $$('[data-role-up]').forEach((b) => b.addEventListener('click', () => {
    const role = b.dataset.roleUp;
    const idx = Number(b.dataset.idx);
    const list = [...(state.rolePools[role] || [])];
    if (idx <= 0) return;
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    state.rolePools[role] = list;
    saveSettings();
    renderState();
  }));
  $$('[data-role-drop]').forEach((b) => b.addEventListener('click', () => {
    const role = b.dataset.roleDrop;
    const list = (state.rolePools[role] || []).filter((id) => id !== b.dataset.id);
    if (list.length) state.rolePools[role] = list;
    saveSettings();
    renderState();
  }));
}

function applyLayout() {
  $('.app-shell')?.classList.toggle('layout-chat', state.layoutMode === 'chat');
  $('#layoutHome')?.classList.toggle('active', state.layoutMode === 'home');
  $('#layoutChat')?.classList.toggle('active', state.layoutMode === 'chat');
  $('#chatCubeWrap')?.classList.toggle('hidden', !state.cubeVisible);
}

function renderState() {
  applyTheme();
  applyLayout();
  const mode = MODES[state.activeMode];
  const selected = getModel(chatModels()[0] || state.activeModels[0]);
  $('#activeModeName').textContent = mode.label;
  $('#modeGlyph').textContent = mode.glyph;
  $('#modeDescription').textContent = mode.description;
  $('#activeModelName').textContent = chatModels().map((id) => getModel(id).name).join(', ') || selected.name;
  $('#activeModelChip').textContent = chatModels().some(modelLive) ? 'LIVE possible' : 'SIMULASI';
  $('#activeModelHint').innerHTML = `<span class="tiny-dot amber"></span> ${chatModels().some(modelLive) ? 'Key on server · fallback SIMULASI if call fails' : 'Needs API key · SIMULASI'}`;
  const latest = state.memories[0];
  $('#latestMemory').textContent = typeof latest === 'string' ? latest : (latest?.body || 'No memory');
  $('#approvalCount').textContent = state.approvals;
  $('#learningBanner').hidden = !isLearning();
  $('#learningBanner').classList.toggle('visible', isLearning());
  if (state.user) {
    $('#profileName').textContent = state.user.display_name || 'You';
    $('#profileAvatar').textContent = (state.user.display_name || 'You').slice(0, 2).toUpperCase();
  }
  renderPower();
  renderModeSelector();
  renderModelSelector();
  renderReplyMini();
  renderChat();
  renderProviders();
  renderTasks();
  renderSidebarProjects();
  renderProject();
  renderRouteFlow();
  renderViews();
  renderPicker();
  persist();
}

async function saveSettings() {
  persist();
  if (!state.onlineApi) return;
  try {
    await api('/api/settings', { method: 'PUT', body: {
      theme: state.theme, reply_mode: state.replyMode, active_models: state.activeModels,
      master_power: state.masterPower, personality_preset: state.personality,
      voice_pitch: state.voicePitch, voice_rate: state.voiceRate, auto_submit_voice: state.autoSubmitVoice,
      layout_mode: state.layoutMode, cube_visible: state.cubeVisible, role_pools: state.rolePools, active_agents: state.activeAgents
    } });
  } catch { /* cache only */ }
}

async function saveKeys() {
  const body = {};
  $$('[data-api-key]').forEach((f) => { if (f.value.trim()) body[f.dataset.apiKey] = f.value.trim(); });
  try {
    const data = await api('/api/keys', { method: 'PUT', body });
    state.keys = data.keys;
    showToast('Key disimpan terenkripsi di server. Browser tidak memanggil API provider.');
    renderState();
  } catch { showToast('Server tidak tersedia — key tidak dikirim ke mana pun.'); }
}

function setMode(id) {
  state.activeMode = id;
  if (id === 'analysis' && !state.modelsTouched) state.activeModels = ['gemini'];
  showToast(`${MODES[id].label} is now active.`);
  saveSettings();
  renderState();
}
function setModel(id) {
  toggleChatModel(id, true);
}
function toggleChatModel(id, forceOn = false) {
  const kind = getModel(id).kind;
  if (kind === 'agent') {
    if (state.activeAgents.includes(id)) state.activeAgents = state.activeAgents.filter((a) => a !== id);
    else state.activeAgents = [...state.activeAgents, id];
    saveSettings();
    renderState();
    return;
  }
  if (kind === 'tts') {
    state.highlightedId = id;
    renderPicker();
    return;
  }
  const has = state.activeModels.includes(id);
  if (has && !forceOn) {
    if (chatModels().length <= 1 && state.activeModels.length === 1) return showToast('Minimal satu model chat tetap terpilih.');
    state.activeModels = state.activeModels.filter((m) => m !== id);
  } else if (!has) {
    if (chatModels().length >= 4 && getModel(id).kind === 'chat') return showToast('Maksimal 4 model chat per pesan.');
    state.activeModels = [...state.activeModels, id];
  }
  state.modelsTouched = true;
  state.highlightedId = id;
  saveSettings();
  renderState();
}
function selectProject(id) {
  state.activeProject = id;
  if (state.activeMode === 'auto' && PROJECTS[id]) state.activeMode = PROJECTS[id].mode;
  showToast(`${PROJECTS[id]?.name || id} is now the active project.`);
  renderState();
}

function createLearningResponse(input) {
  const compact = state.compact ? ' (versi lebih ringkas dari feedback 👎)' : '';
  const q = '<p class="check-question"><b>Cek pemahaman:</b> Coba jelaskan ulang dengan kata-katamu: kenapa mulai dari satu alur, bukan banyak integrasi?</p>';
  return `Apa: memahami permintaan, bukan membangun file.${compact}<br>Kenapa: Learning mode tidak membuat approval.<br>Bagaimana: pecah jadi konsep. ${escapeHtml(input.slice(0, 120))}<span class="illustration-label">Contoh ilustrasi (tidak diusulkan sebagai perubahan file)</span><pre class="code-illustration">function nextStep(goal) { return goal; }</pre>${q}<br><span class="sim-badge">SIMULASI</span>`;
}
function createGhostResponse(input) {
  return `Pressure-test for <b>${escapeHtml(PROJECTS[state.activeProject]?.name || 'project')}</b>: keep claims honest. ${escapeHtml(input.slice(0, 140))}<br><span class="sim-badge">SIMULASI</span><span class="route-tag">Ghost · strategy</span>`;
}
function createModelProposals(input) {
  const goal = escapeHtml(input.slice(0, 160));
  const extra = state.compact ? ' Ringkas.' : '';
  return [
    { id: 'chatgpt', name: 'ChatGPT', text: `Garis besar cepat: pecah “${goal}” jadi 3 opsi.${extra}` },
    { id: 'claude', name: 'Claude', text: `Hati-hati: edge case dan rollback untuk “${goal}”.${extra}` },
    { id: 'deepseek', name: 'DeepSeek', text: `Slice teknis “${goal}”: kontrak data → UI → tes.${extra}` },
    { id: 'gemini', name: 'Gemini', text: `Konteks/multimodal: jelaskan “${goal}” ke orang non-teknis plus bukti.${extra}` }
  ];
}
function createCrossReviews(proposals) {
  const names = new Set(proposals.map((p) => p.name));
  return [
    { from: 'Claude', of: 'ChatGPT', text: 'opsi terlalu luas, batasi uji minggu ini.' },
    { from: 'Gemini', of: 'ChatGPT', text: 'tambah contoh konkret.' },
    { from: 'ChatGPT', of: 'Claude', text: 'jalur bahagia harus tetap kelihatan.' },
    { from: 'DeepSeek', of: 'Claude', text: 'undo masih abstrak.' },
    { from: 'ChatGPT', of: 'DeepSeek', text: 'tambah tujuan user.' },
    { from: 'Claude', of: 'DeepSeek', text: 'ini draf, bukan tulis file.' },
    { from: 'DeepSeek', of: 'Gemini', text: 'tambah kontrak data.' },
    { from: 'Claude', of: 'Gemini', text: 'tandai data yang tidak diunggah.' }
  ].filter((r) => names.has(r.of));
}
function createCombinedDraft(input, proposals) {
  return `Tujuan: ${input}\nProyek: ${PROJECTS[state.activeProject]?.name}\nSumber: ${proposals.map((p) => p.name).join(', ')}\n1. Jangan ubah file tanpa bridge.\n2. Slice terkecil dulu.`;
}
function createBuildPayload(input) {
  const wanted = chatModels();
  const all = wanted.length > 1;
  const proposals = createModelProposals(input).filter((p) => wanted.includes(p.id));
  const filled = proposals.length ? proposals : wanted.map((id) => ({ id, name: getModel(id).name, text: `Usulan simulasi untuk ${getModel(id).name}.` }));
  return { type: all ? 'ensemble' : 'proposal', intro: all ? `${wanted.length} model (simulasi atau LIVE per kartu).` : `Satu proposal ${getModel(wanted[0]).name}.`, proposals: filled, reviews: all ? createCrossReviews(filled) : [], draft: createCombinedDraft(input, filled), sourceInput: input };
}
function createResponse(input, mode = state.activeMode) {
  if (mode === 'learning') return { text: createLearningResponse(input), openReview: false };
  if (mode === 'analysis') return { text: `Mode Analysis/Security — diskusi saja. Keyakinan sedang untuk temuan contoh. Bukan pengganti Aikido/DeepSource/CodeRabbit.<br><span class="privacy-note">Gemini tier gratis: data boleh dipakai Google.</span><br>${escapeHtml(input.slice(0, 160))}<br><span class="sim-badge">SIMULASI</span>`, openReview: false };
  if (mode === 'ghost') return { text: createGhostResponse(input), openReview: false };
  if (mode === 'auto') {
    if (/jelaskan|belajar|apa itu/i.test(input)) return { text: createLearningResponse(input), openReview: false };
    if (/risiko|risk/i.test(input)) return { text: createGhostResponse(input), openReview: false };
  }
  if (isBuildMode(mode) || mode === 'auto') {
    const payload = createBuildPayload(input);
    return { payload, openReview: true };
  }
  return { text: `Captured for ${escapeHtml(PROJECTS[state.activeProject]?.name || 'project')}.<br><span class="sim-badge">SIMULASI</span>`, openReview: false };
}

async function submitMessage(value) {
  const input = (value || '').trim();
  if (!input || !state.masterPower) return;
  if (chatModels().length > 1 && !window.__costAck) {
    window.__costAck = true;
    showToast(`${chatModels().length} model akan dipanggil. Lanjut mengirim.`);
  }
  if (input.startsWith('/mode ')) {
    const candidate = input.slice(6).trim().toLowerCase();
    const found = Object.keys(MODES).find((m) => m === candidate || MODES[m].short.toLowerCase() === candidate);
    return found ? setMode(found) : showToast('Mode not found.');
  }
  const fileIds = state.pendingFiles.map((f) => f.id).filter(Boolean);
  state.messages.push({ role: 'user', text: escapeHtml(input), fileIds, files: [...state.pendingFiles] });
  state.pendingFiles = [];
  renderAttachPreview();
  renderChat();
  let result;
  try {
    const data = await api('/api/chat', { method: 'POST', body: { input, mode: state.activeMode, models: chatModels().slice(0, 4), conversationId: state.conversationId || undefined, fileIds, projectId: state.activeProject } });
    state.onlineApi = true;
    state.conversationId = data.conversationId;
    result = { payload: data.payload, text: data.text, openReview: data.openReview, live: data.live, messageId: data.messageId };
  } catch {
    result = createResponse(input, state.activeMode);
  }
  const assistant = result.payload
    ? { role: 'assistant', payload: result.payload, text: '', live: result.live, id: result.messageId }
    : { role: 'assistant', text: result.text, live: result.live, id: result.messageId };
  state.messages.push(assistant);
  state.memories.unshift(`User direction: ${input.slice(0, 90)}`);
  state.memories = state.memories.slice(0, 8);
  renderState();
  maybeSpeakReply(result.text || result.payload?.draft || '');
  if (result.openReview && result.payload) showDispatchReviewModal(result.payload);
}

function openModal(content, wide = false) {
  $('#appModal').classList.toggle('wide', wide);
  $('#modalContent').innerHTML = content;
  $('#modalBackdrop').hidden = false;
  $$('#modalContent [data-close-modal]').forEach((b) => b.addEventListener('click', closeModal));
}
function closeModal() { $('#modalBackdrop').hidden = true; $('#appModal').classList.remove('wide'); }

function showModeModal() {
  openModal(`<h2>Choose how NOAH'S works</h2><div class="modal-options">${Object.entries(MODES).map(([id, mode]) => `<button class="modal-option" data-modal-mode="${id}"><span class="modal-icon">${mode.icon}</span><span><strong>${mode.label}</strong><small>${mode.description}</small></span></button>`).join('')}</div>`);
  $$('[data-modal-mode]').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.modalMode); closeModal(); }));
}
function showAddTaskModal() {
  openModal(`<h2>Tambah task</h2><input class="modal-field" id="newTaskText" placeholder="Aksi kecil" autofocus /><div class="modal-footer"><button class="secondary" data-close-modal>Cancel</button><button class="primary" id="createTask">Add task</button></div>`);
  $('#createTask').addEventListener('click', async () => {
    const text = $('#newTaskText').value.trim();
    if (!text) return;
    let row = { text, tag: 'Now', done: false };
    try { row = await api('/api/tasks', { method: 'POST', body: { text, tag: 'Now', project_id: state.activeProject } }); } catch { /* local */ }
    state.tasks.unshift(row); closeModal(); renderState();
  });
}
function showNewProjectModal() {
  openModal(`<h2>Create a project</h2><input class="modal-field" id="newProjectName" autofocus /><div class="modal-footer"><button class="secondary" data-close-modal>Cancel</button><button class="primary" id="createProject">Create</button></div>`);
  $('#createProject').addEventListener('click', async () => {
    const name = $('#newProjectName').value.trim();
    if (!name) return;
    let id = `project-${Date.now()}`;
    try {
      const row = await api('/api/projects', { method: 'POST', body: { name, mode: state.activeMode } });
      id = row.id; PROJECTS[id] = { ...row, next: row.next_step };
    } catch { PROJECTS[id] = { name, progress: 0, color: 'violet', next: 'Describe the outcome', mode: state.activeMode }; }
    state.activeProject = id; closeModal(); renderState();
  });
}

function teamworkBlocks(instruction) {
  return {
    copilot: `GitHub Copilot (inline)\n${instruction}\nPerlu akun GitHub/Copilot sendiri.`,
    devin: `Devin AI (multi-file)\n${instruction}\nPerlu akun Cognition/Devin sendiri.`,
    cursor: `Cursor (refactor interaktif)\n${instruction}`,
    windsurf: `Windsurf (alur besar)\n${instruction}`
  };
}

function showDispatchReviewModal(payload) {
  if (isLearning() || !payload) return;
  pendingReview = { proposals: payload.proposals || [], reviews: payload.reviews || [], instruction: payload.draft || '' };
  const collapsible = pendingReview.proposals.map((p) => `<details class="review-proposal" open><summary>${escapeHtml(p.name)} ${statusBadge(p.live)}</summary><p>${p.text}</p></details>`).join('');
  const reviews = pendingReview.reviews.length ? pendingReview.reviews.map((r) => `<p class="cross-review">${escapeHtml(r.from)} meninjau ${escapeHtml(r.of)}: ${escapeHtml(r.text)}</p>`).join('') : '<p>Tidak ada catatan saling-cek.</p>';
  openModal(`<h2>Review sebelum kirim</h2><p>Coding agent tetap <b>external / not connected</b>. Copilot & Devin tidak login Google.</p>
    <div class="review-block"><h3>Proposal</h3>${collapsible}</div>
    <div class="review-block"><h3>Cross-review</h3>${reviews}</div>
    <div class="review-block"><h3>Instruksi final</h3><textarea class="modal-field tall" id="finalInstruction">${escapeHtml(pendingReview.instruction)}</textarea></div>
    ${(payload.groupDrafts || []).map((g) => `<details class="review-proposal" open><summary>${escapeHtml(g.label)}</summary><textarea class="modal-field tall" data-group-draft="${g.id}">${escapeHtml(g.text)}</textarea></details>`).join('')}
    <div id="teamworkEditor"></div>
    <div class="modal-footer">
      <button class="secondary" data-close-modal>Batalkan</button>
      <button class="primary" data-dispatch="cursor">Kirim ke Cursor</button>
      <button class="primary" data-dispatch="windsurf">Kirim ke Windsurf</button>
      <button class="primary" data-dispatch="copilot">Kirim ke Copilot</button>
      <button class="primary" data-dispatch="devin">Kirim ke Devin</button>
      <button class="primary" data-dispatch="teamwork">Teamwork</button>
    </div>`, true);
  $$('[data-dispatch]').forEach((b) => b.addEventListener('click', () => handleDispatch(b.dataset.dispatch)));
}

function handleDispatch(agentId) {
  const instruction = $('#finalInstruction')?.value || pendingReview?.instruction || '';
  const groupBits = $$('[data-group-draft]').map((t) => t.value).join('\n\n');
  const mergedInstruction = groupBits ? `${instruction}\n\n${groupBits}` : instruction;
  if (agentId === 'teamwork') {
    const parts = teamworkBlocks(mergedInstruction);
    const allowed = state.activeAgents.length ? state.activeAgents : Object.keys(parts);
    const filtered = Object.fromEntries(Object.entries(parts).filter(([id]) => allowed.includes(id) || allowed.includes('teamwork')));
    $('#teamworkEditor').innerHTML = `<div class="review-block"><h3>Bagian per agent (bisa diedit)</h3>${Object.entries(filtered).map(([id, text]) => `<details class="review-proposal" open><summary>${getAgent(id).name}</summary><textarea class="modal-field tall" data-team="${id}">${escapeHtml(text)}</textarea></details>`).join('')}<div class="modal-footer"><button class="primary" id="sendTeamwork">Kirim Teamwork ke approval</button></div></div>`;
    $('#sendTeamwork').addEventListener('click', () => {
      const merged = $$('[data-team]').map((t) => `## ${t.dataset.team}\n${t.value}`).join('\n\n');
      queueDispatch('teamwork', merged);
    });
    return;
  }
  queueDispatch(agentId, mergedInstruction);
}

async function queueDispatch(agentId, instruction) {
  const agent = getAgent(agentId);
  pendingDispatch = { agentId, agentName: agent.name, instruction };
  state.approvals += 1;
  try { await api('/api/approvals', { method: 'POST', body: { target_agent: agentId, instruction, conversationId: state.conversationId || undefined } }); } catch { /* local */ }
  closeModal(); renderState(); showApprovalModal();
}

function showApprovalModal() {
  const name = pendingDispatch?.agentName || 'Cursor';
  const preview = pendingDispatch?.instruction ? `<div class="review-block"><h3>Instruksi</h3><p class="cross-review">${escapeHtml(pendingDispatch.instruction).replace(/\n/g, '<br>')}</p></div>` : '';
  openModal(`<h2>Review proposed access</h2><p><b>${escapeHtml(name)}</b> tetap external. Approval = boleh diteruskan, bukan file berubah.</p>${preview}<div class="modal-footer"><button class="secondary" data-close-modal>Cancel</button><button class="primary" id="approveModal">Approve read-only review</button></div>`);
  $('#approveModal').addEventListener('click', () => {
    state.approvals = Math.max(0, state.approvals - 1);
    pendingDispatch = null; closeModal(); renderState();
    showToast('Read-only review approved. No integration is connected yet.');
  });
}

async function sendFeedback(message, rating) {
  if (message?.id) try {
    const data = await api('/api/feedback', { method: 'POST', body: { messageId: message.id, rating } });
    state.compact = data.compact;
  } catch { if (rating === 'down') state.compact = true; }
  else if (rating === 'down') state.compact = true;
  showToast(rating === 'down' ? 'Feedback disimpan. Balasan simulasi berikutnya bisa lebih ringkas.' : 'Feedback disimpan.');
}

async function openFile(id) {
  const file = state.files.find((f) => f.id === id);
  if (!file) return;
  if ((file.mime_type || '').startsWith('image/')) {
    $('#lightboxImg').src = `/api/files/${id}`;
    $('#lightbox').hidden = false;
    return;
  }
  window.open(`/api/files/${id}`, '_blank', 'noopener');
}

function renderAttachPreview() {
  $('#attachPreview').innerHTML = state.pendingFiles.map((f, i) => `<span class="file-chip">${f.preview ? `<img src="${f.preview}" alt="">` : ''} ${escapeHtml(f.original_name || f.name)} <button type="button" data-drop="${i}">×</button></span>`).join('');
  $$('[data-drop]').forEach((b) => b.addEventListener('click', () => { state.pendingFiles.splice(Number(b.dataset.drop), 1); renderAttachPreview(); }));
}

async function uploadFiles(fileList) {
  const form = new FormData();
  [...fileList].forEach((f) => form.append('files', f));
  form.append('projectId', state.activeProject);
  try {
    const data = await api('/api/files', { method: 'POST', body: form });
    state.pendingFiles.push(...data.files);
    state.files.unshift(...data.files);
  } catch {
    [...fileList].forEach((f) => state.pendingFiles.push({ name: f.name, original_name: f.name, size: f.size, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }));
  }
  renderAttachPreview();
}

function startMic() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return showToast('SpeechRecognition tidak tersedia di browser ini.');
  const rec = new Rec();
  rec.lang = 'id-ID';
  rec.interimResults = true;
  rec.onresult = (ev) => {
    const text = [...ev.results].map((r) => r[0].transcript).join(' ');
    $('#chatInput').value = text;
    if (ev.results[ev.results.length - 1].isFinal && state.autoSubmitVoice) submitMessage(text);
  };
  rec.start();
  showToast('Mendengarkan…');
}

function setView(view) {
  $$('.view').forEach((s) => s.classList.toggle('active', s.id === `${view}View`));
  $$('.nav-item[data-view]').forEach((i) => i.classList.toggle('active', i.dataset.view === view));
  $('.sidebar').classList.remove('open');
  if ($('#breadcrumbProject')) {
    $('#breadcrumbProject').textContent = view === 'picker' ? 'Pemilihan AI' : (PROJECTS[state.activeProject]?.name || 'Workspace');
  }
}

let toastTimeout;
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
}

function showSessionMenu() {
  openModal(`<h2>Session</h2><div class="menu-pop"><button class="modal-option" id="renameSession">Rename sesi</button><button class="modal-option" id="exportSession">Export percakapan</button><button class="modal-option" id="deleteSession">Hapus sesi</button></div>`);
  $('#renameSession').addEventListener('click', async () => {
    const title = window.prompt ? null : '';
    openModal(`<h2>Rename</h2><input class="modal-field" id="sessionTitle" value="Ship a beginner-friendly MVP" /><div class="modal-footer"><button class="primary" id="saveTitle">Save</button></div>`);
    $('#saveTitle').addEventListener('click', async () => {
      const t = $('#sessionTitle').value.trim();
      if (state.conversationId) try { await api(`/api/conversations/${state.conversationId}`, { method: 'PATCH', body: { title: t } }); } catch { /* ignore */ }
      closeModal(); showToast('Session renamed.');
    });
  });
  $('#exportSession').addEventListener('click', async () => {
    const blob = new Blob([JSON.stringify(state.messages, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'noahs-session.json'; a.click();
  });
  $('#deleteSession').addEventListener('click', async () => {
    if (state.conversationId) try { await api(`/api/conversations/${state.conversationId}`, { method: 'DELETE' }); } catch { /* ignore */ }
    state.messages = STARTING_MESSAGES; state.conversationId = null; closeModal(); renderState();
  });
}

function showProfileMenu() {
  openModal(`<h2>Profil</h2><div class="menu-pop"><button class="modal-option" id="editProfile">Edit profil</button><button class="modal-option" id="quickTheme">Ganti tema cepat</button><button class="modal-option" id="logoutBtn">Keluar</button></div>`);
  $('#editProfile').addEventListener('click', () => {
    openModal(`<h2>Nama tampilan</h2><input class="modal-field" id="dispName" value="${escapeHtml(state.user?.display_name || '')}" /><div class="modal-footer"><button class="primary" id="saveName">Save</button></div>`);
    $('#saveName').addEventListener('click', async () => {
      const display_name = $('#dispName').value.trim();
      try { await api('/api/profile', { method: 'PATCH', body: { display_name } }); } catch { /* local */ }
      if (state.user) state.user.display_name = display_name; closeModal(); renderState();
    });
  });
  $('#quickTheme').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; applyTheme(); saveSettings(); closeModal(); renderState(); });
  $('#logoutBtn').addEventListener('click', async () => {
    await announceOffline();
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    location.reload();
  });
}

function showNotifyDrawer() {
  const items = state.notifications.length ? state.notifications.map((n) => `<div class="list-row"><div><strong>${escapeHtml(n.body)}</strong><small>${escapeHtml(n.created_at || '')}</small></div></div>`).join('') : '<p>Tidak ada notifikasi. Approval pending: ' + state.approvals + '</p>';
  openModal(`<h2>Notifikasi</h2>${items}<p>Status model: ${MODEL_PROVIDERS.map((m) => `${m.name} ${modelLive(m.id) ? 'LIVE possible' : 'SIMULASI'}`).join(' · ')}</p>`);
}

async function openConversation(id) {
  if (!id) return setView('dashboard');
  try {
    const data = await api(`/api/conversations/${id}`);
    state.conversationId = id;
    state.messages = data.messages.map((m) => ({ role: m.role, ...(JSON.parse(m.content || '{}')), id: m.id, live: m.live }));
  } catch { /* keep */ }
  setView('dashboard'); renderState();
}

async function togglePower() {
  state.masterPower = !state.masterPower;
  await saveSettings();
  renderPower();
  if (!state.masterPower) {
    await announceOffline();
    $('#offlineOverlay').hidden = false;
  } else {
    await announceOnline();
  }
  renderState();
}

function playLoadingThenDashboard() {
  return new Promise((resolve) => {
    const screen = $('#loadingScreen');
    const cube = $('#noahCube');
    screen.hidden = false;
    const burst = window.setInterval(() => cube.classList.toggle('burst'), 1400);
    window.setTimeout(() => {
      window.clearInterval(burst);
      cube.classList.remove('burst');
      screen.classList.add('open');
      screen.classList.add('flash');
      window.setTimeout(() => {
        screen.hidden = true;
        screen.classList.remove('open', 'flash');
        resolve();
      }, 900);
    }, 2200);
  });
}

async function afterLogin(opts = {}) {
  $('#loginScreen').hidden = true;
  const loading = playLoadingThenDashboard();
  try {
    const me = await api('/api/me');
    state.user = me.user;
    state.keys = me.keys;
    state.compact = me.compact;
    if (Array.isArray(me.settings.active_models) && me.settings.active_models.length) state.activeModels = me.settings.active_models;
    Object.assign(state, {
      theme: me.settings.theme, replyMode: me.settings.reply_mode, activeModel: me.settings.active_model,
      masterPower: me.settings.master_power, personality: me.settings.personality_preset,
      voicePitch: me.settings.voice_pitch, voiceRate: me.settings.voice_rate, autoSubmitVoice: me.settings.auto_submit_voice,
      layoutMode: me.settings.layout_mode || state.layoutMode,
      cubeVisible: me.settings.cube_visible == null ? state.cubeVisible : me.settings.cube_visible,
      rolePools: me.settings.role_pools || state.rolePools,
      activeAgents: Array.isArray(me.settings.active_agents) && me.settings.active_agents.length ? me.settings.active_agents : state.activeAgents
    });
    const boot = await api('/api/bootstrap');
    PROJECTS = Object.fromEntries((boot.projects || []).map((p) => [p.id, { ...p, next: p.next_step }]));
    state.tasks = boot.tasks || state.tasks;
    state.memories = boot.memories || state.memories;
    state.files = boot.files || [];
    state.notifications = boot.notifications || [];
    state.conversations = boot.conversations || [];
    state.approvals = (boot.approvals || []).length;
    if (boot.conversations[0]) state.conversationId = boot.conversations[0].id;
    if (boot.messages?.length) state.messages = boot.messages.map((m) => ({ role: m.role, ...(JSON.parse(m.content || '{}')), id: m.id, live: m.live }));
    state.onlineApi = true;
  } catch { /* local fallback */ }
  renderState();
  await loading;
  await refreshAudioAvailability();
  if (opts.freshLogin) await playGreeting();
  if (state.masterPower) await announceOnline();
}

function loadGoogle(clientId) {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = () => {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        await api('/api/auth/google', { method: 'POST', body: { credential: resp.credential } });
        afterLogin({ freshLogin: true });
      }
    });
    window.google.accounts.id.renderButton($('#googleButton'), { theme: 'filled_black', size: 'large', text: 'signin_with', width: 320 });
  };
  document.head.appendChild(s);
}

function initEvents() {
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); const input = $('#chatInput'); submitMessage(input.value); input.value = ''; input.style.height = '23px'; });
  $('#chatInput').addEventListener('input', (e) => { e.target.style.height = '23px'; e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`; });
  $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
  $('#modeSelector').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('#modelSelector').addEventListener('click', (e) => { const b = e.target.closest('[data-model]'); if (b) setModel(b.dataset.model); });
  $('#replyMini').addEventListener('click', (e) => { const b = e.target.closest('[data-reply]'); if (b) { state.replyMode = b.dataset.reply; saveSettings(); renderState(); } });
  $('#changeMode').addEventListener('click', showModeModal);
  $('#reviewApprovals').addEventListener('click', showApprovalModal);
  $('#approveChanges').addEventListener('click', showApprovalModal);
  $('#inspectChanges').addEventListener('click', showApprovalModal);
  $('#showRouting').addEventListener('click', () => openModal(`<h2>Routing</h2><p>${escapeHtml(getModel(state.activeModel).name)} · ${escapeHtml(state.activeMode)}. Copilot/Devin/Cursor/Windsurf remain external.</p><div class="modal-footer"><button class="primary" data-close-modal>Got it</button></div>`));
  $('#providerSettings').addEventListener('click', () => setView('providers'));
  $('#helpBtn').addEventListener('click', () => openModal(`<h2>NOAH'S</h2><p>Personal app: Google login, encrypted keys on the server, SIMULASI unless a live call succeeds.</p><div class="modal-footer"><button class="primary" data-close-modal>OK</button></div>`));
  $('#shortcutsBtn').addEventListener('click', () => $('#chatInput').focus());
  $('#resumeBtn').addEventListener('click', () => $('#chatInput').focus());
  $('#addTask').addEventListener('click', showAddTaskModal);
  $('#taskList').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-task]'); if (!t) return;
    const task = state.tasks[Number(t.dataset.task)]; task.done = !task.done;
    if (task.id) try { await api('/api/tasks', { method: 'POST', body: { id: task.id, done: task.done } }); } catch { /* local */ }
    renderState();
  });
  $$('.suggestion-row button').forEach((b) => b.addEventListener('click', () => submitMessage(b.dataset.prompt)));
  $$('.nav-item[data-view], [data-view="memory"]').forEach((item) => item.addEventListener('click', (e) => { e.preventDefault(); setView(item.dataset.view); }));
  $$('.channel[data-channel]').forEach((b) => b.addEventListener('click', () => showToast(`${b.dataset.channel} needs a channel adapter.`)));
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target === $('#modalBackdrop')) closeModal(); });
  $('.mobile-menu').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); $('#lightbox').hidden = true; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const pickerOn = $('#pickerView')?.classList.contains('active');
      (pickerOn ? $('#pickerSearch') : $('#chatInput'))?.focus();
    }
  });
  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => uploadFiles(e.target.files));
  $('#micBtn').addEventListener('click', startMic);
  $('#sessionMore').addEventListener('click', showSessionMenu);
  $('#notifyBtn').addEventListener('click', showNotifyDrawer);
  $('#profileMenuBtn').addEventListener('click', showProfileMenu);
  $('#masterPowerBtn').addEventListener('click', togglePower);
  $('#closeOfflineOverlay').addEventListener('click', () => { $('#offlineOverlay').hidden = true; });
  $('#zoomIn').addEventListener('click', () => { state.chatZoom = Math.min(18, state.chatZoom + 1); persist(); applyTheme(); });
  $('#zoomOut').addEventListener('click', () => { state.chatZoom = Math.max(9, state.chatZoom - 1); persist(); applyTheme(); });
  $('#lightboxClose').addEventListener('click', () => { $('#lightbox').hidden = true; });
  $('#localOwnerBtn').addEventListener('click', async () => { await api('/api/auth/local', { method: 'POST' }); afterLogin({ freshLogin: true }); });
  $('#layoutHome')?.addEventListener('click', () => { state.layoutMode = 'home'; saveSettings(); applyLayout(); });
  $('#layoutChat')?.addEventListener('click', () => { state.layoutMode = 'chat'; saveSettings(); applyLayout(); });
  $('#cubeToggle')?.addEventListener('click', () => { state.cubeVisible = !state.cubeVisible; saveSettings(); applyLayout(); });
  $('#pickerSearch')?.addEventListener('input', (e) => { state.pickerQuery = e.target.value; renderPicker(); });
  $('#pickerSelectAll')?.addEventListener('click', applyRecommendedRasi);
  $('#pickerLayoutBtn')?.addEventListener('click', () => {
    state.pickerListMode = !state.pickerListMode;
    storageSet('noahs.pickerList', state.pickerListMode ? '1' : '0');
    renderPicker();
  });
  $('#projectStatCard')?.addEventListener('click', showProjectTasksModal);
  window.addEventListener('offline', () => { state.onlineApi = false; announceOffline(); });
  window.addEventListener('pagehide', () => { if (clipReady('offline')) { try { new Audio(AUDIO_URLS.offline).play().catch(() => {}); } catch { /* ignore */ } } });
  bindCube();
}

function showProjectTasksModal() {
  const open = state.tasks.filter((t) => !t.done && (!t.project_id || t.project_id === state.activeProject));
  const list = open.length ? open.map((t) => `<div class="list-row"><div><strong>${escapeHtml(t.text)}</strong><small>${escapeHtml(t.tag || '')}</small></div></div>`).join('') : '<p>Tidak ada task belum selesai.</p>';
  openModal(`<h2>${escapeHtml(PROJECTS[state.activeProject]?.name || 'Project')}</h2>${list}<div class="modal-footer"><button class="primary" data-close-modal>Tutup</button></div>`);
}

async function boot() {
  applyTheme();
  initEvents();
  renderState();
  try {
    const cfg = await api('/api/config');
    state.audioAvailable = cfg.audio || {};
    if (cfg.googleClientId) loadGoogle(cfg.googleClientId);
    else $('#loginHint').textContent = 'GOOGLE_CLIENT_ID belum diisi. Kamu bisa lanjut sebagai pemilik lokal (hanya development).';
    $('#localOwnerBtn').hidden = !cfg.allowLocalOwner;
    try {
      await api('/api/me');
      afterLogin();
    } catch {
      $('#loginScreen').hidden = false;
    }
  } catch {
    $('#loginScreen').hidden = true;
    showToast('Backend belum jalan — mode lokal/cache. Jalankan npm start.');
  }
}

boot();
