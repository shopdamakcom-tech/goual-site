// PADEL CLASH — CR7 vs Messi. A singles padel match on an indoor glass court under floodlights.
// You move (or let your player run to the ball), aim with the mouse / stick and hit on time.
// The ball bounces off the glass and the mesh like in real padel; first to 3 games, golden point.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Character, dress } from '../street/rig.js?v=3';

const $ = s => document.querySelector(s);
const V3 = THREE.Vector3, clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const params = new URLSearchParams(location.search);
const EMBED = params.has('embed') || window.parent !== window;
const TOUCH = matchMedia('(pointer: coarse)').matches || params.has('touch');
const TEST = params.has('test');
const rnd = (a, b) => a + Math.random() * (b - a);

// ================= renderer, scene =================
const renderer = new THREE.WebGLRenderer({ canvas: $('#game'), antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(TEST ? 0.4 : Math.min(devicePixelRatio, TOUCH ? 1.4 : 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !TEST; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05070f'); scene.fog = new THREE.Fog('#05070f', 30, 70);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
function fitCamera() { camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 72 : camera.aspect < 1.2 ? 60 : 50; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', fitCamera); fitCamera();

// ================= the club =================
const CW = 5, CL = 10, NET = 0.88, GLASS_H = 3, MESH_H = 4;
const tex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; };
const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } };
// Court: blue turf with sand, white lines.
const courtTex = tex(1000, 2000, (g, w, h) => {
  g.fillStyle = '#2462c4'; g.fillRect(0, 0, w, h); noise(g, w, h, 60000, 0.12);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(10,30,80,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
  g.strokeStyle = '#f4f6ff'; g.lineWidth = 5;
  const z = v => (v + CL) / (2 * CL) * h, x = v => (v + CW) / (2 * CW) * w;
  for (const s of [-6.95, 6.95]) { g.beginPath(); g.moveTo(0, z(s)); g.lineTo(w, z(s)); g.stroke(); }
  g.beginPath(); g.moveTo(x(0), z(-6.95)); g.lineTo(x(0), z(6.95)); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.font = '900 64px Impact, Arial Black'; g.textAlign = 'center';
  g.save(); g.translate(w / 2, z(8.4)); g.fillText('GOUAL ART', 0, 0); g.restore();
  g.save(); g.translate(w / 2, z(-8.4)); g.rotate(Math.PI); g.fillText('GOUAL ART', 0, 0); g.restore();
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * CW, 2 * CL), new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.92 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(60, 70), new THREE.MeshStandardMaterial({ color: '#141a2e', roughness: 0.55, metalness: 0.2 }));
hallFloor.rotation.x = -Math.PI / 2; hallFloor.position.y = -0.01; hallFloor.receiveShadow = true; scene.add(hallFloor);
// Glass walls, steel posts, mesh.
const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0.1, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide });
const steel = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.35, metalness: 0.7 });
const meshTex = tex(64, 64, (g, w, h) => { g.strokeStyle = 'rgba(30,30,34,0.95)'; g.lineWidth = 2.2; g.strokeRect(1, 1, w - 2, h - 2); }, [1, 1]);
const meshMat = new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
function panel(w, h, mat, x, y, z, ry, rep) { const g = new THREE.PlaneGeometry(w, h); if (rep) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.05, uv.getY(i) * h / 0.05); } const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; }
for (const s of [-1, 1]) {
  panel(2 * CW, GLASS_H, glassMat, 0, GLASS_H / 2, s * CL, 0);
  panel(2 * CW, MESH_H - GLASS_H, meshMat, 0, (GLASS_H + MESH_H) / 2, s * CL, 0, true);
  for (const sx of [-1, 1]) {
    panel(2, GLASS_H, glassMat, sx * CW, GLASS_H / 2, s * (CL - 1), Math.PI / 2);
    panel(2 * CL - 4, GLASS_H, meshMat, sx * CW, GLASS_H / 2, 0, Math.PI / 2, true);
  }
}
const postAt = (x, z, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), steel); m.position.set(x, h / 2, z); m.castShadow = true; scene.add(m); };
for (const s of [-1, 1]) { for (const x of [-CW, CW]) postAt(x, s * CL, MESH_H); for (let z = 0; z <= CL + 0.01; z += 2) for (const sx of [-1, 1]) postAt(sx * CW, s * z, GLASS_H); }
for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 * CW + 0.08, 0.06, 0.08), steel); b.position.set(0, MESH_H, s * CL); scene.add(b); for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 2 * CL), steel); r.position.set(sx * CW, GLASS_H, 0); scene.add(r); } }
// Logos on the bottom of the back glass, like pro courts.
const bandTex = tex(1024, 128, (g, w, h) => { g.fillStyle = 'rgba(11,18,48,.85)'; g.fillRect(0, 0, w, h); g.fillStyle = '#d7ff3a'; g.font = '900 72px Impact, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GOUAL ART · PADEL CLASH', w / 2, h / 2 + 4); });
for (const s of [-1, 1]) { const m = panel(2 * CW - 0.1, 0.42, new THREE.MeshBasicMaterial({ map: bandTex, transparent: true, toneMapped: false }), 0, 0.32, s * (CL - 0.01), s > 0 ? Math.PI : 0); m.renderOrder = 2; }
// Net.
const netTex = tex(128, 128, (g, w, h) => { g.strokeStyle = 'rgba(20,20,24,.95)'; g.lineWidth = 3; for (let i = 0; i <= w; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, [1, 1]);
{ const n = panel(2 * CW, NET, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), 0, NET / 2, 0, 0); n.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? NET / 0.06 : 2 * CW / 0.06); });
  const tape = new THREE.Mesh(new THREE.BoxGeometry(2 * CW, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: '#ffffff' })); tape.position.set(0, NET, 0); scene.add(tape);
  for (const sx of [-1, 1]) postAt(sx * (CW + 0.04), 0, 0.95); }
// Floodlights: bars above the court, and lights.
const lightBar = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4f8ff', emissiveIntensity: 3 });
for (const sx of [-1, 1]) for (const z of [-6, 0, 6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 2.2), lightBar); b.position.set(sx * (CW + 0.6), 7.6, z); scene.add(b); }
scene.add(new THREE.HemisphereLight('#c8d8ff', '#1a1d2a', 0.55));
const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(4, 14, 6); key.castShadow = true; key.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 12, bottom: -12, near: 2, far: 30 }); key.shadow.bias = -0.0005; scene.add(key);
const fill = new THREE.DirectionalLight('#9fb8ff', 0.7); fill.position.set(-5, 10, -8); scene.add(fill);
for (const [x, z] of [[-CW - 0.6, -6], [CW + 0.6, 6], [-CW - 0.6, 6], [CW + 0.6, -6], [0, 0]]) { const p = new THREE.PointLight('#eef3ff', 9, 11, 1.8); p.position.set(x, 7.3, z); scene.add(p); }
// The hall: dark walls, stands with a crowd of silhouettes, a big LED scoreboard.
const wallMat = new THREE.MeshStandardMaterial({ color: '#0d1122', roughness: 0.9 });
for (const [w, h, x, z, ry] of [[40, 14, 0, -24, 0], [40, 14, 0, 24, Math.PI], [48, 14, -16, 0, Math.PI / 2], [48, 14, 16, 0, -Math.PI / 2]]) panel(w, h, wallMat, x, h / 2, z, ry);
{
  const seatMat = new THREE.MeshStandardMaterial({ color: '#1d2440', roughness: 0.8 });
  const fanGeo = new THREE.CapsuleGeometry(0.2, 0.45, 3, 6), headGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const fans = [], cols = ['#5a2a2a', '#555a66', '#2a3550', '#5c5228', '#24402e', '#5a3048', '#3d5266', '#1c1d22'];
  for (const sx of [-1, 1]) for (let r = 0; r < 5; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5 + r * 0.5, 22), seatMat); step.position.set(sx * (CW + 2.2 + r * 1.1), (0.5 + r * 0.5) / 2, 0); step.receiveShadow = true; scene.add(step);
    for (let z = -10; z <= 10; z += 0.75) if (Math.random() < 0.8) fans.push([sx * (CW + 2.2 + r * 1.1) + rnd(-0.15, 0.15), 0.5 + r * 0.5, z + rnd(-0.15, 0.15), cols[Math.floor(Math.random() * cols.length)]]);
  }
  const body = new THREE.InstancedMesh(fanGeo, new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.95 }), fans.length), heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.9 }), fans.length);
  const m = new THREE.Matrix4();
  fans.forEach(([x, y, z, c], i) => { body.setMatrixAt(i, m.makeTranslation(x, y + 0.42, z)); body.setColorAt(i, new THREE.Color(c)); heads.setMatrixAt(i, m.makeTranslation(x, y + 0.92, z)); });
  scene.add(body, heads); window.__fans = { body, heads, fans };
}
const scoreCanvas = document.createElement('canvas'); scoreCanvas.width = 1024; scoreCanvas.height = 320;
const scoreTex = new THREE.CanvasTexture(scoreCanvas); scoreTex.colorSpace = THREE.SRGBColorSpace;
{ const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshBasicMaterial({ map: scoreTex, toneMapped: false })); s.position.set(0, 6.4, -15); scene.add(s);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(9.3, 3.1, 0.2), steel); fr.position.set(0, 6.4, -15.12); scene.add(fr); }

// ================= ball =================
const G = 9.81, R = 0.034, DRAG = 0.1;
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 14), new THREE.MeshStandardMaterial({ color: '#e4ff4a', emissive: '#a8d000', emissiveIntensity: 0.9, roughness: 0.6 }));
ballMesh.castShadow = true; scene.add(ballMesh);
const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
shadowBlob.rotation.x = -Math.PI / 2; scene.add(shadowBlob);
const trailN = 14, trailPts = Array.from({ length: trailN }, () => new V3());
const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#e8ff7a', transparent: true, opacity: 0.45 })); scene.add(trail);
const ball = { p: new V3(0, 1, 8), v: new V3(), live: false, exited: false };
const netH = x => NET + 0.04 * Math.abs(x) / CW;
// One physics step. `ev(type, data)` is told about floor/glass/mesh/net/cross/exit contacts.
function stepBall(b, dt, ev) {
  const pz = b.p.z;
  b.v.y -= G * dt; b.v.multiplyScalar(1 - DRAG * dt);
  b.p.addScaledVector(b.v, dt);
  const inside = Math.abs(b.p.x) < CW + 0.05 && Math.abs(b.p.z) < CL + 0.05;
  if (Math.sign(pz) !== Math.sign(b.p.z) && Math.abs(b.p.x) < CW && inside) {
    if (b.p.y < netH(b.p.x)) { b.p.z = Math.sign(pz) * 0.04; b.v.z *= -0.12; b.v.x *= 0.3; b.v.y *= 0.3; ev && ev('net'); }
    else ev && ev('cross', b.p.z < 0 ? 1 : 0);
  }
  if (b.p.y < R) {
    b.p.y = R;
    if (b.v.y < 0) { const sp = -b.v.y; b.v.y = sp > 0.6 ? sp * 0.7 : 0; b.v.x *= 0.86; b.v.z *= 0.86; if (sp > 0.6) ev && ev(inside ? 'floor' : 'outfloor', sp); }
    if (b.v.y === 0) { const f = Math.exp(-dt * 2.5); b.v.x *= f; b.v.z *= f; }
  }
  if (inside || b.p.y < MESH_H) {
    if (Math.abs(b.p.z) > CL - R && b.p.y < MESH_H && Math.abs(b.p.x) < CW) {
      const s = Math.sign(b.p.z), glass = b.p.y < GLASS_H;
      b.p.z = s * (CL - R);
      if (b.v.z * s > 0) { const sp = Math.abs(b.v.z); b.v.z = -b.v.z * (glass ? 0.6 : 0.25); b.v.x *= 0.88; b.v.y *= glass ? 0.85 : 0.5; ev && ev(glass ? 'glass' : 'mesh', sp); }
    }
    if (Math.abs(b.p.x) > CW - R && b.p.y < GLASS_H && Math.abs(b.p.z) < CL) {
      const s = Math.sign(b.p.x), glass = Math.abs(b.p.z) > CL - 2;
      b.p.x = s * (CW - R);
      if (b.v.x * s > 0) { const sp = Math.abs(b.v.x); b.v.x = -b.v.x * (glass ? 0.72 : 0.3); b.v.z *= 0.92; ev && ev(glass ? 'glass' : 'mesh', sp); }
    }
  }
  if (!b.exited && (Math.abs(b.p.z) > CL + 0.15 || Math.abs(b.p.x) > CW + 0.15)) { b.exited = true; ev && ev('exit', Math.abs(b.p.z) > CL + 0.15 ? 'back' : 'side'); }
}
// Where will the ball be playable on `side` (0 = near/+z, 1 = far/-z)? Simulates ahead.
function predict(side, { volley = false } = {}) {
  const b = { p: ball.p.clone(), v: ball.v.clone(), exited: ball.exited };
  let bounced = rally.side === side ? rally.bounces : 0, t = 0, onSide = () => (b.p.z > 0 ? 0 : 1) === side;
  let crossedEv = false;
  const ev = (type) => { if (type === 'floor' && onSide()) bounced++; if (type === 'cross') crossedEv = true; };
  let best = null;
  for (let i = 0; i < 260; i++) {
    stepBall(b, 1 / 90, ev); t += 1 / 90;
    if (b.exited || bounced >= 2) break;
    if (!onSide()) continue;
    const ok = bounced >= 1 ? (b.p.y > 0.45 && b.p.y < 1.45 && (b.v.y < 0.5)) : volley && !rally.serve && b.p.y > 1.95 && b.p.y < 2.9 && b.v.y < 0 && Math.abs(b.p.z) < 7.5;
    if (ok) { best = { p: b.p.clone(), t, high: b.p.y > 1.9 }; break; }
  }
  return best;
}

// ================= players =================
const manager = new THREE.LoadingManager(); manager.onProgress = (u, a, b) => { $('#loading .bar i').style.width = (a / b * 100) + '%'; };
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));
const [cr7Src, messiSrc] = await Promise.all([load('../street/models/cr7.glb'), load('../street/models/kid.glb')]);
const palaTex = tex(256, 320, (g, w, h) => {
  g.fillStyle = '#121418'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); }
  g.fillStyle = '#000'; for (let y = 40; y < h - 40; y += 22) for (let x = 30 + (y % 44 ? 11 : 0); x < w - 30; x += 22) { const dx = (x - w / 2) / (w * 0.45), dy = (y - h * 0.48) / (h * 0.45); if (dx * dx + dy * dy < 0.8) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); } }
  g.fillStyle = '#d7ff3a'; g.font = '900 36px Impact, Arial Black'; g.textAlign = 'center'; g.fillText('GOUAL', w / 2, h * 0.88);
});
function makePala(color) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 28), [new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }), new THREE.MeshStandardMaterial({ map: palaTex, roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: palaTex, roughness: 0.5 })]);
  head.rotation.x = Math.PI / 2; head.scale.set(1, 1, 1.18); head.position.y = 0.2; head.castShadow = true; g.add(head);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.17, 10), new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.8 })); handle.position.y = 0.0; g.add(handle);
  scene.add(g); return g;
}
function makePlayer(id, name, ch, color) {
  scene.add(ch.root);
  return { id, name, ch, pala: makePala(color), pos: new V3(), vel: new V3(), side: 0, swing: null, target: new V3(), stats: { winners: 0, por: 0 } };
}
const cr7 = new Character(cr7Src, { kind: 'valve', height: 1.87 });
const messi = new Character(messiSrc, { kind: 'mixamo', height: 1.70 }); dress(messi, { top: '#f6a7c8', bottom: '#151515', shoes: '#f2f2f2' });
const P = { cr7: makePlayer('cr7', 'CR7', cr7, '#ffd400'), messi: makePlayer('messi', 'MESSI', messi, '#f6a7c8') };
let me, ai;   // set when the visitor picks a player
const _a = new V3(), _b = new V3(), _m = new THREE.Matrix4(), _x = new V3(), _y = new V3(), _z = new V3();
// The racket follows the hand: handle along the forearm, face square to the swing.
function placePala(pl) {
  const ch = pl.ch; ch.bones.rHand.getWorldPosition(_a); ch.bones.rFore.getWorldPosition(_b);
  _y.subVectors(_a, _b).normalize();
  _x.set(Math.cos(ch.root.rotation.y), 0, -Math.sin(ch.root.rotation.y));   // character's left-right axis
  _z.crossVectors(_x, _y).normalize(); _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z); pl.pala.quaternion.setFromRotationMatrix(_m);
  pl.pala.position.copy(_a).addScaledVector(_y, 0.06);
}
function palaCenter(pl, out) { return out.copy(pl.pala.position).addScaledVector(_y.set(0, 1, 0).applyQuaternion(pl.pala.quaternion), 0.2); }

// ================= audio =================
const audio = {
  ctx: null, on: true, bufs: {}, manifest: null,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.9 : 0; this.master.connect(c.destination);
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.nb = n;
    this.hall = c.createConvolver(); const L = c.sampleRate * 1.8, ir = c.createBuffer(2, L, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < L; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 2.6); } this.hall.buffer = ir;
    this.wet = c.createGain(); this.wet.gain.value = 0.35; this.hall.connect(this.wet).connect(this.master);
    // Crowd murmur.
    const s = c.createBufferSource(); s.buffer = n; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
    this.crowd = c.createGain(); this.crowd.gain.value = 0.05; s.connect(f).connect(this.crowd).connect(this.master); this.crowd.connect(this.hall); s.start();
    fetch('voice/lines.json').then(r => r.json()).then(m => { this.manifest = m; for (const v of Object.values(m)) for (const k of [].concat(v)) this.buf(k); }).catch(() => {});
  },
  buf(n) { return this.bufs[n] ??= fetch('voice/' + n).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no))).catch(() => null); },
  say(key, level = 1) {
    if (!this.on || !this.ctx || !this.manifest?.[key]) return;
    const l = [].concat(this.manifest[key]), n = l[Math.floor(Math.random() * l.length)];
    this.buf(n).then(b => { if (!b) return; const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = level; s.connect(g); g.connect(this.master); g.connect(this.hall); s.start(); });
  },
  noise(t, { type = 'bandpass', f = 1000, q = 1, level = 0.3, a = 0.002, d = 0.1, to = 0, wet = true }) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.nb; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (to) fl.frequency.exponentialRampToValueAtTime(to, t + a + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    s.connect(fl).connect(g).connect(this.master); if (wet) g.connect(this.hall); s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  },
  tone(t, { f = 440, to = 0, type = 'sine', level = 0.2, a = 0.003, d = 0.15 }) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(g).connect(this.master); g.connect(this.hall); o.start(t); o.stop(t + a + d + 0.05);
  },
  hit(power) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone(t, { f: 1150 + power * 300, to: 700, type: 'triangle', level: 0.18 + power * 0.2, d: 0.06 }); this.noise(t, { f: 2600, q: 1.5, level: 0.2 + power * 0.2, d: 0.03 }); },
  glass(sp) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime, l = Math.min(0.4, sp * 0.03); this.tone(t, { f: 170, to: 120, level: l, d: 0.18 }); this.noise(t, { f: 3800, q: 2, level: l * 0.6, d: 0.05 }); this.tone(t, { f: 2300, level: l * 0.15, d: 0.25 }); },
  mesh(sp) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; for (let i = 0; i < 4; i++) this.noise(t + i * 0.025, { type: 'highpass', f: 2500, level: Math.min(0.2, sp * 0.02), d: 0.06 }); },
  floor(sp) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone(t, { f: 220, to: 120, level: Math.min(0.22, sp * 0.03), d: 0.06 }); this.noise(t, { type: 'lowpass', f: 1600, level: Math.min(0.12, sp * 0.015), d: 0.03 }); },
  net() { if (!this.ctx || !this.on) return; this.noise(this.ctx.currentTime, { f: 900, q: 0.8, level: 0.2, a: 0.01, d: 0.25, to: 300 }); },
  cheer(k = 1) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.noise(t, { f: 1100, q: 0.5, level: 0.25 * k, a: 0.1, d: 2.2 }); for (let i = 0; i < 40 * k; i++) this.noise(t + Math.random() * 1.6, { type: 'highpass', f: 1800 + Math.random() * 2000, level: 0.05, d: 0.02 }); },  // applause
  ooh() { if (!this.ctx || !this.on) return; this.noise(this.ctx.currentTime, { f: 480, q: 3, level: 0.18, a: 0.2, d: 1.0, to: 320 }); },
  setOn(on) { this.on = on; if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2); },
};

// ================= input =================
const keys = {}; const IN = { hit: false, lob: false, aimX: 0, mouseX: 0, mouseMoved: 0 };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') { IN.hit = true; e.preventDefault(); }
  if (e.code === 'KeyL' || e.code === 'ShiftLeft' || e.code === 'KeyK') IN.lob = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const cv = renderer.domElement;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => { if (TOUCH || state.paused) return; if (e.button === 2) IN.lob = true; else IN.hit = true; });
addEventListener('mousemove', e => { IN.mouseX = e.clientX / innerWidth * 2 - 1; IN.mouseMoved = performance.now(); });
const stick = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
if (TOUCH) {
  const base = $('#stick .base'), nub = $('#stick .nub');
  $('#stick').addEventListener('pointerdown', e => { stick.id = e.pointerId; stick.x = e.clientX; stick.y = e.clientY; base.style.left = e.clientX + 'px'; base.style.top = (e.clientY - $('#stick').getBoundingClientRect().top) + 'px'; });
  addEventListener('pointermove', e => { if (e.pointerId !== stick.id) return; stick.dx = clamp((e.clientX - stick.x) / 48, -1, 1); stick.dy = clamp((e.clientY - stick.y) / 48, -1, 1); nub.style.left = (58 + stick.dx * 34) + 'px'; nub.style.top = (58 + stick.dy * 34) + 'px'; });
  const end = e => { if (e.pointerId === stick.id) { stick.id = null; stick.dx = stick.dy = 0; nub.style.left = nub.style.top = '58px'; } };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  $('#bHit').addEventListener('pointerdown', e => { e.preventDefault(); IN.hit = true; });
  $('#bLob').addEventListener('pointerdown', e => { e.preventDefault(); IN.lob = true; });
  cv.addEventListener('pointerdown', () => { IN.hit = true; });
}
function moveInput() {
  let x = 0, y = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1; if (keys.KeyW || keys.ArrowUp) y -= 1; if (keys.KeyS || keys.ArrowDown) y += 1;
  if (stick.id !== null) { x = stick.dx; y = stick.dy; }
  return { x, y, m: Math.min(1, Math.hypot(x, y)) };
}

// ================= match rules =================
const state = { phase: 'title', server: 0, games: [0, 0], points: [0, 0], paused: false, t: 0, rallyLen: 0, longest: 0, pointWinner: -1, msg: '' };
const rally = { lastHit: -1, side: 0, bounces: 0, crossed: false, serve: false, hits: 0 };
const players = () => [me, ai];   // index 0 = near side (+z) = the visitor
const sideOf = z => (z > 0 ? 0 : 1);
function toast(t, color) { const el = $('#toast'); el.textContent = t; el.style.color = color || ''; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
let hintT = 0; function hint(t, s = 4) { $('#hint').textContent = t; $('#hint').style.opacity = t ? 1 : 0; hintT = s; }
function onBall(type, data) {
  if (!ball.live) return;
  const s = sideOf(ball.p.z), h = rally.lastHit, other = 1 - h;
  if (type === 'glass') audio.glass(data); else if (type === 'mesh') audio.mesh(data); else if (type === 'floor' || type === 'outfloor') audio.floor(data); else if (type === 'net') audio.net();
  if (type === 'cross') { if (data !== h) { rally.crossed = true; rally.side = data; rally.bounces = 0; } else if (rally.bounces >= 1) { /* came back after bouncing: hitter wins when it lands */ } return; }
  if (type === 'net') { audio.say('net'); return; }
  if (type === 'floor') {
    if (s === h) return endPoint(rally.crossed ? h : other, rally.crossed ? 'WINNER' : 'FAULT');
    if (rally.serve && rally.bounces === 0 && Math.abs(ball.p.z) > 6.95) { audio.say('fault'); return endPoint(h === 0 ? 1 : 0, 'FAULT'); }
    rally.bounces++;
    if (rally.bounces >= 2) { audio.say('double'); return endPoint(h, 'WINNER'); }
    return;
  }
  if (type === 'glass' || type === 'mesh') {
    if (s !== h && rally.crossed && rally.bounces === 0) { audio.say(type === 'glass' ? 'wall' : 'out'); return endPoint(other, 'OUT'); }
    return;
  }
  if (type === 'exit') {
    if (rally.crossed && rally.bounces >= 1 && s !== h || rally.crossed && rally.bounces >= 1) { const por = data === 'back'; if (por) { audio.say('portres'); players()[h].stats.por++; } return endPoint(h, por ? 'POR TRES!' : 'WINNER'); }
    audio.say('out'); return endPoint(other, 'OUT');
  }
}
const CALL = ['0', '15', '30', '40'];
function endPoint(winner, why) {
  if (!ball.live) return;
  ball.live = false; state.phase = 'point'; state.t = 0; state.pointWinner = winner; state.why = why + ' ' + JSON.stringify({ h: rally.lastHit, side: sideOf(ball.p.z), b: rally.bounces, c: rally.crossed, hits: rally.hits, p: ball.p.toArray().map(v => +v.toFixed(1)) });
  state.longest = Math.max(state.longest, rally.hits);
  const w = players()[winner];
  if (why === 'WINNER' || why === 'POR TRES!') w.stats.winners++;
  toast(why === 'POR TRES!' ? 'POR TRES!' : winner === 0 ? (why === 'WINNER' ? 'WINNER!' : 'POINT!') : (why === 'OUT' ? 'OUT' : why === 'FAULT' ? 'FAULT' : 'POINT ' + w.name), winner === 0 ? '' : '#ff4f9a');
  if (winner === 0) { audio.cheer(why === 'POR TRES!' ? 1.4 : 0.8); } else audio.ooh();
  if (Math.random() < 0.5 || why === 'POR TRES!') setTimeout(() => audio.say('react-' + w.id, 0.9), 500);
  const p = state.points, g = state.games;
  p[winner]++;
  let gameWon = p[winner] >= 4 && (p[winner] - p[1 - winner] >= 1);   // golden point: 40-40 next point wins
  if (gameWon) {
    g[winner]++; p[0] = p[1] = 0;
    if (g[winner] >= 3) { state.phase = 'matchpoint'; setTimeout(() => audio.say('match-' + w.id), 900); setTimeout(endMatch, 3200); updateBoard(); return; }
    setTimeout(() => audio.say('game-' + w.id), 900);
    state.server = 1 - state.server;
  } else setTimeout(() => { const s = state.server; audio.say(`score-${Math.min(3, p[s])}${Math.min(3, p[1 - s])}`); }, 900);
  updateBoard();
}
function updateBoard() {
  const p = state.points, g = state.games;
  const pt = i => (p[0] >= 3 && p[1] >= 3) ? 'GP' : CALL[Math.min(3, p[i])];
  [0, 1].forEach(i => { const pl = players()[i]; $('#n' + i).textContent = pl.name; $('#g' + i).textContent = g[i]; $('#p' + i).textContent = pt(i); $('#srv' + i).classList.toggle('on', state.server === i); });
  // LED board in the hall.
  const c = scoreCanvas.getContext('2d'), W = 1024, H = 320;
  c.fillStyle = '#04060c'; c.fillRect(0, 0, W, H);
  c.font = '900 64px Impact, Arial Black'; c.textBaseline = 'middle';
  [0, 1].forEach(i => { const y = 95 + i * 130, pl = players()[i];
    c.fillStyle = state.server === i ? '#d7ff3a' : '#334'; c.beginPath(); c.arc(50, y, 14, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(pl.name, 90, y);
    c.fillStyle = '#ffd400'; c.textAlign = 'center'; c.fillText(g[i], 700, y);
    c.fillStyle = '#d7ff3a'; c.fillText(pt(i), 880, y); });
  c.fillStyle = 'rgba(255,255,255,.35)'; c.font = '700 26px Arial'; c.textAlign = 'center'; c.fillText('GAMES', 700, 22); c.fillText('POINTS', 880, 22);
  scoreTex.needsUpdate = true;
}
function endMatch() {
  state.phase = 'end';
  const w = state.games[0] > state.games[1] ? me : ai;
  $('#endTitle').innerHTML = `${w.name} WINS<span>${state.games[0]} – ${state.games[1]}</span>`;
  $('#eWin').textContent = me.stats.winners; $('#ePor').textContent = me.stats.por; $('#eRally').textContent = state.longest;
  $('#end').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
  post('complete', { won: w === me });
}
// Serve: server stands behind the service line, hits underhand into the box diagonally.
function setupServe() {
  state.phase = 'serve'; state.t = 0; rally.hits = 0;
  const s = state.server, sv = players()[s], rc = players()[1 - s];
  const dir = s === 0 ? 1 : -1;
  const odd = (state.points[0] + state.points[1]) % 2;
  const sx = (odd ? -1 : 1) * 0.9 * dir;
  sv.pos.set(sx, 0, dir * 8.6); rc.pos.set(-sx * 1.4, 0, -dir * 8.4);
  me.target.copy(me.pos); ai.target.copy(ai.pos);
  ball.live = false; ball.exited = false; ball.p.set(sx + (s === 0 ? 0.35 : -0.35), 1.0, dir * 8.3); ball.v.set(0, 0, 0);
  rally.lastHit = -1; rally.side = s; rally.bounces = 0; rally.crossed = false; rally.serve = true;
  if (s === 0) hint(TOUCH ? 'Your serve: aim with the stick, tap HIT' : 'Your serve: aim with the mouse, click (or Space) to serve', 4);
  audio.say('serve-' + sv.id, 0.8);
}
// Hit the ball: choose a target on the other side and solve the launch velocity.
function strike(h, kind, aim, quality) {
  const dir = h === 0 ? -1 : 1;   // towards -z for the near player
  let tx = clamp(aim * CW * 0.8 + rnd(-1, 1) * (1 - quality) * 1.6, -(CW - 0.3), CW - 0.3), tz, T, minNet = 0.15;
  const from = ball.p.clone(), dzMax = Math.abs(dir * CL - from.z);
  if (kind === 'serve') { tz = dir * rnd(3.5, 6.3); T = Math.abs(tz - from.z) / 13; }
  else if (kind === 'lob') { tz = dir * rnd(7.6, 9.2); T = rnd(1.6, 1.95); minNet = 1.8; }
  else if (kind === 'smash') { tz = dir * rnd(2.8, 5.5); T = Math.abs(tz - from.z) / (22 + quality * 6); minNet = 0.05; }
  else { tz = dir * rnd(5.2, 8.6); T = Math.abs(tz - from.z) / (13 + quality * 8); }
  // Mistakes on poor contact: into the net or long.
  if (quality < 0.3 && kind !== 'serve' && Math.random() < 0.55) { if (Math.random() < 0.5) { minNet = -0.4; T *= 0.8; } else tz = dir * (CL + 1.5); }
  const solve = () => { const v = new V3((tx - from.x) / T, (0.03 - from.y + 0.5 * G * T * T) / T, (tz - from.z) / T); return v; };
  let v = solve();
  for (let i = 0; i < 30; i++) {
    const tn = (0 - from.z) / v.z; const y = from.y + v.y * tn - 0.5 * G * tn * tn;
    if (tn < 0 || y > NET + minNet) break; T *= 1.06; v = solve();
  }
  v.multiplyScalar(1 + DRAG * T * 0.5);   // make up for air drag
  ball.v.copy(v); ball.live = true;
  rally.lastHit = h; rally.side = h; rally.bounces = 0; rally.crossed = false; rally.serve = kind === 'serve'; rally.hits++;
  audio.hit(kind === 'smash' ? 1 : kind === 'lob' ? 0.3 : 0.6);
  if (kind === 'smash') { audio.cheer(0.3); }
}
// Can player h hit now? Returns the shot kind or null.
function reachable(h) {
  const pl = players()[h];
  if (!ball.live || rally.lastHit === h || sideOf(ball.p.z) !== h || rally.bounces >= 2) return null;
  if (rally.serve && rally.bounces === 0) return null;            // the serve must bounce
  const dx = ball.p.x - pl.pos.x, dz = ball.p.z - pl.pos.z, d = Math.hypot(dx, dz);
  if (ball.p.y > 1.9 && ball.p.y < 3.1 && d < 1.0) return 'smash';
  if (ball.p.y > 0.12 && ball.p.y < 1.9 && d < 1.25 && d > 0.05) return 'ground';
  return null;
}

// ================= update =================
let swingBuf = 0, lobWanted = false;
function animatePlayer(pl, dt, facingYaw) {
  const sp = Math.hypot(pl.vel.x, pl.vel.z);
  pl.ch.root.position.copy(pl.pos);
  pl.ch.root.rotation.y = damp(pl.ch.root.rotation.y, facingYaw, 10, dt);
  let action = 'ready', t = 0;
  if (pl.swing) { pl.swing.t += dt / pl.swing.len; t = Math.min(1, pl.swing.t); action = pl.swing.type; if (pl.swing.t >= 1) pl.swing = null; }
  pl.ch.animate({ dt, speed: sp, grounded: true, action, actionT: t });
  placePala(pl);
}
function swingType(pl, h) { const right = h === 0 ? 1 : -1; return (ball.p.x - pl.pos.x) * right >= -0.05 ? 'fore' : 'back'; }
function update(dt) {
  if (state.paused || state.phase === 'title' || state.phase === 'end') return;
  state.t += dt;
  const h0 = me, h1 = ai;
  // ---- ball ----
  if (state.phase === 'serve') {
    const sv = players()[state.server];
    if (state.server === 0 && IN.hit && state.t > 0.4) { serveNow(0); }
    if (state.server === 1 && state.t > 1.5) serveNow(1);
  }
  if (ball.live) { const n = 4; for (let i = 0; i < n; i++) stepBall(ball, dt / n, onBall); }
  else if (state.phase === 'point' || state.phase === 'matchpoint') { for (let i = 0; i < 2; i++) stepBall(ball, dt / 2, (t, d) => { if (t === 'glass') audio.glass(d); if (t === 'floor') audio.floor(d); }); }
  if (state.phase === 'point' && state.t > 2.4) setupServe();
  // Rolling dead ball: whoever's side it is on loses.
  if (ball.live && ball.p.y <= R + 0.001 && Math.hypot(ball.v.x, ball.v.z) < 0.6) { const s = sideOf(ball.p.z); endPoint(rally.crossed && s !== rally.lastHit ? rally.lastHit : 1 - s, 'WINNER'); }
  // ---- you ----
  const mv = moveInput();
  const aim = mv.m > 0.2 ? clamp(mv.x, -1, 1) : (!TOUCH && performance.now() - IN.mouseMoved < 4000 ? clamp(IN.mouseX * 1.3, -1, 1) : 0);
  const myBall = ball.live && rally.lastHit === 1 ? predict(0, { volley: true }) : null;
  if (state.phase === 'rally' || state.phase === 'serve' && state.server === 1) {
    if (mv.m > 0.15) { h0.vel.set(mv.x * 5.4, 0, mv.y * 5.4); h0.target.copy(h0.pos); }
    else {
      if (myBall) { const right = 1; const fore = myBall.p.x >= h0.pos.x - 0.1; h0.target.set(myBall.p.x - (fore ? 0.55 : -0.55) * right, 0, clamp(myBall.p.z + 0.25, 0.6, 9.6)); }
      else if (ball.live && sideOf(ball.p.z) === 1) h0.target.set(clamp(ball.p.x * 0.4, -2.6, 2.6), 0, 7.4);
      const d = h0.target.clone().sub(h0.pos); d.y = 0; const L = d.length();
      h0.vel.copy(L > 0.08 ? d.multiplyScalar(Math.min(4.3, L * 6) / L) : d.set(0, 0, 0));
    }
  } else h0.vel.set(0, 0, 0);
  h0.pos.addScaledVector(h0.vel, dt); h0.pos.x = clamp(h0.pos.x, -(CW - 0.25), CW - 0.25); h0.pos.z = clamp(h0.pos.z, 0.5, 9.7);
  // Hitting: press a bit early is fine (buffer); the ball must be in reach.
  if (IN.hit && state.phase === 'rally') { swingBuf = 0.32; lobWanted = false; if (!h0.swing) h0.swing = { type: swingType(h0, 0), t: 0, len: 0.5 }; }
  if (IN.lob && state.phase === 'rally') { swingBuf = 0.32; lobWanted = true; if (!h0.swing) h0.swing = { type: swingType(h0, 0), t: 0, len: 0.5 }; }
  if (swingBuf > 0) {
    swingBuf -= dt; const r = reachable(0);
    if (r && (r === 'smash' || Math.abs(ball.p.z - h0.pos.z) < 0.45 || ball.v.z < 0)) {
      const d = Math.hypot(ball.p.x - h0.pos.x, ball.p.z - h0.pos.z), quality = clamp(1 - Math.abs(d - 0.6) / 0.75, 0.15, 1);
      const kind = r === 'smash' ? (lobWanted ? 'lob' : 'smash') : lobWanted ? 'lob' : 'drive';
      h0.swing = { type: r === 'smash' && kind === 'smash' ? 'smash' : swingType(h0, 0), t: 0.4, len: 0.5 };
      strike(0, kind, aim, quality); swingBuf = 0;
    }
  }
  // ---- the opponent ----
  const level = 0.5 + 0.12 * (state.games[0] - state.games[1]) + 0.1 * (state.games[0] + state.games[1]) / 2;
  const aiBall = ball.live && rally.lastHit === 0 ? predict(1, { volley: true }) : null;
  if (state.phase === 'rally' || state.phase === 'serve' && state.server === 0) {
    if (aiBall) { const fore = aiBall.p.x <= h1.pos.x + 0.1; h1.target.set(aiBall.p.x + (fore ? 0.55 : -0.55), 0, clamp(aiBall.p.z - 0.25, -9.6, -0.6)); }
    else if (ball.live && sideOf(ball.p.z) === 0) h1.target.set(clamp(ball.p.x * 0.45, -2.6, 2.6), 0, -7.2);
    const d = h1.target.clone().sub(h1.pos); d.y = 0; const L = d.length();
    h1.vel.copy(L > 0.08 ? d.multiplyScalar(Math.min(3.9 + level * 0.9, L * 6) / L) : d.set(0, 0, 0));
  } else h1.vel.set(0, 0, 0);
  h1.pos.addScaledVector(h1.vel, dt); h1.pos.x = clamp(h1.pos.x, -(CW - 0.25), CW - 0.25); h1.pos.z = clamp(h1.pos.z, -9.7, -0.5);
  const r1 = reachable(1);
  h1.cool = Math.max(0, (h1.cool || 0) - dt);
  if (r1 && state.phase === 'rally' && !h1.cool && (r1 === 'smash' || Math.abs(ball.p.z - h1.pos.z) < 0.45 || ball.v.z > 0)) {
    const d = Math.hypot(ball.p.x - h1.pos.x, ball.p.z - h1.pos.z);
    const err = 0.14 + Math.min(0.2, ball.v.length() / 110) - level * 0.05;
    const quality = Math.random() < err ? rnd(0.05, 0.28) : rnd(0.55, 0.95) * clamp(1 - Math.abs(d - 0.6) / 1.2, 0.5, 1);
    const kind = r1 === 'smash' ? (Math.random() < 0.75 ? 'smash' : 'lob') : (h0.pos.z < 4 && Math.random() < 0.55 ? 'lob' : Math.random() < 0.15 ? 'lob' : 'drive');
    const aimAway = clamp(-Math.sign(h0.pos.x || rnd(-1, 1)) * rnd(0.55, 1.05), -1, 1);
    h1.swing = { type: kind === 'smash' ? 'smash' : swingType(h1, 1), t: 0.4, len: 0.5 };
    strike(1, kind, aimAway, quality);
    h1.cool = 0.3;
  }
  // ---- animate ----
  animatePlayer(h0, dt, Math.PI + clamp((ball.p.x - h0.pos.x) * 0.15, -0.4, 0.4));
  animatePlayer(h1, dt, clamp(-(ball.p.x - h1.pos.x) * 0.15, -0.4, 0.4));
  IN.hit = IN.lob = false;
  // ---- ball visuals ----
  ballMesh.position.copy(ball.p); shadowBlob.position.set(ball.p.x, 0.005, ball.p.z); shadowBlob.material.opacity = clamp(0.4 - ball.p.y * 0.08, 0.05, 0.4);
  trailPts.pop(); trailPts.unshift(ball.p.clone()); trailGeo.setFromPoints(trailPts);
  trail.visible = ball.live && ball.v.length() > 6;
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('#hint').style.opacity = 0; }
}
function serveNow(s) {
  const sv = players()[s];
  sv.swing = { type: 'serve', t: 0.35, len: 0.6 };
  ball.p.y = 0.75;
  const aim = s === 0 ? (TOUCH ? moveInput().x : clamp(IN.mouseX * 1.3, -1, 1)) : rnd(-0.8, 0.8);
  strike(s, 'serve', aim, s === 0 ? 0.9 : 0.85);
  rally.serve = true; state.phase = 'rally'; state.t = 0;
}

// ================= camera =================
const camPos = new V3(0, 4.6, 14.5), camLook = new V3(0, 0.6, -3);
function updateCamera(dt) {
  if (state.phase === 'title') {
    const t = performance.now() / 1000 * 0.12; camera.position.set(Math.sin(t) * 13, 6 + Math.sin(t * 1.7), Math.cos(t) * 15); camera.lookAt(0, 1, 0); return;
  }
  const portrait = camera.aspect < 0.8;
  const want = new V3(me.pos.x * 0.35, portrait ? 7.2 : 5.9, portrait ? 18 : 16.6), look = new V3(me.pos.x * 0.2 + ball.p.x * 0.15, 0.2, portrait ? -0.5 : -1.4);
  camPos.x = damp(camPos.x, want.x, 3, dt); camPos.y = damp(camPos.y, want.y, 3, dt); camPos.z = damp(camPos.z, want.z, 3, dt);
  camLook.lerp(look, 1 - Math.exp(-dt * 3));
  camera.position.copy(camPos); camera.lookAt(camLook);
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
// ================= loop, menus =================
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, clock.getDelta());
  if (!window.__hold) update(dt);
  updateCamera(dt);
  // Crowd sways a little.
  renderer.render(scene, camera);
}
function controlsHTML() {
  const rows = TOUCH
    ? [['Left thumb', 'Move (your player also runs to the ball by himself)'], ['HIT', 'Hit the ball — tap just before it reaches you'], ['LOB', 'High lob over the opponent'], ['Stick left/right', 'Aim when you hit']]
    : [['Mouse', 'Aim left / right'], ['Click / <kbd>Space</kbd>', 'Hit — just before the ball reaches you'], ['Right click / <kbd>Shift</kbd>', 'Lob'], ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move (optional: your player runs to the ball by himself)'], ['<kbd>Esc</kbd>', 'Pause']];
  return rows.map(([a, b]) => `<div>${a}</div><div>${b}</div>`).join('');
}
$('#ctrlList').innerHTML = controlsHTML();
function togglePause(force) {
  if (state.phase === 'title' || state.phase === 'end') return;
  state.paused = force ?? !state.paused; $('#menu').classList.toggle('hidden', !state.paused);
  if (state.paused) audio.ctx?.suspend(); else { audio.ctx?.resume(); clock.getDelta(); }
}
function post(action, data) { try { window.parent.postMessage({ type: 'goual-arcade', game: 'padel', action, ...data }, '*'); } catch (e) { } }
function close() { leaveFullscreen(); audio.ctx?.suspend(); if (EMBED) post('close'); else location.href = '../'; }
$('#pauseBtn').onclick = () => togglePause(true);
$('#resumeBtn').onclick = () => togglePause(false);
$('#soundBtn').onclick = () => { audio.setOn(!audio.on); $('#soundBtn').textContent = 'Sound: ' + (audio.on ? 'on' : 'off'); };
$('#restartBtn').onclick = () => location.reload();
$('#quitBtn').onclick = close; $('#closeBtn').onclick = close; $('#tourBtn').onclick = close;
$('#againBtn').onclick = () => location.reload();
$('#contactBtn').onclick = () => { if (EMBED) post('contact'); else location.href = '../#contact'; };
$('#ctrlBtn').onclick = () => { $('#title').classList.add('hidden'); $('#menu').classList.remove('hidden'); $('#menuKicker').textContent = 'CONTROLS'; $('#resumeBtn').textContent = 'BACK'; $('#resumeBtn').onclick = () => { $('#menu').classList.add('hidden'); $('#title').classList.remove('hidden'); $('#resumeBtn').textContent = 'RESUME'; $('#resumeBtn').onclick = () => togglePause(false); }; };
function start(pick) {
  audio.init(); goLandscape();
  me = P[pick]; ai = P[pick === 'cr7' ? 'messi' : 'cr7'];
  $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); if (TOUCH) $('#touch').classList.remove('hidden');
  state.games = [0, 0]; state.points = [0, 0]; state.server = 0;
  me.pos.set(0, 0, 8); ai.pos.set(0, 0, -8); me.ch.root.rotation.y = Math.PI; ai.ch.root.rotation.y = 0;
  updateBoard(); audio.say('play');
  hint(TOUCH ? 'Your player runs to the ball. Tap HIT just before it reaches you.' : 'Your player runs to the ball. Aim with the mouse, click just before it reaches you.', 6);
  setTimeout(setupServe, 900);
}
$('#pickCR7').onclick = () => start('cr7');
$('#pickMessi').onclick = () => start('messi');
// Title: both players warming up on court.
P.cr7.pos.set(-1, 0, 6); P.messi.pos.set(1, 0, -6);
for (const pl of [P.cr7, P.messi]) { pl.ch.root.position.copy(pl.pos); }
P.cr7.ch.root.rotation.y = Math.PI; P.messi.ch.root.rotation.y = 0;
for (const pl of [P.cr7, P.messi]) { pl.ch.animate({ dt: 0.016, speed: 0, grounded: true, action: 'ready', actionT: 0 }); pl.ch.root.updateMatrixWorld(true); placePala(pl); }
setInterval(() => { if (state.phase === 'title') for (const pl of [P.cr7, P.messi]) { pl.ch.animate({ dt: 0.05, speed: 0, grounded: true, action: 'ready', actionT: 0 }); pl.ch.root.updateMatrixWorld(true); placePala(pl); } }, 50);
$('#loading').classList.add('hidden'); $('#title').classList.remove('hidden');
frame(); post('ready');
window.__padel = { state, rally, ball, P, get me() { return me; }, get ai() { return ai; }, IN, keys, update, predict, start, camera };
