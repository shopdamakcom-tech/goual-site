// GOUAL RUN — Ballon d'Or Run. An endless runner down a Rio favela in a soft animated-movie look:
// you carry the Ballon d'Or, switch lanes, jump and slide past fruit crates, carts, laundry lines,
// rolling barrels and street dogs, and collect footballs. The world is built in code (favela.js,
// favela-kit.js) around painted art made for GOUAL ART.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Character, dress } from '../street/rig.js?v=4';
import { audio } from './audio.js?v=2';
import { loadFavela, makeSky, makeClouds, makeFavela, makeBallonDor } from './favela.js?v=1';
import { obstacle as makeObstacle, kitMaterials } from './favela-kit.js?v=1';

const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const params = new URLSearchParams(location.search);
const EMBED = params.has('embed') || window.parent !== window;
const TOUCH = matchMedia('(pointer: coarse)').matches || params.has('touch');
const X_AXIS = new V3(1, 0, 0);

// ================= renderer, scene, light =================
const renderer = new THREE.WebGLRenderer({ canvas: $('#game'), antialias: TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 1.75));
if (params.has('test')) renderer.setPixelRatio(0.5);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#c3dcea', 80, 420);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
// Soft bloom + MSAA on computers; phones render straight to the screen.
let composer = null;
if (!TOUCH && !params.has('nobloom')) {
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.28, 0.5, 0.88)); composer.addPass(new OutputPass());
}
function onResize() { renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 70 : 58; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize); onResize();
const ENV = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = ENV; scene.environmentIntensity = 0.35;
// Warm low morning sun from the left; the cool sky fill makes the shadows blue.
scene.add(new THREE.HemisphereLight('#bfe0ff', '#d9a87c', 1.1));
const sun = new THREE.DirectionalLight('#ffdcae', 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 40, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
const SUN_DIR = new V3(-30, 26, -14).normalize();
scene.add(sun, sun.target);

// ================= assets =================
const setBar = f => { $('#loading .bar i').style.width = (f * 100) + '%'; };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
let done = 0; const tick = p => p.then(v => { setBar(++done / 7); return v; });
const [art, cr7Src, kidSrc, zeSrc, kaneSrc] = await Promise.all([tick(loadFavela(renderer)), tick(load('../street/models/cr7.glb')), tick(load('../street/models/kid.glb')), tick(load('../street/models/ze.glb')), tick(load('../street/models/kane.glb?v=1'))]).then(r => [r[0], ...r.slice(1).map(g => g.scene)]);
const sky = makeSky(art.T, art.meta); scene.add(sky);
const clouds = makeClouds(art.T, art.meta); scene.add(clouds);

// ================= the heroes =================
function outfit(ch, map) {
  ch.model.traverse(o => {
    if (!o.isMesh) return; const e = map[o.material.name]; if (!e) return;
    const [col, keep] = Array.isArray(e) ? e : [e, false];
    const m = o.material = o.material.clone(); if (!keep) m.map = null; m.color.set(col); m.roughness = 0.8;
  });
}
const HEROES = [
  { id: 'cr7', name: 'CR7', role: 'THE ROCKET', ability: 'SIUUU SPRINT', icon: '⚡', short: 'SIUUU', txt: 'Fill the meter with balls, then go unstoppable for 4 seconds: smash through everything, nobody can catch you.',
    make: () => { const c = new Character(cr7Src, { kind: 'valve', height: 1.87 }); outfit(c, { texture_6: '#c8102e', texture_7: '#0b6b3a', texture_8: '#c8102e' }); return c; } },
  { id: 'davi', name: 'DAVI', role: 'THE GEM', ability: 'GINGA MAGNET', icon: '🧲', short: 'MAGNET', txt: 'Double jump in the air. Ability: every ball on the street flies to you for 8 seconds.',
    make: () => { const c = new Character(kidSrc, { kind: 'mixamo', height: 1.66 }); dress(c, { top: '#fbe14a', bottom: '#1d3fa8', shoes: '#ffffff', skin: '#7c5038' }); return c; } },
  { id: 'ze', name: 'ZÉ', role: 'THE BOSS', ability: 'GOLDEN SHIELD', icon: '🛡', short: 'SHIELD', txt: 'Starts with a shield. Ability: a golden shield that saves you from one crash.',
    make: () => { const c = new Character(zeSrc, { kind: 'cc', height: 1.78 }); outfit(c, { Std_Skin_Leg: ['#1f3b8a', true], Std_Skin_Body: ['#1f3b8a', true], Fit_shirts: ['#f2f2f2', true] }); return c; } },
  { id: 'kane', name: 'KANE', role: 'THE CAPTAIN', ability: 'CAPTAIN\'S STRIKE', icon: '💥', short: 'STRIKE', txt: 'A thunderbolt shot that blasts every obstacle out of the way for the next 45 metres.',
    make: () => new Character(kaneSrc, { kind: 'meshy', height: 1.88 }) },
];
// Where each hero stands on the select screen (four across the street).
const selX = i => (i - (HEROES.length - 1) / 2) * 2.2;
const heroes = HEROES.map(h => { const c = h.make(); scene.add(c.root); c.root.visible = false; return c; });
// The real trophy model when it loads (stood upright, base at the hand), else the one made in code.
// The Ballon d'Or, carried by the runner.
const cup = makeBallonDor(ENV); scene.add(cup);

// ================= the favela =================
const LANES = [-2.6, 0, 2.6], SEG = 48, POOL = 8;
const favela = makeFavela(scene, art.T, art.meta, { seg: SEG });
const KM = kitMaterials();
// The decor is built once as 8 different stretches of street (two with the football cage),
// then moved along as you run: no building while playing, so no hitches.
const pool = [];
for (let k = 0; k < POOL; k++) { const g = favela.segment(k, { court: k === 3 || k === 7 }); g.userData.base = -k * SEG; g.visible = false; pool.push(g); setBar(0.7 + 0.3 * (k + 1) / POOL); }
let decorNext = 0, decorZ = 0;
const decor = [];          // { g, z0 }
function placeDecor() {
  const g = pool[decorNext % POOL]; decorNext++;
  g.position.z = decorZ - g.userData.base; g.visible = true; decor.push({ g, z0: decorZ }); decorZ -= SEG;
}
const segments = [];      // obstacle rows: { z0, z1, obs: [], coins: [] }
const obstacles = [], coins = [];
let genZ = 0, segIndex = 0;
const world = new THREE.Group(); scene.add(world);
// Footballs to collect.
const ballTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#141414'; for (let i = 0; i < 12; i++) { const x = (i % 6) * 44 + (i > 5 ? 22 : 0), y = i > 5 ? 88 : 36; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13); } g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const coinGeo = new THREE.SphereGeometry(0.33, 16, 12), coinMat = new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.12 });
const glowMat = new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
const glowGeo = new THREE.CircleGeometry(0.55, 20);
const RNG = Math.random;
function obstacle(seg, name, lane, z, o = {}) {
  const made = makeObstacle(name, KM, RNG);
  const ob = { name, lane, x: LANES[lane], z, vz: 0, hit: false, ...made, ...o };
  ob.obj.position.set(ob.x, 0, z); ob.obj.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  world.add(ob.obj); seg.obs.push(ob); obstacles.push(ob); return ob;
}
function coinLine(seg, lane, z, n = 6, arc = 0) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(coinGeo, coinMat); m.castShadow = true;
    const t = n > 1 ? i / (n - 1) : 0, y = 1.0 + (arc ? Math.sin(t * Math.PI) * arc : 0);
    m.position.set(LANES[lane], y, z - i * 2.6); world.add(m);
    const gl = new THREE.Mesh(glowGeo, glowMat); gl.rotation.x = -Math.PI / 2; gl.position.set(LANES[lane], 0.03, z - i * 2.6); world.add(gl);
    const c = { m, gl, lane, z: z - i * 2.6, y, got: false }; seg.coins.push(c); coins.push(c);
  }
}
const ROW = 22;
function buildSegment() {
  segIndex++;
  const seg = { z0: genZ, z1: genZ - ROW, obs: [], coins: [] };
  if (segIndex > 2) spawnRow(seg); else coinLine(seg, 1, genZ - 6, 5);
  segments.push(seg); genZ -= ROW;
}
const JUMPS = ['crates', 'bricks'], BLOCKS = ['cart', 'tank'], SLIDES = ['line', 'plank'];
function spawnRow(seg) {
  const d = difficulty(), z = seg.z0 - rnd(6, 14);
  if (Math.random() > 0.55 + d * 0.45) { coinLine(seg, Math.floor(rnd(0, 3)), seg.z0 - 4, 6); return; }
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5), free = lanes[0];
  const r = Math.random();
  if (r < 0.2) { obstacle(seg, pick(BLOCKS), lanes[1], z); if (Math.random() < d) obstacle(seg, pick(BLOCKS), lanes[2], z - rnd(0, 6)); coinLine(seg, free, z + 6, 6); }
  else if (r < 0.36) { for (const l of [0, 1, 2]) obstacle(seg, pick(JUMPS), l, z); coinLine(seg, free, z + 5.5, 5, 1.6); }
  else if (r < 0.52) { obstacle(seg, pick(SLIDES), lanes[1], z); obstacle(seg, pick(BLOCKS), lanes[2], z); if (Math.random() < 0.5) obstacle(seg, pick(SLIDES), free, z); else coinLine(seg, free, z + 6, 6); }
  else if (r < 0.66) { obstacle(seg, 'dog', lanes[1], z - 8, { vz: rnd(5, 7) }); if (d > 0.35) obstacle(seg, 'dog', lanes[2], z - 18, { vz: rnd(5, 7) }); coinLine(seg, free, z + 6, 6); }
  else if (r < 0.8) { obstacle(seg, 'barrel', lanes[1], z - 12, { vz: rnd(6, 9) }); obstacle(seg, pick(JUMPS), lanes[2], z); coinLine(seg, free, z + 6, 6); }
  else if (r < 0.92) { for (const l of [0, 1, 2]) obstacle(seg, pick(SLIDES), l, z); coinLine(seg, lanes[1], z + 4, 4); }
  else { obstacle(seg, pick(BLOCKS), lanes[1], z); obstacle(seg, pick(JUMPS), free, z + 2); coinLine(seg, free, z + 4, 4, 1.6); }
}
function dropSegment(seg) {
  for (const ob of seg.obs) { world.remove(ob.obj); ob.obj.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); const i = obstacles.indexOf(ob); if (i >= 0) obstacles.splice(i, 1); }
  for (const c of seg.coins) { world.remove(c.m); world.remove(c.gl); const i = coins.indexOf(c); if (i >= 0) coins.splice(i, 1); }
}
function streamWorld(pz) {
  while (genZ > pz - 200) buildSegment();
  while (segments.length && segments[0].z1 > pz + 30) dropSegment(segments.shift());
  while (decorZ > pz - 330) placeDecor();
  while (decor.length && decor[0].z0 - SEG > pz + 60) { decor.shift().g.visible = false; }
}
function resetWorld() {
  while (segments.length) dropSegment(segments.shift());
  for (const d of decor) d.g.visible = false; decor.length = 0;
  genZ = 0; segIndex = 0; decorZ = 40; decorNext = 0;
  streamWorld(0);
}
// ---- birds: a small flock now and then, and pigeons taking off from the street ----
const birdGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.2, -0.7, 0, 0, 0, 0, 0.25, 0, 0, -0.2, 0.7, 0, 0], 3)); g.computeVertexNormals(); return g; })();
const birdMat = new THREE.MeshStandardMaterial({ color: '#3a3940', side: THREE.DoubleSide, roughness: 0.8 });
const birds = [];
function flock(x, y, z, vx, vz, n = 7, pigeons = false) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(birdGeo, pigeons ? new THREE.MeshStandardMaterial({ color: pick(['#8d8f99', '#6f7180', '#b7b4ad']), side: THREE.DoubleSide }) : birdMat);
    const s = pigeons ? 0.6 : rnd(0.9, 1.3); m.scale.setScalar(s);
    m.position.set(x + (i % 3) * 1.4 - 1.4 + rnd(-0.5, 0.5), y + rnd(-0.6, 0.6), z + Math.floor(i / 3) * 1.4 + rnd(-0.5, 0.5));
    scene.add(m); birds.push({ m, vx: vx + rnd(-0.6, 0.6), vy: pigeons ? 0 : rnd(-0.2, 0.3), vz: vz + rnd(-0.6, 0.6), ph: rnd(0, 6), life: pigeons ? 6 : 16, pigeons, ground: pigeons });
  }
}
let birdT = 4;
function updateBirds(dt) {
  birdT -= dt;
  if (birdT <= 0) {
    birdT = rnd(7, 14);
    const side = Math.random() < 0.5 ? -1 : 1;
    flock(side * 40, rnd(12, 22), P.z - rnd(30, 70), -side * rnd(7, 10), rnd(-3, 1), 5 + Math.floor(rnd(0, 6)));
    if (state.mode === 'run' && Math.random() < 0.5) flock(pick([-5.5, 5.5]), 0.3, P.z - 45, 0, 0, 5, true);
  }
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    if (b.ground) {   // pigeons pecking on the pavement take off when you get close
      if (b.m.position.z - P.z > -22) { b.ground = false; b.vy = rnd(3, 5); b.vx = (b.m.position.x > 0 ? 1 : -1) * rnd(2, 4); b.vz = -rnd(2, 4); }
      else { b.m.rotation.x = Math.sin(state.t * 6 + b.ph) > 0.7 ? 0.5 : 0; if (b.m.position.z - P.z > 40) b.life = 0; else continue; }
    }
    b.life -= dt;
    b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
    if (b.pigeons) b.vy *= 0.995;
    b.m.rotation.set(0, Math.atan2(b.vx, b.vz), 0); b.ph += dt * (b.pigeons ? 22 : 11);
    // flapping: the wings fold in and out
    const base = b.pigeons ? 0.6 : 1.1; b.m.scale.set(base * (0.45 + Math.abs(Math.cos(b.ph)) * 0.55), base, base);
    b.m.position.y += Math.sin(b.ph) * dt * 0.5;
    if (b.life <= 0) { scene.remove(b.m); birds.splice(i, 1); }
  }
}

// ================= player =================
const P = { lane: 1, x: 0, z: 0, y: 0, vy: 0, jumps: 0, slideT: 0, speed: 0, dist: 0, coins: 0, score: 0, alive: false, prevLane: 1, laneT: 0, charge: 0, sprintT: 0, magnetT: 0, shield: false, chase: 0.7, bumpT: 0, mult: 1 };
let hero = null, heroDef = null, sel = 0;
const state = { mode: 'title', paused: false, t: 0, best: 0 };
try { state.best = +(localStorage.getItem('goualRunBest') || 0); } catch (e) { state.best = 0; }
function difficulty() { return clamp(P.dist / 2200, 0, 1); }
function laneX(l) { return LANES[l]; }
function move(dir) {
  if (!P.alive) return; const n = clamp(P.lane + dir, 0, 2); if (n === P.lane) { bump('the wall'); return; }
  P.prevLane = P.lane; P.lane = n; P.laneT = 0.22; audio.whoosh(); help(null);
}
function jump() {
  if (!P.alive) return;
  const max = heroDef.id === 'davi' ? 2 : 1;
  if (P.y <= 0.001 || P.jumps < max) { P.vy = P.jumps ? 9.2 : 10.6; P.jumps++; P.slideT = 0; audio.jump(); help(null); }
}
function slide() { if (!P.alive) return; P.slideT = 0.8; if (P.y > 0) P.vy = -16; audio.slide(); help(null); }
function useAbility() {
  if (!P.alive || P.charge < 1) return;
  P.charge = 0; audio.power();
  if (heroDef.id === 'cr7') { P.sprintT = 4; toast('SIUUU!'); }
  else if (heroDef.id === 'davi') { P.magnetT = 8; toast('GINGA!'); }
  else if (heroDef.id === 'kane') { for (const ob of obstacles) if (!ob.hit && ob.z < P.z + 1 && ob.z > P.z - 45) knock(ob); shake = 0.4; toast('STRIKE!'); }
  else { P.shield = true; toast('SHIELD!'); }
}
// Side bump: you stumble back to the previous lane. A second stumble soon after: you fall.
function bump(what) {
  if (P.sprintT > 0) return;
  audio.bump(); shake = 0.35;
  if (P.chase > 0.35) return caught(`You stumbled into ${what} twice and fell`);
  P.chase = 1; P.lane = P.prevLane; P.laneT = 0;
  toast('CAREFUL!', '#ff3d7f');
}
function crash(ob) {
  if (P.sprintT > 0) { knock(ob); return; }
  if (P.shield) { P.shield = false; knock(ob); toast('SAVED!', '#2ee6ff'); audio.bump(); P.chase = Math.max(P.chase, 0.6); return; }
  audio.crash(); shake = 0.7; caught(`You crashed into ${ob.label}`);
}
function knock(ob) { ob.hit = true; ob.knock = 1; audio.crash(); ob.kvx = (ob.x >= P.x ? 1 : -1) * 9; }

// ================= input =================
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (state.mode === 'run' && !state.paused) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') move(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') move(1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') { jump(); e.preventDefault(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') slide();
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') useAbility();
  }
  if (state.mode === 'select') { if (e.code === 'ArrowLeft' || e.code === 'KeyA') showSel(sel - 1); if (e.code === 'ArrowRight' || e.code === 'KeyD') showSel(sel + 1); if (e.code === 'Enter' || e.code === 'Space') $('#goBtn').click(); }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
// Swipes anywhere on the screen.
let sw = null;
addEventListener('pointerdown', e => { if (e.target.closest('button')) return; sw = { x: e.clientX, y: e.clientY, done: false, id: e.pointerId }; });
addEventListener('pointermove', e => {
  if (!sw || sw.done || e.pointerId !== sw.id || state.mode !== 'run' || state.paused) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y, th = Math.min(40, innerWidth * 0.06);
  if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
  sw.done = true;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else slide();
});
addEventListener('pointerup', () => { sw = null; });
$('#ability').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); useAbility(); });

// ================= HUD =================
let toastT = 0, shake = 0;
function toast(t, c) { const el = $('#toast'); el.textContent = t; el.style.color = c || ''; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
function help(t) { const el = $('#help'); if (!t) { el.style.opacity = 0; return; } el.innerHTML = t; el.style.opacity = 1; }
function hud() {
  $('#coinN').textContent = P.coins; $('#scoreN').textContent = Math.floor(P.score).toLocaleString('en'); $('#distN').textContent = Math.floor(P.dist) + ' m';
  $('#mult').textContent = P.mult > 1 ? `×${P.mult}` : '';
  const a = $('#ability'); a.style.setProperty('--p', P.charge); a.classList.toggle('ready', P.charge >= 1);
  const pw = $('#power');
  const txt = P.sprintT > 0 ? `⚡ SIUUU ${P.sprintT.toFixed(1)}` : P.magnetT > 0 ? `🧲 MAGNET ${P.magnetT.toFixed(1)}` : P.shield ? '🛡 SHIELD ON' : '';
  pw.classList.toggle('hidden', !txt); pw.textContent = txt;
  $('#danger').style.setProperty('--d', (P.chase * 0.55).toFixed(2));
}

// ================= camera =================
const cam = { pos: new V3(0, 4, 8), look: new V3(0, 1, -5) };
function updateCamera(dt) {
  const portrait = camera.aspect < 0.8;
  let pos, look;
  if (state.mode === 'run' || state.mode === 'over' || state.mode === 'count') {
    pos = new V3(P.x * 0.6, (portrait ? 3.9 : 3.0) + P.y * 0.4, P.z + (portrait ? 6.6 : 5.3));
    look = new V3(P.x * 0.75, 1.25 + P.y * 0.45, P.z - (portrait ? 6 : 7));
    if (state.mode === 'over') { pos = new V3(P.x + 3.6, 3.6, P.z + 6.5); look = new V3(P.x, 0.8, P.z); }
  } else if (state.mode === 'select') {
    const hx = selX(sel); pos = portrait ? new V3(hx, 1.0, 3.9) : new V3(hx + 1.15, 1.4, 2.6); look = portrait ? new V3(hx, -0.6, -0.7) : new V3(hx + 1.0, 1.0, -0.7);
  } else {   // title: slow drone over the street
    const t = state.t * 0.12; pos = new V3(Math.sin(t) * 7, 7 + Math.sin(t * 0.7) * 1.5, 10 + Math.cos(t) * 3); look = new V3(0, 2, -18);
  }
  const k = state.mode === 'run' ? 10 : 2.5;
  cam.pos.lerp(pos, 1 - Math.exp(-dt * k)); cam.look.lerp(look, 1 - Math.exp(-dt * k));
  camera.position.copy(cam.pos);
  if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.6; }
  camera.lookAt(cam.look);
  // Sun shadows follow the runner; the sky dome follows the camera.
  sun.target.position.set(0, 0, P.z - 8); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 50);
  clouds.position.set(camera.position.x, 0, camera.position.z);
}

// ================= main update =================
const tmpBox = new THREE.Box3();
function update(dt) {
  state.t += dt;
  if (state.paused) return;
  for (const s of segments) for (const ob of s.obs) if (ob.mixer && Math.abs(ob.z - P.z) < 120) ob.mixer.update(dt);
  if (state.mode === 'run' && P.alive) runStep(dt);
  else if (state.mode === 'select' || state.mode === 'title') {
    heroes.forEach((h, i) => { if (!h.root.visible) return; h.root.position.set(selX(i), 0, -1.2 + (state.mode === 'select' && i === sel ? 0.5 : 0)); h.root.rotation.y = 0; h.animate({ dt, speed: 0, grounded: true, action: state.mode === 'select' && i === sel ? 'talk' : null, actionT: state.t }); });
    if (state.mode === 'select') { cup.visible = true; const h = heroes[sel]; holdCup(h); }
  }
  if (state.mode === 'over') { overStep(dt); }
  if (state.mode === 'count' && hero) { hero.root.position.set(P.x, 0, P.z); hero.root.rotation.y = Math.PI; hero.animate({ dt, speed: 0, grounded: true }); holdCup(hero); }
  // Moving obstacles drive or run toward you; knocked ones fly away.
  for (const ob of obstacles) {
    if (ob.vz && !ob.hit && state.mode === 'run') { ob.z += ob.vz * dt; ob.obj.position.z = ob.z; }
    if (ob.knock) { ob.knock -= dt; ob.obj.position.x += ob.kvx * dt; ob.obj.position.y += dt * 4; ob.obj.rotation.z += dt * 6; if (ob.knock <= 0) ob.obj.visible = false; }
  }
  // Balls spin and bob.
  for (const c of coins) if (!c.got) { c.m.rotation.y += dt * 3; c.m.rotation.x += dt * 1.5; c.m.position.y = c.y + Math.sin(state.t * 4 + c.z) * 0.08; }
  updateChase(dt);
  updateCamera(dt);
  audio.update();
}
function holdCup(h, raised = true) {
  h.root.updateMatrixWorld(true);
  if (raised) {
    // The trophy held high in the right hand, like a captain at the final whistle.
    h.rot('rArm', X_AXIS, -2.75); h.rot('rFore', X_AXIS, -0.35);
    h.root.updateMatrixWorld(true);
    const r = h.bones.rHand.getWorldPosition(new V3());
    cup.position.copy(r); cup.position.y -= 0.07; cup.rotation.set(0, h.root.rotation.y, 0);
  } else {
    h.rot('lArm', X_AXIS, -0.75); h.rot('rArm', X_AXIS, -0.75); h.rot('lFore', X_AXIS, -1.15); h.rot('rFore', X_AXIS, -1.15);
    h.root.updateMatrixWorld(true);
    const l = h.bones.lHand.getWorldPosition(new V3()), r = h.bones.rHand.getWorldPosition(new V3());
    cup.position.copy(l).add(r).multiplyScalar(0.5); cup.position.y -= 0.1; cup.rotation.y = h.root.rotation.y;
  }
}
function runStep(dt) {
  const d = difficulty();
  P.speed = (13 + d * 13 + Math.min(P.dist, 6000) / 6000 * 3) * (P.sprintT > 0 ? 1.45 : 1);
  P.z -= P.speed * dt; P.dist += P.speed * dt;
  P.mult = 1 + Math.min(4, Math.floor(P.dist / 600));
  P.score += P.speed * dt * P.mult;
  P.x = damp(P.x, laneX(P.lane), 16, dt); P.laneT = Math.max(0, P.laneT - dt);
  P.vy -= 30 * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = 0; P.jumps = 0; }
  P.slideT = Math.max(0, P.slideT - dt);
  P.sprintT = Math.max(0, P.sprintT - dt); P.magnetT = Math.max(0, P.magnetT - dt);
  P.chase = Math.max(0, P.chase - dt * 0.11);
  // Stream the city.
  streamWorld(P.z);
  // Collisions: the runner is a box (shorter when sliding).
  const h = P.slideT > 0 ? 0.9 : 1.75;
  for (const ob of obstacles) {
    if (ob.hit || ob.z - ob.d / 2 > P.z + 0.5 || ob.z + ob.d / 2 < P.z - 0.5) continue;
    if (Math.abs(ob.x - P.x) > ob.w / 2 + 0.35) continue;
    const y0 = ob.low ?? 0;
    if (P.y > ob.h - 0.05 || P.y + h < y0) continue;
    // Coming in from the side while changing lanes: bump instead of a crash.
    if (P.laneT > 0 && Math.abs(ob.x - laneX(P.prevLane)) > 1 && Math.abs(P.x - ob.x) > 0.7) { bump(ob.label); }
    else crash(ob);
    ob.hit = ob.hit || P.alive; if (!P.alive) return;
  }
  // Balls (and the magnet).
  for (const c of coins) {
    if (c.got) continue;
    const dz = c.z - P.z; if (dz > 3 || dz < -30) continue;
    if (P.magnetT > 0 && dz < 0 && dz > -22) { c.m.position.x = damp(c.m.position.x, P.x, 8, dt); c.z = damp(c.z, P.z, 6, dt); c.m.position.z = c.z; c.y = damp(c.y, P.y + 1, 8, dt); }
    if (Math.abs(c.m.position.x - P.x) < 0.9 && Math.abs(c.z - P.z) < 0.9 && Math.abs(c.y - (P.y + 0.9)) < 1.3) {
      c.got = true; c.m.visible = false; c.gl.visible = false; P.coins++; P.score += 10 * P.mult; audio.coin(P.coins);
      P.charge = Math.min(1, P.charge + 1 / 30);
    }
  }
  // Runner pose.
  hero.root.position.set(P.x, P.y, P.z); hero.root.rotation.y = Math.PI + (laneX(P.lane) - P.x) * -0.12;
  hero.animate({ dt, speed: P.slideT > 0 ? 0 : 7.5, grounded: P.y <= 0.001, lean: P.sprintT > 0 ? 0.2 : 0.08 });
  if (P.slideT > 0) { hero.rot('lThigh', X_AXIS, -1.45); hero.rot('rThigh', X_AXIS, -1.1); hero.rot('lCalf', X_AXIS, 0.3); hero.rot('rCalf', X_AXIS, 0.9); hero.rot('spine', X_AXIS, -0.5); hero.model.position.y = (hero.baseY ?? 0) - 0.55; }
  holdCup(hero);
  // Footsteps.
  if (P.y <= 0 && P.slideT <= 0) { const ph = Math.floor(hero.phase / Math.PI); if (ph !== P.step) { P.step = ph; audio.step(); } }
  // Shield glow / sprint glow.
  heroGlow.visible = P.shield || P.sprintT > 0; heroGlow.position.set(P.x, P.y + 1, P.z); heroGlow.material.color.set(P.sprintT > 0 ? '#ffd400' : '#2ee6ff'); heroGlow.material.opacity = 0.1 + Math.sin(state.t * 10) * 0.04;
  hud();
}
const heroGlow = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: '#2ee6ff', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
heroGlow.visible = false; scene.add(heroGlow);
// The cops: one right behind when you stumble, the car further back. They fall back when you run clean.
function updateChase(dt) {
  // No police in the favela: the danger glow only shows how close you are to a fall after a stumble.
  audio.siren = 0;
  updateBirds(dt);
  // Rolling barrels spin, running dogs bounce.
  for (const ob of obstacles) {
    if (ob.obj.userData.spin && !ob.hit) ob.obj.userData.spin.rotation.x += dt * (ob.vz || 0) / 0.46;
    if (ob.name === 'dog' && ob.vz) { ob.obj.position.y = Math.abs(Math.sin(state.t * 14 + ob.z)) * 0.18; ob.obj.rotation.x = Math.sin(state.t * 14 + ob.z) * 0.12; }
  }
}

// ================= flow =================
function showTitle() {
  state.mode = 'title'; document.body.classList.add('menuing');
  heroes.forEach(h => { h.root.visible = true; }); cup.visible = false;
  $('#title').classList.remove('hidden'); $('#select').classList.add('hidden'); $('#over').classList.add('hidden'); $('#hud').classList.add('hidden');
  $('#bestT').textContent = state.best ? `BEST: ${Math.floor(state.best).toLocaleString('en')}` : '';
  P.z = 0; P.x = 0;
}
function showSel(i) {
  sel = (i + HEROES.length) % HEROES.length; const h = HEROES[sel];
  $('#sName').textContent = h.name; $('#sRole').textContent = h.role; $('#sAb').textContent = h.icon + ' ' + h.ability; $('#sAbTxt').textContent = h.txt;
  document.querySelectorAll('#select .dots i').forEach((d, k) => d.classList.toggle('on', k === sel)); audio.beep();
}
function toSelect() {
  state.mode = 'select'; $('#title').classList.add('hidden'); $('#over').classList.add('hidden'); $('#select').classList.remove('hidden'); $('#hud').classList.add('hidden');
  document.body.classList.add('menuing');
  P.z = 0; P.x = 0; resetWorld(); heroes.forEach(h => { h.root.visible = true; }); showSel(sel);
}
async function start() {
  heroDef = HEROES[sel]; hero = heroes[sel];
  heroes.forEach((h, i) => { h.root.visible = i === sel; });
  $('#select').classList.add('hidden'); $('#over').classList.add('hidden'); document.body.classList.remove('menuing');
  Object.assign(P, { lane: 1, prevLane: 1, x: 0, z: 0, y: 0, vy: 0, jumps: 0, slideT: 0, speed: 0, dist: 0, coins: 0, score: 0, alive: false, laneT: 0, charge: 0, sprintT: 0, magnetT: 0, shield: heroDef.id === 'ze', chase: 0.5, mult: 1 });
  resetWorld(); obstaclesClearNear();
  hero.root.position.set(0, 0, 0); hero.root.rotation.y = Math.PI; cup.visible = true; cup.userData.v = null;
  state.mode = 'count'; $('#hud').classList.remove('hidden'); hud();
  help(TOUCH ? 'Swipe ← → to change lane · swipe ↑ to jump · swipe ↓ to slide' : '← → change lane · ↑ / Space jump · ↓ slide · Shift ability');
  $('#abName').textContent = heroDef.short; $('#ability').querySelector('b').textContent = heroDef.icon;
  audio.playing = true;
  for (const n of ['3', '2', '1']) { $('#count').textContent = n; $('#count').classList.remove('hidden'); audio.beep(); await wait(0.65); }
  $('#count').textContent = 'GO!'; audio.go(); audio.whistle(); await wait(0.45); $('#count').classList.add('hidden');
  P.alive = true; state.mode = 'run';
  setTimeout(() => help(null), 5000);
}
function obstaclesClearNear() { for (const ob of obstacles) if (ob.z > -25) { ob.hit = true; ob.obj.visible = false; } }
const wait = s => new Promise(r => setTimeout(r, s * 1000));
let overT = 0;
function caught(why) {
  if (!P.alive) return;
  P.alive = false; state.mode = 'over'; overT = 0; audio.whistle(); P.chase = 1; heroGlow.visible = false;
  $('#why').textContent = why;
  const rec = P.score > state.best; if (rec) { state.best = P.score; try { localStorage.setItem('goualRunBest', String(Math.floor(P.score))); } catch (e) { } }
  $('#oScore').textContent = Math.floor(P.score).toLocaleString('en'); $('#oDist').textContent = Math.floor(P.dist) + ' m'; $('#oCoins').textContent = P.coins; $('#oBest').textContent = Math.floor(state.best).toLocaleString('en');
  $('#oRec').textContent = rec ? 'NEW RECORD!' : '';
  setTimeout(() => { if (state.mode === 'over') { $('#over').classList.remove('hidden'); $('#hud').classList.add('hidden'); document.body.classList.add('menuing'); audio.playing = false; } }, 1600);
  post('score', { score: Math.floor(P.score) });
}
function overStep(dt) {
  overT += dt;
  // Tripped and down; the Ballon d'Or rolls away on the street.
  hero.root.position.set(P.x, 0, P.z);
  hero.animate({ dt, speed: 0, grounded: true, action: 'sit', actionT: overT });
  hero.root.rotation.y = Math.PI; hero.model.position.y = (hero.baseY ?? 0) - 0.5;
  if (!cup.userData.v) { cup.userData.v = new V3((P.x > 0 ? -1 : 1) * 1.6, 3.2, -2.4); }
  const v = cup.userData.v; v.y -= 12 * dt; cup.position.addScaledVector(v, dt);
  if (cup.position.y < 0) { cup.position.y = 0; v.y = Math.abs(v.y) * 0.45; v.x *= 0.8; v.z *= 0.8; }
  cup.rotation.z += v.x * dt * -2; cup.rotation.x += v.z * dt * 2;
}

// ================= menus =================
function togglePause(force) {
  if (state.mode !== 'run') return;
  state.paused = force ?? !state.paused;
  toast(state.paused ? 'PAUSED' : 'GO!'); if (state.paused) audio.ctx?.suspend(); else audio.ctx?.resume();
}
$('#pauseBtn').onclick = () => togglePause();
$('#playBtn').onclick = () => { audio.init(); toSelect(); };
$('#prevBtn').onclick = () => showSel(sel - 1); $('#nextBtn').onclick = () => showSel(sel + 1);
$('#goBtn').onclick = () => { audio.init(); start(); };
$('#againBtn').onclick = () => start();
$('#changeBtn').onclick = () => { audio.playing = false; toSelect(); };
$('#soundBtn').onclick = () => { audio.init(); audio.setOn(!audio.on); $('#soundBtn').textContent = 'Sound: ' + (audio.on ? 'on' : 'off'); };
function post(action, data) { try { window.parent.postMessage({ type: 'goual-arcade', game: 'run', action, ...data }, '*'); } catch (e) { } }
function close() { audio.ctx?.suspend(); if (EMBED) post('close'); else location.href = '../?arcade=run'; }
$('#tourBtn').onclick = () => close(); $('#closeBtn').onclick = () => close();
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

// ================= go =================
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (!window.__hold) update(dt);
  composer ? composer.render() : renderer.render(scene, camera);
}
resetWorld(); showTitle();
$('#loading').classList.add('hidden');
frame(); post('ready');
try { audio.init(); } catch (e) { }
const wake = () => { audio.init(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
addEventListener('pointerdown', wake); addEventListener('keydown', wake);
// Test hooks.
window.__run = { cup, P, state, obstacles, coins, segments, scene, camera, renderer, start, toSelect, showSel, move, jump, slide, useAbility, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) update(dt); }, setSel: i => { sel = i; } };
