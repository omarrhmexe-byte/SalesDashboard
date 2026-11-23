// ─────────────────────────────────────────────────────────────────────────────
//  CHIKORANT · map registry
//
//  Every playable map is one builder function. The map-select screen lists `MAPS` from
//  src/config.js; each entry's `id` must have a builder here. ZYOIN HQ is bundled with the
//  game. Every other map is loaded on demand (its own chunk) through import.meta.glob, so the
//  build still works while a map file doesn't exist yet: its card just shows "COMING SOON".
//
//  ── MAP INTERFACE CONTRACT ──────────────────────────────────────────────────
//
//  export function buildXxxMap(root, { quality }) → map
//
//    root     THREE.Group owned by the game. Add EVERYTHING you create to it (treat it like the
//             scene: builder.flush(root), root.add(mesh)). Switching maps removes the group and
//             disposes every geometry, material and texture under it, so don't share GPU
//             resources with things outside the map (bots, cake, fx).
//    quality  'high' | 'low'. Set castShadow/receiveShadow regardless: they cost nothing while the
//             shadow map is off, and the player can switch to HIGH mid-game.
//    Collision: register solids only with physics.addSolid() or builder.box(..., { collide }).
//             The game calls physics.resetSolids() before each build. Must be synchronous.
//    Bounds:  playable space must fit inside x ∈ [-45, 45], z ∈ [-35, 35] (the game clamps the
//             player to that box and the minimap is drawn for it). North is -Z.
//
//  Returned object (same shape as ZYOIN HQ):
//    spawnPoint  THREE.Vector3  player feet at round start; the player faces -Z (yaw 0).
//    nodes       { id: [x, z] }  nav waypoints at ground level.
//    edges       [[idA, idB], …] bots walk these as straight lines: every edge must be clear of
//                collision (≥ 0.5 m either side) and the graph must be connected. Every post
//                and the plant zone must have line of sight to at least one node.
//    posts       { [key]: [x, z] }  bot spawn spots. ALL of these keys are used by game.js:
//                  aLane aMain aSite aPlat aCrate   (A side; aSite/aPlat guard the plant zone)
//                  mid mid2 backHall backHall2      (middle)
//                  bLane bMain bStage bBoard bSite  (B side)
//                Bots snap onto the highest surface ≤ 1.5 m (so a post may sit on a low stage).
//    meshes      Mesh[]  builder.flush() output (informational).
//    M           { name: Material }  the map's material set (informational).
//    dyn         objects game.js animates or reads every frame (game.js: startRound,
//                dropBarrier, animateWorld, inPlantZone, plantCake, rescueCat):
//      barrier       Mesh   spawn wall. ShaderMaterial with uniforms { uTime, uA }; centred at
//                           y = 2.5 (it drops to y = -2.7 when the round goes live).
//      barrierSolid  solid  addSolid(..., 'barrier'); toggled with .on.
//      plantCenter   Vector3  final-round cake zone ("A SITE" in the HUD text; the minimap
//                           circle is drawn at x -27, z -27, so keep it there).
//      plantRadius   number  metres (4.5 on ZYOIN HQ). Planting needs feet below y 0.6.
//      plantRing     Mesh   ground ring, material.transparent with .opacity (pulsed).
//      plantBeacon   Object3D  light beam above the zone (toggled visible).
//      catHit        Vector3  cat-rescue trigger: player within 1.6 m (xz) and feet above y 3.
//      cat           Group | null  userData.tail and userData.head get idle rotations.
//      fountain      Vector3  water-spray particles are emitted here every frame. A map without
//                           a fountain must still provide one (e.g. new Vector3(0, -50, 0)).
//      clouds        Object3D[]  orbiting sky sprites; userData { a, d, sp }. May be [].
//      signs         Mesh[]  neon signs; signs[3] (if present) flickers via material.opacity.
//      bulbs         InstancedMesh | undefined  string-light twinkle (needs instanceColor).
//      bulbCols      Color[4]  base bulb colours (required when bulbs is set).
//
//  Optional extras (read by the game when present):
//    env      { fog: { color, near, far } | null, exposure, sky: bool, sun, hemi, fill, rim,
//               background }  per-map lighting. sun/hemi/fill/rim scale the default light
//               intensities (1 = golden hour). Omit for the default golden-hour look.
//               Setting root.fog / root.background in the builder works too.
//    preview  { pos: [x, y, z], look: [x, y, z] }  camera pose for the map-select snapshot
//               (defaults to the menu camera's view from spawn toward mid).
//    labels   [{ text, x, z, size, color }]  minimap labels (defaults to A / B / MID).
// ─────────────────────────────────────────────────────────────────────────────
import { Vector3 } from 'three';
import { buildZyoinMap } from './zyoin.js';
import { MAPS } from '../config.js';

// Lazily loaded map modules (every map file except the bundled one and this index).
const lazy = import.meta.glob(['./*.js', '!./index.js', '!./zyoin.js']);
const lazyBuilder = (file, exportName) => async () => {
  const load = lazy[file];
  if (!load) throw new Error(`map module ${file} is not in this build`);
  const fn = (await load())[exportName];
  if (typeof fn !== 'function') throw new Error(`${file} does not export ${exportName}()`);
  return fn;
};

// id → async () => builder function
export const MAP_BUILDERS = {
  zyoin: async () => buildZyoinMap,
  garba: lazyBuilder('./garba.js', 'buildGarbaMap'),
};

export const DEFAULT_MAP = 'zyoin';
export { buildZyoinMap };

export function mapInfo(id) { return MAPS.find((m) => m.id === id) || MAPS[0]; }

// Resolves a builder, or null if the map can't be loaded (missing file, syntax error…).
const resolved = new Map();
export async function getMapBuilder(id) {
  if (resolved.has(id)) return resolved.get(id);
  let fn = null;
  try { if (MAP_BUILDERS[id]) fn = await MAP_BUILDERS[id](); } catch (e) { console.warn(`[maps] ${id} unavailable:`, e.message); }
  resolved.set(id, fn);
  return fn;
}

export const POST_KEYS = ['aLane', 'aMain', 'aSite', 'aPlat', 'aCrate', 'mid', 'mid2', 'backHall', 'backHall2', 'bLane', 'bMain', 'bStage', 'bBoard', 'bSite'];
const REQUIRED_DYN = ['barrier', 'barrierSolid', 'plantCenter', 'plantRadius', 'plantRing', 'plantBeacon'];

// Checks a built map against the contract. Fatal problems (the game can't run a round without
// them) are returned; cosmetic gaps are patched with harmless defaults and logged instead.
export function normalizeMap(m, id = '?') {
  if (!m || typeof m !== 'object') return ['builder returned nothing'];
  const fatal = [], patched = [];
  if (!m.spawnPoint || !m.spawnPoint.isVector3) fatal.push('spawnPoint');
  if (!m.nodes || !m.edges || !Object.keys(m.nodes).length) fatal.push('nodes/edges');
  else for (const [a, b] of m.edges) if (!m.nodes[a] || !m.nodes[b]) fatal.push(`edge ${a}-${b}`);
  const d = m.dyn || (m.dyn = {});
  for (const k of REQUIRED_DYN) if (d[k] === undefined || d[k] === null) fatal.push(`dyn.${k}`);
  if (fatal.length) return fatal;
  const posts = m.posts || (m.posts = {}); const have = Object.keys(posts);
  const nodeIds = Object.keys(m.nodes);
  for (const k of POST_KEYS) if (!posts[k]) { posts[k] = have.length ? posts[have[POST_KEYS.indexOf(k) % have.length]] : m.nodes[nodeIds[POST_KEYS.indexOf(k) % nodeIds.length]]; patched.push(`posts.${k}`); }
  const far = () => new Vector3(0, -60, 0); // out of reach, below the floor
  if (!d.fountain) { d.fountain = far(); patched.push('dyn.fountain'); }
  if (!d.catHit) { d.catHit = far(); patched.push('dyn.catHit'); }
  if (!Array.isArray(d.clouds)) { d.clouds = []; patched.push('dyn.clouds'); }
  if (!Array.isArray(d.signs)) { d.signs = []; patched.push('dyn.signs'); }
  if (d.bulbs && (!d.bulbs.instanceColor || !d.bulbCols)) { d.bulbs = null; patched.push('dyn.bulbs'); }
  if (patched.length) console.warn(`[maps] ${id}: filled in ${patched.join(', ')}`);
  return [];
}
