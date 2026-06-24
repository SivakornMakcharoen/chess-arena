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
    ├── chess-engine.js       # โค้ดเกมหมากรุก + Supabase
    ├── chess.css
    ├── checkers-main.js      # entry module ของหน้า Checkers
    ├── checkers-engine.js    # โค้ดเกมหมากฮอต + Supabase
    └── checkers.css
```

## วิธีติดตั้งและรัน

```bash
npm install
npm run dev        # เปิด dev server ที่ http://localhost:5173
npm run build       # build production ไปที่ dist/
npm run preview     # ลองรันไฟล์ build แบบ production
```

## Environment Variables

ค่า Supabase URL/Key ถูกแยกออกจากโค้ดมาไว้ที่ไฟล์ `.env` แล้ว (เดิมฝังอยู่ในไฟล์ .js ตรง ๆ)

ถ้าจะย้ายไป deploy ที่อื่น หรือเปลี่ยนโปรเจกต์ Supabase ของตัวเอง:

1. คัดลอก `.env.example` ไปเป็น `.env`
2. แก้ค่าตามโปรเจกต์ Supabase ของคุณ (Dashboard → Project Settings → API):
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

`.env` ถูกใส่ใน `.gitignore` ไว้แล้ว จะไม่ถูก commit ขึ้น git โดยไม่ตั้งใจ

> หมายเหตุ: Supabase anon key ถูกออกแบบมาให้เปิดเผยฝั่ง client ได้ (ความปลอดภัยจริงอยู่ที่ Row Level Security policies ในฝั่ง Supabase) แต่การแยกเป็น env ก็ยังช่วยให้สลับ project/credentials ระหว่าง dev, staging, production ได้ง่ายโดยไม่ต้องแก้โค้ด

## หมายเหตุการแปลง

- ตรรกะเกมเดิมทั้งหมด (chess-engine.js, checkers script) ไม่ถูกแก้ไขเลย ย้ายเข้ามาเป็น ES module ตรง ๆ
- ฟังก์ชันที่ HTML เรียกผ่าน `onclick="..."` (เช่น `handleLogin()`, `showPage()`) ถูก attach กลับเข้า `window` ที่ท้ายไฟล์ เพราะ ES module ไม่ทำให้ฟังก์ชัน top-level เป็น global โดยอัตโนมัติแบบ script ธรรมดา — โครงสร้าง HTML/onclick เดิมจึงยังใช้งานได้ทุกที่เหมือนเดิม
- `checkers.html` เดิมมี `<style>` และ `<script>` ฝังอยู่ในไฟล์ ถูกแยกออกมาเป็น `src/checkers.css` และ `src/checkers-engine.js`
- รูปหมาก (`pieces/*.svg`) ย้ายไปไว้ใน `public/` ตามข้อกำหนดของ Vite สำหรับ static asset ที่ไม่ต้องผ่าน build process
