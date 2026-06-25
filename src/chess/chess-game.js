import { Security } from './security.js';

// ============================================================
// CHESS ENGINE
// ============================================================
export class ChessGame {
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
