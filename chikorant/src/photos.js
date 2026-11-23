// Shared helpers for real photos inside the 3D world (framed photos, logos).
// Every loader degrades gracefully: a missing file shows a styled placeholder.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();

function placeholderCanvas(caption, w = 512, h = 640) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#FF4655'); g.addColorStop(1, '#0F1923');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(236,232,225,0.9)'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `${w * 0.16}px "Bebas Neue", Impact, sans-serif`; x.fillText('PHOTO', w / 2, h * 0.42);
  x.font = `700 ${w * 0.05}px Inter, sans-serif`; x.fillText('COMING SOON', w / 2, h * 0.55);
  if (caption) { x.font = `${w * 0.07}px "Bebas Neue", Impact, sans-serif`; x.fillText(caption.slice(0, 26), w / 2, h * 0.75); }
  return c;
}

// Loads an image texture; calls onReady(texture, aspect) once (real image or placeholder).
export function loadPhoto(url, onReady, caption = '') {
  if (cache.has(url)) { const v = cache.get(url); if (v.tex) onReady(v.tex, v.aspect); else v.wait.push(onReady); return; }
  const entry = { tex: null, aspect: 1, wait: [onReady] }; cache.set(url, entry);
  const done = (tex, aspect) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; entry.tex = tex; entry.aspect = aspect; entry.wait.forEach((f) => f(tex, aspect)); entry.wait = []; };
  loader.load(url, (t) => done(t, t.image.width / t.image.height), undefined, () => { const c = placeholderCanvas(caption); done(new THREE.CanvasTexture(c), c.width / c.height); });
}

// Cover-fit a texture into a w×h plane.
function coverFit(tex, aspect, w, h) {
  const target = w / h; tex = tex.clone(); tex.needsUpdate = true;
  if (aspect > target) { tex.repeat.set(target / aspect, 1); tex.offset.set((1 - target / aspect) / 2, 0); }
  else { tex.repeat.set(1, aspect / target); tex.offset.set(0, (1 - aspect / target) / 2); }
  return tex;
}

function captionTexture(text, color = '#0F1923', bg = '#ECE8E1') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 96);
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '46px "Bebas Neue", Impact, sans-serif'; x.fillText(text, 256, 52, 490);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// A framed photo, front facing +Z in local space. Place it with group.position / rotation.y.
// opts: w, h (photo area, metres), frame (hex), caption, depth, glow (emissive boost for night maps)
export function photoFrame(url, { w = 1.2, h = 1.5, frame = 0x1a2530, caption = '', depth = 0.06, glow = 0 } = {}) {
  const g = new THREE.Group();
  const b = 0.08;
  const fm = new THREE.MeshStandardMaterial({ color: frame, roughness: 0.5, metalness: 0.2 });
  const fr = new THREE.Mesh(new THREE.BoxGeometry(w + b * 2, h + b * 2 + (caption ? 0.26 : 0), depth), fm);
  fr.position.y = caption ? -0.13 : 0; fr.castShadow = true; fr.receiveShadow = true; g.add(fr);
  const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: glow });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pm); photo.position.z = depth / 2 + 0.002; g.add(photo);
  loadPhoto(url, (tex, aspect) => { const t = coverFit(tex, aspect, w, h); pm.map = t; if (glow) pm.emissiveMap = t; pm.needsUpdate = true; }, caption);
  if (caption) {
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.2), new THREE.MeshStandardMaterial({ map: captionTexture(caption), roughness: 0.8, emissive: 0xffffff, emissiveIntensity: glow * 0.5 }));
    cm.position.set(0, -h / 2 - 0.15, depth / 2 + 0.002); g.add(cm);
  }
  g.userData.noOutline = true;
  return g;
}

// A logo plane (transparent PNG). Falls back to a text logo if the file is missing.
export function logoPlane(url, { w = 3, h = 1, fallbackText = 'ZYOIN', color = '#FF4655', emissive = 0.4 } = {}) {
  const m = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: emissive, alphaTest: 0.05 });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  loader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; const a = t.image.width / t.image.height;
    if (a > w / h) p.scale.y = (w / a) / h; else p.scale.x = (h * a) / w;
    m.map = t; m.emissiveMap = t; m.needsUpdate = true;
  }, undefined, () => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w); const x = c.getContext('2d');
    x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${c.height * 0.8}px "Bebas Neue", Impact, sans-serif`; x.fillText(fallbackText, c.width / 2, c.height * 0.55, c.width * 0.95);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.emissiveMap = t; m.needsUpdate = true;
  });
  return p;
}
