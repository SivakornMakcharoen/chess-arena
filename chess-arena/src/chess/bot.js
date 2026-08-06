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

// ------------------------------------------------------------
// Per-style evaluation weights. These scale extra positional
// terms (mobility, king safety, pawn structure, "aggression"
// toward the enemy king) on top of the shared material+PST base,
// so each persona's declared style actually changes how it plays
// mid/endgame — not just its opening book and chat lines.
// ------------------------------------------------------------
const STYLE_WEIGHTS = {
    random:     { mobility: 1.0, kingSafety: 1.0, aggression: 1.0, pawnStructure: 1.0 },
    balanced:   { mobility: 1.0, kingSafety: 1.0, aggression: 1.0, pawnStructure: 1.0 },
    defensive:  { mobility: 0.8, kingSafety: 1.6, aggression: 0.5, pawnStructure: 1.2 },
    positional: { mobility: 1.3, kingSafety: 1.15, aggression: 0.7, pawnStructure: 1.4 },
    tactical:   { mobility: 1.25, kingSafety: 0.85, aggression: 1.3, pawnStructure: 0.8 },
    aggressive: { mobility: 1.1, kingSafety: 0.6, aggression: 1.6, pawnStructure: 0.7 },
};

export const Bot = {
    _style: 'balanced', // set per search in getBestMove(); read by evaluate()
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
    // Static evaluation (positive = good for White), taking the
    // search state (board + castling/enPassant needed for mobility)
    // and, optionally, the game instance (for pseudo-legal move
    // counts). Uses a tapered king PST based on how much material
    // is left on the board (opening/middlegame vs endgame), plus
    // mobility / pawn-structure / king-safety / aggression terms
    // scaled by the active persona's style (this._style).
    // ------------------------------------------------------------
    evaluate(state, game) {
        const board = state.board;
        const weights = STYLE_WEIGHTS[this._style] || STYLE_WEIGHTS.balanced;
        let score = 0;
        let nonPawnMaterial = 0;
        let whiteBishops = 0, blackBishops = 0;
        let whiteKingSq = -1, blackKingSq = -1;
        const whitePawnFiles = new Array(8).fill(0);
        const blackPawnFiles = new Array(8).fill(0);

        for (let i = 0; i < 64; i++) {
            const p = board[i];
            if (!p) continue;
            const t = p.toUpperCase();
            const isWhite = p === p.toUpperCase();
            if (t !== 'P' && t !== 'K') nonPawnMaterial += this.pieceValues[t] || 0;
            if (t === 'B') { if (isWhite) whiteBishops++; else blackBishops++; }
            if (t === 'P') { const c = i % 8; if (isWhite) whitePawnFiles[c]++; else blackPawnFiles[c]++; }
            if (t === 'K') { if (isWhite) whiteKingSq = i; else blackKingSq = i; }
        }
        // Rough endgame signal: little material left on the board besides kings/pawns.
        const isEndgame = nonPawnMaterial <= 1300 * 2;

        let whiteMobility = 0, blackMobility = 0;
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

            // Cheap pseudo-legal mobility count (skip king: castling
            // legality checks aren't needed for a "how active is this
            // piece" signal, and it avoids extra isInCheck calls here).
            if (game && t !== 'K') {
                const mob = game.rawMoves(i, board, isWhite ? 'w' : 'b', state.enPassant, state.castling).length;
                if (isWhite) whiteMobility += mob; else blackMobility += mob;
            }
        }

        if (game) score += (whiteMobility - blackMobility) * 2 * weights.mobility;

        // Bishop pair bonus.
        if (whiteBishops >= 2) score += 30 * weights.pawnStructure;
        if (blackBishops >= 2) score -= 30 * weights.pawnStructure;

        // Pawn structure: doubled + isolated pawn penalties.
        let pawnScore = 0;
        for (let f = 0; f < 8; f++) {
            if (whitePawnFiles[f] > 1) pawnScore -= 15 * (whitePawnFiles[f] - 1);
            if (blackPawnFiles[f] > 1) pawnScore += 15 * (blackPawnFiles[f] - 1);
            const wIsolated = whitePawnFiles[f] > 0 && (f === 0 || whitePawnFiles[f - 1] === 0) && (f === 7 || whitePawnFiles[f + 1] === 0);
            if (wIsolated) pawnScore -= 12;
            const bIsolated = blackPawnFiles[f] > 0 && (f === 0 || blackPawnFiles[f - 1] === 0) && (f === 7 || blackPawnFiles[f + 1] === 0);
            if (bIsolated) pawnScore += 12;
        }
        score += pawnScore * weights.pawnStructure;

        // King safety: pawn shield in front of a castled/home king (skip in the endgame,
        // where king activity matters more than shelter).
        if (!isEndgame) {
            if (whiteKingSq >= 0) score += this._kingShield(board, whiteKingSq, true) * weights.kingSafety;
            if (blackKingSq >= 0) score -= this._kingShield(board, blackKingSq, false) * weights.kingSafety;
        }

        // Aggression: reward non-pawn pieces sitting close to the enemy king
        // (rough "attack potential" proxy, cheap alternative to full attack maps).
        if (whiteKingSq >= 0 && blackKingSq >= 0) {
            score += this._kingProximityScore(board, blackKingSq, true) * weights.aggression;
            score -= this._kingProximityScore(board, whiteKingSq, false) * weights.aggression;
        }

        return score;
    },

    // Counts own pawns still on the 3 files around a king's own file,
    // one and two ranks in front of it (from that side's perspective).
    // Missing shield pawns cost points; this deliberately ignores open
    // files vs. semi-open files for simplicity.
    _kingShield(board, kingSq, isWhite) {
        const kc = kingSq % 8, kr = Math.floor(kingSq / 8);
        const dir = isWhite ? -1 : 1;
        const pawn = isWhite ? 'P' : 'p';
        let shield = 0, maxShield = 0;
        for (const dc of [-1, 0, 1]) {
            const c = kc + dc;
            if (c < 0 || c > 7) continue;
            for (const dr of [1, 2]) {
                const r = kr + dir * dr;
                if (r < 0 || r > 7) continue;
                maxShield += 10;
                if (board[r * 8 + c] === pawn) shield += 10;
            }
        }
        return shield - maxShield * 0.4; // baseline so an open king isn't neutral, it's punished
    },

    // Sum of piece-weighted proximity (chebyshev distance) of non-pawn,
    // non-king pieces to the given enemy king square.
    _kingProximityScore(board, enemyKingSq, forWhitePieces) {
        const kc = enemyKingSq % 8, kr = Math.floor(enemyKingSq / 8);
        let total = 0;
        for (let i = 0; i < 64; i++) {
            const p = board[i];
            if (!p) continue;
            const isWhite = p === p.toUpperCase();
            if (isWhite !== forWhitePieces) continue;
            const t = p.toUpperCase();
            if (t === 'P' || t === 'K') continue;
            const c = i % 8, r = Math.floor(i / 8);
            const dist = Math.max(Math.abs(c - kc), Math.abs(r - kr));
            total += Math.max(0, 6 - dist); // closer pieces score more, 0 once 6+ squares away
        }
        return total;
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

        const standPat = color * this.evaluate(state, game);
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

    // 'e2' -> square index (0..63), matching ChessGame's own indexing
    // (row 0 = rank 8, so this is the exact inverse of game.sqNote()).
    _uciToIdx(sq) {
        const c = sq.charCodeAt(0) - 97; // 'a' -> 0
        const r = 8 - parseInt(sq[1], 10);
        return r * 8 + c;
    },

    // Looks for a persona opening line whose prefix matches the moves
    // already played (in "e2e4"-style uci, built from game.sqNote()).
    // Returns the next book move once it's still legal in this exact
    // position, or null to fall back to the normal search.
    _getBookMove(game, persona) {
        if (!persona || !persona.openingBook || persona.openingBook.length === 0) return null;
        const played = game.moves.map(m => game.sqNote(m.from) + game.sqNote(m.to));
        for (const line of persona.openingBook) {
            if (line.length <= played.length) continue;
            let matches = true;
            for (let i = 0; i < played.length; i++) {
                if (line[i] !== played[i]) { matches = false; break; }
            }
            if (!matches) continue;
            const nextUci = line[played.length];
            const from = this._uciToIdx(nextUci.slice(0, 2));
            const to = this._uciToIdx(nextUci.slice(2, 4));
            if (game.getLegalMoves(from).includes(to)) return { from, to };
        }
        return null;
    },

    // playerRatingOrPersona accepts either a plain rating number
    // (legacy call sites / fallback difficulty) or a full persona
    // object ({ rating, style, openingBook, ... }) from BOT_PERSONAS.
    getBestMove(game, playerRatingOrPersona) {
        const moves = game.allLegalMoves();
        if (moves.length === 0) return null;

        const persona = (playerRatingOrPersona && typeof playerRatingOrPersona === 'object') ? playerRatingOrPersona : null;
        const playerRating = persona ? persona.rating : (playerRatingOrPersona || 500);
        this._style = persona ? (persona.style || 'balanced') : 'balanced';

        const bookMove = this._getBookMove(game, persona);
        if (bookMove) return bookMove;

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