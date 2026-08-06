import { Checkers } from './checkers-game.js';

// ============================================================
// CHECKERS BOT — Fast Negamax + Alpha-Beta + TT + IDS
// Runs synchronously but is designed to be called via
// Web Worker (checkers-bot-worker.js) so the UI never freezes.
// ============================================================

// --- Zobrist Hashing (initialised once at module load) ---
const ZOBRIST = (() => {
  // Use a seeded-ish PRNG so values are stable across sessions
  let s = 0xdeadbeef;
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
  // [square][pieceType 0=red 1=redKing 2=black 3=blackKing]
  const table = Array.from({length: 64}, () => [rand(), rand(), rand(), rand()]);
  const side  = rand();
  return { table, side };
})();

function _hash(board, turn) {
  let h = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const t = p.color === 'red' ? (p.king ? 1 : 0) : (p.king ? 3 : 2);
    h ^= ZOBRIST.table[i][t];
  }
  if (turn === 'red') h ^= ZOBRIST.side;
  return h >>> 0;
}

// --- Static piece-square tables (index = board square, red advances to row 0) ---
// prettier-ignore
const PST_MAN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  8, 0, 8, 0, 8, 0, 8, 0,
  0, 6, 0, 6, 0, 6, 0, 6,
  4, 0, 4, 0, 4, 0, 4, 0,
  0, 4, 0, 6, 0, 6, 0, 4,
  4, 0, 4, 0, 4, 0, 4, 0,
  0, 6, 0, 6, 0, 6, 0, 6,
  4, 0, 4, 0, 4, 0, 4, 0,
];
// prettier-ignore
const PST_KING = [
  0,10, 0,10, 0,10, 0,10,
 10, 0,10, 0,10, 0,10, 0,
  0,10, 0,14, 0,14, 0,10,
 10, 0,14, 0,18, 0,14, 0,
  0,14, 0,18, 0,14, 0,10,
 10, 0,14, 0,14, 0,10, 0,
  0,10, 0,10, 0,10, 0,10,
 10, 0,10, 0,10, 0,10, 0,
];

const MAN_VAL  = 100;
const KING_VAL = 300;

// --- Transposition Table ---
const TT_SIZE  = 1 << 18; // 256k slots (power of 2 for fast modulo)
const TT_MASK  = TT_SIZE - 1;
const tt_hash  = new Int32Array(TT_SIZE);  // stored hash (lower 32 bits)
const tt_score = new Int16Array(TT_SIZE);
const tt_depth = new Int8Array(TT_SIZE);
const tt_flag  = new Int8Array(TT_SIZE);   // 0=exact 1=lower 2=upper
// bestMove encoded as from*64+to (12 bits)
const tt_move  = new Int16Array(TT_SIZE);

const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

function ttStore(hash, score, depth, flag, bestMove) {
  const idx = hash & TT_MASK;
  // Always-replace strategy
  tt_hash[idx]  = hash;
  tt_score[idx] = Math.max(-32000, Math.min(32000, score));
  tt_depth[idx] = depth;
  tt_flag[idx]  = flag;
  tt_move[idx]  = bestMove !== null ? bestMove.from * 64 + bestMove.to : -1;
}

function ttLookup(hash) {
  const idx = hash & TT_MASK;
  if (tt_hash[idx] !== (hash | 0)) return null;
  return idx;
}

// --- Fast game clone (avoids full _computeMoves in constructor) ---
function cloneGame(game) {
  const g = new Checkers();
  g.board = game.board.map(p => p ? { color: p.color, king: p.king } : null);
  g.turn  = game.turn;
  g.capturedRed   = game.capturedRed;
  g.capturedBlack = game.capturedBlack;
  g.status = game.status;
  g.continuationPiece = game.continuationPiece;
  g._computeMoves();
  return g;
}

// --- Evaluation (no recursive calls — pure static) ---
function evaluate(game) {
  if (game.status === 'red_wins')   return  32000;
  if (game.status === 'black_wins') return -32000;

  let score = 0;
  let nRed = 0, nBlack = 0;

  for (let i = 0; i < 64; i++) {
    const p = game.board[i];
    if (!p) continue;
    const r = i >> 3;
    if (p.color === 'red') {
      nRed++;
      if (p.king) {
        score += KING_VAL + PST_KING[i];
      } else {
        score += MAN_VAL + PST_MAN[i] + (7 - r) * 5;
        if (r === 7) score += 10; // back-rank guard
      }
    } else {
      nBlack++;
      if (p.king) {
        score -= KING_VAL + PST_KING[63 - i];
      } else {
        score -= MAN_VAL + PST_MAN[63 - i] + r * 5;
        if (r === 0) score -= 10;
      }
    }
  }

  // Mobility (cheap: already computed)
  score += (game.turn === 'red' ? 1 : -1) * game.validMoves.length * 3;

  // Piece-count advantage amplifier: trade when winning
  const diff = (nRed - nBlack);
  score += diff * 8;

  // Endgame: king chases enemy
  const total = nRed + nBlack;
  if (total <= 6) {
    for (let i = 0; i < 64; i++) {
      const p = game.board[i];
      if (!p || !p.king) continue;
      const pr = i >> 3, pc = i & 7;
      let minDist = 99;
      const enemy = p.color === 'red' ? 'black' : 'red';
      for (let j = 0; j < 64; j++) {
        const q = game.board[j];
        if (q && q.color === enemy) {
          minDist = Math.min(minDist, Math.abs(pr - (j >> 3)) + Math.abs(pc - (j & 7)));
        }
      }
      if (minDist < 99) {
        if (p.color === 'red') score -= minDist * 8;
        else                   score += minDist * 8;
      }
    }
  }

  return score;
}

// --- Move ordering: captures > promotions > advances ---
function orderMoves(moves, game, ply, ttMoveEncoded) {
  return moves.slice().sort((a, b) => {
    const sa = moveScore(a, game, ply, ttMoveEncoded);
    const sb = moveScore(b, game, ply, ttMoveEncoded);
    return sb - sa;
  });
}

// Killer slots [ply][0..1] encoded as from*64+to
const killers = new Int16Array(128 * 2).fill(-1);

function moveScore(m, game, ply, ttMoveEnc) {
  const enc = m.from * 64 + m.to;
  if (enc === ttMoveEnc) return 100000;
  if (m.captured.length > 1) return 90000 + m.captured.length * 100;
  if (m.captured.length === 1) return 80000;
  if (ply < 128) {
    if (killers[ply * 2]     === enc) return 70000;
    if (killers[ply * 2 + 1] === enc) return 69000;
  }
  // Promotion
  const p = game.board[m.from];
  if (p && !p.king) {
    const tr = m.to >> 3;
    if ((p.color === 'red' && tr === 0) || (p.color === 'black' && tr === 7)) return 60000;
  }
  return 0;
}

// --- Negamax ---
let _startTime = 0;
let _timeLimitMs = 0;
let _aborted = false;

function negamax(game, depth, alpha, beta, hash, ply) {
  // Time check every ~1024 nodes
  if ((ply & 0xff) === 0 && Date.now() - _startTime > _timeLimitMs) {
    _aborted = true;
    return 0;
  }

  // TT probe
  const ttIdx = ttLookup(hash);
  let ttMoveEnc = -1;
  if (ttIdx !== null) {
    if (tt_depth[ttIdx] >= depth) {
      const s = tt_score[ttIdx];
      const f = tt_flag[ttIdx];
      if (f === TT_EXACT)                    return s;
      if (f === TT_LOWER && s > alpha) alpha = s;
      if (f === TT_UPPER && s < beta)  beta  = s;
      if (alpha >= beta)                     return s;
    }
    ttMoveEnc = tt_move[ttIdx];
  }

  if (depth === 0 || game.status !== 'playing') {
    const raw = evaluate(game);
    return game.turn === 'red' ? raw : -raw;
  }

  const ordered = orderMoves(game.validMoves, game, ply, ttMoveEnc);
  let best = -Infinity;
  let bestMove = null;
  const origAlpha = alpha;

  for (const m of ordered) {
    if (_aborted) return 0;
    const g2 = cloneGame(game);
    g2.makeMove(m.from, m.to);
    const h2 = _hash(g2.board, g2.turn);
    const score = -negamax(g2, depth - 1, -beta, -alpha, h2, ply + 1);
    if (_aborted) return 0;
    if (score > best) { best = score; bestMove = m; }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      // Killer update (quiet moves only)
      if (!m.captured.length && ply < 128) {
        killers[ply * 2 + 1] = killers[ply * 2];
        killers[ply * 2]     = m.from * 64 + m.to;
      }
      break;
    }
  }

  if (!_aborted) {
    const flag = best <= origAlpha ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
    ttStore(hash, best, depth, flag, bestMove);
  }

  return best;
}

// --- Iterative Deepening ---
function iterativeDeepening(game, maxDepth, timeLimitMs) {
  const moves = game.validMoves;
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];

  killers.fill(-1);
  _startTime    = Date.now();
  _timeLimitMs  = timeLimitMs;
  _aborted      = false;

  const rootHash = _hash(game.board, game.turn);
  let bestMove   = moves[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    _aborted = false;
    const ordered = orderMoves(moves, game, 0, tt_move[rootHash & TT_MASK] ?? -1);

    let iterBest  = null;
    let iterScore = -Infinity;
    let alpha = -Infinity, beta = Infinity;

    for (const m of ordered) {
      if (Date.now() - _startTime > timeLimitMs) { _aborted = true; break; }
      const g2 = cloneGame(game);
      g2.makeMove(m.from, m.to);
      const h2 = _hash(g2.board, g2.turn);
      const score = -negamax(g2, depth - 1, -beta, -alpha, h2, 1);
      if (_aborted) break;
      if (score > iterScore) { iterScore = score; iterBest = m; }
      if (score > alpha) alpha = score;
    }

    if (!_aborted && iterBest) bestMove = iterBest;
    if (_aborted) break;
    // If we found a forced win, stop early
    if (iterScore >= 30000) break;
  }

  return bestMove;
}

export const CheckersBot = {
  difficulty: 'intermediate',

  getBestMove(game) {
    const moves = game.validMoves;
    if (!moves.length) return null;

    if (this.difficulty === 'beginner') {
      if (Math.random() < 0.7) return moves[Math.floor(Math.random() * moves.length)];
      const caps = moves.filter(m => m.captured.length > 0);
      return (caps.length ? caps : moves)[Math.floor(Math.random() * (caps.length || moves.length))];
    }

    if (this.difficulty === 'intermediate') {
      if (Math.random() < 0.10) return moves[Math.floor(Math.random() * moves.length)];
      return iterativeDeepening(game, 8, 300);
    }

    // Advanced: search up to depth 99 within 4 seconds
    return iterativeDeepening(game, 99, 1500);
  }
};