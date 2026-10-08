const fs = require('node:fs');
const path = require('node:path');
const { dbPath } = require('./db');

const dest = path.join(__dirname, '..', 'data', `noahs-backup-${new Date().toISOString().slice(0, 10)}.db`);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(dbPath, dest);
console.log(`Backup written to ${dest}`);
