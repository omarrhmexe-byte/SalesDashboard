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

// Soft directional brush strokes (hand-painted plaster feel). Tileable.
function strokes(ctx, w, h, { n = 120, len = [30, 110], width = [6, 18], a = 0.05, seed = 1, warm = true, angle = 0, spread = 0.5 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, L = len[0] + r() * (len[1] - len[0]), W = width[0] + r() * (width[1] - width[0]);
    const ang = angle + (r() - 0.5) * spread; const light = r() > 0.45; const al = a * (0.4 + r() * 0.6);
    const col = light ? (warm ? `rgba(255,246,222,${al})` : `rgba(235,245,255,${al})`) : (warm ? `rgba(110,60,25,${al})` : `rgba(10,25,40,${al})`);
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(ang);
      const g = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, col); g.addColorStop(0.8, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, L / 2, W / 2, 0, 0, 6.3); ctx.fill(); ctx.restore();
    }
  }
}

const cache = {};
export function surface(name) {
  if (cache[name]) return cache[name];
  const S = 512; const [c, x] = canvas(S, S);
  switch (name) {
    case 'stucco': painterly(x, S, S, '#f0ddbd', { dabs: 240, var: 0.06, seed: 3, dabSize: [30, 120] }); strokes(x, S, S, { n: 160, a: 0.07, seed: 4, spread: 1.2 }); strokes(x, S, S, { n: 60, a: 0.05, seed: 6, len: [80, 200], width: [20, 40], angle: 0.2 }); break;
    case 'plaster': painterly(x, S, S, '#f6efe2', { dabs: 200, var: 0.04, seed: 5 }); strokes(x, S, S, { n: 90, a: 0.05, seed: 8, spread: 1.0 }); break;
    case 'terracotta': painterly(x, S, S, '#d47a50', { dabs: 260, var: 0.12, seed: 7 }); strokes(x, S, S, { n: 80, a: 0.08, seed: 10 }); break;
    case 'rooftile': { // barrel tiles: channels run down the slope (v), courses across (u)
      painterly(x, S, S, '#b9583a', { dabs: 120, var: 0.1, seed: 131 });
      const cols = 8, rows = 6, cw = S / cols, rh = S / rows; const r = rng(17);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const k = 0.85 + r() * 0.3; const ox = (j % 2) * 0; const x0 = i * cw + ox, y0 = j * rh;
        const g = x.createLinearGradient(x0, 0, x0 + cw, 0);
        const c = (m) => `rgb(${Math.min(255, Math.floor(214 * k * m))},${Math.floor(108 * k * m)},${Math.floor(66 * k * m)})`;
        g.addColorStop(0, c(0.55)); g.addColorStop(0.18, c(0.85)); g.addColorStop(0.45, c(1.12)); g.addColorStop(0.75, c(0.95)); g.addColorStop(1, c(0.55));
        x.fillStyle = g; x.beginPath(); x.roundRect(x0 + 2, y0 + 3, cw - 4, rh - 2, [4, 4, 10, 10]); x.fill();
        // lip shadow at the lower end of each course
        const lg = x.createLinearGradient(0, y0 + rh - 14, 0, y0 + rh + 2); lg.addColorStop(0, 'rgba(60,20,8,0)'); lg.addColorStop(1, 'rgba(60,20,8,0.55)');
        x.fillStyle = lg; x.fillRect(x0, y0 + rh - 14, cw, 16);
        if (r() > 0.8) { x.fillStyle = `rgba(90,110,60,${0.12 + r() * 0.12})`; x.beginPath(); x.ellipse(x0 + cw / 2, y0 + rh * 0.3, cw * 0.3, rh * 0.25, 0, 0, 6.3); x.fill(); } // lichen
      }
      x.fillStyle = 'rgba(40,14,6,0.6)'; for (let i = 0; i <= cols; i++) x.fillRect(i * cw - 1.5, 0, 3, S);
      break;
    }
    case 'kerb': { painterly(x, S, S, '#cdb894', { dabs: 120, var: 0.07, seed: 141 }); x.fillStyle = 'rgba(80,60,40,0.35)'; for (let i = 0; i < 8; i++) x.fillRect(i * 64, 0, 3, S); x.fillStyle = 'rgba(255,250,235,0.25)'; x.fillRect(0, 0, S, 10); break; }
    case 'beam': { painterly(x, S, S, '#6e4428', { dabs: 80, var: 0.1, seed: 151 }); const r = rng(19); for (let k = 0; k < 40; k++) { x.strokeStyle = 'rgba(30,14,4,0.25)'; x.lineWidth = 1.5; x.beginPath(); const y = r() * S; x.moveTo(0, y); x.bezierCurveTo(S * 0.3, y + r() * 10 - 5, S * 0.6, y + r() * 10 - 5, S, y); x.stroke(); } break; }
    case 'leaf': painterly(x, S, S, '#4f8a3c', { dabs: 300, var: 0.2, seed: 161, dabSize: [6, 26] }); break;
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

// Woven rug (kilim-style geometric pattern). Not tiled: one rug per texture.
export function rugTexture(seed, { bg = '#B8452F', a = PAL.marigold, b = PAL.navy, c = PAL.cream } = {}) {
  const W = 512, H = 768; const [cv, x] = canvas(W, H); const r = rng(seed);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // borders
  x.fillStyle = b; x.fillRect(18, 18, W - 36, H - 36); x.fillStyle = bg; x.fillRect(44, 44, W - 88, H - 88);
  x.fillStyle = a; for (let i = 0; i < 22; i++) { const y = 30 + i * (H - 60) / 22; x.beginPath(); x.moveTo(31, y); x.lineTo(40, y + 12); x.lineTo(31, y + 24); x.lineTo(22, y + 12); x.fill(); x.beginPath(); x.moveTo(W - 31, y); x.lineTo(W - 22, y + 12); x.lineTo(W - 31, y + 24); x.lineTo(W - 40, y + 12); x.fill(); }
  // central medallions
  const med = (cy, s, c1, c2) => { x.fillStyle = c1; x.beginPath(); x.moveTo(W / 2, cy - s); x.lineTo(W / 2 + s * 0.8, cy); x.lineTo(W / 2, cy + s); x.lineTo(W / 2 - s * 0.8, cy); x.fill(); x.fillStyle = c2; x.beginPath(); x.moveTo(W / 2, cy - s * 0.55); x.lineTo(W / 2 + s * 0.44, cy); x.lineTo(W / 2, cy + s * 0.55); x.lineTo(W / 2 - s * 0.44, cy); x.fill(); x.fillStyle = c1; x.fillRect(W / 2 - s * 0.12, cy - s * 0.12, s * 0.24, s * 0.24); };
  med(H * 0.27, 110, a, b); med(H * 0.5, 130, c, bg); med(H * 0.73, 110, a, b);
  x.fillStyle = c; for (let i = 0; i < 9; i++) { const y = 70 + i * 78; x.fillRect(70, y, 26, 26); x.fillRect(W - 96, y, 26, 26); }
  painterly(x, W, H, 'rgba(0,0,0,0)', { dabs: 160, var: 0.12, seed: seed + 3, specks: 2500 });
  // fringe
  x.fillStyle = c; for (let i = 0; i < 60; i++) { x.fillRect(10 + i * 8.2, 0, 3, 16); x.fillRect(10 + i * 8.2, H - 16, 3, 16); }
  return tex(cv, { repeat: false });
}

// Paper lantern: warm translucent body with ribs and dark caps (used with HDR instance colours).
export function lanternTexture() {
  const [c, x] = canvas(128, 128);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgb(40,20,10)'); g.addColorStop(0.1, 'rgb(40,20,10)'); g.addColorStop(0.16, 'rgb(170,150,130)'); g.addColorStop(0.5, 'rgb(255,255,255)'); g.addColorStop(0.84, 'rgb(170,150,130)'); g.addColorStop(0.9, 'rgb(40,20,10)'); g.addColorStop(1, 'rgb(40,20,10)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(80,40,20,0.35)'; for (let i = 0; i < 8; i++) x.fillRect(i * 16, 0, 2, 128);
  return tex(c, { repeat: true });
}

// Poster atlas: several original office/festival posters on one canvas (one material, one draw call).
export function posterAtlas() {
  const W = 1024, H = 640, cols = 4, rows = 2, pw = W / cols, ph = H / rows;
  const [c, x] = canvas(W, H);
  const list = [
    [['CHAI', '> COFFEE', 'BREAK AT 4'], PAL.marigold, PAL.navy],
    [['GARBA', 'FRIDAY', 'DANDIYA PROVIDED'], PAL.red, PAL.cream],
    [['HYDRATE', 'OR DIE-DRATE', 'HR SAYS HI'], PAL.teal, PAL.cream],
    [['NO', 'MEETINGS', 'WEDNESDAY*'], PAL.cream, PAL.red],
    [['SHIP IT', 'BEFORE', 'THE DEADLINE BOTS'], PAL.navy, PAL.marigold],
    [['LOST CAT', 'ANSWERS TO', 'NOTHING. EVER.'], '#E8D9C0', '#0F1923'],
    [['OOO', 'MODE', 'OUT OF OFFICE'], PAL.terracotta, PAL.cream],
    [['LEVEL', 'UP', 'TOWN HALL · 5PM'], '#5B3A8C', PAL.marigold],
  ];
  list.forEach(([lines, bg, fg], i) => {
    const ox = (i % cols) * pw, oy = Math.floor(i / cols) * ph;
    x.save(); x.translate(ox, oy); x.beginPath(); x.rect(0, 0, pw, ph); x.clip();
    painterly(x, pw, ph, bg, { dabs: 50, var: 0.12, seed: 30 + i, specks: 200 });
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${ph * 0.25}px ${DISPLAY}`; x.fillText(lines[0], pw / 2, ph * 0.26, pw - 24);
    x.font = `${ph * 0.17}px ${DISPLAY}`; x.fillText(lines[1], pw / 2, ph * 0.5, pw - 24);
    x.fillRect(pw * 0.2, ph * 0.65, pw * 0.6, 4);
    x.font = `700 ${ph * 0.055}px ${SANS}`; x.fillText(lines[2], pw / 2, ph * 0.76, pw - 30);
    x.fillStyle = 'rgba(15,25,35,0.85)'; x.fillRect(0, ph - 16, pw, 16);
    // torn corner + tape
    x.fillStyle = 'rgba(236,232,225,0.75)'; x.fillRect(pw / 2 - 22, 0, 44, 14);
    x.restore();
  });
  const t = tex(c, { repeat: false });
  return { tex: t, rect: (i) => [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows, 1 / cols, 1 / rows], count: list.length };
}

// Wall weathering atlas (4×2 cells, alpha): exposed brick patches, drip stains, cracks, damp, plaster repairs.
export function wearAtlas() {
  const C = 256, W = C * 4, H = C * 2; const [c, x] = canvas(W, H); const r = rng(77);
  const blob = (cx, cy, rad, k = 14) => { x.beginPath(); for (let i = 0; i <= k; i++) { const a = (i / k) * Math.PI * 2; const rr = rad * (0.72 + r() * 0.42); i ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75); } x.closePath(); };
  const cell = (i, fn) => { const ox = (i % 4) * C, oy = Math.floor(i / 4) * C; x.save(); x.beginPath(); x.rect(ox, oy, C, C); x.clip(); x.translate(ox, oy); fn(); x.restore(); };
  const brick = (rad) => {
    blob(C / 2, C / 2, rad); x.save(); x.clip();
    x.fillStyle = '#d9b48f'; x.fillRect(0, 0, C, C);
    const bh = 22, bw = 52;
    for (let row = 0; row < C / bh + 1; row++) for (let col = -1; col < C / bw + 1; col++) {
      const k = 0.8 + r() * 0.35; x.fillStyle = `rgb(${Math.floor(190 * k)},${Math.floor(92 * k)},${Math.floor(60 * k)})`;
      x.fillRect(col * bw + (row % 2) * bw / 2 + 2, row * bh + 2, bw - 4, bh - 4);
    }
    x.restore();
    // plaster lip around the hole
    x.strokeStyle = 'rgba(255,246,228,0.9)'; x.lineWidth = 6; blob(C / 2, C / 2, rad * 1.02); x.stroke();
    x.strokeStyle = 'rgba(90,50,30,0.35)'; x.lineWidth = 2; blob(C / 2, C / 2, rad * 0.98); x.stroke();
  };
  cell(0, () => brick(92)); cell(1, () => brick(70));
  cell(2, () => { // drips
    for (let i = 0; i < 14; i++) { const px = 30 + r() * (C - 60), len = 60 + r() * 180, w = 4 + r() * 10; const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(70,45,25,0.62)'); g.addColorStop(1, 'rgba(70,45,25,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(px, len / 2, w / 2, len / 2, 0, 0, 6.3); x.fill(); }
    const g = x.createLinearGradient(0, 0, 0, 40); g.addColorStop(0, 'rgba(60,40,22,0.45)'); g.addColorStop(1, 'rgba(60,40,22,0)'); x.fillStyle = g; x.fillRect(0, 0, C, 40);
  });
  cell(3, () => { // cracks
    x.strokeStyle = 'rgba(50,30,18,0.85)'; x.lineCap = 'round';
    const crack = (px, py, a, len, w) => { if (len < 8 || w < 0.6) return; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len; x.lineTo(nx, ny); x.stroke(); crack(nx, ny, a + (r() - 0.5) * 1.1, len * 0.75, w * 0.8); if (r() > 0.55) crack(nx, ny, a + (r() - 0.5) * 2.2, len * 0.5, w * 0.6); };
    crack(C / 2, 20, Math.PI / 2, 44, 4.5); crack(C / 2, 20, Math.PI / 2 + 0.6, 34, 3.4); crack(C / 2 - 30, 40, Math.PI / 2 - 0.5, 30, 3);
  });
  cell(4, () => { // damp / moss
    for (let i = 0; i < 40; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 40); g.addColorStop(0, `rgba(${80 + r() * 30},${95 + r() * 30},${50 + r() * 20},0.28)`); g.addColorStop(1, 'rgba(80,90,50,0)'); x.save(); x.translate(C / 2 + (r() - 0.5) * 150, C * 0.62 + (r() - 0.5) * 120); x.fillStyle = g; x.fillRect(-80, -80, 160, 160); x.restore(); }
  });
  cell(5, () => { // plaster repair patch
    x.fillStyle = 'rgba(255,248,232,0.85)'; blob(C / 2, C / 2, 90, 9); x.fill();
    x.strokeStyle = 'rgba(120,90,60,0.25)'; x.lineWidth = 3; blob(C / 2, C / 2, 90, 9); x.stroke();
    painterly(x, C, C, 'rgba(0,0,0,0)', { dabs: 30, var: 0.05, seed: 3, specks: 100 });
  });
  cell(6, () => { // soft grime band (bottom)
    const g = x.createLinearGradient(0, C, 0, 0); g.addColorStop(0, 'rgba(70,45,30,0.45)'); g.addColorStop(1, 'rgba(70,45,30,0)'); x.fillStyle = g; x.fillRect(0, 0, C, C);
  });
  cell(7, () => brick(55));
  const t = tex(c, { repeat: false });
  return { tex: t, rect: (i) => [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 2, 1 / 4, 1 / 2] };
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
