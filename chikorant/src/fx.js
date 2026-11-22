// Particles (additive glow points), tracers, bullet decals, confetti, fireworks.
import * as THREE from 'three';
import { decalTexture } from './textures.js';

const MAX = 3000;
export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.max = new Float32Array(MAX); this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX); this.s0 = new Float32Array(MAX);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float uScale; void main(){ vC=color; vA=alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord-.5; float r = length(d); if(r>.5) discard; float a = smoothstep(.5,.0,r); gl_FragColor = vec4(vC*(0.6+a*1.4), a*vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0) {
    let i = this.n; if (i >= MAX) { i = Math.floor(Math.random() * MAX); } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = size; this.s0[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = 1;
  }
  burst(p, n, { speed = 6, color = [4, 2.5, 1], size = 0.06, life = 0.35, grav = 12, drag = 2, spread = 1, dir = null, jitterColor = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      let vx = (Math.random() - 0.5) * 2, vy = (Math.random() - 0.5) * 2, vz = (Math.random() - 0.5) * 2;
      const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      if (dir) { vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread; }
      const s = speed * (0.4 + Math.random() * 0.8);
      const c = Array.isArray(color[0]) ? color[Math.floor(Math.random() * color.length)] : color;
      const j = 1 + (Math.random() - 0.5) * jitterColor;
      this.emit(p.x, p.y, p.z, vx * s, vy * s, vz * s, c[0] * j, c[1] * j, c[2] * j, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav, drag);
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; this.copy(this.n, i); continue; }
      const k = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; }
      const t = this.life[i] / this.max[i];
      this.alpha[i] = Math.min(1, t * 2.5); this.size[i] = this.s0[i] * (0.4 + 0.6 * t);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'color', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }
  copy(from, to) {
    for (let c = 0; c < 3; c++) { this.pos[to * 3 + c] = this.pos[from * 3 + c]; this.vel[to * 3 + c] = this.vel[from * 3 + c]; this.col[to * 3 + c] = this.col[from * 3 + c]; }
    this.size[to] = this.size[from]; this.s0[to] = this.s0[from]; this.life[to] = this.life[from]; this.max[to] = this.max[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.alpha[to] = this.alpha[from];
  }
  clear() { this.n = 0; }
}

export class Tracers {
  constructor(scene) {
    this.pool = [];
    const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0, 0.5);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.userData.t = 0; scene.add(m); this.pool.push(m);
    }
    this.i = 0;
  }
  fire(a, b, color = null, width = 0.022, life = 0.07) {
    const m = this.pool[this.i++ % this.pool.length];
    m.position.copy(a); m.lookAt(b); const L = a.distanceTo(b);
    m.scale.set(width, width, L); m.visible = true; m.userData.t = life; m.userData.life = life;
    if (color) m.material.color.copy(color); else m.material.color.setRGB(6, 4.2, 1.6);
    m.material.opacity = 1;
  }
  update(dt) {
    for (const m of this.pool) if (m.visible) { m.userData.t -= dt; if (m.userData.t <= 0) m.visible = false; else m.material.opacity = m.userData.t / m.userData.life; }
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
    m.lookAt(m.position.clone().add(this._n)); m.rotateZ(Math.random() * 6.28);
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
    this.p.forEach((o, i) => { this.q.setFromEuler(this.e.set(o.rx, o.ry, 0)); this.m.compose(new THREE.Vector3(o.x, o.y, o.z), this.q, this.s); this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, o.c); });
    this.mesh.count = this.p.length; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
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
