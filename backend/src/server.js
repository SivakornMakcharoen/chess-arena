import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import authRouter from './authRouter.js';
import restRouter from './restRouter.js';
import { attachRealtime } from './realtime.js';

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || '';

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

app.use(cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: false,
}));
app.use(express.json());

// เกทกันเบื้องต้น: ถ้าตั้งค่า API_KEY ไว้ ต้องแนบ header 'apikey' มาให้ตรงกัน
// (ไม่ใช่ระบบรักษาความปลอดภัยระดับสูง แค่กันบอทสุ่มยิง API เล่นๆ)
app.use((req, res, next) => {
    if (!API_KEY) return next(); // ไม่ได้ตั้งค่าไว้ = ไม่บังคับเช็ค
    if (req.path === '/health') return next();
    const provided = req.header('apikey');
    if (provided !== API_KEY) {
        return res.status(401).json({ message: 'apikey ไม่ถูกต้องหรือไม่มี' });
    }
    next();
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth/v1', authRouter);
app.use('/rest/v1', restRouter);

// ตัวจัดการ error กลาง กันเซิร์ฟเวอร์ล่มเวลามีข้อผิดพลาดไม่คาดคิด
app.use((err, req, res, next) => {
    console.error('[unhandled error]', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์' });
});

const server = http.createServer(app);
attachRealtime(server);

server.listen(PORT, () => {
    console.log(`chess-arena backend กำลังทำงานที่พอร์ต ${PORT}`);
    console.log(`  REST     : http://localhost:${PORT}/rest/v1`);
    console.log(`  Auth     : http://localhost:${PORT}/auth/v1`);
    console.log(`  Realtime : ws://localhost:${PORT}/realtime/v1/websocket`);
    if (!process.env.JWT_SECRET) {
        console.warn('⚠️  ยังไม่ได้ตั้งค่า JWT_SECRET ใน .env — กำลังใช้ค่า default ที่ไม่ปลอดภัย ห้ามใช้แบบนี้ใน production!');
    }
});
