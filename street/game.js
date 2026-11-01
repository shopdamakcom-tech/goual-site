// STREET FOOT — The Ballon d'Or. A short third-person street football adventure in a Rio favela.
// You play Mbappé, Yamal or Kane: the Ballon d'Or has vanished. Cristiano Ronaldo is waiting at the
// favela's cage court and knows where it went: beat him in goal from the penalty spot (as many tries as
// it takes) and his driver takes you to the building where it is hidden. Episode 1; to be continued.
// Everything in English, with subtitles.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildWorld, buildBackdrop } from './world.js?v=4';
import { Character, dress } from './rig.js?v=7';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeBallonDor, loadFavela, makeSky, makeClouds } from './favela.js?v=4';
import { Builder, kitMaterials, dog, clutter, laundry, house } from './favela-kit.js';
import { audio } from './audio.js?v=6';

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
const hemi = new THREE.HemisphereLight(0xbdd5f2, 0x8a6a4a, 1.15); scene.add(hemi);
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
// Heroes come with their own running clip (if the file has one).
const loadAnim = url => new Promise((res, rej) => loader.load(url, g => { g.scene.userData.clips = g.animations; res(g.scene); }, undefined, rej));
const loadHero = url => new Promise((res, rej) => loader.load(url, g => { g.scene.userData.run = g.animations.find(a => /run/i.test(a.name)) || null; res(g.scene); }, undefined, rej));
const [art, cr7Src, kidSrc, zeSrc, triondaSrc, mbappeSrc, yamalSrc, kaneSrc, carSrc] = await Promise.all([loadFavela(renderer, ['plate', 'band', 'clouds']), load('models/cr7.glb'), load('models/kid.glb'), load('models/ze.glb'), load('models/trionda.glb').catch(() => null), loadHero('models/mbappe.glb'), loadHero('models/yamal.glb'), loadHero('models/kane.glb'), loadAnim('models/g63.glb')]);

// ================= characters =================
// The three playable stars (models made by GOUAL ART with Meshy). `me` is the one you picked.
const HEROES = {
  mbappe: { id: 'mbappe', name: 'Mbappé', label: 'MBAPPÉ', color: '#4da3ff', ch: new Character(mbappeSrc, { kind: 'meshy', height: 1.78, run: mbappeSrc.userData.run }) },
  yamal: { id: 'yamal', name: 'Yamal', label: 'YAMAL', color: '#ff5a4a', ch: new Character(yamalSrc, { kind: 'meshy', height: 1.80, run: yamalSrc.userData.run }) },
  kane: { id: 'kane', name: 'Kane', label: 'KANE', color: '#ff4d5a', ch: new Character(kaneSrc, { kind: 'meshy', height: 1.88, run: kaneSrc.userData.run }) },
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
// Cristiano's car: a Bugatti Chiron (model by Bob Kimani, Kimz Auto), 4.54 m long, nose along +x.
function makeCar(m = carSrc, len = 4.54, yaw = Math.PI / 2) {
  const g = new THREE.Group();
  m.rotation.y = yaw; m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m), k = len / (b.max.x - b.min.x);
  m.scale.setScalar(k); m.updateMatrixWorld(true); b.setFromObject(m);
  m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const mt = o.material; if (mt.metalness > 0.3) { mt.envMap = ENV; if (mt.color.r + mt.color.g + mt.color.b < 0.08) { mt.metalness = 0.15; mt.envMapIntensity = 0.35; } } } });
  g.add(m); return g;
}
// Cristiano's car: a Mercedes-AMG G63 whose four doors open and shut (the model's own animation: closed, open,
// closed again over its length).
const car = makeCar(prepCar(carSrc), 4.87, Math.PI / 2); car.visible = false; scene.add(car);   // model nose along +z
const carMix = new THREE.AnimationMixer(carSrc), carClip = carSrc.userData.clips?.[0];
if (carClip) carMix.clipAction(carClip).play();
// 0 = doors shut, 1 = wide open.
function setDoors(k) { if (!carClip) return; carMix.setTime(clamp(k, 0, 1) * carClip.duration * 0.5); }
setDoors(0);
// Animated open/close; a newer call (or setDoors via shutDoors) cancels an older one still running.
let doorTok = 0;
const doorsTo = (k, sec = 0.6) => { const k0 = car.userData.doors ?? 0, tok = ++doorTok; car.userData.doors = k; return tween(sec, e => { if (tok === doorTok) setDoors(lerp(k0, k, e)); }); };
const shutDoors = () => { doorTok++; car.userData.doors = 0; setDoors(0); };
// His chauffeur, in a dark suit, at the wheel (seen through the glass).
const chauffeur = new Character(kidSrc, { kind: 'mixamo', height: 1.78 }); dress(chauffeur, { top: '#15171c', bottom: '#15171c', skin: '#8f5f42', shoes: '#111' });
seatDriver(chauffeur, car);
// The rear door on the side you come from: where to stand to get in.
function carDoorFor(from) {
  car.updateMatrixWorld(true);
  const cc = new THREE.Box3().setFromObject(car).getCenter(new V3());
  let best = null, bd = 1e9;
  for (const n of ['Plane043_47', 'Plane044_122']) { const d = car.getObjectByName(n); if (!d) continue; const dd = new THREE.Box3().setFromObject(d).getCenter(new V3()).distanceTo(from); if (dd < bd) { bd = dd; best = d; } }
  if (!best) return null;
  return { node: null, sign: 1, mid: new THREE.Box3().setFromObject(best).getCenter(new V3()), centre: cc };
}
// The rivals' car: a Ferrari LaFerrari ("Ferrari Laferrari" by vecarz, Sketchfab), loaded in the background.
const ferrariP = load('models/ferrari.glb').then(m => {
  m.traverse(o => { if (o.isMesh) { const mt = o.material; if (mt.color && mt.color.r > 0.55 && mt.color.g < 0.5 && mt.color.b < 0.5) { mt.color.setRGB(0.32, 0.0, 0.004); if (mt.map) mt.map = null; mt.metalness = 0.3; mt.roughness = 0.28; mt.envMap = ENV; mt.envMapIntensity = 0.55; mt.needsUpdate = true; } } });
  m.traverse(o => { if (o.isMesh && o.material.name === 'Glasses') { o.material.opacity = 0.18; o.material.depthWrite = false; o.renderOrder = 2; } });
  const f = makeCar(m, 4.7); f.visible = false; scene.add(f); return f;
}).catch(() => null);
// The two stars you did not pick: they chase the Ballon d'Or too, one step behind you.
const rivals = () => Object.values(HEROES).filter(h => h !== hero);
const rivalState = { on: false, mode: 'idle', run: [] };
// The painted Rio sky (panorama, horizon band and clouds made by GOUAL ART), facing the bay to the south.
const sky = makeSky(art.T, art.meta, { turn: 0.125, low: -0.16, high: 0.26 }); scene.add(sky);
const clouds = makeClouds(art.T, art.meta, 18); clouds.scale.setScalar(1.6); scene.add(clouds);
// Street life from the favela kit: caramel dogs, plastic chairs, gas bottles, crates and laundry.
{
  const K = kitMaterials(), b = new Builder(), RR = (() => { let x = 11; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  const at = (x, z, yMax = 30) => new V3(x, groundAt(x, z, yMax), z);
  const put = (p, rot, fn) => { b.push(p, rot); fn(); b.pop(); };
  // Street dogs: "dog" by neighbor (Sketchfab, CC BY 4.0), in the caramel coat of the vira-lata caramelo.
  load('models/dog.glb').then(src => {
    const coats = ['#c98a4b', '#b5743a', '#d9a066'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
    [[-12.6, 21, 0.6, 0.8], [-16.5, 30.5, 0.6, 2.4], [14.5, 30, 0.6, -1.2], [-3.5, -8.2, 3.6, 1.4], [9, -23.6, 6.6, -2], [-20, -9, 3.6, 0.3]].forEach(([x, z, y, r], i) => {
      const d = src.clone(); d.traverse(o => { if (o.isMesh) { o.material = coats[i % 3]; o.castShadow = true; } });
      const g = new THREE.Group(); g.add(d); d.position.y = 0.256; g.position.copy(at(x, z, y)); g.rotation.y = r; scene.add(g);
    });
  }).catch(() => {});
  for (const [x, z, y, r] of [[-8, -12.6, 3.6, 2.1]]) put(at(x, z, y), r, () => clutter(b, K, RR, 'chairs'));
  for (const [x, z, y, k] of [[-21, 31, 0.6, 'gas'], [22.5, 25, 0.6, 'crates'], [18, -12.2, 3.6, 'bags'], [-14, -24, 6.6, 'crates'], [3, -27.4, 6.6, 'gas']]) put(at(x, z, y), RR() * 6, () => clutter(b, K, RR, k));
  laundry(b, K, RR, new V3(-6, 5.2, 27.6), new V3(6, 5.4, 27.6));
  laundry(b, K, RR, new V3(-12, 8.4, -11.3), new V3(-2, 8.6, -11.3));
  const g = new THREE.Group(); b.build(g); scene.add(g);
  // The hill behind the favela and both sides: real favela houses (walls, windows, slabs) in terraces,
  // instead of plain coloured boxes.
  const hb = new Builder(), HR = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  const terrace = (x, y, z, rot) => { hb.push(new V3(x, y, z), rot); hb.add(new THREE.BoxGeometry(8, 12, 7), K.concrete, 0, -6, -3.5); house(hb, K, HR, { floors: 1 + Math.floor(HR() * 3) }); hb.pop(); };
  for (let r = 0; r < 8; r++) { const z = -70 - r * 17, y = 9 + (-66 - z) * 0.32 - 1.5; for (let x = -118 + HR() * 6; x < 118; x += 7.5 + HR() * 3) terrace(x, y + HR() * 0.8, z, (HR() - 0.5) * 0.12); }
  for (const side of [-1, 1]) for (let r = 0; r < 4; r++) { const px = side * (60 + r * 16); for (let z = -58; z < 48; z += 7.5 + HR() * 3) terrace(px, -6 + r * 3 + HR() * 0.8, z, side > 0 ? -Math.PI / 2 : Math.PI / 2); }
  const hg = new THREE.Group(); hb.build(hg, { shadow: false }); scene.add(hg);
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
  btn('#bSiu', () => { IN.siu = true; });
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
const COLORS = { CR7: '#ffd400', AGENT: '#2ee6ff', DRIVER: '#c9c9c9', MESSI: '#8fd0ff', 'ZÉ': '#ff8a3d', THIAGO: '#7cfc00', LUCAS: '#ff6bd6', KIDS: '#ffffff' };
const speakers = () => ({ HERO: me, CR7: ronaldo, 'ZÉ': ze, THIAGO: thiago, LUCAS: lucas, MESSI: thief, RIVAL1: rivals()[0].ch, RIVAL2: rivals()[1].ch });
// Lines are written with HERO for whoever you play and {HERO} for their name; each hero has its own voice.
const heroText = t => t.replaceAll('{HERO}', hero.name);
let talking = null;
function line(who, text) {
  return new Promise(res => {
    const sub = $('#sub'), whoEl = sub.querySelector('.who'), lineEl = sub.querySelector('.line');
    text = heroText(text);
    sub.classList.remove('hidden'); whoEl.textContent = who === 'AGENT' ? 'AGENT (PHONE)' : who === 'DRIVER' ? 'CR7\'S DRIVER' : who === 'HERO' ? hero.label : who === 'RIVAL1' ? rivals()[0].label : who === 'RIVAL2' ? rivals()[1].label : who; whoEl.style.color = who === 'HERO' ? hero.color : who === 'RIVAL1' ? rivals()[0].color : who === 'RIVAL2' ? rivals()[1].color : COLORS[who] || '#fff';
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
    audio.speak(who === 'HERO' ? hero.id.toUpperCase() : who === 'RIVAL1' ? rivals()[0].id.toUpperCase() : who === 'RIVAL2' ? rivals()[1].id.toUpperCase() : who, text).then(ok => { spoke = ok; setTimeout(finish, ok ? 380 : Math.max(0, 1300 + text.length * 48 - (performance.now() - t0))); });
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
// The duel with Cristiano: the penalty (default), or '?duel=goal' for the goal-to-goal we tried.
const DUEL = params.get('duel') === 'goal' ? 'goal' : 'pen';
const STAGES = { INTRO: 0, FIND: 1, CR7: 2, PENS: 3, CAR: 4, RIDE: 5, END: 6, AIRPORT: 7, TERMINAL: 8, SPOT: 9, CHASE: 10, ESCAPE: 11, WIN: 12, DUBAI: 13, DRIVE: 14 };
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
  $('#letterbox').classList.remove('on'); release(); popMode(); pushMode('free'); P.mode = 'free'; behindCam();
  if (TOUCH) $('#touch').classList.remove('hidden');
  audio.base = 0; audio.carnival = 0;
  state.t0 = performance.now();
  hint(TOUCH ? 'Left thumb to move · drag to look · CELEBRATE button' : 'WASD / ZQSD to move · mouse to look · Shift to sprint · Space to jump / climb', 7);
  setObjective('CHAPTER 1 · THE CAGE', 'Find Cristiano at the cage court', () => ronaldo.root.position);
  state.stage = STAGES.FIND;
  setTimeout(() => { if (mode() === 'free') hint(TOUCH ? 'CELEBRATE = show off' : 'C = celebrate', 6); }, 9000);
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
const cr7 = { juggle: true, t: 0, walk: 0, keeper: false, kick: -1 };
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
    ...(DUEL === 'goal' ? [
      ['CR7', 'Here is the deal. Goal to goal, one on one. You stay in your half, I stay in mine.'],
      ['CR7', 'We shoot in turns, from where the ball stops. Score once, and I give you a clue.'],
      ['HERO', 'Deal. But you will not score on me either.'],
      ['CR7', 'Nobody scores on Cristiano. Nobody!'],
    ] : [
      ['CR7', 'Here is the deal. Score a penalty against me, and I give you a clue.'],
      ['HERO', 'You? In goal?'],
      ['CR7', 'Nobody scores on Cristiano. Nobody!'],
    ]),
  ]);
  // The little show: SIUUU, the gloves go on, and he jogs to his line while the kids gather round.
  ronaldoSiu = 0; setTimeout(() => audio.siu(), 380);
  shot(ronaldo.root.position.clone().add(new V3(-3.4, 1.4, -1.2)), ronaldo.root.position.clone().add(new V3(0, 1.2, 0)), { follow: 2 });
  await sleep(2.1);
  gloves.set(true); audio.blip(520); toast('CR7 IN GOAL!', '#ffd400'); cr7.clap = 0;
  await sleep(1.0);
  if (DUEL === 'goal') {   // goal to goal uses the whole pitch: the kids watch from along the north wall
    kids.forEach((k, i) => { k.target.set([-9, -5, 5, 9][i], 0, 2.9); k.watch = true; });
    thiago.root.position.set(0, 0, 2.9); thiago.root.rotation.y = 0;
  } else {
    kids.forEach((k, i) => { k.target.set(SPOT.x - 2.2 - (i % 2) * 0.8, 0, 10 + (i < 2 ? -3.2 - i * 0.9 : 3.2 + (i - 2) * 0.9)); k.watch = true; });
    thiago.root.position.set(SPOT.x - 3.4, 0, 14.6); thiago.root.rotation.y = 2.2;
  }
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
  let tries = 0, won = false;
  if (DUEL === 'goal') {
    // Goal to goal: each in his own half, shooting in turns from where the ball stopped, until you score.
    let mine = 0, his = 0, rest = new V3(-3.5, 0, 10);
    const score = () => setObjective('CHAPTER 1 · THE CAGE', `Goal to goal · score on Cristiano  (CR7 ${his})`, null);
    score();
    while (true) {
      penSpot = rest; won = await penaltyChallenge(tries++);
      if (won) break;
      rest = new V3(3 + Math.random() * 6, 0, 4.5 + Math.random() * 11);          // the ball stops in his half
      const cr7Scored = await cr7Turn(rest);
      if (cr7Scored) { his++; score(); }
      await conversation(ronaldo, [cr7Scored ? pick([['CR7', 'Siuuu! Your turn.'], ['CR7', 'Too strong for you!']]) : pick([['CR7', 'Good save… Your turn.'], ['CR7', 'Lucky! Your turn.']])]);
      rest = new V3(-(3 + Math.random() * 6), 0, 4.5 + Math.random() * 11);       // and back in yours
    }
    penSpot = SPOT;
  } else {
    setObjective('CHAPTER 1 · THE CAGE', 'Score a penalty against Cristiano', null);
    while (!won) {
      won = await penaltyChallenge(tries++);
      if (!won) await conversation(ronaldo, [pick([['CR7', 'Saved! Again, again!'], ['CR7', 'Ha! Too easy. One more!'], ['CR7', 'Is that all? Try again.'], ['CR7', 'Come on, you can do better than that!']])]);
    }
  }
  await afterGoal();
}
async function afterGoal() {
  pushMode('dialog'); cr7.keeper = false; gloves.set(false); $('#letterbox').classList.add('on');
  siuT = -1; P.spin = 0; act(null, 0);   // stop the goal celebration (its half turn would put his back to CR7)
  ronaldo.root.position.copy(keeperBase(0)).addScaledVector(GOAL.n, 2.2);
  P.pos.copy(ronaldo.root.position).addScaledVector(GOAL.n, 1.5);
  faceEachOther(ronaldo);
  // Face to face, close, over the hero's shoulder (works upright on a phone too).
  { const r = ronaldo.root.position, d = r.clone().sub(P.pos).setY(0).normalize(), side = new V3(d.z, 0, -d.x);
    shot(P.pos.clone().addScaledVector(d, -1.9).addScaledVector(side, 0.55).add(new V3(0, 1.75, 0)), r.clone().add(new V3(0, 1.5, 0)), { cut: true }); }
  await say([
    [DUEL === 'goal' ? ['CR7', '…Okay. Nice goal. Very good.'] : ['CR7', '…Okay. Good penalty. Very good.']][0],
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
  P.yaw = Math.atan2(CAR_STOP - P.pos.x, CAR_Z - P.pos.z); behindCam();
  state.stage = STAGES.CAR;
  setObjective('CHAPTER 1 · THE CAGE', 'Get in Cristiano\'s car, on the road', car.position.clone().add(new V3(0, 0, -1.3)));
}
const CAR_Z = 33.2, CAR_FROM = 62, CAR_STOP = 1.8;
const carBox = { x0: CAR_STOP - 2.6, y0: 0, z0: CAR_Z - 1, x1: CAR_STOP + 2.6, y1: 1.4, z1: CAR_Z + 1 };
async function rideAway() {
  state.stage = STAGES.RIDE; pushMode('cut'); prompt(null); $('#letterbox').classList.add('on'); if (document.pointerLockElement) document.exitPointerLock();
  $('#touch').classList.add('hidden');
  colliders.splice(colliders.indexOf(carBox), 1); indexColliders();
  ball.mesh.visible = false;
  // The door is already open: the hero walks up to it...
  const D = carDoorFor(P.pos), nose = new V3(-1, 0, 0);
  let seat = car.position.clone();
  if (D) {
    await doorsTo(1, 0.7);
    const out = D.mid.clone().sub(D.centre).setY(0).normalize(), stand = D.mid.clone().addScaledVector(out, 1.0); stand.y = 0;
    seat = D.centre.clone().addScaledVector(out, 0.36).add(new V3(D.mid.x - D.centre.x, 0, 0).multiplyScalar(0.9)); seat.y = 0;
    shot(stand.clone().addScaledVector(out, 3.2).add(new V3(2.2, 1.7, 0)), D.mid.clone().add(new V3(0, 0.4, 0)), { cut: true });
    const from = P.pos.clone(); P.yaw = Math.atan2(stand.x - from.x, stand.z - from.z);
    await tween(Math.max(0.4, from.distanceTo(stand) / 2.4), k => { P.pos.lerpVectors(from, stand, k); P.vel.set(Math.sin(P.yaw) * 2.4, 0, Math.cos(P.yaw) * 2.4); });
    P.vel.set(0, 0, 0); P.yaw = Math.atan2(-out.x, -out.z);
    await sleep(0.35);
  }
  // ...cut: Cristiano, at the cage gate, waves him off. (The hero is in the car; the door shuts.)
  me.root.visible = false; P.seated = true; shutDoors(); audio.kick(0.35);
  ronaldo.root.position.set(0, 0, 19.5); ronaldo.root.rotation.set(0, Math.atan2(CAR_STOP, CAR_Z - 19.5), 0); cr7.juggle = false; cr7Ball.mesh.visible = false;
  shot(new V3(-0.9, 1.7, 22.2), new V3(0, 1.45, 19.5), { cut: true });
  await say([['CR7', 'Good luck, {HERO}. Bring it back!']]);
  // Off he goes; the red Ferrari takes its place in the same shot, stops, the other two talk, and it races off.
  audio.engine?.(4);
  shot(new V3(-8.5, 1.7, CAR_Z + 5.6), new V3(-12, 0.9, CAR_Z), { cut: true });
  const fer = await ferrariP;
  if (fer) { fer.visible = true; fer.rotation.y = Math.PI; fer.position.set(34, 0, CAR_Z); }
  // The Bugatti pulls away and the Ferrari is already rolling in (no empty street on narrow phone screens).
  if (fer) { fer.position.x = 16; }
  await tween(0.9, (k, raw) => { car.position.x = CAR_STOP - 95 * raw * raw; });
  if (fer) {
    rivals().forEach((r, i) => { const ch = r.ch; fer.add(ch.root); ch.root.visible = true; ch.root.position.set(-0.3, -0.82, i ? 0.27 : -0.27); ch.root.rotation.set(0, Math.PI / 2, 0); });
    rivalState.on = true; rivalState.mode = 'seated'; audio.engine?.(3);
    await tween(1.1, k => { fer.position.x = lerp(16, -12, 1 - (1 - k) * (1 - k)); });
    fer.updateMatrixWorld(true);
    const fFront = fer.localToWorld(new V3(1.0, 0, 0)).sub(fer.position).setY(0).normalize();   // the Ferrari's nose direction
    const fc = fer.position.clone().add(new V3(0, 0.75, 0));
    shot(fc.clone().addScaledVector(fFront, 3.4).add(new V3(fFront.z * 0.9, 0.45, -fFront.x * 0.9)), fc.clone().add(new V3(0, 0.15, 0)), { cut: true });
    await say([['RIVAL1', '{HERO} is in that Bugatti… Follow him!'], ['RIVAL2', 'That Ballon d\'Or is ours. Floor it!']]);
    shot(new V3(-8.5, 1.7, CAR_Z + 5.6), new V3(-12, 0.9, CAR_Z), { cut: true });
    audio.engine?.(3);
    await tween(1.3, (k, raw) => { fer.position.x = -12 - 100 * raw * raw; });
    fer.visible = false; rivalState.mode = 'away';
  }
  $('#fade').classList.add('on', 'trip');
  await sleep(0.9);
  await enterAirport();
  await arriveAirport();
}
function endScreen(how) {
  state.stage = STAGES.END; audio.base = 1; audio.carnival = 1;
  const t = Math.round(state.playTime); $('#eTime').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('#eCards').textContent = `${state.cards}/${cards.length}`; $('#eStyle').textContent = state.style.toLocaleString('en');
  const flew = how === 'dubai';
  if (how === 'hideout') {
    $('#end .kicker').textContent = 'EPISODE 3 COMPLETE · TO BE CONTINUED'; $('#end h2').firstChild.textContent = 'MESSI\'S HIDEOUT';
    $('#eWho').textContent = `See you inside, ${hero.name}`;
    $('#letterbox').classList.remove('on'); $('#fade').classList.remove('on', 'world', 'trip'); $('#end').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); $('#speedo')?.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    post('complete', { time: t, cards: state.cards, style: state.style, hero: hero.id }); return;
  }
  $('#end .kicker').textContent = flew ? 'EPISODE 2 COMPLETE · TO BE CONTINUED' : 'EPISODE 2 COMPLETE · TO BE CONTINUED'; $('#end h2').firstChild.textContent = flew ? 'NEXT STOP: DUBAI' : 'BALLON D\'OR RECOVERED';
  $('#eWho').textContent = flew ? `Fly safe, captain ${hero.name}` : `Well played, ${hero.name}`;
  $('#letterbox').classList.remove('on'); $('#fade').classList.remove('on'); $('#end').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  post('complete', { time: t, cards: state.cards, style: state.style, hero: hero.id });
}

// ================= episode 2: the airport =================
// The car drops you at the terminal. The Ballon d'Or is inside... in the arms of a thief who runs for a
// private jet. Catch him before he reaches the stairs (as many tries as it takes).
const AP = {
  DOORS: [{ x0: 14, x1: 24, z0: -43, z1: -35, y1: 30 }, { x0: -7, x1: 7, z0: -6, z1: 1, y1: 30 }, { x0: -21, x1: -8, z0: 26, z1: 40, y1: 30 }],
  CAR_Z0: 120, CAR_STOP: new V3(30, 0, -42),
  THIEF_START: new V3(1, 0, -22),
  PATH: [new V3(6, 0, -20), new V3(8.8, 0, -14), new V3(8.8, 0, -7.5), new V3(4, 0, -6.5), new V3(2.5, 0, -3), new V3(1.5, 0, 0), new V3(2, 0, 3), new V3(2, 0, 30.3), new V3(-22, 0, 30.3), new V3(-21, 0, 60), new V3(-45, 0, 75), new V3(-61, 0, 88)],
  CATCH_CHANCE: 0.25,
  THIEF_SPEED: 4.8,
};
let thief = null;
const trophy = new THREE.Group(); trophy.add(makeBallonDor(ENV)); trophy.visible = false; scene.add(trophy);
// The real Ballon d'Or model (the one on the coach's desk on the main site), 46 cm tall, base at the origin.
load('../models/ballon-dor.glb').then(m => {
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material.metalness = 1; o.material.roughness = Math.max(0.18, o.material.roughness); o.material.envMap = ENV; o.material.envMapIntensity = 2.4; o.material.emissive = new THREE.Color('#5a3a08'); o.material.emissiveIntensity = 0.35; } });
  const b = new THREE.Box3().setFromObject(m); m.scale.setScalar(0.46 / (b.max.y - b.min.y)); m.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new V3()); m.position.set(-c.x, -b2.min.y, -c.z);
  trophy.clear(); trophy.add(m);
}).catch(() => {});
const theft = { i: 0, run: false, fallen: false, slipped: false, boost: 0 };
async function enterAirport() {
  const [{ wallColliders, carve, floorColliders, splitGlass }, src, ...blds] = await Promise.all([import('./airport.js?v=7'), load('models/airport.glb'), ...['Large_2', 'Medium_2_001', 'Small_1'].map(n => load(`models/bld-${n}.glb`))]);
  // Leave the favela: hide it all (lights, sky, car and the stars stay), swap the colliders.
  const keep = new Set([sun, sun.target, sky, clouds, car, ball.mesh, trophy, await ferrariP, ...Object.values(HEROES).map(h => h.ch.root)]);
  // The favela is not coming back: free its GPU memory (geometries and textures are re-uploaded if ever reused).
  for (const o of [...scene.children]) if (!keep.has(o) && !o.isLight) {
    o.traverse(m => { if (m.isMesh || m.isInstancedMesh) { m.geometry?.dispose(); for (const mt of [].concat(m.material)) { for (const k in mt) if (mt[k] && mt[k].isTexture) mt[k].dispose(); mt.dispose?.(); } } });
    scene.remove(o);
  }
  for (const c of cards) c.got = true;
  renderer.renderLists.dispose();
  AP.root = src;
  splitGlass(src);   // the glass panels are see-through again (they hid the check-in desks and security)
  // The runway model sits on a 1 m slab: lower it so it is flush with the apron (planes and players stood under it).
  { const rw = src.getObjectByName('LandingTrack1Straight'); if (rw) { src.updateMatrixWorld(true); const top = new THREE.Box3().setFromObject(rw).max.y; const wp = rw.getWorldPosition(new V3()); wp.y -= top - 0.02; rw.position.copy(rw.parent.worldToLocal(wp)); } }
  // The jet, the cabin and Rio from the sky load only when Messi gets away (keeps memory low on iPads).
  AP.loadFlight = () => { AP.jetP ??= load('models/jet.glb').catch(() => null); AP.cabinP ??= load('models/cabin.glb').catch(() => null); };
  sky.material.uniforms.single.value = 1;   // only one Corcovado in the sky over the airport
  carve(src, AP.DOORS);
  // Bright terminal, like the model's own preview: only the low props cast shadows (the roof and the big
  // halls no longer throw the whole terminal into shade), plus a soft light that fills the inside.
  src.traverse(o => { if (o.isMesh) { const bb = new THREE.Box3().setFromObject(o); o.castShadow = !o.userData.glass && bb.max.y < 4.5 && bb.max.y - bb.min.y < 4; o.receiveShadow = !o.userData.glass; } });
  hemi.intensity = 1.9; hemi.color.set(0xe8f0ff); hemi.groundColor.set(0xb8a890);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  for (const [x, z] of [[2, -50], [-8, -55], [2, -25], [-8, -15], [0, 15], [-8, 45]]) { const l = new THREE.PointLight(0xfff4e0, 18, 26, 1.6); l.position.set(x, 5.5, z); scene.add(l); }
  scene.add(src);
  const W2 = wallColliders(src, { open: AP.DOORS, skip: o => /LandingTrack/.test(o.name + (o.parent ? o.parent.name : '')) });
  // Floors: the terminal's floor sits a little above 0, so we read it from the model (feet no longer sink in).
  const F2 = floorColliders(src, { maxY: 1.3 });
  colliders.length = 0; colliders.push({ x0: -600, x1: 600, z0: -600, z1: 600, y0: -2, y1: 0 }, ...W2.boxes, ...F2); indexColliders();
  exitGuide();
  // Ground: concrete apron, and the road on the city side where the car arrives.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x9a9d96, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 600), new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(31, -0.01, 0); road.receiveShadow = true; scene.add(road);
  buildCity(blds);
  terminalCrowd();
  // The thief: black suit, cap, the golden ball under his arm.
  // The thief is Lionel Messi ("Model messi" by franko981, Sketchfab, CC BY 4.0).
  thief = new Character(await load('models/messi.glb'), { kind: 'mixamo', height: 1.70 });
  thief.root.position.copy(AP.THIEF_START); thief.root.position.y = Math.max(0, groundAt(AP.THIEF_START.x, AP.THIEF_START.z, 1)); thief.root.rotation.y = Math.PI / 2; scene.add(thief.root);
  trophy.visible = true;
  for (let i = 1; i < AP.PATH.length; i++) for (let k = 0; k <= 1; k += 0.02) { const p = AP.PATH[i - 1].clone().lerp(AP.PATH[i], k); if (W2.has(p.x, p.z)) { console.warn('thief path blocked at', p.x.toFixed(1), p.z.toFixed(1)); break; } }
  return W2;
}
// Across the road from the terminal: a row of city buildings ("Downtown City MegaKit" by Quaternius, CC0),
// sidewalks, lane markings and people walking by.
const walkers = [];
function buildCity(blds) {
  const side = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 }), white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  for (const [x, w] of [[39.5, 5], [23, 4]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 600), side); m.position.set(x, 0.06, 0); m.receiveShadow = true; scene.add(m); colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: -300, z1: 300, y0: -1, y1: 0.14 }); }
  const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 3), white, 100); const M4 = new THREE.Matrix4();
  for (let i = 0; i < 100; i++) { M4.makeRotationX(-Math.PI / 2).setPosition(31, 0.01, -300 + i * 6); dash.setMatrixAt(i, M4); } scene.add(dash);
  colliders.push({ x0: 41.5, x1: 44, z0: -300, z1: 300, y0: 0, y1: 3 }); indexColliders();
  // Buildings, fronts facing the airport (model front is +z; turned to face -x).
  for (const b of blds) b.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.geometry.deleteAttribute('color'); for (const m of [].concat(o.material)) m.vertexColors = false; } });
  const W8 = [20.6, 15, 12.4], order = [0, 2, 1, 0, 1, 2, 1, 0, 2, 1];
  let z = -125;
  for (const k of order) {
    const m = blds[k].clone(); m.rotation.y = -Math.PI / 2; m.position.set(42, 0, z + W8[k] / 2 - (k === 0 ? 1 : k === 1 ? 0 : -1)); scene.add(m);
    z += W8[k] + 3;
  }
  // People walking along both sidewalks.
  const LOOKS = [{ top: '#2b3a55', bottom: '#1c1c1c', skin: '#e0b48f' }, { top: '#c23b3b', bottom: '#2a2a2a', skin: '#8f5f42' }, { top: '#f2f2f2', bottom: '#3d4f7a', skin: '#c99a76' }, { top: '#e8b923', bottom: '#222', skin: '#6e4630' }, { top: '#3a7d44', bottom: '#d9cbb0', skin: '#b98566' }, { top: '#6b4fa0', bottom: '#111', skin: '#e3c09c' }];
  for (let i = 0; i < 10; i++) {
    const ch = new Character(kidSrc, { kind: 'mixamo', height: 1.62 + (i % 4) * 0.07 }); dress(ch, { ...LOOKS[i % LOOKS.length], shoes: '#222' });
    const far = i % 2 === 0, x = far ? 39 + (i % 3) * 0.6 : 23.2 + (i % 3) * 0.5;
    const w = { ch, x, z: -110 + i * 19, dir: i % 4 < 2 ? 1 : -1, speed: 1.1 + (i % 3) * 0.2, z0: -120, z1: 70 };
    ch.root.position.set(x, 0, w.z); scene.add(ch.root); walkers.push(w);
  }
}
// A rolling suitcase: shell, wheels and a pulled-out handle (origin on the floor, handle towards -z).
function suitcase(color) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color, roughness: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.58, 0.24), m); body.position.y = 0.34; body.castShadow = true; g.add(body);
  for (const x of [-0.15, 0.15]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.035, -0.08); g.add(w);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.02), dark); rod.position.set(x * 0.8, 0.8, -0.1); g.add(rod); }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.04), dark); grip.position.set(0, 0.98, -0.1); g.add(grip);
  scene.add(g); return g;
}
// Travellers inside the terminal: a queue at three check-in desks and people pulling suitcases through the hall.
function terminalCrowd() {
  const LOOKS = [{ top: '#3d5a80', bottom: '#222', skin: '#e0b48f' }, { top: '#e07a5f', bottom: '#2f3e46', skin: '#8f5f42' }, { top: '#f4f1de', bottom: '#5c4d3c', skin: '#c99a76' }, { top: '#81b29a', bottom: '#1d1d1d', skin: '#6e4630' }, { top: '#9b2335', bottom: '#d9cbb0', skin: '#e3c09c' }, { top: '#222', bottom: '#4a5a7a', skin: '#b98566' }, { top: '#f2cc8f', bottom: '#333', skin: '#7a4a32' }];
  const BAGS = [0x1f4e79, 0xb22222, 0x2e2e2e, 0x6a994e, 0xd4a017, 0x7b2d8b];
  let n = 0;
  const person = (x, z) => { const ch = new Character(kidSrc, { kind: 'mixamo', height: 1.6 + (n % 4) * 0.07 }); dress(ch, { ...LOOKS[n % LOOKS.length], shoes: '#222' }); const y = Math.max(0, groundAt(x, z, 1.5)); ch.root.position.set(x, y, z); scene.add(ch.root); return [ch, y, BAGS[n++ % BAGS.length]]; };
  // The queues: people one behind the other in front of the counters (counters face +x at x = -12).
  for (const [z, k] of [[-38.5, 3], [-45.5, 4], [-52.5, 3]]) for (let i = 0; i < k; i++) {
    const x = -10.2 + i * 1.15, zz = z + (i % 2 ? 0.12 : -0.1), [ch, y, bag] = person(x, zz);
    const b = suitcase(bag); b.position.set(x + 0.1, y, zz + 0.45); b.rotation.y = -Math.PI / 2 + 0.2;
    walkers.push({ ch, x, z: zz, y, dir: 0, speed: 0, yaw: -Math.PI / 2 });
    colliders.push({ x0: x - 0.3, x1: x + 0.35, z0: zz - 0.3, z1: zz + 0.65, y0: y, y1: y + 1.8 });
  }
  // Walking through the hall, suitcase rolling behind.
  for (const [x, z, dir, sp] of [[5, -60, 1, 1.15], [7.5, -34, -1, 1.3], [-5.4, -64, 1, 1.0], [5.8, -45, -1, 1.2], [-5.4, -40, -1, 1.25], [8.4, -52, 1, 1.05]]) {
    const [ch, y, bag] = person(x, z);
    walkers.push({ ch, x, z, y, dir, speed: sp, z0: -64, z1: -28, bag: suitcase(bag) });
  }
  indexColliders();
}
function updateWalkers(dt) {
  for (const w of walkers) {
    if (w.speed) { w.z += w.dir * w.speed * dt; if (w.z > w.z1) w.dir = -1; else if (w.z < w.z0) w.dir = 1; }
    const yaw = w.yaw ?? (w.dir > 0 ? 0 : Math.PI), r = w.ch.root;
    r.position.set(w.x, w.y || 0, w.z); r.rotation.y += angDiff(r.rotation.y, yaw) * (1 - Math.exp(-dt * 6));
    w.ch.animate({ dt, speed: w.speed, grounded: true });
    // The suitcase rolls behind, on the right, tilted towards the hand.
    if (w.bag) { const f = Math.sin(r.rotation.y), c = Math.cos(r.rotation.y); w.bag.position.set(w.x - f * 0.55 - c * 0.3, w.y || 0, w.z - c * 0.55 + f * 0.3); w.bag.rotation.set(0, r.rotation.y + Math.PI, 0); w.bag.rotateX(-0.45); }
  }
}
// The way out to the tarmac: glowing yellow arrows on the floor and big green signs over the openings.
function exitGuide() {
  const way = [new V3(14, 0, -39), new V3(7, 0, -27), new V3(8.8, 0, -14), new V3(8.8, 0, -7.5), new V3(4, 0, -6.5), new V3(2.5, 0, -3), new V3(1.5, 0, 0), new V3(2, 0, 3), new V3(2, 0, 30.8), new V3(-24, 0, 30.8), new V3(-22, 0, 52)];
  const sh = new THREE.Shape(); sh.moveTo(-0.55, -0.35); sh.lineTo(0, 0.25); sh.lineTo(0.55, -0.35); sh.lineTo(0.55, -0.05); sh.lineTo(0, 0.55); sh.lineTo(-0.55, -0.05); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const pts = [];
  for (let i = 1; i < way.length; i++) { const a = way[i - 1], b = way[i], L = a.distanceTo(b); for (let d = 1.5; d < L; d += 3) pts.push([a.clone().lerp(b, d / L), Math.atan2(b.x - a.x, b.z - a.z)]); }
  const im = new THREE.InstancedMesh(geo, mat, pts.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion();
  pts.forEach(([p, yaw], i) => { p.y = Math.max(0, groundAt(p.x, p.z, 1)) + 0.03; Q.setFromAxisAngle(new V3(0, 1, 0), yaw + Math.PI); M.compose(p, Q, new V3(1, 1, 1)); im.setMatrixAt(i, M); });
  scene.add(im); AP.arrows = im;
  const sign = (text, x, y, z, ry) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#0a8a3a'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = '#fff'; g.font = '900 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    // Two single-sided faces back to back, so the text reads the right way from both sides.
    for (const flip of [0, Math.PI]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, y, z); m.rotation.y = ry + flip; scene.add(m); }
  };
  sign('GATES  ➜', 0, 3.6, -3, Math.PI); sign('➜  TARMAC', -12, 3.6, 30.8, Math.PI / 2); sign('EXIT  ➜', -18.5, 3.6, 30.8, Math.PI / 2);
}
// The world map card: the jet flies the route from Rio and stops half way.
function worldMap(full) {
  const route = $('#wRoute'), done = $('#wDone'), plane = $('#wPlane'), L = route.getTotalLength(), t0 = performance.now(), tbc = $('#fade .world .tbc');
  tbc.classList.remove('on'); tbc.textContent = full ? 'LANDING IN DUBAI…' : 'TO BE CONTINUED…'; done.style.strokeDasharray = L; done.style.strokeDashoffset = L;
  const step = now => { const k = Math.min(1, (now - t0) / 4200), e = (full ? 1 : 0.5) * (1 - Math.pow(1 - k, 2.4)), q = route.getPointAtLength(e * L), q2 = route.getPointAtLength(Math.min(L, e * L + 2));
    plane.setAttribute('transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) rotate(${(Math.atan2(q2.y - q.y, q2.x - q.x) * 180 / Math.PI).toFixed(1)})`); done.style.strokeDashoffset = (L * (1 - e)).toFixed(1);
    if (k < 1) requestAnimationFrame(step); else tbc.classList.add('on'); };
  requestAnimationFrame(step);
}
// Start a free-play moment with the camera right behind the hero, GTA style.
function behindCam() { cam.yaw = P.yaw; cam.pitch = 0.24; cam.target.set(P.pos.x, P.pos.y + 1.55, P.pos.z); cam.cur = cam.dist * cam.zoom; cam.override = null; cam.blend = 0; cam.ovPos = cam.ovLook = null; }
// A big location title, like a film caption.
function place(small, big) { const el = $('#place'); el.querySelector('small').textContent = small; el.querySelector('b').textContent = big; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
async function arriveAirport() {
  state.stage = STAGES.AIRPORT;
  car.visible = true; car.position.set(AP.CAR_STOP.x, 0, AP.CAR_Z0); car.rotation.y = Math.PI / 2; shutDoors();
  if (me.root.parent !== scene) scene.add(me.root); me.root.rotation.set(0, 0, 0); P.seated = false; act(null, 0); me.root.visible = false;
  shot(new V3(40, 3.2, -62), new V3(30, 1.2, -32), { cut: true });
  $('#fade').classList.remove('on', 'trip');
  setObjective('CHAPTER 2 · THE AIRPORT', 'Rio International Airport', null);
  place('RIO DE JANEIRO · BRAZIL', 'RIO AIRPORT');
  audio.airport?.();
  audio.engine?.(4.5);
  await tween(4.6, k => { car.position.z = lerp(AP.CAR_Z0, AP.CAR_STOP.z, 1 - (1 - k) * (1 - k)); });
  await sleep(0.4);
  await doorsTo(1, 0.6);
  P.pos.set(AP.CAR_STOP.x - 2.4, 0, AP.CAR_STOP.z + 1); P.yaw = -Math.PI / 2; P.vel.set(0, 0, 0); P.lastSafe.copy(P.pos);
  setTimeout(() => doorsTo(0, 0.7), 1500);
  me.root.visible = true; audio.kick(0.3);
  shot(new V3(AP.CAR_STOP.x + 1.5, 1.8, AP.CAR_STOP.z + 6), new V3(AP.CAR_STOP.x - 3, 1.5, AP.CAR_STOP.z), { cut: true });
  await say([
    ['DRIVER', 'Here we are, senhor {HERO}. Mister Ronaldo says the Ballon d\'Or is inside.'],
    ['DRIVER', 'Be careful. Somebody wants to fly away with it tonight.'],
    ['HERO', 'Then I better hurry.'],
  ]);
  colliders.push({ x0: AP.CAR_STOP.x - 1, x1: AP.CAR_STOP.x + 1, z0: AP.CAR_STOP.z - 2.3, z1: AP.CAR_STOP.z + 2.3, y0: 0, y1: 1.3 }); indexColliders();
  // The Ferrari screeches in right behind; the other two stars jump out.
  const fer = await ferrariP;
  if (fer && rivalState.on) {
    const stopZ = AP.CAR_STOP.z + 6.2;
    fer.visible = true; fer.rotation.y = Math.PI / 2; fer.position.set(AP.CAR_STOP.x, 0, stopZ + 32);
    shot(new V3(AP.CAR_STOP.x - 4.5, 1.9, AP.CAR_STOP.z + 2), new V3(AP.CAR_STOP.x, 0.9, stopZ), { cut: true }); audio.engine?.(3.5);
    await tween(1.6, k => { fer.position.z = lerp(stopZ + 32, stopZ, 1 - (1 - k) * (1 - k)); });
    // Cut on the hero: he turns to the red car — who's that?
    { const f = fer.position.clone().sub(P.pos).setY(0).normalize(); P.yaw = Math.atan2(f.x, f.z); P.vel.set(0, 0, 0);
      shot(P.pos.clone().addScaledVector(f, 2.3).add(new V3(f.z * 0.6, 1.65, -f.x * 0.6)), P.pos.clone().add(new V3(0, 1.5, 0)), { cut: true });
      await say([['HERO', 'Wait… who is that?']]); }
    audio.kick(0.3);
    rivals().forEach((r, i) => { scene.attach(r.ch.root); r.ch.root.rotation.set(0, -Math.PI / 2, 0); r.ch.root.position.set(AP.CAR_STOP.x - 2.3, 0.14, stopZ + (i ? 0.8 : -0.8)); r.ch.root.scale.setScalar(1); });
    rivalState.mode = 'stand';
    colliders.push({ x0: AP.CAR_STOP.x - 1, x1: AP.CAR_STOP.x + 1, z0: stopZ - 2.4, z1: stopZ + 2.4, y0: 0, y1: 1.2 }); indexColliders();
    shot(new V3(AP.CAR_STOP.x - 6.5, 1.7, stopZ - 1.5), new V3(AP.CAR_STOP.x - 2.3, 1.4, stopZ), { cut: true });
    await say([['RIVAL1', 'Not so fast, {HERO}! We want that Ballon d\'Or too.'], ['HERO', 'Then try to keep up.']]);
  }
  cam.yaw = -Math.PI / 2;
  $('#letterbox').classList.remove('on'); release(); state.modeStack = ['free']; P.mode = 'free'; behindCam();
  if (TOUCH) $('#touch').classList.remove('hidden');
  state.stage = STAGES.TERMINAL;
  setObjective('CHAPTER 2 · THE AIRPORT', 'Find the Ballon d\'Or inside the terminal', new V3(12, 0, -39));
}
// Holding the trophy: on the thief (carried at the hip) or up high in your right hand.
function carryTrophy(ch, up) {
  if (up) { ch.rot('rArm', new V3(1, 0, 0), -2.75); ch.rot('rFore', new V3(1, 0, 0), -0.35); }
  ch.root.updateMatrixWorld(true);
  trophy.position.copy(ch.bones.rHand.getWorldPosition(new V3())); trophy.position.y -= up ? 0.08 : 0.15; trophy.rotation.set(0, ch.root.rotation.y, 0);
}
async function spotThief() {
  state.stage = STAGES.SPOT; pushMode('dialog'); if (document.pointerLockElement) document.exitPointerLock();
  $('#letterbox').classList.add('on'); P.vel.set(0, 0, 0); prompt(null);
  rivalsBehind();
  // Messi dashes across the hall, the Ballon d'Or under his arm...
  const m0 = new V3(10, 0, -31), m1 = AP.THIEF_START.clone(); m0.y = Math.max(0, groundAt(m0.x, m0.z, 1)); m1.y = Math.max(0, groundAt(m1.x, m1.z, 1));
  thief.root.position.copy(m0); thief.root.rotation.set(0, Math.atan2(m1.x - m0.x, m1.z - m0.z), 0); theft.cut = 3.2;
  shot(new V3(8.5, 1.9, -24), new V3(6, 1.2, -28), { cut: true });
  await tween(m0.distanceTo(m1) / 3.2, k => { thief.root.position.lerpVectors(m0, m1, k); cam.override.look = thief.root.position.clone().add(new V3(0, 1.1, 0)); });
  theft.cut = 0;
  // ...stops, turns and taunts you.
  faceEachOther(thief);
  { const t = thief.root.position, d = t.clone().sub(P.pos).setY(0).normalize();
    shot(P.pos.clone().addScaledVector(d, -3.2).add(new V3(d.z * 1.6, 2.4, -d.x * 1.6)), t.clone().add(new V3(0, 1.2, 0)), { cut: true }); }
  await say([
    ['MESSI', 'Ha! Too late, {HERO}! This beauty is flying to Dubai tonight.'],
    ['HERO', 'Stop! That trophy belongs to football!'],
    ['MESSI', 'Catch me if you can!'],
  ]);
  $('#letterbox').classList.remove('on'); release(); popMode();
  { const t = thief.root.position; P.yaw = Math.atan2(t.x - P.pos.x, t.z - P.pos.z); behindCam(); }
  startChase();
}
function rivalsBehind() {
  if (!rivalState.on) return;
  const f = new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), side = new V3(f.z, 0, -f.x);
  rivals().forEach((r, i) => { r.ch.root.position.copy(P.pos).addScaledVector(f, -0.4).addScaledVector(side, i ? 1.7 : -1.7); r.ch.root.rotation.set(0, P.yaw, 0); });
  rivalState.mode = 'stand';
}
function startChase() {
  state.stage = STAGES.CHASE; theft.i = 0; theft.run = true; theft.fallen = false; theft.slipped = false; theft.boost = 0;
  thief.root.position.copy(AP.THIEF_START); thief.root.rotation.set(0, 0, 0);
  setObjective('CHAPTER 2 · THE AIRPORT', 'Stop Messi before he boards his jet!', () => thief.root.position);
  if (rivalState.on) {
    const RANK = { mbappe: 3, yamal: 2, kane: 1 }, rs = rivals(), fast = RANK[rs[0].id] > RANK[rs[1].id] ? 0 : 1;
    rivalState.mode = 'chase'; rivalState.run = rs.map((r, i) => ({ i: 0, lag: i === fast ? 1.2 : 2.6, k: i === fast ? 0.97 : 0.86, side: i ? 0.9 : -0.9 }));
  }
  hint(TOUCH ? 'Tap SPRINT and chase him!' : 'Hold Shift to sprint!', 5);
}
// The rivals run the thief's route, never quite reaching him (they stop a few metres behind).
function updateRivals(dt) {
  if (!rivalState.on) return;
  rivals().forEach((r, n) => {
    const ch = r.ch; let speed = 0, action = rivalState.mode === 'seated' ? 'sit' : null;
    if (rivalState.mode === 'chase' && state.stage === STAGES.CHASE) {
      const st = rivalState.run[n], p = ch.root.position, w = AP.PATH[Math.min(st.i, AP.PATH.length - 1)], wp = AP.PATH[Math.max(0, Math.min(st.i, AP.PATH.length - 1) - 1)];
      const seg = w.clone().sub(wp).setY(0); seg.lengthSq() > 0.01 ? seg.normalize() : seg.set(0, 0, 1);
      const tgt = w.clone().add(new V3(seg.z, 0, -seg.x).multiplyScalar(st.side));   // each keeps his own lane
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z), tp = thief.root.position, gap = Math.hypot(tp.x - p.x, tp.z - p.z);
      if (d < 0.8 && st.i < AP.PATH.length - 1) st.i++;
      const sp = gap < 2.8 + st.lag ? 0 : AP.THIEF_SPEED * (theft.slipped ? st.k + 0.08 : st.k);
      if (d > 0.05 && sp > 0) { const yaw = Math.atan2(tgt.x - p.x, tgt.z - p.z); ch.root.rotation.y += angDiff(ch.root.rotation.y, yaw) * (1 - Math.exp(-dt * 10)); const step = Math.min(d, sp * dt); p.x += (tgt.x - p.x) / d * step; p.z += (tgt.z - p.z) / d * step; p.y = Math.max(0, groundAt(p.x, p.z, p.y + 0.5)); speed = sp; }
    }
    if (rivalState.mode === 'away' && DRV.on && ch.root.parent !== scene) ch.animate({ dt, speed: 0, grounded: true, action: 'sit', actionT: 0 });
    if (rivalState.mode !== 'away') ch.animate({ dt, speed, grounded: true, action: talking === ch ? 'talk' : action, actionT: performance.now() / 1000, look: rivalState.mode === 'stand' ? lookAtPlayer(ch) : 0 });
  });
}
function updateThief(dt) {
  if (!thief) return;
  let speed = 0;
  if (state.stage === STAGES.CHASE && theft.run) {
    const tgt = AP.PATH[theft.i], p = thief.root.position, d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
    if (d < 0.4) { theft.i++; if (theft.i >= AP.PATH.length) { theft.run = false; escaped(); } }
    else {
      const yaw = Math.atan2(tgt.x - p.x, tgt.z - p.z); thief.root.rotation.y += angDiff(thief.root.rotation.y, yaw) * (1 - Math.exp(-dt * 10));
      theft.boost = Math.max(0, theft.boost - dt); const sp2 = AP.THIEF_SPEED * (theft.boost > 0 ? 1.6 : theft.slipped ? 1.15 : 1);
      const step = Math.min(d, sp2 * dt); p.x += (tgt.x - p.x) / d * step; p.z += (tgt.z - p.z) / d * step; p.y = Math.max(0, groundAt(p.x, p.z, p.y + 0.5)); speed = sp2;
    }
    if (!theft.slipped && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 1.5) {
      if (Math.random() < AP.CATCH_CHANCE) { theft.run = false; caught(); }
      else { theft.slipped = true; theft.boost = 2.5; toast('HE DODGED YOU!', '#ff2d55'); audio.ooh(); cam.shake = 0.25; P.vel.set(0, 0, 0); P.pos.addScaledVector(new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), -0.8); }
    }
  }
  if (theft.cut) speed = theft.cut;
  thief.animate({ dt, speed: theft.fallen ? 0 : speed, grounded: true, action: theft.seated ? 'sit' : talking === thief ? 'talk' : null, actionT: performance.now() / 1000 });
  if (!theft.fallen && !trophyHeld && !theft.seated) carryTrophy(thief, false);
}
// The cabin set: an Antonov An-26 interior ("Antonov An-26 - full interior" by 42manako, Sketchfab, CC BY 4.0),
// kept far from the airport and used for the shots on board. Model units are ~2.4 cm; benches along the walls.
let cabin = null;
async function cabinSet() {
  if (cabin) return cabin;
  AP.loadFlight();
  const src = await AP.cabinP; if (!src) return null;
  cabin = new THREE.Group(); cabin.add(src); cabin.scale.setScalar(0.0242); cabin.position.set(4000, 0, 4000); scene.add(cabin);
  src.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  cabin.updateMatrixWorld(true); return cabin;
}
const cab = (x, y, z) => cabin.localToWorld(new V3(x, y, z));
// Seated on a bench: the hips (about half the height up when standing) go down onto the bench top.
const onBench = (ch, x, z) => cab(x, 84, z).add(new V3(0, -0.5 * ch.height, 0));
async function escaped() {
  AP.loadFlight();
  state.stage = STAGES.ESCAPE; pushMode('cut'); $('#letterbox').classList.add('on'); P.vel.set(0, 0, 0); prompt(null);
  // He climbs aboard with the trophy...
  thief.root.visible = false; trophy.visible = false; audio.kick(0.3);
  setObjective('CHAPTER 2 · THE AIRPORT', 'Too late… the jet is taking off', null);
  const plane = AP.plane = AP.root.getObjectByName('184Airplane');
  shot(new V3(-30, 6, 70), new V3(-62, 3, 92), { cut: true });
  await say([['MESSI', 'Bye bye, {HERO}! See you in Dubai!']]);
  if (plane) {
    // Its parked spot is free now: drop the collision boxes it left on the apron.
    { const pb = new THREE.Box3().setFromObject(plane).expandByScalar(0.3);
      for (let i = colliders.length - 1; i >= 0; i--) { const c = colliders[i]; if (c.x1 - c.x0 > 100) continue; if (pb.containsPoint(new V3((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2))) colliders.splice(i, 1); }
      indexColliders(); }
    scene.attach(plane);                         // world space, so we can fly it
    const p0 = plane.position.clone(), q0 = plane.quaternion.clone(), box = new THREE.Box3().setFromObject(plane), c0 = box.getCenter(new V3());
    const off = p0.clone().sub(c0);              // pivot offset: we move the plane's centre
    const head = new V3(-0.707, 0, -0.707), runway = new V3(-130, 0, 60), turnTo = new V3(0, 0, -1);
    const setCentre = (c, yawExtra, pitch) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yawExtra).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0).applyAxisAngle(new V3(0, 1, 0), yawExtra + Math.atan2(head.x, head.z)), 0));
      plane.quaternion.copy(q).multiply(q0);
      if (pitch) plane.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new V3(-turnTo.z, 0, turnTo.x).normalize(), pitch));
      plane.position.copy(c).add(off.clone().applyQuaternion(q));
    };
    audio.engine?.(8);
    // Cut: already lined up on the runway — full throttle, rotate and climb away towards the sea.
    const turn = Math.atan2(turnTo.x, turnTo.z) - Math.atan2(head.x, head.z);
    const c1 = new V3(runway.x, c0.y, 18); setCentre(c1, turn, 0);
    shot(new V3(-100, 4, -10), new V3(runway.x, 4, 0), { cut: true, follow: 0.6 });
    await tween(3.2, (k, raw) => { const d = 260 * raw * raw, c = c1.clone().addScaledVector(turnTo, d); const lift = Math.max(0, raw - 0.45); c.y += 140 * lift * lift; setCentre(c, turn, Math.min(0.28, lift * 0.9));
      cam.override.look = c.clone(); cam.ovLook = c.clone(); });   // keep the plane in frame (narrow phone screens too)
    plane.visible = false;                       // gone for good
  }
  toast('HE GOT AWAY…', '#ff2d55');
  await sleep(0.3);
  // On board: Messi, sitting on the bench next to the Ballon d'Or.
  if (await cabinSet()) {
    thief.root.visible = true; thief.root.rotation.set(0, Math.PI / 2, 0); thief.root.position.copy(onBench(thief, -215, 40)); theft.seated = true;
    trophy.visible = true; trophy.position.copy(cab(-219, 84, 64)); trophy.rotation.set(0, Math.PI / 2, 0);
    shot(cab(-145, 124, 100), cab(-212, 92, 50), { cut: true });
    await say([['MESSI', 'Dubai, here we come. This one is mine now.']]);
    thief.root.visible = false; trophy.visible = false;
  }
  await chaseFlight();
  if (EP3) await dubai(); else endScreen('dubai');
}
// Our jet ("Bombardier windjet 365" by dannzjs, Sketchfab, CC BY 4.0): you take the controls, the other two
// stars sit behind, take off from the same runway and fly out over the sea, Rio on the horizon.
async function chaseFlight() {
  const src = await AP.jetP; if (!src) return;
  const jet = AP.jet = new THREE.Group(); jet.add(src); scene.add(jet);
  src.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const RUN_X = -128, RUN_Z = 70;
  const RY = Math.max(0, groundAt(RUN_X, RUN_Z, 3)), AY = Math.max(0, groundAt(RUN_X + 7, RUN_Z + 7, 3));   // the runway and apron surfaces
  jet.rotation.set(0, -Math.PI / 2, 0); jet.position.set(RUN_X, RY, RUN_Z); jet.updateMatrixWorld(true);
  // On the apron, right by the jet: the other two catch up with you.
  me.root.visible = true; P.seated = false;
  P.pos.set(RUN_X + 6, AY, RUN_Z + 6); P.yaw = Math.atan2(-6, -6); P.vel.set(0, 0, 0);
  if (rivalState.on) rivals().forEach((r, i) => { r.ch.root.visible = true; r.ch.root.position.set(RUN_X + 9 + i * 1.2, AY, RUN_Z + 9 - i); r.ch.root.rotation.set(0, Math.atan2(-1, -1), 0); });
  rivalState.mode = 'stand';
  shot(new V3(RUN_X + 14, 3, RUN_Z + 12), new V3(RUN_X + 2, 1.5, RUN_Z), { cut: true }); cam.blend = 1;
  await say(rivalState.on ? [
    ['HERO', 'Dubai… I need a plane. Now.'],
    ['RIVAL1', 'Wait! We are coming with you!'],
    ['HERO', 'Then get in. I am flying.'],
    ['RIVAL2', 'Since when can you fly a plane?!'],
    ['HERO', 'Since today. Next stop: Dubai.'],
  ] : [['HERO', 'Dubai… I need a plane. Now.'], ['HERO', 'Since today. Next stop: Dubai.']]);
  // They climb aboard (the jet's own cabin will come later).
  audio.engine?.(10);
  me.root.visible = false; P.seated = true; P.vel.set(0, 0, 0);
  if (rivalState.on) rivals().forEach(r => { r.ch.root.visible = false; });
  rivalState.mode = 'away';
  // Take-off: full throttle down the runway, rotate, climb.
  const camT = new V3(RUN_X - 28, 3.5, RUN_Z - 95);   // a camera beside the runway that pans as the jet roars past
  await tween(5, (k, raw) => { const d = 230 * raw * raw, lift = Math.max(0, raw - 0.5); jet.position.set(RUN_X, RY + 120 * lift * lift, RUN_Z - d); jet.rotation.x = Math.min(0.22, lift * 0.8);
    const look = jet.position.clone().add(new V3(0, 1.5, 0)); cam.override = { pos: camT, look, follow: 50 }; cam.ovPos = camT.clone(); cam.ovLook = look; cam.blend = 1; });
  // Rio → Dubai on the world map. Episode 3 is still hidden (direct link only): the public game stops half way.
  $('#fade').classList.add('on', 'world'); worldMap(EP3);
  await sleep(EP3 ? 5.6 : 6.2);
  if (!EP3) $('#fade').classList.remove('world');
}
// ================= episode 3: Dubai =================
// Messi lands first and grabs the Dubai Police Bugatti; each of the three stars picks a car and the chase goes
// through Dubai Marina, out into the desert, to a tunnel where he slips into a hidden house.
const CARS = [
  { id: 'lambo', name: 'LAMBORGHINI', sub: 'Countach LPI 800-4', file: 'car-lambo.glb', len: 4.87, yaw: -Math.PI / 2 },
  { id: 'ferrari', name: 'FERRARI', sub: 'LaFerrari', file: 'ferrari.glb', len: 4.7, yaw: Math.PI / 2 },
  { id: 'chiron', name: 'BUGATTI', sub: 'Chiron', file: 'car.glb', len: 4.54, yaw: Math.PI / 2 },
  { id: 'cyber', name: 'CYBERTRUCK', sub: 'Tesla', file: 'car-cyber.glb', len: 5.68, yaw: 0 },
];
const DXB = { RW: { z: 410, y: 0 }, APRON: { z: 198 }, cars: {} };   // runway along x; apron in front of the terminal's south pier
// ?ep=3 starts at the Dubai landing, ?ep=3d at the chase.
const EP3 = true;   // episode 3 is public: the game goes on to Dubai after the jet
const DRV = { on: false, list: [], t: 0 };
// Glass that the exporter made "transmissive" renders as a ghost in WebGL: make it plain tinted glass, the rest opaque.
function setFov(f) { camera.fov = f; camera.updateProjectionMatrix(); }
function prepCar(m) {
  m.traverse(o => { if (!o.isMesh) return; for (const mt of [].concat(o.material)) {
    if (mt.transmission > 0) { mt.transmission = 0; if (/glass|window|wind|screen|lens/i.test(mt.name)) { mt.transparent = true; mt.opacity = 0.32; mt.depthWrite = false; } else { mt.transparent = false; mt.opacity = 1; } mt.needsUpdate = true; }
    else if (mt.transparent && mt.opacity < 0.6) { mt.opacity = Math.min(mt.opacity, 0.15); mt.depthWrite = false; mt.needsUpdate = true; }   // tinted glass: clear enough to see who drives
    else if (/glass|window|windshield|glasses|vitre/i.test(mt.name)) { mt.transparent = true; mt.opacity = 0.16; mt.depthWrite = false; mt.needsUpdate = true; }   // see the drivers
    if (mt.metalness > 0.3) { mt.envMap = ENV; mt.envMapIntensity = 0.8; }
    if (mt.color && mt.color.r > 0.55 && mt.color.g < 0.5 && mt.color.b < 0.5 && mt.name !== 'Glasses' && m.userData.ferrari) { mt.color.setRGB(0.32, 0, 0.004); mt.map = null; mt.metalness = 0.3; mt.roughness = 0.28; mt.envMap = ENV; mt.envMapIntensity = 0.55; mt.needsUpdate = true; }
    if (/window|glass_front/i.test(mt.name)) { mt.transparent = true; mt.opacity = 0.16; mt.depthWrite = false; }
  } });
  return m;
}
// A star at the wheel: seated on the driver's side (left), low enough for the roof, seen through the glass.
function seatDriver(ch, car) {
  const b = new THREE.Box3().setFromObject(car), H = b.max.y - b.min.y, L = b.max.x - b.min.x;
  const k = 0.9; ch.root.scale.setScalar(k);
  car.attach ? null : null; car.add(ch.root);
  ch.root.position.set(-L * 0.06, Math.max(0.28, H - 0.92) - 0.5 * ch.height * k, -0.36);
  ch.root.rotation.set(0, Math.PI / 2, 0); ch.root.visible = true;
}
function rayY(root, x, z, top = 60, below = 6) {
  const rc = new THREE.Raycaster(new V3(x, top, z), new V3(0, -1, 0), 0, top + 80);
  for (const h of rc.intersectObject(root, true)) if (h.point.y < below) return h.point.y;
  return null;
}
// Free everything of Rio (keeps the stars, Messi, the trophy, our jet, the sun and the sky light).
function leaveScene(keepList) {
  const keep = new Set([sun, sun.target, hemi, ...keepList]);
  for (const o of [...scene.children]) if (!keep.has(o)) {
    o.traverse(m => { if (m.isMesh || m.isInstancedMesh) { m.geometry?.dispose(); for (const mt of [].concat(m.material)) { for (const k in mt) if (mt[k] && mt[k].isTexture && mt[k] !== ENV) mt[k].dispose(); mt.dispose?.(); } } });
    scene.remove(o);
  }
  walkers.length = 0; renderer.renderLists.dispose();
}
// A warm desert sky (gradient dome that follows the camera).
function desertSky() {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 v; void main(){ float h = clamp(v.y, -0.1, 1.0); vec3 hor = vec3(0.93, 0.84, 0.70), mid = vec3(0.60, 0.76, 0.90), top = vec3(0.29, 0.50, 0.80); vec3 c = mix(hor, mid, smoothstep(0.0, 0.16, h)); c = mix(c, top, smoothstep(0.16, 0.75, h)); gl_FragColor = vec4(c, 1.0); }' });
  const d = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), m); d.renderOrder = -10; d.frustumCulled = false;
  d.onBeforeRender = () => d.position.copy(camera.position);
  return d;
}
// The police Bugatti's light bar: red and blue, flashing.
function policeLights(car) {
  const b = new THREE.Box3().setFromObject(car), y = b.max.y + 0.02 - car.position.y;
  const mk = c => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.5), new THREE.MeshBasicMaterial({ color: c })); car.add(m); return m; };
  const r = mk(0xff1020), bl = mk(0x1050ff); r.position.set(-0.6, y, -0.35); bl.position.set(-0.6, y, 0.35);
  let t = 0; car.userData.flash = dt => { t += dt; const on = Math.floor(t * 6) % 2 === 0; r.material.color.setHex(on ? 0xff1020 : 0x330004); bl.material.color.setHex(on ? 0x08001a : 0x1050ff); };
}
async function loadJet() {
  if (AP.jet) return AP.jet;
  const src = await load('models/jet.glb').catch(() => null); if (!src) return null;
  const jet = AP.jet = new THREE.Group(); jet.add(src); scene.add(jet);
  src.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return jet;
}
async function enterDubai() {
  const jet = await loadJet();
  const [air, liner, police, ...cs] = await Promise.all([load('models/dxb-airport.glb'), load('models/dxb-airliner.glb'), load('models/car-police.glb'), ...CARS.map(c => load('models/' + c.file))]);
  leaveScene([trophy, jet, thief?.root, ...Object.values(HEROES).map(h => h.ch.root)]);
  scene.add(desertSky());
  scene.fog.color.set(0xe6d6bb); scene.fog.near = 260; scene.fog.far = 3400;
  hemi.color.set(0xfff0da); hemi.groundColor.set(0xc9a87a); hemi.intensity = 1.35; sun.intensity = 3.3;
  // The airport ("Abu Dhabi Airport"): its own sky dome goes, the ground takes shadows.
  const rm = []; air.traverse(o => { if (o.isMesh && /sky/i.test(o.name + o.material.name)) rm.push(o); }); rm.forEach(o => o.parent.remove(o));
  air.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  scene.add(air); DXB.air = air;
  const RW = DXB.RW; RW.y = rayY(air, -300, RW.z) ?? 0;
  colliders.length = 0; colliders.push({ x0: -3000, x1: 3000, z0: -3000, z1: 3000, y0: -5, y1: RW.y }); indexColliders();
  // Messi's plane (the one from Rio), nose along +x.
  const mp = DXB.mp = new THREE.Group(); liner.rotation.y = -3 * Math.PI / 4; mp.add(liner); liner.updateMatrixWorld(true);
  { const b = new THREE.Box3().setFromObject(liner); liner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); }
  mp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); mp.visible = false; scene.add(mp);
  if (jet) {
    jet.traverse(o => { if (o.isMesh) for (const mt of [].concat(o.material)) { mt.envMap = ENV; mt.envMapIntensity = 1; if (mt.metalness > 0.6) mt.metalness = 0.6; mt.needsUpdate = true; } });
    jet.visible = false; jet.rotation.set(0, 0, 0); jet.position.set(0, 0, 0); jet.updateMatrixWorld(true);
    const src = jet.children[0], b = new THREE.Box3().setFromObject(src); src.position.x -= (b.min.x + b.max.x) / 2; src.position.z -= (b.min.z + b.max.z) / 2; src.position.y -= b.min.y;
    jet.rotation.set(0, Math.PI, 0);
  }
  // The cars waiting on the apron: the police Bugatti first, then the four we can take.
  const pc = DXB.police = makeCar(prepCar(police), 4.46); policeLights(pc); scene.add(pc);
  CARS.forEach((c, i) => { cs[i].userData.ferrari = c.id === 'ferrari'; const g = makeCar(prepCar(cs[i]), c.len, c.yaw); g.userData.car = c; scene.add(g); DXB.cars[c.id] = g; });
  const row = DXB.APRON.z + 34;
  const park = (g, x) => { g.position.set(x, (rayY(air, x, row) ?? RW.y) + 0.12, row); g.rotation.set(0, 0, 0); };
  park(pc, -14); CARS.forEach((c, i) => { park(DXB.cars[c.id], -34 - i * 9); DXB.cars[c.id].userData.x0 = -34 - i * 9; });
  airportDressing();
  warmUp();
  thief.root.visible = false; trophy.visible = false; theft.seated = false; theft.fallen = false; theft.cut = 0;
  for (const h of Object.values(HEROES)) h.ch.root.visible = false;
  P.seated = true; rivalState.mode = 'away';
}
const jetPose = (x, y, z, pitch) => { const j = AP.jet; if (!j) return; j.position.set(x, y, z); j.rotation.set(0, Math.PI, -pitch); };
const mpPose = (x, y, z, pitch) => { DXB.mp.position.set(x, y, z); DXB.mp.rotation.set(0, 0, pitch); };
// Final approach, touchdown and roll-out along the runway (+x), with a camera that watches it.
async function landPlane(pose, xStop, dur, camPos) {
  const RW = DXB.RW, X0 = -700, XT = -360, H = 34; let touched = false;
  await tween(dur, (k, raw) => {
    let x, y, pitch;
    if (raw < 0.45) { const u = raw / 0.45; x = lerp(X0, XT, u); y = RW.y + H * Math.pow(1 - u, 1.4); pitch = 0.07; }
    else { if (!touched) { touched = true; audio.kick(0.5); cam.shake = 0.15; } const u = (raw - 0.45) / 0.55; x = lerp(XT, xStop, 1 - (1 - u) * (1 - u)); y = RW.y; pitch = 0.07 * Math.max(0, 1 - u * 5); }
    pose(x, y, RW.z, pitch);
    const look = new V3(x, y + 3, RW.z); cam.override = { pos: camPos, look, follow: 50 }; cam.ovPos = camPos.clone(); cam.ovLook = look; cam.blend = 1;
  });
}
// The car menu: you pick, the other two stars take two of the cars left.
function pickCar() {
  return new Promise(res => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (!$('#cpStyle')) { const st = document.createElement('style'); st.id = 'cpStyle'; st.textContent = `
      #carPick { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(4,10,30,.55); backdrop-filter: blur(3px); padding: 16px; }
      #carPick .cpb { text-align: center; color: #fff; font: 800 12px/1.2 Inter, Arial, sans-serif; letter-spacing: .18em; max-width: 760px; width: 100%; }
      #carPick b { display: block; font: 400 clamp(30px, 6vw, 46px)/1 'Bebas Neue', Impact, sans-serif; letter-spacing: .06em; color: #ffd400; margin: 6px 0 16px; }
      #carPick .cpr { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      @media (min-width: 720px) { #carPick .cpr { grid-template-columns: repeat(4, 1fr); } }
      #carPick button { all: unset; cursor: pointer; background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.18); border-radius: 14px; padding: 8px 8px 10px; display: flex; flex-direction: column; gap: 4px; transition: transform .15s, border-color .15s; }
      #carPick button:hover, #carPick button:focus-visible { transform: translateY(-3px); border-color: #ffd400; }
      #carPick img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 9px; background: #bcd7ea; }
      #carPick span { font: 400 22px/1 'Bebas Neue', Impact, sans-serif; letter-spacing: .05em; color: #fff; }
      #carPick em { font: 600 10px/1 Inter, Arial, sans-serif; letter-spacing: .1em; color: #9fb4d9; font-style: normal; }`; document.head.appendChild(st); }
    const el = document.createElement('div'); el.id = 'carPick';
    el.innerHTML = `<div class="cpb">CHAPTER 3 · DUBAI<b>CHOOSE YOUR CAR</b><div class="cpr">${CARS.map(c => `<button data-id="${c.id}"><img src="img/car-${c.id}.webp" alt=""><span>${c.name}</span><em>${c.sub}</em></button>`).join('')}</div></div>`;
    document.body.appendChild(el);
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { audio.blip(880); el.remove(); res(b.dataset.id); }));
  });
}
async function dubai() {
  state.stage = STAGES.DUBAI; if (!state.modeStack.includes('cut')) pushMode('cut'); prompt(null); hint('', 0);
  await enterDubai();
  const RW = DXB.RW, jet = AP.jet, MP_X = -150, JET_X = -228;
  $('#fade').classList.remove('on', 'world', 'trip'); $('#letterbox').classList.add('on');
  setFov(TOUCH ? 46 : 36);   // a longer lens: the terminal and the parked jets fill the background
  place('UNITED ARAB EMIRATES', 'DUBAI');
  setObjective('CHAPTER 3 · DUBAI', 'Messi has just landed…', null);
  audio.airport?.('PA_DXB');
  // Messi's plane comes in first...
  DXB.mp.visible = true; audio.engine?.(7);
  await landPlane(mpPose, MP_X, 7, new V3(-420, 2.6, RW.z + 46));
  // ...and we land right behind him.
  if (jet) { jet.visible = true; audio.engine?.(6); await landPlane(jetPose, JET_X, 6.2, new V3(-176, 2.2, RW.z + 50)); }
  // Cut: both planes have taxied to the apron, noses to the terminal.
  { const ay = (rayY(DXB.air, -10, DXB.APRON.z) ?? RW.y) + 0.12; DXB.mp.position.set(-8, ay, DXB.APRON.z); DXB.mp.rotation.set(0, Math.PI / 2, 0);
    if (jet) { jet.position.set(-74, ay, DXB.APRON.z + 4); jet.rotation.set(0, -Math.PI / 2, 0); } }
  const pc = DXB.police, m0 = new V3(-2, (rayY(DXB.air, -2, DXB.APRON.z + 8) ?? RW.y) + 0.13, DXB.APRON.z + 8), m1 = pc.position.clone().add(new V3(0, 0.13, -1.6));
  thief.root.visible = true; thief.root.position.copy(m0); thief.root.rotation.set(0, Math.atan2(m1.x - m0.x, m1.z - m0.z), 0); trophy.visible = true; theft.cut = 5;
  shot(m1.clone().add(new V3(8, 1.6, 9)), m0.clone().add(new V3(0, 1.2, 0)), { cut: true, follow: 6 });
  await Promise.all([tween(m0.distanceTo(m1) / 5, k => { thief.root.position.lerpVectors(m0, m1, k); cam.override.look = thief.root.position.clone().add(new V3(0, 1.1, 0)); }),
    say([['MESSI', 'Welcome to Dubai, {HERO}! Too slow, as always!']])]);
  theft.cut = 0; seatDriver(thief, pc); theft.seated = true; trophy.visible = false; audio.kick(0.3);   // at the wheel, seen through the glass
  // Siren on, and off he goes.
  audio.siren?.(true); audio.engine?.(4);
  const px0 = pc.position.x;
  const pz0 = pc.position.z;   // a short run, then a turn south to the open runway (away from the jets at the gates)
  await tween(3.2, (k, raw) => { const a = Math.min(1, raw * 1.6); pc.position.x = px0 + 18 * a; pc.position.z = pz0 + 150 * Math.max(0, raw - 0.25) ** 2; pc.rotation.y = -Math.PI / 2 * Math.min(1, Math.max(0, raw - 0.15) * 2.2); pc.userData.flash(1 / 60); cam.override.look = pc.position.clone().add(new V3(0, 1, 0)); });
  // On the apron: the three of us by the jet.
  const st = new V3(-64, DXB.mp.position.y, DXB.APRON.z + 14), toCars = new V3(1, 0, 1.2).normalize();
  const yaw = Math.atan2(toCars.x, toCars.z);
  const gy = (x, z) => (rayY(DXB.air, x, z) ?? RW.y) + 0.13;   // the painted apron sits 0.12 above the photo ground
  st.y = gy(st.x, st.z); colliders[0].y1 = st.y; indexColliders();   // stand on the painted apron (the physics snapped feet to the photo ground)
  P.seated = false; P.pos.copy(st); P.yaw = Math.atan2(1, 0.3); P.vel.set(0, 0, 0); me.root.visible = true; me.root.position.copy(st); me.root.rotation.set(0, P.yaw, 0);
  if (rivalState.on) rivals().forEach((r, i) => { r.ch.root.visible = true; r.ch.root.scale.setScalar(1); const q = st.clone().add(new V3(-1.6 - i * 1.2, 0, i ? -1.4 : 1.4)); q.y = gy(q.x, q.z); r.ch.root.position.copy(q); r.ch.root.rotation.set(0, P.yaw, 0); });
  rivalState.mode = 'stand';
  shot(st.clone().add(new V3(9, 1.7, 8)), st.clone().add(new V3(-1, 1.4, 0)), { cut: true });
  await say(rivalState.on ? [['HERO', 'He is taking the police car!'], ['RIVAL1', 'There are more cars over there. Everybody grab one!']] : [['HERO', 'He is taking the police car! I need a car… now.']]);
  shot(new V3(-40, 2.8, DXB.APRON.z + 76), DXB.cars.ferrari.position.clone().add(new V3(0, 0.8, -6)), { cut: true });
  // Pick a car.
  // The whole chase (Dubai Marina, the desert, the villa) is built behind the car menu, so the cut is instant.
  if (!TOUCH) DXB.prepP ??= prepareDrive();   // on phones the airport is freed first (both at once ran out of memory)
  const myId = await pickCar();
  const others = CARS.map(c => c.id).filter(id => id !== myId).sort(() => Math.random() - 0.5);
  DRV.ids = { me: myId, r: rivalState.on ? others.slice(0, 2) : [] };
  me.root.visible = false; P.seated = true; for (const r of rivals()) r.ch.root.visible = false; rivalState.mode = 'away';
  await startDrive();
  say([['HERO', 'Go, go, go!']]);
}

// Compile shaders and upload textures up front, so nothing stalls the first time it comes into view.
function warmUp() {
  const hidden = []; scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { renderer.compile(scene, camera); } catch (e) { }
  if (TOUCH) { hidden.forEach(o => { o.visible = false; }); return; }
  const culled = []; scene.traverse(o => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
  const rt = new THREE.WebGLRenderTarget(16, 16); try { renderer.setRenderTarget(rt); renderer.render(scene, camera); } catch (e) { } renderer.setRenderTarget(null); rt.dispose();
  culled.forEach(o => { o.frustumCulled = true; });
  scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k] && !m[k].userData.warm) { m[k].userData.warm = 1; try { renderer.initTexture(m[k]); } catch (e) { } } });
  hidden.forEach(o => { o.visible = false; });
}
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const grain = (x, w, h, a) => { for (let i = 0; i < w * h / 24; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${a})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
// The airport's ground is a blurry photo: paint a proper runway, grass strips, a taxiway and the apron on top.
function airportDressing() {
  const RW = DXB.RW, air = DXB.air;
  const flat = (lx, lz, tex, cx, cz, off = 2) => { const yy = (rayY(air, cx, cz) ?? RW.y) + 0.04 * off;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lx, lz), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off * 2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(cx, yy, cz); m.receiveShadow = true; scene.add(m); return m; };
  const X0 = -1000, X1 = 380, L = X1 - X0, Wd = 60;
  // Runway: asphalt, edge lines, dashed centre line.
  flat(L, Wd, canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#3c3d3f'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.07);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, h * 0.35, w, h * 0.3);   // tyre marks down the middle
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 6, w, 4); x.fillRect(0, h - 10, w, 4); x.fillRect(0, h / 2 - 2, w * 0.55, 4); }, L / 60, 1), (X0 + X1) / 2, RW.z, 2);
  // Threshold "piano keys", runway numbers, aiming points.
  const keys = canvasTex(256, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#f4f4f4'; for (let i = 0; i < 12; i++) if (i !== 5 && i !== 6) x.fillRect(4, 10 + i * 20, w - 8, 12); });
  const num = t => canvasTex(256, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#f4f4f4'; x.font = '900 150px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.translate(w / 2, h / 2); x.rotate(t.r); x.fillText(t.s, 0, 0); });
  const deco = (tex, lx, lz, cx, cz) => { const m = flat(lx, lz, tex, cx, cz, 4); m.material.transparent = true; return m; };
  deco(keys, 36, 52, X0 + 30, RW.z); deco(keys, 36, 52, X1 - 30, RW.z);
  deco(num({ s: '12', r: Math.PI / 2 }), 26, 26, X0 + 70, RW.z); deco(num({ s: '30', r: -Math.PI / 2 }), 26, 26, X1 - 70, RW.z);
  const aim = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, w, h); });
  for (const ax of [X0 + 330, X1 - 330]) for (const az of [-12, 12]) flat(48, 9, aim, ax, RW.z + az, 4);
  // Grass strips both sides of the runway.
  const grass = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#8c9a52'; x.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const g = 100 + Math.random() * 70; x.fillStyle = `rgba(${g - 30},${g + 10},${g - 60},0.5)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 3); } }, L / 20, 3);
  flat(L, 60, grass, (X0 + X1) / 2, RW.z - 62, 1); flat(L, 60, grass, (X0 + X1) / 2, RW.z + 62, 1);
  // Taxiway from the runway to the apron, and the apron in front of the terminal with its yellow lines.
  const TX = -40, tz0 = DXB.APRON.z + 40, tz1 = RW.z - 30;
  flat(24, tz1 - tz0, canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#45464a'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.07); x.fillStyle = '#f2c200'; x.fillRect(w / 2 - 2, 0, 4, h); x.fillRect(2, 0, 2, h); x.fillRect(w - 4, 0, 2, h); }, 1, (tz1 - tz0) / 30), TX, (tz0 + tz1) / 2, 3);
  flat(230, 110, canvasTex(1024, 512, (x, w, h) => { x.fillStyle = '#6d6c69'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.06);
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; for (let i = 0; i < w; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let j = 0; j < h; j += 64) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
    x.strokeStyle = '#f2c200'; x.lineWidth = 6; x.beginPath(); x.moveTo(0, h * 0.82); x.lineTo(w, h * 0.82); x.stroke();
    for (let k = 0; k < 5; k++) { const sx = 90 + k * 200; x.beginPath(); x.moveTo(sx, h * 0.82); x.quadraticCurveTo(sx, h * 0.45, sx + 40, h * 0.12); x.stroke(); x.fillStyle = '#e53935'; x.fillRect(sx + 20, h * 0.1, 50, 8); x.fillStyle = '#f2f2f2'; x.font = '900 40px Arial'; x.fillText('A' + (k + 1), sx - 60, h * 0.6); }
  }), -30, DXB.APRON.z + 10, 3);
  // Edge lights along the runway and the taxiway.
  const lights = []; for (let x = X0 + 20; x < X1; x += 60) lights.push([x, RW.z - Wd / 2 - 1], [x, RW.z + Wd / 2 + 1]);
  for (let z = tz0; z < tz1; z += 25) lights.push([TX - 13, z], [TX + 13, z]);
  const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff3c0 }), lights.length), M = new THREE.Matrix4();
  lights.forEach(([lx, lz], i) => { M.makeTranslation(lx, (rayY(air, lx, lz) ?? RW.y) + 0.22, lz); lm.setMatrixAt(i, M); }); scene.add(lm);
}
// Messi's hideout: a modern villa ("Modern Villa 2021") alone in the desert. Model metres: lawn at y = -2, house
// x -14..15 / z -31..-6, pool x -9..12 / z -30..0 in front of it, fenced plot x -29..26 / z -47..8.5.
// The garden side (+z) faces the road: you see the pool, and a gate is cut in the fence where the road ends.
async function placeVilla(R, villa) {
  const f = R.dirE, Y = new V3(0, 1, 0), y0 = R.y(R.N - 1), side = new V3(-f.z, 0, f.x);
  villa.rotation.y = Math.atan2(-f.x, -f.z);
  const G = new V3(-18, -2, 8.5), gateW = R.end.clone().addScaledVector(f, 6.5); gateW.y = y0;
  const g0 = G.clone().applyAxisAngle(Y, villa.rotation.y);
  villa.position.set(gateW.x - g0.x, y0 + 0.03 - g0.y, gateW.z - g0.z);
  // No perimeter fence (white boards on a stone base): the garden and its pool open onto the desert.
  villa.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (/^(White wood|Cobblestone)$/.test(o.material.name)) o.visible = false; } });
  scene.add(villa); villa.updateMatrixWorld(true);
  const toW = (x, y, z) => new V3(x, y, z).applyAxisAngle(Y, villa.rotation.y).add(villa.position);
  R.villaC = toW(-1.8, -2, -19);
  // The entrance: two lit stone pillars where the road ends.
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc3ad, roughness: 0.9 }), lampM = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
  for (const sx of [-1, 1]) { const p = gateW.clone().addScaledVector(side, sx * 3.4); const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), stone); pil.position.copy(p).add(new V3(0, 1.5, 0)); pil.castShadow = true; scene.add(pil);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), lampM); lamp.position.copy(p).add(new V3(0, 3.2, 0)); scene.add(lamp); }
  DXB.door = { gate: gateW.clone(), path: toW(-18, -2, -2), door: toW(-11.5, -2, -6.8), inside: toW(-11.5, -2, -10.5), center: R.villaC.clone(), pool: toW(1.5, -2, -12) };
}
// Overhead signs before the split: the highway on, the private exit to the right.
function exitSigns(R) {
  for (const [ds, txt] of [[-160, ['AL AIN  ↑', 'EXIT 21  ↗  PRIVATE']], [-30, ['EXIT 21', '↗']]]) {
    const s = R.splitS + ds, p = R.at(s), f = R.fwd(s), rt = R.right(s);
    const g = new THREE.Group(); g.position.set(p.x, R.y(s), p.z); g.rotation.y = Math.atan2(f.x, f.z); scene.add(g);
    const post = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.6, roughness: 0.4, envMap: ENV });
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 7, 8), post); m.position.set(sx * 6.5, 3.5, 0); g.add(m); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.35, 0.35), post); beam.position.set(0, 6.8, 0); g.add(beam);
    txt.forEach((t, i) => { const w = txt.length > 1 ? 5.6 : 6;
      const tex = canvasTex(512, 160, (x, cw, ch) => { x.fillStyle = '#0a6a3a'; x.fillRect(0, 0, cw, ch); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(8, 8, cw - 16, ch - 16); x.fillStyle = '#fff'; x.font = '800 58px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, cw / 2, ch / 2 + 3); });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.75), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); pl.position.set(txt.length > 1 ? (i ? -3.1 : 3.1) : -3, 5.7, -0.2); pl.rotation.y = Math.PI; g.add(pl); });
  }
}
// People walking on the city pavements.
const PEDS = [];
function cityPeople(R) {
  PEDS.length = 0;
  const LOOKS = [{ top: '#f2f2f2', bottom: '#f2f2f2', skin: '#b98566' }, { top: '#2b3a55', bottom: '#1c1c1c', skin: '#e0b48f' }, { top: '#c23b3b', bottom: '#2a2a2a', skin: '#8f5f42' }, { top: '#111', bottom: '#111', skin: '#c99a76' }, { top: '#e8b923', bottom: '#3d4f7a', skin: '#6e4630' }, { top: '#3a7d44', bottom: '#d9cbb0', skin: '#e3c09c' }];
  let i = 0;
  for (let s0 = 35; s0 < R.cityEnd - 30 && PEDS.length < (TOUCH ? 10 : 16); s0 += 48) for (const side of [-1, 1]) {
    const ch = new Character(kidSrc, { kind: 'mixamo', height: 1.62 + (i % 4) * 0.07 }); dress(ch, { ...LOOKS[i % LOOKS.length], shoes: '#222' });
    PEDS.push({ ch, s: s0 + (i % 5) * 6, home: s0, off: side * (R.hw(s0) + 3.3 + (i % 3) * 0.7), dir: i % 2 ? 1 : -1, v: 1.1 + (i % 3) * 0.25 });
    scene.add(ch.root); i++;
  }
  pedsStep(0);
}
function pedsStep(dt) {
  const R = DRV.R, me = DRV.me;
  for (const p of PEDS) {
    p.s += p.dir * p.v * dt;
    // Each one walks up and down his own stretch of pavement (they used to wander out into the desert road).
    if (p.s > Math.min(p.home + 25, R.cityEnd - 40)) p.dir = -1; else if (p.s < p.home - 25) p.dir = 1;
    const q = R.at(p.s).addScaledVector(R.right(p.s), p.off), f = R.fwd(p.s);
    p.ch.root.position.set(q.x, R.y(p.s) + 0.15, q.z); p.ch.root.rotation.y = Math.atan2(f.x, f.z) + (p.dir < 0 ? Math.PI : 0);
    if (!me || Math.abs(p.s - me.s) < 160) p.ch.animate({ dt, speed: p.v, grounded: true });
  }
}
// Desert life: zebras galloping alongside the road, camels resting by the dunes, lions prowling.
const ANIMALS = [];
function desertAnimals(R, [camel, zebra, lion]) {
  ANIMALS.length = 0;
  const add = (src, clipRe, scale, yawFix, s, off, speed, timeScale = 1) => {
    if (!src) return;
    const g = cloneSkinned(src); g.scale.setScalar(scale); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; for (const m of [].concat(o.material)) { m.metalness = 0; m.roughness = Math.max(0.75, m.roughness ?? 1); m.needsUpdate = true; } } });   // fur, not metal (it rendered black)
    const mixer = new THREE.AnimationMixer(g), clips = src.userData.clips || [], clip = clips.find(c => clipRe.test(c.name)) || clips[0];
    if (clip) { const a = mixer.clipAction(clip); a.timeScale = timeScale; a.time = Math.random() * clip.duration; a.play(); }
    scene.add(g); ANIMALS.push({ g, mixer, s, off, speed, yawFix, s0: s });
  };
  const S0 = R.cityEnd + 80, S1 = R.N - 90;
  // A herd of zebras racing the cars for a while.
  for (const [ds, off] of [[0, 22], [4, 26], [-3, 30], [7, 24.5]]) add(zebra, /gallop/i, 0.8, 0, S0 + 120 + ds, off, 9.5, 1.1);
  // Camels resting on both sides.
  for (const [s, off] of [[S0 + 40, -28], [S0 + 44, -32], [S0 + 260, 34], [S0 + 263, 38], [S1 - 60, -30]]) add(camel, /idle/i, 1, 0, s, off, 0);
  // Two lions walking across the sand near the villa road.
  for (const [s, off] of [[S1 - 140, 26], [S1 - 136, 30]]) add(lion, /./, 2.6 / 75, -Math.PI / 2, s, off, 1.6);
  for (const a of ANIMALS) poseAnimal(a, 0);
}
function poseAnimal(a, dt) {
  const R = DRV.R; a.s += a.speed * dt;
  if (a.speed > 5 && a.s > R.N - 60) a.s = a.s0;   // the herd keeps galloping by
  const p = R.at(a.s).addScaledVector(R.right(a.s), a.off), f = R.fwd(a.s);
  p.y = DXB.hAt ? DXB.hAt(p.x, p.z) : 0;
  a.g.position.copy(p); a.g.rotation.y = Math.atan2(f.x, f.z) + a.yawFix;
}
function animalsStep(dt) { for (const a of ANIMALS) { a.mixer.update(dt); if (a.speed) poseAnimal(a, dt); } }
// Traffic: Ferraris in several colours, Bugatti Chirons and the car nobody picked, slower than you, in their lanes.
const TRAFFIC = [];
const lanesAt = s => { const R = DRV.R, h = R.hw(s) - 1.1; return s < R.cityEnd ? [-3, 0, 3].filter(d => Math.abs(d) <= h) : [-2.2, 2.2]; };
function makeTraffic(R, ferT, chiT, spareId, more = {}) {
  TRAFFIC.length = 0;
  const fer = makeCar(prepCar(ferT), 4.7), chi = makeCar(prepCar(chiT));
  let paint = null; fer.traverse(o => { if (o.isMesh && o.material.color && o.material.color.r > 0.55 && o.material.color.g < 0.5 && o.material.color.b < 0.5) paint = o.material; });
  const ferrari = hex => { const g = fer.clone(true); if (paint) { const m = paint.clone(); m.color.setHex(hex); m.map = null; m.metalness = 0.35; m.roughness = 0.3; m.envMap = ENV; m.envMapIntensity = 0.6; g.traverse(o => { if (o.isMesh && o.material === paint) o.material = m; }); } return g; };
  const big = (m, len) => { if (!m) return null; const g = makeCar(prepCar(m), len); g.userData.len = len; return g; };
  // Every vehicle once (no twins on the road); only when they have all been used do Ferraris in new colours fill in.
  const pool = [big(more.coach, 12), big(more.maybach, 5.47), ferrari(0x8a0006), big(more.van, 5.2), big(more.ram, 5.92), chi.clone(true), big(more.skoda, 4.7),
    big(more.jeep, 4.88), big(more.porsche, 4.57), big(more.peugeot, 4.45), big(more.gronos, 4.9)].filter(Boolean);
  const extra = [0xf0f0f0, 0x111111, 0x16408f, 0x9aa3ab, 0xd8a400, 0x2e7d32, 0x5d0f7a];
  let ki = 0; const kinds = [() => pool[ki] ? pool[ki++] : ferrari(extra[(ki++ - pool.length) % extra.length])];
  const spare = DXB.cars[spareId];
  let s = 140, i = 0, seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (s < R.cliffS - 150 && TRAFFIC.length < 18) {
    const g = i === 4 && spare ? spare : kinds[0](); i++;
    g.visible = true; scene.add(g);
    const ls = lanesAt(s), len = g.userData.len || 4.7; TRAFFIC.push({ g, s, d: ls[Math.floor(rnd() * ls.length)], v: len > 10 ? 11 + rnd() * 3 : 13 + rnd() * 8, vd: 0, yaw: 0, len });
    s += 55 + rnd() * 45;
  }
  for (const t of TRAFFIC) carPose(t);
}
function trafficStep(dt) {
  const R = DRV.R, me = DRV.me; DRV.hitT = Math.max(0, (DRV.hitT || 0) - dt);
  let maxS = Math.max(me.s + 150, ...TRAFFIC.map(t => t.s));
  for (const t of TRAFFIC) {
    if (t.s < -1e8) continue;
    t.s += t.v * dt;
    if (t.s < me.s - 80) { const ns = maxS + 45 + Math.random() * 45; if (ns < R.cliffS - 150) { t.s = ns; maxS = ns; const ls = lanesAt(ns); t.d = ls[Math.floor(Math.random() * ls.length)]; } else t.s = -1e9; }
    if (t.s > R.cliffS - 90) t.s = -1e9;
    t.g.visible = t.s > -1e8; if (t.g.visible) carPose(t);
  }
}
// Running into a car: held behind it, or pushed aside if you hit it side-on.
function trafficHits(c) {
  for (const t of TRAFFIC) {
    if (t.s < -1e8) continue;
    const ds = c.s - t.s, dd = c.d - t.d, reach = t.len / 2 + 2.45, wide = t.len > 10 ? 2.5 : 2.15;
    if (Math.abs(ds) > reach || Math.abs(dd) > wide) continue;
    if (Math.abs(ds) < reach - 2.6) { c.d += Math.sign(dd || 1) * (wide - Math.abs(dd)); c.vd = 0; }
    else if (ds < 0) { c.s = t.s - reach; c.v = Math.min(c.v, t.v - 1); }
    if (c === DRV.me && !DRV.hitT) { DRV.hitT = 0.8; cam.shake = 0.35; audio.kick(0.8); if (!DRV.flags.trafficHint) { DRV.flags.trafficHint = true; hint('Traffic! Steer around the cars.', 3); } }
  }
}
// The lane a driver should aim for: the one he wants, unless a slower car is in it just ahead.
function freeLane(c, want) {
  const blocked = d => TRAFFIC.some(t => t.s > -1e8 && t.s - c.s > -t.len / 2 && t.s - c.s < 42 + t.len / 2 && Math.abs(t.d - d) < 2.5);
  if (!blocked(want)) return want;
  const ls = lanesAt(c.s).filter(d => !blocked(d)).sort((a, b) => Math.abs(a - c.d) - Math.abs(b - c.d));
  return ls.length ? ls[0] : want;
}

// ---------- the chase ----------
// The route: east along the avenue, south down the big street, east again out of the city, then the desert road
// to the tunnel. Messi stops inside the tunnel.
const ROUTE_CITY = [[-215, -139], [-120, -139], [0, -139], [150, -139], [286, -139], [316, -133], [328, -112], [328, -40], [328, 60], [328, 160], [330, 212], [344, 232], [372, 236], [440, 236]];
const ROUTE_DESERT = [[560, 236], [680, 228], [790, 205], [850, 188], [893, 194], [922, 222], [938, 262]];   // the last bend is the exit to the villa
const ROUTE_SPLIT = [850, 188], MAIN_DIR = new V3(0.955, 0, -0.296).normalize();   // the highway carries on straight from here
function makeRoad(R, s0, s1, width) {
  const n = Math.floor((s1 - s0) / 2) + 1, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(s1, s0 + i * 2), p = R.at(s), r = R.right(s), y = R.y(s) + 0.07;
    pos.set([p.x - r.x * width / 2, y, p.z - r.z * width / 2, p.x + r.x * width / 2, y, p.z + r.z * width / 2], i * 6);
    uv.set([0, s / 14, 1, s / 14], i * 4);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // wound to face up
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#3b3c3f'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.06)`; x.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
  x.fillStyle = '#eee'; x.fillRect(3, 0, 3, 256); x.fillRect(122, 0, 3, 256);
  x.fillStyle = '#e8e8e8'; x.fillRect(41, 0, 3, 120); x.fillRect(84, 0, 3, 120);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true; return m;
}
function buildRoute(marina) {
  // City + desert: a smooth curve sampled every metre; heights read from the marina where it has ground.
  const pts = [...ROUTE_CITY, ...ROUTE_DESERT].map(([x, z]) => new V3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const L0 = Math.floor(curve.getLength()), S = curve.getSpacedPoints(L0);
  const ys = new Float32Array(S.length).fill(0);
  let last = 0;
  for (let i = 0; i < S.length; i += 10) { const y = S[i].x > 430 ? null : rayY(marina, S[i].x, S[i].z, 40, 3); last = y !== null ? y : S[i].x > 430 ? 0 : last; for (let k = 0; k < 10 && i + k < S.length; k++) ys[i + k] = last; }
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < S.length - 1; i++) ys[i] = (ys[i - 1] + ys[i] + ys[i + 1]) / 3;
  const cityEnd = S.findIndex(p => p.x > 440);
  // The road runs on a little over the villa's paved forecourt, where Messi stops.
  const end = S[S.length - 1], dirE = end.clone().sub(S[S.length - 4]).setY(0).normalize();
  const samples = S.map((p, i) => ({ p, y: ys[i] }));
  for (let k = 1; k <= 4; k++) samples.push({ p: end.clone().addScaledVector(dirE, k), y: ys[ys.length - 1] });
  const N = samples.length;
  const at = s => { const i = clamp(Math.floor(s), 0, N - 2), f = clamp(s - i, 0, 1); return samples[i].p.clone().lerp(samples[i + 1].p, f); };
  const fwd = s => { const i = clamp(Math.floor(s), 2, N - 3); return samples[i + 2].p.clone().sub(samples[i - 2].p).setY(0).normalize(); };
  const right = s => { const f = fwd(s); return new V3(-f.z, 0, f.x); };
  const y = s => { const i = clamp(Math.floor(s), 0, N - 2), f = clamp(s - i, 0, 1); return lerp(samples[i].y, samples[i + 1].y, f); };
  const tunS = S.length;   // end of the asphalt
  const hw = s => s < cityEnd ? 5.3 : s < tunS ? 4.4 : 6;
  // The villa's plot centre: 48 m past the end of the road (its forecourt starts at the road).
  let splitS = 0, bd = 1e9; samples.forEach((q, i) => { const d = Math.hypot(q.p.x - ROUTE_SPLIT[0], q.p.z - ROUTE_SPLIT[1]); if (d < bd) { bd = d; splitS = i; } });
  const mainP0 = new V3(ROUTE_SPLIT[0], 0, ROUTE_SPLIT[1]), mainL = 900;
  return { at, fwd, right, y, hw, N, cityEnd, tunS, cliffS: splitS, splitS, mainP0, mainL, L: N - 1, stopS: N - 3, samples, end, dirE, villaC: end.clone().addScaledVector(dirE, 40) };
}
function carPose(c) {
  const R = DRV.R, p = R.at(c.s), r = R.right(c.s), f = R.fwd(c.s);
  c.g.position.set(p.x + r.x * c.d, R.y(c.s), p.z + r.z * c.d);
  const dir = f.multiplyScalar(Math.max(c.v, 4)).addScaledVector(r, c.vd); c.yaw = Math.atan2(-dir.z, dir.x);
  c.g.rotation.set(0, c.yaw, 0);
}
const CHASE = { group: null };
// Build the chase world into one hidden group (it overlaps the airport's ground, so it stays hidden until the cut).
async function prepareDrive() {
  DXB.chaseP ??= Promise.all([load('models/dxb-marina.glb'), load('models/dxb-villa.glb'), load('models/ferrari.glb'), load('models/car.glb'), load('models/bus-coach.glb'), load('models/bus-van.glb'), load('models/car-skoda.glb'), load('models/car-peugeot.glb'), ...['maybach', 'ram', 'jeep', 'porsche', 'gronos'].map(n => load(`models/car-${n}.glb`).catch(() => null))]);
  const [marina, villa, ferrariT, chironT, coachT, vanT, skodaT, peugeotT, maybachT, ramT, jeepT, porscheT, gronosT] = await DXB.chaseP;
  DXB.animalsP ??= Promise.all(['camel', 'zebra', 'lion'].map(n => loadAnim(`models/an-${n}.glb`).catch(() => null)));
  const before = new Set(scene.children);
  marina.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); scene.add(marina);
  const R = DRV.R = buildRoute(marina);
  await placeVilla(R, villa);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: 0xdcbf8c, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.y = -2.2; sand.receiveShadow = true; scene.add(sand);
  scene.add(makeRoad(R, 0, R.cityEnd, 12.5), makeRoad(R, R.cityEnd - 2, R.tunS, 10));
  // The highway carries straight on into the desert; Messi takes the exit.
  { const rgt = new V3(-MAIN_DIR.z, 0, MAIN_DIR.x); scene.add(makeRoad({ at: s => R.mainP0.clone().addScaledVector(MAIN_DIR, s), right: () => rgt, y: () => -0.012 }, 0, R.mainL, 10)); }
  exitSigns(R);
  desertDecor(R); cityTowers(R, marina); cityPeople(R);
  desertAnimals(R, await DXB.animalsP);
  const group = CHASE.group = new THREE.Group(); group.visible = false;
  for (const o of [...scene.children]) if (!before.has(o)) group.add(o);
  scene.add(group);
  warmUp();   // shaders and textures uploaded now, while the menu is up
  return { ferrariT, chironT, coachT, vanT, skodaT, peugeotT, maybachT, ramT, jeepT, porscheT, gronosT };
}
async function startDrive() {
  const racing = [DXB.police, ...Object.values(DXB.cars)];   // the car nobody took joins the traffic
  const keepers = () => [CHASE.group, trophy, thief?.root, ...racing, ...Object.values(HEROES).map(h => h.ch.root), ...scene.children.filter(o => o.material?.type === 'ShaderMaterial')].filter(Boolean);
  let T;
  if (!DXB.prepP) {
    // Phones: black screen, free the airport, then build the chase.
    $('#fade').classList.add('on'); $('#fade').classList.remove('world', 'trip');
    leaveScene(keepers());
    await sleep(0.05);
    try { T = await (DXB.prepP = prepareDrive()); }
    catch (e) { console.error(e); hint('Loading failed, please reload', 8); throw e; }
  } else T = await DXB.prepP;
  const R = DRV.R;
  // Leave the airport; keep the chase world and the cars that race.
  leaveScene(keepers());
  CHASE.group.visible = true;
  setFov(TOUCH ? 68 : 62);
  // The racers: Messi ahead, you, the other two just behind.
  const mk = (g, role, s, d) => ({ g, role, s, d, v: 26, vd: 0, yaw: 0 });
  const meCar = mk(DXB.cars[DRV.ids.me], 'me', 22, 0), messi = mk(DXB.police, 'messi', 50, -1.5);
  DRV.list = [messi, meCar, ...DRV.ids.r.map((id, i) => mk(DXB.cars[id], 'rival', 14 - i * 7, i ? -3 : 3))];
  DRV.me = meCar; DRV.messi = messi; DRV.t = 0; DRV.flags = {}; DRV.camF = R.fwd(22);
  for (const c of DRV.list) { c.g.visible = true; carPose(c); }
  colliders.length = 0; colliders.push({ x0: -3000, x1: 3000, z0: -3000, z1: 3000, y0: -5, y1: 0 }); indexColliders();
  state.stage = STAGES.DRIVE; DRV.on = true;
  state.modeStack = ['drive']; P.mode = 'drive'; P.seated = true;
  seatDriver(me, meCar.g); act('sit', 1e9);
  DRV.list.filter(c => c.role === 'rival').forEach((c, i) => { const rv = rivals()[i]; if (rv) { seatDriver(rv.ch, c.g); c.ch = rv.ch; } });
  seatDriver(thief, DXB.police); theft.seated = true; trophy.visible = false;
  const spareId = CARS.map(c => c.id).find(id => id !== DRV.ids.me && !DRV.ids.r.includes(id));
  for (const [id, g] of Object.entries(DXB.cars)) if (id !== DRV.ids.me && !DRV.ids.r.includes(id) && id !== spareId) g.visible = false;
  makeTraffic(R, T.ferrariT, T.chironT, spareId, { coach: T.coachT, van: T.vanT, skoda: T.skodaT, peugeot: T.peugeotT, maybach: T.maybachT, ram: T.ramT, jeep: T.jeepT, porsche: T.porscheT, gronos: T.gronosT });
  updateDrive(0); cam.ovPos = cam.override.pos.clone(); cam.ovLook = cam.override.look.clone(); cam.blend = 1;
  warmUp();
  speedo(true); pedals(true);
  $('#fade').classList.remove('on'); $('#letterbox').classList.remove('on');
  audio.airportOff?.(); audio.drive?.(true);
  place('DUBAI', 'MARINA');
  setObjective('CHAPTER 3 · DUBAI', 'Chase Messi!', () => DXB.police.position);
  hint(TOUCH ? 'Steer with the stick · GAS to go faster · BRAKE to slow down' : 'A / D to steer · W or Shift = boost · S = brake', 6);
  setTimeout(() => { if (DRV.on && rivalState.on) say([['RIVAL2', 'Stay on him, {HERO}!']]); }, 2500);
}
// On phones: GAS and BRAKE pedals replace the on-foot buttons while you drive (the stick steers).
function pedals(on) {
  for (const id of ['#bSiu', '#bJump', '#bRun', '#bAct']) $(id)?.style.setProperty('display', on ? 'none' : '');
  let box = $('#pedals');
  if (on && !box) {
    box = document.createElement('div'); box.id = 'pedals';
    box.style.cssText = 'position:absolute;right:calc(18px + env(safe-area-inset-right));bottom:calc(22px + env(safe-area-inset-bottom));display:flex;gap:14px;align-items:flex-end;pointer-events:auto';
    const mk = (label, key, big) => { const b = document.createElement('button'); b.textContent = label;
      b.style.cssText = `width:${big ? 96 : 78}px;height:${big ? 96 : 78}px;border-radius:50%;border:3px solid ${big ? '#ffd400' : '#ff4d5a'};background:${big ? 'rgba(255,212,0,.28)' : 'rgba(255,77,90,.25)'};color:#fff;font:800 13px Inter,Arial;letter-spacing:.08em;touch-action:none`;
      const set = v => e => { e.preventDefault(); e.stopPropagation(); DRV[key] = v; b.style.transform = v ? 'scale(.92)' : ''; };
      b.addEventListener('pointerdown', set(true)); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(false));
      box.appendChild(b); };
    mk('BRAKE', 'brk', false); mk('GAS', 'gas', true);
    $('#touch').appendChild(box);
  }
  if (box) box.style.display = on ? 'flex' : 'none';
  if (!on) DRV.gas = DRV.brk = false;
}
function speedo(on) {
  let el = $('#speedo');
  if (!el) { el = document.createElement('div'); el.id = 'speedo'; el.style.cssText = 'position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:30;color:#fff;font:400 40px/1 "Bebas Neue",Impact,sans-serif;text-align:right;text-shadow:0 2px 8px rgba(0,0,0,.6);pointer-events:none'; el.innerHTML = '<span>0</span><small style="font:800 11px Inter,Arial;letter-spacing:.15em;margin-left:4px">KM/H</small><div style="font:800 11px Inter,Arial;letter-spacing:.15em;color:#ffd400"></div>'; document.body.appendChild(el); }
  if (TOUCH) el.style.bottom = '190px';
  el.classList.toggle('hidden', !on); el.style.display = on ? '' : 'none';
}
function updateDrive(dt) {
  const R = DRV.R, me = DRV.me, ms = DRV.messi; DRV.t += dt;
  const ending = DRV.ending;
  // You: auto-throttle, boost, brake, steer.
  const mv = mode() === 'drive' && !ending ? readMove() : { x: 0, y: 0, m: 0 };
  const boost = !ending && (keys.ShiftLeft || keys.ShiftRight || sprintToggle || mv.y > 0.45 || DRV.gas), brake = ending || mv.y < -0.45 || DRV.brk;
  const vWant = ending ? 0 : brake ? 9 : boost ? 46 : 32;
  me.v = damp(me.v, vWant, brake ? 1.6 : 0.85, dt);
  me.vd = damp(me.vd, mv.x * 10 * clamp(me.v / 14, 0.35, 1), 7, dt);
  // Messi: always a little ahead. Get close and he finds more speed; fall back and he waits for you.
  const gap = ms.s - me.s;
  let vm = 31; if (gap < 16) vm = Math.max(me.v, 30) + (16 - gap) * 0.9; else if (gap > 45) vm = Math.max(6, Math.min(24, me.v - (gap - 45) * 0.3));   // too far ahead: he waits for you
  const toStop = R.stopS - ms.s; if (toStop < 160) vm = Math.min(vm, Math.sqrt(2 * 4.2 * Math.max(0, toStop)) + 0.8);
  ms.v = damp(ms.v, Math.min(vm, 52), 1.8, dt);
  const alongside = gap < 3.2;
  let dT = toStop < 160 ? -R.hw(ms.s) * 0.4 : alongside ? me.d + (ms.d >= me.d ? 1.9 : -1.9) : gap < 12 ? me.d : 2.4 * Math.sin(DRV.t * 0.45);
  dT = freeLane(ms, dT);
  ms.vd = damp(ms.vd, clamp((dT - ms.d) * 1.8, -7, 7), 4, dt);
  // The other two: on your bumper, never past Messi.
  DRV.list.forEach((c, i) => { if (c.role !== 'rival') return; const k = i - 2;
    const tgt = ending ? me.s - 7 - k * 6 : me.s + (k ? -2.5 : 5) + 3 * Math.sin(DRV.t * 0.35 + k * 2);
    c.v = damp(c.v, clamp(me.v + (tgt - c.s) * 0.9, 0, 50), 2, dt);
    const lane = (k ? -1 : 1) * 2.8 * (Math.abs(c.s - me.s) < 6 && Math.abs(c.d - me.d) < 2.6 ? 1.3 : 1);
    c.vd = damp(c.vd, clamp((freeLane(c, lane) - c.d) * 1.4, -7, 7), 3.5, dt); });
  trafficStep(dt); animalsStep(dt); pedsStep(dt);
  for (const c of DRV.list) { c.s += c.v * dt; c.d += c.vd * dt; const h = R.hw(c.s) - 1.1; if (Math.abs(c.d) > h) { c.d = Math.sign(c.d) * h; c.vd = 0; } }
  for (const c of DRV.list) trafficHits(c);
  ms.s = Math.min(ms.s, R.stopS);
  // Nobody gets past Messi: level with him at best.
  for (const c of DRV.list) if (c !== ms && c.s > ms.s - (c === me ? 0.6 : 5)) { c.s = ms.s - (c === me ? 0.6 : 5); c.v = Math.min(c.v, ms.v); }
  // Bumps: cars side by side push apart; nose to tail, the one behind is held back.
  for (let i = 0; i < DRV.list.length; i++) for (let j = i + 1; j < DRV.list.length; j++) {
    const a = DRV.list[i], b = DRV.list[j], ds = a.s - b.s, dd = a.d - b.d;
    if (Math.abs(ds) < 4.6 && Math.abs(dd) < 2.1) {
      if (Math.abs(ds) < 2.6) { const push = (2.1 - Math.abs(dd)) / 2 * (dd >= 0 ? 1 : -1); a.d += push; b.d -= push; a.vd *= 0.3; b.vd *= 0.3; if ((a === me || b === me) && !DRV.bumpT) { DRV.bumpT = 0.5; cam.shake = 0.25; audio.kick(0.6); } }
      else { const back = ds > 0 ? b : a, front = ds > 0 ? a : b; back.s = front.s - 4.6; back.v = Math.min(back.v, front.v); }
    }
  }
  DRV.bumpT = Math.max(0, (DRV.bumpT || 0) - dt);
  for (const c of DRV.list) carPose(c);
  DXB.police.userData.flash?.(dt);
  // GTA camera: behind and a little above your car, lagging the turns.
  const f = new V3(Math.cos(me.yaw), 0, -Math.sin(me.yaw)); DRV.camF.lerp(f, 1 - Math.exp(-dt * 3.5)).normalize();
  const kt = 0;
  const p = me.g.position, cp = p.clone().addScaledVector(DRV.camF, -lerp(8.4, 5.6, kt)).add(new V3(0, lerp(3.3, 2.0, kt), 0)), look = p.clone().addScaledVector(DRV.camF, 5).add(new V3(0, lerp(1.1, 0.9, kt), 0));
  cam.override = { pos: cp, look, follow: 14 }; cam.blend = 1;
  P.pos.copy(p); P.lastSafe.copy(p);
  // HUD, sound, story beats.
  const el = $('#speedo'); if (el) { el.firstChild.textContent = Math.round(me.v * 3.6); el.lastChild.textContent = `MESSI ${Math.max(0, Math.round(gap))} M`; }
  audio.driveSpeed?.(me.v, boost ? 1 : 0.4); audio.sirenLevel?.(clamp(1 - gap / 140, 0.15, 1));
  if (alongside && !DRV.flags.side) { DRV.flags.side = true; toast('SIDE BY SIDE!'); addStyle(300, 'LEVEL WITH MESSI'); say([['MESSI', 'Nice try, {HERO}! Nobody passes me!']]); }
  if (me.s > R.cityEnd && !DRV.flags.desert) { DRV.flags.desert = true; place('DUBAI', 'DESERT ROAD'); if (rivalState.on) say([['RIVAL1', 'He is heading for the desert!']]); }
  if (ms.s > R.splitS && !DRV.flags.exit) { DRV.flags.exit = true; hint('He is taking the exit!', 3); }
  if (ms.s > R.tunS - 40 && !DRV.flags.tunnel) { DRV.flags.tunnel = true; hint('He is slowing down… that villa!', 3); }
  if (!ending && ms.s >= R.stopS - 0.3 && me.s > R.stopS - 35) { DRV.ending = true; hideoutScene(); }
}
// The desert: one big height field of dunes, a valley for the road and a rocky mountain that buries the tunnel.
function desertDecor(R) {
  const road = [];
  for (let s = R.cityEnd - 40; s < R.N; s += 5) road.push(R.at(s));
  for (let k = 0; k <= R.mainL; k += 6) road.push(R.mainP0.clone().addScaledVector(MAIN_DIR, k));
  const yRoad = R.y(R.N - 1), xCity = R.at(R.cityEnd).x, VC = R.villaC;
  const dmin = (list, x, z) => { let m = 1e12; for (const q of list) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const dunes = (x, z) => { const u = x * 0.8 + z * 0.6, w = -x * 0.6 + z * 0.8;
    return 11 * Math.pow(0.5 + 0.5 * Math.sin(u * 0.010 + 2.2 * Math.sin(w * 0.0035)), 2.4) + 5 * Math.pow(0.5 + 0.5 * Math.sin(w * 0.017 + 1.6 * Math.sin(u * 0.006)), 2) + 1.2 * Math.sin(u * 0.045 + w * 0.03); };
  const mount = () => 0;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of [...road, VC]) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  const PAD = 650, W = x1 - x0 + PAD * 2, D = z1 - z0 + PAD * 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const hAt = (x, z) => {
    if (x < xCity + 10) return -1.5;                          // under the marina
    const dr = dmin(road, x, z), dv = Math.hypot(x - VC.x, z - VC.z);
    let h = dunes(x, z) * ss(xCity, xCity + 160, x);
    h = lerp(yRoad - 0.35, h, ss(9, 42, dr));                  // the road's valley
    h = lerp(yRoad - 0.08, h, ss(48, 95, dv));                 // a flat pad under the villa and its paved forecourt
    const edge = Math.min(x - (cx - W / 2), (cx + W / 2) - x, z - (cz - D / 2), (cz + D / 2) - z);
    return lerp(-2.2, h, ss(0, 220, edge));
  };
  DXB.hAt = hAt;
  const NX = TOUCH ? 200 : 280, NZ = Math.round(NX * D / W);
  const g = new THREE.PlaneGeometry(W, D, NX, NZ); g.rotateX(-Math.PI / 2); g.translate(cx, 0, cz);
  const pa = g.attributes.position, col = new Float32Array(pa.count * 3), sand = new THREE.Color(0.93, 0.78, 0.55), crest = new THREE.Color(0.98, 0.87, 0.66), rock = new THREE.Color(0.66, 0.5, 0.36);
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), h = hAt(x, z); pa.setY(i, h);
    const r = clamp((mount(x, z) - dunes(x, z) - 4) / 14, 0, 1), c = sand.clone().lerp(crest, clamp(h / 14, 0, 1)).lerp(rock, r); col.set([c.r, c.g, c.b], i * 3); }
  g.computeVertexNormals();
  { const nr = g.attributes.normal; for (let i = 0; i < pa.count; i++) { const st = clamp((0.86 - nr.getY(i)) / 0.3, 0, 1); if (st > 0) { const c = new THREE.Color(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]).lerp(rock, st); col.set([c.r, c.g, c.b], i * 3); } } }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Sand texture: fine grain and wind ripples.
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#e9dfcf'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(150,110,60,${0.06 + Math.random() * 0.06})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const y0 = i * 10 + Math.random() * 4; x.moveTo(0, y0); for (let k = 0; k <= 256; k += 16) x.lineTo(k, y0 + Math.sin(k * 0.05 + i) * 3); x.stroke(); }
  for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,250,240' : '120,90,50'},0.12)`; x.fillRect(Math.random() * 256, Math.random() * 256, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 16, D / 16); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 1, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);   // two-sided: it is the ceiling over the tunnel mouth
  // Dry shrubs and a few rocks along the road.
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const shrub = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6b6a3a, roughness: 1, flatShading: true }), 160);
  const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9c7f5e, roughness: 1, flatShading: true }), 60);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sc = new V3();
  const scatter = (im, n, size) => { for (let i = 0; i < n; i++) { const s0 = lerp(R.cityEnd + 60, R.cliffS - 40, rnd()), p0 = R.at(s0), r0 = R.right(s0), off = (rnd() < 0.5 ? -1 : 1) * (R.hw(s0) + 4 + rnd() * 22);
    const px = p0.x + r0.x * off, pz = p0.z + r0.z * off; Q.setFromAxisAngle(new V3(0, 1, 0), rnd() * 6); const k = size * (0.5 + rnd()); Sc.set(k, k * (0.45 + rnd() * 0.4), k * (0.7 + rnd() * 0.5));
    const hy = hAt(px, pz); if (hy > 2.5) Sc.set(0, 0, 0);   // only on the flat sand by the road (no floating rocks on slopes)
    M.compose(new V3(px, hy - k * 0.1, pz), Q, Sc); im.setMatrixAt(i, M); } scene.add(im); };
  scatter(shrub, 160, 0.9); scatter(stone, 60, 1.3);
}
// Dubai towers along the city part of the route (only where the marina has open ground), and the Burj Khalifa.
function cityTowers(R, marina) {
  const mats = [['#20405e', '#7fb2d6'], ['#2b3f4a', '#a9c9d6'], ['#3a4a5c', '#d8e2ea'], ['#1c2e44', '#4f8fc0']].map(([a, b]) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = a; x.fillRect(0, 0, 64, 128); x.fillStyle = b; for (let r = 0; r < 128; r += 8) for (let k = 0; k < 64; k += 8) { x.globalAlpha = 0.35 + Math.random() * 0.5; x.fillRect(k + 1, r + 1, 6, 5); }
    x.globalAlpha = 1; x.fillStyle = 'rgba(255,255,255,.25)'; for (let r = 0; r < 128; r += 32) x.fillRect(0, r, 64, 2);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.55, envMap: ENV, envMapIntensity: 0.9 });
  });
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const placed = [];
  for (let s = 20; s < R.cityEnd - 20; s += 26) for (const side of [-1, 1]) {
    const off = R.hw(s) + 16 + rnd() * 30, p = R.at(s).addScaledVector(R.right(s), side * off);
    if (placed.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 34)) continue;
    const hy = rayY(marina, p.x, p.z, 450, 1e9); if (hy !== null && hy > 3) continue;   // a marina building is already there
    const h = 45 + Math.pow(rnd(), 1.6) * 240, w = 18 + rnd() * 14, d = 18 + rnd() * 14, mt = mats[Math.floor(rnd() * mats.length)];
    const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 10, uv.getY(i) * h / 14);
    const b = new THREE.Mesh(g, mt); b.position.set(p.x, h / 2 + (hy ?? 0), p.z); b.rotation.y = Math.atan2(R.fwd(s).x, R.fwd(s).z); scene.add(b);
    if (rnd() < 0.5) { const cr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.07, d * 0.55), mt); cr.position.set(p.x, h + h * 0.035 + (hy ?? 0), p.z); cr.rotation.y = b.rotation.y; scene.add(cr); }
    if (rnd() < 0.3) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, h * 0.18, 6), mats[2]); sp.position.set(p.x, h * 1.09 + (hy ?? 0), p.z); scene.add(sp); }
    placed.push(p);
  }
  // The Burj Khalifa, far to the north of the avenue.
  const burj = new THREE.Group(), bm = new THREE.MeshStandardMaterial({ color: 0xb8c6d4, roughness: 0.2, metalness: 0.75, envMap: ENV, envMapIntensity: 1.1 });
  let y = 0; for (const [r, h] of [[34, 120], [28, 110], [23, 100], [18, 90], [14, 80], [10.5, 70], [7.5, 60], [5, 50]]) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, 6), bm); seg.position.y = y + h / 2; burj.add(seg); y += h; }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.5, 160, 8), bm); spire.position.y = y + 80; burj.add(spire);
  burj.position.set(420, 0, -820); scene.add(burj);
}
async function hideoutScene() {
  const R = DRV.R, ms = DRV.messi, V = DXB.door;
  pushMode('cut'); $('#letterbox').classList.add('on'); speedo(false); pedals(false); setObjective('CHAPTER 3 · DUBAI', 'Where is he going?', null);
  // Let the cars roll to a stop behind him.
  await tween(1.6, () => {});
  DRV.on = false; audio.drive?.(false); audio.siren?.(false);
  // The other two pull up behind you (off camera while we cut).
  DRV.list.filter(c => c.role === 'rival').forEach((c, k) => { c.s = DRV.me.s - 7 - k * 6; c.d = k ? -2 : 2; c.v = c.vd = 0; carPose(c); });
  // Messi jumps out and runs for the house.
  const pc = DXB.police, r = R.right(ms.s), m0 = pc.position.clone().addScaledVector(r, 1.4);
  scene.add(thief.root); thief.root.scale.setScalar(1); theft.seated = false;
  thief.root.visible = true; trophy.visible = true; thief.root.position.copy(m0); theft.cut = 4.5;
  const f = R.dirE, side = new V3(f.z, 0, -f.x);
  // Through the gate, past the pool, in by the garden's glass doors.
  shot(V.gate.clone().addScaledVector(f, -7).addScaledVector(side, 9).add(new V3(0, 4.5, 0)), m0.clone().add(new V3(0, 1.4, 0)), { cut: true, follow: 4 });
  for (const [a, b] of [[m0, V.gate], [V.gate, V.path], [V.path, V.door]]) {
    thief.root.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
    await tween(a.distanceTo(b) / 4.5, k => { thief.root.position.lerpVectors(a, b, k); cam.override.look = thief.root.position.clone().add(new V3(0, 1.4, 0)); });
  }
  await tween(0.5, k => { thief.root.position.lerpVectors(V.door, V.inside, k); });
  thief.root.visible = false; trophy.visible = false; theft.cut = 0; audio.kick(0.7); cam.shake = 0.2;
  // We get out and look at the villa.
  const base = DRV.me.g.position.clone().addScaledVector(R.right(DRV.me.s), DRV.me.d > 0 ? -1.8 : 1.8);
  for (const ch of [me, ...rivals().map(rv => rv.ch)]) { scene.add(ch.root); ch.root.scale.setScalar(1); } act(null, 0);
  P.seated = false; P.pos.copy(base); P.yaw = Math.atan2(V.door.x - base.x, V.door.z - base.z); me.root.visible = true; me.root.position.copy(base); me.root.rotation.set(0, P.yaw, 0);
  if (rivalState.on) rivals().forEach((rv, i) => { const q = base.clone().addScaledVector(f, -1.2 - i * 0.9).addScaledVector(R.right(DRV.me.s), (i ? -1 : 1) * 1.3); rv.ch.root.visible = true; rv.ch.root.position.copy(q); rv.ch.root.rotation.set(0, P.yaw, 0); });
  rivalState.mode = 'stand';
  shot(base.clone().addScaledVector(f, -6).addScaledVector(side, -2).add(new V3(0, 2.2, 0)), V.center.clone().add(new V3(0, 3, 0)), { cut: true });
  await say(rivalState.on ? [['HERO', 'He ran into that villa…'], ['RIVAL2', 'This must be his secret hideout.'], ['HERO', 'Then the Ballon d\'Or is in there. Let\'s go.']]
    : [['HERO', 'He ran into that villa…'], ['HERO', 'Then the Ballon d\'Or is in there. Let\'s go.']]);
  endScreen('hideout');
}
// Test entry: ?ep=3 jumps straight to the Dubai landing.
async function startEp3(drive) {
  rivalState.on = true;
  if (drive) { thief = new Character(await load('models/messi.glb'), { kind: 'mixamo', height: 1.70 }); scene.add(thief.root); state.modeStack = ['cut']; await enterDubai(); DRV.ids = { me: 'lambo', r: ['ferrari', 'chiron'] }; DXB.prepP = prepareDrive(); await startDrive(); return; }
  thief = new Character(await load('models/messi.glb'), { kind: 'mixamo', height: 1.70 }); scene.add(thief.root);
  $('#fade').classList.add('on'); state.modeStack = ['cut'];
  await dubai();
}

async function caught() {
  state.stage = STAGES.WIN; pushMode('cut'); $('#letterbox').classList.add('on'); P.vel.set(0, 0, 0);
  toast('STOPPED!'); cam.shake = 0.4; audio.kick(0.8); audio.cheer(0.8); addStyle(800, 'BALLON D\'OR SAVED');
  // He trips and goes down; the trophy rolls out of his hands.
  theft.fallen = true;
  const tp = thief.root.position.clone(), fwdT = new V3(Math.sin(thief.root.rotation.y), 0, Math.cos(thief.root.rotation.y));
  const drop = tp.clone().addScaledVector(fwdT, 1.6); drop.y = Math.max(0, groundAt(drop.x, drop.z, tp.y + 0.6)) + 0.02;
  const t0 = trophy.position.clone();
  shot(tp.clone().add(new V3(3.2, 2.2, 3.2)), tp.clone().add(new V3(0, 0.6, 0)), { cut: true });
  await tween(0.6, k => { thief.root.rotation.x = 1.45 * k; thief.root.position.y = tp.y + 0.25 * Math.sin(Math.PI * k); trophy.position.lerpVectors(t0, drop, k); trophy.position.y += Math.sin(Math.PI * k) * 0.6; });
  await sleep(0.4);
  P.pos.copy(drop).addScaledVector(fwdT, 0.6); P.yaw = Math.atan2(-fwdT.x, -fwdT.z);
  faceEachOther(thief); thief.root.rotation.x = 1.45;
  await say([
    ['MESSI', 'No! My jet! My Ballon d\'Or!'],
    ['HERO', 'It was never yours. The Ballon d\'Or belongs to football.'],
  ]);
  trophyHeld = true; P.yaw = Math.atan2(fwdT.x, fwdT.z) + Math.PI * 0.75;
  shot(P.pos.clone().add(new V3(Math.sin(P.yaw) * 3.4, 1.6, Math.cos(P.yaw) * 3.4)), P.pos.clone().add(new V3(0, 1.6, 0)), { cut: true });
  audio.cheer(1); audio.fiesta(5); toast(CELEB[hero.id]);
  await sleep(3);
  endScreen(true);
}

// ================= the penalty: Cristiano in goal on the cage court =================
// The east goal of the cage. n points from the goal towards the shooter, l along the goal line
// (it is also the keeper's own x axis, so his dive tilt works in his frame).
const PG = W.goals[1];
const GOAL = { c: new V3(PG.x, 0, PG.z), n: new V3(PG.dir, 0, 0), l: new V3(0, 0, -PG.dir), w: PG.w, h: PG.h };
const SPOT = GOAL.c.clone().addScaledVector(GOAL.n, 6);
let penSpot = SPOT;   // where the ball is for the next shot (the spot, or where it stopped in goal-to-goal)
const lat = p => (p.x - GOAL.c.x) * GOAL.l.x + (p.z - GOAL.c.z) * GOAL.l.z;
const keeperBase = off => GOAL.c.clone().addScaledVector(GOAL.n, 0.45).addScaledVector(GOAL.l, off);
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, depthTest: false }));
reticle.renderOrder = 10; reticle.visible = false; reticle.rotation.y = Math.atan2(GOAL.n.x, GOAL.n.z); scene.add(reticle);
let mouseNDC = new THREE.Vector2(), pointerDown = false, clickTap = false;
addEventListener('pointermove', e => { mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
canvasEl.addEventListener('pointerdown', e => { mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); pointerDown = true; clickTap = true; });
addEventListener('pointerup', () => { pointerDown = false; });
const OG = { c: new V3(W.goals[0].x, 0, W.goals[0].z), n: new V3(W.goals[0].dir, 0, 0), l: new V3(0, 0, -W.goals[0].dir), w: W.goals[0].w, h: W.goals[0].h };
let diveIn = 0;
addEventListener('keydown', e => { if (!state.gk) return; if (/ArrowLeft|KeyA|KeyQ/.test(e.code)) diveIn = -1; if (/ArrowRight|KeyD/.test(e.code)) diveIn = 1; });
canvasEl.addEventListener('pointerdown', e => { if (state.gk) diveIn = e.clientX < innerWidth / 2 ? -1 : 1; });
async function cr7Turn(from) {
  pushMode('cut'); state.gk = true; diveIn = 0; prompt(null);
  const dir = OG.c.clone().sub(from).setY(0).normalize();
  // Cristiano walks to the ball; you go back on your line.
  cr7.keeper = false; ronaldo.root.rotation.z = 0;
  const r0 = ronaldo.root.position.clone(), r1 = from.clone().addScaledVector(dir, -1.0); r1.y = 0;
  ronaldo.root.rotation.y = Math.atan2(r1.x - r0.x, r1.z - r0.z); cr7.walk = 4.5;
  ball.frozen = true; ball.mesh.visible = true; ball.pos.copy(from).setY(BALL_R); ball.mesh.position.copy(ball.pos);
  const base = OG.c.clone().addScaledVector(OG.n, 0.45);
  P.pos.copy(base); P.yaw = Math.atan2(OG.n.x, OG.n.z); P.vel.set(0, 0, 0); act('keeper', 99);
  shot(from.clone().addScaledVector(dir, -3.4).add(new V3(0, 2.0, 0)), OG.c.clone().add(new V3(0, 0.9, 0)), { cut: true });
  await tween(Math.max(0.4, r0.distanceTo(r1) / 4.5), k => { ronaldo.root.position.lerpVectors(r0, r1, k); });
  cr7.walk = 0; ronaldo.root.rotation.y = Math.atan2(dir.x, dir.z);
  hint(TOUCH ? 'Tap LEFT or RIGHT of the screen to dive!' : 'Press ← or → to dive!', 3);
  await sleep(1.4);
  // The shot.
  cr7.kick = 0; await sleep(0.25); audio.kick(0.9);
  const Lt = (Math.random() - 0.5) * 2.7, to = OG.c.clone().addScaledVector(OG.l, Lt); to.y = 0.25 + Math.random() * 1.5;
  const from3 = ball.pos.clone(), dur = from3.distanceTo(to) / 17;
  const d = diveIn, dv = d * (Math.abs(Lt) > 0.3 ? 1 : 0.6);
  await tween(dur, (k, raw) => { ball.pos.lerpVectors(from3, to, raw); ball.pos.y += Math.sin(Math.PI * raw) * 0.3; ball.mesh.position.copy(ball.pos); ball.mesh.rotation.x += 0.4;
    const kk = Math.min(1, raw * 1.6); P.pos.copy(base).addScaledVector(OG.l, dv * 1.15 * kk); me.root.rotation.z = -dv * 1.2 * kk; });
  const saved = (d !== 0 && Math.sign(d) === Math.sign(Lt) && Math.abs(Lt) >= 0.3 && !(Math.abs(Lt) > 1.25 && to.y > 1.4)) || (d === 0 && Math.abs(Lt) < 0.45);
  if (saved) { toast('SAVED!'); audio.cheer(0.7); addStyle(200, 'SAVE'); kidsCheer = 1.5; const v = OG.n.clone().multiplyScalar(5); v.y = 3;
    await tween(0.8, () => { v.y -= 9.8 / 60; ball.pos.addScaledVector(v, 1 / 60); if (ball.pos.y < BALL_R) { ball.pos.y = BALL_R; v.y *= -0.4; } ball.mesh.position.copy(ball.pos); }); }
  else { toast('CR7 SCORES!', '#ff2d55'); audio.net(); audio.ooh(); ronaldoSiu = 0; setTimeout(() => audio.siu(), 380); await sleep(1.6); }
  me.root.rotation.z = 0; act(null, 0); state.gk = false; cr7.kick = -1; cr7.keeper = true;
  release(); popMode();
  return !saved;
}
function penaltyChallenge(tries = 0) {
  return new Promise(res => {
    pushMode('pen'); if (document.pointerLockElement) document.exitPointerLock(); $('#touch').classList.add('hidden');
    P.pos.copy(penSpot).addScaledVector(GOAL.n, 1.1); P.yaw = Math.atan2(-GOAL.n.x, -GOAL.n.z); P.vel.set(0, 0, 0); me.root.rotation.z = 0; act(null, 0);
    ronaldo.root.rotation.set(0, Math.atan2(GOAL.n.x, GOAL.n.z), 0);
    shot(penSpot.clone().addScaledVector(GOAL.n, 3.6).addScaledVector(GOAL.l, 0.6).add(new V3(0, 1.75, 0)), GOAL.c.clone().add(new V3(0, 0.9, 0)), { follow: 3, cut: DUEL === 'goal' });
    $('#tally').classList.remove('hidden'); $('#tally').innerHTML = `<span>${tries + 1}</span>`;
    state.pen = { tries, phase: 'place', t: 0, power: 0, aim: GOAL.c.clone().add(new V3(0, 1, 0)), res, dive: 0, diveT: 0, keeperX: 0, scored: false };
    if (!tries) hint(TOUCH ? 'Drag to aim · hold to charge · release to shoot (not too hard!)' : 'Aim with the mouse · hold the button to charge · release to shoot', 7);
    placeBall();
  });
}
function placeBall() { const S = state.pen; ball.frozen = true; ball.mesh.visible = true; ball.pos.copy(penSpot).add(new V3(0, BALL_R, 0)); ball.mesh.position.copy(ball.pos); S.phase = 'aim'; S.dive = 0; S.diveT = 0; S.keeperX = 0; }
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
  if (S.phase === 'after') { S.at += dt; if (S.after) S.after(dt); if (S.at > 1.8) return endPens(); }
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
  const far = Math.max(1, ball.pos.distanceTo(to) / 6.5);
  S.from = ball.pos.clone(); S.to = to; S.dur = 6.6 / (11 + 15 * p) * far; S.arc = 0.25 + (1 - p) * 0.5; S.ft = 0; ball.frozen = true; S.phase = 'flight';
  // Cristiano reads soft shots and guesses on hard ones; he gets a little tired after a few tries.
  const reads = Math.random() < Math.min(0.85, (0.62 - 0.45 * p) * (S.tries >= 3 ? 0.45 : 1) + (far - 1) * 0.18);
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
    S.scored = true; span.className = 'g'; span.textContent = '✓'; toast('GOOOL!'); audio.net(); audio.cheer(1); audio.fiesta(4); addStyle(500, DUEL === 'goal' ? 'GOAL ON CR7' : 'PENALTY ON CR7'); kidsCheer = 2.5;
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
  ball.frozen = false; ball.pos.copy(penSpot).add(new V3(0.5, 0.3, 0.5)); ball.vel.set(0, 0, 0);
  release(); popMode(); S.res(S.scored);
}

// ================= celebration =================
// Each star has a shout; the move is a little run-up, a jump and a half turn to face the camera.
const CELEB = { mbappe: 'MBAPPÉÉÉ!', yamal: 'LAMINE!', kane: 'HARRY KANE!' };
let siuT = -1, ronaldoSiu = -1, trophyHeld = false;
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
  if (cr7.kick >= 0) { cr7.kick += dt; ronaldo.animate({ dt, speed: 0, grounded: true, action: 'kick', actionT: cr7.kick }); }
  else if (state.pen) ronaldo.animate({ dt, speed: 0, grounded: true, action: 'keeper', dive: state.pen.dive * state.pen.diveT });
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
  if (!P.seated) { me.root.position.copy(P.pos); me.root.rotation.y = P.yaw + P.spin; }
  const actName = P.action;
  me.animate({ dt, speed: P.mode === 'climb' ? 0 : P.speed, grounded: P.grounded || P.mode === 'climb', action: talking === me && !actName ? 'talk' : actName, actionT: P.action === 'climb' ? P.actT / P.actLen : P.actT, tapLen: 0.32, lean: 0 });
  if (trophyHeld) carryTrophy(me, true);
  IN.jump = IN.use = IN.trick = IN.shoot = IN.siu = false;
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
    else { updatePlayer(dt); ball.mesh.visible = state.stage === STAGES.CR7 && ball.frozen; }   // the ball only exists for the penalty
    updateNPCs(dt);
    // Mission triggers by position.
    // Cristiano stops you when you walk up to him in the cage.
    if (state.stage === STAGES.FIND && mode() === 'free' && P.mode === 'free' && P.pos.distanceTo(ronaldo.root.position) < 3.6) meetRonaldo();
    // Touch controls whenever you are free to move (and only then).
    if (TOUCH && state.started) $('#touch').classList.toggle('hidden', !((mode() === 'free' || mode() === 'drive') && state.stage !== STAGES.END));
    // Walk up to Cristiano's car and you get in by yourself (no button needed on phones).
    if (state.stage === STAGES.CAR && mode() === 'free' && P.mode === 'free' && Math.hypot(P.pos.x - car.position.x, P.pos.z - car.position.z) < 3.6) rideAway();
    // Airport: the thief runs; you spot him once you are inside the hall.
    updateThief(dt); updateRivals(dt); if (walkers.length) updateWalkers(dt);
    if (car.visible) chauffeur.animate({ dt, speed: 0, grounded: true, action: 'sit', actionT: 0 });
    if (DRV.on) updateDrive(dt);
    if (state.stage === STAGES.TERMINAL && mode() === 'free' && P.mode === 'free' && P.pos.x < 12 && P.pos.x > -17 && P.pos.z > -72 && P.pos.z < -4) spotThief();
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
document.body.classList.add('portrait-ok');   // phones play upright too: no 'turn your phone' screen
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
    ? [['Left thumb', 'Move'], ['Drag right side', 'Look around'], ['JUMP', 'Jump · climb a ledge'], ['E', 'Talk'], ['SPRINT', 'Toggle sprint'], ['CELEB', 'Celebrate']]
    : [['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move'], ['Mouse', 'Look around (click to lock)'], ['<kbd>Shift</kbd>', 'Sprint'], ['<kbd>Space</kbd>', 'Jump · climb a ledge · next line'], ['<kbd>E</kbd>', 'Talk'], ['<kbd>C</kbd>', 'Celebrate'], ['<kbd>Esc</kbd>', 'Pause']];
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
  audio.init(); $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden');
  state.started = true; state.t0 = performance.now();
  if (params.get('ep') === '3' || params.get('ep') === '3d') { await startEp3(params.get('ep') === '3d'); return; }
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
window.__street = { DRV, DXB, ANIMALS, dubai, startDrive, updateDrive, camera, findLedge, keys, step: (n = 1, dt = 1 / 60, each) => { for (let i = 0; i < n; i++) { if (each) each(); update(dt); } }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }), snap: () => { cam.target.set(P.pos.x, P.pos.y + 1.55, P.pos.z); cam.cur = cam.dist * cam.zoom; cam.blend = 0; cam.override = null; cam.ovPos = cam.ovLook = null; }, fps: () => fpsN / Math.max(0.001, fpsAcc), P, state, cam, W, ball, cards, kids, car, setStage: async (s) => { state.stage = s; }, tp: (x, y, z) => { P.pos.set(x, y, z); P.lastSafe.set(x, y, z); }, talkZe, talkThiago, cr7Turn, setPenSpot: v => { penSpot = v; }, DUEL, winPens: () => { if (state.pen) { state.pen.scored = true; endPens(); } }, missPen: () => { if (state.pen) endPens(); }, meetRonaldo, afterGoal, rideAway, enterAirport, arriveAirport, startChase, caught, escaped, chaseFlight, cabinSet, theft, AP, rivalState, ferrariP, getThief: () => thief, trophy, celebrate, pickHero, heroes: HEROES, ronaldo, gloves, SPOT, GOAL, groundAt, IN, mode: () => mode() };
