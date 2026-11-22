// Deadline Bots: original robot agents (capsule body, helmet with glowing red visor, small blaster).
import * as THREE from 'three';
import { moveBody, lineOfSight, raycast } from './physics.js';
import { outlineMaterial, addOutlines } from './builder.js';
import { nameTagTexture } from './textures.js';

const PI = Math.PI;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

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
        totalEmissiveRadiance += vec3(uFlash*1.5, uFlash*0.3, uFlash*0.3);`);
  };
  mat.customProgramCacheKey = () => 'dissolve';
  return mat;
}

function buildModel(uni, hdrVisor = 4) {
  const root = new THREE.Group(); const rig = new THREE.Group(); root.add(rig);
  const armor = dissolvable(new THREE.MeshStandardMaterial({ color: 0x3a4a5c, roughness: 0.55, metalness: 0.2 }), uni);
  const plate = dissolvable(new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.5, metalness: 0.1 }), uni);
  const red = dissolvable(new THREE.MeshStandardMaterial({ color: 0xff4655, roughness: 0.5 }), uni);
  const dark = dissolvable(new THREE.MeshStandardMaterial({ color: 0x141c24, roughness: 0.6 }), uni);
  const visor = dissolvable(new THREE.MeshStandardMaterial({ color: 0x220008, emissive: new THREE.Color(1, 0.08, 0.15), emissiveIntensity: hdrVisor, roughness: 0.2 }), uni);
  const P = {};
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  // legs (pivot at hip)
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0, 0.86, s * 0.14); rig.add(hip);
    add(hip, new THREE.CapsuleGeometry(0.1, 0.42, 4, 10), armor, 0, -0.3, 0);
    add(hip, new THREE.SphereGeometry(0.1, 10, 8), plate, 0.06, -0.42, 0).scale.set(0.8, 0.9, 1);
    add(hip, new THREE.BoxGeometry(0.26, 0.12, 0.17), dark, 0.05, -0.8, 0);
    P[s < 0 ? 'legL' : 'legR'] = hip;
  }
  add(rig, new THREE.BoxGeometry(0.28, 0.18, 0.42), dark, 0, 0.9, 0);
  const torso = new THREE.Group(); torso.position.set(0, 0.95, 0); rig.add(torso); P.torso = torso;
  add(torso, new THREE.CapsuleGeometry(0.24, 0.32, 6, 14), armor, 0, 0.32, 0).scale.set(0.85, 1, 1.15);
  add(torso, new THREE.BoxGeometry(0.16, 0.34, 0.44), plate, 0.15, 0.36, 0);
  add(torso, new THREE.BoxGeometry(0.05, 0.08, 0.46), red, 0.22, 0.28, 0);
  const clock = add(torso, new THREE.TorusGeometry(0.07, 0.018, 8, 20), visor, 0.235, 0.44, 0.1, 0, PI / 2, 0); clock.userData.noOutline = true;
  add(torso, new THREE.BoxGeometry(0.18, 0.32, 0.32), dark, -0.2, 0.36, 0);
  const ant = add(torso, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), dark, -0.26, 0.66, 0.1); ant.userData.noOutline = true;
  const tip = add(torso, new THREE.SphereGeometry(0.03, 8, 6), visor, -0.26, 0.82, 0.1); tip.userData.noOutline = true;
  for (const s of [-1, 1]) add(torso, new THREE.SphereGeometry(0.13, 12, 10), plate, 0, 0.55, s * 0.3).scale.set(1, 0.8, 1);
  // head
  const head = new THREE.Group(); head.position.set(0, 0.68, 0); torso.add(head); P.head = head;
  add(head, new THREE.CylinderGeometry(0.07, 0.09, 0.1, 10), dark, 0, -0.02, 0);
  add(head, new THREE.SphereGeometry(0.2, 18, 14), plate, 0, 0.14, 0).scale.set(1.05, 1, 0.95);
  add(head, new THREE.SphereGeometry(0.205, 18, 10, -0.9, 1.8, 1.15, 0.55), visor, 0.0, 0.14, 0, 0, PI, 0).userData.noOutline = true;
  add(head, new THREE.BoxGeometry(0.06, 0.06, 0.38), red, -0.02, 0.33, 0);
  add(head, new THREE.BoxGeometry(0.06, 0.14, 0.06), dark, -0.05, 0.12, 0.2);
  add(head, new THREE.BoxGeometry(0.06, 0.14, 0.06), dark, -0.05, 0.12, -0.2);
  // arms + gun (pivot at shoulder)
  const arms = new THREE.Group(); arms.position.set(0, 0.5, 0); torso.add(arms); P.arms = arms;
  add(arms, new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), armor, 0.18, -0.08, 0.28, 0, 0, PI / 2.4);
  add(arms, new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), armor, 0.2, -0.08, -0.22, 0.5, 0, PI / 2.4);
  const gun = new THREE.Group(); gun.position.set(0.42, -0.12, 0.05); arms.add(gun); P.gun = gun;
  add(gun, new THREE.BoxGeometry(0.42, 0.11, 0.08), dark, 0.12, 0, 0);
  add(gun, new THREE.BoxGeometry(0.08, 0.16, 0.06), dark, 0.02, -0.1, 0, 0, 0, -0.3);
  add(gun, new THREE.BoxGeometry(0.2, 0.04, 0.085), red, 0.1, 0.07, 0);
  const muzzle = add(gun, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), visor, 0.36, 0, 0, 0, 0, PI / 2); muzzle.userData.noOutline = true;
  P.muzzle = muzzle;
  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, rig, P, mats: [armor, plate, red, dark, visor] };
}

export class Bot {
  constructor(scene, name, x, z, opts = {}) {
    this.scene = scene; this.name = name;
    this.uni = { uDis: { value: 0 }, uFlash: { value: 0 } };
    const m = buildModel(this.uni);
    this.root = m.root; this.rig = m.rig; this.P = m.P; this.mats = m.mats;
    this.outline = outlineMaterial(0.022); addOutlines(this.rig, this.outline);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(name), depthTest: true, transparent: true }));
    tag.scale.set(1.9, 0.36, 1); tag.position.y = 2.25; this.root.add(tag); this.tag = tag;
    this.pos = new THREE.Vector3(x, 0, z); this.vel = new THREE.Vector3(); this.onGround = true;
    this.anchor = new THREE.Vector3(x, 0, z);
    this.yaw = opts.yaw ?? PI / 2; this.root.position.copy(this.pos);
    this.hp = opts.hp ?? 100; this.alive = true; this.dying = 0;
    this.aware = false; this.react = 0; this.fireCd = 1 + Math.random(); this.strafe = 0; this.strafeT = 0; this.seeT = 0; this.lostT = 0; this.canSee = false;
    this.hideT = 0; this.hidePos = null; this.mode = 'hold'; this.path = []; this.pathT = 0;
    this.difficulty = opts.difficulty ?? 0; this.hunt = false; this.rush = opts.rush || null; this.frozen = true;
    this.walk = 0; this.flash = 0; this.peekCycle = 2 + Math.random() * 2; this.lastSeenPos = new THREE.Vector3();
    this.fallDir = 1; this.wasHeadshot = false;
    scene.add(this.root);
  }
  get eye() { return _w.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }
  head() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.66, this.pos.z); }
  dispose() { this.scene.remove(this.root); }

  damage(n, fromDir, headshot) {
    if (!this.alive) return false;
    this.hp -= n; this.flash = 1; this.aware = true; this.react = Math.min(this.react, 0.35);
    if (this.hp <= 0) { this.alive = false; this.dying = 0.0001; this.fallDir = fromDir; this.wasHeadshot = headshot; this.tag.visible = false; return true; }
    return false;
  }

  update(dt, G) {
    const p = this.pos;
    if (!this.alive) { this.updateDeath(dt); return; }
    if (this.frozen) { this.pose(dt, 0); return; }
    const player = G.player;
    const target = _v.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const toP = new THREE.Vector3(target.x - p.x, 0, target.z - p.z); const dist = toP.length(); toP.normalize();

    // perception (throttled)
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.12;
      const fwd = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const inFov = fwd.dot(toP) > 0.15 || dist < 9 || this.aware;
      this.canSee = player.alive && dist < 70 && inFov && lineOfSight(this.eye, target);
      if (this.canSee) {
        if (!this.aware) { this.aware = true; this.react = 0.55 + Math.random() * 0.4 - this.difficulty * 0.1; }
        this.lostT = 0; this.lastSeenPos.copy(player.pos);
      }
    }
    if (!this.canSee) this.lostT += dt;
    if (this.react > 0) this.react -= dt;

    // movement intent
    let want = new THREE.Vector3(); let speed = 0;
    const perp = new THREE.Vector3(-toP.z, 0, toP.x);
    if (this.rush && _w.set(this.rush.x - p.x, 0, this.rush.z - p.z).length() < 6.5) { this.anchor.copy(p); this.rush = null; this.hunt = true; }
    if (this.rush) {
      if (!this.canSee || Math.random() < 0.0) { speed = 4.2; want.copy(this.followPath(G, this.rush, dt)); }
      else { speed = 2.4; want.copy(this.followPath(G, this.rush, dt)).multiplyScalar(0.6).addScaledVector(perp, this.strafeDir(dt) * 0.7); }
    } else if (this.canSee) {
      this.mode = 'engage';
      // peek / hide cycle
      this.peekCycle -= dt;
      if (this.hidePos) {
        this.hideT -= dt;
        _w.subVectors(this.hidePos, p); _w.y = 0;
        if (_w.length() > 0.3) { want.copy(_w.normalize()); speed = 3.6; }
        if (this.hideT <= 0) { this.hidePos = null; this.peekCycle = 2.5 + Math.random() * 2.5; }
      } else {
        speed = 2.5; want.copy(perp).multiplyScalar(this.strafeDir(dt));
        _w.subVectors(this.anchor, p); _w.y = 0;
        if (!this.hunt && _w.length() > 3.2) want.addScaledVector(_w.normalize(), 1.2);
        if (this.peekCycle <= 0) { this.peekCycle = 3; this.hidePos = this.findCover(player); this.hideT = 1.3 + Math.random() * 0.9; }
      }
    } else if (this.hidePos) {
      this.hideT -= dt; _w.subVectors(this.hidePos, p); _w.y = 0;
      if (_w.length() > 0.3) { want.copy(_w.normalize()); speed = 3.6; }
      if (this.hideT <= 0) this.hidePos = null; // step back out to peek
    } else if (this.hunt || (this.aware && this.lostT > 1.5 && this.lostT < 7)) {
      const goal = this.hunt ? player.pos : this.lastSeenPos;
      speed = this.hunt ? 3.8 : 3.0; want.copy(this.followPath(G, goal, dt));
      _w.subVectors(this.anchor, p); _w.y = 0;
      if (!this.hunt && _w.length() > 7) { want.copy(_w.normalize()); }
    } else {
      _w.subVectors(this.anchor, p); _w.y = 0;
      if (_w.length() > 0.6) { want.copy(_w.normalize()); speed = 3; }
    }

    const ts = G.timeScale;
    const accel = 14;
    this.vel.x += (want.x * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (want.z * speed - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= 22 * dt;
    const r = moveBody(p, this.vel, dt, 0.42, 1.85, this.onGround); this.onGround = r.onGround;
    // auto-hop small ledges if stuck
    if (speed > 0 && this.onGround && Math.hypot(this.vel.x, this.vel.z) < 0.3 && Math.random() < dt * 2) this.vel.y = 6;

    // facing
    let desired = this.yaw;
    if (this.aware && (this.canSee || this.lostT < 1.0)) desired = Math.atan2(-(this.lastSeenPos.z - p.z), this.lastSeenPos.x - p.x);
    else if (Math.hypot(this.vel.x, this.vel.z) > 0.5) desired = Math.atan2(-this.vel.z, this.vel.x);
    let d = desired - this.yaw; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
    this.yaw += d * Math.min(1, 7 * dt);

    // fire
    this.fireCd -= dt;
    if (this.canSee && this.react <= 0 && this.fireCd <= 0 && Math.abs(d) < 0.5 && !this.hidePos) {
      const base = [1.75, 1.5, 1.3, 1.15][Math.min(3, this.difficulty)];
      this.fireCd = base + Math.random() * 0.7;
      G.botFire(this, target, dist);
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    this.pose(dt, Math.hypot(this.vel.x, this.vel.z), d);
  }

  strafeDir(dt) {
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.0; const r = Math.random(); this.strafe = r < 0.4 ? -1 : r < 0.8 ? 1 : 0; }
    return this.strafe;
  }

  findCover(player) {
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.6, player.pos.z);
    let best = null, bd = 1e9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2; const r = 1.8 + (i % 2) * 1.2;
      const c = new THREE.Vector3(this.anchor.x + Math.cos(a) * r, this.pos.y + 1.3, this.anchor.z + Math.sin(a) * r);
      // spot must be reachable (no wall between) and hidden from the player
      const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z), to = c.clone(); to.y = this.pos.y + 1.0;
      if (!lineOfSight(from, to)) continue;
      if (lineOfSight(c, eye)) continue;
      const dd = c.distanceTo(this.pos); if (dd < bd) { bd = dd; best = c; }
    }
    if (best) best.y = 0;
    return best;
  }

  followPath(G, goal, dt) {
    const p = this.pos;
    this.pathT -= dt;
    // direct if visible
    const eyeA = new THREE.Vector3(p.x, p.y + 1.0, p.z), eyeB = new THREE.Vector3(goal.x, (goal.y || 0) + 1.0, goal.z);
    if (this.pathT <= 0) {
      this.pathT = 1.2;
      if (lineOfSight(eyeA, eyeB) && widthClear(eyeA, eyeB)) this.path = [];
      else this.path = G.nav.path(p, goal);
    }
    let tgt = this.path.length ? this.path[0] : goal;
    _w.set(tgt.x - p.x, 0, tgt.z - p.z);
    if (this.path.length && _w.length() < 1.2) { this.path.shift(); tgt = this.path.length ? this.path[0] : goal; _w.set(tgt.x - p.x, 0, tgt.z - p.z); }
    const L = _w.length(); if (L < 0.8 && !this.path.length) return new THREE.Vector3();
    return _w.clone().divideScalar(L || 1);
  }

  pose(dt, speed, turn = 0) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.walk += dt * (speed > 0.3 ? 2.2 + speed * 1.6 : 0);
    const sw = speed > 0.3 ? Math.sin(this.walk) * Math.min(0.6, speed * 0.16) : 0;
    this.P.legL.rotation.z = sw; this.P.legR.rotation.z = -sw;
    const t = performance.now() / 1000;
    this.P.torso.position.y = 0.95 + Math.abs(Math.cos(this.walk)) * (speed > 0.3 ? 0.04 : 0) + Math.sin(t * 2 + this.anchor.x) * 0.01;
    this.P.torso.rotation.x = Math.sin(t * 1.3 + this.anchor.z) * 0.03 - turn * 0.1;
    this.uni.uFlash.value = this.flash;
  }

  updateDeath(dt) {
    this.dying += dt;
    const t = this.dying;
    // ragdoll-ish fall: knees buckle, torso topples away from the shot
    const fall = Math.min(1, t / 0.55); const e = fall * fall;
    const bounce = t > 0.55 && t < 0.8 ? Math.sin((t - 0.55) / 0.25 * PI) * 0.08 : 0;
    this.rig.rotation.z = (e * 1.45 - bounce) * this.fallDir;
    this.rig.position.y = -e * 0.05;
    this.P.legL.rotation.z = e * 0.6; this.P.legR.rotation.z = e * 0.3;
    this.P.head.rotation.z = e * (this.wasHeadshot ? 0.9 : 0.4);
    this.P.arms.rotation.z = -e * 1.2; this.P.gun.position.y = -0.12 - e * 0.1;
    if (t > 0.9) { this.uni.uDis.value = Math.min(1.05, (t - 0.9) / 0.9); this.outline.uniforms.o.value = 0; }
    this.root.position.copy(this.pos);
    if (t > 1.9) this.root.visible = false;
  }
}

function widthClear(a, b) {
  // check two parallel offset rays so bots don't graze corners
  const d = new THREE.Vector3().subVectors(b, a); d.y = 0; const L = d.length(); if (L < 0.1) return true; d.normalize();
  const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.45);
  return lineOfSight(a.clone().add(n), b.clone().add(n)) && lineOfSight(a.clone().sub(n), b.clone().sub(n));
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

// Glowing, slow, dodgeable bot shots.
export class Projectiles {
  constructor(scene, particles) {
    this.ps = particles; this.list = [];
    this.geo = new THREE.SphereGeometry(0.11, 10, 8);
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.7, 1.0) });
    this.pool = []; this.scene = scene;
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(this.geo, this.mat); m.visible = false; scene.add(m); this.pool.push(m); }
  }
  spawn(from, dir, speed, dmg, owner) {
    const m = this.pool.find((x) => !x.visible); if (!m) return;
    m.visible = true; m.position.copy(from);
    this.list.push({ m, v: dir.clone().multiplyScalar(speed), dmg, life: 4, owner, whiz: false });
  }
  update(dt, G) {
    const pl = G.player;
    this.list = this.list.filter((o) => {
      o.life -= dt; if (o.life <= 0) { o.m.visible = false; return false; }
      const a = o.m.position.clone(); const step = o.v.clone().multiplyScalar(dt); const L = step.length();
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
        this.ps.burst(o.m.position, 12, { speed: 4, color: [5, 0.8, 1], size: 0.07, life: 0.35, grav: 6 });
        o.m.visible = false; return false;
      }
      o.m.position.add(step);
      if (Math.random() < 0.8) this.ps.emit(o.m.position.x, o.m.position.y, o.m.position.z, 0, 0, 0, 3, 0.4, 0.6, 0.12, 0.22, 0, 0);
      return true;
    });
  }
  clear() { this.list.forEach((o) => (o.m.visible = false)); this.list = []; }
}
function closestOnSeg(a, b, p) {
  const ab = b.clone().sub(a); const L2 = ab.lengthSq(); let t = L2 > 0 ? p.clone().sub(a).dot(ab) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const c = a.clone().addScaledVector(ab, t); return { t, d: c.distanceTo(p) };
}
