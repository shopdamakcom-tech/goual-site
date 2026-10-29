// All sound is generated live with Web Audio: a samba groove from the bar's radio, the favela's
// ambience (wind, traffic, dogs, motorbikes, kids, birds), and game sounds (ball, steps, cheers).
// Voices are pre-recorded files (generated with the open Kokoro TTS model), with English subtitles.
// A carnival batucada plays on the title screen and the intro, then the bar's radio takes over.
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
    this.voice = ctx.createGain(); this.voice.gain.value = 1.15; this.voice.connect(this.master);
    this.carn = ctx.createGain(); this.carn.gain.value = 0; this.carn.connect(this.master);
    this.nextEv = 0; this.step16 = 0; this.nextNote = ctx.currentTime + 0.1; this.nextShout = 0; this.carnival = 1;
    this.loadVoiceFiles();
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
    const ctx = this.ctx, spb = 60 / this.BPM / 4, o = this.radio, C = this.carn;
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
      if (this.carnival > 0.02) {                                                                 // carnival batucada, full band
        if (s === 0) this.tone(C, t, { f: 58, to: 40, level: 0.5, d: 0.5 });                         // surdo de segunda
        if (s === 4 || s === 12) this.tone(C, t, { f: 52, to: 34, level: 0.75, d: 0.65 });           // surdo de primeira
        if ((s === 6 || s === 7 || s === 14) && bar % 2) this.tone(C, t, { f: 90, to: 60, level: 0.35, d: 0.18 }); // surdo de terceira fills
        this.noise(C, t, { f: 3000, q: 0.9, level: s % 4 === 0 ? 0.16 : s % 2 ? 0.07 : 0.11, d: 0.05 });               // caixa
        if ('x..x..x...x..x..'[s] === 'x') { this.tone(C, t, { f: 520, to: 430, type: 'triangle', level: 0.14, d: 0.06 }); this.noise(C, t, { f: 1800, q: 3, level: 0.1, d: 0.04 }); } // repinique
        this.noise(C, t, { type: 'highpass', f: 7000, level: s % 4 === 2 ? 0.08 : 0.04, d: 0.06 });     // chocalho
        if (tam[s] === 'x') this.tone(C, t, { f: 900, to: 840, type: 'square', level: 0.05, d: 0.05 });
        if (ago[s] === 'x') this.tone(C, t, { f: s < 8 ? 1040 : 780, type: 'triangle', level: 0.08, d: 0.2 });
        if ((s === 3 || s === 11) && Math.random() < 0.6) {                                          // cuíca: a squeaky pitched glide
          const o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.type = 'sine';
          o2.frequency.setValueAtTime(380, t); o2.frequency.exponentialRampToValueAtTime(820, t + 0.12); o2.frequency.exponentialRampToValueAtTime(520, t + 0.22);
          g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.09, t + 0.03); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
          o2.connect(g2).connect(C); o2.start(t); o2.stop(t + 0.26);
        }
        if (bar === 0 && (s === 0 || s === 2 || s === 4)) this.apito(t, s === 4 ? 0.3 : 0.09);           // mestre's whistle: tri-tri-triiii
      }
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
    this.music.gain.setTargetAtTime((0.08 + 0.5 * musicLevel) * (1 - this.carnival * 0.8) * (this.talking ? 0.55 : 1), t, 0.4);
    this.carn.gain.setTargetAtTime(this.carnival * 0.75 * (this.talking ? 0.45 : 1), t, 0.6);
    // The kids on the court shout to each other.
    if (crowd > 0.05 && t > this.nextShout) { this.nextShout = t + 1.0 + Math.random() * 2.8 / crowd; this.shout(crowd); }
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
  // A big engine purring for `sec` seconds (Cristiano's car).
  engine(sec = 3) {
    if (!this.ctx) return; const t = this.ctx.currentTime, ctx = this.ctx;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(38, t); o.frequency.linearRampToValueAtTime(62, t + sec * 0.6); o.frequency.linearRampToValueAtTime(44, t + sec);
    f.type = 'lowpass'; f.frequency.value = 260;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.4); g.gain.setValueAtTime(0.16, t + sec - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    o.connect(f).connect(g).connect(this.sfx); o.start(t); o.stop(t + sec + 0.05);
  },
  blip(f = 660) { if (!this.ctx) return; this.tone(this.sfx, this.ctx.currentTime, { f, type: 'triangle', level: 0.06, d: 0.08 }); },
  whistle() { if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(), g = this.ctx.createGain(), v = this.ctx.createOscillator(), vg = this.ctx.createGain(); o.frequency.value = 2900; v.frequency.value = 30; vg.gain.value = 150; v.connect(vg).connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g).connect(this.sfx); o.start(t); v.start(t); o.stop(t + 0.55); v.stop(t + 0.55); },

  apito(t, len) {                                                                               // samba whistle
    const o = this.ctx.createOscillator(), v = this.ctx.createOscillator(), vg = this.ctx.createGain(), g = this.ctx.createGain();
    o.frequency.value = 3100; v.frequency.value = 38; vg.gain.value = 220; v.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.015); g.gain.setValueAtTime(0.06, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.04);
    o.connect(g).connect(this.carn); o.start(t); v.start(t); o.stop(t + len + 0.06); v.stop(t + len + 0.06);
  },
  // Short carnival burst for big moments (goals, the end).
  fiesta(sec = 4) { this.carnival = 1; clearTimeout(this._f); this._f = setTimeout(() => { this.carnival = this.base ?? 0; }, sec * 1000); },
  setOn(on) { this.on = on; if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2); if (!on) this.stopVoice(); },

  // ---- voices (pre-rendered files) ----
  manifest: null, bufs: {},
  async loadVoiceFiles() {
    try { this.manifest = await (await fetch('voice/lines.json')).json(); } catch (e) { this.manifest = {}; return; }
    for (const v of Object.values(this.manifest)) for (const n of [].concat(v)) this.buf(n);
  },
  buf(n) { return this.bufs[n] ??= fetch('voice/' + n).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no))).catch(() => null); },
  play(name, { out = this.voice, level = 1, pan = 0, rate = 1 } = {}) {
    return this.buf(name).then(b => {
      if (!b) return null;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
      const g = this.ctx.createGain(); g.gain.value = level; const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      s.connect(g).connect(p).connect(out); s.start(); return s;
    });
  },
  speak(who, text) {
    return new Promise(async res => {
      if (!this.on || !this.voiceOn || !this.ctx) return res(false);
      if (!this.manifest) await this.loadVoiceFiles();
      const name = this.manifest[who + '|' + text]; if (!name) return res(false);
      this.stopVoice();
      const src = await this.play(name); if (!src) return res(false);
      this.cur = src; this.talking = true;
      src.onended = () => { if (this.cur === src) { this.cur = null; this.talking = false; } res(true); };
    });
  },
  stopVoice() { try { this.cur?.stop(); } catch (e) { } this.cur = null; this.talking = false; },
  siu() { if (this.on && this.ctx && this.manifest?.SIU) this.play(this.manifest.SIU, { level: 1.2 }); },
  shout(level = 1, pan = (Math.random() - 0.5) * 1.2) {
    const l = this.manifest?.SHOUTS; if (!l?.length || !this.on) return;
    this.play(l[Math.floor(Math.random() * l.length)], { out: this.amb, level: 0.25 + 0.5 * level, pan, rate: 0.96 + Math.random() * 0.1 });
  },
};
