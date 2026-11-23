// An original, procedurally generated piano score for the post-game film.
//
// Nothing here is sampled or transcribed: the harmony is a hand-written progression in E♭ major
// and the melody is composed at run time by a seeded generator (so it plays the same every time).
//
//   createScore(ctx, out)  -> { start, setSection, duck, finale, fadeOut, stop, setVolume }
//   renderOffline(seconds) -> AudioBuffer (used to test that the score is audible and never clips)
//
// Graph:  notes -> barGain -> pianoBus -> tone LP -> dry ─┐
//                                     └-> convolver -> wet ┤-> duck -> master -> comp -> out
//         pad   -> padBus ---------------------------------┘

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── harmony ─────────────────────────────────────────────────────────────────
// Pitch classes relative to E♭ (0 = E♭, 2 = F, 4 = G, 5 = A♭, 7 = B♭, 9 = C, 11 = D, 8 = C♭, 10 = D♭)
const KEY = 63; // E♭4
const CH = {
  I:     { bass: 0, tones: [0, 4, 7, 2] },        // E♭ add9
  I_3:   { bass: 4, tones: [0, 4, 7, 11] },       // E♭maj7 / G
  iii7:  { bass: 4, tones: [4, 7, 11, 2] },       // Gm7
  vi7:   { bass: 9, tones: [9, 0, 4, 7] },        // Cm7
  IV7:   { bass: 5, tones: [5, 9, 0, 4] },        // A♭maj7
  IV9:   { bass: 5, tones: [5, 9, 0, 7] },        // A♭ add9
  ii9:   { bass: 2, tones: [2, 5, 9, 0, 4] },     // Fm9
  Vsus:  { bass: 7, tones: [7, 0, 2, 5] },        // B♭7sus4
  IVoV:  { bass: 7, tones: [5, 9, 0, 4] },        // A♭maj7 / B♭ (the soft "almost home")
  bVII:  { bass: 10, tones: [10, 2, 5, 0] },      // D♭ add9 (borrowed lift)
  iv6:   { bass: 5, tones: [5, 8, 0, 2] },        // A♭m6 (minor plagal: the bittersweet one)
};
const PROG = {
  intro:   ['I', 'iii7', 'IV9', 'ii9', 'I_3', 'vi7', 'IV7', 'Vsus'],
  friends: ['IV7', 'IVoV', 'iii7', 'vi7', 'ii9', 'bVII', 'IV7', 'Vsus'],
  moments: ['I', 'I_3', 'IV9', 'vi7', 'ii9', 'iii7', 'IV7', 'IVoV'],
  depart:  ['vi7', 'IV9', 'I_3', 'Vsus', 'vi7', 'bVII', 'ii9', 'IVoV'],
};
// how busy / loud each part of the film is (0..1)
const INTENSITY = { opening: 0.12, intro: 0.32, friends: 0.82, moments: 0.55, depart: 0.38, final: 0.5 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const BPM = 64, BEAT = 60 / BPM, BAR = BEAT * 4;

// Melody rhythms in beats: [start, length]. Phrases are built as call (2 bars) + varied answer (2 bars).
const RHYTHMS = [
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[0.5, 1], [1.5, 1], [2.5, 1.5]],
  [[0, 3], [3, 1]],
  [[0, 1], [1, 1], [2, 2]],
  [[1, 1.5], [2.5, 0.5], [3, 1]],
  [[0, 4]],
];

// ── instruments ─────────────────────────────────────────────────────────────
// Soft piano: two slightly detuned "strings" + a few gently inharmonic partials, fast attack,
// two-stage decay, and a lowpass that closes as the note rings (hammer brightness fading).
function piano(ctx, out, t, midi, vel, dur) {
  const f = mtof(midi);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(Math.min(11000, 900 + vel * 5200 + f * 2), t);
  lp.frequency.setTargetAtTime(Math.max(420, f * 2.4), t + 0.01, 0.45);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
  const peak = vel * 0.13;
  const tc = clamp(2.6 - (midi - 50) * 0.05, 0.55, 3.4); // low notes ring longer
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.setTargetAtTime(peak * 0.42, t + 0.009, 0.11);
  g.gain.setTargetAtTime(0, t + 0.3, tc);
  const rel = Math.max(t + dur, t + 0.32);
  g.gain.setTargetAtTime(0, rel, 0.28); // damper
  const end = rel + 1.6;
  const B = 0.00035; // inharmonicity
  const parts = [[1, 1, -3], [1, 0.6, 4], [2, 0.32, 0], [3, 0.12, 0], [4, 0.06, 0], [6, 0.02, 0]];
  for (const [n, a, cents] of parts) {
    const pf = f * n * Math.sqrt(1 + B * n * n);
    if (pf > 16000) continue;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = pf; o.detune.value = cents;
    const pg = ctx.createGain(); pg.gain.value = a;
    o.connect(pg); pg.connect(lp); o.start(t); o.stop(end);
  }
  lp.connect(g); g.connect(out);
}

// Warm pad: detuned triangles (+ a whisper of saw) through a slow lowpass, long attack and release.
function pad(ctx, out, t, midis, dur, level, cutoff) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(cutoff * 0.6, t); lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.6);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + Math.min(1.6, dur * 0.4));
  g.gain.setValueAtTime(level, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 1.8);
  for (const m of midis) {
    for (const [type, d, a] of [['triangle', -7, 1.4], ['triangle', 6, 1.4], ['sawtooth', 0, 0.35]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = d;
      const og = ctx.createGain(); og.gain.value = a;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 1.9);
    }
  }
  lp.connect(g); g.connect(out);
}

export function buildImpulse(ctx, seconds = 3.4, decay = 2.6) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const rnd = mulberry32(77);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.35 + 0.6 * x; // darker as it decays
      lp = lp * k + (rnd() * 2 - 1) * (1 - k);
      const pre = i < rate * 0.012 ? 0 : 1; // short predelay
      d[i] = pre * lp * Math.pow(1 - x, decay) * 1.6;
    }
  }
  return buf;
}

// ── composer ────────────────────────────────────────────────────────────────
class Composer {
  constructor(seed = 25) {
    this.rnd = mulberry32(seed);
    this.section = 'opening'; this.pending = null;
    this.prog = 'intro'; this.barIdx = 0; this.inten = INTENSITY.opening;
    this.mel = KEY + 11; // D5-ish start
    this.motif = null; this.phraseBar = 0;
    this.finaleBar = -1;
  }
  setSection(s) { this.section = s; }
  // returns { chord, notes:[{t (beats), m, v, d (beats)}], pad:{midis, level, cutoff}|null, bars }
  nextBar() {
    const r = this.rnd;
    if (this.finaleBar >= 0) return this.finaleStep();
    const want = this.section === 'opening' ? 'intro' : this.section;
    if (PROG[want] && want !== this.prog) { this.prog = want; this.barIdx = 0; this.phraseBar = 0; this.motif = null; }
    const target = INTENSITY[this.section] ?? 0.4;
    this.inten += (target - this.inten) * 0.55;
    const I = this.inten;
    const name = PROG[this.prog][this.barIdx % PROG[this.prog].length];
    const ch = CH[name]; this.barIdx++;
    const notes = [];
    // left hand: bass note in octave 2/3, plus a fifth or octave on beat 3 once it opens up
    const bassM = 36 + (((39 + ch.bass) - 36) % 12 + 12) % 12; // C2..B2
    notes.push({ t: 0, m: bassM, v: 0.5 + I * 0.15, d: 4 });
    if (I > 0.25) notes.push({ t: 2, m: bassM + (r() < 0.5 ? 7 : 12), v: 0.32 + I * 0.1, d: 2 });
    // right hand
    const voicing = this.voice(ch.tones, 60, 74);
    if (I < 0.3) {
      voicing.forEach((m, i) => notes.push({ t: i * 0.07, m, v: 0.26, d: 4 }));
    } else {
      // flowing broken chord in eighths across ~1.5 octaves
      const pool = [...voicing, ...voicing.map((m) => m + 12)].filter((m) => m <= 84).sort((a, b) => a - b);
      const shapes = [[0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 1], [0, 1, 2, 4, 3, 2, 1, 2]];
      const shape = shapes[this.barIdx % shapes.length];
      const step = I > 0.6 ? 0.5 : 1;
      for (let b = 0, k = 0; b < 4; b += step, k++) {
        const m = pool[Math.min(pool.length - 1, shape[k % shape.length])];
        notes.push({ t: b + (r() - 0.5) * 0.03, m, v: (b % 2 === 0 ? 0.2 : 0.15) + I * 0.08, d: step * 1.6 });
      }
      if (I > 0.7) voicing.forEach((m, i) => notes.push({ t: i * 0.05, m, v: 0.18, d: 2 }));
    }
    // melody
    const melOn = this.section !== 'opening' && (this.section !== 'intro' || this.barIdx > 2);
    if (melOn) this.melody(ch, I, notes);
    this.phraseBar++;
    const padLevel = 0.012 + I * 0.03;
    const padM = this.voice(ch.tones, 51, 65).slice(0, 4);
    return { name, notes, pad: { midis: padM, level: padLevel, cutoff: 500 + I * 1500 }, bars: 1 };
  }
  // closest voicing of pitch classes inside [lo, hi]
  voice(pcs, lo, hi) {
    const out = [];
    for (const pc of pcs) { let m = KEY - 12 + ((pc % 12) + 12) % 12; while (m < lo) m += 12; while (m > hi) m -= 12; if (!out.includes(m)) out.push(m); }
    return out.sort((a, b) => a - b);
  }
  scaleNear(m, dir, steps) {
    // move `steps` scale degrees from m in direction dir (E♭ major)
    let x = m;
    for (let s = 0; s < steps; s++) { do { x += dir; } while (!MAJOR.includes((((x - KEY) % 12) + 12) % 12)); }
    return x;
  }
  snapToChord(m, tones) {
    let best = m, bd = 99;
    for (let d = -4; d <= 4; d++) { const pc = (((m + d - KEY) % 12) + 12) % 12; if (tones.includes(pc) && Math.abs(d) < bd) { bd = Math.abs(d); best = m + d; } }
    return best;
  }
  melody(ch, I, notes) {
    const r = this.rnd;
    const lo = 70, hi = this.section === 'friends' ? 89 : 86;
    const pos = this.phraseBar % 4;
    if (pos === 0 || !this.motif) {
      // compose a fresh two-bar call
      this.motif = [];
      for (let b = 0; b < 2; b++) {
        const rh = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
        const bar = [];
        for (const [st, len] of rh) {
          const dir = this.mel > (lo + hi) / 2 + 4 ? -1 : this.mel < lo + 4 ? 1 : (r() < 0.5 ? -1 : 1);
          const leap = r() < 0.2 ? 3 : r() < 0.6 ? 1 : 2;
          this.mel = clamp(this.scaleNear(this.mel, dir, leap), lo, hi);
          bar.push({ st, len, m: this.mel });
        }
        this.motif.push(bar);
      }
    }
    let bar = this.motif[pos % 2];
    if (pos >= 2) {
      // answer: same rhythm, contour shifted, re-fitted to the new chord; the last note leans home
      const shift = pos === 2 ? (r() < 0.5 ? -2 : 2) : -1;
      bar = bar.map((n, i) => ({ ...n, m: clamp(this.scaleNear(n.m, Math.sign(shift) || 1, Math.abs(shift)), lo, hi) }));
      if (pos === 3) { const last = bar[bar.length - 1]; last.len = Math.max(last.len, 1.5); }
    }
    const rest = this.section === 'depart' ? 0.35 : this.section === 'moments' ? 0.15 : 0.05;
    if (pos === 1 && r() < rest) return; // breathe
    bar.forEach((n, i) => {
      // strong beats sit on chord tones
      const m = (n.st % 2 === 0 || i === 0) ? this.snapToChord(n.m, ch.tones) : n.m;
      const v = 0.34 + I * 0.22;
      notes.push({ t: n.st, m, v, d: n.len, mel: true });
      if (I > 0.72) notes.push({ t: n.st + 0.01, m: m - 12, v: v * 0.45, d: n.len }); // octave doubling in the swell
    });
  }
  // the ending: A♭maj7 → A♭m6 → E♭ (add9), the last chord held to the fade
  startFinale() { this.finaleBar = 0; }
  finaleStep() {
    const i = this.finaleBar++;
    const seq = [['IV7', 0.75], ['iv6', 0.75], ['I', 4]];
    if (i >= seq.length) return { name: '-', notes: [], pad: null, bars: 1, done: true };
    const [name, bars] = seq[i]; const ch = CH[name];
    const notes = [];
    const bass = 39 + ch.bass;
    notes.push({ t: 0, m: bass, v: 0.55, d: bars * 4 }, { t: 0.02, m: bass + 12, v: 0.3, d: bars * 4 });
    this.voice(ch.tones, 60, 76).forEach((m, k) => notes.push({ t: 0.12 + k * 0.11, m, v: 0.3, d: bars * 4 }));
    // melody: G → C♭(= B) → B♭ … then a last, high E♭ that just hangs there
    const mel = [84, 83, 82][i]; // C → C♭ → B♭: the minor-plagal sigh
    notes.push({ t: 0, m: mel, v: 0.42, d: bars * 4, mel: true });
    if (i === 2) notes.push({ t: 2.2, m: 87, v: 0.2, d: 8, mel: true });
    return { name, notes, pad: { midis: this.voice(ch.tones, 51, 65), level: 0.03, cutoff: 900 }, bars };
  }
}

// ── live score ──────────────────────────────────────────────────────────────
export function createScore(ctx, out, { volume = 0.8 } = {}) {
  const master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.25;
  const duckG = ctx.createGain(); duckG.gain.value = 1;
  const pianoBus = ctx.createGain(); pianoBus.gain.value = 0.9;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 6000; tone.Q.value = 0.3;
  const dry = ctx.createGain(); dry.gain.value = 0.85;
  const conv = ctx.createConvolver(); conv.buffer = buildImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.42;
  const padBus = ctx.createGain(); padBus.gain.value = 1;
  pianoBus.connect(tone); tone.connect(dry); tone.connect(conv); padBus.connect(conv); padBus.connect(dry);
  conv.connect(wet); dry.connect(duckG); wet.connect(duckG); duckG.connect(master); master.connect(comp); comp.connect(out);

  const comp0 = new Composer(25);
  let nextT = 0, timer = 0, running = false, ended = false, vol = volume;
  const bars = []; // {t, g} for cutting not-yet-played bars on finale / stop

  function scheduleBar() {
    const bar = comp0.nextBar();
    if (bar.done) { ended = true; return; }
    const g = ctx.createGain(); g.gain.value = 1; g.connect(pianoBus);
    const t0 = nextT;
    for (const n of bar.notes) piano(ctx, g, t0 + Math.max(0, n.t) * BEAT, n.m, n.v, n.d * BEAT);
    if (bar.pad) { const pg = ctx.createGain(); pg.connect(padBus); g.pad = pg; pad(ctx, pg, t0, bar.pad.midis, bar.bars * BAR, bar.pad.level, bar.pad.cutoff); }
    bars.push({ t: t0, g });
    while (bars.length > 6) bars.shift();
    nextT += bar.bars * BAR;
  }
  function tick() {
    if (!running || ended) return;
    let guard = 0;
    while (nextT < ctx.currentTime + 0.45 && guard++ < 4) scheduleBar();
  }
  return {
    start(fadeIn = 2.5) {
      running = true; nextT = ctx.currentTime + 0.12;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(vol, ctx.currentTime + fadeIn);
      tick(); timer = setInterval(tick, 60);
    },
    setSection(s) { comp0.setSection(s); },
    setVolume(v) { if (v === vol) return; vol = v; if (running) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },
    duck(on) { duckG.gain.setTargetAtTime(on ? 0.28 : 1, ctx.currentTime, on ? 0.25 : 0.8); },
    finale() {
      // let whatever is ringing decay gently; drop bars that have not started yet; begin the cadence now
      const now = ctx.currentTime;
      for (const b of bars) {
        if (b.t > now + 0.02) { b.g.gain.setValueAtTime(0, now); if (b.g.pad) b.g.pad.gain.setValueAtTime(0, now); }
        else { b.g.gain.setTargetAtTime(0, now, 0.6); if (b.g.pad) b.g.pad.gain.setTargetAtTime(0, now, 0.9); }
      }
      comp0.startFinale(); nextT = now + 0.15; ended = false; tick();
    },
    fadeOut(sec = 3) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + sec);
      setTimeout(() => { running = false; clearInterval(timer); }, sec * 1000 + 200);
    },
    stop() { running = false; clearInterval(timer); const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(0, now, 0.15); setTimeout(() => { try { master.disconnect(); } catch (e) { /* */ } }, 1500); },
    // for offline rendering
    _composer: comp0, _schedule: scheduleBar, _setNext(t) { nextT = t; }, _master: master, _getNext: () => nextT,
  };
}

// Render the score offline with a typical film timeline; returns an AudioBuffer.
// plan: [[timeSec, section], ...]; a 'final' entry triggers the cadence.
export async function renderOffline(seconds = 80, plan = null, sampleRate = 44100) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  plan = plan || [[0, 'opening'], [6, 'intro'], [18, 'friends'], [40, 'moments'], [58, 'depart'], [70, 'final']];
  const s = createScore(ctx, ctx.destination, { volume: 1 });
  s._master.gain.value = 1;
  const comp = s._composer;
  s._setNext(0.05);
  let pi = 0; let finaleAt = Infinity;
  for (const [t, sec] of plan) if (sec === 'final') finaleAt = t;
  while (s._getNext() < seconds) {
    const t = s._getNext();
    while (pi < plan.length && plan[pi][0] <= t + 0.45) { if (plan[pi][1] !== 'final') comp.setSection(plan[pi][1]); pi++; }
    if (t >= finaleAt && comp.finaleBar < 0) { comp.startFinale(); }
    const before = s._getNext(); s._schedule(); if (s._getNext() === before) break;
  }
  // fade-out synced like the film does: 3.5s, starting ~6s after the finale chord
  if (finaleAt < seconds) { const fs = finaleAt + 7; s._master.gain.setValueAtTime(1, fs); s._master.gain.linearRampToValueAtTime(0.0001, fs + 3.5); }
  return ctx.startRendering();
}
