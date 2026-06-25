import { savePageState } from './page-state.js';

export function showPage(id, save = true) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (save) savePageState(id);
}

export function openModal(id) {
  document.getElementById(id).classList.add('active');
}

export function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

export function sanitize(s) {
  return String(s).replace(/[<>"'`;&\\\/]/g, '').trim().slice(0, 256);
}

export function goBackToChess() {
  if (window.opener) {
    window.close();
    return;
  }
  window.history.back();
}
