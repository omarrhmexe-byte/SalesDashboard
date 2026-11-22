// "The Aux Cord" — original full-auto rifle viewmodel with gloved hands, rendered in its own scene.
import * as THREE from 'three';
import { outlineMaterial, addOutlines } from './builder.js';
import { flareTexture } from './textures.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
const RB = (w, h, d) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.3);

const PI = Math.PI;

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xbfdcff, 0x8a5a3a, 1.4));
    const sun = new THREE.DirectionalLight(0xffd6a0, 2.4); sun.position.set(-1, 2, 1.5); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xff8aa0, 0.8); rim.position.set(1.5, 0.5, -1); this.scene.add(rim);

    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.55, metalness: o.m ?? 0.1, emissive: o.e ? new THREE.Color(o.e) : undefined, emissiveIntensity: o.ei ?? 1 });
    const navy = mat(0x1c2a3a), dark = mat(0x10161d, { r: 0.4 }), cream = mat(0xe9e2d6), red = mat(0xff4655), teal = mat(0x2f8f88), gold = mat(0xffc21a, { r: 0.4 }), steel = mat(0xc9ced3, { r: 0.25, m: 0.9 }), glove = mat(0x233243, { r: 0.8 }), sleeve = mat(0xd9cdb8, { r: 0.9 });
    const g = new THREE.Group(); this.gun = g;
    const add = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
    // receiver & body
    add(g, RB(0.075, 0.1, 0.38), navy, 0, 0, 0);
    add(g, RB(0.078, 0.035, 0.2), red, 0, 0.02, 0.02);
    add(g, RB(0.04, 0.02, 0.32), dark, 0, 0.06, -0.02);
    // handguard with vents
    add(g, RB(0.07, 0.085, 0.26), cream, 0, -0.005, -0.31);
    for (let i = 0; i < 4; i++) add(g, RB(0.072, 0.012, 0.035), dark, 0, 0.012, -0.24 - i * 0.05);
    add(g, new THREE.CylinderGeometry(0.044, 0.044, 0.025, 16), teal, 0, -0.005, -0.44, PI / 2);
    // barrel + 3.5mm jack muzzle
    add(g, new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12), dark, 0, 0.005, -0.52, PI / 2);
    const jack = new THREE.Group(); jack.position.set(0, 0.005, -0.6); g.add(jack);
    add(jack, new THREE.CylinderGeometry(0.02, 0.02, 0.09, 16), steel, 0, 0, -0.045, PI / 2);
    add(jack, new THREE.CylinderGeometry(0.021, 0.021, 0.008, 16), dark, 0, 0, -0.03, PI / 2);
    add(jack, new THREE.CylinderGeometry(0.021, 0.021, 0.008, 16), dark, 0, 0, -0.06, PI / 2);
    add(jack, new THREE.SphereGeometry(0.02, 12, 8), steel, 0, 0, -0.09);
    this.muzzleLocal = new THREE.Vector3(0, 0.005, -0.72);
    // sight with glowing dot
    add(g, RB(0.04, 0.025, 0.07), dark, 0, 0.078, -0.04);
    add(g, RB(0.006, 0.03, 0.012), dark, -0.019, 0.1, -0.06); add(g, RB(0.006, 0.03, 0.012), dark, 0.019, 0.1, -0.06);
    add(g, RB(0.044, 0.006, 0.012), dark, 0, 0.116, -0.06);
    const glass = add(g, new THREE.PlaneGeometry(0.032, 0.026), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.18 }), 0, 0.1, -0.06); glass.userData.noOutline = true;
    const dot = add(g, new THREE.SphereGeometry(0.0025, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.6, 0.8) }), 0, 0.1, -0.061); dot.userData.noOutline = true;
    // mag (curved-ish, marigold)
    const mag = new THREE.Group(); mag.position.set(0, -0.06, -0.08); g.add(mag); this.mag = mag;
    add(mag, RB(0.045, 0.16, 0.075), gold, 0, -0.08, -0.01, 0.18);
    add(mag, RB(0.05, 0.02, 0.085), dark, 0, -0.16, -0.025, 0.18);
    // grip
    add(g, RB(0.045, 0.12, 0.055), dark, 0, -0.1, 0.1, -0.3);
    // stock
    add(g, RB(0.06, 0.09, 0.2), cream, 0, -0.01, 0.28);
    add(g, RB(0.065, 0.1, 0.03), teal, 0, -0.01, 0.39);
    // the coiled aux cord: grip → stock
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120; const a = t * PI * 2 * 9; pts.push(new THREE.Vector3(0.05 + Math.cos(a) * 0.022, -0.08 + t * 0.05 + Math.sin(a) * 0.022, 0.08 + t * 0.22)); }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0055, 6), red, 0, 0, 0);
    // label decal
    const lab = add(g, new THREE.PlaneGeometry(0.11, 0.028), new THREE.MeshBasicMaterial({ map: labelTex(), transparent: true }), 0.0385, -0.025, -0.08, 0, PI / 2); lab.userData.noOutline = true;

    // hands & sleeves
    const rh = new THREE.Group(); rh.position.set(0.012, -0.11, 0.11); g.add(rh);
    add(rh, RB(0.075, 0.08, 0.09), glove, 0.025, 0, 0, 0, 0, -0.1);
    add(rh, RB(0.02, 0.06, 0.06), red, 0.065, 0.01, 0);
    add(rh, new THREE.CylinderGeometry(0.045, 0.05, 0.36, 12), sleeve, 0.08, -0.07, 0.17, 1.15, 0, -0.2);
    const lh = new THREE.Group(); lh.position.set(-0.01, -0.06, -0.33); g.add(lh); this.leftHand = lh;
    add(lh, RB(0.09, 0.05, 0.1), glove, -0.01, -0.01, 0);
    add(lh, RB(0.03, 0.06, 0.08), glove, -0.05, 0.03, 0);
    add(lh, new THREE.CylinderGeometry(0.045, 0.05, 0.42, 12), sleeve, -0.12, -0.08, 0.16, 1.2, 0, 0.5);

    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    addOutlines(g, outlineMaterial(0.0035));
    this.root = new THREE.Group(); this.root.add(g); this.scene.add(this.root);
    this.base = new THREE.Vector3(0.16, -0.18, -0.4);

    // muzzle flash sprite
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTexture(), color: new THREE.Color(3, 2.4, 1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.set(0.22, 0.22, 1); this.flash.visible = false; g.add(this.flash); this.flash.position.copy(this.muzzleLocal);
    this.flashT = 0;

    // animation state
    this.kick = 0; this.kickRot = 0; this.swayX = 0; this.swayY = 0; this.bobT = 0; this.reloadT = 0; this.reloadDur = 2.0; this.lower = 0; this.equip = 1; this.tilt = 0;
  }
  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  fire() { this.kick = 1; this.kickRot = 1; this.flashT = 0.045; this.flash.visible = true; this.flash.material.rotation = Math.random() * PI; const s = 0.18 + Math.random() * 0.12; this.flash.scale.set(s, s, 1); }
  startReload(d) { this.reloadT = d; this.reloadDur = d; }
  // muzzle position in camera space (for world tracers)
  muzzleCam(out) { this.gun.updateMatrixWorld(true); return out.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld); }
  update(dt, s) {
    // s: { moving, speed, onGround, lookDX, lookDY, lowered, tilt }
    this.kick = Math.max(0, this.kick - dt * 14); this.kickRot = Math.max(0, this.kickRot - dt * 10);
    this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false;
    this.swayX += (-s.lookDX * 0.0006 - this.swayX) * Math.min(1, dt * 10); this.swayY += (s.lookDY * 0.0006 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.04, 0.04); this.swayY = THREE.MathUtils.clamp(this.swayY, -0.04, 0.04);
    if (s.moving && s.onGround) this.bobT += dt * (6 + s.speed * 0.9);
    const bobA = s.moving && s.onGround ? Math.min(1, s.speed / 6) : 0;
    const bx = Math.sin(this.bobT) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bobT)) * 0.012 * bobA;
    this.lower += ((s.lowered ? 1 : 0) - this.lower) * Math.min(1, dt * 8);
    this.equip = Math.max(0, this.equip - dt * 3);
    this.tilt += (s.tilt - this.tilt) * Math.min(1, dt * 10);
    let rx = this.kickRot * 0.06, ry = 0, rz = this.tilt;
    let px = this.base.x + bx + this.swayX, py = this.base.y + by + this.swayY - (s.onGround ? 0 : 0.015), pz = this.base.z + this.kick * 0.045;
    // reload: tilt the gun, drop + reinsert the mag
    if (this.reloadT > 0) {
      this.reloadT -= dt; const t = 1 - this.reloadT / this.reloadDur;
      const w = Math.sin(Math.min(1, t * 1.15) * PI);
      rz += w * 0.55; rx += w * 0.2; py -= w * 0.05;
      const out = t > 0.15 && t < 0.6 ? Math.min(1, (t - 0.15) / 0.15) : t >= 0.6 && t < 0.8 ? 1 - (t - 0.6) / 0.2 : 0;
      this.mag.position.y = -0.06 - out * 0.35; this.mag.visible = !(t > 0.33 && t < 0.45);
      this.leftHand.position.y = -0.06 - out * 0.12;
    } else { this.mag.position.y = -0.06; this.mag.visible = true; this.leftHand.position.y = -0.06; }
    py -= this.lower * 0.35 + this.equip * 0.3; rx -= this.lower * 0.6 + this.equip * 0.8;
    this.root.position.set(px, py, pz);
    this.root.rotation.set(rx, ry, rz);
  }
}

function labelTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#ECE8E1'; x.font = '40px "Bebas Neue", Impact, sans-serif'; x.textBaseline = 'middle'; x.fillText('THE AUX CORD', 6, 34);
  x.fillStyle = '#FF4655'; x.fillRect(220, 18, 30, 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
