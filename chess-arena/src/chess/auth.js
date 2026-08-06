import { API_KEY, API_URL } from './config.js';

// ============================================================
// AUTH — คุยกับ backend ของเราเอง (เลียนแบบ REST API เดิมของ GoTrue/Supabase)
// ============================================================
// เก็บ session (access_token / refresh_token) ไว้ใน localStorage
// เพื่อให้ refresh หน้าเว็บแล้วยัง login ค้างอยู่ (แก้ปัญหาเดิมที่
// state อยู่แค่ในตัวแปร JS แล้วหายไปทุกครั้งที่ refresh)
const STORAGE_KEY = 'chess-arena-session';

export const Auth = {
    _session: null,

    _loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            this._session = raw ? JSON.parse(raw) : null;
        } catch {
            this._session = null;
        }
        return this._session;
    },

    _save(session) {
        this._session = session;
        try {
            if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
            else localStorage.removeItem(STORAGE_KEY);
        } catch { /* localStorage อาจไม่พร้อมใช้งาน (private mode ฯลฯ) — ไม่ใช่ error ร้ายแรง */ }
    },

    _toSession(data) {
        if (!data?.access_token) return null;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user || null
        };
    },

    async _authFetch(path, body) {
        let res;
        try {
            res = await fetch(`${API_URL}/auth/v1/${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: API_KEY },
                body: JSON.stringify(body)
            });
        } catch (networkErr) {
            // ต่อ backend ไม่ได้เลย (backend ปิดอยู่/เน็ตหลุด/CORS ผิด ฯลฯ)
            // ต้องแยกเคสนี้ออกจาก "server ตอบมาว่า token ผิด/หมดอายุจริง"
            // เพราะถ้าเจอเคสนี้แล้วไปลบ session ทิ้งเลย จะทำให้ผู้ใช้หลุด login
            // ทั้งที่ login ยังใช้ได้อยู่ แค่ backend ไม่ตอบตอนนั้นชั่วคราวเฉยๆ
            const err = new Error('เชื่อมต่อ backend ไม่ได้ (ตรวจสอบว่า backend ยังรันอยู่หรือไม่)');
            err.isNetworkError = true;
            throw err;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error_description || data.msg || data.error || 'เกิดข้อผิดพลาดในการยืนยันตัวตน');
            err.isNetworkError = false;
            err.status = res.status;
            throw err;
        }
        return data;
    },

    /** สมัครสมาชิกใหม่ด้วย email + password */
    async signUp(email, password) {
        const data = await this._authFetch('signup', { email, password });
        const session = this._toSession(data);
        if (session) this._save(session);
        return data; // ถ้าโปรเจกต์เปิด "Confirm email" ไว้ data.access_token จะไม่มีจนกว่าจะกดยืนยันในอีเมล
    },

    /** เข้าสู่ระบบด้วย email + password ที่มีอยู่แล้ว */
    async signIn(email, password) {
        const data = await this._authFetch('token?grant_type=password', { email, password });
        this._save(this._toSession(data));
        return data;
    },

    /** ใช้ refresh_token แลก access_token ใหม่ (เรียกอัตโนมัติเมื่อ token ใกล้หมดอายุ) */
    async refreshSession() {
        if (!this._session) this._loadFromStorage();
        if (!this._session?.refresh_token) return null;
        try {
            const data = await this._authFetch('token?grant_type=refresh_token', {
                refresh_token: this._session.refresh_token
            });
            const session = this._toSession(data);
            this._save(session);
            return session;
        } catch (e) {
            if (e.isNetworkError) {
                // ต่อ backend ไม่ได้ตอนนี้ (ชั่วคราว) — ไม่ล้าง session ทิ้ง
                // คืน session เดิมไปก่อน (access_token อาจใกล้หมดอายุ แต่ยังดีกว่าตัด login ทิ้งเลย)
                // ครั้งหน้าที่เรียกใช้ (หรือ refresh หน้าเว็บอีกที) จะลองแลก token ใหม่อีกครั้งเอง
                console.warn('รีเฟรช session ไม่สำเร็จเพราะต่อ backend ไม่ได้ — คง session เดิมไว้ก่อน:', e.message);
                return this._session;
            }
            // backend ตอบกลับมาจริงๆ ว่า refresh token ไม่ถูกต้อง/หมดอายุ (เช่นถูก revoke แล้ว) — ค่อยล้าง session ทิ้ง
            this._save(null);
            return null;
        }
    },

    /** คืน session ที่ยังใช้ได้ (refresh ให้อัตโนมัติถ้าใกล้หมดอายุ) หรือ null ถ้าไม่ได้ login */
    async getValidSession() {
        if (!this._session) this._loadFromStorage();
        if (!this._session) return null;
        // รีเฟรชล่วงหน้า 60 วิ ก่อนหมดอายุจริง
        if (Date.now() > this._session.expires_at - 60000) {
            return await this.refreshSession();
        }
        return this._session;
    },

    getAccessToken() {
        if (!this._session) this._loadFromStorage();
        return this._session?.access_token || null;
    },

    getUser() {
        if (!this._session) this._loadFromStorage();
        return this._session?.user || null;
    },

    /** ดึงข้อมูล user เต็มจาก token ปัจจุบัน (ใช้ตอน session ได้มาจากลิงก์ recovery ซึ่งยังไม่รู้ user id) */
    async fetchUser() {
        const token = this.getAccessToken();
        if (!token) return null;
        const res = await fetch(`${API_URL}/auth/v1/user`, {
            headers: { apikey: API_KEY, Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const user = await res.json().catch(() => null);
        if (user && this._session) { this._session.user = user; this._save(this._session); }
        return user;
    },

    async signOut() {
        const token = this.getAccessToken();
        this._save(null);
        if (!token) return;
        try {
            await fetch(`${API_URL}/auth/v1/logout`, {
                method: 'POST',
                headers: { apikey: API_KEY, Authorization: `Bearer ${token}` }
            });
        } catch { /* revoke ฝั่ง server ไม่สำเร็จก็ไม่เป็นไร เพราะ session ฝั่ง client ถูกลบไปแล้ว */ }
    },

    // ============================================================
    // ลืมรหัสผ่าน (Forgot password)
    // ============================================================

    /** ส่งอีเมลลิงก์รีเซ็ตรหัสผ่านไปให้ผู้ใช้ */
    async requestPasswordReset(email) {
        const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname);
        const res = await fetch(`${API_URL}/auth/v1/recover?redirect_to=${redirectTo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: API_KEY },
            body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error_description || data.msg || data.error || 'ส่งอีเมลไม่สำเร็จ');
        return data;
    },

    /** ตั้งรหัสผ่านใหม่ (ต้องมี session ที่ได้จากลิงก์รีเซ็ตในอีเมลก่อน) */
    async updatePassword(newPassword) {
        const token = this.getAccessToken();
        if (!token) throw new Error('ลิงก์รีเซ็ตหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่');
        const res = await fetch(`${API_URL}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', apikey: API_KEY, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password: newPassword })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error_description || data.msg || data.error || 'ตั้งรหัสผ่านไม่สำเร็จ');
        return data;
    },

    /**
     * ตอนผู้ใช้กดลิงก์ในอีเมล "รีเซ็ตรหัสผ่าน" Supabase จะพากลับมาที่เว็บพร้อม
     * token แนบอยู่ใน URL hash เช่น #access_token=...&type=recovery
     * ฟังก์ชันนี้ตรวจ/ดึง token นั้นมาตั้งเป็น session ชั่วคราว (ใช้ตั้งรหัสผ่านใหม่ได้)
     * แล้วเคลียร์ hash ออกจาก URL bar เพื่อไม่ให้ token ค้างอยู่ใน browser history
     */
    consumeRecoveryHashIfPresent() {
        if (!window.location.hash) return null;
        const params = new URLSearchParams(window.location.hash.slice(1));
        if (params.get('type') !== 'recovery') return null;
        const access_token = params.get('access_token');
        if (!access_token) return null;
        const session = {
            access_token,
            refresh_token: params.get('refresh_token') || null,
            expires_at: Date.now() + parseInt(params.get('expires_in') || '3600', 10) * 1000,
            user: null
        };
        this._save(session);
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return session;
    }
};