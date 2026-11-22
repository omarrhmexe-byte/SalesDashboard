// Procedural WebAudio sound design. Every sound here is synthesised — no samples.
let ctx = null, master, sfxBus, musicBus, comp, noiseBuf;
let volume = 0.8;
let ambience = null, lobby = null;
const listeners = [];

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = volume;
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.55;
  sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
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

function env(g, t, a, peak, dec, sustain = 0.0001) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + dec);
}
function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, a = 0.002, dec = dur, out = sfxBus, rate = 1, f2 = null } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dec);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  return { s, f, g };
}
function tone(t, dur, { type = 'sine', freq = 440, f2 = null, gain = 0.3, a = 0.004, dec = dur, out = sfxBus, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dec);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  return { o, g };
}

export const sfx = {
  shot(slow = false) {
    if (!ctx) return; const t = now(); const p = rnd(0.96, 1.04) * (slow ? 0.7 : 1);
    noise(t, 0.09, { type: 'bandpass', freq: 2200 * p, q: 0.6, gain: 0.55, dec: 0.08 });
    noise(t, 0.16, { type: 'lowpass', freq: 900 * p, q: 0.8, gain: 0.5, dec: 0.15 });
    tone(t, 0.11, { type: 'sine', freq: 150 * p, f2: 45, gain: 0.7, dec: 0.1 });
    tone(t, 0.012, { type: 'square', freq: 2600 * p, gain: 0.12, dec: 0.01 });
    noise(t + 0.02, 0.45, { type: 'lowpass', freq: 600, q: 0.3, gain: 0.08, a: 0.02, dec: 0.4 });
  },
  dry() { if (!ctx) return; const t = now(); tone(t, 0.03, { type: 'square', freq: 1800, gain: 0.08, dec: 0.03 }); },
  reload() {
    if (!ctx) return; const t = now();
    const click = (dt, f, g = 0.25) => { noise(t + dt, 0.05, { type: 'bandpass', freq: f, q: 4, gain: g, dec: 0.04 }); tone(t + dt, 0.03, { type: 'triangle', freq: f / 3, gain: g * 0.4, dec: 0.03 }); };
    click(0.1, 1400); click(0.5, 900, 0.2); click(1.15, 2000, 0.3); click(1.25, 1200, 0.2); click(1.65, 2600, 0.3); click(1.72, 1600, 0.25);
  },
  hit() { if (!ctx) return; const t = now(); tone(t, 0.06, { type: 'triangle', freq: 1250, gain: 0.25, dec: 0.06 }); noise(t, 0.04, { type: 'highpass', freq: 3000, gain: 0.12, dec: 0.03 }); },
  headshot() {
    if (!ctx) return; const t = now();
    tone(t, 0.5, { type: 'sine', freq: 1760, gain: 0.3, dec: 0.45 });
    tone(t, 0.4, { type: 'sine', freq: 2637, gain: 0.18, dec: 0.35 });
    tone(t, 0.25, { type: 'triangle', freq: 3520, gain: 0.08, dec: 0.2 });
    noise(t, 0.05, { type: 'highpass', freq: 4000, gain: 0.2, dec: 0.04 });
  },
  kill(n = 1) {
    if (!ctx) return; const t = now();
    const base = [523.25, 587.33, 659.25, 783.99, 880, 1046.5][Math.min(n - 1, 5)];
    [1, 1.5, 2].forEach((m, i) => tone(t + i * 0.045, 0.5, { type: 'triangle', freq: base * m, gain: 0.18, dec: 0.45 }));
    tone(t, 0.6, { type: 'sine', freq: base / 2, gain: 0.2, dec: 0.5 });
    noise(t, 0.3, { type: 'bandpass', freq: 5000, q: 2, gain: 0.08, dec: 0.25 });
  },
  hurt() { if (!ctx) return; const t = now(); tone(t, 0.18, { type: 'sine', freq: 110, f2: 55, gain: 0.5, dec: 0.16 }); noise(t, 0.12, { type: 'lowpass', freq: 700, gain: 0.3, dec: 0.1 }); },
  botShot(dist = 10) {
    if (!ctx) return; const t = now(); const g = Math.max(0.05, 0.35 - dist * 0.008);
    tone(t, 0.25, { type: 'sawtooth', freq: 900, f2: 160, gain: g * 0.5, dec: 0.22 });
    noise(t, 0.12, { type: 'bandpass', freq: 1200, q: 1.5, gain: g, dec: 0.1 });
  },
  whiz() { if (!ctx) return; const t = now(); noise(t, 0.18, { type: 'bandpass', freq: 3000, f2: 900, q: 6, gain: 0.2, a: 0.03, dec: 0.15 }); },
  shieldBreak() { if (!ctx) return; const t = now(); tone(t, 0.3, { type: 'square', freq: 800, f2: 200, gain: 0.12, dec: 0.28 }); noise(t, 0.25, { type: 'highpass', freq: 2500, gain: 0.2, dec: 0.2 }); },
  dash() {
    if (!ctx) return; const t = now();
    noise(t, 0.35, { type: 'bandpass', freq: 600, f2: 4000, q: 1.2, gain: 0.5, a: 0.02, dec: 0.3 });
    [659.25, 830.6, 987.8, 1318.5].forEach((f, i) => tone(t + i * 0.04, 0.25, { type: 'triangle', freq: f, gain: 0.12, dec: 0.22 }));
    tone(t, 0.1, { type: 'sine', freq: 180, f2: 90, gain: 0.3, dec: 0.1 });
  },
  updraft() {
    if (!ctx) return; const t = now();
    noise(t, 0.9, { type: 'bandpass', freq: 300, f2: 2400, q: 0.9, gain: 0.55, a: 0.05, dec: 0.85 });
    noise(t, 0.6, { type: 'lowpass', freq: 400, gain: 0.4, a: 0.01, dec: 0.5 });
    tone(t, 0.6, { type: 'sine', freq: 220, f2: 660, gain: 0.15, dec: 0.55 });
    tone(t, 0.08, { type: 'sine', freq: 90, f2: 40, gain: 0.6, dec: 0.08 });
  },
  ult() {
    if (!ctx) return; const t = now();
    tone(t, 1.4, { type: 'sine', freq: 70, f2: 35, gain: 0.8, dec: 1.3 });
    noise(t, 1.2, { type: 'lowpass', freq: 2500, f2: 200, gain: 0.5, a: 0.01, dec: 1.1 });
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(t + 0.1 + i * 0.07, 1.4, { type: 'triangle', freq: f, gain: 0.1, a: 0.05, dec: 1.3 }));
  },
  ultEnd() { if (!ctx) return; const t = now(); tone(t, 0.5, { type: 'sine', freq: 600, f2: 200, gain: 0.2, dec: 0.45 }); },
  ultReady() { if (!ctx) return; const t = now(); [783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => tone(t + i * 0.06, 0.6, { type: 'sine', freq: f, gain: 0.12, dec: 0.5 })); },
  jump() { if (!ctx) return; const t = now(); noise(t, 0.08, { type: 'lowpass', freq: 500, gain: 0.15, dec: 0.07 }); },
  land(h = 1) { if (!ctx) return; const t = now(); noise(t, 0.12, { type: 'lowpass', freq: 380, gain: Math.min(0.5, 0.12 * h), dec: 0.1 }); tone(t, 0.08, { type: 'sine', freq: 80, f2: 45, gain: Math.min(0.4, 0.1 * h), dec: 0.07 }); },
  step(walk) { if (!ctx) return; const t = now(); noise(t, 0.06, { type: 'bandpass', freq: rnd(250, 420), q: 1.2, gain: walk ? 0.03 : 0.08, dec: 0.05 }); },
  beep(hi = false) { if (!ctx) return; const t = now(); tone(t, 0.12, { type: 'square', freq: hi ? 1320 : 880, gain: 0.08, dec: 0.1 }); tone(t, 0.12, { type: 'sine', freq: hi ? 1320 : 880, gain: 0.15, dec: 0.1 }); },
  cakeBeep() { if (!ctx) return; const t = now(); tone(t, 0.09, { type: 'sine', freq: 1975, gain: 0.14, dec: 0.08 }); tone(t, 0.09, { type: 'triangle', freq: 987.8, gain: 0.06, dec: 0.08 }); },
  barrier() {
    if (!ctx) return; const t = now();
    tone(t, 0.6, { type: 'sawtooth', freq: 220, f2: 55, gain: 0.25, dec: 0.55 });
    noise(t, 0.7, { type: 'bandpass', freq: 3000, f2: 300, q: 1, gain: 0.35, a: 0.01, dec: 0.65 });
    tone(t + 0.05, 0.3, { type: 'sine', freq: 60, gain: 0.6, dec: 0.3 });
  },
  lockIn() {
    if (!ctx) return; const t = now();
    tone(t, 0.9, { type: 'sine', freq: 60, f2: 40, gain: 0.9, dec: 0.85 });
    noise(t, 0.5, { type: 'lowpass', freq: 3000, f2: 300, gain: 0.6, dec: 0.45 });
    noise(t, 0.08, { type: 'highpass', freq: 3000, gain: 0.4, dec: 0.07 });
    [261.63, 392, 523.25, 783.99].forEach((f, i) => tone(t + 0.05 + i * 0.03, 1.6, { type: 'sawtooth', freq: f, gain: 0.05, a: 0.01, dec: 1.5 }));
    [523.25, 659.25, 783.99].forEach((f) => tone(t, 1.6, { type: 'triangle', freq: f, gain: 0.08, dec: 1.5 }));
  },
  click() { if (!ctx) return; const t = now(); tone(t, 0.04, { type: 'triangle', freq: 1500, gain: 0.1, dec: 0.04 }); },
  hover() { if (!ctx) return; const t = now(); tone(t, 0.03, { type: 'sine', freq: 2400, gain: 0.04, dec: 0.03 }); },
  roundStart() {
    if (!ctx) return; const t = now();
    [392, 523.25, 659.25].forEach((f, i) => tone(t + i * 0.09, 0.5, { type: 'triangle', freq: f, gain: 0.14, dec: 0.45 }));
    tone(t, 0.6, { type: 'sine', freq: 98, gain: 0.4, dec: 0.55 });
  },
  win() {
    if (!ctx) return; const t = now();
    const chord = (dt, fs, d = 1.2) => fs.forEach((f) => { tone(t + dt, d, { type: 'sawtooth', freq: f, gain: 0.045, a: 0.02, dec: d }); tone(t + dt, d, { type: 'triangle', freq: f, gain: 0.08, a: 0.01, dec: d }); });
    chord(0, [261.63, 329.63, 392], 0.5); chord(0.22, [293.66, 369.99, 440], 0.5); chord(0.44, [392, 493.88, 587.33, 783.99], 2.2);
    tone(t, 0.5, { type: 'sine', freq: 65, gain: 0.6, dec: 0.45 }); tone(t + 0.44, 2, { type: 'sine', freq: 98, gain: 0.5, dec: 1.9 });
    noise(t + 0.44, 1.5, { type: 'highpass', freq: 6000, gain: 0.08, a: 0.01, dec: 1.4 });
  },
  lose() {
    if (!ctx) return; const t = now();
    [[392, 466.16], [349.23, 415.3], [311.13, 369.99]].forEach((fs, i) => fs.forEach((f) => tone(t + i * 0.28, 0.9, { type: 'triangle', freq: f, gain: 0.1, dec: 0.85 })));
    tone(t, 1.6, { type: 'sine', freq: 82, f2: 41, gain: 0.5, dec: 1.5 });
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
  aura() { if (!ctx) return; const t = now(); [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => tone(t + i * 0.05, 0.8, { type: 'triangle', freq: f, gain: 0.1, dec: 0.7 })); },
  plantTick() { if (!ctx) return; const t = now(); tone(t, 0.05, { type: 'square', freq: 660, gain: 0.05, dec: 0.04 }); },
  planted() {
    if (!ctx) return; const t = now();
    tone(t, 0.6, { type: 'sine', freq: 80, gain: 0.6, dec: 0.55 });
    [1046.5, 1318.5, 1567.98].forEach((f, i) => tone(t + i * 0.08, 0.4, { type: 'square', freq: f, gain: 0.05, dec: 0.35 }));
  },
  boom() {
    if (!ctx) return; const t = now();
    tone(t, 2.5, { type: 'sine', freq: 55, f2: 25, gain: 1, dec: 2.4 });
    noise(t, 2.4, { type: 'lowpass', freq: 4000, f2: 120, gain: 0.9, a: 0.005, dec: 2.3 });
    noise(t, 0.3, { type: 'highpass', freq: 2000, gain: 0.5, dec: 0.25 });
  },
  firework() {
    if (!ctx) return; const t = now() + rnd(0, 0.05);
    noise(t, 0.6, { type: 'lowpass', freq: 1800, f2: 200, gain: 0.35, a: 0.003, dec: 0.55 });
    for (let i = 0; i < 10; i++) noise(t + 0.15 + Math.random() * 0.8, 0.03, { type: 'highpass', freq: 5000, gain: 0.08, dec: 0.025 });
  },
  catChime() { this.aura(); },
};

// ── music ───────────────────────────────────────────────────────────────────
// Lobby: warm detuned pad + soft pluck arpeggio, scheduled in a loop.
export function startLobbyMusic() {
  if (!ctx || lobby) return;
  const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(musicBus);
  out.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(out);
  const delay = ctx.createDelay(); delay.delayTime.value = 0.375; const fb = ctx.createGain(); fb.gain.value = 0.35;
  delay.connect(fb); fb.connect(delay); delay.connect(out);
  const prog = [[220, 261.63, 329.63, 392], [174.61, 220, 261.63, 329.63], [261.63, 329.63, 392, 493.88], [196, 246.94, 293.66, 392]];
  let bar = 0, next = ctx.currentTime + 0.1, stopped = false;
  const barLen = 3.2;
  function schedule() {
    if (stopped) return;
    while (next < ctx.currentTime + 1.2) {
      const ch = prog[bar % prog.length];
      ch.forEach((f) => {
        [-7, 7].forEach((dt) => {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f / 2; o.detune.value = dt;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, next); g.gain.exponentialRampToValueAtTime(0.03, next + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, next + barLen + 0.4);
          o.connect(g); g.connect(lp); o.start(next); o.stop(next + barLen + 0.5);
        });
      });
      for (let i = 0; i < 8; i++) {
        const f = ch[(i * 3) % 4] * (i % 2 ? 2 : 1);
        const tt = next + i * (barLen / 8);
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.05, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5);
        o.connect(g); g.connect(out); g.connect(delay); o.start(tt); o.stop(tt + 0.6);
      }
      // soft kick + shaker
      for (let i = 0; i < 4; i++) {
        const tt = next + i * (barLen / 4);
        tone(tt, 0.3, { type: 'sine', freq: 90, f2: 40, gain: 0.18, dec: 0.28, out });
        noise(tt + barLen / 8, 0.05, { type: 'highpass', freq: 7000, gain: 0.04, dec: 0.04, out });
      }
      next += barLen; bar++;
    }
  }
  const id = setInterval(schedule, 300); schedule();
  lobby = { stop() { stopped = true; clearInterval(id); out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => out.disconnect(), 2000); } };
}
export function stopLobbyMusic() { if (lobby) { lobby.stop(); lobby = null; } }

// In-match ambience: soft courtyard wind + distant hum.
export function startAmbience() {
  if (!ctx || ambience) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency);
  s.connect(f); f.connect(g); g.connect(musicBus); s.start(); lfo.start();
  ambience = { stop() { try { s.stop(); lfo.stop(); } catch (e) { /* */ } } };
}
export function stopAmbience() { if (ambience) { ambience.stop(); ambience = null; } }
