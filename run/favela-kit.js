// Favela kit: real 3D pieces built in code in a soft animated-movie style.
// Houses (rounded walls, recessed barred windows, doors, tile roofs, water tanks, rebar, balconies),
// parked Fuscas and Kombis, caramel street dogs, and street clutter. Pieces of a segment are merged
// by material so a whole street costs only a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const C = c => new THREE.Color(c);

// ---------- painted textures made on canvas ----------
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
function rnd(R, a, b) { return a + R() * (b - a); }
let R0 = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const plaster = () => canvas(512, 512, (g, w, h) => {
  g.fillStyle = '#f1ede6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { const v = rnd(R0, -18, 14); g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '150,135,120'},${Math.abs(v) / 260})`; g.beginPath(); g.ellipse(rnd(R0, 0, w), rnd(R0, 0, h), rnd(R0, 10, 70), rnd(R0, 8, 50), rnd(R0, 0, 3), 0, 7); g.fill(); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(90,80,70,${rnd(R0, 0.02, 0.06)})`; g.fillRect(rnd(R0, 0, w), rnd(R0, 0, h), 1.5, 1.5); }
  g.strokeStyle = 'rgba(80,70,60,0.25)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) { let x = rnd(R0, 0, w), y = rnd(R0, 0, h); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(R0, -14, 14); y += rnd(R0, 6, 18); g.lineTo(x, y); } g.stroke(); }
});
const bricks = () => canvas(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  // ragged blob of exposed brick
  g.save(); g.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 100 + Math.sin(i * 2.7) * 18 + rnd(R0, -14, 14); g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.8); } g.closePath(); g.clip();
  g.fillStyle = '#c9b8a4'; g.fillRect(0, 0, w, h);
  for (let y = 0, row = 0; y < h; y += 22, row++) for (let x = -((row % 2) * 24); x < w; x += 48) { g.fillStyle = `hsl(${rnd(R0, 10, 22)},${rnd(R0, 50, 65)}%,${rnd(R0, 46, 58)}%)`; g.beginPath(); g.roundRect(x + 2, y + 2, 44, 18, 4); g.fill(); }
  g.restore();
});
const tiles = () => canvas(128, 256, (g, w, h) => {
  for (let y = 0; y < h; y += 64) { const gr = g.createLinearGradient(0, y, 0, y + 64); gr.addColorStop(0, '#e2884f'); gr.addColorStop(0.75, '#c8693a'); gr.addColorStop(1, '#8e4426'); g.fillStyle = gr; g.fillRect(0, y, w, 64); }
  const sh = g.createLinearGradient(0, 0, w, 0); sh.addColorStop(0, 'rgba(0,0,0,0.25)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
});
const woodDoor = () => canvas(128, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < w; x += 21) g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(8, 30, w - 16, 4); g.fillRect(8, h - 40, w - 16, 4); });

// World-space texture projection: walls of any shape get even plaster without UV work.
function triplanar(mat, tex, scale) {
  mat.customProgramCacheKey = () => 'tri' + scale;
  mat.onBeforeCompile = sh => {
    sh.uniforms.triMap = { value: tex }; sh.uniforms.triScale = { value: scale };
    sh.vertexShader = 'varying vec3 vTriP; varying vec3 vTriN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vTriP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTriN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform sampler2D triMap; uniform float triScale; varying vec3 vTriP; varying vec3 vTriN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 bw = pow(abs(vTriN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec4 tx = texture2D(triMap, vTriP.zy * triScale) * bw.x + texture2D(triMap, vTriP.xz * triScale) * bw.y + texture2D(triMap, vTriP.xy * triScale) * bw.z;
      diffuseColor.rgb *= tx.rgb;
      // grime near the ground and under each floor band
      diffuseColor.rgb *= mix(0.86, 1.0, smoothstep(0.0, 1.4, vTriP.y - floor(vTriP.y / 3.0) * 3.0 + step(3.0, vTriP.y) * 1.4));`);
  };
  return mat;
}

// ---------- shared materials ----------
const WALLS = ['#3fb4d6', '#ef5b3f', '#7cc84a', '#f4c430', '#f19ac0', '#f6efe2', '#ff9a3c', '#60c9b0', '#a98fe0', '#e8d6b8'];
const TRIMS = ['#f4c430', '#ef5b3f', '#2fa3c9', '#ffffff', '#3d9b5a', '#f08a3a'];
export function kitMaterials() {
  const tex = { plaster: plaster(), bricks: bricks(), tiles: tiles(), door: woodDoor() };
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: C(c), roughness: 0.85, ...o });
  const M = {
    wall: WALLS.map(c => triplanar(std(c), tex.plaster, 0.35)),
    trim: TRIMS.map(c => std(c, { roughness: 0.7 })),
    concrete: triplanar(std('#c9bfb1'), tex.plaster, 0.5),
    bricks: new THREE.MeshStandardMaterial({ map: tex.bricks, transparent: true, alphaTest: 0.3, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
    tiles: new THREE.MeshStandardMaterial({ map: tex.tiles, roughness: 0.75 }),
    glass: std('#23303f', { roughness: 0.25, metalness: 0.2 }),
    curtain: ['#f3e3c3', '#f7c6c6', '#cfe8f7', '#fff3b0'].map(c => std(c, { roughness: 1 })),
    bars: std('#3b3a3f', { metalness: 0.5, roughness: 0.5 }),
    door: TRIMS.map(c => new THREE.MeshStandardMaterial({ map: tex.door, color: C(c), roughness: 0.7 })),
    tank: std('#2f62c9', { roughness: 0.35 }),
    pipe: std('#bdb6aa', { roughness: 0.6 }),
    rebar: std('#6d4a33', { roughness: 0.8 }),
    pot: std('#c9683c'), leaf: std('#4f9d3a', { roughness: 0.8 }), leaf2: std('#6dbb45', { roughness: 0.8 }),
    black: std('#1d1d22', { roughness: 0.6 }), chrome: std('#dfe5ec', { metalness: 0.85, roughness: 0.25 }), tyre: std('#26262a', { roughness: 0.9 }),
    light: std('#fff7d6', { emissive: C('#ffe9a8'), emissiveIntensity: 0.6 }),
    car: ['#7fc8e8', '#f2d36b', '#e8664f', '#9ad07a', '#f4f0e6', '#c7a6e8'].map(c => std(c, { roughness: 0.32, metalness: 0.15 })),
    dog: std('#d48a45', { roughness: 0.95 }), dogLight: std('#f2c48a', { roughness: 0.95 }), nose: std('#2a1d18', { roughness: 0.4 }),
    plastic: ['#e64034', '#f4f4f4', '#2f7ad6', '#f2c230'].map(c => std(c, { roughness: 0.45 })),
    bag: std('#2b2b30', { roughness: 0.35 }), gas: std('#3a6fd8', { roughness: 0.4 }),
    cloth: ['#f2f2f2', '#ef5b3f', '#3fb4d6', '#f4c430', '#7cc84a', '#f19ac0'].map(c => new THREE.MeshStandardMaterial({ color: C(c), roughness: 1, side: THREE.DoubleSide })),
    string: std('#ddd'),
  };
  return M;
}

// ---------- geometry helpers ----------
export function roundedBox(w, h, d, r = 0.15, seg = 2) {
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); s.lineTo(w / 2, y); s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  s.lineTo(-x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y); s.lineTo(-w / 2, -y); s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: seg, curveSegments: seg });
  g.translate(0, 0, -(d - 2 * r) / 2); return g;
}
// A builder collects (geometry, material, matrix) and merges them by material.
export class Builder {
  constructor() { this.parts = new Map(); this.m = new THREE.Matrix4(); this.stack = []; }
  push(pos, rotY = 0, scale = 1) { this.stack.push(this.m.clone()); const t = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new V3(scale, scale, scale)); this.m.multiply(t); return this; }
  pop() { this.m = this.stack.pop(); return this; }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const local = new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
    g.applyMatrix4(this.m.clone().multiply(local));
    if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(g);
  }
  build(group, { shadow = true } = {}) {
    for (const [mat, gs] of this.parts) {
      const geo = mergeGeometries(gs); gs.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = shadow && !mat.transparent; mesh.receiveShadow = true; group.add(mesh);
    }
    this.parts.clear(); return group;
  }
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  sph: new THREE.SphereGeometry(1, 16, 12), plane: new THREE.PlaneGeometry(1, 1), torus: new THREE.TorusGeometry(1, 0.06, 6, 20),
};
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);

// ---------- a favela house, front facing +z, ground at y=0, centred on x ----------
export function house(b, M, R, { w = rnd(R, 4.6, 7.4), floors = 1 + Math.floor(R() * 2.7), d = rnd(R, 5, 7) } = {}) {
  const FH = 2.9, wallM = M.wall[Math.floor(R() * 9)], trim = M.trim[Math.floor(R() * M.trim.length)];
  let top = 0, prevW = w, x0 = 0;
  for (let f = 0; f < floors; f++) {
    // upper floors shift and change width a little: houses built bit by bit
    const fw = f === 0 ? w : Math.max(3.4, prevW + rnd(R, -1.2, 0.6)), fx = f === 0 ? 0 : x0 + rnd(R, -0.5, 0.5), fd = d + (f ? rnd(R, -0.6, 0.4) : 0);
    const bare = R() < 0.05;                                                                 // an unpainted brick floor
    const mat = bare ? M.wall[9] : (f && R() < 0.3 ? M.wall[Math.floor(R() * 9)] : wallM);
    b.add(roundedBox(fw, FH, fd, 0.14), mat, fx, top + FH / 2, -fd / 2);
    // floor band
    b.add(roundedBox(fw + 0.24, 0.22, fd + 0.2, 0.08), f ? trim : M.concrete, fx, top + FH, -fd / 2);
    // exposed brick patches
    for (let k = 0; k < (bare ? 4 : 1 + Math.floor(R() * 2)); k++) b.add(G.plane, M.bricks, fx + rnd(R, -fw / 2 + 0.6, fw / 2 - 0.6), top + rnd(R, 0.6, FH - 0.6), 0.012, 0, 0, 0, rnd(R, 0.8, 1.6), rnd(R, 0.6, 1.2));
    // openings: door on the ground floor, windows elsewhere
    const n = Math.max(1, Math.floor((fw - 0.8) / 2.1)), step = fw / n;
    const doorAt = f === 0 ? Math.floor(R() * n) : -1;
    for (let k = 0; k < n; k++) {
      const cx = fx - fw / 2 + step * (k + 0.5) + rnd(R, -0.2, 0.2);
      if (k === doorAt) door(b, M, R, cx, top, trim);
      else win(b, M, R, cx, top + (f === 0 ? 1.0 : 0.95), rnd(R, 0.9, 1.5), rnd(R, 0.9, 1.25), trim);
    }
    // a balcony on some upper floors
    if (f > 0 && R() < 0.4) balcony(b, M, R, fx, top, fw * rnd(R, 0.45, 0.7), trim);
    // AC box
    if (R() < 0.3) { const ax = fx + rnd(R, -fw / 2 + 0.6, fw / 2 - 0.6); b.add(roundedBox(0.75, 0.45, 0.4, 0.05), M.chrome, ax, top + 2.35, 0.2); }
    top += FH; prevW = fw; x0 = fx;
  }
  // roof: flat slab with low parapet, or a lean-to of clay tiles
  const rw = prevW, rx = x0;
  if (R() < 0.45) tileRoof(b, M, R, rx, top + 0.1, rw + 0.6, d + 0.6);
  else {
    b.add(roundedBox(rw + 0.1, 0.5, d + 0.05, 0.08), M.concrete, rx, top + 0.25, -d / 2);
    // rebar sticking out of the corner columns (the next floor will come one day)
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) b.add(G.cyl6, M.rebar, rx + sx * (rw / 2 - 0.2) + k * 0.07 * sx, top + 0.9, -0.3 - k * 0.05, rnd(R, -0.08, 0.08), 0, rnd(R, -0.1, 0.1), 0.018, 0.9, 0.018);
  }
  // water tank + antenna
  if (R() < 0.8) {
    const tx = rx + rnd(R, -rw / 2 + 1, rw / 2 - 1), tz = -rnd(R, 1, d - 1.2), ty = top + 0.55;
    b.add(roundedBox(1.5, 0.35, 1.5, 0.05), M.concrete, tx, ty, tz);
    b.add(G.cyl, M.tank, tx, ty + 0.75, tz, 0, 0, 0, 0.62, 1.1, 0.62);
    for (const y of [0.4, 0.75, 1.05]) b.add(G.torus, M.tank, tx, ty + y, tz, Math.PI / 2, 0, 0, 0.63, 0.63, 0.63);
    b.add(G.cyl, M.tank, tx, ty + 1.36, tz, 0, 0, 0, 0.66, 0.1, 0.66);
    b.add(G.cyl, M.pipe, tx + 0.7, ty + 0.2, tz, 0, 0, 0, 0.05, 1.6, 0.05);
  }
  if (R() < 0.6) { const ax = rx + rnd(R, -rw / 2 + 0.5, rw / 2 - 0.5); b.add(G.cyl6, M.bars, ax, top + 1.6, -1, 0, 0, 0, 0.03, 2.6, 0.03); for (let k = 0; k < 4; k++) b.add(G.cyl6, M.bars, ax, top + 2.2 + k * 0.22, -1, 0, 0, Math.PI / 2, 0.015, 1.1 - k * 0.18, 0.015); }
  // pipe down the facade
  if (R() < 0.5) b.add(G.cyl, M.pipe, -w / 2 + 0.25, top / 2, 0.12, 0, 0, 0, 0.06, top, 0.06);
  return { w, top };
}
function win(b, M, R, x, y, ww, wh, trim) {
  const t = 0.16, dz = 0.1;
  b.add(G.glass ?? G.box, M.glass, x, y + wh / 2, -0.06, 0, 0, 0, ww, wh, 0.05);
  b.add(G.box, M.curtain[Math.floor(R() * 4)], x - ww * 0.28, y + wh / 2, -0.03, 0, 0, 0, ww * 0.35, wh * 0.95, 0.03);
  for (const s of [-1, 1]) b.add(G.box, trim, x + s * (ww / 2 + t / 2), y + wh / 2, dz / 2, 0, 0, 0, t, wh + 2 * t, 0.16);
  b.add(G.box, trim, x, y + wh + t / 2, dz / 2, 0, 0, 0, ww + 2 * t, t, 0.16);
  b.add(roundedBox(ww + 0.45, 0.12, 0.34, 0.04), trim, x, y - 0.06, 0.12);
  // bars
  const nb = Math.round(ww / 0.17); for (let k = 1; k < nb; k++) b.add(G.cyl6, M.bars, x - ww / 2 + k * ww / nb, y + wh / 2, 0.05, 0, 0, 0, 0.018, wh, 0.018);
  b.add(G.box, M.bars, x, y + wh * 0.5, 0.05, 0, 0, 0, ww, 0.03, 0.03);
  // a plant on the sill
  if (R() < 0.45) { const px = x + rnd(R, -ww / 3, ww / 3); b.add(G.cyl, M.pot, px, y + 0.13, 0.15, 0, 0, 0, 0.12, 0.2, 0.12); b.add(G.sph, R() < 0.5 ? M.leaf : M.leaf2, px, y + 0.38, 0.15, 0, 0, 0, 0.24, 0.2, 0.22); if (R() < 0.5) for (let k = 0; k < 4; k++) b.add(G.sph, M.leaf, px + 0.08, y + 0.2 - k * 0.18, 0.28, 0, 0, 0, 0.08, 0.1, 0.06); }
}
function door(b, M, R, x, y, trim) {
  const dw = 1.0, dh = 2.1, t = 0.16;
  b.add(G.box, M.door[Math.floor(R() * M.door.length)], x, y + dh / 2, -0.05, 0, 0, 0, dw, dh, 0.08);
  for (const s of [-1, 1]) b.add(G.box, trim, x + s * (dw / 2 + t / 2), y + dh / 2, 0.05, 0, 0, 0, t, dh + t, 0.16);
  b.add(G.box, trim, x, y + dh + t / 2, 0.05, 0, 0, 0, dw + 2 * t, t, 0.16);
  b.add(G.sph, M.chrome, x + dw * 0.35, y + 1.0, 0.02, 0, 0, 0, 0.05, 0.05, 0.05);
  b.add(roundedBox(dw + 0.8, 0.2, 0.6, 0.05), M.concrete, x, y + 0.1, 0.3);
  // little tile awning and a lamp
  if (R() < 0.6) { tileRoof(b, M, R, x, y + dh + 0.35, dw + 0.9, 0.8, 0.35, true); b.add(G.sph, M.light, x, y + dh + 0.2, 0.25, 0, 0, 0, 0.09, 0.09, 0.09); }
}
function balcony(b, M, R, x, y, bw, trim) {
  b.add(roundedBox(bw, 0.16, 1.1, 0.05), M.concrete, x, y + 0.08, 0.55);
  b.add(roundedBox(bw, 0.9, 0.12, 0.04), trim, x, y + 0.6, 1.05);
  if (R() < 0.6) { // laundry on the rail
    for (let k = 0; k < 3; k++) b.add(G.plane, M.cloth[Math.floor(R() * M.cloth.length)], x - bw / 3 + k * bw / 3, y + 0.75, 1.13, 0, 0, 0, 0.5, 0.6, 1);
  }
}
// clay tile roof: a sheet with real waves, tilted toward the front
function tileRoof(b, M, R, x, y, w, d, slope = 0.32, small = false) {
  const nx = Math.max(4, Math.round(w / 0.24)), geo = new THREE.PlaneGeometry(w, d, nx * 2, Math.max(2, Math.round(d / 0.5))), p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i); p.setZ(i, Math.abs(Math.sin(px / 0.24 * Math.PI)) * 0.07 + (Math.floor((py + d / 2) / 0.42) % 2) * 0.012); uv.setXY(i, px / 0.24 * 0.5, py / 0.42 * 0.25); }
  geo.computeVertexNormals();
  b.add(geo, M.tiles, x, y + (small ? 0 : 0.35), small ? 0.4 - d / 2 + 0.3 : -d / 2 + 0.3, -Math.PI / 2 + slope);
  if (!small) b.add(roundedBox(w - 0.2, 0.7, d - 0.6, 0.06), M.concrete, x, y - 0.05, -d / 2 + 0.3);
}

// ---------- parked cars: VW Fusca and Kombi ----------
// side profile of a Beetle, extruded with a fat bevel so every edge is soft
let FUSCA = null;
function fuscaGeo() {
  if (FUSCA) return FUSCA;
  const prof = (pts, depth, bevel) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (let i = 1; i < pts.length; i += 2) sh.quadraticCurveTo(...pts[i], ...pts[i + 1]); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 10 }); g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); return g; };
  const body = prof([[1.95, 0.32], [2.08, 0.45], [2.0, 0.62], [1.7, 0.88], [0.85, 0.98], [0.35, 1.5], [-0.35, 1.48], [-1.2, 1.4], [-1.75, 0.95], [-2.05, 0.62], [-1.98, 0.32], [0, 0.26], [1.95, 0.32]], 1.12, 0.24);
  const glass = prof([[0.82, 0.98], [0.5, 1.28], [0.3, 1.43], [-0.3, 1.43], [-0.36, 1.43], [-0.95, 1.38], [-1.25, 1.08], [-0.2, 1.0], [0.82, 0.98]], 1.16, 0.25);
  FUSCA = { body, glass }; return FUSCA;
}
export function fusca(b, M, R) {
  const body = M.car[Math.floor(R() * M.car.length)], G2 = fuscaGeo();
  b.add(G2.body, body, 0, 0.08, 0);
  b.add(G2.glass, M.glass, 0, 0.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(G.sph, body, sx * 0.72, 0.6, sz * 1.22, 0, 0, 0, 0.26, 0.36, 0.56);  // fenders
    b.add(G.cyl, M.tyre, sx * 0.74, 0.32, sz * 1.22, 0, 0, Math.PI / 2, 0.32, 0.24, 0.32);
    b.add(G.cyl, M.chrome, sx * 0.87, 0.32, sz * 1.22, 0, 0, Math.PI / 2, 0.16, 0.02, 0.16);
  }
  for (const sx of [-1, 1]) { b.add(G.sph, M.light, sx * 0.62, 0.78, 1.82, 0, 0, 0, 0.15, 0.15, 0.1); b.add(G.sph, M.plastic[0], sx * 0.62, 0.72, -1.95, 0, 0, 0, 0.1, 0.12, 0.05); }
  for (const sz of [-1, 1]) b.add(cap(0.05, 1.45), M.chrome, 0, 0.4, sz * 2.1, 0, 0, Math.PI / 2);
}
export function kombi(b, M, R) {
  const lower = M.car[Math.floor(R() * M.car.length)];
  b.add(roundedBox(1.85, 0.95, 4.3, 0.3, 3), lower, 0, 0.85, 0);
  b.add(roundedBox(1.85, 0.95, 4.3, 0.34, 3), M.car[4], 0, 1.75, 0);
  b.add(roundedBox(1.87, 0.5, 3.6, 0.1), M.glass, 0, 1.75, -0.2);
  b.add(roundedBox(1.5, 0.55, 0.1, 0.06), M.glass, 0, 1.75, 2.13);
  b.add(G.sph, M.car[4], 0, 1.2, 2.12, 0, 0, 0, 0.45, 0.32, 0.06);      // the V on the nose
  for (const sx of [-1, 1]) { b.add(G.sph, M.light, sx * 0.62, 1.05, 2.15, 0, 0, 0, 0.13, 0.13, 0.05); for (const sz of [-1, 1]) { b.add(G.cyl, M.tyre, sx * 0.86, 0.34, sz * 1.4, 0, 0, Math.PI / 2, 0.34, 0.24, 0.34); b.add(G.cyl, M.chrome, sx * 0.99, 0.34, sz * 1.4, 0, 0, Math.PI / 2, 0.17, 0.02, 0.17); } }
  for (const sz of [-1, 1]) b.add(cap(0.06, 1.6), M.chrome, 0, 0.42, sz * 2.18, 0, 0, Math.PI / 2);
}

// ---------- a caramel street dog ("vira-lata caramelo") ----------
export function dog(b, M, R, pose = R() < 0.5 ? 'lie' : 'stand') {
  const s = rnd(R, 0.85, 1.1), c = M.dog, l = M.dogLight;
  if (pose === 'stand') {
    b.add(cap(0.2 * s, 0.55 * s), c, 0, 0.55 * s, 0, Math.PI / 2);
    b.add(G.sph, l, 0, 0.47 * s, 0.05, 0, 0, 0, 0.16 * s, 0.12 * s, 0.4 * s);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cap(0.06 * s, 0.32 * s), sz > 0 ? l : c, sx * 0.11 * s, 0.24 * s, sz * 0.3 * s);
    head(0, 0.82 * s, 0.48 * s, 0.25);
    b.add(cap(0.04 * s, 0.32 * s), c, 0, 0.78 * s, -0.5 * s, -0.9);         // tail up
  } else {
    b.add(cap(0.2 * s, 0.5 * s), c, 0, 0.22 * s, 0, Math.PI / 2, 0.15);
    for (const sx of [-1, 1]) b.add(cap(0.06 * s, 0.3 * s), l, sx * 0.13 * s, 0.07 * s, 0.42 * s, Math.PI / 2);
    head(0.03, 0.3 * s, 0.5 * s, -0.15);
    b.add(cap(0.04 * s, 0.32 * s), c, 0.2 * s, 0.07 * s, -0.42 * s, Math.PI / 2, 0, 1.0);
  }
  function head(x, y, z, tilt) {
    b.add(G.sph, c, x, y, z, tilt, 0, 0, 0.19 * s, 0.18 * s, 0.2 * s);
    b.add(cap(0.085 * s, 0.12 * s), l, x, y - 0.05 * s, z + 0.17 * s, Math.PI / 2 + tilt);
    b.add(G.sph, M.nose, x, y - 0.02 * s, z + 0.33 * s, 0, 0, 0, 0.045 * s, 0.035 * s, 0.035 * s);
    for (const sx of [-1, 1]) {
      b.add(G.sph, M.nose, x + sx * 0.08 * s, y + 0.05 * s, z + 0.15 * s, 0, 0, 0, 0.03 * s, 0.035 * s, 0.02 * s);
      b.add(G.sph, c, x + sx * 0.14 * s, y + 0.12 * s, z - 0.02 * s, 0.3, 0, sx * 0.5, 0.06 * s, 0.13 * s, 0.035 * s);   // ears
    }
  }
}

// ---------- street clutter ----------
export function clutter(b, M, R, kind) {
  if (kind === 'bags') for (let k = 0; k < 2 + Math.floor(R() * 3); k++) b.add(G.sph, M.bag, rnd(R, -0.5, 0.5), 0.25, rnd(R, -0.4, 0.4), 0, rnd(R, 0, 3), 0, rnd(R, 0.25, 0.35), rnd(R, 0.25, 0.32), rnd(R, 0.25, 0.35));
  else if (kind === 'gas') { b.add(cap(0.22, 0.25), M.gas, 0, 0.35, 0); b.add(G.cyl, M.bars, 0, 0.7, 0, 0, 0, 0, 0.05, 0.12, 0.05); }
  else if (kind === 'chairs') {
    const m = M.plastic[Math.floor(R() * 4)];
    b.add(G.cyl, m, 0, 0.72, 0, 0, 0, 0, 0.45, 0.04, 0.45); b.add(G.cyl, m, 0, 0.36, 0, 0, 0, 0, 0.05, 0.72, 0.05);
    for (const [cx, cz, r] of [[0.75, 0, -Math.PI / 2], [-0.75, 0.1, Math.PI / 2], [0, 0.75, Math.PI]]) {
      b.push(new V3(cx, 0, cz), r);
      b.add(roundedBox(0.45, 0.05, 0.45, 0.02), m, 0, 0.45, 0); b.add(roundedBox(0.45, 0.45, 0.05, 0.02), m, 0, 0.7, -0.21);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.cyl6, m, sx * 0.19, 0.22, sz * 0.19, 0, 0, 0, 0.025, 0.45, 0.025);
      b.pop();
    }
  } else if (kind === 'crates') {
    for (let k = 0; k < 2 + Math.floor(R() * 2); k++) { const y = k * 0.32; b.add(roundedBox(0.6, 0.3, 0.42, 0.03), M.plastic[2 + (k % 2)], 0, y + 0.15, 0, 0, rnd(R, -0.2, 0.2)); }
  }
}
// a clothes line strung across an alley
export function laundry(b, M, R, a, c) {
  const n = 6, pts = []; for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(c, t); p.y -= Math.sin(t * Math.PI) * 0.35; pts.push(p); }
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 3), M.string);
  for (let i = 1; i < n; i++) if (R() < 0.8) { const p = pts[i], dir = c.clone().sub(a); b.add(G.plane, M.cloth[Math.floor(R() * M.cloth.length)], p.x, p.y - 0.32, p.z, 0, Math.atan2(dir.x, dir.z) + Math.PI / 2, 0, rnd(R, 0.4, 0.7), rnd(R, 0.5, 0.75), 1); }
}
