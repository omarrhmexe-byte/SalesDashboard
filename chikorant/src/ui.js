// DOM-side UI: HUD widgets, agent select, unlock card, death + ending screens.
import { sfx, duck } from './audio.js';
import { duotone } from './textures.js';
import { PORTRAIT, ENDING, VOICE_NOTES } from './config.js';

export const $ = (id) => document.getElementById(id);
const show = (id, on = true) => { $(id).hidden = !on; };
export { show };

const BOT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3c4.5 0 8 3 8 7v2H4v-2c0-4 3.5-7 8-7zm-7 10h14v2c0 3-3 6-7 6s-7-3-7-6z"/><rect x="6" y="9" width="12" height="2.4" fill="#0F1923"/></svg>';
const HS_ICON = '<svg class="hs" viewBox="0 0 24 24"><path d="M12 2a8 8 0 018 8v3h-2v4l-6 5-6-5v-4H4v-3a8 8 0 018-8zm-3 9a1.6 1.6 0 100 3.2A1.6 1.6 0 009 11zm6 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2z"/></svg>';

const ICONS = {
  P: 'M16 28S4 20 4 11a6.5 6.5 0 0112-3 6.5 6.5 0 0112 3c0 9-12 17-12 17z',
  Q: 'M4 22c6-1 10-6 14-12l3 4c2-3 4-5 7-6-2 4-4 8-8 11l-3-3c-3 3-7 6-13 6z',
  E: 'M16 3l7 9h-4v6h-6v-6H9zM6 22c4 0 6 2 10 2s6-2 10-2v3c-4 0-6 2-10 2s-6-2-10-2z',
  X: 'M16 2l4 9 10 1-7.5 6.5L25 29l-9-5-9 5 2.5-10.5L2 12l10-1z',
};
export const ABILITIES = [
  { k: 'P', tag: 'PASSIVE', name: 'TOO MUCH (APPROVED)', desc: 'Shield regenerates after 4s out of combat. Vibes regenerate always.', passive: true },
  { k: 'Q', tag: 'SIGNATURE', name: 'GARBA DASH', desc: 'Dash fast in your movement direction, leaving a festival-coloured trail. 3s cooldown.' },
  { k: 'E', tag: 'BASIC', name: 'CAT RESCUE', desc: 'Launch into a huge updraft jump. High places, scared cats, no ladder needed. 6s cooldown.' },
  { k: 'X', tag: 'ULTIMATE', name: 'MAIN CHARACTER', desc: '7s of slow-mo, double damage and golden-hour lighting. Charged by 5 kills.', ult: true },
];

export function buildSelect(mobile) {
  const ab = $('abilities');
  ab.innerHTML = ABILITIES.map((a) => `<div class="a ${a.ult ? 'ult' : ''} ${a.passive ? 'pas' : ''}"><div class="k"><svg viewBox="0 0 32 32"><path d="${ICONS[a.k]}"/></svg><i>${a.passive ? '' : a.k}</i></div><div class="tx"><span class="tg">${a.tag}</span><b>${a.name}</b><em>${a.desc}</em></div></div>`).join('');
  const rows = mobile
    ? [['STICK', 'Move (left thumb)'], ['DRAG', 'Aim (right side)'], ['FIRE', 'Shoot (drag to aim too)'], ['JUMP', 'Jump'], ['Q E X', 'Abilities'], ['PLANT', 'Hold to plant the cake']]
    : [['WASD', 'Move'], ['MOUSE', 'Aim'], ['CLICK', 'Fire (hold for full-auto)'], ['R', 'Reload'], ['SPACE', 'Jump'], ['SHIFT', 'Walk (quiet + accurate)'], ['Q', 'Garba Dash'], ['E', 'Cat Rescue'], ['X', 'Main Character (ult)'], ['F', 'Hold to plant the cake'], ['ESC', 'Pause / settings']];
  const short = mobile ? [['STICK', 'Move'], ['DRAG', 'Aim'], ['FIRE', 'Shoot'], ['Q E X', 'Abilities']] : [['WASD', 'Move'], ['MOUSE', 'Aim'], ['CLICK', 'Fire'], ['R', 'Reload'], ['SPACE', 'Jump'], ['Q E X', 'Abilities'], ['ESC', 'Pause']];
  $('controls').innerHTML = short.map(([k, v]) => `<span class="ch"><kbd>${k}</kbd>${v}</span>`).join('');
  $('pauseKeys').innerHTML = rows.map(([k, v]) => `${k} · ${v}`).join('<br>');
  const row = $('agentRow');
  const fake = ['?', '?', '?', '', '?', '?', '?'];
  row.innerHTML = fake.map((f, i) => (i === 3 ? `<div class="t sel"><img src="${PORTRAIT}" alt=""></div>` : `<div class="t">${f}</div>`)).join('');
  duotone(PORTRAIT).then((url) => { $('portraitImg').src = url; }).catch(() => { $('portraitImg').src = PORTRAIT; });
  // ticking agent-select timer (cosmetic)
  let t = 80; const id = setInterval(() => { if ($('select').hidden) return; t = Math.max(0, t - 1); $('selTimer').textContent = t; if (t === 0) clearInterval(id); }, 1000);
  document.querySelectorAll('.abilities .a, .btn, .lockin').forEach((el) => el.addEventListener('mouseenter', () => sfx.hover()));
}

export function teamIcons(botNames) {
  $('teamL').innerHTML = `<div class="ic"><img src="${PORTRAIT}" alt=""></div>`;
  $('teamR').innerHTML = botNames.map(() => `<div class="ic">${BOT_ICON}</div>`).join('');
}
export function markBotDead(i) { const el = $('teamR').children[i]; if (el) el.classList.add('dead'); }

export function feed(killer, victim, { me = true, hs = false } = {}) {
  const d = document.createElement('div');
  d.innerHTML = `<span class="${me ? 'me' : 'them'}">${killer}</span>${hs ? HS_ICON : ''}<span class="ar">▸</span><span class="${me ? 'them' : 'me'}">${victim}</span>`;
  $('feed').prepend(d);
  setTimeout(() => d.remove(), 5200);
  while ($('feed').children.length > 6) $('feed').lastChild.remove();
}

let bannerT = null;
export function banner(b1, b2, b3 = '', cls = '', ms = 2200) {
  const el = $('banner'); $('b1').textContent = b1; $('b2').textContent = b2; $('b3').textContent = b3;
  el.className = 'banner on ' + cls; clearTimeout(bannerT);
  if (ms) bannerT = setTimeout(() => { el.className = 'banner ' + cls; }, ms);
}
export function hideBanner() { $('banner').className = 'banner'; }

let toastT = null;
export function toast(main, small = '', ms = 2200) {
  const el = $('toast'); el.innerHTML = `${small ? `<small>${small}</small>` : ''}${main}`; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}
let tipShown = '';
export function tip(text) {
  if (text === tipShown) return; tipShown = text;
  const el = $('tip'); if (text) { el.textContent = text; el.classList.add('on'); } else el.classList.remove('on');
}
export function countdown(n) { const el = $('countdown'); el.textContent = n; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
export function hitmarker(kind) { const el = $('hitm'); el.className = 'hitm'; void el.offsetWidth; el.className = 'hitm on ' + (kind || ''); }
export function damageDir(angle) {
  const d = document.createElement('div'); d.className = 'dd'; d.style.transform = `rotate(${angle}rad)`;
  $('dmgdirs').appendChild(d); setTimeout(() => d.remove(), 1100);
}
export function pulse(id) { const el = $(id); el.classList.remove('used'); void el.offsetWidth; el.classList.add('used'); }
export function flash() { const el = $('flashfx'); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 60); }

// ── unlock card ─────────────────────────────────────────────────────────────
let audioEl = null, raf = 0;
export function showCard({ winLabel, note, pending, roundNum, onNext, nextLabel }) {
  stopNote();
  const card = $('card');
  $('cardWin').textContent = winLabel;
  $('nextBtn').textContent = nextLabel || 'NEXT ROUND ▸';
  const body = card.querySelector('.card');
  if (note) {
    body.classList.remove('pending');
    $('cardTitle').textContent = 'VOICE NOTE UNLOCKED';
    $('cardFrom').textContent = 'FROM ' + note.from.toUpperCase();
    $('cardLine').textContent = note.line;
    $('cardImg').src = note.photo; $('cardImg').alt = note.from;
    $('cardTag').textContent = `VOICE NOTE ${roundNum}`;
    setupPlayer(note.audio);
  } else {
    body.classList.add('pending');
    $('cardTitle').textContent = 'VOICE NOTE INCOMING';
    $('cardFrom').textContent = 'FROM ???';
    $('cardLine').textContent = pending || 'Another voice note is on its way.';
    $('cardImg').src = PORTRAIT; $('cardImg').alt = 'Chikero';
    $('cardTag').textContent = 'COMING SOON';
  }
  show('card');
  $('nextBtn').onclick = () => { sfx.click(); stopNote(); show('card', false); onNext(); };
}

function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function setupPlayer(src) {
  audioEl = new Audio(src); audioEl.preload = 'metadata';
  const btn = $('playBtn'), cv = $('waveCv'), cx = cv.getContext('2d');
  btn.textContent = '▶'; btn.classList.remove('playing'); $('player').classList.remove('started'); $('ptime').textContent = '0:00';
  // pseudo-waveform bars (deterministic per file)
  let seed = 0; for (const ch of src) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const bars = []; for (let i = 0; i < 60; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; bars.push(0.25 + (seed / 4294967296) * 0.75 * (0.6 + 0.4 * Math.sin(i * 0.4))); }
  const draw = () => {
    const p = audioEl && audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
    cx.clearRect(0, 0, 600, 80);
    bars.forEach((b, i) => { cx.fillStyle = i / bars.length < p ? '#FF4655' : 'rgba(236,232,225,0.35)'; const h = b * 64; cx.fillRect(i * 10 + 1, 40 - h / 2, 6, h); });
    if (audioEl) $('ptime').textContent = `${fmt(audioEl.currentTime)} / ${fmt(audioEl.duration)}`;
    raf = requestAnimationFrame(draw);
  };
  cancelAnimationFrame(raf); draw();
  audioEl.addEventListener('ended', () => { btn.textContent = '↺'; btn.classList.remove('playing'); duck(false); });
  btn.onclick = () => {
    if (!audioEl) return;
    if (audioEl.paused) { audioEl.play().then(() => { btn.textContent = '❚❚'; btn.classList.add('playing'); $('player').classList.add('started'); duck(true); }).catch(() => {}); }
    else { audioEl.pause(); btn.textContent = '▶'; btn.classList.remove('playing'); duck(false); }
  };
  $('wave').onclick = (e) => { if (!audioEl || !audioEl.duration) return; const r = e.currentTarget.getBoundingClientRect(); audioEl.currentTime = ((e.clientX - r.left) / r.width) * audioEl.duration; };
}
export function stopNote() { if (audioEl) { audioEl.pause(); audioEl = null; } cancelAnimationFrame(raf); duck(false); }
export function setNoteVolume(v) { if (audioEl) audioEl.volume = Math.min(1, v * 1.25); }

// ── death ───────────────────────────────────────────────────────────────────
const deathLines = [
  'The deadlines got lucky. They always do on Mondays.',
  'Even main characters respawn. Go again.',
  'That was a warm-up. Everybody knows it.',
  'Per our last attempt: we go again.',
  'Not a loss. A soft launch.',
];
export function showDead(sub, onRetry) {
  $('deadSub').textContent = sub;
  $('deadLine').textContent = deathLines[Math.floor(Math.random() * deathLines.length)];
  show('dead');
  $('retryBtn').onclick = () => { sfx.click(); show('dead', false); onRetry(); };
}
addEventListener('keydown', (e) => { if (!$('dead').hidden && (e.code === 'Enter' || e.code === 'NumpadEnter')) { e.preventDefault(); $('retryBtn').click(); } });

// ── ending ──────────────────────────────────────────────────────────────────
let endAudio = null;
export function showEnding(onAgain) {
  $('endImg').src = PORTRAIT;
  $('endLines').innerHTML = ENDING.lines.map((l, i) => `<div style="animation-delay:${0.6 + i * 0.55}s">${l}</div>`).join('');
  $('xoxo').textContent = ENDING.signoff; $('xoxo').style.animationDelay = `${0.6 + ENDING.lines.length * 0.55 + 0.3}s`;
  $('gg').textContent = ENDING.title;
  const notes = $('notes');
  notes.innerHTML = VOICE_NOTES.map((n, i) => `<button data-i="${i}"><img src="${n.photo}" alt="">${n.from.toUpperCase()} ▶</button>`).join('');
  notes.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const n = VOICE_NOTES[+b.dataset.i];
    const was = b.classList.contains('on');
    notes.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
    if (endAudio) { endAudio.pause(); endAudio = null; duck(false); }
    if (was) return;
    endAudio = new Audio(n.audio); endAudio.play().catch(() => {}); duck(true); b.classList.add('on');
    endAudio.onended = () => { b.classList.remove('on'); duck(false); };
  }));
  show('ending');
  $('againBtn').onclick = () => { sfx.click(); if (endAudio) { endAudio.pause(); endAudio = null; } duck(false); show('ending', false); onAgain(); };
}

// ── map select ──────────────────────────────────────────────────────────────
// Valorant-style map vote: one card per MAPS entry (config.js). The card art is a stylised
// SVG until a real snapshot of the map (rendered with the game camera) fades in over it.
const MAP_ART = {
  zyoin: `<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id="za" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a5d93"/><stop offset=".55" stop-color="#f2a27a"/><stop offset="1" stop-color="#ffd8a8"/></linearGradient>
    <linearGradient id="zb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8d9c0"/><stop offset="1" stop-color="#b98d6a"/></linearGradient></defs>
    <rect width="400" height="250" fill="url(#za)"/><circle cx="300" cy="150" r="34" fill="#ffe2b0" opacity=".9"/>
    <path d="M0 160h40v-40h50v25h30v-60h60v45h40v-30h55v50h45v-35h80v135H0z" fill="#c8643b" opacity=".55"/>
    <path d="M0 250V150h70v-20h90v30h80v-40h90v35h70v95z" fill="url(#zb)"/>
    <g fill="#0f1923" opacity=".85">${[90, 140, 190, 250, 300, 350].map((x) => `<rect x="${x - 12}" y="178" width="24" height="30"/>`).join('')}</g>
    <g fill="#2f8f88">${[90, 140, 190, 250, 300, 350].map((x) => `<rect x="${x - 20}" y="178" width="7" height="30"/><rect x="${x + 13}" y="178" width="7" height="30"/>`).join('')}</g>
    <rect x="150" y="96" width="100" height="30" fill="#0f1923"/><text x="200" y="119" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="26" fill="#ff4655" letter-spacing="3">ZYOIN</text></svg>`,
  garba: `<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice"><defs>
    <radialGradient id="ga" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#c2185b"/><stop offset=".45" stop-color="#4a1550"/><stop offset="1" stop-color="#120b24"/></radialGradient></defs>
    <rect width="400" height="250" fill="url(#ga)"/>
    ${[0, 1, 2].map((k) => `<path d="M-10 ${40 + k * 34} Q200 ${100 + k * 40} 410 ${40 + k * 34}" stroke="#2a1b10" stroke-width="1.5" fill="none"/>`).join('')}
    ${Array.from({ length: 42 }, (_, i) => { const k = i % 3, t = (Math.floor(i / 3) + 0.5) / 14, x = -10 + t * 420, y = 40 + k * 34 + 2 * (60 + k * 6) * t * (1 - t); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${['#ffc21a', '#ff5fd2', '#7fe3d6', '#ff4655'][i % 4]}"/>`; }).join('')}
    <g stroke-linecap="round" stroke-width="9"><path d="M140 235L230 120" stroke="#ffc21a"/><path d="M260 235L170 120" stroke="#ff4655"/></g>
    <g fill="#120b24" opacity=".9">${[40, 95, 300, 355].map((x, i) => `<ellipse cx="${x}" cy="${222 - (i % 2) * 6}" rx="16" ry="40"/><circle cx="${x}" cy="${172 - (i % 2) * 6}" r="11"/>`).join('')}</g></svg>`,
};
const MAP_ART_DEFAULT = '<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice"><rect width="400" height="250" fill="#1b2733"/><path d="M0 250L120 120 200 190 280 90 400 250z" fill="#2f3e4d"/></svg>';

let mapSel = null; // { maps, picked, busy, onConfirm }
const cardOf = (id) => $('msCards').querySelector(`.msCard[data-id="${id}"]`);
export function buildMapSelect(maps) {
  $('msCards').innerHTML = maps.map((m, i) => `
    <button class="msCard" data-id="${m.id}" style="--i:${i}" aria-pressed="false">
      <div class="msArt">${MAP_ART[m.id] || MAP_ART_DEFAULT}<img class="msShot" alt=""></div>
      <div class="msShade"></div>
      <span class="msTag">${m.tag || 'MAP'}</span><span class="msIdx">${String(i + 1).padStart(2, '0')}</span>
      <div class="msInfo"><div class="msName">${m.name}</div><p class="msSub">${m.sub || ''}</p></div>
      <div class="msSoon"><b>COMING SOON</b><small>This map is still being built</small></div>
      <div class="msCheck">SELECTED</div>
      <i class="msC tl"></i><i class="msC tr"></i><i class="msC bl"></i><i class="msC br"></i>
    </button>`).join('');
  mapSel = { maps, picked: null, busy: false, onConfirm: null };
  $('msCards').querySelectorAll('.msCard').forEach((el) => {
    el.addEventListener('mouseenter', () => { if (!el.disabled) sfx.hover(); });
    el.addEventListener('click', () => pickMap(el.dataset.id));
    el.addEventListener('dblclick', () => { if (mapSel.picked === el.dataset.id) confirmMap(); });
  });
  $('msGo').addEventListener('click', confirmMap);
  $('msGo').addEventListener('mouseenter', () => sfx.hover());
  addEventListener('keydown', (e) => {
    if ($('mapsel').hidden || !mapSel || mapSel.busy) return;
    const ids = mapSel.maps.map((m) => m.id).filter((id) => !cardOf(id).disabled);
    if (!ids.length) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { const i = ids.indexOf(mapSel.picked); pickMap(ids[i < 0 ? 0 : (i + (e.code === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]); }
    else if (/^Digit[1-9]$/.test(e.code)) { const m = mapSel.maps[+e.code.slice(5) - 1]; if (m) pickMap(m.id); }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && mapSel.picked) { e.preventDefault(); confirmMap(); }
  });
}
function pickMap(id) {
  if (!mapSel || mapSel.busy || !id) return;
  const el = cardOf(id); if (!el || el.disabled) return;
  if (mapSel.picked !== id) sfx.click();
  mapSel.picked = id;
  $('msCards').querySelectorAll('.msCard').forEach((c) => { const on = c === el; c.classList.toggle('picked', on); c.setAttribute('aria-pressed', on); });
  $('msPickName').textContent = mapSel.maps.find((x) => x.id === id).name; $('mapsel').classList.add('haspick');
  $('msGo').disabled = false;
}
// Stays synchronous up to onConfirm(): the game requests pointer lock inside this click.
function confirmMap() {
  if (!mapSel || mapSel.busy || !mapSel.picked) return;
  mapSel.busy = true;
  const go = $('msGo'); go.classList.add('locked'); go.textContent = 'LOADING';
  $('mapsel').classList.add('confirmed');
  if (mapSel.onConfirm) mapSel.onConfirm(mapSel.picked);
}
export function setMapAvailable(id, ok) {
  const el = cardOf(id); if (!el) return;
  el.disabled = !ok; el.classList.toggle('soon', !ok);
  if (!ok && mapSel && mapSel.picked === id) { mapSel.picked = null; el.classList.remove('picked'); $('msGo').disabled = true; $('msPickName').textContent = '—'; $('mapsel').classList.remove('haspick'); }
}
export function setMapShot(id, url) {
  const el = cardOf(id); if (!el || !url) return;
  const img = el.querySelector('.msShot'); img.onload = () => img.classList.add('on'); img.src = url;
}
// opts: { current, available(id) → Promise<bool>, preview(id) → Promise<dataURL|null>, onConfirm(id) }
export function openMapSelect({ current, available, preview, onConfirm }) {
  const go = $('msGo'); go.classList.remove('locked'); go.textContent = 'CONFIRM'; go.disabled = true;
  $('mapsel').classList.remove('confirmed', 'haspick'); $('msPickName').textContent = '—';
  Object.assign(mapSel, { busy: false, picked: null, onConfirm });
  $('msCards').querySelectorAll('.msCard').forEach((c) => { c.classList.remove('picked'); c.setAttribute('aria-pressed', 'false'); });
  show('mapsel');
  // availability first (cheap), then pre-select the loaded map, then snapshots one at a time
  (async () => {
    for (const m of mapSel.maps) setMapAvailable(m.id, await available(m.id));
    if (!mapSel.picked && !mapSel.busy && current && cardOf(current) && !cardOf(current).disabled) pickMap(current);
    await new Promise((r) => setTimeout(r, 700)); // let the cards animate in first
    const order = [current, ...mapSel.maps.map((m) => m.id).filter((id) => id !== current)];
    for (const id of order) {
      if ($('mapsel').hidden || mapSel.busy) return;
      const el = cardOf(id); if (!el || el.disabled) continue;
      const url = await preview(id); setMapShot(id, url);
      if (!url && id !== current) setMapAvailable(id, await available(id)); // a preview build can reveal a broken map
    }
  })().catch((e) => console.warn('[mapselect]', e));
}
export function setIntroMap(m) {
  $('introMap').textContent = m.name;
  $('introSub').textContent = (m.sub || '').toUpperCase();
}
