import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

export function createCheckersOnline({
  getGame,
  getMode,
  setCustomGame,
  render,
  showBoardPage,
  checkGameOver,
  openModal,
  sanitize,
  sendChatFromInput,
  playMoveSound,
  playCaptureSound,
}) {
  return {
    _ws: null, _channelTopic: null, _active: false,
    _reconnectTimer: null, _pingTimer: null, _reconnectAttempts: 0,
    myColor: null, isBuilder: false, roomCode: null, opponentName: null,

    generateCode() {
      const arr = new Uint16Array(1); crypto.getRandomValues(arr);
      return String(1000 + (arr[0] % 9000)).padStart(4, '0');
    },

    async build() {
      const code = this.generateCode();
      this.roomCode = code; this.myColor = 'red'; this.isBuilder = true;
      document.getElementById('waiting-room-code').textContent = code;
      document.getElementById('waiting-overlay').style.display = 'flex';
      this._connect(code, 'builder');
    },

    async join(code) {
      this.roomCode = code; this.myColor = 'black'; this.isBuilder = false;
      this._connect(code, 'joiner');
    },

    _connect(code, role) {
      this._clearTimers();
      if (this._ws) { try { this._ws.close(); } catch(e) {} this._ws = null; }
      const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';
      let ws;
      try { ws = new WebSocket(wsUrl); } catch(e) { this._scheduleReconnect(code, role); return; }
      this._ws = ws; this._active = true;
      const topic = 'realtime:checkers-room-' + code;
      this._channelTopic = topic;
      const self = this;

      ws.onopen = () => {
        self._reconnectAttempts = 0;
        ws.send(JSON.stringify({topic, event: 'phx_join', payload: {config: {broadcast: {self: false}, presence: {key: 'player'}}}, ref: '1'}));
        self._pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb'}));
          }
        }, 20000);
      };

      ws.onmessage = (evt) => {
        let msg; try { msg = JSON.parse(evt.data); } catch(e) { return; }
        if (msg.event === 'phx_reply' && msg.ref === '1') {
          if (role === 'joiner') self._send('player_joined', {nickname: 'Joiner', color: 'black'});
        }
        if (msg.event === 'broadcast' && msg.payload?.type) self._handle(msg.payload.type, msg.payload.data || {});
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        self._clearTimers();
        if (!self._active) return;
        self._scheduleReconnect(code, role);
        if (getMode() === 'custom') {
          self._sysMsg('⚠️ การเชื่อมต่อขาดหาย กำลังเชื่อมต่อใหม่...');
        }
      };
    },

    _scheduleReconnect(code, role) {
      if (!this._active) return;
      this._reconnectAttempts++;
      const delay = Math.min(1000 * this._reconnectAttempts, 8000);
      this._reconnectTimer = setTimeout(() => {
        if (this._active) this._connect(code, role);
      }, delay);
    },

    _clearTimers() {
      if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    },

    _send(type, data) {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      try {
        this._ws.send(JSON.stringify({topic: this._channelTopic, event: 'broadcast', payload: {type, data}, ref: String(Date.now())}));
      } catch(e) {}
    },
    broadcast(type, data) { this._send(type, data); },

    _handle(type, data) {
      if (type === 'player_joined' && this.isBuilder) {
        this.opponentName = data.nickname || 'Player 2';
        document.getElementById('waiting-overlay').style.display = 'none';
        this._launchGame();
        this._send('player_joined_ack', {nickname: 'Builder', color: 'red'});
      }
      if (type === 'player_joined_ack' && !this.isBuilder) {
        this.opponentName = data.nickname || 'Player 1';
        this._launchGame();
      }
      if (type === 'move') this._onMove(data);
      if (type === 'chat') this._onChat(data);
      if (type === 'opponent_left') {
        document.getElementById('opp-left-icon').textContent = '🚪';
        document.getElementById('opp-left-title').textContent = 'คู่ต่อสู้ออกจากเกม';
        document.getElementById('opp-left-sub').textContent = 'อีกฝ่ายออกจากเกมแล้ว';
        openModal('opponent-left-modal');
      }
      if (type === 'opponent_resigned') {
        document.getElementById('opp-left-icon').textContent = '🏳️';
        document.getElementById('opp-left-title').textContent = 'คู่ต่อสู้ยอมแพ้!';
        document.getElementById('opp-left-sub').textContent = 'คุณชนะ! อีกฝ่ายยอมแพ้แล้ว';
        openModal('opponent-left-modal');
      }
    },

    _launchGame() {
      setCustomGame();
      const myNick = this.myColor === 'red' ? 'คุณ (ขาว)' : 'คุณ (ดำ)';
      const oppNick = this.myColor === 'red' ? 'เพื่อน (ดำ)' : 'เพื่อน (ขาว)';
      document.getElementById('red-name-c').textContent = this.myColor === 'red' ? myNick : oppNick;
      document.getElementById('black-name-c').textContent = this.myColor === 'black' ? myNick : oppNick;
      document.getElementById('red-sub-c').textContent = ''; document.getElementById('black-sub-c').textContent = '';
      document.getElementById('chat-card-c').style.display = 'flex';
      document.getElementById('room-badge-c').textContent = 'ห้อง #' + this.roomCode;
      const rd = document.getElementById('room-number-display-c2');
      if (rd) { rd.textContent = '🔑 ' + this.roomCode; rd.style.cssText = 'font-size:13px;font-weight:800;color:var(--primary);background:rgba(181,136,99,.13);padding:4px 12px;border-radius:8px;border:1px solid rgba(181,136,99,.25);letter-spacing:3px;'; }
      document.getElementById('topbar-normal-btns').style.display = 'none';
      document.getElementById('topbar-custom-btns').style.display = 'flex';
      document.getElementById('chat-messages-c').innerHTML = '';
      this._sysMsg('🎮 เชื่อมต่อห้อง #' + this.roomCode + ' สำเร็จ!');
      this._sysMsg((this.myColor === 'red' ? '⚪ คุณเล่นเป็นฝ่ายขาว' : '⬛ คุณเล่นเป็นฝ่ายดำ'));
      render();
      showBoardPage();
      const inp = document.getElementById('chat-input-c');
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatFromInput(); });
    },

    _onMove(data) {
      const game = getGame();
      if (!game) return;
      const {from, to} = data;
      if (typeof from === 'number' && typeof to === 'number') {
        const move = game.validMoves.find(m => m.from === from && m.to === to);
        const wasCapture = move?.captured?.length > 0;
        game.makeMove(from, to);
        if (wasCapture) playCaptureSound(); else playMoveSound();
        render();
        checkGameOver();
      }
    },

    _onChat(data) {
      this._addMsg(sanitize(data.nickname || 'Opponent'), sanitize(data.message || ''), 'them');
    },

    sendChat(msg) {
      const clean = sanitize(msg).slice(0, 200);
      if (!clean) return;
      this._addMsg('คุณ', clean, 'me');
      this._send('chat', {nickname: 'ผู้เล่น', message: clean});
    },

    _addMsg(name, text, type) {
      const c = document.getElementById('chat-messages-c'); if (!c) return;
      const d = document.createElement('div'); d.className = 'chat-msg ' + type;
      if (type !== 'system') { const n = document.createElement('div'); n.className = 'chat-msg-name'; n.textContent = name; d.appendChild(n); }
      const t = document.createElement('div'); t.textContent = text; d.appendChild(t);
      c.appendChild(d); c.scrollTop = c.scrollHeight;
    },
    _sysMsg(text) { this._addMsg('', '  ' + text, 'system'); },

    cleanup() {
      this._active = false;
      this._clearTimers();
      if (this._ws) { try { this._ws.close(); } catch(e) {}; this._ws = null; }
      document.getElementById('chat-card-c').style.display = 'none';
      document.getElementById('room-number-display').style.display = 'none';
      document.getElementById('waiting-overlay').style.display = 'none';
    },
  };
}
