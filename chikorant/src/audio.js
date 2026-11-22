// Procedural WebAudio sound design. Every sound here is synthesised — no samples.
//
// Graph:  sources -> sfxBus ---------\
//                 -> revIn -> convolver -> revOut -> sfxBus (shared short stereo room tail)
//         music/ambience -> musicBus -> comp -> master -> limiter -> destination
let ctx = null, master, sfxBus, musicBus, comp, limiter, noiseBuf, revIn;
let volume = 0.8;
let ambience = null, lobby = null;
const listeners = [];

// Equal-tempered helper (midi note -> Hz)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function buildImpulse(c, seconds = 0.9, decay = 3.2) {
  const rate = c.sampleRate, len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // decorrelated noise per channel, darkened by a one-pole lowpass that closes over time
      const k = 0.55 + 0.4 * x;
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - x, decay) * (i < 90 ? i / 90 : 1) * 2.2;
    }
  }
  return buf;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
  master = ctx.createGain(); master.gain.value = volume;
  // final brick-wall-ish limiter so nothing clips whatever the volume
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.55;
  sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(limiter); limiter.connect(ctx.destination);

  // shared reverb (impulse built once)
  const conv = ctx.createConvolver(); conv.buffer = buildImpulse(ctx);
  revIn = ctx.createGain(); revIn.gain.value = 1;
  const revOut = ctx.createGain(); revOut.gain.value = 0.55;
  revIn.connect(conv); conv.connect(revOut); revOut.connect(sfxBus);

  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  listeners.forEach((f) => f());
}
export function onAudioReady(f) { listeners.push(f); }
export function setVolume(v) {
  volume = v;
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}
export function getVolume() { return volume; }
export function duck(on) {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(on ? 0.06 : 0.55, ctx.currentTime, 0.3);
  sfxBus.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.3);
}

const now = () => ctx.currentTime;
const rnd = (a, b) => a + Math.random() * (b - a);

function env(g, t, a, peak, dec) {
  // linear attack, then a natural exponential decay (time constant dec/4 => ~-35dB at `dec`)
  const aa = Math.max(a, 0.0008);
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + aa);
  g.gain.setTargetAtTime(0, t + aa, Math.max(dec, 0.01) / 4);
}
// optional stereo pan inserted before the destination
function route(g, out, pan) {
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out); } else g.connect(out);
}
function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, a = 0.002, dec = dur, out = sfxBus, rate = 1, f2 = null, pan = 0 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dec);
  s.connect(f); f.connect(g); route(g, out, pan);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  return { s, f, g };
}
function tone(t, dur, { type = 'sine', freq = 440, f2 = null, gain = 0.3, a = 0.004, dec = dur, out = sfxBus, detune = 0, pan = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dec);
  o.connect(g); route(g, out, pan); o.start(t); o.stop(t + dur + 0.05);
  return { o, g };
}
// pentatonic-ish sparkle / bell: fundamental + inharmonic partials
function bell(t, f, gain = 0.15, dec = 0.6, out = sfxBus) {
  tone(t, dec, { freq: f, gain, dec, out });
  tone(t, dec * 0.6, { freq: f * 2.76, gain: gain * 0.35, dec: dec * 0.5, out });
  tone(t, dec * 0.3, { freq: f * 5.4, gain: gain * 0.15, dec: dec * 0.25, out });
}
// dhol / tabla voices (shared by dash, boom flourish, lobby)
function dholLow(t, g = 0.5, out = sfxBus) {
  tone(t, 0.16, { freq: 150, f2: 62, gain: g, dec: 0.15, out });
  noise(t, 0.04, { type: 'lowpass', freq: 1200, gain: g * 0.5, dec: 0.035, out });
}
function dholTa(t, g = 0.3, out = sfxBus) {
  tone(t, 0.09, { freq: 240, f2: 130, gain: g, dec: 0.08, out });
  noise(t, 0.03, { type: 'bandpass', freq: 2800, q: 2, gain: g * 0.6, dec: 0.025, out });
}
function tablaNa(t, g = 0.2, out = sfxBus) {
  tone(t, 0.14, { freq: 520, f2: 470, gain: g, dec: 0.12, out });
  tone(t, 0.05, { freq: 1560, gain: g * 0.3, dec: 0.04, out });
}

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic (Bhoopali)
const KILL_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];

export const sfx = {
  // The Aux Cord: layered crack + body + thump, with a reverb-only tail. Each shot varies in pitch/level/pan.
  shot(slow = false) {
    if (!ctx) return; const t = now();
    const p = rnd(0.94, 1.06) * (slow ? 0.78 : 1), lv = rnd(0.86, 1);
    const pan = rnd(-0.06, 0.06);
    noise(t, 0.05, { type: 'bandpass', freq: 3400 * p, q: 0.7, gain: 0.8 * lv, a: 0.0008, dec: 0.05, pan });           // crack
    noise(t, 0.15, { type: 'lowpass', freq: 1500 * p, f2: 300, q: 0.7, gain: 0.9 * lv, a: 0.001, dec: 0.14, pan });     // body blast
    tone(t, 0.14, { freq: 190 * p, f2: 48, gain: 1.0 * lv, a: 0.001, dec: 0.16, pan });                                  // thump
    tone(t, 0.07, { type: 'triangle', freq: 430 * p, f2: 120, gain: 0.4 * lv, a: 0.001, dec: 0.07, pan });               // mid punch
    noise(t + 0.01, 0.5, { type: 'lowpass', freq: 900, f2: 250, q: 0.3, gain: 0.3 * lv, a: 0.004, dec: 0.46, out: revIn });  // stereo tail
  },
  dry() { if (!ctx) return; const t = now(); tone(t, 0.03, { type: 'square', freq: 1800, gain: 0.08, dec: 0.03 }); noise(t, 0.02, { type: 'highpass', freq: 4000, gain: 0.06, dec: 0.02 }); },
  reload() {
    if (!ctx) return; const t = now();
    const click = (dt, f, g = 0.25, low = 0) => {
      noise(t + dt, 0.05, { type: 'bandpass', freq: f, q: 4, gain: g, dec: 0.04 });
      tone(t + dt, 0.03, { type: 'triangle', freq: f / 3, gain: g * 0.4, dec: 0.03 });
      if (low) tone(t + dt, 0.07, { freq: low, f2: low * 0.5, gain: g * 0.9, dec: 0.06 });
    };
    click(0.1, 1400, 0.25, 140); click(0.5, 900, 0.2); click(1.15, 2000, 0.3, 120); click(1.25, 1200, 0.2); click(1.65, 2600, 0.3, 160); click(1.72, 1600, 0.25);
  },
  // crisp tick
  hit() {
    if (!ctx) return; const t = now();
    tone(t, 0.06, { type: 'triangle', freq: 1500, f2: 1100, gain: 0.5, a: 0.001, dec: 0.06 });
    tone(t, 0.05, { freq: 320, f2: 160, gain: 0.5, a: 0.001, dec: 0.05 });
    noise(t, 0.03, { type: 'highpass', freq: 4000, gain: 0.3, a: 0.001, dec: 0.025 });
  },
  // bright metallic ping + crack, with a little room
  headshot() {
    if (!ctx) return; const t = now();
    noise(t, 0.05, { type: 'highpass', freq: 3500, gain: 0.3, a: 0.001, dec: 0.045 });
    tone(t, 0.08, { freq: 260, f2: 110, gain: 0.35, a: 0.001, dec: 0.07 });
    [[2093, 0.3, 0.45], [3136, 0.2, 0.4], [4698, 0.1, 0.25], [6300, 0.05, 0.15]].forEach(([f, g, d]) => {
      const x = tone(t, d, { freq: f, gain: g, a: 0.001, dec: d }); x.g.connect(revIn);
    });
  },
  // rises in pitch with kill count (pentatonic steps, octave jump at 6)
  kill(n = 1) {
    if (!ctx) return; const t = now();
    const i = Math.max(0, Math.min(5, (n | 0) - 1));
    const base = 523.25 * KILL_RATIOS[i];
    noise(t, 0.04, { type: 'highpass', freq: 3000, gain: 0.2, a: 0.001, dec: 0.035 });
    tone(t, 0.18, { freq: base / 4, f2: base / 8, gain: 0.5, a: 0.001, dec: 0.17 });                    // thump
    bell(t, base, 0.2, 0.7); tone(t, 0.5, { type: 'triangle', freq: base * 2, gain: 0.08, dec: 0.45 });
    bell(t + 0.07, base * 1.5, 0.16, 0.6);
    if (n >= 3) bell(t + 0.14, base * 2, 0.14, 0.6);
    if (n >= 5) { [0.2, 0.26, 0.32].forEach((dt, k) => bell(t + dt, base * 2 * KILL_RATIOS[k + 2] / 1.25, 0.08, 0.5)); }
    noise(t + 0.05, 0.35, { type: 'bandpass', freq: 6000, q: 2, gain: 0.06, dec: 0.3, out: revIn });
  },
  hurt() { if (!ctx) return; const t = now(); tone(t, 0.18, { freq: 110, f2: 55, gain: 0.5, dec: 0.16 }); noise(t, 0.12, { type: 'lowpass', freq: 700, gain: 0.3, dec: 0.1 }); },
  botShot(dist = 10) {
    if (!ctx) return; const t = now(); const g = Math.max(0.1, 0.6 - dist * 0.012);
    const pan = rnd(-0.5, 0.5);
    tone(t, 0.25, { type: 'sawtooth', freq: 900, f2: 160, gain: g * 0.5, dec: 0.22, pan });
    noise(t, 0.12, { type: 'bandpass', freq: Math.max(700, 1800 - dist * 40), q: 1.5, gain: g, dec: 0.1, pan });
    noise(t, 0.35, { type: 'lowpass', freq: 800, gain: g * 0.4, dec: 0.3, out: revIn });
  },
  whiz() { if (!ctx) return; const t = now(); noise(t, 0.18, { type: 'bandpass', freq: 3500, f2: 900, q: 7, gain: 0.5, a: 0.03, dec: 0.15, pan: rnd(-0.6, 0.6) }); },
  shieldBreak() {
    if (!ctx) return; const t = now();
    tone(t, 0.3, { type: 'square', freq: 800, f2: 200, gain: 0.1, dec: 0.28 });
    noise(t, 0.25, { type: 'highpass', freq: 2500, gain: 0.22, dec: 0.2 });
    [3200, 4100, 5300, 6700].forEach((f, i) => bell(t + i * 0.025, f, 0.05, 0.3, revIn));
  },
  // Garba Dash: fast whoosh + dhol/tabla flourish + quick pentatonic sparkle
  dash() {
    if (!ctx) return; const t = now();
    noise(t, 0.34, { type: 'bandpass', freq: 500, f2: 4500, q: 1.2, gain: 0.45, a: 0.02, dec: 0.3 });
    dholLow(t, 0.45); tablaNa(t + 0.07, 0.18); dholTa(t + 0.12, 0.28); dholLow(t + 0.17, 0.3); tablaNa(t + 0.22, 0.15);
    [0, 2, 4, 7, 9].forEach((s, i) => tone(t + 0.03 + i * 0.045, 0.22, { type: 'triangle', freq: mtof(76 + s), gain: 0.1, dec: 0.2 }));
    noise(t + 0.04, 0.2, { type: 'highpass', freq: 7000, gain: 0.05, dec: 0.18 }); // jingly shaker
  },
  // Cat Rescue: rising wind updraft with airy whistle and sparkle at the top
  updraft() {
    if (!ctx) return; const t = now();
    noise(t, 1.0, { type: 'bandpass', freq: 250, f2: 2600, q: 0.8, gain: 0.5, a: 0.18, dec: 0.82 });
    noise(t, 0.9, { type: 'highpass', freq: 800, f2: 3500, gain: 0.12, a: 0.25, dec: 0.65 });
    noise(t, 0.7, { type: 'lowpass', freq: 350, gain: 0.35, a: 0.01, dec: 0.6 });
    tone(t, 0.9, { freq: 280, f2: 900, gain: 0.07, a: 0.2, dec: 0.7, out: revIn });
    tone(t, 0.08, { freq: 90, f2: 40, gain: 0.5, dec: 0.08 });
    [76, 79, 81, 88].forEach((m, i) => bell(t + 0.55 + i * 0.07, mtof(m), 0.05, 0.5, revIn));
  },
  // Main Character ult: sub impact, rising filtered chord swell, riser noise, shimmering top
  ult() {
    if (!ctx) return; const t = now();
    tone(t, 1.8, { freq: 75, f2: 32, gain: 0.8, a: 0.003, dec: 1.7 });
    noise(t, 0.4, { type: 'lowpass', freq: 3500, f2: 200, gain: 0.5, a: 0.002, dec: 0.38 });
    noise(t, 2.0, { type: 'bandpass', freq: 250, f2: 6000, q: 0.7, gain: 0.35, a: 1.1, dec: 0.9, out: revIn });
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(4200, t + 1.5);
    const g = ctx.createGain(); env(g, t, 1.3, 0.16, 1.0);
    lp.connect(g); g.connect(sfxBus); g.connect(revIn);
    [0, 7, 12, 16, 19].forEach((s, i) => {
      [-8, 8].forEach((dt) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(48 + s); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + 2.4); });
    });
    [84, 88, 91, 96].forEach((m, i) => tone(t + 0.9 + i * 0.09, 1.4, { type: 'triangle', freq: mtof(m), gain: 0.07, a: 0.05, dec: 1.2, out: revIn }));
  },
  ultEnd() { if (!ctx) return; const t = now(); tone(t, 0.6, { freq: 700, f2: 150, gain: 0.2, dec: 0.55 }); noise(t, 0.6, { type: 'lowpass', freq: 3000, f2: 150, gain: 0.25, a: 0.02, dec: 0.55 }); },
  ultReady() { if (!ctx) return; const t = now(); [79, 84, 88, 91, 96].forEach((m, i) => bell(t + i * 0.06, mtof(m), 0.1, 0.7, sfxBus)); },
  jump() { if (!ctx) return; const t = now(); noise(t, 0.08, { type: 'lowpass', freq: 500, gain: 0.4, dec: 0.07 }); },
  land(h = 1) { if (!ctx) return; const t = now(); noise(t, 0.12, { type: 'lowpass', freq: 380, gain: Math.min(0.9, 0.3 * h), dec: 0.1 }); tone(t, 0.08, { freq: 80, f2: 45, gain: Math.min(0.6, 0.15 * h), dec: 0.07 }); },
  step(walk) { if (!ctx) return; const t = now(); noise(t, 0.06, { type: 'bandpass', freq: rnd(250, 420), q: 1.2, gain: walk ? 0.1 : 0.26, dec: 0.05, pan: rnd(-0.1, 0.1) }); },
  // countdown beeps: clean, short, slightly percussive
  beep(hi = false) {
    if (!ctx) return; const t = now(); const f = hi ? 1320 : 880;
    tone(t, 0.14, { freq: f, gain: 0.35, a: 0.002, dec: 0.12 });
    tone(t, 0.14, { type: 'square', freq: f, gain: 0.1, a: 0.002, dec: 0.1 });
    if (hi) tone(t, 0.3, { freq: f * 2, gain: 0.05, dec: 0.25, out: revIn });
  },
  // bomb-ish plant beep, bright & woody
  cakeBeep() {
    if (!ctx) return; const t = now();
    tone(t, 0.09, { freq: 1975, gain: 0.3, a: 0.001, dec: 0.08 });
    tone(t, 0.09, { type: 'triangle', freq: 987.8, gain: 0.14, a: 0.001, dec: 0.08 });
    noise(t, 0.012, { type: 'highpass', freq: 5000, gain: 0.05, dec: 0.01 });
  },
  // barrier drop: descending servo sweep + rumble + heavy clunk
  barrier() {
    if (!ctx) return; const t = now();
    tone(t, 0.6, { type: 'sawtooth', freq: 240, f2: 50, gain: 0.2, dec: 0.55 });
    noise(t, 0.7, { type: 'bandpass', freq: 3000, f2: 250, q: 1, gain: 0.35, a: 0.01, dec: 0.65 });
    tone(t + 0.05, 0.4, { freq: 60, f2: 38, gain: 0.7, dec: 0.38 });
    tone(t + 0.6, 0.2, { freq: 110, f2: 50, gain: 0.6, dec: 0.18 }); noise(t + 0.6, 0.1, { type: 'lowpass', freq: 1500, gain: 0.4, dec: 0.09 });
  },
  // LOCK IN: deep impact, metallic hit, rising powerchord swell
  lockIn() {
    if (!ctx) return; const t = now();
    tone(t, 1.0, { freq: 62, f2: 36, gain: 0.95, a: 0.002, dec: 0.95 });
    noise(t, 0.5, { type: 'lowpass', freq: 3500, f2: 250, gain: 0.55, a: 0.001, dec: 0.45 });
    noise(t, 0.08, { type: 'highpass', freq: 3000, gain: 0.4, a: 0.001, dec: 0.07 });
    [880, 1318, 2217, 3320].forEach((f, i) => tone(t, 0.9, { freq: f, gain: 0.07 / (1 + i * 0.4), dec: 0.8, out: revIn }));
    [[48, 0.08], [55, 0.07], [60, 0.06], [67, 0.05]].forEach(([m, g], i) => tone(t + 0.04 + i * 0.03, 1.6, { type: 'sawtooth', freq: mtof(m), gain: g * 0.6, a: 0.01, dec: 1.5, out: revIn }));
    [64, 67, 72].forEach((m) => tone(t, 1.6, { type: 'triangle', freq: mtof(m), gain: 0.08, dec: 1.5 }));
  },
  click() { if (!ctx) return; const t = now(); tone(t, 0.04, { type: 'triangle', freq: 1500, gain: 0.2, a: 0.001, dec: 0.04 }); },
  hover() { if (!ctx) return; const t = now(); tone(t, 0.03, { freq: 2400, gain: 0.08, dec: 0.03 }); },
  roundStart() {
    if (!ctx) return; const t = now();
    [55, 60, 64, 67].forEach((m, i) => tone(t + i * 0.08, 0.55, { type: 'triangle', freq: mtof(m + 12), gain: 0.13, dec: 0.5, out: sfxBus }));
    tone(t, 0.6, { freq: 98, f2: 60, gain: 0.45, dec: 0.55 });
    dholLow(t, 0.4); dholTa(t + 0.12, 0.2); dholLow(t + 0.2, 0.3);
    noise(t, 0.5, { type: 'highpass', freq: 5000, gain: 0.05, a: 0.1, dec: 0.4, out: revIn });
  },
  // Victory: major fanfare, bell arpeggio and tabla flourish
  win() {
    if (!ctx) return; const t = now();
    const chord = (dt, ms, d) => ms.forEach((m) => { const f = mtof(m); tone(t + dt, d, { type: 'sawtooth', freq: f, gain: 0.04, a: 0.02, dec: d, out: revIn }); tone(t + dt, d, { type: 'triangle', freq: f, gain: 0.08, a: 0.01, dec: d }); });
    chord(0, [60, 64, 67], 0.5); chord(0.22, [62, 66, 69], 0.5); chord(0.44, [67, 71, 74, 79], 2.2);
    tone(t, 0.5, { freq: 65, gain: 0.6, dec: 0.45 }); tone(t + 0.44, 2, { freq: 98, gain: 0.5, dec: 1.9 });
    [79, 83, 86, 91, 95, 98].forEach((m, i) => bell(t + 0.5 + i * 0.07, mtof(m), 0.08, 0.9, revIn));
    dholLow(t + 0.44, 0.45); tablaNa(t + 0.56, 0.18); dholTa(t + 0.62, 0.25); dholLow(t + 0.7, 0.35);
    noise(t + 0.44, 1.5, { type: 'highpass', freq: 6000, gain: 0.08, a: 0.01, dec: 1.4 });
  },
  lose() {
    if (!ctx) return; const t = now();
    [[67, 70], [65, 68], [62, 66], [58, 62]].forEach((ms, i) => ms.forEach((m) => tone(t + i * 0.3, 1.0, { type: 'triangle', freq: mtof(m), gain: 0.1, dec: 0.95, out: i === 3 ? revIn : sfxBus })));
    tone(t, 2.0, { freq: 82, f2: 41, gain: 0.5, dec: 1.9 });
    noise(t + 0.9, 1.2, { type: 'lowpass', freq: 600, f2: 150, gain: 0.12, a: 0.1, dec: 1.0 });
  },
  catSafe() { if (!ctx) return; const t = now(); tone(t, 0.18, { type: 'triangle', freq: 700, f2: 1100, gain: 0.15, dec: 0.16 }); tone(t + 0.16, 0.3, { type: 'triangle', freq: 1100, f2: 650, gain: 0.15, dec: 0.28 }); },
  meow() {
    if (!ctx) return; const t = now();
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(500, t); o.frequency.linearRampToValueAtTime(900, t + 0.15); o.frequency.linearRampToValueAtTime(600, t + 0.45);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1800, t + 0.15); f.frequency.linearRampToValueAtTime(1000, t + 0.45);
    const g = ctx.createGain(); env(g, t, 0.04, 0.25, 0.45);
    o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.55);
  },
  aura() { if (!ctx) return; const t = now(); [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => { bell(t + i * 0.05, mtof(m), 0.09, 0.8, sfxBus); }); },
  plantTick() { if (!ctx) return; const t = now(); tone(t, 0.05, { type: 'square', freq: 660, gain: 0.12, a: 0.001, dec: 0.04 }); },
  planted() {
    if (!ctx) return; const t = now();
    tone(t, 0.6, { freq: 80, f2: 55, gain: 0.6, dec: 0.55 });
    noise(t, 0.08, { type: 'lowpass', freq: 1500, gain: 0.3, dec: 0.07 });
    [84, 88, 91].forEach((m, i) => tone(t + i * 0.08, 0.4, { type: 'square', freq: mtof(m), gain: 0.05, dec: 0.35 }));
    bell(t + 0.24, mtof(96), 0.1, 0.6, revIn);
  },
  // Birthday detonation: huge boom, then a celebratory flourish (dhol roll, bell run, sparkles)
  boom() {
    if (!ctx) return; const t = now();
    tone(t, 2.8, { freq: 58, f2: 22, gain: 1, a: 0.002, dec: 2.7 });
    noise(t, 2.4, { type: 'lowpass', freq: 4500, f2: 110, gain: 0.85, a: 0.003, dec: 2.3 });
    noise(t, 0.3, { type: 'highpass', freq: 2000, gain: 0.5, a: 0.001, dec: 0.25 });
    noise(t, 2.0, { type: 'lowpass', freq: 1200, f2: 200, gain: 0.35, a: 0.01, dec: 1.9, out: revIn });
    // flourish after the blast settles
    const f0 = t + 0.7;
    for (let i = 0; i < 8; i++) (i % 2 ? dholTa : dholLow)(f0 + i * 0.07, 0.25 + i * 0.03);
    dholLow(f0 + 0.6, 0.55);
    [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].forEach((s, i) => bell(f0 + 0.1 + i * 0.075, mtof(72 + s), 0.09, 1.1, revIn));
    [72, 76, 79, 84].forEach((m) => tone(f0 + 0.95, 2.2, { type: 'triangle', freq: mtof(m), gain: 0.08, a: 0.03, dec: 2.0, out: revIn }));
    for (let i = 0; i < 14; i++) noise(f0 + 0.2 + Math.random() * 1.6, 0.03, { type: 'highpass', freq: rnd(4500, 8000), gain: 0.07, a: 0.001, dec: 0.025, pan: rnd(-0.8, 0.8) });
  },
  firework() {
    if (!ctx) return; const t = now() + rnd(0, 0.05);
    const pan = rnd(-0.7, 0.7);
    noise(t, 0.5, { type: 'lowpass', freq: 1800, f2: 200, gain: 0.3, a: 0.003, dec: 0.45, pan });
    tone(t, 0.1, { freq: 120, f2: 50, gain: 0.35, dec: 0.09, pan });
    noise(t + 0.1, 0.5, { type: 'lowpass', freq: 900, gain: 0.15, a: 0.02, dec: 0.45, out: revIn });
    for (let i = 0; i < 8; i++) noise(t + 0.15 + Math.random() * 0.8, 0.03, { type: 'highpass', freq: rnd(4500, 7500), gain: 0.07, a: 0.001, dec: 0.025, pan });
  },
  catChime() { sfx.aura(); },
};

// ── music ───────────────────────────────────────────────────────────────────
// Lobby: 6/8 garba/dandiya groove in D Bhoopali (D E F# A B). Tanpura-style drone plucks, dhol + dandiya
// stick ticks, pentatonic pluck melody with a dotted echo, soft pad. 8 bars ≈ 9s, scheduled on an
// absolute clock a bar at a time so it loops seamlessly with only ~20 nodes/bar.
const E = 0.19;            // one eighth note
const BAR = E * 6;
const SC = [0, 2, 4, 7, 9];
const scaleNote = (d) => 62 + Math.floor(d / 5) * 12 + SC[((d % 5) + 5) % 5]; // degree 0 = D4
const MELODY = [
  [2, null, 3, 4, null, 3], [5, null, null, 4, 3, 2], [4, null, 5, 6, null, 5], [4, 3, null, 2, null, null],
  [3, null, 4, 5, null, 4], [6, null, 5, 4, null, 3], [4, 5, 6, 7, null, 6], [5, null, 4, 2, null, 0],
];
// pad chords (midi) every 2 bars and drone/bass root
const PADS = [[50, 54, 57], [47, 50, 54], [52, 57, 59], [45, 50, 52]];

export function startLobbyMusic() {
  if (!ctx || lobby) return;
  const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(musicBus);
  out.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2);
  const delay = ctx.createDelay(); delay.delayTime.value = E * 3; const fb = ctx.createGain(); fb.gain.value = 0.32;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
  delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(out);
  const pluckBus = ctx.createGain(); pluckBus.gain.value = 1; pluckBus.connect(out); pluckBus.connect(delay);

  const pluck = (tt, f, g, dec) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 2;
    fl.frequency.setValueAtTime(f * 7, tt); fl.frequency.exponentialRampToValueAtTime(f * 1.3, tt + dec);
    const gn = ctx.createGain(); env(gn, tt, 0.004, g, dec);
    o.connect(fl); fl.connect(gn); gn.connect(pluckBus); o.start(tt); o.stop(tt + dec + 0.05);
  };
  const padChord = (tt, ms) => {
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900; fl.connect(out);
    const d = BAR * 2;
    ms.forEach((m) => [-7, 7].forEach((dt) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.detune.value = dt;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.02, tt + 0.7);
      g.gain.setValueAtTime(0.02, tt + d - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, tt + d + 0.9);
      o.connect(g); g.connect(fl); o.start(tt); o.stop(tt + d + 1);
    }));
  };

  let bar = 0, next = ctx.currentTime + 0.15, stopped = false;
  function scheduleBar() {
    const b = bar % 8, tt = next;
    if (b % 2 === 0) padChord(tt, PADS[b >> 1]);
    // tanpura-ish drone: Pa Sa Sa low-Sa
    [[0, 45], [1, 50], [2, 50], [3, 38]].forEach(([s, m]) => pluck(tt + s * E, mtof(m), 0.07, 0.9));
    // melody
    MELODY[b].forEach((d, s) => { if (d !== null) pluck(tt + s * E, mtof(scaleNote(d)), 0.075, 0.5); });
    // dhol 6/8: DHA . . ta . .  with dandiya stick ticks on 1,2,4,5
    dholLow(tt, 0.26, out); dholTa(tt + 3 * E, 0.15, out);
    [1, 2, 4, 5].forEach((s) => noise(tt + s * E, 0.03, { type: 'bandpass', freq: 3600, q: 5, gain: s % 3 === 1 ? 0.05 : 0.035, a: 0.001, dec: 0.025, out }));
    if (b === 7) { tablaNa(tt + 4 * E, 0.1, out); tablaNa(tt + 5 * E, 0.1, out); }
    noise(tt + 2 * E, 0.04, { type: 'highpass', freq: 7500, gain: 0.025, dec: 0.035, out }); // shaker
    next += BAR; bar++;
  }
  function schedule() { if (stopped) return; while (next < ctx.currentTime + 1.6) scheduleBar(); }
  const id = setInterval(schedule, 250); schedule();
  lobby = { stop() { stopped = true; clearInterval(id); out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => out.disconnect(), 2500); } };
}
export function stopLobbyMusic() { if (lobby) { lobby.stop(); lobby = null; } }

// In-match ambience: quiet courtyard — layered wind, a faint murmur of chatter and occasional birds.
export function startAmbience() {
  if (!ctx || ambience) return;
  const amb = ctx.createGain(); amb.gain.value = 0.0001; amb.connect(musicBus);
  amb.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 3);
  const srcs = [];
  const loopNoise = (type, freq, q, gain) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(amb); s.start(0, Math.random() * 1.5); srcs.push(s);
    return { f, g };
  };
  const lfo = (rate, depth, param) => { const o = ctx.createOscillator(); o.frequency.value = rate; const lg = ctx.createGain(); lg.gain.value = depth; o.connect(lg); lg.connect(param); o.start(); srcs.push(o); };
  const w1 = loopNoise('lowpass', 420, 0.5, 0.05); lfo(0.08, 180, w1.f.frequency);
  const w2 = loopNoise('bandpass', 900, 0.6, 0.018); lfo(0.05, 0.012, w2.g.gain); lfo(0.11, 300, w2.f.frequency);
  const ch = loopNoise('bandpass', 650, 1.6, 0.007); lfo(3.7, 0.004, ch.g.gain); lfo(0.17, 0.004, ch.g.gain); lfo(0.3, 120, ch.f.frequency);

  let timer = 0;
  const bird = () => {
    if (!ambience) return;
    const t = ctx.currentTime, n = 2 + ((Math.random() * 4) | 0), base = rnd(2600, 4600), pan = rnd(-0.8, 0.8);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.09, 0.14), f = base * rnd(0.92, 1.1);
      tone(tt, 0.08, { freq: f, f2: f * rnd(0.7, 1.35), gain: 0.022, a: 0.01, dec: 0.07, out: amb, pan });
      tone(tt, 0.1, { freq: f, gain: 0.006, a: 0.01, dec: 0.09, out: revIn, pan });
    }
    timer = setTimeout(bird, rnd(2500, 8000));
  };
  timer = setTimeout(bird, 1500);
  ambience = { stop() { clearTimeout(timer); ambience = null; amb.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); setTimeout(() => { srcs.forEach((s) => { try { s.stop(); } catch (e) { /* */ } }); amb.disconnect(); }, 1500); } };
}
export function stopAmbience() { if (ambience) ambience.stop(); }
