'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'register.db');
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  roll       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT NOT NULL,
  batch      TEXT NOT NULL CHECK (batch IN ('I','II')),
  pass_hash  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS faculty (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('teacher','mentor')),
  code       TEXT,                       -- subject code for teachers, NULL for the mentor
  phone      TEXT,
  pass_hash  TEXT NOT NULL
);
-- One row = one lecture whose attendance has been taken ("held").
CREATE TABLE IF NOT EXISTS sessions (
  session_key TEXT PRIMARY KEY,          -- CODE|YYYY-MM-DD|period
  code        TEXT NOT NULL,
  date        TEXT NOT NULL,
  period      INTEGER NOT NULL,
  taken_by    TEXT,
  taken_at    TEXT
);
CREATE TABLE IF NOT EXISTS attendance (
  session_key TEXT NOT NULL REFERENCES sessions(session_key) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status      INTEGER NOT NULL CHECK (status IN (0,1)),
  PRIMARY KEY (session_key, student_id)
);
CREATE TABLE IF NOT EXISTS marks (
  code        TEXT NOT NULL,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  PRIMARY KEY (code, student_id)
);
CREATE TABLE IF NOT EXISTS published (
  code        TEXT PRIMARY KEY,
  is_published INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS profiles (
  student_id     TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  phone TEXT, email TEXT, dob TEXT, guardian TEXT, guardian_phone TEXT, address TEXT,
  updated_by TEXT, updated_at TEXT
);
-- A student's own private, lock-once log for today's lectures.
CREATE TABLE IF NOT EXISTS myatt (
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  status      INTEGER NOT NULL CHECK (status IN (0,1)),
  at          INTEGER NOT NULL,
  PRIMARY KEY (student_id, session_key)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS idx_att_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code);
`);

const audit = db.prepare('INSERT INTO audit_log (actor, action, detail) VALUES (?,?,?)');
db.audit = (actor, action, detail = '') => audit.run(actor, action, String(detail));

module.exports = db;
