import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------ data */
// device: 'iphone' | 'tv' | 'ipad' shows the film inside that screen; otherwise a floating panel.
const PROJECTS = [
  { src: '08.mp4', title: 'GOUAL ART', sub: 'AI ANIMATION', device: 'iphone' },
  { src: '09.mp4', title: 'OVASPORT', sub: '3D / ADVERTISING', device: 'tv' },
  { src: '10.mp4', title: 'GLAM BY MAJHA', sub: 'FASHION FILM', device: 'ipad' },
  { src: '01.mp4', title: 'JAYÎNA', sub: 'AI PRODUCT FILM' },
  { src: '04.mp4', title: 'GOUAL ART', sub: 'FASHION FILM' },
  { src: '05.mp4', title: 'GOUAL ART', sub: 'BRAND FILM' },
  { src: '07.mp4', title: 'COUPE DU MONDE BY GOUAL ART', sub: 'AI FILM' },
];
const TOTAL = String(PROJECTS.length).padStart(2, '0');
const WORK_START = 0.08, WORK_END = 0.72;
const SLOT = (WORK_END - WORK_START) / PROJECTS.length;
const projectCenter = i => WORK_START + (i + 0.5) * SLOT;
const TRAVEL = 230;           // camera z distance covered by progress 0 → 1
const PANEL_AHEAD = 7;        // a panel sits this far in front of the camera at its centre progress
const PANEL_H = 4.2;
const INK = new THREE.Color('#070707'), BONE = new THREE.Color('#f2f2ef');

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const body = document.body;

/* -------------------------------------------------------------- renderer */
const canvas = $('#webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(INK.clone(), 0.034);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 400);
scene.add(camera);

/* ------------------------------------------------------------ shader noise */
const NOISE = /* glsl */`
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
`;

/* -------------------------------------------------------------- starfield */
const STARS = innerWidth < 768 ? 2600 : 5200;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STARS * 3), starSize = new Float32Array(STARS), starPhase = new Float32Array(STARS);
for (let i = 0; i < STARS; i++) {
  const r = 0.6 + Math.pow(Math.random(), 0.6) * 28, a = Math.random() * Math.PI * 2;
  starPos.set([Math.cos(a) * r, Math.sin(a) * r, 15 - Math.random() * 300], i * 3);
  starSize[i] = Math.random() < 0.04 ? 3.2 + Math.random() * 1.5 : 0.6 + Math.random() * 1.4;
  starPhase[i] = Math.random();
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
const starUniforms = { uTime: { value: 0 }, uPixel: { value: renderer.getPixelRatio() }, uColor: { value: BONE.clone() }, uFogDensity: { value: 0.034 } };
const particles = new THREE.Points(starGeo, new THREE.ShaderMaterial({
  uniforms: starUniforms, transparent: true, depthWrite: false,
  vertexShader: /* glsl */`
    attribute float aSize, aPhase; uniform float uTime, uPixel, uFogDensity;
    varying float vAlpha;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.); float d=-mv.z;
      gl_PointSize=clamp(aSize*uPixel*28./d,1.8*uPixel,11.*uPixel);
      float twinkle=.7+.3*sin(uTime*(.8+aPhase*2.5)+aPhase*40.);
      vAlpha=twinkle*exp(-uFogDensity*uFogDensity*d*d);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor; varying float vAlpha;
    void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.1,d)*.55+smoothstep(.22,0.,d); gl_FragColor=vec4(uColor,min(a*1.3,1.)*vAlpha); }`,
}));
scene.add(particles);

/* ----------------------------------------------------- rings (the "O") */
const rings = [0.785, 0.875].map(p => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.018, 8, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  ring.position.z = -p * TRAVEL - PANEL_AHEAD;
  scene.add(ring);
  return ring;
});

/* ----------------------------------------------------------- video screens */
// Brushed-metal reflections for the device bodies.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const flatRounded = (w, h, r) => new THREE.ShapeGeometry(roundedShape(w, h, r), 10);
function slab(w, h, r, depth, mat) {
  const g = new THREE.ExtrudeGeometry(roundedShape(w, h, r), { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  return new THREE.Mesh(g, mat);
}
const metal = new THREE.MeshStandardMaterial({ color: 0x2c2c31, metalness: 0.85, roughness: 0.3 });
const glassBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });

// Each device: body size, screen size and corner radii, in scene units before fitting to the view.
const DEVICES = {
  iphone: { w: 2.2, h: 4.6, r: 0.38, d: 0.18, sw: 2.04, sh: 4.44, sr: 0.3 },
  tv: { w: 8.16, h: 4.66, r: 0.06, d: 0.1, sw: 8, sh: 4.5, sr: 0.03, standH: 0.9 },
  ipad: { w: 3.9, h: 5.1, r: 0.3, d: 0.12, sw: 3.6, sh: 4.8, sr: 0.16 },
};
function buildDevice(kind, videoMesh) {
  const D = DEVICES[kind], root = new THREE.Group(), front = D.d / 2 + 0.035;
  root.add(slab(D.w, D.h, D.r, D.d, metal));
  const screen = new THREE.Mesh(flatRounded(D.sw, D.sh, D.sr), glassBlack);
  screen.position.z = front; root.add(screen);
  videoMesh.position.z = front + 0.002; root.add(videoMesh);
  if (kind === 'iphone') {
    const island = new THREE.Mesh(flatRounded(0.62, 0.18, 0.09), glassBlack);
    island.position.set(0, D.sh / 2 - 0.22, front + 0.004); root.add(island);
  }
  if (kind === 'ipad') {
    const cam = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: 0x1b1b1f }));
    cam.position.set(0, D.h / 2 - 0.15, front); root.add(cam);
  }
  if (kind === 'tv') {
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.32, D.standH, 0.08), metal);
    neck.position.set(0, -D.h / 2 - D.standH / 2 + 0.1, -0.08); root.add(neck);
    const base = slab(2.6, 0.9, 0.12, 0.05, metal);
    base.rotation.x = -Math.PI / 2; base.position.set(0, -D.h / 2 - D.standH + 0.1, 0.05); root.add(base);
  }
  return root;
}

const panels = PROJECTS.map((proj, i) => {
  const video = document.createElement('video');
  Object.assign(video, { src: proj.src, muted: true, loop: true, playsInline: true, preload: i < 2 ? 'auto' : 'metadata' });
  video.setAttribute('playsinline', '');
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x111111 });
  const videoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
  const side = i % 2 ? -1 : 1;
  let root;
  if (proj.device) root = buildDevice(proj.device, videoMesh);
  else {
    root = new THREE.Group(); root.add(videoMesh);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    frame.position.z = -0.01;
    videoMesh.add(frame);
  }
  root.position.set(0, 0.25, -projectCenter(i) * TRAVEL - PANEL_AHEAD);
  // Own copies of the materials so each film can fade in and out on its own.
  const mats = [];
  root.traverse(o => {
    if (!o.material) return;
    if (o.material !== screenMat) o.material = o.material.clone();
    o.material.transparent = true;
    o.material.userData.baseOpacity = o.material.opacity;
    mats.push(o.material);
  });
  const panel = { video, root, videoMesh, screenMat, mats, side, device: proj.device, aspect: 16 / 9, baseY: 0.25 };
  video.addEventListener('loadedmetadata', () => {
    if (video.videoWidth) { panel.aspect = video.videoWidth / video.videoHeight; fitPanel(panel); }
  });
  scene.add(root);
  return panel;
});
// Keep each film inside the view: wide films shrink on narrow screens, devices scale to fit.
function fitPanel(p) {
  const fov = camera.aspect < 0.8 ? 70 : 55;
  const viewH = 2 * PANEL_AHEAD * Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const viewW = viewH * camera.aspect;
  const narrow = camera.aspect < 0.8;
  if (p.device) {
    // Film keeps its own ratio inside the device screen (letter- or pillar-boxed).
    const D = DEVICES[p.device];
    const vw = p.aspect > D.sw / D.sh ? D.sw : D.sh * p.aspect;
    p.videoMesh.scale.set(vw, vw / p.aspect, 1);
    const totalH = D.h + (D.standH || 0);
    const k = Math.min(viewH * 0.58 / totalH, viewW * (narrow ? 0.82 : 0.6) / D.w);
    p.root.scale.setScalar(k);
    p.baseY = viewH * 0.1 + (D.standH || 0) * k * 0.5;
  } else {
    const h = Math.min(PANEL_H, viewW * 0.86 / p.aspect, viewH * 0.62);
    p.videoMesh.scale.set(h * p.aspect, h, 1);
    p.baseY = 0.25;
  }
}

/* ------------------------------------------------- frost glass + shards */
const trail = document.createElement('canvas');
trail.width = 512; trail.height = 512;
const tctx = trail.getContext('2d');
tctx.fillStyle = '#000'; tctx.fillRect(0, 0, 512, 512);
const trailTex = new THREE.CanvasTexture(trail);

const frostUniforms = {
  uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uMouse: { value: new THREE.Vector2(-1, -1) },
  uTrail: { value: trailTex }, uOpacity: { value: 0 }, uFlash: { value: 0 },
};
const frostMat = new THREE.ShaderMaterial({
  uniforms: frostUniforms, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: /* glsl */`void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform float uTime,uOpacity,uFlash; uniform vec2 uRes,uMouse; uniform sampler2D uTrail;
    ${NOISE}
    vec2 voro(vec2 p){ vec2 i=floor(p),f=fract(p); float d1=8.,d2=8.;
      for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=vec2(hash(i+g),hash(i+g+19.));
        float d=length(g+o-f); if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d; } return vec2(d1,d2); }
    void main(){
      vec2 uv=gl_FragCoord.xy/uRes; float asp=uRes.x/uRes.y; vec2 p=uv*vec2(asp,1.);
      float n=fbm(p*3.+vec2(uTime*.015,0.)); float n2=fbm(p*11.-n*2.);
      vec2 v=voro(p*3.+n*1.2); float crack=smoothstep(.025,0.,v.y-v.x)*.22;
      vec2 v2=voro(p*12.+n2); crack+=smoothstep(.02,0.,v2.y-v2.x)*.07;
      float sparkle=pow(noise(p*180.),18.)*.6;
      float glow=smoothstep(1.25,.0,length((uv-vec2(.5,-.32))*vec2(.9,1.15)));
      vec3 col=mix(vec3(.24,.26,.26),vec3(.66,.69,.68),n*.85+n2*.2)+crack+sparkle+glow*.28;
      float wipe=texture2D(uTrail,uv).r;
      float spot=smoothstep(.09,.0,length((uv-uMouse)*vec2(asp,1.)));
      float a=mix(.93,.12,clamp(wipe*1.2+spot*.6,0.,1.));
      col=mix(col,vec3(1.),uFlash);
      gl_FragColor=vec4(col,a*uOpacity);
    }`,
});

let shards = [];
const shardGroup = new THREE.Group();
camera.add(shardGroup);
const GLASS_D = 1;
function buildShards() {
  shardGroup.clear();
  shards.forEach(s => s.mesh.geometry.dispose());
  shards = [];
  const h = 2 * GLASS_D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.02, w = h * camera.aspect;
  const cols = camera.aspect > 1 ? 11 : 6, rows = camera.aspect > 1 ? 7 : 10;
  const pts = [];
  for (let r = 0; r <= rows; r++) {
    pts[r] = [];
    for (let c = 0; c <= cols; c++) {
      const edge = r === 0 || c === 0 || r === rows || c === cols;
      const jx = edge ? 0 : (Math.random() - 0.5) * 0.7, jy = edge ? 0 : (Math.random() - 0.5) * 0.7;
      pts[r][c] = new THREE.Vector2(((c + jx) / cols - 0.5) * w, ((r + jy) / rows - 0.5) * h);
    }
  }
  const tri = (a, b, c) => {
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3;
    const g = new THREE.BufferGeometry();
    // Scale each shard up a hair around its centre so no seams show while the glass is whole.
    const s = 1.012;
    g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c].flatMap(v => [(v.x - cx) * s, (v.y - cy) * s, 0]), 3));
    const mesh = new THREE.Mesh(g, frostMat);
    mesh.position.set(cx, cy, -GLASS_D);
    mesh.renderOrder = 10;
    shardGroup.add(mesh);
    const out = new THREE.Vector2(cx, cy).normalize();
    shards.push({
      mesh,
      vel: new THREE.Vector3(out.x * (0.6 + Math.random() * 1.6), out.y * (0.6 + Math.random() * 1.6) - 0.3, 0.4 + Math.random() * 2.2),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(9),
    });
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = pts[r][c], b = pts[r][c + 1], d = pts[r + 1][c], e = pts[r + 1][c + 1];
    if (Math.random() < 0.5) { tri(a, b, e); tri(a, e, d); } else { tri(a, b, d); tri(b, e, d); }
  }
}
buildShards();

/* ------------------------------------------------------------------ sound */
const sound = {
  ctx: null, master: null, filter: null, on: false,
  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 380; this.filter.Q.value = 6;
    const amb = ctx.createGain(); amb.gain.value = 0.07;
    this.filter.connect(amb).connect(this.master);
    [41.2, 61.7, 82.4, 123.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(this.filter); o.start();
    });
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain(); lfo.frequency.value = 0.07; lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(this.filter.frequency); lfo.start();
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource(); air.buffer = this.noiseBuf; air.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 900; airF.Q.value = 0.6;
    const airG = ctx.createGain(); airG.gain.value = 0.012;
    air.connect(airF).connect(airG).connect(this.master); air.start();
  },
  toggle() {
    this.init(); this.ctx.resume();
    this.on = !this.on;
    this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.25);
    return this.on;
  },
  noise(dur, type, f0, f1, gain) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  },
  ping(freq, dur, gain, delay = 0) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  whoosh() { this.noise(0.9, 'bandpass', 280, 2600, 0.25); },
  shatter() {
    this.noise(0.7, 'highpass', 5000, 1800, 0.5);
    this.noise(1.6, 'lowpass', 900, 120, 0.35);
    for (let i = 0; i < 9; i++) this.ping(2200 + Math.random() * 3800, 0.4 + Math.random() * 0.8, 0.05, Math.random() * 0.5);
  },
  tick() { this.ping(1400, 0.05, 0.04); },
};
const soundBtn = $('#sound');
soundBtn.addEventListener('click', e => {
  e.stopPropagation();
  const on = sound.toggle();
  soundBtn.setAttribute('aria-pressed', on);
  soundBtn.querySelector('.label').textContent = on ? 'SOUND ON' : 'SOUND OFF';
});

/* ------------------------------------------------------------------ state */
let state = 'loading';     // loading → gate → shatter → inside
let progress = 0, target = 0, velocity = 0;
const mouse = new THREE.Vector2(), mouseSmooth = new THREE.Vector2();
const cursorEl = $('#cursor'), hintEl = $('#hint');

/* ----------------------------------------------------------------- loader */
const counterEl = $('#counter');
const loadStart = performance.now();
let loaded = 0;
const toLoad = [document.fonts ? document.fonts.ready : Promise.resolve(), ...panels.map(p => new Promise(res => {
  if (p.video.readyState >= 1) return res();
  p.video.addEventListener('loadedmetadata', res, { once: true });
  p.video.addEventListener('error', res, { once: true });
}))];
toLoad.forEach(pr => pr.then(() => loaded++));
const loadTimeout = setTimeout(() => (loaded = toLoad.length), 9000);
let shownCount = 99;
function updateLoader() {
  const tp = (performance.now() - loadStart) / 2600;
  const lp = loaded / toLoad.length;
  const n = Math.max(0, Math.round(99 * (1 - Math.min(tp, lp))));
  if (n < shownCount) { shownCount = n; counterEl.textContent = String(n).padStart(2, '0'); if (n % 7 === 0) sound.tick(); }
  if (n === 0 && lp >= 1) {
    clearTimeout(loadTimeout);
    counterEl.classList.add('done');
    renderer.setClearColor(INK, 1);
    state = 'gate';
    body.classList.add('ready', 'gate');
  }
}

/* ------------------------------------------------------------------- gate */
let drawing = false, pts = [];
function wipe(x, y, px, py, width) {
  tctx.strokeStyle = '#fff'; tctx.lineCap = 'round'; tctx.lineWidth = width;
  tctx.shadowColor = '#fff'; tctx.shadowBlur = width;
  tctx.beginPath(); tctx.moveTo(px / innerWidth * 512, (1 - py / innerHeight) * 512); tctx.lineTo(x / innerWidth * 512, (1 - y / innerHeight) * 512); tctx.stroke();
  trailTex.needsUpdate = true;
}
function isLoop(list) {
  if (list.length < 14) return false;
  let cx = 0, cy = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const p of list) { cx += p.x; cy += p.y; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  cx /= list.length; cy /= list.length;
  const bw = maxX - minX, bh = maxY - minY, min = Math.min(innerWidth, innerHeight);
  if (Math.min(bw, bh) < min * 0.09 || bw / bh > 3.2 || bh / bw > 3.2) return false;
  let sum = 0, prev = Math.atan2(list[0].y - cy, list[0].x - cx);
  for (let i = 1; i < list.length; i++) {
    const a = Math.atan2(list[i].y - cy, list[i].x - cx);
    let d = a - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    sum += d; prev = a;
  }
  return Math.abs(sum) > Math.PI * 2 * 0.82;
}
addEventListener('pointerdown', e => {
  cursorEl.classList.add('down');
  if (state !== 'gate' || e.target.closest?.('button,a')) return;
  drawing = true; pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
});
addEventListener('pointerup', () => { cursorEl.classList.remove('down'); drawing = false; });
addEventListener('pointermove', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  cursorEl.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  hintEl.style.left = e.clientX + 'px'; hintEl.style.top = e.clientY + 34 + 'px';
  frostUniforms.uMouse.value.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
  if (state !== 'gate') return;
  const now = performance.now();
  const last = pts[pts.length - 1];
  // Mouse users can draw by just moving; touch users draw while pressed.
  if (!drawing && e.pointerType !== 'mouse') return;
  if (last) wipe(e.clientX, e.clientY, last.x, last.y, drawing ? 30 : 14);
  pts.push({ x: e.clientX, y: e.clientY, t: now });
  // A pressed stroke counts from pointerdown; a hover stroke from the last 2 s.
  pts = drawing ? pts.slice(-400) : pts.filter(p => now - p.t < 2000);
  if (isLoop(pts)) enter();
});

const holdBtn = $('#hold'), holdFill = holdBtn.querySelector('.fill');
let holding = false, hold = 0;
holdBtn.addEventListener('pointerdown', e => { e.stopPropagation(); holding = true; sound.init(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => holdBtn.addEventListener(t, () => (holding = false)));
addEventListener('keydown', e => {
  if (state === 'gate' && (e.code === 'Space' || e.code === 'Enter')) { holding = true; e.preventDefault(); }
});
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') holding = false; });

let shatterT = 0;
function enter() {
  if (state !== 'gate') return;
  state = 'shatter'; shatterT = 0; pts = []; drawing = false;
  body.classList.remove('gate');
  $('.wordmark .o').style.transform = 'scale(1.25)';
  sound.shatter(); setTimeout(() => sound.whoosh(), 250);
  target = Math.max(target, 0.03);
}

/* ------------------------------------------------------------- navigation */
function addScroll(d) { if (state === 'inside' || state === 'shatter') target = clamp(target + d, 0, 1); }
addEventListener('wheel', e => {
  const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? innerHeight : 1;
  addScroll(e.deltaY * k * 0.00011);
}, { passive: true });
let touchY = null;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', e => {
  if (touchY == null) return;
  const y = e.touches[0].clientY; addScroll((touchY - y) * 0.0007); touchY = y;
}, { passive: true });
addEventListener('touchend', () => (touchY = null));
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const step = { ArrowDown: 0.03, PageDown: 0.08, ArrowUp: -0.03, PageUp: -0.08 }[e.code];
  if (step) addScroll(step);
  if (e.code === 'Home') addScroll(-1);
  if (e.code === 'End') addScroll(1);
  if (state === 'inside' && e.code === 'Space') addScroll(e.shiftKey ? -0.06 : 0.06);
});
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', e => {
  e.preventDefault(); e.stopPropagation();
  const to = parseFloat(el.dataset.goto);
  if (state === 'gate') enter();
  if (state !== 'loading') { target = Math.max(to, 0.03); sound.whoosh(); }
}));
$('#contact-form').addEventListener('submit', e => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.textContent = 'THANK YOU ✓';
});

/* -------------------------------------------------------------- chapters */
const statementEl = $('.chapter.statement');
PROJECTS.slice().reverse().forEach((_, k) => {
  const el = document.createElement('div');
  el.className = 'chapter project'; el.dataset.project = PROJECTS.length - 1 - k;
  statementEl.after(el);
});
$('#stage-num').textContent = `00 / ${TOTAL}`;
const chapterEls = [...document.querySelectorAll('.chapter')].map(el => {
  let range;
  if (el.dataset.project != null) {
    const i = +el.dataset.project, p = PROJECTS[i];
    el.innerHTML = `<div class="meta" style="justify-content:${panels[i].side > 0 ? 'flex-end' : 'flex-start'};text-align:${panels[i].side > 0 ? 'right' : 'left'}"><div><h2${p.title.length > 14 ? ' class="long"' : ''}>${p.title}</h2><div class="sub">${p.sub}</div></div></div>`;
    const c = projectCenter(i); range = [c - SLOT * 0.42, c + SLOT * 0.42];
  } else range = el.dataset.range.split(',').map(Number);
  return { el, range };
});
let lastProject = -1;
const stageNum = $('#stage-num'), bar = $('#progress-bar');

/* ------------------------------------------------------------------ resize */
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 70 : 55;
  camera.updateProjectionMatrix();
  frostUniforms.uRes.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  if (state === 'loading' || state === 'gate') buildShards();
  panels.forEach(fitPanel);
}
addEventListener('resize', resize);
resize();

/* -------------------------------------------------------------------- loop */
const clock = new THREE.Clock();
const fogColor = new THREE.Color();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (state === 'loading') { updateLoader(); requestAnimationFrame(frame); return; }

  // Gate: frost fades in, the trail slowly re-frosts, hold button fills.
  if (state === 'gate' || state === 'shatter') {
    frostUniforms.uOpacity.value = Math.min(1, frostUniforms.uOpacity.value + dt * 0.9);
    tctx.shadowBlur = 0; tctx.fillStyle = 'rgba(0,0,0,0.015)'; tctx.fillRect(0, 0, 512, 512); trailTex.needsUpdate = true;
  }
  if (state === 'gate') {
    hold = clamp(hold + (holding ? dt / 1.1 : -dt * 1.5), 0, 1);
    holdFill.style.strokeDashoffset = 125.7 * (1 - hold);
    if (hold >= 1) enter();
  }
  if (state === 'shatter') {
    shatterT += dt;
    frostUniforms.uFlash.value = Math.max(0, 0.5 - shatterT * 2);
    for (const s of shards) {
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.y -= dt * 1.6;
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt; s.mesh.rotation.z += s.spin.z * dt * 0.3;
    }
    frostUniforms.uOpacity.value = clamp(1 - (shatterT - 0.35) / 1.1, 0, 1);
    if (shatterT > 1.6) {
      state = 'inside'; body.classList.add('inside');
      camera.remove(shardGroup); shards.forEach(s => s.mesh.geometry.dispose()); shards = [];
    }
  }

  // Scroll progress with inertia.
  const prev = progress;
  progress += (target - progress) * (1 - Math.exp(-dt * 3.2));
  velocity = (progress - prev) / Math.max(dt, 1e-4);
  const speed = Math.min(Math.abs(velocity) * 8, 1);

  // Camera flies through the stars, drifts with the pointer and leans into speed.
  mouseSmooth.lerp(mouse, 1 - Math.exp(-dt * 3));
  camera.position.set(mouseSmooth.x * 0.45, mouseSmooth.y * 0.3, -progress * TRAVEL);
  camera.lookAt(mouseSmooth.x * 0.15, mouseSmooth.y * 0.1 + 0.1, camera.position.z - 10);
  camera.rotation.z += -velocity * 0.4 + Math.sin(t * 0.3) * 0.006;
  const baseFov = camera.aspect < 0.8 ? 70 : 55;
  const shatterKick = state === 'shatter' ? Math.sin(Math.min(shatterT / 1.6, 1) * Math.PI) * 10 : 0;
  camera.fov += (baseFov + speed * 14 + shatterKick - camera.fov) * (1 - Math.exp(-dt * 5));
  camera.updateProjectionMatrix();

  // Light at the end of the journey.
  const light = smooth(0.89, 0.965, progress);
  fogColor.copy(INK).lerp(BONE, light);
  scene.fog.color.copy(fogColor);
  scene.fog.density = 0.034 - light * 0.012;
  // Stars fade with distance more gently than the films, so deep space stays visible.
  starUniforms.uFogDensity.value = scene.fog.density * 0.4;
  starUniforms.uTime.value = t;
  renderer.setClearColor(fogColor, 1);
  starUniforms.uColor.value.copy(BONE).lerp(INK, light);
  body.classList.toggle('light', light > 0.6);

  // Particles swirl harder through the services/process chapters.
  const swirl = smooth(0.72, 0.8, progress) * (1 - smooth(0.9, 0.97, progress));
  particles.rotation.z += dt * (0.015 + swirl * 0.35 + speed * 0.3);
  frostUniforms.uTime.value = t;
  rings.forEach((r, i) => { r.rotation.z = t * (i ? -0.2 : 0.25); r.rotation.x = Math.sin(t * 0.4 + i) * 0.25; r.material.color.copy(BONE).lerp(INK, light); });

  // Video panels: play only what is near, fade in from the fog, brighten when centred.
  panels.forEach((p, i) => {
    // One film at a time: it emerges as you reach it and fades once you move on.
    const appear = 1 - smooth(SLOT * 0.45, SLOT * 0.85, Math.abs(progress - projectCenter(i)));
    p.root.visible = appear > 0.001;
    p.mats.forEach(m => (m.opacity = m.userData.baseOpacity * appear));
    const near = state === 'inside' && appear > 0;
    if (near && p.video.paused) p.video.play().catch(() => {});
    if (!near && !p.video.paused) p.video.pause();
    const focus = 1 - smooth(0, SLOT * 0.6, Math.abs(progress - projectCenter(i)));
    p.screenMat.color.setScalar(0.35 + focus * 0.65);
    if (p.device) {
      // Devices float and turn slightly toward the pointer.
      p.root.position.y = p.baseY + Math.sin(t * 0.8 + i) * 0.06;
      p.root.rotation.set(Math.sin(t * 0.6 + i) * 0.03 - mouseSmooth.y * 0.08 * focus, mouseSmooth.x * 0.25 * focus + Math.sin(t * 0.5 + i) * 0.04, 0);
    } else {
      p.root.position.y = p.baseY;
      p.root.rotation.y = mouseSmooth.x * 0.06 * focus;
    }
  });

  // DOM chapters, project counter, progress bar.
  const show = state === 'inside' || state === 'shatter';
  chapterEls.forEach(c => c.el.classList.toggle('on', show && progress >= c.range[0] && progress < c.range[1]));
  let current = -1;
  PROJECTS.forEach((_, i) => { if (Math.abs(progress - projectCenter(i)) < SLOT / 2) current = i; });
  if (current !== lastProject) {
    if (current >= 0 && state === 'inside') sound.whoosh();
    lastProject = current;
    stageNum.textContent = `${String(current + 1).padStart(2, '0')} / ${TOTAL}`;
  }
  bar.style.transform = `scaleX(${progress})`;
  if (sound.filter) sound.filter.frequency.setTargetAtTime(380 + speed * 900 + light * 600, sound.ctx.currentTime, 0.2);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) window.__goual = { goto: v => (target = v), state: () => state, progress: () => progress };
