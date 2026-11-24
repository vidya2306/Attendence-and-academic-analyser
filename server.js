'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { CODES, PERIOD_START, istNow, toMin, parseKey } = require('./timetable');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET (32+ characters) in .env before starting.');
  process.exit(1);
}
const SECRET = process.env.JWT_SECRET;
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: {
  directives: {                               // allow the Google Fonts the frontend uses
    defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:']
  } } }));
app.use(express.json({ limit: '200kb' }));

/* ---------- helpers ---------- */
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { next(e); } };
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const isPhone = (s) => /^[0-9]{10}$/.test(s);

const getStudent = db.prepare('SELECT id, roll, name, batch FROM students WHERE id = ?');
const studentExists = (id) => !!getStudent.get(id);

function auth(...roles) {
  return (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').split(' ')[1];
      const u = jwt.verify(token, SECRET);
      if (roles.length && !roles.includes(u.role)) return bad(res, 'Not allowed', 403);
      if (u.role === 'student' && !studentExists(u.id)) return bad(res, 'Account no longer exists', 401);
      req.user = u; next();
    } catch { bad(res, 'Please sign in again', 401); }
  };
}
// A teacher may only touch their own subject.
const ownSubject = (req, res, code) => {
  if (req.user.role === 'teacher' && req.user.code === code) return true;
  bad(res, 'You can only change your own subject', 403); return false;
};

/* ---------- login ---------- */
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);   // keeps timing similar when the ID is unknown
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' } });

app.post('/api/login', loginLimiter, wrap((req, res) => {
  const { role, id, password } = req.body || {};
  if (!['student', 'teacher', 'mentor'].includes(role) || typeof id !== 'string' || typeof password !== 'string') {
    return bad(res, 'Invalid request');
  }
  const row = role === 'student'
    ? db.prepare('SELECT id, name, pass_hash FROM students WHERE roll = ?').get(id.trim())
    : db.prepare('SELECT id, name, code, pass_hash FROM faculty WHERE id = ? COLLATE NOCASE AND role = ?').get(id.trim(), role);
  const ok = bcrypt.compareSync(password, row ? row.pass_hash : DUMMY);
  if (!row || !ok) return bad(res, 'The ID or password is incorrect. Check both and try again.', 401);
  const user = { role, id: row.id, name: row.name, ...(row.code ? { code: row.code } : {}) };
  res.json({ token: jwt.sign(user, SECRET, { expiresIn: '8h' }), user });
}));

app.post('/api/change-password', auth(), wrap((req, res) => {
  const { current, next: nw } = req.body || {};
  if (typeof current !== 'string' || typeof nw !== 'string' || nw.length < 8) return bad(res, 'New password must be at least 8 characters');
  const table = req.user.role === 'student' ? 'students' : 'faculty';
  const row = db.prepare(`SELECT pass_hash FROM ${table} WHERE id = ?`).get(req.user.id);
  if (!row || !bcrypt.compareSync(current, row.pass_hash)) return bad(res, 'Current password is wrong', 401);
  db.prepare(`UPDATE ${table} SET pass_hash = ? WHERE id = ?`).run(bcrypt.hashSync(nw, 10), req.user.id);
  db.audit(req.user.id, 'change-password');
  res.json({ ok: true });
}));

/* ---------- bootstrap: the data the frontend needs, filtered by role ---------- */
app.get('/api/bootstrap', auth(), wrap((req, res) => {
  const u = req.user, isStu = u.role === 'student';
  const out = { students: [], att: {}, marks: {}, published: {}, profiles: {}, myatt: {} };
  CODES.forEach((c) => { out.marks[c] = {}; out.published[c] = false; });
  db.prepare('SELECT code, is_published FROM published').all().forEach((r) => { out.published[r.code] = !!r.is_published; });

  out.students = isStu ? [getStudent.get(u.id)] : db.prepare('SELECT id, roll, name, batch FROM students ORDER BY roll').all();

  // attendance: students get only their own rows, teachers only their subject, mentor everything
  let sessions = db.prepare('SELECT session_key, code FROM sessions').all();
  if (u.role === 'teacher') sessions = sessions.filter((s) => s.code === u.code);
  let rows;
  if (isStu) {
    rows = db.prepare('SELECT session_key, student_id, status FROM attendance WHERE student_id = ?').all(u.id);
    rows.forEach((r) => { (out.att[r.session_key] = out.att[r.session_key] || {})[r.student_id] = r.status; });
  } else {
    sessions.forEach((s) => { out.att[s.session_key] = {}; });
    rows = db.prepare('SELECT session_key, student_id, status FROM attendance').all();
    rows.forEach((r) => { if (out.att[r.session_key]) out.att[r.session_key][r.student_id] = r.status; });
  }

  // marks: student -> own, published subjects only; teacher -> own subject; mentor -> all
  db.prepare('SELECT code, student_id, score FROM marks').all().forEach((m) => {
    const visible = isStu ? (m.student_id === u.id && out.published[m.code])
      : u.role === 'teacher' ? m.code === u.code : true;
    if (visible) out.marks[m.code][m.student_id] = m.score;
  });

  // profiles + student's own lock-once log
  const pr = isStu ? db.prepare('SELECT * FROM profiles WHERE student_id = ?').all(u.id) : db.prepare('SELECT * FROM profiles').all();
  pr.forEach((p) => { out.profiles[p.student_id] = { phone: p.phone, email: p.email, dob: p.dob, guardian: p.guardian,
    guardianPhone: p.guardian_phone, address: p.address, by: p.updated_by, at: p.updated_at }; });
  if (isStu) {
    const log = {};
    db.prepare('SELECT session_key, status, at FROM myatt WHERE student_id = ?').all(u.id).forEach((r) => { log[r.session_key] = { v: r.status, at: r.at }; });
    out.myatt[u.id] = log;
  }
  res.json(out);
}));

/* ---------- attendance (subject teacher only) ---------- */
app.put('/api/attendance/:key', auth('teacher'), wrap((req, res) => {
  const k = parseKey(req.params.key);
  if (!k) return bad(res, 'That is not a valid lecture slot');
  if (!ownSubject(req, res, k.code)) return;
  const records = req.body && req.body.records;
  if (!records || typeof records !== 'object') return bad(res, 'records missing');
  const entries = Object.entries(records);
  if (entries.some(([sid, v]) => (v !== 0 && v !== 1) || !studentExists(sid))) return bad(res, 'Invalid attendance data');
  db.transaction(() => {
    db.prepare(`INSERT INTO sessions (session_key, code, date, period, taken_by, taken_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(session_key) DO UPDATE SET taken_by = excluded.taken_by, taken_at = excluded.taken_at`)
      .run(req.params.key, k.code, k.date, k.period, req.user.id, new Date().toISOString());
    db.prepare('DELETE FROM attendance WHERE session_key = ?').run(req.params.key);
    const ins = db.prepare('INSERT INTO attendance (session_key, student_id, status) VALUES (?,?,?)');
    entries.forEach(([sid, v]) => ins.run(req.params.key, sid, v));
    db.audit(req.user.id, 'attendance-save', `${req.params.key} (${entries.length} students)`);
  })();
  res.json({ ok: true });
}));

app.patch('/api/attendance/:key/:sid', auth('teacher'), wrap((req, res) => {
  const k = parseKey(req.params.key);
  if (!k) return bad(res, 'That is not a valid lecture slot');
  if (!ownSubject(req, res, k.code)) return;
  const v = req.body && req.body.v;
  if (v !== 0 && v !== 1) return bad(res, 'v must be 0 or 1');
  const r = db.prepare('UPDATE attendance SET status = ? WHERE session_key = ? AND student_id = ?').run(v, req.params.key, req.params.sid);
  if (!r.changes) return bad(res, 'No record to edit', 404);
  db.audit(req.user.id, 'attendance-edit', `${req.params.key} ${req.params.sid} -> ${v}`);
  res.json({ ok: true });
}));

/* ---------- marks (subject teacher only) ---------- */
const validCode = (req, res) => (CODES.includes(req.params.code) ? ownSubject(req, res, req.params.code) : (bad(res, 'Unknown subject'), false));
const validScore = (s) => Number.isInteger(s) && s >= 0 && s <= 100;

app.put('/api/marks/:code/:sid', auth('teacher'), wrap((req, res) => {
  if (!validCode(req, res)) return;
  if (!studentExists(req.params.sid)) return bad(res, 'Unknown student', 404);
  const score = req.body && req.body.score;
  if (score === null) db.prepare('DELETE FROM marks WHERE code = ? AND student_id = ?').run(req.params.code, req.params.sid);
  else if (validScore(score)) {
    db.prepare(`INSERT INTO marks (code, student_id, score) VALUES (?,?,?)
      ON CONFLICT(code, student_id) DO UPDATE SET score = excluded.score`).run(req.params.code, req.params.sid, score);
  } else return bad(res, 'Score must be a whole number from 0 to 100, or null');
  db.audit(req.user.id, 'marks-edit', `${req.params.code} ${req.params.sid} -> ${score}`);
  res.json({ ok: true });
}));

app.post('/api/marks/:code/bulk', auth('teacher'), wrap((req, res) => {
  if (!validCode(req, res)) return;
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  const find = db.prepare('SELECT id FROM students WHERE roll = ?');
  const up = db.prepare(`INSERT INTO marks (code, student_id, score) VALUES (?,?,?)
    ON CONFLICT(code, student_id) DO UPDATE SET score = excluded.score`);
  let n = 0;
  db.transaction(() => rows.forEach((r) => {
    const s = find.get(String(r.roll || ''));
    if (s && validScore(r.score)) { up.run(req.params.code, s.id, r.score); n++; }
  }))();
  db.audit(req.user.id, 'marks-bulk', `${req.params.code} ${n} rows`);
  res.json({ ok: true, updated: n });
}));

app.post('/api/marks/:code/publish', auth('teacher'), wrap((req, res) => {
  if (!validCode(req, res)) return;
  db.prepare('UPDATE published SET is_published = 1 WHERE code = ?').run(req.params.code);
  db.audit(req.user.id, 'marks-publish', req.params.code); res.json({ ok: true });
}));
app.post('/api/marks/:code/unpublish', auth('teacher'), wrap((req, res) => {
  if (!validCode(req, res)) return;
  db.prepare('UPDATE published SET is_published = 0 WHERE code = ?').run(req.params.code);
  db.audit(req.user.id, 'marks-unpublish', req.params.code); res.json({ ok: true });
}));
app.delete('/api/marks/:code', auth('teacher'), wrap((req, res) => {
  if (!validCode(req, res)) return;
  db.transaction(() => {
    db.prepare('DELETE FROM marks WHERE code = ?').run(req.params.code);
    db.prepare('UPDATE published SET is_published = 0 WHERE code = ?').run(req.params.code);
  })();
  db.audit(req.user.id, 'marks-clear', req.params.code); res.json({ ok: true });
}));

/* ---------- profiles: the student themself, or any teacher/mentor ---------- */
app.put('/api/profiles/:sid', auth(), wrap((req, res) => {
  const u = req.user;
  if (u.role === 'student' && u.id !== req.params.sid) return bad(res, 'Not allowed', 403);
  if (!studentExists(req.params.sid)) return bad(res, 'Unknown student', 404);
  const b = req.body || {}, t = (k) => (typeof b[k] === 'string' ? b[k].trim().slice(0, 200) : '');
  const p = { phone: t('phone'), email: t('email'), dob: t('dob'), guardian: t('guardian'), guardianPhone: t('guardianPhone'), address: t('address') };
  if (!isPhone(p.phone)) return bad(res, 'Mobile number must be 10 digits');
  if (p.guardianPhone && !isPhone(p.guardianPhone)) return bad(res, "Guardian's mobile must be 10 digits");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dob) || p.dob > istNow().date) return bad(res, 'Enter a valid date of birth');
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return bad(res, 'Enter a valid email');
  const by = u.role === 'student' ? 'the student' : u.name, at = new Date().toISOString();
  db.prepare(`INSERT INTO profiles (student_id, phone, email, dob, guardian, guardian_phone, address, updated_by, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET phone=excluded.phone, email=excluded.email, dob=excluded.dob,
    guardian=excluded.guardian, guardian_phone=excluded.guardian_phone, address=excluded.address,
    updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .run(req.params.sid, p.phone, p.email, p.dob, p.guardian, p.guardianPhone, p.address, by, at);
  db.audit(u.id, 'profile-save', req.params.sid);
  res.json({ ...p, by, at });
}));

/* ---------- student's own lock-once attendance log (today, after the lecture starts) ---------- */
app.post('/api/myatt', auth('student'), wrap((req, res) => {
  const { key, v } = req.body || {};
  const k = parseKey(key), now = istNow();
  if (!k || (v !== 0 && v !== 1)) return bad(res, 'Invalid request');
  if (k.date !== now.date) return bad(res, 'You can only mark today');
  if (now.minutes < toMin(PERIOD_START[k.period - 1])) return bad(res, 'That lecture has not started yet');
  try {
    db.prepare('INSERT INTO myatt (student_id, session_key, status, at) VALUES (?,?,?,?)').run(req.user.id, key, v, Date.now());
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return bad(res, 'Already saved and locked', 409);
    throw e;
  }
  res.json({ ok: true });
}));

/* ---------- roster management (mentor only) ---------- */
app.post('/api/students', auth('mentor'), wrap((req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, 100);
  const roll = String((req.body && req.body.roll) || '').trim().slice(0, 20);
  const batch = req.body && req.body.batch;
  if (!name || !/^[A-Za-z0-9-]+$/.test(roll) || !['I', 'II'].includes(batch)) return bad(res, 'Name, roll number and batch are required');
  if (db.prepare('SELECT 1 FROM students WHERE roll = ?').get(roll)) return bad(res, 'That roll number already exists.', 409);
  const id = 'S' + Date.now().toString(36);
  db.prepare('INSERT INTO students (id, roll, name, batch, pass_hash) VALUES (?,?,?,?,?)')
    .run(id, roll, name, batch, bcrypt.hashSync(roll.toLowerCase() + '@123', 10));
  db.audit(req.user.id, 'student-add', `${id} ${roll}`);
  res.status(201).json({ id, roll, name, batch });
}));

app.delete('/api/students/:sid', auth('mentor'), wrap((req, res) => {
  const r = db.prepare('DELETE FROM students WHERE id = ?').run(req.params.sid);   // cascades to attendance, marks, profile, log
  if (!r.changes) return bad(res, 'Unknown student', 404);
  db.audit(req.user.id, 'student-delete', req.params.sid);
  res.json({ ok: true });
}));

// Wipes attendance/marks and re-seeds demo data. Off unless ALLOW_RESET=true.
app.post('/api/reset', auth('mentor'), wrap((req, res) => {
  if (process.env.ALLOW_RESET !== 'true') return bad(res, 'Reset is disabled on this server', 403);
  db.transaction(() => {
    ['attendance', 'sessions', 'marks', 'myatt', 'profiles'].forEach((t) => db.prepare(`DELETE FROM ${t}`).run());
    db.prepare('UPDATE published SET is_published = 0').run();
  })();
  require('./seed').seedDemoAttendance();
  db.audit(req.user.id, 'reset');
  res.json({ ok: true });
}));

/* ---------- frontend + errors ---------- */
app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((err, req, res, next) => { console.error(err); bad(res, 'Something went wrong on the server', 500); });  // eslint-disable-line

if (!db.prepare('SELECT 1 FROM faculty LIMIT 1').get()) require('./seed').seedPeople();   // first run only
app.listen(process.env.PORT || 3000, () => console.log(`Class Register running on http://localhost:${process.env.PORT || 3000}`));
