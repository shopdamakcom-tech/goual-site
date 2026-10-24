// Decor lab for GOUAL RUN: three candidate settings rendered around a still runner,
// so the look can be chosen before the game is rebuilt. ?decor=city|rio|stadium
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Character } from '../street/rig.js?v=3';

const V3 = THREE.Vector3;
const params = new URLSearchParams(location.search);
const DECOR = params.get('decor') || 'city';
// Seeded random so every capture of a decor looks the same.
let seed = 7; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rnd = (a, b) => a + R() * (b - a), pick = a => a[Math.floor(R() * a.length)];

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(innerWidth / innerHeight < 0.8 ? 72 : 58, innerWidth / innerHeight, 0.1, 900);
camera.position.set(0, 5.4, 10.5); camera.lookAt(0, 2.2, -16);

// ---------- assets ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
const CITY = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H', 'road_straight', 'road_straight_crossing', 'base', 'streetlight', 'bench', 'bush', 'firehydrant', 'dumpster', 'trash_A', 'box_A', 'trafficlight_A', 'watertower', 'car_taxi', 'car_sedan', 'car_police', 'car_hatchback', 'car_stationwagon'];
const FOREST = ['Tree_1_A_Color1', 'Tree_2_A_Color1', 'Tree_3_A_Color1', 'Tree_4_A_Color1', 'Tree_2_C_Color1', 'Bush_1_A_Color1', 'Bush_2_A_Color1', 'Bush_4_A_Color1', 'Grass_1_A_Color1', 'Grass_2_A_Color1', 'Rock_1_A_Color1', 'Rock_3_A_Color1'];
const CHARS = ['character-male-a', 'character-male-e', 'character-male-f', 'character-female-b'];
const T = {};
await Promise.all([
  ...CITY.map(n => load(`assets/kk/city/${n}.glb`).then(g => (T[n] = g))),
  ...FOREST.map(n => load(`assets/kk/forest/${n}.glb`).then(g => (T[n] = g))),
  ...CHARS.map(n => load(`assets/chars/${n}.glb`).then(g => (T[n] = g))),
  load('assets/city/detail-parasol-a.glb').then(g => (T.parasol = g)),
  load('../street/models/cr7.glb').then(g => (T.cr7 = g)),
  load('assets/world-cup.glb').then(g => (T.cup = g)),
]);
const K = 4.6;   // KayKit city pieces are 2 units per tile: 9.2 m streets.
function prop(name, s = K, tint) {
  const o = T[name].scene.clone(true); o.scale.setScalar(s);
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (tint) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(tint)); } } });
  scene.add(o); return o;
}
function mini(name, clip, s = 2.3, t = 0) {
  const g = T[name], root = SkeletonUtils.clone(g.scene); root.scale.setScalar(s);
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(root); const c = g.animations.find(a => a.name === clip) || g.animations[0];
  const a = mixer.clipAction(c); a.play(); mixer.setTime(t);
  scene.add(root); return root;
}
const tex = (c, rep = 1) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

// ---------- painted pieces ----------
// Sky dome: gradient plus soft, shaded cumulus painted with many overlapping puffs.
function paintSky({ top, mid, horizon, glow, clouds = 14, cloudLit = '#ffffff', cloudShade = '#c8d6ee', cloudY = [300, 470], stars = 0 }) {
  const [c, g] = canvas(4096, 2048); g.scale(1, 2);
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(0.6, mid); gr.addColorStop(1, horizon);
  g.fillStyle = gr; g.fillRect(0, 0, 4096, 1024);
  g.fillStyle = horizon; g.fillRect(0, 512, 4096, 512);
  for (let i = 0; i < stars; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.2, 0.8)})`; g.fillRect(rnd(0, 4096), rnd(0, 300), 2, 2); }
  if (glow) { // sun glow straight ahead (the -z direction is u = 0.25 on the dome)
    for (const x of [1024]) { const rg = g.createRadialGradient(x, 470, 10, x, 470, 700); rg.addColorStop(0, glow); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 4096, 1024); }
  }
  for (let i = 0; i < clouds; i++) {
    const cx = rnd(0, 4096), cy = rnd(cloudY[0], cloudY[1]), w = rnd(90, 200) * (0.5 + (cy - 250) / 300), h = w * rnd(0.22, 0.32);
    const puffs = [];
    for (let k = 0; k < 26; k++) { const a = R(); puffs.push([cx + (a - 0.5) * w * 1.6, cy - Math.sin(a * Math.PI) * h * rnd(0.3, 1), rnd(0.18, 0.42) * w * (1 - Math.abs(a - 0.5))]); }
    // shade pass, then lit pass shifted up: reads as soft volume
    for (const [x, y, r] of puffs) { g.fillStyle = cloudShade; g.beginPath(); g.ellipse(x, y + r * 0.1, r, r * 0.5, 0, 0, 7); g.fill(); }
    for (const [x, y, r] of puffs) { const rg = g.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r); rg.addColorStop(0, cloudLit); rg.addColorStop(0.7, cloudLit); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(x, y - r * 0.08, r * 0.9, r * 0.45, 0, 0, 7); g.fill(); }
  }
  const t = tex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, toneMapped: false }));
  scene.add(m);
}
// Distant backdrop: a painted band on a big cylinder (skyline, hills, mountains, stadium glow).
function backdrop(draw, { r = 520, h = 190, y = -8 } = {}) {
  const [c, g] = canvas(8192, 1024); draw(g, 8192, 1024);
  const t = tex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 96, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false, toneMapped: false }));
  m.position.y = y + h / 2; m.rotation.y = Math.PI; scene.add(m);
}
// Painterly ground: base colour with thousands of short strokes in nearby shades.
function paintGround(base, shades, { n = 9000, len = [2, 7], w = 2, size = 512 } = {}) {
  const [c, g] = canvas(size, size); g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) { g.fillStyle = pick(shades) + '22'; g.beginPath(); g.ellipse(rnd(0, size), rnd(0, size), rnd(30, 90), rnd(20, 60), rnd(0, 3), 0, 7); g.fill(); }
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const x = rnd(0, size), y = rnd(0, size), l = rnd(len[0], len[1]); g.strokeStyle = pick(shades); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-1.5, 1.5), y - l); g.stroke(); }
  return c;
}
// Two strips either side of the road (the asphalt sits a little below the pavements).
function ground(c, rep, { w = 400, d = 700, gap = K, y = 0.0, color = '#fff' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: tex(c, 1), color, roughness: 1 }); mat.map.repeat.set(w / rep, d / rep);
  for (const side of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(side * (gap + w / 2), y, -d / 2 + 40); m.receiveShadow = true; scene.add(m); }
}
// Grass tufts: crossed cards with a painted blade texture, scattered in clumps.
let tuftMat;
function tufts(n, xr, zr, tint = '#7fbf4a') {
  if (!tuftMat) {
    const [c, g] = canvas(128, 128);
    for (let i = 0; i < 40; i++) { const x = rnd(10, 118), h = rnd(50, 120); g.strokeStyle = pick(['#5e9c34', '#7cb945', '#9ad35a', '#4f8a2c']); g.lineWidth = rnd(3, 6); g.lineCap = 'round'; g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + rnd(-8, 8), 128 - h * 0.6, x + rnd(-18, 18), 128 - h); g.stroke(); }
    tuftMat = new THREE.MeshStandardMaterial({ map: tex(c), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, color: tint });
  }
  const geo = new THREE.PlaneGeometry(1.1, 0.8); geo.translate(0, 0.4, 0);
  const im = new THREE.InstancedMesh(geo, tuftMat, n * 2); const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { const x = rnd(...xr), z = rnd(...zr), s = rnd(0.7, 1.5), r = rnd(0, 3);
    for (let k = 0; k < 2; k++) { o.position.set(x, 0, z); o.rotation.set(0, r + k * Math.PI / 2, 0); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(i * 2 + k, o.matrix); } }
  scene.add(im);
}
// Procedural palm: curved ringed trunk + drooping fronds with a painted leaf.
let palmLeaf;
function palm(x, z, h = rnd(9, 13), lean = rnd(-0.25, 0.25)) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); scene.add(grp);
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new V3(Math.sin(t * 1.2) * lean * h * 0.5, t * h, Math.sin(t * 1.4) * 0.3)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const [bc, bg] = canvas(64, 256); bg.fillStyle = '#8a6a48'; bg.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 10) { bg.fillStyle = '#5e452e'; bg.fillRect(0, y, 64, 3); bg.fillStyle = '#a88660'; bg.fillRect(0, y + 4, 64, 2); }
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.32, 8), new THREE.MeshStandardMaterial({ map: tex(bc), roughness: 1 }));
  trunk.material.map.repeat.set(1, 4); trunk.castShadow = true; grp.add(trunk);
  if (!palmLeaf) {
    const [c, g] = canvas(64, 512); g.strokeStyle = '#2f6b25'; g.lineWidth = 4; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 512); g.stroke();
    for (let y = 8; y < 504; y += 7) { const w = Math.sin((y / 512) * Math.PI) * 30 + 2; g.strokeStyle = pick(['#3f8a2e', '#4f9e35', '#5bb03c', '#367a28']); g.lineWidth = 5;
      g.beginPath(); g.moveTo(32, y); g.lineTo(32 - w, y + 14); g.stroke(); g.beginPath(); g.moveTo(32, y); g.lineTo(32 + w, y + 14); g.stroke(); }
    palmLeaf = new THREE.MeshStandardMaterial({ map: tex(c), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  }
  const top = curve.getPoint(1);
  for (let i = 0; i < 9; i++) {
    const L = rnd(4.2, 5.6), geo = new THREE.PlaneGeometry(1.4, L, 1, 10), p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) { const v = Math.max(0, (p.getY(k) + L / 2) / L); p.setY(k, v * L); p.setZ(k, -Math.pow(v, 1.8) * L * 0.55); p.setX(k, p.getX(k) * (1 - Math.abs(v - 0.45) * 0.8)); }
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(geo, palmLeaf); leaf.castShadow = true;
    const holder = new THREE.Group(); holder.position.copy(top); holder.rotation.y = (i / 9) * Math.PI * 2 + rnd(-0.2, 0.2);
    leaf.rotation.x = -rnd(0.9, 1.25); holder.add(leaf); grp.add(holder);
  }
  for (let i = 0; i < 4; i++) { const co = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#5a3d1e' })); co.position.copy(top).add(new V3(rnd(-0.3, 0.3), -0.25, rnd(-0.3, 0.3))); grp.add(co); }
}

// ---------- the runner: CR7 with the trophy raised ----------
function hero() {
  const ch = new Character(T.cr7.scene, { kind: 'valve', height: 1.87 });
  ch.model.traverse(o => { if (o.isMesh) { o.castShadow = true; const n = o.material.name; const col = { texture_6: '#c8102e', texture_7: '#0b6b3a', texture_8: '#c8102e' }[n]; if (col) { o.material = o.material.clone(); o.material.map = null; o.material.color.set(col); } } });
  scene.add(ch.root); ch.root.rotation.y = Math.PI;
  for (let i = 0; i < 40; i++) ch.animate({ dt: 1 / 60, speed: 11, grounded: true });
  ch.root.position.set(0, 0, 0);
  ch.rot('rArm', new V3(1, 0, 0), -2.75); ch.rot('rFore', new V3(1, 0, 0), -0.35); ch.root.updateMatrixWorld(true);
  const g = new THREE.Group(), m = T.cup.scene.clone(true);
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; const mt = o.material = o.material.clone(); mt.envMap = env; mt.envMapIntensity = 1.6; mt.metalness = 1; mt.roughness = Math.min(mt.roughness ?? 0.4, 0.32); mt.color.multiplyScalar(1.35); } });
  g.add(m); let b = new THREE.Box3().setFromObject(m), sz = b.getSize(new V3());
  if (sz.z > sz.y * 1.2) m.rotation.x = -Math.PI / 2; else if (sz.x > sz.y * 1.2) m.rotation.z = Math.PI / 2;
  g.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(m); sz = b.getSize(new V3());
  m.scale.multiplyScalar(0.62 / sz.y); g.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(m);
  const c = b.getCenter(new V3()); m.position.x -= c.x; m.position.z -= c.z; m.position.y -= b.min.y;
  g.position.copy(ch.bones.rHand.getWorldPosition(new V3())); g.position.y -= 0.07; scene.add(g);
}

// ---------- lights ----------
function lights({ sky, groundCol, hemi = 1.2, sunCol, sunI = 2.8, sunDir = [0.5, 1, 0.3], exposure = 1.1, fog }) {
  renderer.toneMappingExposure = exposure;
  scene.add(new THREE.HemisphereLight(sky, groundCol, hemi));
  const s = new THREE.DirectionalLight(sunCol, sunI); s.position.set(...sunDir).multiplyScalar(40); s.castShadow = true;
  s.shadow.mapSize.set(2048, 2048); Object.assign(s.shadow.camera, { left: -40, right: 40, top: 60, bottom: -40, near: 1, far: 140 });
  s.target.position.set(0, 0, -20); s.position.add(s.target.position); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.04;
  scene.add(s, s.target);
  scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
}

// ---------- the road (KayKit tiles along -z) ----------
let ROADY = -0.46;
function road(len = 26, crossEvery = 7) {
  const probe = prop('road_straight'); probe.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new V3(0, 10, 0), new V3(0, -1, 0)).intersectObject(probe, true)[0];
  ROADY = hit ? -hit.point.y : 0; scene.remove(probe);
  for (let i = -2; i < len; i++) { const t = prop(i % crossEvery === 3 ? 'road_straight_crossing' : 'road_straight'); t.position.set(0, ROADY, -i * 2 * K); }
}
const CAR_TINTS = ['#ffffff', '#ffd2d2', '#d2e6ff', '#fff2b3', '#d9ffd2'];

// ===================== 1. painted sunny city =====================
function city() {
  document.querySelector('#tag').textContent = '1 · VILLE PEINTE';
  lights({ sky: '#cfe8ff', groundCol: '#d8b98f', hemi: 1.25, sunCol: '#ffe0b0', sunI: 3.1, sunDir: [0.7, 1, 0.15], exposure: 1.12, fog: ['#f3e2c8', 60, 260] });
  paintSky({ top: '#3f8fe0', mid: '#8fcaf5', horizon: '#f6e6cc', glow: 'rgba(255,236,200,0.75)', clouds: 18, cloudShade: '#d5dcef' });
  backdrop((g, W, H) => {
    // two layers of soft skyline in aerial perspective + green hills
    for (const [col, top, bw] of [['#bcc9dc', 640, [40, 120]], ['#9fb1c9', 720, [30, 90]]]) {
      g.fillStyle = col; let x = 0; while (x < W) { const w = rnd(...bw), h = rnd(60, 280) * (top === 640 ? 1 : 0.6); g.fillRect(x, top + 220 - h - 120, w, h + 400); if (R() < 0.15) g.fillRect(x + w * 0.4, top - h - 100 + 100, 6, 60); x += w + rnd(0, 8); }
    }
    g.fillStyle = '#8fb07a'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 40) g.lineTo(x, 800 + Math.sin(x / 300) * 30 + Math.sin(x / 90) * 8); g.lineTo(W, H); g.fill();
    const fade = g.createLinearGradient(0, 400, 0, 1024); fade.addColorStop(0, 'rgba(246,230,204,0)'); fade.addColorStop(1, 'rgba(246,230,204,0.75)'); g.fillStyle = fade; g.fillRect(0, 0, W, H);
  });
  ground(paintGround('#8cc152', ['#7ab344', '#9fd05e', '#6fa63c', '#b3dc6f']), 12);
  road();
  // blocks of buildings on both sides, with a sidewalk base under each
  const B = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
  const FACADE = ['#ffffff', '#fff4e0', '#ffe9e9', '#eaf4ff', '#fff7d6', '#f1ffe9'];
  for (const side of [-1, 1]) for (let i = -1; i < 22; i++) {
    const z = -i * 2 * K;
    if (i % 7 === 3) { const b = prop('base'); b.position.set(side * 2 * K, ROADY, z); prop('Tree_1_A_Color1', 1.8).position.set(side * 2 * K, 0, z); tufts(30, [side * 2 * K - 4, side * 2 * K + 4], [z - 4, z + 4]); continue; }
    const b = prop(pick(B), K, pick(FACADE)); b.position.set(side * 2 * K, ROADY, z); b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const b2 = prop(pick(B), K, pick(FACADE)); b2.position.set(side * 4 * K, ROADY, z); b2.rotation.y = b.rotation.y;
  }
  // street furniture and greenery on the pavements
  for (const side of [-1, 1]) for (let i = 0; i < 20; i++) {
    const z = -i * 2 * K - 2, x = side * (K * 0.78);
    if (i % 2 === 0) { const l = prop('streetlight'); l.position.set(x, 0, z); l.rotation.y = side > 0 ? Math.PI : 0; }
    else { prop(pick(['Tree_2_A_Color1', 'Tree_4_A_Color1', 'Tree_3_A_Color1']), rnd(0.9, 1.1)).position.set(x, 0, z + 2); }
    if (R() < 0.4) prop(pick(['bench', 'firehydrant', 'trash_A', 'Bush_2_A_Color1'])).position.set(x - side * 0.2, 0, z - 3.5);
  }
  // traffic: parked cars and a taxi ahead in a lane
  for (let i = 0; i < 9; i++) { const c = prop(pick(['car_sedan', 'car_hatchback', 'car_stationwagon', 'car_taxi']), K, pick(CAR_TINTS)); c.position.set(pick([-1, 1]) * 3.3, 0.3, -18 - i * 14 - rnd(0, 6)); c.rotation.y = R() < 0.5 ? 0 : Math.PI; }
  const taxi = prop('car_taxi'); taxi.position.set(2.6, 0.3, -16); taxi.rotation.y = Math.PI;
  const cop = prop('car_police'); cop.position.set(-2.4, 0.3, 9);
  // people on the pavement
  for (let i = 0; i < 10; i++) { const p = mini(pick(CHARS), pick(['idle', 'walk', 'emote-yes']), 2.3, rnd(0, 2)); p.position.set(pick([-1, 1]) * rnd(5.6, 7), 0, -6 - i * 9); p.rotation.y = rnd(0, 6); }
}

// ===================== 2. Rio beach and hills =====================
function rio() {
  document.querySelector('#tag').textContent = '2 · RIO PLAGE & COLLINES';
  lights({ sky: '#bfe6ff', groundCol: '#f0d9a8', hemi: 1.3, sunCol: '#fff0cc', sunI: 3.2, sunDir: [-0.4, 1, 0.25], exposure: 1.1, fog: ['#d6ecf2', 80, 320] });
  paintSky({ top: '#1f7fe0', mid: '#6cc0f5', horizon: '#dff1f5', glow: 'rgba(255,248,220,0.6)', clouds: 12 });
  backdrop((g, W, H) => {
    const base = 860;
    // far mountains (blue), Sugarloaf on the left, Corcovado with the statue on the right
    const hill = (cx, w, h, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx - w, base + 40); g.bezierCurveTo(cx - w * 0.5, base - h * 0.2, cx - w * 0.35, base - h, cx, base - h); g.bezierCurveTo(cx + w * 0.35, base - h, cx + w * 0.5, base - h * 0.2, cx + w, base + 40); g.fill(); };
    for (let x = -200; x < W; x += 260) hill(x + rnd(0, 120), rnd(260, 420), rnd(120, 230), '#9dbfd6');
    for (const F of [0, W]) {   // the forward view is at the band's seam
    // Sugarloaf (dome)
    g.fillStyle = '#6f9a86'; g.beginPath(); g.moveTo(F - 1150, base + 40); g.bezierCurveTo(F - 1120, base - 330, F - 900, base - 420, F - 820, base - 330); g.bezierCurveTo(F - 760, base - 220, F - 700, base - 60, F - 640, base + 40); g.fill();
    g.fillStyle = '#86ad97'; g.beginPath(); g.moveTo(F - 1000, base + 40); g.bezierCurveTo(F - 980, base - 180, F - 860, base - 250, F - 800, base - 120); g.lineTo(F - 760, base + 40); g.fill();
    g.strokeStyle = 'rgba(60,60,60,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(F - 830, base - 360); g.lineTo(F - 560, base - 120); g.stroke();
    // Corcovado peak with Christ the Redeemer
    g.fillStyle = '#5f8f6c'; g.beginPath(); g.moveTo(F + 300, base + 40); g.bezierCurveTo(F + 500, base - 120, F + 640, base - 330, F + 700, base - 360); g.bezierCurveTo(F + 760, base - 330, F + 900, base - 140, F + 1200, base + 40); g.fill();
    g.fillStyle = '#eef3f2'; const cx = F + 700, cy = base - 362; g.fillRect(cx - 4, cy - 48, 8, 48); g.fillRect(cx - 30, cy - 40, 60, 6); g.beginPath(); g.arc(cx, cy - 53, 6, 0, 7); g.fill(); g.fillRect(cx - 7, cy - 8, 14, 10);
    }
    // sea on the horizon
    g.fillStyle = '#5fb3d8'; g.fillRect(0, base + 20, W, H);
    const fade = g.createLinearGradient(0, 400, 0, 1024); fade.addColorStop(0, 'rgba(223,241,245,0)'); fade.addColorStop(1, 'rgba(223,241,245,0.55)'); g.fillStyle = fade; g.fillRect(0, 0, W, H);
  }, { r: 520, h: 190, y: -6 });
  // sand, sea, grass hill
  ground(paintGround('#f1d9a6', ['#e8cc94', '#f7e4b8', '#e2c288', '#fbeccc'], { n: 6000, len: [1, 3], w: 2 }), 10);
  const [sc, sg] = canvas(512, 512); sg.fillStyle = '#2fa6cf'; sg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 500; i++) { sg.strokeStyle = pick(['#56c1df', '#1f8fbf', '#7fd6ea', '#ffffff55']); sg.lineWidth = rnd(1, 3); const x = rnd(0, 512), y = rnd(0, 512); sg.beginPath(); sg.moveTo(x, y); sg.quadraticCurveTo(x + 10, y - 3, x + rnd(15, 40), y); sg.stroke(); }
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 800), new THREE.MeshStandardMaterial({ map: tex(sc), roughness: 0.25, metalness: 0.1 }));
  sea.material.map.repeat.set(25, 40); sea.rotation.x = -Math.PI / 2; sea.position.set(-276, 0.05, -300); scene.add(sea);
  // white surf line
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(3, 800), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
  surf.rotation.x = -Math.PI / 2; surf.position.set(-26.5, 0.07, -300); scene.add(surf);
  // Copacabana wave pavement on the promenade
  const [pc, pg] = canvas(512, 512); pg.fillStyle = '#f7f4ec'; pg.fillRect(0, 0, 512, 512); pg.strokeStyle = '#1b1b1b'; pg.lineWidth = 34;
  for (let y = -64; y < 600; y += 128) { pg.beginPath(); for (let x = 0; x <= 512; x += 8) pg.lineTo(x, y + Math.sin(x / 512 * Math.PI * 2) * 40); pg.stroke(); }
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(5, 800), new THREE.MeshStandardMaterial({ map: tex(pc), roughness: 0.9 }));
  prom.material.map.repeat.set(1, 160); prom.rotation.x = -Math.PI / 2; prom.position.set(-7.2, 0.03, -300); prom.receiveShadow = true; scene.add(prom);
  road(26, 999);
  // beach: palms, parasols, people
  for (let i = 0; i < 26; i++) palm(rnd(-10.5, -9.5), 6 - i * 7.5 + rnd(-2, 2));
  for (let i = 0; i < 14; i++) { const p = T.parasol.scene.clone(true); p.scale.setScalar(5); p.position.set(rnd(-24, -13), 0, -4 - i * 11 + rnd(-3, 3)); p.traverse(m => { if (m.isMesh) m.castShadow = true; }); scene.add(p); }
  for (let i = 0; i < 12; i++) { const p = mini(pick(CHARS), pick(['idle', 'sit', 'emote-yes', 'walk']), 2.3, rnd(0, 2)); p.position.set(rnd(-22, -12), 0, -2 - i * 12); p.rotation.y = rnd(0, 6); }
  // inland: green hill with colourful houses stacked up the slope (favela vibe)
  const [hc, hg] = [paintGround('#5f9f45', ['#4d8a37', '#6db14f', '#3f7a2e', '#7fbf5a']), 0];
  const hAt = x => Math.max(0, x - 13) * 0.45;
  const hillGeo = new THREE.PlaneGeometry(200, 600, 80, 120); const hp = hillGeo.attributes.position;
  for (let k = 0; k < hp.count; k++) { const x = hp.getX(k) + 106.6, y = hp.getY(k); hp.setZ(k, hAt(x) + Math.sin(x / 9 + y / 13) * 0.5 * Math.min(1, Math.max(0, x - 14) / 10)); }
  hillGeo.computeVertexNormals();
  const hill = new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ map: tex(hc), roughness: 1 })); hill.material.map.repeat.set(20, 60);
  hill.rotation.x = -Math.PI / 2; hill.position.set(106.6, -0.1, -260); hill.receiveShadow = true; scene.add(hill);
  const VIVID = ['#ff6b6b', '#ffd23f', '#3bceac', '#4d9de0', '#ff9f1c', '#e15fed', '#ffffff', '#7ae582'];
  for (let i = 0; i < 70; i++) {
    const x = rnd(14, 60), z = rnd(-200, 6), b = prop(pick(['building_A', 'building_B', 'building_E', 'building_F']), rnd(2.4, 3.2), pick(VIVID));
    b.position.set(x, hAt(x - 2) - 0.2, z); b.rotation.y = -Math.PI / 2 + rnd(-0.2, 0.2);
  }
  for (let i = 0; i < 30; i++) { const x = rnd(9, 70); prop(pick(['Tree_1_A_Color1', 'Tree_3_A_Color1', 'Tree_2_C_Color1']), rnd(1.4, 2)).position.set(x, hAt(x) - 0.3, rnd(-200, 4)); }
  for (let i = 0; i < 16; i++) palm(rnd(7, 9), 4 - i * 12 + rnd(-3, 3));
  
  for (let i = 0; i < 6; i++) { const c = prop(pick(['car_taxi', 'car_sedan', 'car_hatchback']), K, pick(CAR_TINTS)); c.position.set(pick([-1, 1]) * 2.6, 0.3, -22 - i * 18); c.rotation.y = Math.PI; }
}

// ===================== 3. road to the stadium =====================
function stadium() {
  document.querySelector('#tag').textContent = '3 · ROUTE DU STADE';
  lights({ sky: '#ffc9b0', groundCol: '#5a4a6a', hemi: 1.1, sunCol: '#ffb070', sunI: 2.6, sunDir: [-0.6, 0.55, -0.9], exposure: 1.05, fog: ['#e89a8c', 70, 300] });
  paintSky({ top: '#2a1f5c', mid: '#b4518a', horizon: '#ffb37a', glow: 'rgba(255,190,110,0.85)', clouds: 10, cloudLit: '#ffd6b0', cloudShade: '#c27a98', cloudY: [330, 470], stars: 160 });
  backdrop((g, W, H) => {
    g.fillStyle = '#7c4f7d'; let x = 0; while (x < W) { const w = rnd(30, 90), h = rnd(40, 200); g.fillRect(x, 900 - h, w, h + 200); x += w + rnd(0, 10); }
    for (let i = 0; i < 900; i++) { g.fillStyle = pick(['#ffe2a8', '#ffd27a', '#ffffff']); g.fillRect(rnd(0, W), rnd(760, 900), 2, 3); }
    const fade = g.createLinearGradient(0, 600, 0, 1024); fade.addColorStop(0, 'rgba(232,154,140,0)'); fade.addColorStop(1, 'rgba(232,154,140,0.6)'); g.fillStyle = fade; g.fillRect(0, 0, W, H);
  });
  ground(paintGround('#6d8f4a', ['#5e7f3e', '#7da055', '#4f6f34', '#8bab60']), 12);
  road(40, 9);
  // the stadium at the end of the road: bowl, LED band, roof ring, floodlights
  const st = new THREE.Group(); st.position.set(0, 0, -260); scene.add(st);
  const [fc, fg] = canvas(2048, 256); fg.fillStyle = '#e9e4f2'; fg.fillRect(0, 0, 2048, 256);
  for (let x = 0; x < 2048; x += 32) { fg.fillStyle = '#9d92b8'; fg.fillRect(x, 70, 14, 186); }
  const led = fg.createLinearGradient(0, 0, 2048, 0); ['#3d8bff', '#ff2bd6', '#a24bff', '#3d8bff'].forEach((c, i) => led.addColorStop(i / 3, c)); fg.fillStyle = led; fg.fillRect(0, 20, 2048, 34);
  fg.fillStyle = '#ffffff'; fg.font = '900 28px system-ui'; for (let x = 40; x < 2048; x += 340) fg.fillText('GOUAL  ARENA', x, 48);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(78, 70, 34, 64, 1, true), new THREE.MeshStandardMaterial({ map: tex(fc), emissive: '#ffffff', emissiveMap: tex(fc), emissiveIntensity: 0.25, side: THREE.DoubleSide }));
  bowl.material.map.repeat.set(3, 1); bowl.material.emissiveMap.repeat.set(3, 1); bowl.position.y = 17; st.add(bowl);
  const roof = new THREE.Mesh(new THREE.TorusGeometry(80, 3, 8, 64), new THREE.MeshStandardMaterial({ color: '#f4f0ff', roughness: 0.5 })); roof.rotation.x = Math.PI / 2; roof.position.y = 36; st.add(roof);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(76, 48), new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 38; st.add(glow);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, tw = new THREE.Group(); tw.position.set(Math.cos(a) * 88, 0, Math.sin(a) * 88); st.add(tw);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 60, 8), new THREE.MeshStandardMaterial({ color: '#888' })); pole.position.y = 30; tw.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 1), new THREE.MeshBasicMaterial({ color: '#fffbe8' })); head.position.y = 62; head.lookAt(st.position.clone().setY(30).sub(tw.position)); tw.add(head);
  }
  // fireworks: additive sprites bursting above the stadium
  const dot = (() => { const [c, g] = canvas(64, 64); const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, '#fff'); rg.addColorStop(0.25, 'rgba(255,255,255,0.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  for (const [x, y, z, col] of [[-40, 95, -250, '#ff2bd6'], [35, 110, -270, '#3dd1ff'], [0, 125, -300, '#ffd23f'], [-75, 80, -230, '#a24bff'], [70, 88, -240, '#7dff8a']]) {
    const pos = []; for (let i = 0; i < 260; i++) { const d = new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(10, 18)); d.y -= (d.length() / 18) ** 2 * 3; pos.push(x + d.x, y + d.y, z + d.z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ map: dot, color: col, size: 3.4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  }
  // fans lining the road behind barriers, waving flags; bunting overhead
  const KITS = ['#c8102e', '#0b6b3a', '#fbe14a', '#1d3fa8', '#ffffff'];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) { const z = 6 - i * 4.5;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 4.3), new THREE.MeshStandardMaterial({ color: '#d8d8e0', metalness: 0.6, roughness: 0.4 })); bar.position.set(side * 5.5, 0.55, z); bar.castShadow = true; scene.add(bar);
      for (let k = 0; k < 2; k++) {
        const f = mini(pick(CHARS), pick(['emote-yes', 'jump', 'idle', 'holding-both']), 2.3, rnd(0, 1.5));
        f.position.set(side * rnd(6.4, 9), 0, z + rnd(-2, 2)); f.rotation.y = side > 0 ? -Math.PI / 2 + rnd(-0.6, 0.6) : Math.PI / 2 + rnd(-0.6, 0.6);
        if (R() < 0.35) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4), new THREE.MeshStandardMaterial({ color: '#333' })); pole.position.set(f.position.x, 2.6, f.position.z); scene.add(pole);
          const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 6, 1), new THREE.MeshStandardMaterial({ color: pick(KITS), side: THREE.DoubleSide })); const p = fl.geometry.attributes.position; for (let j = 0; j < p.count; j++) p.setZ(j, Math.sin(p.getX(j) * 3) * 0.12);
          fl.position.set(f.position.x, 3.4, f.position.z + 0.7); fl.rotation.y = Math.PI / 2; scene.add(fl); }
      }
    }
    for (let i = 0; i < 12; i++) { const l = prop('streetlight'); l.position.set(side * 10.5, 0, 2 - i * 12); l.rotation.y = side > 0 ? Math.PI : 0; }
    for (let i = 0; i < 14; i++) prop(pick(['Tree_1_A_Color1', 'Tree_3_A_Color1', 'Tree_4_A_Color1']), rnd(1.5, 2)).position.set(side * rnd(13, 22), 0, -i * 11 + rnd(-3, 3));
    tufts(160, side > 0 ? [10, 28] : [-28, -10], [-150, 8]);
  }
  for (let i = 0; i < 9; i++) { // bunting strings across the road
    const z = -6 - i * 14, n = 16, pos = [], col = [];
    for (let k = 0; k < n; k++) { const t = k / (n - 1), x = -10.5 + t * 21, y = 6.2 - Math.sin(t * Math.PI) * 1.4; const c = new THREE.Color(KITS[k % KITS.length]);
      pos.push(x - 0.35, y, z, x + 0.35, y, z, x, y - 0.8, z); for (let j = 0; j < 3; j++) col.push(c.r, c.g, c.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }
  // confetti in the air
  const cpos = [], ccol = []; for (let i = 0; i < 700; i++) { cpos.push(rnd(-12, 12), rnd(1, 12), rnd(-60, -3)); const c = new THREE.Color(pick(KITS.concat(['#ff2bd6', '#3d8bff']))); ccol.push(c.r, c.g, c.b); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
  scene.add(new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true })));
  const cop = prop('car_police'); cop.position.set(-2.4, 0.3, 9);
}

({ city, rio, stadium })[DECOR]();
hero();
renderer.render(scene, camera);
window.__ready = true;
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); });
