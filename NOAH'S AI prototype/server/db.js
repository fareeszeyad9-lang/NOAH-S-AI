const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'noahs.db');
const { runMigrations } = require('./migrate');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE,
  email TEXT,
  display_name TEXT,
  last_greeting_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  color TEXT DEFAULT 'violet',
  summary TEXT DEFAULT '',
  next_step TEXT DEFAULT '',
  mode TEXT DEFAULT 'combination',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id TEXT,
  mode TEXT,
  model TEXT,
  title TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model_used TEXT,
  live INTEGER DEFAULT 0,
  feedback TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id TEXT,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id TEXT,
  text TEXT NOT NULL,
  tag TEXT DEFAULT 'Now',
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id TEXT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  tag TEXT DEFAULT 'project',
  storage_path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER PRIMARY KEY,
  theme TEXT DEFAULT 'dark',
  reply_mode TEXT DEFAULT 'text',
  voice_enabled INTEGER DEFAULT 1,
  active_model TEXT DEFAULT 'deepseek',
  master_power INTEGER DEFAULT 1,
  personality_preset TEXT DEFAULT 'hangat',
  voice_pitch REAL DEFAULT 0.8,
  voice_rate REAL DEFAULT 0.9,
  auto_submit_voice INTEGER DEFAULT 0,
  encrypted_keys TEXT DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  conversation_id INTEGER,
  target_agent TEXT,
  instruction TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedback_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message_id INTEGER,
  rating TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

runMigrations(db);

const SEED_PROJECTS = [
  { id: 'ai-hub', name: 'AI Learning Hub', progress: 68, color: 'violet', summary: 'A practical learning workspace that makes building feel less overwhelming.', next_step: 'Write the first onboarding lesson', mode: 'combination' },
  { id: 'portfolio', name: 'Portfolio Website', progress: 42, color: 'teal', summary: 'A visual portfolio with a clear narrative and simple case-study structure.', next_step: 'Create the work showcase layout', mode: 'builder' },
  { id: 'inventory', name: 'Inventory App', progress: 60, color: 'amber', summary: 'A small inventory tool for understanding products, stock, and simple workflows.', next_step: 'Design the authentication endpoint', mode: 'learning' }
];

function seedUser(userId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(userId).n;
  if (count > 0) return;
  const insertProject = db.prepare(`INSERT INTO projects (id, user_id, name, progress, color, summary, next_step, mode)
    VALUES (@id, @user_id, @name, @progress, @color, @summary, @next_step, @mode)`);
  for (const project of SEED_PROJECTS) {
    insertProject.run({ ...project, user_id: userId });
  }
  db.prepare('INSERT INTO memories (user_id, project_id, body) VALUES (?, ?, ?)').run(
    userId, 'ai-hub', 'Start with a manual onboarding flow before automating integrations.'
  );
  const insertTask = db.prepare('INSERT INTO tasks (user_id, project_id, text, tag, done) VALUES (?, ?, ?, ?, ?)');
  insertTask.run(userId, 'ai-hub', 'Define the first learner moment', 'Now', 0);
  insertTask.run(userId, 'ai-hub', 'Sketch the onboarding lesson', 'Next', 0);
  insertTask.run(userId, 'ai-hub', 'Save the MVP decision to memory', 'Done', 1);
  db.prepare(`INSERT INTO settings (user_id) VALUES (?)`).run(userId);
  db.prepare('INSERT INTO approvals (user_id, target_agent, instruction, status) VALUES (?, ?, ?, ?)').run(
    userId, 'cursor', 'Initial read-only review of project structure.', 'pending'
  );
  const conv = db.prepare('INSERT INTO conversations (user_id, project_id, mode, model, title) VALUES (?, ?, ?, ?, ?)').run(
    userId, 'ai-hub', 'combination', 'deepseek', 'Ship a beginner-friendly MVP'
  );
  const insertMsg = db.prepare('INSERT INTO messages (conversation_id, role, content, model_used) VALUES (?, ?, ?, ?)');
  insertMsg.run(conv.lastInsertRowid, 'assistant', JSON.stringify({ text: 'I found your project context and last decision. <b>We can make the MVP feel real before we add integrations.</b><br><span class="route-tag">Context loaded · project memory</span>' }), 'deepseek');
  insertMsg.run(conv.lastInsertRowid, 'user', JSON.stringify({ text: 'I want a simple learning flow, but I also want the first version to be useful right away.' }), null);
  insertMsg.run(conv.lastInsertRowid, 'assistant', JSON.stringify({ text: 'That suggests <b>Alien Combination</b>: we can ship a small flow while making the design choices visible. I’ll route this through a model for product reasoning, then ask for your approval before any workspace action.' }), 'deepseek');
}

module.exports = { db, dbPath, seedUser };
