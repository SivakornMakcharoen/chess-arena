export const Sound = {
  ctx: null,
  enabled: true,
  _init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); },
  _play(freq, type, dur, vol = 0.2, freqEnd = null) { this._init(); const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime); if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur); o.start(c.currentTime); o.stop(c.currentTime + dur); },
  move() { if (!this.enabled) return; this._play(480, 'sine', .08, .18); },
  capture() { if (!this.enabled) return; this._play(300, 'triangle', .05, .3); setTimeout(() => this._play(180, 'triangle', .12, .25, 120), 30); },
  king() { if (!this.enabled) return;[523, 784, 1047].forEach((f, i) => setTimeout(() => this._play(f, 'sine', .18, .2), i * 80)); },
  win() { if (!this.enabled) return;[523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._play(f, 'sine', .25, .22), i * 120)); },
  lose() { if (!this.enabled) return;[440, 370, 311, 277].forEach((f, i) => setTimeout(() => this._play(f, 'triangle', .22, .20), i * 130)); },
};
