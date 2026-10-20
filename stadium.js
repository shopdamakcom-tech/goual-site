import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/* ------------------------------------------------------------------ data */
// Each stop on the tour shows one film on a screen in the scene.
const STATIONS = [
  { src: '07.mp4', title: 'COUPE DU MONDE BY GOUAL ART', sub: 'AI FILM', place: 'THE STADIUM SCREEN' },
  { src: '08.mp4', title: 'GOUAL ART', sub: 'AI ANIMATION', place: "THE COACH'S TABLET" },
  { src: '09.mp4', title: 'OVASPORT', sub: '3D / ADVERTISING', place: 'THE PLAYERS’ TUNNEL' },
  { src: '04.mp4', title: 'GOUAL ART', sub: 'FASHION FILM', place: 'THE LOCKER ROOM' },
  { src: '01.mp4', title: 'JAYÎNA', sub: 'AI PRODUCT FILM', place: "THE COACH'S OFFICE" },
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

const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#ffe9c9');
scene.fog = new THREE.Fog(HORIZON, 140, 420);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 900);

/* ----------------------------------------------------------------- lights */
scene.add(new THREE.HemisphereLight('#cfe8ff', '#6fa85a', 1.15));
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
const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, fog: false, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#3f9df0') }, mid: { value: new THREE.Color('#9fd3ff') }, bottom: { value: HORIZON } },
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 top,mid,bottom; varying vec3 vP;
    void main(){ float h=vP.y; vec3 c=h>0.15?mix(mid,top,smoothstep(.15,.7,h)):mix(bottom,mid,smoothstep(-.02,.15,h)); gl_FragColor=vec4(c,1.); }`,
}));
scene.add(sky);

const ground = mesh(new THREE.CircleGeometry(600, 64), mat('#86c95e', { roughness: 0.95 }), null, 0, -0.02, 0, { cast: false });
ground.rotation.x = -Math.PI / 2;
// Rolling hills on the horizon.
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(190, 280);
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

/* ---------------------------------------------------------------- village */
// Instanced pastel houses with pointy roofs and trees in a ring around the stadium.
{
  const N = MOBILE ? 90 : 150, dummy = new THREE.Object3D(), col = new THREE.Color();
  const walls = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.08), mat('#ffffff', { roughness: 0.85 }), N);
  const roofGeo = new THREE.ConeGeometry(0.72, 1, 4); roofGeo.rotateY(Math.PI / 4);
  const roofs = new THREE.InstancedMesh(roofGeo, mat('#ffffff', { roughness: 0.75 }), N);
  const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#6b3e26'), N);
  const wins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#fff6d5', { emissive: '#ffe9a8', emissiveIntensity: 0.4 }), N * 2);
  const houseCols = ['#ffd6e0', '#ffe7a0', '#c7f0d8', '#cde7ff', '#e3d5ff', '#ffd2b0', '#fff1c9', '#b9f3ee'];
  const roofCols = ['#e4572e', '#d1495b', '#2e86ab', '#7b2cbf', '#f29e4c', '#3f8a5f'];
  let placed = 0, tries = 0;
  const spots = [];
  while (placed < N && tries++ < 4000) {
    const a = rand(0, Math.PI * 2), r = rand(76, 150);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 64)) continue;
    spots.push({ x, z });
    const w = rand(4, 6.5), h = rand(3.5, 6), d = rand(4, 6), roofH = rand(2.5, 4.2);
    const face = Math.atan2(-x, -z);
    dummy.position.set(x, h / 2, z); dummy.rotation.set(0, face, 0); dummy.scale.set(w, h, d); dummy.updateMatrix();
    walls.setMatrixAt(placed, dummy.matrix); walls.setColorAt(placed, col.set(pick(houseCols)));
    dummy.position.y = h + roofH / 2; dummy.scale.set(w * 1.18, roofH, d * 1.18); dummy.updateMatrix();
    roofs.setMatrixAt(placed, dummy.matrix); roofs.setColorAt(placed, col.set(pick(roofCols)));
    // Door and windows on the side facing the stadium.
    const fwd = new THREE.Vector3(Math.sin(face), 0, Math.cos(face)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    dummy.position.set(x + fwd.x * d / 2, 1.1, z + fwd.z * d / 2); dummy.scale.set(1.1, 2.2, 0.15); dummy.updateMatrix();
    doors.setMatrixAt(placed, dummy.matrix);
    [-1, 1].forEach((s, k) => {
      dummy.position.set(x + fwd.x * d / 2 + side.x * s * w * 0.3, h * 0.62, z + fwd.z * d / 2 + side.z * s * w * 0.3);
      dummy.scale.set(0.9, 0.9, 0.15); dummy.updateMatrix();
      wins.setMatrixAt(placed * 2 + k, dummy.matrix);
    });
    placed++;
  }
  [walls, roofs, doors, wins].forEach(m => { m.count = m === wins ? placed * 2 : placed; m.receiveShadow = true; scene.add(m); });

  const T = MOBILE ? 140 : 240;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 8), mat('#8b5a2b'), T);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), mat('#ffffff', { roughness: 0.9 }), T);
  const greens = ['#5cb85c', '#4caf50', '#7ccf5b', '#3e9b4f', '#9bd36a'];
  let t = 0; tries = 0;
  while (t < T && tries++ < 6000) {
    const a = rand(0, Math.PI * 2), r = rand(70, 175);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 30)) continue;
    // Keep the area behind the main stand (tunnel, locker room, office) clear.
    if (x > 20 && x < 70 && z > -14 && z < 24) continue;
    const s = rand(1.6, 3.2), th = rand(1.5, 3);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, th / 2, z); dummy.scale.set(1, th, 1); dummy.updateMatrix(); trunks.setMatrixAt(t, dummy.matrix);
    dummy.position.set(x, th + s * 0.8, z); dummy.scale.set(s, s * 1.1, s); dummy.updateMatrix(); crowns.setMatrixAt(t, dummy.matrix);
    crowns.setColorAt(t, col.set(pick(greens)));
    t++;
  }
  trunks.count = crowns.count = t;
  crowns.castShadow = true;
  scene.add(trunks, crowns);
}

/* ---------------------------------------------------------------- stadium */
// Stadium model: "Al Wakrah Stadium Worldcup 2022" by Ninh Pham (Sketchfab), used with the author's permission.
// Optimised for the web (seats removed, meshopt-compressed, logo replaced). Its pitch is 17 units long,
// scaled to our 60-unit pitch and turned so the long axis runs along z, benches on the east side.
const STADIUM_SCALE = 3.53;
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
    scene.add(model);
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
  Object.assign(video, { src: st.src, muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
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
function adoptScreen(target, index) {
  const st = STATIONS[index];
  const video = document.createElement('video');
  Object.assign(video, { src: st.src, muted: true, loop: true, playsInline: true, preload: 'auto' });
  video.setAttribute('playsinline', '');
  const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  target.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  target.userData.station = index;
  const box3 = new THREE.Box3().setFromObject(target), size = box3.getSize(new THREE.Vector3());
  screens[index] = { index, video, group: target, hit: [target], width: Math.max(size.x, size.z) };
  video.play().catch(() => {});
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

// 2. The coach on the sideline, holding a tablet toward the pitch.
const coach = new THREE.Group(); coach.position.set(16.2, 0, 6); coach.rotation.y = -Math.PI / 2; scene.add(coach);
{
  const jacket = mat('#f26419', { roughness: 0.6 }), pants = mat('#1b1f3b'), skin = mat('#ffd2a8', { roughness: 0.55 });
  [-0.16, 0.16].forEach(x => {
    mesh(new THREE.CapsuleGeometry(0.13, 0.62, 4, 10), pants, coach, x, 0.45, 0);
    rbox(0.24, 0.14, 0.4, 0.06, mat('#ffffff'), coach, x, 0.07, 0.06);
  });
  mesh(new THREE.CapsuleGeometry(0.34, 0.5, 6, 14), jacket, coach, 0, 1.18, 0);
  rbox(0.5, 0.08, 0.05, 0.02, mat('#ffffff'), coach, 0, 1.3, 0.33, { cast: false });
  const head = mesh(new THREE.SphereGeometry(0.27, 24, 18), skin, coach, 0, 1.84, 0);
  head.scale.set(1, 1.05, 1);
  mesh(new THREE.SphereGeometry(0.06, 12, 8), skin, coach, 0, 1.82, 0.27);
  [-0.09, 0.09].forEach(x => {
    mesh(new THREE.SphereGeometry(0.05, 12, 8), mat('#ffffff', { roughness: 0.2 }), coach, x, 1.9, 0.235, { cast: false });
    mesh(new THREE.SphereGeometry(0.028, 10, 8), mat('#1b1f3b', { roughness: 0.2 }), coach, x, 1.9, 0.275, { cast: false });
  });
  mesh(new THREE.SphereGeometry(0.29, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#00a6ed'), coach, 0, 1.92, 0);
  const brim = rbox(0.42, 0.04, 0.3, 0.02, mat('#00a6ed'), coach, 0, 1.94, 0.26); brim.rotation.x = 0.15;
  mesh(new THREE.SphereGeometry(0.1, 16, 10), mat('#5a3825', { roughness: 0.9 }), coach, 0, 1.74, 0.23).scale.set(1.3, 0.35, 0.6);
  mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 16, Math.PI), mat('#a33b3b'), coach, 0, 1.69, 0.255, { cast: false }).rotation.z = Math.PI;
  // Arms reaching forward to the tablet.
  [-1, 1].forEach(s => {
    const arm = mesh(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), jacket, coach, s * 0.36, 1.22, 0.2);
    arm.rotation.set(-1.25, 0, s * 0.35);
    mesh(new THREE.SphereGeometry(0.08, 12, 8), skin, coach, s * 0.29, 1.2, 0.48);
  });
  // Tablet (3:4 portrait) facing the camera.
  const tablet = new THREE.Group(); tablet.position.set(0, 1.3, 0.5); tablet.rotation.x = -0.12; coach.add(tablet);
  rbox(0.54, 0.7, 0.035, 0.04, mat('#2c2c31', { metalness: 0.6, roughness: 0.35 }), tablet, 0, 0, 0);
  makeScreen(1, 0.49, 0.65, tablet, 0, 0, 0.019);
}

/* -------------------------------------------------- tunnel, locker, office */
// Interiors (tunnel x 25→45, locker room x 45→61, office z 8→18) are built here, then moved 60 units
// below ground, out of sight of the stadium; the camera reaches them through a short fade to black.
const interiorFrom = scene.children.length;
const lights = [];
function lamp(x, y, z, color = '#fff1d6', intensity = 9, distance = 11) {
  const l = new THREE.PointLight(color, intensity, distance, 2); l.position.set(x, y, z); scene.add(l); lights.push(l);
  box(0.9, 0.06, 0.4, new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff4c2', emissiveIntensity: 1.2 }), null, x, y + 0.25, z, { cast: false });
}
function wall(w, h, d, color, x, y, z) { return box(w, h, d, mat(color, { roughness: 0.85 }), null, x, y, z); }

// Tunnel (corridor).
{
  const floor = box(20, 0.1, 5, mat('#2b4c8c', { roughness: 0.9 }), null, 35, 0.05, 0, { cast: false });
  floor.receiveShadow = true;
  [-1, 1].forEach(s => {
    wall(20, 1.3, 0.12, '#1b1f3b', 35, 0.65, s * 2.44);
    wall(20, 0.18, 0.13, '#ffb400', 35, 1.39, s * 2.44);
    wall(20, 2.1, 0.12, '#fff8ec', 35, 2.55, s * 2.44);
    wall(5.8, 3.9, 0.3, '#efe7da', 42.2, 1.95, s * 2.65);        // shell beyond the stand
  });
  wall(20, 0.15, 5, '#e8e2d6', 35, 3.55, 0);
  wall(5.8, 0.3, 5.6, '#efe7da', 42.2, 3.75, 0);
  [28, 34, 40].forEach(x => lamp(x, 3.2, 0));
  // Posters along the wall facing the TV.
  ['#ff5a5f', '#00a6ed', '#7fb800'].forEach((c, i) => {
    rbox(1.2, 1.6, 0.06, 0.05, mat(c), null, 30 + i * 3.4, 2.1, 2.36, { cast: false });
    rbox(0.9, 0.9, 0.07, 0.3, mat('#fff8ec'), null, 30 + i * 3.4, 2.25, 2.33, { cast: false });
  });
  // TV on the left wall.
  const tv = new THREE.Group(); tv.position.set(36, 2.05, -2.32); scene.add(tv);
  rbox(2.5, 1.45, 0.12, 0.06, mat('#1b1f3b', { roughness: 0.4 }), tv, 0, 0, 0);
  makeScreen(2, 2.36, 1.32, tv, 0, 0, 0.065);
}

// Locker room.
{
  box(16, 0.1, 16, new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#bfeee6' : '#fff8ec'; c.fillRect(i * w / 8, j * w / 8, w / 8, w / 8); } }, [4, 4]), roughness: 0.6 }), null, 53, 0.05, 0, { cast: false });
  const H = 4, C = '#fff3e0';
  wall(0.3, H, 6.5, C, 45, H / 2, -4.75); wall(0.3, H, 6.5, C, 45, H / 2, 4.75); wall(0.3, H - 2.8, 3, C, 45, 2.8 + (H - 2.8) / 2, 0);
  wall(0.3, H, 16, C, 61, H / 2, 0);
  wall(16, H, 0.3, C, 53, H / 2, -8);
  wall(8.5, H, 0.3, C, 49.25, H / 2, 8); wall(4.5, H, 0.3, C, 58.75, H / 2, 8); wall(3, H - 2.8, 0.3, C, 55, 2.8 + (H - 2.8) / 2, 8);
  wall(16.4, 0.3, 16.4, '#efe7da', 53, H + 0.15, 0);
  box(3.4, 0.25, 0.4, mat('#ffb400'), null, 45, 2.9, 0, { cast: false });
  box(3.4, 0.25, 0.4, mat('#ff5a5f'), null, 55, 2.9, 8, { cast: false });
  // Lockers with numbered jerseys.
  const jersey = n => canvasTex(128, 128, (c, w) => {
    c.fillStyle = n % 2 ? '#ff5a5f' : '#00a6ed';
    c.beginPath(); c.moveTo(30, 18); c.lineTo(50, 10); c.quadraticCurveTo(64, 26, 78, 10); c.lineTo(98, 18); c.lineTo(120, 44); c.lineTo(100, 56); c.lineTo(96, 50); c.lineTo(96, 120); c.lineTo(32, 120); c.lineTo(32, 50); c.lineTo(28, 56); c.lineTo(8, 44); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.font = '700 48px Fredoka, sans-serif'; c.textAlign = 'center'; c.fillText(String(n), 64, 98);
  });
  [-1, 1].forEach(side => {
    for (let k = 0; k < 9; k++) {
      const x = 47.2 + k * 1.3, z = side * 7.45, n = side > 0 ? k + 1 : k + 10;
      if (side > 0 && x > 52.8 && x < 57.2) continue;   // the office door
      rbox(1.2, 2.5, 0.7, 0.06, mat(k % 2 ? '#00a6ed' : '#ffb400', { roughness: 0.55 }), null, x, 1.35, z);
      const j = mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshStandardMaterial({ map: jersey(n), transparent: true, roughness: 0.8 }), null, x, 1.65, z - side * 0.37, { cast: false });
      j.rotation.y = side > 0 ? Math.PI : 0;
    }
    rbox(10, 0.12, 0.6, 0.05, mat('#c68642', { roughness: 0.6 }), null, 52.5, 0.48, side * 6.3);
    [48.5, 52.5, 56.5].forEach(x => box(0.12, 0.45, 0.5, mat('#1b1f3b'), null, x, 0.22, side * 6.3));
  });
  // Centre logo rug and a ball.
  const rug = mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ roughness: 0.95, map: canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#1b1f3b'; c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffb400'; c.font = '700 150px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('G', w / 2, w / 2 + 10);
  }) }), null, 52, 0.11, 0, { cast: false });
  rug.rotation.x = -Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 }), null, 50, 0.4, -2.6);
  // TV on the far wall.
  const tv = new THREE.Group(); tv.position.set(60.75, 2.45, 0); tv.rotation.y = -Math.PI / 2; scene.add(tv);
  rbox(3.3, 1.95, 0.14, 0.08, mat('#1b1f3b', { roughness: 0.4 }), tv, 0, 0, 0);
  makeScreen(3, 3.14, 1.77, tv, 0, 0, 0.075);
  [48, 53, 58].forEach(x => lamp(x, 3.6, 0));
}

// Coach's office.
{
  box(10, 0.1, 10, new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#c98b52' : '#b97a43'; c.fillRect(0, i * w / 8, w, w / 8); c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(0, i * w / 8, w, 2); } }, [2, 2]), roughness: 0.7 }), null, 55, 0.05, 13, { cast: false });
  const H = 3.4, C = '#c7f0d8';
  wall(0.3, H, 10, C, 50, H / 2, 13); wall(0.3, H, 10, C, 60, H / 2, 13);
  wall(10, H, 0.3, C, 55, H / 2, 18);
  wall(10.4, 0.3, 10.4, '#efe7da', 55, H + 0.15, 13);
  // Window with a sunny view.
  mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshBasicMaterial({ map: canvasTex(256, 140, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4aa3f0'); gr.addColorStop(0.7, '#bfe4ff'); gr.addColorStop(0.71, '#86c95e'); gr.addColorStop(1, '#6db34d');
    c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.beginPath(); c.arc(60, 40, 14, 0, 7); c.arc(78, 36, 18, 0, 7); c.arc(96, 42, 13, 0, 7); c.fill();
  }), toneMapped: false }), null, 51.6, 2.1, 17.72, { cast: false }).rotation.y = Math.PI;
  rbox(2.6, 1.5, 0.12, 0.05, mat('#ffffff'), null, 51.6, 2.1, 17.8, { cast: false });
  // Whiteboard with a tactic.
  const wb = mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshStandardMaterial({ roughness: 0.4, map: canvasTex(256, 150, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7fb800'; c.lineWidth = 3; c.strokeRect(10, 10, w - 20, h - 20);
    c.font = '700 22px Fredoka, sans-serif'; c.fillStyle = '#ff5a5f'; [[60, 50], [60, 100], [110, 75]].forEach(([x, y]) => c.fillText('X', x, y));
    c.fillStyle = '#00a6ed'; [[170, 45], [180, 100]].forEach(([x, y]) => c.fillText('O', x, y));
    c.strokeStyle = '#1b1f3b'; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(80, 70); c.quadraticCurveTo(140, 20, 200, 70); c.stroke();
  }) }), null, 59.83, 2.1, 13, { cast: false });
  wb.rotation.y = -Math.PI / 2;
  // Desk, chair, PC.
  rbox(2.8, 0.1, 1.1, 0.03, mat('#8b5a2b', { roughness: 0.5 }), null, 55, 0.78, 16.9);
  [[-1.3, -0.45], [1.3, -0.45], [-1.3, 0.45], [1.3, 0.45]].forEach(([dx, dz]) => box(0.08, 0.75, 0.08, mat('#1b1f3b'), null, 55 + dx, 0.38, 16.9 + dz));
  // Chair pushed aside so it never hides the screen.
  const chair = new THREE.Group(); chair.position.set(56.9, 0, 15.4); chair.rotation.y = 0.9; scene.add(chair);
  rbox(0.7, 0.12, 0.7, 0.05, mat('#ff5a5f'), chair, 0, 0.5, 0);
  rbox(0.7, 0.8, 0.12, 0.05, mat('#ff5a5f'), chair, 0, 0.95, -0.35);
  box(0.08, 0.45, 0.08, mat('#1b1f3b'), chair, 0, 0.25, 0);
  box(0.08, 0.32, 0.08, mat('#c9ced6', { metalness: 0.6, roughness: 0.3 }), null, 55, 0.98, 17.15);
  rbox(0.45, 0.03, 0.3, 0.01, mat('#c9ced6', { metalness: 0.6, roughness: 0.3 }), null, 55, 0.85, 17.15);
  const pc = new THREE.Group(); pc.position.set(55, 1.42, 17.1); pc.rotation.y = Math.PI; scene.add(pc);
  rbox(1.36, 0.82, 0.07, 0.04, mat('#2c2c31', { metalness: 0.5, roughness: 0.35 }), pc, 0, 0, 0);
  makeScreen(4, 1.28, 0.72, pc, 0, 0, 0.037);
  rbox(0.8, 0.03, 0.25, 0.01, mat('#ffffff'), null, 55, 0.845, 16.55);
  mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.13, 16), mat('#ffb400'), null, 56.1, 0.9, 16.6);
  // Trophy shelf and a plant.
  rbox(2.4, 0.08, 0.4, 0.02, mat('#8b5a2b'), null, 50.3, 2.2, 13);
  const gold = mat('#ffcf3f', { metalness: 1, roughness: 0.25 });
  [12.3, 13, 13.7].forEach((z, i) => {
    const s = [0.8, 1, 0.7][i];
    mesh(new THREE.CylinderGeometry(0.12 * s, 0.05 * s, 0.25 * s, 16), gold, null, 50.35, 2.38 * 1 + 0.06 * s, z);
    mesh(new THREE.CylinderGeometry(0.08 * s, 0.1 * s, 0.06, 16), gold, null, 50.35, 2.27, z);
  });
  mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 16), mat('#e4572e'), null, 58.8, 0.25, 17.2);
  [[0, 0.75, 0], [0.18, 0.95, 0.1], [-0.15, 1.05, -0.05]].forEach(([dx, dy, dz]) => mesh(new THREE.SphereGeometry(0.32, 16, 12), mat('#4caf50'), null, 58.8 + dx, dy, 17.2 + dz));
  lamp(55, 3.05, 12.5, '#fff1d6', 10, 10);
  lamp(55, 3.05, 16.2, '#fff1d6', 6, 6);
}

const UNDER = -60;
{
  const interiors = new THREE.Group(); interiors.position.y = UNDER;
  scene.children.slice(interiorFrom).forEach(o => interiors.add(o));
  scene.add(interiors);
}

/* ------------------------------------------------------------ camera path */
// Keyframes: progress p, camera position, look target, and hold (stations pause the camera).
const KEYS = [
  { p: 0.00, pos: [0, 150, 14], look: [0, 0, 0] },
  { p: 0.09, pos: [-40, 52, 70], look: [0, 6, 0] },
  { p: 0.15, hold: 0.24, station: 0, pos: [-18, 12, 12], look: [-26, 16, 24] },      // set from the scoreboard on load
  { p: 0.29, pos: [8, 3.5, 16], look: [16, 1.4, 6] },
  { p: 0.34, hold: 0.42, station: 1, pos: [13.75, 1.62, 6.25], look: [16.2, 1.5, 6] },
  { p: 0.45, pos: [13.6, 1.8, 3], look: [24, 1.9, 0.5] },
  { p: 0.48, pos: [16.8, 1.9, 1], look: [30, 1.9, 0] },                                  // fade to black toward the stand
  { p: 0.51, pos: [30, UNDER + 1.8, 0.4], look: [38, UNDER + 1.9, -0.8] },
  { p: 0.55, hold: 0.62, station: 2, pos: [36, UNDER + 1.95, -0.1], look: [36, UNDER + 2.05, -2.4] },
  { p: 0.67, pos: [46.2, UNDER + 1.85, 0], look: [60, UNDER + 2.2, 0] },
  { p: 0.71, hold: 0.78, station: 3, pos: [56.9, UNDER + 2.1, 0], look: [60.7, UNDER + 2.45, 0] },
  { p: 0.82, pos: [55, UNDER + 1.8, 6.2], look: [55, UNDER + 1.5, 16] },
  { p: 0.86, hold: 0.92, station: 4, pos: [55, UNDER + 1.42, 15.75], look: [55, UNDER + 1.42, 17.1] },
  { p: 1.00, pos: [55, UNDER + 1.7, 12.2], look: [55, UNDER + 1.5, 17] },
].map(k => ({ ...k, hold: k.hold ?? k.p, pos: new THREE.Vector3(...k.pos), look: new THREE.Vector3(...k.look) }));
let posCurve, lookCurve;
function rebuildCurves() {
  posCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.pos), false, 'centripetal');
  lookCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.look), false, 'centripetal');
}
rebuildCurves();
const U = i => i / (KEYS.length - 1);
// Map scroll progress to a curve parameter: stations hold still, the camera eases in and out of them.
function curveParam(p) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (p <= a.hold) return U(i);
    if (p < b.p) {
      let t = (p - a.hold) / (b.p - a.hold);
      const easeOut = a.station != null || i === 0, easeIn = b.station != null;
      t = easeOut && easeIn ? t * t * (3 - 2 * t) : easeIn ? 1 - (1 - t) * (1 - t) : easeOut ? t * t : t;
      return U(i) + t * (U(i + 1) - U(i));
    }
  }
  return 1;
}
// Furthest a portrait camera may back away from each screen (walls behind it indoors).
const MAX_BACK = [80, 3, 4.4, 9, 3.3];
function currentStation(p) {
  for (const k of KEYS) if (k.station != null && p >= k.p - 0.015 && p <= k.hold + 0.015) return k.station;
  return -1;
}

/* ------------------------------------------------------------------ sound */
const sound = {
  ctx: null, master: null, crowdFilter: null, on: false,
  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // Crowd murmur: band-passed noise with a slow swell.
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter(); this.crowdFilter.type = 'bandpass'; this.crowdFilter.frequency.value = 700; this.crowdFilter.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.12;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.05;
    lfo.connect(lg).connect(g.gain); lfo.start();
    src.connect(this.crowdFilter).connect(g).connect(this.master); src.start();
  },
  toggle() {
    this.init(); this.ctx.resume(); this.on = !this.on;
    this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.3);
    return this.on;
  },
  whoosh() {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.7);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + 0.9);
  },
  pop() {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.08);
    g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
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
  el.innerHTML = `<div class="card"><div class="place">${String(i + 1).padStart(2, '0')} — ${st.place}</div><h2>${st.title}</h2><div class="sub">${st.sub}</div><button type="button" class="play" data-open="${i}"><i>▶</i>PLAY FILM</button><span class="hint">or click the screen</span></div>`;
  contactEl.before(el);
});
const chapterEls = [...document.querySelectorAll('.chapter')];
const stageNum = $('#stage-num'), bar = $('#progress-bar');
stageNum.textContent = `00 / ${TOTAL}`;

/* --------------------------------------------------------------- lightbox */
const lightbox = $('#lightbox'), lbVideo = $('#lightbox-video'), lbTitle = $('#lightbox-title');
function openFilm(i) {
  const st = STATIONS[i];
  lbVideo.src = st.src; lbTitle.textContent = `${st.title} — ${st.sub}`;
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
  const hit = ray.intersectObjects(hitTargets(), false)[0];
  return hit && hit.distance < 60 ? hit.object.userData.station : null;
}
let downAt = null;
canvas.addEventListener('pointerdown', e => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
  const s = screenAt(e.clientX, e.clientY);
  if (s != null) openFilm(s);
});

/* ------------------------------------------------------------- navigation */
let state = 'loading', progress = 0, target = 0;
const mouse = new THREE.Vector2(), mouseSmooth = new THREE.Vector2();
const blocked = () => state !== 'ready' || !lightbox.hidden;
function addScroll(d) { if (!blocked()) target = clamp(target + d, 0, 1); }
addEventListener('wheel', e => {
  const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? innerHeight : 1;
  addScroll(e.deltaY * k * 0.00005);
}, { passive: true });
let touchY = null;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', e => {
  if (touchY == null) return;
  const y = e.touches[0].clientY; addScroll((touchY - y) * 0.0003); touchY = y;
}, { passive: true });
addEventListener('touchend', () => (touchY = null));
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const step = { ArrowDown: 0.015, PageDown: 0.04, ArrowUp: -0.015, PageUp: -0.04, Space: e.shiftKey ? -0.03 : 0.03 }[e.code];
  if (step) { addScroll(step); e.preventDefault(); }
  if (e.code === 'Home') addScroll(-1);
  if (e.code === 'End') addScroll(1);
});
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', e => {
  e.preventDefault();
  if (!blocked()) { target = parseFloat(el.dataset.goto); sound.whoosh(); }
}));
addEventListener('pointermove', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (state === 'ready' && e.pointerType === 'mouse') canvas.classList.toggle('hot', screenAt(e.clientX, e.clientY) != null);
});
$('#contact-form').addEventListener('submit', e => { e.preventDefault(); e.target.querySelector('button').textContent = 'THANK YOU ✓'; });

/* ----------------------------------------------------------------- loader */
const counterEl = $('#counter');
const loadStart = performance.now();
let loaded = 0;
const toLoad = [document.fonts ? document.fonts.ready : Promise.resolve(), stadiumReady, ...screens.filter(Boolean).map(s => new Promise(res => {
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
    // Canvas textures used font text: redraw now that Fredoka is ready.
    scene.traverse(o => { const m = o.material; if (m && m.map && m.map.isCanvasTexture) m.map.needsUpdate = true; });
    counterEl.classList.add('done');
    state = 'ready'; body.classList.add('ready');
  }
}

// Black fade used when the camera goes from the pitch into the tunnel.
const fadeEl = Object.assign(document.createElement('div'), { ariaHidden: 'true' });
Object.assign(fadeEl.style, { position: 'fixed', inset: '0', background: '#05060c', opacity: '0', pointerEvents: 'none', zIndex: '1' });
canvas.after(fadeEl);

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

/* ------------------------------------------------------------------- loop */
const clock = new THREE.Clock(), lookAt = new THREE.Vector3();
let lastStation = -1;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (state === 'loading') updateLoader();

  progress += (target - progress) * (1 - Math.exp(-dt * 2.2));
  const u = curveParam(progress);
  camera.position.copy(posCurve.getPoint(u));
  lookAt.copy(lookCurve.getPoint(u));
  camera.lookAt(lookAt);
  // Portrait screens are narrow: back the camera away from each screen until it fits the width.
  if (camera.aspect < 0.8) {
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect / 1.3;
    KEYS.forEach(k => {
      if (k.station == null) return;
      const weight = 1 - smooth(0, 0.05, Math.max(k.p - progress, progress - k.hold, 0));
      if (!weight) return;
      const sc = screens[k.station], at = sc.group.getWorldPosition(new THREE.Vector3());
      const need = Math.min(sc.width / 0.92 / (2 * halfTan), MAX_BACK[k.station]);
      const away = camera.position.clone().sub(at), d = away.length();
      if (need > d) camera.position.addScaledVector(away.normalize(), (need - d) * weight);
    });
  }
  // Gentle hand-held drift with the pointer.
  mouseSmooth.lerp(mouse, 1 - Math.exp(-dt * 2.5));
  camera.rotateY(-mouseSmooth.x * 0.04);
  camera.rotateX(mouseSmooth.y * 0.025);

  // Living scene: clouds drift, flags wave, the coach breathes.
  clouds.forEach((c, i) => { c.position.x += dt * (0.6 + (i % 3) * 0.3); if (c.position.x > 260) c.position.x = -260; });
  scene.children.forEach(o => { if (o.userData.wave != null) o.rotation.y = Math.sin(t * 3 + o.userData.wave) * 0.4; });
  coach.position.y = Math.sin(t * 2) * 0.012;

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
  fadeEl.style.opacity = smooth(0.455, 0.478, progress) * (1 - smooth(0.505, 0.53, progress));
  body.classList.toggle('end', progress > 0.95);
  bar.style.transform = `scaleX(${progress})`;
  // Muffle the crowd indoors.
  if (sound.crowdFilter) sound.crowdFilter.frequency.setTargetAtTime(camera.position.y < UNDER / 2 ? 260 : 700, sound.ctx.currentTime, 0.4);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) window.__goual = { goto: v => (target = v), progress: () => progress, state: () => state, open: openFilm };
