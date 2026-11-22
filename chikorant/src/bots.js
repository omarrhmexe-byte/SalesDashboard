// Deadline Bots: original robot agents (capsule body, helmet with glowing red visor, small blaster).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { moveBody, lineOfSight, raycast, groundHeight } from './physics.js';
import { outlineMaterial, addOutlines } from './builder.js';
import { nameTagTexture } from './textures.js';
import { Streaks, mergeChildren } from './fx.js';

const PI = Math.PI;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const NOISE_GLSL = `
float hash3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }`;

function dissolvable(mat, uni) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDis = uni.uDis; sh.uniforms.uFlash = uni.uFlash;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWP; uniform float uDis; uniform float uFlash;\n${NOISE_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dn = vnoise(vWP*6.0)*0.7 + vnoise(vWP*17.0)*0.3;
        if (dn < uDis) discard;
        if (uDis > 0.0 && dn < uDis + 0.07) totalEmissiveRadiance += vec3(4.0,0.6,0.8);
        totalEmissiveRadiance += vec3(uFlash*0.8, uFlash*0.16, uFlash*0.2);`);
  };
  mat.customProgramCacheKey = () => 'dissolve';
  return mat;
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,220,225,0.9)'); g.addColorStop(0.45, 'rgba(255,90,110,0.32)'); g.addColorStop(1, 'rgba(255,40,70,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}

// Shared geometry (every bot reuses the same buffers).
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const RB = (w, h, d, r = 0.3) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * r);
  GEO = {
    boot: RB(0.3, 0.13, 0.18, 0.35), shin: new THREE.CapsuleGeometry(0.082, 0.26, 4, 10), thigh: new THREE.CapsuleGeometry(0.098, 0.24, 4, 10),
    knee: new THREE.SphereGeometry(0.075, 12, 8), pelvis: RB(0.3, 0.18, 0.4, 0.4), belt: RB(0.32, 0.05, 0.42, 0.4),
    abdomen: new THREE.CylinderGeometry(0.15, 0.17, 0.22, 14), chest: new THREE.CapsuleGeometry(0.23, 0.2, 6, 16),
    plate: RB(0.1, 0.3, 0.36, 0.35), stripe: RB(0.04, 0.06, 0.38, 0.4), pack: RB(0.16, 0.34, 0.3, 0.3), packLid: RB(0.18, 0.06, 0.32, 0.4),
    ant: new THREE.CylinderGeometry(0.011, 0.011, 0.3, 6), antTip: new THREE.SphereGeometry(0.032, 10, 8),
    clock: new THREE.TorusGeometry(0.062, 0.016, 8, 24), hand: RB(0.012, 0.05, 0.012, 0.4), pad: new THREE.SphereGeometry(0.12, 14, 10),
    neck: new THREE.CylinderGeometry(0.075, 0.09, 0.12, 12), helmet: new THREE.SphereGeometry(0.205, 22, 16),
    visor: new THREE.SphereGeometry(0.212, 22, 8, PI - 1.0, 2.0, 1.18, 0.52), eye: new THREE.SphereGeometry(0.218, 22, 4, PI - 0.78, 1.56, 1.43, 0.09),
    crest: RB(0.3, 0.07, 0.05, 0.45), ear: new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), earRing: new THREE.TorusGeometry(0.05, 0.012, 6, 18),
    upper: new THREE.CapsuleGeometry(0.068, 0.2, 4, 8), fore: new THREE.CapsuleGeometry(0.062, 0.18, 4, 8), glove: new THREE.SphereGeometry(0.07, 10, 8),
    gBody: RB(0.4, 0.12, 0.09, 0.35), gGrip: RB(0.07, 0.15, 0.06, 0.35), gRail: RB(0.22, 0.035, 0.095, 0.4), gCell: new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12),
    gBarrel: new THREE.CylinderGeometry(0.028, 0.032, 0.12, 12), gRing: new THREE.TorusGeometry(0.034, 0.011, 8, 18),
  };
  return GEO;
}

// Place a capsule between two points.
function limb(parent, geo, mat, ax, ay, az, bx, by, bz) {
  const m = new THREE.Mesh(geo, mat);
  _v.set(bx - ax, by - ay, bz - az); const L = _v.length();
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.quaternion.setFromUnitVectors(UP, _v.divideScalar(L || 1));
  m.castShadow = true; parent.add(m); return m;
}

function buildModel(uni, hdrVisor = 4) {
  const G = geos();
  const root = new THREE.Group(); const rig = new THREE.Group(); root.add(rig);
  const D = (m) => dissolvable(m, uni);
  const armor = D(new THREE.MeshStandardMaterial({ color: 0x4d6684, roughness: 0.4, metalness: 0.3 }));
  const plate = D(new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.38, metalness: 0.05 }));
  const red = D(new THREE.MeshStandardMaterial({ color: 0xff4655, roughness: 0.4, metalness: 0.1 }));
  const dark = D(new THREE.MeshStandardMaterial({ color: 0x151d26, roughness: 0.55, metalness: 0.3 }));
  const glass = D(new THREE.MeshStandardMaterial({ color: 0x1a0308, emissive: new THREE.Color(1, 0.1, 0.18), emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.4 }));
  const visor = D(new THREE.MeshStandardMaterial({ color: 0x220008, emissive: new THREE.Color(1, 0.08, 0.15), emissiveIntensity: hdrVisor, roughness: 0.2 }));
  const P = {};
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const glow = (m) => { m.userData.noOutline = true; m.castShadow = false; return m; };

  // legs: hip pivot → thigh, knee pivot → shin + boot
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0, 0.88, s * 0.13); rig.add(hip);
    add(hip, G.thigh, armor, 0, -0.2, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.4, 0); hip.add(knee);
    add(knee, G.knee, plate, 0.05, 0, 0).scale.set(0.8, 1, 0.9);
    add(knee, G.shin, armor, 0, -0.19, 0);
    add(knee, G.boot, dark, 0.05, -0.41, 0);
    add(knee, G.stripe, red, 0.05, -0.36, 0, 0, 0, 0).scale.set(1.2, 0.5, 0.45);
    P[s < 0 ? 'legL' : 'legR'] = hip; P[s < 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  add(rig, G.pelvis, dark, 0, 0.9, 0);
  add(rig, G.belt, red, 0, 0.96, 0);

  // torso (pivot at the waist)
  const torso = new THREE.Group(); torso.position.set(0, 0.95, 0); rig.add(torso); P.torso = torso;
  add(torso, G.abdomen, dark, 0, 0.1, 0);
  const chest = add(torso, G.chest, armor, 0, 0.38, 0); chest.scale.set(0.82, 0.9, 1.08);
  add(torso, G.plate, plate, 0.15, 0.4, 0, 0, 0, -0.08);
  add(torso, G.stripe, red, 0.2, 0.27, 0, 0, 0, -0.08);
  // the "deadline" clock emblem
  const clk = new THREE.Group(); clk.position.set(0.205, 0.45, 0.085); clk.rotation.set(0, PI / 2, -0.08); torso.add(clk);
  glow(add(clk, G.clock, visor, 0, 0, 0));
  const hh = glow(add(clk, G.hand, visor, 0, 0.018, 0.004)); const mh = glow(add(clk, G.hand, visor, 0.016, 0.0, 0.004, 0, 0, -1.2)); mh.scale.y = 0.8; hh.scale.y = 0.75;
  P.clockHand = mh; mh.userData.keep = true;
  add(torso, G.pack, dark, -0.21, 0.42, 0);
  add(torso, G.packLid, armor, -0.22, 0.6, 0);
  glow(add(torso, G.ant, dark, -0.25, 0.74, 0.1));
  const tip = glow(add(torso, G.antTip, visor, -0.25, 0.9, 0.1)); P.antTip = tip; tip.userData.keep = true;
  for (const s of [-1, 1]) add(torso, G.pad, plate, -0.01, 0.56, s * 0.29).scale.set(0.95, 0.75, 0.85);

  // head
  const head = new THREE.Group(); head.position.set(0, 0.62, 0); head.scale.setScalar(1.08); torso.add(head); P.head = head;
  add(head, G.neck, dark, 0, 0.0, 0);
  add(head, G.helmet, plate, 0, 0.1, 0).scale.set(1.04, 0.98, 1.0);
  glow(add(head, G.visor, glass, 0.0, 0.1, 0));
  glow(add(head, G.eye, visor, 0.0, 0.1, 0));
  add(head, G.crest, red, -0.02, 0.3, 0);
  for (const s of [-1, 1]) { add(head, G.ear, dark, -0.02, 0.1, s * 0.2, PI / 2, 0, 0); glow(add(head, G.earRing, red, -0.02, 0.1, s * 0.232)); }

  // arms + gun (group pivots at the shoulders so the whole aim can kick / flop)
  const arms = new THREE.Group(); arms.position.set(0, 0.52, 0); torso.add(arms); P.arms = arms;
  // right arm → grip, left arm → fore-end
  limb(arms, G.upper, armor, 0, 0, 0.29, 0.08, -0.26, 0.25); limb(arms, G.fore, armor, 0.08, -0.26, 0.25, 0.3, -0.24, 0.1);
  add(arms, G.glove, dark, 0.31, -0.23, 0.09);
  limb(arms, G.upper, armor, 0, 0, -0.29, 0.12, -0.24, -0.24); limb(arms, G.fore, armor, 0.12, -0.24, -0.24, 0.47, -0.17, -0.0);
  add(arms, G.glove, dark, 0.48, -0.16, 0.0);
  const gun = new THREE.Group(); gun.position.set(0.3, -0.16, 0.05); arms.add(gun); P.gun = gun;
  add(gun, G.gBody, dark, 0.16, 0, 0);
  add(gun, G.gGrip, dark, 0.02, -0.09, 0, 0, 0, -0.35);
  add(gun, G.gRail, red, 0.14, 0.07, 0);
  glow(add(gun, G.gCell, visor, 0.12, -0.01, 0.052, 0, 0, PI / 2)); // energy cell (charges up before a shot)
  add(gun, G.gBarrel, armor, 0.41, 0.01, 0, 0, 0, PI / 2);
  const ring = glow(add(gun, G.gRing, visor, 0.47, 0.01, 0, 0, PI / 2, 0)); P.muzzle = ring; ring.userData.keep = true;
  const mg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(4, 0.9, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  mg.position.set(0.5, 0.01, 0); mg.scale.setScalar(0.001); gun.add(mg); P.muzzleGlow = mg;
  const groups = []; rig.traverse((o) => { if (o.isGroup || o === rig) groups.push(o); });
  groups.forEach(mergeChildren);
  // shadows: skip tiny parts (gloves, knee caps) whose shadow is a couple of texels anyway
  rig.traverse((o) => { if (o.isMesh && !o.userData.noOutline) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.castShadow = o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) >= 0.1; } });
  return { root, rig, P, mats: { armor, plate, red, dark, visor, glass } };
}

// damped spring helper for flops and flinches
function spring(s, target, k, c, dt) { s.v += ((target - s.x) * k - s.v * c) * dt; s.x += s.v * dt; return s.x; }
const SP = () => ({ x: 0, v: 0 });

export class Bot {
  constructor(scene, name, x, z, opts = {}) {
    this.scene = scene; this.name = name;
    this.uni = { uDis: { value: 0 }, uFlash: { value: 0 } };
    const m = buildModel(this.uni);
    this.root = m.root; this.rig = m.rig; this.P = m.P; this.mats = m.mats;
    this.outline = outlineMaterial(0.02); addOutlines(this.rig, this.outline);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(name), depthTest: true, transparent: true }));
    tag.scale.set(1.8, 0.34, 1); tag.position.y = 2.28; this.root.add(tag); this.tag = tag;
    // stand on raised posts (A platform, B stage) instead of spawning inside them
    this.pos = new THREE.Vector3(x, groundHeight(x, z, 0.42, 1.5), z); this.vel = new THREE.Vector3(); this.onGround = true;
    this.anchor = new THREE.Vector3(x, 0, z);
    this.yaw = opts.yaw ?? PI / 2; this.root.position.copy(this.pos);
    this.hp = opts.hp ?? 100; this.alive = true; this.dying = 0;
    this.aware = false; this.react = 0; this.fireCd = 1 + Math.random(); this.strafe = 0; this.strafeT = 0; this.seeT = Math.random() * 0.1; this.lostT = 0; this.canSee = false;
    this.hidePos = null; this.mode = 'hold'; this.stateT = 0; this.path = []; this.pathT = 0;
    this.peekPos = new THREE.Vector3(x, 0, z); this.exposeT = 2.5; this.coverT = 0; this.shots = 0; this.seeStreak = 0;
    this.difficulty = opts.difficulty ?? 0; this.hunt = false; this.rush = opts.rush || null; this.guard = null; this.frozen = true;
    this.walk = Math.random() * 6; this.flash = 0; this.lastSeenPos = new THREE.Vector3(x, 0, z);
    this.fallDir = 1; this.wasHeadshot = false;
    this.seed = Math.random() * 100; this.charge = 0; this.kick = 0; this.muzzleT = 0;
    this.fl = { x: SP(), z: SP(), h: SP() }; this.lean = SP(); this.leanS = SP();
    this.stuckT = 0; this.stuckFrom = new THREE.Vector3(x, 0, z); this.unstuckT = 0; this.unstuckDir = new THREE.Vector3(); this.forceNav = 0;
    this.hitLocal = new THREE.Vector2(-1, 0);
    scene.add(this.root);
  }
  get eye() { return _w.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }
  head() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.66, this.pos.z); }
  dispose() {
    this.scene.remove(this.root);
    // free per-bot GPU buffers (merged geometry, name tag texture); shared geometry and the
    // materials (whose compiled programs are shared by every bot) are kept
    const shared = new Set(Object.values(geos()));
    this.root.traverse((o) => { if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose(); });
    this.tag.material.map?.dispose();
  }

  // dir (optional THREE.Vector3): direction the shot travelled, for the flinch / fall direction.
  damage(n, fromDir, headshot, dir = null) {
    if (!this.alive) return false;
    this.hp -= n; this.flash = 1; this.aware = true; this.react = Math.min(this.react, 0.35);
    // local (model) direction of the hit: model forward is +x
    if (dir) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); const lx = dir.x * c - dir.z * s, lz = dir.x * s + dir.z * c; const L = Math.hypot(lx, lz) || 1; this.hitLocal.set(lx / L, lz / L); }
    else this.hitLocal.set(-fromDir, 0);
    const hx = this.hitLocal.x, hz = this.hitLocal.y, k = headshot ? 1.6 : 1;
    // flinch impulse (torso snaps away from the shot, head jerks on headshots)
    this.fl.x.v += -hx * 9 * k; this.fl.z.v += hz * 9 * k; this.fl.h.v += headshot ? 22 : 6;
    this.fireCd = Math.max(this.fireCd, 0.4); this.charge = 0; // getting hit interrupts the shot
    if (this.hp <= 0) {
      this.alive = false; this.dying = 0.0001; this.deathT = 0; this.fallDir = fromDir; this.wasHeadshot = headshot; this.tag.visible = false;
      this.initRagdoll(headshot);
      return true;
    }
    return false;
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  setMode(m) { if (this.mode !== m) { this.mode = m; this.stateT = 0; } }

  update(dt, G) {
    const p = this.pos;
    // draw-call LOD: the 2cm ink outline is sub-pixel beyond ~22m, so skip its ~24 draws per bot
    if (this.alive) { const c = G.camera.position; this.outline.visible = (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 22 * 22; }
    if (!this.alive) { this.updateDeath(dt, G); return; }
    if (this.frozen) { this.pose(dt, 0, 0); return; }
    const player = G.player;
    const target = _u.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const toP = new THREE.Vector3(target.x - p.x, 0, target.z - p.z); const dist = toP.length(); toP.divideScalar(dist || 1);
    this.stateT += dt;

    // perception (throttled)
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.12;
      const fwd = _v.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const inFov = fwd.dot(toP) > 0.15 || dist < 9 || this.aware;
      this.canSee = player.alive && dist < 70 && inFov && lineOfSight(this.eye, target);
      if (this.canSee) {
        if (!this.aware) { this.aware = true; this.react = 0.55 + Math.random() * 0.4 - this.difficulty * 0.1; }
        this.lostT = 0; this.lastSeenPos.copy(player.pos);
      }
    }
    if (!this.canSee) { this.lostT += dt; this.seeStreak = 0; } else this.seeStreak += dt;
    if (this.react > 0) this.react -= dt;

    // movement intent
    const want = new THREE.Vector3(); let speed = 0;
    const perp = new THREE.Vector3(-toP.z, 0, toP.x);
    const goTo = (pt, sp, stop = 0.3) => { _w.set(pt.x - p.x, 0, pt.z - p.z); const L = _w.length(); if (L > stop) { want.copy(_w.divideScalar(L)); speed = sp; } return L; };
    let canFire = false;

    if (this.rush) {
      // final round: head for the cake, then fight around it
      if (Math.hypot(this.rush.x - p.x, this.rush.z - p.z) < 5.5) {
        const a = Math.random() * PI * 2, r = 2 + Math.random() * 1.6;
        this.guard = this.rush.clone(); this.anchor.set(this.rush.x + Math.cos(a) * r, 0, this.rush.z + Math.sin(a) * r);
        this.rush = null; this.peekPos.copy(p); this.exposeT = 2 + Math.random() * 1.5;
        if (!this.canSee && this.lostT > 3) this.lastSeenPos.copy(this.anchor);
        this.setMode(this.canSee ? 'engage' : 'search');
      } else {
        want.copy(this.followPath(G, this.rush, dt));
        if (this.canSee) { speed = 2.6; want.multiplyScalar(0.75).addScaledVector(perp, this.strafeDir(dt) * 0.55); canFire = true; }
        else speed = 4.2;
      }
    }
    if (!this.rush) {
      const leash = this.hunt ? 1e9 : this.guard ? 7 : 8;
      if (this.mode === 'hold') {
        if (this.canSee && this.aware) { this.peekPos.copy(p); this.setMode('engage'); this.exposeT = 2 + Math.random() * 1.5; }
        else if (this.hunt) this.setMode('hunt');
        else if (this.aware && this.lostT > 1 && this.lostT < 8) this.setMode('search');
        else goTo(this.anchor, 3, 0.6);
      }
      if (this.mode === 'engage') {
        canFire = true;
        if (!this.canSee && this.lostT > 0.7) this.setMode(this.hunt ? 'hunt' : 'peek'); // lost them: step back to where we could see
        else {
          // strafe around the peek spot
          speed = 2.3; want.copy(perp).multiplyScalar(this.strafeDir(dt));
          _w.set(this.peekPos.x - p.x, 0, this.peekPos.z - p.z);
          if (_w.length() > 1.6) want.addScaledVector(_w.normalize(), 1.1);
          if (this.hunt && dist > 13) want.addScaledVector(toP, 0.8);
          _w.set(this.anchor.x - p.x, 0, this.anchor.z - p.z);
          if (!this.hunt && _w.length() > leash) want.addScaledVector(_w.normalize(), 1);
          if (!this.strafe && want.lengthSq() < 0.01) speed = 0;
          this.exposeT -= dt;
          if (this.exposeT <= 0 && this.shots > 0) {
            const c = this.findCover(player);
            if (c) { this.hidePos = c; this.peekPos.copy(p); this.coverT = 1.3 + Math.random() * 1.0; this.shots = 0; this.covers = (this.covers || 0) + 1; this.setMode('cover'); }
            else this.exposeT = 1.2;
          }
        }
      } else if (this.mode === 'cover') {
        const L = goTo(this.hidePos, 3.8, 0.3);
        if (L < 0.5 || this.stateT > 2.5) this.coverT -= dt;
        if (this.coverT <= 0) this.setMode('peek');
        else if (this.canSee && this.seeStreak > 0.5 && L < 0.5) { this.peekPos.copy(p); this.exposeT = 1.5; this.setMode('engage'); } // flanked: fight from here
      } else if (this.mode === 'peek') {
        const L = goTo(this.peekPos, 2.9, 0.25);
        canFire = true;
        if (this.canSee) { this.react = Math.max(this.react, 0.25); this.exposeT = 2.2 + Math.random() * 1.4; this.setMode('engage'); }
        else if (L < 0.4 || this.stateT > 3) this.setMode(this.hunt ? 'hunt' : 'search');
      } else if (this.mode === 'search') {
        if (this.canSee) { this.peekPos.copy(p); this.exposeT = 2 + Math.random() * 1.5; this.setMode('engage'); }
        else if (this.hunt) this.setMode('hunt');
        else if (this.lostT > 8) this.setMode('hold');
        else {
          speed = 3.0; want.copy(this.followPath(G, this.lastSeenPos, dt));
          _w.set(this.anchor.x - p.x, 0, this.anchor.z - p.z);
          if (_w.length() > leash) want.copy(_w.normalize());
        }
      } else if (this.mode === 'hunt') {
        if (this.canSee) { this.peekPos.copy(p); this.exposeT = 2.5 + Math.random() * 1.5; this.setMode('engage'); }
        else { speed = 3.6; want.copy(this.followPath(G, player.pos, dt)); }
      }
    }

    // separation from other bots (no stacking up in doorways)
    for (const o of G.bots) {
      if (o === this || !o.alive) continue;
      const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.6 && d > 1e-3) { const f = ((1.6 - d) / 1.6) * 3; want.x += (dx / d) * f; want.z += (dz / d) * f; if (speed < 1.6) speed = 1.6; }
    }
    // unstick: sidestep for a moment
    if (this.unstuckT > 0) { this.unstuckT -= dt; want.addScaledVector(this.unstuckDir, 1.5); speed = Math.max(speed, 2.5); }
    const wl = want.length(); if (wl > 1) want.divideScalar(wl); else if (wl < 0.05) speed = 0;

    const accel = 12;
    this.vel.x += (want.x * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (want.z * speed - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= 22 * dt;
    const r = moveBody(p, this.vel, dt, 0.42, 1.85, this.onGround); this.onGround = r.onGround;
    // stuck detection: wanted to move but barely did
    this.stuckT += dt;
    if (this.stuckT > 0.6) {
      const moved = Math.hypot(p.x - this.stuckFrom.x, p.z - this.stuckFrom.z);
      if (speed > 1 && moved < 0.25) {
        this.strafe = -this.strafe; this.pathT = 0; this.forceNav = 2;
        const s = Math.random() < 0.5 ? -1 : 1; this.unstuckDir.set(-want.z * s, 0, want.x * s); this.unstuckT = 0.45;
        if (this.onGround && this.mode !== 'engage') this.vel.y = 6; // hop small ledges (not while strafing)
        if (this.mode === 'cover' || this.mode === 'peek') { this.stuckN = (this.stuckN || 0) + 1; if (this.stuckN > 1) { this.stuckN = 0; this.peekPos.copy(p); this.exposeT = 2; this.setMode('engage'); } }
      }
      this.stuckT = 0; this.stuckFrom.copy(p);
    }
    if (this.forceNav > 0) this.forceNav -= dt;

    // facing
    let desired = this.yaw;
    if (this.aware && (this.canSee || this.lostT < 1.0)) desired = Math.atan2(-(this.lastSeenPos.z - p.z), this.lastSeenPos.x - p.x);
    else if (Math.hypot(this.vel.x, this.vel.z) > 0.5) desired = Math.atan2(-this.vel.z, this.vel.x);
    let d = desired - this.yaw; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
    this.yaw += d * Math.min(1, 7 * dt);

    // fire: the blaster visibly charges for ~0.45s before every shot (a fair, dodgeable tell)
    this.fireCd -= dt;
    const ready = canFire && this.canSee && this.react <= 0 && Math.abs(d) < 0.5;
    if (ready && !this.wasReady) this.fireCd = Math.max(this.fireCd, 0.45); // always show the full charge-up
    this.wasReady = ready;
    this.charge = ready ? Math.max(0, Math.min(1, 1 - this.fireCd / 0.45)) : Math.max(0, this.charge - dt * 4);
    if (ready && this.fireCd <= 0) {
      const base = [1.8, 1.55, 1.35, 1.2][Math.min(3, this.difficulty)];
      this.fireCd = (base + Math.random() * 0.7) * (this.rush ? 1.35 : 1); this.shots++; // rushers on the move fire less
      G.botFire(this, target.clone(), dist);
    }
    this.flash = Math.max(0, this.flash - dt * 9);
    this.pose(dt, Math.hypot(this.vel.x, this.vel.z), d);
  }

  // called by the game when a shot leaves the barrel
  onFire() { this.kick = 1; this.muzzleT = 1; this.charge = 0; }

  strafeDir(dt) {
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.7 + Math.random() * 1.0; const r = Math.random(); this.strafe = r < 0.4 ? -1 : r < 0.8 ? 1 : 0; }
    return this.strafe;
  }

  // A nearby spot, reachable in a straight line, where the player can't see this bot's head or chest.
  findCover(player) {
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.6, player.pos.z), aim = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const p = this.pos; const from = new THREE.Vector3(p.x, p.y + 0.9, p.z);
    const toP = _v.set(player.pos.x - p.x, 0, player.pos.z - p.z).normalize().clone();
    const c = new THREE.Vector3(), probe = new THREE.Vector3();
    let best = null, bs = -1e9; const off = Math.random() * PI;
    for (const r of [1.3, 2.2, 3.2, 4.4]) {
      for (let i = 0; i < 12; i++) {
        const a = off + (i / 12) * PI * 2; const dx = Math.cos(a), dz = Math.sin(a);
        c.set(p.x + dx * r, p.y + 0.9, p.z + dz * r);
        if (Math.abs(groundHeight(c.x, c.z, 0.4, p.y + 0.5) - p.y) > 0.3) continue; // flat, not on/inside a prop
        probe.set(c.x + dx * 0.45, c.y, c.z + dz * 0.45);
        if (!widthClear(from, probe)) continue;
        c.y = p.y + 1.55; if (lineOfSight(eye, c)) continue;
        c.y = p.y + 1.05; if (lineOfSight(eye, c)) continue;
        c.y = p.y + 1.6; if (lineOfSight(c, aim)) continue; // and we can't see them (same test as perception)
        // prefer short, sideways hops near home (so the peek back out is a quick sidestep)
        const fwd = dx * toP.x + dz * toP.z;
        const score = -r - Math.max(0, fwd) * 2.5 - Math.abs(fwd) * 0.5 - c.distanceTo(this.guard || this.anchor) * 0.15;
        if (score > bs) { bs = score; best = c.clone(); }
      }
      if (best) break;
    }
    if (best) best.y = 0;
    return best;
  }

  followPath(G, goal, dt) {
    const p = this.pos;
    this.pathT -= dt;
    const eyeA = new THREE.Vector3(p.x, p.y + 1.0, p.z), eyeB = new THREE.Vector3(goal.x, (goal.y || 0) + 1.0, goal.z);
    if (this.pathT <= 0) {
      this.pathT = 1.2;
      if (this.forceNav <= 0 && lineOfSight(eyeA, eyeB) && widthClear(eyeA, eyeB)) this.path = [];
      else {
        this.path = G.nav.path(p, goal);
        // skip waypoints we've already passed: if the next one is directly reachable, drop the first
        while (this.path.length > 1 && widthClear(eyeA, _v.set(this.path[1].x, p.y + 1.0, this.path[1].z))) this.path.shift();
        // already walking the leg A→B? don't turn back to A just because it is still the nearest node
        // (that made bots shuttle forever between a node and the next doorway)
        const lg = this.leg;
        if (lg && this.path.length > 1 && this.path[0].distanceToSquared(lg[0]) < 0.01 && this.path[1].distanceToSquared(lg[1]) < 0.01) this.path.shift();
      }
    }
    let tgt = this.path.length ? this.path[0] : goal;
    _w.set(tgt.x - p.x, 0, tgt.z - p.z);
    if (this.path.length && _w.length() < 1.2) { const reached = this.path.shift(); tgt = this.path.length ? this.path[0] : goal; this.leg = this.path.length ? [reached, tgt.clone()] : null; _w.set(tgt.x - p.x, 0, tgt.z - p.z); }
    const L = _w.length(); if (L < 0.8 && !this.path.length) return new THREE.Vector3();
    return _w.clone().divideScalar(L || 1);
  }

  // ── animation ────────────────────────────────────────────────────────────
  pose(dt, speed, turn = 0) {
    const P = this.P;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const t = performance.now() / 1000 + this.seed;
    const moving = speed > 0.3;
    this.walk += dt * (moving ? 3 + speed * 1.7 : 0);
    // split velocity into model-forward / sideways so strafing steps sideways
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const vf = this.vel.x * c - this.vel.z * s, vs = this.vel.x * s + this.vel.z * c;
    const amp = moving ? Math.min(0.65, speed * 0.17) : 0;
    const fwdK = speed > 0.01 ? vf / speed : 0, sideK = speed > 0.01 ? vs / speed : 0;
    const sw = Math.sin(this.walk) * amp;
    P.legL.rotation.z = sw * fwdK; P.legR.rotation.z = -sw * fwdK;
    P.legL.rotation.x = -Math.max(0, sw) * sideK * 0.8; P.legR.rotation.x = Math.max(0, -sw) * sideK * 0.8;
    P.kneeL.rotation.z = -Math.max(0, Math.sin(this.walk + 1.2)) * amp * 1.3; P.kneeR.rotation.z = -Math.max(0, Math.sin(this.walk + 1.2 + PI)) * amp * 1.3;
    // flinch springs + body lean into movement
    const fx = spring(this.fl.x, 0, 160, 13, dt), fz = spring(this.fl.z, 0, 160, 13, dt), fh = spring(this.fl.h, 0, 200, 14, dt);
    const lean = spring(this.lean, -vf * 0.035, 40, 10, dt), leanS = spring(this.leanS, vs * 0.03, 40, 10, dt);
    // idle: breathing, weight shift, look-around when unaware
    const breathe = Math.sin(t * 2.1) * 0.012;
    P.torso.position.y = 0.95 + (moving ? Math.abs(Math.cos(this.walk)) * 0.045 - 0.02 : 0) + breathe;
    P.torso.rotation.z = lean + fx * 0.9 + Math.sin(t * 1.3) * 0.025 - turn * 0.08;
    P.torso.rotation.x = leanS + fz * 0.9 + Math.sin(t * 0.9) * 0.03;
    P.torso.rotation.y = moving ? Math.sin(this.walk) * 0.08 : Math.sin(t * 0.7) * 0.05;
    this.rig.rotation.x = moving ? 0 : Math.sin(t * 0.9 + 1) * 0.015; // weight shift
    P.head.rotation.y = this.aware ? Math.sin(t * 1.7) * 0.05 : Math.sin(t * 0.55) * 0.45;
    P.head.rotation.z = fh * 0.35 + (this.aware ? 0 : Math.sin(t * 0.8) * 0.06);
    P.head.rotation.x = fz * 0.6;
    // arms: relaxed when unaware, raised when fighting; recoil kick on each shot
    this.kick = Math.max(0, this.kick - dt * 7);
    this.aimK = (this.aimK ?? 0) + ((this.aware ? 1 : 0) - (this.aimK ?? 0)) * Math.min(1, dt * 5);
    P.arms.rotation.z = (1 - this.aimK) * -0.42 + this.kick * 0.22 + fx * 0.6 + Math.sin(t * 2.1) * 0.02;
    P.arms.rotation.y = (1 - this.aimK) * 0.25;
    P.gun.position.x = 0.3 - this.kick * 0.06;
    // muzzle: charge glow → flash
    this.muzzleT = Math.max(0, this.muzzleT - dt * 7);
    const g = Math.max(this.charge * this.charge * 0.32, this.muzzleT * 0.75);
    P.muzzleGlow.scale.setScalar(Math.max(0.001, g * (1 + Math.sin(t * 40) * 0.08)));
    P.muzzleGlow.visible = g > 0.002; // don't spend a draw call on an invisible sprite
    P.muzzleGlow.material.opacity = Math.min(1, 0.5 + g * 2);
    this.mats.visor.emissiveIntensity = 4 + this.charge * 2.5 + this.muzzleT * 3;
    P.clockHand.rotation.z = -t * 2;
    P.antTip.scale.setScalar(1 + (Math.sin(t * 6) > 0.6 ? 0.35 : 0));
    this.tag.position.y = 2.28 + Math.sin(t * 1.6) * 0.03;
    this.uni.uFlash.value = this.flash;
  }

  // ── death: a little physics ragdoll (topple about the feet with bounces, floppy limbs), then dissolve
  initRagdoll(headshot) {
    const hx = this.hitLocal.x, hz = this.hitLocal.y;
    this.rd = {
      th: 0.04, w: headshot ? 3.4 : 2.4, ax: new THREE.Vector3(hz, 0, -hx).normalize(), dirx: hx, dirz: hz, lim: PI / 2 - 0.08, bounces: 0, settled: false,
      arms: { x: this.P.arms.rotation.z, v: -6 }, head: { x: 0, v: headshot ? 16 : 5 }, legs: SP(), knees: SP(), torso: { x: 0, v: headshot ? -4 : -2 }, slide: 0,
      gunV: new THREE.Vector3(hx * 2.2, 3.2, hz * 2.2), gunW: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, 10 + Math.random() * 6), gun: false,
    };
  }
  updateDeath(dt, G) {
    if (this.deathT === undefined) { this.deathT = 0; this.initRagdoll(this.wasHeadshot); }
    this.deathT += dt; this.dying = this.deathT * 0.9; // the game removes us at dying > 2 (≈2.2s)
    const t = this.deathT, R = this.rd, P = this.P;
    if (!R.settled) {
      // falling rod about the feet: angular accel ∝ sin(θ)
      R.w += 9 * Math.sin(R.th + 0.15) * dt; R.th += R.w * dt;
      if (R.th >= R.lim) {
        R.th = R.lim; R.w = -R.w * (R.bounces ? 0.22 : 0.32); R.bounces++;
        // impact: everything flops
        R.arms.v += 9; R.head.v += 7; R.legs.v += 6; R.knees.v -= 5; R.torso.v += 4;
        if (G && R.bounces === 1) {
          const c = _v.set(R.dirx, 0, R.dirz); const cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
          const wx = c.x * cs + c.z * sn, wz = -c.x * sn + c.z * cs;
          const at = new THREE.Vector3(this.pos.x + wx * 1.1, this.pos.y + 0.15, this.pos.z + wz * 1.1);
          G.ps.puff?.(at, 7, { size: 0.45, life: 1.1, speed: 1.8, color: [0.72, 0.64, 0.56], alpha: 0.5 });
          G.ps.sparkBurst?.(at, 10, { speed: 4, color: [5, 1, 1.3], width: 0.01, life: 0.3 });
        }
        if (Math.abs(R.w) < 0.5 || R.bounces > 2) { R.settled = true; R.w = 0; }
      }
    }
    _q.setFromAxisAngle(R.ax, R.th); this.rig.quaternion.copy(_q);
    const lying = Math.sin(R.th);
    R.slide += (lying * 0.35 - R.slide) * Math.min(1, dt * 6);
    this.rig.position.set(R.dirx * R.slide, lying * 0.16 - Math.min(1, t / 0.2) * 0.12 * (1 - lying), R.dirz * R.slide);
    // floppy joints (low damping springs → overshoot)
    P.arms.rotation.z = spring(R.arms, -1.5, 55, 4, dt);
    P.arms.rotation.y = R.arms.x * 0.2;
    P.head.rotation.z = spring(R.head, this.wasHeadshot ? 0.7 : 0.4, 60, 4.5, dt);
    P.head.rotation.x = R.head.x * 0.3;
    P.torso.rotation.z = spring(R.torso, -0.25, 50, 5, dt) * Math.sign(-R.dirx || 1); P.torso.rotation.x = 0; P.torso.rotation.y = 0;
    const lg = spring(R.legs, 0.45, 45, 4, dt), kn = spring(R.knees, -0.8, 45, 4, dt);
    P.legL.rotation.z = lg * -Math.sign(R.dirx || 1); P.legR.rotation.z = lg * 0.6 * -Math.sign(R.dirx || 1); P.legL.rotation.x = 0; P.legR.rotation.x = 0;
    P.kneeL.rotation.z = kn; P.kneeR.rotation.z = kn * 0.7;
    // the blaster flies out of their hands
    const gun = P.gun;
    if (!R.gun) {
      R.gun = true; this.root.attach(gun); // root space == model space, so gunV/gunW apply directly
      P.muzzleGlow.visible = false;
    }
    R.gunV.y -= 18 * dt; gun.position.addScaledVector(R.gunV, dt);
    gun.rotation.x += R.gunW.x * dt; gun.rotation.y += R.gunW.y * dt; gun.rotation.z += R.gunW.z * dt;
    if (gun.position.y < 0.06) { gun.position.y = 0.06; R.gunV.y = Math.abs(R.gunV.y) * 0.3; R.gunV.x *= 0.5; R.gunV.z *= 0.5; R.gunW.multiplyScalar(0.4); if (Math.abs(R.gunV.y) < 0.4) R.gunV.y = 0; }
    // visor powers down
    this.mats.visor.emissiveIntensity = Math.max(0.15, 4 * (1 - t / 0.7)) * (t < 0.7 && Math.sin(t * 60) > 0.3 ? 0.4 : 1);
    this.mats.glass.emissiveIntensity = Math.max(0, 0.55 * (1 - t / 0.5));
    this.flash = Math.max(0, this.flash - dt * 4); this.uni.uFlash.value = this.flash;
    if (t > 1.15) { this.uni.uDis.value = Math.min(1.05, (t - 1.15) / 0.9); this.outline.uniforms.o.value = 0; }
    this.root.position.copy(this.pos);
    if (t > 2.1) this.root.visible = false;
  }
}

function widthClear(a, b) {
  // two parallel offset rays (and one low ray) so bots don't graze corners or walk into low walls
  const d = new THREE.Vector3().subVectors(b, a); d.y = 0; const L = d.length(); if (L < 0.1) return true; d.normalize();
  const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.45);
  const lo = new THREE.Vector3(0, -0.35, 0);
  return lineOfSight(a.clone().add(n), b.clone().add(n)) && lineOfSight(a.clone().sub(n), b.clone().sub(n)) && lineOfSight(a.clone().add(lo), b.clone().add(lo));
}

// Waypoint graph navigation.
export class Nav {
  constructor(nodes, edges) {
    this.ids = Object.keys(nodes); this.p = {}; this.adj = {};
    for (const k of this.ids) { this.p[k] = new THREE.Vector3(nodes[k][0], 0, nodes[k][1]); this.adj[k] = []; }
    for (const [a, b] of edges) { const d = this.p[a].distanceTo(this.p[b]); this.adj[a].push([b, d]); this.adj[b].push([a, d]); }
  }
  nearest(pos) {
    let best = null, bd = 1e9; const a = new THREE.Vector3(pos.x, (pos.y || 0) + 1, pos.z);
    for (const k of this.ids) { const d = this.p[k].distanceTo(pos); if (d < bd && lineOfSight(a, _v.set(this.p[k].x, 1, this.p[k].z))) { bd = d; best = k; } }
    if (!best) for (const k of this.ids) { const d = this.p[k].distanceTo(pos); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  path(from, to) {
    const s = this.nearest(from), g = this.nearest(to); if (!s || !g) return [];
    const dist = {}, prev = {}, open = new Set(this.ids);
    for (const k of this.ids) dist[k] = Infinity; dist[s] = 0;
    while (open.size) {
      let u = null, ud = Infinity; for (const k of open) if (dist[k] < ud) { ud = dist[k]; u = k; }
      if (!u || u === g) break; open.delete(u);
      for (const [v, w] of this.adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const out = []; let c = g; while (c) { out.unshift(this.p[c].clone()); if (c === s) break; c = prev[c]; }
    out.push(new THREE.Vector3(to.x, 0, to.z));
    return out;
  }
}

// Glowing, slow, dodgeable bot shots: hot core + soft halo + a long fading tail.
export class Projectiles {
  constructor(scene, particles) {
    this.ps = particles; this.list = [];
    this.geo = new THREE.SphereGeometry(0.075, 10, 8);
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.2, 2.6) });
    this.haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3.2, 0.5, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.tails = new Streaks(scene, 48, { tail: 1 });
    this.pool = []; this.scene = scene;
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(this.geo, this.mat); m.visible = false;
      const h = new THREE.Sprite(this.haloMat); h.scale.setScalar(0.7); m.add(h);
      scene.add(m); this.pool.push(m);
    }
  }
  spawn(from, dir, speed, dmg, owner) {
    const m = this.pool.find((x) => !x.visible); if (!m) return;
    m.visible = true; m.position.copy(from);
    this.list.push({ m, v: dir.clone().multiplyScalar(speed), dmg, life: 4, owner, whiz: false, start: from.clone(), age: 0 });
  }
  update(dt, G) {
    const pl = G.player; const st = this.tails; st.begin();
    this.list = this.list.filter((o) => {
      o.life -= dt; o.age += dt; if (o.life <= 0) { o.m.visible = false; return false; }
      const a = o.m.position.clone(); const step = o.v.clone().multiplyScalar(dt); const L = step.length();
      if (L < 1e-6) return true;
      const dir = step.clone().divideScalar(L);
      const hit = raycast(a.x, a.y, a.z, dir.x, dir.y, dir.z, L);
      // player capsule test (segment vs vertical segment, approx)
      if (pl.alive) {
        const pc = new THREE.Vector3(pl.pos.x, 0, pl.pos.z);
        const segClosest = closestOnSeg(new THREE.Vector3(a.x, 0, a.z), new THREE.Vector3(a.x + step.x, 0, a.z + step.z), pc);
        const t = segClosest.t; const y = a.y + step.y * t;
        const dxz = segClosest.d;
        if (dxz < 0.42 && y > pl.pos.y && y < pl.pos.y + 1.85 && (!hit || hit.t > L * t)) {
          G.playerHit(o.dmg, o.owner); o.m.visible = false;
          this.ps.burst(o.m.position, 10, { speed: 3, color: [5, 0.8, 1], size: 0.06, life: 0.3 });
          return false;
        }
        if (!o.whiz && dxz < 2.2 && Math.abs(y - (pl.pos.y + 1.5)) < 2) { o.whiz = true; G.whiz(); }
      }
      if (hit) {
        o.m.position.addScaledVector(dir, hit.t);
        const n = new THREE.Vector3(hit.normal[0], hit.normal[1], hit.normal[2]);
        this.ps.burst(o.m.position, 10, { speed: 3, color: [5, 0.8, 1], size: 0.08, life: 0.35, grav: 4 });
        this.ps.sparkBurst?.(o.m.position, 12, { speed: 6, color: [[5, 0.9, 1.2], [5, 2.4, 2.6]], dir: n, spread: 0.9, width: 0.012, life: 0.3 });
        this.ps.puff?.(o.m.position, 2, { size: 0.3, life: 0.6, color: [0.55, 0.5, 0.48], dir: n, alpha: 0.35 });
        o.m.visible = false; return false;
      }
      o.m.position.add(step);
      // tail (shorter right after spawn so it starts at the muzzle)
      const tl = Math.min(2.2, o.age * 22, o.m.position.distanceTo(o.start));
      const q = o.m.position;
      st.push(q.x, q.y, q.z, q.x - dir.x * tl, q.y - dir.y * tl, q.z - dir.z * tl, 4, 0.7, 1.0, 0.9, 0.065);
      o.m.children[0].scale.setScalar(0.66 + Math.sin(o.age * 30) * 0.08);
      if (Math.random() < 0.5) this.ps.emit(q.x, q.y, q.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 3, 0.4, 0.6, 0.09, 0.3, 0, 0);
      return true;
    });
    st.end();
  }
  clear() { this.list.forEach((o) => (o.m.visible = false)); this.list = []; this.tails.begin(); this.tails.end(); }
}
function closestOnSeg(a, b, p) {
  const ab = b.clone().sub(a); const L2 = ab.lengthSq(); let t = L2 > 0 ? p.clone().sub(a).dot(ab) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const c = a.clone().addScaledVector(ab, t); return { t, d: c.distanceTo(p) };
}
