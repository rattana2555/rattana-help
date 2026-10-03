'use strict';
// RATTANA HELP — backup: consistent copy of the database + all uploaded photos
// Usage: npm run backup  → backups/<timestamp>/ (copy that folder somewhere safe)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DB_FILE, UPLOAD_DIR } = require('../db');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'), stamp);
fs.mkdirSync(out, { recursive: true });

const db = new DatabaseSync(DB_FILE);
const target = path.join(out, 'rattana-help.db');
db.prepare('VACUUM INTO ?').run(target); // safe while the server is running
db.close();
if (fs.existsSync(UPLOAD_DIR)) fs.cpSync(UPLOAD_DIR, path.join(out, 'uploads'), { recursive: true });

const files = fs.readdirSync(path.join(out, 'uploads'), { recursive: true }).filter(f => /\.(jpe?g|png|webp|svg)$/i.test(f)).length;
console.log(`Backup saved to ${out}\n  database: ${(fs.statSync(target).size / 1024).toFixed(0)} KB\n  photos:   ${files} files`);
