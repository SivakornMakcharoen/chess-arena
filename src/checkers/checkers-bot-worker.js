// Web Worker for Checkers Bot — runs off the main thread

// Inline the entire bot + game engine here (no ES module imports in workers via importScripts)

// ---- Minimal Checkers engine (mirror of checkers-game.js) ----
class Checkers {
  constructor() { this.reset(); }
  reset() {
    this.board = Array(64).fill(null);
    for (let r=0;r<2;r++) for (let c=0;c<8;c++) if((r+c)%2===1) this.board[r*8+c]={color:'black',king:false};
    for (let r=6;r<8;r++) for (let c=0;c<8;c++) if((r+c)%2===1) this.board[r*8+c]={color:'red',king:false};
    this.turn='red'; this.selected=null; this.validMoves=[];
    this.capturedRed=0; this.capturedBlack=0; this.status='playing'; this.continuationPiece=null;
    this._computeMoves();
  }
  row(i){return i>>3;} col(i){return i&7;} idx(r,c){return r*8+c;}
  _getDirs(p){if(p.king)return[[-1,-1],[-1,1],[1,-1],[1,1]];return p.color==='red'?[[-1,-1],[-1,1]]:[[1,-1],[1,1]];}
  _getAllSimpleMoves(color){
    const moves=[];
    for(let i=0;i<64;i++){
      const p=this.board[i]; if(!p||p.color!==color) continue;
      if(p.king){
        for(const[dr,dc]of this._getDirs(p)){let nr=this.row(i)+dr,nc=this.col(i)+dc;while(nr>=0&&nr<=7&&nc>=0&&nc<=7){const ni=this.idx(nr,nc);if(this.board[ni])break;moves.push({from:i,to:ni,captured:[]});nr+=dr;nc+=dc;}}
      } else {
        for(const[dr,dc]of this._getDirs(p)){const nr=this.row(i)+dr,nc=this.col(i)+dc;if(nr<0||nr>7||nc<0||nc>7)continue;const ni=this.idx(nr,nc);if(!this.board[ni])moves.push({from:i,to:ni,captured:[]});}
      }
    }
    return moves;
  }
  _getAllJumps(color,board=null,piece_idx=null){
    const b=board||this.board; const moves=[]; const indices=piece_idx!==null?[piece_idx]:[...Array(64).keys()];
    for(const i of indices){
      const p=b[i]; if(!p||p.color!==color) continue;
      if(p.king){
        for(const[dr,dc]of this._getDirs(p)){let nr=this.row(i)+dr,nc=this.col(i)+dc;let fe=null,fi=null;while(nr>=0&&nr<=7&&nc>=0&&nc<=7){const ni=this.idx(nr,nc);const sq=b[ni];if(sq){if(sq.color!==color&&!fe){fe=sq;fi=ni;}else break;}else if(fe){moves.push({from:i,to:ni,captured:[fi]});}nr+=dr;nc+=dc;}}
      } else {
        for(const[dr,dc]of this._getDirs(p)){const mr=this.row(i)+dr,mc=this.col(i)+dc,lr=this.row(i)+dr*2,lc=this.col(i)+dc*2;if(lr<0||lr>7||lc<0||lc>7)continue;const mi=this.idx(mr,mc),li=this.idx(lr,lc);const mid=b[mi];if(mid&&mid.color!==color&&!b[li])moves.push({from:i,to:li,captured:[mi]});}
      }
    }
    return moves;
  }
  _computeMoves(){
    const jumps=this._getAllJumps(this.turn); const simples=this._getAllSimpleMoves(this.turn);
    if(this.continuationPiece!==null){const cj=jumps.filter(m=>m.from===this.continuationPiece);if(cj.length>0){this.validMoves=cj;return;}this.continuationPiece=null;this._endTurnSwitch();return;}
    this.validMoves=[...jumps,...simples];
    if(this.validMoves.length===0)this.status=this.turn==='red'?'black_wins':'red_wins';
  }
  makeMove(from,to){
    const move=this.validMoves.find(m=>m.from===from&&m.to===to); if(!move)return false;
    const piece={...this.board[from]}; this.board[from]=null;
    for(const ci of move.captured)this.board[ci]=null;
    if(move.captured.length>0){if(this.turn==='red')this.capturedBlack+=move.captured.length;else this.capturedRed+=move.captured.length;}
    const toRow=this.row(to); const wasKing=piece.king;
    if(!piece.king&&((piece.color==='red'&&toRow===0)||(piece.color==='black'&&toRow===7)))piece.king=true;
    this.board[to]=piece;
    if(!wasKing&&piece.king){this.continuationPiece=null;this._endTurnSwitch();return true;}
    if(move.captured.length>0){const fj=this._getAllJumps(this.turn,this.board,to);if(fj.length>0){this.continuationPiece=to;this.selected=to;this._computeMoves();return true;}}
    this.continuationPiece=null;this._endTurnSwitch();return true;
  }
  _endTurnSwitch(){this.turn=this.turn==='red'?'black':'red';this._computeMoves();}
}

// ---- Bot logic (same as checkers-bot.js but self-contained) ----
const ZOBRIST=(()=>{let s=0xdeadbeef;const r=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return s>>>0;};const table=Array.from({length:64},()=>[r(),r(),r(),r()]);return{table,side:r()};})();
function _hash(board,turn){let h=0;for(let i=0;i<64;i++){const p=board[i];if(!p)continue;const t=p.color==='red'?(p.king?1:0):(p.king?3:2);h^=ZOBRIST.table[i][t];}if(turn==='red')h^=ZOBRIST.side;return h>>>0;}
const PST_MAN=[0,0,0,0,0,0,0,0,8,0,8,0,8,0,8,0,0,6,0,6,0,6,0,6,4,0,4,0,4,0,4,0,0,4,0,6,0,6,0,4,4,0,4,0,4,0,4,0,0,6,0,6,0,6,0,6,4,0,4,0,4,0,4,0];
const PST_KING=[0,10,0,10,0,10,0,10,10,0,10,0,10,0,10,0,0,10,0,14,0,14,0,10,10,0,14,0,18,0,14,0,0,14,0,18,0,14,0,10,10,0,14,0,14,0,10,0,0,10,0,10,0,10,0,10,10,0,10,0,10,0,10,0];
const TT_SIZE=1<<18,TT_MASK=TT_SIZE-1;
const tt_hash=new Int32Array(TT_SIZE),tt_score=new Int16Array(TT_SIZE),tt_depth=new Int8Array(TT_SIZE),tt_flag=new Int8Array(TT_SIZE),tt_move=new Int16Array(TT_SIZE);
const TT_EXACT=0,TT_LOWER=1,TT_UPPER=2;
function ttStore(hash,score,depth,flag,bm){const i=hash&TT_MASK;tt_hash[i]=hash;tt_score[i]=Math.max(-32000,Math.min(32000,score));tt_depth[i]=depth;tt_flag[i]=flag;tt_move[i]=bm?bm.from*64+bm.to:-1;}
function ttLookup(hash){const i=hash&TT_MASK;return tt_hash[i]===(hash|0)?i:null;}
function cloneGame(game){const g=new Checkers();g.board=game.board.map(p=>p?{color:p.color,king:p.king}:null);g.turn=game.turn;g.capturedRed=game.capturedRed;g.capturedBlack=game.capturedBlack;g.status=game.status;g.continuationPiece=game.continuationPiece;g._computeMoves();return g;}
function evaluate(game){
  if(game.status==='red_wins')return 32000;if(game.status==='black_wins')return-32000;
  let score=0,nRed=0,nBlack=0;
  for(let i=0;i<64;i++){const p=game.board[i];if(!p)continue;const r=i>>3;if(p.color==='red'){nRed++;if(p.king)score+=300+PST_KING[i];else{score+=100+PST_MAN[i]+(7-r)*5;if(r===7)score+=10;}}else{nBlack++;if(p.king)score-=300+PST_KING[63-i];else{score-=100+PST_MAN[63-i]+r*5;if(r===0)score-=10;}}}
  score+=(game.turn==='red'?1:-1)*game.validMoves.length*3;
  score+=(nRed-nBlack)*8;
  const total=nRed+nBlack;
  if(total<=6){for(let i=0;i<64;i++){const p=game.board[i];if(!p||!p.king)continue;const pr=i>>3,pc=i&7;let md=99;const en=p.color==='red'?'black':'red';for(let j=0;j<64;j++){const q=game.board[j];if(q&&q.color===en)md=Math.min(md,Math.abs(pr-(j>>3))+Math.abs(pc-(j&7)));}if(md<99){if(p.color==='red')score-=md*8;else score+=md*8;}}}
  return score;
}
const killers=new Int16Array(256).fill(-1);
function moveScore(m,game,ply,ttEnc){const enc=m.from*64+m.to;if(enc===ttEnc)return 100000;if(m.captured.length>1)return 90000+m.captured.length*100;if(m.captured.length===1)return 80000;if(ply<128){if(killers[ply*2]===enc)return 70000;if(killers[ply*2+1]===enc)return 69000;}const p=game.board[m.from];if(p&&!p.king){const tr=m.to>>3;if((p.color==='red'&&tr===0)||(p.color==='black'&&tr===7))return 60000;}return 0;}
function orderMoves(moves,game,ply,ttEnc){return moves.slice().sort((a,b)=>moveScore(b,game,ply,ttEnc)-moveScore(a,game,ply,ttEnc));}
let _t0=0,_tl=0,_ab=false;
function negamax(game,depth,alpha,beta,hash,ply){
  if((ply&0x3ff)===0&&Date.now()-_t0>_tl){_ab=true;return 0;}
  const ti=ttLookup(hash);let tmEnc=-1;
  if(ti!==null){if(tt_depth[ti]>=depth){const s=tt_score[ti],f=tt_flag[ti];if(f===TT_EXACT)return s;if(f===TT_LOWER&&s>alpha)alpha=s;if(f===TT_UPPER&&s<beta)beta=s;if(alpha>=beta)return s;}tmEnc=tt_move[ti];}
  if(depth===0||game.status!=='playing'){const raw=evaluate(game);return game.turn==='red'?raw:-raw;}
  const ordered=orderMoves(game.validMoves,game,ply,tmEnc);
  let best=-Infinity,bestMove=null;const oa=alpha;
  for(const m of ordered){
    if(_ab)return 0;
    const g2=cloneGame(game);g2.makeMove(m.from,m.to);
    const h2=_hash(g2.board,g2.turn);
    const score=-negamax(g2,depth-1,-beta,-alpha,h2,ply+1);
    if(_ab)return 0;
    if(score>best){best=score;bestMove=m;}
    if(score>alpha)alpha=score;
    if(alpha>=beta){if(!m.captured.length&&ply<128){killers[ply*2+1]=killers[ply*2];killers[ply*2]=m.from*64+m.to;}break;}
  }
  if(!_ab){const flag=best<=oa?TT_UPPER:best>=beta?TT_LOWER:TT_EXACT;ttStore(hash,best,depth,flag,bestMove);}
  return best;
}
function iterativeDeepening(game,maxDepth,timeLimitMs){
  const moves=game.validMoves;if(!moves.length)return null;if(moves.length===1)return moves[0];
  killers.fill(-1);_t0=Date.now();_tl=timeLimitMs;_ab=false;
  const rh=_hash(game.board,game.turn);let bestMove=moves[0];
  for(let depth=1;depth<=maxDepth;depth++){
    _ab=false;
    const ordered=orderMoves(moves,game,0,tt_move[rh&TT_MASK]??-1);
    let ib=null,is=-Infinity,alpha=-Infinity,beta=Infinity;
    for(const m of ordered){
      if(Date.now()-_t0>timeLimitMs){_ab=true;break;}
      const g2=cloneGame(game);g2.makeMove(m.from,m.to);
      const h2=_hash(g2.board,g2.turn);
      const score=-negamax(g2,depth-1,-beta,-alpha,h2,1);
      if(_ab)break;
      if(score>is){is=score;ib=m;}
      if(score>alpha)alpha=score;
    }
    if(!_ab&&ib)bestMove=ib;
    if(_ab)break;
    if(is>=30000)break;
  }
  return bestMove;
}

// ---- Worker message handler ----
self.onmessage = function(e) {
  const { boardData, turn, capturedRed, capturedBlack, status, continuationPiece, difficulty } = e.data;

  const game = new Checkers();
  game.board = boardData.map(p => p ? { color: p.color, king: p.king } : null);
  game.turn = turn;
  game.capturedRed = capturedRed;
  game.capturedBlack = capturedBlack;
  game.status = status;
  game.continuationPiece = continuationPiece;
  game._computeMoves();

  let bestMove = null;
  if (difficulty === 'beginner') {
    const moves = game.validMoves;
    if (Math.random() < 0.7) bestMove = moves[Math.floor(Math.random() * moves.length)];
    else { const caps = moves.filter(m => m.captured.length > 0); bestMove = (caps.length ? caps : moves)[Math.floor(Math.random() * (caps.length || moves.length))]; }
  } else if (difficulty === 'intermediate') {
    if (Math.random() < 0.1) { const moves = game.validMoves; bestMove = moves[Math.floor(Math.random() * moves.length)]; }
    else bestMove = iterativeDeepening(game, 8, 300);
  } else {
    bestMove = iterativeDeepening(game, 99, 4000);
  }

  self.postMessage({ move: bestMove });
};