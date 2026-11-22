// ZYOIN HQ — original three-lane, two-site Mediterranean office campus (~90×70).
// North is −Z. Attackers spawn south (+Z). A Site "The Pantry" NW, B Site "Summit Hall" NE,
// Mid "Garba Courtyard" in the centre.
import * as THREE from 'three';
import { box, mesh, flush, outlineMaterial, addOutlines } from './builder.js';
import { addSolid } from './physics.js';
import * as T from './textures.js';

const PI = Math.PI;

function std(color, mapName, { rough = 0.92, metal = 0, emissive = null, ei = 1, vc = true, repeat = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: vc });
  if (mapName) m.map = T.surface(mapName);
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  return m;
}

export function buildMap(scene, { quality }) {
  const hi = quality === 'high';
  const M = {
    stucco: std(0xffffff, 'stucco'),
    plaster: std(0xffffff, 'plaster'),
    terracotta: std(0xffffff, 'terracotta'),
    teal: std(0xffffff, 'teal', { rough: 0.7 }),
    navy: std(0xffffff, 'navy', { rough: 0.6 }),
    metal: std(0xffffff, 'metal', { rough: 0.45, metal: 0.4 }),
    wood: std(0xffffff, 'wood', { rough: 0.8 }),
    crate: std(0xffffff, 'crate', { rough: 0.85 }),
    tile: std(0xffffff, 'tile', { rough: 0.85 }),
    stone: std(0xffffff, 'stone'),
    cobble: std(0xffffff, 'cobble'),
    checker: std(0xffffff, 'checker', { rough: 0.55 }),
    carpet: std(0xffffff, 'carpet'),
    stage: std(0xffffff, 'stage', { rough: 0.5 }),
    foliage: std(0xffffff, 'foliage', { rough: 1 }),
    bark: std(0xffffff, 'bark'),
    red: std(0xff4655, null, { rough: 0.6 }),
    marigold: std(0xffc21a, null, { rough: 0.6 }),
    cream: std(0xece8e1, null, { rough: 0.7 }),
    dark: std(0x1a2530, null, { rough: 0.5 }),
    glass: std(0x2b4a5e, null, { rough: 0.15, metal: 0.3 }),
    water: new THREE.MeshStandardMaterial({ color: 0x5fd0c4, roughness: 0.1, metalness: 0.1, emissive: 0x1f6f69, emissiveIntensity: 0.6, map: T.surface('water') }),
  };
  M.water.userData.noShadow = true;
  const dyn = { anim: [], signs: [] };

  // ── floors ────────────────────────────────────────────────────────────────
  const floor = (x0, z0, x1, z1, mat, uv = 3) => box(x0, -0.4, z0, x1, 0, z1, mat, { collide: false, uv, ao: 0 });
  floor(-12, 26, 12, 35, M.stone, 4);
  floor(-45, 16, 45, 26, M.stone, 4);
  floor(-45, -8, -26, 16, M.cobble, 3);
  floor(26, -8, 45, 16, M.cobble, 3);
  floor(-26, 2, -9, 6, M.cobble, 3);
  floor(9, 2, 26, 6, M.cobble, 3);
  floor(-9, -8, 9, 16, M.tile, 3);
  floor(-45, -35, -12, -8, M.checker, 4);
  floor(-12, -35, 12, -8, M.stone, 4);
  floor(12, -35, 45, -8, M.carpet, 5);

  // ── walls & buildings ─────────────────────────────────────────────────────
  function wall(x0, z0, x1, z1, h = 7, mat = M.stucco, { trim = true, cornice = true } = {}) {
    box(x0, 0, z0, x1, h, z1, mat, { uv: 3, ao: 3.2 });
    if (trim) box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.75, z1 + 0.06, M.terracotta, { collide: false, uv: 2, ao: 1.5 });
    if (cornice) {
      box(x0 - 0.18, h - 0.3, z0 - 0.18, x1 + 0.18, h, z1 + 0.18, M.plaster, { collide: false, uv: 2, ao: 0 });
      box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.22, z1 + 0.3, M.terracotta, { collide: false, uv: 2, ao: 0 });
    }
  }
  // outer boundary (tall)
  wall(-46, -36, 46, -35, 8.5); wall(-46, 35, 46, 36, 8.5); wall(-46, -36, -45, 36, 8.5); wall(45, -36, 46, 36, 8.5);
  // spawn side blocks
  wall(-45, 26, -12, 35, 7); wall(12, 26, 45, 35, 7);
  // lane buildings, with corridors z[2,6]
  wall(-26, 6, -9, 16, 7.5); wall(-26, -8, -9, 2, 7.5);
  wall(9, 6, 26, 16, 7.5); wall(9, -8, 26, 2, 7.5);
  box(-26, 4, 2, -9, 7.5, 6, M.stucco, { uv: 3, ao: 0 });
  box(9, 4, 2, 26, 7.5, 6, M.stucco, { uv: 3, ao: 0 });
  // site chokes
  wall(-45, -10, -37, -8, 7); wall(37, -10, 45, -8, 7);
  // mid ↔ site walls with arches at z[-20,-16]
  archWallX(-12, -35, -8, -20, -16);
  archWallX(12, -35, -8, -20, -16);
  // spawn gate lintel
  box(-12, 5, 25.4, 12, 7, 26.6, M.stucco, { uv: 3, ao: 0 });
  box(-12.2, 4.8, 25.3, 12.2, 5.05, 26.7, M.terracotta, { collide: false, ao: 0 });

  function archWallX(x, z0, z1, a, b, h = 7) {
    const t = 1.2, x0 = x - t / 2, x1 = x + t / 2;
    wall(x0, z0, x1, a, h); wall(x0, b, x1, z1, h);
    const w = b - a, r = w / 2, spring = 2.2, top = spring + r;
    box(x0, top + 0.6, a, x1, h, b, M.stucco, { collide: false, uv: 3, ao: 0 });
    addSolid(x0, 3.3, a, x1, h, b);
    // arch infill
    const sh = new THREE.Shape(); const H = top + 0.6 - spring;
    sh.moveTo(-r, 0); sh.lineTo(-r, H); sh.lineTo(r, H); sh.lineTo(r, 0); sh.absarc(0, 0, r, 0, PI, false);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 20 }); g.translate(0, 0, -t / 2);
    mesh(g, M.stucco, { p: [x, spring, (a + b) / 2], r: [0, PI / 2, 0], uv: 3 });
    // terracotta arch ring
    const ring = new THREE.Shape(); ring.absarc(0, 0, r + 0.3, 0, PI, false); ring.lineTo(-r, 0); ring.absarc(0, 0, r, PI, 0, true); ring.lineTo(r + 0.3, 0);
    const rg = new THREE.ExtrudeGeometry(ring, { depth: t + 0.12, bevelEnabled: false, curveSegments: 20 }); rg.translate(0, 0, -(t + 0.12) / 2);
    mesh(rg, M.terracotta, { p: [x, spring, (a + b) / 2], r: [0, PI / 2, 0], uv: 2 });
    // pilasters
    box(x0 - 0.1, 0, a - 0.35, x1 + 0.1, spring, a, M.plaster, { collide: false, ao: 2 });
    box(x0 - 0.1, 0, b, x1 + 0.1, spring, b + 0.35, M.plaster, { collide: false, ao: 2 });
  }
  // decorative arch frames at corridor mouths (x faces)
  for (const [x, dir] of [[-26, -1], [-9, 1], [9, -1], [26, 1]]) {
    const r = 2, spring = 2.0, H = 2.0 + 0.4;
    const sh = new THREE.Shape(); sh.moveTo(-r, 0); sh.lineTo(-r, H); sh.lineTo(r, H); sh.lineTo(r, 0); sh.absarc(0, 0, r, 0, PI, false);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false, curveSegments: 16 });
    mesh(g, M.plaster, { p: [x + (dir > 0 ? 0 : -0.5) + (dir > 0 ? 0 : 0), spring, 4], r: [0, PI / 2, 0], uv: 3 });
    const ring = new THREE.Shape(); ring.absarc(0, 0, r + 0.28, 0, PI, false); ring.lineTo(-r, 0); ring.absarc(0, 0, r, PI, 0, true); ring.lineTo(r + 0.28, 0);
    const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.6, bevelEnabled: false, curveSegments: 16 });
    mesh(rg, M.terracotta, { p: [x + (dir > 0 ? -0.05 : -0.55), spring, 4], r: [0, PI / 2, 0] });
  }

  // façade details: shuttered windows & doors (decor only, slightly proud of the wall)
  function windowsAlong(axis, fixed, from, to, side, { y0 = 3.7, every = 4.2, door = false } = {}) {
    for (let s = from + every / 2; s < to - 1; s += every) {
      const w = 1.3, h = 1.7, d = 0.12 * side;
      if (axis === 'x') { // face is perpendicular to z at z = fixed
        box(s - w / 2 - 0.15, y0 - 0.15, fixed, s + w / 2 + 0.15, y0 + h + 0.15, fixed + d, M.plaster, { collide: false, ao: 0 });
        box(s - w / 2, y0, fixed + d, s + w / 2, y0 + h, fixed + d * 1.2, M.glass, { collide: false, ao: 0 });
        box(s - w / 2 - 0.55, y0, fixed + d, s - w / 2 - 0.05, y0 + h, fixed + d * 1.6, M.teal, { collide: false, ao: 0 });
        box(s + w / 2 + 0.05, y0, fixed + d, s + w / 2 + 0.55, y0 + h, fixed + d * 1.6, M.teal, { collide: false, ao: 0 });
        box(s - w / 2 - 0.25, y0 - 0.32, fixed, s + w / 2 + 0.25, y0 - 0.15, fixed + d * 3, M.terracotta, { collide: false, ao: 0 });
      } else {
        box(fixed, y0 - 0.15, s - w / 2 - 0.15, fixed + d, y0 + h + 0.15, s + w / 2 + 0.15, M.plaster, { collide: false, ao: 0 });
        box(fixed + d, y0, s - w / 2, fixed + d * 1.2, y0 + h, s + w / 2, M.glass, { collide: false, ao: 0 });
        box(fixed + d, y0, s - w / 2 - 0.55, fixed + d * 1.6, y0 + h, s - w / 2 - 0.05, M.teal, { collide: false, ao: 0 });
        box(fixed + d, y0, s + w / 2 + 0.05, fixed + d * 1.6, y0 + h, s + w / 2 + 0.55, M.teal, { collide: false, ao: 0 });
        box(fixed, y0 - 0.32, s - w / 2 - 0.25, fixed + d * 3, y0 - 0.15, s + w / 2 + 0.25, M.terracotta, { collide: false, ao: 0 });
      }
    }
    if (door) {
      const s = (from + to) / 2;
      if (axis === 'x') { box(s - 0.9, 0, fixed, s + 0.9, 2.5, fixed + 0.1 * side, M.teal, { collide: false, ao: 2.5 }); box(s - 1.1, 2.5, fixed, s + 1.1, 2.75, fixed + 0.18 * side, M.plaster, { collide: false, ao: 0 }); }
      else { box(fixed, 0, s - 0.9, fixed + 0.1 * side, 2.5, s + 0.9, M.teal, { collide: false, ao: 2.5 }); box(fixed, 2.5, s - 1.1, fixed + 0.18 * side, 2.75, s + 1.1, M.plaster, { collide: false, ao: 0 }); }
    }
  }
  windowsAlong('z', -9, 6, 16, 1, { door: true }); windowsAlong('z', -9, -8, 2, 1);
  windowsAlong('z', 9, 6, 16, -1, { door: true }); windowsAlong('z', 9, -8, 2, -1);
  windowsAlong('z', -26, 6, 16, -1); windowsAlong('z', -26, -8, 2, -1, { door: true });
  windowsAlong('z', 26, 6, 16, 1); windowsAlong('z', 26, -8, 2, 1, { door: true });
  windowsAlong('x', 16, -26, -9, 1); windowsAlong('x', 16, 9, 26, 1);
  windowsAlong('x', 26, -45, -12, -1, { door: true }); windowsAlong('x', 26, 12, 45, -1, { door: true });
  windowsAlong('z', -45, -8, 16, 1, { y0: 4 }); windowsAlong('z', 45, -8, 16, -1, { y0: 4 });
  windowsAlong('x', -8, -26, -9, -1); windowsAlong('x', -8, 9, 26, -1);

  // ── spawn ─────────────────────────────────────────────────────────────────
  box(-11.5, 0, 33.5, -8.5, 1.2, 34.9, M.crate, { outline: true, uv: 1.3 });
  box(8.5, 0, 33, 11.5, 1.6, 34.9, M.crate, { outline: true, uv: 1.3 });
  potPlant(-11, 27.2); potPlant(11, 27.2);

  // ── plaza (between spawn and lanes) ───────────────────────────────────────
  crate(-20, 18.5, 2, 1.8); crate(-20, 18.5, 1.1, 1.1, 1.8, 0.4);
  crate(21, 23.3, 2, 1.6); crate(23.2, 23.6, 1.4, 1.4);
  planterBox(-4, 18.2, 3, 1.1); planterBox(4, 18.2, 3, 1.1);
  box(-41, 0, 20, -38, 1.0, 21, M.wood, { outline: true, uv: 1.5 }); // bench-ish low wall
  box(38, 0, 18.5, 41, 1.0, 19.5, M.wood, { outline: true, uv: 1.5 });

  // ── A lane ────────────────────────────────────────────────────────────────
  crate(-38, 8, 1.6, 1.6); crate(-36.4, 8, 1.6, 1.6); crate(-37.2, 8, 1.3, 1.3, 1.6, 0.3);
  box(-30, 0, -1.5, -28, 1.25, -0.5, M.terracotta, { outline: true, uv: 1.5 });
  crate(-43.6, -3, 1.8, 2.2);
  potPlant(-44, 14); potPlant(-27, 14);
  // ── B lane ────────────────────────────────────────────────────────────────
  crate(36, 10, 1.8, 1.8); crate(37.8, 10.2, 1.4, 1.2);
  // delivery cart
  box(29, 0.35, -2.5, 31.2, 2.4, 1.5, M.red, { outline: true, uv: 2 });
  box(29.1, 2.4, -2.4, 31.1, 2.55, 1.4, M.cream, { collide: false, outline: true });
  for (const [cx, cz] of [[29.3, -1.8], [30.9, -1.8], [29.3, 0.8], [30.9, 0.8]]) mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 14), M.dark, { p: [cx < 30 ? 28.95 : 31.25, 0.35, cz], r: [0, 0, PI / 2] });
  addSolid(29, 0, -2.5, 31.2, 0.35, 1.5);
  potPlant(44, 14); potPlant(27, -7);
  crate(43.4, -5, 1.6, 1.6);

  // ── MID: Garba Courtyard ─────────────────────────────────────────────────
  // fountain
  const fz = 5;
  const rimMat = M.plaster;
  mesh(new THREE.CylinderGeometry(2.4, 2.55, 0.8, 32), M.terracotta, { p: [0, 0.4, fz], uv: 2, ao: 0.8, outline: 0.04 });
  mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.12, 32), rimMat, { p: [0, 0.82, fz], uv: 2 });
  mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 32), M.water, { p: [0, 0.7, fz], uv: 3 });
  mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 16), rimMat, { p: [0, 1.5, fz], uv: 1, outline: 0.03 });
  mesh(new THREE.CylinderGeometry(1.0, 0.35, 0.35, 24), M.terracotta, { p: [0, 2.3, fz], uv: 1, outline: 0.03 });
  mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 24), M.water, { p: [0, 2.46, fz] });
  mesh(new THREE.SphereGeometry(0.22, 16, 12), M.marigold, { p: [0, 2.75, fz] });
  addSolid(-2.2, 0, fz - 2.2, 2.2, 0.85, fz + 2.2);
  addSolid(-0.5, 0, fz - 0.5, 0.5, 2.5, fz + 0.5);
  dyn.fountain = new THREE.Vector3(0, 2.8, fz);
  // planters + benches along walls
  planterBox(-7.6, 13, 1.6, 1.6); planterBox(7.6, -5.5, 1.6, 1.6);
  box(-8.9, 0, -5, -7.9, 0.55, -1, M.wood, { outline: true, uv: 1.5 });
  box(7.9, 0, 9, 8.9, 0.55, 13, M.wood, { outline: true, uv: 1.5 });
  crate(5.5, 12.5, 1.5, 1.5); crate(-5.6, -3.2, 1.4, 1.3);
  // gate beam with GARBA NIGHT
  box(-9, 5.6, 15.6, 9, 6.1, 16.2, M.terracotta, { collide: false, outline: true, ao: 0 });

  // ── back hall (mid north) ─────────────────────────────────────────────────
  for (const [cx, cz] of [[-7, -12], [7, -12], [-7, -28], [7, -28]]) column(cx, cz);
  // tree in round planter
  const TX = 6.5, TZ = -22;
  mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.7, 28), M.terracotta, { p: [TX, 0.35, TZ], uv: 2, outline: 0.04 });
  mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.1, 28), M.bark, { p: [TX, 0.68, TZ] });
  addSolid(TX - 1.6, 0, TZ - 1.6, TX + 1.6, 0.7, TZ + 1.6); addSolid(TX - 0.45, 0, TZ - 0.45, TX + 0.45, 4, TZ + 0.45);
  tree(TX, 0.7, TZ, 1.25);
  planterBox(-6.5, -22, 2.2, 2.2);
  box(-6.5, 0, -32.5, -3.5, 0.5, -31.7, M.wood, { outline: true, uv: 1.5 });
  box(3.5, 0, -32.5, 6.5, 0.5, -31.7, M.wood, { outline: true, uv: 1.5 });
  crate(-9.5, -21, 1.5, 1.5); crate(9.6, -14.5, 1.6, 1.4);

  // ── A SITE: The Pantry ────────────────────────────────────────────────────
  box(-45, 0, -35, -36, 1.2, -26, M.wood, { uv: 2, outline: true });
  box(-36, 0, -32, -35.2, 0.8, -28, M.wood, { uv: 2, outline: true });
  box(-35.2, 0, -32, -34.4, 0.4, -28, M.wood, { uv: 2, outline: true });
  // railing posts on platform edge
  for (let z = -34.5; z <= -26.5; z += 1.6) if (z < -32.2 || z > -27.8) mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), M.dark, { p: [-36.1, 1.7, z] });
  box(-36.2, 2.15, -35, -36.0, 2.25, -32, M.dark, { collide: false }); box(-36.2, 2.15, -28, -36.0, 2.25, -26, M.dark, { collide: false });
  // tall cabinet with the cat
  box(-45, 0, -24.6, -43.4, 3.4, -23, M.teal, { uv: 1.5, outline: true, ao: 3 });
  box(-43.42, 0.3, -24.45, -43.36, 1.6, -23.85, M.cream, { collide: false }); box(-43.42, 0.3, -23.75, -43.36, 1.6, -23.15, M.cream, { collide: false });
  box(-43.42, 1.8, -24.45, -43.36, 3.2, -23.15, M.cream, { collide: false });
  // fridge
  box(-45, 0, -22.8, -43.6, 2.3, -21.2, M.cream, { uv: 1.5, outline: true, ao: 2.3 });
  box(-43.62, 1.2, -22.6, -43.5, 1.9, -22.5, M.metal, { collide: false });
  // north counter + upper cabinets
  box(-34, 0, -35, -20, 0.95, -33.6, M.teal, { uv: 1.5, outline: true, ao: 1 });
  box(-34.1, 0.95, -35, -19.9, 1.05, -33.5, M.plaster, { uv: 1.5, collide: false, outline: true });
  addSolid(-34.1, 0.95, -35, -19.9, 1.05, -33.5);
  box(-33.5, 2.3, -35, -20.5, 3.2, -34.6, M.teal, { collide: false, outline: true, ao: 0 });
  for (let x = -33; x < -20.5; x += 1.6) box(x + 0.6, 0.4, -33.62, x + 1.0, 0.5, -33.56, M.metal, { collide: false });
  // coffee machine + kettle
  box(-31.5, 1.05, -34.8, -30.5, 1.75, -34.0, M.dark, { collide: false, outline: true });
  mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.4, 12), M.red, { p: [-28.5, 1.25, -34.3], outline: 0.02 });
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 10), M.cream, { p: [-27.6, 1.17, -34.2] });
  // island counter (cover)
  box(-31, 0, -21.6, -24, 1.0, -20, M.navy, { uv: 1.5, outline: true, ao: 1 });
  box(-31.1, 1.0, -21.7, -23.9, 1.1, -19.9, M.plaster, { uv: 1.5, collide: false, outline: true });
  addSolid(-31.1, 1.0, -21.7, -23.9, 1.1, -19.9);
  for (let x = -30; x <= -25; x += 1.6) { mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.08, 12), M.red, { p: [x, 0.75, -19.2] }); mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), M.dark, { p: [x, 0.36, -19.2] }); }
  // pendant lamps over island
  for (let x = -29.5; x <= -25.5; x += 2) {
    mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 4), M.dark, { p: [x, 5.2, -20.8] });
    mesh(new THREE.ConeGeometry(0.35, 0.35, 16, 1, true), M.marigold, { p: [x, 3.75, -20.8] });
  }
  dyn.pendants = [[-29.5, 3.62, -20.8], [-27.5, 3.62, -20.8], [-25.5, 3.62, -20.8]];
  // crates
  crate(-18, -13, 1.8, 1.8); crate(-18.2, -13, 1.0, 1.0, 1.8, 0.5);
  crate(-33.8, -14, 1.6, 1.6); crate(-32.2, -14, 1.6, 1.6);
  crate(-14, -31.5, 1.7, 1.7); crate(-14, -33.4, 1.7, 1.7); crate(-14, -32.4, 1.2, 1.2, 1.7, 0.2);
  // dining table
  box(-22, 0.72, -30, -18, 0.82, -28, M.wood, { collide: false, outline: true });
  for (const [lx, lz] of [[-21.8, -29.8], [-18.2, -29.8], [-21.8, -28.2], [-18.2, -28.2]]) box(lx - 0.06, 0, lz - 0.06, lx + 0.06, 0.72, lz + 0.06, M.dark, { collide: false });
  addSolid(-22, 0, -30, -18, 0.82, -28);
  potPlant(-12.9 - 0.6, -9.2); potPlant(-36.4, -9.3);

  // ── B SITE: Summit Hall ───────────────────────────────────────────────────
  box(24, 0, -35, 43, 1.0, -27, M.stage, { uv: 3, outline: true, ao: 1 });
  box(31, 0, -27, 35, 0.5, -26.2, M.stage, { uv: 2, outline: true });
  box(24, 0.0, -27.05, 43, 0.95, -26.98, M.red, { collide: false }); // stage skirt stripe
  // LED wall
  box(26, 1.0, -34.9, 41, 5.6, -34.4, M.dark, { uv: 2, outline: true });
  // podium
  box(28.4, 1.0, -30.4, 29.6, 2.2, -29.4, M.red, { outline: true, uv: 1 });
  box(28.3, 2.2, -30.5, 29.7, 2.3, -29.3, M.cream, { collide: false, outline: true });
  // speaker stacks
  for (const sx of [24.2, 41.4]) { box(sx, 1.0, -28.8, sx + 1.4, 3.2, -27.4, M.dark, { outline: true, uv: 1 }); }
  // registration desk
  box(14, 0, -11.4, 20, 1.0, -10.4, M.red, { outline: true, uv: 1.5 });
  box(13.9, 1.0, -11.5, 20.1, 1.08, -10.3, M.cream, { collide: false });
  // cocktail tables
  for (const [tx, tz] of [[21, -25], [38, -22], [24, -19.5]]) {
    mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 20), M.cream, { p: [tx, 1.1, tz], outline: 0.03 });
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), M.dark, { p: [tx, 0.55, tz] });
    mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 16), M.dark, { p: [tx, 0.02, tz] });
    addSolid(tx - 0.4, 0, tz - 0.4, tx + 0.4, 1.13, tz + 0.4);
  }
  // lanyard stands
  for (const [lx, lz] of [[22, -12.5], [40.5, -18]]) {
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 8), M.dark, { p: [lx - 0.8, 1, lz] }); mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 8), M.dark, { p: [lx + 0.8, 1, lz] });
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 8), M.metal, { p: [lx, 1.95, lz], r: [0, 0, PI / 2] });
    const cols = [M.red, M.marigold, M.teal, M.navy, M.red, M.marigold, M.teal];
    cols.forEach((c, i) => { const x = lx - 0.65 + i * 0.22; box(x - 0.03, 1.15, lz - 0.01, x + 0.03, 1.95, lz + 0.01, c, { collide: false }); box(x - 0.08, 1.0, lz - 0.02, x + 0.08, 1.2, lz + 0.02, M.cream, { collide: false }); });
    addSolid(lx - 0.9, 0, lz - 0.15, lx + 0.9, 2, lz + 0.15);
  }
  crate(43.3, -24, 1.4, 1.4); crate(43.3, -25.5, 1.4, 1.4); crate(14, -33.6, 1.6, 1.6);

  // ── sponsor boards (cover) — separate meshes for textured faces ──────────
  const sponsors = [
    ['SYNERGY&CO', 'we circle back so you do not have to', '#FF4655', '#ECE8E1'],
    ['LEVERAGE LABS', 'move fast, align faster', '#0F1923', '#FFC21A'],
    ['CIRCLEBACK', 'enterprise follow-ups at scale', '#2F8F88', '#ECE8E1'],
    ['BANDWIDTH BANK', 'we have the capacity', '#FFC21A', '#0F1923'],
    ['PIVOT PARTNERS', 'it was always the plan', '#ECE8E1', '#C8643B'],
    ['Q4 CAPITAL', 'see you next fiscal', '#C8643B', '#ECE8E1'],
  ];
  const boards = [
    { x0: 17, z0: -15.2, x1: 20.5, z1: -14.8, s: [0, 1] },
    { x0: 35.5, z0: -15.2, x1: 39, z1: -14.8, s: [2, 3] },
    { x0: 14.8, z0: -30, x1: 15.2, z1: -26.5, s: [4, 5] },
    { x0: 27, z0: -18.7, x1: 30, z1: -18.3, s: [1, 2] },
  ];
  for (const b of boards) {
    box(b.x0, 0, b.z0, b.x1, 2.4, b.z1, M.cream, { outline: true, uv: 1 });
    box(b.x0 - 0.05, 2.4, b.z0 - 0.05, b.x1 + 0.05, 2.55, b.z1 + 0.05, M.red, { collide: false, outline: true });
    const alongX = b.x1 - b.x0 > b.z1 - b.z0;
    const w = alongX ? b.x1 - b.x0 - 0.2 : b.z1 - b.z0 - 0.2;
    b.s.forEach((si, side) => {
      const [n, tg, bg, fg] = sponsors[si];
      const pm = new THREE.MeshStandardMaterial({ map: T.sponsorTexture(n, tg, bg, fg), roughness: 0.6 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.75 > 2.1 ? 2.1 : w * 0.75), pm);
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      if (alongX) { p.position.set(cx, 1.25, side ? b.z0 - 0.01 : b.z1 + 0.01); p.rotation.y = side ? PI : 0; }
      else { p.position.set(side ? b.x0 - 0.01 : b.x1 + 0.01, 1.25, cz); p.rotation.y = side ? -PI / 2 : PI / 2; }
      p.receiveShadow = true; scene.add(p);
    });
  }
  // LED wall screen
  const led = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 4.4), new THREE.MeshBasicMaterial({ map: ledTexture(), toneMapped: true }));
  led.material.color.setScalar(1.4); led.position.set(33.5, 3.3, -34.38); scene.add(led); dyn.led = led;

  // ── signs ─────────────────────────────────────────────────────────────────
  sign('ZYOIN HQ', T.PAL.red, [0, 6.0, 25.38], 0, 9, { sub: 'ATTACKER SPAWN', subColor: T.PAL.cream, hdr: 2.2 });
  sign('GCC SUMMIT', '#40e0ff', [33.5, 6.6, -34.9], 0, 11, { hdr: 1.8, sub: 'INDIA · 2026', subColor: '#ffc21a' });
  sign('GARBA NIGHT', '#ff5fd2', [0, 6.6, 16.25], 0, 9.5, { hdr: 1.7, sub: 'DANCE LIKE NOBODY IS WATCHING', subColor: '#ffc21a' });
  sign('NOT GOODBYE', T.PAL.marigold, [0, 4.6, -34.9], 0, 12, { hdr: 1.5, sub: 'SEE YOU LATER', subColor: T.PAL.red });
  sign('THE PANTRY', T.PAL.cream, [-27, 4.6, -34.9], 0, 7, { hdr: 0.9, sub: 'A SITE', subColor: T.PAL.red });
  sign('SUMMIT HALL', T.PAL.cream, [12.7, 4.8, -24], PI / 2, 6.5, { hdr: 0.9, sub: 'B SITE', subColor: T.PAL.red });
  sign('A', T.PAL.red, [-12.7, 5.0, -18], -PI / 2, 3.5, { hdr: 1.6 });
  sign('B', T.PAL.red, [12.68, 5.0, -18], PI / 2, 3.5, { hdr: 1.6 });
  sign('A ◂', T.PAL.cream, [-25.95, 5.3, 11], -PI / 2, 4, { hdr: 1.1 });
  sign('▸ B', T.PAL.cream, [25.95, 5.3, 11], PI / 2, 4, { hdr: 1.1 });
  sign('MID', T.PAL.cream, [0, 5.4, 25.38], PI, 4, { hdr: 1.1 });

  // painted floor letters
  floorDecal('A', [-27, 0.015, -27], 7);
  floorDecal('B', [30, 0.015, -21], 7);
  // spawn banner on the back wall
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5, 20, 4), new THREE.MeshStandardMaterial({ map: T.bannerTexture('ZYOIN HQ', { sub: 'BANGALORE · EST. WITH LOVE' }), roughness: 0.9, side: THREE.DoubleSide }));
  { const p = ban.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.1) * 0.08); ban.geometry.computeVertexNormals(); }
  ban.position.set(0, 4.2, 34.85); ban.rotation.y = PI; ban.receiveShadow = true; scene.add(ban);
  // vertical drapes either side of the spawn gate
  for (const sx of [-10.5, 10.5]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.2), new THREE.MeshStandardMaterial({ map: T.stripeTexture('#FF4655', '#0F1923', 2), side: THREE.DoubleSide, roughness: 0.9 }));
    d.position.set(sx, 2.7, 25.3); scene.add(d);
  }

  // ── cloth awnings over mid ───────────────────────────────────────────────
  const awn = [
    [-9, 8.5, 1, '#FF4655', '#ECE8E1'], [-9, -4.5, 1, '#FFC21A', '#2F8F88'],
    [9, 11.5, -1, '#2F8F88', '#ECE8E1'], [9, -3, -1, '#FF4655', '#FFC21A'],
    [-26, -3.5, -1, '#FFC21A', '#C8643B'], [26, 10, 1, '#FF4655', '#ECE8E1'],
  ];
  for (const [wx, wz, dir, a, b] of awn) {
    const g = new THREE.PlaneGeometry(4.2, 2.0, 12, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = (p.getY(i) + 1) / 2; p.setZ(i, Math.sin(v * PI) * 0.18 + Math.sin(p.getX(i) * 3) * 0.03); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.stripeTexture(a, b, 8), side: THREE.DoubleSide, roughness: 0.95 }));
    m.rotation.order = 'YXZ'; m.rotation.y = dir > 0 ? PI / 2 : -PI / 2; m.rotation.x = -0.95;
    m.position.set(wx + dir * 0.85, 3.35, wz); m.castShadow = hi; m.receiveShadow = true; scene.add(m);
    // support rods
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x1a2530 }));
    rod.rotation.x = PI / 2; rod.position.set(wx + dir * 1.62, 2.82, wz); scene.add(rod);
  }

  // ── string lights & marigold garlands (instanced) ─────────────────────────
  const bulbs = [], marigolds = [], wires = [];
  function catenary(a, b, sag, n, out, jitter = 0) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= sag * 4 * t * (1 - t);
      if (jitter) { p.x += (Math.random() - 0.5) * jitter; p.z += (Math.random() - 0.5) * jitter; }
      pts.push(p); if (out) out.push(p.clone());
    }
    wires.push(pts);
    return pts;
  }
  const lightRuns = [
    [[-9, 6.2, -6], [9, 6.0, -2]], [[-9, 6.0, -1], [9, 6.2, 3]], [[-9, 6.1, 9], [9, 6.0, 7]],
    [[-9, 6.0, 13], [9, 6.2, 14]], [[-9, 6.2, 2], [9, 6.0, 12]], [[-9, 6.0, 12], [9, 6.0, -6]],
    [[-12, 6.0, -10], [12, 6.0, -14]], [[-12, 6.2, -30], [12, 6.0, -26]],
    [[-26, 5.6, 2.3], [-26, 5.6, 5.7]], [[-45, 6.0, 12], [-26, 6, 6]], [[45, 6.0, 12], [26, 6, 6]],
  ];
  for (const [a, b] of lightRuns) catenary(new THREE.Vector3(...a), new THREE.Vector3(...b), 1.1, Math.round(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)) * 1.6), bulbs);
  const garlandRuns = [
    [[-8.95, 7.2, -8], [-8.95, 7.2, 2]], [[-8.95, 7.2, 6], [-8.95, 7.2, 16]], [[8.95, 7.2, -8], [8.95, 7.2, 2]], [[8.95, 7.2, 6], [8.95, 7.2, 16]],
    [[-9, 5.6, 15.55], [0, 5.6, 15.55]], [[0, 5.6, 15.55], [9, 5.6, 15.55]],
    [[-12, 4.9, 25.3], [0, 4.9, 25.3]], [[0, 4.9, 25.3], [12, 4.9, 25.3]],
    [[-12.65, 5.2, -20.5], [-12.65, 5.2, -15.5]], [[12.65, 5.2, -20.5], [12.65, 5.2, -15.5]],
  ];
  for (const [a, b] of garlandRuns) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const L = A.distanceTo(B);
    // scalloped festoons
    const segs = Math.max(2, Math.round(L / 2.2));
    for (let s = 0; s < segs; s++) {
      const p0 = A.clone().lerp(B, s / segs), p1 = A.clone().lerp(B, (s + 1) / segs);
      const pts = []; const n = 14;
      for (let i = 0; i <= n; i++) { const t = i / n; const p = p0.clone().lerp(p1, t); p.y -= 0.55 * 4 * t * (1 - t); pts.push(p); }
      pts.forEach((p) => marigolds.push(p));
      // hanging strands (toran)
      const hang = p0.clone(); for (let k = 1; k < 6; k++) marigolds.push(hang.clone().add(new THREE.Vector3(0, -k * 0.14, 0)));
    }
  }
  if (bulbs.length) {
    const g = new THREE.SphereGeometry(0.075, 8, 6);
    const m = new THREE.MeshBasicMaterial({ toneMapped: true });
    const im = new THREE.InstancedMesh(g, m, bulbs.length);
    const cols = [new THREE.Color(4, 2.6, 1.0), new THREE.Color(4, 1.2, 1.6), new THREE.Color(3.4, 3.2, 2.6), new THREE.Color(1.2, 3, 2.8)];
    const mtx = new THREE.Matrix4();
    bulbs.forEach((p, i) => { mtx.makeTranslation(p.x, p.y - 0.08, p.z); im.setMatrixAt(i, mtx); im.setColorAt(i, cols[i % 4]); });
    scene.add(im); dyn.bulbs = im; dyn.bulbCols = cols;
  }
  if (marigolds.length) {
    const g = new THREE.IcosahedronGeometry(0.085, 1);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const im = new THREE.InstancedMesh(g, m, marigolds.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const cs = [new THREE.Color('#ff9d00'), new THREE.Color('#ffc21a'), new THREE.Color('#ff7a1a'), new THREE.Color('#ffd34d')];
    marigolds.forEach((p, i) => { q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)); const k = 0.8 + Math.random() * 0.5; s.set(k, k, k); mtx.compose(p, q, s); im.setMatrixAt(i, mtx); im.setColorAt(i, cs[i % 4]); });
    im.castShadow = false; scene.add(im);
  }
  {
    const pos = [];
    for (const pts of wires) for (let i = 0; i < pts.length - 1; i++) pos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1410 })));
  }

  // ── the cat ───────────────────────────────────────────────────────────────
  const cat = makeCat(); cat.position.set(-44.2, 3.4, -23.8); cat.rotation.y = PI / 2 + 0.4; scene.add(cat);
  dyn.cat = cat; dyn.catHit = new THREE.Vector3(-44.2, 3.75, -23.8);

  // ── skyline beyond the walls (decor) ──────────────────────────────────────
  {
    const r = (a, b) => a + Math.random() * (b - a);
    const ring = [];
    for (let i = 0; i < 46; i++) {
      const side = i % 4; let x, z;
      if (side === 0) { x = r(-80, 80); z = r(-75, -42); } else if (side === 1) { x = r(-80, 80); z = r(42, 75); } else if (side === 2) { x = r(-90, -52); z = r(-60, 60); } else { x = r(52, 90); z = r(-60, 60); }
      const w = r(6, 14), d = r(6, 14), h = r(10, 22);
      ring.push([x, z, w, d, h]);
    }
    for (const [x, z, w, d, h] of ring) {
      box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, Math.random() > 0.5 ? M.stucco : M.plaster, { collide: false, uv: 4, ao: 8 });
      box(x - w / 2 - 0.3, h, z - d / 2 - 0.3, x + w / 2 + 0.3, h + 0.4, z + d / 2 + 0.3, M.terracotta, { collide: false, ao: 0 });
      if (Math.random() > 0.6) mesh(new THREE.CylinderGeometry(w * 0.22, w * 0.22, 0.6, 16), M.teal, { p: [x, h + 0.7, z] });
    }
    // palms
    for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2; palm(Math.cos(a) * 58, Math.sin(a) * 50, 8 + Math.random() * 5); }
  }

  const meshes = flush(scene, { shadows: hi });

  // ── barrier (spawn) ───────────────────────────────────────────────────────
  const barrierMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHex: { value: T.hexTexture() }, uA: { value: 1 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uTime; uniform sampler2D uHex; uniform float uA; varying vec2 vUv; varying vec3 vP;
      void main(){ vec2 uv = vec2(vP.x, vP.y)/2.2; float h = texture2D(uHex, uv).r;
        float scan = 0.5+0.5*sin(vP.y*3.0 - uTime*3.0);
        float edge = smoothstep(0.9,1.0,vUv.y) + smoothstep(0.08,0.0,vUv.y);
        float a = 0.03 + h*0.22*(0.5+0.5*scan) + edge*0.5;
        vec3 c = vec3(1.0,0.22,0.3)*(0.9 + h*1.4 + edge*2.0);
        gl_FragColor = vec4(c, a*uA); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(24, 5), barrierMat);
  barrier.position.set(0, 2.5, 26); scene.add(barrier);
  const barrierSolid = addSolid(-12, 0, 25.8, 12, 5, 26.2, 'barrier');
  dyn.barrier = barrier; dyn.barrierSolid = barrierSolid;

  // ── plant zone marker (final round) ───────────────────────────────────────
  const plantCenter = new THREE.Vector3(-27, 0, -27);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.4), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -PI / 2; ring.position.set(plantCenter.x, 0.03, plantCenter.z); ring.visible = false; scene.add(ring);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 30, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.3), transparent: true, opacity: 0.35, depthWrite: false }));
  beacon.position.set(plantCenter.x, 15, plantCenter.z); beacon.visible = false; scene.add(beacon);
  dyn.plantRing = ring; dyn.plantBeacon = beacon; dyn.plantCenter = plantCenter; dyn.plantRadius = 4.5;

  // ── clouds ────────────────────────────────────────────────────────────────
  dyn.clouds = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloudTexture(i + 1), transparent: true, depthWrite: false, fog: false }));
    const a = (i / 9) * PI * 2 + 0.3; const d = 150 + Math.random() * 60;
    s.position.set(Math.cos(a) * d, 40 + Math.random() * 30, Math.sin(a) * d);
    const k = 50 + Math.random() * 40; s.scale.set(k, k * 0.5, 1);
    s.userData = { a, d, sp: 0.004 + Math.random() * 0.004 };
    scene.add(s); dyn.clouds.push(s);
  }

  // ── helpers (hoisted) ─────────────────────────────────────────────────────
  function crate(cx, cz, w, h, y = 0, rot = 0) {
    box(cx - w / 2, y, cz - w / 2, cx + w / 2, y + h, cz + w / 2, M.crate, { outline: true, uv: Math.max(w, h), ao: 0 });
  }
  function planterBox(cx, cz, w, d) {
    box(cx - w / 2, 0, cz - d / 2, cx + w / 2, 0.8, cz + d / 2, M.terracotta, { outline: true, uv: 1.5 });
    shrub(cx, 0.8, cz, Math.min(w, d) * 0.55);
  }
  function potPlant(cx, cz) {
    mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.8, 14), M.terracotta, { p: [cx, 0.4, cz], outline: 0.03, ao: 0.8 });
    shrub(cx, 0.8, cz, 0.6);
    addSolid(cx - 0.4, 0, cz - 0.4, cx + 0.4, 0.8, cz + 0.4);
  }
  function shrub(cx, y, cz, s) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 4; i++) {
      const a = i * 2.1; const r = s * 0.35;
      mesh(g, M.foliage, { p: [cx + Math.cos(a) * r * (i ? 1 : 0), y + s * 0.45 + (i ? 0 : s * 0.25), cz + Math.sin(a) * r * (i ? 1 : 0)], s: [s * 0.6, s * 0.55, s * 0.6], uv: 0.8, outline: 0.04 });
    }
  }
  function tree(cx, y, cz, s) {
    mesh(new THREE.CylinderGeometry(0.22 * s, 0.38 * s, 3.4 * s, 10), M.bark, { p: [cx, y + 1.7 * s, cz], uv: 1, outline: 0.03 });
    mesh(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 1.6 * s, 8), M.bark, { p: [cx + 0.5 * s, y + 3.2 * s, cz], r: [0, 0, -0.7], uv: 1 });
    mesh(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 1.5 * s, 8), M.bark, { p: [cx - 0.45 * s, y + 3.1 * s, cz + 0.2], r: [0.3, 0, 0.7], uv: 1 });
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 5) * 0.06 + Math.cos(p.getZ(i) * 4 + p.getY(i) * 3) * 0.06; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    g.computeVertexNormals();
    const blobs = [[0, 4.6, 0, 1.9], [1.4, 4.1, 0.6, 1.3], [-1.3, 4.2, -0.5, 1.4], [0.3, 5.5, -0.8, 1.2], [-0.5, 4.0, 1.3, 1.2], [0.9, 5.0, 1.0, 1.0]];
    for (const [bx, by, bz, br] of blobs) mesh(g, M.foliage, { p: [cx + bx * s, y + by * s, cz + bz * s], s: [br * s, br * s * 0.85, br * s], uv: 1.2, outline: 0.05 });
  }
  function column(cx, cz) {
    mesh(new THREE.CylinderGeometry(0.38, 0.42, 5.4, 16), M.plaster, { p: [cx, 2.9, cz], uv: 2, ao: 3, outline: 0.03 });
    box(cx - 0.6, 0, cz - 0.6, cx + 0.6, 0.3, cz + 0.6, M.terracotta, { collide: false, outline: true });
    box(cx - 0.6, 5.6, cz - 0.6, cx + 0.6, 6, cz + 0.6, M.terracotta, { collide: false, outline: true });
    addSolid(cx - 0.42, 0, cz - 0.42, cx + 0.42, 6, cz + 0.42);
  }
  function palm(cx, cz, h) {
    const seg = 6; let x = cx, z = cz; const lean = Math.random() * PI * 2;
    for (let i = 0; i < seg; i++) { mesh(new THREE.CylinderGeometry(0.28, 0.34, h / seg + 0.1, 8), M.bark, { p: [x, (i + 0.5) * h / seg, z], r: [Math.sin(lean) * 0.05 * i, 0, Math.cos(lean) * 0.05 * i] }); x += Math.cos(lean) * 0.12 * i; z += Math.sin(lean) * 0.12 * i; }
    const leaf = new THREE.ConeGeometry(0.6, 4.5, 4, 1); leaf.rotateX(PI / 2); leaf.scale(1, 0.25, 1); leaf.translate(0, 0, 2.2);
    for (let i = 0; i < 7; i++) mesh(leaf, M.foliage, { p: [x, h, z], r: [0.5, (i / 7) * PI * 2, 0], uv: 1 });
  }
  function sign(text, color, pos, rotY, width, { sub = null, subColor = null, hdr = 2 } = {}) {
    const texx = T.neonTexture(text, color, { sub, subColor });
    const m = new THREE.MeshBasicMaterial({ map: texx, transparent: true, depthWrite: false, toneMapped: true });
    m.color.setScalar(hdr);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), m);
    p.position.set(...pos); p.rotation.y = rotY; p.renderOrder = 2;
    scene.add(p); dyn.signs.push(p);
    // dark backing plate
    const back = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.86, width / 4 * 0.78), new THREE.MeshStandardMaterial({ color: 0x0f1923, roughness: 0.6, transparent: true, opacity: 0.85 }));
    back.position.copy(p.position); back.rotation.y = rotY; back.translateZ(-0.03); scene.add(back);
  }
  function floorDecal(letter, pos, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: T.floorLetter(letter, letter === 'A' ? '#FF4655' : '#FFC21A'), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.rotation.x = -PI / 2; m.position.set(...pos); m.receiveShadow = true; scene.add(m);
  }

  // ── navigation ────────────────────────────────────────────────────────────
  const nodes = {
    S0: [0, 30], P0: [0, 21], PW: [-35, 21], PE: [35, 21], MS: [0, 13],
    AL: [-35, 12], ALc: [-33, 4], AL2: [-33, -4], AMAIN: [-31, -11], AM2: [-22, -17], ASITE: [-21, -27], APLANT: [-27, -27], AB: [-14, -18],
    CWa: [-24, 4], CWb: [-11, 4], MWc: [-6, 5], MEc: [6, 5], MN: [0, -3], BH: [0, -16],
    BL: [35, 12], BLc: [33, 4], BL2: [33, -4], BMAIN: [31, -11], BSITE: [30, -22], BB: [14, -18], CEa: [24, 4], CEb: [11, 4],
  };
  const edges = [
    ['S0', 'P0'], ['P0', 'PW'], ['P0', 'PE'], ['P0', 'MS'], ['PW', 'AL'], ['AL', 'ALc'], ['ALc', 'AL2'], ['AL2', 'AMAIN'], ['AMAIN', 'AM2'], ['AM2', 'ASITE'], ['ASITE', 'APLANT'], ['AM2', 'AB'], ['AMAIN', 'APLANT'],
    ['AB', 'BH'], ['BH', 'MN'], ['MN', 'MWc'], ['MN', 'MEc'], ['MWc', 'MS'], ['MEc', 'MS'], ['MWc', 'CWb'], ['CWb', 'CWa'], ['CWa', 'ALc'],
    ['PE', 'BL'], ['BL', 'BLc'], ['BLc', 'BL2'], ['BL2', 'BMAIN'], ['BMAIN', 'BSITE'], ['BSITE', 'BB'], ['BB', 'BH'], ['MEc', 'CEb'], ['CEb', 'CEa'], ['CEa', 'BLc'],
  ];
  const posts = {
    aLane: [-38, 5.6], aMain: [-30, -12.5], aSite: [-22, -24], aPlat: [-40, -30], aCrate: [-18, -15.5],
    mid: [0, -2], mid2: [-5, 10], backHall: [0, -18], backHall2: [-5, -29],
    bLane: [36, 7], bMain: [31, -12.5], bStage: [33, -31], bBoard: [19, -16.5], bSite: [28, -22],
  };
  const spawnPoint = new THREE.Vector3(0, 0, 31);

  return { meshes, dyn, nodes, edges, posts, spawnPoint, M };
}

function ledTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 308; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1024, 308); g.addColorStop(0, '#0F1923'); g.addColorStop(1, '#1c3a52');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 308);
  x.strokeStyle = 'rgba(64,224,255,0.35)'; x.lineWidth = 2;
  for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(860, 150, 20 + i * 18, 0, 6.3); x.stroke(); }
  x.fillStyle = '#ECE8E1'; x.font = '120px "Bebas Neue", Impact, sans-serif'; x.textBaseline = 'middle'; x.fillText('GCC SUMMIT', 50, 120);
  x.fillStyle = '#FF4655'; x.font = '700 30px Inter, sans-serif'; x.fillText('PARTNERSHIPS · SPONSORS · BIG ENERGY', 54, 205);
  x.fillStyle = '#FFC21A'; x.font = '700 22px Inter, sans-serif'; x.fillText('HEADLINE PARTNER LEAD: CHIKERO', 54, 250);
  for (let i = 0; i < 1024; i += 4) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 1, 308); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeCat() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.75 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 6, 12), fur); body.rotation.z = PI / 2; body.position.set(0, 0.22, 0); body.scale.set(1, 1, 0.9); g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), fur); chest.position.set(0.22, 0.32, 0); g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), fur); head.position.set(0.32, 0.58, 0); head.scale.set(1, 0.92, 1.05); g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), fur); ear.position.set(0.3, 0.74, s * 0.09); ear.rotation.x = s * 0.3; g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 0.4) })); eye.position.set(0.46, 0.6, s * 0.065); eye.userData.noOutline = true; g.add(eye);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), fur); paw.position.set(0.34, 0.05, s * 0.09); g.add(paw);
  }
  const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, 0.12, 0), new THREE.Vector3(-0.45, 0.1, 0.15), new THREE.Vector3(-0.35, 0.3, 0.32), new THREE.Vector3(-0.25, 0.5, 0.3)]), 16, 0.035, 6), fur);
  g.add(tail); g.userData.tail = tail; g.userData.head = head;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  addOutlines(g, outlineMaterial(0.018));
  return g;
}
