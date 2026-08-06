# Chess Arena

Chess + Checkers web app, converted from plain static HTML/CSS/JS into a **Vite** project.

## โครงสร้างโปรเจกต์

```
chess-arena/
├── index.html              # หน้า Chess (entry point)
├── checkers.html           # หน้า Checkers (entry point)
├── vite.config.js          # ตั้งค่า multi-page build
├── .env                    # ค่าจริง (ไม่ถูก commit ขึ้น git)
├── .env.example            # ตัวอย่างไฟล์ env สำหรับแชร์/deploy ใหม่
├── public/
│   └── pieces/*.svg        # รูปหมาก
└── src/
    ├── main.js              # entry module ของหน้า Chess
    ├── chess-engine.js       # โค้ดเกมหมากรุก + เรียก backend เอง
    ├── chess.css
    ├── checkers-main.js      # entry module ของหน้า Checkers
    ├── checkers-engine.js    # โค้ดเกมหมากฮอต + เรียก backend เอง
    └── checkers.css

backend/                      # <-- backend ของตัวเอง (Node.js) แทน Supabase เดิม ดู backend/README.md
```

## วิธีติดตั้งและรัน

โปรเจกต์นี้มี 2 ส่วนที่ต้องรันแยกกัน: **frontend** (โฟลเดอร์นี้) และ **backend** (โฟลเดอร์ `backend/` ข้างๆ กัน — ดูวิธีตั้งค่าใน `backend/README.md`)

```bash
# 1) ตั้งค่าและรัน backend ก่อน (คนละ terminal)
cd ../backend
npm install
cp .env.example .env   # แล้วแก้ค่าใน .env ตามต้องการ
npm run dev             # รันที่ http://localhost:3001

# 2) ตั้งค่าและรัน frontend
npm install
npm run dev        # เปิด dev server ที่ http://localhost:5173
npm run build       # build production ไปที่ dist/
npm run preview     # ลองรันไฟล์ build แบบ production
```

## Environment Variables

ค่า URL/Key ของ backend ถูกแยกออกจากโค้ดมาไว้ที่ไฟล์ `.env` แล้ว (เดิมฝังอยู่ในไฟล์ .js ตรง ๆ)

1. คัดลอก `.env.example` ไปเป็น `.env`
2. แก้ค่าให้ตรงกับที่ตั้งไว้ใน `backend/.env`:
   ```
   VITE_API_URL=http://localhost:3001
   VITE_API_KEY=ต้องตรงกับ API_KEY ใน backend/.env
   ```
3. ตอน deploy จริง เปลี่ยน `VITE_API_URL` เป็น URL จริงของ backend ที่ deploy ไว้ (เช่น https://api.yourdomain.com)

`.env` ถูกใส่ใน `.gitignore` ไว้แล้ว จะไม่ถูก commit ขึ้น git โดยไม่ตั้งใจ

> หมายเหตุ: ระบบเดิมใช้ Supabase (Auth + Database + Realtime แบบ managed service) ตอนนี้ถูกแทนที่ด้วย backend Node.js ของเราเองทั้งหมดแล้ว — ดูรายละเอียดสถาปัตยกรรม, วิธี deploy, และวิธีตั้งค่า Google OAuth ใน `backend/README.md`

## หมายเหตุการแปลง

- ตรรกะเกมเดิมทั้งหมด (chess-engine.js, checkers script) ไม่ถูกแก้ไขเลย ย้ายเข้ามาเป็น ES module ตรง ๆ
- ฟังก์ชันที่ HTML เรียกผ่าน `onclick="..."` (เช่น `handleLogin()`, `showPage()`) ถูก attach กลับเข้า `window` ที่ท้ายไฟล์ เพราะ ES module ไม่ทำให้ฟังก์ชัน top-level เป็น global โดยอัตโนมัติแบบ script ธรรมดา — โครงสร้าง HTML/onclick เดิมจึงยังใช้งานได้ทุกที่เหมือนเดิม
- `checkers.html` เดิมมี `<style>` และ `<script>` ฝังอยู่ในไฟล์ ถูกแยกออกมาเป็น `src/checkers.css` และ `src/checkers-engine.js`
- รูปหมาก (`pieces/*.svg`) ย้ายไปไว้ใน `public/` ตามข้อกำหนดของ Vite สำหรับ static asset ที่ไม่ต้องผ่าน build process
