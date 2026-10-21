// All sound is generated live with Web Audio: a samba groove from the bar's radio, the favela's
// ambience (wind, traffic, dogs, motorbikes, kids, birds), and game sounds (ball, steps, cheers).
// Voices use the browser's speech synthesis, with English subtitles shown by the game.
export const audio = {
  ctx: null, on: true, voiceOn: true,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.9 : 0; this.master.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.55; this.amb.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
    // Radio "speaker" colour on the music.
    this.radio = ctx.createBiquadFilter(); this.radio.type = 'peaking'; this.radio.frequency.value = 1800; this.radio.gain.value = 3;
    this.radio.connect(this.music);
    this.bed('lowpass', 300, 0.18, this.amb); this.bed('bandpass', 900, 0.03, this.amb);    // wind, city hum
    this.nextEv = 0; this.step16 = 0; this.nextNote = ctx.currentTime + 0.1;
  },
  bed(type, f, level, out) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const g = ctx.createGain(); g.gain.value = level;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = level * 0.6; lfo.connect(lg).connect(g.gain); lfo.start();
    s.connect(fl).connect(g).connect(out); s.start();
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
  // ---- samba (104 bpm, 16th-note grid) ----
  BPM: 104,
  scheduleMusic() {
    const ctx = this.ctx, spb = 60 / this.BPM / 4, o = this.radio;
    const tam = 'x.xx.x.xx.x.x.x.', ago = 'x..x..x.x..x.x..', bassN = [50, 0, 0, 50, 0, 0, 57, 0, 55, 0, 0, 55, 0, 0, 53, 0];
    while (this.nextNote < ctx.currentTime + 0.2) {
      const s = this.step16 % 16, bar = Math.floor(this.step16 / 16) % 4, t = this.nextNote;
      if (s === 4) this.tone(o, t, { f: 70, to: 42, level: 0.32, d: 0.4 });                    // surdo (muffled on 2)
      if (s === 12) this.tone(o, t, { f: 64, to: 38, level: 0.55, d: 0.55 });                   // surdo open on 4
      if (s === 0 || s === 8) this.noise(o, t, { type: 'lowpass', f: 160, level: 0.18, d: 0.08 });
      this.noise(o, t, { type: 'highpass', f: 6000, level: s % 2 ? 0.035 : 0.06, d: 0.045 });   // ganzá
      if (s % 2 === 0 || Math.random() < 0.4) this.noise(o, t, { f: 2400, q: 1.2, level: s % 4 === 2 ? 0.11 : 0.045, d: 0.06 }); // caixa
      if (tam[s] === 'x') this.tone(o, t, { f: 820, to: 760, type: 'square', level: 0.035, d: 0.05 });   // tamborim
      if (ago[s] === 'x') this.tone(o, t, { f: (s < 8 ? 960 : 720) * (bar % 2 ? 1 : 1.12), type: 'triangle', level: 0.05, d: 0.18 }); // agogô
      const bn = bassN[s]; if (bn) { const f = 440 * Math.pow(2, (bn + (bar === 3 ? -2 : bar === 2 ? 5 : 0) - 69) / 12) / 2; this.tone(o, t, { f, type: 'triangle', level: 0.22, d: 0.28 }); }
      if (s === 2 || s === 6 || s === 10 || s === 14) {                                          // cavaquinho strum
        const root = [62, 62, 67, 60][bar]; for (const iv of [0, 4, 7, 12]) this.tone(o, t + iv * 0.004, { f: 440 * Math.pow(2, (root + iv - 69) / 12), type: 'sawtooth', level: 0.012, d: 0.12 });
      }
      this.nextNote += spb; this.step16++;
    }
  },
  // Called every frame: musicLevel 0..1 (closer to the bar = louder), crowd (0..1 around the cage).
  update(musicLevel, crowd) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(0.08 + 0.5 * musicLevel, t, 0.4);
    this.scheduleMusic();
    if (t > this.nextEv) {
      this.nextEv = t + 1.5 + Math.random() * 4;
      const r = Math.random(), A = this.amb;
      if (r < 0.2) { for (let i = 0; i < 2 + Math.random() * 2; i++) this.noise(A, t + i * 0.28, { f: 520 + Math.random() * 200, q: 4, level: 0.08, a: 0.01, d: 0.12, to: 380 }); } // dog
      else if (r < 0.36) this.moto(t);
      else if (r < 0.62) { for (let i = 0; i < 3; i++) this.tone(A, t + i * 0.12, { f: 3200 + Math.random() * 1500, to: 2400, level: 0.02, d: 0.07 }); } // birds
      else if (crowd > 0.1) { this.noise(A, t, { f: 700 + Math.random() * 400, q: 5, level: 0.07 * crowd, a: 0.05, d: 0.3, to: 450 }); }   // kids shouting
      else this.noise(A, t, { type: 'lowpass', f: 200, level: 0.12, a: 0.8, d: 1.6 });      // a bus far below
    }
  },
  moto(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(120, t + 1.2); o.frequency.linearRampToValueAtTime(85, t + 2.6);
    f.type = 'lowpass'; f.frequency.value = 700; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(f).connect(g).connect(this.amb); o.start(t); o.stop(t + 3);
  },
  // ---- game sounds ----
  kick(power = 0.5) { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(this.sfx, t, { f: 160, to: 60, level: 0.25 + power * 0.35, d: 0.12 }); this.noise(this.sfx, t, { type: 'lowpass', f: 1400, level: 0.15 + power * 0.25, d: 0.05 }); },
  bounce(v) { if (!this.ctx || v < 0.8) return; const t = this.ctx.currentTime; this.tone(this.sfx, t, { f: 120, to: 70, level: Math.min(0.25, v * 0.04), d: 0.08 }); },
  step() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(this.sfx, t, { type: 'lowpass', f: 500, level: 0.05, d: 0.05 }); this.noise(this.sfx, t + 0.01, { f: 3000, q: 1.5, level: 0.015, d: 0.02 }); },
  net() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(this.sfx, t, { f: 1500, q: 0.6, level: 0.2, a: 0.01, d: 0.4, to: 500 }); },
  cheer(level = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.noise(this.sfx, t, { f: 900, q: 0.7, level: 0.22 * level, a: 0.15, d: 2.2 });
    for (let i = 0; i < 6; i++) this.noise(this.sfx, t + Math.random() * 0.8, { f: 600 + Math.random() * 600, q: 6, level: 0.06 * level, a: 0.05, d: 0.5, to: 400 + Math.random() * 300 });
  },
  ooh() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(this.sfx, t, { f: 500, q: 3, level: 0.16, a: 0.2, d: 1.0, to: 300 }); },
  chime() { if (!this.ctx) return; const t = this.ctx.currentTime; [880, 1320, 1760].forEach((f, i) => this.tone(this.sfx, t + i * 0.07, { f, type: 'triangle', level: 0.08, d: 0.35 })); },
  blip(f = 660) { if (!this.ctx) return; this.tone(this.sfx, this.ctx.currentTime, { f, type: 'triangle', level: 0.06, d: 0.08 }); },
  whistle() { if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(), g = this.ctx.createGain(), v = this.ctx.createOscillator(), vg = this.ctx.createGain(); o.frequency.value = 2900; v.frequency.value = 30; vg.gain.value = 150; v.connect(vg).connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g).connect(this.sfx); o.start(t); v.start(t); o.stop(t + 0.55); v.stop(t + 0.55); },
  setOn(on) { this.on = on; if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2); if (!on) speechSynthesis?.cancel(); },

  // ---- voices ----
  voices: [],
  loadVoices() { const v = window.speechSynthesis?.getVoices() || []; this.voices = v.filter(x => /^en/i.test(x.lang)); },
  pickVoice(prefs) { for (const p of prefs) { const v = this.voices.find(x => p.test(x.name)); if (v) return v; } return this.voices[0] || null; },
  CAST: {
    CR7: { prefs: [/Daniel/, /UK English Male/, /Arthur/, /Male/i], pitch: 0.95, rate: 1.02 },
    AGENT: { prefs: [/US English/, /Alex/, /Samantha/, /Aaron/], pitch: 1.0, rate: 1.08 },
    'ZÉ': { prefs: [/Daniel/, /Fred/, /UK English Male/, /Male/i], pitch: 0.7, rate: 0.92 },
    THIAGO: { prefs: [/Rishi/, /US English/, /Alex/], pitch: 1.35, rate: 1.12 },
    LUCAS: { prefs: [/Samantha/, /US English/], pitch: 1.6, rate: 1.15 },
    DAVI: { prefs: [/Rishi/, /Aaron/, /US English/, /Alex/], pitch: 1.45, rate: 1.05 },
  },
  speak(who, text) {
    return new Promise(res => {
      if (!this.on || !this.voiceOn || !window.speechSynthesis) return res(false);
      if (!this.voices.length) this.loadVoices();
      const c = this.CAST[who] || {}, u = new SpeechSynthesisUtterance(text.replace(/[«»—]/g, ' '));
      const v = this.pickVoice(c.prefs || []); if (v) u.voice = v; u.lang = v?.lang || 'en-GB';
      u.pitch = c.pitch ?? 1; u.rate = c.rate ?? 1; u.volume = 1;
      let done = false; const fin = () => { if (!done) { done = true; res(true); } };
      u.onend = fin; u.onerror = fin; setTimeout(fin, 1500 + text.length * 120);
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    });
  },
};
if (window.speechSynthesis) { audio.loadVoices(); speechSynthesis.onvoiceschanged = () => audio.loadVoices(); }
