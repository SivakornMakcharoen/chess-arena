export class Checkers {
  constructor({onKing = null} = {}) {
    this.onKing = onKing;
    this.reset();
  }

  reset() {
    this.board = Array(64).fill(null);
    for (let r=0; r<2; r++) for (let c=0; c<8; c++) {
      if ((r+c)%2===1) this.board[r*8+c] = {color:'black', king:false};
    }
    for (let r=6; r<8; r++) for (let c=0; c<8; c++) {
      if ((r+c)%2===1) this.board[r*8+c] = {color:'red', king:false};
    }
    this.turn = 'red';
    this.selected = null;
    this.validMoves = [];
    this.capturedRed = 0;
    this.capturedBlack = 0;
    this.status = 'playing';
    this.continuationPiece = null;
    this._computeMoves();
  }

  row(i) { return Math.floor(i/8); }
  col(i) { return i%8; }
  idx(r,c) { return r*8+c; }

  _computeMoves() {
    // No mandatory jump rule - all moves (jumps + simple) are valid.
    const jumps = this._getAllJumps(this.turn);
    const simples = this._getAllSimpleMoves(this.turn);

    if (this.continuationPiece !== null) {
      const contJumps = jumps.filter(m => m.from === this.continuationPiece);
      if (contJumps.length > 0) {
        this.validMoves = contJumps;
        return;
      }
      this.continuationPiece = null;
      this._endTurnSwitch();
      return;
    }

    this.validMoves = [...jumps, ...simples];
    if (this.validMoves.length === 0) {
      this.status = this.turn === 'red' ? 'black_wins' : 'red_wins';
    }
  }

  // King: can slide multiple squares diagonally.
  _getDirs(piece) {
    if (piece.king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
    return piece.color === 'red' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  }

  _getAllSimpleMoves(color) {
    const moves = [];
    for (let i=0; i<64; i++) {
      const p = this.board[i];
      if (!p || p.color !== color) continue;
      if (p.king) {
        for (const [dr,dc] of this._getDirs(p)) {
          let nr = this.row(i)+dr, nc = this.col(i)+dc;
          while (nr>=0 && nr<=7 && nc>=0 && nc<=7) {
            const ni = this.idx(nr,nc);
            if (this.board[ni]) break;
            moves.push({from:i, to:ni, captured:[]});
            nr+=dr; nc+=dc;
          }
        }
      } else {
        for (const [dr,dc] of this._getDirs(p)) {
          const nr=this.row(i)+dr, nc=this.col(i)+dc;
          if (nr<0||nr>7||nc<0||nc>7) continue;
          const ni = this.idx(nr,nc);
          if (!this.board[ni]) moves.push({from:i, to:ni, captured:[]});
        }
      }
    }
    return moves;
  }

  _getAllJumps(color, board=null, piece_idx=null) {
    const b = board || this.board;
    const moves = [];
    const indices = piece_idx !== null ? [piece_idx] : [...Array(64).keys()];
    for (const i of indices) {
      const p = b[i];
      if (!p || p.color !== color) continue;
      if (p.king) {
        for (const [dr,dc] of this._getDirs(p)) {
          let nr = this.row(i)+dr, nc = this.col(i)+dc;
          let foundEnemy = null, foundEnemyIdx = null;
          while (nr>=0 && nr<=7 && nc>=0 && nc<=7) {
            const ni = this.idx(nr,nc);
            const sq = b[ni];
            if (sq) {
              if (sq.color !== color && !foundEnemy) {
                foundEnemy = sq; foundEnemyIdx = ni;
              } else {
                break;
              }
            } else if (foundEnemy) {
              moves.push({from:i, to:ni, captured:[foundEnemyIdx]});
            }
            nr+=dr; nc+=dc;
          }
        }
      } else {
        for (const [dr,dc] of this._getDirs(p)) {
          const mr=this.row(i)+dr, mc=this.col(i)+dc;
          const lr=this.row(i)+dr*2, lc=this.col(i)+dc*2;
          if (lr<0||lr>7||lc<0||lc>7) continue;
          const mi=this.idx(mr,mc), li=this.idx(lr,lc);
          const mid=b[mi];
          if (mid && mid.color !== color && !b[li]) {
            moves.push({from:i, to:li, captured:[mi]});
          }
        }
      }
    }
    return moves;
  }

  getMovesFor(idx) {
    return this.validMoves.filter(m => m.from === idx);
  }

  makeMove(from, to) {
    const move = this.validMoves.find(m => m.from === from && m.to === to);
    if (!move) return false;

    const piece = {...this.board[from]};
    this.board[from] = null;

    for (const ci of move.captured) this.board[ci] = null;
    if (move.captured.length > 0) {
      if (this.turn === 'red') this.capturedBlack += move.captured.length;
      else this.capturedRed += move.captured.length;
    }

    const toRow = this.row(to);
    const wasKing = piece.king;
    if (!piece.king && ((piece.color==='red' && toRow===0) || (piece.color==='black' && toRow===7))) {
      piece.king = true;
    }
    this.board[to] = piece;

    if (!wasKing && piece.king) {
      this.onKing?.();
      this.continuationPiece = null;
      this._endTurnSwitch();
      return true;
    }

    if (move.captured.length > 0) {
      const furtherJumps = this._getAllJumps(this.turn, this.board, to);
      if (furtherJumps.length > 0) {
        this.continuationPiece = to;
        this.selected = to;
        this._computeMoves();
        return true;
      }
    }

    this.continuationPiece = null;
    this._endTurnSwitch();
    return true;
  }

  _endTurnSwitch() {
    this.turn = this.turn === 'red' ? 'black' : 'red';
    this._computeMoves();
  }
}
