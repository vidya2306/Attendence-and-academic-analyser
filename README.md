# Class Register: backend + frontend

Node.js + Express + SQLite. The frontend in `public/` is your original design, with `script.js`
changed to call the API instead of `localStorage`.

## Run it
```
npm install
cp .env.example .env        # then set JWT_SECRET (command is inside the file)
npm run seed:demo           # optional: fake attendance for the demo students
npm start                   # open http://localhost:3000
```
Demo logins are unchanged (23CY084 / 23cy084@123, T501 / teach@501, M101 / mentor@123).
The first start creates the database and the 4 teachers, mentor and demo students.

## Who can do what (enforced on the server, not just hidden in the UI)
| Action | Student | Subject teacher | Mentor |
|---|---|---|---|
| See own attendance / published marks | yes | | |
| See all students | | yes | yes |
| Take or edit attendance | | own subject only | no |
| Enter / publish / clear marks | | own subject only | no |
| Edit profile | own | any student | any student |
| Add / remove students | | | yes |

## API
POST /api/login · GET /api/bootstrap · POST /api/change-password
PUT /api/attendance/:key · PATCH /api/attendance/:key/:studentId
PUT /api/marks/:code/:studentId · POST /api/marks/:code/bulk|publish|unpublish · DELETE /api/marks/:code
PUT /api/profiles/:studentId · POST /api/myatt
POST /api/students · DELETE /api/students/:id · POST /api/reset (off unless ALLOW_RESET=true)

## Before real use
1. Default passwords are guessable (roll@123, teach@501). Have everyone call
   /api/change-password, or reset them. Add a "Change password" form to the UI.
2. Delete the demo-login buttons from `public/index.html`.
3. Serve over HTTPS (Nginx/Caddy, or a host such as Render/Railway) and keep `ALLOW_RESET=false`.
4. Back up `data/register.db` regularly. Every edit to attendance/marks is recorded in the `audit_log` table.
