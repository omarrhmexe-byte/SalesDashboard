// The post-game film: a short, full-screen slideshow that plays after the final round and before
// the GG screen. Photos with a slow Ken Burns drift, film grain, a few typographic cards, short
// excerpts of each friend's voice note, a Bangalore → Abu Dhabi flight path, and an original score
// (src/music.js) — or SLIDESHOW.music, if that file exists.
//
//   playSlideshow({ onDone, onOpaque }) -> controller { next(), skip(), slides, index, el }
//
// Everything degrades quietly: a missing photo becomes a coloured card, a missing voice note just
// means no excerpt, no WebAudio means a silent film.
import './slideshow.css';
import { SLIDESHOW, VOICE_NOTES, PORTRAIT } from './config.js';
import { getVolume, duck } from './audio.js';
import { createScore } from './music.js';

// ── fonts (a serif for captions; the display fonts are already on the page) ──
if (typeof document !== 'undefined' && !document.getElementById('fsFont')) {
  const l = document.createElement('link'); l.id = 'fsFont'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,400;1,500&display=swap';
  document.head.appendChild(l);
}

// ── an AudioContext of our own, unlocked on the first gesture of the session ──
let actx = null;
function getCtx() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { actx = new AC(); } catch (e) { actx = null; }
  return actx;
}
function unlock() {
  const c = getCtx(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { const b = c.createBuffer(1, 1, c.sampleRate); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(); } catch (e) { /* */ }
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => removeEventListener(ev, unlock, true));
}
if (typeof window !== 'undefined') ['pointerdown', 'keydown', 'touchend'].forEach((ev) => addEventListener(ev, unlock, true));

// ── copy ────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s || '').trim().toLowerCase();

// Light touches for slides we recognise (matched against title + caption). The config captions are
// used exactly as written; we only add a colour treatment and, rarely, a small kicker above the title.
const FLAVOUR = [
  { re: /day one|too much/i, tone: 'mono' },
  { re: /turns out|exactly what/i, tone: 'bloom' },
  { re: /before all this/i, tone: 'dusk' },
  { re: /cat|barefoot/i, tone: 'cool' },
  { re: /garba|dandiya|navratri/i, tone: 'festive' },
  { re: /summit|gcc|event/i, tone: 'warm' },
  { re: /bangalore|bengaluru/i, tone: 'dusk', kicker: 'Staying put' },
];

// Base durations (seconds). With the config's 18 slides the film runs ~100s; friend slides stretch
// to fit their voice-note excerpt.
const DUR = { opening: 5, slide: 4.3, video: 4.6, friend: 6.4, flight: 5.8, final: 7.6, closing: 4.6, silence: 1.8 };

export function buildSlides() {
  const cfg = ((SLIDESHOW && SLIDESHOW.slides) || []).filter((s) => s && (s.src || s.video || s.title || s.caption));
  const notes = VOICE_NOTES || [];
  const friendOf = (s) => notes.find((n) => norm(n.from) && norm(n.from) === norm(s.title)) || null;
  const text = (s) => `${s.title || ''} ${s.caption || ''}`;
  const slides = [];
  slides.push({ kind: 'opening', section: 'opening', dur: DUR.opening, title: 'A few things we never said out loud.', caption: 'So we’re saying them now.', kicker: 'Post-match' });

  const used = new Set();
  let lastFriend = -1, seenFriend = false;
  cfg.forEach((s, i) => {
    const f = friendOf(s);
    const fl = FLAVOUR.find((x) => x.re.test(text(s))) || {};
    const o = { src: s.video || s.src, video: !!s.video, title: s.title || '', caption: s.caption || '', tone: fl.tone || 'warm', kicker: fl.kicker || '' };
    const last = i === cfg.length - 1;
    if (f && !used.has(f)) {
      used.add(f); seenFriend = true;
      Object.assign(o, { kind: 'friend', note: f, section: 'friends', dur: DUR.friend, tone: 'warm', kicker: `Voice note ${notes.indexOf(f) + 1} · from ${f.from}` });
    } else if (/abu dhabi/i.test(text(s))) {
      Object.assign(o, { kind: 'flight', section: 'depart', dur: DUR.flight, kicker: 'BLR → AUH · 2,750 km' });
    } else if (last && /birthday|goodbye|see you/i.test(text(s))) {
      Object.assign(o, { kind: 'final', section: 'final', dur: DUR.final, tone: 'golden', kicker: 'Twenty-five' });
    } else if (/bangalore|bengaluru/i.test(text(s))) {
      Object.assign(o, { kind: 'photo', section: 'depart', dur: DUR.slide });
    } else {
      Object.assign(o, { kind: 'photo', section: i < 3 ? 'intro' : seenFriend ? 'friends' : 'moments', dur: s.video ? DUR.video : DUR.slide });
    }
    slides.push(o);
    if (o.kind === 'friend') lastFriend = slides.length - 1;
  });
  // anyone who sent a voice note but has no slide yet gets one, right after the last friend slide
  const extra = notes.filter((n) => !used.has(n)).map((n) => ({ kind: 'friend', note: n, src: n.photo, title: n.from, caption: n.line, tone: 'warm', section: 'friends', dur: DUR.friend, kicker: `Voice note ${notes.indexOf(n) + 1} · from ${n.from}` }));
  if (extra.length) {
    let at = lastFriend >= 0 ? lastFriend + 1 : slides.findIndex((s) => s.section === 'depart' || s.kind === 'final');
    if (at < 0) at = slides.length;
    slides.splice(at, 0, ...extra);
  }
  // no departure slide in the config? add the flight path ourselves
  if (!slides.some((s) => s.kind === 'flight')) {
    let at = slides.findIndex((s) => s.section === 'depart' || s.kind === 'final'); if (at < 0) at = slides.length;
    slides.splice(at, 0, { kind: 'flight', section: 'depart', dur: DUR.flight, kicker: 'BLR → AUH · 2,750 km', title: 'Abu Dhabi', caption: 'gets its girl back.' });
  }
  // and a proper final card if the config doesn't end on one
  if (!slides.some((s) => s.kind === 'final')) slides.push({ kind: 'final', src: PORTRAIT, tone: 'golden', section: 'final', dur: DUR.final, kicker: 'Twenty-five', title: 'Happy birthday, Chikero', caption: '' });
  // the closing card: the lights go down and one lamp stays on
  slides.push({ kind: 'closing', section: 'final', dur: DUR.closing, title: '', caption: 'We’ll keep the light on.', sign: 'Love, everyone at Zyoin' });
  slides.forEach((s, i) => { s.i = i; s.side = i % 2 ? 'right' : 'left'; });
  return slides;
}

// ── assets ──────────────────────────────────────────────────────────────────
function preloadMedia(s) {
  if (!s.src) { s.img = 'none'; return; }
  s.img = 'loading';
  if (s.video) {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.addEventListener('loadeddata', () => { s.img = 'ok'; s.aspect = (v.videoWidth || 1) / Math.max(1, v.videoHeight || 1); }, { once: true });
    v.addEventListener('error', () => { s.img = 'err'; }, { once: true });
    v.src = s.src; v.load(); s.preEl = v;
    return;
  }
  const im = new Image();
  im.onload = () => { s.img = im.naturalWidth > 0 ? 'ok' : 'err'; s.aspect = im.naturalWidth / Math.max(1, im.naturalHeight); };
  im.onerror = () => { s.img = 'err'; };
  im.src = s.src;
}

async function prepExcerpt(ctx, n) {
  const res = await fetch(n.audio);
  if (!res.ok || /text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('no audio');
  const ab = await res.arrayBuffer();
  const buf = await new Promise((ok, bad) => { const p = ctx.decodeAudioData(ab, ok, bad); if (p && p.then) p.then(ok, bad); });
  if (Array.isArray(n.excerpt)) return { buf, start: n.excerpt[0], end: Math.min(buf.duration, n.excerpt[0] + n.excerpt[1]) };
  // find where the talking starts, then end on the quietest moment 5–7s later (a natural pause)
  const d = buf.getChannelData(0), sr = buf.sampleRate, W = 0.05, win = Math.floor(sr * W);
  const rms = [];
  for (let i = 0; i + win <= d.length; i += win) { let s = 0; for (let j = i; j < i + win; j += 4) s += d[j] * d[j]; rms.push(Math.sqrt(s / (win / 4))); }
  let max = 0; for (const v of rms) if (v > max) max = v;
  const on = Math.max(0, rms.findIndex((v) => v > Math.max(0.008, max * 0.12)));
  const start = Math.max(0, on * W - 0.2);
  let best = start + 6, bv = Infinity;
  for (let t = start + 5; t <= start + 7; t += W) { const k = Math.floor(t / W); const v = (rms[k] ?? 1) + (rms[k + 1] ?? 1) + (rms[k + 2] ?? 1); if (v < bv) { bv = v; best = t + W * 1.5; } }
  return { buf, start, end: Math.min(buf.duration, best) };
}

// SLIDESHOW.music if it really exists, else the procedural score. Same tiny interface either way.
async function makeMusic(ctx, out) {
  const url = SLIDESHOW && SLIDESHOW.music;
  if (url) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(url, { method: 'HEAD', signal: ctl.signal }); clearTimeout(to);
      const ct = r.headers.get('content-type') || '';
      if (r.ok && !/text\/html/i.test(ct)) {
        const el = new Audio(); el.src = url; el.preload = 'auto';
        await new Promise((ok, bad) => { el.oncanplay = ok; el.onerror = bad; setTimeout(bad, 4000); el.load(); });
        const src = ctx.createMediaElementSource(el);
        const g = ctx.createGain(); g.gain.value = 0; const dk = ctx.createGain();
        src.connect(dk); dk.connect(g); g.connect(out);
        let vol = getVolume();
        return {
          kind: 'file',
          start() { el.currentTime = 0; el.play().catch(() => {}); g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2); },
          setSection() {}, finale() {},
          setVolume(v) { if (v !== vol) { vol = v; g.gain.setTargetAtTime(v, ctx.currentTime, 0.1); } },
          duck(on) { dk.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, on ? 0.25 : 0.8); },
          fadeOut(sec = 3) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + sec); setTimeout(() => el.pause(), sec * 1000 + 100); },
          stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(() => { el.pause(); try { src.disconnect(); } catch (e) { /* */ } }, 900); },
        };
      }
    } catch (e) { /* fall through to the generated score */ }
  }
  return { kind: 'score', ...createScore(ctx, out, { volume: getVolume() }) };
}

let grainURL = null;
function grain() {
  if (grainURL) return grainURL;
  const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d');
  const im = x.createImageData(180, 180);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); grainURL = c.toDataURL('image/png');
  return grainURL;
}

// ── slide markup ────────────────────────────────────────────────────────────
function textBlock(s) {
  return `<div class="fs-text">
    ${s.kicker ? `<div class="fs-kicker">${esc(s.kicker)}</div>` : ''}
    ${s.pre ? `<div class="fs-pre">${esc(s.pre)}</div>` : ''}
    ${s.title ? `<h2 class="fs-title">${esc(s.title)}</h2>` : ''}
    ${s.caption ? `<p class="fs-cap">${esc(s.caption)}</p>` : ''}
    ${s.kind === 'friend' ? `<div class="fs-voice"><i></i><i></i><i></i><i></i><i></i><span>${esc(s.note.from)} · in their own words</span></div>` : ''}
    ${s.sign ? `<p class="fs-sign">${esc(s.sign)}</p>` : ''}
  </div>`;
}

// Projected positions (lon/lat → svg) for the flight card
const geo = (lon, lat) => [((lon - 45) * 26).toFixed(1), ((30 - lat) * 26).toFixed(1)];
const line = (pts) => pts.map(([a, b]) => geo(a, b).join(',')).join(' ');
const COAST = [
  // Arabian peninsula, Gulf side round to Oman
  [[47.8, 29.6], [50.2, 26.6], [51.5, 25.4], [52.6, 24.2], [54.4, 24.4], [55.3, 25.2], [56.3, 26.3], [56.4, 24.9], [58.6, 23.6], [59.8, 22.5], [58.6, 20.4], [57.8, 19], [55.5, 17.6], [54, 17], [52, 16], [48.5, 14], [45, 12.8]],
  // Iran / Pakistan coast
  [[50.8, 28.9], [54.5, 26.7], [56.3, 27.2], [57.3, 25.8], [61.5, 25.2], [64.5, 25.2], [66.6, 25.4], [67.1, 24.8]],
  // India, west coast down and round to the east
  [[67.1, 24.8], [68.9, 23.1], [69, 22.3], [70.3, 20.9], [72.6, 21.6], [72.8, 19], [73.3, 17], [73.8, 15.5], [74.8, 12.9], [75.9, 11], [76.3, 9.9], [77.5, 8.1], [78.2, 8.9], [79.3, 10.3], [79.9, 12], [80.3, 13.1], [80.2, 15.5], [82.3, 16.6]],
];
function flightSVG() {
  const [bx, by] = geo(77.59, 12.97), [ax, ay] = geo(54.37, 24.45);
  return `<svg class="fs-map" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><pattern id="fsDots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1"/></pattern>
    <radialGradient id="fsGlow"><stop offset="0" stop-color="#FFC21A" stop-opacity=".9"/><stop offset="1" stop-color="#FFC21A" stop-opacity="0"/></radialGradient></defs>
    <rect class="dots" width="1000" height="600" fill="url(#fsDots)"/>
    ${COAST.map((c) => `<polyline class="coast" points="${line(c)}"/>`).join('')}
    <text class="sea" x="${geo(64, 16)[0]}" y="${geo(64, 16)[1]}">the Arabian Sea</text>
    <path class="route-bg" d="M${bx},${by} Q560,175 ${ax},${ay}"/>
    <path class="route" d="M${bx},${by} Q560,175 ${ax},${ay}"/>
    <circle class="glow" cx="${bx}" cy="${by}" r="34" fill="url(#fsGlow)"/><circle class="glow g2" cx="${ax}" cy="${ay}" r="34" fill="url(#fsGlow)"/>
    <circle class="city" cx="${bx}" cy="${by}" r="6"/><circle class="city c2" cx="${ax}" cy="${ay}" r="6"/>
    <text class="lbl" x="${+bx - 20}" y="${+by + 10}" text-anchor="end">BANGALORE</text><text class="code" x="${+bx - 20}" y="${+by + 32}" text-anchor="end">BLR · 12.97°N</text>
    <text class="lbl l2" x="${+ax - 18}" y="${+ay - 22}" text-anchor="end">ABU DHABI</text><text class="code c2" x="${+ax - 18}" y="${+ay}" text-anchor="end">AUH · 24.45°N</text>
    <g class="plane"><path d="M0 -3 L14 0 L0 3 L3 0Z M4 -1 L-2 -10 L1 -10 L9 -1Z M4 1 L-2 10 L1 10 L9 1Z M-5 -1 L-9 -5 L-7 -5 L-2 -1Z M-5 1 L-9 5 L-7 5 L-2 1Z"/></g>
  </svg>`;
}

const media = (s, alt) => s.video
  ? `<video src="${esc(s.src)}" muted playsinline loop autoplay preload="auto" aria-hidden="${alt ? 'false' : 'true'}"></video>`
  : `<img src="${esc(s.src)}" alt="${alt ? esc(s.title || s.caption || '') : ''}">`;

function slideEl(s) {
  const el = document.createElement('div');
  const photo = s.src && s.img === 'ok';
  const wide = photo && s.aspect > 1.25;
  let cls = `fs-slide fs-${s.kind} side-${s.side}`;
  let inner = '';
  if (s.kind === 'opening') {
    inner = `<div class="fs-open"><div class="fs-kicker">${esc(s.kicker)}</div><p class="fs-line">${esc(s.title).split(' ').map((w, i) => `<span style="transition-delay:${0.7 + i * 0.16}s">${w}</span>`).join(' ')}</p><p class="fs-sub">${esc(s.caption)}</p></div><div class="fs-hint">Tap or press space to continue</div>`;
  } else if (s.kind === 'flight') {
    // the route draws itself across the Arabian Sea; her photo (if it loads) sits on the Abu Dhabi side
    if (photo) cls += ` has-photo tone-desert`;
    inner = `<div class="fs-flightbg"></div>${photo ? `<div class="fs-pic">${media(s, true)}</div>` : ''}${flightSVG()}<div class="fs-shade"></div>${textBlock(s)}`;
  } else if (s.kind === 'closing') {
    inner = `<div class="fs-close">${textBlock(s)}</div>`;
  } else if (photo) {
    cls += ` has-photo tone-${s.tone || 'warm'} ${wide ? 'wide' : 'split'}${s.video ? ' is-video' : ''}`;
    inner = `<div class="fs-bg">${media(s, false)}</div>
      <div class="fs-pic">${media(s, true)}</div>
      <div class="fs-tint"></div>${s.tone === 'festive' ? '<div class="fs-bokeh">' + '<i></i>'.repeat(9) + '</div>' : ''}
      <div class="fs-shade"></div>${textBlock(s)}`;
  } else {
    // card: a typographic slide (also the graceful fallback for a missing photo)
    cls += ` fs-cardish pal-${s.palette || (s.kind === 'friend' ? 'teal' : s.kind === 'final' ? 'gold' : ['red', 'navy', 'teal', 'gold'][s.i % 4])}`;
    inner = `<div class="fs-cardbg"></div>${textBlock(s)}`;
  }
  el.className = cls; el.innerHTML = inner;
  return el;
}

const KB = [
  ['scale(1.05) translate(-1.2%, 1.4%)', 'scale(1.17) translate(1.4%, -1.2%)'],
  ['scale(1.18) translate(1.2%, -1%)', 'scale(1.06) translate(-1%, 1%)'],
  ['scale(1.06) translate(1.5%, 1.5%)', 'scale(1.16) translate(-1.2%, -0.8%)'],
  ['scale(1.15) translate(0, 2%)', 'scale(1.04) translate(0, -1%)'],
];

// ── player ──────────────────────────────────────────────────────────────────
let active = null;
export function isFilmPlaying() { return !!active; }

export function playSlideshow({ onDone = () => {}, onOpaque = () => {} } = {}) {
  if (active) active.skip(true);
  const slides = buildSlides();
  slides.forEach(preloadMedia);

  const film = document.createElement('div');
  film.className = 'film'; film.setAttribute('role', 'dialog'); film.setAttribute('aria-label', 'A short film for Chikero');
  film.innerHTML = `<div class="fs-stage"></div><div class="fs-vig"></div><div class="fs-grain" style="background-image:url(${grain()})"></div>
    <div class="fs-light"></div>
    <div class="fs-tap" hidden><div class="fs-kicker">One last thing</div><div class="fs-title">Sound on</div><p class="fs-cap">Tap anywhere to begin.</p></div>
    <button class="fs-skip" type="button" aria-label="Skip the film">SKIP <span>▸▸</span></button>`;
  document.body.appendChild(film);
  const stage = film.querySelector('.fs-stage');
  requestAnimationFrame(() => film.classList.add('in'));

  const ctx = getCtx();
  let out = null, voiceOut = null, music = null, musicP = null;
  if (ctx) {
    out = ctx.createGain(); out.gain.value = 1; out.connect(ctx.destination);
    voiceOut = ctx.createGain(); voiceOut.gain.value = Math.min(1, getVolume() * 1.25); voiceOut.connect(ctx.destination);
    musicP = makeMusic(ctx, out).then((m) => { music = m; return m; }).catch(() => null);
    // voice-note excerpts decode in the background while the opening plays
    slides.filter((s) => s.kind === 'friend' && s.note && s.note.audio).forEach((s) => { prepExcerpt(ctx, s.note).then((x) => { s.excerpt = x; }).catch(() => { s.excerpt = null; }); });
  }
  duck(true); // hush the game's own sound (fireworks, ambience) under the film

  let idx = -1, cur = null, slideStart = 0, shownAt = 0, filmStart = 0, raf = 0, done = false, started = false, ending = false;
  let voiceSrc = null, timers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };

  function stopVoice(fade = 0.35) {
    if (!voiceSrc || !ctx) return;
    const { src, g } = voiceSrc; voiceSrc = null;
    try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); src.stop(ctx.currentTime + fade + 0.05); } catch (e) { /* */ }
    if (music) music.duck(false);
  }
  function playVoice(s, el) {
    const ex = s.excerpt; if (!ex || !ctx) return 0;
    const len = Math.max(1, ex.end - ex.start), t = ctx.currentTime + 0.9;
    const src = ctx.createBufferSource(); src.buffer = ex.buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.15);
    g.gain.setValueAtTime(1, t + len - 0.45); g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g); g.connect(voiceOut); src.start(t, ex.start, len + 0.05);
    voiceSrc = { src, g };
    if (music) music.duck(true);
    later(() => el.classList.add('playing'), 900);
    later(() => { el.classList.remove('playing'); if (voiceSrc && voiceSrc.src === src) { voiceSrc = null; if (music) music.duck(false); } }, (0.9 + len) * 1000);
    return 0.9 + len + 1.7;
  }

  function show(i) {
    stopVoice();
    const prev = cur;
    if (prev) { prev.classList.remove('on'); prev.classList.add('off'); later(() => prev.remove(), 2200); }
    idx = i; const s = slides[i];
    if (!s) return finale();
    cur = slideEl(s);
    stage.appendChild(cur);
    slideStart = shownAt = performance.now();
    s.len = s.dur;
    if (music) music.setSection(s.section);
    // Ken Burns on the photo (and its blurred backdrop)
    const kb = KB[i % KB.length];
    cur.querySelectorAll('video').forEach((v) => { v.muted = true; const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); });
    cur.querySelectorAll('.fs-pic img, .fs-bg img, .fs-pic video, .fs-bg video').forEach((im) => {
      try { im.animate([{ transform: kb[0] }, { transform: kb[1] }], { duration: (s.dur + 2.5) * 1000, easing: 'linear', fill: 'both' }); } catch (e) { /* */ }
    });
    if (s.kind === 'friend') { const extra = playVoice(s, cur); if (extra) s.len = Math.max(s.dur, extra); }
    if (s.kind === 'flight') animateFlight(cur, s.len);
    if (s.kind === 'final' && music) music.finale();
    if (s.kind === 'closing') {
      // lights down: one warm lamp stays on while the last chord rings out
      film.classList.add('lamp');
      later(() => { if (music) music.fadeOut(Math.max(2, s.len - 0.6)); }, 600);
    }
    void cur.offsetWidth; cur.classList.add('on');
  }

  function animateFlight(el, len) {
    const path = el.querySelector('.route'), plane = el.querySelector('.plane');
    if (!path || !path.getTotalLength) return;
    const L = path.getTotalLength();
    path.style.strokeDasharray = `${L}`; path.style.strokeDashoffset = `${L}`;
    const t0 = performance.now() + 1100, D = Math.min(4200, (len - 2) * 1000);
    const step = () => {
      if (!el.isConnected) return;
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / D));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      path.style.strokeDashoffset = `${L * (1 - e)}`;
      const p = path.getPointAtLength(L * e), q = path.getPointAtLength(Math.min(L, L * e + 1));
      const a = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      plane.setAttribute('transform', `translate(${p.x},${p.y}) rotate(${k >= 1 ? a : a})`);
      plane.style.opacity = k > 0 && k < 1 ? 1 : k >= 1 ? 0.0 : 0;
      if (k >= 1) el.classList.add('landed');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let lastNow = performance.now(), hold = false;
  function loop() {
    if (done) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (hold) slideStart += now - lastNow; // paused (debug/testing): freeze the slide clock
    lastNow = now;
    if (music) music.setVolume(getVolume());
    if (voiceOut) voiceOut.gain.value = Math.min(1, getVolume() * 1.25);
    if (!started || ending) return;
    const s = slides[idx];
    if (s && (performance.now() - slideStart) / 1000 >= s.len) show(idx + 1);
  }

  // the closing words fade, the lamp stays for a beat of silence, then GG
  function finale() {
    if (ending) return; ending = true;
    if (cur) { cur.classList.remove('on'); cur.classList.add('off'); }
    film.classList.add('lamp');
    if (music) music.fadeOut(1.2);
    later(() => finish(), (DUR.silence + 1.2) * 1000);
  }

  function finish() {
    if (done) return; done = true; active = null;
    cancelAnimationFrame(raf); timers.forEach(clearTimeout);
    removeEventListener('keydown', onKey, true);
    stopVoice(0.2);
    if (music) music.stop(); else if (musicP) musicP.then((m) => m && m.stop());
    duck(false);
    film.classList.add('out');
    onDone();
    setTimeout(() => film.remove(), 1300);
  }

  function next() {
    if (!started || done) return;
    const now = performance.now();
    if (now - filmStart < 2200 || now - shownAt < 800) return; // ignore stray clicks from the match
    if (ending) return finish();
    show(idx + 1);
  }
  function skip() { if (!done) finish(); }

  function onKey(e) {
    if (done) return;
    if (['Space', 'Enter', 'NumpadEnter', 'ArrowRight'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); if (!started) begin(); else next(); }
    else if (e.code === 'Escape') { e.preventDefault(); skip(); }
  }
  addEventListener('keydown', onKey, true);
  film.querySelector('.fs-skip').addEventListener('click', (e) => { e.stopPropagation(); skip(); });
  film.querySelector('.fs-skip').addEventListener('pointerup', (e) => e.stopPropagation());
  film.addEventListener('pointerup', (e) => { if (e.target.closest('.fs-skip')) return; if (!started) begin(); else next(); });

  async function begin() {
    if (started || done) return;
    if (ctx && ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* */ } }
    if (started || done) return;
    started = true; filmStart = performance.now();
    film.querySelector('.fs-tap').hidden = true;
    const m = await Promise.race([musicP || Promise.resolve(null), new Promise((r) => setTimeout(() => r(null), 3000))]);
    if (done) return;
    if (m && !music) music = m;
    if (music) music.start(2.4);
    show(0);
  }

  // wait for the overlay to cover the game, then start (or ask for a tap if audio is still locked)
  setTimeout(async () => {
    if (done) return;
    onOpaque();
    if (ctx && ctx.state !== 'running') {
      try { await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 500))]); } catch (e) { /* */ }
    }
    if (done) return;
    if (ctx && ctx.state !== 'running') film.querySelector('.fs-tap').hidden = false;
    else begin();
  }, 1900);
  raf = requestAnimationFrame(loop);

  active = {
    el: film, slides, next, skip,
    get index() { return idx; }, get started() { return started; }, get music() { return music; },
    get hold() { return hold; }, set hold(v) { hold = !!v; },
  };
  return active;
}
