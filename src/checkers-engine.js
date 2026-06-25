import { Checkers } from './checkers/checkers-game.js';
import { CheckersBot } from './checkers/checkers-bot.js';
import { closeModal, goBackToChess, openModal, sanitize, showPage } from './checkers/dom-utils.js';
import { renderCheckersBoard } from './checkers/checkers-renderer.js';
import { createCheckersOnline } from './checkers/checkers-online.js';
import { clearPageState, loadPageState, savePageState } from './checkers/page-state.js';
import { Sound } from './checkers/sound.js';

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
  if (!cGame) return;
  renderCheckersBoard({
    game: cGame,
    mode: CAPP.mode,
    myColor: CheckersOnline.myColor,
    lastMove: cLastMove,
    onSquareClick: cHandleClick,
  });
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
const CheckersOnline = createCheckersOnline({
  getGame: () => cGame,
  getMode: () => CAPP.mode,
  setCustomGame: () => {
    CAPP.mode = 'custom';
    cGame = createCheckersGame();
  },
  render: cRender,
  showBoardPage: () => showPage('page-checkers-board'),
  checkGameOver: cCheckGameOver,
  openModal,
  sanitize,
  sendChatFromInput: cSendChat,
  playMoveSound: () => Sound.move(),
  playCaptureSound: () => Sound.capture(),
});
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