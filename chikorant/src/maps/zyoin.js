// ZYOIN HQ — our office: a three-lane, two-site sunlit courtyard campus in Bangalore (~90×70).
// North is −Z. Attackers spawn in Reception (south, +Z) next to the photo wall and the WOW CHAMP
// trophy shelf. A Site "The Pantry" NW (with the cat), B Site "Summit Hall" NE (GCC stage, LED
// wall, sponsor wall), Mid "The Courtyard" (fountain) and the open-plan office + glass meeting
// room behind it. Map interface contract: see src/maps/index.js.
import * as THREE from 'three';
import { box, mesh, flush, outlineMaterial, addOutlines, contact, contactRound } from '../builder.js';
import { addSolid } from '../physics.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as T from '../textures.js';
import { photoFrame, logoPlane, loadPhoto } from '../photos.js';
import { ZYOIN_LOGO, MAP_PHOTOS } from '../config.js';

const PI = Math.PI;

// Large-scale world-space tonal variation (warm/cool value noise) so tiled painterly textures
// read as hand-painted surfaces instead of a repeating pattern. Zero extra geometry.
const NOISE_GLSL = `
float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;
function painterlyPatch(m, k) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: k };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uPaint;' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 q = vWP.xz + vWP.y * vec2(0.83, -0.61);
        float n = pNoise(q * 0.085) * 0.55 + pNoise(q * 0.29 + 7.0) * 0.3 + pNoise(q * 1.1 + 3.0) * 0.15;
        vec3 tint = mix(vec3(0.84, 0.86, 0.95), vec3(1.08, 1.03, 0.93), smoothstep(0.15, 0.85, n));
        diffuseColor.rgb *= mix(vec3(1.0), tint, uPaint); }`);
  };
  m.customProgramCacheKey = () => 'painterly';
}

function std(color, mapName, { rough = 0.92, metal = 0, emissive = null, ei = 1, vc = true, paint = 0.6 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: vc });
  if (mapName) m.map = T.surface(mapName);
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  if (paint > 0) painterlyPatch(m, paint);
  return m;
}
// Self-lit material (bloom source). Colour is HDR, so only these cross the bloom threshold.
function glow(r, g, b) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: true }); }

export function buildZyoinMap(scene, { quality } = {}) {
  // shadow flags cost nothing while the renderer's shadow map is off (LOW), so always set them:
  // switching LOW → HIGH at runtime then gets full map shadows instead of none
  const hi = true; void quality;
  const M = {
    stucco: std(0xffffff, 'stucco', { paint: 1 }),
    plaster: std(0xffffff, 'plaster', { paint: 0.7 }),
    terracotta: std(0xffffff, 'terracotta', { paint: 0.8 }),
    teal: std(0xffffff, 'teal', { rough: 0.7, paint: 0.5 }),
    navy: std(0xffffff, 'navy', { rough: 0.6, paint: 0.3 }),
    metal: std(0xffffff, 'metal', { rough: 0.45, metal: 0.4, paint: 0 }),
    wood: std(0xffffff, 'wood', { rough: 0.8, paint: 0.5 }),
    crate: std(0xffffff, 'crate', { rough: 0.85, paint: 0.4 }),
    tile: std(0xffffff, 'tile', { rough: 0.85, paint: 0.8 }),
    stone: std(0xffffff, 'stone', { paint: 1 }),
    cobble: std(0xffffff, 'cobble', { paint: 1 }),
    checker: std(0xffffff, 'checker', { rough: 0.55, paint: 0.5 }),
    carpet: std(0xffffff, 'carpet', { paint: 0.6 }),
    stage: std(0xffffff, 'stage', { rough: 0.5, paint: 0.3 }),
    foliage: std(0xffffff, 'foliage', { rough: 1, paint: 0.6 }),
    bark: std(0xffffff, 'bark', { paint: 0.4 }),
    roof: std(0xffffff, 'rooftile', { rough: 0.8, paint: 1 }),
    kerb: std(0xffffff, 'kerb', { rough: 0.9, paint: 0.8 }),
    beam: std(0xffffff, 'beam', { rough: 0.85, paint: 0.4 }),
    red: std(0xff4655, null, { rough: 0.6, paint: 0.2 }),
    marigold: std(0xffc21a, null, { rough: 0.6, paint: 0.2 }),
    cream: std(0xece8e1, null, { rough: 0.7, paint: 0.3 }),
    dark: std(0x1a2530, null, { rough: 0.5, paint: 0 }),
    iron: std(0x231a16, null, { rough: 0.55, metal: 0.3, paint: 0 }),
    glass: std(0x2b4a5e, null, { rough: 0.32, metal: 0.25, paint: 0 }),
    lampGlass: glow(3.2, 1.9, 0.8),
    barCyan: glow(0.5, 2.6, 3.2),
    barWarm: glow(3.4, 1.6, 0.6),
    barRed: glow(3.2, 0.45, 0.6),
    signBack: new THREE.MeshStandardMaterial({ color: 0x0f1923, roughness: 0.6, transparent: true, opacity: 0.85 }),
    water: waterMaterial(),
    // office
    deskTop: std(0xf4f1ea, null, { rough: 0.5, paint: 0.1 }),
    chair: std(0x27323e, null, { rough: 0.75, paint: 0 }),
    fabric: std(0x2f8f88, null, { rough: 1, paint: 0.2 }),
    gold: std(0xffc21a, null, { rough: 0.25, metal: 0.85, paint: 0 }),
    whiteboard: std(0xf8f7f3, null, { rough: 0.22, paint: 0 }),
    screen: glow(0.34, 0.8, 1.3),
    frosted: new THREE.MeshStandardMaterial({ color: 0xd4edf3, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.2, depthWrite: false, vertexColors: true }),
    frostBand: new THREE.MeshStandardMaterial({ color: 0xf4fbfc, roughness: 0.6, transparent: true, opacity: 0.72, depthWrite: false, vertexColors: true }),
  };
  for (const k of ['water', 'lampGlass', 'barCyan', 'barWarm', 'barRed', 'kerb', 'signBack', 'screen', 'frosted', 'frostBand']) M[k].userData.noShadow = true;
  const WA = T.wearAtlas(); const wearMat = new THREE.MeshStandardMaterial({ map: WA.tex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); wearMat.userData.noShadow = true;
  const PA = T.posterAtlas(); const posterMat = new THREE.MeshStandardMaterial({ map: PA.tex, roughness: 0.85 }); posterMat.userData.noShadow = true;
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
  const occ = [], sills = [], doors = []; // façade bookkeeping so pilasters/lamps avoid windows
  const flowers = [], lanterns = [], diyas = [], balcs = [], coneGeos = [], flagPos = [], flagCol = [];
  const _up = new THREE.Vector3(0, 1, 0), _rq = new THREE.Quaternion(), _re = new THREE.Euler();
  function wall(x0, z0, x1, z1, h = 7, mat = M.stucco, { trim = true, cornice = true } = {}) {
    box(x0, 0, z0, x1, h, z1, mat, { uv: 3, ao: 3.2 });
    if (trim) box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.75, z1 + 0.06, M.terracotta, { collide: false, uv: 2, ao: 1.5 });
    if (cornice) {
      box(x0 - 0.18, h - 0.3, z0 - 0.18, x1 + 0.18, h, z1 + 0.18, M.plaster, { collide: false, uv: 2, ao: 0 });
      box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.22, z1 + 0.3, M.terracotta, { collide: false, uv: 2, ao: 0 });
      // thin walls get a pitched barrel-tile coping instead of a flat top
      if (Math.min(x1 - x0, z1 - z0) <= 2.1) coping(x0 - 0.34, z0 - 0.34, x1 + 0.34, z1 + 0.34, h + 0.22);
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
    box(x0 - 0.18, h - 0.3, a, x1 + 0.18, h, b, M.plaster, { collide: false, uv: 2, ao: 0 });
    box(x0 - 0.3, h, a, x1 + 0.3, h + 0.22, b, M.terracotta, { collide: false, uv: 2, ao: 0 });
    coping(x0 - 0.34, a - 0.01, x1 + 0.34, b + 0.01, h + 0.22);
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
      occ.push([axis, fixed, s - 1.25, s + 1.25]); sills.push([axis, fixed, s, side, y0 - 0.15]);
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
      const s = (from + to) / 2; occ.push([axis, fixed, s - 1.3, s + 1.3]); doors.push([axis, fixed, s, side]);
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
  // raised rim ring (open in the middle so the water shows), teal tile band, water just below the lip
  mesh(new THREE.LatheGeometry([new THREE.Vector2(2.6, 0.78), new THREE.Vector2(2.6, 0.98), new THREE.Vector2(2.36, 1.0), new THREE.Vector2(2.2, 0.98), new THREE.Vector2(2.2, 0.78)], 40), rimMat, { uv: 2, p: [0, 0, fz], outline: 0.03 });
  mesh(new THREE.CylinderGeometry(2.475, 2.53, 0.2, 40, 1, true), M.teal, { p: [0, 0.42, fz], uv: 1 });
  mesh(new THREE.CylinderGeometry(2.205, 2.205, 0.04, 40), M.water, { p: [0, 0.86, fz], uv: 3 });
  mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 16), rimMat, { p: [0, 1.5, fz], uv: 1, outline: 0.03 });
  mesh(new THREE.CylinderGeometry(1.0, 0.35, 0.35, 24), M.terracotta, { p: [0, 2.3, fz], uv: 1, outline: 0.03 });
  mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 24), M.water, { p: [0, 2.46, fz] });
  mesh(new THREE.SphereGeometry(0.22, 16, 12), M.marigold, { p: [0, 2.75, fz] });
  addSolid(-2.2, 0, fz - 2.2, 2.2, 0.85, fz + 2.2); contactRound(0, fz, 2.5, 0, 0.7);
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
  addSolid(TX - 1.6, 0, TZ - 1.6, TX + 1.6, 0.7, TZ + 1.6); contactRound(TX, TZ, 2.05, 0, 0.6); addSolid(TX - 0.45, 0, TZ - 0.45, TX + 0.45, 4, TZ + 0.45);
  tree(TX, 0.7, TZ, 1.25);
  planterBox(-6.5, -22, 2.2, 2.2);
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
    addSolid(tx - 0.4, 0, tz - 0.4, tx + 0.4, 1.13, tz + 0.4); contactRound(tx, tz, 0.3, 0, 0.5, 0.8);
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
  led.material.color.setScalar(1.15); led.position.set(33.5, 3.3, -34.38); scene.add(led); dyn.led = led;
  const ledLogo = logoPlane(ZYOIN_LOGO, { w: 4.8, h: 1.7, fallbackText: 'ZYOIN', color: '#FF4655', emissive: 1.1 });
  ledLogo.position.set(29.0, 3.55, -34.34); ledLogo.renderOrder = 2; scene.add(ledLogo);

  // ── signs ─────────────────────────────────────────────────────────────────
  sign('GCC SUMMIT', '#40e0ff', [33.5, 6.6, -34.9], 0, 11, { hdr: 1.8, sub: 'INDIA · 2026', subColor: '#ffc21a' });
  sign('THE COURTYARD', T.PAL.cream, [0, 6.6, 16.25], 0, 9.5, { hdr: 1.3, sub: 'CHAI · CALLS · CHAOS', subColor: '#ffc21a' });
  sign('THE PANTRY', T.PAL.cream, [-27, 4.6, -34.9], 0, 7, { hdr: 0.9, sub: 'A SITE', subColor: T.PAL.red });
  sign('NOT GOODBYE', T.PAL.marigold, [0, 4.6, -34.9], 0, 12, { hdr: 1.5, sub: 'SEE YOU LATER', subColor: T.PAL.red });
  sign('SUMMIT HALL', T.PAL.cream, [12.7, 4.8, -24], PI / 2, 6.5, { hdr: 0.9, sub: 'B SITE', subColor: T.PAL.red });
  sign('A', T.PAL.red, [-12.7, 5.0, -18], -PI / 2, 3.5, { hdr: 1.6 });
  sign('B', T.PAL.red, [12.68, 5.0, -18], PI / 2, 3.5, { hdr: 1.6 });
  sign('A ◂', T.PAL.cream, [-25.95, 5.3, 11], -PI / 2, 4, { hdr: 1.1 });
  sign('▸ B', T.PAL.cream, [25.95, 5.3, 11], PI / 2, 4, { hdr: 1.1 });
  sign('MID', T.PAL.cream, [0, 5.4, 25.38], PI, 4, { hdr: 1.1 });

  // painted floor letters
  floorDecal('A', [-27, 0.015, -27], 7);
  floorDecal('B', [30, 0.015, -21], 7);
  // vertical drapes either side of the spawn gate
  for (const sx of [-10.5, 10.5]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.2), new THREE.MeshStandardMaterial({ map: T.stripeTexture('#FF4655', '#0F1923', 2), side: THREE.DoubleSide, roughness: 0.9 }));
    d.position.set(sx, 2.7, 25.3); scene.add(d);
  }


  // ── string lights (instanced) ─────────────────────────
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
  if (bulbs.length) {
    const g = new THREE.SphereGeometry(0.075, 6, 4);
    const m = new THREE.MeshBasicMaterial({ toneMapped: true });
    const im = new THREE.InstancedMesh(g, m, bulbs.length);
    const cols = [new THREE.Color(4, 2.6, 1.0), new THREE.Color(4, 1.2, 1.6), new THREE.Color(3.4, 3.2, 2.6), new THREE.Color(1.2, 3, 2.8)];
    const mtx = new THREE.Matrix4();
    bulbs.forEach((p, i) => { mtx.makeTranslation(p.x, p.y - 0.08, p.z); im.setMatrixAt(i, mtx); im.setColorAt(i, cols[i % 4]); });
    scene.add(im); dyn.bulbs = im; dyn.bulbCols = cols;
  }
  if (marigolds.length) {
    const g = smoothIco(0.085);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const im = new THREE.InstancedMesh(g, m, marigolds.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const cs = [new THREE.Color('#ff9d00'), new THREE.Color('#ffc21a'), new THREE.Color('#ff7a1a'), new THREE.Color('#ffd34d')];
    marigolds.forEach((p, i) => { q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)); const k = 0.8 + Math.random() * 0.5; s.set(k, k, k); mtx.compose(p, q, s); im.setMatrixAt(i, mtx); im.setColorAt(i, cs[i % 4]); });
    im.castShadow = false; scene.add(im);
  }
  function buildWires() {
    const pos = [];
    for (const pts of wires) for (let i = 0; i < pts.length - 1; i++) pos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1410 })));
  }

  // ── the cat ───────────────────────────────────────────────────────────────
  const cat = makeCat(); cat.position.set(-44.2, 3.4, -23.8); cat.rotation.y = PI / 2 + 0.4; scene.add(cat);
  dyn.cat = cat; dyn.catHit = new THREE.Vector3(-44.2, 3.75, -23.8);

  // ── skyline beyond the walls (decor) ──────────────────────────────────────
  const skyline = [];
  {
    const r = (a, b) => a + Math.random() * (b - a);
    const ring = skyline;
    for (let i = 0; i < 46; i++) {
      const side = i % 4; let x, z;
      if (side === 0) { x = r(-80, 80); z = r(-75, -42); } else if (side === 1) { x = r(-80, 80); z = r(42, 75); } else if (side === 2) { x = r(-90, -52); z = r(-60, 60); } else { x = r(52, 90); z = r(-60, 60); }
      const w = r(6, 14), d = r(6, 14), h = r(10, 22);
      ring.push([x, z, w, d, h, Math.random()]);
    }
    for (const [x, z, w, d, h] of ring) {
      box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, Math.random() > 0.5 ? M.stucco : M.plaster, { collide: false, uv: 4, ao: 8 });
      box(x - w / 2 - 0.3, h, z - d / 2 - 0.3, x + w / 2 + 0.3, h + 0.4, z + d / 2 + 0.3, M.terracotta, { collide: false, ao: 0 });
    }
    // palms
    for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2; palm(Math.cos(a) * 58, Math.sin(a) * 50, 8 + Math.random() * 5); }
  }

  // ══ ART PASS: roofs, façades, festive dressing ═══════════════════════════
  // tiled hip roofs on the lane buildings and spawn blocks (decor, well above any reachable height)
  hipRoof(-26, -8, -9, 16, 7.72, 4.2);
  hipRoof(9, -8, 26, 16, 7.72, 4.2);
  hipRoof(-45, 26, -12, 35, 7.22, 2.6);
  hipRoof(12, 26, 45, 35, 7.22, 2.6);

  // pilasters between windows / on blank stretches
  pilasters('z', -9, 6, 16, 1, 7.5); pilasters('z', -9, -8, 2, 1, 7.5);
  pilasters('z', 9, 6, 16, -1, 7.5); pilasters('z', 9, -8, 2, -1, 7.5);
  pilasters('z', -26, 6, 16, -1, 7.5); pilasters('z', -26, -8, 2, -1, 7.5);
  pilasters('z', 26, 6, 16, 1, 7.5); pilasters('z', 26, -8, 2, 1, 7.5);
  pilasters('x', 16, -26, -9, 1, 7.5); pilasters('x', 16, 9, 26, 1, 7.5);
  pilasters('x', 26, -45, -12, -1, 7); pilasters('x', 26, 12, 45, -1, 7);
  pilasters('x', -8, -26, -9, -1, 7.5); pilasters('x', -8, 9, 26, -1, 7.5);
  pilasters('z', -45, -8, 16, 1, 8.5); pilasters('z', 45, -8, 16, -1, 8.5);
  pilasters('z', -45, 16, 26, 1, 8.5, { every: 3.4 }); pilasters('z', 45, 16, 26, -1, 8.5, { every: 3.4 });
  pilasters('z', -45, -35, -8, 1, 8.5, { every: 4.5, skip: [[-25, -20.8]] }); pilasters('z', 45, -35, -8, -1, 8.5, { every: 4.5 });
  pilasters('x', -35, -45, -12, 1, 8.5, { every: 4.6, skip: [[-35, -19.5]] });
  pilasters('x', -35, 12, 45, 1, 8.5, { every: 4.4, skip: [[25.4, 41.6]] });
  pilasters('x', -35, -12, 12, 1, 8.5, { every: 3.0, skip: [[-6.6, 6.6]] });
  for (const [x, sd] of [[-12.6, -1], [-11.4, 1], [11.4, -1], [12.6, 1]]) {
    pilasters('z', x, -35, -20, sd, 7, { every: 3.6, skip: x > 12 ? [[-27.5, -20.5]] : [] });
    pilasters('z', x, -16, -8, sd, 7, { every: 3.6 });
  }

  // weathering: brick showing through, drips under the cornice, cracks, damp, plaster repairs
  for (const [axis, fixed, from, to, side, h, n] of [
    ['z', -9, 6, 16, 1, 7.5, 3], ['z', -9, -8, 2, 1, 7.5, 2], ['z', 9, 6, 16, -1, 7.5, 3], ['z', 9, -8, 2, -1, 7.5, 2],
    ['z', -26, 6, 16, -1, 7.5, 3], ['z', -26, -8, 2, -1, 7.5, 2], ['z', 26, 6, 16, 1, 7.5, 3], ['z', 26, -8, 2, 1, 7.5, 2],
    ['x', 16, -26, -9, 1, 7.5, 3], ['x', 16, 9, 26, 1, 7.5, 3], ['x', 26, -45, -12, -1, 7, 4], ['x', 26, 12, 45, -1, 7, 4],
    ['x', -8, -26, -9, -1, 7.5, 2], ['x', -8, 9, 26, -1, 7.5, 2], ['z', -45, -8, 16, 1, 8.5, 4], ['z', 45, -8, 16, -1, 8.5, 4],
    ['z', -45, 16, 26, 1, 8.5, 2], ['z', 45, 16, 26, -1, 8.5, 2], ['z', -45, -20, -8, 1, 8.5, 3], ['z', 45, -35, -8, -1, 8.5, 4],
    ['x', -35, -45, -35, 1, 8.5, 2], ['x', -35, -19, -12, 1, 8.5, 2], ['x', -35, 12, 25, 1, 8.5, 2], ['x', -35, -12, -6.8, 1, 8.5, 1], ['x', -35, 6.8, 12, 1, 8.5, 1],
    ['z', -12.6, -35, -20, -1, 7, 3], ['z', -11.4, -35, -20, 1, 7, 2], ['z', 11.4, -35, -20, -1, 7, 2], ['z', 12.6, -35, -28, 1, 7, 2],
    ['z', -12.6, -16, -8, -1, 7, 2], ['z', -11.4, -16, -8, 1, 7, 1], ['z', 11.4, -16, -8, -1, 7, 1], ['z', 12.6, -16, -8, 1, 7, 2],
    ['x', 2, -26, -9, 1, 4, 2], ['x', 6, -26, -9, -1, 4, 2], ['x', 2, 9, 26, 1, 4, 2], ['x', 6, 9, 26, -1, 4, 2],
  ]) weather(axis, fixed, from, to, side, h, Math.round(n * 1.7));

  // balconies over the courtyard and plaza
  balcony('z', -9, 12.3, 1); balcony('z', 9, 8.1, -1);
  balcony('x', 16, -19.7, 1); balcony('x', 16, 19.7, 1);
  balcony('x', 26, -38.7, -1, { w: 2.8 }); balcony('x', 26, 39.3, -1, { w: 2.8 });
  balcony('z', -45, 2.5, 1, { y: 3.5 }); balcony('z', 45, 2.5, -1, { y: 3.5 });

  // door surrounds: plaster jambs, panelled leaves, brass handles, stone step
  for (const [axis, fixed, s0, side] of doors) {
    const B = (a0, y0, a1, y1, o0, o1, mat, o) => fbox(axis, fixed, side, a0, y0, a1, y1, o0, o1, mat, o);
    B(s0 - 1.12, 0, s0 - 0.9, 2.5, 0, 0.17, M.plaster, { ao: 2.5 }); B(s0 + 0.9, 0, s0 + 1.12, 2.5, 0, 0.17, M.plaster, { ao: 2.5 });
    B(s0 - 0.03, 0.05, s0 + 0.03, 2.45, 0.1, 0.13, M.iron);
    for (const y of [0.9, 1.7]) B(s0 - 0.85, y - 0.03, s0 + 0.85, y + 0.03, 0.1, 0.13, M.iron);
    for (const k of [-1, 1]) B(s0 + k * 0.16 - 0.03, 1.15, s0 + k * 0.16 + 0.03, 1.35, 0.1, 0.19, M.marigold);
    B(s0 - 1.25, 0, s0 + 1.25, 0.1, 0, 0.42, M.kerb, { uv: 1 });
  }

  // wall lanterns beside every door and at the corridor mouths / arches
  for (const [axis, fixed, s0, side] of doors) { lamp(axis, fixed, s0 - 1.45, side); lamp(axis, fixed, s0 + 1.45, side); }
  for (const [x, sd] of [[-26, -1], [-9, 1], [9, -1], [26, 1]]) { lamp('z', x, 0.9, sd, 3.0); lamp('z', x, 7.1, sd, 3.0); }
  lamp('x', 26, -9.5, -1, 3.2); lamp('x', 26, 9.5, -1, 3.2);
  for (const [x, sd] of [[-12.6, -1], [-11.4, 1], [11.4, -1], [12.6, 1]]) { lamp('z', x, -21.4, sd, 3.6); lamp('z', x, -14.6, sd, 3.6); }

  // corridor ceilings: exposed timber beams + a lantern
  for (const sx of [-1, 1]) {
    for (let x = 9.6; x < 25.6; x += 1.35) box(sx * x - 0.11, 3.72, 2, sx * x + 0.11, 4.0, 6, M.beam, { collide: false, uv: 1.5, ao: 0 });
    box(sx * 9.2, 3.82, 2.6, sx * 25.8, 3.95, 2.82, M.beam, { collide: false, uv: 1.5, ao: 0 });
    box(sx * 9.2, 3.82, 5.18, sx * 25.8, 3.95, 5.4, M.beam, { collide: false, uv: 1.5, ao: 0 });
    for (const x of [13.5, 21.5]) { lanterns.push([sx * x, 3.25, 4, 1]); wireSeg([sx * x, 3.72, 4], [sx * x, 3.45, 4]); }
  }

  // kerbs / thresholds between floor zones (flush, decor only)
  const kerbX = (x0, x1, z) => box(x0, -0.4, z - 0.2, x1, 0.025, z + 0.2, M.kerb, { collide: false, uv: 1.6, ao: 0 });
  const kerbZ = (x, z0, z1) => box(x - 0.2, -0.4, z0, x + 0.2, 0.025, z1, M.kerb, { collide: false, uv: 1.6, ao: 0 });
  kerbX(-45, -26, 16); kerbX(-9, 9, 16); kerbX(26, 45, 16); kerbX(-12, 12, 26);
  kerbX(-37, -26, -8); kerbX(-9, 9, -8); kerbX(26, 37, -8);
  kerbZ(-26, 2, 6); kerbZ(-9, 2, 6); kerbZ(9, 2, 6); kerbZ(26, 2, 6);
  kerbZ(-12, -20, -16); kerbZ(12, -20, -16);

  // rugs: A site (dining + kitchen) and a runner down the back hall
  rug(-20, -29, 6.4, 3.6, T.rugTexture(3, { bg: '#B8452F', a: '#FFC21A', b: '#0F1923', c: '#ECE8E1' }), true);
  rug(-27, -32.3, 6.2, 2.0, T.rugTexture(5, { bg: '#2F8F88', a: '#FFC21A', b: '#C8643B', c: '#ECE8E1' }), true);
  rug(0, -22, 2.4, 15, T.rugTexture(7, { bg: '#7A2433', a: '#FFC21A', b: '#0F1923', c: '#E8D9C0' }), false);

  // A SITE pergola over the raised deck (posts sit on the deck corners, beams above head height)
  for (const z of [-34.75, -26.3]) box(-36.35, 1.2, z - 0.15, -36.05, 5.0, z + 0.15, M.beam, { outline: true, uv: 1.2, ao: 0 });
  box(-36.4, 4.85, -35, -36.0, 5.15, -26, M.beam, { collide: false, outline: true, uv: 1.5, ao: 0 });
  box(-45, 4.85, -35, -44.75, 5.15, -26, M.beam, { collide: false, uv: 1.5, ao: 0 });
  for (let z = -34.6; z <= -26.3; z += 0.92) box(-45, 5.15, z - 0.08, -35.6, 5.4, z + 0.08, M.beam, { collide: false, outline: true, uv: 1.5, ao: 0 });
  for (const x of [-43, -40.5, -38]) box(x - 0.06, 5.4, -35, x + 0.06, 5.5, -26, M.beam, { collide: false, uv: 1.5, ao: 0 });
  for (const [x, z] of [[-44, -34], [-41.5, -33.2], [-39.2, -34.4], [-43.2, -30.5], [-38, -31.6], [-36.6, -33.6], [-36.5, -27.2], [-40.5, -27.6], [-44.2, -27.3]]) bloomPatch(x, 5.5, z, 1.3, 14);
  cascade('z', -36.2, -35, -32.5, 1, 5.3, { drop: 2.2, n: 22 }); cascade('z', -36.2, -28.2, -26, 1, 5.3, { drop: 2.0, n: 20 });

  // B SITE stage dressing: lit edge, LED side bars, a lighting truss with spot cones
  box(24, 0.9, -27.14, 43, 0.99, -27.0, M.barCyan, { collide: false, ao: 0 });
  box(31, 0.42, -26.26, 35, 0.5, -26.12, M.barWarm, { collide: false, ao: 0 });
  for (const x of [25.65, 41.15]) box(x, 1.05, -34.4, x + 0.2, 5.6, -34.25, M.barRed, { collide: false, ao: 0 });
  truss(12.6, 45, -29.6, 6.9);
  spot(26.5, -29.6, 6.6, 27.5, -31, [1.0, 0.75, 0.45]); spot(30, -29.6, 6.6, 29.6, -30, [1.0, 0.3, 0.6]);
  spot(33.5, -29.6, 6.6, 33.5, -31.5, [1.0, 0.85, 0.6]); spot(37, -29.6, 6.6, 37.4, -30, [0.3, 0.8, 1.0]);
  spot(40.5, -29.6, 6.6, 39.5, -31, [1.0, 0.75, 0.45]); spot(19, -29.6, 6.6, 20, -24, [0.9, 0.5, 0.25]);
  // event banners hanging on the hall walls
  poster('z', 45, -16, -1, 4.6, 4, 2.2); poster('z', 45, -21.5, -1, 4.6, 7, 2.2); poster('x', -35, 17, 1, 4.6, 3, 2.0);

  // posters on lanes / corridors / spawn
  poster('x', 2, -17, 1, 1.75, 0); poster('x', 2, -14.6, 1, 1.85, 2); poster('x', 6, -21, -1, 1.8, 6);
  poster('x', 2, 15.5, 1, 1.8, 3); poster('x', 6, 13.2, -1, 1.75, 5); poster('x', 6, 21.6, -1, 1.85, 0);
  poster('z', -45, 12.6, 1, 1.9, 5); poster('z', 45, -1.2, -1, 1.9, 2); poster('z', -26, -4.3, -1, 1.8, 4);
  poster('x', 26, -35.5, -1, 1.8, 3); poster('x', 26, 38.5, -1, 1.8, 4); poster('z', 26, 12.6, 1, 1.85, 6);
  poster('z', -12.6, -11, -1, 1.9, 7); poster('z', 12.6, -11.5, 1, 1.9, 0);

  // bougainvillea spilling over walls and building corners
  cascade('z', -9, 13.2, 16, 1, 7.5, { drop: 3.4, n: 34 }); cascade('x', 16, -13, -9, 1, 7.5, { drop: 3.0, n: 26 });
  cascade('z', 9, 13.2, 16, -1, 7.5, { drop: 3.4, n: 34 }); cascade('x', 16, 9, 13, 1, 7.5, { drop: 3.0, n: 26 });
  cascade('z', -9, -8, -5.4, 1, 7.5, { drop: 2.6, n: 22 }); cascade('z', 9, -8, -5.4, -1, 7.5, { drop: 2.6, n: 22 });
  cascade('z', -45, 17, 23, 1, 8.5, { drop: 4.2, n: 44 }); cascade('z', 45, 19, 25, -1, 8.5, { drop: 4.2, n: 44 });
  cascade('z', -12, 27, 31, 1, 7, { drop: 3.2, n: 30 }); cascade('z', 12, 27, 31, -1, 7, { drop: 3.2, n: 30 });
  cascade('z', -11.4, -35, -31.5, 1, 7, { drop: 3.5, n: 30 }); cascade('z', 11.4, -35, -31.5, -1, 7, { drop: 3.5, n: 30 });
  cascade('z', -12.6, -16, -13, -1, 7, { drop: 3.0, n: 24 }); cascade('z', 12.6, -11, -8, 1, 7, { drop: 3.0, n: 24 });
  cascade('z', 45, -35, -31, -1, 8.5, { drop: 3.4, n: 30, leafy: 0.75 }); cascade('z', -45, -14, -9, 1, 8.5, { drop: 3.8, n: 32, leafy: 0.8 });
  cascade('x', -35, 7.2, 11.4, 1, 8.5, { drop: 4.0, n: 26, leafy: 0.85 }); cascade('x', -35, -11.4, -7.2, 1, 8.5, { drop: 4.0, n: 26, leafy: 0.85 });


  // skyline roofs & domes so the silhouette over the walls reads as a town
  for (const [x, z, w, d, h, kind] of skyline) {
    if (kind < 0.55) hipRoof(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h + 0.4, Math.min(w, d) * 0.32, { over: 0.4, caps: false });
    else if (kind < 0.75) mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.3, 18, 8, 0, PI * 2, 0, PI / 2), M.teal, { p: [x, h + 0.4, z], uv: 2 });
  }


  officePass();

  // instanced dressing (one draw call each)
  buildFlowers(); buildLanterns(); buildDiyas(); buildCones(); buildWires(); buildBunting();

  const meshes = flush(scene, { shadows: hi });
  for (const m of meshes) if (m.material === M.water) m.onBeforeRender = () => { M.water.uniforms.uTime.value = performance.now() / 1000; };

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
  // ── art-pass helpers ──────────────────────────────────────────────────────
  // Triangle list with explicit UVs; each triangle is wound to face `out` (default: up).
  function tri(T, a, b, c, out = [0, 1, 0]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) T.push(a, c, b); else T.push(a, b, c);
  }
  function triGeo(T) {
    const pos = [], uv = [];
    for (const p of T) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals(); return g;
  }
  function rod(p0, p1, r, mat, seg = 8) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1); const d = b.clone().sub(a); const len = d.length();
    _rq.setFromUnitVectors(_up, d.normalize()); _re.setFromQuaternion(_rq);
    const mid = a.add(b).multiplyScalar(0.5);
    mesh(new THREE.CylinderGeometry(r, r, len, seg, 1, true), mat, { p: [mid.x, mid.y, mid.z], r: [_re.x, _re.y, _re.z], uv: 1 });
  }
  // Barrel-tile hip roof over a rectangle. Channels run down each slope (UVs follow the eave).
  function hipRoof(x0, z0, x1, z1, y, rise, { over = 0.5, caps = true } = {}) {
    const X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
    const ax = X1 - X0 >= Z1 - Z0; const L = ax ? X1 - X0 : Z1 - Z0, hw = (ax ? Z1 - Z0 : X1 - X0) / 2;
    const rl = Math.max(0, L / 2 - hw); const ca = ax ? (X0 + X1) / 2 : (Z0 + Z1) / 2, cb = ax ? (Z0 + Z1) / 2 : (X0 + X1) / 2;
    const P = (a, b, yy) => (ax ? [ca + a, yy, cb + b] : [cb + b, yy, ca + a]);
    const sl = Math.hypot(hw, rise); const T = [];
    for (const sb of [-1, 1]) {
      const E0 = [...P(-L / 2, sb * hw, y), -L / 2, 0], E1 = [...P(L / 2, sb * hw, y), L / 2, 0], R0 = [...P(-rl, 0, y + rise), -rl, sl], R1 = [...P(rl, 0, y + rise), rl, sl];
      tri(T, E0, E1, R1); if (rl > 0) tri(T, E0, R1, R0);
    }
    for (const sa of [-1, 1]) tri(T, [...P(sa * L / 2, -hw, y), -hw, 0], [...P(sa * L / 2, hw, y), hw, 0], [...P(sa * rl, 0, y + rise), 0, sl]);
    mesh(triGeo(T), M.roof, { keepUV: true, uv: 0.5 });
    box(X0, y - 0.16, Z0, X1, y + 0.01, Z1, M.terracotta, { collide: false, uv: 2, ao: 0 }); // fascia + soffit
    if (caps) {
      const r = 0.12, top = y + rise + 0.04;
      if (rl > 0) rod(P(-rl, 0, top), P(rl, 0, top), r, M.terracotta);
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) rod(P(sa * L / 2, sb * hw, y + 0.05), P(sa * rl, 0, top), r * 0.85, M.terracotta);
    }
  }
  // Pitched tile coping along the top of a thin wall.
  function coping(x0, z0, x1, z1, y, rise = 0.34) {
    const ax = x1 - x0 >= z1 - z0; const L = ax ? x1 - x0 : z1 - z0, hw = (ax ? z1 - z0 : x1 - x0) / 2;
    const ca = ax ? (x0 + x1) / 2 : (z0 + z1) / 2, cb = ax ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const P = (a, b, yy) => (ax ? [ca + a, yy, cb + b] : [cb + b, yy, ca + a]);
    const sl = Math.hypot(hw, rise); const T = [];
    for (const sb of [-1, 1]) {
      const E0 = [...P(-L / 2, sb * hw, y), -L / 2, 0], E1 = [...P(L / 2, sb * hw, y), L / 2, 0], R0 = [...P(-L / 2, 0, y + rise), -L / 2, sl], R1 = [...P(L / 2, 0, y + rise), L / 2, sl];
      tri(T, E0, E1, R1); tri(T, E0, R1, R0);
    }
    for (const sa of [-1, 1]) tri(T, [...P(sa * L / 2, -hw, y), -hw, 0], [...P(sa * L / 2, hw, y), hw, 0], [...P(sa * L / 2, 0, y + rise), 0, rise], ax ? [sa, 0, 0] : [0, 0, sa]);
    mesh(triGeo(T), M.roof, { keepUV: true, uv: 0.5 });
    rod(P(-L / 2, 0, y + rise + 0.02), P(L / 2, 0, y + rise + 0.02), 0.075, M.terracotta, 6);
  }
  // Façade box helper: `a` runs along the wall, `o` is the distance out from the face.
  function fbox(axis, fixed, side, a0, y0, a1, y1, o0, o1, mat, opt = {}) {
    const o = { collide: false, ao: 0, uv: 1.5, ...opt };
    if (axis === 'x') box(a0, y0, fixed + o0 * side, a1, y1, fixed + o1 * side, mat, o);
    else box(fixed + o0 * side, y0, a0, fixed + o1 * side, y1, a1, mat, o);
  }
  function pilasters(axis, fixed, from, to, side, h, { every = 4.2, skip = [] } = {}) {
    for (let s0 = from + every; s0 < to - 0.7; s0 += every) {
      if (occ.some((o) => o[0] === axis && Math.abs(o[1] - fixed) < 0.7 && s0 + 0.45 > o[2] && s0 - 0.45 < o[3])) continue;
      if (skip.some(([a, b]) => s0 > a - 0.45 && s0 < b + 0.45)) continue;
      fbox(axis, fixed, side, s0 - 0.27, 0.7, s0 + 0.27, h - 0.3, 0, 0.11, M.plaster, { uv: 2, ao: 3 });
      fbox(axis, fixed, side, s0 - 0.34, 0, s0 + 0.34, 0.95, 0, 0.17, M.terracotta, { ao: 1.2 });
      fbox(axis, fixed, side, s0 - 0.36, h - 0.62, s0 + 0.36, h - 0.3, 0, 0.2, M.plaster);
    }
  }
  function balcony(axis, fixed, s0, side, { y = 3.15, w = 2.6, dep = 0.9 } = {}) {
    balcs.push([axis, fixed, s0 - w / 2 - 0.3, s0 + w / 2 + 0.3]);
    const B = (a0, y0, a1, y1, o0, o1, mat, o) => fbox(axis, fixed, side, a0, y0, a1, y1, o0, o1, mat, o);
    B(s0 - w / 2, y - 0.2, s0 + w / 2, y, 0, dep, M.plaster, { outline: true });
    B(s0 - w / 2 + 0.06, y - 0.27, s0 + w / 2 - 0.06, y - 0.2, 0, dep - 0.06, M.terracotta);
    for (const k of [-1, 1]) B(s0 + k * (w / 2 - 0.35) - 0.11, y - 0.72, s0 + k * (w / 2 - 0.35) + 0.11, y - 0.27, 0, dep * 0.72, M.terracotta, { outline: true });
    const top = y + 0.95;
    B(s0 - w / 2 + 0.04, top, s0 + w / 2 - 0.04, top + 0.07, dep - 0.1, dep - 0.02, M.iron);
    B(s0 - w / 2 + 0.04, y + 0.1, s0 + w / 2 - 0.04, y + 0.15, dep - 0.09, dep - 0.03, M.iron);
    for (let a = s0 - w / 2 + 0.12; a < s0 + w / 2 - 0.05; a += 0.19) B(a - 0.016, y, a + 0.016, top, dep - 0.08, dep - 0.045, M.iron);
    for (const k of [-1, 1]) { const a = s0 + k * (w / 2 - 0.07); B(a - 0.035, top, a + 0.035, top + 0.07, 0.02, dep, M.iron); for (const o of [0.3, 0.55]) B(a - 0.016, y, a + 0.016, top, o, o + 0.03, M.iron); }
    cascade(axis, fixed + side * (dep - 0.05), s0 - w / 2 + 0.25, s0 + w / 2 - 0.25, side, top + 0.1, { drop: 1.4, n: 16, out: 0.0, top: 0 });
  }
  function lamp(axis, fixed, s0, side, y = 2.7) {
    if (balcs.some((b) => b[0] === axis && Math.abs(b[1] - fixed) < 0.7 && s0 > b[2] && s0 < b[3])) return;
    const B = (a0, y0, a1, y1, o0, o1, mat, o) => fbox(axis, fixed, side, a0, y0, a1, y1, o0, o1, mat, { uv: 1, ...o });
    B(s0 - 0.07, y, s0 + 0.07, y + 0.45, 0, 0.05, M.iron);
    B(s0 - 0.025, y + 0.32, s0 + 0.025, y + 0.38, 0.05, 0.4, M.iron);
    B(s0 - 0.17, y + 0.14, s0 + 0.17, y + 0.22, 0.2, 0.54, M.iron, { outline: true });
    B(s0 - 0.09, y + 0.22, s0 + 0.09, y + 0.3, 0.28, 0.46, M.iron);
    B(s0 - 0.11, y - 0.22, s0 + 0.11, y + 0.14, 0.26, 0.48, M.lampGlass);
    B(s0 - 0.14, y - 0.28, s0 + 0.14, y - 0.22, 0.23, 0.51, M.iron, { outline: true });
  }
  // Bougainvillea / ivy: blobs hanging off a wall top, denser near the top and the middle.
  function cascade(axis, fixed, from, to, side, top, { drop = 3, leafy = 0.3, out = 0.12, top: onTop = 1 } = {}) {
    const span = to - from;
    const put = (a, y, o, r, lf = leafy) => flowers.push(axis === 'x' ? [a, y, fixed + o * side, r, Math.random() < lf] : [fixed + o * side, y, a, r, Math.random() < lf]);
    // a dense mass along the top edge…
    if (onTop) for (let a = from + 0.1; a < to - 0.1; a += 0.3) { put(a + (Math.random() - 0.5) * 0.1, top + 0.08 + Math.random() * 0.12, 0.05 + Math.random() * 0.2, 0.24 + Math.random() * 0.1); put(a + 0.15, top - 0.18 - Math.random() * 0.1, 0.25 + Math.random() * 0.15, 0.2 + Math.random() * 0.08); }
    // …with strands hanging down, thinning out and shrinking toward their tips
    const strands = Math.max(2, Math.round(span / 0.5));
    for (let k = 0; k < strands; k++) {
      const t0 = Math.min(1, Math.max(0, (k + 0.5 + (Math.random() - 0.5) * 0.6) / strands)); let a0 = from + t0 * span;
      const len = drop * (0.3 + 0.7 * Math.sin(t0 * PI)) * (0.45 + Math.random() * 0.65);
      for (let d = 0; d < len; d += 0.22) {
        const f = d / Math.max(0.01, len); a0 += (Math.random() - 0.5) * 0.12;
        put(a0, top - 0.1 - d, out + 0.1 + 0.22 * (1 - f) + Math.random() * 0.08, (0.21 - 0.1 * f) * (0.8 + Math.random() * 0.4), leafy * (0.6 + f));
      }
    }
  }
  function bloomPatch(x, y, z, rad, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * PI * 2, d = Math.sqrt(Math.random()) * rad;
      flowers.push([x + Math.cos(a) * d, y + Math.random() * 0.25 - (d > rad * 0.7 ? Math.random() * 0.5 : 0), z + Math.sin(a) * d, 0.2 + Math.random() * 0.2, Math.random() < 0.35]);
    }
  }
  function bunting(pts) {
    const pal = ['#FF4655', '#FFC21A', '#2F8F88', '#ECE8E1', '#ff5fd2', '#C8643B'].map((c) => new THREE.Color(c));
    let acc = 0; const step = 0.48; let k = (Math.random() * 6) | 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1]; const seg = A.distanceTo(B); const t = B.clone().sub(A).normalize();
      while (acc < seg) {
        const p = A.clone().addScaledVector(t, acc); const sw = (Math.random() - 0.5) * 0.25;
        const tip = p.clone().add(new THREE.Vector3(0, -0.44, 0)).addScaledVector(new THREE.Vector3(-t.z, 0, t.x), sw);
        const v = [p.clone().addScaledVector(t, -0.17), p.clone().addScaledVector(t, 0.17), tip];
        const c = pal[k++ % pal.length];
        for (const q of v) { flagPos.push(q.x, q.y, q.z); flagCol.push(c.r, c.g, c.b); }
        acc += step;
      }
      acc -= seg;
    }
  }
  function buildBunting() {
    if (!flagPos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flagPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(flagCol, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
    m.castShadow = hi; m.matrixAutoUpdate = false; scene.add(m);
  }
  function wireSeg(a, b) { wires.push([new THREE.Vector3(...a), new THREE.Vector3(...b)]); }
  function rug(cx, cz, w, d, tx, alongX) {
    const long = Math.max(w, d), short = Math.min(w, d);
    const g = new THREE.PlaneGeometry(short, long); g.rotateX(-PI / 2); if (alongX) g.rotateY(PI / 2);
    g.translate(cx, 0.008, cz);
    if (long / short > 2.2) { tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, Math.round(long / (short * 1.5))); }
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
  }
  function decal(axis, fixed, s0, side, y, idx, w, h, mat, atlas) {
    const g = new THREE.PlaneGeometry(w, h); const [u0, v0, du, dv] = atlas.rect(idx); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
    const ry = axis === 'x' ? (side > 0 ? 0 : PI) : (side > 0 ? PI / 2 : -PI / 2);
    mesh(g, mat, { p: axis === 'x' ? [s0, y, fixed + 0.02 * side] : [fixed + 0.02 * side, y, s0], r: [0, ry, 0], keepUV: true, uv: 1 });
  }
  // scatter weathering on a façade, keeping clear of windows/doors
  function weather(axis, fixed, from, to, side, h, n = 3) {
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const kind = [0, 1, 7, 2, 2, 3, 4, 5, 6][(Math.random() * 9) | 0];
      const big = kind === 6 ? 3.4 : kind === 2 ? 2.0 : kind === 4 ? 2.6 : kind === 0 ? 2.1 : kind === 1 ? 1.7 : kind === 7 ? 1.3 : 1.5;
      const s0 = from + 0.8 + Math.random() * (to - from - 1.6);
      const y = kind === 2 ? h - 0.3 - big / 2 : kind === 6 ? big / 2 : kind === 4 ? 0.9 + big / 2 * 0.6 : 1.1 + Math.random() * (h - 3.2);
      if (kind !== 6 && kind !== 2 && occ.some((o) => o[0] === axis && Math.abs(o[1] - fixed) < 0.7 && s0 + big / 2 > o[2] && s0 - big / 2 < o[3])) continue;
      decal(axis, fixed, s0, side, y, kind, big * (kind === 6 ? 1.4 : 1), big, wearMat, WA); n--;
    }
  }
  function poster(axis, fixed, s0, side, y, idx, sc = 1) {
    const g = new THREE.PlaneGeometry(0.8 * sc, 1.0 * sc); const [u0, v0, du, dv] = PA.rect(idx); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
    const ry = axis === 'x' ? (side > 0 ? 0 : PI) : (side > 0 ? PI / 2 : -PI / 2);
    const o = 0.03 * side;
    mesh(g, posterMat, { p: axis === 'x' ? [s0, y, fixed + o] : [fixed + o, y, s0], r: [0, ry, (Math.random() - 0.5) * 0.06], keepUV: true, uv: 1 });
  }
  function truss(xa, xb, z, y) {
    const hs = 0.25, B = (x0, y0, z0, x1, y1, z1) => box(x0, y0, z0, x1, y1, z1, M.metal, { collide: false, uv: 1, ao: 0 });
    for (const dz of [-hs, hs]) for (const dy of [-hs, hs]) B(xa, y + dy - 0.035, z + dz - 0.035, xb, y + dy + 0.035, z + dz + 0.035);
    for (let x = xa + 0.3; x < xb; x += 0.6) {
      for (const dz of [-hs, hs]) B(x - 0.018, y - hs, z + dz - 0.018, x + 0.018, y + hs, z + dz + 0.018);
      for (const dy of [-hs, hs]) B(x - 0.018, y + dy - 0.018, z - hs, x + 0.018, y + dy + 0.018, z + hs);
    }
  }
  function spot(x, z, y, tx, tz, col) {
    const onStage = tx > 24 && tx < 43 && tz < -27;
    const top = new THREE.Vector3(x, y - 0.35, z), bot = new THREE.Vector3(tx, onStage ? 1.0 : 0, tz);
    const dir = bot.clone().sub(top); const len = dir.length(); dir.normalize();
    rod([x, y - 0.05, z], [x, y - 0.3, z], 0.03, M.dark, 6);
    rod([top.x - dir.x * 0.25, top.y - dir.y * 0.25, top.z - dir.z * 0.25], [top.x + dir.x * 0.2, top.y + dir.y * 0.2, top.z + dir.z * 0.2], 0.17, M.dark, 12);
    const lens = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12); _rq.setFromUnitVectors(_up, dir); _re.setFromQuaternion(_rq);
    const lp = top.clone().addScaledVector(dir, 0.21);
    mesh(lens, M.lampGlass, { p: [lp.x, lp.y, lp.z], r: [_re.x, _re.y, _re.z] });
    const g = new THREE.CylinderGeometry(0.14, 1.25, len, 24, 1, true); g.translate(0, -len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)); g.translate(top.x + dir.x * 0.2, top.y + dir.y * 0.2, top.z + dir.z * 0.2);
    const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; }
    g.setAttribute('spotCol', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('normal'); g.computeVertexNormals();
    coneGeos.push(g);
  }
  function buildCones() {
    if (!coneGeos.length) return;
    const g = mergeGeometries(coneGeos);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: 'attribute vec3 spotCol; varying vec3 vC; varying float vV; varying vec3 vN; varying vec3 vVP; void main(){ vC = spotCol; vV = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vVP = mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vV; varying vec3 vN; varying vec3 vVP; void main(){ float f = abs(dot(normalize(vN), normalize(-vVP))); float a = (0.2 + 0.8 * pow(vV, 1.5)) * pow(f, 1.8) * 0.45; gl_FragColor = vec4(vC * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.renderOrder = 3; m.matrixAutoUpdate = false; m.raycast = () => {}; scene.add(m);
  }
  function buildFlowers() {
    if (!flowers.length) return;
    const g = smoothIco(1);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.85 }), flowers.length);
    const pink = ['#d81f78', '#e8439a', '#c4166a', '#f06cb2', '#b5125e', '#ff5fa8'].map((c) => new THREE.Color(c));
    const leaf = ['#4f9a3c', '#62a845', '#3d8040', '#7cbc52'].map((c) => new THREE.Color(c));
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), v = new THREE.Vector3();
    flowers.forEach(([x, y, z, r, isLeaf], i) => {
      q.setFromEuler(e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      sc.set(r * (1.0 + Math.random() * 0.5), r * (0.55 + Math.random() * 0.3), r * (1.0 + Math.random() * 0.5));
      mtx.compose(v.set(x, y, z), q, sc); im.setMatrixAt(i, mtx);
      im.setColorAt(i, (isLeaf ? leaf : pink)[(Math.random() * (isLeaf ? leaf.length : pink.length)) | 0]);
    });
    im.castShadow = false; im.receiveShadow = hi; scene.add(im);
  }
  function buildLanterns() {
    if (!lanterns.length) return;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ map: T.lanternTexture(), toneMapped: true }), lanterns.length);
    const cols = [new THREE.Color(2.6, 0.55, 0.42), new THREE.Color(2.8, 1.65, 0.4), new THREE.Color(2.4, 0.6, 1.3), new THREE.Color(0.9, 2.2, 1.9)];
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(0.21, 0.28, 0.21), v = new THREE.Vector3();
    lanterns.forEach(([x, y, z, c], i) => { mtx.compose(v.set(x, y, z), q, sc); im.setMatrixAt(i, mtx); im.setColorAt(i, cols[c]); });
    scene.add(im);
  }
  function buildDiyas() {
    if (!diyas.length) return;
    const bowl = new THREE.CylinderGeometry(0.1, 0.055, 0.07, 10); bowl.translate(0, 0.035, 0);
    const bm = new THREE.InstancedMesh(bowl, new THREE.MeshStandardMaterial({ color: 0xb8582e, roughness: 0.8 }), diyas.length);
    const fg = new THREE.SphereGeometry(0.034, 6, 4); fg.scale(1, 1.9, 1); fg.translate(0, 0.115, 0);
    const uTime = { value: 0 };
    const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.7) });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 5.7;
        float k = 1.0 + 0.22 * sin(uTime * 13.0 + ph) + 0.1 * sin(uTime * 23.0 + ph * 1.7);
        transformed.y = 0.07 + (transformed.y - 0.07) * k;
        transformed.x += sin(uTime * 7.0 + ph) * 0.25 * max(0.0, transformed.y - 0.07);
        #endif`);
    };
    const fl = new THREE.InstancedMesh(fg, fm, diyas.length);
    fl.onBeforeRender = () => { uTime.value = performance.now() / 1000; };
    const mtx = new THREE.Matrix4();
    diyas.forEach(([x, y, z], i) => { mtx.makeTranslation(x, y, z); bm.setMatrixAt(i, mtx); fl.setMatrixAt(i, mtx); });
    bm.castShadow = false; bm.receiveShadow = hi; fl.frustumCulled = bm.frustumCulled = false;
    scene.add(bm, fl);
  }
  function crate(cx, cz, w, h, y = 0, rot = 0) {
    box(cx - w / 2, y, cz - w / 2, cx + w / 2, y + h, cz + w / 2, M.crate, { outline: true, uv: Math.max(w, h), ao: 0 });
  }
  function planterBox(cx, cz, w, d) {
    box(cx - w / 2, 0, cz - d / 2, cx + w / 2, 0.8, cz + d / 2, M.terracotta, { outline: true, uv: 1.5 });
    shrub(cx, 0.8, cz, Math.min(w, d) * 0.55);
  }
  function potPlant(cx, cz) {
    mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.8, 14), M.terracotta, { p: [cx, 0.4, cz], outline: 0.03, ao: 0.8 });
    contactRound(cx, cz, 0.35, 0, 0.45);
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
    contactRound(cx, cz, 0.6, 0, 0.7);
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
    m.color.setScalar(hdr * 0.72 + 0.15); // keep neon readable: only the cores cross the bloom threshold
    const p = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), m);
    p.position.set(...pos); p.rotation.y = rotY; p.renderOrder = 2;
    scene.add(p); dyn.signs.push(p);
    // dark backing plate
    mesh(new THREE.PlaneGeometry(width * 0.86, width / 4 * 0.78), M.signBack, { p: [pos[0] - Math.sin(rotY) * 0.03, pos[1], pos[2] - Math.cos(rotY) * 0.03], r: [0, rotY, 0] });
  }
  function floorDecal(letter, pos, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: T.floorLetter(letter, letter === 'A' ? '#FF4655' : '#FFC21A'), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.rotation.x = -PI / 2; m.position.set(...pos); m.receiveShadow = true; scene.add(m);
  }

  // ══ OFFICE PASS: reception, photo wall, trophies, desks, meeting room, boards ══
  // Static props go through the batcher (a handful of draw calls in total). Canvas panels, logos
  // and photos are separate meshes. All coordinates stay clear of the nav edges and posts.
  function officePass() {
    const rot = (ox, oz, ry, lx, lz) => [ox + lx * Math.cos(ry) + lz * Math.sin(ry), oz - lx * Math.sin(ry) + lz * Math.cos(ry)];
    // a box in a local frame (origin ox,oz; rotated ry about Y), decor only
    const part = (ox, oz, ry, lx, y, lz, w, h, d, mat) => { const [x, z] = rot(ox, oz, ry, lx, lz); mesh(new THREE.BoxGeometry(w, h, d), mat, { p: [x, y, z], r: [0, ry, 0], uv: 1 }); };

    // ── RECEPTION (attacker spawn) ──
    // logo wall behind the desk
    box(-4.7, 2.9, 34.82, 4.7, 5.9, 35, M.dark, { collide: false, ao: 0 });
    box(-4.7, 2.82, 34.78, 4.7, 2.9, 35, M.barRed, { collide: false, ao: 0 });
    const recLogo = logoPlane(ZYOIN_LOGO, { w: 8, h: 2.3, fallbackText: 'ZYOIN', emissive: 0.7 });
    recLogo.position.set(0, 4.45, 34.8); recLogo.rotation.y = PI; scene.add(recLogo);
    // desk: navy body, red kick strip, pale counter, monitor, bell, a little plant
    box(-3.4, 0, 32.95, 3.4, 1.0, 34.0, M.navy, { outline: true, uv: 1.5, ao: 1 });
    box(-3.55, 1.0, 32.85, 3.55, 1.08, 34.1, M.deskTop, { collide: false, outline: true });
    addSolid(-3.55, 1.0, 32.85, 3.55, 1.08, 34.1);
    box(-3.41, 0.12, 32.93, 3.41, 0.2, 32.95, M.barRed, { collide: false, ao: 0 });
    monitor(1.6, 1.08, 33.55, 0); monitor(-1.2, 1.08, 33.6, 0.25);
    mesh(new THREE.SphereGeometry(0.09, 12, 6, 0, PI * 2, 0, PI / 2), M.gold, { p: [0.3, 1.08, 33.2] });
    mug(-2.5, 1.08, 33.3, M.red); mug(2.6, 1.08, 33.25, M.cream);
    mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.28, 12), M.terracotta, { p: [-3.0, 1.22, 33.7] }); shrub(-3.0, 1.32, 33.7, 0.32);
    chair(-0.2, 34.55, PI); chair(1.9, 34.5, PI + 0.3);
    textPanel((x, W, H) => {
      x.fillStyle = '#0F1923'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#ECE8E1'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${H * 0.46}px "Bebas Neue", Impact, sans-serif`; x.fillText('WELCOME TO ZYOIN', W / 2, H * 0.42);
      x.fillStyle = '#FF4655'; x.font = `700 ${H * 0.13}px Inter, sans-serif`; x.fillText('BANGALORE · PLEASE SIGN THE VISITOR BOOK', W / 2, H * 0.78);
    }, 5.2, 0.62, [0, 0.62, 32.93], PI);
    // gate lintel: logo facing the spawn
    box(-3.3, 5.25, 26.6, 3.3, 6.85, 26.68, M.dark, { collide: false, ao: 0 });
    const gateLogo = logoPlane(ZYOIN_LOGO, { w: 5.8, h: 1.45, fallbackText: 'ZYOIN HQ', emissive: 0.9 });
    gateLogo.position.set(0, 6.05, 26.7); scene.add(gateLogo);
    // lobby sofas in the back corners (where the crates used to be)
    for (const [x0, x1] of [[-11.7, -8.3], [8.3, 11.7]]) {
      box(x0, 0, 33.7, x1, 0.45, 34.95, M.red, { outline: true, uv: 1.2 });
      box(x0, 0.45, 34.5, x1, 1.0, 34.95, M.red, { outline: true, uv: 1.2 });
      for (const ax of [x0, x1 - 0.22]) box(ax, 0.45, 33.7, ax + 0.22, 0.72, 34.5, M.red, { collide: false, outline: true });
      for (let k = 0; k < 3; k++) { const cx = x0 + 0.45 + k * ((x1 - x0 - 0.9) / 2); mesh(new THREE.BoxGeometry(0.62, 0.36, 0.16), M.cream, { p: [cx, 0.68, 34.38], r: [-0.25, 0, (k - 1) * 0.12], uv: 1 }); }
    }
    // WOW CHAMP trophy shelf on the east wall
    box(11.1, 0, 28.6, 12, 2.5, 31.9, M.wood, { outline: true, uv: 1.2, ao: 2.5 });
    box(11.05, 0.25, 28.75, 11.12, 2.35, 31.75, M.dark, { collide: false, ao: 0 });
    for (const y of [0.9, 1.65]) box(10.75, y - 0.04, 28.7, 11.1, y, 31.8, M.plaster, { collide: false });
    trophy(10.92, 1.65, 30.25, 1.25); trophy(10.92, 1.65, 29.3, 0.75); trophy(10.92, 1.65, 31.2, 0.75);
    trophy(10.92, 0.9, 29.6, 0.6); trophy(10.92, 0.9, 30.9, 0.6);
    for (const z of [29.0, 30.25, 31.5]) box(10.85, 0.9, z - 0.18, 10.95, 1.12, z + 0.18, M.gold, { collide: false }); // medals / plaques
    textPanel((x, W, H) => {
      x.fillStyle = '#0F1923'; x.fillRect(0, 0, W, H); x.strokeStyle = '#FFC21A'; x.lineWidth = H * 0.05; x.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
      x.fillStyle = '#FFC21A'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${H * 0.5}px "Bebas Neue", Impact, sans-serif`; x.fillText('★ WOW CHAMP ★', W / 2, H * 0.42);
      x.fillStyle = '#ECE8E1'; x.font = `700 ${H * 0.12}px Inter, sans-serif`; x.fillText('CHIKERO · THE ONLY MARKETER TO EVER WIN IT', W / 2, H * 0.76);
    }, 3.0, 0.72, [11.08, 2.95, 30.25], -PI / 2, { emissive: 0.25 });
    // photo-wall header (west wall); the photos themselves are hung by hangPhotos()
    textPanel((x, W, H) => {
      x.fillStyle = '#ECE8E1'; x.fillRect(0, 0, W, H); x.fillStyle = '#FF4655'; x.fillRect(0, H * 0.82, W, H * 0.18);
      x.fillStyle = '#0F1923'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${H * 0.56}px "Bebas Neue", Impact, sans-serif`; x.fillText('#ZYOINFAM · THE WALL', W / 2, H * 0.44);
    }, 4.6, 0.62, [-11.95, 5.95, 30.6], PI / 2);
    box(-12, 6.35, 27.2, -11.85, 6.42, 34, M.barWarm, { collide: false, ao: 0 }); // picture light

    // ── A SITE: THE PANTRY ──
    for (const [x, z, m] of [[-30.4, -20.4, M.red], [-29.9, -21.1, M.cream], [-27.8, -20.6, M.teal], [-26.2, -21.0, M.marigold], [-24.8, -20.5, M.navy]]) mug(x, 1.1, z, m);
    for (const [x, m] of [[-33.2, M.cream], [-32.8, M.red], [-25.9, M.teal], [-23.5, M.marigold], [-22.9, M.cream]]) mug(x, 1.05, -34.25, m);
    box(-29.6, 1.1, -21.3, -28.9, 1.13, -20.4, M.wood, { collide: false }); // tray
    // notice board on the west wall (the polaroids get pinned on its right edge)
    box(-45, 1.15, -16.35, -44.9, 2.8, -13.15, M.wood, { collide: false, ao: 0 });
    textPanel(drawNoticeBoard, 3.0, 1.45, [-44.88, 1.975, -14.75], PI / 2);
    textPanel((x, W, H) => {
      x.fillStyle = '#0F1923'; x.fillRect(0, 0, W, H); x.fillStyle = '#FFC21A'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${H * 0.62}px "Bebas Neue", Impact, sans-serif`; x.fillText('THE GREAT CAT RESCUE', W / 2, H * 0.55);
    }, 2.6, 0.36, [-44.95, 3.28, -19.4], PI / 2, { emissive: 0.2 });

    // ── OPEN-PLAN OFFICE (back hall, north of mid) ──
    deskPod(-9.0, -31.5); deskPod(-3.6, -31.5); deskPod(-3.6, -25.4);
    potPlant(-1.4, -34.3); potPlant(-11.0, -34.3); potPlant(-11.0, -22.6);
    // whiteboard with doodles (west wall, between the pilasters)
    box(-11.4, 1.0, -27.45, -11.3, 2.55, -24.55, M.metal, { collide: false, ao: 0 });
    textPanel(drawWhiteboard, 2.8, 1.4, [-11.28, 1.775, -26.0], PI / 2);
    box(-11.4, 0.92, -27.2, -11.18, 0.98, -24.8, M.metal, { collide: false, ao: 0 });
    for (const [z, m] of [[-26.9, M.red], [-26.75, M.navy], [-26.6, M.teal]]) box(-11.27, 0.98, z - 0.02, -11.2, 1.0, z + 0.06, m, { collide: false });
    // glass meeting room in the NE corner: frosted band, dark mullions, door gap at x 4.0..5.4
    const GZ = -29.5, GX = 2.5, GH = 2.8;
    const glassX = (x0, x1) => { box(x0, 0, GZ - 0.03, x1, GH, GZ + 0.03, M.frosted, { collide: true, ao: 0, shadow: false }); box(x0, 1.05, GZ - 0.04, x1, 1.45, GZ + 0.04, M.frostBand, { collide: false, ao: 0 }); };
    glassX(GX, 4.0); glassX(5.4, 11.4);
    box(GX - 0.03, 0, -35, GX + 0.03, GH, GZ, M.frosted, { collide: true, ao: 0, shadow: false });
    box(GX - 0.04, 1.05, -35, GX + 0.04, 1.45, GZ, M.frostBand, { collide: false, ao: 0 });
    for (const x of [GX, 4.0, 5.4, 7.4, 9.4, 11.38]) box(x - 0.04, 0, GZ - 0.05, x + 0.04, GH, GZ + 0.05, M.dark, { collide: false, ao: 0 });
    for (const z of [-33.0, -31.2]) box(GX - 0.05, 0, z - 0.04, GX + 0.05, GH, z + 0.04, M.dark, { collide: false, ao: 0 });
    box(GX - 0.05, GH - 0.08, GZ - 0.06, 11.4, GH, GZ + 0.06, M.dark, { collide: false, ao: 0 });
    box(GX - 0.06, GH - 0.08, -35, GX + 0.06, GH, GZ, M.dark, { collide: false, ao: 0 });
    box(4.0, GH - 0.08, GZ - 0.06, 5.4, 3.3, GZ + 0.06, M.dark, { collide: false, ao: 0 }); // door header
    textPanel((x, W, H) => {
      x.fillStyle = '#0F1923'; x.fillRect(0, 0, W, H); x.fillStyle = '#ECE8E1'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${H * 0.5}px "Bebas Neue", Impact, sans-serif`; x.fillText('MEETING ROOM · "QUICK SYNC"', W / 2, H * 0.52);
    }, 3.4, 0.4, [8.4, 2.45, GZ + 0.07], 0);
    // boardroom table, chairs and a wall screen
    box(5.6, 0.72, -33.4, 9.6, 0.78, -31.8, M.wood, { collide: false, outline: true });
    box(6.0, 0, -32.9, 9.2, 0.72, -32.3, M.dark, { collide: false });
    addSolid(5.6, 0, -33.4, 9.6, 0.78, -31.8);
    for (const x of [6.3, 7.6, 8.9]) { chair(x, -34.05, 0); chair(x, -31.15, PI); }
    chair(10.25, -32.6, -PI / 2);
    box(6.5, 1.25, -35, 8.9, 2.65, -34.9, M.dark, { collide: false, outline: true });
    const tv = logoPlane(ZYOIN_LOGO, { w: 2.1, h: 0.8, fallbackText: 'ZYOIN', emissive: 0.9 }); tv.position.set(7.7, 1.95, -34.88); scene.add(tv);
    for (const [x, m] of [[6.2, M.red], [8.2, M.cream], [9.1, M.teal]]) mug(x, 0.78, -32.9, m);

    // ── B SITE: SUMMIT HALL sponsor wall (west wall) ──
    box(12.6, 0.2, -34.85, 12.72, 3.75, -28.25, M.dark, { collide: false, ao: 0 });
    textPanel(drawSponsorWall, 6.4, 3.35, [12.74, 1.975, -31.55], PI / 2);
    box(12.6, 3.75, -34.85, 12.8, 3.85, -28.25, M.barRed, { collide: false, ao: 0 });

    // ── helpers ──
    function monitor(x, y, z, ry) { // faces local +z
      part(x, z, ry, 0, y + 0.01, -0.02, 0.24, 0.02, 0.16, M.dark);
      part(x, z, ry, 0, y + 0.12, -0.06, 0.04, 0.22, 0.03, M.dark);
      part(x, z, ry, 0, y + 0.42, -0.04, 0.66, 0.41, 0.04, M.dark);
      part(x, z, ry, 0, y + 0.42, -0.017, 0.61, 0.36, 0.006, M.screen);
      part(x, z, ry, 0, y + 0.012, 0.26, 0.44, 0.02, 0.14, M.chair); // keyboard
    }
    function chair(x, z, ry) { // seat faces local +z
      part(x, z, ry, 0, 0.47, 0, 0.5, 0.08, 0.48, M.chair);
      part(x, z, ry, 0, 0.82, -0.24, 0.46, 0.5, 0.06, M.chair);
      part(x, z, ry, 0, 0.25, 0, 0.06, 0.42, 0.06, M.metal);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2 + ry; mesh(new THREE.BoxGeometry(0.05, 0.04, 0.3), M.metal, { p: [x + Math.sin(a) * 0.15, 0.04, z + Math.cos(a) * 0.15], r: [0, a, 0] }); }
      contactRound(x, z, 0.22, 0, 0.3, 0.6, 10);
    }
    // two desks facing each other across a fabric divider, with monitors, chairs and clutter
    function deskPod(cx, cz) {
      box(cx - 0.8, 0.72, cz - 0.8, cx + 0.8, 0.76, cz + 0.8, M.deskTop, { collide: false, outline: true });
      for (const sx of [-0.77, 0.73]) box(cx + sx, 0, cz - 0.78, cx + sx + 0.04, 0.72, cz + 0.78, M.metal, { collide: false });
      box(cx - 0.8, 0.76, cz - 0.02, cx + 0.8, 1.18, cz + 0.02, M.fabric, { collide: false, outline: true });
      addSolid(cx - 0.8, 0, cz - 0.8, cx + 0.8, 0.76, cz + 0.8);
      contact(cx - 0.8, cz - 0.8, cx + 0.8, cz + 0.8, 0, 0.5, 0.7);
      monitor(cx - 0.1, 0.76, cz - 0.36, PI); monitor(cx + 0.15, 0.76, cz + 0.36, 0);
      chair(cx - 0.1, cz - 1.25, 0); chair(cx + 0.2, cz + 1.25, PI + 0.35);
      mug(cx + 0.55, 0.76, cz - 0.3, M.red); mug(cx - 0.55, 0.76, cz + 0.45, M.teal);
      box(cx + 0.3, 0.76, cz + 0.25, cx + 0.6, 0.79, cz + 0.6, M.cream, { collide: false }); // notepad
    }
    function mug(x, y, z, mat) {
      mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 10), mat, { p: [x, y + 0.055, z] });
      mesh(new THREE.TorusGeometry(0.03, 0.009, 5, 8, PI), mat, { p: [x + 0.05, y + 0.055, z], r: [0, 0, -PI / 2] });
    }
    function trophy(x, y, z, k) {
      mesh(new THREE.BoxGeometry(0.22 * k, 0.1 * k, 0.22 * k), M.dark, { p: [x, y + 0.05 * k, z] });
      mesh(new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.03, 0.05], [0.025, 0.16], [0.06, 0.2], [0.11, 0.3], [0.12, 0.4], [0.0, 0.4]].map(([a, b]) => new THREE.Vector2(a * k, b * k)), 14), M.gold, { p: [x, y + 0.1 * k, z] });
      for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.05 * k, 0.012 * k, 5, 10, PI), M.gold, { p: [x, y + 0.42 * k, z + s * 0.11 * k], r: [0, PI / 2, s > 0 ? -PI / 2 : PI / 2] });
    }
  }
  // A canvas-textured plane (signs, boards). draw(ctx, W, H); front faces +Z, then rotated by ry.
  function textPanel(draw, w, h, pos, ry, { px = 300, emissive = 0, transparent = false } = {}) {
    const c = document.createElement('canvas'); c.width = Math.min(2048, Math.round(px * w)); c.height = Math.min(1024, Math.round(px * h));
    draw(c.getContext('2d'), c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, transparent, emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? t : null, emissiveIntensity: emissive });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(...pos); p.rotation.y = ry; p.receiveShadow = true;
    p.matrixAutoUpdate = false; p.updateMatrix(); scene.add(p); return p;
  }
  function drawWhiteboard(x, W, H) {
    const u = W / 840; x.fillStyle = '#fbfbf8'; x.fillRect(0, 0, W, H);
    x.lineCap = 'round'; x.lineJoin = 'round';
    const pen = (c, w) => { x.strokeStyle = c; x.fillStyle = c; x.lineWidth = w * u; };
    const hand = (t, X, Y, size, c, rot = 0) => { x.save(); x.translate(X * u, Y * u); x.rotate(rot); x.fillStyle = c; x.font = `${size * u}px "Bebas Neue", Impact, sans-serif`; x.fillText(t, 0, 0); x.restore(); };
    hand('Q4 PLAN (THE REAL ONE)', 30, 62, 50, '#1f4fb8', -0.02);
    pen('#1f4fb8', 4); x.beginPath(); x.moveTo(30 * u, 74 * u); x.lineTo(380 * u, 70 * u); x.stroke();
    // chart going up and to the right
    pen('#222', 4); x.beginPath(); x.moveTo(50 * u, 110 * u); x.lineTo(50 * u, 330 * u); x.lineTo(400 * u, 330 * u); x.stroke();
    pen('#1aa36b', 6); x.beginPath(); [[60, 310], [120, 290], [170, 300], [230, 240], [290, 220], [340, 150], [390, 118]].forEach(([a, b], i) => (i ? x.lineTo(a * u, b * u) : x.moveTo(a * u, b * u))); x.stroke();
    hand('WOW!', 300, 105, 44, '#e0303f', 0.1); hand('SPONSORS ↑', 120, 370, 34, '#222');
    // to-do list
    hand('TO DO:', 460, 120, 38, '#222');
    ['☑ CLOSE GCC SPONSORS', '☑ WIN WOW CHAMP', '☑ RESCUE THE CAT', '☐ SAY GOODBYE'].forEach((t, i) => hand(t, 470, 165 + i * 42, 30, i === 3 ? '#e0303f' : '#1f4fb8'));
    pen('#e0303f', 4); x.beginPath(); x.moveTo(465 * u, 300 * u); x.lineTo(700 * u, 300 * u); x.stroke();
    hand('(NOT YET)', 610, 330, 28, '#e0303f', -0.05);
    // cat doodle
    pen('#222', 4); const cx = 740, cy = 120; x.beginPath(); x.arc(cx * u, cy * u, 40 * u, 0, PI * 2); x.stroke();
    x.beginPath(); x.moveTo((cx - 34) * u, (cy - 20) * u); x.lineTo((cx - 30) * u, (cy - 62) * u); x.lineTo((cx - 8) * u, (cy - 38) * u); x.moveTo((cx + 34) * u, (cy - 20) * u); x.lineTo((cx + 30) * u, (cy - 62) * u); x.lineTo((cx + 8) * u, (cy - 38) * u); x.stroke();
    x.beginPath(); x.arc((cx - 14) * u, (cy - 6) * u, 4 * u, 0, 7); x.arc((cx + 14) * u, (cy - 6) * u, 4 * u, 0, 7); x.fill();
    x.beginPath(); for (const s of [-1, 1]) for (const d of [-6, 6]) { x.moveTo((cx + s * 12) * u, (cy + 12) * u); x.lineTo((cx + s * 56) * u, (cy + 12 + d) * u); } x.stroke();
    hand('SAVED BY C.', 680, 200, 30, '#222');
    // heart + sign-off
    pen('#e0303f', 5); x.beginPath(); const hx = 720, hy = 330; x.moveTo(hx * u, (hy + 30) * u); x.bezierCurveTo((hx - 60) * u, (hy - 10) * u, (hx - 20) * u, (hy - 50) * u, hx * u, (hy - 15) * u); x.bezierCurveTo((hx + 20) * u, (hy - 50) * u, (hx + 60) * u, (hy - 10) * u, hx * u, (hy + 30) * u); x.stroke();
    hand('CHIKERO', 660, 400, 36, '#e0303f', -0.04);
    // sticky notes
    for (const [X, Y, c, t, r] of [[420, 360, '#ffe066', 'CHAI 4PM', -0.06], [250, 380, '#ffb3c7', 'BOOK VENUE', 0.05]]) {
      x.save(); x.translate(X * u, Y * u); x.rotate(r); x.fillStyle = c; x.fillRect(0, 0, 130 * u, 46 * u); x.fillStyle = '#333'; x.font = `${22 * u}px "Bebas Neue", Impact, sans-serif`; x.fillText(t, 10 * u, 31 * u); x.restore();
    }
  }
  function drawNoticeBoard(x, W, H) {
    const u = W / 900; x.fillStyle = '#b4875a'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(80,50,25,0.25)' : 'rgba(240,210,170,0.2)'; x.fillRect(Math.random() * W, Math.random() * H, 2 * u, 2 * u); }
    const note = (X, Y, w, h, bg, r, lines, pin = '#FF4655') => {
      x.save(); x.translate(X * u, Y * u); x.rotate(r);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(4 * u, 5 * u, w * u, h * u); x.fillStyle = bg; x.fillRect(0, 0, w * u, h * u);
      x.fillStyle = '#1b2733'; lines.forEach(([t, s, f], i) => { x.font = `${f || ''} ${s * u}px ${f ? 'Inter, sans-serif' : '"Bebas Neue", Impact, sans-serif'}`; x.fillText(t, 12 * u, (16 + s + lines.slice(0, i).reduce((a, l) => a + l[1] * 1.15, 0)) * u, (w - 20) * u); });
      x.fillStyle = pin; x.beginPath(); x.arc((w / 2) * u, 8 * u, 7 * u, 0, 7); x.fill(); x.restore();
    };
    note(24, 24, 230, 150, '#fff6c9', -0.04, [['WOW CHAMP', 44], ['Congrats Chikero!', 20, 700], ['The only marketer to', 16, 500], ['ever win it.', 16, 500]]);
    note(280, 30, 210, 120, '#ECE8E1', 0.03, [['GCC SUMMIT', 40], ['Sponsors: CONFIRMED ✓', 16, 700], ['Lanyards: 300', 16, 500]], '#2F8F88');
    note(30, 205, 220, 180, '#d9f2ee', 0.05, [['PANTRY RULES', 36], ['1. Label your food', 16, 500], ['2. Chai > coffee', 16, 500], ['3. No cats on the', 16, 500], ['    counter*', 16, 500], ['*rescues excepted', 14, 700]], '#FFC21A');
    note(275, 175, 230, 120, '#ffd6dc', -0.05, [['FAREWELL CAKE', 38], ['Friday · 4 PM · Pantry', 16, 700]]);
    note(290, 315, 200, 95, '#fff', 0.04, [['LOST: 1 SCARED CAT', 22, 700], ['FOUND: top of cabinet', 15, 500]]);
  }
  function drawSponsorWall(x, W, H) {
    x.fillStyle = '#0F1923'; x.fillRect(0, 0, W, H);
    const cols = 4, rows = 5, cw = W / cols, rh = H / rows;
    const names = [['ZYOIN', '#FF4655'], ['GCC SUMMIT 2026', '#ECE8E1'], ['ZYOIN', '#FF4655'], ['PARTNERSHIPS', '#FFC21A']];
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const [t, col] = names[(c + r * 2) % names.length]; const big = t === 'ZYOIN';
      x.fillStyle = col; x.font = `${rh * (big ? 0.62 : 0.34)}px "Bebas Neue", Impact, sans-serif`;
      x.fillText(t, (c + 0.5 + (r % 2) * 0.5 - (r % 2 && c === cols - 1 ? cols : 0)) * cw, (r + 0.5) * rh, cw * 0.9);
    }
    x.strokeStyle = 'rgba(236,232,225,0.08)'; x.lineWidth = 2; for (let r = 1; r < rows; r++) { x.beginPath(); x.moveTo(0, r * rh); x.lineTo(W, r * rh); x.stroke(); }
  }

  // ── framed photos (MAP_PHOTOS.zyoin) ──────────────────────────────────────
  // Slots are grouped by place; each photo is routed by keywords in its src/caption (cat-rescue
  // → The Pantry, polaroids → the notice board, summit/event → Summit Hall, desk → the office,
  // everything else → the reception photo wall), then matched to a landscape or portrait slot
  // once its aspect ratio is known. Overflow spills to the next group, then to the corridors.
  // Frames are created when the image has loaded, and only while this map is still live.
  function hangPhotos(list) {
    const W = (z, y, o, w, h, cap = true) => ({ p: [-11.96, y, z], ry: PI / 2, o, w, h, cap });
    const groups = {
      pantry: [[-44.96, 2.25, -20.65], [-44.96, 2.25, -19.4], [-44.96, 2.25, -18.15]].map((p) => ({ p, ry: PI / 2, o: 'P', w: 0.78, h: 1.04, cap: true })),
      board: [{ p: [-44.86, 1.98, -13.78], ry: PI / 2, o: 'P', w: 0.56, h: 1.2, cap: false, depth: 0.02 }],
      summit: [
        { p: [44.96, 2.85, -32.75], ry: -PI / 2, o: 'P', w: 1.15, h: 1.55, cap: true },
        { p: [44.96, 2.2, -19.25], ry: -PI / 2, o: 'P', w: 1.1, h: 1.5, cap: true },
        { p: [44.96, 2.05, -14.75], ry: -PI / 2, o: 'L', w: 1.8, h: 1.2, cap: true },
        { p: [23.9, 2.2, -8.04], ry: PI, o: 'L', w: 1.6, h: 1.1, cap: true },
      ],
      office: [{ p: [-11.36, 2.05, -29.6], ry: PI / 2, o: 'L', w: 1.55, h: 1.05, cap: true }],
      wall: [W(28.55, 2.35, 'L', 1.75, 1.2), W(32.65, 2.35, 'L', 1.75, 1.2), W(30.6, 2.5, 'P', 1.15, 1.75), W(30.6, 4.75, 'P', 0.95, 1.2), W(28.55, 4.45, 'L', 1.4, 0.95), W(32.65, 4.45, 'L', 1.4, 0.95)],
      corridor: [
        { p: [-22, 1.95, 2.04], ry: 0, o: 'L', w: 1.3, h: 0.9, cap: true }, { p: [21, 1.95, 2.04], ry: 0, o: 'L', w: 1.3, h: 0.9, cap: true },
        { p: [-15, 1.95, 5.96], ry: PI, o: 'L', w: 1.3, h: 0.9, cap: true }, { p: [17.4, 1.95, 5.96], ry: PI, o: 'L', w: 1.3, h: 0.9, cap: true },
      ],
    };
    const order = ['pantry', 'board', 'summit', 'office', 'wall', 'corridor'];
    const route = (ph) => { const k = `${ph.src} ${ph.caption || ''}`.toLowerCase(); return /cat/.test(k) ? 'pantry' : /polaroid|pinned/.test(k) ? 'board' : /summit|lobby|lanyard|hpe|stage|sponsor|event/.test(k) ? 'summit' : /desk/.test(k) ? 'office' : 'wall'; };
    let pending = list.length; const loaded = [];
    const place = () => {
      if (!sceneAlive()) return;
      const queue = Object.fromEntries(order.map((g) => [g, []]));
      loaded.forEach((ph) => queue[route(ph)].push(ph));
      order.forEach((g, gi) => {
        const free = groups[g].slice();
        for (const ph of queue[g]) {
          const want = ph.aspect >= 1.1 ? 'L' : 'P';
          let i = free.findIndex((s) => s.o === want); if (i < 0) i = free.findIndex(() => true);
          if (i < 0) { if (gi + 1 < order.length) queue[order[g === 'wall' ? gi + 1 : order.indexOf('wall') > gi ? order.indexOf('wall') : gi + 1]].push(ph); continue; }
          const s = free.splice(i, 1)[0];
          let w = s.w, h = s.h; if (ph.aspect > w / h) h = w / ph.aspect; else w = h * ph.aspect;
          const f = photoFrame(ph.src, { w, h, caption: s.cap ? ph.caption : '', frame: g === 'board' ? 0xf4f1ea : 0x1a2530, depth: s.depth || 0.06 });
          f.position.set(...s.p); f.rotation.y = s.ry;
          f.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
          scene.add(f);
        }
      });
    };
    if (!pending) return;
    list.forEach((ph, idx) => loadPhoto(ph.src, (tex, aspect) => {
      loaded[idx] = { ...ph, aspect }; // keep config order
      if (--pending === 0) { for (let k = loaded.length - 1; k >= 0; k--) if (!loaded[k]) loaded.splice(k, 1); place(); }
    }, ph.caption));
  }
  // true while this map is being built or is in the scene (not after it has been unloaded)
  function sceneAlive() { return !built || !!scene.parent; }

  // ── navigation ────────────────────────────────────────────────────────────
  const nodes = {
    S0: [0, 30], P0: [0, 21], PW: [-35, 21], PE: [35, 21], MS: [0, 13],
    AL: [-35, 12], ALc: [-33, 4], AL2: [-33, -4], AMAIN: [-31, -11], AM2: [-22, -17], ASITE: [-21, -27], APLANT: [-27, -27], AB: [-14, -18],
    CWa: [-24, 4], CWb: [-11, 4], MWc: [-6, 5], MEc: [6, 5], MN: [0, -3], BH: [0, -16],
    BL: [35, 12], BLc: [33, 4], BL2: [33, -4], BMAIN: [31, -11], BSITE: [30, -22], BB: [14, -18], CEa: [24, 4], CEb: [11, 4],
  };
  const edges = [
    ['S0', 'P0'], ['P0', 'PW'], ['P0', 'PE'], ['P0', 'MS'], ['PW', 'AL'], ['AL', 'ALc'], ['ALc', 'AL2'], ['AL2', 'AMAIN'], ['AMAIN', 'AM2'], ['AM2', 'ASITE'], ['ASITE', 'APLANT'], ['AM2', 'AB'], // (no AMAIN→APLANT edge: that straight leg runs into the island counter)
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

// Stylised animated fountain water: concentric ripples from the jet, drifting caustic bands,
// foam at the rim, sun glints. Time comes from performance.now() in onBeforeRender.
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Vector2(0, 5) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec2 uC; varying vec3 vP;
      void main(){
        vec2 d = vP.xz - uC; float r = length(d);
        float R = vP.y > 1.5 ? 0.85 : 2.2;           // upper bowl vs basin
        float t = uTime;
        vec2 q = vP.xz * 2.4;
        float c = sin(q.x * 1.6 + t * 1.2 + sin(q.y * 1.3 + t * 0.8) * 1.4) + sin(q.y * 1.8 - t * 1.0 + sin(q.x * 1.2 - t * 0.6) * 1.4);
        c = smoothstep(0.9, 1.9, abs(c));
        float ring = smoothstep(0.55, 1.0, sin(r * 10.0 - t * 3.2)) * (1.0 - smoothstep(0.0, R, r)) * 0.8;
        vec3 deep = vec3(0.02, 0.20, 0.25), shallow = vec3(0.10, 0.55, 0.55);
        vec3 col = mix(deep, shallow, 0.35 + 0.45 * smoothstep(0.0, R, r));
        col += vec3(0.35, 0.75, 0.7) * c * 0.35 + vec3(0.7, 0.9, 0.85) * ring * 0.35;
        float foam = smoothstep(R - 0.22, R - 0.02, r) + (1.0 - smoothstep(0.25, 0.6, r)) * (vP.y > 1.5 ? 0.0 : 0.9);
        col = mix(col, vec3(0.95, 0.97, 0.92), clamp(foam, 0.0, 1.0) * (0.55 + 0.25 * sin(t * 5.0 + r * 20.0)));
        float glint = pow(max(0.0, sin(q.x * 3.1 + t * 2.0) * sin(q.y * 2.7 - t * 1.7)), 24.0);
        col += vec3(1.0, 0.85, 0.6) * glint * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// 20-triangle icosahedron with sphere normals: reads round at a fraction of the cost.
function smoothIco(r) {
  const g = new THREE.IcosahedronGeometry(r, 0); const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}

function ledTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 308; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1024, 308); g.addColorStop(0, '#0F1923'); g.addColorStop(1, '#1c3a52');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 308);
  x.strokeStyle = 'rgba(64,224,255,0.3)'; x.lineWidth = 2;
  for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(150, 154, 30 + i * 18, 0, 6.3); x.stroke(); }
  x.fillStyle = 'rgba(15,25,35,0.75)'; x.fillRect(0, 0, 380, 308); // the ZYOIN logo sits on this panel
  x.fillStyle = '#FF4655'; x.fillRect(380, 40, 4, 228);
  x.textBaseline = 'middle';
  x.fillStyle = '#ECE8E1'; x.font = '120px "Bebas Neue", Impact, sans-serif'; x.fillText('GCC SUMMIT', 420, 116);
  x.fillStyle = '#FF4655'; x.font = '700 26px Inter, sans-serif'; x.fillText('PARTNERSHIPS · SPONSORS · BIG ENERGY', 424, 200);
  x.fillStyle = '#FFC21A'; x.font = '700 20px Inter, sans-serif'; x.fillText('HEADLINE PARTNER LEAD: CHIKERO', 424, 246);
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
