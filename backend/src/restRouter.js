import express from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { verifyAccessToken, getBearerToken } from './tokens.js';

const router = express.Router();

// เฉพาะตารางที่แอปนี้ใช้จริงเท่านั้น กันไม่ให้ยิง request มาสร้าง/อ่านตารางเถื่อน
const ALLOWED_TABLES = {
    players: {
        columns: ['id', 'user_id', 'email', 'nickname', 'rating', 'wins', 'losses', 'draws'],
        defaults: () => ({ rating: 0, wins: 0, losses: 0, draws: 0 }),
    },
    game_logs: {
        columns: [
            'id', 'player_id', 'opponent', 'result', 'moves_count',
            'rating_before', 'rating_after', 'game_mode', 'created_at',
        ],
        defaults: () => ({ created_at: new Date().toISOString() }),
    },
};

// อ่าน user จาก Bearer token ถ้ามี (ไม่บังคับต้อง login สำหรับบางเส้นทาง เช่น pass-and-play)
function currentUser(req) {
    const token = getBearerToken(req);
    if (!token) return null;
    const payload = verifyAccessToken(token);
    if (!payload) return null;
    return { id: payload.sub, email: payload.email };
}

// แปลง query string สไตล์ PostgREST ที่แอปนี้ใช้จริง: field=eq.value, select=, order=col.dir, limit=N
function parseFilters(query, allowedColumns) {
    const filters = {};
    for (const [key, value] of Object.entries(query)) {
        if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
        if (!allowedColumns.includes(key)) continue;
        const raw = Array.isArray(value) ? value[0] : value;
        if (typeof raw === 'string' && raw.startsWith('eq.')) {
            filters[key] = decodeURIComponent(raw.slice(3));
        }
    }
    return filters;
}

function applyFilters(rows, filters) {
    const keys = Object.keys(filters);
    if (!keys.length) return rows;
    return rows.filter((row) => keys.every((k) => String(row[k]) === String(filters[k])));
}

function applySelect(rows, selectParam, allowedColumns) {
    if (!selectParam || selectParam === '*') return rows;
    const cols = selectParam.split(',').map((c) => c.trim()).filter((c) => allowedColumns.includes(c));
    if (!cols.length) return rows;
    return rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c]])));
}

function applyOrder(rows, orderParam) {
    if (!orderParam) return rows;
    const [col, dir = 'asc'] = orderParam.split('.');
    const sorted = [...rows].sort((a, b) => {
        if (a[col] === b[col]) return 0;
        return a[col] > b[col] ? 1 : -1;
    });
    return dir === 'desc' ? sorted.reverse() : sorted;
}

function applyLimit(rows, limitParam) {
    if (!limitParam) return rows;
    const n = parseInt(limitParam, 10);
    if (Number.isNaN(n)) return rows;
    return rows.slice(0, n);
}

function sanitizeBody(body, allowedColumns) {
    const clean = {};
    for (const col of allowedColumns) {
        if (Object.prototype.hasOwnProperty.call(body || {}, col)) clean[col] = body[col];
    }
    return clean;
}

// ---------------------------------------------------------------
// GET /rest/v1/:table
// ---------------------------------------------------------------
router.get('/:table', (req, res) => {
    const tableDef = ALLOWED_TABLES[req.params.table];
    if (!tableDef) return res.status(404).json({ message: 'ไม่พบตารางนี้' });

    let rows = db.get(req.params.table);
    const filters = parseFilters(req.query, tableDef.columns);
    rows = applyFilters(rows, filters);
    rows = applyOrder(rows, req.query.order);
    rows = applyLimit(rows, req.query.limit);
    rows = applySelect(rows, req.query.select, tableDef.columns);
    res.json(rows);
});

// ---------------------------------------------------------------
// POST /rest/v1/:table  (รองรับ upsert ผ่าน ?on_conflict=column)
// ---------------------------------------------------------------
router.post('/:table', (req, res) => {
    const tableName = req.params.table;
    const tableDef = ALLOWED_TABLES[tableName];
    if (!tableDef) return res.status(404).json({ message: 'ไม่พบตารางนี้' });

    const user = currentUser(req);
    const body = sanitizeBody(req.body, tableDef.columns);
    const onConflict = req.query.on_conflict;

    // ป้องกันเบื้องต้น: ถ้ามีการล็อกอิน และ body มี user_id ต้องเป็น user_id ของคนที่ล็อกอินอยู่เท่านั้น
    if (user && body.user_id && body.user_id !== user.id) {
        return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขข้อมูลของผู้ใช้อื่น' });
    }

    if (onConflict && tableDef.columns.includes(onConflict) && body[onConflict] !== undefined) {
        const existing = db.findOne(tableName, (row) => row[onConflict] === body[onConflict]);
        if (existing) {
            const updated = db.update(tableName, (row) => row[onConflict] === body[onConflict], body);
            return res.json(updated);
        }
    }

    const row = { id: crypto.randomUUID(), ...tableDef.defaults(), ...body };
    db.insert(tableName, row);
    res.status(201).json([row]);
});

// ---------------------------------------------------------------
// PATCH /rest/v1/:table?id=eq.X
// ---------------------------------------------------------------
router.patch('/:table', (req, res) => {
    const tableName = req.params.table;
    const tableDef = ALLOWED_TABLES[tableName];
    if (!tableDef) return res.status(404).json({ message: 'ไม่พบตารางนี้' });

    const filters = parseFilters(req.query, tableDef.columns);
    if (!Object.keys(filters).length) {
        return res.status(400).json({ message: 'ต้องระบุเงื่อนไข filter เช่น ?id=eq.xxx' });
    }

    const user = currentUser(req);
    if (user) {
        const targets = applyFilters(db.get(tableName), filters);
        const foreign = targets.find((row) => row.user_id && row.user_id !== user.id);
        if (foreign) return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขข้อมูลของผู้ใช้อื่น' });
    }

    const patch = sanitizeBody(req.body, tableDef.columns);
    const updated = db.update(tableName, (row) => Object.keys(filters).every((k) => String(row[k]) === String(filters[k])), patch);
    res.json(updated);
});

export default router;
