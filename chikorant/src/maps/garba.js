// GARBA NIGHT — an original open-air Navratri festival ground at night (~90×70).
// North is −Z, attackers spawn south (+Z) behind a decorated toran gate.
//   A Site "The Pandal Stage"  (NW)  music stage, speaker stacks, dhol, decorated backdrop with photo screens
//   B Site "Food Stalls"       (NE)  chai / pani-puri / jalebi stalls, counters as cover, seating deck
//   Mid    "The Garba Circle"         painted rangoli floor, the garbo lamp tower, chasing ring lights,
//                                     dandiya racks, maypole strings of lights
// Same return shape as buildMap() in ../map.js: { meshes, dyn, nodes, edges, posts, spawnPoint, M }.
//
// NIGHT LIGHTING CONTRACT (dyn.lighting). The game should apply these when this map is active:
//   sunColor, sunIntensity, sunDir [x,y,z]   → the main DirectionalLight (here: cool moonlight from the NE)
//   hemiSky, hemiGround, hemiIntensity       → the HemisphereLight
//   fillColor, fillIntensity, rimColor, rimIntensity → the two secondary DirectionalLights (optional)
//   fog: [color, near, far]                  → scene.fog
//   skyTop, skyHorizon                       → sky colours (only needed if the game keeps its own sky)
//   exposure                                 → renderer.toneMappingExposure (optional)
// The map ships its own night sky dome (moon, stars, dusk glow; dyn.sky) and fake warm "lantern light
// pools" baked into its materials. Both switch on automatically when the scene fog turns dark (i.e. once
// dyn.lighting has been applied) and stay off under the default golden-hour lighting.
// dyn.setNight(true|false|null) forces them on/off (null = automatic).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, mesh, flush, contactRound } from '../builder.js';
import { addSolid } from '../physics.js';
import * as T from '../textures.js';
import * as GT from './garbaTextures.js';
import { photoFrame } from '../photos.js';
import { MAP_PHOTOS } from '../config.js';
import { makeCat } from '../map.js';

const PI = Math.PI;
const NP = 40; // light pools
const WARM = [1.55, 0.88, 0.42], SAFF = [1.6, 0.66, 0.26], PINK = [1.35, 0.5, 0.85], GOLD = [1.5, 1.05, 0.55];

export const GARBA_LIGHTING = {
  sunColor: 0xa9bcff, sunIntensity: 1.25, sunDir: [0.36, 0.62, -0.7],
  hemiSky: 0x6c70c4, hemiGround: 0x7a4638, hemiIntensity: 1.15,
  fillColor: 0x8a6cff, fillIntensity: 0.35, rimColor: 0xff8a5a, rimIntensity: 0.35,
  fog: [0x2a1d45, 45, 230],
  skyTop: 0x080a26, skyHorizon: 0x9a4050,
  exposure: 1.05,
};

const NOISE_GLSL = `
float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;

export function buildGarbaMap(scene, { quality } = {}) {
  void quality; // shadow flags are always set; they cost nothing while the shadow map is off (LOW)
  const U = {
    uNight: { value: 0 }, uTime: { value: 0 },
    uPools: { value: Array.from({ length: NP }, () => new THREE.Vector4(0, -999, 0, 0.001)) },
    uPoolCol: { value: Array.from({ length: NP }, () => new THREE.Vector3()) },
  };
  // Painterly world-space tint (as in map.js) + fake warm point-light pools at night.
  function patch(m, paint) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPaint = { value: paint }; sh.uniforms.uNight = U.uNight; sh.uniforms.uPools = U.uPools; sh.uniforms.uPoolCol = U.uPoolCol;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec3 vWN; uniform float uPaint; uniform float uNight; uniform vec4 uPools[${NP}]; uniform vec3 uPoolCol[${NP}];` + NOISE_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 q = vWP.xz + vWP.y * vec2(0.83, -0.61);
        float n = pNoise(q * 0.085) * 0.55 + pNoise(q * 0.29 + 7.0) * 0.3 + pNoise(q * 1.1 + 3.0) * 0.15;
        vec3 tint = mix(vec3(0.84, 0.86, 0.95), vec3(1.08, 1.03, 0.93), smoothstep(0.15, 0.85, n));
        diffuseColor.rgb *= mix(vec3(1.0), tint, uPaint); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (uNight > 0.001) {
        vec3 acc = vec3(0.0); vec3 wn = normalize(vWN);
        for (int i = 0; i < ${NP}; i++) {
          vec3 d = uPools[i].xyz - vWP; float L = length(d) + 1e-3;
          float f = clamp(1.0 - L / uPools[i].w, 0.0, 1.0); f *= f;
          acc += uPoolCol[i] * f * (0.3 + 0.7 * max(0.0, dot(wn, d / L)));
        }
        totalEmissiveRadiance += diffuseColor.rgb * acc * uNight;
      }`);
    };
    m.customProgramCacheKey = () => 'garba-paint';
  }
  function std(color, map, { rough = 0.9, metal = 0, paint = 0.5, side = THREE.FrontSide, emissive = null, ei = 1, alphaTest = 0, vc = true } = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: vc, side });
    if (map) m.map = map;
    if (alphaTest) { m.alphaTest = alphaTest; m.transparent = false; }
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    patch(m, paint);
    return m;
  }
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: true });

  const M = {
    earth: std(0xffffff, GT.earth(), { paint: 0.8 }),
    stone: std(0xffffff, T.surface('stone'), { paint: 0.8 }),
    cobble: std(0xffffff, T.surface('cobble'), { paint: 0.8 }),
    tile: std(0xffffff, T.surface('tile'), { rough: 0.85, paint: 0.7 }),
    kanat0: std(0xffffff, GT.kanat(0), { paint: 0.35 }),
    kanat1: std(0xffffff, GT.kanat(1), { paint: 0.35 }),
    kanat2: std(0xffffff, GT.kanat(2), { paint: 0.35 }),
    tentA: std(0xffffff, GT.tentStripe('#d6213f', '#f6e7c8', 10), { paint: 0.3, side: THREE.DoubleSide }),
    tentB: std(0xffffff, GT.tentStripe('#ff8a1a', '#7d1730', 10), { paint: 0.3, side: THREE.DoubleSide }),
    tentC: std(0xffffff, GT.tentStripe('#232a66', '#ffc21a', 12), { paint: 0.3, side: THREE.DoubleSide }),
    bandhani: std(0xffffff, GT.bandhani(), { paint: 0.2, side: THREE.DoubleSide }),
    bandhaniG: std(0xffffff, GT.bandhani('#1f7a4a', '#fff2d0', '#ff6fae'), { paint: 0.2, side: THREE.DoubleSide }),
    leheriya: std(0xffffff, GT.leheriya(), { paint: 0.2, side: THREE.DoubleSide }),
    jhalar: std(0xffffff, GT.jhalar(), { paint: 0, side: THREE.DoubleSide, alphaTest: 0.5 }),
    jhalarB: std(0xffffff, GT.jhalar('#232a66', '#ff8a1a'), { paint: 0, side: THREE.DoubleSide, alphaTest: 0.5 }),
    wood: std(0xffffff, T.surface('wood'), { rough: 0.8, paint: 0.4 }),
    crate: std(0xffffff, T.surface('crate'), { rough: 0.85, paint: 0.4 }),
    beam: std(0xffffff, T.surface('beam'), { rough: 0.85, paint: 0.3 }),
    bamboo: std(0xd8b46a, T.surface('beam'), { rough: 0.8, paint: 0.2 }),
    plaster: std(0xffffff, T.surface('plaster'), { paint: 0.6 }),
    stageFloor: std(0xffffff, T.surface('wood'), { rough: 0.6, paint: 0.3 }),
    metal: std(0xffffff, T.surface('metal'), { rough: 0.45, metal: 0.4, paint: 0 }),
    foliage: std(0x8a9a8a, T.surface('foliage'), { rough: 1, paint: 0.5 }),
    bark: std(0xffffff, T.surface('bark'), { paint: 0.3 }),
    red: std(0xc8203a, null, { rough: 0.6, paint: 0.25 }),
    maroon: std(0x7d1730, null, { rough: 0.7, paint: 0.25 }),
    teal: std(0x1f9e8f, null, { rough: 0.6, paint: 0.25 }),
    indigo: std(0x2e3480, null, { rough: 0.6, paint: 0.25 }),
    saffron: std(0xff8a1a, null, { rough: 0.6, paint: 0.2 }),
    marigold: std(0xffc21a, null, { rough: 0.6, paint: 0.2 }),
    pink: std(0xe8439a, null, { rough: 0.6, paint: 0.2 }),
    green: std(0x3f8f3a, null, { rough: 0.7, paint: 0.2 }),
    cream: std(0xf3e6cc, null, { rough: 0.7, paint: 0.3 }),
    gold: std(0xe2a83e, null, { rough: 0.35, metal: 0.65, paint: 0 }),
    copper: std(0xc0643a, null, { rough: 0.35, metal: 0.6, paint: 0 }),
    dark: std(0x1c1a22, null, { rough: 0.5, paint: 0 }),
    speaker: std(0x26242c, null, { rough: 0.55, paint: 0 }),
    grill: std(0x0e0d12, null, { rough: 0.8, paint: 0 }),
    glass: std(0x9fd6e0, null, { rough: 0.1, metal: 0.3, paint: 0 }),
    dhol: std(0xffffff, GT.dholTex(), { rough: 0.7, paint: 0 }),
    skin: std(0xf0dcb0, null, { rough: 0.8, paint: 0 }),
    windows: std(0xffffff, GT.windows(), { paint: 0, emissive: 0xffffff, ei: 1.1 }),
    lampGlass: glow(3.4, 2.0, 0.85),
    neonPink: glow(3.2, 0.6, 2.0),
    neonCyan: glow(0.5, 2.6, 3.0),
    neonAmber: glow(3.6, 1.7, 0.4),
    signBack: new THREE.MeshStandardMaterial({ color: 0x1a1024, roughness: 0.6, transparent: true, opacity: 0.85 }),
    water: waterMaterial(),
  };
  M.windows.emissiveMap = M.windows.map;
  for (const k of ['water', 'lampGlass', 'neonPink', 'neonCyan', 'neonAmber', 'signBack', 'jhalar', 'jhalarB', 'windows', 'tentA', 'tentB', 'tentC', 'bandhani', 'bandhaniG', 'leheriya']) M[k].userData.noShadow = true;
  const PA = GT.posterAtlas(); const posterMat = std(0xffffff, PA.tex, { paint: 0, rough: 0.85 }); posterMat.userData.noShadow = true;
  const dyn = { anim: [], signs: [] };
  const pools = [];
  const pool = (x, y, z, r, c = WARM) => pools.push([x, y, z, r, c]);
  const photos = MAP_PHOTOS.garba && MAP_PHOTOS.garba.length ? MAP_PHOTOS.garba : [{ src: 'm/chikero.jpg', caption: 'Garba queen' }];
  // Pick photos by (part of) file name so each lands in a frame shaped for it; falls back to any unused one.
  const usedPhotos = new Set();
  const pickPhoto = (key) => {
    let p = key && photos.find((q) => !usedPhotos.has(q) && q.src.includes(key));
    if (!p) p = photos.find((q) => !usedPhotos.has(q)) || photos[usedPhotos.size % photos.length];
    usedPhotos.add(p); return p;
  };
  const hang = (key, x, y, z, w, h, { ry = 0, frame = 0xe2a83e, glow = 0.75, depth = 0.06 } = {}) => {
    const p = pickPhoto(key); const f = photoFrame(p.src, { w, h, caption: p.caption, frame, glow, depth });
    f.position.set(x, y, z); f.rotation.y = ry; f.traverse((o) => { o.castShadow = false; });
    // the caption glows through its own texture (a flat white emissive would wash the text out at night)
    const cap = f.children[2]; if (cap && cap.material.map) { cap.material.emissiveMap = cap.material.map; cap.material.needsUpdate = true; }
    scene.add(f); return f;
  };

  // instanced dressing buffers
  const bulbs = [], marigolds = [], leaves = [], lanterns = [], diyas = [], mirrors = [], wires = [], flagPos = [], flagCol = [], coneGeos = [], balloons = [];
  const _up = new THREE.Vector3(0, 1, 0), _rq = new THREE.Quaternion(), _re = new THREE.Euler();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── floors ────────────────────────────────────────────────────────────────
  const floor = (x0, z0, x1, z1, mat, uv = 4) => box(x0, -0.4, z0, x1, 0, z1, mat, { collide: false, uv, ao: 0 });
  floor(-12, 26, 12, 35, M.stone, 4);
  floor(-45, 16, 45, 26, M.earth, 5);
  floor(-45, -8, -26, 16, M.earth, 5); floor(26, -8, 45, 16, M.earth, 5);
  floor(-26, 2, -12, 6, M.cobble, 3); floor(12, 2, 26, 6, M.cobble, 3);
  floor(-12, -8, 12, 16, M.earth, 5);
  floor(-45, -35, -12, -8, M.earth, 5);
  floor(-12, -35, 12, -8, M.stone, 4);
  floor(12, -35, 45, -8, M.tile, 3);
  // kerbs at zone edges
  const kerbX = (x0, x1, z) => box(x0, -0.4, z - 0.18, x1, 0.03, z + 0.18, M.cream, { collide: false, uv: 1.6, ao: 0 });
  const kerbZ = (x, z0, z1) => box(x - 0.18, -0.4, z0, x + 0.18, 0.03, z1, M.cream, { collide: false, uv: 1.6, ao: 0 });
  kerbX(-12, 12, 26); kerbX(-12, 12, -8); kerbX(12, 37, -8); kerbX(-37, -12, -8); kerbZ(-12, -20, -16); kerbZ(12, -20, -16);

  // ── walls: kanat-printed tent cloth on bamboo frames ───────────────────────
  // Walls get an invisible collision extension above them so nobody can stand on a wall top
  // (and no updraft chain can carry anyone over the enclosure).
  function wall(x0, z0, x1, z1, h, mat, { rail = true, cap = h >= 9 ? 15 : 12 } = {}) {
    box(x0, 0, z0, x1, h, z1, mat, { uv: h, ao: 3 });
    addSolid(x0, h, z0, x1, cap, z1, 'cap');
    if (rail) box(x0 - 0.1, h, z0 - 0.1, x1 + 0.1, h + 0.16, z1 + 0.1, M.bamboo, { collide: false, uv: 1.5, ao: 0 });
  }
  const OH = 9.5;
  wall(-46, -36, 46, -35, OH, M.kanat1); wall(-46, 35, 46, 36, OH, M.kanat1);
  wall(-46, -36, -45, 36, OH, M.kanat1); wall(45, -36, 46, 36, OH, M.kanat1);
  wall(-45, 26, -12, 35, 7.5, M.kanat2); wall(12, 26, 45, 35, 7.5, M.kanat2);
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -26 : 12, xb = s < 0 ? -12 : 26;
    wall(xa, 6, xb, 16, 7.5, M.kanat0); wall(xa, -8, xb, 2, 7.5, M.kanat0);
    box(xa, 4, 2, xb, 7.5, 6, M.kanat0, { uv: 7.5, ao: 0 }); // covered passage roof
    // passage ceiling: bandhani cloth + beams
    box(xa, 3.9, 2, xb, 4.0, 6, M.bandhani, { collide: false, uv: 3, ao: 0 });
    for (let x = xa + 1.2; x < xb - 0.5; x += 2.4) box(x - 0.1, 3.75, 2, x + 0.1, 3.95, 6, M.bamboo, { collide: false, uv: 1.5, ao: 0 });
    // chokes and arch walls
    wall(s < 0 ? -45 : 37, -10, s < 0 ? -37 : 45, -8, 7.5, M.kanat0);
    const ax0 = s * 12 - 0.6, ax1 = s * 12 + 0.6;
    wall(Math.min(ax0, ax1), -35, Math.max(ax0, ax1), -20, 7.5, M.kanat2); wall(Math.min(ax0, ax1), -16, Math.max(ax0, ax1), -8, 7.5, M.kanat2);
    box(Math.min(ax0, ax1), 4.4, -20, Math.max(ax0, ax1), 7.5, -16, M.kanat2, { uv: 7.5, ao: 0 });
    addSolid(Math.min(ax0, ax1), 7.5, -20, Math.max(ax0, ax1), 12, -16, 'cap');
  }

  // bamboo poles along the enclosure and at pavilion corners
  function pole(x, z, h, r = 0.13) {
    mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 8), M.bamboo, { p: [x, h / 2, z], uv: 1, outline: 0.025 });
    for (let y = 1.2; y < h - 0.3; y += 1.4) mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.07, 8), M.beam, { p: [x, y, z] });
  }
  for (let x = -40; x <= 40; x += 8) { pole(x, -34.85, OH + 0.4); pole(x, 34.85, OH + 0.4); }
  for (let z = -30; z <= 30; z += 8) { pole(-44.85, z, OH + 0.4); pole(44.85, z, OH + 0.4); }
  for (const sx of [-1, 1]) for (const [x, z] of [[26, 16], [12, 16], [26, -8], [12, -8], [26, 6], [26, 2], [12, 6], [12, 2]]) pole(sx * (x + 0.05), z + (z > 4 ? 0.05 : -0.05), 7.9, 0.15);
  for (const sx of [-1, 1]) for (const x of [12, 45]) pole(sx * (x - 0.1), 26.1 - 0.05, 7.9, 0.15);

  // tent roofs (decor, well above anything reachable)
  tentRoof(-26, -8, -12, 16, 7.62, 3.0, M.tentA);
  tentRoof(12, -8, 26, 16, 7.62, 3.0, M.tentB);
  tentRoof(-45, 26, -12, 35, 7.62, 2.4, M.tentC, { jh: M.jhalarB });
  tentRoof(12, 26, 45, 35, 7.62, 2.4, M.tentC, { jh: M.jhalarB });
  // valances under the enclosure top rail (inner faces)
  valance([-45, 0, -34.94], [45, 0, -34.94], OH - 0.1, 0.65, M.jhalarB);
  valance([-45, 0, 34.94], [-12, 0, 34.94], OH - 0.1, 0.65, M.jhalarB); valance([12, 0, 34.94], [45, 0, 34.94], OH - 0.1, 0.65, M.jhalarB);
  valance([-44.94, 0, -35], [-44.94, 0, 26], OH - 0.1, 0.65, M.jhalarB); valance([44.94, 0, -35], [44.94, 0, 26], OH - 0.1, 0.65, M.jhalarB);
  for (const s of [-1, 1]) {
    valance([s * 11.94, 0, -35], [s * 11.94, 0, -8], 7.4, 0.6, M.jhalar); valance([s * 12.66, 0, -35], [s * 12.66, 0, -8], 7.4, 0.6, M.jhalar);
    valance([s < 0 ? -45 : 37, 0, -7.94], [s < 0 ? -37 : 45, 0, -7.94], 7.4, 0.6, M.jhalar);
  }

  // ── SPAWN: the toran gate ──────────────────────────────────────────────────
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -12.9 : 11.3, x1 = s < 0 ? -11.3 : 12.9, cx = (x0 + x1) / 2;
    box(x0 - 0.2, 0, 25.1, x1 + 0.2, 0.9, 26.9, M.gold, { outline: true, uv: 1 });
    box(x0, 0.9, 25.3, x1, 5.4, 26.7, M.red, { outline: true, uv: 1.5, ao: 2 });
    for (const y of [1.6, 3.0, 4.4]) box(x0 - 0.06, y, 25.24, x1 + 0.06, y + 0.22, 26.76, M.gold, { collide: false, outline: true, ao: 0 });
    box(x0 - 0.15, 5.4, 25.15, x1 + 0.15, 5.6, 26.85, M.gold, { collide: false, outline: true, ao: 0 });
    // kalash on top
    mesh(new THREE.SphereGeometry(0.5, 16, 12), M.copper, { p: [cx, 7.35, 26], s: [1, 0.85, 1], outline: 0.03 });
    mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.3, 12), M.copper, { p: [cx, 7.85, 26], outline: 0.02 });
    mesh(new THREE.SphereGeometry(0.26, 12, 10), M.bark, { p: [cx, 8.15, 26], s: [1, 1.2, 1], outline: 0.02 });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; leaves.push([cx + Math.cos(a) * 0.26, 7.98, 26 + Math.sin(a) * 0.26, a, 0.9]); }
    for (const z of [25.2, 26.8]) for (const y of [2.3, 3.7]) diyas.push([cx, y + 0.22, z + (z > 26 ? 0.08 : -0.08)]);
    pool(cx, 3.5, 27.6, 7, GOLD);
  }
  box(-12.9, 5.6, 25.5, 12.9, 6.9, 26.5, M.red, { uv: 1.5, outline: true, ao: 0 });
  box(-13.0, 6.9, 25.4, 13.0, 7.08, 26.6, M.gold, { collide: false, outline: true, ao: 0 });
  box(-13.0, 5.52, 25.4, 13.0, 5.7, 26.6, M.gold, { collide: false, outline: true, ao: 0 });
  box(-5.2, 6.9, 25.75, 5.2, 8.9, 26.25, M.maroon, { uv: 1.5, outline: true, ao: 0 }); // sign board
  // scalloped arch under the lintel
  {
    const sh = new THREE.Shape(); const W = 11.3, n = 9;
    sh.moveTo(-W, 5.6); sh.lineTo(-W, 4.3);
    for (let i = 0; i < n; i++) {
      const xa = -W + (2 * W * i) / n, xb = -W + (2 * W * (i + 1)) / n; const base = (x) => 4.3 + 1.0 * (1 - Math.pow(Math.abs(x) / W, 2));
      sh.quadraticCurveTo((xa + xb) / 2, (base(xa) + base(xb)) / 2 - 0.42, xb, base(xb));
    }
    sh.lineTo(W, 5.6); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -0.35);
    mesh(g, M.gold, { p: [0, 0, 26], uv: 1 });
    addSolid(-11.3, 4.7, 25.6, 11.3, 5.6, 26.4);
    // toran: mango leaves + marigold strands along the gate, both faces
    for (const z of [25.55, 26.45]) {
      for (let x = -11.1; x <= 11.1; x += 0.24) { const y = 4.3 + 1.0 * (1 - Math.pow(Math.abs(x) / W, 2)); leaves.push([x, y - 0.05, z, PI, 1.1]); }
      festoon(V(-11.2, 5.5, z + (z > 26 ? 0.14 : -0.14)), V(11.2, 5.5, z + (z > 26 ? 0.14 : -0.14)), 0.55, 2.0);
    }
  }
  // spawn dressing
  box(-11.6, 0, 30.4, -10.6, 1.1, 34.6, M.wood, { outline: true, uv: 1.2 }); // shoe racks (garba is barefoot)
  box(10.6, 0, 30.4, 11.6, 1.1, 34.6, M.wood, { outline: true, uv: 1.2 });
  for (const sx of [-1, 1]) for (let z = 30.8; z < 34.4; z += 0.45) for (const y of [0.45, 0.98]) box(sx * 11.1 - 0.25, y, z - 0.15, sx * 11.1 + 0.25, y + 0.1, z + 0.15, [M.red, M.teal, M.marigold, M.pink][Math.floor((z * 7 + y * 3) % 4)], { collide: false, ao: 0 });
  box(-7.5, 0, 33.6, -3.5, 1.0, 34.6, M.red, { outline: true, uv: 1 });
  box(-7.6, 1.0, 33.5, -3.4, 1.06, 34.7, M.bandhani, { collide: false, outline: true });
  box(3.5, 0, 33.8, 7.0, 0.9, 34.6, M.crate, { outline: true, uv: 1 });
  diyas.push([-6.8, 1.06, 34.1], [-4.2, 1.06, 34.1]);
  carpet(0, 29.4, 3.2, 10.8, GT.durrie(), 3.2, false);
  pool(0, 4.5, 31.5, 9, WARM);

  // ── PLAZA: lotus fountain, mela stalls, photo booth ───────────────────────
  const FZ = 21;
  mesh(new THREE.CylinderGeometry(2.3, 2.45, 0.7, 8), M.cream, { p: [0, 0.35, FZ], r: [0, PI / 8, 0], uv: 2, ao: 0.7, outline: 0.04 });
  mesh(new THREE.CylinderGeometry(2.38, 2.38, 0.16, 8, 1, true), M.teal, { p: [0, 0.42, FZ], r: [0, PI / 8, 0] });
  mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.04, 32), M.water, { p: [0, 0.62, FZ] });
  mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.0, 12), M.cream, { p: [0, 0.9, FZ], outline: 0.03 });
  for (let i = 0; i < 10; i++) { // lotus petals
    const a = (i / 10) * PI * 2;
    mesh(new THREE.SphereGeometry(0.5, 10, 8), M.pink, { p: [Math.cos(a) * 0.55, 1.55, FZ + Math.sin(a) * 0.55], r: [Math.sin(a) * 0.7, -a, -Math.cos(a) * 0.7], s: [0.35, 0.75, 0.18], outline: 0.02 });
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + 0.3; mesh(new THREE.SphereGeometry(0.4, 10, 8), M.cream, { p: [Math.cos(a) * 0.28, 1.75, FZ + Math.sin(a) * 0.28], r: [Math.sin(a) * 0.35, -a, -Math.cos(a) * 0.35], s: [0.3, 0.65, 0.16] }); }
  mesh(new THREE.SphereGeometry(0.2, 12, 10), M.marigold, { p: [0, 1.85, FZ] });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + PI / 8; mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.06, 12), M.green, { p: [Math.cos(a) * 1.35, 0.645, FZ + Math.sin(a) * 1.35], s: [1, 1, 0.75] }); }
  addSolid(-2.2, 0, FZ - 2.2, 2.2, 0.7, FZ + 2.2); addSolid(-0.6, 0, FZ - 0.6, 0.6, 1.9, FZ + 0.6); contactRound(0, FZ, 2.4, 0, 0.7);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; diyas.push([Math.cos(a) * 2.25, 0.7, FZ + Math.sin(a) * 2.25]); }
  dyn.fountain = new THREE.Vector3(0, 2.0, FZ);
  pool(0, 3, FZ, 7, [1.1, 0.95, 0.8]);
  // balloon seller's cart
  const BAL = [-30, 24.6];
  cart(BAL[0], BAL[1], 2.4, 1.2, 1.1, M.teal);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), M.dark, { p: [BAL[0], 2.3, BAL[1]] });
  for (let i = 0; i < 26; i++) { const a = Math.random() * PI * 2, d = Math.random() * 0.8; balloons.push([BAL[0] + Math.cos(a) * d, 3.6 + Math.random() * 1.0, BAL[1] + Math.sin(a) * d * 0.8]); }
  // ticket kiosk
  box(19.8, 0, 23.9, 22.2, 2.5, 25.7, M.red, { outline: true, uv: 1.5, ao: 2.5 });
  box(19.7, 1.0, 23.8, 22.3, 1.1, 25.8, M.gold, { collide: false, outline: true });
  tentRoof(19.8, 23.9, 22.2, 25.7, 2.5, 0.9, M.tentB, { over: 0.25 });
  // chair stacks
  box(-41, 0, 20, -38, 1.0, 21, M.red, { outline: true, uv: 1 }); box(38, 0, 18.5, 41, 1.0, 19.5, M.teal, { outline: true, uv: 1 });
  for (const [x, z] of [[-9.5, 18.2], [9.5, 18.2], [-25, 24.8], [25, 17.5]]) urn(x, z);
  // photo booth on the west pavilion front: a flower wall with a collage of the crew's photos
  {
    const z0 = 16, X0 = -25.6, X1 = -12.4, BX = (X0 + X1) / 2;
    box(X0, 0, z0, X1, 0.25, 17.5, M.wood, { outline: true, uv: 1.5 }); // little stage step
    box(X0, 0.25, z0, X0 + 0.5, 5.7, z0 + 0.5, M.gold, { outline: true, uv: 1 }); box(X1 - 0.5, 0.25, z0, X1, 5.7, z0 + 0.5, M.gold, { outline: true, uv: 1 });
    box(X0, 5.7, z0, X1, 6.15, z0 + 0.5, M.gold, { collide: false, outline: true });
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 - 1.0, 5.45), std(0xffffff, GT.boothWall(), { paint: 0, vc: false, emissive: 0xffffff, ei: 0.12 }));
    bw.material.emissiveMap = bw.material.map; bw.position.set(BX, 2.975, z0 + 0.03); bw.receiveShadow = true; scene.add(bw);
    const zf = z0 + 0.1;
    hang('photobooth-strip', BX, 2.75, zf, 0.95, 2.75, { frame: 0x1a1024, glow: 0.8 });
    hang('leaf-wall-crowns-1', BX - 5.1, 3.75, zf, 1.35, 1.8); hang('booth-group-hug', BX - 2.75, 3.85, zf, 2.5, 1.4);
    hang('night-stairs-group', BX + 2.75, 3.85, zf, 2.5, 1.4); hang('leaf-wall-crowns-2', BX + 5.1, 3.75, zf, 1.35, 1.8);
    hang('bandana-bar-selfie', BX - 5.1, 1.42, zf, 1.1, 1.45); hang('halloween-interview-flash', BX - 2.75, 1.4, zf, 1.75, 1.3);
    hang('bows-selfie', BX + 2.75, 1.45, zf, 0.85, 1.5); hang('beer-poster-booth', BX + 5.1, 1.42, zf, 1.1, 1.45);
    // marigold arch over the booth
    for (let i = 0; i <= 70; i++) { const t = i / 70, a = PI * t; marigolds.push(V(BX - Math.cos(a) * 6.4, 6.15 + Math.sin(a) * 0.9, z0 + 0.55)); }
    for (const x of [X0 - 0.2, X1 + 0.2]) for (let y = 0.4; y < 5.9; y += 0.16) marigolds.push(V(x, y, z0 + 0.55));
    for (let k = 0; k < 12; k++) { const x = X0 + 0.8 + k * ((X1 - X0 - 1.6) / 11); for (let j = 1; j < 5; j++) marigolds.push(V(x, 5.7 - j * 0.15, z0 + 0.58)); }
    for (let i = 0; i < 46; i++) mirrors.push([X0 + Math.random() * (X1 - X0), 5.75 + Math.random() * 0.35, z0 + 0.53, Math.random() * 6]);
    pool(BX, 3.2, 19.5, 8, PINK);
  }
  // dandiya hire counter + posters on the east pavilion front
  box(15, 0, 16, 23, 1.1, 17.1, M.teal, { outline: true, uv: 1.5 });
  box(14.9, 1.1, 15.95, 23.1, 1.18, 17.2, M.cream, { collide: false, outline: true });
  for (let x = 15.6; x < 22.6; x += 0.9) dandiyaBundle(x, 1.18, 16.6);
  poster('x', 16, 14.6, 1, 2.6, 0, 1.6); poster('x', 16, 23.4, 1, 2.6, 1, 1.6); poster('x', 16, 25.1, 1, 2.6, 3, 1.6);
  poster('x', 16, -25, 1, 2.2, 2, 1.3);
  signBoardMesh('DANDIYA ₹20', [19, 3.0, 16.05], 0, 5, { bg: '#ffc21a', fg: '#7d1730', sub: 'PAIR · RETURN BY MIDNIGHT' });
  pool(19, 3, 18.5, 6.5, WARM);
  for (const [x, z] of [[-20, 21], [20, 21], [-36, 21], [36, 21]]) pool(x, 4.5, z, 10);

  // ── LANES ─────────────────────────────────────────────────────────────────
  // A lane: bangle stall, crates, sacks of rangoli powder, a jhula swing
  stall(-45, 2, -42.4, 8, 'x', 1, M.red, M.tentA, 'BANGLES ₹50', { bg: '#d81f78', fg: '#fff2d0', border: '#ffc21a' });
  for (let i = 0; i < 14; i++) { const z = 2.7 + i * 0.4; for (let k = 0; k < 4; k++) mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 14), [M.gold, M.red, M.green, M.pink][(i + k) % 4], { p: [-41.9, 1.2 + k * 0.05, z], r: [PI / 2, 0, 0] }); }
  crate(-38, 8, 1.6, 1.6); crate(-36.4, 8, 1.6, 1.6); crate(-37.2, 8, 1.1, 1.1, 1.6);
  sacks(-29.2, -1, 2.2, 1.1);
  swing(-42, -4.5);
  urn(-44, 14.2); urn(-27, 14.2); urn(-27, -6.8);
  pool(-36, 4.5, 10, 10); pool(-36, 4.5, -2, 10); pool(-41, 3, 5, 6, PINK);
  // B lane: mehendi stall, kulfi cart, crates
  stall(42.4, 4, 45, 10, 'x', -1, M.teal, M.tentB, 'MEHENDI', { bg: '#3f8f3a', fg: '#fff2d0', border: '#ffc21a' });
  cart(30.1, -0.5, 2.2, 4.0, 1.3, M.red, true);
  crate(36, 10, 1.8, 1.8); crate(37.8, 10.2, 1.4, 1.2);
  crate(43.4, -5, 1.6, 1.6);
  urn(44, 14.2); urn(27, 14.2); urn(27, -6.8);
  pool(36, 4.5, 10, 10); pool(36, 4.5, -2, 10); pool(41, 3, 7, 6, PINK); pool(30, 3, -0.5, 6);
  for (const s of [-1, 1]) {
    pool(s * 19, 3.0, 4, 7.5); // passages
    for (const x of [15.5, 22.5]) { lanterns.push([s * x, 3.25, 4, 1]); wireSeg([s * x, 3.9, 4], [s * x, 3.45, 4]); }
  }

  // ── MID: the Garba Circle ─────────────────────────────────────────────────
  const GX = 0, GZ = 4;
  {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(9.6, 96), std(0xffffff, GT.rangoli(), { paint: 0.15, vc: false, rough: 0.8 }));
    disc.material.polygonOffset = true; disc.material.polygonOffsetFactor = -1; disc.material.polygonOffsetUnits = -1;
    disc.rotation.x = -PI / 2; disc.position.set(GX, 0.01, GZ); disc.receiveShadow = true; scene.add(disc);
    // the garbo: plinth, column, three lamp tiers, kalash, flag mast
    mesh(new THREE.CylinderGeometry(1.65, 1.75, 0.5, 8), M.red, { p: [GX, 0.25, GZ], r: [0, PI / 8, 0], outline: 0.03, uv: 1.5 });
    mesh(new THREE.CylinderGeometry(1.74, 1.74, 0.08, 8), M.gold, { p: [GX, 0.52, GZ], r: [0, PI / 8, 0] });
    addSolid(GX - 1.5, 0, GZ - 1.5, GX + 1.5, 0.5, GZ + 1.5); contactRound(GX, GZ, 1.7, 0, 0.8);
    mesh(new THREE.CylinderGeometry(0.34, 0.46, 5.0, 12), M.teal, { p: [GX, 3.0, GZ], outline: 0.03, uv: 1 });
    for (const y of [1.1, 2.0, 3.0, 4.0, 5.0]) mesh(new THREE.TorusGeometry(0.42 - y * 0.02, 0.06, 6, 16), M.gold, { p: [GX, y, GZ], r: [PI / 2, 0, 0] });
    addSolid(GX - 0.48, 0.5, GZ - 0.48, GX + 0.48, 5.6, GZ + 0.48);
    [[2.7, 1.0, 14], [3.7, 0.78, 11], [4.6, 0.56, 8]].forEach(([y, r, n]) => {
      mesh(new THREE.CylinderGeometry(r, r * 0.55, 0.22, 16), M.gold, { p: [GX, y, GZ], outline: 0.03 });
      for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; diyas.push([GX + Math.cos(a) * (r - 0.13), y + 0.11, GZ + Math.sin(a) * (r - 0.13)]); for (let k = 1; k < 5; k++) marigolds.push(V(GX + Math.cos(a + 0.2) * r, y - k * 0.13, GZ + Math.sin(a + 0.2) * r)); }
    });
    addSolid(GX - 0.95, 2.55, GZ - 0.95, GX + 0.95, 2.8, GZ + 0.95);
    mesh(new THREE.SphereGeometry(0.46, 16, 12), M.copper, { p: [GX, 5.45, GZ], s: [1, 0.85, 1], outline: 0.03 });
    mesh(new THREE.SphereGeometry(0.24, 12, 10), M.bark, { p: [GX, 5.95, GZ], s: [1, 1.2, 1], outline: 0.02 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; leaves.push([GX + Math.cos(a) * 0.27, 5.8, GZ + Math.sin(a) * 0.27, a, 0.9]); }
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), M.dark, { p: [GX, 6.8, GZ] });
    const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.lineTo(0.9, -0.25); fl.lineTo(0, -0.5); fl.closePath();
    mesh(new THREE.ShapeGeometry(fl), M.saffron, { p: [GX, 7.5, GZ], r: [0, -0.6, 0] });
    pool(GX, 3.6, GZ, 11.5, [1.7, 0.95, 0.42]);
    pool(-7, 3, -3, 8, SAFF); pool(7, 3, 11, 8, SAFF); pool(-7, 3, 11, 8, PINK); pool(7, 3, -3, 8, PINK);
    // maypole strings of lights from the mast to the pavilion eaves and the four light poles
    const top = V(GX, 6.9, GZ);
    for (const [x, z] of [[-11.3, -7.3], [11.3, -7.3], [-11.3, 15.3], [11.3, 15.3]]) pole(x, z, 8.2, 0.14);
    const anchors = [[-12, 7.5, -3], [-12, 7.5, 4], [-12, 7.5, 11], [12, 7.5, -3], [12, 7.5, 4], [12, 7.5, 11], [-11.3, 8.1, -7.3], [11.3, 8.1, -7.3], [-11.3, 8.1, 15.3], [11.3, 8.1, 15.3]];
    for (const a of anchors) { const pts = lightRun(top, V(...a), 0.9, 1.9); flagsAlong(pts, 3); }
    // a ring of bulbs hung below the strings, and the chasing floor ring lights
    const ring = []; for (let i = 0; i <= 72; i++) { const a = (i / 72) * PI * 2; ring.push(V(GX + Math.cos(a) * 7.8, 6.1 - 0.25 * Math.abs(Math.sin(a * 5)), GZ + Math.sin(a) * 7.8)); }
    wires.push(ring); for (const p of ring) bulbs.push(p.clone()); for (let i = 0; i < 72; i += 2) bulbs.push(ring[i].clone().add(V(0, -0.22, 0)));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; wireSeg([GX + Math.cos(a) * 7.8, 6.1, GZ + Math.sin(a) * 7.8], [GX + Math.cos(a) * 5.2, 6.7, GZ + Math.sin(a) * 5.2]); }
    for (let i = 0; i < 20; i++) { const a = (i / 20) * PI * 2 + 0.15; lanterns.push([GX + Math.cos(a) * 7.8, 5.45, GZ + Math.sin(a) * 7.8, i % 4]); }
    dyn.ringLights = ringLights(GX, GZ, 10.0, 56);
  }
  dandiyaRack(-8.5, -5.5, 'x'); dandiyaRack(8.5, 13.5, 'x');
  box(-11.4, 0, 8.8, -10.6, 0.5, 13.2, M.wood, { outline: true, uv: 1.2 }); box(10.6, 0, -5.2, 11.4, 0.5, -0.8, M.wood, { outline: true, uv: 1.2 });
  // dhol cart (cover) at the north-east of the circle
  box(5.4, 0.35, -6.8, 7.8, 1.0, -5.2, M.wood, { outline: true, uv: 1.2 }); addSolid(5.4, 0, -6.8, 7.8, 0.35, -5.2);
  for (const [x, z] of [[5.6, -6.6], [7.6, -6.6], [5.6, -5.4], [7.6, -5.4]]) mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), M.dark, { p: [x, 0.3, z < -6 ? z - 0.12 : z + 0.12], r: [PI / 2, 0, 0] });
  dhol(6.0, 1.45, -6.0, PI / 2); dhol(7.2, 1.45, -6.0, PI / 2 + 0.2);
  box(-3, 0, -7.5, -1, 0.8, -6.3, M.crate, { outline: true, uv: 1 }); // flower baskets
  heap(-2, 0.8, -6.9, 0.7);
  // gate beam with sign between plaza and circle
  box(-12, 6.9, 15.7, 12, 7.3, 16.2, M.bamboo, { collide: false, outline: true, ao: 0 });
  festoon(V(-12, 6.85, 16.25), V(12, 6.85, 16.25), 0.5, 2.4);

  // ── BACK HALL: the aarti mandap and lantern lane ───────────────────────────
  for (const [x, z] of [[-7, -12], [7, -12], [-7, -27], [7, -27]]) column(x, z);
  box(-4.5, 0, -35, 4.5, 0.5, -31, M.wood, { outline: true, uv: 1.5 });
  box(-4.6, 0.02, -31.08, 4.6, 0.46, -30.96, M.bandhani, { collide: false });
  for (const [x, z] of [[-4.15, -34.65], [4.15, -34.65], [-4.15, -31.35], [4.15, -31.35]]) { mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.0, 10), M.gold, { p: [x, 2.5, z], outline: 0.02 }); addSolid(x - 0.14, 0.5, z - 0.14, x + 0.14, 4.5, z + 0.14); }
  mesh(new THREE.SphereGeometry(3.0, 24, 10, 0, PI * 2, 0, PI / 2), M.leheriya, { p: [0, 4.5, -33], s: [1.45, 0.55, 0.62] });
  box(-4.4, 4.4, -34.9, 4.4, 4.6, -31.1, M.gold, { collide: false, outline: true });
  valance([-4.4, 0, -31.08], [4.4, 0, -31.08], 4.45, 0.5, M.jhalar);
  box(-1.0, 0.5, -34.6, 1.0, 1.35, -33.4, M.red, { outline: true, uv: 1 }); // draped chowki
  box(-1.06, 1.35, -34.66, 1.06, 1.42, -33.34, M.marigold, { collide: false });
  mesh(new THREE.SphereGeometry(0.3, 14, 10), M.copper, { p: [0, 1.65, -34], s: [1, 0.85, 1], outline: 0.02 });
  heap(-0.6, 1.42, -33.7, 0.25); heap(0.6, 1.42, -33.7, 0.25);
  for (const x of [-2.4, 2.4]) { // brass samai lamp stands
    mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.12, 12), M.gold, { p: [x, 0.56, -33.3] });
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8), M.gold, { p: [x, 1.3, -33.3], outline: 0.02 });
    for (const [y, r] of [[1.0, 0.32], [1.5, 0.26], [2.0, 0.2]]) { mesh(new THREE.CylinderGeometry(r, r * 0.6, 0.08, 12), M.gold, { p: [x, y, -33.3] }); for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; diyas.push([x + Math.cos(a) * (r - 0.06), y + 0.04, -33.3 + Math.sin(a) * (r - 0.06)]); } }
    addSolid(x - 0.35, 0.5, -33.65, x + 0.35, 2.1, -32.95);
  }
  for (let x = -4.2; x <= 4.2; x += 0.55) diyas.push([x, 0.5, -31.2]);
  pool(0, 3, -31.5, 9, GOLD);
  box(-10.4, 0, -21.8, -8.6, 0.9, -20.2, M.crate, { outline: true, uv: 1 }); heap(-9.5, 0.9, -21, 0.8);
  box(8.8, 0, -15.3, 10.4, 0.9, -13.7, M.crate, { outline: true, uv: 1 }); heap(9.6, 0.9, -14.5, 0.8);
  carpet(0, -21.5, 2.4, 14, GT.durrie(), 2.4, false);
  poster('z', -11.4, -11.5, 1, 2.0, 1, 1.2); poster('z', 11.4, -12.5, -1, 2.0, 0, 1.2); poster('z', -11.4, -29, 1, 2.0, 3, 1.2); poster('z', 11.4, -29, -1, 2.0, 2, 1.2);
  pool(0, 4, -19, 10); pool(0, 4, -10.5, 9);
  // arch gates to the sites: torans on both faces
  for (const s of [-1, 1]) for (const x of [s * 11.35, s * 12.65]) {
    for (let z = -19.9; z <= -16.1; z += 0.22) leaves.push([x, 4.35, z, PI / 2, 1.0]);
    festoon(V(x, 4.38, -20), V(x, 4.38, -16), 0.45, 1.3);
    for (const z of [-20.2, -15.8]) lamp(x, z, 3.3);
  }

  // ── A SITE: The Pandal Stage ───────────────────────────────────────────────
  box(-45, 0, -35, -25, 1.2, -29, M.stageFloor, { uv: 2, outline: true, ao: 0 });
  box(-45, 0.05, -28.97, -25, 1.18, -28.93, M.leheriya, { collide: false, uv: 1.2, ao: 0 });
  box(-24.97, 0.05, -35, -24.93, 1.18, -29, M.leheriya, { collide: false, uv: 1.2, ao: 0 });
  box(-37, 0, -29, -33, 0.8, -28.4, M.wood, { outline: true, uv: 1.2 }); box(-37, 0, -28.4, -33, 0.4, -27.8, M.wood, { outline: true, uv: 1.2 });
  box(-25, 0, -34, -24.4, 0.8, -31, M.wood, { outline: true, uv: 1.2 }); box(-24.4, 0, -34, -23.8, 0.4, -31, M.wood, { outline: true, uv: 1.2 });
  for (let x = -44.6; x < -25.2; x += 0.6) { if (x > -37.3 && x < -32.7) continue; diyas.push([x, 1.2, -29.15]); }
  // backdrop with photo screens
  box(-44, 1.2, -35, -26, 8.2, -34.55, M.dark, { uv: 2, outline: true, ao: 0 });
  {
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(17.4, 6.6), std(0xffffff, GT.backdrop(), { paint: 0, vc: false, emissive: 0xffffff, ei: 0.18 }));
    bd.material.emissiveMap = bd.material.map; bd.position.set(-35, 4.6, -34.53); bd.receiveShadow = true; scene.add(bd);
    for (const x of [-44.2, -26.2]) box(x, 1.2, -35, x + 0.4, 8.4, -34.3, M.gold, { outline: true, uv: 1 });
    box(-44.2, 8.0, -35, -25.8, 8.4, -34.3, M.gold, { collide: false, outline: true });
    // cusped crown on the backdrop
    const sh = new THREE.Shape(); sh.moveTo(-9, 0); for (let i = 0; i <= 24; i++) { const t = i / 24; const x = -9 + 18 * t; const y = 1.6 * Math.sin(t * PI) + 0.35 * Math.abs(Math.sin(t * PI * 6)); sh.lineTo(x, y); } sh.lineTo(9, 0); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }); mesh(g, M.gold, { p: [-35, 8.4, -34.95], uv: 1 });
    // stage screens: the three Navratri photos
    hang('navratri-big-group', -40.4, 4.05, -34.42, 2.0, 3.5, { frame: 0x14121a, glow: 0.85, depth: 0.12 });
    hang('navratri-selfie-faces', -35, 3.85, -34.42, 4.6, 2.6, { frame: 0x14121a, glow: 0.85, depth: 0.12 });
    hang('navratri-five', -29.6, 4.05, -34.42, 2.0, 3.5, { frame: 0x14121a, glow: 0.85, depth: 0.12 });
    for (let i = 0; i <= 50; i++) { const t = i / 50; marigolds.push(V(-43.6 + t * 17.2, 7.85 - 0.45 * Math.sin(t * PI * 6) ** 2, -34.3)); }
    for (let k = 0; k <= 12; k++) for (let j = 1; j < 9; j++) marigolds.push(V(-43.6 + k * (17.2 / 12), 7.85 - j * 0.14, -34.28));
  }
  // light truss + towers + spot cones
  truss(-45, -25, -29.6, 7.4);
  for (const x of [-44.7, -25.3]) { box(x - 0.25, 1.2, -29.85, x + 0.25, 7.4, -29.35, M.metal, { outline: true, uv: 1, ao: 0 }); }
  spot(-42, -29.6, 7.4, -40, -32, [1.0, 0.4, 0.75]); spot(-38, -29.6, 7.4, -37.5, -31, [1.0, 0.75, 0.4]); spot(-35, -29.6, 7.4, -35, -32, [1.0, 0.85, 0.6]);
  spot(-32, -29.6, 7.4, -32.5, -31, [0.4, 0.8, 1.0]); spot(-28, -29.6, 7.4, -30, -32, [1.0, 0.45, 0.7]);
  spot(-41, -29.6, 7.4, -33, -21, [1.0, 0.6, 0.3]); spot(-29, -29.6, 7.4, -27, -20, [0.9, 0.4, 0.9]);
  // pandal canopy over the stage
  {
    const g = new THREE.PlaneGeometry(20.6, 7.2, 20, 6); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); p.setXYZ(i, u - 35, 9.0 - (v + 3.6) * 0.12 - Math.sin(((u + 10.3) / 20.6) * PI * 5) ** 2 * 0.25, -32 - v); }
    g.computeVertexNormals(); mesh(g, M.bandhani, { keepUV: true, uv: 4 });
    valance([-45, 0, -28.4], [-25, 0, -28.4], 8.25, 0.7, M.jhalar);
  }
  // speaker stacks on stage, subs on the ground, line-array tower with the cat
  speaker(-44.3, -31, -42.9, -29.6, 1.2, 3.0); speaker(-27.4, -31, -26, -29.6, 1.2, 3.0);
  speaker(-25.5, -27.6, -23.9, -26.2, 0, 1.3);
  speaker(-45, -28.4, -43.4, -26.8, 0, 3.4);
  dhol(-35, 2.15, -31.6, 0); mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), M.dark, { p: [-35.3, 1.68, -31.6], r: [0, 0, 0.35] }); mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), M.dark, { p: [-34.7, 1.68, -31.6], r: [0, 0, -0.35] });
  addSolid(-35.6, 1.2, -32.1, -34.4, 2.5, -31.1);
  for (const x of [-38.5, -31.5]) { mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), M.dark, { p: [x, 1.95, -30.2] }); mesh(new THREE.SphereGeometry(0.06, 8, 6), M.dark, { p: [x, 2.72, -30.2] }); }
  box(-31.4, 1.2, -33.2, -29.6, 2.1, -32.6, M.dark, { outline: true, uv: 1 }); // keyboard / harmonium on a stand
  box(-31.45, 2.1, -33.25, -29.55, 2.18, -32.55, M.cream, { collide: false });
  // FOH sound desk under a little tent (cover)
  box(-21.8, 0, -15.9, -18.2, 1.1, -14.7, M.dark, { outline: true, uv: 1 }); box(-21.9, 1.1, -16.0, -18.1, 1.2, -14.6, M.metal, { collide: false, outline: true });
  box(-21.8, 0, -14.5, -20.4, 1.5, -13.3, M.speaker, { outline: true, uv: 1 });
  for (const [x, z] of [[-22.3, -16.4], [-17.7, -16.4], [-22.3, -12.8], [-17.7, -12.8]]) { mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), M.metal, { p: [x, 1.7, z] }); addSolid(x - 0.07, 0, z - 0.07, x + 0.07, 3.4, z + 0.07); }
  tentRoof(-22.3, -16.4, -17.7, -12.8, 3.4, 0.9, M.bandhaniG, { over: 0.2, jh: M.jhalar });
  addSolid(-22.5, 3.4, -16.6, -17.5, 3.6, -12.6);
  crate(-41, -13, 1.6, 1.4); crate(-39.4, -13.2, 1.2, 1.2); crate(-41, -13, 1.0, 0.8, 1.4);
  box(-17.2, 0, -31.4, -13, 0.9, -29.8, M.maroon, { outline: true, uv: 1 }); // VIP sofa
  box(-17.2, 0.9, -31.4, -13, 1.5, -31.0, M.maroon, { outline: true, uv: 1 });
  box(-17.1, 0.9, -30.9, -13.1, 1.0, -29.9, M.cream, { collide: false });
  carpet(-29, -19.5, 22, 13, GT.durrie(), 4, true);
  floorDecal('A', [-30, 0.02, -20.5], 6);
  pool(-35, 5.5, -31, 12, [1.5, 0.6, 0.85]); pool(-35, 4, -24, 10, SAFF); pool(-20, 3.2, -14.6, 8, WARM); pool(-30, 4, -14, 10); pool(-18, 4, -27, 9, PINK);
  for (const [x, z] of [[-40, -22], [-30, -22], [-20, -22], [-35, -16], [-25, -16], [-40, -11], [-15, -11]]) lanterns.push([x, 5.6 + (x % 3) * 0.1, z, ((x + z) / 5 & 3)]);

  // ── B SITE: Food Stalls ───────────────────────────────────────────────────
  // chai stall on the north wall
  stall(28, -35, 36, -31.4, 'z', 1, M.indigo, M.tentA, null);
  for (let x = 28.6; x < 35.6; x += 0.35) box(x - 0.06, 1.18, -31.95, x + 0.06, 1.34, -31.83, M.cream, { collide: false, ao: 0 }); // cutting-chai glasses
  for (const x of [29.2, 31.0]) { mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.42, 14), M.copper, { p: [x, 1.4, -32.0], outline: 0.02 }); mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), M.copper, { p: [x + 0.32, 1.45, -32.0], r: [0, 0, -0.9] }); }
  mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.5, 16), M.metal, { p: [34.2, 1.4, -32.1], outline: 0.02 });
  menuMesh('CHAI', [['CUTTING CHAI', '₹10'], ['MASALA CHAI', '₹15'], ['ELAICHI CHAI', '₹15'], ['BUN MASKA', '₹20'], ['EXTRA SUGAR', 'FREE']], [36.4, 1.6, -33.6], -PI / 2 + PI, 1.5);
  pool(32, 3, -30, 9, WARM);
  // jalebi stall on the east wall
  stall(42.4, -26, 45, -19, 'x', -1, M.saffron, M.tentB, null);
  mesh(new THREE.SphereGeometry(0.75, 18, 10, 0, PI * 2, PI / 2, PI / 2), M.dark, { p: [41.9, 1.75, -22.5], outline: 0.02 });
  for (let i = 0; i < 9; i++) mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 16, PI * 3.5), M.saffron, { p: [41.85 + Math.sin(i) * 0.3, 1.36 + 0.01 * i, -24.8 + i * 0.12 + (i % 3) * 0.35], r: [PI / 2, 0, i] });
  for (let i = 0; i < 7; i++) mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 16, PI * 3.5), M.marigold, { p: [41.9, 1.36, -20.6 + i * 0.13], r: [PI / 2, 0, i * 2] });
  pool(40, 3, -22.5, 8, SAFF);
  // pani puri cart (centre cover)
  box(23.3, 0.4, -21.6, 25.7, 1.05, -20.4, M.red, { outline: true, uv: 1.2 }); addSolid(23.3, 0, -21.6, 25.7, 0.4, -20.4);
  box(23.5, 1.05, -21.5, 25.5, 1.7, -20.5, M.glass, { outline: true, uv: 1 });
  box(23.45, 1.7, -21.55, 25.55, 1.78, -20.45, M.gold, { collide: false, outline: true });
  for (let i = 0; i < 14; i++) mesh(new THREE.SphereGeometry(0.1, 8, 6), M.skin, { p: [23.8 + (i % 7) * 0.26, 1.15 + Math.floor(i / 7) * 0.18, -21.0 + (i % 2) * 0.2] });
  for (const [x, z] of [[23.5, -21.75], [25.5, -21.75], [23.5, -20.25], [25.5, -20.25]]) mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), M.dark, { p: [x, 0.3, z], r: [PI / 2, 0, 0] });
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 6), M.dark, { p: [24.5, 2.7, -21] });
  mesh(new THREE.ConeGeometry(1.5, 0.6, 12, 1, true), M.bandhani, { p: [24.5, 3.75, -21] });
  signBoardMesh('PANI PURI', [24.5, 2.25, -20.42], 0, 2.4, { bg: '#d6213f', fg: '#fff2d0', border: '#ffc21a', sub: '6 PCS · ₹30' });
  pool(24.5, 3, -21, 7, WARM);
  // seating deck (raised, bStage)
  box(38, 0, -35, 45, 1.0, -28.6, M.wood, { outline: true, uv: 1.5 });
  box(37.4, 0, -33.5, 38, 0.5, -30, M.wood, { outline: true, uv: 1.2 });
  for (let z = -34.6; z < -28.8; z += 0.9) { if (z > -33.6 && z < -29.9) continue; mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), M.bamboo, { p: [38.1, 1.45, z] }); }
  for (let x = 38.6; x < 45; x += 0.9) mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), M.bamboo, { p: [x, 1.45, -28.7] });
  box(38.05, 1.85, -28.75, 45, 1.93, -28.65, M.bamboo, { collide: false }); box(38.05, 1.85, -35, 38.15, 1.93, -33.6, M.bamboo, { collide: false }); box(38.05, 1.85, -29.9, 38.15, 1.93, -28.65, M.bamboo, { collide: false });
  box(40, 1.0, -33.5, 42.6, 1.45, -31.6, M.wood, { outline: true, uv: 1 }); // low table
  for (const [x, z] of [[39.5, -34.3], [43.2, -34.3], [43.4, -30.8], [39.4, -30.4]]) box(x - 0.4, 1.0, z - 0.4, x + 0.4, 1.2, z + 0.4, [M.pink, M.marigold, M.teal, M.red][(x * z | 0) & 3], { collide: false, outline: true });
  tentRoof(38, -35, 45, -28.6, 4.6, 1.4, M.leheriya, { over: 0.2, jh: M.jhalarB });
  for (const [x, z] of [[38.15, -28.75], [44.85, -28.75]]) { mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), M.bamboo, { p: [x, 2.8, z], outline: 0.02 }); addSolid(x - 0.1, 1.0, z - 0.1, x + 0.1, 4.6, z + 0.1); }
  addSolid(37.8, 4.6, -35, 45, 4.8, -28.4);
  pool(41.5, 3.5, -32, 8, PINK);
  // long table with benches
  box(31.5, 0, -24.5, 36.5, 0.85, -23.5, M.wood, { outline: true, uv: 1.2 });
  box(31.5, 0, -25.4, 36.5, 0.45, -25.0, M.wood, { outline: true, uv: 1.2 }); box(31.5, 0, -23.0, 36.5, 0.45, -22.6, M.wood, { outline: true, uv: 1.2 });
  for (let x = 32; x < 36.4; x += 0.9) { mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 8), M.cream, { p: [x, 0.91, -24.2] }); mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 12), M.metal, { p: [x + 0.4, 0.865, -23.8] }); }
  box(18.5, 0, -31, 19.5, 0.85, -26, M.wood, { outline: true, uv: 1.2 });
  box(17.6, 0, -31, 18.0, 0.45, -26, M.wood, { outline: true, uv: 1.2 }); box(20.0, 0, -31, 20.4, 0.45, -26, M.wood, { outline: true, uv: 1.2 });
  // cold-drinks cooler
  box(13, 0, -34.6, 15.6, 1.4, -33.2, M.red, { outline: true, uv: 1 }); box(12.95, 1.4, -34.65, 15.65, 1.48, -33.15, M.cream, { collide: false, outline: true });
  signBoardMesh('THANDA', [14.3, 2.15, -33.14], 0, 2.6, { bg: '#1f9e8f', fg: '#fff2d0', border: '#232a66' });
  // stall boards with photos (both faces)
  for (const b of [{ x0: 17.4, x1: 20.1, z: -15, k: ['sofa-film-laugh', 'berry-and-maria-car'] }, { x0: 35.9, x1: 38.6, z: -15, k: ['saree-mirror', 'car-selfie-3'] }]) {
    box(b.x0, 0, b.z - 0.2, b.x1, 2.4, b.z + 0.2, M.cream, { outline: true, uv: 1 });
    box(b.x0 - 0.05, 2.4, b.z - 0.25, b.x1 + 0.05, 2.62, b.z + 0.25, M.red, { collide: false, outline: true });
    const cx = (b.x0 + b.x1) / 2;
    hang(b.k[0], cx, 1.33, b.z + 0.24, 1.15, 1.55, { frame: 0x7d1730, glow: 0.7 });
    hang(b.k[1], cx, 1.33, b.z - 0.24, 1.15, 1.55, { frame: 0x7d1730, glow: 0.7, ry: PI });
  }
  // shade-cloth strips over the food court (hung wall to wall, no poles)
  for (const [z, mat] of [[-30, M.leheriya], [-25.2, M.bandhani], [-20.4, M.leheriya], [-15.6, M.bandhaniG], [-10.8, M.leheriya]]) {
    const g = new THREE.PlaneGeometry(32, 3.2, 24, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 16) / 32; const x = 12.7 + u * 32; const y = 7.6 + u * 1.3 - Math.sin(u * PI) * 1.1; p.setXYZ(i, x, y, z + p.getY(i)); }
    g.computeVertexNormals(); mesh(g, mat, { keepUV: true, uv: 6 });
  }
  floorDecal('B', [30, 0.02, -18.5], 6);
  pool(30, 4.5, -14, 10); pool(20, 4, -28, 9, WARM); pool(18.5, 3.5, -17.5, 7, PINK); pool(37, 3.5, -16.5, 7, PINK);

  // ── string lights, lanterns, bunting ──────────────────────────────────────
  const zig = (pts, sag = 0.9) => { for (let i = 0; i < pts.length - 1; i++) lightRun(V(...pts[i]), V(...pts[i + 1]), sag); };
  for (const s of [-1, 1]) {
    // plaza zigzags
    zig([[s * 44.9, 9.0, 17], [s * 36, 7.5, 26], [s * 26, 7.5, 16], [s * 19, 7.5, 26], [s * 12, 7.5, 16], [s * 12.9, 6.9, 26]], 1.1);
    zig([[s * 44.9, 9.0, 24], [s * 30, 7.5, 16.2], [s * 26.1, 7.5, 26]], 1.1);
    lightRun(V(s * 12.9, 7.0, 26), V(0, 8.9, 26), 0.5);
    // lanes
    zig([[s * 26, 7.5, 15.5], [s * 44.9, 9.0, 11], [s * 26, 7.5, 6.5], [s * 44.9, 9.0, 1], [s * 26, 7.5, -3], [s * 44.9, 9.0, -7], [s * 37, 7.5, -8.1]], 1.2);
    // spawn
    lightRun(V(s * 12, 7.5, 28.5), V(s * 12, 7.5, 34), 0.4);
    // back hall zigzag
    const bx = s * 11.4;
    if (s < 0) zig([[bx, 7.5, -8.5], [-bx, 7.5, -12], [bx, 7.5, -16], [-bx, 7.5, -21], [bx, 7.5, -25], [-bx, 7.5, -29], [bx, 7.5, -33]], 1.0);
  }
  for (const z of [28.5, 31.2, 34]) lightRun(V(-12, 7.5, z), V(12, 7.5, z), 1.0);
  // A site fans from the stage truss
  for (const [x, z, y] of [[-45, -12, 9.2], [-41, -10, 7.5], [-37, -9, 7.5], [-26, -8, 7.5], [-19, -8, 7.5], [-12.6, -12, 7.5], [-12.6, -24, 7.5], [-12.6, -32, 7.5]]) lightRun(V(-35 + (x + 35) * 0.25, 7.4, -29.6), V(x, y, z), 1.3);
  // B site strings under the shade cloth
  for (const z of [-32.4, -27.6, -22.8, -18, -13.2]) lightRun(V(12.7, 7.4, z), V(44.9, 8.8, z), 1.6);
  for (const x of [20, 28, 36]) lightRun(V(x, 7.2, -9.2), V(x, 7.0, -34.8), 1.2);
  // lantern rows
  const lanternRun = (a, b, n, sag = 0.9, ri = 0) => {
    const pts = catenary(V(...a), V(...b), sag, 24, null);
    for (let i = 1; i < n; i++) { const p = pts[Math.round((i / n) * 24)]; lanterns.push([p.x, p.y - 0.5, p.z, (i + ri) % 4]); wireSeg([p.x, p.y, p.z], [p.x, p.y - 0.25, p.z]); }
  };
  lanternRun([-44.9, 6.8, 21], [-26, 6.4, 21], 9, 0.8, 0); lanternRun([26, 6.4, 21], [44.9, 6.8, 21], 9, 0.8, 1);
  lanternRun([-12, 6.8, 21], [12, 6.8, 21], 11, 1.0, 2); lanternRun([-11.4, 6.2, -20], [11.4, 6.2, -20], 10, 0.8, 3);
  lanternRun([-11.4, 6.2, -14], [11.4, 6.2, -14], 10, 0.8, 1);
  lanternRun([12.6, 6.6, -18], [44.9, 7.6, -18], 14, 1.1, 2);
  lanternRun([-44.9, 7.0, 4], [-26, 6.6, 4], 8, 0.9, 0); lanternRun([26, 6.6, 4], [44.9, 7.0, 4], 8, 0.9, 3);
  lanternRun([-12, 6.2, 29.5], [12, 6.2, 29.5], 9, 0.7, 1);
  // bunting with mirror-work
  const buntRuns = [
    [[-12, 7.3, -7.8], [12, 7.3, -7.8]], [[-12, 7.3, 15.6], [12, 7.3, 15.6]],
    [[-44.9, 8.4, 25], [-26, 7.3, 16.3]], [[44.9, 8.4, 25], [26, 7.3, 16.3]], [[-12, 6.8, 26.4], [-26, 7.3, 16.3]], [[12, 6.8, 26.4], [26, 7.3, 16.3]],
    [[-44.9, 8.6, 8], [-26, 7.3, 0]], [[44.9, 8.6, 8], [26, 7.3, 0]],
    [[-11.4, 7.0, -10], [11.4, 7.0, -10]], [[-11.4, 7.0, -24], [11.4, 7.0, -24]], [[-11.4, 7.0, -31], [11.4, 7.0, -31]],
    [[-44.9, 8.6, -10], [-12.6, 7.3, -10]], [[-44.9, 8.6, -20], [-12.6, 7.3, -18]], [[12.6, 7.3, -12], [44.9, 8.6, -12]], [[12.6, 7.3, -33], [36, 6.4, -33]],
  ];
  for (const [a, b] of buntRuns) bunting(catenary(V(...a), V(...b), 0.8, 36, null));
  // garlands along wall tops at key spots
  festoon(V(-45, 9.3, -34.8), V(-12.6, 9.3, -34.8), 0.6, 2.4); festoon(V(12.6, 9.3, -34.8), V(45, 9.3, -34.8), 0.6, 2.4);
  for (const s of [-1, 1]) { festoon(V(s * 12.05, 7.4, 16.06), V(s * 25.95, 7.4, 16.06), 0.5, 2.0); festoon(V(s * 11.95, 7.4, 6), V(s * 11.95, 7.4, 15.9), 0.5, 2.0); festoon(V(s * 11.95, 7.4, -7.9), V(s * 11.95, 7.4, 2), 0.5, 2.0); }
  festoon(V(-45, 7.3, 26.0), V(-12.9, 7.3, 26.0), 0.55, 2.2); festoon(V(12.9, 7.3, 26.0), V(45, 7.3, 26.0), 0.55, 2.2);
  // lamps beside passage mouths
  for (const s of [-1, 1]) for (const x of [12, 26]) for (const z of [1.4, 6.6]) lamp(s * x, z, 3.0, x === 12 ? -s : s); // lanterns beside the passage mouths

  // ── beyond the walls: giant wheel, town silhouettes, trees ────────────────
  const skyline = [];
  {
    const r = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 40; i++) {
      const side = i % 4; let x, z;
      if (side === 0) { x = r(-90, 90); z = r(-80, -46); } else if (side === 1) { x = r(-90, 90); z = r(46, 80); } else if (side === 2) { x = r(-95, -55); z = r(-60, 60); } else { x = r(55, 95); z = r(-60, 60); }
      if (Math.hypot(x - 64, z + 62) < 26) continue; // keep the wheel clear
      const w = r(7, 14), d = r(7, 14), h = r(9, 20); skyline.push([x, z, w, d, h]);
      box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, M.windows, { collide: false, uv: 6, ao: 0, shadow: false });
      box(x - w / 2 - 0.3, h, z - d / 2 - 0.3, x + w / 2 + 0.3, h + 0.4, z + d / 2 + 0.3, M.dark, { collide: false, ao: 0, shadow: false });
    }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2 + 0.2; const x = Math.cos(a) * 60, z = Math.sin(a) * 50; if (Math.hypot(x - 64, z + 62) < 22) continue; tree(x, z, 1.4 + Math.random() * 0.6); }
  }
  dyn.wheel = giantWheel(66, -64, 17);

  // instanced dressing
  buildBulbs(); buildMarigolds(); buildLeaves(); buildLanterns(); buildDiyas(); buildMirrors(); buildBalloons(); buildCones(); buildWires(); buildBunting();

  const meshes = flush(scene, { shadows: true });
  for (const m of meshes) if (m.material === M.water) m.onBeforeRender = () => { M.water.uniforms.uTime.value = performance.now() / 1000; };

  // ── signs ─────────────────────────────────────────────────────────────────
  sign('GARBA NIGHT', '#ff5fd2', [0, 7.9, 26.27], 0, 10, { sub: 'NAVRATRI · DANCE TILL THE LIGHTS GO OUT', subColor: '#ffc21a', hdr: 2.1 });
  sign('RAAS GARBA', '#ffc21a', [-35, 7.15, -34.38], 0, 8.5, { sub: 'LIVE DHOL · ALL NIGHT', subColor: '#ff6fae', hdr: 1.8 });
  sign('#GARBAWITHCHIKERO', '#ff6fae', [-19, 7.05, 16.6], 0, 8.4, { hdr: 1.7 });
  sign('CHAI ₹10', '#ffb347', [32, 3.85, -31.0], 0, 5.5, { sub: 'CUTTING · KADAK · HOT', subColor: '#7fe3d6', hdr: 1.9 });
  sign('THE GARBA CIRCLE', '#7fe3d6', [0, 6.15, 15.95], 0, 8, { hdr: 1.4, sub: 'MID', subColor: '#ffc21a' });
  sign('JALEBI', '#ff8a1a', [42.32, 3.6, -22.5], -PI / 2, 4.6, { sub: 'FAFDA · HOT · SWEET', subColor: '#ffc21a', hdr: 1.7 });
  sign('THE PANDAL STAGE', '#f6e7c8', [-12.68, 5.3, -27], -PI / 2, 6.5, { hdr: 1.0, sub: 'A SITE', subColor: '#ff4655' });
  sign('FOOD STALLS', '#f6e7c8', [12.68, 5.3, -27], PI / 2, 6.5, { hdr: 1.0, sub: 'B SITE', subColor: '#ff4655' });
  sign('A', '#ff4655', [-12.68, 5.6, -18], -PI / 2, 3.2, { hdr: 1.6 });
  sign('B', '#ff4655', [12.68, 5.6, -18], PI / 2, 3.2, { hdr: 1.6 });
  sign('A ◂', '#f6e7c8', [-25.95, 5.3, 11], -PI / 2, 4, { hdr: 1.1 });
  sign('▸ B', '#f6e7c8', [25.95, 5.3, 11], PI / 2, 4, { hdr: 1.1 });
  sign('NOT GOODBYE', '#ffc21a', [0, 5.7, -34.4], 0, 9, { hdr: 1.3, sub: 'SEE YOU NEXT NAVRATRI', subColor: '#ff6fae' });
  // spawn banner on the back wall
  {
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25, 20, 2), std(0xffffff, GT.signBoard('NAVRATRI NIGHTS', { bg: '#7d1730', fg: '#ffc21a', border: '#ffc21a', sub: 'NINE NIGHTS · ONE CIRCLE · ZERO STEPS', subColor: '#fff2d0' }), { paint: 0, vc: false, emissive: 0xffffff, ei: 0.15, side: THREE.DoubleSide }));
    ban.material.emissiveMap = ban.material.map;
    const p = ban.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.1) * 0.08); ban.geometry.computeVertexNormals();
    ban.position.set(0, 5.0, 34.85); ban.rotation.y = PI; scene.add(ban);
  }

  // ── the cat: on top of the line-array speaker tower next to the stage ─────
  const cat = makeCat(); cat.position.set(-44.2, 3.4, -27.6); cat.rotation.y = -0.6; scene.add(cat);
  dyn.cat = cat; dyn.catHit = new THREE.Vector3(-44.2, 3.75, -27.6);

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
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(22.6, 4.6), barrierMat);
  barrier.position.set(0, 2.5, 26); scene.add(barrier);
  const barrierSolid = addSolid(-12, 0, 25.8, 12, 5, 26.2, 'barrier');
  dyn.barrier = barrier; dyn.barrierSolid = barrierSolid;

  // ── plant zone (final round): the dance floor in front of the stage ───────
  const plantCenter = new THREE.Vector3(-30, 0, -20.5);
  const pring = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.4), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  pring.rotation.x = -PI / 2; pring.position.set(plantCenter.x, 0.04, plantCenter.z); pring.visible = false; scene.add(pring);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 30, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.3), transparent: true, opacity: 0.35, depthWrite: false }));
  beacon.position.set(plantCenter.x, 15, plantCenter.z); beacon.visible = false; scene.add(beacon);
  dyn.plantRing = pring; dyn.plantBeacon = beacon; dyn.plantCenter = plantCenter; dyn.plantRadius = 4.5;
  dyn.minimap = { a: [-30, -21], b: [30, -19], mid: [0, 4], aName: 'THE PANDAL STAGE', bName: 'FOOD STALLS' };

  // ── clouds (dusk wisps), night sky dome ───────────────────────────────────
  dyn.clouds = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloudTexture(i + 11), transparent: true, depthWrite: false, fog: false }));
    const a = (i / 8) * PI * 2 + 0.5; const d = 160 + Math.random() * 60;
    s.position.set(Math.cos(a) * d, 45 + Math.random() * 30, Math.sin(a) * d);
    const k = 55 + Math.random() * 40; s.scale.set(k, k * 0.45, 1);
    s.userData = { a, d, sp: 0.003 + Math.random() * 0.003 };
    scene.add(s); dyn.clouds.push(s);
  }
  const moonDir = new THREE.Vector3(...GARBA_LIGHTING.sunDir).normalize();
  const sky = nightSky(moonDir, U.uTime); sky.visible = false; scene.add(sky); dyn.sky = sky;
  dyn.lighting = { ...GARBA_LIGHTING };

  // light pools → uniforms
  pools.slice(0, NP).forEach(([x, y, z, r, c], i) => { U.uPools.value[i].set(x, y, z, r); U.uPoolCol.value[i].set(c[0], c[1], c[2]); });
  if (pools.length > NP) console.warn('garba: light pools truncated', pools.length);

  // night switch: automatic (dark fog ⇒ night) unless forced via dyn.setNight
  let forced = null, isNight = null;
  const dayCloud = new THREE.Color(1, 1, 1), nightCloud = new THREE.Color(0.1, 0.075, 0.2);
  const applyNight = (on) => {
    if (on === isNight) return; isNight = on;
    U.uNight.value = on ? 1 : 0; sky.visible = on;
    for (const c of dyn.clouds) { c.material.color.copy(on ? nightCloud : dayCloud); c.material.opacity = on ? 0.55 : 1; }
  };
  dyn.setNight = (v) => { forced = v; if (v !== null && v !== undefined) applyNight(!!v); };
  dyn.isNight = () => !!isNight;
  dyn.ringLights.onBeforeRender = (renderer, sc) => {
    const t = performance.now() / 1000; U.uTime.value = t;
    if (forced === null || forced === undefined) { const f = sc.fog; const c = f && f.color; applyNight(!!c && (c.r * 0.3 + c.g * 0.59 + c.b * 0.11) < 0.3); }
  };
  applyNight(false);

  // ── navigation ────────────────────────────────────────────────────────────
  const nodes = {
    S0: [0, 30.5], P1: [0, 24.6], PW2: [-6, 24.4], PE2: [6, 24.4], PW: [-34, 21], PE: [34, 21], MSW: [-6, 16.5], MSE: [6, 16.5],
    MS: [0, 13.2], MW: [-8.6, 4], ME: [8.6, 4], MN: [0, -5],
    CWb: [-13.6, 4], CWa: [-24.4, 4], CEb: [13.6, 4], CEa: [24.4, 4],
    AL: [-34, 12], ALc: [-33.5, 4], AL2: [-33.5, -4], AMAIN: [-31, -11], AM2: [-26.5, -16.5], APLANT: [-30, -21], ASITE: [-21.5, -23.5], AB: [-14.6, -18],
    BH: [0, -18], BH2: [-5.5, -28.5], BH3: [5.5, -28.5],
    BL: [34, 12], BLc: [33.5, 4], BL2: [33.5, -4], BMAIN: [31, -11], BM2: [28, -16.5], BSITE: [29, -19], BCHAI: [32, -28.4], BB: [14.6, -18], BDK1: [36.8, -29.2], BDECK: [37.0, -31.8],
  };
  const edges = [
    ['S0', 'P1'], ['P1', 'PW2'], ['P1', 'PE2'], ['PW2', 'PW'], ['PE2', 'PE'], ['PW2', 'MSW'], ['PE2', 'MSE'], ['MSW', 'MS'], ['MSE', 'MS'],
    ['MSW', 'MW'], ['MSE', 'ME'], ['MW', 'MN'], ['ME', 'MN'], ['MW', 'CWb'], ['CWb', 'CWa'], ['CWa', 'ALc'], ['ME', 'CEb'], ['CEb', 'CEa'], ['CEa', 'BLc'],
    ['PW', 'AL'], ['AL', 'ALc'], ['ALc', 'AL2'], ['AL2', 'AMAIN'], ['AMAIN', 'AM2'], ['AM2', 'APLANT'], ['AM2', 'ASITE'], ['APLANT', 'ASITE'], ['AM2', 'AB'], ['ASITE', 'AB'],
    ['AB', 'BH'], ['BH', 'MN'], ['BH', 'BH2'], ['BH', 'BH3'], ['BH2', 'BH3'],
    ['PE', 'BL'], ['BL', 'BLc'], ['BLc', 'BL2'], ['BL2', 'BMAIN'], ['BMAIN', 'BM2'], ['BM2', 'BSITE'], ['BSITE', 'BCHAI'], ['BSITE', 'BB'], ['BM2', 'BB'], ['BB', 'BH'], ['BCHAI', 'BDK1'], ['BDK1', 'BDECK'],
  ];
  const posts = {
    aLane: [-38, 5.4], aMain: [-30, -12.5], aSite: [-22, -24], aPlat: [-39, -32], aCrate: [-17, -19],
    mid: [0, -4], mid2: [-5, 11], backHall: [0, -18], backHall2: [-5.5, -28.5],
    bLane: [36, 7], bMain: [31, -12.5], bStage: [41.5, -30.4], bBoard: [19, -16.5], bSite: [28.5, -19],
  };
  const spawnPoint = new THREE.Vector3(0, 0, 31);

  return { meshes, dyn, nodes, edges, posts, spawnPoint, M };

  // ════════════════════════════════════════════════════════════════════════
  // helpers (hoisted)
  // ════════════════════════════════════════════════════════════════════════
  function tri(Tr, a, b, c, out = [0, 1, 0]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) Tr.push(a, c, b); else Tr.push(a, b, c);
  }
  function triGeo(Tr) {
    const pos = [], uv = [];
    for (const p of Tr) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals(); return g;
  }
  // Gabled fabric tent roof with a scalloped valance round the eaves.
  function tentRoof(x0, z0, x1, z1, y, rise, mat, { over = 0.45, tile = 3, jh = M.jhalar } = {}) {
    const X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
    const ax = X1 - X0 >= Z1 - Z0;
    const L = ax ? X1 - X0 : Z1 - Z0, hw = (ax ? Z1 - Z0 : X1 - X0) / 2;
    const ca = ax ? (X0 + X1) / 2 : (Z0 + Z1) / 2, cb = ax ? (Z0 + Z1) / 2 : (X0 + X1) / 2;
    const P = (a, b, yy) => (ax ? [ca + a, yy, cb + b] : [cb + b, yy, ca + a]);
    const sl = Math.hypot(hw, rise); const Tr = [];
    for (const sb of [-1, 1]) {
      const E0 = [...P(-L / 2, sb * hw, y), -L / 2 / tile, 0], E1 = [...P(L / 2, sb * hw, y), L / 2 / tile, 0];
      const R0 = [...P(-L / 2, 0, y + rise), -L / 2 / tile, sl / tile], R1 = [...P(L / 2, 0, y + rise), L / 2 / tile, sl / tile];
      tri(Tr, E0, E1, R1); tri(Tr, E0, R1, R0);
    }
    for (const sa of [-1, 1]) tri(Tr, [...P(sa * L / 2, -hw, y), -hw / tile, 0], [...P(sa * L / 2, hw, y), hw / tile, 0], [...P(sa * L / 2, 0, y + rise), 0, rise / tile], ax ? [sa, 0, 0] : [0, 0, sa]);
    mesh(triGeo(Tr), mat, { keepUV: true, uv: 1 });
    const c = [P(-L / 2, -hw, y), P(L / 2, -hw, y), P(L / 2, hw, y), P(-L / 2, hw, y)];
    for (let i = 0; i < 4; i++) valance(c[i], c[(i + 1) % 4], y + 0.02, Math.min(0.62, rise * 0.5), jh);
    // ridge finials
    for (const sa of [-1, 1]) { const q = P(sa * L / 2, 0, y + rise); mesh(new THREE.SphereGeometry(0.16, 10, 8), M.gold, { p: [q[0], q[1] + 0.12, q[2]] }); }
  }
  // Scalloped cloth strip hanging from yTop between two points (only x,z of a/b are used).
  function valance(a, b, yTop, h, mat) {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]); const rep = Math.max(1, Math.round(L / 1.1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], yTop - h, a[2], b[0], yTop - h, b[2], b[0], yTop, b[2], a[0], yTop - h, a[2], b[0], yTop, b[2], a[0], yTop, a[2]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, rep, 0, rep, 1, 0, 0, rep, 1, 0, 1], 2));
    g.computeVertexNormals(); mesh(g, mat, { keepUV: true, uv: 1 });
  }
  function catenary(a, b, sag, n, out) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); if (out) out.push(p.clone()); }
    wires.push(pts); return pts;
  }
  function lightRun(a, b, sag = 0.9, dens = 1.7) { return catenary(a, b, sag, Math.max(4, Math.round(a.distanceTo(b) * dens)), bulbs); }
  function wireSeg(a, b) { wires.push([V(...a), V(...b)]); }
  function flagsAlong(pts, every) { for (let i = 1; i < pts.length - 1; i += every) { const p = pts[i]; mirrors.push([p.x, p.y - 0.12, p.z, i]); } }
  // Scalloped marigold festoons with hanging strands and a mango-leaf toran.
  function festoon(A, B, drop = 0.5, seg = 2.2) {
    const L = A.distanceTo(B); const segs = Math.max(2, Math.round(L / seg));
    for (let s = 0; s < segs; s++) {
      const p0 = A.clone().lerp(B, s / segs), p1 = A.clone().lerp(B, (s + 1) / segs);
      const n = Math.max(8, Math.round(p0.distanceTo(p1) / 0.12));
      for (let i = 0; i <= n; i++) { const t = i / n; const p = p0.clone().lerp(p1, t); p.y -= drop * 4 * t * (1 - t); marigolds.push(p); }
      for (let k = 1; k < 6; k++) marigolds.push(p0.clone().add(V(0, -k * 0.14, 0)));
      const dir = Math.atan2(p1.z - p0.z, p1.x - p0.x);
      for (let i = 1; i < 4; i++) { const p = p0.clone().lerp(p1, i / 4); leaves.push([p.x, p.y - 0.02, p.z, dir + PI / 2, 1.0]); }
    }
  }
  function bunting(pts) {
    const pal = ['#ff4655', '#ffc21a', '#1f9e8f', '#f6e7c8', '#ff5fd2', '#ff8a1a', '#6a5acd', '#3f8f3a'].map((c) => new THREE.Color(c));
    let acc = 0; const step = 0.46; let k = (Math.random() * 8) | 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1]; const seg = A.distanceTo(B); const t = B.clone().sub(A).normalize();
      while (acc < seg) {
        const p = A.clone().addScaledVector(t, acc); const sw = (Math.random() - 0.5) * 0.2;
        const side = new THREE.Vector3(-t.z, 0, t.x);
        const tip = p.clone().add(V(0, -0.46, 0)).addScaledVector(side, sw);
        const v = [p.clone().addScaledVector(t, -0.18), p.clone().addScaledVector(t, 0.18), tip];
        const c = pal[k++ % pal.length];
        for (const q of v) { flagPos.push(q.x, q.y, q.z); flagCol.push(c.r, c.g, c.b); }
        mirrors.push([p.x + side.x * 0.01, p.y - 0.17, p.z + side.z * 0.01, k]);
        acc += step;
      }
      acc -= seg;
    }
  }
  function sign(text, color, pos, rotY, width, { sub = null, subColor = null, hdr = 2 } = {}) {
    const texx = T.neonTexture(text, color, { sub, subColor });
    const m = new THREE.MeshBasicMaterial({ map: texx, transparent: true, depthWrite: false, toneMapped: true });
    m.color.setScalar(hdr * 0.72 + 0.15);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), m);
    p.position.set(...pos); p.rotation.y = rotY; p.renderOrder = 2;
    scene.add(p); dyn.signs.push(p);
    mesh(new THREE.PlaneGeometry(width * 0.86, (width / 4) * 0.78), M.signBack, { p: [pos[0] - Math.sin(rotY) * 0.03, pos[1], pos[2] - Math.cos(rotY) * 0.03], r: [0, rotY, 0] });
  }
  function signBoardMesh(text, pos, rotY, width, o) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), std(0xffffff, GT.signBoard(text, o), { paint: 0, vc: false, emissive: 0xffffff, ei: 0.22 }));
    m.material.emissiveMap = m.material.map; m.position.set(...pos); m.rotation.y = rotY; scene.add(m);
  }
  function menuMesh(title, items, pos, rotY, w) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 1.25), std(0xffffff, GT.menuBoard(title, items), { paint: 0, vc: false, emissive: 0xffffff, ei: 0.2 }));
    m.material.emissiveMap = m.material.map; m.position.set(...pos); m.rotation.y = rotY; scene.add(m);
  }
  function floorDecal(letter, pos, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: T.floorLetter(letter, '#ffc21a'), transparent: true, roughness: 0.8, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false }));
    m.rotation.x = -PI / 2; m.position.set(...pos); m.receiveShadow = true; scene.add(m);
  }
  // A woven mat / runner on the floor (texture repeats every `tile` metres).
  function carpet(cx, cz, w, d, tx, tile, alongX) {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (alongX) uv.setXY(i, v * d / tile, u * w / tile); else uv.setXY(i, u * w / tile, v * d / tile); }
    g.translate(cx, 0.012, cz);
    const m = new THREE.Mesh(g, std(0xffffff, tx, { paint: 0.3, vc: false, rough: 0.95 }));
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; m.material.polygonOffsetUnits = -1;
    m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m);
  }
  function poster(axis, fixed, s0, side, y, idx, sc = 1) {
    const g = new THREE.PlaneGeometry(0.8 * sc, 1.0 * sc); const [u0, v0, du, dv] = PA.rect(idx); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
    const ry = axis === 'x' ? (side > 0 ? 0 : PI) : (side > 0 ? PI / 2 : -PI / 2);
    const o = 0.03 * side;
    mesh(g, posterMat, { p: axis === 'x' ? [s0, y, fixed + o] : [fixed + o, y, s0], r: [0, ry, (Math.random() - 0.5) * 0.06], keepUV: true, uv: 1 });
  }
  function crate(cx, cz, w, h, y = 0) { box(cx - w / 2, y, cz - w / 2, cx + w / 2, y + h, cz + w / 2, M.crate, { outline: true, uv: Math.max(w, h), ao: 0 }); }
  function urn(cx, cz) {
    mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.8, 14), M.copper, { p: [cx, 0.4, cz], outline: 0.03 });
    contactRound(cx, cz, 0.35, 0, 0.45);
    heap(cx, 0.8, cz, 0.55);
    addSolid(cx - 0.4, 0, cz - 0.4, cx + 0.4, 0.8, cz + 0.4);
  }
  // mound of marigold heads (instanced)
  function heap(cx, y, cz, r) { const n = Math.round(r * r * 60); for (let i = 0; i < n; i++) { const a = Math.random() * PI * 2, d = Math.sqrt(Math.random()) * r; marigolds.push(V(cx + Math.cos(a) * d, y + (1 - d / r) * r * 0.45 + 0.05, cz + Math.sin(a) * d)); } }
  // Market cart: body on wheels with a striped umbrella; optional kulfi-style canopy.
  function cart(cx, cz, w, d, h, mat, alongZ = false) {
    const hw = w / 2, hd = d / 2;
    box(cx - hw, 0.4, cz - hd, cx + hw, h, cz + hd, mat, { outline: true, uv: 1.2 }); addSolid(cx - hw, 0, cz - hd, cx + hw, 0.4, cz + hd);
    box(cx - hw - 0.05, h, cz - hd - 0.05, cx + hw + 0.05, h + 0.08, cz + hd + 0.05, M.cream, { collide: false, outline: true });
    const wx = alongZ ? [cx - hw - 0.08, cx + hw + 0.08] : [cx - hw + 0.4, cx + hw - 0.4];
    const wz = alongZ ? [cz - hd + 0.5, cz + hd - 0.5] : [cz - hd - 0.08, cz + hd + 0.08];
    for (const x of wx) for (const z of wz) mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), M.dark, { p: [x, 0.36, z], r: alongZ ? [0, 0, PI / 2] : [PI / 2, 0, 0], outline: 0.02 });
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), M.dark, { p: [cx, h + 1.1, cz] });
    mesh(new THREE.ConeGeometry(1.6, 0.6, 12, 1, true), M.tentA, { p: [cx, h + 2.3, cz] });
  }
  // Stall: solid back body + counter in front + lean-to awning + optional painted sign.
  function stall(x0, z0, x1, z1, axis, side, bodyMat, awnMat, title, so = {}) {
    // axis 'x': the stall backs onto an x-facing wall; counter faces `side` along x. axis 'z': faces +z/-z.
    if (axis === 'x') {
      const bx0 = side > 0 ? x0 : x1 - 1.6, bx1 = side > 0 ? x0 + 1.6 : x1; // body depth 1.6
      box(Math.min(bx0, bx1), 0, z0, Math.max(bx0, bx1), 2.8, z1, bodyMat, { outline: true, uv: 1.5, ao: 2.6 });
      const cx0 = side > 0 ? x0 + 1.6 : x1 - 2.6, cx1 = side > 0 ? x0 + 2.6 : x1 - 1.6;
      box(cx0, 0, z0 + 0.4, cx1, 1.1, z1 - 0.4, M.wood, { outline: true, uv: 1.2 });
      box(cx0 - 0.05, 1.1, z0 + 0.35, cx1 + 0.05, 1.18, z1 - 0.35, M.cream, { collide: false, outline: true });
      const xe = side > 0 ? x0 + 3.3 : x1 - 3.3, xw = side > 0 ? x0 + 1.6 : x1 - 1.6;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([xw, 3.5, z0 - 0.2, xe, 2.75, z0 - 0.2, xe, 2.75, z1 + 0.2, xw, 3.5, z0 - 0.2, xe, 2.75, z1 + 0.2, xw, 3.5, z1 + 0.2], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0.6, (z1 - z0) / 2, 0.6, 0, 0, (z1 - z0) / 2, 0.6, (z1 - z0) / 2, 0], 2)); g.computeVertexNormals();
      mesh(g, awnMat, { keepUV: true, uv: 1 });
      valance([xe, 0, z0 - 0.2], [xe, 0, z1 + 0.2], 2.77, 0.42, M.jhalar);
      for (const z of [z0 - 0.1, z1 + 0.1]) { mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.75, 6), M.bamboo, { p: [xe, 1.375, z] }); addSolid(xe - 0.07, 0, z - 0.07, xe + 0.07, 2.75, z + 0.07); }
      box(Math.min(bx0, bx1), 2.8, z0, Math.max(bx0, bx1), 4.6, z1, bodyMat, { collide: false, uv: 1.5, ao: 0 });
      if (title) signBoardMesh(title, [side > 0 ? x0 + 1.62 : x1 - 1.62, 4.0, (z0 + z1) / 2], side > 0 ? PI / 2 : -PI / 2, Math.min(z1 - z0 - 0.4, 5), so);
      for (let z = z0 + 0.6; z < z1 - 0.4; z += 1.2) lanterns.push([xe - side * 0.1, 2.3, z, ((z * 3) | 0) & 3]);
    } else {
      const bz1 = z0 + 2.6; // body against the north wall, counter in front
      box(x0, 0, z0, x1, 2.8, bz1, bodyMat, { outline: true, uv: 1.5, ao: 2.6 });
      box(x0, 2.8, z0, x1, 4.6, z0 + 0.6, bodyMat, { collide: false, uv: 1.5, ao: 0 });
      box(x0, 0, bz1, x1, 1.1, z1, M.wood, { outline: true, uv: 1.2 });
      box(x0 - 0.05, 1.1, bz1 - 0.05, x1 + 0.05, 1.18, z1 + 0.05, M.cream, { collide: false, outline: true });
      const ze = z1 + 0.9;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0 - 0.2, 3.5, bz1, x1 + 0.2, 3.5, bz1, x1 + 0.2, 2.75, ze, x0 - 0.2, 3.5, bz1, x1 + 0.2, 2.75, ze, x0 - 0.2, 2.75, ze], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, (x1 - x0) / 2, 0, (x1 - x0) / 2, 0.6, 0, 0, (x1 - x0) / 2, 0.6, 0, 0.6], 2)); g.computeVertexNormals();
      mesh(g, awnMat, { keepUV: true, uv: 1 });
      valance([x0 - 0.2, 0, ze], [x1 + 0.2, 0, ze], 2.77, 0.42, M.jhalar);
      for (const x of [x0 - 0.1, x1 + 0.1]) { mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.75, 6), M.bamboo, { p: [x, 1.375, ze] }); addSolid(x - 0.07, 0, ze - 0.07, x + 0.07, 2.75, ze + 0.07); }
      for (let x = x0 + 0.8; x < x1 - 0.4; x += 1.4) lanterns.push([x, 2.35, ze - 0.1, ((x * 3) | 0) & 3]);
    }
  }
  function sacks(cx, cz, w, d) {
    const cols = [M.pink, M.marigold, M.teal, M.saffron, M.red];
    let k = 0;
    for (let x = cx - w / 2 + 0.3; x < cx + w / 2; x += 0.55) for (let z = cz - d / 2 + 0.28; z < cz + d / 2; z += 0.55) {
      mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.75, 10), M.cream, { p: [x, 0.375, z], outline: 0.02 });
      mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, PI * 2, 0, PI / 2), cols[k++ % cols.length], { p: [x, 0.74, z], s: [1, 0.5, 1] });
    }
    addSolid(cx - w / 2, 0, cz - d / 2, cx + w / 2, 0.85, cz + d / 2); contactRound(cx, cz, Math.max(w, d) / 2, 0, 0.5, 0.7);
  }
  function swing(cx, cz) {
    for (const dx of [-1.4, 1.4]) {
      for (const dz of [-0.6, 0.6]) mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.2, 8), M.bamboo, { p: [cx + dx, 1.55, cz + dz], r: [dz > 0 ? -0.18 : 0.18, 0, 0], outline: 0.02 });
      addSolid(cx + dx - 0.12, 0, cz - 0.75, cx + dx + 0.12, 3.1, cz + 0.75);
    }
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8), M.bamboo, { p: [cx, 3.1, cz], r: [0, 0, PI / 2], outline: 0.02 });
    box(cx - 0.8, 0.55, cz - 0.3, cx + 0.8, 0.65, cz + 0.3, M.red, { collide: false, outline: true });
    for (const dx of [-0.7, 0.7]) mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.45, 4), M.dark, { p: [cx + dx, 1.88, cz] });
    for (let i = 0; i <= 20; i++) marigolds.push(V(cx - 1.4 + i * 0.14, 3.0 - 0.25 * Math.sin((i / 20) * PI), cz));
  }
  function column(cx, cz) {
    mesh(new THREE.CylinderGeometry(0.36, 0.4, 5.6, 14), M.red, { p: [cx, 2.8, cz], uv: 2, ao: 3, outline: 0.03 });
    for (const y of [0.6, 2.0, 3.4, 4.8]) mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 16), M.gold, { p: [cx, y, cz], r: [PI / 2, 0, 0] });
    contactRound(cx, cz, 0.55, 0, 0.6);
    box(cx - 0.55, 0, cz - 0.55, cx + 0.55, 0.3, cz + 0.55, M.gold, { collide: false, outline: true });
    box(cx - 0.55, 5.6, cz - 0.55, cx + 0.55, 5.95, cz + 0.55, M.gold, { collide: false, outline: true });
    addSolid(cx - 0.42, 0, cz - 0.42, cx + 0.42, 6, cz + 0.42);
    for (let k = 0; k < 4; k++) { const a = k * PI / 2; for (let j = 0; j < 22; j++) { const y = 5.5 - j * 0.12; marigolds.push(V(cx + Math.cos(a + j * 0.25) * 0.42, y, cz + Math.sin(a + j * 0.25) * 0.42)); } }
    lanterns.push([cx, 5.2, cz + 0.9, ((cx + cz) | 0) & 3]); wireSeg([cx, 5.95, cz + 0.5], [cx, 5.45, cz + 0.9]);
  }
  function lamp(x, z, y, face = 0) {
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), M.dark, { p: [x + face * 0.2, y + 0.45, z], r: [0, 0, PI / 2] });
    box(x + face * 0.4 - 0.12, y - 0.22, z - 0.12, x + face * 0.4 + 0.12, y + 0.18, z + 0.12, M.lampGlass, { collide: false, ao: 0, shadow: false });
    box(x + face * 0.4 - 0.16, y + 0.18, z - 0.16, x + face * 0.4 + 0.16, y + 0.26, z + 0.16, M.dark, { collide: false, outline: true, ao: 0 });
    box(x + face * 0.4 - 0.15, y - 0.28, z - 0.15, x + face * 0.4 + 0.15, y - 0.22, z + 0.15, M.dark, { collide: false, outline: true, ao: 0 });
  }
  function speaker(x0, z0, x1, z1, y0, y1) {
    box(x0, y0, z0, x1, y1, z1, M.speaker, { outline: true, uv: 1, ao: 0 });
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = y1 - y0; const n = Math.max(1, Math.round(h / 0.75));
    for (let i = 0; i < n; i++) {
      const y = y0 + (i + 0.5) * (h / n); const r = Math.min(0.32, Math.min(x1 - x0, z1 - z0) * 0.3);
      // cones on the +z (front) face and the face toward site centre
      mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.06, 16), M.grill, { p: [cx, y, z1 + 0.02], r: [PI / 2, 0, 0] });
      mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.08, 10), M.metal, { p: [cx, y, z1 + 0.03], r: [PI / 2, 0, 0] });
      mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.06, 16), M.grill, { p: [x1 + 0.02, y, cz], r: [0, 0, PI / 2] });
    }
  }
  function dhol(x, y, z, ry) {
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 18, 1, true), M.dhol, { p: [x, y, z], r: [0, ry, PI / 2], uv: 1, keepUV: true, outline: 0.02 });
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 18), M.skin, { p: [x + Math.cos(ry) * s * 0.49, y, z - Math.sin(ry) * s * 0.49], r: [0, ry, PI / 2] });
  }
  function dandiyaBundle(x, y, z) {
    const cols = [M.red, M.marigold, M.teal, M.pink, M.green, M.saffron];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 5), cols[(i + (x * 7 | 0)) % cols.length], { p: [x + Math.cos(a) * 0.05, y + 0.22, z + Math.sin(a) * 0.05], r: [Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15] }); }
  }
  // A-frame rack of dandiya sticks (cover, ~1.15m)
  function dandiyaRack(cx, cz) {
    box(cx - 0.8, 0, cz - 0.3, cx + 0.8, 0.12, cz + 0.3, M.wood, { outline: true, uv: 1 });
    for (const dx of [-0.75, 0.75]) for (const dz of [-0.26, 0.26]) mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), M.wood, { p: [cx + dx, 0.6, cz + dz * 0.5], r: [dz > 0 ? -0.22 : 0.22, 0, 0] });
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), M.wood, { p: [cx, 1.15, cz], r: [0, 0, PI / 2] });
    const cols = [M.red, M.marigold, M.teal, M.pink, M.green, M.saffron];
    for (let i = 0; i < 16; i++) { const x = cx - 0.7 + i * 0.093; for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), cols[(i + (s > 0 ? 2 : 0)) % cols.length], { p: [x, 0.62, cz + s * 0.13], r: [s * 0.2, 0, 0] }); }
    addSolid(cx - 0.8, 0, cz - 0.3, cx + 0.8, 1.15, cz + 0.3); contactRound(cx, cz, 0.6, 0, 0.5, 0.6);
  }
  function truss(xa, xb, z, y) {
    const hs = 0.25, B = (x0, y0, z0, x1, y1, z1) => box(x0, y0, z0, x1, y1, z1, M.metal, { collide: false, uv: 1, ao: 0 });
    for (const dz of [-hs, hs]) for (const dy of [-hs, hs]) B(xa, y + dy - 0.035, z + dz - 0.035, xb, y + dy + 0.035, z + dz + 0.035);
    for (let x = xa + 0.3; x < xb; x += 0.6) {
      for (const dz of [-hs, hs]) B(x - 0.018, y - hs, z + dz - 0.018, x + 0.018, y + hs, z + dz + 0.018);
      for (const dy of [-hs, hs]) B(x - 0.018, y + dy - 0.018, z - hs, x + 0.018, y + dy + 0.018, z + hs);
    }
  }
  function rod(p0, p1, r, mat, seg = 8) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1); const d = b.clone().sub(a); const len = d.length();
    _rq.setFromUnitVectors(_up, d.normalize()); _re.setFromQuaternion(_rq);
    const mid = a.add(b).multiplyScalar(0.5);
    mesh(new THREE.CylinderGeometry(r, r, len, seg, 1, true), mat, { p: [mid.x, mid.y, mid.z], r: [_re.x, _re.y, _re.z], uv: 1 });
  }
  function spot(x, z, y, tx, tz, col) {
    const onStage = tx < -25 && tz < -29;
    const top = new THREE.Vector3(x, y - 0.35, z), bot = new THREE.Vector3(tx, onStage ? 1.2 : 0, tz);
    const dir = bot.clone().sub(top); const len = dir.length(); dir.normalize();
    rod([x, y - 0.05, z], [x, y - 0.3, z], 0.03, M.dark, 6);
    rod([top.x - dir.x * 0.25, top.y - dir.y * 0.25, top.z - dir.z * 0.25], [top.x + dir.x * 0.2, top.y + dir.y * 0.2, top.z + dir.z * 0.2], 0.17, M.dark, 12);
    const lens = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12); _rq.setFromUnitVectors(_up, dir); _re.setFromQuaternion(_rq);
    const lp = top.clone().addScaledVector(dir, 0.21);
    mesh(lens, M.lampGlass, { p: [lp.x, lp.y, lp.z], r: [_re.x, _re.y, _re.z] });
    const g = new THREE.CylinderGeometry(0.14, 1.3, len, 24, 1, true); g.translate(0, -len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)); g.translate(top.x + dir.x * 0.2, top.y + dir.y * 0.2, top.z + dir.z * 0.2);
    const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; }
    g.setAttribute('spotCol', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('normal'); g.computeVertexNormals();
    coneGeos.push(g);
  }
  function tree(cx, cz, s) {
    mesh(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 4 * s, 8), M.bark, { p: [cx, 2 * s, cz], uv: 1 });
    const g = new THREE.IcosahedronGeometry(1, 1);
    for (const [bx, by, bz, br] of [[0, 5, 0, 2.4], [1.5, 4.4, 0.6, 1.6], [-1.4, 4.5, -0.5, 1.7], [0.2, 6.2, -0.6, 1.5]]) mesh(g, M.foliage, { p: [cx + bx * s, by * s, cz + bz * s], s: [br * s, br * s * 0.85, br * s], uv: 1.2 });
  }
  function giantWheel(cx, cz, R) {
    const grp = new THREE.Group(); grp.position.set(cx, R + 3, cz); grp.rotation.y = -0.5;
    // static A-frame legs (merged into the world batch)
    for (const s of [-1, 1]) for (const dz of [-2.2, 2.2]) {
      const base = new THREE.Vector3(cx + s * R * 0.55, 0, cz).sub(new THREE.Vector3(cx, 0, cz)).applyAxisAngle(_up, -0.5).add(new THREE.Vector3(cx, 0, cz));
      const off = new THREE.Vector3(0, 0, dz).applyAxisAngle(_up, -0.5);
      rod([base.x + off.x, 0, base.z + off.z], [cx + off.x * 0.6, R + 3, cz + off.z * 0.6], 0.35, M.metal);
    }
    const parts = [];
    const rim = new THREE.TorusGeometry(R, 0.18, 6, 64); parts.push(rim);
    const rim2 = new THREE.TorusGeometry(R * 0.96, 0.1, 6, 64); rim2.translate(0, 0, 1.6); parts.push(rim2);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; const g = new THREE.CylinderGeometry(0.08, 0.08, R, 5); g.translate(0, R / 2, 0); g.rotateZ(a); parts.push(g); }
    const hub = new THREE.CylinderGeometry(0.9, 0.9, 2, 12); hub.rotateX(PI / 2); parts.push(hub);
    for (const p of parts) { p.deleteAttribute('uv'); for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k); }
    const frame = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), new THREE.MeshStandardMaterial({ color: 0x3a3550, roughness: 0.6, metalness: 0.4 }));
    grp.add(frame);
    // rim + spoke bulbs (own instanced mesh so they turn with the wheel), chasing colours
    const pts = [];
    for (let i = 0; i < 128; i++) { const a = (i / 128) * PI * 2; pts.push([Math.cos(a) * R, Math.sin(a) * R, 0.25, a]); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; for (let k = 1; k < 8; k++) pts.push([-Math.sin(a) * R * k / 8, Math.cos(a) * R * k / 8, 0.25, a + 10]); }
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: true }), pts.length);
    const mtx = new THREE.Matrix4(); const c = new THREE.Color();
    pts.forEach(([x, y, z, a], i) => { mtx.makeTranslation(x, y, z); im.setMatrixAt(i, mtx); c.setHSL((a / (PI * 2)) % 1, 1, 0.55).multiplyScalar(3.2); im.setColorAt(i, c); });
    grp.add(im);
    // gondolas
    const gond = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; const g = new THREE.BoxGeometry(1.4, 1.2, 1.4); g.translate(Math.cos(a) * R, Math.sin(a) * R - 0.9, 0.9); gond.push(g.toNonIndexed()); }
    const gm = new THREE.Mesh(mergeGeometries(gond.map((g) => { g.deleteAttribute('uv'); return g; })), new THREE.MeshStandardMaterial({ color: 0xff4f7a, roughness: 0.6, emissive: 0x401020 }));
    grp.add(gm);
    scene.add(grp);
    grp.onBeforeRender = () => {};
    frame.onBeforeRender = () => { grp.rotation.z = (performance.now() / 1000) * 0.05; };
    return grp;
  }
  // chasing floor lights around the Garba Circle
  function ringLights(cx, cz, R, n) {
    const geo = new THREE.CylinderGeometry(0.13, 0.17, 0.05, 12); geo.translate(0, 0.025, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      vertexShader: `varying float vPh; void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vPh = atan(instanceMatrix[3].z - ${cz.toFixed(2)}, instanceMatrix[3].x - ${cx.toFixed(2)}); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime; varying float vPh;
        vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ float k = 0.5 + 0.5 * sin(vPh * 4.0 - uTime * 3.2); k = pow(k, 3.0);
          vec3 c = mix(vec3(0.16, 0.05, 0.14), hue(fract(vPh / 6.2832 + uTime * 0.05)) * 3.2 + 0.4, k);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const im = new THREE.InstancedMesh(geo, mat, n); const mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; mtx.makeTranslation(cx + Math.cos(a) * R, 0, cz + Math.sin(a) * R); im.setMatrixAt(i, mtx); }
    im.frustumCulled = false; scene.add(im);
    return im;
  }
  function smoothIco(r) {
    const g = new THREE.IcosahedronGeometry(r, 0); const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
    return g;
  }
  function buildBulbs() {
    if (!bulbs.length) return;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: true }), bulbs.length);
    const cols = [new THREE.Color(2.7, 1.65, 0.62), new THREE.Color(2.9, 1.1, 0.3), new THREE.Color(2.6, 0.85, 1.25), new THREE.Color(2.5, 2.15, 1.6)];
    const mtx = new THREE.Matrix4();
    bulbs.forEach((p, i) => { mtx.makeTranslation(p.x, p.y - 0.08, p.z); im.setMatrixAt(i, mtx); im.setColorAt(i, cols[i % 4]); });
    scene.add(im); dyn.bulbs = im; dyn.bulbCols = cols;
  }
  function buildMarigolds() {
    if (!marigolds.length) return;
    const im = new THREE.InstancedMesh(smoothIco(0.085), new THREE.MeshStandardMaterial({ roughness: 0.85, emissive: 0x3a1800 }), marigolds.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
    const cs = [new THREE.Color('#ff9d00'), new THREE.Color('#ffc21a'), new THREE.Color('#ff7a1a'), new THREE.Color('#ffd34d'), new THREE.Color('#e8439a')];
    marigolds.forEach((p, i) => { q.setFromEuler(e.set(Math.random() * 3, Math.random() * 3, 0)); const k = 0.8 + Math.random() * 0.5; s.set(k, k, k); mtx.compose(p, q, s); im.setMatrixAt(i, mtx); im.setColorAt(i, cs[i % 11 === 0 ? 4 : i % 4]); });
    im.castShadow = false; scene.add(im);
  }
  function buildLeaves() {
    if (!leaves.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.06, -0.12, 0, 0, -0.32, 0, 0, 0, 0, 0, -0.32, 0, -0.06, -0.12, 0], 3)); g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), leaves.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    const cs = [new THREE.Color('#2f7a2e'), new THREE.Color('#4a9a38'), new THREE.Color('#3a8a3a'), new THREE.Color('#6aa83a')];
    leaves.forEach(([x, y, z, ry, k], i) => { q.setFromEuler(e.set((Math.random() - 0.5) * 0.3, ry, (Math.random() - 0.5) * 0.25)); s.set(k, k, k); mtx.compose(V(x, y, z), q, s); im.setMatrixAt(i, mtx); im.setColorAt(i, cs[i % 4]); });
    scene.add(im);
  }
  function buildLanterns() {
    if (!lanterns.length) return;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ map: T.lanternTexture(), toneMapped: true }), lanterns.length);
    const cols = [new THREE.Color(2.1, 0.45, 0.34), new THREE.Color(2.2, 1.3, 0.32), new THREE.Color(1.9, 0.48, 1.1), new THREE.Color(0.8, 1.7, 1.5)];
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(0.24, 0.32, 0.24);
    lanterns.forEach(([x, y, z, c], i) => { mtx.compose(V(x, y, z), q, sc); im.setMatrixAt(i, mtx); im.setColorAt(i, cols[Math.abs(c) % 4]); });
    scene.add(im);
  }
  function buildDiyas() {
    if (!diyas.length) return;
    const bowl = new THREE.CylinderGeometry(0.1, 0.055, 0.07, 10); bowl.translate(0, 0.035, 0);
    const bm = new THREE.InstancedMesh(bowl, new THREE.MeshStandardMaterial({ color: 0xb8582e, roughness: 0.8 }), diyas.length);
    const fg = new THREE.SphereGeometry(0.034, 6, 4); fg.scale(1, 1.9, 1); fg.translate(0, 0.115, 0);
    const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.7) });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 5.7;
        float k = 1.0 + 0.22 * sin(uTime * 13.0 + ph) + 0.1 * sin(uTime * 23.0 + ph * 1.7);
        transformed.y = 0.07 + (transformed.y - 0.07) * k;
        transformed.x += sin(uTime * 7.0 + ph) * 0.25 * max(0.0, transformed.y - 0.07);
        #endif`);
    };
    const fl = new THREE.InstancedMesh(fg, fm, diyas.length);
    const mtx = new THREE.Matrix4();
    diyas.forEach(([x, y, z], i) => { mtx.makeTranslation(x, y, z); bm.setMatrixAt(i, mtx); fl.setMatrixAt(i, mtx); });
    bm.receiveShadow = true; fl.frustumCulled = bm.frustumCulled = false;
    scene.add(bm, fl);
  }
  // Mirror-work chips: tiny diamonds that sparkle as if catching the lights.
  function buildMirrors() {
    if (!mirrors.length) return;
    const g = new THREE.PlaneGeometry(0.075, 0.075); g.rotateZ(PI / 4);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime }, side: THREE.DoubleSide,
      vertexShader: 'varying float vPh; void main(){ vPh = instanceMatrix[3].x * 2.7 + instanceMatrix[3].z * 4.1 + instanceMatrix[3].y * 9.3; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying float vPh; void main(){ float s = pow(0.5 + 0.5 * sin(uTime * 2.3 + vPh), 10.0); vec3 c = vec3(0.75, 0.8, 0.95) + vec3(3.2, 3.0, 2.6) * s; gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const im = new THREE.InstancedMesh(g, mat, mirrors.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    mirrors.forEach(([x, y, z, k], i) => { q.setFromEuler(e.set(0, k * 1.7, 0)); mtx.compose(V(x, y, z), q, s); im.setMatrixAt(i, mtx); });
    scene.add(im);
  }
  function buildBalloons() {
    if (!balloons.length) return;
    const g = new THREE.SphereGeometry(0.22, 10, 8); g.scale(1, 1.2, 1);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1, emissive: 0x220011 }), balloons.length);
    const cs = ['#ff4f7a', '#ffc21a', '#1f9e8f', '#ff8a1a', '#6a5acd', '#ff5fd2', '#3f8f3a'].map((c) => new THREE.Color(c));
    const mtx = new THREE.Matrix4();
    balloons.forEach(([x, y, z], i) => { mtx.makeTranslation(x, y, z); im.setMatrixAt(i, mtx); im.setColorAt(i, cs[i % cs.length]); wires.push([V(x, y - 0.25, z), V(BAL[0], 3.4, BAL[1])]); });
    scene.add(im);
  }
  function buildCones() {
    if (!coneGeos.length) return;
    const m = new THREE.Mesh(mergeGeometries(coneGeos), new THREE.ShaderMaterial({
      vertexShader: 'attribute vec3 spotCol; varying vec3 vC; varying float vV; varying vec3 vN; varying vec3 vVP; void main(){ vC = spotCol; vV = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vVP = mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vV; varying vec3 vN; varying vec3 vVP; void main(){ float f = abs(dot(normalize(vN), normalize(-vVP))); float a = (0.2 + 0.8 * pow(vV, 1.5)) * pow(f, 1.8) * 0.5; gl_FragColor = vec4(vC * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.renderOrder = 3; m.matrixAutoUpdate = false; m.raycast = () => {}; scene.add(m);
  }
  function buildWires() {
    const pos = [];
    for (const pts of wires) for (let i = 0; i < pts.length - 1; i++) pos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1410 })));
  }
  function buildBunting() {
    if (!flagPos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flagPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(flagCol, 3)); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }); patch(mat, 0);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m);
  }
}

// Fountain water: ripples from the lotus, drifting caustics, foam at the rim.
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Vector2(0, 21) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec2 uC; varying vec3 vP;
      void main(){
        vec2 d = vP.xz - uC; float r = length(d); float R = 2.0; float t = uTime;
        vec2 q = vP.xz * 2.4;
        float c = sin(q.x * 1.6 + t * 1.2 + sin(q.y * 1.3 + t * 0.8) * 1.4) + sin(q.y * 1.8 - t * 1.0 + sin(q.x * 1.2 - t * 0.6) * 1.4);
        c = smoothstep(0.9, 1.9, abs(c));
        float ring = smoothstep(0.55, 1.0, sin(r * 10.0 - t * 3.2)) * (1.0 - smoothstep(0.5, R, r)) * 0.8;
        vec3 col = mix(vec3(0.02, 0.16, 0.24), vec3(0.08, 0.45, 0.52), 0.35 + 0.45 * smoothstep(0.0, R, r));
        col += vec3(0.35, 0.75, 0.7) * c * 0.35 + vec3(0.8, 0.85, 0.7) * ring * 0.35;
        col = mix(col, vec3(0.95, 0.9, 0.82), smoothstep(R - 0.2, R - 0.02, r) * 0.6);
        float glint = pow(max(0.0, sin(q.x * 3.1 + t * 2.0) * sin(q.y * 2.7 - t * 1.7)), 24.0);
        col += vec3(1.0, 0.75, 0.45) * glint * 1.2;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Night sky dome: indigo zenith, violet band, warm dusk glow in the west, festival glow on the horizon,
// a big moon with craters and halo, twinkling stars. Rendered just after the game's own sky so it covers it.
function nightSky(moonDir, uTime) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMoon: { value: moonDir.clone() }, uTime },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 uMoon; uniform float uTime; varying vec3 vD;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        float a = fract(sin(dot(i, vec2(12.9898,78.233)))*43758.5453), b = fract(sin(dot(i+vec2(1,0), vec2(12.9898,78.233)))*43758.5453);
        float c = fract(sin(dot(i+vec2(0,1), vec2(12.9898,78.233)))*43758.5453), d = fract(sin(dot(i+vec2(1,1), vec2(12.9898,78.233)))*43758.5453);
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec2 hz = normalize(d.xz + 1e-5);
        float west = pow(0.5 + 0.5 * dot(hz, normalize(vec2(-0.85, 0.35))), 2.2);
        vec3 top = vec3(0.006, 0.007, 0.032), mid = vec3(0.04, 0.024, 0.1);
        vec3 hor = mix(vec3(0.26, 0.12, 0.30), vec3(0.95, 0.40, 0.26), west);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.2 + 0.1 * west, h));
        c = mix(c, top, smoothstep(0.18, 0.75, h));
        c = mix(c, vec3(0.06, 0.035, 0.08), smoothstep(0.0, -0.2, h));
        c += vec3(0.45, 0.2, 0.1) * exp(-max(h, 0.0) * 14.0) * 0.35; // festival glow
        // streaky violet clouds
        float band = n2(vec2(atan(d.z, d.x) * 6.0, h * 22.0) + vec2(uTime * 0.01, 0.0)) * n2(vec2(atan(d.z, d.x) * 2.0, h * 7.0));
        c = mix(c, vec3(0.34, 0.2, 0.42) + vec3(0.4, 0.2, 0.1) * west, smoothstep(0.35, 0.75, band) * smoothstep(0.04, 0.14, h) * (1.0 - smoothstep(0.32, 0.55, h)) * 0.45);
        // stars
        vec3 sp = d * 220.0; vec3 ip = floor(sp); float sh = h3(ip);
        if (sh > 0.965) { vec3 o = vec3(h3(ip + 1.3), h3(ip + 2.7), h3(ip + 4.1)) * 0.6 + 0.2; float dd = length(fract(sp) - o);
          float tw = 0.6 + 0.4 * sin(uTime * (1.5 + sh * 4.0) + sh * 60.0);
          c += vec3(0.9, 0.9, 1.0) * smoothstep(0.12, 0.0, dd) * tw * smoothstep(0.06, 0.3, h) * (sh - 0.965) * 50.0; }
        // moon
        float md = dot(d, uMoon); float rad = 0.068; float cr = cos(rad);
        vec3 tx = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0))), ty = cross(tx, uMoon);
        vec2 mp = vec2(dot(d, tx), dot(d, ty)) / rad;
        float disc = smoothstep(cr - 0.00012, cr + 0.00012, md);
        float crater = n2(mp * 3.0 + 4.0) * 0.6 + n2(mp * 7.0) * 0.4;
        float shade = 0.82 + 0.18 * smoothstep(0.3, 0.7, crater) - 0.25 * smoothstep(0.55, 0.85, n2(mp * 2.2 + 1.0)) - 0.15 * dot(mp, mp);
        vec3 moon = vec3(1.55, 1.45, 1.2) * shade;
        c = mix(c, moon, disc);
        c += vec3(0.55, 0.55, 0.75) * pow(max(md, 0.0), 900.0) * 0.6 * (1.0 - disc) + vec3(0.25, 0.22, 0.4) * pow(max(md, 0.0), 40.0) * 0.25;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(430, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -0.5; m.raycast = () => {};
  return m;
}
