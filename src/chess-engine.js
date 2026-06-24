// ============================================================
// BUG FIX #1: UNICODE map was missing entirely — added here
// Maps piece letter codes to chess Unicode characters
// ============================================================
const PIECE_IMAGES = {
    K: 'pieces/Chess_klt45.svg',
    Q: 'pieces/Chess_qlt45.svg',
    R: 'pieces/Chess_rlt45.svg',
    B: 'pieces/Chess_blt45.svg',
    N: 'pieces/Chess_nlt45.svg',
    P: 'pieces/Chess_plt45.svg',
    k: 'pieces/Chess_kdt45.svg',
    q: 'pieces/Chess_qdt45.svg',
    r: 'pieces/Chess_rdt45.svg',
    b: 'pieces/Chess_bdt45.svg',
    n: 'pieces/Chess_ndt45.svg',
    p: 'pieces/Chess_pdt45.svg',
};


const Sound = {
    ctx: null,

    _init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    // เสียงพื้นฐาน: oscillator + envelope
    _play(freq, type, duration, volume = 0.25, freqEnd = null) {
        this._init();
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    },

    // เสียงเดินหมาก (คลิ๊กเบาๆ)
    move() {
        this._play(520, 'sine', 0.08, 0.18);
        setTimeout(() => this._play(420, 'sine', 0.06, 0.10), 40);
    },

    // เสียงกินหมาก (กระทบแรงขึ้น + ตก)
    capture() {
        this._play(300, 'triangle', 0.05, 0.3);
        setTimeout(() => this._play(180, 'triangle', 0.12, 0.25, 120), 30);
        setTimeout(() => this._play(240, 'sine', 0.08, 0.15), 80);
    },

    // เสียง Check (เสียงเตือน)
    check() {
        this._play(660, 'square', 0.06, 0.08);
        setTimeout(() => this._play(880, 'square', 0.06, 0.10), 80);
        setTimeout(() => this._play(660, 'square', 0.06, 0.08), 160);
    },

    // เสียง Castling (2 คลิ๊ก)
    castle() {
        this._play(500, 'sine', 0.07, 0.15);
        setTimeout(() => this._play(500, 'sine', 0.07, 0.15), 100);
    },

    // เสียงชนะ (fanfare สั้น)
    win() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => setTimeout(() => this._play(f, 'sine', 0.25, 0.22), i * 120));
    },

    // เสียงแพ้ (ลงต่ำ)
    lose() {
        const notes = [440, 370, 311, 277];
        notes.forEach((f, i) => setTimeout(() => this._play(f, 'triangle', 0.22, 0.20), i * 130));
    },

    // เสียงเสมอ (neutral)
    draw() {
        this._play(440, 'sine', 0.12, 0.15);
        setTimeout(() => this._play(440, 'sine', 0.12, 0.15), 180);
    },

    // เสียง promotion
    promote() {
        [523, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this._play(f, 'sine', 0.18, 0.2), i * 80));
    }
};

// ============================================================
// SUPABASE CONFIG (loaded from .env via Vite — see .env.example)
// ============================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ============================================================
// SECURITY LAYER
// ============================================================
const Security = {
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

// ============================================================
// SUPABASE API WRAPPER
// ============================================================
const DB = {
    async request(path, method = 'GET', body = null) {
        if (!Security.rateLimit('db_req', 30)) throw new Error('Rate limited');
        const opts = {
            method,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': method === 'POST' ? 'return=representation' : ''
            }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'DB error'); }
        return res.json().catch(() => null);
    },
    async upsertPlayer(email, nickname) {
        return this.request('players?on_conflict=email', 'POST', {
            email: Security.sanitize(email).toLowerCase(),
            nickname: Security.sanitize(nickname),
            rating: 0, wins: 0, losses: 0, draws: 0
        });
    },
    async getPlayer(email) {
        const rows = await this.request(`players?email=eq.${encodeURIComponent(email.toLowerCase())}&select=*&limit=1`);
        return rows?.[0] || null;
    },
    async updateStats(playerId, ratingDelta, result) {
        if (!Security.rateLimit('update_stats', 5)) return;
        const player = await this.getPlayerById(playerId);
        if (!player) return;
        const newRating = Math.max(0, Math.min(9999, player.rating + ratingDelta));
        const patch = { rating: newRating };
        if (result === 'win') patch.wins = (player.wins || 0) + 1;
        if (result === 'loss') patch.losses = (player.losses || 0) + 1;
        if (result === 'draw') patch.draws = (player.draws || 0) + 1;
        return this.request(`players?id=eq.${playerId}`, 'PATCH', patch);
    },
    async getPlayerById(id) {
        const rows = await this.request(`players?id=eq.${id}&select=*&limit=1`);
        return rows?.[0] || null;
    },
    async logGame(data) {
        return this.request('game_logs', 'POST', {
            player_id: data.playerId,
            opponent: Security.sanitize(data.opponent),
            result: data.result,
            moves_count: data.movesCount,
            rating_before: data.ratingBefore,
            rating_after: data.ratingAfter,
            game_mode: data.mode,
            created_at: new Date().toISOString()
        });
    },
    async getLeaderboard(limit = 50) {
        return this.request(`players?select=nickname,email,rating,wins,losses,draws&order=rating.desc&limit=${limit}`);
    }
};

// ============================================================
// APP STATE
// ============================================================
let APP = {
    player: null,
    player2: null,
    gameMode: null,
    hintMode: true,
    pendingMode: null
};

// ============================================================
// CHESS ENGINE
// ============================================================
class ChessGame {
    constructor() { this.reset(); }

    reset() {
        this.board = [
            'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
            'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
            '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '',
            'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
            'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'
        ];
        this.turn = 'w';
        this.castling = { wK: true, wQ: true, bK: true, bQ: true };
        this.enPassant = null;
        this.halfmoves = 0;
        this.moves = [];
        this.selected = null;
        this.legalMoves = [];
        this.status = 'playing';
        this.capturedWhite = [];
        this.capturedBlack = [];
        this.lastFrom = null;
        this.lastTo = null;
    }

    isWhite(p) { return p && p === p.toUpperCase() && p !== ''; }
    isBlack(p) { return p && p === p.toLowerCase() && p !== ''; }
    isEnemy(p, turn) { return turn === 'w' ? this.isBlack(p) : this.isWhite(p); }
    isFriend(p, turn) { return turn === 'w' ? this.isWhite(p) : this.isBlack(p); }
    row(i) { return Math.floor(i / 8); }
    col(i) { return i % 8; }
    idx(r, c) { return r * 8 + c; }

    rawMoves(idx, board, turn, enPassant, castling) {
        const p = board[idx];
        if (!p) return [];
        const r = this.row(idx), c = this.col(idx);
        const moves = [];
        const add = (to) => { moves.push(to); };
        const slide = (dr, dc) => {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const ni = this.idx(nr, nc);
                if (this.isFriend(board[ni], turn)) break;
                add(ni);
                if (board[ni]) break;
                nr += dr; nc += dc;
            }
        };
        const t = p.toUpperCase();

        if (t === 'P') {
            const dir = this.isWhite(p) ? -1 : 1;
            const startRow = this.isWhite(p) ? 6 : 1;
            let nr = r + dir;
            if (nr >= 0 && nr < 8 && !board[this.idx(nr, c)]) {
                add(this.idx(nr, c));
                if (r === startRow && !board[this.idx(r + dir * 2, c)]) add(this.idx(r + dir * 2, c));
            }
            for (const dc of [-1, 1]) {
                const nc2 = c + dc;
                if (nc2 < 0 || nc2 > 7) continue;
                const ni = this.idx(nr, nc2);
                if (this.isEnemy(board[ni], turn)) add(ni);
                if (enPassant === ni) add(ni);
            }
        }
        if (t === 'N') {
            for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                const ni = this.idx(nr, nc);
                if (!this.isFriend(board[ni], turn)) add(ni);
            }
        }
        if (t === 'B') { for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) slide(dr, dc); }
        if (t === 'R') { for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) slide(dr, dc); }
        if (t === 'Q') { for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) slide(dr, dc); }
        if (t === 'K') {
            for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                const ni = this.idx(nr, nc);
                if (!this.isFriend(board[ni], turn)) add(ni);
            }
            const row0 = this.isWhite(p) ? 7 : 0;
            if (r === row0 && c === 4) {
                if (turn === 'w') {
                    if (castling.wK && !board[this.idx(row0, 5)] && !board[this.idx(row0, 6)]) add(this.idx(row0, 6));
                    if (castling.wQ && !board[this.idx(row0, 3)] && !board[this.idx(row0, 2)] && !board[this.idx(row0, 1)]) add(this.idx(row0, 2));
                } else {
                    if (castling.bK && !board[this.idx(row0, 5)] && !board[this.idx(row0, 6)]) add(this.idx(row0, 6));
                    if (castling.bQ && !board[this.idx(row0, 3)] && !board[this.idx(row0, 2)] && !board[this.idx(row0, 1)]) add(this.idx(row0, 2));
                }
            }
        }
        return moves;
    }

    applyMove(board, from, to, turn, enPassant) {
        const b = [...board];
        const p = b[from];
        if (p.toUpperCase() === 'P' && to === enPassant && !b[to]) {
            const dir = this.isWhite(p) ? 1 : -1;
            b[to + dir * 8] = '';
        }
        if (p.toUpperCase() === 'K') {
            const fromC = this.col(from), toC = this.col(to);
            if (Math.abs(fromC - toC) === 2) {
                const r0 = this.row(from);
                if (toC === 6) { b[this.idx(r0, 5)] = b[this.idx(r0, 7)]; b[this.idx(r0, 7)] = ''; }
                if (toC === 2) { b[this.idx(r0, 3)] = b[this.idx(r0, 0)]; b[this.idx(r0, 0)] = ''; }
            }
        }
        b[to] = p; b[from] = '';
        return b;
    }

    isInCheck(board, turn) {
        const k = turn === 'w' ? 'K' : 'k';
        const kingIdx = board.indexOf(k);
        if (kingIdx === -1) return false;
        const opp = turn === 'w' ? 'b' : 'w';
        for (let i = 0; i < 64; i++) {
            if (!board[i]) continue;
            if (this.isWhite(board[i]) && opp !== 'w') continue;
            if (this.isBlack(board[i]) && opp !== 'b') continue;
            const ms = this.rawMoves(i, board, opp, null, { wK: false, wQ: false, bK: false, bQ: false });
            if (ms.includes(kingIdx)) return true;
        }
        return false;
    }

    getLegalMoves(from) {
        const turn = this.turn;
        const raw = this.rawMoves(from, this.board, turn, this.enPassant, this.castling);
        const p = this.board[from];
        const legal = [];
        for (const to of raw) {
            if (p && p.toUpperCase() === 'K') {
                const fc = this.col(from), tc = this.col(to);
                if (Math.abs(fc - tc) === 2) {
                    const r0 = this.row(from);
                    const step = tc > fc ? 1 : -1;
                    if (this.isInCheck(this.board, turn)) continue;
                    const mid = this.applyMove(this.board, from, this.idx(r0, fc + step), turn, this.enPassant);
                    if (this.isInCheck(mid, turn)) continue;
                }
            }
            const nb = this.applyMove(this.board, from, to, turn, this.enPassant);
            if (!this.isInCheck(nb, turn)) legal.push(to);
        }
        return legal;
    }

    allLegalMoves() {
        const moves = [];
        const turn = this.turn;
        for (let i = 0; i < 64; i++) {
            if (!this.board[i]) continue;
            if (turn === 'w' && !this.isWhite(this.board[i])) continue;
            if (turn === 'b' && !this.isBlack(this.board[i])) continue;
            const ms = this.getLegalMoves(i);
            for (const to of ms) moves.push({ from: i, to });
        }
        return moves;
    }

    sqNote(i) {
        const c = this.col(i);
        const r = 8 - this.row(i);
        return 'abcdefgh'[c] + r;
    }

    makeMove(from, to, promoChoice = null) {
        const p = this.board[from];
        if (!p) return false;
        const legal = this.getLegalMoves(from);
        if (!legal.includes(to)) return false;
        if (!Security.validateMove(from, to, this.board)) return false;

        const captured = this.board[to];
        const isEnPassant = p.toUpperCase() === 'P' && to === this.enPassant && !this.board[to];
        let capturedPiece = captured;
        if (isEnPassant) {
            const dir = this.isWhite(p) ? 1 : -1;
            capturedPiece = this.board[to + dir * 8];
        }

        this.board = this.applyMove(this.board, from, to, this.turn, this.enPassant);

        const promoRow = this.isWhite(p) ? 0 : 7;
        if (p.toUpperCase() === 'P' && this.row(to) === promoRow) {
            const pc = promoChoice || 'Q';
            this.board[to] = this.isWhite(p) ? pc.toUpperCase() : pc.toLowerCase();
        }

        if (p === 'K') { this.castling.wK = false; this.castling.wQ = false; }
        if (p === 'k') { this.castling.bK = false; this.castling.bQ = false; }
        if (p === 'R') { if (from === 63) this.castling.wK = false; if (from === 56) this.castling.wQ = false; }
        if (p === 'r') { if (from === 7) this.castling.bK = false; if (from === 0) this.castling.bQ = false; }

        if (p.toUpperCase() === 'P' && Math.abs(this.row(from) - this.row(to)) === 2) {
            this.enPassant = Math.floor((from + to) / 2);
        } else {
            this.enPassant = null;
        }

        if (capturedPiece) {
            if (this.turn === 'w') this.capturedWhite.push(capturedPiece);
            else this.capturedBlack.push(capturedPiece);
        }

        let note = this.sqNote(from) + this.sqNote(to);
        if (capturedPiece) note = note[0] + 'x' + note.slice(1);
        this.moves.push({ from, to, piece: p, captured: capturedPiece, notation: note });
        this.lastFrom = from; this.lastTo = to;

        this.halfmoves++;
        if (capturedPiece || p.toUpperCase() === 'P') this.halfmoves = 0;

        this.turn = this.turn === 'w' ? 'b' : 'w';
        this._updateStatus();
        return true;
    }

    _updateStatus() {
        const all = this.allLegalMoves();
        const inCheck = this.isInCheck(this.board, this.turn);
        if (all.length === 0) {
            this.status = inCheck ? 'checkmate' : 'stalemate';
        } else if (this.halfmoves >= 100) {
            this.status = 'draw';
        } else if (inCheck) {
            this.status = 'check';
        } else {
            this.status = 'playing';
        }
    }

    isCheck() { return this.isInCheck(this.board, this.turn); }

    getAttackers() {
        const k = this.turn === 'w' ? 'K' : 'k';
        const kingIdx = this.board.indexOf(k);
        const opp = this.turn === 'w' ? 'b' : 'w';
        const attackers = [];
        for (let i = 0; i < 64; i++) {
            if (!this.board[i]) continue;
            const isOpp = opp === 'w' ? this.isWhite(this.board[i]) : this.isBlack(this.board[i]);
            if (!isOpp) continue;
            const ms = this.rawMoves(i, this.board, opp, null, { wK: false, wQ: false, bK: false, bQ: false });
            if (ms.includes(kingIdx)) attackers.push(i);
        }
        return attackers;
    }
}

// ============================================================
// BOT AI
// ============================================================
const Bot = {
    pieceValues: { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 },
    pst: {
        P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
        N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
        B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
        R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
        Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
        K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]
    },

    evaluate(board, game) {
        let score = 0;
        for (let i = 0; i < 64; i++) {
            const p = board[i];
            if (!p) continue;
            const t = p.toUpperCase();
            const val = this.pieceValues[t] || 0;
            const pstRow = game.isWhite(p) ? i : 63 - i;
            const pos = (this.pst[t] || [])[pstRow] || 0;
            if (game.isWhite(p)) score += val + pos;
            else score -= val + pos;
        }
        return score;
    },

    minimax(game, depth, alpha, beta, maximizing) {
        if (depth === 0 || game.status === 'checkmate' || game.status === 'stalemate' || game.status === 'draw') {
            if (game.status === 'checkmate') return maximizing ? -99999 : 99999;
            if (game.status === 'stalemate' || game.status === 'draw') return 0;
            return this.evaluate(game.board, game);
        }
        const moves = game.allLegalMoves();
        moves.sort((a, b) => (game.board[b.to] ? 1 : 0) - (game.board[a.to] ? 1 : 0));
        if (maximizing) {
            let best = -Infinity;
            for (const m of moves) {
                const s = this._saveState(game);
                game.makeMove(m.from, m.to, 'Q');
                const score = this.minimax(game, depth - 1, alpha, beta, false);
                this._restoreState(game, s);
                best = Math.max(best, score); alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return best;
        } else {
            let best = Infinity;
            for (const m of moves) {
                const s = this._saveState(game);
                game.makeMove(m.from, m.to, 'Q');
                const score = this.minimax(game, depth - 1, alpha, beta, true);
                this._restoreState(game, s);
                best = Math.min(best, score); beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return best;
        }
    },

    _saveState(game) {
        return {
            board: [...game.board], turn: game.turn, castling: { ...game.castling },
            enPassant: game.enPassant, halfmoves: game.halfmoves, status: game.status,
            moves: [...game.moves], capturedWhite: [...game.capturedWhite],
            capturedBlack: [...game.capturedBlack], lastFrom: game.lastFrom, lastTo: game.lastTo
        };
    },
    _restoreState(game, s) {
        Object.assign(game, s);
    },

    getDepth(r) { return r < 600 ? 2 : r < 1200 ? 3 : 4; },
    getRandomness(r) { return r < 300 ? 0.6 : r < 600 ? 0.4 : r < 900 ? 0.25 : r < 1200 ? 0.15 : 0.05; },

    getBestMove(game, playerRating) {
        const moves = game.allLegalMoves();
        if (moves.length === 0) return null;
        if (Math.random() < this.getRandomness(playerRating))
            return moves[Math.floor(Math.random() * moves.length)];
        const depth = this.getDepth(playerRating);
        let best = null, bestScore = Infinity;
        for (const m of moves) {
            const s = this._saveState(game);
            game.makeMove(m.from, m.to, 'Q');
            const score = this.minimax(game, depth - 1, -Infinity, Infinity, true);
            this._restoreState(game, s);
            if (score < bestScore) { bestScore = score; best = m; }
        }
        return best || moves[0];
    }
};

// ============================================================
// RATING SYSTEM
// ============================================================
const Rating = {
    getBotRating(r) { return Math.max(100, r + Math.floor((Math.random() - 0.5) * 100)); },
    kFactor(r) { return r < 600 ? 40 : r < 1200 ? 32 : r < 1800 ? 24 : 16; },
    calc(playerRating, oppRating, result) {
        const expected = 1 / (1 + Math.pow(10, (oppRating - playerRating) / 400));
        return Math.round(this.kFactor(playerRating) * (result - expected));
    },
    getTier(r) {
        if (r >= 2500) return { name: 'Crown', icon: '🤴🏼', class: 'tier-crown', color: '#F59E0B' };
        if (r >= 2201) return { name: 'Diamond', icon: '', class: 'tier-diamond', color: '#A78BFA' };
        if (r >= 1801) return { name: 'Emerald', icon: '🟢', class: 'tier-emerald', color: '#34D399' };
        if (r >= 1401) return { name: 'Platinum', icon: '🔷', class: 'tier-platinum', color: '#67E8F9' };
        if (r >= 1001) return { name: 'Gold', icon: '🥇', class: 'tier-gold', color: '#F59E0B' };
        if (r >= 501) return { name: 'Silver', icon: '🥈', class: 'tier-silver', color: '#94A3B8' };
        return { name: 'Bronze', icon: '🥉', class: 'tier-bronze', color: '#CD7C2F' };
    }
};

// ============================================================
// GAME UI
// ============================================================
let chess = null;
let botRating = 500;

function initBoard() {
    chess = new ChessGame();
    renderBoard();
    updateSidebar();
}

function renderBoard() {
    const board = document.getElementById('chessboard');
    board.innerHTML = '';
    // Flip board for black player in custom mode
    const flipped = (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined' && CustomMode.myColor === 'black');
    for (let vi = 0; vi < 64; vi++) {
        const i = flipped ? (63 - vi) : vi;
        const r = Math.floor(i / 8), c = i % 8;
        const sq = document.createElement('div');
        sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.idx = i;

        if (chess.lastFrom === i || chess.lastTo === i) sq.classList.add('last-move');
        if (chess.selected === i) sq.classList.add('selected');
        if (chess.legalMoves.includes(i)) {
            sq.classList.add(chess.board[i] ? 'hint-capture' : 'hint-move');
        }
        if ((chess.status === 'check' || chess.status === 'checkmate') && chess.isInCheck(chess.board, chess.turn)) {
            const k = chess.turn === 'w' ? 'K' : 'k';
            if (chess.board.indexOf(k) === i) sq.classList.add('check');
        }

        // FIX: piece rendered as Unicode emoji span with correct styling
        if (chess.board[i]) {
            const piece = document.createElement('div');
            piece.className = 'piece';
            const img = document.createElement('img');
            img.src = PIECE_IMAGES[chess.board[i]];
            img.style.cssText = 'width:88%; height:88%; object-fit:contain; pointer-events:none;';
            img.draggable = false;
            piece.appendChild(img);
            sq.appendChild(piece);
        }

        // Hint overlays — show in hintMode OR in custom/whiteboard modes
        const showHints = APP.hintMode || APP.gameMode === 'custom' || APP.gameMode === 'whiteboard';
        if (showHints && chess.legalMoves.includes(i)) {
            if (!chess.board[i]) {
                const dot = document.createElement('div');
                dot.className = 'hint-dot';
                sq.appendChild(dot);
            } else {
                const ring = document.createElement('div');
                ring.className = 'hint-ring';
                sq.appendChild(ring);
            }
        }

        // Show rank label on left edge (col 0 when normal, col 7 when flipped)
        const isLeftEdge = flipped ? (c === 7) : (c === 0);
        const isBottomEdge = flipped ? (r === 0) : (r === 7);
        if (isLeftEdge) {
            const lbl = document.createElement('span');
            lbl.className = 'sq-coord rank';
            lbl.textContent = 8 - r;
            sq.appendChild(lbl);
        }
        if (isBottomEdge) {
            const lbl = document.createElement('span');
            lbl.className = 'sq-coord file';
            lbl.textContent = 'abcdefgh'[c];
            sq.appendChild(lbl);
        }

        sq.addEventListener('click', () => handleSquareClick(i));
        board.appendChild(sq);
    }
}

function handleSquareClick(idx) {
    if (!chess || chess.status === 'checkmate' || chess.status === 'stalemate' || chess.status === 'draw') return;
    if (APP.gameMode === 'single' && chess.turn === 'b') return;

    const sq = chess.board[idx];
    const turn = chess.turn;

    if (chess.selected !== null) {
        if (chess.legalMoves.includes(idx)) {
            const p = chess.board[chess.selected];
            const promoRow = turn === 'w' ? 0 : 7;
            if (p && p.toUpperCase() === 'P' && Math.floor(idx / 8) === promoRow) {
                showPromotionModal(chess.selected, idx, turn);
                return;
            }
            executeMove(chess.selected, idx);
        } else {
            chess.selected = null;
            chess.legalMoves = [];
            if (sq && ((turn === 'w' && chess.isWhite(sq)) || (turn === 'b' && chess.isBlack(sq)))) {
                chess.selected = idx;
                chess.legalMoves = chess.getLegalMoves(idx);
            }
            renderBoard();
        }
    } else {
        if (sq && ((turn === 'w' && chess.isWhite(sq)) || (turn === 'b' && chess.isBlack(sq)))) {
            chess.selected = idx;
            chess.legalMoves = chess.getLegalMoves(idx);
            renderBoard();
        }
    }
}

function executeMove(from, to, promoChoice = null) {
    // Custom mode: only allow moving your own color pieces
    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        const myColor = CustomMode.myColor;
        const turnColor = chess?.turn === 'w' ? 'white' : 'black';
        if (myColor !== turnColor) return;
    }

    const wasCapture = !!chess.board[to];
    const wasCastle = chess.board[from]?.toUpperCase() === 'K' && Math.abs((from % 8) - (to % 8)) === 2;
    const wasPromo = chess.board[from]?.toUpperCase() === 'P' && Math.floor(to / 8) === (chess.turn === 'w' ? 0 : 7);
    const ok = chess.makeMove(from, to, promoChoice);
    if (!ok) return;

    // Broadcast move to opponent in custom mode
    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        CustomMode.broadcast('move', { from, to, promo: promoChoice || null });
    }

    // เสียงตามประเภทการเดิน
    if (wasPromo) Sound.promote();
    else if (wasCastle) Sound.castle();
    else if (wasCapture) Sound.capture();
    else Sound.move();

    chess.selected = null;
    chess.legalMoves = [];
    renderBoard();
    updateSidebar();

    // เสียง check หลัง render
    if (chess.status === 'check') setTimeout(() => Sound.check(), 150);

    checkGameOver();
    if (APP.gameMode === 'single' && (chess.status === 'playing' || chess.status === 'check') && chess.turn === 'b') {
        setTimeout(doBotMove, 400 + Math.random() * 600);
    }
}

function doBotMove() {
    if (!chess || chess.turn !== 'b') return;
    document.getElementById('bot-think').classList.add('active');
    setTimeout(() => {
        const m = Bot.getBestMove(chess, APP.player?.rating || 500);
        document.getElementById('bot-think').classList.remove('active');
        if (m) {
            const wasCapture = !!chess.board[m.to];
            const wasCastle = chess.board[m.from]?.toUpperCase() === 'K' && Math.abs((m.from % 8) - (m.to % 8)) === 2;
            chess.makeMove(m.from, m.to, 'Q');

            if (wasCastle) Sound.castle();
            else if (wasCapture) Sound.capture();
            else Sound.move();

            chess.selected = null;
            chess.legalMoves = [];
            renderBoard();
            updateSidebar();

            if (chess.status === 'check') setTimeout(() => Sound.check(), 150);
            checkGameOver();
        }
    }, 100);
}

function showPromotionModal(from, to, turn) {
    const pieces = ['Q', 'R', 'B', 'N'];
    const grid = document.getElementById('promo-grid');
    grid.innerHTML = '';
    pieces.forEach(pc => {
        const btn = document.createElement('button');
        btn.className = 'promo-btn';
        const img = document.createElement('img');
        img.src = PIECE_IMAGES[turn === 'w' ? pc : pc.toLowerCase()];
        img.style.cssText = 'width:48px; height:48px;';
        btn.appendChild(img);
        btn.onclick = () => {
            closeModal('promo-modal');
            executeMove(from, to, pc);
        };
        grid.appendChild(btn);
    });
    openModal('promo-modal');
}

function updateSidebar() {
    if (!chess) return;
    const statusEl = document.getElementById('status-bar');
    const turnName = chess.turn === 'w' ? 'White' : 'Black';
    if (chess.status === 'check') {
        statusEl.textContent = `${turnName} Check!`;
        statusEl.className = 'status-bar check-status';
    } else {
        statusEl.textContent = `${turnName} Turn`;
        statusEl.className = 'status-bar';
    }

    document.getElementById('row-white').className = 'player-row' + (chess.turn === 'w' ? ' active' : '');
    document.getElementById('row-black').className = 'player-row' + (chess.turn === 'b' ? ' active' : '');

    const wb = document.getElementById('warning-banner');
    if (APP.hintMode && chess.status === 'check') {
        const attackers = chess.getAttackers();
        const names = { R: 'รูค', N: 'ไนท์', B: 'บิชอป', Q: 'ควีน', P: 'เบี้ย' };
        const attackerNames = attackers.map(i => (names[chess.board[i].toUpperCase()] || chess.board[i]) + ' (' + chess.sqNote(i) + ')');
        document.getElementById('warning-text').textContent = `กษัตริย์โดน Check จาก: ${attackerNames.join(', ')}`;
        wb.style.display = 'flex';
    } else {
        wb.style.display = 'none';
    }

    // FIX: display captured pieces as Unicode characters
    const el = document.getElementById('captured-white');
    el.innerHTML = '';
    chess.capturedWhite.forEach(p => {
        const img = document.createElement('img');
        img.src = PIECE_IMAGES[p];
        img.style.cssText = 'width:22px; height:22px;';
        el.appendChild(img);
    });

    const elB = document.getElementById('captured-black');
    elB.innerHTML = '';
    chess.capturedBlack.forEach(p => {
        const img = document.createElement('img');
        img.src = PIECE_IMAGES[p];
        img.style.cssText = 'width:22px; height:22px;';
        elB.appendChild(img);
    });

    const ml = document.getElementById('move-list');
    ml.innerHTML = '';
    for (let i = 0; i < chess.moves.length; i += 2) {
        const div = document.createElement('div');
        div.className = 'move-pair';
        div.innerHTML = `<span class="move-num">${Math.floor(i / 2) + 1}.</span><span class="move-w">${chess.moves[i]?.notation || ''}</span><span class="move-b">${chess.moves[i + 1]?.notation || ''}</span>`;
        ml.appendChild(div);
    }
    ml.scrollTop = ml.scrollHeight;
}

function checkGameOver() {
    if (!chess) return;
    if (chess.status === 'checkmate' || chess.status === 'stalemate' || chess.status === 'draw') {
        setTimeout(() => showGameOver(chess.status), 300);
    }
}

async function showGameOver(status) {
    let title, sub, icon, result;
    const isWhiteWin = status === 'checkmate' && chess.turn === 'b';

    if (status === 'stalemate') { title = 'เสมอ — Stalemate'; sub = 'ไม่มีการเดินที่ถูกกฎ'; icon = '🤝'; result = 'draw'; }
    else if (status === 'draw') { title = 'เสมอ — 50-move rule'; sub = 'ไม่มีการกินหมากหรือเดินเบี้ยเกิน 50 ตา'; icon = '🤝'; result = 'draw'; }
    else if (isWhiteWin) { title = 'ขาวชนะ! Checkmate!'; sub = '♔ คุณรักษาตำแหน่งได้ดีมาก!'; icon = '🎉'; result = APP.gameMode === 'single' ? 'win' : 'white'; }
    else { title = 'ดำชนะ! Checkmate!'; sub = '♚ ลองใหม่อีกครั้งนะ!'; icon = '😓'; result = APP.gameMode === 'single' ? 'loss' : 'black'; }

    // เสียงผลลัพธ์
    if (result === 'draw') Sound.draw();
    else if (result === 'win' || (result === 'white' && APP.gameMode !== 'single') || result === 'black') {
        const iWin = (result === 'win') || (APP.gameMode === 'two' && result === 'white');
        setTimeout(() => iWin ? Sound.win() : Sound.lose(), 200);
    } else {
        setTimeout(() => Sound.lose(), 200);
    }

    let delta = 0;
    if (APP.gameMode === 'single' && APP.player && APP.gameMode !== 'whiteboard') {
        // Single player vs AI: +5 for win, 0 for draw/loss
        if (result === 'win') delta = 5;
        const ratingBefore = APP.player.rating;
        APP.player.rating = Math.max(0, APP.player.rating + delta);
        try {
            await DB.updateStats(APP.player.id, delta, result);
            await DB.logGame({ playerId: APP.player.id, opponent: 'Bot', result, movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'single' });
        } catch (e) { console.warn('DB update failed:', e); }
        updateMenuUI();

        if (delta !== 0) {
            const el = document.createElement('div');
            el.className = 'rating-delta';
            el.textContent = (delta >= 0 ? '+' : '') + delta;
            el.style.color = delta >= 0 ? 'var(--accent)' : 'var(--danger)';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2000);
        }
    }
    // Two-player (local) game: +10 for winner
    if (APP.gameMode === 'two' && result !== 'draw') {
        const winnerPlayer = result === 'white' ? APP.player : APP.player2;
        if (winnerPlayer && winnerPlayer.id) {
            const ratingBefore = winnerPlayer.rating;
            winnerPlayer.rating = Math.max(0, winnerPlayer.rating + 10);
            try {
                await DB.updateStats(winnerPlayer.id, 10, 'win');
                await DB.logGame({ playerId: winnerPlayer.id, opponent: result === 'white' ? (APP.player2?.nickname || 'P2') : APP.player.nickname, result: 'win', movesCount: chess.moves.length, ratingBefore, ratingAfter: winnerPlayer.rating, mode: 'two' });
            } catch (e) { console.warn('DB update failed:', e); }
            updateMenuUI();
        }
    }
    // Custom (online) game: +15 for winner (handled by the winner's client)
    if (APP.gameMode === 'custom' && APP.player && result !== 'draw') {
        const myColor = typeof CustomMode !== 'undefined' ? CustomMode.myColor : null;
        const iWon = (myColor === 'white' && result === 'white') || (myColor === 'black' && result === 'black');
        if (iWon) {
            const ratingBefore = APP.player.rating;
            APP.player.rating = Math.max(0, APP.player.rating + 15);
            try {
                await DB.updateStats(APP.player.id, 15, 'win');
                await DB.logGame({ playerId: APP.player.id, opponent: CustomMode?.opponentName || 'Opponent', result: 'win', movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'custom' });
            } catch (e) { console.warn('DB update failed:', e); }
            updateMenuUI();
        }
    }

    document.getElementById('gameover-icon').textContent = icon;
    document.getElementById('gameover-title').textContent = title;
    document.getElementById('gameover-sub').textContent = sub;
    const rEl = document.getElementById('gameover-rating');
    // Show rating info for the current player
    if (APP.gameMode === 'single' && delta !== 0) {
        rEl.textContent = (delta > 0 ? '+' : '') + delta + ' Rating → ' + APP.player?.rating;
        rEl.style.color = delta > 0 ? 'var(--accent)' : 'var(--danger)';
    } else if (APP.gameMode === 'two' && result !== 'draw') {
        const winnerP = result === 'white' ? APP.player : APP.player2;
        if (winnerP) {
            rEl.textContent = '+10 Rating → ' + winnerP.rating + ' (' + (winnerP.nickname || '') + ')';
            rEl.style.color = 'var(--accent)';
        } else { rEl.textContent = ''; }
    } else if (APP.gameMode === 'custom' && result !== 'draw') {
        const myColor = typeof CustomMode !== 'undefined' ? CustomMode.myColor : null;
        const iWon = myColor && ((myColor === 'white' && result === 'white') || (myColor === 'black' && result === 'black'));
        if (iWon) {
            rEl.textContent = '+15 Rating → ' + APP.player?.rating;
            rEl.style.color = 'var(--accent)';
        } else { rEl.textContent = ''; }
    } else { rEl.textContent = ''; }
    openModal('gameover-modal');
}

function playAgain() {
    closeModal('gameover-modal');
    if (APP.pendingMode === 'whiteboard') {
        startWhiteBoard();
    } else if (APP.pendingMode) {
        startGame(APP.pendingMode);
    }
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showPage(id) {
    if (id !== 'page-board' && APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        CustomMode.cleanup();
        APP.gameMode = null;
    }
    // Close all modals when navigating away from board
    if (id !== 'page-board') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ============================================================
// LOGIN
// ============================================================
async function handleLogin() {
    if (!Security.rateLimit('login', 20)) { showLoginError('ลองใหม่ใน 1 นาที'); return; }
    const email = document.getElementById('inp-email').value.trim();
    const nick = document.getElementById('inp-nick').value.trim();
    const emailErr = document.getElementById('err-email');
    const nickErr = document.getElementById('err-nick');
    emailErr.style.display = 'none'; nickErr.style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
    let valid = true;
    if (!Security.isEmail(email)) { emailErr.style.display = 'block'; valid = false; }
    if (!Security.isNick(nick)) { nickErr.style.display = 'block'; valid = false; }
    if (!valid) return;

    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'กำลังโหลด...';
    try {
        let player = await DB.getPlayer(email);
        if (!player) {
            const rows = await DB.upsertPlayer(email, Security.sanitize(nick));
            player = rows?.[0];
            if (!player) throw new Error('ไม่สามารถสร้างบัญชีได้');
        }
        APP.player = player;
        updateMenuUI();
        showPage('page-menu');
    } catch (e) {
        console.warn('DB unavailable, using local mode:', e);
        APP.player = {
            id: 'local-' + Date.now(),
            email: Security.sanitize(email).toLowerCase(),
            nickname: Security.sanitize(nick),
            rating: 0, wins: 0, losses: 0, draws: 0
        };
        updateMenuUI();
        showPage('page-menu');
    } finally {
        btn.disabled = false; btn.textContent = 'เริ่มเล่น →';
    }
}

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg; el.style.display = 'block';
}

function updateMenuUI() {
    const p = APP.player;
    if (!p) return;
    const initials = (p.nickname || 'P').slice(0, 2).toUpperCase();
    document.getElementById('menu-avatar').textContent = initials;
    document.getElementById('menu-name').textContent = Security.sanitize(p.nickname);
    document.getElementById('menu-rating').textContent = `Rating: ${p.rating} | W:${p.wins || 0} L:${p.losses || 0} D:${p.draws || 0}`;
    document.getElementById('white-avatar').textContent = initials;
}

function handleLogout() {
    const sub = document.getElementById('logout-modal-sub');
    if (chess && chess.status === 'playing') {
        sub.textContent = 'เกมกำลังดำเนินอยู่ ออกจากระบบจะยุติเกม';
    } else {
        sub.textContent = 'คุณต้องการออกจากระบบหรือไม่?';
    }
    openModal('logout-modal');
}

function doLogout() {
    closeModal('logout-modal');
    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        CustomMode.cleanup();
    }
    APP.player = null; APP.player2 = null; APP.gameMode = null; chess = null;
    document.getElementById('inp-email').value = '';
    document.getElementById('inp-nick').value = '';
    showPage('page-login');
}

// ============================================================
// GAME START FLOW
// ============================================================
function startSinglePlayer() { APP.pendingMode = 'single'; showPage('page-hint'); }
function startTwoPlayer() { APP.pendingMode = 'two'; showPage('page-hint'); }

function setHintMode(enabled) {
    APP.hintMode = enabled;
    if (APP.pendingMode === 'two') {
        // Show Player 2 login before starting
        document.getElementById('p1-name-display').textContent = Security.sanitize(APP.player?.nickname || '-');
        document.getElementById('inp-email-p2').value = '';
        document.getElementById('inp-nick-p2').value = '';
        document.getElementById('err-email-p2').style.display = 'none';
        document.getElementById('err-nick-p2').style.display = 'none';
        document.getElementById('login-error-p2').style.display = 'none';
        showPage('page-login-p2');
    } else {
        startGame(APP.pendingMode);
    }
}

async function handleLoginP2() {
    if (!Security.rateLimit('login_p2', 5)) return;
    const email = document.getElementById('inp-email-p2').value.trim();
    const nick = document.getElementById('inp-nick-p2').value.trim();
    const emailErr = document.getElementById('err-email-p2');
    const nickErr = document.getElementById('err-nick-p2');
    emailErr.style.display = 'none'; nickErr.style.display = 'none';
    let valid = true;
    if (!Security.isEmail(email)) { emailErr.style.display = 'block'; valid = false; }
    if (!Security.isNick(nick)) { nickErr.style.display = 'block'; valid = false; }
    if (!valid) return;

    // Prevent using same email as P1
    if (email.toLowerCase() === APP.player?.email?.toLowerCase()) {
        const errEl = document.getElementById('login-error-p2');
        errEl.textContent = 'ต้องใช้บัญชีคนละบัญชีกับผู้เล่น 1';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-login-p2');
    btn.disabled = true; btn.textContent = 'กำลังโหลด...';
    try {
        let player2 = await DB.getPlayer(email);
        if (!player2) {
            const rows = await DB.upsertPlayer(email, Security.sanitize(nick));
            player2 = rows?.[0];
            if (!player2) throw new Error('ไม่สามารถสร้างบัญชีได้');
        }
        APP.player2 = player2;
    } catch (e) {
        APP.player2 = {
            id: 'local2-' + Date.now(),
            email: Security.sanitize(email).toLowerCase(),
            nickname: Security.sanitize(nick),
            rating: 0, wins: 0, losses: 0, draws: 0
        };
    } finally {
        btn.disabled = false; btn.textContent = 'เริ่มเล่น';
    }
    startGame('two');
}

function startGame(mode) {
    APP.gameMode = mode;
    const p = APP.player;
    initBoard();

    // Always restore resign button when starting a game
    const resignBtn = document.getElementById('btn-resign-main');
    if (resignBtn) {
        resignBtn.style.display = '';
        resignBtn.textContent = 'ยอมแพ้';
        resignBtn.onclick = () => confirmResign();
    }

    // Restore history card, hide chat (custom mode will override)
    document.getElementById('history-card').style.display = '';
    document.getElementById('chat-card').style.display = 'none';
    document.getElementById('room-number-display').style.display = 'none';

    // Restore gameover modal buttons to default
    const btns = document.querySelector('#gameover-modal .modal-btns');
    if (btns) btns.innerHTML = `<button class="btn" onclick="playAgain()">เล่นอีกครั้ง</button><button class="btn btn-outline" onclick="showPage('page-menu')">เมนูหลัก</button>`;

    if (mode === 'single') {
        botRating = Rating.getBotRating(p.rating);
        document.getElementById('white-name').textContent = Security.sanitize(p.nickname);
        document.getElementById('white-rating').textContent = `Rating: ${p.rating}`;
        document.getElementById('black-name').textContent = 'AI';
        document.getElementById('black-rating').textContent = `Rating: ${botRating}`;
        document.getElementById('black-avatar').textContent = 'AI';
        document.getElementById('btn-draw').style.display = 'none';
    } else if (mode === 'two') {
        document.getElementById('white-name').textContent = Security.sanitize(p.nickname) + ' (ขาว)';
        document.getElementById('white-rating').textContent = `Rating: ${p.rating}`;
        const p2 = APP.player2;
        document.getElementById('black-name').textContent = Security.sanitize(p2?.nickname || 'ผู้เล่น 2') + ' (ดำ)';
        document.getElementById('black-rating').textContent = p2 ? `Rating: ${p2.rating}` : '';
        document.getElementById('black-avatar').textContent = p2 ? Security.sanitize(p2.nickname).slice(0,2).toUpperCase() : '♚';
        document.getElementById('btn-draw').style.display = 'none';
    }
    showPage('page-board');
}

function startWhiteBoard() {
    APP.gameMode = 'whiteboard';
    APP.hintMode = true;
    APP.pendingMode = 'whiteboard';
    initBoard();

    // ใน Whiteboard: เปลี่ยนปุ่ม "ยอมแพ้" ให้เป็นปุ่ม "ย้อนกลับ" ไปหน้าเมนูหลักแทน
    const resignBtn = document.getElementById('btn-resign-main');
    if (resignBtn) {
        resignBtn.style.display = '';
        resignBtn.textContent = 'ย้อนกลับ';
        resignBtn.onclick = () => showPage('page-menu');
    }
    document.getElementById('btn-draw').style.display = 'none';

    document.getElementById('white-name').textContent = 'ขาว';
    document.getElementById('white-rating').textContent = '';
    document.getElementById('black-name').textContent = 'ดำ';
    document.getElementById('black-rating').textContent = '';
    document.getElementById('black-avatar').textContent = '♚';
    document.getElementById('white-avatar').textContent = '♔';

    // Hide history card (ไม่มี history)
    document.getElementById('history-card').style.display = 'none';
    document.getElementById('chat-card').style.display = 'none';
    document.getElementById('room-number-display').style.display = 'none';

    showPage('page-board');
}

// FIX: this function was missing its "function offerDraw() {" opening line
// and closing "}" — that orphaned code (a bare `return` + statements outside
// any function) was a syntax error that broke parsing of the ENTIRE file,
// which is why handleLogin() and everything else appeared "not defined".
function offerDraw() {
    // Only available in custom mode
    if (APP.gameMode !== 'custom' || typeof CustomMode === 'undefined') return;
    // Broadcast draw offer to opponent
    CustomMode.broadcast('draw_offer', {
        nickname: APP.player?.nickname || 'Player'
    });
    // Disable draw button temporarily to prevent spam
    const btn = document.getElementById('btn-draw');
    if (btn) { btn.disabled = true; btn.textContent = 'รอคำตอบ...'; }
    setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = 'ขอเสมอ'; }
    }, 15000);
}

function acceptDraw() {
    closeModal('draw-offer-modal');
    CustomMode.broadcast('draw_accepted', {});
    // Both sides go to main menu
    showPage('page-menu');
}

function declineDraw() {
    closeModal('draw-offer-modal');
    CustomMode.broadcast('draw_declined', { nickname: APP.player?.nickname || 'Player' });
}
function confirmResign() { openModal('resign-modal'); }
function doResign() {
    closeModal('resign-modal');
    // Hide resign button for the one who resigned (prevent double resign)
    document.getElementById('btn-resign-main').style.display = 'none';

    const loser = chess.turn === 'w' ? 'ขาว' : 'ดำ';

    if (APP.gameMode === 'single' && chess.turn === 'w') {
        // Resign/quit: -20 penalty, floor at 0
        const ratingBefore = APP.player.rating;
        const delta = -Math.min(20, APP.player.rating);
        APP.player.rating = Math.max(0, APP.player.rating - 20);
        DB.updateStats(APP.player.id, delta, 'loss').catch(() => { });
        DB.logGame({ playerId: APP.player.id, opponent: 'Bot', result: 'resign', movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'single' }).catch(() => { });
        updateMenuUI();
    }

    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        // Custom: -10 rating penalty for resigner
        if (APP.player) {
            const ratingBefore = APP.player.rating;
            const delta = -Math.min(20, APP.player.rating);
            APP.player.rating = Math.max(0, APP.player.rating - 20);
            DB.updateStats(APP.player.id, delta, 'loss').catch(() => { });
            DB.logGame({ playerId: APP.player.id, opponent: CustomMode.opponentName || 'Opponent', result: 'resign', movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'custom' }).catch(() => { });
        }
        CustomMode.broadcast('resign', {
            color: CustomMode.myColor,
            nickname: APP.player?.nickname || 'Player'
        });
        showPage('page-menu');
        return;
    }

    if (APP.gameMode === 'two') {
        // 2 Player: -10 to whoever resigned (current turn = loser)
        const losingPlayer = chess.turn === 'w' ? APP.player : APP.player2;
        if (losingPlayer && losingPlayer.id) {
            const ratingBefore = losingPlayer.rating;
            const delta = -Math.min(20, losingPlayer.rating);
            losingPlayer.rating = Math.max(0, losingPlayer.rating - 20);
            DB.updateStats(losingPlayer.id, delta, 'loss').catch(() => { });
            DB.logGame({ playerId: losingPlayer.id, opponent: chess.turn === 'w' ? (APP.player2?.nickname || 'P2') : APP.player.nickname, result: 'resign', movesCount: chess.moves.length, ratingBefore, ratingAfter: losingPlayer.rating, mode: 'two' }).catch(() => { });
            updateMenuUI();
        }
    }

    document.getElementById('gameover-icon').textContent = '🏳';
    document.getElementById('gameover-title').textContent = `${loser} ยอมแพ้`;
    document.getElementById('gameover-sub').textContent = 'ขอบคุณสำหรับเกมดีๆ';
    document.getElementById('gameover-rating').textContent = '-20 Rating';
    document.getElementById('gameover-rating').style.color = 'var(--danger)';
    openModal('gameover-modal');
}

// ============================================================
// RANKING
// ============================================================
async function showRanking() {
    showPage('page-ranking');
    const p = APP.player;
    const tier = Rating.getTier(p.rating);
    document.getElementById('my-tier-card').innerHTML = `
        <div class="tier-icon">${tier.icon}</div>
        <div class="tier-info">
            <h3 style="color:${tier.color}">${tier.name}</h3>
            <p>Rating ของคุณ: <strong>${p.rating}</strong> | Win:${p.wins || 0} Lose:${p.losses || 0} Draw:${p.draws || 0}</p>
        </div>`;

    const listEl = document.getElementById('ranking-list');
    listEl.innerHTML = '<div class="spinner"></div><div class="loading-text">กำลังโหลด...</div>';
    let rows = [];
    try { rows = await DB.getLeaderboard(100); }
    catch (e) { rows = [{ nickname: p.nickname, email: p.email, rating: p.rating, wins: p.wins || 0, losses: p.losses || 0 }]; }

    if (!rows || rows.length === 0) { listEl.innerHTML = '<div class="loading-text">ยังไม่มีข้อมูลผู้เล่น</div>'; return; }

    const tiers = [
        { label: 'Crown 👑', min: 2500, max: 9999, class: 'tier-crown' },
        { label: 'Diamond 💎', min: 2201, max: 2499, class: 'tier-diamond' },
        { label: 'Emerald 🟢', min: 1801, max: 2200, class: 'tier-emerald' },
        { label: 'Platinum 🔷', min: 1401, max: 1800, class: 'tier-platinum' },
        { label: 'Gold 🥇', min: 1001, max: 1400, class: 'tier-gold' },
        { label: 'Silver 🥈', min: 501, max: 1000, class: 'tier-silver' },
        { label: 'Bronze 🥉', min: 100, max: 500, class: 'tier-bronze' },
        { label: 'Unranked ⚪', min: 0, max: 99, class: 'tier-unranked' }
    ];

    let html = ''; let rank = 1;
    for (const t of tiers) {
        const members = rows.filter(r => r.rating >= t.min && r.rating <= t.max);
        if (members.length === 0) continue;
        html += `<div class="tier-section"><div class="tier-header ${t.class}">${t.label}</div><div class="tier-rows">`;
        members.forEach(m => {
            const isMe = m.email === p.email || m.nickname === p.nickname;
            const posClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
            const posIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            const tc = Rating.getTier(m.rating);
            html += `<div class="rank-row">
                <span class="rank-pos ${posClass}">${posIcon}</span>
                <div class="rank-avatar" style="background:${tc.color}33;color:${tc.color}">${Security.sanitize(m.nickname || '?').slice(0, 2).toUpperCase()}</div>
                <span class="rank-name">${Security.sanitize(m.nickname || '?')}${isMe ? ' <span class="rank-you">คุณ</span>' : ''}</span>
                <span class="rank-rating" style="color:${tc.color}">${m.rating}</span>
            </div>`;
            rank++;
        });
        html += `</div></div>`;
    }
    listEl.innerHTML = html || '<div class="loading-text">ไม่มีข้อมูล</div>';
}

// ============================================================
// KEYBOARD
// ============================================================
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});
document.getElementById('inp-nick').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('inp-email').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('inp-nick-p2').addEventListener('keydown', e => { if (e.key === 'Enter') handleLoginP2(); });
document.getElementById('inp-email-p2').addEventListener('keydown', e => { if (e.key === 'Enter') handleLoginP2(); });

// ============================================================
// CUSTOM MODE — ONLINE MULTIPLAYER + REALTIME CHAT
// ============================================================

// Uses Supabase Realtime (Broadcast) — no extra DB table needed.
// Room codes are 4-digit numbers stored as Supabase broadcast channels.
// We also store active rooms in localStorage so joins can verify existence.

const CustomMode = {
    channel: null,
    roomCode: null,
    myColor: null,     // 'white' | 'black'
    opponentName: null,
    isBuilder: false,
    chatMessages: [],

    // Generate a unique 4-digit room code
    generateRoomCode() {
        // Use crypto for true randomness
        const arr = new Uint16Array(1);
        crypto.getRandomValues(arr);
        const code = String(1000 + (arr[0] % 9000)).padStart(4, '0');
        return code;
    },

    // Get the Supabase Realtime URL for a room
    channelName(code) {
        return `chess-room-${code}`;
    },

    // Start as builder: create a room, wait for opponent
    async build() {
        const code = this.generateRoomCode();
        this.roomCode = code;
        this.myColor = 'white';
        this.isBuilder = true;

        // Show waiting overlay
        document.getElementById('waiting-room-code').textContent = code;
        document.getElementById('waiting-overlay').style.display = 'flex';

        this._subscribe(code, 'builder');
    },

    // Join an existing room
    async join(code) {
        this.roomCode = code;
        this.myColor = 'black';
        this.isBuilder = false;
        this._subscribe(code, 'joiner');
    },

    _subscribe(code, role) {
        // Clean up any previous channel
        if (this.channel) {
            try { this.channel.unsubscribe(); } catch(e) {}
            this.channel = null;
        }

        // Create Supabase Realtime channel via raw WebSocket-style broadcast
        // We use the Supabase REST-compatible realtime endpoint
        const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';

        const ws = new WebSocket(wsUrl);
        this._ws = ws;
        this._pendingMessages = [];
        this._wsReady = false;
        const channelTopic = 'realtime:chess-room-' + code;
        const self = this;

        ws.onopen = () => {
            // Join channel
            ws.send(JSON.stringify({
                topic: channelTopic,
                event: 'phx_join',
                payload: { config: { broadcast: { self: false }, presence: { key: APP.player?.nickname || 'player' } } },
                ref: '1'
            }));
        };

        ws.onmessage = (evt) => {
            let msg;
            try { msg = JSON.parse(evt.data); } catch(e) { return; }

            if (msg.event === 'phx_reply' && msg.ref === '1') {
                // Successfully joined channel
                self._wsReady = true;
                if (role === 'joiner') {
                    // Announce joining
                    self._sendWS(channelTopic, 'player_joined', {
                        nickname: APP.player?.nickname || 'Player',
                        color: 'black'
                    });
                }
            }

            if (msg.event === 'broadcast' && msg.payload?.type) {
                self._handleEvent(msg.payload.type, msg.payload.data || {});
            }
        };

        ws.onerror = (e) => {
            console.warn('WS error', e);
        };

        ws.onclose = () => {
            if (self._active) {
                self._addSystemMsg('การเชื่อมต่อขาดหาย');
            }
        };

        this._channelTopic = channelTopic;
        this._active = true;
    },

    _sendWS(topic, type, data) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
        this._ws.send(JSON.stringify({
            topic: topic || this._channelTopic,
            event: 'broadcast',
            payload: { type, data },
            ref: String(Date.now())
        }));
    },

    broadcast(type, data) {
        this._sendWS(this._channelTopic, type, data);
    },

    _handleEvent(type, data) {
        switch(type) {
            case 'player_joined':
                this._onOpponentJoined(data);
                break;
            case 'move':
                this._onOpponentMove(data);
                break;
            case 'chat':
                this._onChatReceived(data);
                break;
            case 'resign':
                this._onOpponentResign(data);
                break;
            case 'draw_offer':
                this._onDrawOffer(data);
                break;
            case 'draw_accepted':
                // Opponent accepted — I offered the draw, now go to menu
                closeModal('draw-offer-modal');
                showPage('page-menu');
                break;
            case 'draw_declined':
                // Opponent declined — reset my draw button
                const btn = document.getElementById('btn-draw');
                if (btn) { btn.disabled = false; btn.textContent = 'ขอเสมอ'; }
                this._addSystemMsg('' + Security.sanitize(data.nickname || 'คู่แข่ง') + ' ปฏิเสธการขอเสมอ');
                break;
            case 'game_over':
                break;
        }
    },

    _onDrawOffer(data) {
        const nick = Security.sanitize(data.nickname || 'คู่แข่ง');
        document.getElementById('draw-offer-text').textContent = `${nick} ขอเสมอ — คุณยอมรับหรือไม่?`;
        openModal('draw-offer-modal');
    },

    _onOpponentResign(data) {
        // Opponent resigned — I win, show modal with "end game" button (no rating loss for me)
        const resignerColor = data.color === 'white' ? 'ขาว' : 'ดำ';
        const resignerNick = Security.sanitize(data.nickname || 'คู่แข่ง');
        document.getElementById('gameover-icon').textContent = '🏆';
        document.getElementById('gameover-title').textContent = `${resignerColor} ยอมแพ้!`;
        document.getElementById('gameover-sub').textContent = `${resignerNick} ยอมแพ้ — คุณชนะ!`;
        document.getElementById('gameover-rating').textContent = '';
        // Replace modal buttons: only show "จบเกม" (end game) button for winner
        const btns = document.querySelector('#gameover-modal .modal-btns');
        btns.innerHTML = `<button class="btn btn-outline" onclick="showPage('page-menu')">จบเกม</button>`;
        openModal('gameover-modal');
    },

    _onOpponentJoined(data) {
        // Builder receives this when opponent joins
        if (this.isBuilder) {
            this.opponentName = data.nickname || 'Player 2';
            // Hide waiting overlay
            document.getElementById('waiting-overlay').style.display = 'none';
            // Start the game for builder
            this._launchGame();
            // Tell joiner to start too
            this.broadcast('player_joined_ack', {
                nickname: APP.player?.nickname || 'Player 1',
                color: 'white'
            });
        }
    },

    _launchGame() {
        const myNick = Security.sanitize(APP.player?.nickname || 'You');
        const oppNick = Security.sanitize(this.opponentName || 'Opponent');

        APP.gameMode = 'custom';
        APP.hintMode = false;
        initBoard();

        // Restore resign button
        const resignBtn = document.getElementById('btn-resign-main');
        if (resignBtn) {
            resignBtn.style.display = '';
            resignBtn.textContent = 'ยอมแพ้';
            resignBtn.onclick = () => confirmResign();
        }

        // Restore gameover modal buttons
        const btns = document.querySelector('#gameover-modal .modal-btns');
        if (btns) btns.innerHTML = `<button class="btn" onclick="playAgain()">เล่นอีกครั้ง</button><button class="btn btn-outline" onclick="showPage('page-menu')">เมนูหลัก</button>`;

        document.getElementById('white-name').textContent = this.myColor === 'white' ? myNick : oppNick;
        document.getElementById('white-rating').textContent = '';
        document.getElementById('black-name').textContent = this.myColor === 'black' ? myNick : oppNick;
        document.getElementById('black-rating').textContent = '';
        document.getElementById('black-avatar').textContent = '♚';
        document.getElementById('white-avatar').textContent = (APP.player?.nickname || 'P').slice(0,2).toUpperCase();
        document.getElementById('btn-draw').style.display = 'inline-block';
        document.getElementById('btn-draw').disabled = false;
        document.getElementById('btn-draw').textContent = 'ขอเสมอ';

        // Show color indicator for current player
        const colorDot = this.myColor === 'white' ? '⬜' : '⬛';
        const colorTH = this.myColor === 'white' ? 'ขาว' : 'ดำ';

        // Show room code + color indicator in topbar
        const roomDisplay = document.getElementById('room-number-display');
        roomDisplay.textContent = `🔑 ${this.roomCode}`;
        roomDisplay.style.display = 'inline-block';

        // Show chat, hide history
        document.getElementById('history-card').style.display = 'none';
        document.getElementById('chat-card').style.display = 'flex';
        document.getElementById('room-badge').textContent = 'ห้อง #' + this.roomCode;

        // Clear chat and add color announcement
        this.chatMessages = [];
        document.getElementById('chat-messages').innerHTML = '';
        this._addSystemMsg(`🎮 เชื่อมต่อห้อง #${this.roomCode} สำเร็จ!`);
        this._addSystemMsg(`${colorDot} คุณเล่นเป็นฝ่าย${colorTH}`);

        showPage('page-board');
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    },

    _onOpponentMove(data) {
        if (!chess) return;
        const { from, to, promo } = data;
        if (typeof from === 'number' && typeof to === 'number') {
            const wasCapture = !!chess.board[to];
            const wasCastle = chess.board[from]?.toUpperCase() === 'K' && Math.abs((from % 8) - (to % 8)) === 2;
            const ok = chess.makeMove(from, to, promo || null);
            if (ok) {
                if (wasCastle) Sound.castle();
                else if (wasCapture) Sound.capture();
                else Sound.move();
                chess.selected = null;
                chess.legalMoves = [];
                renderBoard();
                updateSidebar();
                if (chess.status === 'check') setTimeout(() => Sound.check(), 150);
                checkGameOver();
            }
        }
    },

    _onChatReceived(data) {
        const { nickname, message } = data;
        if (!message) return;
        this._addMsg(Security.sanitize(nickname || 'Opponent'), Security.sanitize(message), 'them');
    },

    sendChat(message) {
        const clean = Security.sanitize(message).slice(0, 200);
        if (!clean) return;
        this._addMsg(Security.sanitize(APP.player?.nickname || 'You'), clean, 'me');
        this.broadcast('chat', {
            nickname: APP.player?.nickname || 'Player',
            message: clean
        });
    },

    _addMsg(name, text, type) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'chat-msg ' + type;
        if (type !== 'system') {
            const nameEl = document.createElement('div');
            nameEl.className = 'chat-msg-name';
            nameEl.textContent = name;
            div.appendChild(nameEl);
        }
        const textEl = document.createElement('div');
        textEl.textContent = text;
        div.appendChild(textEl);
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    _addSystemMsg(text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'chat-msg system';
        div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    cleanup() {
        this._active = false;
        if (this._ws) {
            try { this._ws.close(); } catch(e) {}
            this._ws = null;
        }
        this.channel = null;
        this.roomCode = null;
        this.myColor = null;
        this.isBuilder = false;

        // Restore history, hide chat
        document.getElementById('history-card').style.display = '';
        document.getElementById('chat-card').style.display = 'none';
        document.getElementById('room-number-display').style.display = 'none';
    }
};

// ---- UI Functions for Custom Mode ----

function showCustomMenu() {
    document.getElementById('join-panel').style.display = 'none';
    document.getElementById('join-error').style.display = 'none';
    document.getElementById('join-room-input').value = '';
    showPage('page-custom');
}

function showJoinPanel() {
    const panel = document.getElementById('join-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display !== 'none') {
        setTimeout(() => document.getElementById('join-room-input').focus(), 100);
    }
}

async function startCustomBuild() {
    await CustomMode.build();
}

async function joinCustomRoom() {
    const code = document.getElementById('join-room-input').value.trim();
    const errEl = document.getElementById('join-error');

    if (!/^\d{4}$/.test(code)) {
        errEl.textContent = 'กรุณาใส่รหัสห้อง 4 หลัก (ตัวเลขเท่านั้น)';
        errEl.style.display = 'block';
        return;
    }

    errEl.style.display = 'none';
    CustomMode.opponentName = 'Builder';

    // Subscribe as joiner — the builder will respond
    await CustomMode.join(code);

    // Wait briefly for WS connection to establish, then send joined event
    // The _subscribe method will auto-send player_joined once WS is ready
    // We patch _onOpponentJoined to also handle joiner receiving ack
    const origHandle = CustomMode._handleEvent.bind(CustomMode);
    CustomMode._handleEvent = function(type, data) {
        if (type === 'player_joined_ack' && !CustomMode.isBuilder) {
            CustomMode.opponentName = data.nickname || 'Player 1';
            CustomMode._launchGame();
        } else {
            origHandle(type, data);
        }
    };

    // Show a brief waiting state
    const btn = document.querySelector('#join-panel .btn');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังเชื่อมต่อ...'; }
    setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = 'เข้าร่วม'; }
    }, 8000);
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = (input?.value || '').trim();
    if (!msg) return;
    CustomMode.sendChat(msg);
    input.value = '';
}

function copyRoomCode() {
    const code = CustomMode.roomCode;
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    const btn = document.querySelector('.copy-btn');
    if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'คัดลอกแล้ว!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    }
}


// Custom mode cleanup on navigation/logout is handled
// by checking APP.gameMode === 'custom' inside existing functions

// ============================================================
// CHECKERS — open checkers.html in new tab
// ============================================================
function openCheckers() {
    window.open('checkers.html', '_blank');
}

// ============================================================
// EXPOSE TO WINDOW
// This file is loaded as an ES module by Vite (src/main.js), so
// top-level functions are no longer implicitly global. index.html
// still calls these via inline onclick="..." attributes, so we
// attach them to window explicitly to keep all existing markup working.
// ============================================================
Object.assign(window, {
    acceptDraw, closeModal, confirmResign, copyRoomCode, declineDraw,
    doLogout, doResign, handleLogin, handleLoginP2, handleLogout,
    joinCustomRoom, offerDraw, openCheckers, playAgain, sendChatMessage,
    setHintMode, showCustomMenu, showJoinPanel, showPage, showRanking,
    startCustomBuild, startSinglePlayer, startTwoPlayer, startWhiteBoard,
});