// GOUAL RUN sound, all generated live with Web Audio: an upbeat baile-funk groove, footsteps,
// ball pickups, jumps, slides, crashes and the police siren that gets louder as the cops close in.
export const audio = {
  ctx: null, on: true, siren: 0, speed: 0,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.85 : 0; this.master.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = 0.42; this.music.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
    // City bed: traffic hum.
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0.08; s.connect(f).connect(g).connect(this.master); s.start();
    // Siren: two-tone, volume follows how close the police are.
    this.sir = ctx.createOscillator(); this.sir.type = 'sawtooth'; this.sirG = ctx.createGain(); this.sirG.gain.value = 0;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1100; sf.Q.value = 1.2;
    this.sir.connect(sf).connect(this.sirG).connect(this.sfx); this.sir.start();
    this.step16 = 0; this.nextNote = ctx.currentTime + 0.1; this.playing = false;
  },
  noise(out, t, { type = 'bandpass', f = 1000, q = 1, level = 0.3, a = 0.002, d = 0.1, to = 0 }) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (to) fl.frequency.exponentialRampToValueAtTime(to, t + a + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    s.connect(fl).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  },
  tone(out, t, { f = 440, to = 0, type = 'sine', level = 0.2, a = 0.004, d = 0.2 }) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(g).connect(out); o.start(t); o.stop(t + a + d + 0.05);
  },
  // ---- music: 130 bpm funk carioca groove in A minor ----
  schedule() {
    const ctx = this.ctx, o = this.music, spb = 60 / 130 / 4;
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    const KICK = 'x..x..x...x..x..', SNARE = '....x..x....x..x', BASS = [45, 0, 0, 45, 0, 0, 48, 0, 0, 0, 50, 0, 0, 48, 0, 0];
    const CH = [[69, 72, 76], [65, 69, 72], [67, 71, 74], [64, 67, 71]];
    while (this.nextNote < ctx.currentTime + 0.2) {
      const s = this.step16 % 16, bar = Math.floor(this.step16 / 16) % 4, t = this.nextNote;
      if (this.playing) {
        if (KICK[s] === 'x') this.tone(o, t, { f: 120, to: 42, level: 0.5, d: 0.22 });
        if (SNARE[s] === 'x') { this.noise(o, t, { f: 1800, q: 0.7, level: 0.22, d: 0.13 }); this.tone(o, t, { f: 220, to: 160, type: 'triangle', level: 0.08, d: 0.08 }); }
        this.noise(o, t, { type: 'highpass', f: 8000, level: s % 2 ? 0.025 : 0.05, d: 0.03 });
        const bn = BASS[s]; if (bn) this.tone(o, t, { f: hz(bn + [0, -4, -2, -5][bar]), type: 'square', level: 0.07, d: 0.18 });
        if (s === 0 || s === 6 || s === 10) CH[bar].forEach(n => this.tone(o, t, { f: hz(n), type: 'sawtooth', level: 0.025, d: 0.16 }));
        if (s === 14 && bar === 3) this.tone(o, t, { f: hz(81), to: hz(76), type: 'square', level: 0.05, d: 0.2 });
      }
      this.nextNote += spb; this.step16++;
    }
    const now = ctx.currentTime;
    this.sirG.gain.setTargetAtTime(this.on ? this.siren * 0.06 : 0, now, 0.2);
    this.sir.frequency.setTargetAtTime(Math.sin(now * 3.2) > 0 ? 960 : 720, now, 0.02);
  },
  update() { if (this.ctx && this.ctx.state === 'running') this.schedule(); },
  setOn(on) { this.on = on; if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.15); },
  ok() { return this.ctx && this.on; },
  t() { return this.ctx.currentTime; },
  step() { if (!this.ok()) return; this.noise(this.sfx, this.t(), { type: 'lowpass', f: 900, level: 0.05, d: 0.05 }); },
  coin(n = 0) { if (!this.ok()) return; const t = this.t(), f = 988 * Math.pow(2, (n % 5) / 12); this.tone(this.sfx, t, { f, type: 'square', level: 0.045, d: 0.06 }); this.tone(this.sfx, t + 0.05, { f: f * 1.5, type: 'square', level: 0.04, d: 0.1 }); },
  jump() { if (!this.ok()) return; this.tone(this.sfx, this.t(), { f: 300, to: 700, type: 'triangle', level: 0.12, d: 0.16 }); },
  slide() { if (!this.ok()) return; this.noise(this.sfx, this.t(), { f: 1200, to: 400, q: 0.8, level: 0.14, a: 0.01, d: 0.35 }); },
  whoosh() { if (!this.ok()) return; this.noise(this.sfx, this.t(), { f: 500, to: 2200, q: 1.4, level: 0.1, a: 0.04, d: 0.18 }); },
  bump() { if (!this.ok()) return; const t = this.t(); this.tone(this.sfx, t, { f: 140, to: 60, level: 0.4, d: 0.2 }); this.noise(this.sfx, t, { type: 'lowpass', f: 800, level: 0.3, d: 0.12 }); },
  crash() { if (!this.ok()) return; const t = this.t(); this.tone(this.sfx, t, { f: 110, to: 40, level: 0.6, d: 0.5 }); this.noise(this.sfx, t, { type: 'lowpass', f: 1500, level: 0.45, d: 0.5 }); this.noise(this.sfx, t + 0.05, { type: 'highpass', f: 3000, level: 0.15, d: 0.4 }); },
  power() { if (!this.ok()) return; const t = this.t(); [0, 4, 7, 12, 16].forEach((n, i) => this.tone(this.sfx, t + i * 0.06, { f: 523 * Math.pow(2, n / 12), type: 'square', level: 0.05, d: 0.14 })); },
  whistle() { if (!this.ok()) return; const t = this.t(); this.tone(this.sfx, t, { f: 2900, type: 'sine', level: 0.12, d: 0.12 }); this.tone(this.sfx, t + 0.15, { f: 2900, type: 'sine', level: 0.12, d: 0.35 }); },
  go() { if (!this.ok()) return; const t = this.t(); this.tone(this.sfx, t, { f: 880, type: 'square', level: 0.08, d: 0.3 }); },
  beep() { if (!this.ok()) return; this.tone(this.sfx, this.t(), { f: 440, type: 'square', level: 0.07, d: 0.15 }); },
};
