'use strict';
// Theory slots only (the only lectures that carry attendance). Mirrors the frontend timetable.
const CODES = ['CY501', 'CY502', 'CY503', 'CY504'];
const CLASS_START = '2026-09-07';
const PERIOD_START = ['10:30', '11:15', '12:00', '12:45', '13:25', '14:10', '14:50', '15:30', '16:15'];
const THEORY = {
  Mon: { 1: 'CY504', 2: 'CY501', 4: 'CY503', 8: 'CY502', 9: 'CY502' },
  Tue: { 3: 'CY503', 4: 'CY504', 6: 'CY501', 7: 'CY502' },
  Wed: { 3: 'CY503', 4: 'CY504', 6: 'CY501', 7: 'CY502' },
  Thu: { 6: 'CY503', 7: 'CY501', 8: 'CY504', 9: 'CY503' },
  Fri: { 1: 'CY501', 2: 'CY504', 3: 'CY502', 4: 'CY502', 8: 'CY503', 9: 'CY504' }
};
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Current date and minutes-since-midnight in India time, whatever the server's timezone is.
function istNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// "CY501|2026-09-07|2" -> { code, date, period } or null if it is not a real lecture slot up to today.
function parseKey(key) {
  const m = /^(CY50[1-4])\|(\d{4}-\d{2}-\d{2})\|([1-9])$/.exec(String(key));
  if (!m) return null;
  const [, code, date, p] = m;
  const d = new Date(date + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== date) return null;
  const day = DOW[d.getUTCDay()];
  if (!THEORY[day] || THEORY[day][p] !== code) return null;
  if (date < CLASS_START || date > istNow().date) return null;
  return { code, date, period: Number(p) };
}

// Every scheduled lecture for a subject from the first day up to today.
function sessionsFor(code, upToDate) {
  const out = [];
  for (let d = new Date(CLASS_START + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= upToDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = DOW[d.getUTCDay()], date = d.toISOString().slice(0, 10);
    Object.entries(THEORY[day] || {}).forEach(([p, c]) => { if (c === code) out.push(`${code}|${date}|${p}`); });
  }
  return out;
}

module.exports = { CODES, CLASS_START, PERIOD_START, THEORY, istNow, toMin, parseKey, sessionsFor };
