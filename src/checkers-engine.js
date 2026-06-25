import { SUPABASE_ANON_KEY, SUPABASE_URL } from './checkers/config.js';
import { Checkers } from './checkers/checkers-game.js';
import { CheckersBot } from './checkers/checkers-bot.js';
import { clearPageState, loadPageState, savePageState } from './checkers/page-state.js';
import { Sound } from './checkers/sound.js';

// ============================================================
// UTILS
// ============================================================
function showPage(id, save=true) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
  if(save) savePageState(id);
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function sanitize(s) { return String(s).replace(/[<>"'`;&\\\/]/g,'').trim().slice(0,256); }

function goBackToChess() {
  if (window.opener) { window.close(); return; }
  window.history.back();
}

function cGoMainMenu() {
  // Close all modals first
  document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('active'));
  CheckersOnline.cleanup();
  clearPageState();
  showPage('page-checkers-menu', false);
  savePageState('page-checkers-menu');
}
// ============================================================
// APP STATE
// ============================================================
let CAPP = { mode: null };
let cGame = null;
let cLastMove = null; // {from, to} — highlights AI's last move on board

function createCheckersGame() {
  return new Checkers({onKing: () => Sound.king()});
}

// ============================================================
// RENDER
// ============================================================
function cRender() {
  const board = document.getElementById('checkerboard');
  board.innerHTML = '';
  const flipped = (CAPP.mode==='custom' && CheckersOnline.myColor==='black');

  for (let vi=0; vi<64; vi++) {
    const i = flipped ? 63-vi : vi;
    const r = Math.floor(i/8), c = i%8;
    const sq = document.createElement('div');
    sq.className = 'sq ' + ((r+c)%2===0 ? 'light' : 'dark');
    sq.dataset.idx = i;

    // Highlight AI's last move (from + to) in yellow — always visible
    if (cLastMove && (i===cLastMove.from || i===cLastMove.to)) sq.classList.add('last-move');
    if (cGame.selected===i) sq.classList.add('selected');
    const validDests = cGame.validMoves.filter(m=>m.from===cGame.selected).map(m=>m.to);
    if (validDests.includes(i)) sq.classList.add('valid-move');

    const p = cGame.board[i];
    if (p) {
      const div = document.createElement('div');
      div.className = 'piece ' + (p.color==='red' ? 'white-piece' : 'black-piece') + (p.king ? ' king' : '');
      sq.appendChild(div);
    }

    if ((r+c)%2===1) sq.addEventListener('click', ()=>cHandleClick(i));
    board.appendChild(sq);
  }
  cUpdateSidebar();
}

function cUpdateSidebar() {
  if (!cGame) return;
  const st = document.getElementById('status-bar-c');
  if (cGame.status==='playing') {
    st.textContent = cGame.turn==='red' ? '◻️ White Turn' : '⬛ Black Turn';
    st.style.color = cGame.turn==='red' ? '#FFFFFF' : '#94A3B8';
  } else {
    st.textContent = cGame.status==='red_wins' ? '◻️ White Wins!' : '⬛ Black Wins!';
  }
  document.getElementById('row-red-c').className = 'player-row'+(cGame.turn==='red'?' active':'');
  document.getElementById('row-black-c').className = 'player-row'+(cGame.turn==='black'?' active':'');
  document.getElementById('captured-red-c').textContent = '×'+cGame.capturedBlack;
  document.getElementById('captured-black-c').textContent = '×'+cGame.capturedRed;
}

// ============================================================
// CLICK HANDLER
// ============================================================
function cHandleClick(idx) {
  if (!cGame || cGame.status!=='playing') return;
  if (CAPP.mode==='ai' && cGame.turn==='black') return;
  if (CAPP.mode==='custom') {
    const myColor = CheckersOnline.myColor;
    if (myColor!==cGame.turn) return;
  }

  const p = cGame.board[idx];

  if (cGame.selected !== null) {
    const move = cGame.validMoves.find(m=>m.from===cGame.selected && m.to===idx);
    if (move) {
      const wasCapture = move.captured.length>0;
      const prevSelected = cGame.selected;
      cGame.makeMove(cGame.selected, idx);
      if (wasCapture) Sound.capture(); else Sound.move();
      if (CAPP.mode==='custom') {
        CheckersOnline.broadcast('move', {from: prevSelected, to: idx});
      }
      cRender();
      cCheckGameOver();
      if (CAPP.mode==='ai' && cGame.status==='playing' && cGame.turn==='black') {
        setTimeout(cBotMove, 400+Math.random()*400);
      }
      return;
    }
    if (cGame.continuationPiece !== null) return; // locked to current piece
    cGame.selected = null;
  }

  if (p && p.color===cGame.turn) {
    const hasMoves = cGame.validMoves.some(m=>m.from===idx);
    if (hasMoves) { cGame.selected = idx; cLastMove = null; }
  }
  cRender();
}

let _botBusy = false;
function cBotMove() {
  if (!cGame || cGame.turn!=='black' || _botBusy) return;
  _botBusy = true;
  document.getElementById('bot-think-c').classList.add('active');

  // Let the browser paint "Thinking..." before we block the thread
  requestAnimationFrame(() => setTimeout(() => {
    const m = CheckersBot.getBestMove(cGame);
    document.getElementById('bot-think-c').classList.remove('active');
    _botBusy = false;
    if (m) {
      const wasCapture = m.captured.length > 0;
      const fromIdx = m.from, toIdx = m.to;
      cGame.makeMove(m.from, m.to);
      if (wasCapture) Sound.capture(); else Sound.move();
      cLastMove = {from: fromIdx, to: toIdx};
      cRender();
      cCheckGameOver();
      if (cGame.continuationPiece !== null && cGame.turn === 'black') {
        setTimeout(cBotMove, 300);
      }
    }
  }, 30));
}

function cCheckGameOver() {
  if (!cGame || cGame.status==='playing') return;
  setTimeout(()=>cShowGameOver(), 300);
}

function cShowGameOver(overrideWinner=null, subtitle=null) {
  const won = overrideWinner !== null ? overrideWinner === 'red' : cGame.status==='red_wins';
  document.getElementById('gameover-icon-c').textContent = won ? '⚪' : '⚫';
  document.getElementById('gameover-title-c').textContent = won ? 'White Win!' : 'Black Win!';
  document.getElementById('gameover-sub-c').textContent = subtitle || 'ขอบคุณสำหรับเกมดีๆ';
  // Hide play again in custom mode
  document.getElementById('btn-play-again-c').style.display = CAPP.mode==='custom' ? 'none' : '';
  if (won) Sound.win(); else Sound.lose();
  openModal('gameover-modal-c');
}

function cPlayAgain() {
  closeModal('gameover-modal-c');
  if (CAPP.mode) cInitGame(CAPP.mode);
}

// Custom mode resign / leave
function cRequestLeave() { openModal('confirm-leave-modal'); }
function cRequestResign() { openModal('confirm-resign-modal'); }

function cConfirmLeave() {
  closeModal('confirm-leave-modal');
  CheckersOnline.broadcast('opponent_left', {});
  CheckersOnline.cleanup();
  cGoMainMenu();
}

function cConfirmResign() {
  closeModal('confirm-resign-modal');
  const myColor = CheckersOnline.myColor;
  CheckersOnline.broadcast('opponent_resigned', {color: myColor});
  CheckersOnline.cleanup();
  cGoMainMenu();
}

// ============================================================
// GAME START
// ============================================================
function cInitGame(mode) {
  CAPP.mode = mode;
  cGame = createCheckersGame();

  document.getElementById('chat-card-c').style.display = 'none';
  document.getElementById('room-number-display').style.display = 'none';
  document.getElementById('bot-think-c').classList.remove('active');
  cLastMove = null;
  const aiCard = document.getElementById('ai-move-card');
  if (aiCard) { aiCard.style.display = mode==='ai' ? 'none' : 'none'; }
  const aiLog = document.getElementById('ai-move-log');
  if (aiLog) aiLog.textContent = '';

  // Topbar: show/hide custom buttons
  document.getElementById('topbar-normal-btns').style.display = mode==='custom' ? 'none' : 'flex';
  document.getElementById('topbar-custom-btns').style.display = mode==='custom' ? 'flex' : 'none';

  if (mode==='whiteboard') {
    document.getElementById('red-name-c').textContent = 'แดง (ผู้เล่น 1)';
    document.getElementById('black-name-c').textContent = 'ดำ (ผู้เล่น 2)';
    document.getElementById('red-sub-c').textContent = '';
    document.getElementById('black-sub-c').textContent = '';
  } else if (mode==='ai') {
    document.getElementById('red-name-c').textContent = 'คุณ (ขาว)';
    const diffLabel = {beginner:'🟢 มือใหม่',intermediate:'🟡 กลาง',advanced:'💀 ยากมาก'}[CheckersBot.difficulty]||'';
    document.getElementById('black-name-c').textContent = 'AI (ดำ)';
    document.getElementById('red-sub-c').textContent = '';
    document.getElementById('black-sub-c').textContent = 'ระดับ: '+diffLabel;
  }

  cRender();
  showPage('page-checkers-board');
}

function startCheckersWhiteboard() { cInitGame('whiteboard'); }

function showAIDiffPage() {
  showPage('page-ai-difficulty');
}

function startCheckersAI(diff) {
  CheckersBot.difficulty = diff;
  cInitGame('ai');
}

function showCheckersCustomMenu() {
  document.getElementById('checkers-join-panel').style.display='none';
  document.getElementById('checkers-join-input').value='';
  showPage('page-checkers-custom');
}

function showCheckersJoinPanel() {
  const p = document.getElementById('checkers-join-panel');
  p.style.display = p.style.display==='none'?'block':'none';
  if (p.style.display!=='none') setTimeout(()=>document.getElementById('checkers-join-input').focus(),100);
}

// ============================================================
// ONLINE CUSTOM MODE
// ============================================================
const CheckersOnline = {
  _ws: null, _channelTopic: null, _active: false,
  _reconnectTimer: null, _pingTimer: null, _reconnectAttempts: 0,
  myColor: null, isBuilder: false, roomCode: null, opponentName: null,

  generateCode() {
    const arr = new Uint16Array(1); crypto.getRandomValues(arr);
    return String(1000+(arr[0]%9000)).padStart(4,'0');
  },

  async build() {
    const code = this.generateCode();
    this.roomCode = code; this.myColor='red'; this.isBuilder=true;
    document.getElementById('waiting-room-code').textContent = code;
    document.getElementById('waiting-overlay').style.display='flex';
    this._connect(code,'builder');
  },

  async join(code) {
    this.roomCode=code; this.myColor='black'; this.isBuilder=false;
    this._connect(code,'joiner');
  },

  _connect(code, role) {
    this._clearTimers();
    if (this._ws) { try{this._ws.close()}catch(e){} this._ws=null; }
    const wsUrl = SUPABASE_URL.replace('https://','wss://')+'/realtime/v1/websocket?apikey='+SUPABASE_ANON_KEY+'&vsn=1.0.0';
    let ws;
    try { ws = new WebSocket(wsUrl); } catch(e){ this._scheduleReconnect(code,role); return; }
    this._ws = ws; this._active = true;
    const topic = 'realtime:checkers-room-'+code;
    this._channelTopic = topic;
    const self = this;

    ws.onopen = ()=>{
      self._reconnectAttempts = 0;
      ws.send(JSON.stringify({topic,event:'phx_join',payload:{config:{broadcast:{self:false},presence:{key:'player'}}},ref:'1'}));
      // Keepalive ping every 20s to prevent idle disconnect
      self._pingTimer = setInterval(()=>{
        if(ws.readyState===WebSocket.OPEN){
          ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:'hb'}));
        }
      }, 20000);
    };

    ws.onmessage = (evt)=>{
      let msg; try{msg=JSON.parse(evt.data)}catch(e){return}
      if (msg.event==='phx_reply'&&msg.ref==='1') {
        if (role==='joiner') self._send('player_joined',{nickname:'Joiner',color:'black'});
      }
      if (msg.event==='broadcast'&&msg.payload?.type) self._handle(msg.payload.type,msg.payload.data||{});
    };

    ws.onerror = ()=>{}; // handled in onclose

    ws.onclose = (e)=>{
      self._clearTimers();
      if (!self._active) return;
      // Reconnect automatically
      self._scheduleReconnect(code, role);
      if (CAPP.mode==='custom') {
        self._sysMsg('⚠️ การเชื่อมต่อขาดหาย กำลังเชื่อมต่อใหม่...');
      }
    };
  },

  _scheduleReconnect(code, role) {
    if (!this._active) return;
    this._reconnectAttempts++;
    const delay = Math.min(1000 * this._reconnectAttempts, 8000);
    this._reconnectTimer = setTimeout(()=>{
      if (this._active) this._connect(code, role);
    }, delay);
  },

  _clearTimers() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer=null; }
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer=null; }
  },

  _send(type,data) {
    if(!this._ws||this._ws.readyState!==WebSocket.OPEN) return;
    try {
      this._ws.send(JSON.stringify({topic:this._channelTopic,event:'broadcast',payload:{type,data},ref:String(Date.now())}));
    } catch(e){}
  },
  broadcast(type,data){ this._send(type,data); },

  _handle(type,data) {
    if (type==='player_joined' && this.isBuilder) {
      this.opponentName = data.nickname||'Player 2';
      document.getElementById('waiting-overlay').style.display='none';
      this._launchGame();
      this._send('player_joined_ack',{nickname:'Builder',color:'red'});
    }
    if (type==='player_joined_ack' && !this.isBuilder) {
      this.opponentName = data.nickname||'Player 1';
      this._launchGame();
    }
    if (type==='move') this._onMove(data);
    if (type==='chat') this._onChat(data);
    if (type==='opponent_left') {
      document.getElementById('opp-left-icon').textContent='🚪';
      document.getElementById('opp-left-title').textContent='คู่ต่อสู้ออกจากเกม';
      document.getElementById('opp-left-sub').textContent='อีกฝ่ายออกจากเกมแล้ว';
      openModal('opponent-left-modal');
    }
    if (type==='opponent_resigned') {
      document.getElementById('opp-left-icon').textContent='🏳️';
      document.getElementById('opp-left-title').textContent='คู่ต่อสู้ยอมแพ้!';
      document.getElementById('opp-left-sub').textContent='คุณชนะ! อีกฝ่ายยอมแพ้แล้ว';
      openModal('opponent-left-modal');
    }
  },

  _launchGame() {
    CAPP.mode='custom';
    cGame = createCheckersGame();
    const myNick = this.myColor==='red'?'คุณ (ขาว)':'คุณ (ดำ)';
    const oppNick = this.myColor==='red'?'เพื่อน (ดำ)':'เพื่อน (ขาว)';
    document.getElementById('red-name-c').textContent = this.myColor==='red'?myNick:oppNick;
    document.getElementById('black-name-c').textContent = this.myColor==='black'?myNick:oppNick;
    document.getElementById('red-sub-c').textContent=''; document.getElementById('black-sub-c').textContent='';
    document.getElementById('chat-card-c').style.display='flex';
    document.getElementById('room-badge-c').textContent='ห้อง #'+this.roomCode;
    const rd = document.getElementById('room-number-display-c2');
    if(rd){ rd.textContent='🔑 '+this.roomCode; rd.style.cssText='font-size:13px;font-weight:800;color:var(--primary);background:rgba(181,136,99,.13);padding:4px 12px;border-radius:8px;border:1px solid rgba(181,136,99,.25);letter-spacing:3px;'; }
    document.getElementById('topbar-normal-btns').style.display='none';
    document.getElementById('topbar-custom-btns').style.display='flex';
    document.getElementById('chat-messages-c').innerHTML='';
    this._sysMsg('🎮 เชื่อมต่อห้อง #'+this.roomCode+' สำเร็จ!');
    this._sysMsg((this.myColor==='red'?'◻️ คุณเล่นเป็นฝ่ายขาว':'⬛ คุณเล่นเป็นฝ่ายดำ'));
    cRender();
    showPage('page-checkers-board');
    const inp = document.getElementById('chat-input-c');
    if(inp) inp.addEventListener('keydown',(e)=>{if(e.key==='Enter')cSendChat();});
  },

  _onMove(data) {
    if (!cGame) return;
    const {from,to} = data;
    if (typeof from==='number'&&typeof to==='number') {
      const move = cGame.validMoves.find(m=>m.from===from&&m.to===to);
      const wasCapture = move?.captured?.length>0;
      cGame.makeMove(from,to);
      if (wasCapture) Sound.capture(); else Sound.move();
      cRender();
      cCheckGameOver();
    }
  },

  _onChat(data) {
    this._addMsg(sanitize(data.nickname||'Opponent'), sanitize(data.message||''), 'them');
  },

  sendChat(msg) {
    const clean = sanitize(msg).slice(0,200);
    if (!clean) return;
    this._addMsg('คุณ', clean, 'me');
    this._send('chat',{nickname:'ผู้เล่น',message:clean});
  },

  _addMsg(name,text,type) {
    const c=document.getElementById('chat-messages-c'); if(!c) return;
    const d=document.createElement('div'); d.className='chat-msg '+type;
    if(type!=='system'){const n=document.createElement('div');n.className='chat-msg-name';n.textContent=name;d.appendChild(n);}
    const t=document.createElement('div');t.textContent=text;d.appendChild(t);
    c.appendChild(d);c.scrollTop=c.scrollHeight;
  },
  _sysMsg(text){ this._addMsg('','  '+text,'system'); },

  cleanup() {
    this._active=false;
    this._clearTimers();
    if(this._ws){try{this._ws.close()}catch(e){}; this._ws=null;}
    document.getElementById('chat-card-c').style.display='none';
    document.getElementById('room-number-display').style.display='none';
    document.getElementById('waiting-overlay').style.display='none';
  }
};

async function checkersCustomBuild() { await CheckersOnline.build(); }

async function checkersJoinRoom() {
  const code = document.getElementById('checkers-join-input').value.trim();
  const errEl = document.getElementById('checkers-join-error');
  if (!/^\d{4}$/.test(code)) { errEl.textContent='กรุณาใส่รหัสห้อง 4 หลัก'; errEl.style.display='block'; return; }
  errEl.style.display='none';
  await CheckersOnline.join(code);
  const btn = document.querySelector('#checkers-join-panel .btn');
  if(btn){btn.disabled=true;btn.textContent='กำลังเชื่อมต่อ...';}
  setTimeout(()=>{if(btn){btn.disabled=false;btn.textContent='เข้าร่วม';}},8000);
}

function cSendChat() {
  const input=document.getElementById('chat-input-c');
  const msg=(input?.value||'').trim();
  if(!msg) return;
  CheckersOnline.sendChat(msg);
  input.value='';
}

function cCopyRoomCode() {
  const code=CheckersOnline.roomCode; if(!code) return;
  navigator.clipboard?.writeText(code).catch(()=>{});
  const btn=document.querySelector('.copy-btn');
  if(btn){const o=btn.textContent;btn.textContent='คัดลอกแล้ว!';setTimeout(()=>{btn.textContent=o;},2000);}
}

// ============================================================
// KEYBOARD
// ============================================================
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') document.querySelectorAll('.modal-overlay.active').forEach(m=>m.classList.remove('active'));
});

// ============================================================
// RESTORE PAGE ON REFRESH
// ============================================================
(function restoreOnLoad() {
  const state = loadPageState();
  if (!state || !state.pageId) return;
  // Only restore safe pages (not board mid-game, since game state is lost)
  const safepages = ['page-checkers-menu','page-ai-difficulty','page-checkers-custom'];
  if (safepages.includes(state.pageId)) {
    showPage(state.pageId, false);
  }
})();

// ============================================================
// SOUND TOGGLE
// ============================================================
function cToggleSound() {
  Sound.enabled = !Sound.enabled;
  const label = Sound.enabled ? '🔊 เสียง' : '🔇 เสียง';
  const btn1 = document.getElementById('btn-sound-toggle');
  const btn2 = document.getElementById('btn-sound-toggle-custom');
  if (btn1) btn1.textContent = label;
  if (btn2) btn2.textContent = label;
}

// ============================================================
// EXPOSE TO WINDOW
// This file is loaded as an ES module by Vite, so top-level
// functions are no longer implicitly global. checkers.html still
// calls these via inline onclick="..." attributes.
// ============================================================
Object.assign(window, {
    cConfirmLeave, cConfirmResign, cCopyRoomCode, cGoMainMenu, cPlayAgain,
    cRequestLeave, cRequestResign, cSendChat, checkersCustomBuild,
    checkersJoinRoom, closeModal, goBackToChess, showAIDiffPage,
    showCheckersCustomMenu, showCheckersJoinPanel, showPage,
    startCheckersAI, startCheckersWhiteboard, cToggleSound,
});