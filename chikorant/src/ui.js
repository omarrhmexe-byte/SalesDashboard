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
export function showEnding(onAgain, onReplay) {
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
  const stopEndAudio = () => { if (endAudio) { endAudio.pause(); endAudio = null; } notes.querySelectorAll('button').forEach((x) => x.classList.remove('on')); duck(false); };
  let replay = $('replayBtn');
  if (!replay) {
    replay = document.createElement('button'); replay.id = 'replayBtn'; replay.className = 'btn ghost replayBtn'; replay.textContent = 'REPLAY THE FILM';
    $('againBtn').insertAdjacentElement('afterend', replay);
    replay.addEventListener('mouseenter', () => sfx.hover());
  }
  replay.hidden = !onReplay;
  replay.onclick = () => { sfx.click(); stopEndAudio(); onReplay(); };
  show('ending');
  $('againBtn').onclick = () => { sfx.click(); stopEndAudio(); show('ending', false); onAgain(); };
}
