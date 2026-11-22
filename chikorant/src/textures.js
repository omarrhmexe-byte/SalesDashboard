// Procedural canvas textures: painterly surfaces, signs, decals, labels.
import * as THREE from 'three';

export const PAL = {
  navy: '#0F1923', red: '#FF4655', cream: '#ECE8E1', marigold: '#FFC21A',
  teal: '#2F8F88', stucco: '#E8D9C0', terracotta: '#C8643B',
};
const DISPLAY = '"Bebas Neue", "Anton", Impact, "Arial Narrow", sans-serif';
const SANS = 'Inter, system-ui, sans-serif';
let maxAniso = 4;
export function setAniso(a) { maxAniso = a; }

function mixWhite(hex, k) { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k)); return `rgb(${c.join(',')})`; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
// seeded rng so textures are stable
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Painterly blotchy surface: base colour + soft tonal dabs + a few fine specks. Tileable via wrap-draw.
function painterly(ctx, w, h, base, { dabs = 240, dabSize = [20, 90], var: v = 0.06, specks = 600, seed = 1, warm = true } = {}) {
  const r = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const draw = (fn) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); } };
  for (let i = 0; i < dabs; i++) {
    const x = r() * w, y = r() * h, s = dabSize[0] + r() * (dabSize[1] - dabSize[0]);
    const light = r() > 0.42;
    const a = r() * v;
    const col = light ? (warm ? `rgba(255,248,230,${a})` : `rgba(255,255,255,${a})`) : (warm ? `rgba(90,50,20,${a})` : `rgba(0,10,20,${a})`);
    draw(() => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, s, s * (0.5 + r() * 0.6), r() * 3, 0, 6.3); ctx.fill();
    });
  }
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

const cache = {};
export function surface(name) {
  if (cache[name]) return cache[name];
  const S = 512; const [c, x] = canvas(S, S);
  switch (name) {
    case 'stucco': painterly(x, S, S, '#f2e2c6', { dabs: 260, var: 0.05, seed: 3 }); break;
    case 'plaster': painterly(x, S, S, '#f6efe2', { dabs: 200, var: 0.04, seed: 5 }); break;
    case 'terracotta': painterly(x, S, S, '#d47a50', { dabs: 260, var: 0.12, seed: 7 }); break;
    case 'teal': painterly(x, S, S, '#3a9b93', { dabs: 160, var: 0.08, seed: 9, warm: false }); break;
    case 'navy': painterly(x, S, S, '#22354a', { dabs: 160, var: 0.08, seed: 11, warm: false }); break;
    case 'metal': painterly(x, S, S, '#9aa3ab', { dabs: 120, var: 0.08, seed: 13, warm: false }); break;
    case 'tile': { // courtyard terracotta tiles
      painterly(x, S, S, '#c98a62', { dabs: 120, var: 0.08, seed: 21 });
      const n = 4, s = S / n; const r = rng(4);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const k = 0.88 + r() * 0.2;
        x.fillStyle = `rgba(${Math.floor(200 * k)},${Math.floor(128 * k)},${Math.floor(88 * k)},0.55)`;
        x.fillRect(i * s + 4, j * s + 4, s - 8, s - 8);
      }
      x.strokeStyle = 'rgba(236,224,200,0.85)'; x.lineWidth = 6;
      for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, S); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(S, i * s); x.stroke(); }
      // little star inlays (Mediterranean)
      x.fillStyle = 'rgba(47,143,136,0.75)';
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { x.save(); x.translate(i * s, j * s); x.rotate(Math.PI / 4); x.fillRect(-9, -9, 18, 18); x.restore(); }
      break;
    }
    case 'stone': { // pale flagstones
      painterly(x, S, S, '#e6d6bb', { dabs: 200, var: 0.05, seed: 31 });
      x.strokeStyle = 'rgba(120,100,80,0.35)'; x.lineWidth = 3;
      const r = rng(8); const rows = 4; const rh = S / rows;
      for (let j = 0; j < rows; j++) {
        x.beginPath(); x.moveTo(0, j * rh); x.lineTo(S, j * rh); x.stroke();
        let px = (j % 2) * 70;
        while (px < S + 100) { const w = 90 + r() * 90; x.beginPath(); x.moveTo(px, j * rh); x.lineTo(px, (j + 1) * rh); x.stroke(); px += w; }
      }
      break;
    }
    case 'cobble': {
      painterly(x, S, S, '#d8c3a2', { dabs: 160, var: 0.06, seed: 41 });
      const r = rng(12);
      for (let i = 0; i < 260; i++) {
        const cx = r() * S, cy = r() * S, rr = 10 + r() * 16;
        x.fillStyle = `rgba(${150 + r() * 60},${130 + r() * 50},${105 + r() * 40},0.35)`;
        x.beginPath(); x.ellipse(cx, cy, rr, rr * 0.8, r() * 3, 0, 6.3); x.fill();
        x.strokeStyle = 'rgba(90,70,50,0.18)'; x.lineWidth = 2; x.stroke();
      }
      break;
    }
    case 'wood': {
      painterly(x, S, S, '#b07a4a', { dabs: 80, var: 0.08, seed: 51 });
      const r = rng(14);
      for (let i = 0; i < 8; i++) {
        x.fillStyle = `rgba(${120 + r() * 50},${70 + r() * 30},${30 + r() * 20},0.35)`; x.fillRect(0, i * 64, S, 62);
        x.fillStyle = 'rgba(60,30,10,0.45)'; x.fillRect(0, i * 64 + 62, S, 2);
        for (let k = 0; k < 14; k++) { x.strokeStyle = 'rgba(80,40,10,0.12)'; x.lineWidth = 1.5; x.beginPath(); const y = i * 64 + r() * 60; x.moveTo(0, y); x.bezierCurveTo(S * 0.3, y + r() * 8 - 4, S * 0.6, y + r() * 8 - 4, S, y); x.stroke(); }
      }
      break;
    }
    case 'crate': {
      x.fillStyle = '#b8834f'; x.fillRect(0, 0, S, S);
      painterly(x, S, S, '#b8834f', { dabs: 80, var: 0.1, seed: 61 });
      for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(70,35,10,0.35)'; x.fillRect(0, i * 102, S, 3); }
      x.strokeStyle = '#7c4f2a'; x.lineWidth = 34; x.strokeRect(17, 17, S - 34, S - 34);
      x.beginPath(); x.moveTo(30, 30); x.lineTo(S - 30, S - 30); x.stroke();
      x.fillStyle = 'rgba(15,25,35,0.6)'; x.font = `70px ${DISPLAY}`; x.textAlign = 'center'; x.fillText('ZYOIN', S / 2 + 60, S / 2 + 110);
      break;
    }
    case 'checker': { // pantry floor
      const n = 8, s = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? '#ebe2d0' : '#5f9e96'; x.fillRect(i * s, j * s, s, s); }
      painterly(x, S, S, 'rgba(0,0,0,0)', { dabs: 200, var: 0.06, seed: 71, specks: 300 });
      break;
    }
    case 'carpet': { // summit hall
      painterly(x, S, S, '#33465c', { dabs: 140, var: 0.06, seed: 81, warm: false, specks: 2000 });
      x.strokeStyle = 'rgba(255,70,85,0.25)'; x.lineWidth = 6;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 128 + 64); x.lineTo(S, i * 128 + 64); x.stroke(); }
      x.fillStyle = 'rgba(255,194,26,0.18)';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.save(); x.translate(i * 128 + 64, j * 128); x.rotate(Math.PI / 4); x.fillRect(-10, -10, 20, 20); x.restore(); }
      break;
    }
    case 'stage': { painterly(x, S, S, '#1d2733', { dabs: 80, var: 0.06, seed: 91, warm: false }); x.fillStyle = 'rgba(0,0,0,0.4)'; for (let i = 0; i < 8; i++) x.fillRect(0, i * 64, S, 2); break; }
    case 'foliage': painterly(x, S, S, '#5f9a4a', { dabs: 400, var: 0.18, seed: 101, dabSize: [8, 40] }); break;
    case 'bark': { painterly(x, S, S, '#7a5236', { dabs: 120, var: 0.12, seed: 111 }); x.strokeStyle = 'rgba(40,20,10,0.3)'; for (let i = 0; i < 40; i++) { x.lineWidth = 2; x.beginPath(); const px = (i * 37) % S; x.moveTo(px, 0); x.lineTo(px + 20, S); x.stroke(); } break; }
    case 'water': { painterly(x, S, S, '#4fb8b0', { dabs: 200, var: 0.2, seed: 121, warm: false }); break; }
    default: painterly(x, S, S, '#cccccc', {});
  }
  const t = tex(c); cache[name] = t; return t;
}

// ── signage ─────────────────────────────────────────────────────────────────
// Neon tube text: transparent bg, coloured core with glow. Used with HDR colour multiplier for bloom.
export function neonTexture(text, color = PAL.red, { w = 1024, h = 256, font = DISPLAY, size = 170, sub = null, subColor = null } = {}) {
  const [c, x] = canvas(w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const cy = sub ? h * 0.42 : h / 2;
  x.font = `${size}px ${font}`;
  const draw = (blur, col, lw) => { x.shadowColor = col; x.shadowBlur = blur; x.strokeStyle = col; x.lineWidth = lw; x.strokeText(text, w / 2, cy); };
  draw(40, color, 10); draw(18, color, 6);
  x.shadowBlur = 8; x.fillStyle = mixWhite(color, 0.55); x.fillText(text, w / 2, cy);
  x.shadowBlur = 0; x.lineWidth = 3; x.strokeStyle = color; x.strokeText(text, w / 2, cy);
  if (sub) { x.font = `600 ${size * 0.26}px ${SANS}`; x.shadowBlur = 14; x.shadowColor = subColor || color; x.fillStyle = subColor || color; x.fillText(sub, w / 2, h * 0.84); }
  return tex(c, { repeat: false });
}

export function bannerTexture(text, { w = 1024, h = 512, bg = PAL.red, fg = PAL.cream, sub = '', accent = PAL.navy } = {}) {
  const [c, x] = canvas(w, h);
  painterly(x, w, h, bg, { dabs: 120, var: 0.1, seed: 5 });
  x.fillStyle = accent; x.fillRect(0, h - 60, w, 60); x.fillRect(0, 0, w, 16);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `${h * 0.48}px ${DISPLAY}`; x.fillText(text, w / 2, h * 0.43);
  if (sub) { x.font = `700 ${h * 0.065}px ${SANS}`; x.fillStyle = PAL.cream; x.fillText(sub.split('').join(' '), w / 2, h - 30); }
  // tassel triangles
  x.fillStyle = PAL.marigold; for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(i * w / 16, 16); x.lineTo((i + 0.5) * w / 16, 40); x.lineTo((i + 1) * w / 16, 16); x.fill(); }
  return tex(c, { repeat: false });
}

// Big painted site letter on the floor, worn.
export function floorLetter(letter, color = PAL.cream) {
  const S = 512; const [c, x] = canvas(S, S);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.strokeStyle = color; x.lineWidth = 22; x.globalAlpha = 0.85;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 20, 0, 6.3); x.stroke();
  x.font = `${S * 0.72}px ${DISPLAY}`; x.fillStyle = color; x.fillText(letter, S / 2, S / 2 + 20);
  // wear
  x.globalCompositeOperation = 'destination-out'; const r = rng(letter.charCodeAt(0));
  for (let i = 0; i < 900; i++) { x.globalAlpha = r() * 0.5; x.beginPath(); x.arc(r() * S, r() * S, r() * 7, 0, 6.3); x.fill(); }
  return tex(c, { repeat: false });
}

export function sponsorTexture(name, tag, bg, fg) {
  const [c, x] = canvas(512, 384);
  x.fillStyle = bg; x.fillRect(0, 0, 512, 384);
  painterly(x, 512, 384, 'rgba(0,0,0,0)', { dabs: 60, var: 0.06, seed: name.length });
  x.fillStyle = fg; x.fillRect(30, 30, 60, 60);
  x.fillStyle = bg; x.beginPath(); x.arc(60, 60, 18, 0, 6.3); x.fill();
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `118px ${DISPLAY}`; x.fillText(name, 256, 190, 470);
  x.font = `700 22px ${SANS}`; x.globalAlpha = 0.8; x.fillText(tag.toUpperCase().split('').join(' '), 256, 280, 470);
  x.globalAlpha = 1; x.fillRect(0, 354, 512, 30);
  x.fillStyle = bg; x.font = `700 15px ${SANS}`; x.fillText('GCC SUMMIT · OFFICIAL PARTNER', 256, 370);
  return tex(c, { repeat: false });
}

export function posterTexture(lines, bg, fg) {
  const [c, x] = canvas(384, 512);
  painterly(x, 384, 512, bg, { dabs: 80, var: 0.1, seed: 9 });
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => { x.font = `${i === 0 ? 120 : 46}px ${DISPLAY}`; x.fillText(l, 192, 130 + i * (i === 0 ? 0 : 1) * 70 + (i ? 90 : 0), 340); });
  return tex(c, { repeat: false });
}

export function stripeTexture(a, b, n = 6) {
  const [c, x] = canvas(256, 256);
  for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect((i * 256) / n, 0, 256 / n + 1, 256); }
  painterly(x, 256, 256, 'rgba(0,0,0,0)', { dabs: 60, var: 0.1, seed: n });
  // scalloped edge
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n * 2; i++) { x.beginPath(); x.arc((i + 0.5) * 256 / (n * 2), 256, 256 / (n * 4), 0, 6.3); x.fill(); }
  return tex(c, { repeat: false });
}

export function decalTexture() {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(10,8,6,0.95)'); g.addColorStop(0.25, 'rgba(25,20,16,0.85)'); g.addColorStop(0.5, 'rgba(40,32,25,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
}

export function flareTexture() {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,230,160,0.9)'); g.addColorStop(0.5, 'rgba(255,150,60,0.25)'); g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,240,200,0.8)';
  for (let i = 0; i < 6; i++) { x.save(); x.translate(64, 64); x.rotate((i / 6) * Math.PI * 2 + 0.3); x.beginPath(); x.moveTo(0, -4); x.lineTo(60, 0); x.lineTo(0, 4); x.fill(); x.restore(); }
  return tex(c, { repeat: false });
}

export function cloudTexture(seed) {
  const [c, x] = canvas(512, 256); const r = rng(seed);
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push([80 + r() * 350, 120 + r() * 50 - (i % 3) * 20, 40 + r() * 60]);
  // shadow side
  x.fillStyle = 'rgba(214,170,170,0.9)';
  blobs.forEach(([bx, by, br]) => { x.beginPath(); x.arc(bx + 6, by + 12, br, 0, 6.3); x.fill(); });
  x.fillStyle = 'rgba(255,240,226,1)';
  blobs.forEach(([bx, by, br]) => { x.beginPath(); x.arc(bx, by, br * 0.92, 0, 6.3); x.fill(); });
  x.fillStyle = 'rgba(255,214,170,0.7)';
  blobs.forEach(([bx, by, br]) => { x.beginPath(); x.arc(bx - br * 0.25, by - br * 0.3, br * 0.5, 0, 6.3); x.fill(); });
  x.globalCompositeOperation = 'destination-in';
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.85, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  return tex(c, { repeat: false });
}

export function nameTagTexture(name, color = PAL.red) {
  const [c, x] = canvas(512, 96);
  x.font = `56px ${DISPLAY}`; const tw = Math.min(480, x.measureText(name).width + 50);
  x.fillStyle = 'rgba(15,25,35,0.75)'; x.fillRect(256 - tw / 2, 14, tw, 66);
  x.fillStyle = color; x.fillRect(256 - tw / 2, 14, 6, 66);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 256 + 3, 50, 460);
  return tex(c, { repeat: false });
}

export function textSprite(text, color = '#fff', size = 64) {
  const [c, x] = canvas(512, 128);
  x.font = `${size}px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = 10; x.fillStyle = color; x.fillText(text, 256, 64);
  return tex(c, { repeat: false });
}

export function hexTexture() {
  const S = 256; const [c, x] = canvas(S, S);
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3;
  const r = 22, hgt = Math.sqrt(3) * r;
  for (let row = -1; row < S / hgt + 1; row++) for (let col = -1; col < S / (r * 1.5) + 1; col++) {
    const cx = col * r * 1.5, cy = row * hgt + (col % 2 ? hgt / 2 : 0);
    x.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.stroke();
  }
  return tex(c, { srgb: false });
}

// Stylised duotone portrait for agent select (navy → red → cream).
export async function duotone(src, stops = ['#0F1923', '#FF4655', '#FFE9C9']) {
  const img = await loadImage(src);
  const w = img.naturalWidth, h = img.naturalHeight;
  const [c, x] = canvas(w, h); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h); const p = d.data;
  const cols = stops.map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
  for (let i = 0; i < p.length; i += 4) {
    let l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
    l = Math.min(1, Math.max(0, (l - 0.08) * 1.25)); l = Math.round(l * 6) / 6 * 0.35 + l * 0.65; // slight posterise
    const t = l * (cols.length - 1); const k = Math.min(cols.length - 2, Math.floor(t)); const f = t - k;
    p[i] = cols[k][0] + (cols[k + 1][0] - cols[k][0]) * f;
    p[i + 1] = cols[k][1] + (cols[k + 1][1] - cols[k][1]) * f;
    p[i + 2] = cols[k][2] + (cols[k + 1][2] - cols[k][2]) * f;
  }
  x.putImageData(d, 0, 0);
  return c.toDataURL('image/jpeg', 0.88);
}
export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
