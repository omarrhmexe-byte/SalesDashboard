// Particles (additive glow points + velocity-stretched sparks + soft dust puffs), tracers,
// bullet decals, confetti, fireworks.
import * as THREE from 'three';
import { decalTexture } from './textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Draw-call saver for hand-built models: merge a group's direct mesh children that share a
// material (and outline flag) into one mesh. Children with userData.keep (animated / referenced)
// and sub-groups are left alone. Call before adding outlines.
export function mergeChildren(group) {
  const buckets = new Map();
  for (const o of group.children) {
    if (!o.isMesh || o.userData.keep || o.isSprite) continue;
    const key = o.material.uuid + (o.userData.noOutline ? ':n' : ':o');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      o.updateMatrix(); let g = o.geometry.clone().applyMatrix4(o.matrix);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      return g;
    });
    const merged = mergeGeometries(geos); if (!merged) continue;
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow; m.userData.noOutline = !!list[0].userData.noOutline; m.frustumCulled = list[0].frustumCulled;
    for (const o of list) group.remove(o);
    group.add(m);
  }
}

// ── Streaks: camera-facing soft line segments (instanced). Used for sparks, tracers, wind lines.
const STREAK_VS = `
attribute vec3 iA; attribute vec3 iB; attribute vec4 iC; attribute float iW;
varying vec3 vC; varying float vA; varying vec2 vUv;
void main(){
  vec4 a = modelViewMatrix * vec4(iA, 1.0);
  vec4 b = modelViewMatrix * vec4(iB, 1.0);
  vec3 ax = b.xyz - a.xyz; float L = length(ax);
  vec3 axn = L > 1e-5 ? ax / L : vec3(0.0, 1.0, 0.0);
  vec3 p = mix(a.xyz, b.xyz, position.y);
  vec3 side = cross(axn, normalize(p)); float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  p += side * iW * position.x + axn * iW * (position.y * 2.0 - 1.0);
  vUv = position.xy; vC = iC.rgb; vA = iC.a;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;
const STREAK_FS = `
uniform float uTail; varying vec3 vC; varying float vA; varying vec2 vUv;
void main(){
  float across = 1.0 - abs(vUv.x);
  float a = across * across * (1.0 - uTail * vUv.y) * vA;
  gl_FragColor = vec4(vC * (0.55 + across * 0.9), a);
}`;

export class Streaks {
  constructor(scene, max = 512, { tail = 0.85, additive = true } = {}) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    this.A = new Float32Array(max * 3); this.B = new Float32Array(max * 3); this.C = new Float32Array(max * 4); this.W = new Float32Array(max);
    const ia = (arr, n) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', ia(this.A, 3)); g.setAttribute('iB', ia(this.B, 3)); g.setAttribute('iC', ia(this.C, 4)); g.setAttribute('iW', ia(this.W, 1));
    g.instanceCount = 0; this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTail: { value: tail } }, vertexShader: STREAK_VS, fragmentShader: STREAK_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(ax, ay, az, bx, by, bz, r, g, b, a, w) {
    const i = this.n; if (i >= this.max) return; this.n++;
    const k = i * 3, c = i * 4;
    this.A[k] = ax; this.A[k + 1] = ay; this.A[k + 2] = az; this.B[k] = bx; this.B[k + 1] = by; this.B[k + 2] = bz;
    this.C[c] = r; this.C[c + 1] = g; this.C[c + 2] = b; this.C[c + 3] = a; this.W[i] = w;
  }
  end() {
    this.geo.instanceCount = this.n;
    if (this.n) for (const k of ['iA', 'iB', 'iC', 'iW']) { const at = this.geo.attributes[k]; at.needsUpdate = true; at.clearUpdateRanges?.(); at.addUpdateRange?.(0, this.n * at.itemSize); }
  }
}

// Velocity-stretched sparks with gravity, drag and floor bounce.
export class Sparks {
  constructor(scene, max = 900) {
    this.st = new Streaks(scene, max, { tail: 0.9 }); this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.L0 = new Float32Array(max); this.w = new Float32Array(max); this.g = new Float32Array(max); this.d = new Float32Array(max); this.s = new Float32Array(max);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, w = 0.012, life = 0.3, grav = 14, drag = 1.5, stretch = 0.035) {
    let i = this.n; if (i >= this.max) i = (Math.random() * this.max) | 0; else this.n++;
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.c[k] = r; this.c[k + 1] = g; this.c[k + 2] = b; this.life[i] = life; this.L0[i] = life; this.w[i] = w; this.g[i] = grav; this.d[i] = drag; this.s[i] = stretch;
  }
  burst(p, n, { speed = 8, color = [5, 3.4, 1.2], width = 0.012, life = 0.3, grav = 14, drag = 1.5, dir = null, spread = 1, stretch = 0.035 } = {}) {
    for (let i = 0; i < n; i++) {
      let vx = Math.random() - 0.5, vy = Math.random() - 0.5, vz = Math.random() - 0.5;
      const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      if (dir) { vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread; const m = Math.hypot(vx, vy, vz) || 1; vx /= m; vy /= m; vz /= m; }
      const s = speed * (0.35 + Math.random() * 0.9);
      const c = Array.isArray(color[0]) ? color[(Math.random() * color.length) | 0] : color;
      this.emit(p.x, p.y, p.z, vx * s, vy * s, vz * s, c[0], c[1], c[2], width * (0.6 + Math.random() * 0.8), life * (0.5 + Math.random() * 0.9), grav, drag, stretch);
    }
  }
  update(dt) {
    const st = this.st; st.begin();
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; this.move(this.n, i); continue; }
      const k = i * 3, dd = Math.max(0, 1 - this.d[i] * dt);
      this.v[k] *= dd; this.v[k + 1] = this.v[k + 1] * dd - this.g[i] * dt; this.v[k + 2] *= dd;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (this.p[k + 1] < 0.015) { this.p[k + 1] = 0.015; this.v[k + 1] *= -0.35; this.v[k] *= 0.6; this.v[k + 2] *= 0.6; }
      const t = this.life[i] / this.L0[i];
      let sx = this.v[k] * this.s[i], sy = this.v[k + 1] * this.s[i], sz = this.v[k + 2] * this.s[i];
      const sl = Math.hypot(sx, sy, sz); if (sl > 0.7) { const f = 0.7 / sl; sx *= f; sy *= f; sz *= f; }
      const fade = Math.min(1, t * 2.2);
      st.push(this.p[k], this.p[k + 1], this.p[k + 2], this.p[k] - sx, this.p[k + 1] - sy, this.p[k + 2] - sz, this.c[k], this.c[k + 1], this.c[k + 2], fade, this.w[i] * (0.5 + 0.5 * t));
      i++;
    }
    st.end();
  }
  move(from, to) {
    for (let c = 0; c < 3; c++) { this.p[to * 3 + c] = this.p[from * 3 + c]; this.v[to * 3 + c] = this.v[from * 3 + c]; this.c[to * 3 + c] = this.c[from * 3 + c]; }
    this.life[to] = this.life[from]; this.L0[to] = this.L0[from]; this.w[to] = this.w[from]; this.g[to] = this.g[from]; this.d[to] = this.d[from]; this.s[to] = this.s[from];
  }
  clear() { this.n = 0; this.st.begin(); this.st.end(); }
}

const PC_ATTRS = ['position', 'color', 'size', 'alpha'];

// Round point sprites. Additive = glow; normal = soft dust/smoke puffs that grow as they fade.
export class PointCloud {
  constructor(scene, { max = 3000, additive = true, grow = 0, uScale = null } = {}) {
    this.MAX = max; this.grow = grow;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.max = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.s0 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const frag = additive
      ? 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord-.5; float r = length(d); if(r>.5) discard; float a = smoothstep(.5,.0,r); gl_FragColor = vec4(vC*(0.6+a*1.4), a*vA); }'
      : 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord-.5; float r = length(d); if(r>.5) discard; float a = smoothstep(.5,.05,r); a*=a; gl_FragColor = vec4(vC*(0.85+0.3*(1.0-r*2.0)), a*vA); }';
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: uScale || { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float uScale; void main(){ vC=color; vA=alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: frag,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
    if (!additive) this.points.renderOrder = 4;
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0, alpha = 1) {
    let i = this.n; if (i >= this.MAX) { i = Math.floor(Math.random() * this.MAX); } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = size; this.s0[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = alpha; this.a0[i] = alpha;
  }
  burst(p, n, { speed = 6, color = [4, 2.5, 1], size = 0.06, life = 0.35, grav = 12, drag = 2, spread = 1, dir = null, jitterColor = 0, alpha = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      let vx = (Math.random() - 0.5) * 2, vy = (Math.random() - 0.5) * 2, vz = (Math.random() - 0.5) * 2;
      const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      if (dir) { vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread; }
      const s = speed * (0.4 + Math.random() * 0.8);
      const c = Array.isArray(color[0]) ? color[Math.floor(Math.random() * color.length)] : color;
      const j = 1 + (Math.random() - 0.5) * jitterColor;
      this.emit(p.x, p.y, p.z, vx * s, vy * s, vz * s, c[0] * j, c[1] * j, c[2] * j, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav, drag, alpha);
    }
  }
  update(dt) {
    let i = 0; const grow = this.grow;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; this.copy(this.n, i); continue; }
      const k = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; }
      const t = this.life[i] / this.max[i];
      if (grow) { this.alpha[i] = this.a0[i] * Math.min(1, t * 1.6) * Math.min(1, (1 - t) * 8 + 0.2); this.size[i] = this.s0[i] * (1 + (1 - t) * grow); }
      else { this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5); this.size[i] = this.s0[i] * (0.4 + 0.6 * t); }
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    // upload only the live range (the full buffers are up to 3000 particles), and nothing at all when idle
    if (this.n || this.lastN) for (const a of PC_ATTRS) { const at = this.geo.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, this.n) * at.itemSize); at.needsUpdate = true; }
    this.lastN = this.n;
  }
  copy(from, to) {
    for (let c = 0; c < 3; c++) { this.pos[to * 3 + c] = this.pos[from * 3 + c]; this.vel[to * 3 + c] = this.vel[from * 3 + c]; this.col[to * 3 + c] = this.col[from * 3 + c]; }
    this.size[to] = this.size[from]; this.s0[to] = this.s0[from]; this.life[to] = this.life[from]; this.max[to] = this.max[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.alpha[to] = this.alpha[from]; this.a0[to] = this.a0[from];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// The game's main particle system: glow points (emit/burst, as before) plus
//   .sparks  — stretched hot sparks           (sparkBurst)
//   .puffs   — soft normal-blended dust/smoke (puff)
//   emitters — short-lived callbacks for trails and auras (addEmitter)
export class Particles extends PointCloud {
  constructor(scene) {
    super(scene, { max: 3000, additive: true });
    this.sparks = new Sparks(scene);
    this.puffs = new PointCloud(scene, { max: 500, additive: false, grow: 2.2, uScale: this.mat.uniforms.uScale });
    this.emitters = [];
  }
  sparkBurst(p, n, opts) { this.sparks.burst(p, n, opts); }
  puff(p, n, { color = [0.62, 0.56, 0.5], size = 0.35, life = 0.9, speed = 1.2, dir = null, spread = 0.7, grav = -0.3, drag = 2.5, alpha = 0.55 } = {}) {
    this.puffs.burst(p, n, { color, size, life, speed, dir, spread, grav, drag, alpha });
  }
  // fn(dt, t, dur, particles) is called every update for `dur` seconds (scaled time); return false to stop early.
  addEmitter(fn, dur) { const e = { fn, t: 0, dur }; this.emitters.push(e); return e; }
  update(dt) {
    if (this.emitters.length) this.emitters = this.emitters.filter((e) => { e.t += dt; return e.fn(dt, Math.min(e.t, e.dur), e.dur, this) !== false && e.t < e.dur; });
    super.update(dt); this.sparks.update(dt); this.puffs.update(dt);
  }
  clear() { super.clear(); this.sparks.clear(); this.puffs.clear(); this.emitters = []; }
}

// Bullet tracers: a bright bolt that races from the muzzle to the hit point, over a faint
// beam that fades almost immediately.
export class Tracers {
  constructor(scene) {
    this.st = new Streaks(scene, 96, { tail: 0.92 });
    this.list = []; this.pool = []; this._d = new THREE.Vector3();
  }
  fire(a, b, color = null, width = 0.022, life = 0.07) {
    const c = color ? (color.isColor ? [color.r, color.g, color.b] : color) : [6, 4.2, 1.6];
    const L = a.distanceTo(b); if (L < 0.05) return;
    if (this.list.length >= 40) this.pool.push(this.list.shift());
    const o = this.pool.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3() };
    o.a.copy(a); o.b.copy(b); o.L = L; o.t = 0; o.life = life; o.c = c; o.w = width; o.speed = 240 + L * 2; o.bolt = Math.min(4, 1.2 + L * 0.1);
    this.list.push(o);
  }
  update(dt) {
    const st = this.st; st.begin(); const d = this._d; let keep = 0;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      o.t += dt; const tr = o.t * o.speed; const head = Math.min(o.L, tr); const tail = Math.max(0, Math.min(o.L, tr - o.bolt));
      d.subVectors(o.b, o.a).divideScalar(o.L);
      const beamA = Math.max(0, 1 - o.t / o.life);
      if (beamA > 0) st.push(o.a.x, o.a.y, o.a.z, o.b.x, o.b.y, o.b.z, o.c[0] * 0.5, o.c[1] * 0.5, o.c[2] * 0.5, beamA * 0.45, o.w * 0.45);
      if (tail < o.L) {
        st.push(o.a.x + d.x * head, o.a.y + d.y * head, o.a.z + d.z * head, o.a.x + d.x * tail, o.a.y + d.y * tail, o.a.z + d.z * tail, o.c[0], o.c[1], o.c[2], 1, o.w);
      }
      if (tail < o.L || beamA > 0) this.list[keep++] = o; else this.pool.push(o);
    }
    this.list.length = keep;
    st.end();
  }
}

export class Decals {
  constructor(scene) {
    this.pool = []; const mat = new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const g = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(g, mat); m.visible = false; scene.add(m); this.pool.push(m); }
    this.i = 0; this._n = new THREE.Vector3();
  }
  add(p, n) {
    const m = this.pool[this.i++ % this.pool.length];
    this._n.set(n[0], n[1], n[2]);
    m.position.copy(p).addScaledVector(this._n, 0.01);
    m.lookAt(this._n.add(m.position)); m.rotateZ(Math.random() * 6.28);
    const s = 0.8 + Math.random() * 0.5; m.scale.set(s, s, 1); m.visible = true;
  }
  clear() { this.pool.forEach((m) => (m.visible = false)); }
}

export class Confetti {
  constructor(scene) {
    this.N = 900;
    const g = new THREE.PlaneGeometry(0.12, 0.07);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true }), this.N);
    this.mesh.frustumCulled = false; this.mesh.count = 0; scene.add(this.mesh);
    this.p = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(1, 1, 1);
    this.cols = ['#FF4655', '#FFC21A', '#2F8F88', '#ECE8E1', '#ff5fd2', '#40e0ff'].map((c) => new THREE.Color(c).multiplyScalar(1.6));
  }
  burst(origin, n = 400, speed = 14) {
    for (let i = 0; i < n && this.p.length < this.N; i++) {
      const a = Math.random() * 6.28, up = 0.5 + Math.random();
      const s = speed * (0.3 + Math.random() * 0.8);
      this.p.push({ x: origin.x, y: origin.y, z: origin.z, vx: Math.cos(a) * s * 0.6, vy: up * s, vz: Math.sin(a) * s * 0.6, rx: Math.random() * 6, ry: Math.random() * 6, sx: (Math.random() - 0.5) * 12, sy: (Math.random() - 0.5) * 12, c: this.cols[i % this.cols.length], life: 7 + Math.random() * 3 });
    }
  }
  update(dt) {
    const keep = [];
    for (const o of this.p) {
      o.life -= dt; if (o.life <= 0) continue;
      o.vx *= 1 - 1.6 * dt; o.vz *= 1 - 1.6 * dt; o.vy -= 9 * dt; if (o.vy < -1.6) o.vy = -1.6 + (o.vy + 1.6) * 0.8;
      o.x += o.vx * dt + Math.sin(o.life * 3 + o.rx) * dt * 0.5; o.y += o.vy * dt; o.z += o.vz * dt; o.rx += o.sx * dt; o.ry += o.sy * dt;
      if (o.y < 0.02) { o.y = 0.02; o.vy = 0; o.vx = o.vz = 0; o.sx = o.sy = 0; }
      keep.push(o);
    }
    this.p = keep;
    const v = this._v || (this._v = new THREE.Vector3());
    this.p.forEach((o, i) => { this.q.setFromEuler(this.e.set(o.rx, o.ry, 0)); this.m.compose(v.set(o.x, o.y, o.z), this.q, this.s); this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, o.c); });
    this.mesh.count = this.p.length;
    if (!this.p.length) return; // nothing to upload (the buffers hold 900 instances; they used to be re-sent every frame)
    for (const at of [this.mesh.instanceMatrix, this.mesh.instanceColor]) { if (!at) continue; at.clearUpdateRanges(); at.addUpdateRange(0, this.p.length * at.itemSize); at.needsUpdate = true; }
  }
  clear() { this.p = []; this.mesh.count = 0; }
}

// Fireworks: rockets that rise and burst using the Particles system.
export class Fireworks {
  constructor(particles, onBurst) { this.ps = particles; this.rockets = []; this.onBurst = onBurst; }
  launch(x, z, h = 28 + Math.random() * 10) {
    const pal = [[3, 0.5, 0.7], [3, 2.2, 0.3], [0.5, 2.4, 2.2], [2.6, 2.5, 2.3], [2.6, 0.5, 2.4]];
    this.rockets.push({ x, y: 0.5, z, vy: 26 + Math.random() * 6, h, c: pal[Math.floor(Math.random() * pal.length)] });
  }
  update(dt) {
    this.rockets = this.rockets.filter((r) => {
      r.y += r.vy * dt; r.vy -= 6 * dt;
      this.ps.emit(r.x, r.y, r.z, (Math.random() - 0.5), -2, (Math.random() - 0.5), 4, 2.4, 1, 0.25, 0.4, 0, 1);
      if (r.y > r.h || r.vy < 4) {
        const p = new THREE.Vector3(r.x, r.y, r.z);
        this.ps.burst(p, 160, { speed: 16, color: r.c, size: 0.9, life: 1.8, grav: 4, drag: 1.2, jitterColor: 0.4 });
        this.ps.burst(p, 40, { speed: 6, color: [5, 5, 4.5], size: 0.4, life: 0.8, grav: 2, drag: 2 });
        if (this.onBurst) this.onBurst();
        return false;
      }
      return true;
    });
  }
}
