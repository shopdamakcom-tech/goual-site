// FAVELA world for the Ballon d'Or run, in a soft "animated movie" look.
// Everything visible is built from the painted art in art/favela/: a sky shader with the Rio panorama,
// a horizon band, cloud cards, house fronts on rounded blocks climbing the hill, a graffiti wall,
// shop signs, grass tufts, palms, poles and sagging electric wires.
import * as THREE from 'three';

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
  const M = mats(T, meta);
  const hillR = x => Math.max(0, x - FRONT - 5) * 0.36;           // right side climbs
  const hillL = x => -Math.max(0, -x - FRONT - 2) * 0.85;         // left side drops toward the view
  const tuftGeo = upNormals(new THREE.PlaneGeometry(1, 0.85).translate(0, 0.42, 0));
  const signGeo = new THREE.PlaneGeometry(1, 0.83);

  function house(g, R, x, z, y, face, scale = 1) {
    const i = Math.floor(R() * meta.facades.length), f = meta.facades[i];
    const H = 8.4 * scale, W = H * f.aspect, wallH = H * (1 - f.roof) * 0.985, D = 5.5 + R() * 2.5;
    const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.y = face; g.add(h);
    const body = new THREE.Mesh(roundedBox(W * 0.97, wallH, D, 0.22), M.side[i]); body.position.set(0, wallH / 2, -D / 2 - 0.04); body.castShadow = body.receiveShadow = true; h.add(body);
    const roof = new THREE.Mesh(roundedBox(W * 0.9, 0.35, D * 0.92, 0.12, 2), M.roof); roof.position.set(0, wallH + 0.1, -D / 2); roof.castShadow = true; h.add(roof);
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), M.facade[i]); fr.position.set(0, H / 2, 0.02); fr.castShadow = true; fr.receiveShadow = true; h.add(fr);
    // a shop sign on some houses
    if (R() < 0.35) { const s = new THREE.Mesh(signGeo, M.signs[Math.floor(R() * 6)]); const k = 1.1 + R() * 0.6; s.scale.set(k, k, 1); s.position.set((R() - 0.5) * W * 0.5, 2.6 + R() * 1.5, 0.12); h.add(s); }
    return W;
  }
  function tuft(g, R, x, y, z, s = 1) {
    const m = new THREE.Mesh(tuftGeo, M.tufts[Math.floor(R() * 8)]); const k = (0.8 + R() * 0.9) * s;
    m.scale.set(k * 1.2, k, k); m.position.set(x, y - 0.05, z); m.rotation.y = (R() - 0.5) * 0.8; m.receiveShadow = true; g.add(m);
  }
  function palm(g, R, x, y, z) {
    const grp = new THREE.Group(); grp.position.set(x, y, z); g.add(grp);
    const h = 8 + R() * 4, lean = (R() - 0.5) * 0.5, pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new V3(Math.sin(t * 1.3) * lean * h * 0.4, t * h, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tr = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.26, 7), M.trunk); tr.castShadow = true; grp.add(tr);
    const top = curve.getPoint(1);
    for (let i = 0; i < 10; i++) {
      const L = 3.6 + R() * 1.4, geo = new THREE.PlaneGeometry(1.2, L, 1, 8), p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const v = Math.max(0, (p.getY(k) + L / 2) / L); p.setY(k, v * L); p.setZ(k, -Math.pow(v, 1.7) * L * 0.6); p.setX(k, p.getX(k) * Math.sin(Math.min(1, v * 1.15) * Math.PI) * 0.9); }
      geo.computeVertexNormals();
      const lf = new THREE.Mesh(geo, M.leaf); lf.castShadow = true;
      const hold = new THREE.Group(); hold.position.copy(top); hold.rotation.y = (i / 10) * Math.PI * 2; lf.rotation.x = -(0.85 + R() * 0.4); hold.add(lf); grp.add(hold);
    }
  }
  // sagging wire between two points
  function wire(g, a, b, sag = 0.9, r = 0.018) {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 4), M.wire); g.add(m);
  }

  function segment(index) {
    const g = new THREE.Group(), R = rng(index * 7 + 11), z0 = -index * seg, z1 = z0 - seg;
    // street, pavements, curbs
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W * 2, seg), M.road); road.material.map.repeat.set(1.2, seg / 7);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, z0 - seg / 2); road.receiveShadow = true; g.add(road);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(WALK_W, seg), M.walk); M.walk.map.repeat.set(1, seg / WALK_W);
      w.rotation.x = -Math.PI / 2; w.position.set(s * (ROAD_W + WALK_W / 2), 0.16, z0 - seg / 2); w.receiveShadow = true; g.add(w);
      const c = new THREE.Mesh(roundedBox(0.3, 0.2, seg, 0.06, 2), M.curb); c.position.set(s * (ROAD_W + 0.1), 0.06, z0 - seg / 2); c.receiveShadow = true; g.add(c);
    }
    // ground: right hill, left slope, both in red earth
    for (const s of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(90, seg, 45, 8); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const x = s * (FRONT + 45) + p.getX(k); p.setY(k, (s > 0 ? hillR(x) : hillL(x)) + 0.14 + Math.sin(x * 0.4 + p.getZ(k) * 0.3) * 0.15 * Math.min(1, Math.abs(Math.abs(x) - FRONT))); p.setX(k, x); p.setZ(k, p.getZ(k) + z0 - seg / 2); }
      geo.computeVertexNormals(); const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 9, p.getZ(k) / 9);
      const m = new THREE.Mesh(geo, M.dirt); m.receiveShadow = true; g.add(m);
    }
    // right side: rows of houses climbing the hill, facing the street
    for (let row = 0; row < 5; row++) {
      let z = z0 - R() * 3 - row * 2.3;
      const x = FRONT + 0.2 + row * 7.2;
      while (z > z1) { const s = 0.92 + R() * 0.22, w = house(g, R, x + R() * 0.8, z - 4, hillR(x) + 0.1, -Math.PI / 2, s); z -= w + 0.15 + R() * 1.4; }
    }
    // left side: graffiti wall along the street, then houses stepping down the slope (rooftops in view)
    const wallH = 1.7;
    const wm = new THREE.Mesh(new THREE.BoxGeometry(0.36, wallH, seg), [M.wall, M.wall, M.cap, M.cap, M.wall, M.wall]);
    wm.position.set(-FRONT + 0.2, wallH / 2 + 0.16, z0 - seg / 2); wm.castShadow = wm.receiveShadow = true;
    // mural texture: tile along the wall's length
    const muralGeo = wm.geometry; const uv = muralGeo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * seg / (wallH * 3)); g.add(wm);
    const cap = new THREE.Mesh(roundedBox(0.5, 0.14, seg, 0.05, 2), M.cap); cap.position.set(-FRONT + 0.2, wallH + 0.2, z0 - seg / 2); cap.castShadow = true; g.add(cap);
    for (let row = 1; row < 5; row++) {
      let z = z0 - R() * 6; const x = -FRONT - 3 - row * 7;
      while (z > z1) { const s = 0.9 + R() * 0.2, w = house(g, R, x - R(), z - 4, hillL(x), Math.PI / 2, s); z -= w + 0.3 + R() * 2; }
    }
    // poles every 16 m with wires along both pavements and across the street
    const poles = [];
    for (let z = z0 - 6; z > z1; z -= 16) for (const s of [-1, 1]) {
      const x = s * (ROAD_W + 0.6), h = 7.2 + R() * 0.6;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, h, 8), M.pole); p.position.set(x, h / 2 + 0.16, z + (s > 0 ? 0 : -3)); p.castShadow = true; g.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), M.pole); arm.position.set(x, h - 0.4, p.position.z); g.add(arm);
      poles.push({ s, top: new V3(x, h - 0.3, p.position.z) });
    }
    for (const s of [-1, 1]) { const ps = poles.filter(p => p.s === s); for (let i = 0; i < ps.length - 1; i++) for (let k = 0; k < 3; k++) wire(g, ps[i].top.clone().add(new V3((k - 1) * 0.45, -k * 0.12, 0)), ps[i + 1].top.clone().add(new V3((k - 1) * 0.45, -k * 0.12, 0)), 0.7 + k * 0.25); }
    const L = poles.filter(p => p.s < 0), Rr = poles.filter(p => p.s > 0);
    for (let i = 0; i < Math.min(L.length, Rr.length); i++) { wire(g, L[i].top, Rr[i].top.clone().add(new V3(0, -0.2, 0)), 1.1); if (R() < 0.6) wire(g, L[i].top.clone().add(new V3(0, -0.4, 0)), Rr[i].top.clone().add(new V3(0, -0.5, -2)), 1.5); }
    // to the houses
    for (const p of Rr) for (let k = 0; k < 2; k++) wire(g, p.top, new V3(FRONT + 0.3, 5.6 + R(), p.top.z - 3 + R() * 6), 0.4, 0.02);
    // greenery
    for (let i = 0; i < 26; i++) { const z = z0 - R() * seg; tuft(g, R, FRONT - 0.15 + R() * 0.3, 0.16, z, 0.9); }
    for (let i = 0; i < 22; i++) { const z = z0 - R() * seg; tuft(g, R, -FRONT + 0.6 + R() * 0.4, 0.16, z, 0.9); }
    for (let i = 0; i < 40; i++) { const x = FRONT + 4 + R() * 30, z = z0 - R() * seg; tuft(g, R, x, hillR(x) + 0.14, z, 1.4); }
    for (let i = 0; i < 3; i++) { const x = FRONT + 5 + R() * 20; palm(g, R, x, hillR(x), z0 - R() * seg); }
    for (let i = 0; i < 4; i++) { const x = -FRONT - 4 - R() * 22; palm(g, R, x, hillL(x), z0 - R() * seg); }
    // a sign board and a few tufts on the pavement
    if (R() < 0.8) { const s = new THREE.Mesh(signGeo, M.signs[4]); s.scale.setScalar(1.3); s.position.set(ROAD_W + 1.6, 0.16 + 0.55, z0 - 10 - R() * 20); s.rotation.y = -0.4; s.castShadow = true; g.add(s); }
    g.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
    scene.add(g); return g;
  }
  return { segment, M };
}

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
