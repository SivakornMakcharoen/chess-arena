import { Checkers } from './checkers-game.js';

export const CheckersBot = {
  difficulty: 'intermediate',

  POS_TABLE: [
     0, 4, 0, 4, 0, 4, 0, 4,
     4, 0, 3, 0, 3, 0, 3, 0,
     0, 3, 0, 2, 0, 2, 0, 4,
     4, 0, 2, 0, 2, 0, 2, 0,
     0, 2, 0, 2, 0, 2, 0, 4,
     4, 0, 3, 0, 3, 0, 3, 0,
     0, 3, 0, 3, 0, 3, 0, 4,
     4, 0, 4, 0, 4, 0, 4, 0,
  ],

  evaluate(game) {
    if (game.status === 'red_wins') return 100000;
    if (game.status === 'black_wins') return -100000;

    let score = 0;
    let redCount = 0, blackCount = 0;

    for (let i = 0; i < 64; i++) {
      const p = game.board[i];
      if (!p) continue;
      const r = Math.floor(i / 8), c = i % 8;

      if (p.color === 'red') {
        redCount++;
        const advance = 7 - r;
        const posBonus = this.POS_TABLE[i] * 2;
        const advBonus = advance * 8;
        if (p.king) score += 300 + posBonus;
        else score += 100 + advBonus + posBonus;
        if (r === 7) score += 15;
        if (c >= 2 && c <= 5 && r >= 2 && r <= 5) score += 8;
        if (c === 0 || c === 7) score += 6;
        const threatened = game._getAllJumps('black').some(m => m.captured.includes(i));
        if (threatened) score -= 80;
      } else {
        blackCount++;
        const advance = r;
        const posBonus = this.POS_TABLE[63 - i] * 2;
        const advBonus = advance * 8;
        if (p.king) score -= 300 + posBonus;
        else score -= 100 + advBonus + posBonus;
        if (r === 0) score -= 15;
        if (c >= 2 && c <= 5 && r >= 2 && r <= 5) score -= 8;
        if (c === 0 || c === 7) score -= 6;
        const threatened = game._getAllJumps('red').some(m => m.captured.includes(i));
        if (threatened) score += 80;
      }
    }

    const myMoves = game.validMoves.length;
    if (game.turn === 'red') score += myMoves * 5;
    else score -= myMoves * 5;

    const opponentJumps = game._getAllJumps(game.turn === 'red' ? 'black' : 'red');
    if (game.turn === 'red') score += opponentJumps.length * 12;
    else score -= opponentJumps.length * 12;

    const totalPieces = redCount + blackCount;
    if (totalPieces <= 4) {
      for (let i = 0; i < 64; i++) {
        const p = game.board[i];
        if (!p || !p.king) continue;
        if (p.color === 'red') {
          let minDist = 99;
          for (let j = 0; j < 64; j++) {
            if (game.board[j]?.color === 'black') {
              minDist = Math.min(minDist, Math.abs(Math.floor(i/8)-Math.floor(j/8)) + Math.abs(i%8 - j%8));
            }
          }
          score -= minDist * 8;
        } else {
          let minDist = 99;
          for (let j = 0; j < 64; j++) {
            if (game.board[j]?.color === 'red') {
              minDist = Math.min(minDist, Math.abs(Math.floor(i/8)-Math.floor(j/8)) + Math.abs(i%8 - j%8));
            }
          }
          score += minDist * 8;
        }
      }
    }

    return score;
  },

  _clone(game) {
    const g = new Checkers();
    g.board = game.board.map(p => p ? {...p} : null);
    g.turn = game.turn;
    g.capturedRed = game.capturedRed;
    g.capturedBlack = game.capturedBlack;
    g.status = game.status;
    g.continuationPiece = game.continuationPiece;
    g._computeMoves();
    return g;
  },

  _orderMoves(moves, game, maximizing) {
    return moves.slice().sort((a, b) => {
      const aCaptures = a.captured.length;
      const bCaptures = b.captured.length;
      if (bCaptures !== aCaptures) return bCaptures - aCaptures;
      const aRow = Math.floor(a.to / 8);
      const bRow = Math.floor(b.to / 8);
      if (maximizing) return aRow - bRow;
      return bRow - aRow;
    });
  },

  _negamax(game, depth, alpha, beta, color) {
    if (depth === 0 || game.status !== 'playing') {
      const raw = this.evaluate(game);
      return color === 'red' ? raw : -raw;
    }

    const ordered = this._orderMoves(game.validMoves, game, color === 'red');
    let best = -Infinity;

    for (const m of ordered) {
      const g2 = this._clone(game);
      g2.makeMove(m.from, m.to);
      const nextColor = g2.turn;
      const score = -this._negamax(g2, depth - 1, -beta, -alpha, nextColor);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  },

  _iterativeDeepening(game, maxDepth, timeLimitMs) {
    const moves = game.validMoves;
    if (!moves.length) return null;
    const t0 = Date.now();
    let bestMove = moves[0];

    for (let depth = 1; depth <= maxDepth; depth++) {
      if (Date.now() - t0 > timeLimitMs) break;
      const ordered = this._orderMoves(moves, game, game.turn === 'red');
      let bestScore = -Infinity;
      let alpha = -Infinity, beta = Infinity;

      for (const m of ordered) {
        if (Date.now() - t0 > timeLimitMs) break;
        const g2 = this._clone(game);
        g2.makeMove(m.from, m.to);
        const score = -this._negamax(g2, depth - 1, -beta, -alpha, g2.turn);
        if (score > bestScore) { bestScore = score; bestMove = m; }
        if (score > alpha) alpha = score;
      }
    }
    return bestMove;
  },

  getBestMove(game) {
    const moves = game.validMoves;
    if (!moves.length) return null;

    if (this.difficulty === 'beginner') {
      if (Math.random() < 0.7) return moves[Math.floor(Math.random() * moves.length)];
      const caps = moves.filter(m => m.captured.length > 0);
      const pool = caps.length ? caps : moves;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    if (this.difficulty === 'intermediate') {
      if (Math.random() < 0.10) return moves[Math.floor(Math.random() * moves.length)];
      return this._iterativeDeepening(game, 4, 150);
    }

    return this._iterativeDeepening(game, 99, 3000);
  }
};
