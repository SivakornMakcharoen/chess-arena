export const Sound = {
    ctx: null,

    _init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    // เสียงพื้นฐาน: oscillator + envelope
    _play(freq, type, duration, volume = 0.25, freqEnd = null) {
        this._init();
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    },

    // เสียงเดินหมาก (คลิ๊กเบาๆ)
    move() {
        this._play(520, 'sine', 0.08, 0.18);
        setTimeout(() => this._play(420, 'sine', 0.06, 0.10), 40);
    },

    // เสียงกินหมาก (กระทบแรงขึ้น + ตก)
    capture() {
        this._play(300, 'triangle', 0.05, 0.3);
        setTimeout(() => this._play(180, 'triangle', 0.12, 0.25, 120), 30);
        setTimeout(() => this._play(240, 'sine', 0.08, 0.15), 80);
    },

    // เสียง Check (เสียงเตือน)
    check() {
        this._play(660, 'square', 0.06, 0.08);
        setTimeout(() => this._play(880, 'square', 0.06, 0.10), 80);
        setTimeout(() => this._play(660, 'square', 0.06, 0.08), 160);
    },

    // เสียง Castling (2 คลิ๊ก)
    castle() {
        this._play(500, 'sine', 0.07, 0.15);
        setTimeout(() => this._play(500, 'sine', 0.07, 0.15), 100);
    },

    // เสียงชนะ (fanfare สั้น)
    win() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => setTimeout(() => this._play(f, 'sine', 0.25, 0.22), i * 120));
    },

    // เสียงแพ้ (ลงต่ำ)
    lose() {
        const notes = [440, 370, 311, 277];
        notes.forEach((f, i) => setTimeout(() => this._play(f, 'triangle', 0.22, 0.20), i * 130));
    },

    // เสียงเสมอ (neutral)
    draw() {
        this._play(440, 'sine', 0.12, 0.15);
        setTimeout(() => this._play(440, 'sine', 0.12, 0.15), 180);
    },

    // เสียง promotion
    promote() {
        [523, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this._play(f, 'sine', 0.18, 0.2), i * 80));
    }
};