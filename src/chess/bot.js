// ============================================================
// BOT AI
// ============================================================
export const Bot = {
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
