const path = require('node:path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../data/reservations.sqlite');
const db = new Database(dbPath);

// WAL improves read/write concurrency. foreign_keys protects referential integrity.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(require('node:fs').readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
if (!db.prepare('PRAGMA table_info(reservations)').all().some((column) => column.name === 'booking_type')) {
  db.exec("ALTER TABLE reservations ADD COLUMN booking_type TEXT NOT NULL DEFAULT 'general' CHECK(booking_type IN ('family','general'))");
}

module.exports = db;

