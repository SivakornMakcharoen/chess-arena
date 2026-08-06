import { closeModal, openModal, showPage } from './dom-utils.js';

export const SAFE_RESTORE_PAGES = ['page-checkers-menu', 'page-ai-difficulty', 'page-checkers-custom'];

const DIFFICULTY_LABELS = {
  beginner: '🟢 มือใหม่',
  intermediate: '🟡 กลาง',
  advanced: '💀 ยากมาก',
};

export function closeActiveModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

export function setBotThinking(isThinking) {
  document.getElementById('bot-think-c').classList.toggle('active', isThinking);
}

export function resetBoardUi(mode) {
  document.getElementById('chat-card-c').style.display = 'none';
  document.getElementById('room-number-display').style.display = 'none';
  setBotThinking(false);

  const aiCard = document.getElementById('ai-move-card');
  if (aiCard) aiCard.style.display = 'none';

  const aiLog = document.getElementById('ai-move-log');
  if (aiLog) aiLog.textContent = '';

  document.getElementById('topbar-normal-btns').style.display = mode === 'custom' ? 'none' : 'flex';
  document.getElementById('topbar-custom-btns').style.display = mode === 'custom' ? 'flex' : 'none';
}

export function setPlayersForMode(mode, difficulty) {
  if (mode === 'whiteboard') {
    document.getElementById('red-name-c').textContent = 'แดง (ผู้เล่น 1)';
    document.getElementById('black-name-c').textContent = 'ดำ (ผู้เล่น 2)';
    document.getElementById('red-sub-c').textContent = '';
    document.getElementById('black-sub-c').textContent = '';
    return;
  }

  if (mode === 'ai') {
    const diffLabel = DIFFICULTY_LABELS[difficulty] || '';
    document.getElementById('red-name-c').textContent = 'คุณ (ขาว)';
    document.getElementById('black-name-c').textContent = 'AI (ดำ)';
    document.getElementById('red-sub-c').textContent = '';
    document.getElementById('black-sub-c').textContent = 'ระดับ: ' + diffLabel;
  }
}

export function showGameOverModal({won, mode, subtitle, onWin, onLose}) {
  document.getElementById('gameover-icon-c').textContent = won ? '⚪' : '⚫';
  document.getElementById('gameover-title-c').textContent = won ? 'White Win!' : 'Black Win!';
  document.getElementById('gameover-sub-c').textContent = subtitle || 'ขอบคุณสำหรับเกมดีๆ';
  document.getElementById('btn-play-again-c').style.display = mode === 'custom' ? 'none' : '';
  if (won) onWin(); else onLose();
  openModal('gameover-modal-c');
}

export function showCustomMenu() {
  document.getElementById('checkers-join-panel').style.display = 'none';
  document.getElementById('checkers-join-input').value = '';
  showPage('page-checkers-custom');
}

export function toggleJoinPanel() {
  const panel = document.getElementById('checkers-join-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  if (panel.style.display !== 'none') {
    setTimeout(() => document.getElementById('checkers-join-input').focus(), 100);
  }
}

export function getJoinCode() {
  return document.getElementById('checkers-join-input').value.trim();
}

export function setJoinError(message = '') {
  const errEl = document.getElementById('checkers-join-error');
  errEl.textContent = message;
  errEl.style.display = message ? 'block' : 'none';
}

export function setJoinButtonBusy(isBusy) {
  const btn = document.querySelector('#checkers-join-panel .btn');
  if (!btn) return;
  btn.disabled = isBusy;
  btn.textContent = isBusy ? 'กำลังเชื่อมต่อ...' : 'เข้าร่วม';
}

export function getChatInputMessage() {
  const input = document.getElementById('chat-input-c');
  return {input, message: (input?.value || '').trim()};
}

export function copyRoomCode(roomCode) {
  if (!roomCode) return;
  navigator.clipboard?.writeText(roomCode).catch(() => {});
  const btn = document.querySelector('.copy-btn');
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = 'คัดลอกแล้ว!';
  setTimeout(() => { btn.textContent = original; }, 2000);
}

export function updateSoundButtons(enabled) {
  const label = enabled ? '🔊 เสียง' : '🔇 เสียง';
  const btn1 = document.getElementById('btn-sound-toggle');
  const btn2 = document.getElementById('btn-sound-toggle-custom');
  if (btn1) btn1.textContent = label;
  if (btn2) btn2.textContent = label;
}

export function closeGameOverModal() {
  closeModal('gameover-modal-c');
}