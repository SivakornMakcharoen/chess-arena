import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db.js';
import {
    signAccessToken,
    verifyAccessToken,
    generateRefreshToken,
    refreshTokenExpiry,
    ACCESS_TOKEN_TTL,
    getBearerToken,
} from './tokens.js';

const router = express.Router();

function publicUser(user) {
    return { id: user.id, email: user.email, user_metadata: user.user_metadata || {} };
}

function issueSession(user) {
    const access_token = signAccessToken(user);
    const refresh_token = generateRefreshToken();
    db.insert('refresh_tokens', {
        token: refresh_token,
        user_id: user.id,
        expires_at: refreshTokenExpiry(),
    });
    return {
        access_token,
        refresh_token,
        expires_in: ACCESS_TOKEN_TTL,
        token_type: 'bearer',
        user: publicUser(user),
    };
}

function fail(res, status, message) {
    return res.status(status).json({ error: 'invalid_request', error_description: message, msg: message });
}

// ---------------------------------------------------------------
// POST /auth/v1/signup
// ---------------------------------------------------------------
router.post('/signup', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return fail(res, 400, 'ต้องกรอกอีเมลและรหัสผ่าน');
    if (String(password).length < 6) return fail(res, 400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = db.findOne('users', (u) => u.email === normalizedEmail);
    if (existing) return fail(res, 400, 'อีเมลนี้ถูกใช้สมัครสมาชิกไปแล้ว');

    const password_hash = await bcrypt.hash(password, 10);
    const user = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        password_hash,
        created_at: new Date().toISOString(),
    };
    db.insert('users', user);

    res.json(issueSession(user));
});

// ---------------------------------------------------------------
// POST /auth/v1/token?grant_type=password | refresh_token
// ---------------------------------------------------------------
router.post('/token', async (req, res) => {
    const grantType = req.query.grant_type;

    if (grantType === 'password') {
        const { email, password } = req.body || {};
        if (!email || !password) return fail(res, 400, 'ต้องกรอกอีเมลและรหัสผ่าน');
        const normalizedEmail = String(email).toLowerCase().trim();
        const user = db.findOne('users', (u) => u.email === normalizedEmail);
        if (!user || !user.password_hash) return fail(res, 400, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return fail(res, 400, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        return res.json(issueSession(user));
    }

    if (grantType === 'refresh_token') {
        const { refresh_token } = req.body || {};
        if (!refresh_token) return fail(res, 400, 'ไม่มี refresh token');
        const record = db.findOne('refresh_tokens', (t) => t.token === refresh_token);
        if (!record || record.expires_at < Date.now()) {
            return fail(res, 400, 'refresh token หมดอายุหรือไม่ถูกต้อง');
        }
        const user = db.findOne('users', (u) => u.id === record.user_id);
        if (!user) return fail(res, 400, 'ไม่พบผู้ใช้');
        // หมุน token: ลบตัวเก่า ออกตัวใหม่
        db.remove('refresh_tokens', (t) => t.token === refresh_token);
        return res.json(issueSession(user));
    }

    return fail(res, 400, 'grant_type ไม่ถูกต้อง');
});

// ---------------------------------------------------------------
// Middleware: ต้องมี Bearer token ที่ valid
// ---------------------------------------------------------------
function requireAuth(req, res, next) {
    const token = getBearerToken(req);
    if (!token) return fail(res, 401, 'ไม่ได้เข้าสู่ระบบ');
    const payload = verifyAccessToken(token);
    if (!payload) return fail(res, 401, 'token หมดอายุหรือไม่ถูกต้อง');
    const user = db.findOne('users', (u) => u.id === payload.sub);
    if (!user) return fail(res, 401, 'ไม่พบผู้ใช้');
    req.user = user;
    next();
}

// ---------------------------------------------------------------
// GET /auth/v1/user
// ---------------------------------------------------------------
router.get('/user', requireAuth, (req, res) => {
    res.json(publicUser(req.user));
});

// ---------------------------------------------------------------
// PUT /auth/v1/user  — เปลี่ยนรหัสผ่าน (ใช้ตอน reset password ด้วย)
// ---------------------------------------------------------------
router.put('/user', requireAuth, async (req, res) => {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
        return fail(res, 400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    }
    const password_hash = await bcrypt.hash(password, 10);
    db.update('users', (u) => u.id === req.user.id, { password_hash });
    res.json(publicUser(req.user));
});

// ---------------------------------------------------------------
// POST /auth/v1/logout
// ---------------------------------------------------------------
router.post('/logout', (req, res) => {
    const token = getBearerToken(req);
    const payload = token ? verifyAccessToken(token) : null;
    if (payload?.sub) {
        db.remove('refresh_tokens', (t) => t.user_id === payload.sub);
    }
    res.status(204).end();
});

// ---------------------------------------------------------------
// POST /auth/v1/recover — ขอลิงก์รีเซ็ตรหัสผ่าน
// หมายเหตุ: เซิร์ฟเวอร์นี้ไม่ได้ต่อระบบส่งอีเมลจริงไว้ (ไม่มี SMTP)
// ลิงก์รีเซ็ตจะถูก log ออกทาง console แทน — ถ้าจะใช้งานจริงกับผู้ใช้จริง
// ต้องต่อ nodemailer หรือบริการส่งอีเมล (Resend, SendGrid ฯลฯ) เอง แล้วส่งลิงก์นี้ไปทางอีเมลแทนการ log
// ---------------------------------------------------------------
router.post('/recover', (req, res) => {
    const { email } = req.body || {};
    const redirectTo = req.query.redirect_to || '';
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const user = db.findOne('users', (u) => u.email === normalizedEmail);

    // ตอบ 200 เสมอไม่ว่าจะเจอ user หรือไม่ เพื่อไม่ให้เดาได้ว่าอีเมลไหนสมัครไว้บ้าง
    if (user) {
        const recoveryToken = signAccessToken(user);
        const link = `${redirectTo}#access_token=${recoveryToken}&type=recovery&expires_in=${ACCESS_TOKEN_TTL}`;
        console.log('\n[password recovery] ลิงก์รีเซ็ตรหัสผ่านสำหรับ', normalizedEmail, ':\n', link, '\n');
    } else {
        console.log('[password recovery] ขอรีเซ็ตรหัสผ่านของอีเมลที่ไม่มีในระบบ:', normalizedEmail);
    }
    res.json({});
});

export default router;
export { requireAuth };
