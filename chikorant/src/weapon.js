// "The Aux Cord" — original full-auto rifle viewmodel with gloved hands, rendered in its own scene.
// A clear-coated navy/cream rifle with a coiled red cord wrapped round the handguard, a gold
// 3.5mm-jack muzzle, an EQ-meter readout and a volume knob. Includes the first-person layers
// for the abilities (dash streaks, updraft wind, Main Character gold).
import * as THREE from 'three';
import { outlineMaterial, addOutlines } from './builder.js';
import { flareTexture } from './textures.js';
import { Streaks, PointCloud, mergeChildren } from './fx.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
const RB = (w, h, d, r = 0.3) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * r);

const PI = Math.PI;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// soft studio environment so metals and clear-coat have something to reflect
function envTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#fff3df'); g.addColorStop(0.35, '#f7c9a2'); g.addColorStop(0.5, '#d99a78'); g.addColorStop(0.56, '#6a4c3c'); g.addColorStop(1, '#2a2220');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#ffffff'; x.fillRect(30, 18, 50, 16); x.fillRect(150, 26, 70, 10);
  x.fillStyle = '#bfe6ff'; x.fillRect(200, 44, 40, 8);
  x.fillStyle = 'rgba(255,170,120,0.8)'; x.fillRect(90, 58, 60, 6);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 112, 2, 32, 90, 90);
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.25, 'rgba(255,220,130,0.9)'); g.addColorStop(0.6, 'rgba(255,120,40,0.35)'); g.addColorStop(1, 'rgba(255,80,20,0)');
  x.fillStyle = g; x.beginPath(); x.moveTo(32, 0); x.quadraticCurveTo(62, 80, 32, 128); x.quadraticCurveTo(2, 80, 32, 0); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 30, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,240,210,0.9)'); g.addColorStop(0.7, 'rgba(255,200,120,0.5)'); g.addColorStop(1, 'rgba(255,160,80,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// damped spring (2 sub-steps so it stays stable at low frame rates)
function spring(s, k, c, dt) { const h = dt / 2; for (let i = 0; i < 2; i++) { s.v += (-s.x * k - s.v * c) * h; s.x += s.v * h; } return s.x; }

// Exact critically damped spring step toward `to` (no overshoot, stable at any dt). s = { x, v }.
export function damp2(s, to, w, dt) {
  const e = s.x - to, ex = Math.exp(-w * dt), j = s.v + w * e;
  s.x = to + (e + j * dt) * ex; s.v = (s.v - w * j * dt) * ex; return s.x;
}

// ── gun handling (shared by the game's shoot / recoil / crosshair code) ──
export const FIRE_RATE = 10;          // rounds per second, full auto
export const RECOIL_MAX = 0.024;      // max vertical climb (rad, ~1.4 deg)
// vertical kick added by shot i (0-based): near zero for the first shot, then a gentle climb
export const recoilKick = (i) => Math.min(0.004, 0.001 + i * 0.001);
// horizontal drift target for shot i: a slow, smooth left-right wander once the climb tops out
export const recoilSway = (i) => (i < 6 ? 0 : Math.sin((i - 6) * 0.55) * 0.012 * Math.min(1, (i - 6) / 4));
// bullet spread (cone radius, rad). Forgiving: the first 3 shots from a standstill are pin-point.
export function weaponSpread(shotIdx, hSpeed, onGround, mobile) {
  let s = Math.min(0.006, Math.max(0, shotIdx - 2) * 0.0008);
  if (hSpeed > 3.6) s += 0.007; else if (hSpeed > 1.2) s += 0.002;
  if (!onGround) s += 0.02;
  return mobile ? s * 0.5 : s;
}
// muzzle-flash variants, cycled in order so consecutive shots differ but never look random
const FLASH_ROT = [0, 0.9, 0.35, 1.3], FLASH_S = [0.24, 0.2, 0.26, 0.21], FLASH_LEN = 0.04;

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.environment = envTexture();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xbfdcff, 0x8a5a3a, 1.0));
    const sun = new THREE.DirectionalLight(0xffd6a0, 2.2); sun.position.set(-1, 2, 1.5); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xff8aa0, 1.0); rim.position.set(1.5, 0.5, -1); this.scene.add(rim);
    const fillL = new THREE.DirectionalLight(0x9fd8ff, 0.5); fillL.position.set(-2, -0.5, -0.5); this.scene.add(fillL);

    const phys = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: o.r ?? 0.45, metalness: o.m ?? 0.1, clearcoat: o.cc ?? 0, clearcoatRoughness: o.ccr ?? 0.12, envMapIntensity: o.env ?? 0.9 });
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.55, metalness: o.m ?? 0.1, envMapIntensity: o.env ?? 0.8 });
    const navy = phys(0x1b2a3c, { r: 0.38, m: 0.25, cc: 1 }), cream = phys(0xebe3d5, { r: 0.42, cc: 0.6 }), red = phys(0xff4655, { r: 0.35, cc: 0.9 });
    const dark = std(0x121820, { r: 0.5, m: 0.35 }), rubber = std(0x18191d, { r: 0.85 }), teal = phys(0x2f8f88, { r: 0.4, cc: 0.7 });
    const gold = phys(0xffc046, { r: 0.22, m: 1, env: 1.3 }), mag = phys(0xffb21a, { r: 0.32, m: 0.35, cc: 1 }), steel = phys(0xd2d7dc, { r: 0.2, m: 1, env: 1.2 });
    const glove = std(0x243344, { r: 0.75 }), gloveDark = std(0x161f2a, { r: 0.8 }), sleeve = std(0xd9cdb8, { r: 0.9 }), cuff = std(0xff4655, { r: 0.7 });
    this.mats = { navy, cream, red, teal, mag };
    const g = new THREE.Group(); this.gun = g;
    const add = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
    const noOL = (o) => { o.userData.noOutline = true; return o; };
    // a forearm: cylinder from the elbow end b up to the wrist a (+y points b→a)
    const arm = (parent, a, b, r1, r2, m) => { const d = new THREE.Vector3().subVectors(a, b); const L = d.length(); const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, L, 14), m); o.position.addVectors(a, b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(L)); parent.add(o); return o; };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const cylZ = (r1, r2, L, seg = 16) => new THREE.CylinderGeometry(r1, r2, L, seg).rotateX(PI / 2);

    // ── receiver
    add(g, RB(0.072, 0.085, 0.36, 0.28), navy, 0, 0.012, -0.01);
    add(g, RB(0.068, 0.05, 0.26, 0.3), cream, 0, -0.045, 0.01);
    add(g, RB(0.075, 0.016, 0.24, 0.4), red, 0, 0.0, 0.0);
    // top rail with teeth
    add(g, RB(0.036, 0.014, 0.34, 0.3), dark, 0, 0.061, -0.06);
    for (let i = 0; i < 11; i++) noOL(add(g, new THREE.BoxGeometry(0.042, 0.007, 0.012), dark, 0, 0.071, 0.08 - i * 0.026));
    // left side: volume knob, EQ meter, screws, label
    const knob = new THREE.Group(); knob.position.set(-0.038, 0.012, 0.1); g.add(knob); this.knob = knob;
    add(knob, new THREE.CylinderGeometry(0.019, 0.021, 0.014, 20).rotateZ(PI / 2), steel, -0.004, 0, 0);
    noOL(add(knob, new THREE.TorusGeometry(0.02, 0.003, 6, 20).rotateY(PI / 2), gold, -0.005, 0, 0));
    noOL(add(knob, new THREE.BoxGeometry(0.004, 0.014, 0.003), red, -0.012, 0.007, 0));
    add(g, RB(0.006, 0.036, 0.082, 0.3), dark, -0.037, 0.026, -0.04); // EQ meter bezel
    const eqMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 2.6), toneMapped: true });
    this.eqMat = eqMat; this.eq = [];
    for (let i = 0; i < 6; i++) { const b = noOL(add(g, new THREE.BoxGeometry(0.002, 1, 0.008), eqMat, -0.0405, 0.012, -0.072 + i * 0.013)); b.geometry.translate(0, 0.5, 0); b.scale.y = 0.01; b.userData.keep = true; this.eq.push({ m: b, h: 0.006 + Math.random() * 0.01 }); }
    for (const [z, y] of [[0.13, -0.035], [-0.13, -0.035], [0.13, 0.04], [-0.1, 0.04]]) noOL(add(g, new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 10).rotateZ(PI / 2), steel, -0.037, y, z));
    noOL(add(g, new THREE.PlaneGeometry(0.11, 0.028), new THREE.MeshBasicMaterial({ map: labelTex(), transparent: true }), -0.0345, -0.045, -0.02, 0, -PI / 2));
    // right side: ejection port + bolt (moves on every shot)
    add(g, RB(0.004, 0.03, 0.07, 0.3), rubber, 0.036, 0.022, -0.02);
    this.bolt = add(g, RB(0.006, 0.02, 0.05, 0.3), steel, 0.035, 0.022, -0.02); this.bolt.userData.keep = true;
    // charging handle
    this.chHandle = add(g, RB(0.05, 0.012, 0.022, 0.4), steel, 0, 0.058, 0.155); this.chHandle.userData.keep = true;
    // ── handguard, octagonal, with the coiled aux cord wrapped round it
    add(g, cylZ(0.043, 0.043, 0.28, 8), cream, 0, 0.0, -0.31).rotation.z = PI / 8;
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) noOL(add(g, RB(0.004, 0.012, 0.04, 0.4), dark, s * 0.041, 0.02, -0.235 - i * 0.07));
    const coil = []; const turns = 6.5;
    for (let i = 0; i <= 260; i++) { const t = i / 260; const a = t * PI * 2 * turns; coil.push(new THREE.Vector3(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.2 - t * 0.22)); }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 520, 0.0075, 8), red, 0, 0, 0);
    add(g, cylZ(0.047, 0.047, 0.02, 24), teal, 0, 0, -0.455);
    add(g, cylZ(0.04, 0.047, 0.012, 24), teal, 0, 0, -0.17);
    // barrel + 3.5mm jack muzzle (rubber strain relief, gold-plated plug)
    add(g, cylZ(0.016, 0.016, 0.1, 14), dark, 0, 0, -0.51);
    const jack = new THREE.Group(); jack.position.set(0, 0, -0.56); g.add(jack); this.jack = jack;
    add(jack, cylZ(0.028, 0.024, 0.05, 20), rubber, 0, 0, -0.025);
    for (let i = 0; i < 3; i++) noOL(add(jack, new THREE.TorusGeometry(0.026 - i * 0.0012, 0.0028, 6, 20), rubber, 0, 0, -0.01 - i * 0.014));
    add(jack, cylZ(0.024, 0.024, 0.014, 20), steel, 0, 0, -0.057);
    add(jack, cylZ(0.0165, 0.0165, 0.045, 18), gold, 0, 0, -0.086);           // sleeve
    noOL(add(jack, cylZ(0.0168, 0.0168, 0.006, 18), rubber, 0, 0, -0.111));  // insulator
    add(jack, cylZ(0.0165, 0.0165, 0.018, 18), gold, 0, 0, -0.123);           // ring
    noOL(add(jack, cylZ(0.0168, 0.0168, 0.006, 18), rubber, 0, 0, -0.135));  // insulator
    add(jack, cylZ(0.0165, 0.012, 0.014, 18), gold, 0, 0, -0.145);            // tip neck
    add(jack, new THREE.SphereGeometry(0.0135, 16, 10), gold, 0, 0, -0.155).scale.set(1, 1, 1.3);
    this.muzzleLocal = new THREE.Vector3(0, 0, -0.74);
    // ── holo sight
    add(g, RB(0.044, 0.022, 0.08, 0.3), dark, 0, 0.081, -0.04);
    add(g, RB(0.007, 0.036, 0.016, 0.4), navy, -0.021, 0.104, -0.065); add(g, RB(0.007, 0.036, 0.016, 0.4), navy, 0.021, 0.104, -0.065);
    add(g, RB(0.049, 0.008, 0.016, 0.4), navy, 0, 0.124, -0.065);
    noOL(add(g, RB(0.012, 0.005, 0.02, 0.4), red, 0, 0.13, -0.065));
    noOL(add(g, new THREE.PlaneGeometry(0.035, 0.03), new THREE.MeshPhysicalMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, envMapIntensity: 1.5 }), 0, 0.104, -0.064));
    this.dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.6, 0.8) });
    noOL(add(g, new THREE.SphereGeometry(0.0024, 8, 6), this.dotMat, 0, 0.102, -0.0655));
    noOL(add(g, new THREE.TorusGeometry(0.006, 0.0006, 4, 24), this.dotMat, 0, 0.102, -0.0655));
    // ── magazine (marigold, curved: two angled segments + ribs)
    const magG = new THREE.Group(); magG.position.set(0, -0.06, -0.08); g.add(magG); this.mag = magG;
    add(magG, RB(0.044, 0.1, 0.074, 0.3), mag, 0, -0.045, 0.0, 0.12);
    add(magG, RB(0.044, 0.08, 0.072, 0.3), mag, 0, -0.125, -0.022, 0.32);
    for (let i = 0; i < 3; i++) noOL(add(magG, RB(0.046, 0.006, 0.06, 0.4), dark, 0, -0.04 - i * 0.03, -0.004 - i * 0.006, 0.12 + i * 0.08));
    add(magG, RB(0.05, 0.018, 0.082, 0.4), dark, 0, -0.166, -0.04, 0.32);
    // ── grip, trigger, guard
    add(g, RB(0.044, 0.125, 0.056, 0.35), dark, 0, -0.1, 0.1, -0.3);
    for (let i = 0; i < 4; i++) noOL(add(g, RB(0.046, 0.006, 0.02, 0.4), rubber, 0, -0.075 - i * 0.022, 0.123 + i * 0.006, -0.3));
    noOL(add(g, new THREE.TorusGeometry(0.03, 0.004, 6, 16, PI).rotateY(PI / 2), dark, 0, -0.07, 0.04, 0, 0, 0));
    add(g, RB(0.008, 0.03, 0.01, 0.4), steel, 0, -0.07, 0.04, 0.3);
    // ── stock
    add(g, RB(0.058, 0.08, 0.2, 0.3), cream, 0, -0.012, 0.27);
    add(g, RB(0.062, 0.03, 0.14, 0.4), navy, 0, 0.035, 0.27);
    add(g, RB(0.066, 0.1, 0.03, 0.3), teal, 0, -0.012, 0.38);
    // the phone-cord coil: grip → stock
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120; const a = t * PI * 2 * 9; pts.push(new THREE.Vector3(0.0 + Math.cos(a) * 0.018, -0.145 + t * 0.09 + Math.sin(a) * 0.018, 0.13 + t * 0.2)); }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.005, 6), red, 0, 0, 0);

    // ── hands & sleeves
    const rh = new THREE.Group(); rh.position.set(0.012, -0.11, 0.11); g.add(rh); this.rightHand = rh;
    add(rh, RB(0.07, 0.085, 0.09, 0.35), glove, 0.025, 0, 0, 0, 0, -0.1);
    for (let i = 0; i < 3; i++) add(rh, RB(0.075, 0.022, 0.03, 0.45), glove, -0.006, 0.02 - i * 0.026, -0.04 - i * 0.004, 0, 0, 0.05);
    add(rh, RB(0.022, 0.05, 0.026, 0.45), gloveDark, -0.03, 0.05, 0.0, 0.5, 0, 0.2); // thumb over the grip
    arm(rh, V(0.05, -0.02, 0.035), V(0.07, -0.05, 0.08), 0.043, 0.045, cuff);
    arm(rh, V(0.07, -0.05, 0.08), V(0.15, -0.24, 0.44), 0.046, 0.056, sleeve);
    const lh = new THREE.Group(); lh.position.set(-0.01, -0.06, -0.33); g.add(lh); this.leftHand = lh;
    add(lh, RB(0.085, 0.045, 0.1, 0.4), glove, 0.0, -0.012, 0);
    for (let i = 0; i < 4; i++) add(lh, RB(0.022, 0.06, 0.022, 0.45), glove, -0.046, 0.022, 0.035 - i * 0.024, 0, 0, 0.25);
    add(lh, RB(0.03, 0.034, 0.03, 0.4), gloveDark, -0.03, -0.012, 0.05);
    arm(lh, V(-0.03, -0.03, 0.05), V(-0.045, -0.06, 0.095), 0.04, 0.043, cuff);
    arm(lh, V(-0.045, -0.06, 0.095), V(-0.11, -0.3, 0.44), 0.044, 0.056, sleeve);

    for (const grp of [g, knob, magG, jack, rh, lh]) mergeChildren(grp);
    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    addOutlines(g, outlineMaterial(0.0032));
    this.root = new THREE.Group(); this.root.add(g); this.scene.add(this.root);
    this.base = new THREE.Vector3(0.21, -0.205, -0.43); this.baseRot = new THREE.Vector3(0.04, 0.18, -0.05);

    // ── muzzle flash: star sprite + 3 crossed flame cards + a "sound wave" ring off the jack
    const fl = new THREE.Group(); fl.position.copy(this.muzzleLocal).add(new THREE.Vector3(0, 0, 0.02)); g.add(fl); this.flashG = fl; fl.visible = false;
    const addMat = (map, c) => new THREE.MeshBasicMaterial({ map, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide });
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTexture(), color: new THREE.Color(3, 2.4, 1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.set(0.22, 0.22, 1); fl.add(this.flash);
    const flameMat = addMat(flameTexture(), new THREE.Color(2.6, 1.9, 1.1)); this.flameMat = flameMat;
    this.cards = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.2).translate(0, 0.1, 0).rotateX(-PI / 2), flameMat); m.rotation.z = (i / 3) * PI; fl.add(m); this.cards.push(m); }
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), addMat(ringTexture(), new THREE.Color(2.4, 2.0, 1.4)));
    this.ring.visible = false; g.add(this.ring); this.ring.position.copy(this.muzzleLocal).add(new THREE.Vector3(0, 0, 0.06)); this.ringT = 0;
    // petals that flare outward round the jack (these are what you see from behind the gun)
    this.petals = [];
    const petalGeo = new THREE.PlaneGeometry(0.05, 0.13).translate(0, 0.065, 0);
    for (let i = 0; i < 5; i++) { const pv = new THREE.Group(); fl.add(pv); const m = new THREE.Mesh(petalGeo, flameMat); m.rotation.x = -0.75; pv.add(m); this.petals.push(pv); m.frustumCulled = false; m.renderOrder = 10; }
    for (const m of [this.flash, ...this.cards, this.ring]) { m.frustumCulled = false; m.renderOrder = 10; }
    this.flashT = 0;

    // ── brass casings (fly out of the right-side port)
    const caseGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.019, 10); const caseMat = phys(0xe0a84a, { r: 0.25, m: 1, env: 1.3 });
    this.casings = [];
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(caseGeo, caseMat); m.visible = false; m.frustumCulled = false; this.scene.add(m); this.casings.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 }); }
    this.caseI = 0;

    // ── vm-space effects: sparks / speed lines / wind, smoke wisps
    this.fx = new Streaks(this.scene, 160, { tail: 0.95 }); this.fx.mesh.renderOrder = 12;
    this.fxL = [];
    this.smoke = new PointCloud(this.scene, { max: 80, additive: false, grow: 2.5 }); this.smoke.points.renderOrder = 11;
    this.glints = new PointCloud(this.scene, { max: 120, additive: true }); this.glints.points.renderOrder = 12;

    // animation state
    this.kick = 0; this.swayX = 0; this.swayY = 0; this.bobT = 0; this.reloadT = 0; this.reloadDur = 2.0; this.lower = 0; this.equip = 1; this.tilt = 0;
    this.sp = { z: { x: 0, v: 0 }, y: { x: 0, v: 0 }, rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, rz: { x: 0, v: 0 } };
    this.boltT = 0; this.heat = 0; this.ultT = 0; this.ultK = 0; this.time = 0;
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this.fxPool = []; this.shotN = 0;
  }
  resize(aspect) {
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    const s = (innerHeight * Math.min(devicePixelRatio, 1.5)) / (2 * Math.tan((this.camera.fov * PI) / 360));
    this.smoke.mat.uniforms.uScale.value = s; this.glints.mat.uniforms.uScale.value = s;
  }
  fire(gold = false) {
    const sp = this.sp, n = this.shotN = (this.shotN || 0) + 1, v = n & 3, alt = n & 1 ? 1 : -1;
    // the same punch every shot (a little left/right alternation so it doesn't feel robotic)
    sp.z.v += 30; sp.rx.v += 30; sp.ry.v += alt * 5; sp.rz.v += alt * 9; sp.y.v += 4;
    this.boltT = 1; this.heat = Math.min(1, this.heat + 0.08);
    this.flashT = FLASH_LEN; this.flashG.visible = true; this.flashG.scale.setScalar(1);
    this.flash.material.rotation = FLASH_ROT[v]; this.flash.scale.set(FLASH_S[v], FLASH_S[v], 1);
    const fs = 0.85 + (v & 1) * 0.3; this.cards.forEach((m, i) => { m.rotation.z = (i / 3) * PI + v * 0.4; m.scale.set(1, fs, 1); });
    const po = v * 0.63; this.petals.forEach((pv, i) => { pv.rotation.z = po + (i / 5) * PI * 2; const k = 0.8 + ((i + v) % 3) * 0.12; pv.scale.set(k, k, k); });
    const fc = gold ? [3.4, 2.6, 0.9] : [2.6, 1.9, 1.1]; this.flameMat.color.setRGB(fc[0], fc[1], fc[2]); this.flash.material.color.setRGB(gold ? 3.4 : 3, gold ? 2.8 : 2.4, gold ? 1.0 : 1.4);
    this.ringT = 1; this.ring.visible = true; this.ring.material.color.setRGB(gold ? 3 : 2.2, gold ? 2.3 : 1.9, gold ? 0.8 : 1.5);
    for (let i = 0; i < this.eq.length; i++) this.eq[i].h = 0.012 + ((i * 7 + n * 3) % 5) * 0.004;
    // casing
    const r = Math.random;
    const c = this.casings[this.caseI++ % this.casings.length];
    this.gun.updateWorldMatrix(true, false); c.m.position.set(0.04, 0.025, -0.02).applyMatrix4(this.gun.matrixWorld);
    c.v.set(0.9 + r() * 0.5, 0.9 + r() * 0.5, 0.2 + r() * 0.3); c.w.set(r() * 30, r() * 10, 20 + r() * 20); c.t = 0.7; c.m.visible = true; c.m.rotation.set(0, 0, PI / 2);
    // muzzle sparks (pooled) + a wisp of smoke every other shot
    const m = this._v.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld);
    for (let i = 0; i < 3; i++) {
      const o = this.fxPool.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, L: 0.14, c: [0, 0, 0], w: 0.0025, g: 0, k: 'spark' };
      o.p.copy(m); o.v.set((r() - 0.5) * 2.5, (r() - 0.3) * 2.5, -4 - r() * 4); o.t = 0.08 + r() * 0.06; o.L = 0.14; o.w = 0.0025; o.k = 'spark';
      o.c[0] = 6; o.c[1] = gold ? 4.6 : 3.6; o.c[2] = 1.2; this.fxL.push(o);
    }
    if (n & 1) this.smoke.emit(m.x, m.y, m.z, (r() - 0.5) * 0.1, 0.12 + r() * 0.08, -0.25 - r() * 0.2, 0.75, 0.72, 0.7, 0.03, 0.7 + r() * 0.4, -0.05, 1.2, 0.22);
  }
  // Compile the shaders of everything that is hidden until the first shot (muzzle flash sprite, flame cards,
  // ring, casings). Otherwise the first trigger pull stalls on a shader compile. Call once, outside combat.
  prewarm(renderer) {
    const hidden = [this.flashG, this.ring, ...this.casings.map((c) => c.m)].filter((o) => !o.visible);
    hidden.forEach((o) => (o.visible = true));
    // both shader variants: straight to the canvas (low quality) and into the post-processing target (high)
    const prev = renderer.getRenderTarget(), rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const async = renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile'); // compiles off the main thread
    try {
      for (const target of [null, rt]) {
        renderer.setRenderTarget(target);
        if (async) renderer.compileAsync(this.scene, this.camera).catch(() => {}); else renderer.compile(this.scene, this.camera);
      }
    } catch (e) { /* warm-up is best effort */ }
    renderer.setRenderTarget(prev); rt.dispose();
    hidden.forEach((o) => (o.visible = false));
  }
  startReload(d) { this.reloadT = d; this.reloadDur = d; }
  hurt() { const r = Math.random; this.sp.rz.v += (r() - 0.5) * 40; this.sp.ry.v += (r() - 0.5) * 20; this.sp.y.v -= 10; }
  dash(cols) {
    const r = Math.random;
    for (let i = 0; i < 46; i++) {
      const a = r() * PI * 2, rad = 0.22 + r() * 0.55; const c = cols[i % cols.length].map((v) => v * 0.55);
      this.fxL.push({ p: new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad * 0.7, -0.6 - r() * 3), v: new THREE.Vector3(0, 0, 9 + r() * 8), t: 0.22 + r() * 0.25, L: 0.05, c, w: 0.006 + r() * 0.006, g: 0, k: 'line' });
    }
  }
  updraft() {
    const r = Math.random;
    for (let i = 0; i < 40; i++) {
      const a = r() * PI * 2, rad = 0.35 + r() * 0.5;
      this.fxL.push({ p: new THREE.Vector3(Math.cos(a) * rad, 0.2 + r() * 0.8, -0.3 - r() * 0.8 + Math.sin(a) * 0.3), v: new THREE.Vector3(0, -3.5 - r() * 3, 0), a, rad, t: 0.3 + r() * 0.5, L: 0.06, c: r() < 0.3 ? [1.8, 1.9, 1.8] : [0.8, 1.6, 1.7], w: 0.003 + r() * 0.003, g: 0, k: 'wind' });
    }
  }
  ult(dur) { this.ultT = dur; }
  // muzzle position in camera space (for world tracers)
  muzzleCam(out) { this.gun.updateWorldMatrix(true, false); return out.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld); }

  update(dt, s) {
    // s: { moving, speed, onGround, lookDX, lookDY, lowered, tilt }
    this.time += dt; const T = this.time, sp = this.sp;
    if (this.kick) { sp.y.v -= this.kick * 26; sp.rx.v -= this.kick * 18; this.kick = 0; } // landing dip (set by the game)
    const kz = spring(sp.z, 520, 30, dt), ky = spring(sp.y, 300, 22, dt), krx = spring(sp.rx, 380, 24, dt), kry = spring(sp.ry, 300, 22, dt), krz = spring(sp.rz, 260, 18, dt);
    // flash / ring
    // flash: shown on the shot's frame, then fades; hidden once its fixed lifetime is used up (same frame count every shot)
    if (this.flashT > 1e-4) { this.flashG.visible = true; this.flashG.scale.setScalar(0.55 + 0.45 * Math.min(1, this.flashT / FLASH_LEN)); this.flashT -= dt; }
    else this.flashG.visible = false;
    if (this.ringT > 0) { this.ringT = Math.max(0, this.ringT - dt * 9); const k = 1 - this.ringT; this.ring.scale.setScalar(0.25 + k * 1.3); this.ring.material.opacity = this.ringT * 0.9; if (this.ringT <= 0) this.ring.visible = false; }
    this.boltT = Math.max(0, this.boltT - dt * 16); this.bolt.position.z = -0.02 + this.boltT * 0.03;
    this.heat = Math.max(0, this.heat - dt * 0.6);
    for (const e of this.eq) { e.h = Math.max(0.003 + Math.sin(T * 7 + e.m.position.z * 200) * 0.002 + 0.002, e.h - dt * 0.09); e.m.scale.y = Math.min(0.03, e.h); }
    this.knob.rotation.x = Math.sin(T * 0.5) * 0.4 + this.heat * 2;
    // sway / bob
    this.swayX += (-s.lookDX * 0.0006 - this.swayX) * Math.min(1, dt * 10); this.swayY += (s.lookDY * 0.0006 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.04, 0.04); this.swayY = THREE.MathUtils.clamp(this.swayY, -0.04, 0.04);
    if (s.moving && s.onGround) this.bobT += dt * (6 + s.speed * 0.9);
    const bobA = s.moving && s.onGround ? Math.min(1, s.speed / 6) : 0;
    const bx = Math.sin(this.bobT) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bobT)) * 0.012 * bobA;
    const breathe = Math.sin(T * 1.6) * 0.0025;
    this.lower += ((s.lowered ? 1 : 0) - this.lower) * Math.min(1, dt * 8);
    this.equip = Math.max(0, this.equip - dt * 3);
    this.tilt += (s.tilt - this.tilt) * Math.min(1, dt * 10);
    let rx = this.baseRot.x + krx * 0.05 + Math.sin(T * 1.1) * 0.004, ry = this.baseRot.y + kry * 0.03 + this.swayX * 0.6, rz = this.baseRot.z + this.tilt + krz * 0.03;
    let px = this.base.x + bx + this.swayX, py = this.base.y + by + breathe + this.swayY - (s.onGround ? 0 : 0.015) + ky * 0.04 - krx * 0.004, pz = this.base.z + kz * 0.028;
    // reload: tilt the gun, drop the mag, fetch a fresh one, slap it home, rack the handle
    if (this.reloadT > 0) {
      this.reloadT -= dt; const t = 1 - Math.max(0, this.reloadT) / this.reloadDur;
      const w = ss(0, 0.18, t) * (1 - ss(0.86, 1, t));
      rz -= w * 0.75; rx += w * 0.22; ry += w * 0.12; py += w * 0.05; px -= w * 0.05; pz += w * 0.02;
      const drop = ss(0.12, 0.32, t);                 // old mag falls away
      const insert = ss(0.45, 0.7, t);                // new mag rises into the well
      let my = -0.06, mrx = 0;
      if (t < 0.4) { my -= drop * 0.4; mrx = drop * 0.6; this.mag.visible = drop < 0.95; }
      else { my -= (1 - insert) * 0.32; mrx = (1 - insert) * -0.3; this.mag.visible = true; }
      this.mag.position.y = my; this.mag.rotation.x = mrx;
      // left hand follows the mag down and back up
      const hand = t < 0.4 ? ss(0.15, 0.4, t) : 1 - ss(0.55, 0.75, t);
      this.leftHand.position.set(-0.01 - hand * 0.01, -0.06 - hand * 0.16, -0.33 + hand * 0.22);
      this.leftHand.rotation.x = hand * 0.4;
      // slap + rack
      const slap = ss(0.68, 0.72, t) * (1 - ss(0.72, 0.8, t)); py += slap * 0.012; rx -= slap * 0.05;
      const rack = ss(0.82, 0.88, t) * (1 - ss(0.88, 0.95, t)); this.chHandle.position.z = 0.155 + rack * 0.05; rz += rack * 0.06;
    } else { this.mag.position.y = -0.06; this.mag.rotation.x = 0; this.mag.visible = true; this.leftHand.position.set(-0.01, -0.06, -0.33); this.leftHand.rotation.x = 0; this.chHandle.position.z = 0.155; }
    py -= this.lower * 0.35 + this.equip * 0.3; rx -= this.lower * 0.6 + this.equip * 0.8;
    // ult: the rifle runs hot gold
    if (this.ultT > 0) this.ultT -= dt;
    this.ultK += ((this.ultT > 0 ? 1 : 0) - this.ultK) * Math.min(1, dt * 4);
    const uk = this.ultK;
    if (uk > 0.001 || this.goldOn) {
      this.goldOn = uk > 0.001;
      const pulse = 0.6 + 0.4 * Math.sin(T * 6);
      this.mats.navy.emissive.setRGB(0.9, 0.55, 0.12).multiplyScalar(uk * 0.05 * pulse);
      this.mats.cream.emissive.setRGB(1, 0.7, 0.2).multiplyScalar(uk * 0.015 * pulse);
      this.mats.red.emissive.setRGB(1, 0.6, 0.1).multiplyScalar(uk * 0.45 * pulse);
      this.mats.mag.emissive.setRGB(1, 0.65, 0.1).multiplyScalar(uk * 0.25 * pulse);
      this.dotMat.color.setRGB(5 + uk * 1, 0.6 + uk * 3.6, 0.8 - uk * 0.4);
      this.eqMat.color.setRGB(0.4 + uk * 4, 3 + uk * 0.6, 2.6 - uk * 2);
      if (uk > 0.3 && Math.random() < dt * 30) {
        this.gun.updateWorldMatrix(true, false); const r = Math.random;
        const q = this._v.set((r() - 0.5) * 0.08, (r() - 0.3) * 0.12, -0.6 * r() + 0.15).applyMatrix4(this.gun.matrixWorld);
        this.glints.emit(q.x, q.y, q.z, (r() - 0.5) * 0.05, 0.05 + r() * 0.08, (r() - 0.5) * 0.05, 5, 3.8, 1.2, 0.006 + r() * 0.006, 0.6 + r() * 0.5, -0.02, 0.5);
      }
      if (uk > 0.3 && Math.random() < dt * 14) { const r = Math.random; const a = r() * PI * 2; this.glints.emit(Math.cos(a) * 0.5, Math.sin(a) * 0.32 - 0.05, -0.7, 0, 0.04, 0, 4, 3, 1, 0.012 + r() * 0.01, 1 + r(), -0.02, 0.2); }
    }
    this.root.position.set(px, py, pz);
    this.root.rotation.set(rx, ry, rz);
    // casings
    for (const c of this.casings) {
      if (!c.m.visible) continue;
      c.t -= dt; if (c.t <= 0) { c.m.visible = false; continue; }
      c.v.y -= 5.5 * dt; c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
    }
    // vm-space streak effects
    const fx = this.fx; fx.begin();
    let keep = 0;
    for (let i = 0; i < this.fxL.length; i++) {
      const o = this.fxL[i];
      o.t -= dt; if (o.t <= 0) { if (o.k === 'spark') this.fxPool.push(o); continue; }
      if (o.k === 'wind') { o.a += dt * 7; o.p.x = Math.cos(o.a) * o.rad; o.p.z = -0.55 + Math.sin(o.a) * o.rad * 0.5; }
      o.p.addScaledVector(o.v, dt);
      const L = o.k === 'line' ? Math.min(0.9, o.v.length() * 0.05) : o.k === 'wind' ? 0.12 : o.L;
      const d = this._v.copy(o.v).normalize();
      let bx2 = o.p.x - d.x * L, by2 = o.p.y - d.y * L, bz2 = o.p.z - d.z * L;
      if (o.k === 'wind') { bx2 = Math.cos(o.a - 0.35) * o.rad; bz2 = -0.55 + Math.sin(o.a - 0.35) * o.rad * 0.5; by2 = o.p.y + 0.04; }
      const al = Math.min(1, o.t * 6);
      fx.push(o.p.x, o.p.y, o.p.z, bx2, by2, bz2, o.c[0], o.c[1], o.c[2], al, o.w);
      this.fxL[keep++] = o;
    }
    this.fxL.length = keep;
    fx.end();
    this.smoke.update(dt); this.glints.update(dt);
  }
}

function labelTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#1B2A3C'; x.font = '40px "Bebas Neue", Impact, sans-serif'; x.textBaseline = 'middle'; x.fillText('THE AUX CORD', 6, 34);
  x.fillStyle = '#FF4655'; x.fillRect(220, 18, 30, 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
