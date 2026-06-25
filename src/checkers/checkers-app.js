import { Checkers } from './checkers-game.js';
import { CheckersBot } from './checkers-bot.js';
import { closeModal, goBackToChess, openModal, sanitize, showPage } from './dom-utils.js';
import { closeActiveModals, closeGameOverModal, copyRoomCode as copyRoomCodeUi, getChatInputMessage, getJoinCode, resetBoardUi, SAFE_RESTORE_PAGES, setJoinButtonBusy, setJoinError, setPlayersForMode, showCustomMenu as showCustomMenuUi, showGameOverModal, toggleJoinPanel, updateSoundButtons, setBotThinking } from './checkers-ui.js';
import { renderCheckersBoard } from './checkers-renderer.js';
import { createCheckersOnline } from './checkers-online.js';
import { clearPageState, loadPageState, savePageState } from './page-state.js';
import { Sound } from './sound.js';

export class CheckersApp {
  constructor() {
    this.state = {mode: null};
    this.game = null;
    this.lastMove = null;
    this.botBusy = false;

    this.online = createCheckersOnline({
      getGame: () => this.game,
      getMode: () => this.state.mode,
      setCustomGame: () => {
        this.state.mode = 'custom';
        this.game = this.createGame();
      },
      render: () => this.render(),
      showBoardPage: () => showPage('page-checkers-board'),
      checkGameOver: () => this.checkGameOver(),
      openModal,
      sanitize,
      sendChatFromInput: () => this.sendChat(),
      playMoveSound: () => Sound.move(),
      playCaptureSound: () => Sound.capture(),
    });
  }

  createGame() {
    return new Checkers({onKing: () => Sound.king()});
  }

  goMainMenu() {
    closeActiveModals();
    this.online.cleanup();
    clearPageState();
    showPage('page-checkers-menu', false);
    savePageState('page-checkers-menu');
  }

  render() {
    if (!this.game) return;
    renderCheckersBoard({
      game: this.game,
      mode: this.state.mode,
      myColor: this.online.myColor,
      lastMove: this.lastMove,
      onSquareClick: idx => this.handleClick(idx),
    });
  }

  handleClick(idx) {
    const game = this.game;
    if (!game || game.status !== 'playing') return;
    if (this.state.mode === 'ai' && game.turn === 'black') return;
    if (this.state.mode === 'custom' && this.online.myColor !== game.turn) return;

    const p = game.board[idx];

    if (game.selected !== null) {
      const move = game.validMoves.find(m => m.from === game.selected && m.to === idx);
      if (move) {
        const wasCapture = move.captured.length > 0;
        const prevSelected = game.selected;
        game.makeMove(game.selected, idx);
        if (wasCapture) Sound.capture(); else Sound.move();
        if (this.state.mode === 'custom') {
          this.online.broadcast('move', {from: prevSelected, to: idx});
        }
        this.render();
        this.checkGameOver();
        if (this.state.mode === 'ai' && game.status === 'playing' && game.turn === 'black') {
          setTimeout(() => this.botMove(), 400 + Math.random() * 400);
        }
        return;
      }
      if (game.continuationPiece !== null) return;
      game.selected = null;
    }

    if (p && p.color === game.turn) {
      const hasMoves = game.validMoves.some(m => m.from === idx);
      if (hasMoves) {
        game.selected = idx;
        this.lastMove = null;
      }
    }
    this.render();
  }

  botMove() {
    const game = this.game;
    if (!game || game.turn !== 'black' || this.botBusy) return;
    this.botBusy = true;
    setBotThinking(true);

    requestAnimationFrame(() => setTimeout(() => {
      const m = CheckersBot.getBestMove(game);
      setBotThinking(false);
      this.botBusy = false;
      if (!m) return;

      const wasCapture = m.captured.length > 0;
      const fromIdx = m.from, toIdx = m.to;
      game.makeMove(m.from, m.to);
      if (wasCapture) Sound.capture(); else Sound.move();
      this.lastMove = {from: fromIdx, to: toIdx};
      this.render();
      this.checkGameOver();
      if (game.continuationPiece !== null && game.turn === 'black') {
        setTimeout(() => this.botMove(), 300);
      }
    }, 30));
  }

  checkGameOver() {
    if (!this.game || this.game.status === 'playing') return;
    setTimeout(() => this.showGameOver(), 300);
  }

  showGameOver(overrideWinner = null, subtitle = null) {
    const won = overrideWinner !== null ? overrideWinner === 'red' : this.game.status === 'red_wins';
    showGameOverModal({
      won,
      mode: this.state.mode,
      subtitle,
      onWin: () => Sound.win(),
      onLose: () => Sound.lose(),
    });
  }

  playAgain() {
    closeGameOverModal();
    if (this.state.mode) this.initGame(this.state.mode);
  }

  requestLeave() {
    openModal('confirm-leave-modal');
  }

  requestResign() {
    openModal('confirm-resign-modal');
  }

  confirmLeave() {
    closeModal('confirm-leave-modal');
    this.online.broadcast('opponent_left', {});
    this.online.cleanup();
    this.goMainMenu();
  }

  confirmResign() {
    closeModal('confirm-resign-modal');
    this.online.broadcast('opponent_resigned', {color: this.online.myColor});
    this.online.cleanup();
    this.goMainMenu();
  }

  initGame(mode) {
    this.state.mode = mode;
    this.game = this.createGame();

    resetBoardUi(mode);
    this.lastMove = null;
    setPlayersForMode(mode, CheckersBot.difficulty);

    this.render();
    showPage('page-checkers-board');
  }

  startWhiteboard() {
    this.initGame('whiteboard');
  }

  showAIDiffPage() {
    showPage('page-ai-difficulty');
  }

  startAI(diff) {
    CheckersBot.difficulty = diff;
    this.initGame('ai');
  }

  showCustomMenu() {
    showCustomMenuUi();
  }

  showJoinPanel() {
    toggleJoinPanel();
  }

  async customBuild() {
    await this.online.build();
  }

  async joinRoom() {
    const code = getJoinCode();
    if (!/^\d{4}$/.test(code)) {
      setJoinError('\u0e01\u0e23\u0e38\u0e13\u0e32\u0e43\u0e2a\u0e48\u0e23\u0e2b\u0e31\u0e2a\u0e2b\u0e49\u0e2d\u0e07 4 \u0e2b\u0e25\u0e31\u0e01');
      return;
    }
    setJoinError();
    await this.online.join(code);
    setJoinButtonBusy(true);
    setTimeout(() => setJoinButtonBusy(false), 8000);
  }

  sendChat() {
    const {input, message} = getChatInputMessage();
    if (!message) return;
    this.online.sendChat(message);
    input.value = '';
  }

  copyRoomCode() {
    copyRoomCodeUi(this.online.roomCode);
  }

  toggleSound() {
    Sound.enabled = !Sound.enabled;
    updateSoundButtons(Sound.enabled);
  }

  bindGlobalEvents() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeActiveModals();
      }
    });
  }

  restorePage() {
    const state = loadPageState();
    if (!state || !state.pageId) return;
    if (SAFE_RESTORE_PAGES.includes(state.pageId)) {
      showPage(state.pageId, false);
    }
  }

  start() {
    this.bindGlobalEvents();
    this.restorePage();
  }

  windowHandlers() {
    return {
      cConfirmLeave: () => this.confirmLeave(),
      cConfirmResign: () => this.confirmResign(),
      cCopyRoomCode: () => this.copyRoomCode(),
      cGoMainMenu: () => this.goMainMenu(),
      cPlayAgain: () => this.playAgain(),
      cRequestLeave: () => this.requestLeave(),
      cRequestResign: () => this.requestResign(),
      cSendChat: () => this.sendChat(),
      checkersCustomBuild: () => this.customBuild(),
      checkersJoinRoom: () => this.joinRoom(),
      closeModal,
      goBackToChess,
      showAIDiffPage: () => this.showAIDiffPage(),
      showCheckersCustomMenu: () => this.showCustomMenu(),
      showCheckersJoinPanel: () => this.showJoinPanel(),
      showPage,
      startCheckersAI: diff => this.startAI(diff),
      startCheckersWhiteboard: () => this.startWhiteboard(),
      cToggleSound: () => this.toggleSound(),
    };
  }
}
