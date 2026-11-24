// Procedural canvas textures for the GARBA NIGHT map: printed tent fabric (kanat), bandhani and
// leheriya canopies, the rangoli floor of the Garba Circle, stall signboards, the stage backdrop,
// the photo-booth flower wall and a festival poster atlas. Everything is drawn once and cached.
import * as THREE from 'three';

const DISPLAY = '"Bebas Neue", "Anton", Impact, "Arial Narrow", sans-serif';
const SANS = 'Inter, system-ui, sans-serif';

export const GPAL = {
  maroon: '#7d1730', red: '#d6213f', saffron: '#ff8a1a', marigold: '#ffc21a', magenta: '#d81f78',
  pink: '#ff6fae', teal: '#1f9e8f', indigo: '#2b2a6e', green: '#3f8f3a', cream: '#f6e7c8', gold: '#e8b04a', navy: '#0F1923',
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

// Soft tonal dabs, wrapped so the texture tiles.
function dabs(x, w, h, { n = 200, size = [20, 90], a = 0.07, seed = 1, warm = true } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const px = r() * w, py = r() * h, s = size[0] + r() * (size[1] - size[0]); const light = r() > 0.45; const al = r() * a;
    const col = light ? (warm ? `rgba(255,244,220,${al})` : `rgba(235,240,255,${al})`) : (warm ? `rgba(70,30,10,${al})` : `rgba(5,5,30,${al})`);
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, s);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g;
      x.beginPath(); x.ellipse(px + dx, py + dy, s, s * (0.5 + r() * 0.5), r() * 3, 0, 6.3); x.fill();
    }
  }
}
function specks(x, w, h, n, seed, a = 0.08) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { x.fillStyle = r() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}

// ── grounds ────────────────────────────────────────────────────────────────
// Packed festival earth: warm ochre with darker scuffs where people danced, pebbles, petals.
export function earth() {
  return once('earth', () => {
    const S = 512; const [c, x] = canvas(S, S); const r = rng(41);
    x.fillStyle = '#b48d62'; x.fillRect(0, 0, S, S);
    dabs(x, S, S, { n: 260, size: [30, 120], a: 0.13, seed: 42 });
    // scuff arcs (feet turning in circles)
    x.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const cx = r() * S, cy = r() * S, rad = 20 + r() * 70, a0 = r() * 6.3;
      x.strokeStyle = `rgba(80,48,22,${0.05 + r() * 0.07})`; x.lineWidth = 4 + r() * 10;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { x.beginPath(); x.arc(cx + dx, cy + dy, rad, a0, a0 + 0.8 + r() * 1.2); x.stroke(); }
    }
    for (let i = 0; i < 260; i++) { // pebbles
      const px = r() * S, py = r() * S, s = 1.5 + r() * 3.5;
      x.fillStyle = `rgba(60,38,20,${0.25 + r() * 0.2})`; x.beginPath(); x.ellipse(px + 1, py + 1.2, s, s * 0.7, r() * 3, 0, 6.3); x.fill();
      x.fillStyle = `rgba(232,208,170,${0.35 + r() * 0.3})`; x.beginPath(); x.ellipse(px, py, s * 0.8, s * 0.55, r() * 3, 0, 6.3); x.fill();
    }
    const petal = ['#ff9d00', '#ffc21a', '#e8439a', '#ff7a1a'];
    for (let i = 0; i < 40; i++) { x.fillStyle = petal[i % 4]; x.globalAlpha = 0.75; x.beginPath(); x.ellipse(r() * S, r() * S, 3 + r() * 3, 1.6 + r() * 1.5, r() * 3, 0, 6.3); x.fill(); }
    x.globalAlpha = 1;
    specks(x, S, S, 900, 43, 0.07);
    return tex(c);
  });
}

// Striped cotton dhurrie mat (spawn, A-site dance floor). Stripes run along v.
export function durrie() {
  return once('durrie', () => {
    const S = 512; const [c, x] = canvas(S, S);
    const bands = [['#8c1d2c', 70], ['#f2c14e', 14], ['#8c1d2c', 22], ['#1f3c6e', 46], ['#f6e7c8', 10], ['#d6213f', 60], ['#f6e7c8', 10], ['#1f3c6e', 46], ['#8c1d2c', 22], ['#f2c14e', 14], ['#8c1d2c', 70], ['#2f8f88', 32], ['#f6e7c8', 8], ['#2f8f88', 32]];
    const tot = bands.reduce((s, b) => s + b[1], 0); let y = 0;
    for (const [col, h] of bands) { const hh = (h / tot) * S; x.fillStyle = col; x.fillRect(0, y, S, hh + 1); y += hh; }
    // woven diamonds on the red band
    x.fillStyle = '#f2c14e';
    const ry = (((70 + 14 + 22 + 46 + 10) + 30) / tot) * S;
    for (let i = 0; i < 8; i++) { const px = i * 64 + 32; x.beginPath(); x.moveTo(px, ry - 14); x.lineTo(px + 14, ry); x.lineTo(px, ry + 14); x.lineTo(px - 14, ry); x.fill(); }
    // weave grain
    x.globalAlpha = 0.09; for (let i = 0; i < S; i += 3) { x.fillStyle = i % 6 ? '#000' : '#fff'; x.fillRect(i, 0, 1, S); } x.globalAlpha = 1;
    dabs(x, S, S, { n: 90, a: 0.1, seed: 52 });
    return tex(c);
  });
}

// ── printed tent wall fabric ("kanat"): rows of cusped arches with a tree-of-life motif ──────
// Applied with uv = wall height, so v 0..1 spans the wall and each tile holds three arches.
const KANAT = [
  { bg: '#7d1730', field: '#b8233a', line: '#f3d48a', motif: '#ffc21a', leaf: '#3f8f3a', band: '#1f2a5e', dots: '#f6e7c8' },
  { bg: '#232a66', field: '#33408a', line: '#ffb347', motif: '#ff6fae', leaf: '#4fae6a', band: '#7d1730', dots: '#f6e7c8' },
  { bg: '#c8541c', field: '#e2752a', line: '#fff0c4', motif: '#7d1730', leaf: '#2f6f3a', band: '#232a66', dots: '#fff0c4' },
];
export function kanat(v = 0) {
  return once('kanat' + v, () => {
    const W = 1024, H = 1024; const [c, x] = canvas(W, H); const P = KANAT[v];
    x.fillStyle = P.bg; x.fillRect(0, 0, W, H);
    const top = 120, bot = 150; // band heights (canvas top = wall top)
    // bands
    x.fillStyle = P.band; x.fillRect(0, 0, W, top); x.fillRect(0, H - bot, W, bot);
    x.fillStyle = P.line; x.fillRect(0, top - 10, W, 6); x.fillRect(0, H - bot + 4, W, 6); x.fillRect(0, H - 22, W, 5);
    // scallops + triangles in the top band
    for (let i = 0; i < 24; i++) {
      const px = (i + 0.5) * (W / 24);
      x.fillStyle = P.motif; x.beginPath(); x.moveTo(px - 20, top - 12); x.lineTo(px, top - 52); x.lineTo(px + 20, top - 12); x.fill();
      x.fillStyle = P.dots; x.beginPath(); x.arc(px, 30, 7, 0, 6.3); x.fill();
    }
    // zigzag in the bottom band
    x.strokeStyle = P.motif; x.lineWidth = 9; x.beginPath();
    for (let i = 0; i <= 32; i++) x.lineTo(i * (W / 32), H - bot + 40 + (i % 2) * 50);
    x.stroke();
    x.fillStyle = P.dots; for (let i = 0; i < 32; i++) { x.beginPath(); x.arc((i + 0.5) * (W / 32), H - 50, 6, 0, 6.3); x.fill(); }
    // three cusped arches
    const n = 3, aw = W / n;
    for (let k = 0; k < n; k++) {
      const cx = k * aw + aw / 2, l = cx - aw * 0.38, r = cx + aw * 0.38, y0 = H - bot - 26, ys = top + 250;
      const archPath = (inset) => {
        x.beginPath(); x.moveTo(l + inset, y0); x.lineTo(l + inset, ys);
        // cusped (multi-foil) pointed arch
        const lobes = 5; const span = (r - l - inset * 2);
        for (let i = 0; i < lobes; i++) {
          const t0 = i / lobes, t1 = (i + 1) / lobes; const ax = l + inset + span * t0, bx = l + inset + span * t1;
          const peak = (t) => ys - Math.sin(t * Math.PI) * 150 - (1 - Math.abs(t - 0.5) * 2) * 40;
          x.quadraticCurveTo((ax + bx) / 2, peak((t0 + t1) / 2) - 34, bx, peak(t1));
        }
        x.lineTo(r - inset, y0); x.closePath();
      };
      x.fillStyle = P.line; archPath(0); x.fill();
      x.fillStyle = P.field; archPath(12); x.fill();
      // spandrel flowers
      x.fillStyle = P.motif; for (const sx of [k * aw + 22, (k + 1) * aw - 22]) { for (let j = 0; j < 6; j++) { const a = (j / 6) * 6.283; x.beginPath(); x.ellipse(sx + Math.cos(a) * 14, top + 70 + Math.sin(a) * 14, 10, 6, a, 0, 6.3); x.fill(); } }
      // tree of life: vase + stem + leaves + flowers
      const by = y0 - 40;
      x.fillStyle = P.motif; x.beginPath(); x.moveTo(cx - 55, by); x.quadraticCurveTo(cx - 70, by - 80, cx - 25, by - 100); x.lineTo(cx + 25, by - 100); x.quadraticCurveTo(cx + 70, by - 80, cx + 55, by); x.closePath(); x.fill();
      x.fillStyle = P.line; x.fillRect(cx - 40, by - 70, 80, 8);
      x.strokeStyle = P.leaf; x.lineWidth = 10; x.beginPath(); x.moveTo(cx, by - 100); x.bezierCurveTo(cx - 30, by - 250, cx + 30, by - 380, cx, ys - 20); x.stroke();
      for (let j = 0; j < 7; j++) {
        const t = j / 6, yy = by - 130 - t * (by - 130 - ys - 30); const s = j % 2 ? 1 : -1; const len = 70 - t * 25;
        x.fillStyle = P.leaf; x.beginPath(); x.ellipse(cx + s * len * 0.55, yy, len * 0.55, 15, s * -0.5, 0, 6.3); x.fill();
        x.fillStyle = j % 2 ? P.motif : P.dots; x.beginPath(); x.arc(cx + s * len * 1.05, yy - 12, 14, 0, 6.3); x.fill();
        x.fillStyle = P.bg; x.beginPath(); x.arc(cx + s * len * 1.05, yy - 12, 5, 0, 6.3); x.fill();
      }
      x.fillStyle = P.motif; for (let j = 0; j < 8; j++) { const a = (j / 8) * 6.283; x.beginPath(); x.ellipse(cx + Math.cos(a) * 22, ys - 30 + Math.sin(a) * 22, 15, 8, a, 0, 6.3); x.fill(); }
      x.fillStyle = P.dots; x.beginPath(); x.arc(cx, ys - 30, 12, 0, 6.3); x.fill();
      // dot border inside the arch
      x.fillStyle = P.dots; for (let yy = ys; yy < y0 - 10; yy += 36) { x.beginPath(); x.arc(l + 26, yy, 4, 0, 6.3); x.fill(); x.beginPath(); x.arc(r - 26, yy, 4, 0, 6.3); x.fill(); }
    }
    // block-print irregularity + cloth folds (vertical soft bands)
    for (let i = 0; i < 18; i++) { const px = (i / 18) * W; const g = x.createLinearGradient(px, 0, px + W / 18, 0); g.addColorStop(0, 'rgba(0,0,0,0.0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.0)'); x.fillStyle = g; x.fillRect(px, 0, W / 18, H); }
    dabs(x, W, H, { n: 140, size: [40, 160], a: 0.08, seed: 60 + v });
    specks(x, W, H, 1600, 61 + v, 0.06);
    return tex(c);
  });
}

// ── canopy fabrics ───────────────────────────────────────────────────────────
// Bandhani: tie-dye dots in little diamond clusters.
export function bandhani(bg = '#c8102e', dot = '#fff2d0', dot2 = '#ffc21a') {
  return once('band' + bg, () => {
    const S = 512; const [c, x] = canvas(S, S); x.fillStyle = bg; x.fillRect(0, 0, S, S);
    dabs(x, S, S, { n: 80, a: 0.12, seed: 71 });
    const g = 64;
    for (let i = 0; i < S / g; i++) for (let j = 0; j < S / g; j++) {
      const cx = i * g + (j % 2 ? g / 2 : 0), cy = j * g;
      for (const [dx, dy] of [[0, -10], [10, 0], [0, 10], [-10, 0], [0, 0]]) { x.fillStyle = dx === 0 && dy === 0 ? dot2 : dot; for (const ox of [-S, 0, S]) { x.beginPath(); x.arc(cx + dx + ox, cy + dy, 3.6, 0, 6.3); x.fill(); } }
    }
    x.strokeStyle = dot; x.lineWidth = 3; x.setLineDash([4, 6]);
    for (let j = 0; j < 4; j++) { x.beginPath(); x.moveTo(0, j * 128 + 96); x.lineTo(S, j * 128 + 96); x.stroke(); }
    x.setLineDash([]);
    return tex(c);
  });
}
// Leheriya: diagonal rainbow waves.
export function leheriya() {
  return once('leheriya', () => {
    const S = 512; const [c, x] = canvas(S, S);
    const cols = ['#ff4f7a', '#ffc21a', '#2fb39a', '#ff8a1a', '#6a5acd', '#f6e7c8', '#d81f78', '#36a2d6'];
    const step = S / 16;
    for (let i = -16; i < 32; i++) {
      x.fillStyle = cols[((i % cols.length) + cols.length) % cols.length];
      x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step + step, 0); x.lineTo(i * step + step - S, S); x.lineTo(i * step - S, S); x.fill();
    }
    x.globalAlpha = 0.25; x.strokeStyle = '#fff'; x.lineWidth = 2;
    for (let i = -16; i < 32; i++) { x.beginPath(); for (let k = 0; k <= 16; k++) { const t = k / 16; x.lineTo(i * step - t * S + Math.sin(t * 25) * 3, t * S); } x.stroke(); }
    x.globalAlpha = 1; dabs(x, S, S, { n: 60, a: 0.1, seed: 81 });
    return tex(c);
  });
}
// Tent roof stripes (tileable), stripes run down the slope.
export function tentStripe(a, b, n = 8) {
  return once('ts' + a + b + n, () => {
    const S = 256; const [c, x] = canvas(S, S);
    for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect((i * S) / n, 0, S / n + 1, S); }
    x.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < n; i++) x.fillRect((i * S) / n + 1, 0, 2, S);
    dabs(x, S, S, { n: 40, a: 0.12, seed: n + 90 });
    return tex(c);
  });
}
// Jhalar: scalloped valance with mirror dots and tassels (alpha-tested; tiles along u).
export function jhalar(bg = '#d6213f', trim = '#ffc21a', mirror = '#e8f4ff') {
  return once('jh' + bg, () => {
    const W = 256, H = 128; const [c, x] = canvas(W, H);
    x.fillStyle = bg; x.fillRect(0, 0, W, 64);
    x.fillStyle = trim; x.fillRect(0, 6, W, 6); x.fillRect(0, 52, W, 5);
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * (W / 4);
      x.fillStyle = bg; x.beginPath(); x.arc(cx, 60, W / 8, 0, Math.PI); x.fill();
      x.strokeStyle = trim; x.lineWidth = 4; x.beginPath(); x.arc(cx, 60, W / 8 - 6, 0.2, Math.PI - 0.2); x.stroke();
      x.fillStyle = mirror; x.beginPath(); x.arc(cx, 76, 7, 0, 6.3); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(cx - 2, 74, 2.5, 0, 6.3); x.fill();
      // tassel between scallops
      const tx = i * (W / 4);
      x.fillStyle = trim; x.fillRect(tx - 2, 60, 4, 40); x.beginPath(); x.moveTo(tx - 8, 98); x.lineTo(tx + 8, 98); x.lineTo(tx, 124); x.fill();
    }
    x.fillStyle = mirror; for (let i = 0; i < 8; i++) { x.beginPath(); x.arc((i + 0.5) * (W / 8), 32, 5, 0, 6.3); x.fill(); }
    return tex(c);
  });
}

// ── the Garba Circle rangoli (one big painted disc, alpha outside) ─────────────────────────
export function rangoli() {
  return once('rangoli', () => {
    const S = 2048, C = S / 2; const [c, x] = canvas(S, S); const r = rng(5);
    x.translate(C, C);
    const R = C - 8;
    const ring = (r0, r1, col) => { x.fillStyle = col; x.beginPath(); x.arc(0, 0, r1, 0, 6.3); x.arc(0, 0, r0, 6.3, 0, true); x.fill(); };
    const petals = (n, rIn, rOut, w, col, rot = 0, outline = null) => {
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2; x.save(); x.rotate(a);
        x.beginPath(); x.moveTo(rIn, 0); x.quadraticCurveTo((rIn + rOut) / 2, -w, rOut, 0); x.quadraticCurveTo((rIn + rOut) / 2, w, rIn, 0);
        x.fillStyle = col; x.fill(); if (outline) { x.strokeStyle = outline; x.lineWidth = 6; x.stroke(); }
        x.restore();
      }
    };
    const dots = (n, rad, s, col, rot = 0) => { x.fillStyle = col; for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; x.beginPath(); x.arc(Math.cos(a) * rad, Math.sin(a) * rad, s, 0, 6.3); x.fill(); } };
    // base: deep plum floor so the colours pop
    ring(0, R, '#3a1638');
    ring(R - 46, R, '#f6e7c8'); ring(R - 40, R - 6, '#d81f78');
    dots(120, R - 23, 9, '#ffc21a');
    ring(R - 120, R - 46, '#ff8a1a');
    petals(48, R - 175, R - 50, 26, '#ffc21a', 0, '#7d1730');
    petals(48, R - 160, R - 70, 12, '#d6213f', Math.PI / 48);
    ring(R - 200, R - 175, '#f6e7c8');
    dots(96, R - 188, 7, '#2f8f88');
    ring(R - 360, R - 200, '#2b2a6e');
    // paisleys around the indigo band
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2; x.save(); x.rotate(a); x.translate(R - 280, 0); x.rotate(Math.PI / 2);
      x.fillStyle = i % 2 ? '#ff6fae' : '#ffc21a';
      x.beginPath(); x.arc(0, 18, 46, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.moveTo(-46, 18); x.quadraticCurveTo(-30, -70, 30, -80); x.quadraticCurveTo(10, -40, 46, 18); x.fill();
      x.fillStyle = '#2b2a6e'; x.beginPath(); x.arc(0, 18, 24, 0, 6.3); x.fill();
      x.fillStyle = '#f6e7c8'; x.beginPath(); x.arc(0, 18, 11, 0, 6.3); x.fill();
      x.restore();
    }
    dots(64, R - 210, 8, '#f6e7c8', 0.05); dots(64, R - 350, 8, '#f6e7c8', 0.03);
    ring(R - 380, R - 360, '#ffc21a');
    petals(24, R - 640, R - 380, 90, '#d81f78', 0, '#f6e7c8');
    petals(24, R - 600, R - 400, 50, '#ff8a1a', 0);
    petals(24, R - 560, R - 420, 20, '#ffc21a', 0);
    petals(24, R - 660, R - 420, 60, '#2f8f88', Math.PI / 24, '#f6e7c8');
    ring(R - 700, R - 650, '#f6e7c8');
    dots(48, R - 675, 11, '#d6213f');
    // inner 8-point star + lotus
    x.fillStyle = '#ffc21a'; x.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const rr = i % 2 ? R - 860 : R - 700; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    x.closePath(); x.fill();
    petals(12, 60, R - 760, 60, '#d6213f', 0, '#f6e7c8');
    ring(0, 150, '#7d1730'); dots(24, 120, 7, '#ffc21a');
    // a few scuffs: the paint has been danced on all night
    x.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.3, d = 200 + r() * (R - 260), s = 20 + r() * 70;
      const g = x.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, s);
      g.addColorStop(0, `rgba(60,40,30,${0.12 + r() * 0.14})`); g.addColorStop(1, 'rgba(60,40,30,0)'); x.fillStyle = g; x.fillRect(Math.cos(a) * d - s, Math.sin(a) * d - s, s * 2, s * 2);
    }
    x.lineCap = 'round';
    for (let i = 0; i < 40; i++) { const d = 300 + r() * (R - 380), a0 = r() * 6.3; x.strokeStyle = `rgba(40,25,20,${0.06 + r() * 0.06})`; x.lineWidth = 8 + r() * 16; x.beginPath(); x.arc(0, 0, d, a0, a0 + 0.3 + r() * 0.5); x.stroke(); }
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: false, aniso: 8 });
  });
}

// ── signs ────────────────────────────────────────────────────────────────────
// Hand-painted stall signboard.
export function signBoard(text, { bg = '#ffc21a', fg = '#7d1730', sub = '', subColor = null, border = '#d6213f', w = 1024, h = 256 } = {}) {
  return once('sb' + text + bg + sub, () => {
    const [c, x] = canvas(w, h);
    x.fillStyle = border; x.fillRect(0, 0, w, h);
    x.fillStyle = bg; x.fillRect(14, 14, w - 28, h - 28);
    dabs(x, w, h, { n: 50, a: 0.12, seed: text.length * 7 });
    x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(28, 28, w - 56, h - 56);
    for (const cx of [60, w - 60]) { x.fillStyle = fg; for (let j = 0; j < 8; j++) { const a = (j / 8) * 6.283; x.beginPath(); x.ellipse(cx + Math.cos(a) * 20, h / 2 + Math.sin(a) * 20, 13, 7, a, 0, 6.3); x.fill(); } x.fillStyle = border; x.beginPath(); x.arc(cx, h / 2, 9, 0, 6.3); x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${h * (sub ? 0.5 : 0.62)}px ${DISPLAY}`;
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillText(text, w / 2 + 4, h * (sub ? 0.42 : 0.54) + 4, w - 200);
    x.fillStyle = fg; x.fillText(text, w / 2, h * (sub ? 0.42 : 0.54), w - 200);
    if (sub) { x.font = `800 ${h * 0.13}px ${SANS}`; x.fillStyle = subColor || fg; x.fillText(sub.split('').join(' '), w / 2, h * 0.8, w - 200); }
    return tex(c, { repeat: false });
  });
}

// Chalk menu board.
export function menuBoard(title, items, seed = 1) {
  return once('menu' + title, () => {
    const W = 512, H = 640; const [c, x] = canvas(W, H);
    x.fillStyle = '#5a3a1e'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1d2a24'; x.fillRect(22, 22, W - 44, H - 44);
    dabs(x, W, H, { n: 60, a: 0.08, seed, warm: false });
    x.textAlign = 'center'; x.fillStyle = '#ffd84d'; x.font = `92px ${DISPLAY}`; x.fillText(title, W / 2, 120, W - 80);
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(70, 150); x.lineTo(W - 70, 150); x.stroke();
    x.font = `700 34px ${SANS}`; x.textAlign = 'left';
    items.forEach(([n, p], i) => { x.fillStyle = 'rgba(246,240,225,0.92)'; x.fillText(n, 60, 220 + i * 70, 300); x.textAlign = 'right'; x.fillStyle = '#ff9fc8'; x.fillText(p, W - 60, 220 + i * 70); x.textAlign = 'left'; });
    return tex(c, { repeat: false });
  });
}

// Stage backdrop: velvet magenta with a gold mandala and paisley corners.
export function backdrop() {
  return once('backdrop', () => {
    const W = 2048, H = 768; const [c, x] = canvas(W, H);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4a0d3a'); g.addColorStop(0.5, '#8c1550'); g.addColorStop(1, '#4a0d2a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // velvet folds
    for (let i = 0; i < 40; i++) { const px = (i / 40) * W; const gg = x.createLinearGradient(px, 0, px + W / 40, 0); gg.addColorStop(0, 'rgba(0,0,0,0.18)'); gg.addColorStop(0.5, 'rgba(255,200,230,0.06)'); gg.addColorStop(1, 'rgba(0,0,0,0.18)'); x.fillStyle = gg; x.fillRect(px, 0, W / 40, H); }
    const mandala = (cx, cy, R, a = 1) => {
      x.save(); x.translate(cx, cy); x.globalAlpha = a;
      for (let ring = 0; ring < 5; ring++) {
        const n = 8 + ring * 4, rr = R * (0.25 + ring * 0.18);
        for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; x.save(); x.rotate(an); x.fillStyle = ring % 2 ? '#ffc21a' : '#ff8a1a'; x.beginPath(); x.moveTo(rr * 0.7, 0); x.quadraticCurveTo(rr * 0.85, -R * 0.06, rr, 0); x.quadraticCurveTo(rr * 0.85, R * 0.06, rr * 0.7, 0); x.fill(); x.restore(); }
        x.strokeStyle = '#ffd98a'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, rr * 0.66, 0, 6.3); x.stroke();
      }
      x.fillStyle = '#ffd98a'; x.beginPath(); x.arc(0, 0, R * 0.12, 0, 6.3); x.fill();
      x.restore(); x.globalAlpha = 1;
    };
    mandala(W / 2, H * 0.52, 360, 0.95); mandala(220, H * 0.55, 170, 0.6); mandala(W - 220, H * 0.55, 170, 0.6);
    // gold border + scallops
    x.fillStyle = '#e8b04a'; x.fillRect(0, 0, W, 18); x.fillRect(0, H - 18, W, 18);
    for (let i = 0; i < 48; i++) { x.beginPath(); x.arc((i + 0.5) * (W / 48), 18, W / 96, 0, Math.PI); x.fill(); }
    specks(x, W, H, 2500, 99, 0.05);
    return tex(c, { repeat: false });
  });
}

// Photo-booth flower wall with the hashtag painted across the top.
export function boothWall() {
  return once('booth', () => {
    const W = 1536, H = 768; const [c, x] = canvas(W, H); const r = rng(17);
    x.fillStyle = '#3b0f35'; x.fillRect(0, 0, W, H);
    const cols = ['#ff6fae', '#ff8a1a', '#ffc21a', '#d81f78', '#fff2d0', '#ff4f7a', '#f6a6c8'];
    for (let i = 0; i < 900; i++) {
      const px = r() * W, py = r() * H, s = 14 + r() * 26, col = cols[(r() * cols.length) | 0];
      x.fillStyle = col; for (let j = 0; j < 6; j++) { const a = (j / 6) * 6.283 + r(); x.beginPath(); x.ellipse(px + Math.cos(a) * s * 0.5, py + Math.sin(a) * s * 0.5, s * 0.5, s * 0.3, a, 0, 6.3); x.fill(); }
      x.fillStyle = '#ffd84d'; x.beginPath(); x.arc(px, py, s * 0.2, 0, 6.3); x.fill();
      if (r() < 0.25) { x.fillStyle = '#3f8f3a'; x.beginPath(); x.ellipse(px + s * 0.8, py + s * 0.4, s * 0.5, s * 0.18, r() * 3, 0, 6.3); x.fill(); }
    }
    // shade the lower part slightly so the photos pop
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(30,0,25,0.45)'); g.addColorStop(0.15, 'rgba(30,0,25,0.1)'); g.addColorStop(1, 'rgba(30,0,25,0.35)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `800 30px ${SANS}`; x.lineWidth = 8; x.strokeStyle = '#3b0f35'; const tag = 'S T R I K E   A   P O S E   ·   N O   S T E P S   R E Q U I R E D';
    x.strokeText(tag, W / 2, 36); x.fillStyle = '#ffc21a'; x.fillText(tag, W / 2, 36);
    return tex(c, { repeat: false });
  });
}

// Festival poster atlas (2×2): one material, one draw call.
export function posterAtlas() {
  return once('posters', () => {
    const W = 1024, H = 1280; const [c, x] = canvas(W, H);
    const P = [
      { bg: '#d81f78', fg: '#fff2d0', ac: '#ffc21a', t: ['DANDIYA', 'RAAS'], s: '9 PM ONWARDS · ALL NINE NIGHTS' },
      { bg: '#232a66', fg: '#ffc21a', ac: '#ff6fae', t: ['NO STEPS', 'REQUIRED'], s: 'JUST SPIN. SOMEONE WILL CATCH YOU.' },
      { bg: '#ffc21a', fg: '#7d1730', ac: '#d6213f', t: ['LOST:', '1 DANDIYA'], s: 'LEFT HAND · SPARKLY · LAST SEEN MID-TWIRL' },
      { bg: '#1f9e8f', fg: '#fff2d0', ac: '#ff8a1a', t: ['GARBA', 'QUEEN'], s: 'NIGHT ONE · UNDEFEATED' },
    ];
    P.forEach((p, i) => {
      const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 640;
      x.fillStyle = p.bg; x.fillRect(ox, oy, 512, 640);
      dabs(x, 512, 640, { n: 0 });
      x.save(); x.translate(ox + 256, oy + 250);
      for (let j = 0; j < 16; j++) { x.rotate(Math.PI / 8); x.fillStyle = j % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(400, -80); x.lineTo(400, 80); x.fill(); }
      x.restore();
      x.fillStyle = p.ac; x.fillRect(ox, oy, 512, 22); x.fillRect(ox, oy + 618, 512, 22);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = p.fg;
      x.font = `150px ${DISPLAY}`; x.fillText(p.t[0], ox + 256, oy + 190, 470); x.fillText(p.t[1], ox + 256, oy + 330, 470);
      x.font = `800 22px ${SANS}`; x.fillStyle = p.ac; x.fillText(p.s, ox + 256, oy + 470, 470);
      // two crossed dandiya sticks
      x.save(); x.translate(ox + 256, oy + 555); for (const s of [-1, 1]) { x.save(); x.rotate(s * 0.6); x.fillStyle = p.fg; x.fillRect(-90, -6, 180, 12); x.fillStyle = p.ac; for (let k = -3; k <= 3; k++) x.fillRect(k * 24 - 4, -6, 8, 12); x.restore(); } x.restore();
    });
    specks(x, W, H, 3000, 123, 0.05);
    const t = tex(c, { repeat: false });
    return { tex: t, rect: (i) => [(i % 2) * 0.5, 1 - (Math.floor(i / 2) + 1) * 0.5, 0.5, 0.5] };
  });
}

// Distant building façade with warm lit windows (emissive map = same texture).
export function windows() {
  return once('windows', () => {
    const S = 256; const [c, x] = canvas(S, S); const r = rng(9);
    x.fillStyle = '#1a1430'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const on = r() < 0.45; x.fillStyle = on ? (r() < 0.5 ? '#ffcf7a' : '#ff9f5a') : '#2a2448';
      x.fillRect(i * 32 + 9, j * 32 + 8, 14, 18);
    }
    return tex(c);
  });
}

// Rope-tensioned drum body for the dhol.
export function dholTex() {
  return once('dhol', () => {
    const W = 512, H = 256; const [c, x] = canvas(W, H);
    x.fillStyle = '#8a3a1a'; x.fillRect(0, 0, W, H); dabs(x, W, H, { n: 60, a: 0.15, seed: 31 });
    x.fillStyle = '#ffc21a'; x.fillRect(0, 0, W, 24); x.fillRect(0, H - 24, W, 24);
    x.strokeStyle = '#f6e7c8'; x.lineWidth = 7;
    x.beginPath(); for (let i = 0; i <= 16; i++) x.lineTo(i * (W / 16), i % 2 ? H - 26 : 26); x.stroke();
    x.fillStyle = '#d6213f'; for (let i = 0; i < 8; i++) x.fillRect(i * 64 + 22, H / 2 - 14, 20, 28);
    return tex(c, { repeat: true });
  });
}
