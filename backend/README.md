# Chess Arena Backend

Backend ของเราเอง (Node.js) ที่มาแทน Supabase เดิม รองรับ:

- **Auth** — สมัคร/ล็อกอินด้วย email+password, refresh token, ลืมรหัสผ่าน
- ล็อกอินและสมัครสมาชิกรวมเป็นขั้นตอนเดียว: ถ้าอีเมล/ผู้ใช้นี้ยังไม่เคยมีในระบบ การกรอกรหัสผ่านครั้งแรกจะสร้างบัญชีใหม่ให้อัตโนมัติ ครั้งต่อไปต้องใช้รหัสผ่านเดิมเท่านั้นถึงจะเข้าได้ (ตรรกะนี้อยู่ฝั่ง frontend ใน `handleLogin()`)
- **REST API** สำหรับตาราง `players` (rating, wins/losses/draws) และ `game_logs` — endpoint และรูปแบบ query เหมือน PostgREST เดิมทุกอย่าง (`?field=eq.value`, `?select=`, `?order=`, `?limit=`, `?on_conflict=`) เพื่อให้โค้ด frontend เดิมแทบไม่ต้องแก้
- **Realtime (WebSocket)** สำหรับห้องเล่นออนไลน์ (chess/checkers) — พูดโปรโตคอลแบบเดียวกับ Supabase Realtime (`phx_join` / `broadcast`) จึงเข้ากันได้กับโค้ดเดิมของ frontend

ข้อมูลเก็บเป็นไฟล์ JSON ธรรมดา (`data/db.json`) — ไม่ต้องติดตั้งฐานข้อมูลแยก ไม่มี native module ให้คอมไพล์ รันได้บนแทบทุกเครื่องที่มี Node.js ≥ 18 เหมาะกับสเกลขนาดเล็ก-กลาง ถ้าจำนวนผู้เล่น/เกมเยอะขึ้นมากในอนาคต ค่อยย้ายไป Postgres/SQLite ทีหลังได้ (ดูหัวข้อ "ย้ายไปฐานข้อมูลจริง" ด้านล่าง)

## เริ่มต้นใช้งาน (local)

```bash
npm install
cp .env.example .env
```

แก้ไฟล์ `.env`:
- `JWT_SECRET` — **ต้องเปลี่ยนเป็นค่าสุ่มยาวๆ ก่อนใช้งานจริง** สร้างได้ด้วย:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `API_KEY` — ตั้งเป็นค่าอะไรก็ได้ที่คาดเดายาก ต้องตรงกับ `VITE_API_KEY` ฝั่ง frontend
- `FRONTEND_ORIGIN` — URL ของ frontend (ตอน dev คือ `http://localhost:5173`)

รัน:
```bash
npm run dev     # auto-restart เมื่อแก้โค้ด
# หรือ
npm start
```

เช็คว่ารันอยู่: เปิด `http://localhost:3001/health` ควรเห็น `{"ok":true}`

## เรื่องอีเมล "ลืมรหัสผ่าน"

เซิร์ฟเวอร์นี้ไม่ได้ต่อระบบส่งอีเมลจริงไว้ (ไม่มี SMTP) — ตอนผู้ใช้กด "ลืมรหัสผ่าน" ลิงก์รีเซ็ตจะถูก **print ออกทาง console log ของ backend** แทนการส่งอีเมลจริง

ถ้าจะใช้งานกับผู้ใช้จริง ต้องต่อบริการส่งอีเมลเอง (เช่น [Resend](https://resend.com), [SendGrid](https://sendgrid.com), หรือ `nodemailer` + SMTP ของคุณเอง) แล้วแก้ในไฟล์ `src/authRouter.js` ตรง endpoint `/recover` ให้ส่งอีเมลแทนการ `console.log`

## Deploy ขึ้น VPS จริง

ตัวอย่างสำหรับ Ubuntu VPS ทั่วไป:

```bash
# บน VPS
git clone <your-repo>   # หรือ scp ไฟล์ขึ้นไป
cd backend
npm install --omit=dev
cp .env.example .env
nano .env                # แก้ค่าให้ครบ (JWT_SECRET, API_KEY, FRONTEND_ORIGIN)
```

ใช้ **pm2** เพื่อให้ process รันค้างและ auto-restart เมื่อ crash หรือ VPS reboot:

```bash
npm install -g pm2
pm2 start src/server.js --name chess-arena-backend
pm2 save
pm2 startup            # ทำตามคำสั่งที่มันบอกให้รัน เพื่อให้ auto-start ตอน boot เครื่อง
```

ใช้ **nginx** เป็น reverse proxy (รองรับ HTTPS ผ่าน Let's Encrypt/certbot ด้วย) — ตัวอย่าง config:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;   # จำเป็นสำหรับ WebSocket (ห้องเล่นออนไลน์)
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

จากนั้น: `sudo certbot --nginx -d api.yourdomain.com` เพื่อขอ HTTPS certificate ฟรี

## แบ็คอัพข้อมูล

ข้อมูลทั้งหมดอยู่ในไฟล์เดียว `data/db.json` — สำรองง่ายๆ ด้วยการ copy ไฟล์นี้เป็นระยะ (เช่น cron job รายวัน) หรือใส่ไว้ใน git repo แยกที่ private ก็ได้ (แต่ระวัง — ไฟล์นี้มี password hash ของผู้ใช้อยู่ด้วย ไม่ควร public)

## ย้ายไปฐานข้อมูลจริง (ถ้าจำเป็นในอนาคต)

ถ้าผู้เล่น/จำนวนเกมเยอะขึ้นมากจนไฟล์ JSON เริ่มช้า ให้แทนที่ฟังก์ชันใน `src/db.js` (`get`, `insert`, `update`, `remove`, `find`, `findOne`) ด้วยการต่อ Postgres/SQLite จริง โดยไม่ต้องแก้ `authRouter.js` หรือ `restRouter.js` เลย เพราะทั้งสองไฟล์เรียกผ่าน interface ของ `db.js` เท่านั้น

## ข้อจำกัดที่ควรรู้ (เทียบกับของเดิมที่ใช้ Supabase)

- **ไม่มี Row Level Security แบบละเอียดเท่า Supabase** — มีการเช็คสิทธิ์พื้นฐาน (ห้ามแก้ข้อมูลผู้ใช้อื่นถ้า login อยู่) แต่ไม่ได้ลึกเท่าระบบ policy ของ Postgres จริง
- **การส่งอีเมลลืมรหัสผ่านยังไม่ต่อจริง** (ดูหัวข้อด้านบน)
- **ไม่มี rate limiting ระดับ IP** ในตัว backend เอง (frontend มี client-side rate limit อยู่แล้วบางส่วน) — ถ้ากังวลเรื่อง abuse แนะนำเพิ่ม `express-rate-limit` ที่ระดับ backend ด้วย
