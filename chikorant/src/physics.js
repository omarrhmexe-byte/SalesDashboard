// Capsule(cylinder)-vs-AABB collision and ray-vs-AABB queries. The whole map is axis-aligned
// boxes for collision, so this is exact, fast and never lets anyone clip or fall through.
export const solids = []; // { min:[x,y,z], max:[x,y,z], tag }
export function addSolid(x0, y0, z0, x1, y1, z1, tag = null) {
  const s = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], tag, on: true };
  solids.push(s); return s;
}
// Map switching: drop every collision box (the next map re-adds its own).
export function resetSolids() { solids.length = 0; }
// Swap the whole collision set (used to build a throwaway map for a preview snapshot without
// disturbing the live one). Returns the previous set; `solids` stays the same array object.
export function swapSolids(next = []) { const prev = solids.splice(0, solids.length); for (const s of next) solids.push(s); return prev; }

const STEP = 0.55; // max climbable rise (the B-stage steps are 0.5 each)

// Moves `pos` (feet position, THREE.Vector3) by vel*dt with collision. Returns { onGround, hitCeil, landedSpeed }.
export function moveBody(pos, vel, dt, radius, height, wasOnGround) {
  const disp = Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt;
  const n = Math.min(12, Math.max(1, Math.ceil(disp / 0.12)));
  const h = dt / n;
  let onGround = false, hitCeil = false, landedSpeed = 0;
  for (let i = 0; i < n; i++) {
    // horizontal
    pos.x += vel.x * h; pos.z += vel.z * h;
    resolveHorizontal(pos, vel, radius, height);
    // vertical
    const prevY = pos.y;
    pos.y += vel.y * h;
    const ground = groundHeight(pos.x, pos.z, radius * 0.85, Math.max(prevY, pos.y) + STEP);
    const snap = (wasOnGround || onGround) && vel.y <= 0 && pos.y - ground < STEP && pos.y - ground > -STEP * 2;
    if (pos.y <= ground || snap) {
      if (vel.y < 0) landedSpeed = Math.max(landedSpeed, -vel.y);
      pos.y = ground; if (vel.y < 0) vel.y = 0; onGround = true;
    }
    const ceil = ceilingHeight(pos.x, pos.z, radius * 0.85, pos.y + 0.2);
    if (pos.y + height > ceil) { pos.y = Math.max(ground, ceil - height); if (vel.y > 0) { vel.y = 0; hitCeil = true; } }
  }
  return { onGround, hitCeil, landedSpeed };
}

function resolveHorizontal(pos, vel, r, height) {
  for (let iter = 0; iter < 2; iter++) {
    for (let k = 0; k < solids.length; k++) {
      const b = solids[k]; if (!b.on) continue;
      if (b.max[1] <= pos.y + STEP || b.min[1] >= pos.y + height) continue;
      const cx = pos.x < b.min[0] ? b.min[0] : pos.x > b.max[0] ? b.max[0] : pos.x;
      const cz = pos.z < b.min[2] ? b.min[2] : pos.z > b.max[2] ? b.max[2] : pos.z;
      let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2); dx /= d; dz /= d; const push = r - d;
        pos.x += dx * push; pos.z += dz * push;
        const vn = vel.x * dx + vel.z * dz; if (vn < 0) { vel.x -= vn * dx; vel.z -= vn * dz; }
      } else { // centre inside box: push out along the shallowest axis
        const pxl = pos.x - b.min[0] + r, pxr = b.max[0] - pos.x + r, pzl = pos.z - b.min[2] + r, pzr = b.max[2] - pos.z + r;
        const m = Math.min(pxl, pxr, pzl, pzr);
        if (m === pxl) { pos.x -= pxl; vel.x = Math.min(0, vel.x); } else if (m === pxr) { pos.x += pxr; vel.x = Math.max(0, vel.x); }
        else if (m === pzl) { pos.z -= pzl; vel.z = Math.min(0, vel.z); } else { pos.z += pzr; vel.z = Math.max(0, vel.z); }
      }
    }
  }
}

function overlapsXZ(b, x, z, r) {
  const cx = x < b.min[0] ? b.min[0] : x > b.max[0] ? b.max[0] : x;
  const cz = z < b.min[2] ? b.min[2] : z > b.max[2] ? b.max[2] : z;
  const dx = x - cx, dz = z - cz; return dx * dx + dz * dz < r * r;
}
export function groundHeight(x, z, r, maxY) {
  let g = 0;
  for (let k = 0; k < solids.length; k++) { const b = solids[k]; if (!b.on) continue; if (b.max[1] > g && b.max[1] <= maxY && overlapsXZ(b, x, z, r)) g = b.max[1]; }
  return g;
}
function ceilingHeight(x, z, r, minY) {
  let c = 1e9;
  for (let k = 0; k < solids.length; k++) { const b = solids[k]; if (!b.on) continue; if (b.min[1] >= minY && b.min[1] < c && overlapsXZ(b, x, z, r)) c = b.min[1]; }
  return c;
}

// Ray vs all solids. Returns { t, normal:[x,y,z], solid } or null. dir must be normalised.
export function raycast(ox, oy, oz, dx, dy, dz, maxT = 200, skipTag = null) {
  let best = maxT, bn = null, bs = null;
  const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
  for (let k = 0; k < solids.length; k++) {
    const b = solids[k]; if (!b.on || (skipTag && b.tag === skipTag)) continue;
    let t1 = (b.min[0] - ox) * ix, t2 = (b.max[0] - ox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
    t1 = (b.min[1] - oy) * iy; t2 = (b.max[1] - oy) * iy;
    let n = Math.min(t1, t2); if (n > tmin) { tmin = n; ax = 1; } tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b.min[2] - oz) * iz; t2 = (b.max[2] - oz) * iz;
    n = Math.min(t1, t2); if (n > tmin) { tmin = n; ax = 2; } tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0) && tmin < best && tmin > 0) {
      best = tmin; bs = b;
      bn = [0, 0, 0]; bn[ax] = ax === 0 ? -Math.sign(dx) : ax === 1 ? -Math.sign(dy) : -Math.sign(dz);
    }
  }
  // floor plane
  if (dy < 0) { const t = -oy / dy; if (t > 0 && t < best) { best = t; bn = [0, 1, 0]; bs = null; } }
  return bn ? { t: best, normal: bn, solid: bs } : null;
}

export function lineOfSight(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return true;
  const h = raycast(a.x, a.y, a.z, dx / L, dy / L, dz / L, L);
  return !h || h.t >= L - 0.05;
}

// Ray vs vertical cylinder (x,z centre, y0..y1, radius). Returns t or -1.
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, y0, y1, r) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz; if (a < 1e-9) return -1;
  const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c; if (disc < 0) return -1;
  const s = Math.sqrt(disc); let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a); if (t < 0) return -1;
  const y = oy + dy * t; if (y < y0 || y > y1) return -1;
  return t;
}
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const px = ox - cx, py = oy - cy, pz = oz - cz;
  const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
  const disc = b * b - c; if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc); return t >= 0 ? t : -1;
}
