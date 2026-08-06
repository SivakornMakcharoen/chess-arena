// ============================================================
// SECURITY LAYER
// ============================================================
export const Security = {
    _limits: {},
    rateLimit(action, maxPerMin = 10) {
        const now = Date.now();
        if (!this._limits[action]) this._limits[action] = [];
        this._limits[action] = this._limits[action].filter(t => now - t < 60000);
        if (this._limits[action].length >= maxPerMin) return false;
        this._limits[action].push(now);
        return true;
    },
    sanitize(str) { return String(str).replace(/[<>"'`;&\\\/]/g, '').trim().slice(0, 256); },
    isEmail(str) { return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(String(str).trim()); },
    isNick(str) { const s = String(str).trim(); return s.length >= 2 && s.length <= 24; },
    _csrf: null,
    getCSRF() { if (!this._csrf) this._csrf = crypto.randomUUID(); return this._csrf; },
    validateMove(from, to, board) {
        return typeof from === 'number' && typeof to === 'number'
            && from >= 0 && from < 64 && to >= 0 && to < 64 && from !== to;
    },
    auditLog: []
};