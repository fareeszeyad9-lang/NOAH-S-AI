const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function usersHasGreetingColumn(db) {
  return db.prepare('PRAGMA table_info(users)').all().some((col) => col.name === 'last_greeting_index');
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/i, '');
    if (applied.has(id)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const isGreeting = id === '001_last_greeting_index';
    if (isGreeting && usersHasGreetingColumn(db)) {
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
      continue;
    }

    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
  }
}

module.exports = { runMigrations };
