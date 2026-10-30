// The airport (episode 2): "Airport Final Big Scene" by assetfactory (Sketchfab), lightened for the web.
// Loaded only when the car leaves the favela. Walls come from the model itself: every steep triangle
// between knee and head height marks a 0.5 m cell as blocked; cells are merged into boxes for the
// game's box physics. The floor is one big box at y = 0.
import * as THREE from 'three';

const CELL = 0.5, Y0 = 0.3, Y1 = 1.9;
export function wallColliders(root, { skip = () => false, cell = CELL, open = [] } = {}) {
  const blocked = new Set(), key = (i, j) => i * 100000 + j;
  let minI = 1e9, maxI = -1e9, minJ = 1e9, maxJ = -1e9;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || skip(o)) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index, m = o.matrixWorld, cnt = idx ? idx.count : pos.count;
    for (let t = 0; t < cnt; t += 3) {
      const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m); b.fromBufferAttribute(pos, ib).applyMatrix4(m); c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      if (Math.max(a.y, b.y, c.y) < Y0 || Math.min(a.y, b.y, c.y) > Y1) continue;
      e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2); const area = n.length(); if (area < 1e-6) continue;
      if (Math.abs(n.y / area) > 0.75) continue;          // floors, roofs, table tops: walkable or overhead
      const steps = Math.min(60, Math.max(1, Math.ceil(Math.max(e1.length(), e2.length()) / (cell * 0.7))));
      for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps - u; v++) {
        p.copy(a).addScaledVector(e1, u / steps).addScaledVector(e2, v / steps);
        if (p.y < Y0 || p.y > Y1) continue;
        if (open.some(B => p.x > B.x0 && p.x < B.x1 && p.z > B.z0 && p.z < B.z1)) continue;   // doorways stay clear
        const i = Math.floor(p.x / cell), j = Math.floor(p.z / cell);
        blocked.add(key(i, j)); minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
      }
    }
  });
  // Merge runs along x into boxes.
  const out = [];
  for (let j = minJ; j <= maxJ; j++) {
    let start = null;
    for (let i = minI; i <= maxI + 1; i++) {
      const on = blocked.has(key(i, j));
      if (on && start === null) start = i;
      if (!on && start !== null) { out.push({ x0: start * cell, x1: i * cell, z0: j * cell, z1: (j + 1) * cell, y0: 0, y1: 3 }); start = null; }
    }
  }
  return { boxes: out, blocked, cell, has: (x, z) => blocked.has(key(Math.floor(x / cell), Math.floor(z / cell))) };
}

// Cut openings in the model: every triangle whose centre is inside a box disappears (collapsed).
// Meshes shared by several instances get the same cut at the same local place.
export function carve(root, boxes) {
  root.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), done = new Set();
  let n = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index; if (!idx) return;
    const m = o.matrixWorld;
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t)).applyMatrix4(m); b.fromBufferAttribute(pos, idx.getX(t + 1)).applyMatrix4(m); c.fromBufferAttribute(pos, idx.getX(t + 2)).applyMatrix4(m);
      const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
      e1.subVectors(b, a); e2.subVectors(c, a); nn.crossVectors(e1, e2); const ar = nn.length();
      if (ar < 1e-9 || Math.abs(nn.y / ar) > 0.75) continue;   // only walls: floors and ceilings stay
      for (const B of boxes) if (x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1 && y < B.y1) {
        // Make it a degenerate triangle (all three corners on the first one).
        if (!done.has(g)) { g.index = idx.clone(); done.add(g); }
        const I = g.index; I.setX(t + 1, I.getX(t)); I.setX(t + 2, I.getX(t)); n++; break;
      }
    }
    if (done.has(g)) g.index.needsUpdate = true;
  });
  return n;
}
