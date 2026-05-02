// Web Audio API synthesized sound engine for Epaminondas
// All sounds are procedurally generated — zero external assets.

export class SoundEngine {
  constructor() {
    this.enabled = true;
    this._ctx = null;
  }

  _getCtx() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this.enabled = false;
        return null;
      }
    }
    // Resume if suspended (browser autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  // Internal: create a gain node that auto-ramps to zero
  _gain(ctx, value, rampTime) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(value, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + rampTime);
    g.connect(ctx.destination);
    return g;
  }

  // Internal: play a simple tone
  _tone(freq, type, startVol, duration, opts = {}) {
    const ctx = this._getCtx();
    if (!ctx || !this.enabled) return;

    const osc = ctx.createOscillator();
    const g   = this._gain(ctx, startVol, duration);
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (opts.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, ctx.currentTime + duration);
    }
    if (opts.detune) {
      osc.detune.setValueAtTime(opts.detune, ctx.currentTime);
    }
    osc.connect(g);
    osc.start(ctx.currentTime + (opts.delay || 0));
    osc.stop(ctx.currentTime + (opts.delay || 0) + duration + 0.05);
  }

  // Soft click — piece selected
  select() {
    const ctx = this._getCtx();
    if (!ctx || !this.enabled) return;
    this._tone(880, 'sine', 0.08, 0.08);
    this._tone(1320, 'sine', 0.04, 0.06, { delay: 0.01 });
  }

  // Wooden thud — piece moved
  move() {
    const ctx = this._getCtx();
    if (!ctx || !this.enabled) return;

    // Low thud
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type  = 'sine';
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);

    // Click transient
    this._tone(800, 'square', 0.06, 0.04, { delay: 0.005 });
  }

  // Satisfying crash — capture
  capture() {
    const ctx = this._getCtx();
    if (!ctx || !this.enabled) return;

    // Low boom
    const osc1 = ctx.createOscillator();
    const g1   = ctx.createGain();
    osc1.type  = 'sawtooth';
    osc1.frequency.setValueAtTime(120, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
    g1.gain.setValueAtTime(0.4, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc1.connect(g1);
    g1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.4);

    // High crack
    const osc2 = ctx.createOscillator();
    const g2   = ctx.createGain();
    osc2.type  = 'square';
    osc2.frequency.setValueAtTime(1200, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
    g2.gain.setValueAtTime(0.25, ctx.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.start();
    osc2.stop(ctx.currentTime + 0.22);

    // Noise burst via buffer
    try {
      const bufLen = ctx.sampleRate * 0.1;
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18, ctx.currentTime);
      ng.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      src.connect(ng);
      ng.connect(ctx.destination);
      src.start();
    } catch { /* ignore */ }
  }

  // Ascending fanfare C-E-G-C
  win() {
    const ctx = this._getCtx();
    if (!ctx || !this.enabled) return;
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, i) => {
      this._tone(freq, 'sine', 0.28, 0.35, { delay: i * 0.15 });
      this._tone(freq * 2, 'sine', 0.08, 0.25, { delay: i * 0.15 + 0.05 });
    });
  }

  // Descending sad tones C-A-F-D
  lose() {
    const ctx = this._getCtx();
    if (!ctx || !this.enabled) return;
    const notes = [261.63, 220.00, 174.61, 146.83];
    notes.forEach((freq, i) => {
      this._tone(freq, 'sine', 0.22, 0.38, { delay: i * 0.18 });
    });
  }

  // Short buzz — invalid action
  invalid() {
    const ctx = this._getCtx();
    if (!ctx || !this.enabled) return;
    this._tone(120, 'sawtooth', 0.18, 0.12);
    this._tone(90, 'sawtooth', 0.12, 0.1, { delay: 0.04 });
  }
}

export const sound = new SoundEngine();
