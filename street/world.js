// The favela: terraces climbing the hill, packed brick and painted houses, alleys, stairs,
// the cage court, graffiti, wires and laundry, and Rio's bay behind. Everything is built in code.
// Solid parts are registered as axis-aligned boxes (`colliders`) for the player and the ball.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- small helpers ----------
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(7);
const pick = a => a[Math.floor(R() * a.length)];
const between = (a, b) => a + R() * (b - a);

function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
}
function noise(g, w, h, n, a, dark = true) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${dark ? '0,0,0' : '255,255,255'},${R() * a})`; const s = R() * 3 + 1; g.fillRect(R() * w, R() * h, s, s); } }
function blotches(g, w, h, n, col, a, r0, r1) {
  for (let i = 0; i < n; i++) { const x = R() * w, y = R() * h, r = between(r0, r1); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a * R()})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
}

// ---------- textures ----------
// One texture tile = 2 m x 2 m of wall unless said otherwise.
function brickCanvas() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#8a7a6c'; g.fillRect(0, 0, w, h);                   // mortar
    const rows = 28, bh = h / rows, bw = w / 9;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 10; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      const base = pick([[176, 84, 52], [165, 74, 44], [188, 96, 58], [150, 66, 40], [196, 110, 70], [140, 60, 38]]);
      const k = 0.85 + R() * 0.3;
      g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 3);
      if (R() < 0.35) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + bw * 0.2, y + bh * 0.3, bw * 0.6, bh * 0.35); } // holes of hollow bricks
    }
    blotches(g, w, h, 40, '120,110,95', 0.5, 10, 50);                   // mortar smears
    blotches(g, w, h, 30, '20,15,10', 0.35, 20, 90);                     // dirt
    for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(30,20,10,${0.12 * R()})`; g.fillRect(R() * w, 0, 2 + R() * 6, h); } // streaks
    noise(g, w, h, 5000, 0.25);
  });
}
function plasterCanvas() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#ededed'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 60, '255,255,255', 0.5, 20, 80);
    blotches(g, w, h, 26, '60,50,40', 0.16, 60, 200);                    // stains
    for (let i = 0; i < 40; i++) {                                         // rain streaks from top
      const x = R() * w, l = between(40, 300); const gr = g.createLinearGradient(0, 0, 0, l);
      gr.addColorStop(0, 'rgba(40,35,30,0.28)'); gr.addColorStop(1, 'rgba(40,35,30,0)'); g.fillStyle = gr; g.fillRect(x, 0, 3 + R() * 10, l);
    }
    g.strokeStyle = 'rgba(40,30,20,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += between(-14, 14); y += between(4, 18); g.lineTo(x, y); } g.stroke(); } // cracks
    {                                                                      // one patch of plaster fallen off, bricks showing
      const x = between(80, w - 80), y = between(60, h - 60);
      g.save(); g.beginPath(); for (let a = 0; a < 6.28; a += 0.5) { const r = between(30, 40); g.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r); } g.closePath(); g.clip();
      g.fillStyle = '#a4664a'; g.fillRect(x - 90, y - 60, 180, 120);
      g.fillStyle = 'rgba(120,105,90,0.9)'; for (let yy = y - 60; yy < y + 60; yy += 7) g.fillRect(x - 90, yy, 180, 1.5);
      for (let yy = y - 60, r = 0; yy < y + 60; yy += 7, r++) for (let xx = x - 90 + (r % 2) * 10; xx < x + 90; xx += 20) g.fillRect(xx, yy, 1.5, 7);
      g.restore();
    }
    noise(g, w, h, 9000, 0.12); noise(g, w, h, 3000, 0.15, false);
  });
}
function concreteCanvas(base = '#9b9890') {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 80, '40,38,35', 0.25, 20, 120); blotches(g, w, h, 40, '230,225,215', 0.2, 20, 90);
    g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 10; k++) { x += between(-25, 25); y += between(-25, 25); g.lineTo(x, y); } g.stroke(); }
    noise(g, w, h, 12000, 0.18); noise(g, w, h, 4000, 0.12, false);
  });
}
function asphaltCanvas() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#3d3b3a'; g.fillRect(0, 0, w, h); noise(g, w, h, 20000, 0.3); noise(g, w, h, 8000, 0.15, false);
    blotches(g, w, h, 30, '10,10,10', 0.35, 20, 80);
  });
}
// Window/door atlas: 4 window types + 2 doors in a 6-column strip.
function windowAtlas() {
  return canvas(1536, 384, (g) => {
    const cell = (i, f) => { g.save(); g.translate(i * 256, 0); f(); g.restore(); };
    const frame = (c) => { g.fillStyle = c; g.fillRect(8, 40, 240, 300); };
    const glass = (x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#2a3a48'); gr.addColorStop(0.45, '#6d8aa0'); gr.addColorStop(0.5, '#a8c4d6'); gr.addColorStop(0.6, '#3b5162'); gr.addColorStop(1, '#1c2731'); g.fillStyle = gr; g.fillRect(x, y, w, h); };
    cell(0, () => { frame('#c9c9c4'); glass(22, 54, 104, 272); glass(132, 54, 104, 272); g.fillStyle = '#c9c9c4'; g.fillRect(124, 54, 10, 272); });                   // aluminium window
    cell(1, () => { frame('#3a3a3a'); glass(22, 54, 212, 272); g.strokeStyle = '#1a1a1a'; g.lineWidth = 7; for (let x = 40; x < 240; x += 34) { g.beginPath(); g.moveTo(x, 50); g.lineTo(x, 330); g.stroke(); } for (let y = 90; y < 330; y += 80) { g.beginPath(); g.moveTo(20, y); g.lineTo(236, y); g.stroke(); } }); // bars
    cell(2, () => { frame('#6b4a2e'); for (let i = 0; i < 2; i++) { g.fillStyle = pick(['#2f7d6d', '#3b6fb0', '#b5452f', '#d9a531']); g.fillRect(20 + i * 110, 52, 106, 276); g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 60; y < 325; y += 14) g.fillRect(24 + i * 110, y, 98, 5); } }); // shutters
    cell(3, () => { frame('#d8d2c4'); g.fillStyle = '#121212'; g.fillRect(22, 54, 212, 272); g.fillStyle = pick(['#d65a7a', '#e8c54d', '#6fb3d9']); g.beginPath(); g.moveTo(22, 54); g.quadraticCurveTo(70, 200, 40, 326); g.lineTo(22, 326); g.fill(); g.beginPath(); g.moveTo(234, 54); g.quadraticCurveTo(190, 180, 220, 326); g.lineTo(234, 326); g.fill(); }); // open, curtain
    cell(4, () => { g.fillStyle = '#4b5560'; g.fillRect(10, 0, 236, 384); g.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = 20; x < 240; x += 12) g.fillRect(x, 0, 4, 384); noise(g, 256, 384, 1500, 0.3); }); // metal roller gate
    cell(5, () => { g.fillStyle = '#7a4d2b'; g.fillRect(30, 0, 196, 384); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 4; g.strokeRect(50, 30, 156, 150); g.strokeRect(50, 200, 156, 160); g.fillStyle = '#d8c070'; g.fillRect(190, 200, 14, 10); }); // wooden door
  });
}
function chainLinkCanvas() {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,210,0.95)'; g.lineWidth = 3;
    for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i * 64 + 128, 0); g.lineTo(i * 64, 128); g.stroke(); }
  });
}
function netCanvas() {
  return canvas(128, 128, (g, w, h) => { g.strokeStyle = 'rgba(240,240,240,0.9)'; g.lineWidth = 2.5; for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } });
}
function courtCanvas() {
  // 26 m x 16 m court, like the photo: worn yellow with a blue middle band and white lines.
  return canvas(1300, 800, (g, w, h) => {
    g.fillStyle = '#d6b23c'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 140, '90,80,60', 0.35, 20, 120); blotches(g, w, h, 60, '240,220,140', 0.3, 20, 90);
    g.fillStyle = 'rgba(40,70,140,0.92)'; g.fillRect(w * 0.27, h * 0.14, w * 0.46, h * 0.72);
    blotches(g, w, h, 60, '200,190,160', 0.25, 10, 60);
    g.strokeStyle = 'rgba(245,245,240,0.92)'; g.lineWidth = 9;
    g.strokeRect(30, 30, w - 60, h - 60);
    g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w / 2, h - 30); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 150, 0, 7); g.stroke();
    g.beginPath(); g.arc(30, h / 2, 270, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.arc(w - 30, h / 2, 270, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.fillStyle = 'rgba(245,245,240,0.9)'; g.beginPath(); g.arc(w / 2, h / 2, 10, 0, 7); g.fill();
    g.font = 'italic 900 34px Arial'; g.fillText('GOUAL ART · ESCOLINHA DO MORRO', w * 0.55, h - 46);
    noise(g, w, h, 30000, 0.2); noise(g, w, h, 12000, 0.12, false);
  });
}
function flagCanvas() {
  return canvas(640, 400, (g, w, h) => {
    g.fillStyle = '#1f8a4c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2cf2b'; g.beginPath(); g.moveTo(w / 2, 34); g.lineTo(w - 50, h / 2); g.lineTo(w / 2, h - 34); g.lineTo(50, h / 2); g.fill();
    g.fillStyle = '#2a3f8f'; g.beginPath(); g.arc(w / 2, h / 2, 104, 0, 7); g.fill();
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 16; g.beginPath(); g.arc(w / 2 + 40, h / 2 + 260, 300, -2.0, -1.12); g.stroke();
    g.fillStyle = '#fff'; for (let i = 0; i < 22; i++) { g.beginPath(); g.arc(w / 2 + between(-80, 80), h / 2 + between(10, 80), 2 + R() * 2, 0, 7); g.fill(); }
    blotches(g, w, h, 50, '255,255,255', 0.3, 10, 50); noise(g, w, h, 8000, 0.25);
  });
}

// Graffiti: spray-paint lettering with outline, 3D shadow, highlights, drips and overspray.
const TAG_FONTS = ['900 120px Impact, "Arial Black", sans-serif', 'italic 900 118px "Arial Black", Impact, sans-serif', '900 110px "Trebuchet MS", Impact, sans-serif'];
export function tagCanvas(text, { fill = ['#ff3b8d', '#ffb800'], outline = '#111', shadow = '#2a1460', w = 1024, h = 400, arrow = 0, glow = 0 } = {}) {
  return canvas(w, h, (g) => {
    g.translate(w / 2, h / 2); g.rotate(between(-0.08, 0.05)); g.transform(1, 0, between(-0.25, 0.05), 1, 0, 0);
    g.font = pick(TAG_FONTS); g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 120; const maxW = w * 0.82 - (arrow ? 220 : 0);
    while (g.measureText(text).width > maxW && size > 40) { size -= 6; g.font = g.font.replace(/\d+px/, size + 'px'); }
    const tx = arrow ? -100 : 0;
    if (glow) { g.shadowColor = fill[0]; g.shadowBlur = 40; }
    g.lineJoin = 'round';
    g.strokeStyle = shadow; g.lineWidth = 34; g.strokeText(text, tx + 12, 12);              // 3D shadow
    g.strokeStyle = outline; g.lineWidth = 22; g.strokeText(text, tx, 0);
    g.shadowBlur = 0;
    const gr = g.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1] || fill[0]);
    g.fillStyle = gr; g.fillText(text, tx, 0);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.save(); g.beginPath(); g.rect(-w, -size / 2, 2 * w, size * 0.22); g.clip(); g.strokeText(text, tx - 4, -4); g.restore(); // highlight
    const tw = g.measureText(text).width;
    for (let i = 0; i < 14; i++) {                                                         // drips
      const x = tx - tw / 2 + R() * tw, l = between(15, 70); g.fillStyle = R() < 0.5 ? fill[1] || fill[0] : outline;
      g.fillRect(x, size * 0.3, 4, l); g.beginPath(); g.arc(x + 2, size * 0.3 + l, 4, 0, 7); g.fill();
    }
    if (arrow) {                                                                           // arrow pointing right
      g.save(); g.translate(tx + tw / 2 + 120, 0); if (glow) { g.shadowColor = fill[0]; g.shadowBlur = 40; }
      g.beginPath(); g.moveTo(-90, -28); g.lineTo(10, -28); g.lineTo(10, -70); g.lineTo(100, 0); g.lineTo(10, 70); g.lineTo(10, 28); g.lineTo(-90, 28); g.closePath();
      g.lineWidth = 20; g.strokeStyle = outline; g.stroke(); g.fillStyle = gr; g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'source-atop';                                            // overspray speckle
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.25})`; g.fillRect(between(-w / 2, w / 2), between(-h / 2, h / 2), 2, 2); }
  });
}
const TAGS = [
  ['GOUAL ART', ['#7b5cff', '#2ee6ff']], ['JOGA BONITO', ['#ffcc00', '#ff6a00']], ['CR7', ['#ff2d55', '#ffb3c6']], ['RIO', ['#00e676', '#00b0ff']],
  ['FAVELA FC', ['#ff9100', '#ffea00']], ['SIUUU', ['#e91e63', '#ffeb3b']], ['GOL!', ['#76ff03', '#00e5ff']], ['MORRO', ['#ff4081', '#7c4dff']],
  ['DRIBLE', ['#18ffff', '#2979ff']], ['VILA 10', ['#ffd600', '#ff1744']], ['STREET', ['#b388ff', '#ea80fc']], ['PAZ', ['#69f0ae', '#ffff00']],
];

// ---------- world ----------
export function buildWorld(scene, { quality = 1, logoUrl } = {}) {
  const colliders = [];
  const solid = (x0, y0, z0, x1, y1, z1, tag) => { const c = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), tag }; colliders.push(c); return c; };

  const T = {
    brick: tex(brickCanvas()), plaster: tex(plasterCanvas()), plaster4: null, concrete: tex(concreteCanvas()), slab: tex(concreteCanvas('#8f8c86')),
    asphalt: tex(asphaltCanvas()), win: tex(windowAtlas(), { repeat: false }), chain: tex(chainLinkCanvas()), net: tex(netCanvas()),
    court: tex(courtCanvas(), { repeat: false }), flag: tex(flagCanvas(), { repeat: false }),
  };
  T.plaster4 = T.plaster.clone(); T.plaster4.repeat.set(0.5, 0.5); T.plaster4.needsUpdate = true;
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: T.brick, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.95 }),
    slab: new THREE.MeshStandardMaterial({ map: T.slab, roughness: 0.92 }),
    asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.9 }),
    blueWall: new THREE.MeshStandardMaterial({ map: T.plaster, color: 0x3a63b8, roughness: 0.9 }),
    chain: new THREE.MeshStandardMaterial({ map: T.chain, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.7, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.45 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.85 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0xe23b2e, roughness: 0.6 }),
  };
  const PAINT = ['#e88aa8', '#f1c84b', '#5fc4c0', '#7fb0e0', '#9bd17a', '#f2efe6', '#f08a4b', '#b99be0', '#e85d5d', '#62a87c', '#f5d7a1', '#4e86c9'];
  const paintMats = PAINT.map(c => new THREE.MeshStandardMaterial({ map: T.plaster4, color: new THREE.Color(c), roughness: 0.92 }));

  // Geometry is collected per material, then merged into a few big meshes.
  const buckets = new Map();
  const add = (mat, geo, cast = true) => { if (!buckets.has(mat)) buckets.set(mat, { cast: [], nocast: [] }); buckets.get(mat)[cast ? 'cast' : 'nocast'].push(geo); };
  // Box with UVs in metres (tile = `tile` metres), random offset so repeats don't line up.
  function boxGeo(w, h, d, tile = 2) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, ou = R(), ov = R();
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile + ou, uv.getY(k) * dims[f][1] / tile + ov); }
    return g;
  }
  function block(mat, x0, y0, z0, x1, y1, z1, { tile = 2, collide = true, cast = true } = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0; if (w <= 0 || h <= 0 || d <= 0) return;
    const g = boxGeo(w, h, d, tile); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); add(mat, g, cast);
    if (collide) solid(x0, y0, z0, x1, y1, z1);
  }

  // ----- instanced details: windows/doors (atlas), water tanks, rebar, AC units, dishes -----
  const winItems = [[], [], [], [], [], []];   // per atlas cell: matrices
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  function placePlane(list, x, y, z, ry, w, h) { _q.setFromEuler(_e.set(0, ry, 0)); list.push(_m.compose(_p.set(x, y, z), _q, _s.set(w, h, 1)).clone()); }
  const tanks = [], rebars = [], acs = [], dishes = [];
  const tagSpots = [];  // [x,y,z,ry,w] free facade spots for graffiti

  // Facades: n = outward normal direction ('s','n','e','w')
  function facade(x0, x1, y0, floors, z, ry, isFront, len) {
    const L = len, n = Math.max(1, Math.floor(L / 2.4));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, y = y0 + f * 3;
      const px = x0 + (x1 - x0) * t, pz = typeof z === 'number' ? z : z(t);
      if (f === 0 && isFront && i === Math.floor(n / 2)) { placePlane(winItems[R() < 0.5 ? 4 : 5], px, y + 1.05, pz, ry, 1.1, 2.1); continue; }
      if (R() < 0.72) placePlane(winItems[Math.floor(R() * 4)], px, y + 1.65, pz, ry, 1.05, 1.25);
      else if (f === 0 && isFront && R() < 0.5) tagSpots.push([px, y + 1.4, pz, ry, Math.min(3.2, L / n * 1.3)]);
    }
  }

  // A house: body + slab + corner pillars + windows + roof clutter. `face` = which side gets doors.
  function house(x0, z0, x1, z1, y0, floors, opts = {}) {
    const h = floors * 3, raw = opts.raw ?? R() < 0.42;
    const mat = raw ? M.brick : pick(paintMats);
    block(mat, x0, y0, z0, x1, y0 + h - 0.15, z1);
    block(M.slab, x0 - 0.12, y0 + h - 0.15, z0 - 0.12, x1 + 0.12, y0 + h + 0.05, z1 + 0.12, { tile: 3 });
    if (raw) for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) block(M.concrete, px - 0.16, y0, pz - 0.16, px + 0.16, y0 + h - 0.1, pz + 0.16, { collide: false });
    if (raw) for (let f = 1; f < floors; f++) block(M.concrete, x0 - 0.05, y0 + f * 3 - 0.2, z0 - 0.05, x1 + 0.05, y0 + f * 3 + 0.05, z1 + 0.05, { collide: false });
    const off = 0.03, top = y0 + h + 0.05;
    facade(x0, x1, y0, floors, z1 + off, 0, opts.face !== 'n', x1 - x0);                // south
    if (!opts.backed) facade(x1, x0, y0, floors, z0 - off, Math.PI, opts.face === 'n', x1 - x0);
    if (opts.sides !== false) { facade(x1 + off, x1 + off, y0, floors, t => z1 + (z0 - z1) * t, Math.PI / 2, opts.face === 'e', z1 - z0); facade(x0 - off, x0 - off, y0, floors, t => z0 + (z1 - z0) * t, -Math.PI / 2, opts.face === 'w', z1 - z0); }
    // Roof clutter (also gives the roofs something to climb around).
    const cx = between(x0 + 1, x1 - 1), cz = between(z0 + 1, z1 - 1);
    if (R() < 0.55 && x1 - x0 > 3) { tanks.push([cx, top, cz]); solid(cx - 0.6, top, cz - 0.6, cx + 0.6, top + 1.15, cz + 0.6); }
    if (R() < 0.5) for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (R() < 0.7) rebars.push([px + (px === x0 ? 0.15 : -0.15), top, pz + (pz === z0 ? 0.15 : -0.15)]);
    if (R() < 0.45) acs.push([between(x0 + 0.6, x1 - 0.6), y0 + between(2, h - 1), z1 + 0.25, 0]);
    if (R() < 0.3) dishes.push([x1 - 0.5, top + 0.4, z1 - 0.5]);
    if (R() < 0.25 && !opts.noLaundry) laundry(x0 + 0.3, z1 - 0.4, x1 - 0.3, z1 - 0.4, top + 1.5);
    return top;
  }

  // ----- laundry and wires (merged line/plane geometry) -----
  const clothGeos = [], wirePts = [];
  const CLOTH = ['#e04848', '#f2f2f2', '#3d7be0', '#f4c430', '#3fae6b', '#e86fae', '#222', '#7f5cd6', '#ff8a3d'];
  function laundry(ax, az, bx, bz, y) {
    wirePts.push(...catenary(ax, y, az, bx, y, bz, 0.25));
    const n = Math.floor(Math.hypot(bx - ax, bz - az) / 0.7);
    for (let i = 0; i < n; i++) {
      if (R() < 0.3) continue;
      const t = (i + 0.5) / n, w = between(0.4, 0.7), hh = between(0.5, 0.9);
      const g = new THREE.PlaneGeometry(w, hh); const c = new THREE.Color(pick(CLOTH));
      g.translate(0, -hh / 2, 0); g.rotateY(Math.atan2(-(bz - az), bx - ax)); g.translate(ax + (bx - ax) * t, y - 0.25 * Math.sin(Math.PI * t), az + (bz - az) * t);
      const cols = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < cols.length; k += 3) { cols[k] = c.r; cols[k + 1] = c.g; cols[k + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); clothGeos.push(g);
    }
  }
  function catenary(ax, ay, az, bx, by, bz, sag) {
    const pts = [], n = 10; let prev = null;
    for (let i = 0; i <= n; i++) { const t = i / n; const p = [ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t]; if (prev) pts.push(...prev, ...p); prev = p; }
    return pts;
  }
  const poles = [];
  function pole(x, y, z) { poles.push([x, y, z]); return [x, y + 7.2, z]; }

  // ================= LAYOUT =================
  // Terraces: L0 y=0 (z -6..44), L1 y=3 (z -22..-6), L2 y=6 (z -38..-22), L3 y=9 (z -60..-38).
  const LV = [{ y: 0, z0: -6, z1: 44 }, { y: 3, z0: -22, z1: -6 }, { y: 6, z0: -38, z1: -22 }, { y: 9, z0: -62, z1: -38 }];
  for (const l of LV) block(M.concrete, -50, -6, l.z0, 50, l.y, l.z1, { tile: 4, cast: false });
  // Road and sidewalk on L0.
  block(M.asphalt, -50, 0, 30, 50, 0.02, 38, { tile: 6, collide: false, cast: false });
  block(M.concrete, -50, 0, 38, 50, 0.16, 40, { tile: 3 }); block(M.concrete, -50, 0, 28, 50, 0.16, 30, { tile: 3 });
  // Edge of the hill (south) with a low wall: the view over Rio.
  block(M.concrete, -50, 0, 43.6, 50, 1.0, 44.2, { tile: 3 });
  block(M.concrete, -50, -60, 44, 50, 0, 60, { collide: false, cast: false });
  // Invisible bounds.
  solid(-52, -10, -70, -50, 40, 60); solid(50, -10, -70, 52, 40, 60); solid(-52, -10, 44.2, 52, 40, 46); solid(-52, -10, -64, 52, 40, -62);

  // Stairs: flight going north (towards -z) from y0 to y1, ending at zEnd (the terrace edge).
  const STEP_COLS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#f2f2f2'].map(c => new THREE.MeshStandardMaterial({ map: T.concrete, color: c, roughness: 0.85 }));
  function stairs(x0, x1, zEnd, y0, y1, rainbow = false) {
    const n = Math.round((y1 - y0) / 0.25), d = 0.42;
    for (let i = 0; i < n; i++) {
      const z1 = zEnd + (n - i) * d, z0 = z1 - d;
      block(rainbow ? STEP_COLS[i % STEP_COLS.length] : M.concrete, x0, y0 - 0.5, z0, x1, y0 + (i + 1) * 0.25, z1, { tile: 1.5 });
    }
    // handrails
    for (const x of [x0 + 0.05, x1 - 0.05]) wirePts.push(x, y0 + 1.0, zEnd + n * d, x, y1 + 1.0, zEnd);
    return { zStart: zEnd + n * d };
  }

  // ---- L0 ----
  // Bar do Zé (west of the plaza, open towards the east).
  const bar = { x0: -25, x1: -17, z0: 19, z1: 27 };
  block(pick(paintMats), bar.x0, 0, bar.z0, bar.x1, 5.85, bar.z0 + 0.3); block(paintMats[1], bar.x0, 0, bar.z1 - 0.3, bar.x1, 5.85, bar.z1);
  block(paintMats[1], bar.x0, 0, bar.z0, bar.x0 + 0.3, 5.85, bar.z1);
  block(paintMats[1], bar.x1 - 0.3, 3, bar.z0, bar.x1, 5.85, bar.z1);                               // upper floor front
  block(M.slab, bar.x0, 2.85, bar.z0, bar.x1, 3.05, bar.z1, { collide: false });
  block(M.slab, bar.x0 - 0.12, 5.85, bar.z0 - 0.12, bar.x1 + 0.12, 6.05, bar.z1 + 0.12, { tile: 3 });
  solid(bar.x0, 2.85, bar.z0, bar.x1, 6.05, bar.z1);
  block(M.wood, -20.6, 0, 20.4, -19.8, 1.1, 25.6);                                                  // counter
  block(M.wood, -20.9, 1.1, 20.2, -19.6, 1.18, 25.8, { collide: false });
  block(M.dark, -24.6, 1.2, 20, -24.3, 2.6, 26, { collide: false });                                // shelves
  for (let i = 0; i < 14; i++) block(pick([M.plastic, M.tank, M.white]), -24.2, 1.3 + (i % 2) * 0.55, 20.3 + i * 0.4, -24.0, 1.62 + (i % 2) * 0.55, 20.5 + i * 0.4, { collide: false });
  facade(bar.x1 + 0.03, bar.x1 + 0.03, 3, 1, t => bar.z1 + (bar.z0 - bar.z1) * t, Math.PI / 2, false, 8);
  const barSign = { x: bar.x1 + 0.05, y: 3.6, z: (bar.z0 + bar.z1) / 2 };
  // Plastic tables outside.
  for (const [tx, tz] of [[-13.5, 22], [-13.5, 25.5]]) {
    block(M.white, tx - 0.45, 0.72, tz - 0.45, tx + 0.45, 0.76, tz + 0.45, { collide: false }); block(M.white, tx - 0.05, 0, tz - 0.05, tx + 0.05, 0.72, tz + 0.05, { collide: false });
    solid(tx - 0.45, 0, tz - 0.45, tx + 0.45, 0.76, tz + 0.45);
    for (const [cx, cz] of [[-0.8, 0], [0.8, 0]]) { block(M.plastic, tx + cx - 0.22, 0.42, tz + cz - 0.22, tx + cx + 0.22, 0.46, tz + cz + 0.22, { collide: false }); block(M.plastic, tx + cx + (cx > 0 ? 0.18 : -0.22), 0.46, tz - 0.22, tx + cx + (cx > 0 ? 0.22 : -0.18), 0.95, tz + 0.22, { collide: false }); }
  }

  // The cage court: x -13..13, z 2..18. Blue walls 1.6 m, fence up to 5 m, gate in the south wall.
  const cage = { x0: -13, x1: 13, z0: 2, z1: 18 };
  const wallH = 1.6, fenceH = 5.2;
  const cw = (x0, z0, x1, z1) => { block(M.blueWall, x0, 0, z0, x1, wallH, z1, { tile: 2 }); solid(x0, wallH, z0, x1, fenceH, z1); };
  cw(cage.x0 - 0.25, cage.z0 - 0.25, cage.x1 + 0.25, cage.z0);           // north
  cw(cage.x0 - 0.25, cage.z1, -1.3, cage.z1 + 0.25); cw(1.3, cage.z1, cage.x1 + 0.25, cage.z1 + 0.25);   // south, gate in the middle
  cw(cage.x0 - 0.25, cage.z0, cage.x0, cage.z1); cw(cage.x1, cage.z0, cage.x1 + 0.25, cage.z1);          // west/east
  // Fence panels (chain-link) above the walls and posts.
  const fenceGeos = [];
  const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(L, fenceH - wallH); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.5, uv.getY(i) * (fenceH - wallH) / 0.5); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, (wallH + fenceH) / 2, (z0 + z1) / 2); fenceGeos.push(g); };
  fence(cage.x0, cage.z0 - 0.1, cage.x1, cage.z0 - 0.1); fence(cage.x0, cage.z1 + 0.1, -1.3, cage.z1 + 0.1); fence(1.3, cage.z1 + 0.1, cage.x1, cage.z1 + 0.1);
  fence(cage.x0 - 0.1, cage.z0, cage.x0 - 0.1, cage.z1); fence(cage.x1 + 0.1, cage.z0, cage.x1 + 0.1, cage.z1);
  { const g = new THREE.PlaneGeometry(2.6, fenceH - 2.4); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5.2, uv.getY(i) * (fenceH - 2.4) / 0.5); g.translate(0, 2.4 + (fenceH - 2.4) / 2, cage.z1 + 0.1); fenceGeos.push(g); solid(-1.3, 2.4, cage.z1, 1.3, fenceH, cage.z1 + 0.25); }
  for (let x = cage.x0; x <= cage.x1 + 0.01; x += 3.25) for (const z of [cage.z0 - 0.1, cage.z1 + 0.1]) block(M.metal, x - 0.05, wallH, z - 0.05, x + 0.05, fenceH + 0.1, z + 0.05, { collide: false });
  for (let z = cage.z0; z <= cage.z1 + 0.01; z += 4) for (const x of [cage.x0 - 0.1, cage.x1 + 0.1]) block(M.metal, x - 0.05, wallH, z - 0.05, x + 0.05, fenceH + 0.1, z + 0.05, { collide: false });
  const fenceMesh = new THREE.Mesh(mergeGeometries(fenceGeos), M.chain); scene.add(fenceMesh);
  // Court floor.
  const court = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), new THREE.MeshStandardMaterial({ map: T.court, roughness: 0.85 }));
  court.rotation.x = -Math.PI / 2; court.position.set(0, 0.015, 10); court.receiveShadow = true; scene.add(court);
  // Goals (futsal, 3 m x 2 m) at both ends.
  const goals = [];
  const netMat = new THREE.MeshStandardMaterial({ map: T.net, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 });
  function goal(x, z, dir, w = 3, h = 2, depth = 1) { // dir: +1 opening towards +x
    const gr = new THREE.Group(), post = new THREE.CylinderGeometry(0.05, 0.05, h, 8), bar = new THREE.CylinderGeometry(0.05, 0.05, w, 8);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(post, M.white); p.position.set(0, h / 2, s * w / 2); p.castShadow = true; gr.add(p); }
    const b = new THREE.Mesh(bar, M.white); b.rotation.x = Math.PI / 2; b.position.y = h; b.castShadow = true; gr.add(b);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), netMat); back.position.set(-depth, h / 2, 0); back.rotation.y = Math.PI / 2; gr.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(depth, w), netMat); top.rotation.x = -Math.PI / 2; top.position.set(-depth / 2, h, 0); gr.add(top);
    for (const s of [-1, 1]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(depth, h), netMat); sd.position.set(-depth / 2, h / 2, s * w / 2); gr.add(sd); }
    gr.position.set(x, 0, z); gr.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(gr);
    goals.push({ x, z, dir, w, h, group: gr });
    return gr;
  }
  goal(cage.x0 + 0.3, 10, 1); goal(cage.x1 - 0.3, 10, -1);
  // Concrete bleachers outside the west wall, where people watch.
  for (let i = 0; i < 3; i++) block(M.concrete, cage.x0 - 1.9 + i * 0.0 - (2 - i) * 0.6, 0, 4, cage.x0 - 0.3, 0.45 * (i + 1), 16, { tile: 2 });
  // Floodlights.
  const lamps = [];
  for (const [lx, lz] of [[cage.x0 - 0.5, cage.z0 - 0.5], [cage.x1 + 0.5, cage.z0 - 0.5], [cage.x0 - 0.5, cage.z1 + 0.5], [cage.x1 + 0.5, cage.z1 + 0.5]]) {
    block(M.metal, lx - 0.08, 0, lz - 0.08, lx + 0.08, 8, lz + 0.08, { collide: false });
    block(M.dark, lx - 0.5, 7.8, lz - 0.2, lx + 0.5, 8.4, lz + 0.2, { collide: false }); lamps.push([lx, 8, lz]);
  }
  const murals = [
    { canvas: null, kind: 'flag', x: 7.5, y: 0.8, z: cage.z1 + 0.27, ry: 0, w: 2.4, h: 1.5 },
    { kind: 'flag', x: cage.x1 - 0.02, y: 0.8, z: 13.5, ry: -Math.PI / 2, w: 2.4, h: 1.5 },
    { kind: 'logo', x: -7, y: 0.8, z: cage.z1 + 0.27, ry: 0, w: 4.2, h: 1.3 },
    { kind: 'logo', x: cage.x1 - 0.02, y: 0.8, z: 6.5, ry: -Math.PI / 2, w: 4.2, h: 1.3 },
    { kind: 'logo', x: 0, y: 0.8, z: cage.z0 + 0.02, ry: 0, w: 4.2, h: 1.3 },
  ];

  // L0 house blocks (west and east of the plaza), with N-S alleys up to the L1 stairs.
  const L0west = [[-49, -36], [-33.6, -27.2], [-24.8, -17]], L0east = [[17, 24.6], [27, 33.6], [36, 49]];
  function fillRow(xs, z0, z1, y0, opts) { for (const [a, b] of xs) { let x = a; while (x < b - 2.5) { const w = Math.min(b - x, between(4.2, 7)); house(x, z0, x + w, z1, y0, opts.floors(), opts); x += w; } } }
  // Back rows (against the L1 wall) and front rows (by the alleys), leaving an E-W lane at z 8..10.4.
  fillRow(L0west, -6, 8, 0, { floors: () => pick([1, 2, 2, 3]), backed: true });
  fillRow([[-49, -36], [-33.6, -27.2]], 10.4, 18.5, 0, { floors: () => pick([1, 2, 2, 3]) });
  fillRow([[-24.8, -17]], 10.4, 17.5, 0, { floors: () => pick([1, 2]) });
  fillRow(L0east, -6, 8, 0, { floors: () => pick([1, 2, 2, 3]), backed: true });
  fillRow(L0east, 10.4, 18.5, 0, { floors: () => pick([1, 2, 2, 3]) });
  fillRow([[-49, -36], [-33.6, -27.2]], 19.5, 27.5, 0, { floors: () => pick([2, 2, 3]) });
  fillRow(L0east, 19.5, 27.5, 0, { floors: () => pick([2, 2, 3]) });
  // Behind the cage, small houses along the L1 wall.
  fillRow([[-15.5, -3], [3, 15.5]], -6, -1.2, 0, { floors: () => 1, backed: true, sides: false });
  // L0 -> L1 stairs in the alleys.
  stairs(-27.1, -24.9, -6 + 0.0, 0, 3); stairs(24.7, 26.9, -6, 0, 3);
  // ---- L1 (y=3) ----  houses z -21..-11 against the L2 wall, lane z -11..-6.
  fillRow([[-49, -30], [-27, -4], [4, 12], [15, 49]], -22, -11.5, 3, { floors: () => pick([1, 1, 2, 2, 3]), backed: true });
  stairs(-3.5, 3.5, -22, 3, 6, true);                    // the rainbow staircase
  // Crates to climb on a roof (shortcut to L2).
  const crates = [];
  const crate = (x, y, z, s = 1.1) => { crates.push([x, y, z, s]); solid(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2); };
  crate(-8, 3, -10.6); crate(-8, 4.1, -10.6, 0.9); crate(-6.8, 3, -10.6);
  // ---- L2 (y=6) ---- houses z -37..-28, lane z -28..-22.
  fillRow([[-49, -20], [-17, 11], [17.6, 49]], -38, -28, 6, { floors: () => pick([1, 2, 2, 3]), backed: true });
  stairs(12.2, 16.2, -38, 6, 9);
  // ---- L3 (y=9) ---- houses against the hill top, lane z -44..-38. The rooftop pitch ("laje") is here.
  const laje = { x0: -6, x1: 10, z0: -56, z1: -44, y: 15.05 };
  fillRow([[-49, -9], [13, 49]], -62, -44.5, 9, { floors: () => pick([1, 2, 3]), backed: true });
  house(laje.x0, laje.z0, laje.x1, laje.z1, 9, 2, { raw: true, noLaundry: true, backed: true });
  // Annex + crates on the east side to climb up.
  house(10, -52, 13.5, -44.5, 9, 1, { raw: false, noLaundry: true, sides: false });
  crate(12, 9, -43.3, 1.2); crate(12, 10.2, -43.3, 0.9);
  // Remove clutter on the laje (we stage it ourselves): drop tanks/rebar on top of it.
  for (const list of [tanks, rebars, dishes]) for (let i = list.length - 1; i >= 0; i--) { const [x, y, z] = list[i]; if (x > laje.x0 - 0.5 && x < laje.x1 + 0.5 && z > laje.z0 - 0.5 && z < laje.z1 + 0.5 && y > 14) list.splice(i, 1); }
  for (let i = colliders.length - 1; i >= 0; i--) { const c = colliders[i]; if (c.y0 > 14.9 && c.y0 < 15.2 && c.x0 > laje.x0 - 0.7 && c.x1 < laje.x1 + 0.7 && c.z0 > laje.z0 - 0.7 && c.z1 < laje.z1 + 0.7) colliders.splice(i, 1); }
  // The kid's wall on the laje: a painted goal on a back wall, a big water tank.
  block(paintMats[2], laje.x0, laje.y, laje.z0, laje.x1, laje.y + 3.2, laje.z0 + 0.3);
  tanks.push([-4.6, laje.y, -54.4]); solid(-5.2, laje.y, -55, -4.0, laje.y + 1.15, -53.8);
  const lajeGoal = { x: 2, z: laje.z0 + 0.32, w: 3, h: 2 };

  // ---- poles and tangled wires along lanes ----
  const tops = [];
  for (const [x, y, z] of [[-30, 0, 9.2], [-20, 0, 9.2], [20, 0, 9.2], [30, 0, 9.2], [-16, 0, 29], [0, 0, 29.2], [16, 0, 29], [-26, 0, 0], [26, 0, 0],
    [-20, 3, -8], [-6, 3, -8], [10, 3, -8], [26, 3, -8], [-14, 6, -24], [4, 6, -24], [22, 6, -24], [-4, 9, -40], [16, 9, -40]]) tops.push(pole(x, y, z));
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
    const a = tops[i], b = tops[j], d = Math.hypot(a[0] - b[0], a[2] - b[2]);
    if (d < 18) for (let k = 0; k < 3; k++) wirePts.push(...catenary(a[0], a[1] - k * 0.3, a[2], b[0], b[1] - k * 0.3 + between(-0.2, 0.2), b[2], 0.4 + R() * 0.8));
  }
  for (const t of tops) for (let k = 0; k < 4; k++) { const ang = R() * 6.28, r = between(4, 9); wirePts.push(...catenary(t[0], t[1] - 0.2, t[2], t[0] + Math.cos(ang) * r, t[1] - between(1.5, 3.5), t[2] + Math.sin(ang) * r, 0.3)); }

  // ================= build meshes =================
  for (const [mat, { cast, nocast }] of buckets) for (const [list, c] of [[cast, true], [nocast, false]]) {
    if (!list.length) continue;
    for (let i = 0; i < list.length; i += 400) { const mesh = new THREE.Mesh(mergeGeometries(list.slice(i, i + 400)), mat); mesh.castShadow = c; mesh.receiveShadow = true; scene.add(mesh); }
  }
  // Windows atlas instances.
  const winMat = new THREE.MeshStandardMaterial({ map: T.win, roughness: 0.4, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
  winItems.forEach((list, i) => {
    if (!list.length) return;
    const g = new THREE.PlaneGeometry(1, 1); const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / 6, i >= 4 ? uv.getY(k) : 40 / 384 + uv.getY(k) * 300 / 384);
    const im = new THREE.InstancedMesh(g, winMat, list.length); list.forEach((m, k) => im.setMatrixAt(k, m)); im.receiveShadow = true; scene.add(im);
  });
  // Water tanks (blue fibreglass), rebar, AC units, dishes, crates, poles.
  const inst = (geo, mat, items, place, shadow = true) => { if (!items.length) return; const im = new THREE.InstancedMesh(geo, mat, items.length); items.forEach((it, k) => { place(it, _p, _q, _s); im.setMatrixAt(k, _m.compose(_p, _q, _s)); }); im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im; };
  const tankGeo = new THREE.CylinderGeometry(0.62, 0.5, 1.0, 20); tankGeo.translate(0, 0.5, 0);
  const lidGeo = new THREE.CylinderGeometry(0.66, 0.66, 0.12, 20); lidGeo.translate(0, 1.06, 0);
  inst(tankGeo, M.tank, tanks, ([x, y, z], p, q, s) => { p.set(x, y, z); q.identity(); s.set(1, 1, 1); });
  inst(lidGeo, M.tank, tanks, ([x, y, z], p, q, s) => { p.set(x, y, z); q.identity(); s.set(1, 1, 1); });
  const rebarGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4); rebarGeo.translate(0, 0.6, 0);
  const rebarGeos = []; for (const [x, y, z] of rebars) for (let k = 0; k < 4; k++) { const g = rebarGeo.clone(); g.rotateZ(between(-0.1, 0.1)); g.translate(x + (k % 2) * 0.12 - 0.06, y, z + (k > 1 ? 0.06 : -0.06)); rebarGeos.push(g); }
  if (rebarGeos.length) scene.add(new THREE.Mesh(mergeGeometries(rebarGeos), new THREE.MeshStandardMaterial({ color: 0x5a3b2a, roughness: 0.7, metalness: 0.4 })));
  const acGeo = new THREE.BoxGeometry(0.8, 0.5, 0.45);
  inst(acGeo, M.white, acs, ([x, y, z], p, q, s) => { p.set(x, y, z); q.identity(); s.set(1, 1, 1); });
  const dishGeo = new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, 0.9); dishGeo.rotateX(-Math.PI / 2 - 0.5);
  inst(dishGeo, M.white, dishes, ([x, y, z], p, q, s) => { p.set(x, y, z); q.setFromEuler(_e.set(0, between(-1, 1), 0)); s.set(1, 1, 1); });
  const crateTex = tex(canvas(256, 256, (g) => { g.fillStyle = '#9b6a3c'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 6); g.strokeStyle = '#5c3b1e'; g.lineWidth = 18; g.strokeRect(9, 9, 238, 238); g.beginPath(); g.moveTo(9, 9); g.lineTo(247, 247); g.stroke(); noise(g, 256, 256, 3000, 0.2); }));
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 }), crates, ([x, y, z, sz], p, q, s) => { p.set(x, y, z); q.identity(); s.set(sz, sz, sz); });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.13, 7.4, 8); poleGeo.translate(0, 3.7, 0);
  inst(poleGeo, new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.9 }), poles, ([x, y, z], p, q, s) => { p.set(x, y, z); q.identity(); s.set(1, 1, 1); });
  for (const [x, y, z] of poles) solid(x - 0.13, y, z - 0.13, x + 0.13, y + 7.4, z + 0.13);
  // Wires and laundry.
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1b1b1b })));
  let cloth = null;
  if (clothGeos.length) { cloth = new THREE.Mesh(mergeGeometries(clothGeos), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 })); cloth.castShadow = true; scene.add(cloth); }

  // ================= graffiti, murals, signs =================
  const decals = [];
  const decal = (canvasOrTex, x, y, z, ry, w, h, extra = {}) => {
    const t = canvasOrTex.isTexture ? canvasOrTex : tex(canvasOrTex, { repeat: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false, ...extra }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); decals.push(m); return m;
  };
  const tagTex = TAGS.map(([t, f]) => tex(tagCanvas(t, { fill: f }), { repeat: false }));
  tagSpots.sort(() => R() - 0.5).slice(0, 34).forEach(([x, y, z, ry, w], i) => decal(tagTex[i % tagTex.length], x, y, z, ry, Math.max(2.2, w), Math.max(2.2, w) * 0.39));
  // Big ones on the cage walls and terrace walls.
  decal(tagTex[0], -3.5, 0.85, cage.z1 + 0.27, 0, 3.2, 1.25); decal(tagTex[1], cage.x0 - 0.27, 0.85, 12, -Math.PI / 2, 3.2, 1.25);
  decal(tagTex[2], cage.x1 + 0.27, 0.85, 10, Math.PI / 2, 2.6, 1.0);
  const flagT = tex(flagCanvas(), { repeat: false });
  for (const mu of murals) {
    if (mu.kind === 'flag') decal(flagT, mu.x, mu.y, mu.z + (mu.ry === 0 ? 0.0 : 0), mu.ry, mu.w, mu.h);
    else {
      // GOUAL ART banner, like the sponsor banners in the photo, with the real brush logo when it loads.
      const c = canvas(1024, 320, (g, w, h) => { g.fillStyle = '#0d1b4d'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f4'; g.font = '900 120px Impact, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GOUAL ART', w / 2, h / 2 - 20); g.font = '700 38px Arial'; g.fillText('ANIMATION STUDIOS', w / 2, h / 2 + 80); });
      const t = tex(c, { repeat: false }); const m = decal(t, mu.x, mu.y, mu.z, mu.ry, mu.w, mu.h);
      if (logoUrl) { const img = new Image(); img.onload = () => { const g = c.getContext('2d'); g.fillStyle = '#0d1b4d'; g.fillRect(0, 0, 1024, 320); const r = Math.min(960 / img.width, 290 / img.height); g.drawImage(img, 512 - img.width * r / 2, 160 - img.height * r / 2, img.width * r, img.height * r); t.needsUpdate = true; }; img.src = logoUrl; }
    }
  }
  // Bar sign.
  decal(canvas(1024, 300, (g, w, h) => { g.fillStyle = '#c62828'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff3c4'; g.font = '900 150px Impact, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAR DO ZÉ', w / 2, h / 2 - 10); g.font = '700 40px Arial'; g.fillText('CERVEJA GELADA · SALGADOS · FUTEBOL NA TV', w / 2, h - 36); noise(g, w, h, 4000, 0.2); }), barSign.x + 0.03, barSign.y, barSign.z, Math.PI / 2, 6, 1.75, { depthWrite: true });

  // Mission arrows (glowing yellow tags), returned so the game can light them up one by one.
  const arrowTex = tex(tagCanvas('FANTASMA', { fill: ['#fff200', '#ffb300'], outline: '#1a1a1a', shadow: '#000', arrow: 1, glow: 1 }), { repeat: false });
  const arrowAt = (x, y, z, ry, flip = false) => { const m = decal(arrowTex, x, y, z, ry, 3.2, 1.25, { emissive: new THREE.Color(0xffd000), emissiveMap: arrowTex, emissiveIntensity: 0.25 }); if (flip) m.scale.x = -1; return m; };

  return { colliders, decals, goals, lamps, bar, cage, laje, lajeGoal, LV, arrowAt, cloth, M, paintMats, tagCanvas, tex };
}

// ---------- the bay of Rio, far away ----------
export function buildBackdrop(scene, sunDir) {
  // Sky dome with a warm late-afternoon gradient and a sun glow.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize((modelMatrix*vec4(position,1.)).xyz - cameraPosition); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 sun; varying vec3 vd;
      void main(){ float h = clamp(vd.y, -0.2, 1.0);
        vec3 top = vec3(0.16,0.36,0.72), mid = vec3(0.55,0.72,0.92), hor = vec3(1.0,0.78,0.58);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.15, 0.7, h));
        float s = max(dot(normalize(vd), sun), 0.0);
        c += vec3(1.0,0.75,0.45) * pow(s, 8.0) * 0.55 + vec3(1.0,0.9,0.7) * pow(s, 600.0) * 4.0;
        if (vd.y < 0.0) c = mix(c, vec3(0.62,0.62,0.62), smoothstep(0.0,-0.15,vd.y));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), skyMat); scene.add(sky);
  // Sea.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: 0x2d6f97, roughness: 0.18, metalness: 0.35 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -60, 0); scene.add(sea);
  const rock = new THREE.MeshStandardMaterial({ color: 0x5f6b55, roughness: 1, flatShading: false });
  const green = new THREE.MeshStandardMaterial({ color: 0x4b6b3c, roughness: 1 });
  // Sugarloaf: a bulbous granite dome, and its little brother.
  const lathe = (h, r) => { const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector2(r * Math.pow(Math.sin(Math.PI * (1 - t) * 0.5 + 0.0001), 0.55) * (1 + 0.15 * Math.sin(t * 3)), t * h)); } return new THREE.LatheGeometry(pts, 40); };
  const sl = new THREE.Mesh(lathe(390, 150), rock); sl.position.set(620, -60, 1250); sl.rotation.z = 0.06; scene.add(sl);
  const sl2 = new THREE.Mesh(lathe(220, 140), rock); sl2.position.set(380, -60, 1180); scene.add(sl2);
  // Corcovado with the statue on top.
  const cor = new THREE.Mesh(lathe(720, 380), green); cor.scale.z = 0.7; cor.position.set(-1150, -60, -150); scene.add(cor);
  const st = new THREE.Group(), sm = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, 34, 10), sm); body.position.y = 17; st.add(body);
  const arms = new THREE.Mesh(new THREE.BoxGeometry(56, 4.5, 5), sm); arms.position.y = 30; st.add(arms);
  const head = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), sm); head.position.y = 36.5; st.add(head);
  st.position.set(-1150, 660, -150); st.rotation.y = 0.9; scene.add(st);
  // Other hills around, covered with favela houses (instanced tiny boxes).
  const hills = [[-420, -60, -380, 340, 180], [380, -60, -420, 380, 210], [-650, -60, 300, 300, 150], [650, -60, 200, 280, 140], [0, -60, -700, 520, 260], [160, -60, -190, 160, 72]];
  const boxes = []; const cols = ['#e88aa8', '#f1c84b', '#5fc4c0', '#7fb0e0', '#f2efe6', '#f08a4b', '#b5643c', '#c0704a', '#a65a3a', '#d9d2c2'].map(c => new THREE.Color(c));
  const RR = rng(99);
  for (const [x, y, z, r, h] of hills) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), green); m.scale.set(r, h, r * 0.8); m.position.set(x, y, z); scene.add(m);
    for (let i = 0; i < 900; i++) {
      const a = RR() * Math.PI * 2, d = Math.sqrt(RR()) * 0.92;
      const px = x + Math.cos(a) * d * r, pz = z + Math.sin(a) * d * r * 0.8;
      const py = y + h * Math.sqrt(Math.max(0, 1 - d * d));
      if (py < -45 || d > 0.85 && RR() < 0.5) continue;
      boxes.push([px, py, pz, 4 + RR() * 6, 3 + RR() * 6, 4 + RR() * 5, cols[Math.floor(RR() * cols.length)]]);
    }
  }
  // The slope under our hill and the city below, towards the sea.
  for (let i = 0; i < 1400; i++) {
    const px = (RR() - 0.5) * 600, pz = 52 + RR() * 260, py = Math.max(-60, -(pz - 44) * 0.235) - 1.5;
    boxes.push([px, py, pz, 4 + RR() * 6, 3 + RR() * 7, 4 + RR() * 6, cols[Math.floor(RR() * cols.length)]]);
  }
  for (let i = 0; i < 260; i++) { const px = (RR() - 0.5) * 1400, pz = 340 + RR() * 300; boxes.push([px, -60, pz, 14 + RR() * 16, 30 + RR() * 70, 14 + RR() * 14, new THREE.Color(RR() < 0.7 ? '#e9e5dc' : '#c9d4dc')]); }
  // North behind our favela: more houses climbing.
  for (let i = 0; i < 700; i++) { const px = (RR() - 0.5) * 240, pz = -66 - RR() * 160, py = 9 + (-66 - pz) * 0.32 + RR(); boxes.push([px, py - 2, pz, 4 + RR() * 5, 3 + RR() * 6, 4 + RR() * 5, cols[Math.floor(RR() * cols.length)]]); }
  for (let i = 0; i < 500; i++) { const side = RR() < 0.5 ? -1 : 1, px = side * (55 + RR() * 140), pz = -60 + RR() * 110, py = -10 + RR() * 18 - (Math.abs(px) - 55) * 0.25; boxes.push([px, py, pz, 4 + RR() * 5, 3 + RR() * 6, 4 + RR() * 5, cols[Math.floor(RR() * cols.length)]]); }
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  // Facade texture for the far houses: light walls with rows of dark windows (tinted per house).
  const fc = document.createElement('canvas'); fc.width = fc.height = 128; const fg = fc.getContext('2d');
  fg.fillStyle = '#f0ede6'; fg.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) { if (RR() < 0.15) continue; fg.fillStyle = RR() < 0.5 ? '#2a2e33' : '#3f4a55'; fg.fillRect(10 + x * 40, 8 + y * 31, 20, 15); }
  fg.fillStyle = 'rgba(0,0,0,0.25)'; fg.fillRect(0, 120, 128, 8);
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace; ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) if (i >= 8 && i < 16) uv.setXY(i, 0.02, 0.98);   // roofs: plain
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, map: ft }), boxes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  boxes.forEach(([x, y, z, w, h, d, c], i) => { q.setFromEuler(e.set(0, RR() * 0.6 - 0.3, 0)); im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d))); im.setColorAt(i, c); });
  scene.add(im);
  // Ground under the near slopes (so nothing floats).
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), green); slope.rotation.x = -Math.PI / 2 + 0.235; slope.position.set(0, -31, 172); scene.add(slope);
  for (const side of [-1, 1]) { const s2 = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), green); s2.rotation.x = -Math.PI / 2; s2.rotation.y = 0; s2.rotation.z = side * 0.0; s2.position.set(side * 180, -12, -20); scene.add(s2); }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(500, 300), green); back.rotation.x = -Math.PI / 2 + 0.31; back.position.set(0, 53, -200); scene.add(back);
  return { sky };
}
