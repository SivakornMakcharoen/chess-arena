// ============================================================
// BOT AI
//
// Search stack:
//   - Negamax + alpha-beta over a lightweight, allocation-light
//     position representation (no full ChessGame clone/restore per node)
//   - Quiescence search at the leaves (captures only) to kill the
//     horizon effect (e.g. bot happily hangs a queen because the
//     recapture was just past the search horizon)
//   - Transposition table (keyed by board+turn+castling+enPassant)
//     for cutoffs and, just as importantly, move ordering across
//     iterative-deepening passes
//   - MVV-LVA ordering for captures, TT move tried first
//   - Iterative deepening with a wall-clock deadline so we can go
//     as deep as time allows and always have a usable move ready
// ============================================================

const MATE_SCORE = 1_000_000;
const DRAW_SCORE = 0;

export const Bot = {
    pieceValues: { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 },
    pst: {
        P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
        N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
        B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
        R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
        Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
        K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
        // King PST for the endgame, where the king should march to the centre.
        K_ENDGAME: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
    },

    // ------------------------------------------------------------
    // Static evaluation (positive = good for White), taking a raw
    // board array. Uses a tapered king PST based on how much
    // material is left on the board (opening/middlegame vs endgame).
    // ------------------------------------------------------------
    evaluate(board) {
        let score = 0;
        let nonPawnMaterial = 0;
        for (let i = 0; i < 64; i++) {
            const p = board[i];
            if (!p) continue;
            const t = p.toUpperCase();
            if (t !== 'P' && t !== 'K') nonPawnMaterial += this.pieceValues[t] || 0;
        }
        // Rough endgame signal: little material left on the board besides kings/pawns.
        const isEndgame = nonPawnMaterial <= 1300 * 2;

        for (let i = 0; i < 64; i++) {
            const p = board[i];
            if (!p) continue;
            const isWhite = p === p.toUpperCase();
            const t = p.toUpperCase();
            const val = this.pieceValues[t] || 0;
            const pstRow = isWhite ? i : 63 - i;
            const table = (t === 'K' && isEndgame) ? this.pst.K_ENDGAME : this.pst[t];
            const pos = (table || [])[pstRow] || 0;
            if (isWhite) score += val + pos;
            else score -= val + pos;
        }
        return score;
    },

    // ------------------------------------------------------------
    // Lightweight, allocation-cheap move generation / make-move that
    // works on plain {board, turn, castling, enPassant, halfmoves}
    // state objects instead of cloning/restoring the whole ChessGame
    // instance (moves list, captured arrays, notation, etc.) on every
    // single search node like the old minimax did.
    // ------------------------------------------------------------
    _genMoves(game, state, capturesOnly) {
        const { board, turn, castling, enPassant } = state;
        const moves = [];
        for (let i = 0; i < 64; i++) {
            const p = board[i];
            if (!p) continue;
            if (turn === 'w' ? p !== p.toUpperCase() : p !== p.toLowerCase()) continue;

            const raw = game.rawMoves(i, board, turn, enPassant, castling);
            for (const to of raw) {
                const isCapture = !!board[to] || (p.toUpperCase() === 'P' && to === enPassant);

                if (p.toUpperCase() === 'K') {
                    const fc = game.col(i), tc = game.col(to);
                    if (Math.abs(fc - tc) === 2) {
                        // Castling is never a capture — skip entirely in quiescence search.
                        if (capturesOnly) continue;
                        if (game.isInCheck(board, turn)) continue;
                        const r0 = game.row(i);
                        const step = tc > fc ? 1 : -1;
                        const mid = game.applyMove(board, i, game.idx(r0, fc + step), turn, enPassant);
                        if (game.isInCheck(mid, turn)) continue;
                        moves.push({ from: i, to, capture: false });
                        continue;
                    }
                }

                if (capturesOnly && !isCapture) continue;

                const nb = game.applyMove(board, i, to, turn, enPassant);
                if (!game.isInCheck(nb, turn)) moves.push({ from: i, to, capture: isCapture });
            }
        }
        return moves;
    },

    _makeMove(game, state, m) {
        const { board, turn, castling, enPassant, halfmoves } = state;
        const from = m.from, to = m.to;
        const p = board[from];
        const isPawn = p.toUpperCase() === 'P';
        const isEnPassant = isPawn && to === enPassant && !board[to];
        let capturedPiece = board[to];
        if (isEnPassant) {
            const dir = (p === p.toUpperCase()) ? 1 : -1;
            capturedPiece = board[to + dir * 8];
        }

        const nb = game.applyMove(board, from, to, turn, enPassant);

        const isWhite = p === p.toUpperCase();
        const promoRow = isWhite ? 0 : 7;
        if (isPawn && Math.floor(to / 8) === promoRow) {
            nb[to] = isWhite ? 'Q' : 'q';
        }

        const newCastling = { ...castling };
        if (p === 'K') { newCastling.wK = false; newCastling.wQ = false; }
        if (p === 'k') { newCastling.bK = false; newCastling.bQ = false; }
        if (from === 63 || to === 63) newCastling.wK = false;
        if (from === 56 || to === 56) newCastling.wQ = false;
        if (from === 7 || to === 7) newCastling.bK = false;
        if (from === 0 || to === 0) newCastling.bQ = false;

        let newEnPassant = null;
        if (isPawn && Math.abs(Math.floor(from / 8) - Math.floor(to / 8)) === 2) {
            newEnPassant = Math.floor((from + to) / 2);
        }

        const newHalfmoves = (capturedPiece || isPawn) ? 0 : halfmoves + 1;

        return {
            board: nb,
            turn: turn === 'w' ? 'b' : 'w',
            castling: newCastling,
            enPassant: newEnPassant,
            halfmoves: newHalfmoves,
            capturedPiece
        };
    },

    _stateKey(state) {
        const c = state.castling;
        return state.board.join('') + state.turn +
            (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') +
            '|' + (state.enPassant === null ? '-' : state.enPassant);
    },

    // MVV-LVA: highest-value victim, lowest-value attacker first.
    _orderMoves(game, state, moves, ttMove) {
        const scored = moves.map(m => {
            let s = 0;
            if (ttMove && m.from === ttMove.from && m.to === ttMove.to) {
                s = 1_000_000;
            } else if (m.capture) {
                const attacker = state.board[m.from];
                const victim = state.board[m.to] || (attacker.toUpperCase() === 'P' ? (attacker === attacker.toUpperCase() ? 'p' : 'P') : '');
                const vVal = this.pieceValues[(victim || '').toUpperCase()] || 100; // en passant victim is a pawn
                const aVal = this.pieceValues[attacker.toUpperCase()] || 0;
                s = 10_000 + vVal * 10 - aVal;
            }
            return { m, s };
        });
        scored.sort((a, b) => b.s - a.s);
        return scored.map(x => x.m);
    },

    // ------------------------------------------------------------
    // Quiescence search: only follow up captures until the position
    // is "quiet", using a stand-pat cutoff. This is what fixes the
    // horizon effect (e.g. bot trading a queen for a pawn because the
    // recapture happened to fall one ply beyond the main search).
    // ------------------------------------------------------------
    _quiesce(game, state, alpha, beta, color, deadline, qPly) {
        if (deadline && (qPly & 7) === 0 && Date.now() >= deadline) return null;

        const standPat = color * this.evaluate(state.board);
        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;
        if (qPly >= 8) return alpha; // hard cap so a capture-heavy line can't run away

        const moves = this._genMoves(game, state, true);
        const ordered = this._orderMoves(game, state, moves, null);

        for (const m of ordered) {
            const next = this._makeMove(game, state, m);
            const score = -this._quiesce(game, next, -beta, -alpha, -color, deadline, qPly + 1);
            if (score === null) return null;
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }
        return alpha;
    },

    // ------------------------------------------------------------
    // Negamax with alpha-beta, transposition table, and quiescence
    // search at the horizon.
    // ------------------------------------------------------------
    _negamax(game, state, depth, alpha, beta, color, deadline, ply, tt) {
        if (deadline && Date.now() >= deadline) return null;

        const origAlpha = alpha;
        const key = this._stateKey(state);
        const tte = tt.get(key);
        if (tte && tte.depth >= depth) {
            if (tte.flag === 'exact') return tte.score;
            if (tte.flag === 'lower') alpha = Math.max(alpha, tte.score);
            else beta = Math.min(beta, tte.score);
            if (alpha >= beta) return tte.score;
        }

        const moves = this._genMoves(game, state, false);

        if (moves.length === 0) {
            const inCheck = game.isInCheck(state.board, state.turn);
            return inCheck ? -(MATE_SCORE - ply) : DRAW_SCORE;
        }
        if (state.halfmoves >= 100) return DRAW_SCORE;

        if (depth === 0) {
            return this._quiesce(game, state, alpha, beta, color, deadline, 0);
        }

        const ordered = this._orderMoves(game, state, moves, tte && tte.move);

        let best = -Infinity;
        let bestMove = null;
        for (const m of ordered) {
            const next = this._makeMove(game, state, m);
            const score = -this._negamax(game, next, depth - 1, -beta, -alpha, -color, deadline, ply + 1, tt);
            if (score === null) return null;
            if (score > best) { best = score; bestMove = m; }
            if (best > alpha) alpha = best;
            if (alpha >= beta) break; // beta cutoff
        }

        // Don't cache near-mate scores keyed on this ply — the same
        // position reached at a different ply would need a different
        // mate distance, and this is a casual game engine, not a
        // tournament one, so we simply skip caching those.
        if (Math.abs(best) < MATE_SCORE - 1000) {
            const flag = best <= origAlpha ? 'upper' : best >= beta ? 'lower' : 'exact';
            tt.set(key, { depth, score: best, flag, move: bestMove });
        }

        return best;
    },

    // ------------------------------------------------------------
    // Difficulty tuning. Levels correspond to the exact rating values
    // used by the difficulty picker in the UI (100 / 300 / 500 / 900 /
    // 1100 / 1200 / 1500).
    // ------------------------------------------------------------
    getDepth(r) {
        if (r < 300) return 1;
        if (r < 500) return 2;
        if (r < 900) return 3;
        if (r < 1100) return 4;
        if (r < 1200) return 5;
        return 6; // top level: 6-ply main search + quiescence on top
    },
    getRandomness(r) {
        if (r < 300) return 0.45;
        if (r < 500) return 0.30;
        if (r < 900) return 0.15;
        if (r < 1100) return 0.06;
        if (r < 1200) return 0.02;
        return 0; // top level plays its true best move essentially every time
    },
    // Time budget for iterative deepening. Only the deeper levels need
    // one — a hard depth-1/2 search finishes essentially instantly.
    getTimeLimitMs(r) {
        if (r < 900) return null;
        if (r < 1100) return 1500;
        if (r < 1200) return 3000;
        return 5000; // top level gets the most thinking time
    },

    getBestMove(game, playerRating) {
        const moves = game.allLegalMoves();
        if (moves.length === 0) return null;

        if (Math.random() < this.getRandomness(playerRating)) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        const maxDepth = this.getDepth(playerRating);
        const timeLimitMs = this.getTimeLimitMs(playerRating);
        const deadline = timeLimitMs ? Date.now() + timeLimitMs : null;

        const rootState = {
            board: [...game.board],
            turn: game.turn,
            castling: { ...game.castling },
            enPassant: game.enPassant,
            halfmoves: game.halfmoves
        };
        const color = rootState.turn === 'w' ? 1 : -1;
        const tt = new Map();

        let bestMove = { from: moves[0].from, to: moves[0].to };

        for (let depth = 1; depth <= maxDepth; depth++) {
            const rootMoves = this._genMoves(game, rootState, false);
            const ordered = this._orderMoves(game, rootState, rootMoves, bestMove);

            let alpha = -Infinity;
            const beta = Infinity;
            let depthBestMove = null;
            let depthBestScore = -Infinity;
            let aborted = false;

            for (const m of ordered) {
                const next = this._makeMove(game, rootState, m);
                const score = -this._negamax(game, next, depth - 1, -beta, -alpha, -color, deadline, 1, tt);
                if (score === null) { aborted = true; break; }
                if (score > depthBestScore) { depthBestScore = score; depthBestMove = m; }
                if (depthBestScore > alpha) alpha = depthBestScore;
            }

            if (aborted || !depthBestMove) break;
            bestMove = { from: depthBestMove.from, to: depthBestMove.to };

            if (deadline && Date.now() >= deadline) break;
            // Found a forced mate — no need to search deeper.
            if (depthBestScore >= MATE_SCORE - 1000) break;
        }

        return bestMove;
    }
};