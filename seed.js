'use strict';
// Usage: npm run seed          -> faculty + students only (empty register)
//        npm run seed:demo     -> also adds fake attendance for the demo students
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const { CODES, istNow, sessionsFor } = require('./timetable');

const pad = (n, w = 3) => String(n).padStart(w, '0');
const hash = (p) => bcrypt.hashSync(p, 10);

const FACULTY = [
  ['T501', 'Prof. Shivani Sant', 'teacher', 'CY501', '9074367960', 'teach@501'],
  ['T502', 'Dr. Bhawana Pillai', 'teacher', 'CY502', '9425302343', 'teach@502'],
  ['T503', 'Prof. Aryan Khatri', 'teacher', 'CY503', '9301382870', 'teach@503'],
  ['T504', 'Dr. Abhijeet Gupta', 'teacher', 'CY504', '9926966225', 'teach@504'],
  ['M101', 'Prof. Monika Kudopa', 'mentor', null, '8602129564', 'mentor@123']
];
const ROSTER = [['Aarav Sharma', 84], ['Diya Patel', 85], ['Rohan Verma', 86], ['Ananya Singh', 88],
  ['Kabir Joshi', 90], ['Meera Nair', 93], ['Ishaan Gupta', 97], ['Priya Yadav', 101],
  ['Vivaan Mehta', 108], ['Sneha Rao', 112], ['Arjun Kulkarni', 119], ['Nisha Choudhary', 124],
  ['Rahul Tiwari', 125], ['Kavya Malviya', 131], ['Harsh Dubey', 140], ['Simran Kaur', 152]];
const REAL = [['Vidya Charan Reddy Yammanuru', 148]];

function seedPeople() {
  const insF = db.prepare('INSERT OR IGNORE INTO faculty (id,name,role,code,phone,pass_hash) VALUES (?,?,?,?,?,?)');
  const insS = db.prepare('INSERT OR IGNORE INTO students (id,roll,name,batch,pass_hash) VALUES (?,?,?,?,?)');
  const insP = db.prepare('INSERT OR IGNORE INTO published (code,is_published) VALUES (?,0)');
  db.transaction(() => {
    FACULTY.forEach(([id, name, role, code, phone, pw]) => insF.run(id, name, role, code, phone, hash(pw)));
    [...ROSTER, ...REAL].forEach(([name, n]) => {
      const roll = '23CY' + pad(n);
      insS.run('S' + pad(n), roll, name, n <= 124 ? 'I' : 'II', hash(roll.toLowerCase() + '@123'));
    });
    CODES.forEach((c) => insP.run(c));
  })();
}

function seedDemoAttendance() {
  const today = istNow().date;
  const ids = ROSTER.map(([, n]) => 'S' + pad(n));
  const habit = ids.map(() => 0.5 + Math.random() * 0.5);
  const insSess = db.prepare('INSERT OR IGNORE INTO sessions (session_key,code,date,period,taken_by,taken_at) VALUES (?,?,?,?,?,?)');
  const insAtt = db.prepare('INSERT OR IGNORE INTO attendance (session_key,student_id,status) VALUES (?,?,?)');
  db.transaction(() => {
    CODES.forEach((code) => sessionsFor(code, today).forEach((key) => {
      const [, date, p] = key.split('|');
      if (date >= today) return;               // leave today pending, like the original demo
      insSess.run(key, code, date, Number(p), 'seed', new Date().toISOString());
      ids.forEach((id, i) => insAtt.run(key, id, Math.random() < habit[i] ? 1 : 0));
    }));
  })();
}

if (require.main === module) {
  seedPeople();
  if (process.argv.includes('--demo')) seedDemoAttendance();
  console.log('Seeded.', process.argv.includes('--demo') ? '(with demo attendance)' : '');
}
module.exports = { seedPeople, seedDemoAttendance };
