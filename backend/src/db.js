import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// ที่เก็บข้อมูลแบบไฟล์ JSON — เรียบง่าย พกพาง่าย ไม่ต้องคอมไพล์ native module
// เหมาะกับแอปขนาดเล็ก-กลาง ถ้าปริมาณข้อมูล/ผู้ใช้เยอะมากในอนาคต
// ค่อยย้ายไป Postgres/SQLite จริงทีหลังได้ (โครงสร้างฟังก์ชันด้านล่างออกแบบให้ย้ายง่าย)
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = {
    users: [],           // { id, email, password_hash, created_at }
    refresh_tokens: [],  // { token, user_id, expires_at }
    players: [],         // { id, user_id, email, nickname, rating, wins, losses, draws }
    game_logs: [],       // { id, player_id, opponent, result, moves_count, rating_before, rating_after, game_mode, created_at }
};

function load() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_DB, null, 2));
        return structuredClone(EMPTY_DB);
    }
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // เผื่อไฟล์เก่าไม่มีตารางบางอัน
        return { ...structuredClone(EMPTY_DB), ...parsed };
    } catch (e) {
        console.error('[db] อ่านไฟล์ฐานข้อมูลไม่สำเร็จ ใช้ฐานข้อมูลว่างแทน:', e.message);
        return structuredClone(EMPTY_DB);
    }
}

let state = load();

// เขียนแบบ synchronous ทุกครั้งที่มีการแก้ไข — เพราะ Node เป็น single-threaded
// และเราไม่ await คั่นระหว่างอ่าน-แก้-เขียน จึงไม่มี race condition
// (ถ้าโหลดสูงมากในอนาคต ค่อยเปลี่ยนเป็น write queue หรือฐานข้อมูลจริง)
function persist() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

export const db = {
    get(table) {
        return state[table] || [];
    },
    insert(table, row) {
        if (!state[table]) state[table] = [];
        state[table].push(row);
        persist();
        return row;
    },
    update(table, predicate, patch) {
        const rows = state[table] || [];
        const updated = [];
        for (const row of rows) {
            if (predicate(row)) {
                Object.assign(row, patch);
                updated.push(row);
            }
        }
        if (updated.length) persist();
        return updated;
    },
    remove(table, predicate) {
        const rows = state[table] || [];
        const before = rows.length;
        state[table] = rows.filter((r) => !predicate(r));
        if (state[table].length !== before) persist();
        return before - state[table].length;
    },
    find(table, predicate) {
        return (state[table] || []).filter(predicate);
    },
    findOne(table, predicate) {
        return (state[table] || []).find(predicate) || null;
    },
};
