// GOUAL RUN — World Cup Run. An endless runner through a sunny city: you carry the World Cup,
// switch lanes, jump and slide past cars, barriers, police tape, cops and rival players,
// collect footballs and keep the police behind you. City, cars and mini characters: Kenney (CC0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Character, dress } from '../street/rig.js?v=3';
import { audio } from './audio.js?v=1';

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
const renderer = new THREE.WebGLRenderer({ canvas: $('#game'), antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 1.75));
if (params.has('test')) renderer.setPixelRatio(0.5);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#9fd8ff');
scene.fog = new THREE.Fog(SKY, 70, 230);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);
function onResize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 72 : 60; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize); onResize();
scene.add(new THREE.HemisphereLight('#d9eeff', '#b39a72', 1.25));
const sun = new THREE.DirectionalLight('#ffe2b8', 2.9);
sun.castShadow = true; sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 26, bottom: -14, near: 1, far: 90 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
const SUN_DIR = new V3(0.55, 1, 0.35).normalize();
scene.add(sun, sun.target);
// Sky dome: soft gradient and painted clouds.
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#2f86e8'); gr.addColorStop(0.5, '#7cc4ff'); gr.addColorStop(0.62, '#bfe6ff'); gr.addColorStop(1, '#d9f0ff');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 26; i++) {
    const x = rnd(0, 1024), y = rnd(90, 250), s = rnd(30, 70);
    g.fillStyle = 'rgba(255,255,255,0.85)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + k * s * 0.45 - s, y + Math.sin(k * 2) * s * 0.18, s * rnd(0.5, 0.8), s * rnd(0.35, 0.5), 0, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false }));
  scene.add(sky); scene.userData.sky = sky;
}

// ================= assets =================
const manager = new THREE.LoadingManager();
manager.onProgress = (u, a, b) => { $('#loading .bar i').style.width = (a / b * 100) + '%'; };
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
const KIT = {
  city: ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n', 'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'detail-parasol-a', 'detail-parasol-b'],
  roads: ['road-straight', 'road-crossroad', 'light-square', 'construction-barrier', 'construction-cone', 'traffic-light', 'dumpster'],
  cars: ['police', 'taxi', 'sedan', 'van', 'suv', 'delivery', 'truck', 'hatchback-sports'],
  nature: ['tree_default', 'tree_oak', 'tree_detailed', 'plant_bush', 'plant_bushLarge', 'flower_redA', 'flower_yellowA'],
  chars: ['character-male-a', 'character-male-c', 'character-male-e', 'character-male-f', 'character-female-b'],
};
const T = {};   // name -> gltf
const jobs = [];
for (const [dir, names] of Object.entries(KIT)) for (const n of names) jobs.push(load(`assets/${dir}/${n}.glb`).then(g => { T[n] = g; }));
const [cr7Src, kidSrc, zeSrc] = await Promise.all([load('../street/models/cr7.glb'), load('../street/models/kid.glb'), load('../street/models/ze.glb'), ...jobs]).then(r => r.slice(0, 3).map(g => g.scene));
// Static clone with shadows; s = uniform scale.
function prop(name, s = 1, { cast = true } = {}) {
  const o = T[name].scene.clone(true); o.scale.setScalar(s);
  o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } });
  return o;
}
const S = { city: 11, road: 10, car: 1.6, char: 2.3, nat: 4.6 };
// Sunny facades: each building comes in a few warm tints (shared materials, cheap to draw).
const TINTS = ['#ffe3c2', '#ffd1b8', '#fff1a8', '#cdeeff', '#ffc9d9', '#d8f5c8', '#ffffff', '#f6d7ff'];
const tinted = {};
function building(name) {
  const k = Math.floor(Math.random() * TINTS.length), key = name + k;
  if (!tinted[key]) { const sc = T[name].scene.clone(true); const col = new THREE.Color(TINTS[k]); sc.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.copy(col); } }); tinted[key] = sc; }
  const o = tinted[key].clone(true); o.scale.setScalar(S.city); o.traverse(m => { if (m.isMesh) { m.receiveShadow = true; } }); return o;
}
// Size of each building once scaled (x = along the facade, z = depth).
const BSIZE = {};
for (const n of KIT.city) { const b = new THREE.Box3().setFromObject(T[n].scene); BSIZE[n] = b.getSize(new V3()).multiplyScalar(S.city); }

// ================= the World Cup trophy (made in code) =================
function makeCup() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#e7b53d', metalness: 1, roughness: 0.25, emissive: '#3a2600', emissiveIntensity: 0.4 });
  const green = new THREE.MeshStandardMaterial({ color: '#0b7a4b', metalness: 0.3, roughness: 0.35 });
  const prof = [[0, 0], [0.07, 0], [0.075, 0.02], [0.07, 0.045], [0.072, 0.07], [0.068, 0.095], [0.045, 0.12], [0.035, 0.2], [0.05, 0.26], [0.075, 0.3], [0.0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), gold); g.add(body);
  for (const y of [0.032, 0.068]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.073, 0.009, 8, 24), green); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.068, 20, 14), gold); globe.position.y = 0.34; g.add(globe);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.scale.setScalar(1.7);
  return g;
}

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
];
const heroes = HEROES.map(h => { const c = h.make(); scene.add(c.root); c.root.visible = false; return c; });
const cup = makeCup(); scene.add(cup);

// ================= animated mini characters (cops, rivals) =================
function miniChar(name, clip = 'sprint', s = S.char) {
  const g = T[name], root = SkeletonUtils.clone(g.scene); root.scale.setScalar(s);
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(root), clips = {};
  for (const c of g.animations) clips[c.name] = c;
  const play = (n, fade = 0.15) => { const a = mixer.clipAction(clips[n] || clips.idle); if (root.userData.cur === a) return; a.reset().fadeIn(fade).play(); root.userData.cur?.fadeOut(fade); root.userData.cur = a; };
  play(clip, 0);
  return { root, mixer, play };
}
// The cop chasing you, and a police car behind him.
const chaser = miniChar('character-male-c'); scene.add(chaser.root);
const chaser2 = miniChar('character-male-c'); scene.add(chaser2.root);
const chaseCar = prop('police', S.car); scene.add(chaseCar);
const beacons = [];
for (const [x, c] of [[-0.25, '#ff2244'], [0.25, '#2266ff']]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, 1.62, -0.1); chaseCar.add(m); beacons.push(m); }

// ================= the street =================
const LANES = [-2.6, 0, 2.6], SEG = 20, ROAD_W = 10;
const world = new THREE.Group(); scene.add(world);
const segments = [];      // { z0, objs: [], obs: [], coins: [] }
const obstacles = [], coins = [];
let genZ = 30, sideCursor = { '-1': 30, '1': 30 }, segIndex = -2;
const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#c9c3b6', roughness: 0.9 });
const curbMat = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.8 });
const plazaMat = new THREE.MeshStandardMaterial({ color: '#a8b98a', roughness: 0.95 });
const sideGeo = new THREE.BoxGeometry(5.2, 0.18, SEG), curbGeo = new THREE.BoxGeometry(0.3, 0.22, SEG);
// Police tape (slide under it) and its texture.
const tapeTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#ffd400'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#111'; for (let x = -64; x < 512; x += 64) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 32, 64); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.fill(); } g.fillStyle = '#ffd400'; g.fillRect(70, 14, 372, 36); g.fillStyle = '#111'; g.font = '900 30px Arial Black, Arial'; g.textAlign = 'center'; g.fillText('POLICE LINE · DO NOT CROSS', 256, 43); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const tapeMat = new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.6 }), poleMat = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.5 });
// Footballs to collect.
const ballTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#141414'; for (let i = 0; i < 12; i++) { const x = (i % 6) * 44 + (i > 5 ? 22 : 0), y = i > 5 ? 88 : 36; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13); } g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const coinGeo = new THREE.SphereGeometry(0.33, 16, 12), coinMat = new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.12 });
const glowMat = new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
const glowGeo = new THREE.CircleGeometry(0.55, 20);

function addObj(seg, o) { world.add(o); seg.objs.push(o); return o; }
function buildSegment() {
  segIndex++;
  const z0 = genZ, seg = { z0, z1: z0 - SEG, objs: [], obs: [], coins: [] };
  const cross = segIndex > 3 && segIndex % 9 === 0;
  // Road tiles (10 m each) and sidewalks.
  for (let k = 0; k < 2; k++) { const r = addObj(seg, prop(cross && k === 0 ? 'road-crossroad' : 'road-straight', S.road, { cast: false })); r.position.set(0, 0, z0 - 5 - k * 10); r.rotation.y = Math.PI / 2; }
  for (const s of [-1, 1]) {
    const sw = addObj(seg, new THREE.Mesh(sideGeo, cross ? plazaMat : sidewalkMat)); sw.position.set(s * (ROAD_W / 2 + 2.6), 0.09, z0 - SEG / 2); sw.receiveShadow = true;
    const cb = addObj(seg, new THREE.Mesh(curbGeo, curbMat)); cb.position.set(s * (ROAD_W / 2 + 0.15), 0.11, z0 - SEG / 2); cb.receiveShadow = true;
    // Street lamp leaning over the road, and a tree.
    const lamp = addObj(seg, prop('light-square', S.road)); lamp.position.set(s * (ROAD_W / 2 + 0.5), 0.15, z0 - (s > 0 ? 4 : 14)); lamp.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    const tree = addObj(seg, prop(pick(['tree_default', 'tree_oak', 'tree_detailed']), S.nat * rnd(0.85, 1.15))); tree.position.set(s * (ROAD_W / 2 + 2.6), 0.15, z0 - (s > 0 ? 13 : 3) + rnd(-1, 1)); tree.rotation.y = rnd(0, 6);
    if (Math.random() < 0.6) { const b = addObj(seg, prop(pick(['plant_bush', 'plant_bushLarge', 'flower_redA', 'flower_yellowA']), S.nat)); b.position.set(s * (ROAD_W / 2 + rnd(1.4, 4.2)), 0.15, z0 - rnd(2, 18)); }
    if (Math.random() < 0.18) { const p = addObj(seg, prop(pick(['detail-parasol-a', 'detail-parasol-b']), S.city * 0.6)); p.position.set(s * (ROAD_W / 2 + 3.6), 0.15, z0 - rnd(5, 15)); }
  }
  if (cross) for (const s of [-1, 1]) { const tl = addObj(seg, prop('traffic-light', S.road)); tl.position.set(s * (ROAD_W / 2 + 0.4), 0.15, z0 - 0.5); tl.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; }
  // Buildings along both sides, facing the street (skipped at crossroads).
  for (const s of [-1, 1]) {
    const key = String(s);
    while (sideCursor[key] > z0 - SEG) {
      if (cross && sideCursor[key] <= z0 && sideCursor[key] > z0 - 10) { sideCursor[key] = z0 - 10.5; continue; }
      const n = pick(KIT.city.filter(n => n.startsWith('building-') && !n.includes('skyscraper'))), size = BSIZE[n];
      const b = addObj(seg, building(n));
      const w = size.x, d = size.z;
      b.position.set(s * (ROAD_W / 2 + 5.4 + d / 2), 0.15, sideCursor[key] - w / 2);
      b.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      sideCursor[key] -= w + rnd(0.3, 1.5);
    }
    // Skyline behind.
    if (Math.random() < 0.7) { const sk = addObj(seg, prop(pick(['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c']), S.city * rnd(1, 1.3), { cast: false })); sk.position.set(s * rnd(34, 48), 0, z0 - rnd(0, SEG)); }
  }
  if (segIndex > 2) spawnRow(seg);
  segments.push(seg); genZ -= SEG;
}
// ---- obstacles and balls ----
function obstacle(seg, kind, lane, z, o) {
  const ob = { kind, lane, x: LANES[lane], z, vz: 0, hit: false, ...o };
  ob.obj.position.set(ob.x, ob.y0 || 0, z); world.add(ob.obj); seg.obs.push(ob); obstacles.push(ob); return ob;
}
const CARS = ['taxi', 'sedan', 'van', 'suv', 'hatchback-sports'];
function car(seg, lane, z, name = pick(CARS), moving = false) {
  const o = prop(name, S.car); o.position.y = 0.48; o.rotation.y = moving || Math.random() < 0.5 ? 0 : Math.PI;
  if (moving) { o.rotation.y = 0; const hl = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: '#fff7d0' })); hl.position.set(0, 0.55 / S.car, 1.53); o.add(hl); }
  const big = name === 'delivery' || name === 'truck';
  return obstacle(seg, 'block', lane, z, { obj: o, w: 2.2, h: big ? 3.8 : 2.2, d: 4.6, vz: moving ? rnd(7, 10) : 0, label: 'a car' });
}
function barrier(seg, lane, z) {
  const o = prop('construction-barrier', S.road); o.rotation.y = Math.PI / 2;
  return obstacle(seg, 'jump', lane, z, { obj: o, w: 2.2, h: 1.25, d: 1.0, label: 'a barrier' });
}
function tape(seg, lane, z) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.42, 0.06), tapeMat); t.position.y = 1.5; t.castShadow = true; g.add(t);
  for (const x of [-1.25, 1.25]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.75, 8), poleMat); p.position.set(x, 0.87, 0); p.castShadow = true; g.add(p); const c = prop('construction-cone', S.road * 1.4); c.position.set(x, 0, 0.3); g.add(c); }
  return obstacle(seg, 'slide', lane, z, { obj: g, w: 2.4, h: 1.95, d: 0.6, low: 1.15, label: 'the police tape' });
}
function person(seg, lane, z, cop, running) {
  const m = miniChar(cop ? 'character-male-c' : pick(['character-male-a', 'character-male-e', 'character-male-f', 'character-female-b']), running ? 'sprint' : (cop ? 'holding-both' : 'idle'));
  m.root.rotation.y = 0;   // facing the player (+z)
  const ob = obstacle(seg, 'block', lane, z, { obj: m.root, mixer: m.mixer, w: 1.1, h: 1.7, d: 0.9, vz: running ? rnd(4.5, 6.5) : 0, label: cop ? 'a cop' : 'a rival player', person: true, play: m.play });
  return ob;
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
function spawnRow(seg) {
  const d = difficulty(), z = seg.z0 - rnd(6, 14);
  // Fewer rows at the start.
  if (Math.random() > 0.55 + d * 0.45) { coinLine(seg, Math.floor(rnd(0, 3)), seg.z0 - 4, 6); return; }
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5), free = lanes[0];
  const r = Math.random();
  if (r < 0.22) { car(seg, lanes[1], z); if (Math.random() < d) car(seg, lanes[2], z - rnd(0, 6)); coinLine(seg, free, z + 6, 6); }
  else if (r < 0.38) { for (const l of [0, 1, 2]) barrier(seg, l, z); coinLine(seg, free, z + 5.5, 5, 1.6); }
  else if (r < 0.52) { tape(seg, lanes[1], z); car(seg, lanes[2], z, pick(CARS)); if (Math.random() < 0.5) tape(seg, free, z); else coinLine(seg, free, z + 6, 6); }
  else if (r < 0.66) { person(seg, lanes[1], z, true, false); if (Math.random() < 0.6) person(seg, lanes[2], z - 3, true, false); coinLine(seg, free, z + 6, 6); car(seg, lanes[2], z - 12, 'police'); }
  else if (r < 0.80) { person(seg, lanes[1], z - 6, false, true); if (d > 0.35) person(seg, lanes[2], z - 14, false, true); coinLine(seg, free, z + 6, 6); }
  else if (r < 0.92) { car(seg, lanes[1], z - 10, pick(['taxi', 'sedan', 'van', 'delivery']), true); barrier(seg, lanes[2], z); coinLine(seg, free, z + 6, 6); }
  else { car(seg, lanes[1], z, pick(['delivery', 'truck'])); barrier(seg, free, z + 2); coinLine(seg, free, z + 4, 4, 1.6); }
}
function dropSegment(seg) {
  for (const o of seg.objs) world.remove(o);
  for (const ob of seg.obs) { world.remove(ob.obj); const i = obstacles.indexOf(ob); if (i >= 0) obstacles.splice(i, 1); }
  for (const c of seg.coins) { world.remove(c.m); world.remove(c.gl); const i = coins.indexOf(c); if (i >= 0) coins.splice(i, 1); }
}
function resetWorld() {
  while (segments.length) dropSegment(segments.shift());
  genZ = 30; sideCursor = { '-1': 30, '1': 30 }; segIndex = -2;
  for (let i = 0; i < 13; i++) buildSegment();
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
  else { P.shield = true; toast('SHIELD!'); }
}
// Side bump: back to the previous lane, the police get closer. A second bump soon after: caught.
function bump(what) {
  if (P.sprintT > 0) return;
  audio.bump(); shake = 0.35;
  if (P.chase > 0.35) return caught(`You ran into ${what} — the police caught you`);
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
    const hx = LANES[sel]; pos = portrait ? new V3(hx, 1.0, 3.9) : new V3(hx + 1.15, 1.4, 2.6); look = portrait ? new V3(hx, -0.6, -0.7) : new V3(hx + 1.0, 1.0, -0.7);
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
  scene.userData.sky.position.set(camera.position.x, 0, camera.position.z);
}

// ================= main update =================
const tmpBox = new THREE.Box3();
function update(dt) {
  state.t += dt;
  if (state.paused) return;
  for (const s of segments) for (const ob of s.obs) if (ob.mixer && Math.abs(ob.z - P.z) < 120) ob.mixer.update(dt);
  chaser.mixer.update(dt); chaser2.mixer.update(dt);
  if (state.mode === 'run' && P.alive) runStep(dt);
  else if (state.mode === 'select' || state.mode === 'title') {
    heroes.forEach((h, i) => { if (!h.root.visible) return; h.root.position.set(LANES[i], 0, -1.2 + (state.mode === 'select' && i === sel ? 0.5 : 0)); h.root.rotation.y = 0; h.animate({ dt, speed: 0, grounded: true, action: state.mode === 'select' && i === sel ? 'talk' : null, actionT: state.t }); });
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
    cup.position.copy(r); cup.position.y += 0.02; cup.rotation.set(0, h.root.rotation.y, 0);
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
  while (genZ > P.z - 240) buildSegment();
  while (segments.length && segments[0].z1 > P.z + 30) dropSegment(segments.shift());
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
  const active = state.mode === 'run' || state.mode === 'count' || state.mode === 'over';
  chaser.root.visible = chaser2.root.visible = chaseCar.visible = active;
  if (!active) { audio.siren = 0; return; }
  const gap = state.mode === 'over' ? 1.4 : lerp(13, 1.9, P.chase);
  const cz = P.z + gap;
  const side = P.x > 0 ? -1.5 : 1.5;   // a little to the side, so he never hides the runner
  chaser.root.position.set(damp(chaser.root.position.x, P.x + (state.mode === 'over' ? 0.9 : side), 6, dt), 0, damp(chaser.root.position.z, cz, 8, dt));
  chaser.root.rotation.y = Math.PI;
  chaser2.root.position.set(damp(chaser2.root.position.x, P.x - 1.2, 3, dt), 0, damp(chaser2.root.position.z, cz + 3, 6, dt)); chaser2.root.rotation.y = Math.PI;
  chaser.play(state.mode === 'over' ? 'holding-both' : 'sprint'); chaser2.play(state.mode === 'over' ? 'idle' : 'sprint');
  chaseCar.position.set(-2.6, 0.48, damp(chaseCar.position.z, P.z + gap + 12, 4, dt)); chaseCar.rotation.y = Math.PI;
  const on = Math.floor(state.t * 6) % 2; beacons[0].material.color.set(on ? '#ff2244' : '#330008'); beacons[1].material.color.set(on ? '#110022' : '#2266ff');
  audio.siren = state.mode === 'run' ? 0.25 + P.chase * 0.75 : 0;
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
  chaser.root.position.set(0, 0, 8); chaser2.root.position.set(-1, 0, 11); chaseCar.position.set(-2.6, 0.48, 22);
  hero.root.position.set(0, 0, 0); hero.root.rotation.y = Math.PI; cup.visible = true;
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
  // Tripped and down; the cop grabs the cup.
  hero.root.position.set(P.x, 0, P.z);
  hero.animate({ dt, speed: 0, grounded: true, action: 'sit', actionT: overT });
  hero.root.rotation.y = Math.PI; hero.model.position.y = (hero.baseY ?? 0) - 0.5;
  cup.position.lerp(new V3(chaser.root.position.x, 2.3, chaser.root.position.z), 1 - Math.exp(-dt * 3));
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
  if (window.__hold) { renderer.render(scene, camera); return; }
  update(dt); renderer.render(scene, camera);
}
resetWorld(); showTitle();
$('#loading').classList.add('hidden');
frame(); post('ready');
try { audio.init(); } catch (e) { }
const wake = () => { audio.init(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
addEventListener('pointerdown', wake); addEventListener('keydown', wake);
// Test hooks.
window.__run = { P, state, obstacles, coins, segments, scene, camera, renderer, start, toSelect, showSel, move, jump, slide, useAbility, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) update(dt); }, setSel: i => { sel = i; } };
