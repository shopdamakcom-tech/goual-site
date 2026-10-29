// STREET FOOT — The Ballon d'Or. A short third-person street football adventure in a Rio favela.
// You play Mbappé, Yamal or Kane: the Ballon d'Or has vanished. Cristiano Ronaldo is waiting at the
// favela's cage court and knows where it went: beat him in goal from the penalty spot (as many tries as
// it takes) and his driver takes you to the building where it is hidden. Episode 1; to be continued.
// Everything in English, with subtitles.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildWorld, buildBackdrop } from './world.js?v=3';
import { Character, dress } from './rig.js?v=4';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadFavela, makeSky, makeClouds } from './favela.js?v=3';
import { Builder, kitMaterials, dog, clutter, laundry } from './favela-kit.js';
import { audio } from './audio.js?v=3';

const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const params = new URLSearchParams(location.search);
const EMBED = params.has('embed') || window.parent !== window;
const TOUCH = matchMedia('(pointer: coarse)').matches || params.has('touch');

// ================= renderer, scene, light =================
const renderer = new THREE.WebGLRenderer({ canvas: $('#game'), antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.3 : 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = !params.has('test'); if (params.has('test')) renderer.setPixelRatio(0.35); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9dce6, 90, 1500);
const camera = new THREE.PerspectiveCamera(TOUCH ? 66 : 58, innerWidth / innerHeight, 0.1, 6000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const sunDir = new V3(-0.55, 0.42, 0.72).normalize();
scene.add(new THREE.HemisphereLight(0xbdd5f2, 0x8a6a4a, 1.15));
const sun = new THREE.DirectionalLight(0xffd6a6, 3.1);
sun.castShadow = true; sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

buildBackdrop(scene, sunDir, { painted: true });
const W = buildWorld(scene, { logoUrl: '../goual-art-brush-small.webp' });
const colliders = W.colliders;

// ================= collision queries (uniform grid of boxes) =================
const CELL = 6, grid = new Map();
const key = (ix, iz) => (ix + 500) * 2000 + (iz + 500);
function indexColliders() {
  grid.clear();
  for (const c of colliders) for (let ix = Math.floor(c.x0 / CELL); ix <= Math.floor(c.x1 / CELL); ix++) for (let iz = Math.floor(c.z0 / CELL); iz <= Math.floor(c.z1 / CELL); iz++) {
    const k = key(ix, iz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
  }
}
let stamp = 0; const nearBuf = [];
function near(x, z, r) {
  nearBuf.length = 0; stamp++;
  for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
    const l = grid.get(key(ix, iz)); if (l) for (const c of l) if (c._s !== stamp) { c._s = stamp; nearBuf.push(c); }
  }
  return nearBuf;
}
// Highest walkable top at (x,z) that is not above yMax.
function groundAt(x, z, yMax, r = 0) {
  let g = -50;
  for (const c of near(x, z, r + 0.1)) if (x >= c.x0 - r && x <= c.x1 + r && z >= c.z0 - r && z <= c.z1 + r && c.y1 <= yMax && c.y1 > g) g = c.y1;
  return g;
}
function inside(x, y, z, pad = 0) {
  for (const c of near(x, z, pad + 0.1)) if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad && y > c.y0 - pad && y < c.y1 + pad) return c;
  return null;
}
// Extra blockers: behind Zé's counter, so nobody walks into his kitchen.
colliders.push({ x0: -20.6, y0: 0, z0: 19.3, x1: -19.8, y1: 1.1, z1: 20.4 }, { x0: -20.6, y0: 0, z0: 25.6, x1: -19.8, y1: 1.1, z1: 26.7 });
indexColliders();

// ================= loading =================
const manager = new THREE.LoadingManager();
manager.onProgress = (u, a, b) => { const k = Math.round(a / b * 100); $('#loading .bar i').style.width = k + '%'; $('#loadPct').textContent = k + '%'; };
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));
const [art, cr7Src, kidSrc, zeSrc, triondaSrc, mbappeSrc, yamalSrc, kaneSrc, casaSrc] = await Promise.all([loadFavela(renderer, ['plate', 'band', 'clouds']), load('models/cr7.glb'), load('models/kid.glb'), load('models/ze.glb'), load('models/trionda.glb').catch(() => null), load('models/mbappe.glb'), load('models/yamal.glb'), load('models/kane.glb'), load('models/casa.glb').catch(() => null)]);

// ================= characters =================
// The three playable stars (models made by GOUAL ART with Meshy). `me` is the one you picked.
const HEROES = {
  mbappe: { id: 'mbappe', name: 'Mbappé', label: 'MBAPPÉ', color: '#4da3ff', ch: new Character(mbappeSrc, { kind: 'meshy', height: 1.78 }) },
  yamal: { id: 'yamal', name: 'Yamal', label: 'YAMAL', color: '#ff5a4a', ch: new Character(yamalSrc, { kind: 'meshy', height: 1.80 }) },
  kane: { id: 'kane', name: 'Kane', label: 'KANE', color: '#f2f2f2', ch: new Character(kaneSrc, { kind: 'meshy', height: 1.88 }) },
};
let hero = HEROES[params.get('hero')] || HEROES.mbappe, me = hero.ch;
for (const h of Object.values(HEROES)) { scene.add(h.ch.root); h.ch.root.visible = h === hero; }
function pickHero(id) { hero = HEROES[id] || hero; me = hero.ch; for (const h of Object.values(HEROES)) h.ch.root.visible = h === hero; }
// Cristiano waits in the cage court, juggling on the east half, by the goal he will defend.
const ronaldo = new Character(cr7Src, { kind: 'valve', height: 1.87 });
const CR7_HOME = new V3(8.2, 0, 13.2);
ronaldo.root.position.copy(CR7_HOME); ronaldo.root.rotation.y = -2.4; scene.add(ronaldo.root);
// Goalkeeper gloves, hidden until he goes in goal.
const gloves = (() => {
  const m = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.55 }), band = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.4 });
  const list = [];
  ronaldo.root.updateMatrixWorld(true);
  for (const side of ['lHand', 'rHand']) {
    const bone = ronaldo.bones[side]; if (!bone) continue;
    const g = new THREE.Group();
    // Point the glove down the fingers (towards the hand's first child bone), whatever the rig's axes.
    const ws = bone.getWorldScale(new V3()); g.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
    const kid = bone.children.find(c => c.isBone), dir = kid ? kid.position.clone().multiply(ws).normalize() : new V3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.07), m); palm.quaternion.copy(q); palm.position.copy(dir).multiplyScalar(0.06); g.add(palm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 12), band); cuff.quaternion.copy(q); cuff.position.copy(dir).multiplyScalar(-0.015); g.add(cuff);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.visible = false; bone.add(g); list.push(g);
  }
  return { set: on => list.forEach(g => { g.visible = on; }) };
})();
const ENV = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
// Cristiano's car: a long black saloon with tinted windows, chrome and a CR7 plate. Built in code.
function makeCar() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x050608, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMap: ENV, envMapIntensity: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x06090b, metalness: 0.1, roughness: 0.06, envMap: ENV, envMapIntensity: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.18, envMap: ENV });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 1.6 });
  // Side profile (x = length, y = height), extruded across the width with soft bevels.
  const prof = (pts, depth, bevel) => {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (let i = 1; i < pts.length; i += 2) sh.quadraticCurveTo(...pts[i], ...pts[i + 1]);
    const e = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 12 });
    e.translate(0, 0, -depth / 2); return e;
  };
  const body = new THREE.Mesh(prof([[2.45, 0.32], [2.58, 0.45], [2.5, 0.72], [2.3, 0.84], [1.2, 0.92], [0.55, 1.38], [-0.2, 1.42], [-1.2, 1.42], [-1.75, 0.98], [-2.45, 0.94], [-2.5, 0.6], [-2.52, 0.32], [0, 0.3], [1.5, 0.3], [2.45, 0.32]], 1.62, 0.14), paint);
  const win = new THREE.Mesh(prof([[1.15, 0.92], [0.6, 1.3], [-0.15, 1.36], [-0.6, 1.37], [-1.1, 1.35], [-1.5, 1.0], [-0.2, 0.94], [0.5, 0.92], [1.15, 0.92]], 1.66, 0.12), glass);
  g.add(body, win);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 24), rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.28, 16);
  for (const sx of [-1.55, 1.6]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(wheelGeo, tyre); w.rotation.x = Math.PI / 2; w.position.set(sx, 0.36, sz * 0.86); g.add(w);
    const r = new THREE.Mesh(rimGeo, chrome); r.rotation.x = Math.PI / 2; r.position.copy(w.position); g.add(r);
  }
  for (const sz of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.42), lamp); h.position.set(2.62, 0.68, sz * 0.58); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.48), tail); t.position.set(-2.6, 0.8, sz * 0.56); g.add(t);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.7), chrome); grille.position.set(2.66, 0.52, 0); g.add(grille);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.04, 1.92), chrome); strip.position.set(0.1, 0.92, 0); strip.scale.y = 0.6; g.add(strip);
  // Number plate.
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#111'; x.font = '900 44px Arial'; x.textAlign = 'center'; x.fillText('CR7 · 007', 128, 48);
  const pt = new THREE.CanvasTexture(c); pt.colorSpace = THREE.SRGBColorSpace;
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.4 })); p.position.set(s * 2.68, 0.45, 0); p.rotation.y = s * Math.PI / 2; g.add(p); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const car = makeCar(); car.visible = false; scene.add(car);
// "House Low Poly" by Igor Ribeiro (BlendSwap, CC BY 3.0): a little brick house with a water tank on a
// grassy morro, with its stairs. Two of them rise from the slope below the plaza, either side of the
// view on the bay; a grass skirt carries each hill down the slope so it never floats.
if (casaSrc) for (const [x, z, ry, s] of [[-29, 58, 0.3, 1.2], [31, 60, -0.35, 1.1]]) {
  const m = casaSrc.clone(); m.scale.setScalar(s); m.rotation.y = ry; m.position.set(x, 7.9 * s - 3.5, z);
  let grass = null;
  m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (/morro/i.test(o.name)) grass = o; } });
  scene.add(m); m.updateMatrixWorld(true);
  if (grass) {
    const b = new THREE.Box3().setFromObject(grass), c = b.getCenter(new V3()), r = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) * 0.42;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 2.2, 24, 24, 1, true), grass.material);
    skirt.position.set(c.x, b.min.y + 0.6 - 12, c.z); skirt.receiveShadow = true; scene.add(skirt);
  }
}
// The painted Rio sky (panorama, horizon band and clouds made by GOUAL ART), facing the bay to the south.
scene.add(makeSky(art.T, art.meta, { turn: 0.125, low: -0.16, high: 0.26 }));
const clouds = makeClouds(art.T, art.meta, 18); clouds.scale.setScalar(1.6); scene.add(clouds);
// Street life from the favela kit: caramel dogs, plastic chairs, gas bottles, crates and laundry.
{
  const K = kitMaterials(), b = new Builder(), RR = (() => { let x = 11; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  const at = (x, z, yMax = 30) => new V3(x, groundAt(x, z, yMax), z);
  const put = (p, rot, fn) => { b.push(p, rot); fn(); b.pop(); };
  for (const [x, z, y, r, pose] of [[-12.6, 21, 0.6, 0.8, 'lie'], [-16.5, 30.5, 0.6, 2.4, 'stand'], [14.5, 30, 0.6, -1.2, 'lie'], [-3.5, -8.2, 3.6, 1.4, 'stand'], [9, -23.6, 6.6, -2, 'lie'], [-20, -9, 3.6, 0.3, 'lie']]) put(at(x, z, y), r, () => dog(b, K, RR, pose));
  for (const [x, z, y, r] of [[-17.5, 31.5, 0.6, 0.4], [16, 33, 0.6, 1.2], [-8, -12.6, 3.6, 2.1]]) put(at(x, z, y), r, () => clutter(b, K, RR, 'chairs'));
  for (const [x, z, y, k] of [[-21, 31, 0.6, 'gas'], [22.5, 25, 0.6, 'crates'], [18, -12.2, 3.6, 'bags'], [-14, -24, 6.6, 'crates'], [3, -27.4, 6.6, 'gas']]) put(at(x, z, y), RR() * 6, () => clutter(b, K, RR, k));
  laundry(b, K, RR, new V3(-6, 5.2, 27.6), new V3(6, 5.4, 27.6));
  laundry(b, K, RR, new V3(-12, 8.4, -11.3), new V3(-2, 8.6, -11.3));
  const g = new THREE.Group(); b.build(g); scene.add(g);
}
const ze = new Character(zeSrc, { kind: 'cc', height: 1.8 });
ze.root.position.set(-21.3, 0, 23); ze.root.rotation.y = Math.PI / 2; scene.add(ze.root);
function streetKid(look, height) { const k = new Character(kidSrc, { kind: 'mixamo', height }); dress(k, look); scene.add(k.root); return k; }
const thiago = streetKid({ top: '#ffd400', bottom: '#1d3fa8', shoes: '#f2f2f2', skin: '#b98566' }, 1.72);
thiago.root.position.set(0, 0, 15.6); thiago.root.rotation.y = 0;
const lucas = streetKid({ top: '#ff7a1a', bottom: '#2b2b2b', shoes: '#e23b2e', skin: '#8f5f42' }, 1.42);
lucas.root.position.set(-10, 3, -9.2); lucas.root.rotation.y = 0.3;
const KID_LOOKS = [{ top: '#d62828', bottom: '#111111', skin: '#9a6a4a', shoes: '#ffffff' }, { top: '#f2f2f2', bottom: '#2a4fb5', skin: '#6e4630', shoes: '#111' }, { top: '#1f9d55', bottom: '#f2f2f2', skin: '#c49070', shoes: '#ffd400' }, { top: '#2a2a2a', bottom: '#d62828', skin: '#7a4e33', shoes: '#2ee6ff' }];
const kids = KID_LOOKS.map((l, i) => {
  const ch = streetKid(l, 1.45 + i * 0.06);
  const k = { ch, pos: new V3(-8 + i * 5, 0, 6 + (i % 2) * 3), target: new V3(), yaw: 0, speed: 0, think: 0 };
  k.target.copy(k.pos); ch.root.position.copy(k.pos); return k;
});
// Kids watching from the bleachers.
const fans = [{ top: '#7f5cd6', bottom: '#222', skin: '#a0704f' }, { top: '#ff8a3d', bottom: '#2a4fb5', skin: '#6e4630' }].map((l, i) => { const f = streetKid(l, 1.38); f.root.position.set(-14.6 + (i ? -0.6 : 0), 0.45 * (i + 1), 8 + i * 3.5); f.root.rotation.y = Math.PI / 2; return f; });

// ================= ball =================
const ballTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 512, 256);
  const pent = (x, y, r) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
  g.fillStyle = '#151515'; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) pent(i * 86 + (j % 2) * 43 + 20, j * 90 + 35, 22);
  g.fillStyle = '#ffd400'; g.fillRect(0, 118, 512, 10); g.fillStyle = '#0d1b4d'; g.font = '900 26px Arial'; g.fillText('GOUAL', 210, 112);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const ballMat = new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 });
const BALL_R = 0.15;   // a bit bigger than life, so it reads well on screen
class Ball {
  constructor(p) {
    // The official Trionda ball (3D model), sized to the physics ball; a plain textured sphere if it fails to load.
    if (triondaSrc) {
      const m = triondaSrc.clone(); m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new V3()), c = b.getCenter(new V3());
      const k = (2 * BALL_R) / Math.max(sz.x, sz.y, sz.z); m.scale.multiplyScalar(k); m.position.sub(c.multiplyScalar(k));
      // Brighter: the model's texture is quite dark under the favela light.
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; const mt = o.material = o.material.clone(); mt.side = THREE.FrontSide; mt.color.multiplyScalar(1.25); mt.roughness = 0.38; mt.metalness = 0; if (mt.map) { mt.emissive = new THREE.Color('#ffffff'); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.32; } } });
      this.mesh = new THREE.Group(); this.mesh.add(m);
    } else { this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), ballMat); this.mesh.castShadow = true; }
    scene.add(this.mesh);
    this.pos = p.clone(); this.vel = new V3(); this.ghost = 0; this.onGround = false; this.frozen = false;
  }
  update(dt) {
    if (this.frozen) { this.mesh.position.copy(this.pos); return; }
    this.vel.y -= 9.81 * dt; this.pos.addScaledVector(this.vel, dt); this.onGround = false;
    if (this.ghost > 0) this.ghost -= dt;
    else for (const c of near(this.pos.x, this.pos.z, 0.5)) {
      const qx = clamp(this.pos.x, c.x0, c.x1), qy = clamp(this.pos.y, c.y0, c.y1), qz = clamp(this.pos.z, c.z0, c.z1);
      let dx = this.pos.x - qx, dy = this.pos.y - qy, dz = this.pos.z - qz; const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= BALL_R * BALL_R) continue;
      let d = Math.sqrt(d2); if (d < 1e-6) { dx = 0; dy = 1; dz = 0; d = 1; this.pos.y = c.y1; }
      const nx = dx / d, ny = dy / d, nz = dz / d;
      this.pos.set(qx + nx * BALL_R, qy + ny * BALL_R, qz + nz * BALL_R);
      const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
      if (vn < 0) { const e = ny > 0.7 ? 0.5 : 0.62; this.vel.x -= (1 + e) * vn * nx; this.vel.y -= (1 + e) * vn * ny; this.vel.z -= (1 + e) * vn * nz; if (-vn > 1.2) audio.bounce(-vn); }
      if (ny > 0.7) { this.onGround = true; if (Math.abs(this.vel.y) < 0.6) this.vel.y = 0; }
    }
    if (this.onGround) { const f = Math.exp(-dt * 1.15); this.vel.x *= f; this.vel.z *= f; }
    if (this.pos.y < -20) { this.pos.set(0, 1, 30); this.vel.set(0, 0, 0); }
    // Roll.
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.01) { const ax = new V3(this.vel.z, 0, -this.vel.x).normalize(); this.mesh.rotateOnWorldAxis(ax, sp * dt / BALL_R); }
    this.mesh.position.copy(this.pos);
  }
  // Fly to a point in `t` seconds through anything (used to bring the ball back).
  lob(to, t, ghost = true) { const g = 9.81; this.vel.set((to.x - this.pos.x) / t, (to.y - this.pos.y) / t + 0.5 * g * t, (to.z - this.pos.z) / t); if (ghost) this.ghost = t * 0.92; }
}
const ball = new Ball(new V3(0, 0.3, 33));
const courtBall = new Ball(new V3(0, 0.3, 8));
const cr7Ball = new Ball(CR7_HOME.clone().add(new V3(0, 1, 0))); cr7Ball.frozen = true;
indexColliders();

// ================= player =================
const P = {
  pos: new V3(0, 0.16, 35), vel: new V3(), vy: 0, yaw: Math.PI, grounded: true, mode: 'cut', speed: 0,
  action: null, actT: 0, actLen: 0, ctlBall: 0, lostT: 0, lastSafe: new V3(0, 0.16, 35), stepPhase: 0, look: 0, spin: 0,
};
const RAD = 0.33, STEP = 0.5, HEIGHT = 1.8, CLIMB_MAX = 3.15, G = 22;
function fwd(yaw = P.yaw) { return new V3(Math.sin(yaw), 0, Math.cos(yaw)); }
function pushOut(pos, r, y, vel, step) {
  for (let pass = 0; pass < 2; pass++) for (const c of near(pos.x, pos.z, r + 0.4)) {
    if (c.y1 <= y + step + 0.001 || c.y0 >= y + HEIGHT) continue;
    const qx = clamp(pos.x, c.x0, c.x1), qz = clamp(pos.z, c.z0, c.z1); let dx = pos.x - qx, dz = pos.z - qz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    let nx, nz, pen;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
    else { const o = [[pos.x - c.x0, -1, 0], [c.x1 - pos.x, 1, 0], [pos.z - c.z0, 0, -1], [c.z1 - pos.z, 0, 1]].sort((a, b) => a[0] - b[0])[0]; nx = o[1]; nz = o[2]; pen = o[0] + r; }
    pos.x += nx * pen; pos.z += nz * pen;
    const vn = vel.x * nx + vel.z * nz; if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
  }
}
function findLedge() {
  const f = fwd();
  for (const d of [0.5, 0.75]) {
    const px = P.pos.x + f.x * d, pz = P.pos.z + f.z * d;
    const top = groundAt(px, pz, P.pos.y + CLIMB_MAX);
    if (top <= P.pos.y + STEP + 0.05) continue;
    const lx = px + f.x * 0.35, lz = pz + f.z * 0.35;
    if (Math.abs(groundAt(lx, lz, top + 0.05) - top) > 0.06) continue;
    let blocked = false;
    for (const c of near(lx, lz, RAD + 0.2)) if (lx > c.x0 - RAD && lx < c.x1 + RAD && lz > c.z0 - RAD && lz < c.z1 + RAD && c.y0 < top + 1.7 && c.y1 > top + 0.06) { blocked = true; break; }
    if (blocked) continue;
    // Also the path up must be clear above where we stand (no ceiling).
    if (inside(P.pos.x, top + 1.0, P.pos.z)) continue;
    return { top, lx, lz };
  }
  return null;
}
function startClimb(l) {
  P.mode = 'climb'; P.climb = { t: 0, from: P.pos.clone(), ...l, dur: 0.5 + (l.top - P.pos.y) * 0.13 };
  P.vel.set(0, 0, 0); P.vy = 0; act('climb', P.climb.dur); audio.noise && audio.ctx && audio.noise(audio.sfx, audio.ctx.currentTime, { f: 400, q: 2, level: 0.05, d: 0.2 });
}
function act(name, len) { P.action = name; P.actT = 0; P.actLen = len; }

// ================= input =================
const keys = {}; let lookDX = 0, lookDY = 0;
const IN = { move: new V3(), sprint: false, jump: false, use: false, shoot: false, trick: false, siu: false, skip: false };
addEventListener('keydown', e => {
  if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Space') { IN.jump = true; IN.skip = true; e.preventDefault(); }
  if (e.code === 'KeyE' || e.code === 'Enter') { IN.use = true; IN.skip = true; }
  if (e.code === 'KeyF') IN.trick = true;
  if (e.code === 'KeyC') IN.siu = true;
  if (e.code === 'KeyK') IN.shoot = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const canvasEl = renderer.domElement;
let dragging = null;
canvasEl.addEventListener('mousedown', e => {
  if (TOUCH) return;
  if (state.paused) return;
  if (mode() === 'dialog') { IN.skip = true; return; }
  if (mode() === 'pen') return;
  if (document.pointerLockElement === canvasEl) { if (e.button === 0) IN.shoot = true; return; }
  if (mode() === 'free') canvasEl.requestPointerLock?.();
  dragging = { x: e.clientX, y: e.clientY };
});
addEventListener('mouseup', () => { dragging = null; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvasEl) { lookDX += e.movementX; lookDY += e.movementY; }
  else if (dragging) { lookDX += e.clientX - dragging.x; lookDY += e.clientY - dragging.y; dragging = { x: e.clientX, y: e.clientY }; }
});
addEventListener('wheel', e => { cam.zoom = clamp(cam.zoom + e.deltaY * 0.002, 0.6, 1.6); }, { passive: true });
// Touch: joystick on the left, look by dragging anywhere else, buttons on the right.
const stick = { id: null, x: 0, y: 0, dx: 0, dy: 0 }, looks = new Map();
let sprintToggle = false;
if (TOUCH) {
  const base = $('#stick .base'), nub = $('#stick .nub');
  $('#stick').addEventListener('pointerdown', e => {
    if (mode() === 'dialog') { IN.skip = true; return; }
    stick.id = e.pointerId; stick.x = e.clientX; stick.y = e.clientY; stick.dx = stick.dy = 0;
    base.style.left = e.clientX + 'px'; base.style.top = (e.clientY - $('#stick').getBoundingClientRect().top) + 'px'; e.preventDefault();
  });
  addEventListener('pointermove', e => {
    if (e.pointerId === stick.id) { stick.dx = clamp((e.clientX - stick.x) / 50, -1, 1); stick.dy = clamp((e.clientY - stick.y) / 50, -1, 1); nub.style.left = (60 + stick.dx * 36) + 'px'; nub.style.top = (60 + stick.dy * 36) + 'px'; }
    const l = looks.get(e.pointerId); if (l) { lookDX += (e.clientX - l.x) * 1.6; lookDY += (e.clientY - l.y) * 1.6; l.x = e.clientX; l.y = e.clientY; }
  });
  const end = e => { if (e.pointerId === stick.id) { stick.id = null; stick.dx = stick.dy = 0; nub.style.left = nub.style.top = '60px'; } looks.delete(e.pointerId); };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  canvasEl.addEventListener('pointerdown', e => { if (mode() === 'dialog') { IN.skip = true; return; } looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  const btn = (id, f) => $(id).addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); f(); });
  btn('#bJump', () => { IN.jump = true; IN.skip = true; }); btn('#bAct', () => { IN.use = true; IN.skip = true; });
  btn('#bShoot', () => { IN.shoot = true; }); btn('#bTrick', () => { IN.trick = true; }); btn('#bSiu', () => { IN.siu = true; });
  btn('#bRun', () => { sprintToggle = !sprintToggle; $('#bRun').classList.toggle('on', sprintToggle); });
  $('#sub').addEventListener('pointerdown', () => { IN.skip = true; });
}
$('#sub').addEventListener('mousedown', () => { IN.skip = true; });
function readMove() {
  let x = 0, y = 0;
  if (keys.KeyW || keys.ArrowUp) y += 1; if (keys.KeyS || keys.ArrowDown) y -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1; if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (stick.id !== null) { x = stick.dx; y = -stick.dy; }
  const m = Math.min(1, Math.hypot(x, y)); if (m < 0.12) return { x: 0, y: 0, m: 0 };
  const a = Math.atan2(x, y); return { x: Math.sin(a) * m, y: Math.cos(a) * m, m };
}

// ================= camera =================
const cam = { yaw: Math.PI, pitch: 0.24, dist: 4.4, cur: 4.4, zoom: 1, target: new V3(), override: null, blend: 0, pos: new V3(), look: new V3(), shake: 0 };
function updateCamera(dt) {
  if (Math.abs(lookDX) + Math.abs(lookDY) > 0) { cam.yaw -= lookDX * 0.0028; cam.pitch = clamp(cam.pitch + lookDY * 0.0024, -0.5, 1.15); }
  lookDX = lookDY = 0;
  // Third-person follow.
  const tgt = new V3(P.pos.x, P.pos.y + 1.55, P.pos.z);
  cam.target.x = damp(cam.target.x, tgt.x, 14, dt); cam.target.z = damp(cam.target.z, tgt.z, 14, dt); cam.target.y = damp(cam.target.y, tgt.y, 8, dt);
  const want = cam.dist * cam.zoom, cp = Math.cos(cam.pitch);
  const dir = new V3(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
  let allowed = want;
  for (let s = 0.35; s <= want; s += 0.2) { const p = cam.target.clone().addScaledVector(dir, s); if (inside(p.x, p.y, p.z, 0.18) || p.y < groundAt(p.x, p.z, p.y + 1) + 0.15) { allowed = Math.max(0.5, s - 0.25); break; } }
  cam.cur = allowed < cam.cur ? damp(cam.cur, allowed, 25, dt) : damp(cam.cur, allowed, 3, dt);
  const followPos = cam.target.clone().addScaledVector(dir, cam.cur), followLook = cam.target.clone();
  // Cut-scene / challenge framing blends over the follow camera.
  cam.blend = damp(cam.blend, cam.override ? 1 : 0, cam.override?.speed || 3, dt);
  if (cam.override) { cam.ovPos ??= cam.override.pos.clone(); cam.ovLook ??= cam.override.look.clone(); cam.ovPos.lerp(cam.override.pos, 1 - Math.exp(-dt * (cam.override.follow || 2.5))); cam.ovLook.lerp(cam.override.look, 1 - Math.exp(-dt * (cam.override.follow || 2.5))); }
  if (cam.blend > 0.001 && cam.ovPos) { cam.pos.lerpVectors(followPos, cam.ovPos, cam.blend); cam.look.lerpVectors(followLook, cam.ovLook, cam.blend); }
  else { cam.pos.copy(followPos); cam.look.copy(followLook); cam.ovPos = cam.ovLook = null; }
  camera.position.copy(cam.pos);
  if (cam.shake > 0) { cam.shake -= dt; camera.position.x += (Math.random() - 0.5) * cam.shake * 0.3; camera.position.y += (Math.random() - 0.5) * cam.shake * 0.3; }
  camera.lookAt(cam.look);
}
function shot(pos, look, opts = {}) { cam.override = { pos: pos.clone(), look: look.clone(), ...opts }; if (opts.cut) { cam.ovPos = pos.clone(); cam.ovLook = look.clone(); cam.blend = 1; } }
function release() { cam.override = null; }
// Frame two people talking, from the side.
function frameTalk(a, b) {
  const mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a); d.y = 0; d.normalize();
  const perp = new V3(d.z, 0, -d.x);
  for (const s of [1, -1]) {
    const p = mid.clone().addScaledVector(perp, 2.9 * s).addScaledVector(d, -0.7); p.y = Math.max(a.y, b.y) + 1.55;
    if (!inside(p.x, p.y, p.z, 0.25)) { shot(p, mid.clone().add(new V3(0, 1.45, 0))); return; }
  }
  const p = a.clone().addScaledVector(d, -2.2); p.y += 1.9; shot(p, b.clone().add(new V3(0, 1.4, 0)));
}

// ================= HUD helpers =================
const state = { paused: false, started: false, stage: 0, cards: 0, style: 0, t0: 0, playTime: 0, modeStack: ['cut'], target: null, pen: null };
const mode = () => state.modeStack[state.modeStack.length - 1];
const pushMode = m => { state.modeStack.push(m); P.mode = m === 'free' ? 'free' : P.mode; };
const popMode = () => { state.modeStack.pop(); };
function setObjective(chap, text, target) { $('#obj .chap').textContent = chap; $('#obj .txt span').textContent = text; state.target = target || null; $('#obj').animate([{ transform: 'translateX(-20px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400 }); audio.blip(880); }
let toastTimer = 0;
function toast(t, color) { const el = $('#toast'); el.textContent = t; el.style.color = color || ''; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
let styleTimer = 0;
function addStyle(n, label) { state.style += n; $('#styleN').textContent = state.style.toLocaleString('en'); const el = $('#style'); el.textContent = `${label}  +${n}`; el.style.opacity = 1; styleTimer = 1.6; }
let hintTimer = 0;
function hint(t, s = 4) { $('#hint').textContent = t; $('#hint').style.opacity = t ? 1 : 0; hintTimer = s; }
function prompt(t, k = 'E') { const el = $('#prompt'); if (!t) { el.classList.add('hidden'); return; } el.classList.remove('hidden'); el.querySelector('kbd').textContent = TOUCH ? '◉' : k; el.querySelector('span').textContent = t; }
function updateMarker() {
  const el = $('#marker');
  if (!state.target || mode() !== 'free') { el.classList.add('hidden'); return; }
  const t = state.target.isVector3 ? state.target : state.target();
  const p = t.clone().add(new V3(0, 2.3, 0)).project(camera);
  const behind = p.z > 1; let x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight;
  if (behind) { x = innerWidth - x; y = innerHeight - 40; }
  const m = 40, edge = behind || x < m || x > innerWidth - m || y < m + 30 || y > innerHeight - m;
  x = clamp(x, m, innerWidth - m); y = clamp(y, m + 30, innerHeight - m);
  el.classList.remove('hidden'); el.classList.toggle('edge', edge);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.querySelector('span').textContent = Math.round(t.distanceTo(P.pos)) + ' m';
}

// ================= dialogue =================
const COLORS = { CR7: '#ffd400', AGENT: '#2ee6ff', DRIVER: '#c9c9c9', 'ZÉ': '#ff8a3d', THIAGO: '#7cfc00', LUCAS: '#ff6bd6', KIDS: '#ffffff' };
const speakers = () => ({ HERO: me, CR7: ronaldo, 'ZÉ': ze, THIAGO: thiago, LUCAS: lucas });
// Lines are written with HERO for whoever you play and {HERO} for their name; each hero has its own voice.
const heroText = t => t.replaceAll('{HERO}', hero.name);
let talking = null;
function line(who, text) {
  return new Promise(res => {
    const sub = $('#sub'), whoEl = sub.querySelector('.who'), lineEl = sub.querySelector('.line');
    text = heroText(text);
    sub.classList.remove('hidden'); whoEl.textContent = who === 'AGENT' ? 'AGENT (PHONE)' : who === 'DRIVER' ? 'CR7\'S DRIVER' : who === 'HERO' ? hero.label : who; whoEl.style.color = who === 'HERO' ? hero.color : COLORS[who] || '#fff';
    const sp = speakers()[who]; talking = sp || null;
    let shown = 0, done = false, spoke = false;
    const t0 = performance.now();
    const finish = () => { if (done) return; done = true; talking = null; IN.skip = false; res(); };
    const tick = () => {
      if (done) return;
      shown = Math.min(text.length, Math.floor((performance.now() - t0) / 1000 * 42));
      lineEl.textContent = text.slice(0, shown);
      if (IN.skip) { IN.skip = false; if (shown < text.length && performance.now() - t0 > 250) { shown = text.length; } else if (performance.now() - t0 > 250) { audio.stopVoice(); return finish(); } }
      requestAnimationFrame(tick);
    };
    IN.skip = false; tick();
    audio.speak(who === 'HERO' ? hero.id.toUpperCase() : who, text).then(ok => { spoke = ok; setTimeout(finish, ok ? 380 : Math.max(0, 1300 + text.length * 48 - (performance.now() - t0))); });
  });
}
async function say(lines) { for (const [w, t] of lines) await line(w, t); $('#sub').classList.add('hidden'); }
function faceEachOther(npc) {
  const a = P.pos, b = npc.root.position; P.yaw = Math.atan2(b.x - a.x, b.z - a.z); P.vel.set(0, 0, 0);
  npc.root.rotation.y = Math.atan2(a.x - b.x, a.z - b.z);
}
async function conversation(npc, lines, { keep = false } = {}) {
  pushMode('dialog'); if (document.pointerLockElement) document.exitPointerLock();
  if (npc) { faceEachOther(npc); frameTalk(P.pos, npc.root.position); }
  await say(lines);
  if (!keep) { release(); popMode(); }
}

// ================= interactions =================
const interactables = [
  { who: ze, label: 'Talk to Zé', r: 3.2, use: () => talkZe() },
  { who: thiago, label: 'Talk to Thiago', r: 2.4, use: () => talkThiago() },
  { who: lucas, label: 'Talk to Lucas', r: 2.4, use: () => talkLucas() },
  { who: { root: car }, label: 'Get in the car', r: 3.4, use: () => rideAway(), when: () => state.stage === STAGES.CAR },
];
function nearestInteractable() {
  let best = null, bd = 1e9;
  for (const it of interactables) { if (it.when && !it.when()) continue; const d = it.who.root.position.distanceTo(P.pos); if (d < it.r && d < bd && Math.abs(it.who.root.position.y - P.pos.y) < 1.5) { best = it; bd = d; } }
  return best;
}

// ================= mission =================
const waits = [];
const waitFor = fn => new Promise(r => waits.push({ fn, r }));
const sleep = s => new Promise(r => setTimeout(r, s * 1000));
const STAGES = { INTRO: 0, FIND: 1, CR7: 2, PENS: 3, CAR: 4, RIDE: 5, END: 6 };
// Ease a value from a to b over `dur` seconds, calling fn(k) every frame (k = 0..1, smooth).
const tween = (dur, fn) => new Promise(res => { let t = 0; tweens.push(dt => { t += dt; const k = Math.min(1, t / dur); fn(k * k * (3 - 2 * k), k); if (k >= 1) { res(); return true; } }); });
const tweens = [];

async function intro() {
  state.stage = STAGES.INTRO; pushMode('cut'); $('#letterbox').classList.add('on');
  P.pos.set(0, 0.16, 36.5); P.yaw = Math.PI; cam.yaw = Math.PI;
  act('phone', 999);
  shot(new V3(30, 38, 95), new V3(0, 6, -10), { cut: true });
  await sleep(0.4);
  shot(new V3(-3.2, 2.0, 33.4), new V3(0, 1.5, 36.4), { follow: 0.45, speed: 2 });
  await say([
    ['AGENT', '{HERO}, are you there? We have a problem. A big one.'],
    ['AGENT', 'The Ballon d\'Or was on show at a charity match here, in Morro da Goual. This morning, it was gone.'],
    ['AGENT', 'Cristiano Ronaldo was seen at the cage court. If anybody knows something, it is him.'],
    ['HERO', 'I am on my way.'],
  ]);
  act(null, 0); P.action = null;
  $('#letterbox').classList.remove('on'); release(); popMode(); pushMode('free'); P.mode = 'free';
  if (TOUCH) $('#touch').classList.remove('hidden');
  audio.base = 0; audio.carnival = 0;
  state.t0 = performance.now();
  hint(TOUCH ? 'Left thumb to move · drag to look · SHOOT, TRICK and CELEBRATE buttons' : 'WASD / ZQSD to move · mouse to look · Shift to sprint · Space to jump / climb', 7);
  setObjective('CHAPTER 1 · THE CAGE', 'Find Cristiano at the cage court', () => ronaldo.root.position);
  state.stage = STAGES.FIND;
  setTimeout(() => { if (mode() === 'free') hint(TOUCH ? 'TRICK = rainbow flick · SHOOT = strike · CELEBRATE = show off' : 'F = rainbow flick · Left click or K = shoot · C = celebrate', 6); }, 9000);
}
async function talkZe() {
  await conversation(ze, [pick(state.stage <= STAGES.FIND ? [
    ['ZÉ', 'Well, well. {HERO} in my bar! Cristiano is at the cage, showing off as usual.'],
    ['ZÉ', 'Ronaldo drank three coconuts and did not pay. He is at the cage. Tell him that.'],
  ] : [
    ['ZÉ', 'A cold drink? No? Water then. Athletes…'],
    ['ZÉ', 'In my day we played barefoot on this hill. And we were happy.'],
  ])]);
}
async function talkThiago() {
  await conversation(thiago, [pick(state.stage <= STAGES.FIND ? [
    ['THIAGO', 'No way… {HERO}?! Cristiano is right there, bro! In the cage!'],
    ['THIAGO', 'Today is crazy! First Cristiano, now you!'],
  ] : [
    ['THIAGO', 'You scored on Cristiano! Nobody will believe me!'],
    ['THIAGO', 'Bro, that penalty… I filmed everything!'],
  ])]);
}
async function talkLucas() {
  await conversation(lucas, [pick([
    ['LUCAS', 'Cristiano? He is down at the cage. I saw him do one hundred juggles!'],
    ['LUCAS', 'Jump on the crates, then the roofs. That is how we go up.'],
  ])]);
}
const pick = a => a[Math.floor(Math.random() * a.length)];

// ----- Cristiano at the cage: the deal, the gloves, the penalty -----
const cr7 = { juggle: true, t: 0, walk: 0, keeper: false };
async function meetRonaldo() {
  state.stage = STAGES.CR7; pushMode('dialog'); if (document.pointerLockElement) document.exitPointerLock();
  $('#letterbox').classList.add('on'); P.vel.set(0, 0, 0); prompt(null);
  // He keeps juggling a moment, catches the ball, then turns to you.
  shot(CR7_HOME.clone().add(new V3(-2.6, 1.6, 2.4)), CR7_HOME.clone().add(new V3(0, 1.1, 0)), { cut: true });
  await sleep(1.6);
  cr7.juggle = false; cr7Ball.frozen = true; cr7Ball.mesh.visible = false;
  faceEachOther(ronaldo); frameTalk(P.pos, ronaldo.root.position);
  await say([
    ['CR7', '{HERO}! I knew you would come up here.'],
    ['HERO', 'Cristiano. The Ballon d\'Or is gone. What do you know?'],
    ['CR7', 'Maybe I know where it is. Maybe not.'],
    ['CR7', 'Here is the deal. Score a penalty against me, and I give you a clue.'],
    ['HERO', 'You? In goal?'],
    ['CR7', 'Nobody scores on Cristiano. Nobody!'],
  ]);
  // The little show: SIUUU, the gloves go on, and he jogs to his line while the kids gather round.
  ronaldoSiu = 0; setTimeout(() => audio.siu(), 380);
  shot(ronaldo.root.position.clone().add(new V3(-3.4, 1.4, -1.2)), ronaldo.root.position.clone().add(new V3(0, 1.2, 0)), { follow: 2 });
  await sleep(2.1);
  gloves.set(true); audio.blip(520); toast('CR7 IN GOAL!', '#ffd400'); cr7.clap = 0;
  await sleep(1.0);
  kids.forEach((k, i) => { k.target.set(SPOT.x - 2.2 - (i % 2) * 0.8, 0, 10 + (i < 2 ? -3.2 - i * 0.9 : 3.2 + (i - 2) * 0.9)); k.watch = true; });
  thiago.root.position.set(SPOT.x - 3.4, 0, 14.6); thiago.root.rotation.y = 2.2;
  const from = ronaldo.root.position.clone(), to = keeperBase(0);
  ronaldo.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); cr7.walk = 3.2;
  shot(new V3(SPOT.x - 1, 2.2, 15.5), to.clone().add(new V3(0, 1, 0)), { follow: 1.5 });
  await tween(from.distanceTo(to) / 3.2, k => { ronaldo.root.position.lerpVectors(from, to, k); });
  cr7.walk = 0; ronaldo.root.rotation.y = Math.atan2(GOAL.n.x, GOAL.n.z); cr7.keeper = true;
  // You put the ball on the spot.
  P.pos.copy(SPOT).addScaledVector(GOAL.n, 1.1); P.yaw = Math.atan2(-GOAL.n.x, -GOAL.n.z);
  ball.frozen = true; ball.vel.set(0, 0, 0); ball.pos.copy(SPOT).add(new V3(0, BALL_R, 0)); ball.mesh.position.copy(ball.pos);
  shot(SPOT.clone().add(new V3(-0.9, 0.35, 0.9)), keeperBase(0).add(new V3(0, 0.9, 0)), { cut: true });
  await sleep(1.4);
  await say([['CR7', 'Come on, {HERO}. Show me.']]);
  $('#letterbox').classList.remove('on'); popMode();
  state.stage = STAGES.PENS;
  setObjective('CHAPTER 1 · THE CAGE', 'Score a penalty against Cristiano', null);
  let tries = 0, won = false;
  while (!won) {
    won = await penaltyChallenge(tries++);
    if (!won) await conversation(ronaldo, [pick([['CR7', 'Saved! Again, again!'], ['CR7', 'Ha! Too easy. One more!'], ['CR7', 'Is that all? Try again.'], ['CR7', 'Come on, you can do better than that!']])]);
  }
  await afterGoal();
}
async function afterGoal() {
  pushMode('dialog'); cr7.keeper = false; gloves.set(false); $('#letterbox').classList.add('on');
  ronaldo.root.position.copy(keeperBase(0)).addScaledVector(GOAL.n, 2.2);
  P.pos.copy(ronaldo.root.position).addScaledVector(GOAL.n, 2.2);
  faceEachOther(ronaldo); frameTalk(P.pos, ronaldo.root.position);
  await say([
    ['CR7', '…Okay. Good penalty. Very good.'],
    ['HERO', 'A deal is a deal. The clue.'],
    ['CR7', 'The Ballon d\'Or is not in the favela any more. It is in a building, down in the city.'],
    ['CR7', 'My driver will take you there. Go, he is waiting for you on the road.'],
  ]);
  // The car pulls up on the road, in front of the plaza.
  car.visible = true; car.position.set(CAR_FROM, 0, CAR_Z); car.rotation.y = Math.PI;
  shot(new V3(-4, 2.4, CAR_Z - 7.5), new V3(6, 0.8, CAR_Z), { cut: true });
  audio.engine?.(3);
  await tween(3.2, k => { car.position.x = lerp(CAR_FROM, CAR_STOP, 1 - (1 - k) * (1 - k)); });
  colliders.push(carBox); indexColliders();
  await sleep(0.4);
  await say([['DRIVER', 'Senhor {HERO}? Mister Ronaldo sent me. Please, get in.']]);
  ronaldo.root.position.set(4.5, 0, 12); cr7.juggle = true; cr7Ball.mesh.visible = true;
  $('#letterbox').classList.remove('on'); release(); popMode();
  state.stage = STAGES.CAR;
  setObjective('CHAPTER 1 · THE CAGE', 'Get in Cristiano\'s car, on the road', car.position.clone().add(new V3(0, 0, -1.3)));
}
const CAR_Z = 33.2, CAR_FROM = 62, CAR_STOP = 1.8;
const carBox = { x0: CAR_STOP - 2.6, y0: 0, z0: CAR_Z - 1, x1: CAR_STOP + 2.6, y1: 1.4, z1: CAR_Z + 1 };
async function rideAway() {
  state.stage = STAGES.RIDE; pushMode('cut'); prompt(null); $('#letterbox').classList.add('on'); if (document.pointerLockElement) document.exitPointerLock();
  $('#touch').classList.add('hidden');
  colliders.splice(colliders.indexOf(carBox), 1); indexColliders();
  shot(new V3(CAR_STOP + 1, 1.8, CAR_Z - 5.5), car.position.clone().add(new V3(0, 1, 0)), { cut: true });
  await sleep(0.5);
  me.root.visible = false; ball.mesh.visible = false; audio.kick(0.25);
  await sleep(0.7);
  audio.engine?.(4);
  shot(new V3(-22, 3.2, CAR_Z - 9), new V3(-12, 0.8, CAR_Z), { follow: 0.8 });
  await tween(4.2, (k, raw) => { car.position.x = CAR_STOP - 80 * raw * raw; });
  $('#fade').classList.add('on');
  await sleep(0.9);
  endScreen();
}
function endScreen() {
  state.stage = STAGES.END; audio.base = 1; audio.carnival = 1;
  const t = Math.round(state.playTime); $('#eTime').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('#eCards').textContent = `${state.cards}/${cards.length}`; $('#eStyle').textContent = state.style.toLocaleString('en');
  $('#eWho').textContent = `Well played, ${hero.name}`;
  $('#letterbox').classList.remove('on'); $('#fade').classList.remove('on'); $('#end').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  post('complete', { time: t, cards: state.cards, style: state.style, hero: hero.id });
}

// ================= the penalty: Cristiano in goal on the cage court =================
// The east goal of the cage. n points from the goal towards the shooter, l along the goal line
// (it is also the keeper's own x axis, so his dive tilt works in his frame).
const PG = W.goals[1];
const GOAL = { c: new V3(PG.x, 0, PG.z), n: new V3(PG.dir, 0, 0), l: new V3(0, 0, -PG.dir), w: PG.w, h: PG.h };
const SPOT = GOAL.c.clone().addScaledVector(GOAL.n, 6);
const lat = p => (p.x - GOAL.c.x) * GOAL.l.x + (p.z - GOAL.c.z) * GOAL.l.z;
const keeperBase = off => GOAL.c.clone().addScaledVector(GOAL.n, 0.45).addScaledVector(GOAL.l, off);
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, depthTest: false }));
reticle.renderOrder = 10; reticle.visible = false; reticle.rotation.y = Math.atan2(GOAL.n.x, GOAL.n.z); scene.add(reticle);
let mouseNDC = new THREE.Vector2(), pointerDown = false, clickTap = false;
addEventListener('pointermove', e => { mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
canvasEl.addEventListener('pointerdown', e => { mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); pointerDown = true; clickTap = true; });
addEventListener('pointerup', () => { pointerDown = false; });
function penaltyChallenge(tries = 0) {
  return new Promise(res => {
    pushMode('pen'); if (document.pointerLockElement) document.exitPointerLock(); $('#touch').classList.add('hidden');
    P.pos.copy(SPOT).addScaledVector(GOAL.n, 1.1); P.yaw = Math.atan2(-GOAL.n.x, -GOAL.n.z); P.vel.set(0, 0, 0);
    ronaldo.root.rotation.set(0, Math.atan2(GOAL.n.x, GOAL.n.z), 0);
    shot(SPOT.clone().addScaledVector(GOAL.n, 3.6).addScaledVector(GOAL.l, 0.6).add(new V3(0, 1.75, 0)), GOAL.c.clone().add(new V3(0, 0.9, 0)), { follow: 3 });
    $('#tally').classList.remove('hidden'); $('#tally').innerHTML = `<span>${tries + 1}</span>`;
    state.pen = { tries, phase: 'place', t: 0, power: 0, aim: GOAL.c.clone().add(new V3(0, 1, 0)), res, dive: 0, diveT: 0, keeperX: 0, scored: false };
    if (!tries) hint(TOUCH ? 'Drag to aim · hold to charge · release to shoot (not too hard!)' : 'Aim with the mouse · hold the button to charge · release to shoot', 7);
    placeBall();
  });
}
function placeBall() { const S = state.pen; ball.frozen = true; ball.mesh.visible = true; ball.pos.copy(SPOT).add(new V3(0, BALL_R, 0)); ball.mesh.position.copy(ball.pos); S.phase = 'aim'; S.dive = 0; S.diveT = 0; S.keeperX = 0; }
const raycaster = new THREE.Raycaster(), goalPlane = new THREE.Plane(GOAL.n.clone(), -GOAL.n.dot(GOAL.c));
function updatePen(dt) {
  const S = state.pen; if (!S) return;
  S.t += dt;
  if (S.phase === 'aim' || S.phase === 'power') {
    raycaster.setFromCamera(mouseNDC, camera); const hit = new V3();
    if (raycaster.ray.intersectPlane(goalPlane, hit)) S.aim.copy(GOAL.c).addScaledVector(GOAL.l, clamp(lat(hit), -GOAL.w / 2 - 0.6, GOAL.w / 2 + 0.6)).setY(clamp(hit.y, 0.12, GOAL.h + 0.7));
    reticle.visible = true; reticle.position.copy(S.aim).addScaledVector(GOAL.n, 0.05);
    if (S.phase === 'aim' && pointerDown) { S.phase = 'power'; S.pt = 0; $('#power').classList.remove('hidden'); }
    if (S.phase === 'power') {
      S.pt += dt; S.power = 1 - Math.abs(1 - (S.pt * 0.9) % 2); $('#power i').style.width = (S.power * 100) + '%';
      if (!pointerDown) { $('#power').classList.add('hidden'); shoot(); }
    }
  }
  if (S.phase === 'kick') { S.kickT -= dt; if (S.kickT <= 0) strike(); }
  if (S.phase === 'flight') {
    S.ft += dt; const k = Math.min(1, S.ft / S.dur);
    ball.pos.lerpVectors(S.from, S.to, k); ball.pos.y += Math.sin(Math.PI * k) * S.arc; ball.mesh.position.copy(ball.pos); ball.mesh.rotation.x -= dt * 20;
    if (S.ft > 0.1) S.diveT = Math.min(1, S.diveT + dt / 0.42);
    if (k >= 1) resolveShot();
  }
  if (S.phase === 'after') { S.at += dt; if (S.after) S.after(dt); if (S.at > 1.8) endPens(); }
  // Keeper: ready stance, sways along his line, then dives.
  const d = S.dive * S.diveT;
  ronaldo.root.position.copy(keeperBase(S.keeperX + d * 1.15));
  ronaldo.root.position.y = Math.sin(S.diveT * Math.PI) * 0.35 * Math.abs(S.dive) * (S.high ? 1.4 : 0.6) - (S.diveT > 0.8 ? (S.diveT - 0.8) * 0.4 : 0);
  ronaldo.root.rotation.z = -d * 1.2;
  if (S.phase === 'aim' || S.phase === 'power') S.keeperX = Math.sin(S.t * 2.1) * 0.25;
}
function shoot() {
  const S = state.pen; S.phase = 'kick'; S.kickT = 0.25; reticle.visible = false; act('kick', 0.7);
}
function strike() {
  const S = state.pen;
  audio.kick(S.power);
  const p = S.power, spread = Math.max(0, p - 0.55) * 0.9;
  const to = S.aim.clone().addScaledVector(GOAL.l, (Math.random() - 0.5) * spread); to.y += (Math.random() - 0.3) * spread + (p > 0.92 ? 0.9 : 0);
  S.from = ball.pos.clone(); S.to = to; S.dur = 6.6 / (11 + 15 * p); S.arc = 0.25 + (1 - p) * 0.5; S.ft = 0; ball.frozen = true; S.phase = 'flight';
  // Cristiano reads soft shots and guesses on hard ones; he gets a little tired after a few tries.
  const reads = Math.random() < (0.62 - 0.45 * p) * (S.tries >= 3 ? 0.45 : 1);
  const L = lat(to);
  const side = reads ? Math.sign(L) * Math.min(1, Math.abs(L) / 1.2) : (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
  S.dive = Math.abs(L) < 0.35 && reads ? 0.05 : side; S.high = to.y > 1.2; S.reads = reads;
}
function resolveShot() {
  const S = state.pen, to = S.to, L = lat(to);
  const inGoal = Math.abs(L) < GOAL.w / 2 - 0.05 && to.y < GOAL.h - 0.05 && to.y > 0;
  const kx = lat(ronaldo.root.position), reach = 0.62 + (S.high ? -0.08 : 0.18);
  const saved = inGoal && Math.abs(L - kx) < reach && (to.y < 1.6 + Math.abs(S.dive) * 0.5);
  const span = $('#tally').children[0];
  if (inGoal && !saved) {
    S.scored = true; span.className = 'g'; span.textContent = '✓'; toast('GOOOL!'); audio.net(); audio.cheer(1); audio.fiesta(4); addStyle(500, 'PENALTY ON CR7'); kidsCheer = 2.5;
    const back = GOAL.n.clone().negate();
    S.after = dt => { ball.pos.addScaledVector(back, dt * 0.4); ball.pos.y = Math.max(BALL_R, ball.pos.y - dt * 2); ball.mesh.position.copy(ball.pos); };
    setTimeout(() => celebrate(true), 500);
  } else {
    span.className = 'm'; span.textContent = '✕'; toast(saved ? 'SAVED!' : 'MISSED!', '#ff2d55'); audio.ooh();
    const v = GOAL.l.clone().multiplyScalar((Math.random() - 0.5) * 6).addScaledVector(GOAL.n, 4); v.y = 3;
    S.after = dt => { v.y -= 9.8 * dt; ball.pos.addScaledVector(v, dt); if (ball.pos.y < BALL_R) { ball.pos.y = BALL_R; v.y *= -0.4; v.x *= 0.8; v.z *= 0.8; } ball.mesh.position.copy(ball.pos); };
  }
  S.phase = 'after'; S.at = 0;
}
function endPens() {
  const S = state.pen; state.pen = null;
  $('#tally').classList.add('hidden'); reticle.visible = false; ronaldo.root.rotation.z = 0; ronaldo.root.position.copy(keeperBase(0));
  ball.frozen = false; ball.pos.copy(SPOT).add(new V3(0.5, 0.3, 0.5)); ball.vel.set(0, 0, 0);
  release(); popMode(); S.res(S.scored);
}

// ================= celebration =================
// Each star has a shout; the move is a little run-up, a jump and a half turn to face the camera.
const CELEB = { mbappe: 'MBAPPÉÉÉ!', yamal: 'LAMINE!', kane: 'HARRY KANE!' };
let siuT = -1, ronaldoSiu = -1;
function celebrate(auto = false) {
  if (siuT >= 0) return;
  siuT = 0; act('siu', 1.9); P.vel.set(0, 0, 0);
  if (!auto) addStyle(200, 'CELEBRATION');
  toast(CELEB[hero.id]);
  setTimeout(() => { audio.cheer(1); kidsCheer = 2; cam.shake = 0.35; }, 1100);
}

// ================= cards (collectibles) =================
const cardTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 360; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 360); gr.addColorStop(0, '#fff3a8'); gr.addColorStop(0.5, '#e8b923'); gr.addColorStop(1, '#a8740c');
  g.fillStyle = gr; g.beginPath(); g.roundRect(4, 4, 248, 352, 22); g.fill();
  g.fillStyle = '#0d1b4d'; g.beginPath(); g.roundRect(22, 22, 212, 316, 14); g.fill();
  g.fillStyle = '#ffd400'; g.font = '900 54px Impact, Arial Black'; g.textAlign = 'center'; g.fillText('GOUAL', 128, 92);
  g.beginPath(); g.arc(128, 190, 56, 0, 7); g.fillStyle = '#fff'; g.fill(); g.fillStyle = '#111'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.2566; g.lineTo(128 + Math.cos(a) * 22, 190 + Math.sin(a) * 22); } g.fill();
  g.fillStyle = '#fff'; g.font = '800 26px Arial'; g.fillText('STREET CARD', 128, 300);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, emissive: 0xffc400, emissiveIntensity: 0.35, emissiveMap: cardTex, side: THREE.DoubleSide, roughness: 0.3, metalness: 0.4 });
const CARD_SPOTS = [[-14, 33], [11.3, 3.6], [25.8, 9.2], [-8, -10.6], [-28, -8.5], [0, -19.6], [40, -25], [12.6, -48]];
const cards = CARD_SPOTS.map(([x, z]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), cardMat); const y = groundAt(x, z, 30) + 1.0;
  m.position.set(x, y, z); m.castShadow = true; scene.add(m); return { m, y, got: false };
});
$('#cardsN').textContent = `0/${cards.length}`;

// ================= NPC behaviour =================
let kidsCheer = 0, courtHolder = 0, passT = 2, courtRecv = -1;
// The kids play on the west half of the court: the east half is Cristiano's.
const KX0 = -11, KX1 = 3;
function updateKids(dt) {
  const CB = courtBall;
  kids.forEach((k, i) => {
    let tgt = k.target;
    if (!k.watch) {
      if (i === courtRecv) tgt = CB.pos;
      else if (i === courtHolder) { k.think -= dt; if (k.think <= 0) { k.think = 1 + Math.random() * 1.5; k.target.set(KX0 + Math.random() * (KX1 - KX0), 0, 4 + Math.random() * 7); } }
      else { k.think -= dt; if (k.think <= 0) { k.think = 1.5 + Math.random() * 2; k.target.set(KX0 + Math.random() * (KX1 - KX0), 0, 4 + Math.random() * 8); } }
    }
    const dx = tgt.x - k.pos.x, dz = tgt.z - k.pos.z, d = Math.hypot(dx, dz);
    const want = k.watch ? (d > 0.3 ? 3 : 0) : (i === courtRecv ? 5.2 : i === courtHolder ? 3.4 : d > 1 ? 2.6 : 0);
    k.speed = damp(k.speed, d > 0.25 ? want : 0, 6, dt);
    if (d > 0.05) { const yaw = Math.atan2(dx, dz); k.yaw += angDiff(k.yaw, yaw) * (1 - Math.exp(-dt * 8)); }
    if (k.watch && d < 0.4) { const yaw = Math.atan2(P.pos.x - k.pos.x, P.pos.z - k.pos.z); k.yaw += angDiff(k.yaw, yaw) * (1 - Math.exp(-dt * 5)); }
    k.pos.x += Math.sin(k.yaw) * k.speed * dt; k.pos.z += Math.cos(k.yaw) * k.speed * dt;
    k.pos.x = clamp(k.pos.x, -12, 12); k.pos.z = clamp(k.pos.z, 2.8, 17);
    k.ch.root.position.copy(k.pos); k.ch.root.rotation.y = k.yaw;
    k.ch.animate({ dt, speed: k.speed, grounded: true, action: kidsCheer > 0 ? 'cheer' : null, actionT: kidsCheer });
  });
  // The ball game: the holder dribbles, then passes to someone; the receiver runs onto it.
  if (!kids.some(k => k.watch)) {
    if (courtHolder >= 0) {
      const k = kids[courtHolder], f = new V3(Math.sin(k.yaw), 0, Math.cos(k.yaw));
      const want = k.pos.clone().addScaledVector(f, 0.45 + k.speed * 0.08); CB.vel.x = (want.x - CB.pos.x) * 8; CB.vel.z = (want.z - CB.pos.z) * 8;
      passT -= dt;
      if (passT <= 0) {
        let j = Math.floor(Math.random() * kids.length); if (j === courtHolder) j = (j + 1) % kids.length;
        const to = kids[j].pos, dir = to.clone().sub(CB.pos); dir.y = 0; const dist = dir.length(); dir.normalize();
        CB.vel.set(dir.x * (dist * 1.25 + 2.5), Math.random() < 0.3 ? 3 : 0.4, dir.z * (dist * 1.25 + 2.5)); audio.ctx && audio.kick(0.08);
        courtHolder = -1; courtRecv = j; passT = 1.2 + Math.random() * 2;
      }
    } else if (courtRecv >= 0) {
      const k = kids[courtRecv];
      if (k.pos.distanceTo(CB.pos) < 0.7 && CB.pos.y < 0.6) { courtHolder = courtRecv; courtRecv = -1; kids[courtHolder].think = 0; }
    }
  }
  CB.update(dt);
  if (CB.pos.x < -12.9 || CB.pos.x > KX1 + 2 || CB.pos.z < 2.1 || CB.pos.z > 17.9) { CB.pos.set(clamp(CB.pos.x, -12, KX1), 0.3, clamp(CB.pos.z, 3, 17)); CB.vel.set(0, 0, 0); }
  kidsCheer = Math.max(0, kidsCheer - dt);
  for (const f of fans) f.animate({ dt, speed: 0, grounded: true, action: kidsCheer > 0 ? 'cheer' : 'sit', actionT: kidsCheer });
}
function lookAtPlayer(ch, maxD = 7) {
  const p = ch.root.position, d = P.pos.distanceTo(p); if (d > maxD) return 0;
  return clamp(angDiff(ch.root.rotation.y, Math.atan2(P.pos.x - p.x, P.pos.z - p.z)), -1.2, 1.2);
}
function updateNPCs(dt) {
  updateKids(dt);
  const tk = (ch) => talking === ch ? 'talk' : null;
  ze.animate({ dt, speed: 0, grounded: true, action: tk(ze) || 'lean', actionT: performance.now() / 1000, look: lookAtPlayer(ze) });
  thiago.animate({ dt, speed: 0, grounded: true, action: tk(thiago) || (kidsCheer > 0 ? 'cheer' : null), actionT: performance.now() / 1000, look: lookAtPlayer(thiago) });
  lucas.animate({ dt, speed: 0, grounded: true, action: tk(lucas), actionT: performance.now() / 1000, look: lookAtPlayer(lucas) });
  // Cristiano: juggles while he waits, SIUUU, walks to his line, keeper stance and dives in the penalty.
  if (ronaldoSiu >= 0) { ronaldoSiu += dt; if (ronaldoSiu > 1.9) ronaldoSiu = -1; }
  if (state.pen) ronaldo.animate({ dt, speed: 0, grounded: true, action: 'keeper', dive: state.pen.dive * state.pen.diveT });
  else if (cr7.keeper) ronaldo.animate({ dt, speed: 0, grounded: true, action: tk(ronaldo) || 'keeper', actionT: performance.now() / 1000 });
  else if (cr7.walk > 0) ronaldo.animate({ dt, speed: cr7.walk, grounded: true });
  else if (ronaldoSiu >= 0) ronaldo.animate({ dt, speed: 0, grounded: true, action: 'siu', actionT: ronaldoSiu });
  else if (cr7.juggle) {
    cr7.t += dt; const tl = 0.5, ph = (cr7.t % tl) / tl;
    ronaldo.animate({ dt, speed: 0, grounded: true, action: 'juggle', actionT: cr7.t % tl, tapLen: tl });
    const f = new V3(Math.sin(ronaldo.root.rotation.y), 0, Math.cos(ronaldo.root.rotation.y));
    cr7Ball.pos.copy(ronaldo.root.position).addScaledVector(f, 0.4); cr7Ball.pos.y += 0.35 + Math.sin(ph * Math.PI) * 1.1; cr7Ball.update(dt); cr7Ball.mesh.rotation.x += dt * 8;
  } else ronaldo.animate({ dt, speed: 0, grounded: true, action: tk(ronaldo) || (kidsCheer > 0 && state.stage >= STAGES.CAR ? 'cheer' : null), actionT: performance.now() / 1000, look: lookAtPlayer(ronaldo) });
}

// ================= player update =================
function updatePlayer(dt) {
  const m = mode();
  let wish = new V3();
  P.actT += dt; if (P.action && P.actT > P.actLen) P.action = null;
  if (m === 'free' && P.mode === 'free' && siuT < 0) {
    const mv = readMove();
    const sprint = keys.ShiftLeft || keys.ShiftRight || sprintToggle;
    const sp = (sprint ? 7.2 : 4.2) * mv.m;
    if (mv.m > 0) {
      const cy = cam.yaw, fx = Math.sin(cy), fz = Math.cos(cy);
      const wx = fx * mv.y - fz * mv.x, wz = fz * mv.y + fx * mv.x;   // camera-relative (x = right)
      wish.set(wx, 0, wz).normalize().multiplyScalar(sp);
      const yaw = Math.atan2(wx, wz); P.yaw += angDiff(P.yaw, yaw) * (1 - Math.exp(-dt * (P.grounded ? 12 : 4)));
    }
    const ledge = P.grounded ? findLedge() : null;
    if (ledge && mv.m > 0) prompt('Climb', TOUCH ? 'JUMP' : 'SPACE');
    else { const it = nearestInteractable(); prompt(it ? it.label : null); if (IN.use && it) { IN.use = false; it.use(); } }
    if (IN.jump) { if (ledge) startClimb(ledge); else if (P.grounded) { P.vy = 7.2; P.grounded = false; } }
    if (IN.trick) trick();
    if (IN.shoot) shootBall();
    if (IN.siu && P.grounded) celebrate();
  } else prompt(null);
  if (P.mode === 'climb') {
    const C = P.climb; C.t += dt; const k = C.t / C.dur, e = x => x * x * (3 - 2 * x);
    const up = clamp(k / 0.68, 0, 1), over = clamp((k - 0.62) / 0.38, 0, 1);
    P.pos.y = lerp(C.from.y, C.top, e(up));
    P.pos.x = lerp(C.from.x, C.lx, e(over)); P.pos.z = lerp(C.from.z, C.lz, e(over));
    if (k >= 1) { P.mode = 'free'; P.grounded = true; P.vy = 0; P.pos.y = C.top; addStyle(20, 'CLIMB'); }
  } else if (m === 'free' || m === 'cut' || m === 'dialog') {
    // Celebration: small run-up, jump, half turn in the air, land facing the camera.
    if (siuT >= 0) {
      const t0 = siuT; siuT += dt;
      if (t0 < 0.22 && siuT >= 0.22) { P.vy = 6.3; P.grounded = false; }
      if (siuT > 0.22 && siuT < 0.78) P.spin = Math.PI * clamp((siuT - 0.24) / 0.5, 0, 1);
      if (siuT > 1.9) { siuT = -1; P.yaw += Math.PI; P.spin = 0; }
    }
    const accel = P.grounded ? 14 : 3.5;
    P.vel.x = damp(P.vel.x, wish.x, accel, dt); P.vel.z = damp(P.vel.z, wish.z, accel, dt);
    P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
    const step = P.grounded ? STEP : 0.05;
    pushOut(P.pos, RAD, P.pos.y, P.vel, step);
    const oldY = P.pos.y; P.vy -= G * dt; P.pos.y += P.vy * dt;
    const gY = groundAt(P.pos.x, P.pos.z, oldY + step, RAD * 0.7);
    if (P.pos.y <= gY) { if (!P.grounded && P.vy < -6) audio.step(); P.pos.y = gY; P.vy = 0; P.grounded = true; }
    else if (P.grounded && P.vy <= 0 && oldY - gY < 0.6) { P.pos.y = gY; P.vy = 0; }
    else P.grounded = false;
    if (P.grounded && !inside(P.pos.x, P.pos.y + 0.5, P.pos.z)) P.lastSafe.copy(P.pos);
    if (P.pos.y < -6) { P.pos.copy(P.lastSafe); P.vel.set(0, 0, 0); P.vy = 0; hint('Careful up there!', 2); }
  }
  P.speed = Math.hypot(P.vel.x, P.vel.z);
  // Footsteps.
  if (P.grounded && P.speed > 0.8 && P.mode !== 'climb') { const ph = Math.floor(me.phase / Math.PI); if (ph !== P.stepPhase) { P.stepPhase = ph; audio.step(); } }
  // Character pose.
  me.root.position.copy(P.pos); me.root.rotation.y = P.yaw + P.spin;
  const actName = P.action;
  me.animate({ dt, speed: P.mode === 'climb' ? 0 : P.speed, grounded: P.grounded || P.mode === 'climb', action: talking === me && !actName ? 'talk' : actName, actionT: P.action === 'climb' ? P.actT / P.actLen : P.actT, tapLen: 0.32, lean: 0 });
  IN.jump = IN.use = IN.trick = IN.shoot = IN.siu = false;
}
// Ball at your feet: touches while running, settles when you stop, comes back if you lose it.
function updateBall(dt) {
  if (state.pen) return;
  const f = fwd(), right = new V3(f.z, 0, -f.x);
  const d = ball.pos.clone().sub(P.pos); const dy = d.y; d.y = 0; const dist = d.length();
  const ahead = d.dot(f), lat = d.dot(right);
  P.ctlBall = Math.max(0, P.ctlBall - dt);
  const free = mode() === 'free' && P.mode === 'free';
  if (free && P.ctlBall <= 0) {
    const ballLow = ball.pos.y - groundAt(ball.pos.x, ball.pos.z, ball.pos.y + 0.2) < 0.35;
    if (dist > 3.4 || dy > 2.5 || dy < -1.5) {
      P.lostT += dt;
      if (P.lostT > (P.mode === 'climb' ? 9 : 0.7) && P.grounded) { const to = P.pos.clone().addScaledVector(f, 0.9); to.y += BALL_R; ball.lob(to, 0.65); P.lostT = 0; P.ctlBall = 0.7; }
    } else {
      P.lostT = 0;
      if (P.grounded && P.speed > 0.7 && dist < 1.0 && ahead < 0.45 && ballLow) {
        ball.vel.set(f.x * P.speed * 1.42 - right.x * lat * 3, 0.5, f.z * P.speed * 1.42 - right.z * lat * 3);
        audio.kick(0.06); P.ctlBall = 0.12;
      } else if (P.grounded && P.speed <= 0.7 && dist < 1.4 && ballLow) {
        const tgt = P.pos.clone().addScaledVector(f, 0.42);
        ball.vel.x = damp(ball.vel.x, (tgt.x - ball.pos.x) * 4, 8, dt); ball.vel.z = damp(ball.vel.z, (tgt.z - ball.pos.z) * 4, 8, dt);
      }
    }
  }
  ball.update(dt);
  // Goals on the cage court (free play).
  for (const g of W.goals) {
    const inMouth = Math.abs(ball.pos.z - g.z) < g.w / 2 - BALL_R && ball.pos.y < g.h;
    const crossed = g.dir > 0 ? ball.pos.x < g.x - 0.1 : ball.pos.x > g.x + 0.1;
    if (crossed && inMouth && !g.scored) { g.scored = true; toast('GOOOL!'); audio.net(); audio.cheer(0.9); audio.shout(1, -0.3); setTimeout(() => audio.shout(1, 0.4), 350); audio.fiesta(3.5); kidsCheer = 2; addStyle(250, 'STREET GOAL'); }
    if (!crossed) g.scored = false;
  }
}
function trick() {
  const d = ball.pos.distanceTo(P.pos);
  if (d > 1.6 || !P.grounded) return;
  act('trick', 0.5); const f = fwd(); const to = P.pos.clone().addScaledVector(f, 2.2 + P.speed * 0.75); to.y = groundAt(to.x, to.z, P.pos.y + 0.5) + BALL_R;
  ball.pos.copy(P.pos).addScaledVector(f, -0.15).add(new V3(0, 0.35, 0)); ball.lob(to, 0.85, false); P.ctlBall = 0.8; audio.kick(0.2);
  addStyle(120, 'RAINBOW FLICK');
}
function shootBall() {
  const d = ball.pos.distanceTo(P.pos), f = fwd();
  if (d > 1.7) { if (d < 25) { const to = P.pos.clone().addScaledVector(f, 0.8); to.y += BALL_R + 0.2; ball.lob(to, 0.6); P.ctlBall = 0.6; } return; }
  act('kick', 0.7);
  setTimeout(() => { const lift = clamp(cam.pitch * -1.2 + 0.25, 0.08, 0.5); ball.vel.set(f.x * 19, 19 * lift, f.z * 19); P.ctlBall = 1.2; audio.kick(0.9); }, 230);
}

// ================= main loop =================
const clock = new THREE.Clock(); let fpsAcc = 0, fpsN = 0, lowQ = false;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (window.__hold) { renderer.render(scene, camera); return; }
  update(dt);
  renderer.render(scene, camera);
  // Adaptive resolution if the device struggles.
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 3) { const fps = fpsN / fpsAcc; if (fps < 32 && !lowQ) { lowQ = true; renderer.setPixelRatio(Math.min(1, devicePixelRatio)); } fpsAcc = 0; fpsN = 0; }
}
function update(dt) {
  if (!state.paused) {
    for (let i = waits.length - 1; i >= 0; i--) if (waits[i].fn()) { const w = waits.splice(i, 1)[0]; w.r(); }
    if (state.started) state.playTime = (performance.now() - state.t0) / 1000;
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i](dt)) tweens.splice(i, 1);
    if (state.pen) { updatePen(dt); me.root.position.copy(P.pos); me.root.rotation.y = P.yaw; P.actT += dt; if (P.action && P.actT > P.actLen) P.action = null; me.animate({ dt, speed: 0, grounded: true, action: P.action, actionT: P.actT }); IN.jump = IN.use = IN.shoot = false; }
    else { updatePlayer(dt); updateBall(dt); }
    updateNPCs(dt);
    // Mission triggers by position.
    // Cristiano stops you when you walk up to him in the cage.
    if (state.stage === STAGES.FIND && mode() === 'free' && P.mode === 'free' && P.pos.distanceTo(ronaldo.root.position) < 3.6) meetRonaldo();
    // Cards.
    for (const c of cards) if (!c.got) {
      c.m.rotation.y += dt * 2; c.m.position.y = c.y + Math.sin(performance.now() / 400) * 0.1;
      if (c.m.position.distanceTo(new V3(P.pos.x, P.pos.y + 0.9, P.pos.z)) < 1.1) { c.got = true; c.m.visible = false; state.cards++; $('#cardsN').textContent = `${state.cards}/${cards.length}`; audio.chime(); addStyle(150, 'STREET CARD'); }
    }
    // Glowing tag pulse.
    if (W.cloth) W.cloth.rotation.y = 0;
  }
  if (!state.started) { const t = performance.now() / 1000; shot(new V3(Math.sin(t * 0.05) * 60, 34, 70 + Math.cos(t * 0.05) * 20), new V3(0, 4, -12), { cut: true }); }
  updateCamera(dt);
  updateMarker();
  // Shadows follow the player (snapped to texels to avoid shimmering).
  const c = cam.target, tx = Math.round(c.x / 0.5) * 0.5, tz = Math.round(c.z / 0.5) * 0.5;
  sun.target.position.set(tx, c.y, tz); sun.position.set(tx + sunDir.x * 90, c.y + sunDir.y * 90, tz + sunDir.z * 90);
  // Music: louder near the bar's radio, kids louder near the cage.
  const dBar = Math.hypot(P.pos.x + 19, P.pos.z - 23), dCage = Math.hypot(P.pos.x, P.pos.z - 10);
  audio.update(clamp(1 - dBar / 40, 0, 1), clamp(1 - dCage / 30, 0, 1));
  if (styleTimer > 0) { styleTimer -= dt; if (styleTimer <= 0) $('#style').style.opacity = 0; }
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('#hint').style.opacity = 0; }
}


// Phones: ask to turn sideways; on Android, go full screen and lock landscape.
if (TOUCH) document.body.classList.add('touch');
const canLock = !!(document.documentElement.requestFullscreen && screen.orientation && screen.orientation.lock);
function goLandscape() {
  if (!TOUCH || !canLock || document.fullscreenElement) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation.lock('landscape')).catch(() => {});
}
if (!canLock) $('#rotateFull').style.display = 'none';
$('#rotateFull').onclick = () => goLandscape();
$('#rotateSkip').onclick = () => document.body.classList.add('portrait-ok');
const leaveFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
// ================= menus =================
function controlsHTML() {
  const rows = TOUCH
    ? [['Left thumb', 'Move'], ['Drag right side', 'Look around'], ['JUMP', 'Jump · climb a ledge'], ['E', 'Talk'], ['SPRINT', 'Toggle sprint'], ['SHOOT', 'Strike the ball'], ['TRICK', 'Rainbow flick'], ['CELEB', 'Celebrate']]
    : [['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move'], ['Mouse', 'Look around (click to lock)'], ['<kbd>Shift</kbd>', 'Sprint'], ['<kbd>Space</kbd>', 'Jump · climb a ledge · next line'], ['<kbd>E</kbd>', 'Talk'], ['Click / <kbd>K</kbd>', 'Shoot'], ['<kbd>F</kbd>', 'Rainbow flick'], ['<kbd>C</kbd>', 'Celebrate'], ['<kbd>Esc</kbd>', 'Pause']];
  return rows.map(([a, b]) => `<div>${a}</div><div>${b}</div>`).join('');
}
$('#ctrlList').innerHTML = controlsHTML();
function togglePause(force) {
  if (!state.started || state.stage === STAGES.END) return;
  state.paused = force ?? !state.paused;
  $('#menu').classList.toggle('hidden', !state.paused); $('#menuKicker').textContent = 'PAUSED';
  if (state.paused) { if (document.pointerLockElement) document.exitPointerLock(); audio.stopVoice(); audio.ctx?.suspend(); state.pauseAt = performance.now(); }
  else { audio.ctx?.resume(); state.t0 += performance.now() - state.pauseAt; clock.getDelta(); }
}
$('#pauseBtn').onclick = () => togglePause(true);
$('#resumeBtn').onclick = () => togglePause(false);
$('#soundBtn').onclick = () => { audio.setOn(!audio.on); $('#soundBtn').textContent = 'Sound: ' + (audio.on ? 'on' : 'off'); };
$('#voiceBtn').onclick = () => { audio.voiceOn = !audio.voiceOn; $('#voiceBtn').textContent = 'Voices: ' + (audio.voiceOn ? 'on' : 'off'); };
$('#restartBtn').onclick = () => location.reload();
$('#quitBtn').onclick = () => close();
$('#closeBtn').onclick = () => close();
$('#tourBtn').onclick = () => close();
$('#againBtn').onclick = () => location.reload();
$('#contactBtn').onclick = () => { if (EMBED) post('contact'); else location.href = '../#contact'; };
$('#ctrlBtn').onclick = () => { $('#title').classList.add('hidden'); $('#menu').classList.remove('hidden'); $('#menuKicker').textContent = 'CONTROLS'; $('#resumeBtn').textContent = 'BACK'; $('#resumeBtn').onclick = () => { $('#menu').classList.add('hidden'); $('#title').classList.remove('hidden'); $('#resumeBtn').textContent = 'RESUME'; $('#resumeBtn').onclick = () => togglePause(false); }; };
function post(action, data) { try { window.parent.postMessage({ type: 'goual-street', action, ...data }, '*'); } catch (e) { } }
function close() { leaveFullscreen(); audio.stopVoice(); audio.ctx?.suspend(); if (EMBED) post('close'); else location.href = '../?arcade=street'; }
// Pick your star on the title screen.
document.querySelectorAll('#heroPick button').forEach(b => b.addEventListener('click', () => {
  pickHero(b.dataset.hero); document.querySelectorAll('#heroPick button').forEach(x => x.classList.toggle('on', x === b)); audio.init(); audio.blip(660);
  me.root.position.copy(P.pos); me.root.rotation.y = P.yaw;
}));
document.querySelector(`#heroPick button[data-hero="${hero.id}"]`)?.classList.add('on');
$('#playBtn').onclick = async () => {
  audio.init(); goLandscape(); $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden');
  state.started = true; state.t0 = performance.now();
  await intro();
};

// ================= go =================
// Sound starts on the title screen if the browser allows it, otherwise at the first touch or key.
try { audio.init(); } catch (e) { }
const wake = () => { audio.init(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
addEventListener('pointerdown', wake); addEventListener('keydown', wake);
$('#loading').classList.add('hidden');
$('#title').classList.remove('hidden');
me.root.position.copy(P.pos); me.root.rotation.y = P.yaw;
frame();
post('ready');
// Test hooks.
window.__street = { camera, findLedge, keys, step: (n = 1, dt = 1 / 60, each) => { for (let i = 0; i < n; i++) { if (each) each(); update(dt); } }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }), snap: () => { cam.target.set(P.pos.x, P.pos.y + 1.55, P.pos.z); cam.cur = cam.dist * cam.zoom; cam.blend = 0; cam.override = null; cam.ovPos = cam.ovLook = null; }, fps: () => fpsN / Math.max(0.001, fpsAcc), P, state, cam, W, ball, cards, kids, car, setStage: async (s) => { state.stage = s; }, tp: (x, y, z) => { P.pos.set(x, y, z); P.lastSafe.set(x, y, z); }, talkZe, talkThiago, winPens: () => { if (state.pen) { state.pen.scored = true; endPens(); } }, missPen: () => { if (state.pen) endPens(); }, meetRonaldo, afterGoal, rideAway, celebrate, pickHero, heroes: HEROES, ronaldo, gloves, SPOT, GOAL, groundAt, IN, mode: () => mode() };
