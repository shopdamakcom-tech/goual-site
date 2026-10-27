import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Character } from './street/rig.js?v=4';

/* ------------------------------------------------------------------ data */
// Each stop on the tour shows one film on a screen in the scene.
const STATIONS = [
  { src: '07.mp4', title: 'THE LAST ONE', place: 'THE STADIUM SCREEN' },
  { src: '08.mp4', title: 'GOD SAVE THE KING', place: "THE COACH'S TABLET" },
  { src: '04.mp4', title: 'THE LAST TEST', place: 'THE PLAYERS’ TUNNEL' },
  { src: 'the-cage.mp4', title: 'THE CAGE', place: 'THE LOCKER ROOM' },
  { src: 'el-rey.mp4', title: 'EL REY', place: 'THE GYM' },
  { src: 'airport-chaos.mp4', title: 'AIRPORT CHAOS', place: "THE COACH'S OFFICE" },
];
const TOTAL = String(STATIONS.length).padStart(2, '0');

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const body = document.body;
const MOBILE = innerWidth < 768;

/* -------------------------------------------------------------- renderer */
const canvas = $('#webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;     // the sun and the shadow casters do not move: render the shadow map once

const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#ffe9c9');
scene.fog = new THREE.Fog(HORIZON, 140, 420);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 900);

/* ----------------------------------------------------------------- lights */
const hemi = new THREE.HemisphereLight('#cfe8ff', '#6fa85a', 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d8', 2.7);
sun.position.set(60, 95, 45);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 10, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

/* ---------------------------------------------------------------- helpers */
const mats = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  return mats[key] || (mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts }));
}
function mesh(geo, material, parent, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = receive;
  (parent || scene).add(m);
  return m;
}
const box = (w, h, d, material, parent, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z, o);
const rbox = (w, h, d, r, material, parent, x, y, z, o) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), material, parent, x, y, z, o);
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const PALETTE = ['#ff5a5f', '#ffb400', '#00a6ed', '#7fb800', '#f26419', '#9b5de5', '#00c2a8', '#ff7eb6'];
const SKIN = ['#f5cba7', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a8714a'];

/* -------------------------------------------------------------- sky + land */
const outdoorFrom = scene.children.length;
const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, fog: false, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#3f9df0') }, mid: { value: new THREE.Color('#9fd3ff') }, bottom: { value: HORIZON } },
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 top,mid,bottom; varying vec3 vP;
    void main(){ float h=vP.y; vec3 c=h>0.15?mix(mid,top,smoothstep(.15,.7,h)):mix(bottom,mid,smoothstep(-.02,.15,h)); gl_FragColor=vec4(c,1.); }`,
}));
scene.add(sky);

const ground = mesh(new THREE.CircleGeometry(600, 64), new THREE.MeshStandardMaterial({ color: '#86c95e', roughness: 0.95 }), null, 0, -0.12, 0, { cast: false });
ground.rotation.x = -Math.PI / 2;
// Rolling hills on the horizon.
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(400, 470);
  const hill = mesh(new THREE.SphereGeometry(1, 24, 12), mat(pick(['#7cc057', '#6db34d', '#94d26b', '#5fa845']), { roughness: 1 }), null, Math.cos(a) * r, -4, Math.sin(a) * r, { cast: false });
  hill.scale.set(rand(40, 80), rand(18, 40), rand(40, 80));
}

/* ---------------------------------------------------------------- clouds */
const clouds = [];
for (let i = 0; i < 16; i++) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) {
    const s = rand(4, 8);
    const puff = mesh(new THREE.SphereGeometry(s, 20, 14), mat('#ffffff', { roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.18 }), g, k * 5 - n * 2.5, rand(-1, 2), rand(-2, 2), { cast: false, receive: false });
    puff.scale.y = 0.75;
  }
  const a = rand(0, Math.PI * 2), r = rand(90, 230);
  g.position.set(Math.cos(a) * r, rand(55, 90), Math.sin(a) * r);
  g.rotation.y = rand(0, Math.PI);
  scene.add(g); clouds.push(g);
}

/* ------------------------------------------------------------------- city */
// A city district around the stadium: a paved plaza, a ring road with traffic, parking lots,
// a sports park (basketball, padel, five-a-side), avenues and blocks of offices and towers.
// Buildings, cars and street lights: Kenney City Kit Commercial, Car Kit and City Kit Roads (CC0).
const city = new THREE.Group(); scene.add(city);
const cityLoader = new GLTFLoader();
const movingCars = [];
const seeded = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(20261020);   // same city on every visit
const srand = (a, b) => a + seeded() * (b - a);
const spick = arr => arr[Math.floor(seeded() * arr.length)];
// One merged geometry per Kenney model, so each model is a single instanced draw call.
function kenney(url) {
  return new Promise(res => cityLoader.load(url, g => {
    g.scene.updateMatrixWorld(true);
    const parts = [];
    let material = null;
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      parts.push(geo.index ? geo.toNonIndexed() : geo);
      material = material || o.material;
    });
    res({ geometry: mergeGeometries(parts), material });
  }, undefined, () => res(null)));
}
// Place many copies of one model: items are [x, z, rotY, scale].
function scatter(model, items, { y = 0, shadow = false } = {}) {
  if (!model || !items.length) return null;
  const im = new THREE.InstancedMesh(model.geometry, model.material, items.length), d = new THREE.Object3D();
  items.forEach(([x, z, r, s], i) => { d.position.set(x, y, z); d.rotation.set(0, r, 0); d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.receiveShadow = true; im.castShadow = shadow;
  city.add(im);
  return im;
}
// Flat ring between two ellipses (u runs along the ring so road markings repeat along it).
function ellipseRing(a0, b0, a1, b1, material, y, uLen = 1, segs = 160) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pos.push(a0 * c, y, b0 * s, a1 * c, y, b1 * s);
    uv.push((i / segs) * uLen, 0, (i / segs) * uLen, 1);
    if (i < segs) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true; city.add(m);
  return m;
}
// A straight road from (x0, z0) to (x1, z1).
function road(x0, z0, x1, z1, w, material, y) {
  const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(len, w);
  const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 7);
  const m = new THREE.Mesh(g, material); m.rotation.set(-Math.PI / 2, 0, -Math.atan2(z1 - z0, x1 - x0));
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; city.add(m);
  return m;
}
const flat = (w, d, material, x, z, y, rotY = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material); m.rotation.set(-Math.PI / 2, 0, rotY); m.position.set(x, y, z); m.receiveShadow = true; city.add(m); return m;
};

// Road surface: asphalt, white edge lines and a dashed centre line.
const roadTex = canvasTex(128, 64, (c, w, h) => {
  c.fillStyle = '#4b505b'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f4f1e8'; c.fillRect(0, 3, w, 2); c.fillRect(0, h - 5, w, 2); c.fillRect(0, h / 2 - 1.5, w / 2, 3);
});
roadTex.wrapS = THREE.RepeatWrapping;
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 });
const plazaMat = new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(128, 128, (c, w) => {
  c.fillStyle = '#e4ddcf'; c.fillRect(0, 0, w, w);
  c.strokeStyle = '#cfc6b4'; c.lineWidth = 2; for (let i = 0; i <= w; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, w); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
}, [60, 4]) });
const curbMat = mat('#c9c3b6', { roughness: 0.9 });
const lotMat = mat('#5b606b', { roughness: 0.85 });
const padMat = mat('#d3cdc1', { roughness: 0.9 });
const parkMat = mat('#79c257', { roughness: 1 });

// Plaza around the stadium, the ring road and its kerbs.
ellipseRing(54, 62.5, 72, 81, plazaMat, 0.03);
ellipseRing(72, 81, 81, 90, roadMat, 0.06, 70);
ellipseRing(81, 90, 84, 93, curbMat, 0.08);
// Avenues to the four sides and a grid of streets.
[[84, 0, 320, 0], [-84, 0, -320, 0], [0, 93, 0, 320], [0, -93, 0, -320]].forEach(([a, b, c, d]) => road(a, b, c, d, 12, roadMat, 0.07));
[-140, 140].forEach(z => road(-320, z, 320, z, 10, roadMat, 0.11));
[-135, 135].forEach(x => road(x, -320, x, 320, 10, roadMat, 0.09));
[-215, 215].forEach(z => road(-320, z, 320, z, 10, roadMat, 0.11));
[-210, 210].forEach(x => road(x, -320, x, 320, 10, roadMat, 0.09));

// Parking lots north and south of the stadium, with painted bays and parked cars.
const BAY = 3, ROWS = [0, 11.5, 17, 28.5];          // bay rows (each 5.5 deep), aisles in between
const LOTS = [];
[-1, 1].forEach(sz => [[-64, -10], [10, 64]].forEach(([x0, x1]) => LOTS.push({ x0, x1, z0: sz > 0 ? 97 : -131, sz })));
const lines = [], parked = [];
LOTS.forEach(L => {
  flat(L.x1 - L.x0, 34, lotMat, (L.x0 + L.x1) / 2, L.z0 + 17, 0.06);
  ROWS.forEach((r, ri) => {
    for (let x = L.x0 + 1; x + BAY <= L.x1 - 1; x += BAY) {
      lines.push([x, L.z0 + r + 2.75]);
      if (seeded() < 0.72) parked.push([x + BAY / 2, L.z0 + r + 2.75, (ri % 2 ? 0 : Math.PI) + srand(-0.06, 0.06), 1]);
    }
  });
});
{
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 5.2), mat('#f4f1e8'), lines.length), d = new THREE.Object3D();
  lines.forEach(([x, z], i) => { d.position.set(x, 0.09, z); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  city.add(m);
}

// Sports park on the west side: basketball, two padel courts and a five-a-side pitch.
flat(40, 118, parkMat, -108, 0, 0.03);
const courtTex = (w, h, draw) => canvasTex(w, h, draw);
function court(x, z, w, d, tex, fence, fenceH, glass) {
  flat(w + 2, d + 2, mat('#2c6e49', { roughness: 0.9 }), x, z, 0.07);
  flat(w, d, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), x, z, 0.1);
  if (!fence) return;
  const post = mat('#2b2f3a', { metalness: 0.4, roughness: 0.5 });
  const wallMat = glass ? new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: '#2b2f3a', transparent: true, opacity: 0.35, roughness: 0.8, depthWrite: false, side: THREE.DoubleSide });
  [[0, -d / 2, w, 0], [0, d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]].forEach(([dx, dz, len, r]) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, fenceH), wallMat); wall.position.set(x + dx, fenceH / 2, z + dz); wall.rotation.y = r; city.add(wall);
    for (let t = -len / 2; t <= len / 2 + 0.01; t += len / Math.max(2, Math.round(len / 4))) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, fenceH, 0.15), post);
      p.position.set(x + dx + (r ? 0 : t), fenceH / 2, z + dz + (r ? t : 0)); city.add(p);
    }
  });
}
// Basketball court (lines drawn on canvas, hoops at both ends).
court(-108, -36, 11, 19, courtTex(220, 380, (c, w, h) => {
  c.fillStyle = '#e07b39'; c.fillRect(0, 0, w, h); c.fillStyle = '#2f6db5'; c.fillRect(0, 0, w, h * 0.08); c.fillRect(0, h * 0.92, w, h * 0.08);
  c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.strokeRect(8, 8, w - 16, h - 16);
  c.beginPath(); c.moveTo(8, h / 2); c.lineTo(w - 8, h / 2); c.stroke(); c.beginPath(); c.arc(w / 2, h / 2, 26, 0, Math.PI * 2); c.stroke();
  [8, h - 8].forEach((y, k) => { c.fillStyle = '#2f6db5'; c.fillRect(w / 2 - 28, k ? y - 70 : y, 56, 70); c.strokeRect(w / 2 - 28, k ? y - 70 : y, 56, 70); c.beginPath(); c.arc(w / 2, y, 90, k ? Math.PI : 0, k ? 0 : Math.PI, k === 0 ? false : false); c.stroke(); });
}), true, 3, false);
[-1, 1].forEach(s => {
  const z = -36 + s * 8.6, pole = mat('#2b2f3a', { metalness: 0.5, roughness: 0.4 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 10), pole); p.position.set(-108, 1.7, z + s * 0.8); city.add(p);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.08), mat('#ffffff')); board.position.set(-108, 3.2, z + s * 0.4); city.add(board);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 20), mat('#ff5a1f')); ring.rotation.x = Math.PI / 2; ring.position.set(-108, 2.95, z); city.add(ring);
});
// Padel courts: blue turf, white lines, glass walls and a net.
const padelTex = courtTex(200, 400, (c, w, h) => {
  c.fillStyle = '#1f6fb8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffffff'; c.lineWidth = 4;
  c.strokeRect(2, 2, w - 4, h - 4); [h * 0.2, h * 0.8].forEach(y => { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); });
  c.beginPath(); c.moveTo(w / 2, h * 0.2); c.lineTo(w / 2, h * 0.8); c.stroke();
});
[-114, -102].forEach(x => {
  court(x, 2, 7, 13, padelTex, true, 2.4, true);
  const net = new THREE.Mesh(new THREE.BoxGeometry(7, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: '#1b1f3b', transparent: true, opacity: 0.7 })); net.position.set(x, 0.5, 2); city.add(net);
});
// Five-a-side pitch.
court(-108, 38, 14, 22, courtTex(200, 320, (c, w, h) => {
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#3fae4c' : '#38a045'; c.fillRect(0, i * h / 8, w, h / 8); }
  c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.strokeRect(6, 6, w - 12, h - 12); c.beginPath(); c.moveTo(6, h / 2); c.lineTo(w - 6, h / 2); c.stroke();
  c.beginPath(); c.arc(w / 2, h / 2, 24, 0, Math.PI * 2); c.stroke(); c.strokeRect(w / 2 - 36, 6, 72, 34); c.strokeRect(w / 2 - 36, h - 40, 72, 34);
}), true, 3.5, false);
// A park on the east side.
flat(40, 118, parkMat, 108, 0, 0.03);

// Trees along the avenues and in the parks.
{
  const spots = [];
  for (let t = 100; t < 300; t += 11) [[t, 8.5], [t, -8.5], [-t, 8.5], [-t, -8.5]].forEach(([a, b]) => { spots.push([a, b], [b, a]); });
  for (let i = 0; i < 70; i++) spots.push([srand(92, 124), srand(-56, 56)]);
  for (let i = 0; i < 26; i++) spots.push([spick([-125, -91]) + srand(-1.5, 1.5), srand(-56, 56)]);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 8), mat('#8b5a2b'), spots.length);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), mat('#ffffff', { roughness: 0.9 }), spots.length);
  spots.forEach(([x, z], i) => {
    const s = srand(1.6, 2.6), th = srand(1.6, 2.4);
    dummy.position.set(x, th / 2, z); dummy.scale.set(1, th, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, th + s * 0.8, z); dummy.scale.set(s, s * 1.1, s); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, col.set(spick(['#5cb85c', '#4caf50', '#7ccf5b', '#3e9b4f', '#9bd36a'])));
  });
  city.add(trunks, crowns);
}

// City blocks: a pavement under each building; offices near the stadium, towers further out.
const lots = { mid: [], tower: [], far: [] };
{
  const STEP = MOBILE ? 19 : 16;
  const clear = (x, z) =>
    (x / 104) ** 2 + (z / 112) ** 2 < 1 ||                       // plaza, ring road, lots and parks
    Math.abs(x) < 14 || Math.abs(z) < 14 ||                       // avenues
    [135, 210].some(v => Math.abs(Math.abs(x) - v) < 12) || [140, 215].some(v => Math.abs(Math.abs(z) - v) < 12) ||
    (Math.abs(z) < 136 && Math.abs(x) < 70 && Math.abs(z) > 90) || // parking lots
    (Math.abs(x) < 132 && Math.abs(x) > 86 && Math.abs(z) < 62);   // parks
  const pads = [];
  for (let x = -300; x <= 300; x += STEP) for (let z = -300; z <= 300; z += STEP) {
    const px = x + srand(-1.5, 1.5), pz = z + srand(-1.5, 1.5), d = Math.hypot(px, pz);
    if (d > 330 || clear(px, pz)) continue;
    const r = Math.round(Math.atan2(-px, -pz) / (Math.PI / 2)) * (Math.PI / 2);
    pads.push([px, pz]);
    (d < 175 ? lots.mid : d < 235 && seeded() < 0.6 ? lots.tower : lots.far).push([px, pz, r]);
  }
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(STEP - 3, 0.12, STEP - 3), padMat, pads.length), d = new THREE.Object3D();
  pads.forEach(([x, z], i) => { d.position.set(x, 0.06, z); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  m.receiveShadow = true; city.add(m);
}

// Load the Kenney models and fill the city.
const cityReady = (async () => {
  const B = n => kenney(`models/city/buildings/${n}.glb`);
  const [mids, towers, far, cars, lights] = await Promise.all([
    Promise.all('abcdefghijklmn'.split('').map(c => B('building-' + c))),
    Promise.all('abcde'.split('').map(c => B('building-skyscraper-' + c))),
    Promise.all('abcdefghijklm'.split('').map(c => B('low-detail-building-' + c))),
    Promise.all(['sedan', 'suv', 'taxi', 'van', 'hatchback-sports', 'sedan-sports', 'suv-luxury', 'police', 'delivery'].map(n => kenney(`models/city/cars/${n}.glb`))),
    kenney('models/city/street/light-curved.glb'),
  ]);
  const byModel = (models, items, scale) => {
    const groups = models.map(() => []);
    items.forEach(it => groups[Math.floor(seeded() * models.length)].push([it[0], it[1], it[2], scale()]));
    models.forEach((m, i) => scatter(m, groups[i]));
  };
  byModel(mids, lots.mid, () => srand(8.5, 10.5));
  byModel(towers, lots.tower, () => srand(8.5, 10.5));
  byModel(far, lots.far, () => srand(22, 28));
  byModel(cars.slice(0, 7), parked, () => 1);
  // Street lights around the ring road, facing the road.
  const lamps = [];
  for (let i = 0; i < 44; i++) { const t = (i / 44) * Math.PI * 2; lamps.push([Math.cos(t) * 82.5, Math.sin(t) * 91.5, -t + Math.PI / 2 + Math.PI, 7]); }
  scatter(lights, lamps);
  // Traffic on the ring road, both directions.
  for (let i = 0; i < (MOBILE ? 10 : 16); i++) {
    const model = cars[i % cars.length]; if (!model) continue;
    const car = new THREE.Mesh(model.geometry, model.material); car.scale.setScalar(1.1); city.add(car);
    movingCars.push({ car, t: (i / 16) * Math.PI * 2 + srand(0, 0.2), dir: i % 2 ? 1 : -1, lane: i % 2 ? 2.3 : -2.3, speed: srand(0.045, 0.07) });
  }
})();
const carPos = new THREE.Vector3(), carAhead = new THREE.Vector3();
function driveCars(dt) {
  movingCars.forEach(c => {
    c.t += c.dir * c.speed * dt;
    const at = t => carPos.set(Math.cos(t) * (76.5 + c.lane), 0.05, Math.sin(t) * (85.5 + c.lane));
    at(c.t); c.car.position.copy(carPos);
    carAhead.copy(at(c.t + c.dir * 0.01));
    c.car.lookAt(carAhead);
  });
}

// Clouds the camera flies through on the way down.
{
  const mist = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  [[-14, 127, 35], [-29, 101, 57], [-18, 82, 38]].forEach(([x, y, z]) => {
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    for (let k = 0; k < 7; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(5, 9), 18, 12), mist);
      puff.position.set(rand(-9, 9), rand(-2.5, 2.5), rand(-9, 9)); puff.scale.y = 0.7;
      g.add(puff);
    }
  });
}
// Everything outside the stadium is hidden once the camera is indoors.
const outdoor = new THREE.Group();
scene.children.slice(outdoorFrom).forEach(o => outdoor.add(o));
scene.add(outdoor);

/* ---------------------------------------------------------------- stadium */
// Stadium model: "Al Wakrah Stadium Worldcup 2022" by Ninh Pham (Sketchfab), used with the author's permission.
// Optimised for the web (seats removed, meshopt-compressed, logo replaced). Its pitch is 17 units long,
// scaled to our 60-unit pitch and turned so the long axis runs along z, benches on the east side.
const STADIUM_SCALE = 3.53;
let stadiumModel = null;
const stadiumReady = new Promise(resolve => {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('models/stadium.glb', gltf => {
    const model = gltf.scene;
    model.rotation.y = -Math.PI / 2; model.scale.setScalar(STADIUM_SCALE); model.position.set(0, 0, 0.26 * STADIUM_SCALE);
    let screenMesh = null;
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if (o.material.name === 'Material.047') o.material.color.set('#2f5fb3');        // seating area: team blue
      if (o.material.map && o.material.map.name === 'goual-logo') screenMesh = o;      // the scoreboard
    });
    scene.add(model); stadiumModel = model;
    // Open the stand where the tunnel comes up behind the benches.
    cutHoles(model, [B(19.05, -3, 11.6, 25.1, 3.6, 14.4), B(25.1, -3, 11.6, 34.6, 0.75, 14.4)]);
    cutHoles(ground, [B(19.05, -1, 11.6, 34.6, 0.3, 14.4)]);
    // A closed pit under the cut, so no sky shows through gaps around the stairwell.
    box(22, 5, 14, mat('#55524d', { roughness: 1, side: THREE.BackSide }), outdoor, 27, -2.64, 13, { cast: false, receive: false });
    scene.updateMatrixWorld(true);
    if (screenMesh) adoptScreen(screenMesh, 0);
    resolve();
  }, undefined, err => { console.warn('Stadium model failed to load', err); resolve(); });
});
const ballTex = canvasTex(256, 128, (c, w, h) => {
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#1b1f3b';
  for (let i = 0; i < 12; i++) { c.beginPath(); c.arc((i % 6) * w / 6 + (i < 6 ? 20 : 60), i < 6 ? h * 0.3 : h * 0.72, 14, 0, Math.PI * 2); c.fill(); }
});

/* ---------------------------------------------------------------- screens */
// A screen is a black panel with the film fitted inside at its own aspect ratio.
const screens = [];
function makeScreen(index, w, h, parent, x, y, z, rotY = 0) {
  const st = STATIONS[index];
  const video = document.createElement('video');
  Object.assign(video, { src: st.src, muted: true, loop: true, playsInline: true, preload: index ? 'metadata' : 'auto', crossOrigin: 'anonymous' });
  video.setAttribute('playsinline', '');
  const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; (parent || scene).add(g);
  const panel = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#05060c' }), g, 0, 0, 0, { cast: false, receive: false });
  const film = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), g, 0, 0, 0.005, { cast: false, receive: false });
  const fit = () => {
    const a = video.videoWidth / video.videoHeight || 16 / 9;
    const fw = a > w / h ? w : h * a;
    film.scale.set(fw, fw / a, 1);
  };
  fit(); video.addEventListener('loadedmetadata', fit);
  panel.userData.station = film.userData.station = index;
  const s = { index, video, group: g, hit: [panel, film], width: w };
  screens[index] = s;
  return s;
}

// 1. The stadium's own scoreboard plays the first film (set up once the model loads).
function adoptScreen(target, index, { placeCamera = true, planarUV = false } = {}) {
  const st = STATIONS[index];
  const video = document.createElement('video');
  Object.assign(video, { src: st.src, muted: true, loop: true, playsInline: true, preload: 'auto' });
  video.setAttribute('playsinline', '');
  const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = planarUV;
  if (planarUV) {
    // Map the film across the screen as seen from the room (screen faces -x: +z is to the viewer's right).
    const g = target.geometry = target.geometry.clone(), pos = g.getAttribute('position'), v = new THREE.Vector3();
    const pts = []; for (let i = 0; i < pos.count; i++) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(target.matrixWorld).clone());
    const zs = pts.map(p => p.z), ys = pts.map(p => p.y), z0 = Math.min(...zs), z1 = Math.max(...zs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pts.flatMap(p => [(p.z - z0) / (z1 - z0), (p.y - y0) / (y1 - y0)]), 2));
  }
  target.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  target.userData.station = index;
  const box3 = new THREE.Box3().setFromObject(target), size = box3.getSize(new THREE.Vector3());
  screens[index] = { index, video, group: target, hit: [target], width: Math.max(size.x, size.z) };
  video.play().catch(() => {});
  if (!placeCamera) return;
  // Put the camera stop in front of the screen, on the pitch side.
  const centre = box3.getCenter(new THREE.Vector3());
  const n = new THREE.Vector3(0, 0, 1);
  const normalAttr = target.geometry.getAttribute('normal');
  if (normalAttr) n.fromBufferAttribute(normalAttr, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(target.matrixWorld)).normalize();
  if (n.dot(new THREE.Vector3().sub(centre)) < 0) n.negate();
  n.y = 0; n.normalize();
  const k = KEYS.find(k => k.station === index);
  k.look.copy(centre);
  k.pos.copy(centre).addScaledVector(n, Math.max(size.x, size.z) * 1.6).add(new THREE.Vector3(0, -1.5, 0));
  rebuildCurves();
}

/* ------------------------------------------------------------ shared bits */
// The rooms sit under the main stand, one flight of stairs below the pitch.
const FLOOR = -2.13, EYE = FLOOR + 1.6;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const B = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(V(x0, y0, z0), V(x1, y1, z1));
const gltfLoader = new GLTFLoader(); gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const loadModel = url => new Promise(res => gltfLoader.load(url, g => res(g.scene), undefined, err => { console.warn(url, 'failed to load', err); res(null); }));

// Doorways: hide every fragment of a model that falls inside the given world-space boxes.
function cutHoles(root, boxes) {
  const n = boxes.length, u = { holeMin: { value: boxes.map(b => b.min) }, holeMax: { value: boxes.map(b => b.max) } };
  root.traverse(o => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (m.userData.holes) return;
      m.userData.holes = true;
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHoleW;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvHoleW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vHoleW; uniform vec3 holeMin[${n}]; uniform vec3 holeMax[${n}];`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nfor (int i = 0; i < ${n}; i++) if (all(greaterThan(vHoleW, holeMin[i])) && all(lessThan(vHoleW, holeMax[i]))) discard;`);
      };
      m.customProgramCacheKey = () => 'holes' + n;
    });
  });
}

// Indoor lights: a small fixed pool of point lights follows the camera to the nearest lamps,
// so the light count (and the shaders) never change while scrolling.
const lampSpots = [];
const lampAt = (x, y, z, color = '#fff1d6', intensity = 7, distance = 9) => lampSpots.push({ pos: V(x, y, z), color: new THREE.Color(color), intensity, distance });
const lampPool = Array.from({ length: 4 }, () => { const l = new THREE.PointLight('#ffffff', 0, 9, 2); scene.add(l); return l; });
function updateLamps(on) {
  const near = on ? lampSpots.map(s => [s, s.pos.distanceToSquared(camera.position)]).sort((a, b) => a[1] - b[1]) : [];
  lampPool.forEach((l, i) => {
    const s = near[i] && near[i][0];
    if (!s) { l.intensity = 0; return; }
    l.position.copy(s.pos); l.color.copy(s.color); l.distance = s.distance;
    l.intensity = s.intensity * (1 - smooth(s.distance * 0.8, s.distance * 1.6, Math.sqrt(near[i][1])));
  });
}

// Seat a rigged character that faces +z at the origin. Bones turn around world axes, so the
// pose does not depend on each rig's local bone axes. arms: [down, forward, forearm in, forearm up].
const RIGS = {
  mixamo: { upLegL: 'LeftUpLeg', upLegR: 'RightUpLeg', legL: 'LeftLeg', legR: 'RightLeg', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head', armL: 'LeftArm', armR: 'RightArm', foreL: 'LeftForeArm', foreR: 'RightForeArm', handL: 'LeftHand', handR: 'RightHand' },
  unreal: { upLegL: 'thigh_l', upLegR: 'thigh_r', legL: 'calf_l', legR: 'calf_r', spine1: 'spine_02', spine2: 'spine_03', neck: 'neck_01', head: 'head', armL: 'upperarm_l', armR: 'upperarm_r', foreL: 'lowerarm_l', foreR: 'lowerarm_r', handL: 'hand_l', handR: 'hand_r' },
};
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
function turnBone(b, axis, deg) {
  if (!b) return;
  const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
  const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
  b.quaternion.premultiply(pq.clone().invert().multiply(q).multiply(pq));
  b.updateMatrixWorld(true);
}
function poseSeated(model, { rig, seat, arms, lean, headDown }) {
  model.updateMatrixWorld(true);
  const all = {};
  model.traverse(o => { if (o.isBone) { const n = o.name.replace(/_\d+$/, ''); all[n] = all[n] || o; } });
  const b = {}; for (const [k, n] of Object.entries(RIGS[rig])) b[k] = all[n];
  turnBone(b.upLegL, AX, -88); turnBone(b.legL, AX, 92); turnBone(b.upLegR, AX, -88); turnBone(b.legR, AX, 92);
  turnBone(b.spine1, AX, lean); turnBone(b.spine2, AX, lean * 0.6); turnBone(b.neck, AX, headDown * 0.5); turnBone(b.head, AX, headDown);
  const [down, fwd, foreFwd, foreUp] = arms;
  turnBone(b.armL, AZ, -down); turnBone(b.armL, AY, -fwd); turnBone(b.foreL, AY, -foreFwd); turnBone(b.foreL, AX, -foreUp);
  turnBone(b.armR, AZ, down); turnBone(b.armR, AY, fwd); turnBone(b.foreR, AY, foreFwd); turnBone(b.foreR, AX, -foreUp);
  model.updateMatrixWorld(true);
  model.position.y += seat + 0.06 - b.upLegL.getWorldPosition(V(0, 0, 0)).y;
  model.updateMatrixWorld(true);
  const w = o => o.getWorldPosition(V(0, 0, 0));
  return { bones: b, hands: [w(b.handL), w(b.handR)], head: w(b.head) };
}
function prepCharacter(m) {
  m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
}

// 2. A player on the bench at the side of the pitch, watching a film on his tablet.
const bench = new THREE.Group(); bench.position.set(16.4, 0, 6); bench.rotation.y = -Math.PI / 2; scene.add(bench);
{
  const seatMat = mat('#ffffff', { roughness: 0.4 }), frame = mat('#1b1f3b', { metalness: 0.4, roughness: 0.4 });
  rbox(2.2, 0.08, 0.46, 0.03, mat('#00a6ed', { roughness: 0.45 }), bench, 0, 0.43, -0.04);
  rbox(2.2, 0.5, 0.06, 0.03, seatMat, bench, 0, 0.72, -0.28);
  [-1, 1].forEach(s => { box(0.06, 0.43, 0.4, frame, bench, s * 1.02, 0.215, -0.04); box(0.06, 0.95, 0.06, frame, bench, s * 1.02, 0.475, -0.3); });
}
// The coach on the bench, reading his tablet (a static seated model, base removed). The film plays on
// his tablet; ?player switches back to the rigged player.
const BENCH_FIT = { scale: 0.8, z: 0.24 };
const playerReady = !location.search.includes('player') ? loadModel('models/bench-coach.glb').then(m => {
  if (!m) return;
  m.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  const S = BENCH_FIT.scale;
  m.scale.setScalar(S); m.position.set(0, 0.86 * S + 0.02, BENCH_FIT.z);
  bench.add(m); scene.updateMatrixWorld(true);
  // Film on his tablet: the tablet's plane was measured from the model (centre, width axis, slope axis,
  // normal toward his face), so the screen sits right on its glass.
  const holder = new THREE.Group();
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0.021, 0.016).normalize(), V(0.025, 0.556, 0.831).normalize(), V(0.009, 0.831, -0.556).normalize()));
  holder.position.set(-0.009, 0.029, 0.428).addScaledVector(V(0.009, 0.831, -0.556), 0.027);
  m.add(holder);
  makeScreen(1, 0.22, 0.27, holder, 0, 0, 0.002);
  // Camera stop: just behind his right shoulder, looking down at the tablet.
  scene.updateMatrixWorld(true);
  const right = bench.localToWorld(V(-1, 0, 0)).sub(bench.getWorldPosition(V(0, 0, 0)));
  const k = KEYS.find(k => k.station === 1);
  const back = bench.localToWorld(V(0, 0, -1)).sub(bench.getWorldPosition(V(0, 0, 0)));
  k.pos.copy(holder.getWorldPosition(V(0, 0, 0))).addScaledVector(right, 0.24).addScaledVector(back, 0.3).add(V(0, 0.5, 0));
  k.look.copy(holder.getWorldPosition(V(0, 0, 0)));
  rebuildCurves();
}) : loadModel('models/player.glb').then(m => {
  if (!m) return;
  prepCharacter(m);
  const pose = poseSeated(m, { rig: 'mixamo', seat: 0.47, arms: [58, 28, 70, 62], lean: 10, headDown: 18 });
  bench.add(m);
  // Tablet held in both hands, turned toward his eyes.
  const tablet = new THREE.Group();
  tablet.position.copy(pose.hands[0]).add(pose.hands[1]).multiplyScalar(0.5).add(V(0, 0.05, 0.03));
  bench.add(tablet); scene.updateMatrixWorld(true);
  tablet.lookAt(bench.localToWorld(pose.head.clone()));
  rbox(0.34, 0.235, 0.014, 0.018, mat('#2c2c31', { metalness: 0.6, roughness: 0.35 }), tablet, 0, 0, 0);
  makeScreen(1, 0.315, 0.205, tablet, 0, 0, 0.008);
  scene.updateMatrixWorld(true);
  const k = KEYS.find(k => k.station === 1);
  k.pos.copy(bench.localToWorld(pose.head.clone().add(V(-0.3, 0.2, -0.2))));
  k.look.copy(tablet.getWorldPosition(V(0, 0, 0)));
  rebuildCurves();
});

/* ------------------------------------------------------------- the trio */
// Mbappé, Yamal and Kane warm up on the pitch in front of the bench: each one juggles a few touches,
// then passes along the triangle. Models made by GOUAL ART with Meshy; the motion is procedural.
const trio = { ready: false, players: [], holder: 0, phase: 'juggle', t: 0, ball: null, from: V(0, 0, 0), to: V(0, 0, 0) };
{
  const SPOTS = [V(9.6, 0, 1.6), V(13.4, 0, 3.6), V(9.2, 0, 6.2)];   // south of the camera's line to the bench
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#151515';
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const x = i * 43 + (j % 2) * 21 + 10, y = j * 45 + 18; g.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 1.2566; g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); } g.fill(); }
  const bt = new THREE.CanvasTexture(c); bt.colorSpace = THREE.SRGBColorSpace;
  trio.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.45 }));
  trio.ball.castShadow = true; trio.ball.visible = false; scene.add(trio.ball);
  Promise.all([['mbappe', 1.78], ['yamal', 1.80], ['kane', 1.88]].map(([n, h]) => new Promise(res => gltfLoader.load(`street/models/${n}.glb`, gl => res([gl.scene, h]), undefined, () => res(null)))))
    .then(list => {
      if (list.some(x => !x)) return;
      trio.players = list.map(([src, h], i) => { const ch = new Character(src, { kind: 'meshy', height: h }); ch.root.position.copy(SPOTS[i]); scene.add(ch.root); return ch; });
      trio.ready = true; trio.ball.visible = true;
    });
}
const JUG_TAP = 0.5;
function updateTrio(dt) {
  if (!trio.ready) return;
  const near = camera.position.distanceTo(V(10, 0, 6)) < 90 && camera.position.y > -0.5;
  trio.players.forEach(p => { p.root.visible = near; }); trio.ball.visible = near;
  if (!near) return;
  const P = trio.players, n = P.length, h = trio.holder, next = (h + 1) % n;
  trio.t += dt;
  // Everyone faces the ball (the holder faces the next player before passing).
  const face = (ch, tgt, k = 6) => { const d = tgt.clone().sub(ch.root.position); const yaw = Math.atan2(d.x, d.z); let a = yaw - ch.root.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); ch.root.rotation.y += a * (1 - Math.exp(-dt * k)); };
  const ballPos = trio.ball.position;
  P.forEach((ch, i) => {
    if (i === h && trio.phase !== 'pass') return;
    face(ch, i === h ? P[next].root.position : ballPos);
    ch.animate({ dt, speed: 0, grounded: true, action: i === next && trio.phase === 'pass' && trio.t > 0.6 ? 'trap' : null, actionT: trio.t });
  });
  const H = P[h];
  if (trio.phase === 'juggle') {
    // Keepy-uppies in front of the holder, about six touches.
    const f = V(Math.sin(H.root.rotation.y), 0, Math.cos(H.root.rotation.y));
    const ph = (trio.t % JUG_TAP) / JUG_TAP;
    H.animate({ dt, speed: 0, grounded: true, action: 'juggle', actionT: trio.t % JUG_TAP, tapLen: JUG_TAP });
    ballPos.copy(H.root.position).addScaledVector(f, 0.38); ballPos.y = 0.35 + Math.sin(ph * Math.PI) * 1.0;
    trio.ball.rotation.x += dt * 8;
    if (trio.t > JUG_TAP * 6) { trio.phase = 'turn'; trio.t = 0; }
  } else if (trio.phase === 'turn') {
    // Let the ball drop to the feet while turning to the next player, then strike.
    face(H, P[next].root.position, 9);
    H.animate({ dt, speed: 0, grounded: true, action: trio.t > 0.35 ? 'kick' : null, actionT: trio.t - 0.35 });
    const f = V(Math.sin(H.root.rotation.y), 0, Math.cos(H.root.rotation.y));
    ballPos.lerp(H.root.position.clone().addScaledVector(f, 0.42).setY(0.11), 1 - Math.exp(-dt * 10));
    if (trio.t > 0.58) { trio.phase = 'pass'; trio.t = 0; trio.from.copy(ballPos); trio.to.copy(P[next].root.position).addScaledVector(P[next].root.position.clone().sub(ballPos).setY(0).normalize(), -0.45).setY(0.11); trio.chip = Math.random() < 0.35; }
  } else if (trio.phase === 'pass') {
    H.animate({ dt, speed: 0, grounded: true, action: 'kick', actionT: trio.t + 0.23 });
    const dur = trio.chip ? 1.15 : 0.95, k = Math.min(1, trio.t / dur);
    ballPos.lerpVectors(trio.from, trio.to, k); ballPos.y = 0.11 + (trio.chip ? Math.sin(k * Math.PI) * 1.6 : 0);
    trio.ball.rotation.x -= dt * 14;
    if (k >= 1) { trio.holder = next; trio.phase = 'juggle'; trio.t = 0; }
  }
}

/* ----------------------------------------------------------------- tunnel */
// "Tunnel" by local.yany (CC BY 4.0). Its stairs climb from the rooms to the pitch:
// the top landing opens behind the benches, the lower end leads on to the locker room.
const tunnel = new THREE.Group(); scene.add(tunnel);
const tunnelReady = loadModel('models/tunnel.glb').then(m => {
  if (!m) return;
  m.rotation.y = Math.PI / 2; m.position.set(26.5, FLOOR, 13);
  m.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    o.material.side = THREE.DoubleSide;
    if (o.material.name === 'Lightbulb') Object.assign(o.material, { emissive: new THREE.Color('#fff4dc'), emissiveIntensity: 2 });
    if (o.material.name === 'Sidewalk' || o.material.name === 'Trashcan' || o.material.name === 'material') o.visible = false;
  });
  tunnel.add(m);
  // Open both ends of the passage.
  cutHoles(m, [B(18.6, -0.3, 11.5, 19.4, 2.6, 14.5), B(33.4, FLOOR - 0.2, 11.5, 34.3, FLOOR + 2.15, 14.5)]);
});
lampAt(22.6, 2.4, 13); lampAt(27.4, FLOOR + 2.0, 13); lampAt(32, FLOOR + 2.0, 13);
{
  // TV on the tunnel wall.
  const tv = new THREE.Group(); tv.position.set(29.6, FLOOR + 1.3, 14.36); tv.rotation.y = Math.PI; tunnel.add(tv);
  rbox(2.0, 0.95, 0.06, 0.03, mat('#15171f', { roughness: 0.4 }), tv, 0, 0, 0);
  makeScreen(2, 1.92, 0.87, tv, 0, 0, 0.035);
}

/* -------------------------------------------------------------- corridors */
// Plain service corridors joining the tunnel, locker room, gym and office.
const indoor = new THREE.Group(); indoor.visible = false; scene.add(indoor);
{
  const H = 2.2, T = 0.1;
  const wallMat = mat('#2b2e3a', { roughness: 0.8 }), floorMat = mat('#1d2029', { roughness: 0.45, metalness: 0.2 }), ceilMat = mat('#16181f', { roughness: 0.9 });
  const stripe = mat('#5b2a86', { roughness: 0.6 }), led = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.4 });
  const add = (w, h, d, m, x, y, z) => box(w, h, d, m, indoor, x, y, z, { cast: false });
  const wallX = (x, z0, z1) => { add(T, H, z1 - z0, wallMat, x, FLOOR + H / 2, (z0 + z1) / 2); add(T * 1.2, 0.3, z1 - z0, stripe, x, FLOOR + 0.15, (z0 + z1) / 2); };
  const wallZ = (z, x0, x1) => { add(x1 - x0, H, T, wallMat, (x0 + x1) / 2, FLOOR + H / 2, z); add(x1 - x0, 0.3, T * 1.2, stripe, (x0 + x1) / 2, FLOOR + 0.15, z); };
  const slab = (x0, z0, x1, z1, ledAlongX) => {
    add(x1 - x0, 0.06, z1 - z0, floorMat, (x0 + x1) / 2, FLOOR - 0.03, (z0 + z1) / 2);
    add(x1 - x0, 0.06, z1 - z0, ceilMat, (x0 + x1) / 2, FLOOR + H + 0.03, (z0 + z1) / 2);
    if (ledAlongX) add(x1 - x0 - 0.4, 0.03, 0.07, led, (x0 + x1) / 2, FLOOR + H - 0.01, (z0 + z1) / 2);
    else add(0.07, 0.03, z1 - z0 - 0.4, led, (x0 + x1) / 2, FLOOR + H - 0.01, (z0 + z1) / 2);
  };
  // A: tunnel → locker room (east, then north to the locker-room door).
  slab(33.86, 11.56, 45.75, 14.44, true); slab(42.85, 5.3, 45.75, 11.56, false);
  wallZ(11.56, 33.86, 42.85); wallZ(14.44, 33.86, 45.75); wallX(45.75, 5.3, 12.45); wallX(45.75, 13.55, 14.44); wallX(42.85, 5.3, 7.87); wallX(42.85, 8.93, 11.56);
  add(T, H - 2.02, 1.1, wallMat, 42.85, FLOOR + 2.02 + (H - 2.02) / 2, 8.4);          // lintel over the padel door
  add(T, H - 2.02, 1.1, wallMat, 45.75, FLOOR + 2.02 + (H - 2.02) / 2, 13);          // lintel over the arcade door
  lampAt(38, FLOOR + 2, 13, '#fff1d6', 4); lampAt(44.3, FLOOR + 2, 8.5, '#fff1d6', 4);
  // B: locker room → gym.
  slab(43.3, -8.32, 44.7, -4.87, false); wallX(43.3, -8.32, -4.87); wallX(44.7, -8.32, -4.87);
  // C: gym → office.
  slab(38.5, -8.32, 39.8, -6.0, false); slab(34.42, -7.45, 38.5, -6.0, true);
  wallX(39.8, -8.32, -6.0); wallX(38.5, -8.32, -7.45); wallZ(-6.0, 34.42, 38.62); wallZ(-6.0, 39.68, 39.8); wallZ(-7.45, 34.42, 38.5);
  add(1.06, H - 2.02, T, wallMat, 39.15, FLOOR + 2.02 + (H - 2.02) / 2, -6.0);          // lintel over the GOUAL RUN door
  lampAt(37, FLOOR + 2, -6.7, '#fff1d6', 4);
}

/* -------------------------------------------------------- hall of fame */
// Framed portraits along corridor A, each with a small spotlight and a name plate.
// To change a photo or a name, edit this list (photos live in photos/).
const hallLights = [];
const HALL = [
  // [file, wall: 's' (right when walking to the door) or 'n', x, name]
  ['hall-01.webp', 's', 35.0, 'YAMAL'],
  ['hall-02.webp', 's', 36.75, 'OLISE'],
  ['hall-03.webp', 's', 38.5, 'KVARA'],
  ['hall-04.webp', 's', 40.25, 'HARRY KANE'],
  ['hall-05.webp', 's', 42.0, 'HAALAND'],
  ['hall-06.webp', 'n', 35.6, 'RODRI'],
  ['hall-07.webp', 'n', 37.35, 'MESSI'],
  ['hall-08.webp', 'n', 39.1, 'DEMBÉLÉ'],
  ['hall-09.webp', 'n', 40.85, 'MBAPPÉ'],
];
{
  const loader = new THREE.TextureLoader();
  const frameMat = mat('#101217', { roughness: 0.35, metalness: 0.4 }), brass = mat('#c9a24a', { roughness: 0.3, metalness: 0.8 });
  const fixture = mat('#1b1d24', { roughness: 0.5, metalness: 0.6 });
  // Soft pool of light on the wall around each frame.
  const wash = canvasTex(128, 256, (c, w, h) => { const g = c.createRadialGradient(w / 2, h * 0.08, 4, w / 2, h * 0.35, h * 0.7); g.addColorStop(0, 'rgba(255,236,200,0.75)'); g.addColorStop(0.45, 'rgba(255,226,180,0.22)'); g.addColorStop(1, 'rgba(255,220,170,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  const washMat = new THREE.MeshBasicMaterial({ map: wash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  HALL.forEach(([file, wall, x, name]) => {
    const g = new THREE.Group(); indoor.add(g);
    const south = wall === 's', z = south ? 14.44 - 0.05 - 0.02 : 11.56 + 0.05 + 0.02;
    g.position.set(x, FLOOR + 1.3, z); g.rotation.y = south ? Math.PI : 0;
    const photo = new THREE.MeshStandardMaterial({ color: '#404040', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.05 });
    const myWash = washMat.clone(); myWash.opacity = 0;
    hallLights.push({ x, photo, wash: myWash, v: 0, on: false, t: 0 });
    const pic = mesh(new THREE.PlaneGeometry(1, 1), photo, g, 0, 0, 0.027, { cast: false });
    const frame = box(1, 1, 0.04, frameMat, g, 0, 0, 0, { cast: false });
    const plate = new THREE.Group(); g.add(plate);
    loader.load('photos/' + file, t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      photo.map = photo.emissiveMap = t; photo.needsUpdate = true;
      const a = t.image.width / t.image.height, h = a < 0.8 ? 1.2 : 0.98, w = h * a;
      pic.scale.set(w, h, 1); frame.scale.set(w + 0.09, h + 0.09, 1);
      plate.position.y = -h / 2 - 0.16;
      const top = h / 2 + 0.24;
      box(0.16, 0.05, 0.05, fixture, g, 0, top, 0.05, { cast: false });
      box(0.05, 0.05, 0.2, fixture, g, 0, top + 0.02, 0.14, { cast: false });
      const wsh = mesh(new THREE.PlaneGeometry(w + 0.9, h + 1.1), myWash, g, 0, 0.05, 0.003, { cast: false, receive: false }); wsh.renderOrder = 1;
    });
    // Name plate (brass, engraved text).
    box(0.62, 0.13, 0.015, brass, plate, 0, 0, 0.01, { cast: false });
    const label = canvasTex(512, 108, (c, w, h) => { c.fillStyle = '#1a1405'; c.font = '800 54px Fredoka, "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, w / 2, h / 2 + 3); });
    mesh(new THREE.PlaneGeometry(0.6, 0.126), new THREE.MeshStandardMaterial({ map: label, transparent: true, roughness: 0.4, metalness: 0.2 }), plate, 0, 0, 0.019, { cast: false });
  });
}

/* ------------------------------------------------- reels: corridor to the office */
// Five vertical films in frames along the corridor from the gym to the coach's office. They play
// muted in a loop (no click): the tour slows down and pauses in front of them. Files live in reels/.
const REELS = [
  // [file, wall: 'n' (left when walking to the office) or 's', x]
  ['reel-1.mp4', 'n', 37.75],
  ['reel-2.mp4', 's', 37.1],
  ['reel-3.mp4', 'n', 36.45],
  ['reel-4.mp4', 's', 35.8],
  ['reel-5.mp4', 'n', 35.15],
];
const reels = [];
{
  const frameMat = mat('#101217', { roughness: 0.35, metalness: 0.4 }), brass = mat('#c9a24a', { roughness: 0.3, metalness: 0.8 });
  const W = 0.56, H = W * 16 / 9;
  REELS.forEach(([file, wall, x]) => {
    const north = wall === 'n', z = north ? -6.0 - 0.05 - 0.02 : -7.45 + 0.05 + 0.02;
    const g = new THREE.Group(); g.position.set(x, FLOOR + 1.12, z); g.rotation.y = north ? Math.PI : 0; indoor.add(g);
    const video = document.createElement('video');
    Object.assign(video, { src: 'reels/' + file, muted: true, loop: true, playsInline: true, preload: 'none', crossOrigin: 'anonymous' });
    video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
    const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace;
    box(W + 0.08, H + 0.08, 0.04, frameMat, g, 0, 0, 0, { cast: false });
    box(W + 0.12, 0.018, 0.05, brass, g, 0, H / 2 + 0.05, 0.005, { cast: false });
    box(W + 0.12, 0.018, 0.05, brass, g, 0, -H / 2 - 0.05, 0.005, { cast: false });
    const black = new THREE.MeshBasicMaterial({ color: '#05060c' });
    const film = mesh(new THREE.PlaneGeometry(W, H), black, g, 0, 0, 0.022, { cast: false, receive: false });
    reels.push({ video, tex, film, filmMat: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), black, on: false });
  });
  lampAt(36.45, FLOOR + 2, -6.72, '#fff1d6', 3);
}
// Play the reels only while the camera is in that corridor (saves data and battery).
function updateReels() {
  const c = camera.position, near = c.y < 0.25 && c.x > 33.6 && c.x < 40.2 && c.z > -9 && c.z < -5.6 && indoor.visible;
  for (const r of reels) {
    if (near && !r.on) { r.on = true; r.video.play().then(() => { r.film.material = r.filmMat; }).catch(() => {}); }
    else if (!near && r.on) { r.on = false; r.video.pause(); }
  }
}

/* ----------------------------------------------------------- arcade doors */
// Doors to the mini-games. The tour stops in front of each; PLAY swings it open onto the game's
// world, and the game opens full screen. STREET FOOT ends corridor A; PADEL CLASH is on the left
// wall of the short corridor down to the locker room; the door by the gym is the next game (coming soon).
const ARCADES = {
  street: { X: 45.75, Z: 13, rot: 0, url: 'street/index.html?embed=1', poster: 'street/poster.jpg', logo: 'goual-art-brush-small.webp', cover: 'street/cover-small.jpg', view: 'street/cover.jpg', viewRepeat: [0.62, 1, 0.24, 0],
    lines: ['STREET', 'FOOT'], tag: 'BALLON D\'OR', foot: 'MINI-GAME · RIO DE JANEIRO', sign: 'ARCADE · STREET FOOT', bg: '#1e5bd8', accent: '#ffd400', accent2: '#ff2d78',
    card: ['STREET FOOT', 'The Ballon d\'Or has gone missing in the favelas of Rio. Play Mbappé, Yamal or Kane and bring it back.'] },
  padel: { X: 42.85, Z: 8.4, rot: Math.PI, url: 'padel/index.html?embed=1', cover: 'padel/cover-small.jpg', view: 'padel/cover.jpg', viewRepeat: [0.5, 1, 0.25, 0],
    lines: ['PADEL', 'CLASH'], tag: 'CR7 VS MESSI', foot: 'MINI-GAME · INDOOR COURT', sign: 'ARCADE · PADEL CLASH', bg: '#0b1230', accent: '#d7ff3a', accent2: '#2a6fd1',
    card: ['PADEL CLASH', 'CR7 vs Messi on a glass court under the floodlights. First to 3 games.'] },
  soon: { X: 39.15, Z: -6.0, rot: -Math.PI / 2, url: null, cover: 'street/cover-small.jpg', view: 'street/cover.jpg', viewRepeat: [0.62, 1, 0.24, 0],
    lines: ['NEXT', 'GAME'], tag: 'COMING SOON', foot: 'NEXT MINI-GAME · STAY TUNED', sign: 'ARCADE · COMING SOON', bg: '#0d1b4d', accent: '#ffd400', accent2: '#ff2d78', card: ['', ''] },
};
for (const [id, A] of Object.entries(ARCADES)) {
  Object.assign(A, { id, open: 0, target: 0 });
  const W = 1.06, H = 2.0;
  // Built in a local frame: the door lies in the x = 0 plane, the visitor stands on the -x side.
  const g = A.group = new THREE.Group(); g.position.set(A.X, FLOOR, A.Z); g.rotation.y = A.rot; indoor.add(g);
  const neon = new THREE.MeshStandardMaterial({ color: A.accent, emissive: A.accent, emissiveIntensity: 2.2 });
  const drawPoster = (c, w, h, img) => {
    c.fillStyle = A.bg; c.fillRect(0, 0, w, h);
    if (img) { const sc = (h * 0.6) / img.height, iw = img.width * sc; c.drawImage(img, (w - iw) / 2 - iw * 0.02, h * 0.22, iw, h * 0.6); }
    let gr = c.createLinearGradient(0, h * 0.2, 0, h * 0.34); gr.addColorStop(0, A.bg); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, h * 0.2, w, h * 0.15);
    gr = c.createLinearGradient(0, h * 0.66, 0, h * 0.82); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, A.bg); c.fillStyle = gr; c.fillRect(0, h * 0.66, w, h * 0.17);
    c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '900 118px Impact, "Arial Black", sans-serif';
    c.fillText(A.lines[0], w / 2, 128); c.fillText(A.lines[1], w / 2, 236);
    c.save(); c.translate(w / 2, 300); c.rotate(-0.05); c.font = 'italic 900 52px "Arial Black", Impact, sans-serif'; c.fillStyle = A.accent2; c.fillText(A.tag, 4, 4); c.fillStyle = A.accent; c.fillText(A.tag, 0, 0); c.restore();
    c.fillStyle = A.accent; c.beginPath(); c.roundRect(w / 2 - 150, h - 150, 300, 84, 42); c.fill();
    c.fillStyle = '#111'; c.font = '900 50px Impact, "Arial Black", sans-serif'; c.fillText('▶ PLAY', w / 2, h - 90);
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '700 24px Arial, sans-serif'; c.fillText(A.foot, w / 2, h - 26);
    c.strokeStyle = A.accent; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
  };
  // Full-bleed poster art (when the game has one): the picture fills the door, the GOUAL ART logo
  // sits in the sky at the top, the PLAY button at the bottom.
  const drawArt = (c, w, h, img, logo) => {
    c.fillStyle = A.bg; c.fillRect(0, 0, w, h);
    // logo band on top, then the picture at full width, fading into the band
    const top = 150, ih = w * img.height / img.width; c.drawImage(img, 0, top, w, ih);
    let gr = c.createLinearGradient(0, top, 0, top + 70); gr.addColorStop(0, A.bg); gr.addColorStop(1, 'rgba(30,91,216,0)'); c.fillStyle = gr; c.fillRect(0, top, w, 70);
    gr = c.createLinearGradient(0, h * 0.8, 0, h); gr.addColorStop(0, 'rgba(10,20,60,0)'); gr.addColorStop(1, 'rgba(10,20,60,.85)'); c.fillStyle = gr; c.fillRect(0, h * 0.8, w, h * 0.2);
    if (logo) { const lh = 128, lw = lh * logo.width / logo.height; c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 14; c.shadowOffsetY = 3; c.drawImage(logo, (w - lw) / 2, 14, lw, lh); c.restore(); }
    c.textAlign = 'center';
    c.fillStyle = A.accent; c.beginPath(); c.roundRect(w / 2 - 150, h - 150, 300, 84, 42); c.fill();
    c.fillStyle = '#111'; c.font = '900 50px Impact, "Arial Black", sans-serif'; c.fillText('▶ PLAY', w / 2, h - 90);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '700 24px Arial, sans-serif'; c.fillText(A.foot, w / 2, h - 26);
    c.strokeStyle = A.accent; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
  };
  const posterTex = canvasTex(512, 1024, (c, w, h) => drawPoster(c, w, h, null));
  if (A.poster) {
    const art = new Image(), logo = new Image(); let n = 0;
    const ready = () => { if (++n < 2) return; drawArt(posterTex.image.getContext('2d'), 512, 1024, art, logo.naturalWidth ? logo : null); posterTex.needsUpdate = true; };
    art.onload = ready; logo.onload = ready; logo.onerror = ready; art.src = A.poster; logo.src = A.logo;
  } else {
    const cover = new Image();
    cover.onload = () => { drawPoster(posterTex.image.getContext('2d'), 512, 1024, cover); posterTex.needsUpdate = true; };
    cover.src = A.cover;
  }
  // Door leaf on a hinge, swinging away from the visitor.
  const hinge = A.hinge = new THREE.Group(); hinge.position.set(0.02, 0, -W / 2); g.add(hinge);
  box(0.05, H, W, mat('#1b2140', { roughness: 0.35, metalness: 0.5 }), hinge, 0, H / 2, W / 2, { cast: false });
  const poster = mesh(new THREE.PlaneGeometry(W * 0.9, H * 0.92), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.35, emissive: '#ffffff', emissiveMap: posterTex, emissiveIntensity: 0.35 }), hinge, -0.03, H / 2, W / 2, { cast: false });
  poster.rotation.y = -Math.PI / 2; poster.userData.arcade = id;
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 10), mat('#d9d9d9', { metalness: 0.9, roughness: 0.25 }), hinge, -0.07, H * 0.5, W - 0.1, { cast: false });
  A.hit = [poster];
  // Neon frame and a glowing sign on the lintel.
  box(0.05, H + 0.06, 0.05, neon, g, -0.03, H / 2, -W / 2 - 0.03, { cast: false });
  box(0.05, H + 0.06, 0.05, neon, g, -0.03, H / 2, W / 2 + 0.03, { cast: false });
  box(0.05, 0.05, W + 0.11, neon, g, -0.03, H + 0.03, 0, { cast: false });
  const signTex = canvasTex(512, 64, (c, w, h) => { c.fillStyle = A.bg; c.fillRect(0, 0, w, h); c.fillStyle = A.accent; c.font = '900 40px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = A.accent; c.shadowBlur = 14; c.fillText(A.sign, w / 2, h / 2 + 2); });
  const sign = mesh(new THREE.PlaneGeometry(0.98, 0.12), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }), g, -0.06, 2.11, 0, { cast: false, receive: false });
  sign.rotation.y = -Math.PI / 2;
  // Behind the door: a small room whose back wall is a window onto the game.
  const dark = mat('#141a33', { roughness: 0.9 });
  box(1.7, 0.05, 1.5, dark, g, 0.9, -0.03, 0, { cast: false });
  box(1.7, 0.05, 1.5, dark, g, 0.9, 2.23, 0, { cast: false });
  box(1.7, 2.25, 0.05, dark, g, 0.9, 1.1, -0.75, { cast: false });
  box(1.7, 2.25, 0.05, dark, g, 0.9, 1.1, 0.75, { cast: false });
  const view = new THREE.TextureLoader().load(A.view); view.colorSpace = THREE.SRGBColorSpace;
  view.repeat.set(A.viewRepeat[0], A.viewRepeat[1]); view.offset.set(A.viewRepeat[2], A.viewRepeat[3]);
  const win = mesh(new THREE.PlaneGeometry(1.45, 2.2), new THREE.MeshBasicMaterial({ map: view, toneMapped: false }), g, 1.72, 1.1, 0, { cast: false, receive: false });
  win.rotation.y = -Math.PI / 2;
  g.updateMatrixWorld(true);
  const lamp = g.localToWorld(V(-0.85, 1.9, 0)); lampAt(lamp.x, lamp.y, lamp.z, A.accent, 3, 4);
  A.inside = g.localToWorld(V(0.45, EYE - FLOOR, 0)); A.insideLook = g.localToWorld(V(2.25, 1.15, 0));
}
const arcade = { playing: false, covered: false, current: null };
const anyArcadeOpen = () => Object.values(ARCADES).some(A => A.open > 0.01);

/* ------------------------------------------------------------ locker room */
// 3D model (Locker-Room, converted from 3DS and optimised), dressed like a pro locker room:
// glowing lockers with numbered GOUAL jerseys, crests above, patterned benches, kit, a red LED cove,
// a glossy floor with a red line, and the wall TV playing the fourth film.
const lockerRoom = new THREE.Group(); lockerRoom.position.y = FLOOR; indoor.add(lockerRoom);
const jerseyTex = n => canvasTex(256, 256, (c, w) => {
  c.fillStyle = '#1b2a6b';
  c.beginPath(); c.moveTo(60, 36); c.lineTo(100, 20); c.quadraticCurveTo(128, 52, 156, 20); c.lineTo(196, 36); c.lineTo(240, 88); c.lineTo(200, 112);
  c.lineTo(192, 100); c.lineTo(192, 240); c.lineTo(64, 240); c.lineTo(64, 100); c.lineTo(56, 112); c.lineTo(16, 88); c.closePath(); c.fill();
  c.fillStyle = '#ffb400'; c.textAlign = 'center';
  c.font = '700 26px Fredoka, sans-serif'; c.fillText('GOUAL', 128, 92);
  c.font = '700 96px Fredoka, sans-serif'; c.fillText(String(n), 128, 196);
});
const crestTex = k => canvasTex(256, 192, (c, w, h) => {
  c.fillStyle = '#5b2a86'; c.fillRect(0, 0, w, h);
  if (k % 2) { ['#ff5a5f', '#ffffff', '#00a6ed'].forEach((col, i) => { c.fillStyle = col; c.fillRect(48 + i * 54, 40, 54, 112); }); }
  else {
    c.fillStyle = '#ffb400'; c.beginPath(); c.arc(w / 2, h / 2, 62, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5b2a86'; c.font = '700 84px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('G', w / 2, h / 2 + 6);
  }
});
const fabricTex = canvasTex(256, 64, (c, w, h) => {
  c.fillStyle = '#2b2b33'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) {
    c.fillStyle = '#c8202f'; c.fillRect(x, 8, 16, h - 16);
    c.fillStyle = '#f2f2f2'; c.beginPath(); c.moveTo(x + 16, h / 2); c.lineTo(x + 24, 12); c.lineTo(x + 32, h / 2); c.lineTo(x + 24, h - 12); c.closePath(); c.fill();
  }
}, [8, 1]);
const lockerReady = loadModel('models/locker.glb').then(m => {
  if (!m) return;
  m.scale.setScalar(0.01);
  m.position.set(40.5 - 10.835, 0, 1.44);                  // centre the room on x 40.6, z 0.2
  lockerRoom.add(m);
  const jerseys = []; let screenMesh = null, shell = null;
  const satin = mat('#f6f7fb', { roughness: 0.32, side: THREE.DoubleSide });   // walls and ceiling are seen from inside
  m.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    o.material.side = THREE.DoubleSide;           // the room is seen from inside: show both faces
    if (/^Arch30/.test(o.name) && o.material.name === 'Material #1') jerseys.push(o);
    else if (o.name === 'Plane_002_') screenMesh = o;
    else if (o.material.name === '10 - Default') { o.material = satin; if (o.name === 'Shape1') shell = o; }
  });
  scene.updateMatrixWorld(true);
  const room = new THREE.Box3().setFromObject(shell || m), centre = room.getCenter(new THREE.Vector3());
  const L = v => v.clone().sub(lockerRoom.position);    // world → lockerRoom space
  // Lockers: hide the untextured cloth, add a glowing back, a numbered jersey, a crest, kit and shoes.
  const glow = new THREE.MeshStandardMaterial({ color: '#bff0ff', emissive: '#6fd6ff', emissiveIntensity: 1.1 });
  const rows = { x: [], z: [] };
  jerseys.forEach((o, i) => {
    o.visible = false;
    const b = new THREE.Box3().setFromObject(o), c = L(b.getCenter(new THREE.Vector3())), size = b.getSize(new THREE.Vector3());
    const alongZ = size.x < size.z;                                   // locker row runs along z: faces ±x
    const inward = alongZ ? new THREE.Vector3(Math.sign(centre.x - b.getCenter(new THREE.Vector3()).x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(centre.z - b.getCenter(new THREE.Vector3()).z));
    const rotY = Math.atan2(inward.x, inward.z);
    const at = (d, y) => c.clone().addScaledVector(inward, d).setY(y);
    const add = (geo, material, d, y) => { const me = new THREE.Mesh(geo, material); me.position.copy(at(d, y)); me.rotation.y = rotY; lockerRoom.add(me); return me; };
    add(new THREE.PlaneGeometry(0.6, 1.6), glow, -0.02, 1.15);
    add(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: jerseyTex(i + 2), transparent: true, roughness: 0.8 }), 0.0, 1.3);
    add(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshStandardMaterial({ map: crestTex(i), roughness: 0.6 }), 0.36, 2.12);
    // Folded kit on the bench and a pair of boots in front.
    const kit = add(new RoundedBoxGeometry(0.36, 0.08, 0.28, 2, 0.03), mat(pick(['#1b2a6b', '#ffffff', '#ff5a5f'])), 0.62, 0.52);
    kit.castShadow = true;
    [-0.08, 0.08].forEach(dx => { const boot = add(new RoundedBoxGeometry(0.1, 0.09, 0.27, 2, 0.04), mat(pick(['#ff7eb6', '#00c2a8', '#ffb400', '#f2f2f2'])), 1.0, 0.05); boot.position.add(new THREE.Vector3(inward.z, 0, -inward.x).multiplyScalar(dx)); });
    (alongZ ? rows.x : rows.z).push({ c, inward, rotY });
  });
  // One long patterned bench in front of each row of lockers.
  Object.values(rows).forEach(row => {
    if (!row.length) return;
    const { inward, rotY } = row[0];
    const along = new THREE.Vector3(inward.z, 0, -inward.x);
    const ts = row.map(r => r.c.dot(along)), mid = row[0].c.clone().addScaledVector(along, (Math.min(...ts) + Math.max(...ts)) / 2 - row[0].c.dot(along));
    const len = Math.max(...ts) - Math.min(...ts) + 0.7;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(len, 0.12, 0.5, 2, 0.04), mat('#33343d', { roughness: 0.6 }));
    seat.position.copy(mid).addScaledVector(inward, 0.62).setY(0.42); seat.rotation.y = rotY; seat.castShadow = true; lockerRoom.add(seat);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.36), new THREE.MeshStandardMaterial({ map: fabricTex, roughness: 0.9 }));
    front.position.copy(mid).addScaledVector(inward, 0.875).setY(0.2); front.rotation.y = rotY; lockerRoom.add(front);
    // Purple band above the lockers, carrying the crests.
    const band = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.48), mat('#5b2a86', { roughness: 0.5 }));
    band.position.copy(mid).addScaledVector(inward, 0.34).setY(2.12); band.rotation.y = rotY; lockerRoom.add(band);
  });
  // Red LED cove along the top of the walls, and a red line on the floor.
  const red = new THREE.MeshStandardMaterial({ color: '#ff2a3d', emissive: '#ff1e32', emissiveIntensity: 1.6 });
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.2 });
  const lo = L(room.min), hi = L(room.max), mx = (lo.x + hi.x) / 2, mz = (lo.z + hi.z) / 2, top = hi.y - 0.12;
  const cove = (w, x, z, ry) => { [[red, top, 0.16], [white, top - 0.13, 0.04]].forEach(([mt, y, h]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mt); b.position.set(x, y, z); b.rotation.y = ry; lockerRoom.add(b); }); };
  cove(hi.x - lo.x - 0.2, mx, lo.z + 0.08, 0); cove(hi.x - lo.x - 0.2, mx, hi.z - 0.08, 0);
  cove(hi.z - lo.z - 0.2, lo.x + 0.08, mz, Math.PI / 2); cove(hi.z - lo.z - 0.2, hi.x - 0.08, mz, Math.PI / 2);
  const line = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.28, 96, 1, Math.PI * 0.02, Math.PI * 0.46), red);
  line.rotation.x = -Math.PI / 2; line.position.set(lo.x + 0.2, 0.012, hi.z - 0.2); line.rotation.z = Math.PI * 1.5; lockerRoom.add(line);
  // Lights: warm ceiling, cool locker glow, a touch of red.
  [[mx, top - 0.3, mz, '#fff4e6', 14, 12], [lo.x + 1.2, 1.6, mz, '#7fdcff', 6, 6], [mx, 1.6, hi.z - 1.2, '#7fdcff', 6, 6], [mx + 2, top - 0.2, lo.z + 1, '#ff3b4a', 4, 6]]
    .forEach(([x, y, z, col, i, d]) => lampAt(x, y + FLOOR, z, col, i, d));
  // Doors: in from the tunnel corridor (south wall), out to the gym (north wall).
  cutHoles(m, [B(42.95, FLOOR - 0.2, 4.6, 45.65, FLOOR + 2.2, 5.8), B(43.3, FLOOR - 0.2, -5.4, 44.7, FLOOR + 2.2, -4.4)]);
  // The wall TV: black glass with the film fitted inside, and the camera stop in front of it.
  if (screenMesh) {
    screenMesh.material = new THREE.MeshBasicMaterial({ color: '#05060c' });
    const tb = new THREE.Box3().setFromObject(screenMesh), tc = tb.getCenter(V(0, 0, 0)), ts = tb.getSize(V(0, 0, 0));
    makeScreen(3, ts.z * 0.97, ts.y * 0.95, null, tb.min.x - 0.012, tc.y, tc.z, -Math.PI / 2);
    const k = KEYS.find(k => k.station === 3);
    k.look.copy(tc); k.pos.set(tc.x - 2.1, tc.y + 0.1, tc.z);
    rebuildCurves();
  }
});

/* -------------------------------------------------------------------- gym */
// "Modular Gym" by Kristen Brown (CC BY 4.0), modelled in feet.
const gymReady = loadModel('models/gym.glb').then(m => {
  if (!m) return;
  m.scale.setScalar(0.3048); m.rotation.y = -Math.PI / 2; m.position.set(41.6, FLOOR, -16.85);
  indoor.add(m); scene.updateMatrixWorld(true);
  m.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    // Take the doors off their frames: the corridors come straight in.
    if (o.material.name === 'lambert3SG1' && new THREE.Box3().setFromObject(o).getCenter(V(0, 0, 0)).z > -9.2) o.visible = false;
  });
  cutHoles(m, [B(43.3, FLOOR - 0.2, -8.7, 44.7, FLOOR + 2.2, -7.9), B(38.5, FLOOR - 0.2, -8.7, 39.8, FLOOR + 2.2, -7.9)]);
});
{
  // The model has no ceiling: add one with light panels.
  const x0 = 37.79, x1 = 45.41, z0 = -20.66, z1 = -8.16, top = FLOOR + 2.743;
  box(x1 - x0, 0.06, z1 - z0, mat('#f1f1ee', { roughness: 0.9 }), indoor, (x0 + x1) / 2, top + 0.03, (z0 + z1) / 2, { cast: false });
  const panel = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.3 });
  [-11, -14.5, -18].forEach(z => [39.8, 43.4].forEach(x => box(1.2, 0.03, 0.6, panel, indoor, x, top - 0.01, z, { cast: false })));
  lampAt(41.6, top - 0.4, -11, '#ffffff', 8, 10); lampAt(41.6, top - 0.4, -16.5, '#ffffff', 8, 10);
  // Big wall screen over the gym TV.
  const frame = new THREE.Group(); frame.position.set(38.66, FLOOR + 1.55, -13.59); frame.rotation.y = Math.PI / 2; indoor.add(frame);
  rbox(1.1, 1.5, 0.05, 0.03, mat('#15171f', { roughness: 0.4 }), frame, 0, 0, -0.02);
  makeScreen(4, 1.02, 1.42, frame, 0, 0, 0.01);
}

/* ---------------------------------------------------------------- office */
// "Modern Office" by dylanheyes (CC BY 4.0), with the coach at his desk.
const office = new THREE.Group(); indoor.add(office);
let coachHead = null;
const officeReady = loadModel('models/office.glb').then(m => {
  if (!m) return;
  m.position.set(31, FLOOR + 1.54, -6.8); office.add(m); scene.updateMatrixWorld(true);
  m.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    if (o.material.name === 'Painting') o.visible = false;
  });
  cutHoles(m, [B(34.1, FLOOR - 0.2, -7.45, 34.8, FLOOR + 2.2, -6.0)]);
  // Modesty panel on the visitor's side of the desk, so the coach's legs stay hidden.
  const top = -1.43, bottom = FLOOR + 0.04;
  box(0.03, top - bottom, 2.14, mat('#eeeeec', { roughness: 0.45 }), office, 31.3, (top + bottom) / 2, -6.8, { cast: false });
});
lampAt(31.2, FLOOR + 2.7, -6.8, '#ffe6c4', 6, 9); lampAt(33.4, FLOOR + 2.6, -7.6, '#ffe6c4', 3, 7);
{
  // Wall screen where the painting was.
  const frame = new THREE.Group(); frame.position.set(31, FLOOR + 1.62, -8.93); office.add(frame);
  rbox(2.3, 1.5, 0.05, 0.03, mat('#15171f', { roughness: 0.4 }), frame, 0, 0, 0);
  makeScreen(5, 2.22, 1.42, frame, 0, 0, 0.03);
}
const coachReady = loadModel('models/coach.glb').then(m => {
  if (!m) return;
  m.traverse(o => {
    if (!o.isMesh) return;
    if (/shadow|plane/i.test(o.name + o.parent.name)) o.visible = false;
    if (o.material.name === 'Std_Skin_Leg') o.visible = false;                       // legs stay out of sight behind the desk panel
  });
  prepCharacter(m);
  const pose = poseSeated(m, { rig: 'unreal', seat: 0.42, arms: [38, 40, 75, 55], lean: 6, headDown: 4 });
  const seat = new THREE.Group(); seat.position.set(30.4, FLOOR, -6.8); seat.rotation.y = Math.PI / 2; office.add(seat); seat.add(m);
  // He turns his head to whoever walks in.
  const { head, neck } = pose.bones;
  coachHead = { head, neck, h: head.quaternion.clone(), n: neck.quaternion.clone(), yaw: 0, pitch: 0 };
});
const headDir = new THREE.Vector3(), headPos = new THREE.Vector3();
function lookAtCamera(dt) {
  const c = coachHead;
  c.head.quaternion.copy(c.h); c.neck.quaternion.copy(c.n); c.head.updateMatrixWorld(true);
  c.head.getWorldPosition(headPos); headDir.copy(camera.position).sub(headPos);
  // The coach faces +x: yaw 0 is straight ahead.
  const yaw = clamp(Math.atan2(-headDir.z, headDir.x), -1.1, 1.1), pitch = clamp(Math.atan2(headDir.y, Math.hypot(headDir.x, headDir.z)), -0.4, 0.4);
  const k = 1 - Math.exp(-dt * 4);
  c.yaw += (yaw - c.yaw) * k; c.pitch += (pitch - c.pitch) * k;
  const deg = THREE.MathUtils.radToDeg;
  turnBone(c.neck, AY, deg(c.yaw) * 0.4); turnBone(c.head, AY, deg(c.yaw) * 0.6);
  turnBone(c.head, V(-Math.sin(c.yaw), 0, -Math.cos(c.yaw)), -deg(c.pitch) * 0.8);
}

/* ---------------------------------------------------------- ballon d'or */
// The golden ball on the green counter, next to the water bottles, under its own small spot.
loadModel('models/ballon-dor.glb').then(m => {
  if (!m) return;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material.metalness = 1; o.material.roughness = Math.max(0.18, o.material.roughness); o.material.envMapIntensity = 2.4; o.material.emissive = new THREE.Color('#5a3a08'); o.material.emissiveIntensity = 0.35; } });
  const b = new THREE.Box3().setFromObject(m), s = 0.46 / (b.max.y - b.min.y);
  m.scale.setScalar(s); m.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(V(0, 0, 0));
  const g = new THREE.Group(); g.position.set(41.45, -1.19, 0.2); g.rotation.y = 0.6; indoor.add(g);
  m.position.set(-c.x, -b2.min.y, -c.z); g.add(m);
});
lampAt(41.9, FLOOR + 1.9, 0.6, '#ffe2a6', 4, 3);

/* ------------------------------------------------------------ camera path */
// Keyframes: camera position and look target. Timing comes from the distance between keys,
// so the camera moves at an even pace; stations (films) get a short pause.
const HOLD = 0.012;
const KEYS = [
  { pos: [0, 150, 14], look: [0, 0, 0] },
  { pos: [-30, 102, 58], look: [0, 10, 0], w: 0.45 },                                 // through the clouds
  { pos: [-8, 66, 20], look: [0, 0, 0], w: 0.45 },
  { pos: [0, 44, 2], look: [0, 0, -6], w: 0.45 },                                     // above the roof opening
  { pos: [-3, 18, 4], look: [-10, 8, -14], w: 0.6 },                                 // down into the bowl
  { station: 0, pos: [-18, 12, 12], look: [-26, 16, 24] },                   // set from the scoreboard on load
  { pos: [7, 3.2, 12], look: [16.4, 1, 6] },
  { station: 1, pos: [16.9, 1.4, 5.7], look: [16.2, 0.95, 6] },              // set from the player on load
  { pos: [16.4, 1.7, 9.8], look: [19.5, 1.5, 13] },
  { pos: [17.7, 1.65, 13], look: [24, 0.6, 13] },                            // tunnel mouth
  { pos: [20.4, 1.6, 13], look: [26, -0.4, 13] },
  { pos: [23, 0.4, 13], look: [29, EYE - 0.1, 13] },                         // down the stairs
  { pos: [26, EYE, 13], look: [30, EYE - 0.1, 14] },
  { station: 2, pos: [29.6, EYE - 0.15, 11.95], look: [29.6, FLOOR + 1.3, 14.4] },
  { pos: [33, EYE, 13], look: [40, EYE, 13], w: 2.2 },
  { pos: [37.8, EYE, 13], look: [44, EYE - 0.1, 13], w: 2.8 },                 // hall of fame: slow
  { game: 'street', pos: [42.55, EYE, 13], look: [45.75, FLOOR + 1.1, 13], w: 2.8 },      // STREET FOOT door
  { pos: [44.2, EYE, 11.4], look: [44.3, EYE, 6], w: 3.2 },                   // corner (slow between the two doors)
  { game: 'padel', pos: [45.5, EYE - 0.05, 8.4], look: [42.85, FLOOR + 1.2, 8.4], w: 3.2 },    // PADEL CLASH door (left wall)
  { pos: [44.3, EYE, 7.0], look: [43, EYE - 0.1, 2], w: 2.2 },
  { pos: [44, EYE, 4.2], look: [45.86, FLOOR + 1.35, 2.3], w: 2.4 },            // into the locker room: the TV first
  { w: 2.2, station: 3, pos: [43.8, FLOOR + 1.45, 2.06], look: [45.86, FLOOR + 1.32, 2.06] },   // set from the TV on load
  { pause: 1, pos: [42.85, EYE - 0.05, 1.15], look: [41.45, FLOOR + 1.05, 0.2], w: 4.5 },     // the Ballon d'Or by the water bottles: slow, short stop
  { pos: [42.6, EYE, -1.2], look: [44, EYE, -6], w: 3 },
  { pos: [44, EYE, -4.3], look: [44, EYE, -9] },
  { pos: [44, EYE, -7.4], look: [44, EYE - 0.1, -12] },                        // straight through the gym door…
  { pos: [43.95, EYE, -9.5], look: [41, EYE - 0.2, -12.5] },                  // …then turn into the gym
  { pos: [41.4, EYE, -10.2], look: [38.7, FLOOR + 1.5, -13.6] },
  { station: 4, pos: [41.2, FLOOR + 1.55, -13.59], look: [38.66, FLOOR + 1.55, -13.59] },
  { pos: [40.3, EYE, -11], look: [39.2, EYE, -7] },
  { pos: [39.15, EYE, -8.1], look: [39.15, FLOOR + 1.12, -6.0], w: 2 },    // the next game's door, facing you out of the gym (coming soon)
  { pos: [39.1, EYE, -6.85], look: [34, EYE, -6.75] },                        // corner
  { pos: [37.6, EYE, -6.72], look: [33, EYE - 0.05, -6.72], w: 2.8 },        // reels corridor: straight and slow, look left/right
  { pos: [35.6, EYE, -6.72], look: [30.6, FLOOR + 1.3, -6.8], w: 2.8 },
  { pos: [33.8, EYE, -6.7], look: [30.6, FLOOR + 1.25, -6.8] },               // the coach looks up
  { station: 5, pos: [32.9, FLOOR + 1.55, -6.2], look: [31, FLOOR + 1.6, -8.93] },
  { pos: [33.7, FLOOR + 1.65, -5.4], look: [30.6, FLOOR + 1.2, -7.2] },
].map(k => ({ ...k, pos: new THREE.Vector3(...k.pos), look: new THREE.Vector3(...k.look) }));
// Spread progress over the path by distance, so the camera keeps an even pace (the flight in from
// the sky is compressed). The last film ends at 0.93; the final move back leaves room for the contact page.
{
  const last = KEYS.length - 1;
  const cost = KEYS.map((k, i) => i ? Math.pow(k.pos.distanceTo(KEYS[i - 1].pos), 0.6) * (k.w || 1) : 0);
  const holdOf = k => k.station != null ? HOLD : k.game ? HOLD * 1.5 : k.pause ? HOLD * 0.55 : 0;
  const sum = cost.slice(0, last).reduce((a, b) => a + b, 0), holds = KEYS.reduce((a, k) => a + holdOf(k), 0);
  let acc = 0;
  KEYS.forEach((k, i) => { acc += cost[i] / sum * (0.93 - holds); k.p = acc; acc += holdOf(k); k.hold = acc; });
  KEYS[last].p = KEYS[last].hold = 1;
}
let posCurve, lookCurve;
function rebuildCurves() {
  posCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.pos), false, 'centripetal');
  lookCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.look), false, 'centripetal');
}
rebuildCurves();
const U = i => i / (KEYS.length - 1);
// Map scroll progress to a curve parameter: the camera eases into each station, pauses briefly, eases out.
function curveParam(p) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (p <= a.hold) return U(i);
    if (p < b.p) {
      let t = (p - a.hold) / (b.p - a.hold);
      const easeOut = a.station != null || a.game || a.pause || i === 0, easeIn = b.station != null || b.game || b.pause;
      t = easeOut && easeIn ? t * t * (3 - 2 * t) : easeIn ? 1 - (1 - t) * (1 - t) : easeOut ? t * t : t;
      return U(i) + t * (U(i + 1) - U(i));
    }
  }
  return 1;
}
// Furthest a portrait camera may back away from each screen (walls behind it indoors).
const MAX_BACK = [80, 0.8, 2.7, 4, 2.6, 4.2];
function currentStation(p) {
  for (const k of KEYS) if (k.station != null && p >= k.p - 0.02 && p <= k.hold + 0.02) return k.station;
  return -1;
}

/* ------------------------------------------------------------------ sound */
// Ambience, generated live with Web Audio (no sound files): each place has its own bed of sound
// and small one-off events (ball kicks, whistles, drips, clanks, clock ticks...), cross-faded as the
// camera moves. Indoors, sounds go through a little room reverb and the visitor's footsteps are heard.
const sound = {
  ctx: null, master: null, on: false, zones: {}, next: {}, lastStep: 0,
  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // Room reverb: a short decaying noise impulse.
    const len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0;
    this.reverb.connect(this.wet).connect(this.master);
    // One gain per place; each also feeds the reverb.
    for (const z of ['sky', 'stadium', 'tunnel', 'locker', 'gym', 'office']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master); g.connect(this.reverb);
      this.zones[z] = g; this.next[z] = 0;
    }
    this.steps = ctx.createGain(); this.steps.gain.value = 0.9; this.steps.connect(this.master); this.steps.connect(this.reverb);
    // Background music: a looping track, kept low under the ambience.
    this.track = Object.assign(new Audio('music.mp3'), { loop: true, preload: 'auto' });
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.22;
    ctx.createMediaElementSource(this.track).connect(this.musicGain).connect(this.master);
    // Beds (continuous sounds).
    this.bed('sky', 'lowpass', 380, 0.7, 0.5, 0.07, 0.3);           // wind
    this.bed('stadium', 'bandpass', 700, 0.7, 0.07, 0.12, 0.05);    // distant crowd murmur
    this.bed('tunnel', 'lowpass', 120, 0.8, 0.22, 0.05, 0.06);      // low rumble
    this.bed('locker', 'highpass', 3500, 0.6, 0.045, 0.2, 0.02);    // shower running far away
    this.bed('gym', 'lowpass', 160, 0.9, 0.12, 0.3, 0.03);          // ventilation
    this.bed('office', 'lowpass', 260, 0.7, 0.07, 0.1, 0.02);       // air conditioning
    this.hum('tunnel', 50, 0.025); this.hum('gym', 60, 0.02); this.hum('office', 120, 0.006);
  },
  bed(zone, type, freq, q, level, lfoRate, lfoDepth) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = level;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = lfoRate; lg.gain.value = lfoDepth;
    lfo.connect(lg).connect(g.gain); lfo.start();
    src.connect(f).connect(g).connect(this.zones[zone]); src.start();
  },
  hum(zone, freq, level) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.value = freq; g.gain.value = level;
    o.connect(g).connect(this.zones[zone]); o.start();
  },
  // Short sound helpers.
  noise(out, t, { type = 'bandpass', freq = 1000, q = 1, level = 0.3, attack = 0.002, decay = 0.1, sweepTo = 0 }) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(out); src.start(t, Math.random() * 2); src.stop(t + attack + decay + 0.05);
  },
  tone(out, t, { freq = 440, to = 0, type = 'sine', level = 0.2, attack = 0.003, decay = 0.2, vibrato = 0 }) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    if (vibrato) { const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = vibrato; vg.gain.value = freq * 0.06; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + attack + decay + 0.05); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(out); o.start(t); o.stop(t + attack + decay + 0.05);
  },
  metal(out, t, level, base) {                                        // clank: a few inharmonic partials
    [1, 2.76, 5.4, 8.93].forEach((m, i) => this.tone(out, t, { freq: base * m, type: i ? 'sine' : 'triangle', level: level / (i + 1), decay: 0.5 / (1 + i * 0.4) }));
    this.noise(out, t, { freq: 2500, q: 0.8, level: level * 0.8, decay: 0.05 });
  },
  // One-off events per place: [min gap, max gap, play].
  events: {
    stadium: [0.7, 2.6, (s, o, t) => {
      const r = Math.random();
      if (r < 0.72) {                                                 // a pass or a shot: thump of the ball
        const far = 0.4 + Math.random() * 0.6;
        s.tone(o, t, { freq: 140, to: 55, level: 0.35 * far, decay: 0.12 }); s.noise(o, t, { type: 'lowpass', freq: 900, level: 0.25 * far, decay: 0.06 });
        if (Math.random() < 0.3) s.tone(o, t + 0.45 + Math.random() * 0.3, { freq: 110, to: 60, level: 0.12 * far, decay: 0.08 });   // bounce
      } else if (r < 0.86) {                                          // coach's whistle
        const n = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) s.tone(o, t + i * 0.32, { freq: 2850, type: 'sine', level: 0.07, attack: 0.02, decay: 0.24, vibrato: 32 });
      } else {                                                        // a shout from the pitch (formant-ish noise)
        s.noise(o, t, { freq: 650 + Math.random() * 300, q: 6, level: 0.12, attack: 0.04, decay: 0.3, sweepTo: 420 });
      }
    }],
    tunnel: [2.5, 6, (s, o, t) => s.tone(o, t, { freq: 1500 + Math.random() * 500, to: 700, level: 0.06, decay: 0.09 })],   // a drip
    locker: [0.8, 3, (s, o, t) => {
      if (Math.random() < 0.7) s.tone(o, t, { freq: 1100 + Math.random() * 700, to: 520, level: 0.08, decay: 0.08 });   // water drop
      else s.metal(o, t, 0.08, 180 + Math.random() * 80);                                                            // locker door
    }],
    gym: [0.35, 0.45, (s, o, t) => {                                   // treadmill footfalls, and now and then weights
      s.noise(o, t, { type: 'lowpass', freq: 220, level: 0.14, decay: 0.07 });
      if (Math.random() < 0.06) s.metal(o, t + 0.2, 0.11, 140 + Math.random() * 60);
    }],
    office: [1, 1, (s, o, t) => {                                      // clock tick, and some typing
      s.noise(o, t, { type: 'highpass', freq: 3000, level: 0.05, decay: 0.012 });
      if (Math.random() < 0.18) for (let i = 0; i < 6 + Math.random() * 10; i++) s.noise(o, t + 0.2 + i * (0.09 + Math.random() * 0.08), { freq: 2200 + Math.random() * 800, q: 2, level: 0.04, decay: 0.02 });
    }],
  },
  // Called every frame with how much of each place the camera is in (0..1), and whether it is walking.
  update(mix, walking) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    for (const [z, g] of Object.entries(this.zones)) {
      const w = mix[z] || 0;
      g.gain.setTargetAtTime(arcade.playing ? 0 : w, t, 0.6);
      const ev = this.events[z];
      if (ev && w > 0.05 && t >= this.next[z]) {
        this.next[z] = t + ev[0] + Math.random() * (ev[1] - ev[0]);
        ev[2](this, g, t + 0.05);
      }
    }
    this.wet.gain.setTargetAtTime(0.18 + (mix.tunnel || 0) * 0.5 + (mix.locker || 0) * 0.3, t, 0.5);
    this.musicGain.gain.setTargetAtTime(arcade.playing ? 0 : lightbox.hidden ? 0.22 : 0.04, t, 0.4);   // almost silent while a film plays, off during the game
    // Footsteps on hard floors while the camera moves indoors.
    if (walking && t - this.lastStep > 0.52) {
      this.lastStep = t;
      this.noise(this.steps, t, { type: 'lowpass', freq: 600, level: 0.16, decay: 0.07 });
      this.noise(this.steps, t + 0.012, { freq: 3200, q: 1.5, level: 0.05, decay: 0.03 });
    }
  },
  toggle() {
    this.init(); this.ctx.resume(); this.on = !this.on;
    if (this.on) this.track.play().catch(() => {}); else this.track.pause();
    this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.3);
    return this.on;
  },
  whoosh() {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    this.noise(this.master, t, { freq: 300, sweepTo: 2200, q: 1.4, level: 0.2, attack: 0.2, decay: 0.6 });
  },
  click() {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    this.noise(this.master, t, { type: 'highpass', freq: 2500, level: 0.12, decay: 0.03 });
    this.tone(this.master, t, { freq: 90, to: 60, level: 0.08, decay: 0.08 });
  },
  pop() {
    if (!this.on) return;
    this.tone(this.master, this.ctx.currentTime, { freq: 520, to: 980, level: 0.15, decay: 0.12 });
  },
};
const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  const on = sound.toggle();
  soundBtn.setAttribute('aria-pressed', on);
  soundBtn.querySelector('.label').textContent = on ? 'SOUND ON' : 'SOUND OFF';
});

/* --------------------------------------------------------------- chapters */
const contactEl = $('.chapter.contact');
STATIONS.forEach((st, i) => {
  const el = document.createElement('section');
  el.className = 'chapter station' + (i % 2 ? ' right' : '');
  el.dataset.station = i;
  el.innerHTML = `<div class="card"><div class="place">${String(i + 1).padStart(2, '0')} — ${st.place}</div><h2>${st.title}</h2><button type="button" class="play" data-open="${i}"><i>▶</i>PLAY FILM</button><span class="hint">or click the screen</span></div>`;
  contactEl.before(el);
});
for (const A of Object.values(ARCADES)) {
  if (!A.url) continue;
  const k = KEYS.find(k => k.game === A.id), el = document.createElement('section');
  el.className = 'chapter station arcade-stop arcade-' + A.id + (A.id === 'padel' ? ' right' : ''); el.dataset.range = `${k.p - 0.015},${k.hold + 0.015}`;
  el.innerHTML = `<div class="card"><div class="place">MINI-GAME — THE ARCADE DOOR</div><h2>${A.card[0]}</h2><p class="pitch">${A.card[1]}</p><button type="button" class="play" data-arcade="${A.id}"><i>▶</i>PLAY</button><span class="hint">or click the door</span></div>`;
  contactEl.before(el);
}
const chapterEls = [...document.querySelectorAll('.chapter')];
const stageNum = $('#stage-num'), bar = $('#progress-bar');
stageNum.textContent = `00 / ${TOTAL}`;

/* --------------------------------------------------------------- lightbox */
const lightbox = $('#lightbox'), lbVideo = $('#lightbox-video'), lbTitle = $('#lightbox-title');
function openFilm(i) {
  const st = STATIONS[i];
  lbVideo.src = st.src; lbTitle.textContent = st.title;
  lightbox.hidden = false; requestAnimationFrame(() => lightbox.classList.add('open'));
  lbVideo.play().catch(() => {});
  sound.pop();
  $('#lightbox-close').focus();
}
function closeFilm() {
  lightbox.classList.remove('open'); lbVideo.pause();
  setTimeout(() => { lightbox.hidden = true; lbVideo.removeAttribute('src'); lbVideo.load(); }, 350);
}
$('#lightbox-close').addEventListener('click', closeFilm);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeFilm(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !lightbox.hidden) closeFilm(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openFilm(+b.dataset.open); });

// Click (or tap) a screen in the scene to open its film.
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const hitTargets = () => screens.flatMap(s => s.hit);
function screenAt(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hit = ray.intersectObjects(hitTargets(), false).find(h => shown(h.object));
  return hit && hit.distance < (hit.object.userData.station ? 12 : 60) ? hit.object.userData.station : null;
}
function doorAt(x, y) {
  if (!indoor.visible) return null;
  const A = Object.values(ARCADES).find(A => atArcade(A.id)); if (!A) return null;
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(A.hit, false).length > 0 ? A.id : null;
}
let downAt = null;
canvas.addEventListener('pointerdown', e => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
  const s = screenAt(e.clientX, e.clientY);
  if (s != null) openFilm(s);
  else { const d = doorAt(e.clientX, e.clientY); if (d) openArcade(d); }
});

/* ----------------------------------------------------------------- arcade */
const arcadeEl = $('#arcade'), arcadeFrame = $('#arcade iframe');
function openArcade(id = 'street') {
  const A = ARCADES[id];
  if (!A || !A.url || arcade.playing || state !== 'ready') return;
  arcade.playing = true; arcade.current = A; A.target = 1; sound.pop(); body.classList.add('arcade-on');
  // Phones: load the game as its own page instead of on top of the stadium, so the phone never holds
  // two 3D scenes in memory at once (iPhones reload the page when that happens). Closing the game
  // brings you back here, in front of the same door.
  if (matchMedia('(pointer: coarse)').matches) { setTimeout(() => { location.href = A.url.replace('?embed=1', '?from=tour'); }, 1150); return; }
  setTimeout(() => {
    arcadeFrame.src = A.url;
    arcadeEl.hidden = false; requestAnimationFrame(() => arcadeEl.classList.add('open'));
    setTimeout(() => { arcade.covered = true; arcadeFrame.focus(); }, 700);
  }, 1150);
}
function closeArcade(then) {
  arcade.covered = false; arcadeEl.classList.remove('open'); if (arcade.current) arcade.current.target = 0;
  setTimeout(() => { arcadeEl.hidden = true; arcadeFrame.removeAttribute('src'); arcade.playing = false; body.classList.remove('arcade-on'); then && then(); }, 600);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-arcade]'); if (b) openArcade(b.dataset.arcade || 'street'); });
addEventListener('message', e => {
  if (e.origin !== location.origin || (e.data?.type !== 'goual-street' && e.data?.type !== 'goual-arcade')) return;
  if (e.data.action === 'close') closeArcade();
  if (e.data.action === 'contact') closeArcade(() => { target = 1; sound.whoosh(); });
  if (e.data.action === 'ready') arcadeFrame.focus();
});
const atArcade = id => { const k = KEYS.find(k => k.game === id); return !!k && progress >= k.p - 0.015 && progress <= k.hold + 0.015; };

/* ------------------------------------------------------------- navigation */
let state = 'loading', progress = 0, target = 0;
let freeCam = null;   // debug only
const mouse = new THREE.Vector2(), mouseSmooth = new THREE.Vector2();
const blocked = () => state !== 'ready' || !lightbox.hidden || arcade.playing;
function addScroll(d) { if (!blocked()) target = clamp(target + d, 0, 1); }
// Inside the contact page, let the page itself scroll; only leave it (back up the tour) from its top.
const contactPage = $('.chapter.contact');
function contactWants(e, forward) {
  if (!contactPage.classList.contains('on') || !contactPage.contains(e.target)) return false;
  return forward || contactPage.scrollTop > 0;      // forward: the tour is already at its end, so the page scrolls
}
addEventListener('wheel', e => {
  const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? innerHeight : 1;
  if (contactWants(e, e.deltaY > 0)) return;
  addScroll(e.deltaY * k * 0.00005);
}, { passive: true });
let touchY = null, touchX = null;
// In the hall of fame you can look left and right: mouse left/right, arrow keys, or a sideways swipe.
let hallW = 0, hallYaw = 0, hallYawTarget = 0, pointerKind = 'mouse';
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; pointerKind = 'touch'; }, { passive: true });
addEventListener('touchmove', e => {
  if (touchY == null) return;
  const y = e.touches[0].clientY, x = e.touches[0].clientX, d = touchY - y, dx = x - touchX; touchY = y; touchX = x;
  if (contactWants(e, d > 0)) return;
  if (hallW > 0.3 && !blocked()) { hallYawTarget = clamp(hallYawTarget + dx * 0.006, -1.35, 1.35); if (Math.abs(dx) > Math.abs(d)) return; }
  addScroll(d * 0.0003);
}, { passive: true });
addEventListener('touchend', () => (touchY = touchX = null));
addEventListener('keydown', e => {
  if (e.target.closest('form')) return;                       // typing in the contact form
  const step = { ArrowDown: 0.015, PageDown: 0.04, ArrowUp: -0.015, PageUp: -0.04, Space: e.shiftKey ? -0.03 : 0.03 }[e.code];
  if (step) { addScroll(step); e.preventDefault(); }
  if (hallW > 0.3 && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { pointerKind = 'keys'; hallYawTarget = clamp(hallYawTarget + (e.code === 'ArrowLeft' ? 0.45 : -0.45), -1.35, 1.35); e.preventDefault(); }
  if (e.code === 'Home') addScroll(-1);
  if (e.code === 'End') addScroll(1);
});
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', e => {
  e.preventDefault();
  if (!blocked()) { target = parseFloat(el.dataset.goto); sound.whoosh(); }
}));
addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' && pointerKind !== 'mouse' && Math.abs(e.movementX) > 2) pointerKind = 'mouse';
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (state === 'ready' && e.pointerType === 'mouse') canvas.classList.toggle('hot', screenAt(e.clientX, e.clientY) != null || !!doorAt(e.clientX, e.clientY));
});

/* ----------------------------------------------------------------- loader */
const counterEl = $('#counter');
const loadStart = performance.now();
let loaded = 0;
const toLoad = [document.fonts ? document.fonts.ready : Promise.resolve(), stadiumReady, cityReady, playerReady, tunnelReady, lockerReady, gymReady, officeReady, coachReady, ...screens.filter(Boolean).map(s => new Promise(res => {
  if (s.video.readyState >= 1) return res();
  s.video.addEventListener('loadedmetadata', res, { once: true });
  s.video.addEventListener('error', res, { once: true });
}))];
toLoad.forEach(pr => pr.then(() => loaded++));
const loadTimeout = setTimeout(() => (loaded = toLoad.length), 9000);
function updateLoader() {
  const n = Math.max(0, Math.round(99 * (1 - Math.min((performance.now() - loadStart) / 2400, loaded / toLoad.length))));
  counterEl.textContent = String(n).padStart(2, '0');
  if (n === 0 && loaded >= toLoad.length) {
    clearTimeout(loadTimeout);
    // Compile every shader now (all rooms visible) so nothing stutters the first time a room appears.
    indoor.visible = true; renderer.compile(scene, camera); indoor.visible = false;
    // Canvas textures used font text: redraw now that Fredoka is ready.
    scene.traverse(o => { const m = o.material; if (m && m.map && m.map.isCanvasTexture) m.map.needsUpdate = true; });
    counterEl.classList.add('done');
    renderer.shadowMap.needsUpdate = true;
    state = 'ready'; body.classList.add('ready');
    // Back from a game played on its own page: start the tour in front of that game's door.
    const back = new URLSearchParams(location.search).get('arcade'), bk = back && KEYS.find(k => k.game === back);
    if (bk) { target = progress = bk.p + 0.002; history.replaceState(null, '', location.pathname); }
  }
}


/* ----------------------------------------------------------------- resize */
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 68 : 50;
  // Portrait screens: shift the picture up so the info card does not cover the films.
  if (camera.aspect < 0.8) camera.setViewOffset(innerWidth, innerHeight * 1.3, 0, innerHeight * 0.3, innerWidth, innerHeight);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------- ambience */
// How much of each place's sound to play for a camera position.
function placeMix(P, inside) {
  if (!inside) { const sky = smooth(16, 40, P.y); return { sky, stadium: 1 - sky * 0.8 }; }
  if (P.z > 5.3) return { tunnel: 1, stadium: 0.12 };                       // tunnel and its corridor
  if (P.x > 34.8 && P.z > -4.9) return { locker: 1 };
  if (P.x > 42.5) { const g = smooth(-4.9, -8.6, P.z); return { locker: 1 - g, gym: g }; }
  if (P.z < -8.3) return { gym: 1 };
  const o = smooth(38, 33.5, P.x); return { gym: (1 - o) * 0.6, office: o };   // corridor to the office
}
const lastCam = new THREE.Vector3();

/* ------------------------------------------------------------------- loop */
const clock = new THREE.Clock(), lookAt = new THREE.Vector3();
let lastStation = -1;
// Depth precision: push the near plane out when the camera is high up, so distant flat layers
// (pitch, roads, ground) do not flicker against each other.
function fitNearPlane() {
  const near = clamp(camera.position.y * 0.04, 0.05, 4);
  if (Math.abs(near - camera.near) > camera.near * 0.1) { camera.near = near; camera.updateProjectionMatrix(); }
}
// Resolution follows the frame rate: drop the pixel ratio on slow devices, raise it back when smooth.
const MAX_PR = Math.min(devicePixelRatio, MOBILE ? 1.5 : 1.75);
let frameAvg = 16, prTimer = 0, pixelRatio = MAX_PR;
function adaptResolution(rawDt) {
  frameAvg += (rawDt * 1000 - frameAvg) * 0.05; prTimer += rawDt;
  if (prTimer < 1.5 || state !== 'ready') return;
  const next = frameAvg > 24 ? Math.max(1, pixelRatio - 0.25) : frameAvg < 15 ? Math.min(MAX_PR, pixelRatio + 0.25) : pixelRatio;
  if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(next); renderer.setSize(innerWidth, innerHeight, false); prTimer = 0; }
}
function frame() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime;
  if (arcade.covered) { requestAnimationFrame(frame); return; }      // the game is full screen: rest
  adaptResolution(rawDt);
  if (state === 'loading') updateLoader();

  progress += (target - progress) * (1 - Math.exp(-dt * 2.2));
  const u = curveParam(progress);
  camera.position.copy(posCurve.getPoint(u));
  lookAt.copy(lookCurve.getPoint(u));
  camera.lookAt(lookAt);
  // Arcade door: swing it open and walk the camera through.
  for (const A of Object.values(ARCADES)) {
    A.open += (A.target - A.open) * (1 - Math.exp(-dt * (A.target ? 2.4 : 4)));
    A.hinge.rotation.y = Math.min(1, A.open * 1.5) * 1.55;
    if (A.open > 0.001) {
      const e = smooth(0.25, 1, A.open) * 0.9;
      camera.position.lerp(A.inside, e); lookAt.lerp(A.insideLook, e); camera.lookAt(lookAt);
    }
  }
  if (freeCam) { camera.position.copy(freeCam[0]); camera.lookAt(freeCam[1]); }
  fitNearPlane();
  // Portrait screens are narrow: back the camera away from each screen until it fits the width.
  if (camera.aspect < 0.8) {
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect / 1.3;
    KEYS.forEach(k => {
      if (k.station == null) return;
      const weight = 1 - smooth(0, 0.05, Math.max(k.p - progress, progress - k.hold, 0));
      if (!weight) return;
      const sc = screens[k.station]; if (!sc) return;
      const at = sc.group.getWorldPosition(new THREE.Vector3());
      const need = Math.min(sc.width / 0.92 / (2 * halfTan), MAX_BACK[k.station]);
      const away = camera.position.clone().sub(at), d = away.length();
      if (need > d) camera.position.addScaledVector(away.normalize(), (need - d) * weight);
    });
  }
  // Gentle hand-held drift with the pointer.
  mouseSmooth.lerp(mouse, 1 - Math.exp(-dt * 2.5));
  // Hall of fame (corridor A) and the reels corridor: free look left/right; up/down stays for scrolling.
  const cp = camera.position, inHall = cp.y < 0.25 && (Math.abs(cp.z - 13) < 1.2 && cp.x > 33.3 && cp.x < 42.4 || cp.x > 35.2 && cp.x < 39.2 && cp.z > -7.3 && cp.z < -6.1) && !anyArcadeOpen() && state === 'ready';
  hallW += ((inHall ? 1 : 0) - hallW) * (1 - Math.exp(-dt * 3));
  if (!inHall) hallYawTarget *= Math.exp(-dt * 3);
  const want = pointerKind === 'mouse' ? -mouseSmooth.x * 1.3 : hallYawTarget;
  hallYaw += (want - hallYaw) * (1 - Math.exp(-dt * 4));
  body.classList.toggle('hall', hallW > 0.5 && inHall);
  camera.rotateY(-mouseSmooth.x * 0.04 * (1 - hallW) + hallYaw * hallW);
  camera.rotateX(mouseSmooth.y * 0.025);

  // Living scene: clouds drift; the coach looks at the visitor.
  clouds.forEach((c, i) => { c.position.x += dt * (0.6 + (i % 3) * 0.3); if (c.position.x > 260) c.position.x = -260; });
  driveCars(dt);
  // Indoors once the camera is down the tunnel stairs: swap the outdoor world for the rooms.
  const inside = camera.position.y < 0.25 && camera.position.x > 20.3;
  outdoor.visible = !inside; indoor.visible = inside || camera.position.x > 17.5 && Math.abs(camera.position.z - 13) < 4;
  if (stadiumModel) stadiumModel.visible = !inside;
  bench.visible = !inside;
  tunnel.visible = inside || camera.position.distanceTo(V(26, 0, 13)) < 45;
  if (inside && coachHead && camera.position.x < 40 && camera.position.z < -5) lookAtCamera(dt);
  updateLamps(inside || tunnel.visible);
  updateReels();
  updateTrio(dt);
  // Hall of fame: each frame lights up (with a little flicker and a click) as the camera reaches it.
  if (inside) hallLights.forEach(L => {
    const on = camera.position.x > L.x - 3.2 && Math.abs(camera.position.z - 13) < 2;
    if (on && !L.on) { L.t = 0; sound.click(); }
    L.on = on; L.t += dt;
    const flick = L.on && L.t < 0.35 ? (Math.sin(L.t * 70) > 0 ? 1 : 0.25) : 1;
    L.v += ((L.on ? 1 : 0) - L.v) * (1 - Math.exp(-dt * (L.on ? 5 : 2)));
    const v = L.v * flick;
    L.photo.color.setScalar(0.25 + 0.75 * v); L.photo.emissiveIntensity = 0.05 + 0.45 * v; L.wash.opacity = v;
  });
  sun.intensity = inside ? 0 : 2.7;

  // Play only the films near the camera.
  screens.forEach(s => {
    const d = camera.position.distanceTo(s.group.getWorldPosition(lookAt));
    const near = state === 'ready' && d < (s.index === 0 ? 120 : 14);
    if (near && s.video.paused) s.video.play().catch(() => {});
    if (!near && !s.video.paused) s.video.pause();
  });

  // Chapters, counter, progress bar.
  const station = currentStation(progress);
  chapterEls.forEach(el => {
    let on;
    if (el.dataset.station != null) on = +el.dataset.station === station;
    else { const [a, b] = el.dataset.range.split(',').map(Number); on = progress >= a && progress < b; }
    el.classList.toggle('on', state === 'ready' && on);
  });
  if (station !== lastStation) {
    if (station >= 0) sound.whoosh();
    lastStation = station;
    if (station >= 0) stageNum.textContent = `${String(station + 1).padStart(2, '0')} / ${TOTAL}`;
  }
  // Indoors, the sky/grass ambient light becomes a neutral one.
  hemi.color.set(inside ? '#ffffff' : '#cfe8ff'); hemi.groundColor.set(inside ? '#b9b2a8' : '#6fa85a');
  hemi.intensity = inside ? 0.7 : 1.15; scene.environmentIntensity = inside ? 0.25 : 0.35;
  body.classList.toggle('end', progress > 0.96);
  bar.style.transform = `scaleX(${progress})`;
  // Muffle the crowd indoors.
  // Ambience follows the camera from place to place; footsteps while walking indoors.
  const walking = inside && camera.position.distanceTo(lastCam) / Math.max(dt, 1e-3) > 0.45;
  lastCam.copy(camera.position);
  sound.update(placeMix(camera.position, inside), walking);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The WORK link jumps to the first film.
document.querySelectorAll('[data-goto="0.2"]').forEach(el => (el.dataset.goto = KEYS.find(k => k.station === 0).p));
// Mobile menu (burger).
const burger = $('#burger'), mobileMenu = $('#mobile-menu');
const setMenu = open => { mobileMenu.hidden = !open; burger.setAttribute('aria-expanded', open); body.classList.toggle('menu-open', open); };
burger.addEventListener('click', () => setMenu(mobileMenu.hidden));
mobileMenu.addEventListener('click', e => { if (e.target.closest('a,button')) setMenu(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !mobileMenu.hidden) setMenu(false); });
if (new URLSearchParams(location.search).has('debug')) window.__goual = { goto: v => (target = progress = v), progress: () => progress, state: () => state, open: openFilm, sound, view: (p, l) => (freeCam = p && [V(...p), V(...l)]), trio, keys: () => KEYS.map(k => [+k.p.toFixed(4), k.station ?? '', k.pos.toArray().map(v => +v.toFixed(2))]), scene, camera, THREE };
