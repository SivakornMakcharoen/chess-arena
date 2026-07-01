import { SUPABASE_ANON_KEY, SUPABASE_URL } from './chess/config.js';
import { Auth } from './chess/auth.js';
import { Bot } from './chess/bot.js';
import { ChessGame } from './chess/chess-game.js';
import { DB } from './chess/db.js';
import { PIECE_IMAGES } from './chess/pieces.js';
import { Rating } from './chess/rating.js';
import { Security } from './chess/security.js';
import { Sound } from './chess/sound.js';

// ============================================================
// APP STATE
// ============================================================
let APP = {
    player: null,
    player2: null,
    gameMode: null,
    hintMode: true,
    pendingMode: null,
    botDifficulty: 500
};

// ============================================================
// BOT DIFFICULTY LEVELS (rating -> rating reward เมื่อชนะ)
// ============================================================
const BOT_LEVELS = {
    100: 2,
    300: 4,
    500: 5,
    900: 7,
    1100: 15,
    1200: 17,
    1500: 20
};

// ============================================================
// GAME UI
// ============================================================
let chess = null;
let botRating = 500;

function initBoard() {
    chess = new ChessGame();
    renderBoard();
    updateSidebar();
}

function renderBoard() {
    const board = document.getElementById('chessboard');
    board.innerHTML = '';
    // Flip board for black player in custom mode
    const flipped = (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined' && CustomMode.myColor === 'black');
    for (let vi = 0; vi < 64; vi++) {
        const i = flipped ? (63 - vi) : vi;
        const r = Math.floor(i / 8), c = i % 8;
        const sq = document.createElement('div');
        sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.idx = i;

        if (chess.lastFrom === i || chess.lastTo === i) sq.classList.add('last-move');
        if (chess.selected === i) sq.classList.add('selected');
        if (chess.legalMoves.includes(i)) {
            sq.classList.add(chess.board[i] ? 'hint-capture' : 'hint-move');
        }
        if ((chess.status === 'check' || chess.status === 'checkmate') && chess.isInCheck(chess.board, chess.turn)) {
            const k = chess.turn === 'w' ? 'K' : 'k';
            if (chess.board.indexOf(k) === i) sq.classList.add('check');
        }

        // FIX: piece rendered as Unicode emoji span with correct styling
        if (chess.board[i]) {
            const piece = document.createElement('div');
            piece.className = 'piece';
            const img = document.createElement('img');
            img.src = PIECE_IMAGES[chess.board[i]];
            img.style.cssText = 'width:88%; height:88%; object-fit:contain; pointer-events:none;';
            img.draggable = false;
            piece.appendChild(img);
            sq.appendChild(piece);
        }

        // Hint overlays — show in hintMode OR in custom/whiteboard modes
        const showHints = APP.hintMode || APP.gameMode === 'custom' || APP.gameMode === 'whiteboard';
        if (showHints && chess.legalMoves.includes(i)) {
            if (!chess.board[i]) {
                const dot = document.createElement('div');
                dot.className = 'hint-dot';
                sq.appendChild(dot);
            } else {
                const ring = document.createElement('div');
                ring.className = 'hint-ring';
                sq.appendChild(ring);
            }
        }

        // Show rank label on left edge (col 0 when normal, col 7 when flipped)
        const isLeftEdge = flipped ? (c === 7) : (c === 0);
        const isBottomEdge = flipped ? (r === 0) : (r === 7);
        if (isLeftEdge) {
            const lbl = document.createElement('span');
            lbl.className = 'sq-coord rank';
            lbl.textContent = 8 - r;
            sq.appendChild(lbl);
        }
        if (isBottomEdge) {
            const lbl = document.createElement('span');
            lbl.className = 'sq-coord file';
            lbl.textContent = 'abcdefgh'[c];
            sq.appendChild(lbl);
        }

        sq.addEventListener('click', () => handleSquareClick(i));
        board.appendChild(sq);
    }
}

function handleSquareClick(idx) {
    if (!chess || chess.status === 'checkmate' || chess.status === 'stalemate' || chess.status === 'draw') return;
    if (APP.gameMode === 'single' && chess.turn === 'b') return;

    const sq = chess.board[idx];
    const turn = chess.turn;

    if (chess.selected !== null) {
        if (chess.legalMoves.includes(idx)) {
            const p = chess.board[chess.selected];
            const promoRow = turn === 'w' ? 0 : 7;
            if (p && p.toUpperCase() === 'P' && Math.floor(idx / 8) === promoRow) {
                showPromotionModal(chess.selected, idx, turn);
                return;
            }
            executeMove(chess.selected, idx);
        } else {
            chess.selected = null;
            chess.legalMoves = [];
            if (sq && ((turn === 'w' && chess.isWhite(sq)) || (turn === 'b' && chess.isBlack(sq)))) {
                chess.selected = idx;
                chess.legalMoves = chess.getLegalMoves(idx);
            }
            renderBoard();
        }
    } else {
        if (sq && ((turn === 'w' && chess.isWhite(sq)) || (turn === 'b' && chess.isBlack(sq)))) {
            chess.selected = idx;
            chess.legalMoves = chess.getLegalMoves(idx);
            renderBoard();
        }
    }
}

function executeMove(from, to, promoChoice = null) {
    // Custom mode: only allow moving your own color pieces
    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        const myColor = CustomMode.myColor;
        const turnColor = chess?.turn === 'w' ? 'white' : 'black';
        if (myColor !== turnColor) return;
    }

    const wasCapture = !!chess.board[to];
    const wasCastle = chess.board[from]?.toUpperCase() === 'K' && Math.abs((from % 8) - (to % 8)) === 2;
    const wasPromo = chess.board[from]?.toUpperCase() === 'P' && Math.floor(to / 8) === (chess.turn === 'w' ? 0 : 7);
    const ok = chess.makeMove(from, to, promoChoice);
    if (!ok) return;

    // Broadcast move to opponent in custom mode
    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        CustomMode.broadcast('move', { from, to, promo: promoChoice || null });
    }

    // เสียงตามประเภทการเดิน
    if (wasPromo) Sound.promote();
    else if (wasCastle) Sound.castle();
    else if (wasCapture) Sound.capture();
    else Sound.move();

    chess.selected = null;
    chess.legalMoves = [];
    renderBoard();
    updateSidebar();

    // เสียง check หลัง render
    if (chess.status === 'check') setTimeout(() => Sound.check(), 150);

    checkGameOver();
    if (APP.gameMode === 'single' && (chess.status === 'playing' || chess.status === 'check') && chess.turn === 'b') {
        setTimeout(doBotMove, 400 + Math.random() * 600);
    }
}

function doBotMove() {
    if (!chess || chess.turn !== 'b') return;
    document.getElementById('bot-think').classList.add('active');
    setTimeout(() => {
        const m = Bot.getBestMove(chess, APP.botDifficulty || 500);
        document.getElementById('bot-think').classList.remove('active');
        if (m) {
            const wasCapture = !!chess.board[m.to];
            const wasCastle = chess.board[m.from]?.toUpperCase() === 'K' && Math.abs((m.from % 8) - (m.to % 8)) === 2;
            chess.makeMove(m.from, m.to, 'Q');

            if (wasCastle) Sound.castle();
            else if (wasCapture) Sound.capture();
            else Sound.move();

            chess.selected = null;
            chess.legalMoves = [];
            renderBoard();
            updateSidebar();

            if (chess.status === 'check') setTimeout(() => Sound.check(), 150);
            checkGameOver();
        }
    }, 100);
}

function showPromotionModal(from, to, turn) {
    const pieces = ['Q', 'R', 'B', 'N'];
    const grid = document.getElementById('promo-grid');
    grid.innerHTML = '';
    pieces.forEach(pc => {
        const btn = document.createElement('button');
        btn.className = 'promo-btn';
        const img = document.createElement('img');
        img.src = PIECE_IMAGES[turn === 'w' ? pc : pc.toLowerCase()];
        img.style.cssText = 'width:48px; height:48px;';
        btn.appendChild(img);
        btn.onclick = () => {
            closeModal('promo-modal');
            executeMove(from, to, pc);
        };
        grid.appendChild(btn);
    });
    openModal('promo-modal');
}

function updateSidebar() {
    if (!chess) return;
    const statusEl = document.getElementById('status-bar');
    const turnName = chess.turn === 'w' ? 'White' : 'Black';
    if (chess.status === 'check') {
        statusEl.textContent = `${turnName} Check!`;
        statusEl.className = 'status-bar check-status';
    } else {
        statusEl.textContent = `${turnName} Turn`;
        statusEl.className = 'status-bar';
    }

    document.getElementById('row-white').className = 'player-row' + (chess.turn === 'w' ? ' active' : '');
    document.getElementById('row-black').className = 'player-row' + (chess.turn === 'b' ? ' active' : '');

    const wb = document.getElementById('warning-banner');
    if (APP.hintMode && chess.status === 'check') {
        const attackers = chess.getAttackers();
        const names = { R: 'รูค', N: 'ไนท์', B: 'บิชอป', Q: 'ควีน', P: 'เบี้ย' };
        const attackerNames = attackers.map(i => (names[chess.board[i].toUpperCase()] || chess.board[i]) + ' (' + chess.sqNote(i) + ')');
        document.getElementById('warning-text').textContent = `กษัตริย์โดน Check จาก: ${attackerNames.join(', ')}`;
        wb.style.display = 'flex';
    } else {
        wb.style.display = 'none';
    }

    // FIX: display captured pieces as Unicode characters
    const el = document.getElementById('captured-white');
    el.innerHTML = '';
    chess.capturedWhite.forEach(p => {
        const img = document.createElement('img');
        img.src = PIECE_IMAGES[p];
        img.style.cssText = 'width:22px; height:22px;';
        el.appendChild(img);
    });

    const elB = document.getElementById('captured-black');
    elB.innerHTML = '';
    chess.capturedBlack.forEach(p => {
        const img = document.createElement('img');
        img.src = PIECE_IMAGES[p];
        img.style.cssText = 'width:22px; height:22px;';
        elB.appendChild(img);
    });

    const ml = document.getElementById('move-list');
    ml.innerHTML = '';
    for (let i = 0; i < chess.moves.length; i += 2) {
        const div = document.createElement('div');
        div.className = 'move-pair';
        div.innerHTML = `<span class="move-num">${Math.floor(i / 2) + 1}.</span><span class="move-w">${chess.moves[i]?.notation || ''}</span><span class="move-b">${chess.moves[i + 1]?.notation || ''}</span>`;
        ml.appendChild(div);
    }
    ml.scrollTop = ml.scrollHeight;
}

function checkGameOver() {
    if (!chess) return;
    if (chess.status === 'checkmate' || chess.status === 'stalemate' || chess.status === 'draw') {
        setTimeout(() => showGameOver(chess.status), 300);
    }
}

async function showGameOver(status) {
    let title, sub, icon, result;
    const isWhiteWin = status === 'checkmate' && chess.turn === 'b';

    if (status === 'stalemate') { title = 'เสมอ — Stalemate'; sub = 'ไม่มีการเดินที่ถูกกฎ'; icon = '🤝'; result = 'draw'; }
    else if (status === 'draw') { title = 'เสมอ — 50-move rule'; sub = 'ไม่มีการกินหมากหรือเดินเบี้ยเกิน 50 ตา'; icon = '🤝'; result = 'draw'; }
    else if (isWhiteWin) { title = 'ขาวชนะ! Checkmate!'; sub = '♔ คุณรักษาตำแหน่งได้ดีมาก!'; icon = '🎉'; result = APP.gameMode === 'single' ? 'win' : 'white'; }
    else { title = 'ดำชนะ! Checkmate!'; sub = '♚ ลองใหม่อีกครั้งนะ!'; icon = '😓'; result = APP.gameMode === 'single' ? 'loss' : 'black'; }

    // เสียงผลลัพธ์
    if (result === 'draw') Sound.draw();
    else if (result === 'win' || (result === 'white' && APP.gameMode !== 'single') || result === 'black') {
        const iWin = (result === 'win') || (APP.gameMode === 'two' && result === 'white');
        setTimeout(() => iWin ? Sound.win() : Sound.lose(), 200);
    } else {
        setTimeout(() => Sound.lose(), 200);
    }

    let delta = 0;
    if (APP.gameMode === 'single' && APP.player && APP.gameMode !== 'whiteboard') {
        // Single player vs AI: reward depends on bot difficulty rating chosen
        if (result === 'win') delta = BOT_LEVELS[APP.botDifficulty] || 5;
        const ratingBefore = APP.player.rating;
        APP.player.rating = Math.max(0, APP.player.rating + delta);
        try {
            await DB.updateStats(APP.player.id, delta, result);
            await DB.logGame({ playerId: APP.player.id, opponent: 'Bot', result, movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'single' });
        } catch (e) { console.warn('DB update failed:', e); }
        updateMenuUI();

        if (delta !== 0) {
            const el = document.createElement('div');
            el.className = 'rating-delta';
            el.textContent = (delta >= 0 ? '+' : '') + delta;
            el.style.color = delta >= 0 ? 'var(--accent)' : 'var(--danger)';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2000);
        }
    }
    // Two-player (local) game: +10 for winner
    if (APP.gameMode === 'two' && result !== 'draw') {
        const winnerPlayer = result === 'white' ? APP.player : APP.player2;
        if (winnerPlayer && winnerPlayer.id) {
            const ratingBefore = winnerPlayer.rating;
            winnerPlayer.rating = Math.max(0, winnerPlayer.rating + 10);
            try {
                await DB.updateStats(winnerPlayer.id, 10, 'win');
                await DB.logGame({ playerId: winnerPlayer.id, opponent: result === 'white' ? (APP.player2?.nickname || 'P2') : APP.player.nickname, result: 'win', movesCount: chess.moves.length, ratingBefore, ratingAfter: winnerPlayer.rating, mode: 'two' });
            } catch (e) { console.warn('DB update failed:', e); }
            updateMenuUI();
        }
    }
    // Custom (online) game: +15 for winner (handled by the winner's client)
    if (APP.gameMode === 'custom' && APP.player && result !== 'draw') {
        const myColor = typeof CustomMode !== 'undefined' ? CustomMode.myColor : null;
        const iWon = (myColor === 'white' && result === 'white') || (myColor === 'black' && result === 'black');
        if (iWon) {
            const ratingBefore = APP.player.rating;
            APP.player.rating = Math.max(0, APP.player.rating + 15);
            try {
                await DB.updateStats(APP.player.id, 15, 'win');
                await DB.logGame({ playerId: APP.player.id, opponent: CustomMode?.opponentName || 'Opponent', result: 'win', movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'custom' });
            } catch (e) { console.warn('DB update failed:', e); }
            updateMenuUI();
        }
    }

    document.getElementById('gameover-icon').textContent = icon;
    document.getElementById('gameover-title').textContent = title;
    document.getElementById('gameover-sub').textContent = sub;
    const rEl = document.getElementById('gameover-rating');
    // Show rating info for the current player
    if (APP.gameMode === 'single' && delta !== 0) {
        rEl.textContent = (delta > 0 ? '+' : '') + delta + ' Rating → ' + APP.player?.rating;
        rEl.style.color = delta > 0 ? 'var(--accent)' : 'var(--danger)';
    } else if (APP.gameMode === 'two' && result !== 'draw') {
        const winnerP = result === 'white' ? APP.player : APP.player2;
        if (winnerP) {
            rEl.textContent = '+10 Rating → ' + winnerP.rating + ' (' + (winnerP.nickname || '') + ')';
            rEl.style.color = 'var(--accent)';
        } else { rEl.textContent = ''; }
    } else if (APP.gameMode === 'custom' && result !== 'draw') {
        const myColor = typeof CustomMode !== 'undefined' ? CustomMode.myColor : null;
        const iWon = myColor && ((myColor === 'white' && result === 'white') || (myColor === 'black' && result === 'black'));
        if (iWon) {
            rEl.textContent = '+15 Rating → ' + APP.player?.rating;
            rEl.style.color = 'var(--accent)';
        } else { rEl.textContent = ''; }
    } else { rEl.textContent = ''; }
    openModal('gameover-modal');
}

function playAgain() {
    closeModal('gameover-modal');
    if (APP.pendingMode === 'whiteboard') {
        startWhiteBoard();
    } else if (APP.pendingMode) {
        startGame(APP.pendingMode);
    }
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
// หน้าที่ปลอดภัยจะ "จำ" ไว้แล้วพากลับไปหลัง refresh (ไม่รวมหน้ากลางเกม
// อย่าง page-board เพราะสถานะกระดาน/เวลาในเกมยังไม่ถูกบันทึกไว้ที่ไหน —
// การพากลับเข้ากลางเกมที่ refresh ไปแล้วต้องมีระบบ save game state เพิ่ม
// ซึ่งเป็นงานคนละสโคปกัน จึงพากลับไปแค่ระดับเมนูที่ปลอดภัยเท่านั้น)
const RESTORABLE_PAGES = new Set(['page-menu', 'page-ranking', 'page-custom', 'page-hint', 'page-bot-difficulty']);
const LAST_PAGE_KEY = 'chess-arena-last-page';

function showPage(id) {
    if (id !== 'page-board' && APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        CustomMode.cleanup();
        APP.gameMode = null;
    }
    // Close all modals when navigating away from board
    if (id !== 'page-board') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
    if (RESTORABLE_PAGES.has(id)) {
        try { sessionStorage.setItem(LAST_PAGE_KEY, id); } catch { /* private mode ฯลฯ ไม่เป็นไร */ }
    }
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ============================================================
// LOGIN
// ============================================================
async function handleLogin() {
    if (!Security.rateLimit('login', 20)) { showLoginError('ลองใหม่ใน 1 นาที'); return; }
    const email = document.getElementById('inp-email').value.trim();
    const nick = document.getElementById('inp-nick').value.trim();
    const password = document.getElementById('inp-password').value;
    const emailErr = document.getElementById('err-email');
    const nickErr = document.getElementById('err-nick');
    const passErr = document.getElementById('err-password');
    emailErr.style.display = 'none'; nickErr.style.display = 'none'; passErr.style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
    let valid = true;
    if (!Security.isEmail(email)) { emailErr.style.display = 'block'; valid = false; }
    if (!Security.isNick(nick)) { nickErr.style.display = 'block'; valid = false; }
    if (!password || password.length < 6) { passErr.style.display = 'block'; valid = false; }
    if (!valid) return;

    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'กำลังโหลด...';
    try {
        let authData;
        try {
            // ลอง login ก่อน (กรณีเป็นบัญชีเดิม)
            authData = await Auth.signIn(email, password);
        } catch (signInErr) {
            // ไม่ใช่บัญชีเดิม (หรือยังไม่เคยสมัคร) → สมัครสมาชิกใหม่ให้อัตโนมัติ
            authData = await Auth.signUp(email, password);
            if (!authData.access_token) {
                showLoginError('สมัครสำเร็จ แต่ต้องกดยืนยันอีเมลก่อนเข้าสู่ระบบ (เช็คกล่องจดหมาย)');
                return;
            }
        }
        const user = Auth.getUser();
        let player = await DB.getPlayerByUserId(user.id);
        if (!player) {
            const rows = await DB.upsertPlayerForUser(user.id, email, Security.sanitize(nick));
            player = rows?.[0];
            if (!player) throw new Error('ไม่สามารถสร้างโปรไฟล์ผู้เล่นได้');
        }
        APP.player = player;
        updateMenuUI();
        showPage('page-menu');
    } catch (e) {
        const msg = e.message || '';
        if (msg.includes('already registered')) showLoginError('อีเมลนี้มีบัญชีอยู่แล้ว แต่รหัสผ่านไม่ถูกต้อง');
        else if (msg.includes('Invalid login')) showLoginError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        else showLoginError('เข้าสู่ระบบไม่สำเร็จ: ' + msg);
    } finally {
        btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ / สมัครสมาชิก';
    }
}

// ============================================================
// FORGOT / RESET PASSWORD
// ============================================================
function showForgotPassword() {
    document.getElementById('forgot-email').value = document.getElementById('inp-email').value || '';
    const statusEl = document.getElementById('forgot-status');
    statusEl.style.display = 'none';
    openModal('forgot-password-modal');
}

async function sendPasswordReset() {
    const email = document.getElementById('forgot-email').value.trim();
    const statusEl = document.getElementById('forgot-status');
    if (!Security.isEmail(email)) {
        statusEl.className = 'error-msg error-msg-block';
        statusEl.textContent = 'กรุณากรอกอีเมลให้ถูกต้อง';
        statusEl.style.display = 'block';
        return;
    }
    const btn = document.getElementById('btn-forgot-send');
    btn.disabled = true; btn.textContent = 'กำลังส่ง...';
    try {
        await Auth.requestPasswordReset(email);
        statusEl.className = 'form-note';
        statusEl.textContent = 'ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย (รวมถึงโฟลเดอร์ Spam)';
        statusEl.style.display = 'block';
    } catch (e) {
        statusEl.className = 'error-msg error-msg-block';
        statusEl.textContent = 'ส่งไม่สำเร็จ: ' + e.message;
        statusEl.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = 'ส่งลิงก์รีเซ็ตรหัสผ่าน';
    }
}

async function confirmNewPassword() {
    const pass = document.getElementById('reset-password-new').value;
    const pass2 = document.getElementById('reset-password-confirm').value;
    const statusEl = document.getElementById('reset-status');
    statusEl.style.display = 'none';
    if (!pass || pass.length < 6) {
        statusEl.textContent = 'รหัสผ่านอย่างน้อย 6 ตัวอักษร';
        statusEl.style.display = 'block';
        return;
    }
    if (pass !== pass2) {
        statusEl.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
        statusEl.style.display = 'block';
        return;
    }
    const btn = document.getElementById('btn-reset-confirm');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
        await Auth.updatePassword(pass);
        const user = await Auth.fetchUser();
        const player = user ? await DB.getPlayerByUserId(user.id) : null;
        closeModal('reset-password-modal');
        if (player) {
            APP.player = player;
            updateMenuUI();
            showPage('page-menu');
        } else {
            showLoginError('ตั้งรหัสผ่านใหม่สำเร็จ กรุณากรอกชื่อเล่นแล้วเข้าสู่ระบบอีกครั้ง');
            showPage('page-login');
        }
    } catch (e) {
        statusEl.textContent = 'ตั้งรหัสผ่านไม่สำเร็จ: ' + e.message;
        statusEl.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = 'บันทึกรหัสผ่านใหม่';
    }
}

// ============================================================
// APP INIT
// เช็ค 2 เคสตอนโหลดหน้าเว็บทุกครั้ง:
// 1) ผู้ใช้เพิ่งกดลิงก์ "รีเซ็ตรหัสผ่าน" จากอีเมล (มี token แนบใน URL hash)
// 2) มี session login ค้างอยู่จากรอบก่อน (เก็บใน localStorage โดย Auth module)
// ระหว่างเช็คจะค้างอยู่หน้า page-loading (ไม่ใช่ page-login) เพื่อไม่ให้
// กระพริบไปหน้า login ก่อนสลับมาหน้า menu แบบที่เคยเป็นปัญหา
// ============================================================
(async function initAuthFlow() {
    const recoverySession = Auth.consumeRecoveryHashIfPresent();
    if (recoverySession) {
        showPage('page-login');
        openModal('reset-password-modal');
        return;
    }
    try {
        const session = await Auth.getValidSession();
        if (session?.user) {
            const player = await DB.getPlayerByUserId(session.user.id);
            if (player) {
                APP.player = player;
                updateMenuUI();
                let lastPage = null;
                try { lastPage = sessionStorage.getItem(LAST_PAGE_KEY); } catch { /* noop */ }
                if (lastPage === 'page-ranking') showRanking();
                else if (lastPage && RESTORABLE_PAGES.has(lastPage)) showPage(lastPage);
                else showPage('page-menu');
                return;
            }
        }
    } catch (e) {
        console.warn('Session restore failed:', e);
    }
    showPage('page-login');
})();

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg; el.style.display = 'block';
}

function updateMenuUI() {
    const p = APP.player;
    if (!p) return;
    const initials = (p.nickname || 'P').slice(0, 2).toUpperCase();
    document.getElementById('menu-avatar').textContent = initials;
    document.getElementById('menu-name').textContent = Security.sanitize(p.nickname);
    document.getElementById('menu-rating').textContent = `Rating: ${p.rating} | W:${p.wins || 0} L:${p.losses || 0} D:${p.draws || 0}`;
    document.getElementById('white-avatar').textContent = initials;
}

function handleLogout() {
    const sub = document.getElementById('logout-modal-sub');
    if (chess && chess.status === 'playing') {
        sub.textContent = 'เกมกำลังดำเนินอยู่ ออกจากระบบจะยุติเกม';
    } else {
        sub.textContent = 'คุณต้องการออกจากระบบหรือไม่?';
    }
    openModal('logout-modal');
}

function doLogout() {
    closeModal('logout-modal');
    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        CustomMode.cleanup();
    }
    Auth.signOut().catch(() => { }); // revoke token จริงฝั่ง Supabase + ลบ session ใน localStorage
    APP.player = null; APP.player2 = null; APP.gameMode = null; chess = null;
    document.getElementById('inp-email').value = '';
    document.getElementById('inp-nick').value = '';
    document.getElementById('inp-password').value = '';
    showPage('page-login');
}

// ============================================================
// GAME START FLOW
// ============================================================
function startSinglePlayer() { APP.pendingMode = 'single'; showPage('page-bot-difficulty'); }
function startTwoPlayer() { APP.pendingMode = 'two'; showPage('page-hint'); }

function startBotGame(rating) {
    APP.botDifficulty = rating;
    APP.hintMode = true;
    startGame(APP.pendingMode);
}

function setHintMode(enabled) {
    APP.hintMode = enabled;
    if (APP.pendingMode === 'two') {
        // Show Player 2 login before starting
        document.getElementById('p1-name-display').textContent = Security.sanitize(APP.player?.nickname || '-');
        document.getElementById('inp-email-p2').value = '';
        document.getElementById('inp-nick-p2').value = '';
        document.getElementById('err-email-p2').style.display = 'none';
        document.getElementById('err-nick-p2').style.display = 'none';
        document.getElementById('login-error-p2').style.display = 'none';
        showPage('page-login-p2');
    } else {
        startGame(APP.pendingMode);
    }
}

async function handleLoginP2() {
    if (!Security.rateLimit('login_p2', 5)) return;
    const email = document.getElementById('inp-email-p2').value.trim();
    const nick = document.getElementById('inp-nick-p2').value.trim();
    const emailErr = document.getElementById('err-email-p2');
    const nickErr = document.getElementById('err-nick-p2');
    emailErr.style.display = 'none'; nickErr.style.display = 'none';
    let valid = true;
    if (!Security.isEmail(email)) { emailErr.style.display = 'block'; valid = false; }
    if (!Security.isNick(nick)) { nickErr.style.display = 'block'; valid = false; }
    if (!valid) return;

    // Prevent using same email as P1
    if (email.toLowerCase() === APP.player?.email?.toLowerCase()) {
        const errEl = document.getElementById('login-error-p2');
        errEl.textContent = 'ต้องใช้บัญชีคนละบัญชีกับผู้เล่น 1';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-login-p2');
    btn.disabled = true; btn.textContent = 'กำลังโหลด...';
    try {
        let player2 = await DB.getPlayer(email);
        if (!player2) {
            const rows = await DB.upsertPlayer(email, Security.sanitize(nick));
            player2 = rows?.[0];
            if (!player2) throw new Error('ไม่สามารถสร้างบัญชีได้');
        }
        APP.player2 = player2;
    } catch (e) {
        APP.player2 = {
            id: 'local2-' + Date.now(),
            email: Security.sanitize(email).toLowerCase(),
            nickname: Security.sanitize(nick),
            rating: 0, wins: 0, losses: 0, draws: 0
        };
    } finally {
        btn.disabled = false; btn.textContent = 'เริ่มเล่น';
    }
    startGame('two');
}

function startGame(mode) {
    APP.gameMode = mode;
    const p = APP.player;
    initBoard();

    // Always restore resign button when starting a game
    const resignBtn = document.getElementById('btn-resign-main');
    if (resignBtn) {
        resignBtn.style.display = '';
        resignBtn.textContent = 'ยอมแพ้';
        resignBtn.onclick = () => confirmResign();
    }

    // Restore history card, hide chat (custom mode will override)
    document.getElementById('history-card').style.display = '';
    document.getElementById('chat-card').style.display = 'none';
    document.getElementById('room-number-display').style.display = 'none';

    // Restore gameover modal buttons to default
    const btns = document.querySelector('#gameover-modal .modal-btns');
    if (btns) btns.innerHTML = `<button class="btn" onclick="playAgain()">เล่นอีกครั้ง</button><button class="btn btn-outline" onclick="showPage('page-menu')">เมนูหลัก</button>`;

    if (mode === 'single') {
        botRating = APP.botDifficulty || 500;
        document.getElementById('white-name').textContent = Security.sanitize(p.nickname);
        document.getElementById('white-rating').textContent = `Rating: ${p.rating}`;
        document.getElementById('black-name').textContent = 'AI';
        document.getElementById('black-rating').textContent = `Rating: ${botRating}`;
        document.getElementById('black-avatar').textContent = 'AI';
        document.getElementById('btn-draw').style.display = 'none';
    } else if (mode === 'two') {
        document.getElementById('white-name').textContent = Security.sanitize(p.nickname) + ' (ขาว)';
        document.getElementById('white-rating').textContent = `Rating: ${p.rating}`;
        const p2 = APP.player2;
        document.getElementById('black-name').textContent = Security.sanitize(p2?.nickname || 'ผู้เล่น 2') + ' (ดำ)';
        document.getElementById('black-rating').textContent = p2 ? `Rating: ${p2.rating}` : '';
        document.getElementById('black-avatar').textContent = p2 ? Security.sanitize(p2.nickname).slice(0,2).toUpperCase() : '♚';
        document.getElementById('btn-draw').style.display = 'none';
    }
    showPage('page-board');
}

function startWhiteBoard() {
    APP.gameMode = 'whiteboard';
    APP.hintMode = true;
    APP.pendingMode = 'whiteboard';
    initBoard();

    // ใน Whiteboard: เปลี่ยนปุ่ม "ยอมแพ้" ให้เป็นปุ่ม "ย้อนกลับ" ไปหน้าเมนูหลักแทน
    const resignBtn = document.getElementById('btn-resign-main');
    if (resignBtn) {
        resignBtn.style.display = '';
        resignBtn.textContent = 'ย้อนกลับ';
        resignBtn.onclick = () => showPage('page-menu');
    }
    document.getElementById('btn-draw').style.display = 'none';

    document.getElementById('white-name').textContent = 'ขาว';
    document.getElementById('white-rating').textContent = '';
    document.getElementById('black-name').textContent = 'ดำ';
    document.getElementById('black-rating').textContent = '';
    document.getElementById('black-avatar').textContent = '♚';
    document.getElementById('white-avatar').textContent = '♔';

    // Hide history card (ไม่มี history)
    document.getElementById('history-card').style.display = 'none';
    document.getElementById('chat-card').style.display = 'none';
    document.getElementById('room-number-display').style.display = 'none';

    showPage('page-board');
}

// FIX: this function was missing its "function offerDraw() {" opening line
// and closing "}" — that orphaned code (a bare `return` + statements outside
// any function) was a syntax error that broke parsing of the ENTIRE file,
// which is why handleLogin() and everything else appeared "not defined".
function offerDraw() {
    // Only available in custom mode
    if (APP.gameMode !== 'custom' || typeof CustomMode === 'undefined') return;
    // Broadcast draw offer to opponent
    CustomMode.broadcast('draw_offer', {
        nickname: APP.player?.nickname || 'Player'
    });
    // Disable draw button temporarily to prevent spam
    const btn = document.getElementById('btn-draw');
    if (btn) { btn.disabled = true; btn.textContent = 'รอคำตอบ...'; }
    setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = 'ขอเสมอ'; }
    }, 15000);
}

function acceptDraw() {
    closeModal('draw-offer-modal');
    CustomMode.broadcast('draw_accepted', {});
    // Both sides go to main menu
    showPage('page-menu');
}

function declineDraw() {
    closeModal('draw-offer-modal');
    CustomMode.broadcast('draw_declined', { nickname: APP.player?.nickname || 'Player' });
}
function confirmResign() { openModal('resign-modal'); }
function doResign() {
    closeModal('resign-modal');
    // Hide resign button for the one who resigned (prevent double resign)
    document.getElementById('btn-resign-main').style.display = 'none';

    const loser = chess.turn === 'w' ? 'ขาว' : 'ดำ';

    if (APP.gameMode === 'single' && chess.turn === 'w') {
        // Resign/quit: -20 penalty, floor at 0
        const ratingBefore = APP.player.rating;
        const delta = -Math.min(20, APP.player.rating);
        APP.player.rating = Math.max(0, APP.player.rating - 20);
        DB.updateStats(APP.player.id, delta, 'loss').catch(() => { });
        DB.logGame({ playerId: APP.player.id, opponent: 'Bot', result: 'resign', movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'single' }).catch(() => { });
        updateMenuUI();
    }

    if (APP.gameMode === 'custom' && typeof CustomMode !== 'undefined') {
        // Custom: -10 rating penalty for resigner
        if (APP.player) {
            const ratingBefore = APP.player.rating;
            const delta = -Math.min(20, APP.player.rating);
            APP.player.rating = Math.max(0, APP.player.rating - 20);
            DB.updateStats(APP.player.id, delta, 'loss').catch(() => { });
            DB.logGame({ playerId: APP.player.id, opponent: CustomMode.opponentName || 'Opponent', result: 'resign', movesCount: chess.moves.length, ratingBefore, ratingAfter: APP.player.rating, mode: 'custom' }).catch(() => { });
        }
        CustomMode.broadcast('resign', {
            color: CustomMode.myColor,
            nickname: APP.player?.nickname || 'Player'
        });
        showPage('page-menu');
        return;
    }

    if (APP.gameMode === 'two') {
        // 2 Player: -10 to whoever resigned (current turn = loser)
        const losingPlayer = chess.turn === 'w' ? APP.player : APP.player2;
        if (losingPlayer && losingPlayer.id) {
            const ratingBefore = losingPlayer.rating;
            const delta = -Math.min(20, losingPlayer.rating);
            losingPlayer.rating = Math.max(0, losingPlayer.rating - 20);
            DB.updateStats(losingPlayer.id, delta, 'loss').catch(() => { });
            DB.logGame({ playerId: losingPlayer.id, opponent: chess.turn === 'w' ? (APP.player2?.nickname || 'P2') : APP.player.nickname, result: 'resign', movesCount: chess.moves.length, ratingBefore, ratingAfter: losingPlayer.rating, mode: 'two' }).catch(() => { });
            updateMenuUI();
        }
    }

    document.getElementById('gameover-icon').textContent = '🏳';
    document.getElementById('gameover-title').textContent = `${loser} ยอมแพ้`;
    document.getElementById('gameover-sub').textContent = 'ขอบคุณสำหรับเกมดีๆ';
    document.getElementById('gameover-rating').textContent = '-20 Rating';
    document.getElementById('gameover-rating').style.color = 'var(--danger)';
    openModal('gameover-modal');
}

// ============================================================
// RANKING
// ============================================================
async function showRanking() {
    showPage('page-ranking');
    const p = APP.player;
    const tier = Rating.getTier(p.rating);
    document.getElementById('my-tier-card').innerHTML = `
        <div class="tier-icon">${tier.icon}</div>
        <div class="tier-info">
            <h3 style="color:${tier.color}">${tier.name}</h3>
            <p>Rating ของคุณ: <strong>${p.rating}</strong> | Win:${p.wins || 0} Lose:${p.losses || 0} Draw:${p.draws || 0}</p>
        </div>`;

    const listEl = document.getElementById('ranking-list');
    listEl.innerHTML = '<div class="spinner"></div><div class="loading-text">กำลังโหลด...</div>';
    let rows = [];
    try { rows = await DB.getLeaderboard(100); }
    catch (e) { rows = [{ nickname: p.nickname, email: p.email, rating: p.rating, wins: p.wins || 0, losses: p.losses || 0 }]; }

    if (!rows || rows.length === 0) { listEl.innerHTML = '<div class="loading-text">ยังไม่มีข้อมูลผู้เล่น</div>'; return; }

    const tiers = [
        { label: 'Crown 👑', min: 2500, max: 9999, class: 'tier-crown' },
        { label: 'Diamond 💎', min: 2201, max: 2499, class: 'tier-diamond' },
        { label: 'Emerald 🟢', min: 1801, max: 2200, class: 'tier-emerald' },
        { label: 'Platinum 🔷', min: 1401, max: 1800, class: 'tier-platinum' },
        { label: 'Gold 🥇', min: 1001, max: 1400, class: 'tier-gold' },
        { label: 'Silver 🥈', min: 501, max: 1000, class: 'tier-silver' },
        { label: 'Bronze 🥉', min: 100, max: 500, class: 'tier-bronze' },
        { label: 'Unranked ⚪', min: 0, max: 99, class: 'tier-unranked' }
    ];

    let html = ''; let rank = 1;
    for (const t of tiers) {
        const members = rows.filter(r => r.rating >= t.min && r.rating <= t.max);
        if (members.length === 0) continue;
        html += `<div class="tier-section"><div class="tier-header ${t.class}">${t.label}</div><div class="tier-rows">`;
        members.forEach(m => {
            const isMe = m.email === p.email || m.nickname === p.nickname;
            const posClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
            const posIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            const tc = Rating.getTier(m.rating);
            html += `<div class="rank-row">
                <span class="rank-pos ${posClass}">${posIcon}</span>
                <div class="rank-avatar" style="background:${tc.color}33;color:${tc.color}">${Security.sanitize(m.nickname || '?').slice(0, 2).toUpperCase()}</div>
                <span class="rank-name">${Security.sanitize(m.nickname || '?')}${isMe ? ' <span class="rank-you">คุณ</span>' : ''}</span>
                <span class="rank-rating" style="color:${tc.color}">${m.rating}</span>
            </div>`;
            rank++;
        });
        html += `</div></div>`;
    }
    listEl.innerHTML = html || '<div class="loading-text">ไม่มีข้อมูล</div>';
}

// ============================================================
// KEYBOARD
// ============================================================
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});
document.getElementById('inp-nick').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('inp-email').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('inp-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('inp-nick-p2').addEventListener('keydown', e => { if (e.key === 'Enter') handleLoginP2(); });
document.getElementById('inp-email-p2').addEventListener('keydown', e => { if (e.key === 'Enter') handleLoginP2(); });

// ============================================================
// CUSTOM MODE — ONLINE MULTIPLAYER + REALTIME CHAT
// ============================================================

// Uses Supabase Realtime (Broadcast) — no extra DB table needed.
// Room codes are 4-digit numbers stored as Supabase broadcast channels.
// We also store active rooms in localStorage so joins can verify existence.

const CustomMode = {
    channel: null,
    roomCode: null,
    myColor: null,     // 'white' | 'black'
    opponentName: null,
    isBuilder: false,
    chatMessages: [],

    // Generate a unique 4-digit room code
    generateRoomCode() {
        // Use crypto for true randomness
        const arr = new Uint16Array(1);
        crypto.getRandomValues(arr);
        const code = String(1000 + (arr[0] % 9000)).padStart(4, '0');
        return code;
    },

    // Get the Supabase Realtime URL for a room
    channelName(code) {
        return `chess-room-${code}`;
    },

    // Start as builder: create a room, wait for opponent
    async build() {
        const code = this.generateRoomCode();
        this.roomCode = code;
        this.myColor = 'white';
        this.isBuilder = true;

        // Show waiting overlay
        document.getElementById('waiting-room-code').textContent = code;
        document.getElementById('waiting-overlay').style.display = 'flex';

        this._subscribe(code, 'builder');
    },

    // Join an existing room
    async join(code) {
        this.roomCode = code;
        this.myColor = 'black';
        this.isBuilder = false;
        this._subscribe(code, 'joiner');
    },

    _subscribe(code, role) {
        // Clean up any previous channel
        if (this.channel) {
            try { this.channel.unsubscribe(); } catch(e) {}
            this.channel = null;
        }

        // Create Supabase Realtime channel via raw WebSocket-style broadcast
        // We use the Supabase REST-compatible realtime endpoint
        const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';

        const ws = new WebSocket(wsUrl);
        this._ws = ws;
        this._pendingMessages = [];
        this._wsReady = false;
        const channelTopic = 'realtime:chess-room-' + code;
        const self = this;

        ws.onopen = () => {
            // Join channel
            ws.send(JSON.stringify({
                topic: channelTopic,
                event: 'phx_join',
                payload: { config: { broadcast: { self: false }, presence: { key: APP.player?.nickname || 'player' } } },
                ref: '1'
            }));
        };

        ws.onmessage = (evt) => {
            let msg;
            try { msg = JSON.parse(evt.data); } catch(e) { return; }

            if (msg.event === 'phx_reply' && msg.ref === '1') {
                // Successfully joined channel
                self._wsReady = true;
                if (role === 'joiner') {
                    // Announce joining
                    self._sendWS(channelTopic, 'player_joined', {
                        nickname: APP.player?.nickname || 'Player',
                        color: 'black'
                    });
                }
            }

            if (msg.event === 'broadcast' && msg.payload?.type) {
                self._handleEvent(msg.payload.type, msg.payload.data || {});
            }
        };

        ws.onerror = (e) => {
            console.warn('WS error', e);
        };

        ws.onclose = () => {
            if (self._active) {
                self._addSystemMsg('การเชื่อมต่อขาดหาย');
            }
        };

        this._channelTopic = channelTopic;
        this._active = true;
    },

    _sendWS(topic, type, data) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
        this._ws.send(JSON.stringify({
            topic: topic || this._channelTopic,
            event: 'broadcast',
            payload: { type, data },
            ref: String(Date.now())
        }));
    },

    broadcast(type, data) {
        this._sendWS(this._channelTopic, type, data);
    },

    _handleEvent(type, data) {
        switch(type) {
            case 'player_joined':
                this._onOpponentJoined(data);
                break;
            case 'move':
                this._onOpponentMove(data);
                break;
            case 'chat':
                this._onChatReceived(data);
                break;
            case 'resign':
                this._onOpponentResign(data);
                break;
            case 'draw_offer':
                this._onDrawOffer(data);
                break;
            case 'draw_accepted':
                // Opponent accepted — I offered the draw, now go to menu
                closeModal('draw-offer-modal');
                showPage('page-menu');
                break;
            case 'draw_declined':
                // Opponent declined — reset my draw button
                const btn = document.getElementById('btn-draw');
                if (btn) { btn.disabled = false; btn.textContent = 'ขอเสมอ'; }
                this._addSystemMsg('' + Security.sanitize(data.nickname || 'คู่แข่ง') + ' ปฏิเสธการขอเสมอ');
                break;
            case 'game_over':
                break;
        }
    },

    _onDrawOffer(data) {
        const nick = Security.sanitize(data.nickname || 'คู่แข่ง');
        document.getElementById('draw-offer-text').textContent = `${nick} ขอเสมอ — คุณยอมรับหรือไม่?`;
        openModal('draw-offer-modal');
    },

    _onOpponentResign(data) {
        // Opponent resigned — I win, show modal with "end game" button (no rating loss for me)
        const resignerColor = data.color === 'white' ? 'ขาว' : 'ดำ';
        const resignerNick = Security.sanitize(data.nickname || 'คู่แข่ง');
        document.getElementById('gameover-icon').textContent = '🏆';
        document.getElementById('gameover-title').textContent = `${resignerColor} ยอมแพ้!`;
        document.getElementById('gameover-sub').textContent = `${resignerNick} ยอมแพ้ — คุณชนะ!`;
        document.getElementById('gameover-rating').textContent = '';
        // Replace modal buttons: only show "จบเกม" (end game) button for winner
        const btns = document.querySelector('#gameover-modal .modal-btns');
        btns.innerHTML = `<button class="btn btn-outline" onclick="showPage('page-menu')">จบเกม</button>`;
        openModal('gameover-modal');
    },

    _onOpponentJoined(data) {
        // Builder receives this when opponent joins
        if (this.isBuilder) {
            this.opponentName = data.nickname || 'Player 2';
            // Hide waiting overlay
            document.getElementById('waiting-overlay').style.display = 'none';
            // Start the game for builder
            this._launchGame();
            // Tell joiner to start too
            this.broadcast('player_joined_ack', {
                nickname: APP.player?.nickname || 'Player 1',
                color: 'white'
            });
        }
    },

    _launchGame() {
        const myNick = Security.sanitize(APP.player?.nickname || 'You');
        const oppNick = Security.sanitize(this.opponentName || 'Opponent');

        APP.gameMode = 'custom';
        APP.hintMode = false;
        initBoard();

        // Restore resign button
        const resignBtn = document.getElementById('btn-resign-main');
        if (resignBtn) {
            resignBtn.style.display = '';
            resignBtn.textContent = 'ยอมแพ้';
            resignBtn.onclick = () => confirmResign();
        }

        // Restore gameover modal buttons
        const btns = document.querySelector('#gameover-modal .modal-btns');
        if (btns) btns.innerHTML = `<button class="btn" onclick="playAgain()">เล่นอีกครั้ง</button><button class="btn btn-outline" onclick="showPage('page-menu')">เมนูหลัก</button>`;

        document.getElementById('white-name').textContent = this.myColor === 'white' ? myNick : oppNick;
        document.getElementById('white-rating').textContent = '';
        document.getElementById('black-name').textContent = this.myColor === 'black' ? myNick : oppNick;
        document.getElementById('black-rating').textContent = '';
        document.getElementById('black-avatar').textContent = '♚';
        document.getElementById('white-avatar').textContent = (APP.player?.nickname || 'P').slice(0,2).toUpperCase();
        document.getElementById('btn-draw').style.display = 'inline-block';
        document.getElementById('btn-draw').disabled = false;
        document.getElementById('btn-draw').textContent = 'ขอเสมอ';

        // Show color indicator for current player
        const colorDot = this.myColor === 'white' ? '⬜' : '⬛';
        const colorTH = this.myColor === 'white' ? 'ขาว' : 'ดำ';

        // Show room code + color indicator in topbar
        const roomDisplay = document.getElementById('room-number-display');
        roomDisplay.textContent = `🔑 ${this.roomCode}`;
        roomDisplay.style.display = 'inline-block';

        // Show chat, hide history
        document.getElementById('history-card').style.display = 'none';
        document.getElementById('chat-card').style.display = 'flex';
        document.getElementById('room-badge').textContent = 'ห้อง #' + this.roomCode;

        // Clear chat and add color announcement
        this.chatMessages = [];
        document.getElementById('chat-messages').innerHTML = '';
        this._addSystemMsg(`🎮 เชื่อมต่อห้อง #${this.roomCode} สำเร็จ!`);
        this._addSystemMsg(`${colorDot} คุณเล่นเป็นฝ่าย${colorTH}`);

        showPage('page-board');
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    },

    _onOpponentMove(data) {
        if (!chess) return;
        const { from, to, promo } = data;
        if (typeof from === 'number' && typeof to === 'number') {
            const wasCapture = !!chess.board[to];
            const wasCastle = chess.board[from]?.toUpperCase() === 'K' && Math.abs((from % 8) - (to % 8)) === 2;
            const ok = chess.makeMove(from, to, promo || null);
            if (ok) {
                if (wasCastle) Sound.castle();
                else if (wasCapture) Sound.capture();
                else Sound.move();
                chess.selected = null;
                chess.legalMoves = [];
                renderBoard();
                updateSidebar();
                if (chess.status === 'check') setTimeout(() => Sound.check(), 150);
                checkGameOver();
            }
        }
    },

    _onChatReceived(data) {
        const { nickname, message } = data;
        if (!message) return;
        this._addMsg(Security.sanitize(nickname || 'Opponent'), Security.sanitize(message), 'them');
    },

    sendChat(message) {
        const clean = Security.sanitize(message).slice(0, 200);
        if (!clean) return;
        this._addMsg(Security.sanitize(APP.player?.nickname || 'You'), clean, 'me');
        this.broadcast('chat', {
            nickname: APP.player?.nickname || 'Player',
            message: clean
        });
    },

    _addMsg(name, text, type) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'chat-msg ' + type;
        if (type !== 'system') {
            const nameEl = document.createElement('div');
            nameEl.className = 'chat-msg-name';
            nameEl.textContent = name;
            div.appendChild(nameEl);
        }
        const textEl = document.createElement('div');
        textEl.textContent = text;
        div.appendChild(textEl);
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    _addSystemMsg(text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'chat-msg system';
        div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    cleanup() {
        this._active = false;
        if (this._ws) {
            try { this._ws.close(); } catch(e) {}
            this._ws = null;
        }
        this.channel = null;
        this.roomCode = null;
        this.myColor = null;
        this.isBuilder = false;

        // Restore history, hide chat
        document.getElementById('history-card').style.display = '';
        document.getElementById('chat-card').style.display = 'none';
        document.getElementById('room-number-display').style.display = 'none';
    }
};

// ---- UI Functions for Custom Mode ----

function showCustomMenu() {
    document.getElementById('join-panel').style.display = 'none';
    document.getElementById('join-error').style.display = 'none';
    document.getElementById('join-room-input').value = '';
    showPage('page-custom');
}

function showJoinPanel() {
    const panel = document.getElementById('join-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display !== 'none') {
        setTimeout(() => document.getElementById('join-room-input').focus(), 100);
    }
}

async function startCustomBuild() {
    await CustomMode.build();
}

async function joinCustomRoom() {
    const code = document.getElementById('join-room-input').value.trim();
    const errEl = document.getElementById('join-error');

    if (!/^\d{4}$/.test(code)) {
        errEl.textContent = 'กรุณาใส่รหัสห้อง 4 หลัก (ตัวเลขเท่านั้น)';
        errEl.style.display = 'block';
        return;
    }

    errEl.style.display = 'none';
    CustomMode.opponentName = 'Builder';

    // Subscribe as joiner — the builder will respond
    await CustomMode.join(code);

    // Wait briefly for WS connection to establish, then send joined event
    // The _subscribe method will auto-send player_joined once WS is ready
    // We patch _onOpponentJoined to also handle joiner receiving ack
    const origHandle = CustomMode._handleEvent.bind(CustomMode);
    CustomMode._handleEvent = function(type, data) {
        if (type === 'player_joined_ack' && !CustomMode.isBuilder) {
            CustomMode.opponentName = data.nickname || 'Player 1';
            CustomMode._launchGame();
        } else {
            origHandle(type, data);
        }
    };

    // Show a brief waiting state
    const btn = document.querySelector('#join-panel .btn');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังเชื่อมต่อ...'; }
    setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = 'เข้าร่วม'; }
    }, 8000);
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = (input?.value || '').trim();
    if (!msg) return;
    CustomMode.sendChat(msg);
    input.value = '';
}

function copyRoomCode() {
    const code = CustomMode.roomCode;
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    const btn = document.querySelector('.copy-btn');
    if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'คัดลอกแล้ว!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    }
}


// Custom mode cleanup on navigation/logout is handled
// by checking APP.gameMode === 'custom' inside existing functions

// ============================================================
// BACKGROUND MUSIC
// ============================================================
const YOUTUBE_MUSIC_KEY = 'chess-arena-youtube-music-url';
const YOUTUBE_MUSIC_POS_KEY = 'chess-arena-youtube-music-position';
const YOUTUBE_MUSIC_SIZE_KEY = 'chess-arena-youtube-music-size';
const YOUTUBE_MUSIC_CLOSED_KEY = 'chess-arena-youtube-music-closed';
const DEFAULT_YOUTUBE_MUSIC = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
let activeYouTubeMusicUrl = DEFAULT_YOUTUBE_MUSIC;

function getYouTubeVideoId(rawUrl) {
    const value = (rawUrl || '').trim();
    if (!value) return null;

    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./, '');

        if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
        if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
            if (url.searchParams.get('v')) return url.searchParams.get('v');

            const parts = url.pathname.split('/').filter(Boolean);
            if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
                return parts[1] || null;
            }
        }
    } catch {
        if (/^[\w-]{11}$/.test(value)) return value;
    }

    return /^[\w-]{11}$/.test(value) ? value : null;
}

function getStoredValue(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function setStoredValue(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function clampMusicPanel() {
    const panel = document.getElementById('music-panel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    const top = Math.min(Math.max(8, rect.top), maxTop);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function saveMusicPanelPosition() {
    const panel = document.getElementById('music-panel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    const rect = panel.getBoundingClientRect();
    setStoredValue(YOUTUBE_MUSIC_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
}

function saveMusicPanelSize() {
    const panel = document.getElementById('music-panel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    const rect = panel.getBoundingClientRect();
    setStoredValue(YOUTUBE_MUSIC_SIZE_KEY, JSON.stringify({ width: rect.width, height: rect.height }));
}

function restoreMusicPanelLayout() {
    const panel = document.getElementById('music-panel');
    if (!panel) return;

    const savedSize = getStoredValue(YOUTUBE_MUSIC_SIZE_KEY);
    if (savedSize) {
        try {
            const { width, height } = JSON.parse(savedSize);
            if (Number.isFinite(width)) panel.style.width = `${Math.min(width, window.innerWidth - 16)}px`;
            if (Number.isFinite(height)) panel.style.height = `${Math.min(height, window.innerHeight - 16)}px`;
        } catch { /* ignore bad saved size */ }
    }

    const savedPosition = getStoredValue(YOUTUBE_MUSIC_POS_KEY);
    if (savedPosition) {
        try {
            const { left, top } = JSON.parse(savedPosition);
            if (Number.isFinite(left) && Number.isFinite(top)) {
                panel.style.left = `${left}px`;
                panel.style.top = `${top}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        } catch { /* ignore bad saved position */ }
    }

    requestAnimationFrame(clampMusicPanel);
}

function setYouTubeMusic(rawUrl, shouldSave = true) {
    const videoId = getYouTubeVideoId(rawUrl);
    const input = document.getElementById('youtube-url-input');
    const frame = document.getElementById('youtube-music-frame');
    const link = document.getElementById('music-youtube-link');

    if (!videoId || !frame || !link) {
        if (input) input.focus();
        return false;
    }

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    activeYouTubeMusicUrl = watchUrl;
    frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
    link.href = watchUrl;
    if (input) input.value = watchUrl;

    if (shouldSave) setStoredValue(YOUTUBE_MUSIC_KEY, watchUrl);
    return true;
}

function loadYouTubeMusic() {
    const input = document.getElementById('youtube-url-input');
    showMusicPlayer();
    setYouTubeMusic(input?.value || DEFAULT_YOUTUBE_MUSIC);
}

function hideMusicPlayer() {
    const panel = document.getElementById('music-panel');
    const opener = document.getElementById('music-open-btn');
    const frame = document.getElementById('youtube-music-frame');

    saveMusicPanelPosition();
    saveMusicPanelSize();
    panel?.classList.remove('music-pending');
    opener?.classList.remove('music-pending');
    panel?.classList.add('is-hidden');
    opener?.classList.add('is-visible');
    if (frame) frame.src = '';
    setStoredValue(YOUTUBE_MUSIC_CLOSED_KEY, '1');
}

function showMusicPlayer() {
    const panel = document.getElementById('music-panel');
    const opener = document.getElementById('music-open-btn');

    panel?.classList.remove('music-pending', 'is-hidden');
    opener?.classList.remove('music-pending', 'is-visible');
    setStoredValue(YOUTUBE_MUSIC_CLOSED_KEY, '0');
    setYouTubeMusic(activeYouTubeMusicUrl || getStoredValue(YOUTUBE_MUSIC_KEY) || DEFAULT_YOUTUBE_MUSIC, false);
    requestAnimationFrame(clampMusicPanel);
}

function initMusicDrag() {
    const panel = document.getElementById('music-panel');
    const handle = document.getElementById('music-drag-handle');
    if (!panel || !handle) return;

    let drag = null;

    handle.addEventListener('pointerdown', event => {
        if (event.target.closest('button, a, input')) return;

        const rect = panel.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
        };
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;

        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
        const left = Math.min(Math.max(8, event.clientX - drag.offsetX), maxLeft);
        const top = Math.min(Math.max(8, event.clientY - drag.offsetY), maxTop);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    });

    const endDrag = event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag = null;
        saveMusicPanelPosition();
    };

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
}

function initYouTubeMusic() {
    const panel = document.getElementById('music-panel');
    const input = document.getElementById('youtube-url-input');
    if (!panel || !input) return;

    activeYouTubeMusicUrl = getStoredValue(YOUTUBE_MUSIC_KEY) || DEFAULT_YOUTUBE_MUSIC;
    setYouTubeMusic(activeYouTubeMusicUrl, false);
    restoreMusicPanelLayout();
    initMusicDrag();

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') loadYouTubeMusic();
    });

    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(() => {
            saveMusicPanelSize();
            clampMusicPanel();
        });
        observer.observe(panel);
    }

    window.addEventListener('resize', () => {
        clampMusicPanel();
        saveMusicPanelPosition();
    });

    if (getStoredValue(YOUTUBE_MUSIC_CLOSED_KEY) === '1') {
        hideMusicPlayer();
    } else {
        showMusicPlayer();
    }
}

initYouTubeMusic();

// ============================================================
// CHECKERS — open checkers.html in new tab
// ============================================================
function openCheckers() {
    window.open('checkers.html', '_blank');
}

// ============================================================
// EXPOSE TO WINDOW
// This file is loaded as an ES module by Vite (src/main.js), so
// top-level functions are no longer implicitly global. index.html
// still calls these via inline onclick="..." attributes, so we
// attach them to window explicitly to keep all existing markup working.
// ============================================================
Object.assign(window, {
    acceptDraw, closeModal, confirmNewPassword, confirmResign, copyRoomCode, declineDraw,
    doLogout, doResign, handleLogin, handleLoginP2, handleLogout,
    hideMusicPlayer, joinCustomRoom, loadYouTubeMusic, offerDraw, openCheckers, playAgain, sendChatMessage, sendPasswordReset,
    setHintMode, showCustomMenu, showForgotPassword, showJoinPanel, showMusicPlayer, showPage, showRanking,
    startBotGame, startCustomBuild, startSinglePlayer, startTwoPlayer, startWhiteBoard,
});
