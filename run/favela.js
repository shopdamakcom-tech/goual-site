// FAVELA world for the Ballon d'Or run, in a soft "animated movie" look.
// Everything visible is built from the painted art in art/favela/: a sky shader with the Rio panorama,
// a horizon band, cloud cards, house fronts on rounded blocks climbing the hill, a graffiti wall,
// shop signs, grass tufts, palms, poles and sagging electric wires.
import * as THREE from 'three';
import { Builder, kitMaterials, house, fusca, kombi, dog, clutter, laundry, roundedBox as rb } from './favela-kit.js';

const V3 = THREE.Vector3;
const ART = new URL('./art/favela/', import.meta.url).href;
export const LANES = [-2.6, 0, 2.6];
export const ROAD_W = 4.3;       // half width of the street
export const WALK_W = 2.5;       // pavement on each side
const FRONT = ROAD_W + WALK_W + 0.1;

// seeded random so a segment always looks the same
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export async function loadFavela(renderer) {
  const tl = new THREE.TextureLoader();
  const get = (n, srgb = true) => new Promise(res => tl.load(ART + n, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t); }));
  const meta = await (await fetch(ART + 'meta.json')).json();
  const names = ['plate', 'band', 'clouds', 'tufts', 'signs', 'road', 'sidewalk', 'dirt', 'dirt2', 'wall', 'facade-1', 'facade-2', 'facade-3', 'facade-4', 'facade-5'];
  const T = Object.fromEntries(await Promise.all(names.map(async n => [n, await get(n + '.webp')])));
  for (const n of ['road', 'sidewalk', 'dirt', 'dirt2', 'wall']) T[n].wrapS = T[n].wrapT = THREE.RepeatWrapping;
  return { T, meta };
}

// ---------------- the sky: gradient + painted panorama + horizon band ----------------
export function makeSky(T, meta) {
  const top = new THREE.Color().setRGB(...meta.plateTop.map(v => v / 255), THREE.SRGBColorSpace);
  const u = {
    zenith: { value: new THREE.Color('#2f7fe0') }, plateTopCol: { value: top }, haze: { value: new THREE.Color('#cfe3ec') },
    plate: { value: T.plate }, band: { value: T.band }, sunDir: { value: new V3(-0.75, 0.32, -0.6).normalize() }, sunCol: { value: new THREE.Color('#ffd9a0') },
    plateLow: { value: -0.09 }, plateHigh: { value: 0.3 }, bandLow: { value: -0.04 }, bandHigh: { value: 0.16 }, turn: { value: 0.625 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 zenith, plateTopCol, haze, sunDir, sunCol; uniform sampler2D plate, band;
      uniform float plateLow, plateHigh, bandLow, bandHigh, turn; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float e = d.y, az = atan(d.x, d.z);
        // above the panorama: its own sky colour fading to a deeper blue overhead
        vec3 c = mix(plateTopCol, zenith, smoothstep(plateHigh - 0.05, 0.95, e));
        // azimuth -> u, the panorama's original half faces down the street
        float u = -az / 6.2831853 + turn; float du = fwidth(u); du = min(du, 1.0 - du);
        vec2 gx = vec2(-dFdx(az) / 6.2831853, dFdx(e)), gy = vec2(-dFdy(az) / 6.2831853, dFdy(e));
        gx.x -= floor(gx.x + 0.5); gy.x -= floor(gy.x + 0.5);
        float pv = (e - plateLow) / (plateHigh - plateLow);
        if (pv < 1.08) {
          vec3 p = textureGrad(plate, vec2(fract(u * 2.0), clamp(pv, 0.0, 1.0)), gx * vec2(2.0, 1.0 / (plateHigh - plateLow)), gy * vec2(2.0, 1.0 / (plateHigh - plateLow))).rgb;
          c = mix(c, p, 1.0 - smoothstep(0.93, 1.06, pv));
        }
        float bv = (e - bandLow) / (bandHigh - bandLow);
        if (bv > 0.0 && bv < 1.0) {
          vec4 b = textureGrad(band, vec2(fract(u * 4.0), bv), gx * vec2(4.0, 1.0 / (bandHigh - bandLow)), gy * vec2(4.0, 1.0 / (bandHigh - bandLow)));
          c = mix(c, mix(b.rgb, haze, 0.18), b.a);
        }
        // haze sits on the horizon, a warm glow around the sun
        c = mix(c, haze, (1.0 - smoothstep(-0.02, 0.09, e)) * 0.55);
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.35);
        c = mix(c, haze, smoothstep(-0.02, -0.2, e));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  sky.frustumCulled = false; sky.renderOrder = -1; sky.scale.setScalar(800);
  return sky;
}

// Cloud cards drifting in front of the panorama (parallax with the painted ones).
export function makeClouds(T, meta, n = 16) {
  const g = new THREE.Group(), R = rng(3), [cols, rows] = meta.clouds.grid;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(R() * cols * rows), t = T.clouds.clone(); t.needsUpdate = true;
    t.repeat.set(1 / cols, 1 / rows); t.offset.set((k % cols) / cols, 1 - (Math.floor(k / cols) + 1) / rows);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true, color: new THREE.Color().setHSL(0.58, 0.4, 0.93 + R() * 0.07) }));
    // around the horizon but out of the street's vanishing point, high enough to sit above the panorama
    const side = i % 2 ? 1 : -1, a = -Math.PI / 2 + side * (0.45 + R() * 1.1), r = 420 + R() * 220, s = 60 + R() * 70;
    m.position.set(Math.cos(a) * r, r * (0.36 + R() * 0.3), Math.sin(a) * r); m.scale.set(s * 1.6, s, 1);
    g.add(m);
  }
  return g;
}

// ---------------- materials ----------------
function mats(T, meta) {
  const M = {};
  const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
  M.road = new THREE.MeshStandardMaterial({ map: rep(T.road, 1, 1), color: '#efe6da', roughness: 0.95 });
  M.walk = new THREE.MeshStandardMaterial({ map: rep(T.sidewalk, 1, 1), roughness: 0.9 });
  M.curb = new THREE.MeshStandardMaterial({ color: '#d9cdbd', roughness: 0.9 });
  M.dirt = new THREE.MeshStandardMaterial({ map: rep(T.dirt, 1, 1), roughness: 1 });
  M.wall = new THREE.MeshStandardMaterial({ map: rep(T.wall, 1, 1), roughness: 0.9 });
  M.cap = new THREE.MeshStandardMaterial({ color: '#cfc3b2', roughness: 0.9 });
  M.facade = meta.facades.map((f, i) => new THREE.MeshStandardMaterial({ map: T['facade-' + (i + 1)], alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }));
  M.side = meta.facades.map(f => new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...f.side.map(v => v / 255), THREE.SRGBColorSpace).multiplyScalar(0.92), roughness: 0.9 }));
  M.roof = new THREE.MeshStandardMaterial({ color: '#b9ab97', roughness: 0.95 });
  M.pole = new THREE.MeshStandardMaterial({ color: '#8a7d6c', roughness: 0.9 });
  M.wire = new THREE.MeshStandardMaterial({ color: '#242226', roughness: 0.6 });
  // painted cards (tufts, signs): flat lit like the ground they sit on
  const card = (t, cols, rows, k) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(1 / cols, 1 / rows); c.offset.set((k % cols) / cols, 1 - (Math.floor(k / cols) + 1) / rows); return c; };
  M.tufts = Array.from({ length: 8 }, (_, k) => new THREE.MeshStandardMaterial({ map: card(T.tufts, 4, 2, k), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
  M.signs = Array.from({ length: 6 }, (_, k) => new THREE.MeshStandardMaterial({ map: card(T.signs, 3, 2, k), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }));
  M.trunk = new THREE.MeshStandardMaterial({ color: '#8f6b4a', roughness: 1 });
  M.leaf = new THREE.MeshStandardMaterial({ color: '#4fa13a', roughness: 0.8, side: THREE.DoubleSide });
  return M;
}

// Box with softly rounded edges (the "animated movie" block shape).
function roundedBox(w, h, d, r = 0.25, seg = 3) {
  const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); s.lineTo(w / 2, y); s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  s.lineTo(-x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y); s.lineTo(-w / 2, -y); s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: seg, curveSegments: seg });
  g.translate(0, 0, -(d - 2 * r) / 2); return g;
}
const upNormals = g => { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return g; };

// ---------------- the world, built in segments along -z ----------------
export function makeFavela(scene, T, meta, { seg = 48 } = {}) {
  const M = mats(T, meta), K = kitMaterials();
  let court = null;   // { z0, z1 } of the football cage in the current segment: the hill steps back there
  const hillR = (x, z = 1e9) => {
    const h = Math.max(0, x - FRONT - 4) * 0.42;
    if (!court) return h;
    const k = THREE.MathUtils.smoothstep(Math.min(z - court.z1, court.z0 - z), -4, 2);     // 1 inside the court range
    return THREE.MathUtils.lerp(h, Math.max(0, x - FRONT - 19) * 0.42, k);
  };
  const hillL = x => -Math.max(0, -x - FRONT - 2) * 0.8;          // left side drops toward the view
  const tuftGeo = upNormals(new THREE.PlaneGeometry(1, 0.85).translate(0, 0.42, 0));
  const signGeo = new THREE.PlaneGeometry(1, 0.83);
  const stepGeo = roundedBox(1, 1, 1, 0.04, 1);

  function tuft(b, R, x, y, z, s = 1) { const k = (0.8 + R() * 0.9) * s; b.add(tuftGeo, M.tufts[Math.floor(R() * 8)], x, y - 0.05, z, 0, (R() - 0.5) * 0.8, 0, k * 1.2, k, k); }
  function palm(b, R, x, y, z) {
    const h = 7 + R() * 4, lean = (R() - 0.5) * 0.5, pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new V3(x + Math.sin(t * 1.3) * lean * h * 0.4, y + t * h, z)); }
    const curve = new THREE.CatmullRomCurve3(pts); b.add(new THREE.TubeGeometry(curve, 14, 0.24, 7), M.trunk);
    const top = curve.getPoint(1);
    for (let i = 0; i < 10; i++) {
      const L = 3.4 + R() * 1.4, geo = new THREE.PlaneGeometry(1.2, L, 1, 8), p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const v = Math.max(0, (p.getY(k) + L / 2) / L); p.setY(k, v * L); p.setZ(k, -Math.pow(v, 1.7) * L * 0.6); p.setX(k, p.getX(k) * Math.sin(Math.min(1, v * 1.15) * Math.PI) * 0.9); }
      geo.computeVertexNormals(); geo.rotateX(-(0.85 + R() * 0.4)); geo.rotateY((i / 10) * Math.PI * 2);
      b.add(geo, M.leaf, top.x, top.y, top.z);
    }
  }
  function wire(b, a, c, sag = 0.9, r = 0.018) {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, p = a.clone().lerp(c, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, r, 4), M.wire);
  }
  // concrete steps climbing an alley from the pavement (side = +1 right / -1 left)
  function stairs(b, R, x0, z, side, width, hill) {
    for (let k = 0; k < 18; k++) {
      const x = side * (x0 + k * 0.55), y = hill(x) + 0.16;
      if (side > 0) { const h = Math.max(0.3, y + 0.3); b.add(stepGeo, K.concrete, x, h / 2 - 0.15, z, 0, 0, 0, 0.6, h, width); }
      else b.add(stepGeo, K.concrete, x, y - 0.25, z, 0, 0, 0, 0.6, 0.6, width);
    }
  }


  // one row of houses along the street; returns alley positions
  function row(b, R, side, x, z0, z1, hill, opts = {}) {
    let z = z0 - R() * 2; const alleys = [];
    while (z > z1 + 2) {
      const setback = opts.setback ? R() * opts.setback : 0, hx = side * (x + setback);
      b.push(new V3(hx, 0, 0), 0);
      const yb = hill(hx, z - 3), face = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const w = 4.6 + R() * 2.8, d = 5 + R() * 2;
      const cz = z - w / 2;
      b.pop();
      if (opts.skip && opts.skip(z, z - w)) { z -= 1; continue; }
      b.push(new V3(hx, yb, cz), face);
      const h = house(b, K, R, { w, d, floors: opts.floors ? opts.floors(R) : 1 + Math.floor(R() * 2.7) });
      // foundation down the slope
      if (opts.found) b.add(roundedBox(w, 8, d, 0.1), K.concrete, 0, -4, -d / 2);
      if (opts.sign && R() < 0.3) b.add(signGeo, M.signs[Math.floor(R() * 6)], (R() - 0.5) * w * 0.4, 2.55, 0.2, 0, 0, 0, 1.2, 1.2, 1);
      b.pop();
      z -= w + 0.25 + R() * 0.6;
      if (opts.alleys && R() < 0.28) { const aw = 1.8 + R() * 1.4; alleys.push({ z: z - aw / 2, w: aw, top: h.top }); z -= aw; }
    }
    return alleys;
  }

  // a small square with a caged football court (concrete pitch, chain-link fence, goals, benches, a mural)
  const pitchTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const g = c.getContext('2d');
    g.fillStyle = '#3f8f5a'; g.fillRect(0, 0, 512, 1024); g.fillStyle = '#c0533a'; g.fillRect(0, 0, 512, 40); g.fillRect(0, 984, 512, 40); g.fillRect(0, 0, 40, 1024); g.fillRect(472, 0, 40, 1024);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, Math.random() * 1024, 3, 3); }
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 8; g.strokeRect(60, 60, 392, 904); g.beginPath(); g.moveTo(60, 512); g.lineTo(452, 512); g.stroke();
    g.beginPath(); g.arc(256, 512, 80, 0, 7); g.stroke(); g.strokeRect(156, 60, 200, 130); g.strokeRect(156, 834, 200, 130);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const meshTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.strokeStyle = '#d6dadf'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const pitchMat = new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.9 });
  const fenceMat = new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5, color: '#e8edf2' });
  function footballCage(b, R, c) {
    const x0 = FRONT + 0.6, x1 = FRONT + 16.5, za = c.z0, zb = c.z1, cx = (x0 + x1) / 2, cz = (za + zb) / 2, W = x1 - x0, L = za - zb;
    const Y = 0.42; b.add(roundedBox(W + 2, 0.8, L + 2, 0.08), K.concrete, cx, Y - 0.4, cz);                       // the square
    b.add(new THREE.PlaneGeometry(W - 1, L - 1).rotateX(-Math.PI / 2), pitchMat, cx, Y + 0.1, cz);
    const H = 4.2;
    // retaining wall behind, with the mural
    const back = new THREE.BoxGeometry(0.5, 4, L + 2); const uv = back.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (L + 2) / 6);
    b.add(back, M.wall, x1 + 1.2, 2, cz);
    // fence: posts and chain-link panels on 3 sides (the street side has a gate gap)
    const panel = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), g = new THREE.PlaneGeometry(len, H); const u = g.attributes.uv; for (let k = 0; k < u.count; k++) u.setXY(k, u.getX(k) * len / 0.35, u.getY(k) * H / 0.35);
      b.add(g, fenceMat, (ax + bx) / 2, H / 2 + Y, (az + bz) / 2, 0, Math.atan2(bx - ax, bz - az) + Math.PI / 2); };
    for (const [ax, az, bx, bz] of [[x0, za, x1, za], [x0, zb, x1, zb], [x1, za, x1, zb], [x0, za, x0, cz + 2.5], [x0, cz - 2.5, x0, zb]]) {
      panel(ax, az, bx, bz); const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
      for (let k = 0; k <= n; k++) { const t = k / n; b.add(G1c, M.pole, ax + (bx - ax) * t, H / 2 + Y, az + (bz - az) * t - 0, 0, 0, 0, 0.07, H, 0.07); }
      b.add(G1c, M.pole, (ax + bx) / 2, H + Y, (az + bz) / 2, 0, Math.atan2(bx - ax, bz - az), Math.PI / 2, 0.05, Math.hypot(bx - ax, bz - az), 0.05);
    }
    // goals at both ends
    for (const [gz, dir] of [[za - 1.2, -1], [zb + 1.2, 1]]) {
      for (const sx of [-1, 1]) b.add(G1c, K.chrome, cx + sx * 1.6, Y + 1.1, gz, 0, 0, 0, 0.07, 2.2, 0.07);
      b.add(G1c, K.chrome, cx, Y + 2.2, gz, 0, 0, Math.PI / 2, 0.07, 3.3, 0.07);
      const net = new THREE.PlaneGeometry(3.2, 2.2); const u = net.attributes.uv; for (let k = 0; k < u.count; k++) u.setXY(k, u.getX(k) * 14, u.getY(k) * 10);
      b.add(net, fenceMat, cx, Y + 1.1, gz - dir * 0.8, -dir * 0.35);
    }
    // benches, a ball, some kids' things
    for (let k = 0; k < 2; k++) b.add(roundedBox(2.2, 0.12, 0.5, 0.04), M.trunk, x1 - 0.2, Y + 0.5, cz + (k ? 5 : -5)), b.add(roundedBox(1.9, 0.5, 0.35, 0.04), K.concrete, x1 - 0.2, Y + 0.24, cz + (k ? 5 : -5));
    for (let k = 0; k < 10; k++) tuft(b, R, x0 + R() * W, Y, za + 0.3, 0.9);
    b.add(G1s, K.plastic[1], cx + 2, Y + 0.18, cz - 3, 0, 0, 0, 0.18, 0.18, 0.18);
  }
  function segment(index, opts = {}) {
    const grp = new THREE.Group(), R = rng(index * 7 + 11), z0 = -index * seg, z1 = z0 - seg, b = new Builder();
    court = opts.court ? { z0: z0 - 8, z1: z0 - 34 } : null;
    // street, pavements, curbs
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W * 2, seg), M.road); road.material.map.repeat.set(1.2, seg / 7);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, z0 - seg / 2); road.receiveShadow = true; grp.add(road);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(WALK_W, seg), M.walk); M.walk.map.repeat.set(1, seg / WALK_W);
      w.rotation.x = -Math.PI / 2; w.position.set(s * (ROAD_W + WALK_W / 2), 0.16, z0 - seg / 2); w.receiveShadow = true; grp.add(w);
      b.add(roundedBox(0.3, 0.2, seg, 0.06, 2), M.curb, s * (ROAD_W + 0.1), 0.06, z0 - seg / 2);
    }
    // ground: right hill, left slope, red earth
    for (const s of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(90, seg, 45, 16); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const x = s * (FRONT + 45) + p.getX(k), wz = p.getZ(k) + z0 - seg / 2; p.setY(k, (s > 0 ? hillR(x, wz) : hillL(x)) + 0.14 + Math.sin(x * 0.4 + p.getZ(k) * 0.3) * 0.15 * Math.min(1, Math.abs(Math.abs(x) - FRONT))); p.setX(k, x); p.setZ(k, p.getZ(k) + z0 - seg / 2); }
      geo.computeVertexNormals(); const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 9, p.getZ(k) / 9);
      const m = new THREE.Mesh(geo, M.dirt); m.receiveShadow = true; grp.add(m);
    }
    // RIGHT: a front row with setbacks and alleys, then rows climbing the hill behind
    const inCourt = (za, zb) => court && za > court.z1 - 1 && zb < court.z0 + 1;
    const alleys = row(b, R, 1, FRONT + 0.1, z0, z1, hillR, { setback: 1.6, alleys: true, sign: true, skip: inCourt });
    if (court) footballCage(b, R, court);
    for (const a of alleys) {
      stairs(b, R, FRONT + 0.4, a.z, 1, a.w * 0.8, x => hillR(x, a.z));
      laundry(b, K, R, new V3(FRONT + 2.5, 5.2, a.z + a.w / 2 + 0.1), new V3(FRONT + 2.8, 5.0, a.z - a.w / 2 - 0.1));
      for (let k = 0; k < 4; k++) tuft(b, R, FRONT + 0.5 + R() * 2, hillR(FRONT + 1, a.z) + 0.2, a.z + (R() - 0.5) * a.w, 0.8);
    }
    for (let r = 1; r < 5; r++) row(b, R, 1, FRONT + 1.5 + r * 8.2 + R() * 2, z0 - r * 1.7, z1, hillR, { setback: 3, floors: R => 1 + Math.floor(R() * 3), skip: r < 2 ? inCourt : null });
    // LEFT: graffiti wall with gaps, houses stepping down the slope (rooftops below the street)
    const wallH = 1.7; let wz = z0;
    while (wz > z1) {
      const len = Math.min(wz - z1, 9 + R() * 12);
      const wm = new THREE.BoxGeometry(0.36, wallH, len); const uv = wm.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len / (wallH * 3));
      b.add(wm, M.wall, -FRONT + 0.2, wallH / 2 + 0.16, wz - len / 2); b.add(roundedBox(0.5, 0.14, len, 0.05, 2), M.cap, -FRONT + 0.2, wallH + 0.2, wz - len / 2);
      for (let k = 0; k < len / 2; k++) tuft(b, R, -FRONT + 0.75 + R() * 0.3, 0.16, wz - R() * len, 0.9);
      wz -= len;
      if (wz > z1 + 4 && R() < 0.5) { const gw = 2.2 + R(); stairs(b, R, FRONT - 0.2, wz - gw / 2, -1, gw * 0.85, hillL); wz -= gw; }
    }
    for (let r = 0; r < 4; r++) row(b, R, -1, FRONT + 3 + r * 7.5 + R() * 2, z0 - r * 2.1, z1, hillL, { setback: 2.5, found: true });
    // poles every 16 m with wires along both pavements and across the street
    const poles = [];
    for (let z = z0 - 6; z > z1; z -= 16) for (const s of [-1, 1]) {
      const x = s * (ROAD_W + 0.55), h = 7.2 + R() * 0.6, pz = z + (s > 0 ? 0 : -3);
      b.add(new THREE.CylinderGeometry(0.11, 0.15, h, 8), M.pole, x, h / 2 + 0.16, pz); b.add(G1, M.pole, x, h - 0.4, pz, 0, 0, 0, 1.2, 0.1, 0.1);
      poles.push({ s, top: new V3(x, h - 0.3, pz) });
    }
    for (const s of [-1, 1]) { const ps = poles.filter(p => p.s === s); for (let i = 0; i < ps.length - 1; i++) for (let k = 0; k < 3; k++) wire(b, ps[i].top.clone().add(new V3((k - 1) * 0.45, -k * 0.12, 0)), ps[i + 1].top.clone().add(new V3((k - 1) * 0.45, -k * 0.12, 0)), 0.7 + k * 0.25); }
    const L = poles.filter(p => p.s < 0), Rr = poles.filter(p => p.s > 0);
    for (let i = 0; i < Math.min(L.length, Rr.length); i++) { wire(b, L[i].top, Rr[i].top.clone().add(new V3(0, -0.2, 0)), 1.1); if (R() < 0.6) wire(b, L[i].top.clone().add(new V3(0, -0.4, 0)), Rr[i].top.clone().add(new V3(0, -0.5, -2)), 1.5); }
    for (const p of Rr) for (let k = 0; k < 2; k++) wire(b, p.top, new V3(FRONT + 0.3, 5.4 + R(), p.top.z - 3 + R() * 6), 0.4, 0.015);
    // laundry high across the street now and then
    if (R() < 0.6) { const z = z0 - 8 - R() * 30; laundry(b, K, R, new V3(-FRONT + 0.3, 5.6, z), new V3(FRONT + 0.2, 5.9, z - 1)); }
    // dogs and clutter by the doors
    if (index === 0) { b.push(new V3(ROAD_W + 1.3, 0.16, -13), -0.6); dog(b, K, R, 'stand'); b.pop(); b.push(new V3(-ROAD_W - 1.2, 0.16, -20), 2.2); dog(b, K, R, 'lie'); b.pop(); }
    for (let i = 0; i < 3; i++) { const s = R() < 0.6 ? 1 : -1; b.push(new V3(s * (ROAD_W + 1.2 + R() * 1.0), 0.16, z0 - R() * seg), R() * 6.28); dog(b, K, R); b.pop(); }
    for (let i = 0; i < 6; i++) { const kind = ['bags', 'gas', 'chairs', 'crates', 'bags', 'gas'][i], z = z0 - R() * seg; if (inCourt(z + 1, z - 1)) continue; b.push(new V3(FRONT - 0.8 - R() * 0.6, 0.16, z), R() * 6.28); clutter(b, K, R, kind); b.pop(); }
    // greenery
    for (let i = 0; i < 30; i++) tuft(b, R, FRONT - 0.2 + R() * 0.4, 0.16, z0 - R() * seg, 0.9);
    for (let i = 0; i < 40; i++) { const x = FRONT + 4 + R() * 34, z = z0 - R() * seg; tuft(b, R, x, hillR(x, z) + 0.14, z, 1.4); }
    for (let i = 0; i < 3; i++) { const x = FRONT + 6 + R() * 22, z = z0 - R() * seg; if (inCourt(z + 1, z - 1) && x < FRONT + 20) continue; palm(b, R, x, hillR(x, z), z); }
    for (let i = 0; i < 4; i++) { const x = -FRONT - 3 - R() * 22; palm(b, R, x, hillL(x), z0 - R() * seg); }
    b.build(grp); scene.add(grp); return grp;
  }
  return { segment, M, K };
}
const G1 = new THREE.BoxGeometry(1, 1, 1), G1c = new THREE.CylinderGeometry(1, 1, 1, 8), G1s = new THREE.SphereGeometry(1, 16, 12);


// ---------------- the Ballon d'Or (made in code: golden football on a small stand) ----------------
export function makeBallonDor(envMap) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#d9a83a'; g.fillRect(0, 0, 1024, 512);
  // football panel seams on the gold
  g.strokeStyle = '#8a5a12'; g.lineWidth = 5;
  for (let r = 0; r < 6; r++) for (let k = 0; k < 10; k++) {
    const cx = (k + (r % 2) * 0.5) * 102.4, cy = 40 + r * 86, R = 34;
    g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; g.lineTo(cx + Math.cos(a) * R * 1.45, cy + Math.sin(a) * R); } g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const gold = new THREE.MeshStandardMaterial({ color: '#ffe3a0', map: t, metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.8 });
  const goldPlain = new THREE.MeshStandardMaterial({ color: '#f2c45a', metalness: 1, roughness: 0.25, envMap, envMapIntensity: 1.8 });
  const grp = new THREE.Group();
  const prof = [[0, 0], [0.085, 0], [0.09, 0.03], [0.06, 0.05], [0.035, 0.1], [0.03, 0.16], [0.05, 0.19], [0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
  const stand = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), goldPlain); grp.add(stand);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), gold); ball.position.y = 0.36; grp.add(ball);
  grp.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return grp;
}
