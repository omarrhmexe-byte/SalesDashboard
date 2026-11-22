// Static geometry batcher: every static prop is merged per material (few draw calls),
// gets world-scale UVs, baked vertex-colour "AO" darkening toward the floor, and an
// optional inverted-hull outline merged into one dark mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addSolid } from './physics.js';

const batches = new Map(); // material -> geometry[]
const outlineGeos = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export const OUTLINE_COLOR = 0x17110d;

function bake(geo, uvScale, ao) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const pos = geo.attributes.position, nor = geo.attributes.normal; const n = pos.count;
  const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / uvScale; uv[i * 2 + 1] = v / uvScale;
    let c = 1;
    if (ao) { const t = Math.min(1, Math.max(0, y / ao)); c = 0.58 + 0.42 * (t * t * (3 - 2 * t)); if (ay > 0.9 && nor.getY(i) > 0) c = Math.max(c, 0.92); }
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function push(mat, geo) { if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push(geo); }

// Axis-aligned box by min/max corners.
export function box(x0, y0, z0, x1, y1, z1, mat, { collide = true, outline = false, uv = 2.5, ao = 2.4, tag = null, t = 0.035 } = {}) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const g = new THREE.BoxGeometry(w, h, d); g.translate(cx, cy, cz);
  push(mat, bake(g, uv, ao));
  if (outline) { const o = new THREE.BoxGeometry(w + t * 2, h + t * 2, d + t * 2); o.translate(cx, cy, cz); o.deleteAttribute('uv'); outlineGeos.push(o.toNonIndexed()); }
  if (collide) return addSolid(x0, y0, z0, x1, y1, z1, tag);
  return null;
}

// Arbitrary geometry placed with position/rotation/scale (decor; no collision).
export function mesh(geo, mat, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], uv = 2, ao = 0, outline = 0 } = {}) {
  _m.compose(_p.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s));
  const g = geo.clone(); g.applyMatrix4(_m);
  push(mat, bake(g, uv, ao));
  if (outline) {
    const o = geo.clone(); o.deleteAttribute('uv');
    // inflate along normals (smooth shapes) for the inverted hull
    const pos = o.attributes.position, nor = o.attributes.normal;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * outline / s[0], pos.getY(i) + nor.getY(i) * outline / s[1], pos.getZ(i) + nor.getZ(i) * outline / s[2]);
    o.applyMatrix4(_m);
    outlineGeos.push(o.index ? o.toNonIndexed() : o);
  }
}

export function flush(scene, { shadows = true } = {}) {
  const out = [];
  for (const [mat, geos] of batches) {
    const merged = mergeGeometries(geos.map(stripTo(['position', 'normal', 'uv', 'color'])));
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadows && !mat.userData.noShadow; m.receiveShadow = shadows;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m); out.push(m);
  }
  if (outlineGeos.length) {
    const merged = mergeGeometries(outlineGeos.map(stripTo(['position'])));
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
    m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); out.push(m);
  }
  batches.clear(); outlineGeos.length = 0;
  return out;
}
function stripTo(keep) {
  return (g) => {
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (g.index) g = g.toNonIndexed();
    return g;
  };
}

// Outline material for dynamic (skinned-free) meshes: push verts along normals in object space.
export function outlineMaterial(thickness = 0.03, color = OUTLINE_COLOR) {
  return new THREE.ShaderMaterial({
    uniforms: { t: { value: thickness }, c: { value: new THREE.Color(color) }, o: { value: 1 } },
    vertexShader: 'uniform float t; void main(){ vec3 p = position + normal * t; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float o; void main(){ if(o<0.5) discard; gl_FragColor = vec4(c,1.0); }',
    side: THREE.BackSide,
  });
}
// Add inverted-hull children to every mesh in an object.
export function addOutlines(root, mat) {
  const list = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.noOutline) list.push(o); });
  for (const o of list) { const h = new THREE.Mesh(o.geometry, mat); h.userData.noOutline = true; h.raycast = () => {}; o.add(h); }
}
