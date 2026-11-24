/* Class Register: CSE-Cyber Security, B.Tech V Sem, Section B (LNCT, Bhopal)
   - Attendance is recorded per subject and per lecture, by that subject's teacher.
   - Four tracked subjects: CY501, CY502, CY503, CY504.
   - Three roles: student (own record), subject teacher (own subject only), mentor (everything).
   - Data lives on the server (SQLite). This file talks to it through /api (see api() below). */
'use strict';

/* ================= Constants ================= */
const LIMIT = 75;                         // minimum attendance %
const MAX = 100;                          // marks are out of 100
const SESSION = 'class-register-session-v3';   // { token, user }
const CLASS_START = '2026-09-07';         // "Classes w.e.f." on the timetable

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const avgOf = (a) => { const m = mean(a); return m == null ? null : Math.round(m); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* The four subjects that carry attendance and marks. hue drives each subject's colour. */
const SUBJECTS = {
  CY501: { name: 'OS Internals for Security Support', short: 'OS Internals', hue: 188 },
  CY502: { name: 'Design and Analysis of Algorithms', short: 'DAA', hue: 258 },
  CY503: { name: 'Network Security', short: 'Network Security', hue: 32 },
  CY504: { name: 'Cyber Law & IPR', short: 'Cyber Law & IPR', hue: 340 }
};
const CODES = Object.keys(SUBJECTS);

/* One teacher per subject, plus the class mentor (from the timetable's faculty list). */
const FACULTY = [
  { id: 'T501', name: 'Prof. Shivani Sant', role: 'teacher', code: 'CY501', phone: '9074367960' },
  { id: 'T502', name: 'Dr. Bhawana Pillai', role: 'teacher', code: 'CY502', phone: '9425302343' },
  { id: 'T503', name: 'Prof. Aryan Khatri', role: 'teacher', code: 'CY503', phone: '9301382870' },
  { id: 'T504', name: 'Dr. Abhijeet Gupta', role: 'teacher', code: 'CY504', phone: '9926966225' },
  { id: 'M101', name: 'Prof. Monika Kudopa', role: 'mentor', phone: '8602129564' }
];
const MENTOR = FACULTY.find((f) => f.role === 'mentor');
const teacherOf = (code) => FACULTY.find((f) => f.code === code);

/* Full course list from the timetable (only CY501 to CY504 are tracked). */
const COURSES = [
  ['CY501', 'OS Internals for Security Support', 'Prof. Shivani Sant', '9074367960', 'F-10(A)'],
  ['CY502', 'Design and Analysis of Algorithms', 'Dr. Bhawana Pillai', '9425302343', 'F-10(B)'],
  ['CY503', 'Network Security', 'Prof. Aryan Khatri', '9301382870', ''],
  ['CY504', 'Cyber Law & IPR', 'Dr. Abhijeet Gupta', '9926966225', ''],
  ['CY505', 'Network Security Lab', 'Prof. Aryan Khatri', '9301382870', 'F-10(A)'],
  ['CY506', 'Cyber Law & IPR Lab', 'Dr. Abhijeet Gupta', '9926966225', 'T-15'],
  ['CY507', 'Internship-II', 'Dr. Priyank Nema', '7999554623', 'F-01'],
  ['CY508', 'Minor Project-I', 'Prof. Monika Kudopa / Prof. Aryan Khatri', '8602129564', 'F-09']
];

/* ---------- Timetable (Section B, classes w.e.f. 07/09/2026) ---------- */
const PERIODS = [
  ['I', '10:30', '11:15'], ['II', '11:15', '12:00'], ['III', '12:00', '12:45'],
  ['IV', '12:45', '13:25'], ['V', '13:25', '14:10'], ['VI', '14:10', '14:50'],
  ['VII', '14:50', '15:30'], ['VIII', '15:30', '16:15'], ['IX', '16:15', '17:00']
];
const th = (p, code) => ({ p, n: 1, kind: 'theory', code });
const lab = (p, n, label) => ({ p, n, kind: 'lab', label });
const tp = (p, n) => ({ p, n, kind: 'tp', label: 'T&P' });
const mentorSlot = (p) => ({ p, n: 1, kind: 'mentor', label: 'Mentor / Library' });
const lunch = (p) => ({ p, n: 1, kind: 'lunch', label: 'Lunch' });

const TT = {
  Mon: [th(1, 'CY504'), th(2, 'CY501'), mentorSlot(3), th(4, 'CY503'), lunch(5),
        lab(6, 2, 'CY 505-B1 / CY 506-B2'), th(8, 'CY502'), th(9, 'CY502')],
  Tue: [tp(1, 2), th(3, 'CY503'), th(4, 'CY504'), lunch(5), th(6, 'CY501'), th(7, 'CY502'),
        lab(8, 2, 'CY 507 Internship-II')],
  Wed: [lab(1, 2, 'CY 508 Minor Project-I'), th(3, 'CY503'), th(4, 'CY504'), lunch(5),
        th(6, 'CY501'), th(7, 'CY502'), lab(8, 2, 'CY 505-B2 / CY 506-B1')],
  Thu: [tp(1, 2), lab(3, 2, 'CY 501-B1 / CY 502-B2'), lunch(5), th(6, 'CY503'), th(7, 'CY501'),
        th(8, 'CY504'), th(9, 'CY503')],
  Fri: [th(1, 'CY501'), th(2, 'CY504'), th(3, 'CY502'), th(4, 'CY502'), lunch(5),
        lab(6, 2, 'CY 501-B2 / CY 502-B1'), th(8, 'CY503'), th(9, 'CY504')]
};
const FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const slotTime = (e) => [PERIODS[e.p - 1][1], PERIODS[e.p + e.n - 2][2]];
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => { const d = fromISO(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const fmtDay = (s) => { const d = fromISO(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };

function entryTitle(e) { return e.kind === 'theory' ? `${e.code} · ${SUBJECTS[e.code].short}` : e.label; }
function entryMeta(e) {
  if (e.kind === 'theory') return teacherOf(e.code).name;
  if (e.kind === 'lab') return 'Lab session';
  if (e.kind === 'tp') return 'Training and Placement';
  if (e.kind === 'mentor') return MENTOR.name;
  return '';
}

/* ================= Sessions (one lecture on one date) ================= */
const sessCache = {};
function sessionsFor(code) {              // every scheduled lecture from the first day up to today
  const end = iso(new Date()), ck = code + '|' + end;
  if (sessCache[ck]) return sessCache[ck];
  const out = [];
  for (let d = fromISO(CLASS_START); iso(d) <= end; d.setDate(d.getDate() + 1)) {
    const day = DOW[d.getDay()];
    (TT[day] || []).forEach((e) => {
      if (e.kind === 'theory' && e.code === code) {
        out.push({ key: `${code}|${iso(d)}|${e.p}`, code, date: iso(d), day, p: e.p, time: slotTime(e) });
      }
    });
  }
  return (sessCache[ck] = out);
}

function lastTeachingDay() {
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    if (TT[DOW[d.getDay()]]) { const s = iso(d); return s >= CLASS_START ? s : null; }
    d.setDate(d.getDate() - 1);
  }
  return null;
}

/* ================= Data ================= */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= Server connection ================= */
/* db has the same shape the page always used: { students, att, marks, published, profiles, myatt }.
   The server fills it after login, already limited to what this person may see. */
let token = null;
const emptyDb = () => ({ students: [], att: {}, marks: Object.fromEntries(CODES.map((c) => [c, {}])), published: {}, profiles: {}, myatt: {} });

async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (res.status === 401 && token && path !== '/login') { signOut(); throw new Error('Your session ended. Please sign in again.'); }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}
async function refresh() { db = await api('GET', '/bootstrap'); }

/* Save in the background. The screen already shows the change; if the server refuses it, reload the truth. */
function sync(method, path, body, after) {
  return api(method, path, body).then((r) => { if (after) after(r); return r; }).catch(async (e) => {
    toast(e.message || 'Could not save');
    try { await refresh(); PANEL[currentTab](); } catch (err) { /* signed out */ }
  });
}

/* ================= State ================= */
let db = emptyDb();
let user = null;                          // { role, id, name, code? }
let query = '';
let currentTab = 'overview';
let draft = null;                         // attendance being taken: { key, v: {studentId: 1|0}, isNew }
let mentorAttView = 'all';                // mentor attendance filter: 'all' or a subject code

const isStudent = () => !!user && user.role === 'student';
const isTeacher = () => !!user && user.role === 'teacher';
const isMentor = () => !!user && user.role === 'mentor';
const me = () => db.students.find((s) => s.id === user.id);
const filtered = () => {
  const q = query.trim().toLowerCase();
  return db.students.filter((s) => !q || (s.name + ' ' + s.roll).toLowerCase().includes(q));
};

/* ================= Calculations ================= */
const held = (c) => sessionsFor(c).filter((s) => db.att[s.key]);
const pending = (c) => sessionsFor(c).filter((s) => !db.att[s.key]);

function attStats(sid, code) {            // lectures of one subject that this student was enrolled for
  let p = 0, t = 0;
  sessionsFor(code).forEach((s) => {
    const r = db.att[s.key];
    if (r && sid in r) { t++; p += r[sid]; }
  });
  return { p, t, pct: t ? Math.round((p * 100) / t) : null };
}
function overall(sid) {
  let p = 0, t = 0;
  CODES.forEach((c) => { const a = attStats(sid, c); p += a.p; t += a.t; });
  return { p, t, pct: t ? Math.round((p * 100) / t) : null };
}
const classAtt = (c) => avgOf(db.students.map((s) => attStats(s.id, c).pct).filter((x) => x != null));
const marksOf = (c) => db.students.map((s) => db.marks[c][s.id]).filter((v) => typeof v === 'number');
function markStatus(c) {
  if (db.published[c]) return 'published';
  return marksOf(c).length ? 'draft' : 'pending';
}
const grade = (v) => (v >= 85 ? 'A' : v >= 70 ? 'B' : v >= 55 ? 'C' : v >= 40 ? 'D' : 'F');

function plan(p, t) {                     // how many lectures can be missed, or must be attended
  if (!t) return { ok: true, text: 'No lectures recorded yet.' };
  if (p * 100 >= LIMIT * t) {
    const m = Math.floor((p * 100) / LIMIT - t + 1e-9);
    return { ok: true, text: m > 0
      ? `You can miss the next <b>${m}</b> ${m === 1 ? 'lecture' : 'lectures'} and stay at or above ${LIMIT}%.`
      : `You are right at ${LIMIT}%. Do not miss the next lecture.` };
  }
  const n = Math.ceil((LIMIT * t - 100 * p) / (100 - LIMIT));
  return { ok: false, text: `Attend the next <b>${n}</b> ${n === 1 ? 'lecture' : 'lectures'} in a row to reach ${LIMIT}%.` };
}

/* ================= Small HTML helpers ================= */
function av(name, cls = '') {
  const ini = name.replace(/^(Dr\.|Prof\.)\s*/, '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="av ${cls}" style="--h:${h}">${ini}</span>`;
}
const whoCell = (s, cls = 'sm') => `<span class="who-cell">${av(s.name, cls)}<span class="who-t">${esc(s.name)}<small class="roll">${esc(s.roll)} · Batch ${s.batch}</small></span></span>`;
const chip = (c) => `<span class="chip" style="--h:${SUBJECTS[c].hue}">${c}</span>`;
const pill = (pct) => pct == null ? '<span class="pill none">n/a</span>'
  : `<span class="pill ${pct < LIMIT ? 'low' : pct < 80 ? 'edge' : 'good'}">${pct}%</span>`;
const STATUS = { pending: ['none', 'Not conducted'], draft: ['edge', 'Draft, hidden'], published: ['good', 'Published'] };
const statusPill = (st) => `<span class="pill ${STATUS[st][0]}">${STATUS[st][1]}</span>`;
function bar(pct, cls = '', mark = LIMIT) {
  return `<div class="track"><div class="fill ${cls}" style="width:${pct || 0}%"></div>${mark != null ? `<i class="limit" style="left:${mark}%"></i>` : ''}</div>`;
}
const attBar = (pct) => bar(pct, pct != null && pct < LIMIT ? 'low' : 'subj');
const stat = (items) => `<div class="box strip">${items.map(([v, l, bad]) =>
  `<div class="stat ${bad ? 'bad' : ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;

function ring(pct) {
  const r = 52, c = 2 * Math.PI * r, p = pct == null ? 0 : pct;
  return `<svg viewBox="0 0 120 120" class="ring" role="img" aria-label="${pct == null ? 'No' : pct + '%'} attendance">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg ${p < LIMIT ? 'low' : ''}" stroke-dasharray="${(c * p) / 100} ${c}" transform="rotate(-90 60 60)"/>
    <text x="60" y="67" text-anchor="middle" class="ring-t">${pct == null ? '-' : pct + '%'}</text></svg>`;
}

function upNext(filter = () => true) {
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const day = DOW[d.getDay()];
    const list = (TT[day] || []).filter((e) => e.kind !== 'lunch' && filter(e));
    for (const e of list) {
      const [a, b] = slotTime(e);
      if (i === 0 && m >= toMin(a) && m < toMin(b)) return { now: true, e, time: `${a} to ${b}`, when: 'Today' };
      if (i > 0 || toMin(a) > m) return { now: false, e, time: `${a} to ${b}`, when: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : FULL[day] };
    }
  }
  return null;
}
function nextHTML(n) {
  if (!n) return '';
  return `<div class="next"><span>${n.now ? 'Now: ' : 'Up next: '}${esc(entryTitle(n.e))}</span><em>${n.when}, ${n.time}</em></div>`;
}
function heroHTML({ name, msg, nx, pct, label }) {
  const h = new Date().getHours(), hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `<div class="hero"><div><p class="hero-hi">${hi}</p><h2>${esc(name)}</h2><p>${msg}</p>${nextHTML(nx)}</div>
    <div class="hero-ring">${ring(pct)}<span>${label}</span></div></div>`;
}
function scheduleHTML(mine) {
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  let key = DOW[now.getDay()], live = true;
  if (!TT[key]) { key = 'Mon'; live = false; }
  const items = TT[key].filter((e) => e.kind !== 'lunch').map((e) => {
    const [a, b] = slotTime(e);
    const st = !live ? '' : m >= toMin(b) ? 'done' : m >= toMin(a) ? 'now' : '';
    const own = mine && mine(e);
    return `<li class="${e.kind} ${st}" ${e.code ? `style="--h:${SUBJECTS[e.code].hue}"` : ''}>
      <time>${a} to ${b}</time><strong>${esc(entryTitle(e))}</strong><span>${esc(entryMeta(e))}</span>
      ${st === 'now' ? '<mark>Now</mark>' : own ? '<mark class="mine">Your class</mark>' : st === 'done' ? '<mark class="d">Done</mark>' : '<i></i>'}</li>`;
  }).join('');
  return `<div class="box"><h2>${live ? "Today's schedule" : "Monday's schedule"}</h2>
    ${live ? '' : '<p class="note">No classes today. This is the next teaching day.</p>'}<ol class="today">${items}</ol></div>`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= Overview ================= */
function renderOverview() {
  if (!user) return;
  $('#ovBody').innerHTML = isStudent() ? ovStudent() : isTeacher() ? ovTeacher() : ovMentor();
}

function subCardStudent(sid, c) {
  const st = attStats(sid, c), pl = plan(st.p, st.t), t = teacherOf(c);
  const pub = db.published[c], v = db.marks[c][sid];
  const marksLine = pub && typeof v === 'number'
    ? `Marks <b>${v}</b> out of ${MAX}` : '<span class="muted">Marks not available yet</span>';
  return `<article class="sub-card" style="--h:${SUBJECTS[c].hue}">
    <header>${chip(c)}${pill(st.pct)}</header>
    <h3>${SUBJECTS[c].name}</h3><p class="who">${esc(t.name)}</p>
    <div class="big">${st.pct == null ? 'n/a' : st.pct + '%'}<small>${st.p} of ${st.t} lectures attended</small></div>
    ${attBar(st.pct)}
    <p class="plan ${pl.ok ? '' : 'bad'}">${pl.text}</p>
    <footer>${marksLine}</footer></article>`;
}

function ovStudent() {
  const s = me(), o = overall(s.id);
  const below = CODES.filter((c) => { const p = attStats(s.id, c).pct; return p != null && p < LIMIT; });
  const msg = o.t === 0 ? 'No lectures have been recorded yet.'
    : below.length ? `You are below ${LIMIT}% in ${below.join(', ')}. The cards below show how to recover.`
      : `Every subject is at or above ${LIMIT}%. Keep it up.`;
  const pub = CODES.filter((c) => db.published[c]).length;
  return (db.profiles[s.id] ? '' : `<div class="callout"><b>Set up your profile.</b> Add your details once so your record is complete. <button class="btn" data-act="goto" data-tab="profile">Open profile</button></div>`)
    + heroHTML({ name: s.name.split(' ')[0], msg, nx: upNext(), pct: o.pct, label: 'Overall attendance' })
    + stat([[o.pct == null ? 'n/a' : o.pct + '%', 'Overall attendance', o.pct != null && o.pct < LIMIT],
      [`${o.p}/${o.t}`, 'Lectures attended'], [below.length, `Subjects below ${LIMIT}%`, below.length > 0],
      [`${pub}/${CODES.length}`, 'Subjects with marks out']])
    + `<div class="sub-grid">${CODES.map((c) => subCardStudent(s.id, c)).join('')}</div>`
    + scheduleHTML();
}

function todayOwnHTML(c) {
  const day = DOW[new Date().getDay()], today = iso(new Date());
  const list = (TT[day] || []).filter((e) => e.code === c);
  if (!list.length || today < CLASS_START) return `<p class="empty">You have no ${c} lectures today.</p>`;
  return `<ul class="risk">${list.map((e) => {
    const key = `${c}|${today}|${e.p}`, done = !!db.att[key], [a, b] = slotTime(e);
    return `<li><strong>Period ${PERIODS[e.p - 1][0]}</strong><span>${a} to ${b}</span>
      <button class="btn ${done ? '' : 'primary'} push" data-act="take" data-key="${key}">${done ? 'Edit' : 'Take attendance'}</button></li>`;
  }).join('')}</ul>`;
}

function ovTeacher() {
  const c = user.code, sub = SUBJECTS[c];
  const rows = db.students.map((s) => ({ s, ...attStats(s.id, c) })).filter((r) => r.pct != null);
  const avg = avgOf(rows.map((r) => r.pct));
  const low = rows.filter((r) => r.pct < LIMIT).sort((a, b) => a.pct - b.pct);
  const pend = pending(c).slice().reverse();
  const parts = user.name.split(' ');
  const msg = pend.length ? `${pend.length} ${pend.length === 1 ? 'lecture is' : 'lectures are'} waiting for attendance in ${c}.`
    : `Attendance for ${c} is up to date.`;
  const ms = markStatus(c);
  const marksNote = ms === 'pending' ? 'The exam has not been conducted, so no marks are entered.'
    : ms === 'draft' ? 'Marks are saved as a draft. Students cannot see them yet.' : 'Marks are visible to students.';
  return heroHTML({ name: parts[0] + ' ' + parts[parts.length - 1], msg: `${msg} ${esc(sub.name)}.`,
    nx: upNext((e) => e.code === c), pct: avg, label: `${c} class attendance` })
    + stat([[db.students.length, 'Students'], [avg == null ? 'n/a' : avg + '%', 'Class attendance'],
      [low.length, `Below ${LIMIT}%`, low.length > 0], [`${held(c).length}/${sessionsFor(c).length}`, 'Lectures recorded']])
    + `<div class="grid2">
      <div class="box"><h2>Your ${c} lectures today</h2>${todayOwnHTML(c)}</div>
      <div class="box"><h2>Waiting for attendance</h2>${pend.length ? `<ul class="risk">${pend.slice(0, 6).map((x) =>
        `<li><strong>${fmtDate(x.date)}</strong><span>Period ${PERIODS[x.p - 1][0]}, ${x.time[0]}</span>
        <button class="btn push" data-act="take" data-key="${x.key}">Record</button></li>`).join('')}</ul>`
        : '<p class="empty">Nothing is pending. Every scheduled lecture has attendance.</p>'}</div></div>`
    + `<div class="grid2">
      <div class="box"><h2>Attendance by student</h2><p class="note">The dashed line marks the ${LIMIT}% minimum.</p>
        ${rows.length ? [...rows].sort((a, b) => b.pct - a.pct).map((r) => `<div class="bar-row">
          <span class="name" title="${esc(r.s.name)}">${esc(r.s.name)}</span>${attBar(r.pct)}<span class="val">${r.pct}%</span></div>`).join('')
          : '<p class="empty">No attendance has been recorded yet.</p>'}</div>
      <div class="stack">
        <div class="box"><h2>Needs attention</h2><ul class="risk">${low.map((r) =>
          `<li>${av(r.s.name)}<strong>${esc(r.s.name)}</strong><span>${r.pct}%, ${r.p} of ${r.t}</span></li>`).join('')
          || '<li class="empty">Every student is at or above the minimum.</li>'}</ul></div>
        <div class="box"><h2>${c} marks</h2><p>${statusPill(ms)}</p><p class="note">${marksNote}</p>
          <button class="btn" data-act="goto" data-tab="marks">Open marks</button></div>
      </div></div>`
    + scheduleHTML((e) => e.code === c);
}

function ovMentor() {
  const rows = db.students.map((s) => ({ s, o: overall(s.id), r: CODES.map((c) => ({ c, ...attStats(s.id, c) })) }));
  const avg = avgOf(rows.map((x) => x.o.pct).filter((x) => x != null));
  const risk = rows.filter((x) => x.r.some((y) => y.pct != null && y.pct < LIMIT));
  const pub = CODES.filter((c) => db.published[c]).length;
  const totalPending = CODES.reduce((n, c) => n + pending(c).length, 0);
  const msg = risk.length ? `${risk.length} ${risk.length === 1 ? 'student is' : 'students are'} below ${LIMIT}% in at least one subject.`
    : `Every student is at or above ${LIMIT}% in all subjects.`;
  return heroHTML({ name: 'Prof. Kudopa', msg, nx: upNext(), pct: avg, label: 'Class attendance' })
    + stat([[db.students.length, 'Students in Section B'], [avg == null ? 'n/a' : avg + '%', 'Average attendance'],
      [risk.length, `Below ${LIMIT}% in a subject`, risk.length > 0], [`${pub}/${CODES.length}`, 'Subjects with marks out']])
    + `<div class="sub-grid">${CODES.map((c) => {
      const t = teacherOf(c), a = classAtt(c), ms = markStatus(c);
      return `<article class="sub-card" style="--h:${SUBJECTS[c].hue}">
        <header>${chip(c)}${pill(a)}</header><h3>${SUBJECTS[c].name}</h3>
        <p class="who">${esc(t.name)}, <a href="tel:${t.phone}">${t.phone}</a></p>${attBar(a)}
        <p class="meta">${held(c).length} lectures held, ${pending(c).length} waiting for attendance</p>
        <footer>${statusPill(ms)}</footer></article>`;
    }).join('')}</div>`
    + `<div class="box"><h2>Attendance by subject</h2>
      <p class="note">Select a student for the complete record.${totalPending ? ` ${totalPending} lectures are still waiting for attendance.` : ''}</p>
      <div class="scroll"><table class="mat"><thead><tr><th>Student</th>${CODES.map((c) => `<th class="num">${c}</th>`).join('')}<th class="num">Overall</th></tr></thead>
      <tbody>${rows.map((x) => `<tr><td><button class="who-btn" data-act="open" data-sid="${x.s.id}">${whoCell(x.s)}</button></td>
        ${x.r.map((y) => `<td class="num">${pill(y.pct)}</td>`).join('')}<td class="num">${pill(x.o.pct)}</td></tr>`).join('')}</tbody></table></div></div>`
    + `<div class="grid2"><div class="box"><h2>Needs attention</h2><ul class="risk">${risk.map((x) =>
      `<li>${av(x.s.name)}<strong>${esc(x.s.name)}</strong><span>${x.r.filter((y) => y.pct != null && y.pct < LIMIT)
        .map((y) => `${y.c} ${y.pct}%`).join(', ')}</span></li>`).join('')
      || '<li class="empty">Nobody is below the minimum.</li>'}</ul></div>${scheduleHTML()}</div>`;
}

/* ================= Attendance ================= */
function renderAttendance() {
  if (!user) return;
  $('#attBody').innerHTML = isStudent() ? attStudent() : isTeacher() ? attTeacher() : attMentor();
}

function attStudent() {
  const s = me();
  return myTodayHTML(s) + CODES.map((c) => {
    const st = attStats(s.id, c);
    const chips = held(c).filter((x) => s.id in db.att[x.key]).map((x) => {
      const v = db.att[x.key][s.id];
      return `<span class="sess ${v ? 'p' : 'a'}" title="Period ${PERIODS[x.p - 1][0]}, ${x.time[0]}">${fmtDate(x.date)}<small>${PERIODS[x.p - 1][0]}</small><b>${v ? 'P' : 'A'}</b></span>`;
    }).join('');
    return `<div class="box" style="--h:${SUBJECTS[c].hue}"><div class="toolbar"><h2>${chip(c)} ${SUBJECTS[c].name}</h2>${pill(st.pct)}</div>
      <p class="note">${st.p} of ${st.t} lectures attended. Taken by ${esc(teacherOf(c).name)}. Only your subject teacher can change this.</p>
      <div class="sess-list">${chips || '<p class="empty">No lectures recorded yet.</p>'}</div></div>`;
  }).join('');
}

function selectSession(key) {
  const rec = db.att[key] || {}, v = {};
  db.students.forEach((s) => { v[s.id] = s.id in rec ? rec[s.id] : 1; });
  draft = { key, v, isNew: !db.att[key] };
}

function rosterHTML() {
  const [c, date, p] = draft.key.split('|'), per = PERIODS[p - 1];
  const pres = db.students.filter((s) => draft.v[s.id] === 1).length;
  const list = filtered();
  return `<div class="ros-head"><div><h3>${c}, ${fmtDate(date)}</h3>
      <p class="note">Period ${per[0]}, ${per[1]} to ${per[2]}. ${draft.isNew ? 'Not recorded yet.' : 'Already recorded. You are editing it.'}</p></div>
    <div class="ros-tools"><span class="count"><b>${pres}</b> present, <b>${db.students.length - pres}</b> absent</span>
      <button class="btn" data-act="markall" data-v="1">All present</button><button class="btn" data-act="markall" data-v="0">All absent</button></div></div>
    <ul class="ros">${list.map((s) => `<li class="ros-row">${whoCell(s)}
      <span class="seg" role="group" aria-label="${esc(s.name)}">
        <button data-act="mark" data-sid="${s.id}" data-v="1" class="${draft.v[s.id] === 1 ? 'on p' : ''}" aria-pressed="${draft.v[s.id] === 1}">Present</button>
        <button data-act="mark" data-sid="${s.id}" data-v="0" class="${draft.v[s.id] === 0 ? 'on a' : ''}" aria-pressed="${draft.v[s.id] === 0}">Absent</button></span></li>`).join('')
      || '<li class="empty">No students match your search.</li>'}</ul>
    <div class="ros-foot"><button class="btn primary" data-act="saveatt">${draft.isNew ? 'Save attendance' : 'Update attendance'}</button></div>`;
}

function registerHTML(c, editable) {
  const cols = held(c), list = filtered();
  if (!cols.length) return '<p class="empty">No lectures recorded yet.</p>';
  const head = `<tr><th>Student</th>${cols.map((x) => {
    const lbl = `${fmtDay(x.date)}<small>${PERIODS[x.p - 1][0]}</small>`;
    return `<th class="num">${editable ? `<button class="day" data-act="pick" data-key="${x.key}" title="Open this lecture above">${lbl}</button>` : `<span class="day">${lbl}</span>`}</th>`;
  }).join('')}<th class="num">Present</th><th class="pct">%</th></tr>`;
  const body = list.map((s) => {
    const st = attStats(s.id, c);
    return `<tr data-sid="${s.id}"><td>${whoCell(s)}</td>${cols.map((x) => {
      const r = db.att[x.key];
      if (!(s.id in r)) return '<td class="num"><span class="cell na">-</span></td>';
      const v = r[s.id];
      return editable
        ? `<td class="num"><button class="cell ${v ? 'p' : 'a'}" data-act="cell" data-key="${x.key}" data-sid="${s.id}" aria-label="${esc(s.name)} ${fmtDate(x.date)}: ${v ? 'present' : 'absent'}">${v ? 'P' : 'A'}</button></td>`
        : `<td class="num"><span class="cell ${v ? 'p' : 'a'}">${v ? 'P' : 'A'}</span></td>`;
    }).join('')}<td class="num cnt">${st.p}/${st.t}</td><td class="pct ${st.pct != null && st.pct < LIMIT ? 'low' : ''}">${st.pct == null ? 'n/a' : st.pct + '%'}</td></tr>`;
  }).join('');
  const foot = `<tr class="foot"><td>Present in class</td>${cols.map((x) =>
    `<td class="num" data-foot="${x.key}">${Object.values(db.att[x.key]).filter((v) => v === 1).length}</td>`).join('')}<td></td><td></td></tr>`;
  return `<div class="scroll"><table class="reg"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${cols.length + 3}" class="empty">No students match your search.</td></tr>`}</tbody><tfoot>${foot}</tfoot></table></div>`;
}

function attTeacher() {
  const c = user.code, sess = sessionsFor(c).slice().reverse();
  if (!sess.length) return `<div class="box"><h2>Take attendance</h2><p class="empty">Classes begin on ${fmtDate(CLASS_START)}. Lectures of ${c} appear here from that day.</p></div>`;
  if (!draft || !draft.key.startsWith(c + '|') || !sess.some((x) => x.key === draft.key)) {
    selectSession((sess.find((x) => !db.att[x.key]) || sess[0]).key);
  }
  return `<div class="box" style="--h:${SUBJECTS[c].hue}"><h2>${chip(c)} Take attendance</h2>
    <p class="note">Choose a lecture, mark each student, then save. You can only record attendance for ${c}.</p>
    <div class="sess-picker">${sess.map((x) => {
      const done = !!db.att[x.key];
      return `<button class="pick ${draft.key === x.key ? 'sel' : ''} ${done ? 'done' : 'pend'}" data-act="pick" data-key="${x.key}">
        ${fmtDate(x.date)}<small>Period ${PERIODS[x.p - 1][0]}, ${x.time[0]}</small><i>${done ? 'Recorded' : 'Pending'}</i></button>`;
    }).join('')}</div><div id="roster">${rosterHTML()}</div></div>
    <div class="box" style="--h:${SUBJECTS[c].hue}"><h2>${c} register</h2>
    <p class="note">Select a P or A to correct it. Select a date to open that lecture above.</p>${registerHTML(c, true)}</div>`;
}

function attMentor() {
  const seg = `<div class="seg-tabs" role="group" aria-label="Subject">${['all', ...CODES].map((v) =>
    `<button class="${mentorAttView === v ? 'on' : ''}" data-act="mview" data-v="${v}">${v === 'all' ? 'All subjects' : v}</button>`).join('')}</div>`;
  if (mentorAttView === 'all') {
    return `<div class="box"><div class="toolbar"><h2>Attendance by subject</h2>${seg}</div>
      <p class="note">Lectures attended out of lectures held. Each subject is recorded by its own teacher.</p>
      <div class="scroll"><table class="mat"><thead><tr><th>Student</th>${CODES.map((c) => `<th class="num">${c}<small>${esc(teacherOf(c).name)}</small></th>`).join('')}<th class="num">Overall</th></tr></thead>
      <tbody>${filtered().map((s) => `<tr><td><button class="who-btn" data-act="open" data-sid="${s.id}">${whoCell(s)}</button></td>
        ${CODES.map((c) => { const a = attStats(s.id, c); return `<td class="num">${pill(a.pct)}<small class="frac">${a.p}/${a.t}</small></td>`; }).join('')}
        <td class="num">${pill(overall(s.id).pct)}</td></tr>`).join('') || `<tr><td colspan="${CODES.length + 2}" class="empty">No students match your search.</td></tr>`}</tbody></table></div></div>`;
  }
  const c = mentorAttView;
  return `<div class="box" style="--h:${SUBJECTS[c].hue}"><div class="toolbar"><h2>${chip(c)} ${SUBJECTS[c].name}</h2>${seg}</div>
    <p class="note">Taken by ${esc(teacherOf(c).name)}. ${held(c).length} lectures recorded, ${pending(c).length} waiting. You can view this register but only the subject teacher can change it.</p>
    ${registerHTML(c, false)}</div>`;
}

/* ================= Marks ================= */
function renderMarks() {
  if (!user) return;
  $('#mkBody').innerHTML = isStudent() ? mkStudent() : isTeacher() ? mkTeacher() : mkMentor();
}

const gradeHTML = (v) => typeof v === 'number' ? `<span class="grade ${grade(v)}">${grade(v)}</span>` : '<span class="muted">-</span>';

function mkStudent() {
  const s = me(), anyPub = CODES.some((c) => db.published[c]);
  const cards = CODES.map((c) => {
    const pub = db.published[c], v = db.marks[c][s.id], list = marksOf(c);
    let body;
    if (pub && typeof v === 'number') {
      body = `<div class="big">${v}<small>out of ${MAX}</small></div>${bar(v, 'subj', avgOf(list))}
        <p class="note">Grade <b>${grade(v)}</b>. The dashed line is the class average, ${avgOf(list)}.</p>`;
    } else if (pub) {
      body = '<p class="empty">No mark was recorded for you in this subject.</p>';
    } else {
      body = `<div class="locked"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        <b>Not available yet</b><span>Marks appear here after the exam is conducted and your teacher publishes them.</span></div>`;
    }
    return `<article class="sub-card" style="--h:${SUBJECTS[c].hue}"><header>${chip(c)}<span class="pill ${pub ? 'good' : 'none'}">${pub ? 'Published' : 'Not out'}</span></header>
      <h3>${SUBJECTS[c].name}</h3><p class="who">${esc(teacherOf(c).name)}</p>${body}</article>`;
  }).join('');
  return `${anyPub ? '' : '<div class="callout"><b>Exams have not been conducted yet.</b> Your marks will show here once each exam is held and published.</div>'}
    <div class="sub-grid">${cards}</div>`;
}

function mkTopHTML(c) {
  const st = markStatus(c), n = marksOf(c).length;
  const text = { pending: 'The exam has not been conducted, so no marks are entered. Students cannot see marks for this subject.',
    draft: 'Marks are saved as a draft. Students cannot see them until you publish.',
    published: 'Marks are visible to students. Any change you make is shown to them straight away.' }[st];
  return `<div class="toolbar"><div><h2>${chip(c)} Marks (out of ${MAX})</h2><p>${statusPill(st)}</p></div>
    <div class="actions"><label class="btn">Upload CSV<input id="csvInput" type="file" accept=".csv,text/csv" hidden></label>
    ${st === 'published' ? '<button class="btn" data-act="unpublish">Hide from students</button>'
      : `<button class="btn primary" data-act="publish" ${n ? '' : 'disabled'}>Publish to students</button>`}
    <button class="btn" data-act="clearmarks" ${n ? '' : 'disabled'}>Clear all marks</button></div></div>
    <p class="note">${text} Upload a CSV with the columns roll, marks. <span id="importMsg"></span></p>`;
}
function mkSumHTML(c) {
  const l = marksOf(c);
  if (!l.length) return '';
  return `<div class="mini-stats"><span><b>${l.length}/${db.students.length}</b> entered</span><span><b>${avgOf(l)}</b> average</span>
    <span><b>${Math.max(...l)}</b> highest</span><span><b>${Math.min(...l)}</b> lowest</span><span><b>${l.filter((v) => v >= 40).length}</b> passed</span></div>`;
}
function mkTeacher() {
  const c = user.code;
  return `<div class="box" style="--h:${SUBJECTS[c].hue}"><div id="mkTop">${mkTopHTML(c)}</div><div id="mkSum">${mkSumHTML(c)}</div>
    <div class="scroll"><table class="grid"><thead><tr><th>Student</th><th class="num">Marks</th><th class="num">Grade</th></tr></thead>
    <tbody>${filtered().map((s) => { const v = db.marks[c][s.id];
      return `<tr data-sid="${s.id}"><td>${whoCell(s)}</td><td class="num"><input class="mk-input" type="number" min="0" max="${MAX}" inputmode="numeric" placeholder="-" value="${typeof v === 'number' ? v : ''}" aria-label="${esc(s.name)} marks"></td><td class="num mk-grade">${gradeHTML(v)}</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="empty">No students match your search.</td></tr>'}</tbody></table></div></div>`;
}

function mkMentor() {
  const cards = CODES.map((c) => {
    const l = marksOf(c), st = markStatus(c);
    return `<article class="sub-card" style="--h:${SUBJECTS[c].hue}"><header>${chip(c)}${statusPill(st)}</header>
      <h3>${SUBJECTS[c].name}</h3><p class="who">${esc(teacherOf(c).name)}</p>
      <p class="meta">${l.length ? `${l.length}/${db.students.length} entered, average ${avgOf(l)}, highest ${Math.max(...l)}` : 'No marks entered yet'}</p></article>`;
  }).join('');
  return `<div class="sub-grid">${cards}</div><div class="box"><h2>Marks by student</h2>
    <p class="note">You see everything, including draft marks that students cannot see yet (shown in italics).</p>
    <div class="scroll"><table class="mat"><thead><tr><th>Student</th>${CODES.map((c) => `<th class="num">${c}</th>`).join('')}<th class="num">Average</th></tr></thead>
    <tbody>${filtered().map((s) => { const vals = CODES.map((c) => db.marks[c][s.id]).filter((v) => typeof v === 'number');
      return `<tr><td><button class="who-btn" data-act="open" data-sid="${s.id}">${whoCell(s)}</button></td>${CODES.map((c) => {
        const v = db.marks[c][s.id];
        return `<td class="num ${db.published[c] ? '' : 'draft'}">${typeof v === 'number' ? v : '-'}</td>`;
      }).join('')}<td class="num">${vals.length ? avgOf(vals) : '-'}</td></tr>`;
    }).join('') || `<tr><td colspan="${CODES.length + 2}" class="empty">No students match your search.</td></tr>`}</tbody></table></div></div>`;
}

/* ================= Students (mentor) ================= */
function renderStudents() {
  if (isTeacher()) return renderRoster();
  if (!isMentor()) return;
  $('#stBody').innerHTML = `<div class="box"><div class="toolbar"><h2>Section B students</h2>
    <form id="addForm" class="add"><input id="newName" placeholder="Student name" required aria-label="Student name">
      <input id="newRoll" placeholder="Roll no." required aria-label="Roll number">
      <select id="newBatch" aria-label="Lab batch"><option value="I">Lab Batch I</option><option value="II">Lab Batch II</option></select>
      <button type="submit" class="btn primary">Add student</button></form></div>
    <p class="note">New students sign in with their roll number and the password roll no.@123 in lower case.</p>
    <div class="scroll"><table class="mat"><thead><tr><th>Student</th><th class="num">Attendance</th><th>Below ${LIMIT}% in</th><th class="num">Marks average</th></tr></thead>
    <tbody>${filtered().map((s) => {
      const o = overall(s.id), lows = CODES.filter((c) => { const p = attStats(s.id, c).pct; return p != null && p < LIMIT; });
      const vals = CODES.map((c) => db.marks[c][s.id]).filter((v) => typeof v === 'number');
      return `<tr><td><button class="who-btn" data-act="open" data-sid="${s.id}">${whoCell(s)}</button></td><td class="num">${pill(o.pct)}</td>
        <td>${lows.map(chip).join(' ') || '<span class="muted">None</span>'}</td><td class="num">${vals.length ? avgOf(vals) : '-'}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty">No students match your search.</td></tr>'}</tbody></table></div>
    <button class="btn" data-act="reset">Reset to demo data</button></div>`;
}

function openStudent(sid) {
  const s = db.students.find((x) => x.id === sid);
  if (!s) return;
  const o = overall(sid);
  const blocks = CODES.map((c) => {
    const st = attStats(sid, c), pl = plan(st.p, st.t), v = db.marks[c][sid], ms = markStatus(c);
    const chips = held(c).filter((x) => sid in db.att[x.key]).map((x) => {
      const on = db.att[x.key][sid];
      return `<span class="sess sm ${on ? 'p' : 'a'}" title="${fmtDate(x.date)}, period ${PERIODS[x.p - 1][0]}">${on ? 'P' : 'A'}</span>`;
    }).join('');
    return `<div class="dlg-sub" style="--h:${SUBJECTS[c].hue}"><div class="toolbar"><h3>${chip(c)} ${SUBJECTS[c].name}</h3>${pill(st.pct)}</div>
      <p class="note">${esc(teacherOf(c).name)}. ${st.p} of ${st.t} lectures attended.</p>${attBar(st.pct)}
      <p class="plan ${pl.ok ? '' : 'bad'}">${pl.text.replace('You can', 'Can').replace('You are', 'Is')}</p>
      <div class="sess-list tight">${chips || '<span class="muted">No lectures recorded.</span>'}</div>
      <p class="marks-line">Marks: ${typeof v === 'number' ? `<b>${v}</b> out of ${MAX}${ms === 'published' ? '' : ' <span class="pill edge">draft, hidden from student</span>'}` : '<span class="muted">not entered</span>'}</p></div>`;
  }).join('');
  $('#stuBody').innerHTML = `<div class="dlg-head">${av(s.name, 'lg')}<div><h2>${esc(s.name)}</h2>
    <p class="note">${esc(s.roll)}, Lab Batch ${s.batch}</p></div>${ring(o.pct)}</div>
    <div class="dlg-sub"><h3>Profile</h3>${profileSummary(s.id)}</div>${blocks}<div class="dlg-foot"><button class="btn danger" data-act="removestu" data-sid="${s.id}">Remove student</button><button class="btn" data-act="editprofile" data-sid="${s.id}">Edit profile</button>
    <button class="btn primary" data-act="closedlg">Close</button></div>`;
  const dlg = $('#stuDialog');
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}

/* ================= Timetable ================= */
function renderTimetable() {
  if (!user) return;
  const now = new Date(), today = DOW[now.getDay()], m = now.getHours() * 60 + now.getMinutes();
  const isNow = (d, e) => d === today && m >= toMin(slotTime(e)[0]) && m < toMin(slotTime(e)[1]);
  const mine = (e) => isTeacher() && e.code === user.code;
  const inner = (e) => e.kind === 'theory' ? `<b>${e.code}</b><span>${SUBJECTS[e.code].short}</span>`
    : e.kind === 'lab' ? `<b>${e.label}</b><span>Lab</span>` : e.kind === 'tp' ? '<b>T&amp;P</b><span>Training and Placement</span>'
      : `<b>${e.label}</b>`;
  const days = Object.keys(TT);
  const rows = days.map((d, i) => `<tr class="${d === today ? 'today' : ''}"><th scope="row">${FULL[d]}</th>${TT[d].map((e) => {
    if (e.kind === 'lunch') return i === 0 ? `<td class="tt lunch" rowspan="${days.length}"><span>Lunch</span></td>` : '';
    return `<td colspan="${e.n}" class="tt ${e.kind}${isNow(d, e) ? ' now' : ''}${mine(e) ? ' mine' : ''}" ${e.code ? `style="--h:${SUBJECTS[e.code].hue}"` : ''}>${inner(e)}</td>`;
  }).join('')}</tr>`).join('');
  const cards = days.map((d) => `<div class="day-card ${d === today ? 'today' : ''}"><h3>${FULL[d]}${d === today ? ' (today)' : ''}</h3>
    ${TT[d].map((e) => { const [a, b] = slotTime(e);
      return `<div class="slot ${e.kind}${isNow(d, e) ? ' now' : ''}${mine(e) ? ' mine' : ''}" ${e.code ? `style="--h:${SUBJECTS[e.code].hue}"` : ''}>
        <b>${esc(e.kind === 'theory' ? e.code + ' ' + SUBJECTS[e.code].short : e.label)}</b><span>${a} to ${b}</span></div>`; }).join('')}</div>`).join('');
  $('#ttBody').innerHTML = `<div class="box"><h2>Weekly timetable</h2>
    <div class="tt-meta"><span>Branch: CSE-Cyber Security</span><span>Section B</span><span>B.Tech V Sem</span><span>Session July to December 2026</span>
      <span>Room S-06, Jagdish Chandra Bose Block</span><span>Classes from 07/09/2026</span></div>
    <p class="note">Attendance and marks are kept for CY501 to CY504. Labs, T&amp;P and mentor periods are shown for reference. Lab Batch I is roll numbers 84 to 124, Batch II is 125 to 161.${isTeacher() ? ` Your ${user.code} periods are outlined.` : ''}</p>
    <div class="tt-wrap scroll"><table class="tt-table"><thead><tr><th>Day</th>${PERIODS.map((p) => `<th>${p[0]}<small>${p[1]} to ${p[2]}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="tt-days">${cards}</div></div>
    <div class="box"><h2>Subjects and faculty</h2><div class="scroll"><table class="mat"><thead><tr><th>Code</th><th>Subject</th><th>Faculty</th><th>Lab room</th></tr></thead>
    <tbody>${COURSES.map((c) => `<tr><td>${SUBJECTS[c[0]] ? chip(c[0]) : `<b>${c[0]}</b>`}</td><td>${esc(c[1])}</td><td>${esc(c[2])}</td>
      <td>${c[4] ? c[4] + ' Sir Vishvesariya Block' : '-'}</td></tr>`).join('')}
      <tr><td><b>Mentor</b></td><td>Mentor / Library</td><td>${MENTOR.name}</td><td>-</td></tr></tbody></table></div>
    <p class="note">Prepared by Prof. Monika Kudopa and Dr. Khushbu Rai, Time Table Coordinators. Approved by Dr. Bhupesh Gour, HOD, C.S. Dept. Issued by Dr. V N Bartaria, Principal.</p></div>`;
}

/* ================= Profile ================= */
const PF = [['phone', 'Mobile number', 'tel', 1], ['email', 'Email', 'email', 0], ['dob', 'Date of birth', 'date', 1],
  ['guardian', 'Parent / guardian name', 'text', 0], ['guardianPhone', "Guardian's mobile", 'tel', 0], ['address', 'Home address', 'text', 0]];
function profileFormHTML(s) {
  const p = db.profiles[s.id] || {};
  return `<form id="profileForm" class="pf" data-sid="${s.id}">
    <label class="field">Name<input value="${esc(s.name)}" disabled></label>
    <label class="field">Roll number<input value="${esc(s.roll)}" disabled></label>
    ${PF.map(([k, l, t, req]) => `<label class="field">${l}${req ? ' *' : ''}<input name="${k}" type="${t}" value="${esc(p[k] || '')}" ${req ? 'required' : ''}
      ${t === 'tel' ? 'pattern="[0-9]{10}" inputmode="numeric" maxlength="10" title="10 digit number"' : ''} ${t === 'date' ? `max="${iso(new Date())}"` : ''}></label>`).join('')}
    <div class="pf-foot"><button class="btn primary" type="submit">${p.at ? 'Save changes' : 'Save profile'}</button>
    ${p.at ? `<span class="note">Last updated by ${esc(p.by)} on ${new Date(p.at).toLocaleDateString('en-IN')}</span>` : ''}</div></form>`;
}
function renderProfile() {
  if (!isStudent()) return;
  const s = me(), first = !db.profiles[s.id];
  $('#pfBody').innerHTML = `<div class="box"><h2>${first ? 'Set up your profile' : 'My profile'}</h2>
    <p class="note">${first ? 'Welcome. Add your details once to get started. ' : ''}Your subject teachers and mentor can add or correct these details later. Fields marked * are required.</p>${profileFormHTML(s)}</div>`;
}
function profileSummary(sid) {
  const p = db.profiles[sid];
  if (!p) return '<p class="note">Profile not filled in yet.</p>';
  return `<p class="note">${PF.filter(([k]) => p[k]).map(([k, l]) => `${l}: <b>${esc(p[k])}</b>`).join(' · ')}</p>`;
}
function openProfile(sid) {
  const s = db.students.find((x) => x.id === sid);
  if (!s || isStudent()) return;
  $('#stuBody').innerHTML = `<div class="dlg-head">${av(s.name, 'lg')}<div><h2>${esc(s.name)}</h2><p class="note">${esc(s.roll)}, profile details</p></div></div>
    ${profileFormHTML(s)}<div class="dlg-foot"><span></span><button class="btn" data-act="closedlg">Cancel</button></div>`;
  const d = $('#stuDialog');
  if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
}
function renderRoster() {                 // teacher view of the Students tab
  $('#stBody').innerHTML = `<div class="box"><h2>Section B students</h2>
    <p class="note">Add or correct a student's profile details. Attendance and marks stay with each subject teacher.</p>
    <div class="scroll"><table class="mat"><thead><tr><th>Student</th><th>Profile</th><th></th></tr></thead><tbody>${filtered().map((s) =>
      `<tr><td>${whoCell(s)}</td><td>${db.profiles[s.id] ? '<span class="pill good">Filled</span>' : '<span class="pill none">Not yet</span>'}</td>
      <td class="num"><button class="btn" data-act="editprofile" data-sid="${s.id}">Edit profile</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="empty">No students match your search.</td></tr>'}</tbody></table></div></div>`;
}

/* ================= Student's own attendance log (today only, locked once saved) ================= */
function myTodayHTML(s) {
  const t = iso(new Date()), log = db.myatt[s.id] || {}, now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const list = CODES.flatMap((c) => sessionsFor(c).filter((x) => x.date === t)).sort((a, b) => a.p - b.p);
  const rows = list.map((x) => {
    const mine = log[x.key], off = db.att[x.key] && s.id in db.att[x.key] ? db.att[x.key][s.id] : null;
    const ctl = mine ? `<span class="pill ${mine.v ? 'good' : 'low'}">${mine.v ? 'Present' : 'Absent'}, locked</span>`
      : m >= toMin(x.time[0]) ? `<span class="seg"><button data-act="myatt" data-key="${x.key}" data-v="1">Present</button><button data-act="myatt" data-key="${x.key}" data-v="0">Absent</button></span>`
        : '<span class="muted">Not started yet</span>';
    const diff = mine && off != null && off !== mine.v ? ` (register says ${off ? 'present' : 'absent'})` : '';
    return `<li>${chip(x.code)}<strong>Period ${PERIODS[x.p - 1][0]}</strong><span>${x.time[0]} to ${x.time[1]}${diff}</span><span class="push">${ctl}</span></li>`;
  }).join('');
  const all = Object.values(log), pr = all.filter((v) => v.v).length;
  return `<div class="box"><h2>My attendance today</h2>
    <p class="note">Mark yourself for each lecture that has started. Once you choose, it is locked and cannot be changed. This is your own private log and does not alter the teacher's register. So far: ${pr} present, ${all.length - pr} absent.</p>
    ${rows ? `<ul class="risk">${rows}</ul>` : '<p class="empty">No lectures scheduled today.</p>'}</div>`;
}

/* ================= Attendance calculator ================= */
function renderCalculator() {
  if (!user) return;
  const fill = isStudent() ? `<label class="field">Fill from my record<select id="calFill"><option value="">Enter my own numbers</option><option value="all">All subjects together</option>${CODES.map((c) => `<option value="${c}">${c} ${SUBJECTS[c].short}</option>`).join('')}</select></label>` : '';
  const num = (n, l, extra) => `<label class="field">${l}<input name="${n}" type="number" inputmode="numeric" ${extra}></label>`;
  $('#calBody').innerHTML = `<div class="grid2"><div class="box"><h2>Attendance calculator</h2>
    <p class="note">Find how many classes you can skip, or must attend, to meet your target.</p>
    <form id="calForm" novalidate>${fill}${num('total', 'Total classes held', 'min="1" step="1"')}${num('att', 'Classes attended', 'min="0" step="1"')}
    ${num('req', 'Required attendance (%)', `min="1" max="100" step="any" value="${LIMIT}"`)}${num('perDay', 'Classes per day', 'min="1" step="1" value="5"')}
    <button class="btn primary" type="submit">Calculate</button></form></div>
    <div class="box"><h2>Result</h2><div id="calOut"></div></div></div>`;
  calcOut();
}
function calcOut() {
  const f = $('#calForm'), out = $('#calOut');
  if (!f || !out) return;
  const v = ['total', 'att', 'req', 'perDay'].map((n) => f.elements[n].value.trim());
  if (v.some((x) => !x)) { out.innerHTML = '<p class="empty">Fill in all four fields to see the result.</p>'; return; }
  const [total, att, req, per] = v.map(Number);
  if (![total, att, per].every(Number.isInteger) || total < 1 || att < 0 || att > total || per < 1 || !(req > 0 && req <= 100)) {
    out.innerHTML = '<p class="empty">Check the numbers. Classes must be whole numbers, attended cannot exceed total, and the required percentage must be between 1 and 100.</p>'; return;
  }
  const eps = 1e-9, cur = (att * 100) / total, days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const head = `<p>Current attendance <b>${cur.toFixed(2)}%</b>, required <b>${req}%</b>.</p>`;
  if (cur >= req - eps) {                 // can skip: round down
    const n = Math.max(0, Math.floor((att * 100) / req - total + eps)), d = Math.floor(n / per);
    out.innerHTML = `<div class="cal-res"><b class="big">${n}</b><span>${n === 1 ? 'class' : 'classes'} you can skip</span></div>${head}
      <p>${n ? `That is ${days(d)} of full classes at ${per} per day (rounded down). After skipping ${n} you would be at ${((att * 100) / (total + n)).toFixed(2)}%.`
        : 'You are right at the limit. Skipping even one class would take you below the requirement.'}</p>`;
  } else if (req >= 100) {
    out.innerHTML = `<div class="cal-res bad"><span>100% cannot be reached again once a class has been missed.</span></div>${head}`;
  } else {                                // must attend: round up
    const n = Math.ceil((req * total - 100 * att) / (100 - req) - eps), d = Math.ceil(n / per);
    out.innerHTML = `<div class="cal-res bad"><b class="big">${n}</b><span>${n === 1 ? 'class' : 'classes'} to attend in a row</span></div>${head}
      <p>That is about ${days(d)} at ${per} per day (rounded up). After attending ${n} you would be at ${(((att + n) * 100) / (total + n)).toFixed(2)}%.</p>`;
  }
}

/* ================= Tabs ================= */
const PANEL = { overview: renderOverview, attendance: renderAttendance, marks: renderMarks, students: renderStudents, profile: renderProfile, timetable: renderTimetable, calculator: renderCalculator };
function showTab(name) {
  currentTab = name;
  $$('.tab').forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === name));
  $('#pageTitle').textContent = $(`.tab[data-tab="${name}"]`).textContent.trim();
  PANEL[name]();
  window.scrollTo(0, 0);
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
$('#search').addEventListener('input', (e) => { query = e.target.value; PANEL[currentTab](); });

/* ================= Actions (event delegation) ================= */
const ACT = {
  goto: (el) => showTab(el.dataset.tab),
  take: (el) => { selectSession(el.dataset.key); showTab('attendance'); },
  pick: (el) => { selectSession(el.dataset.key); renderAttendance(); window.scrollTo(0, 0); },
  mark: (el) => {
    draft.v[el.dataset.sid] = +el.dataset.v;
    $('#roster').innerHTML = rosterHTML();
    const again = $(`#roster [data-act="mark"][data-sid="${el.dataset.sid}"][data-v="${el.dataset.v}"]`);
    if (again) again.focus();
  },
  markall: (el) => { db.students.forEach((s) => { draft.v[s.id] = +el.dataset.v; }); $('#roster').innerHTML = rosterHTML(); },
  saveatt: () => {
    db.att[draft.key] = { ...draft.v };
    const [c, date, p] = draft.key.split('|');
    sync('PUT', `/attendance/${encodeURIComponent(draft.key)}`, { records: db.att[draft.key] });
    draft.isNew = false; renderAttendance();
    toast(`Attendance saved: ${c}, ${fmtDate(date)}, period ${PERIODS[p - 1][0]}`);
  },
  cell: (el) => {
    const { key, sid } = el.dataset, r = db.att[key];
    if (!r || !(sid in r) || !isTeacher() || !key.startsWith(user.code + '|')) return;
    r[sid] = r[sid] ? 0 : 1; sync('PATCH', `/attendance/${encodeURIComponent(key)}/${sid}`, { v: r[sid] });
    el.className = 'cell ' + (r[sid] ? 'p' : 'a'); el.textContent = r[sid] ? 'P' : 'A';
    const tr = el.closest('tr'), st = attStats(sid, user.code), pc = tr.querySelector('.pct');
    tr.querySelector('.cnt').textContent = `${st.p}/${st.t}`;
    pc.textContent = st.pct + '%'; pc.classList.toggle('low', st.pct < LIMIT);
    const foot = $(`[data-foot="${key}"]`);
    if (foot) foot.textContent = Object.values(r).filter((v) => v === 1).length;
    if (draft && draft.key === key) { draft.v[sid] = r[sid]; $('#roster').innerHTML = rosterHTML(); }
  },
  mview: (el) => { mentorAttView = el.dataset.v; renderAttendance(); },
  publish: () => {
    const c = user.code, missing = db.students.length - marksOf(c).length;
    if (!confirm(`Publish ${c} marks? Students will be able to see them.${missing ? ` ${missing} student(s) have no mark yet.` : ''}`)) return;
    db.published[c] = true; sync('POST', `/marks/${c}/publish`); renderMarks(); toast(`${c} marks published`);
  },
  unpublish: () => { db.published[user.code] = false; sync('POST', `/marks/${user.code}/unpublish`); renderMarks(); toast(`${user.code} marks hidden from students`); },
  clearmarks: () => {
    const c = user.code;
    if (!confirm(`Clear every ${c} mark? Students will see nothing until you enter and publish again.`)) return;
    db.marks[c] = {}; db.published[c] = false; sync('DELETE', `/marks/${c}`); renderMarks(); toast(`${c} marks cleared`);
  },
  open: (el) => openStudent(el.dataset.sid),
  closedlg: () => $('#stuDialog').close(),
  editprofile: (el) => openProfile(el.dataset.sid),
  myatt: (el) => {                        // student's own log: today only, one save, then locked
    if (!isStudent()) return;
    const key = el.dataset.key, v = +el.dataset.v === 1 ? 1 : 0, [c, date, p] = key.split('|');
    const x = CODES.includes(c) && sessionsFor(c).find((y) => y.key === key), now = new Date();
    const log = (db.myatt[user.id] = db.myatt[user.id] || {});
    if (!x || date !== iso(now) || log[key] || now.getHours() * 60 + now.getMinutes() < toMin(x.time[0])) return;
    if (!confirm(`Mark ${c} period ${PERIODS[p - 1][0]} as ${v ? 'present' : 'absent'}? This cannot be changed afterwards.`)) return;
    log[key] = { v, at: Date.now() }; sync('POST', '/myatt', { key, v }); renderAttendance(); toast('Saved and locked');
  },
  removestu: (el) => {
    const s = db.students.find((x) => x.id === el.dataset.sid);
    if (!s || !confirm(`Remove ${s.name} and all of their attendance and marks?`)) return;
    db.students = db.students.filter((x) => x.id !== s.id);
    Object.values(db.att).forEach((r) => { delete r[s.id]; }); delete db.profiles[s.id]; delete db.myatt[s.id];
    CODES.forEach((c) => { delete db.marks[c][s.id]; });
    sync('DELETE', `/students/${s.id}`); $('#stuDialog').close(); renderStudents(); toast(`${s.name} removed`);
  },
  reset: () => {
    if (!confirm('Replace all attendance, marks and students with the demo data?')) return;
    sync('POST', '/reset', undefined, async () => { await refresh(); draft = null; renderStudents(); toast('Demo data restored'); });
  }
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act] && !el.disabled) ACT[el.dataset.act](el);
});
$('#stuDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'addForm' || !isMentor()) return;
  e.preventDefault();
  const name = $('#newName').value.trim(), roll = $('#newRoll').value.trim();
  if (!name || !roll) return;
  if (db.students.some((s) => s.roll.toLowerCase() === roll.toLowerCase())) { toast('That roll number already exists.'); return; }
  api('POST', '/students', { name, roll, batch: $('#newBatch').value })
    .then((s) => { db.students.push(s); renderStudents(); toast(`${name} added`); })
    .catch((err) => toast(err.message));
});

const mkTimer = {};
document.addEventListener('input', (e) => {                 // marks entry (subject teacher)
  const input = e.target.closest('.mk-input');
  if (!input || !isTeacher()) return;
  const c = user.code, tr = input.closest('tr'), sid = tr.dataset.sid, raw = input.value.trim();
  if (raw === '') delete db.marks[c][sid];
  else {
    const v = parseInt(raw, 10);
    if (isNaN(v)) return;
    db.marks[c][sid] = clamp(v, 0, MAX);
    if (String(db.marks[c][sid]) !== raw) input.value = db.marks[c][sid];
  }
  clearTimeout(mkTimer[sid]);
  mkTimer[sid] = setTimeout(() => sync('PUT', `/marks/${c}/${sid}`, { score: typeof db.marks[c][sid] === 'number' ? db.marks[c][sid] : null }), 400);
  tr.querySelector('.mk-grade').innerHTML = gradeHTML(db.marks[c][sid]);
  $('#mkTop').innerHTML = mkTopHTML(c); $('#mkSum').innerHTML = mkSumHTML(c);
});

document.addEventListener('change', (e) => {               // marks CSV (subject teacher)
  if (e.target.id !== 'csvInput' || !isTeacher()) return;
  const file = e.target.files[0], c = user.code;
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let updated = 0, skipped = 0; const rows = [];
    String(reader.result).split(/\r?\n/).forEach((line) => {
      const cells = line.split(',').map((x) => x.trim());
      if (cells.length < 2 || !cells[0] || cells[0].toLowerCase().startsWith('roll')) return;
      const s = db.students.find((x) => x.roll.toLowerCase() === cells[0].toLowerCase());
      const v = parseInt(cells[1], 10);
      if (!s || isNaN(v)) { skipped++; return; }
      db.marks[c][s.id] = clamp(v, 0, MAX); rows.push({ roll: s.roll, score: db.marks[c][s.id] }); updated++;
    });
    sync('POST', `/marks/${c}/bulk`, { rows }); renderMarks();
    $('#importMsg').textContent = `Updated ${updated} student(s)` + (skipped ? `, skipped ${skipped} row(s) with an unknown roll number or invalid mark.` : '.');
  };
  reader.readAsText(file);
});

document.addEventListener('submit', (e) => {                // profile and calculator forms
  if (!user) return;
  if (e.target.id === 'calForm') { e.preventDefault(); calcOut(); return; }
  if (e.target.id !== 'profileForm') return;
  e.preventDefault();
  const sid = isStudent() ? user.id : e.target.dataset.sid;
  if (!db.students.some((s) => s.id === sid)) return;
  const p = {};
  PF.forEach(([k]) => { p[k] = e.target.elements[k].value.trim(); });
  api('PUT', `/profiles/${sid}`, p).then((saved) => {
    db.profiles[sid] = saved;
    if (isStudent()) { renderProfile(); toast('Profile saved'); }
    else { $('#stuDialog').close(); PANEL[currentTab](); toast('Profile updated'); }
  }).catch((err) => toast(err.message));
});
document.addEventListener('input', (e) => { if (e.target.closest('#calForm')) calcOut(); });
document.addEventListener('change', (e) => {                // fill calculator from the student's record
  if (e.target.id !== 'calFill' || !isStudent() || !e.target.value) return;
  const st = e.target.value === 'all' ? overall(user.id) : attStats(user.id, e.target.value), f = $('#calForm');
  f.elements.total.value = st.t; f.elements.att.value = st.p; calcOut();
});

/* ================= Login / logout ================= */
let role = 'student';
const ID_LABEL = { student: 'Roll number', teacher: 'Teacher ID', mentor: 'Mentor ID' };
$$('.role').forEach((b) => b.addEventListener('click', () => {
  role = b.dataset.role;
  $$('.role').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
  $('#idLabel').textContent = ID_LABEL[role];
}));

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, id = $('#loginId').value.trim(), pw = $('#loginPass').value;
  try {
    const r = await api('POST', '/login', { role, id, password: pw });
    token = r.token;
    try { sessionStorage.setItem(SESSION, JSON.stringify({ token, user: r.user })); } catch (err) { /* ignore */ }
    await refresh();
    $('#loginError').textContent = '';
    form.reset();
    start(r.user);
  } catch (err) { token = null; $('#loginError').textContent = err.message; }
});

function start(u) {
  user = u; draft = null; mentorAttView = 'all';
  document.body.classList.remove('role-student', 'role-teacher', 'role-mentor');
  document.body.classList.add('role-' + u.role);
  $('#who').textContent = u.name;
  const stu = u.role === 'student' ? db.students.find((s) => s.id === u.id) : null;
  $('#roleTag').textContent = u.role === 'student' ? `Student, Batch ${stu.batch}` : u.role === 'teacher' ? `Teacher, ${u.code}` : 'Class mentor';
  $('#avatar').innerHTML = av(u.name, 'lg');
  $('#pageDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) + ', Section B';
  $('#login').hidden = true; $('#app').hidden = false;
  query = ''; $('#search').value = '';
  showTab(u.role === 'student' && !db.profiles[u.id] ? 'profile' : 'overview');
}

function signOut() {
  user = null; token = null; db = emptyDb();
  try { sessionStorage.removeItem(SESSION); } catch (e) { /* ignore */ }
  $('#app').hidden = true; $('#login').hidden = false;
}
$('#logoutBtn').addEventListener('click', signOut);

(function () {                                              // animated register grid on the login page
  const r = rng(11);
  let h = '';
  for (let i = 0; i < 84; i++) h += `<i class="${r() < 0.78 ? 'p' : 'a'}" style="--i:${i}"></i>`;
  $('#loginArt').innerHTML = h;
})();

$$('.demo-fill').forEach((b) => b.addEventListener('click', () => {
  $(`.role[data-role="${b.dataset.role}"]`).click();
  $('#loginId').value = b.dataset.id; $('#loginPass').value = b.dataset.pass; $('#loginPass').focus();
}));

$('#togglePw').addEventListener('click', (e) => {
  const show = $('#loginPass').type === 'password';
  $('#loginPass').type = show ? 'text' : 'password';
  e.target.textContent = show ? 'Hide' : 'Show';
  e.target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

(async function () {                                        // stay signed in after a refresh
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION));
    if (!saved || !saved.token) return;
    token = saved.token;
    await refresh();
    start(saved.user);
  } catch (e) { signOut(); }
})();
