// Procedural animation for rigged characters that come without animations.
// Works with three skeleton styles (Valve biped for CR7, Mixamo for the street players,
// Character Creator for the bar owner). Every pose is written as rotations around
// character-space axes (X = side, Y = up, Z = forward), converted into each bone's frame.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const RIGS = {
  valve: {
    hips: /Bip01_Pelvis/, spine: /Bip01_Spine_/, spine1: /Bip01_Spine1_/, chest: /Bip01_Spine4_/, neck: /Bip01_Neck1_/, head: /Bip01_Head1_/,
    lArm: /L_UpperArm_/, lFore: /L_Forearm_/, rArm: /R_UpperArm_/, rFore: /R_Forearm_/,
    lThigh: /L_Thigh_/, lCalf: /L_Calf_/, lFoot: /L_Foot_/, rThigh: /R_Thigh_/, rCalf: /R_Calf_/, rFoot: /R_Foot_/,
  },
  mixamo: {
    hips: /^Hips_/, spine: /^Spine_\d/, spine1: /^Spine1_/, chest: /^Spine2_/, neck: /^Neck_/, head: /^Head_/,
    lArm: /^LeftArm_/, lFore: /^LeftForeArm_\d/, rArm: /^RightArm_/, rFore: /^RightForeArm_\d/,
    lThigh: /^LeftUpLeg_/, lCalf: /^LeftLeg_/, lFoot: /^LeftFoot_/, rThigh: /^RightUpLeg_/, rCalf: /^RightLeg_/, rFoot: /^RightFoot_/,
  },
  cc: {
    hips: /^pelvis_/, spine: /^spine_01/, spine1: /^spine_02/, chest: /^spine_03/, neck: /^neck_01/, head: /^head_/,
    lArm: /^upperarm_l_/, lFore: /^lowerarm_l_/, rArm: /^upperarm_r_/, rFore: /^lowerarm_r_/,
    lThigh: /^thigh_l_/, lCalf: /^calf_l_/, lFoot: /^foot_l_/, rThigh: /^thigh_r_/, rCalf: /^calf_r_/, rFoot: /^foot_r_/,
  },
};

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function charQuat(obj, rootInv, out) { obj.getWorldQuaternion(out); return out.premultiply(rootInv); }

// A loaded character: `model` is a clone of the glTF scene, inside `this.root` (the object you move).
export class Character {
  constructor(source, { kind, height = 1.8, faceZ = 1 } = {}) {
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(source);
    this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
    this.root.add(this.model);
    this.model.updateMatrixWorld(true);
    const map = RIGS[kind], bones = {};
    this.model.traverse(o => { if (!o.isBone) return; for (const [k, re] of Object.entries(map)) if (!bones[k] && re.test(o.name)) bones[k] = o; });
    this.bones = bones;
    // Size: measure head bone above the feet, then scale the whole model.
    const wp = o => o.getWorldPosition(new THREE.Vector3());
    const feetY = Math.min(wp(bones.lFoot).y, wp(bones.rFoot).y), headY = wp(bones.head).y;
    const s = (height * 0.875) / (headY - feetY);
    this.model.scale.multiplyScalar(s);
    this.model.updateMatrixWorld(true);
    const feet2 = Math.min(wp(bones.lFoot).y, wp(bones.rFoot).y);
    this.model.position.y -= feet2 - height * 0.055;
    if (faceZ < 0) this.model.rotation.y += Math.PI;
    this.model.updateMatrixWorld(true);
    // Arms down from T/A pose (in character space).
    const rootInv = new THREE.Quaternion();
    const relax = (arm, fore, side) => {
      const a = wp(arm), f = wp(fore), dir = f.sub(a).normalize();
      this.model.getWorldQuaternion(_q2); // model may be turned; work in root space
      rootInv.identity();
      const target = new THREE.Vector3(0.22 * side, -1, 0.04).normalize();
      const r = new THREE.Quaternion().setFromUnitVectors(dir, target);
      const pq = charQuat(arm.parent, rootInv, new THREE.Quaternion());
      const local = pq.clone().invert().multiply(r).multiply(pq);
      arm.quaternion.premultiply(local);
      this.model.updateMatrixWorld(true);
    };
    relax(bones.lArm, bones.lFore, 1); relax(bones.rArm, bones.rFore, -1);
    // Record rest pose and each bone's parent frame (character space).
    this.rest = {}; this.frames = {};
    for (const [k, b] of Object.entries(bones)) {
      this.rest[k] = b.quaternion.clone();
      this.frames[k] = charQuat(b.parent, rootInv, new THREE.Quaternion()).invert();
    }
    this.restPos = bones.hips.position.clone();
    this.height = height;
    this.t = 0; this.phase = 0; this.blend = { walk: 0, run: 0, air: 0 };
    this.pose = {};
  }
  // Rotate a bone around a character-space axis (added on top of what is already set this frame).
  rot(k, axis, a) {
    if (!a || !this.bones[k]) return;
    _v.copy(axis).applyQuaternion(this.frames[k]);
    _q.setFromAxisAngle(_v, a);
    this.bones[k].quaternion.premultiply(_q);
  }
  reset() { for (const k in this.bones) this.bones[k].quaternion.copy(this.rest[k]); }
  // Locomotion + overlay poses. `o` = { speed, grounded, dt, lean, look, action, actionT }
  animate(o) {
    const dt = o.dt; this.t += dt;
    const sp = o.speed || 0;
    const B = this.blend;
    const wantRun = THREE.MathUtils.clamp((sp - 2.6) / 2.5, 0, 1), wantWalk = THREE.MathUtils.clamp(sp / 1.4, 0, 1);
    const k = 1 - Math.exp(-dt * 10);
    B.walk += (wantWalk - B.walk) * k; B.run += (wantRun - B.run) * k; B.air += ((o.grounded ? 0 : 1) - B.air) * (1 - Math.exp(-dt * 14));
    const stride = THREE.MathUtils.lerp(1.5, 2.6, B.run) * (this.height / 1.8);
    this.phase += (sp * dt / stride) * Math.PI;
    const p = this.phase, s = Math.sin(p), c = Math.cos(p);
    const W = B.walk * (1 - B.air);
    const thA = THREE.MathUtils.lerp(0.42, 0.85, B.run), knA = THREE.MathUtils.lerp(0.7, 1.55, B.run);
    const arA = THREE.MathUtils.lerp(0.32, 0.75, B.run), elb = THREE.MathUtils.lerp(0.25, 1.35, B.run);
    this.reset();
    // Legs (negative X = forward swing for a hanging limb).
    this.rot('lThigh', X, (-s * thA) * W); this.rot('rThigh', X, (s * thA) * W);
    this.rot('lCalf', X, (Math.max(0, c) ** 1.4 * knA + 0.08) * W); this.rot('rCalf', X, (Math.max(0, -c) ** 1.4 * knA + 0.08) * W);
    this.rot('lFoot', X, (-0.25 * Math.max(0, -s)) * W); this.rot('rFoot', X, (-0.25 * Math.max(0, s)) * W);
    // Arms swing opposite to legs, elbows bent more when running.
    this.rot('lArm', X, (s * arA) * W); this.rot('rArm', X, (-s * arA) * W);
    this.rot('lFore', X, -(0.12 + elb * W)); this.rot('rFore', X, -(0.12 + elb * W));
    // Torso: lean forward running, counter twist, breathing at rest.
    const idle = 1 - W;
    this.rot('spine', X, 0.04 + 0.16 * B.run * W + (o.lean || 0));
    this.rot('chest', Y, -s * 0.18 * W);
    this.rot('hips', Y, s * 0.12 * W);
    this.rot('chest', X, Math.sin(this.t * 1.8) * 0.015 * idle);
    this.rot('lArm', Z, Math.sin(this.t * 1.8) * 0.02 * idle); this.rot('rArm', Z, -Math.sin(this.t * 1.8) * 0.02 * idle);
    // In the air: knees up, arms out.
    if (B.air > 0.01) {
      const A = B.air;
      this.rot('lThigh', X, -0.7 * A); this.rot('lCalf', X, 1.1 * A); this.rot('rThigh', X, -0.2 * A); this.rot('rCalf', X, 0.6 * A);
      this.rot('lArm', Z, 0.6 * A); this.rot('rArm', Z, -0.6 * A); this.rot('lArm', X, -0.4 * A); this.rot('rArm', X, -0.4 * A);
    }
    if (o.action) this.overlay(o.action, o.actionT || 0, o);
    if (o.look) { this.rot('neck', Y, o.look * 0.5); this.rot('head', Y, o.look * 0.5); }
    if (o.lookUp) this.rot('head', X, -o.lookUp);
    // Body bob (applied by caller on the root's child).
    this.model.position.y = this.baseY ??= this.model.position.y;
    this.model.position.y = this.baseY + (Math.abs(Math.sin(p)) * 0.06 * W - 0.03 * W) * (1 + B.run);
  }
  overlay(a, t, o) {
    const e = (x, a0, a1) => THREE.MathUtils.clamp((x - a0) / (a1 - a0), 0, 1);
    const sm = x => x * x * (3 - 2 * x);
    if (a === 'kick') {            // wind up (0..0.22), strike (0.22..0.34), follow through
      const wind = sm(e(t, 0, 0.22)) * (1 - sm(e(t, 0.22, 0.32)));
      const strike = sm(e(t, 0.22, 0.34)) * (1 - sm(e(t, 0.5, 0.8)));
      this.rot('rThigh', X, 0.75 * wind - 1.35 * strike); this.rot('rCalf', X, 1.5 * wind + 0.1 * strike);
      this.rot('lArm', Z, 0.7 * (wind + strike)); this.rot('rArm', Z, -0.5 * (wind + strike)); this.rot('rArm', X, 0.5 * strike);
      this.rot('spine', X, -0.18 * strike + 0.1 * wind);
    } else if (a === 'juggle') {   // small taps with the right foot, arms balancing
      const tap = Math.max(0, Math.sin(t * Math.PI / (o.tapLen || 0.55)));
      this.rot('rThigh', X, -0.55 * tap); this.rot('rCalf', X, 0.5 * tap); this.rot('rFoot', X, -0.3 * tap);
      this.rot('lArm', Z, 0.35); this.rot('rArm', Z, -0.35); this.rot('lCalf', X, 0.15); this.rot('spine', X, 0.12);
      this.rot('head', X, 0.35);
    } else if (a === 'climb') {    // reach up, then pull and push up the leg
      const reach = sm(e(t, 0, 0.25)) * (1 - sm(e(t, 0.55, 0.85)));
      const knee = sm(e(t, 0.3, 0.6)) * (1 - sm(e(t, 0.75, 1)));
      this.rot('lArm', X, -2.7 * reach); this.rot('rArm', X, -2.7 * reach); this.rot('lFore', X, -0.4 * reach); this.rot('rFore', X, -0.4 * reach);
      this.rot('rThigh', X, -1.4 * knee); this.rot('rCalf', X, 1.8 * knee); this.rot('spine', X, 0.35 * knee);
    } else if (a === 'siu') {      // run up, jump and spin, land arms down and out: "SIUUU"
      const land = sm(e(t, 0.75, 0.95));
      const air = sm(e(t, 0.2, 0.35)) * (1 - land);
      this.rot('lThigh', X, -0.6 * air); this.rot('lCalf', X, 1.0 * air); this.rot('rCalf', X, 0.6 * air);
      this.rot('lArm', Z, 1.6 * air); this.rot('rArm', Z, -1.6 * air);
      this.rot('lThigh', Z, 0.32 * land); this.rot('rThigh', Z, -0.32 * land);
      this.rot('lArm', Z, 0.55 * land); this.rot('rArm', Z, -0.55 * land); this.rot('lArm', X, 0.35 * land); this.rot('rArm', X, 0.35 * land);
      this.rot('lFore', X, 0.1 * land); this.rot('rFore', X, 0.1 * land);
      this.rot('chest', X, -0.22 * land); this.rot('head', X, -0.25 * land);
    } else if (a === 'trick') {    // rainbow flick: heel up behind
      const k = Math.sin(Math.PI * e(t, 0, 0.45));
      this.rot('rThigh', X, 0.5 * k); this.rot('rCalf', X, 1.9 * k); this.rot('lArm', Z, 0.4 * k); this.rot('rArm', Z, -0.4 * k);
    } else if (a === 'keeper') {   // goalkeeper ready stance, or dive (o.dive = -1 left, 1 right, magnitude 0..1)
      const d = o.dive || 0, ad = Math.abs(d);
      this.rot('lThigh', X, -0.35 * (1 - ad)); this.rot('rThigh', X, -0.35 * (1 - ad)); this.rot('lCalf', X, 0.6 * (1 - ad)); this.rot('rCalf', X, 0.6 * (1 - ad));
      this.rot('lThigh', Z, 0.2); this.rot('rThigh', Z, -0.2);
      this.rot('spine', X, 0.3 * (1 - ad));
      this.rot('lArm', Z, 0.7 + 1.9 * ad); this.rot('rArm', Z, -0.7 - 1.9 * ad); this.rot('lArm', X, -0.5); this.rot('rArm', X, -0.5);
    } else if (a === 'cheer') {    // arms up, bouncing
      const b = Math.abs(Math.sin(t * 6));
      this.rot('lArm', Z, 2.6 - 0.3 * b); this.rot('rArm', Z, -2.6 + 0.3 * b); this.rot('lFore', X, -0.3); this.rot('rFore', X, -0.3);
    } else if (a === 'lean') {     // leaning on a counter: hands forward on it
      this.rot('lArm', X, -0.9); this.rot('rArm', X, -0.9); this.rot('lFore', X, -0.6); this.rot('rFore', X, -0.6); this.rot('spine', X, 0.18);
    } else if (a === 'talk') {     // gestures while speaking
      const g = Math.sin(t * 3.1), h = Math.sin(t * 2.3 + 1);
      this.rot('rArm', X, -0.35 - 0.25 * Math.max(0, g)); this.rot('rFore', X, -0.9 - 0.3 * g); this.rot('lFore', X, -0.3 - 0.25 * Math.max(0, h));
      this.rot('head', X, 0.04 * h);
    } else if (a === 'phone') {    // phone at the right ear
      this.rot('rArm', X, -0.55); this.rot('rArm', Z, -0.35); this.rot('rFore', X, -2.35); this.rot('head', Z, -0.12);
      this.rot('lArm', Z, 0.05);
    } else if (a === 'sit') {
      this.rot('lThigh', X, -1.5); this.rot('rThigh', X, -1.5); this.rot('lCalf', X, 1.5); this.rot('rCalf', X, 1.5);
      this.rot('lArm', X, -0.35); this.rot('rArm', X, -0.35); this.rot('lFore', X, -0.6); this.rot('rFore', X, -0.6);
    }
  }
  headWorld(out = new THREE.Vector3()) { return this.bones.head.getWorldPosition(out); }
  footWorld(side, out = new THREE.Vector3()) { return this.bones[side === 'l' ? 'lFoot' : 'rFoot'].getWorldPosition(out); }
}

// Recolour a Mixamo street player clone: shirt, trousers, shoes and skin tone.
export function dress(ch, { top, bottom, shoes, skin }) {
  ch.model.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name || '';
    const m = o.material = o.material.clone();
    if (n === 'outfit_top' && top) m.color.set(top).multiplyScalar(1.7);
    else if (n === 'outfit_bottom' && bottom) m.color.set(bottom).multiplyScalar(1.5);
    else if (n === 'outfit_shoes' && shoes) m.color.set(shoes).multiplyScalar(1.3);
    else if (/AvatarBody|AvatarHead/.test(n) && skin) m.color.set(skin);
  });
}
