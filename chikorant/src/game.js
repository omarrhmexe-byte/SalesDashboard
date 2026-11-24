// Core game: renderer, world, player controller, weapon, abilities, bots, round flow.
import * as THREE from 'three';
import { buildZyoinMap, DEFAULT_MAP, getMapBuilder, normalizeMap } from './maps/index.js';
import { solids, moveBody, raycast, rayCylinder, raySphere, lineOfSight, swapSolids } from './physics.js';
import { Particles, Tracers, Decals, Confetti, Fireworks } from './fx.js';
import { Bot, Nav, Projectiles } from './bots.js';
import { ViewModel, damp2, FIRE_RATE, RECOIL_MAX, recoilKick, recoilSway, weaponSpread } from './weapon.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { sfx, startAmbience, stopAmbience, setVolume, getVolume } from './audio.js';
import { buildRoundList, PLAYER_NAME, FINAL_ROUND } from './config.js';
import * as UI from './ui.js';
import { setAniso, textSprite } from './textures.js';
import { outlineMaterial, addOutlines } from './builder.js';

const PI = Math.PI;
const RUN = 6.4, WALK = 3.2, JUMP_V = 6.9, GRAV = 22, EYE = 1.62, RADIUS = 0.38, HEIGHT = 1.8;
const MAG = 25, FIRE_DT = 1 / FIRE_RATE, RELOAD = 1.9, DMG_BODY = 30, HS_MULT = 2.5;
const DASH_CD = 3, UP_CD = 6, ULT_COST = 5, ULT_TIME = 7;
const ROUND_TIME = 120, PLANT_PHASE_TIME = 120;

const POST_SETS = [
  ['aLane', 'mid', 'bLane', 'backHall'],
  ['bLane', 'bMain', 'bStage', 'bBoard', 'mid2'],
  ['aLane', 'aMain', 'aPlat', 'mid', 'bSite', 'bStage'],
];
const BONUS_POSTS = ['aCrate', 'aSite', 'mid', 'backHall2', 'bSite', 'bBoard', 'aMain', 'bMain'];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Game {
  constructor({ canvas, mobile, quality, forceQuality = false }) {
    this.canvas = canvas; this.mobile = mobile; this.quality = quality;
    this.settings = loadSettings(mobile);
    if (this.settings.quality && !forceQuality) this.quality = this.settings.quality; // ?q= in the URL wins over the saved choice
    setVolume(this.settings.volume);

    // renderer
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r; setAniso(Math.min(8, r.capabilities.getMaxAnisotropy()));

    // scene
    const scene = new THREE.Scene(); this.scene = scene;
    scene.fog = new THREE.Fog(0xf3c9a3, 80, 260);
    this.camera = new THREE.PerspectiveCamera(mobile ? 78 : 72, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.buildSky();
    this.buildLights();
    // remember the default (golden-hour) environment so each map can tweak it and the next restore it
    this.envBase = { fog: scene.fog ? { color: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far } : null, exposure: r.toneMappingExposure, lights: scene.children.filter((o) => o.isLight && o.intensity > 0).map((l) => [l, l.intensity]) };
    this.mapRoot = null; this.mapId = null; this.mapShots = new Map();
    this.installMap(DEFAULT_MAP, buildZyoinMap);
    this.vm = new ViewModel();
    this.post = new Post(r, scene, this.camera, this.vm);
    this.ps = new Particles(scene); this.tracers = new Tracers(scene); this.decals = new Decals(scene);
    this.confetti = new Confetti(scene); this.fireworks = new Fireworks(this.ps, () => sfx.firework());
    this.proj = new Projectiles(scene, this.ps);
    this.input = new Input(canvas, mobile);
    this.input.onUnlock = () => this.onUnlock();
    this.cake = this.buildCake(); this.cake.visible = false; scene.add(this.cake);
    this.plantLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSprite('PLANT THE CAKE HERE', '#FFC21A', 58), depthTest: false, transparent: true }));
    this.plantLabel.scale.set(6, 1.5, 1); this.plantLabel.position.set(this.map.dyn.plantCenter.x, 4.2, this.map.dyn.plantCenter.z); this.plantLabel.visible = false; this.plantLabel.renderOrder = 10; scene.add(this.plantLabel);

    this.rounds = buildRoundList();
    this.score = { me: 0, them: 0 };
    this.state = 'menu'; this.paused = false; this.timeScale = 1;
    this.player = this.makePlayer();
    this.bots = [];
    this.t = 0; this.last = performance.now();
    this.hudCache = {};
    this.applyQuality();
    this.buildMinimap();
    this.resize(); addEventListener('resize', () => this.resize());
    // warm up shaders
    this.camera.position.set(0, 1.6, 31); this.camera.rotation.set(0, 0, 0);
    this.renderer.compile(scene, this.camera);
    this.bindUI();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ── setup ────────────────────────────────────────────────────────────────
  buildSky() {
    // low golden-hour sun in the south-west: side light + long shadows across the lanes
    const sunDir = new THREE.Vector3(-0.64, 0.45, 0.62).normalize(); this.sunDir = sunDir;
    this.scene.fog = new THREE.Fog(0xf2c8a0, 55, 240); // warm haze that swallows the far skyline
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir } }, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 uSun; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float h = d.y;
          float s = max(0.0, dot(d, uSun));
          vec3 top = vec3(0.13,0.33,0.62), mid = vec3(0.42,0.64,0.85), hor = vec3(1.0,0.78,0.58), low = vec3(0.93,0.60,0.47);
          // horizon warms up toward the sun, cools away from it
          hor = mix(vec3(0.86,0.80,0.80), hor, 0.45 + 0.55 * pow(s, 1.5));
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h)); c = mix(c, top, smoothstep(0.25, 0.8, h)); c = mix(c, low, smoothstep(0.0,-0.2,h));
          c += vec3(1.0,0.55,0.25) * pow(s, 6.0) * 0.32 + vec3(1.0,0.82,0.55) * pow(s, 60.0) * 0.55;
          c += vec3(1.7,1.45,1.1) * smoothstep(0.9993, 0.9996, s);
          // faint painted streaks of high cloud
          float band = sin(d.x * 9.0 + d.z * 5.0 + sin(d.z * 13.0) * 0.6) * 0.5 + 0.5;
          c = mix(c, vec3(1.0, 0.86, 0.76), smoothstep(0.75, 1.0, band) * smoothstep(0.05, 0.25, h) * (1.0 - smoothstep(0.35, 0.6, h)) * 0.18);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat); sky.frustumCulled = false; sky.renderOrder = -1;
    this.scene.add(sky); this.sky = sky;
  }
  buildLights() {
    // cool sky / warm bounce so shadowed sides read blue-violet and lit sides glow amber
    const hemi = new THREE.HemisphereLight(0x9cbbe6, 0xd49a6c, 1.05); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffc58c, 3.4);
    sun.position.copy(this.sunDir).multiplyScalar(120); sun.target.position.set(0, 0, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -66; sc.right = 66; sc.top = 60; sc.bottom = -60; sc.near = 20; sc.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4;
    this.scene.add(sun, sun.target); this.sun = sun;
    // soft lavender skylight from the opposite side keeps shade colourful instead of grey
    const fill = new THREE.DirectionalLight(0xa9a6ff, 0.45); fill.position.set(60, 40, -45); this.scene.add(fill);
    // warm bounce from the west (setting-sun glow off the walls)
    const rim = new THREE.DirectionalLight(0xffa36b, 0.3); rim.position.set(-70, 10, -30); this.scene.add(rim);
    this.muzzleLight = new THREE.PointLight(0xffc27a, 0, 9, 2); this.scene.add(this.muzzleLight);
    this.cakeLight = new THREE.PointLight(0xffb24a, 0, 7, 2); this.scene.add(this.cakeLight);
  }
  buildCake() {
    const g = new THREE.Group();
    const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
    const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    add(new THREE.CylinderGeometry(0.42, 0.44, 0.06, 28), m(0xd9c9a8, { metalness: 0.5, roughness: 0.3 }), 0, 0.03, 0);
    add(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 28), m(0xfff1dc), 0, 0.19, 0);
    add(new THREE.TorusGeometry(0.36, 0.035, 8, 28), m(0xff4655), 0, 0.32, 0).rotation.x = PI / 2;
    add(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 24), m(0xff8fa6), 0, 0.42, 0);
    add(new THREE.TorusGeometry(0.26, 0.03, 8, 24), m(0xfff1dc), 0, 0.52, 0).rotation.x = PI / 2;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; add(new THREE.SphereGeometry(0.04, 8, 6), m(0xffc21a), Math.cos(a) * 0.36, 0.08, Math.sin(a) * 0.36); }
    const flames = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3; const x = Math.cos(a) * 0.15, z = Math.sin(a) * 0.15;
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), m(i % 2 ? 0x2f8f88 : 0xffc21a), x, 0.59, z);
      const f = add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.2) }), x, 0.69, z); f.scale.y = 1.6; f.castShadow = false; flames.push(f);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.6), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -PI / 2; ring.position.y = 0.02; g.add(ring);
    g.userData = { flames, ring };
    addOutlines(g, outlineMaterial(0.012));
    return g;
  }
  makePlayer() {
    return {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, recoilP: 0, recoilY: 0,
      hp: 100, shield: 50, alive: true, onGround: true, lastHurt: -99, ammo: MAG, reloadT: 0, fireCd: 0, shotIdx: 0, lastShot: -9,
      dashT: 0, dashDir: new THREE.Vector3(), cdQ: 0, cdE: 0, ult: 0, ultT: 0, updraftT: 0, camY: EYE, stepT: 0,
      tookDamage: false, kills: 0, catRescued: false, carrying: false, plantT: 0,
    };
  }
  applyQuality() {
    const hi = this.quality === 'high';
    this.renderer.shadowMap.enabled = hi; this.sun.castShadow = hi;
    this.post.enabled = hi;
    this.pixelRatio = hi ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, this.mobile ? 1 : 1.25) * (this.mobile ? 0.85 : 1);
    this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
    this.muzzleLight.visible = hi; this.cakeLight.visible = hi;
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio || 1); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vm.resize(w / h);
    this.post.setSize(w, h, this.pixelRatio || 1);
    this.ps.mat.uniforms.uScale.value = (h * (this.pixelRatio || 1)) / (2 * Math.tan((this.camera.fov * PI) / 360));
    const portrait = this.mobile && h > w; UI.show('rotate', portrait);
  }

  // ── maps ─────────────────────────────────────────────────────────────────
  // Builds map `id` into its own group and swaps it in, disposing the previous map (geometry,
  // materials, textures, collision). Sky, lights, cake, plant label, fx pools and the viewmodel
  // are kept. If the build throws or breaks the contract, the current map stays and this throws.
  installMap(id, build) {
    const root = new THREE.Group(); root.name = `map:${id}`;
    const prevSolids = swapSolids([]);
    let map = null, err = null;
    try {
      map = build(root, { quality: this.quality });
      const bad = normalizeMap(map, id); if (bad.length) err = new Error(`map "${id}" breaks the map contract: ${bad.join(', ')}`);
    } catch (e) { err = e; }
    if (err) { disposeObject(root); swapSolids(prevSolids); throw err; }
    if (this.mapRoot) { this.scene.remove(this.mapRoot); disposeObject(this.mapRoot); }
    this.scene.add(root);
    this.mapRoot = root; this.mapId = id; this.map = map; this.barrierAnim = 0;
    this.nav = new Nav(map.nodes, map.edges);
    this.applyMapEnv(map, root);
    if (this.plantLabel) this.plantLabel.position.set(map.dyn.plantCenter.x, 4.2, map.dyn.plantCenter.z);
    if (this.mm) this.buildMinimap();
    return map;
  }
  // Switches to map `id` before a match (no-op when it's already loaded, unless `force`).
  // Falls back to ZYOIN HQ if the map can't be loaded or built. Resolves to the loaded id.
  async loadMap(id, { force = false } = {}) {
    let build = this.brokenMaps?.has(id) ? null : await getMapBuilder(id);
    if (!build) { id = DEFAULT_MAP; build = buildZyoinMap; }
    if (id === this.mapId && !force) return id;
    this.clearWorld();
    try { this.installMap(id, build); } catch (e) {
      console.error(`[maps] ${id} failed to build, falling back to ${DEFAULT_MAP}`, e);
      (this.brokenMaps ||= new Set()).add(id);
      if (id === DEFAULT_MAP) throw e;
      if (this.mapId !== DEFAULT_MAP) this.installMap(DEFAULT_MAP, buildZyoinMap);
      id = DEFAULT_MAP;
    }
    this.renderer.compile(this.scene, this.camera); // warm the new map's shaders before round 1
    this.hudCache = {};
    return id;
  }
  // True if a map can be offered on the map-select screen.
  async mapAvailable(id) { return !this.brokenMaps?.has(id) && !!(await getMapBuilder(id)); }
  // Per-map environment (fog, exposure, sky, light levels); defaults to the golden-hour setup.
  applyMapEnv(map, root) {
    const e = map.env || {}, b = this.envBase, s = this.scene;
    const fog = e.fog !== undefined ? e.fog : root.fog ? { color: root.fog.color.getHex(), near: root.fog.near, far: root.fog.far } : b.fog;
    if (fog) { if (!s.fog) s.fog = new THREE.Fog(); s.fog.color.set(fog.color); s.fog.near = fog.near; s.fog.far = fog.far; } else s.fog = null;
    s.background = e.background !== undefined ? e.background : (root.background || null);
    this.renderer.toneMappingExposure = e.exposure ?? b.exposure;
    if (this.sky) this.sky.visible = e.sky !== false;
    let dir = 0;
    for (const [l, base] of b.lights) {
      const k = l.isHemisphereLight ? e.hemi : l === this.sun ? e.sun : l.isDirectionalLight ? (dir++ === 0 ? e.fill : e.rim) : 1;
      l.intensity = base * (k ?? 1);
    }
  }
  // Renders the loaded map from its preview pose into a JPEG data URL (map-select cards).
  snapshotMap(w = 640, h = 400) {
    const cam = this.camera, pose = this.map.preview || { pos: [0, 9.5, 24], look: [0, 2, -14] };
    const savedP = cam.position.clone(), savedQ = cam.quaternion.clone(), savedState = this.state;
    this.state = 'menu'; // no viewmodel in the shot
    cam.position.set(...pose.pos); cam.lookAt(_v.set(...pose.look));
    this.render(0);
    const src = this.renderer.domElement, c = document.createElement('canvas'); c.width = w; c.height = h;
    let cw = src.width, ch = src.width * h / w; if (ch > src.height) { ch = src.height; cw = ch * w / h; }
    c.getContext('2d').drawImage(src, (src.width - cw) / 2, (src.height - ch) / 2, cw, ch, 0, 0, w, h);
    cam.position.copy(savedP); cam.quaternion.copy(savedQ); this.state = savedState;
    this.render(0); // put the live view back before the browser presents this frame
    try { return c.toDataURL('image/jpeg', 0.84); } catch (e) { return null; }
  }
  // Snapshot for any map. A map that isn't loaded is built off to the side (desktop only), shot
  // and thrown away again; the live map, its collision and its environment are untouched.
  async previewMap(id) {
    if (this.mapShots.has(id)) return this.mapShots.get(id);
    if (id === this.mapId) { const u = this.snapshotMap(); if (u) this.mapShots.set(id, u); return u; }
    if (this.mobile || this.state !== 'menu') return null;
    const build = await getMapBuilder(id);
    if (!build || this.state !== 'menu') return null;
    if (id === this.mapId) return this.previewMap(id);
    const root = new THREE.Group(), live = this.mapRoot, liveMap = this.map, prevSolids = swapSolids([]);
    let url = null;
    try {
      const m = build(root, { quality: this.quality });
      if (!normalizeMap(m, id).length) { live.visible = false; this.scene.add(root); this.applyMapEnv(m, root); this.map = m; url = this.snapshotMap(); }
    } catch (e) { console.warn(`[maps] preview of ${id} failed`, e); (this.brokenMaps ||= new Set()).add(id); }
    finally { this.scene.remove(root); disposeObject(root); live.visible = true; this.map = liveMap; this.applyMapEnv(liveMap, live); swapSolids(prevSolids); }
    if (url) this.mapShots.set(id, url);
    return url;
  }
  // PLAY AGAIN from the ending: reset the match and hand over to the map-select screen.
  playAgain() {
    this.score = { me: 0, them: 0 }; this.carryUlt = 0; this.paused = false; this.timeScale = 1; this.slowT = 0;
    this.clearWorld();
    this.cake.visible = false; this.plantLabel.visible = false; this.cakeLight.intensity = 0;
    const d = this.map.dyn; d.plantRing.visible = false; d.plantBeacon.visible = false;
    this.input.unlock(); this.input.enabled = false;
    UI.show('hud', false); UI.show('touch', false);
    this.state = 'menu';
    if (this.onPlayAgain) this.onPlayAgain(); else { UI.show('hud'); if (this.mobile) UI.show('touch'); this.input.enabled = true; this.input.lock(); this.startRound(0); }
  }

  bindUI() {
    UI.$('resume').onclick = () => { sfx.click(); this.resume(); };
    UI.$('restart').onclick = () => { sfx.click(); UI.show('pause', false); this.paused = false; this.input.lock(); this.startRound(this.roundIdx); };
    const vol = UI.$('vol'); vol.value = this.settings.volume;
    vol.oninput = () => { setVolume(+vol.value); UI.setNoteVolume(+vol.value); this.settings.volume = +vol.value; saveSettings(this.settings); };
    const sens = UI.$('sens'); sens.value = this.settings.sens;
    sens.oninput = () => { this.settings.sens = +sens.value; saveSettings(this.settings); };
    const q = UI.$('quality'); q.value = this.quality;
    q.onchange = () => { this.quality = q.value; this.settings.quality = q.value; saveSettings(this.settings); this.applyQuality(); };
    UI.$('pauseBtn').addEventListener('click', () => this.pause());
    UI.$('pauseBtn').addEventListener('touchstart', (e) => { e.preventDefault(); this.pause(); }, { passive: false });
    this.canvas.addEventListener('click', () => { if (!this.mobile && this.isPlaying() && !this.input.locked) this.input.lock(); });
  }
  isPlaying() { return ['buy', 'live', 'won', 'lost', 'boom'].includes(this.state); }
  onUnlock() { if (this.isPlaying() && this.state !== 'lost') this.pause(); }
  pause() {
    if (!this.isPlaying() || this.paused) return;
    this.paused = true; UI.show('pause'); this.input.unlock(); this.input.enabled = false;
  }
  resume() {
    UI.show('pause', false); this.paused = false; this.input.enabled = true; this.last = performance.now();
    this.input.lock();
    // browsers refuse a re-lock for ~1s after Esc; if it didn't take, keep the pause menu up
    if (!this.mobile) setTimeout(() => { if (!this.input.locked && this.isPlaying() && !this.paused && !this.noAutoPause) this.pause(); }, 600);
  }

  // ── round flow ───────────────────────────────────────────────────────────
  begin() { // called after LOCK IN + intro
    UI.show('hud'); if (this.mobile) { UI.show('touch'); document.body.classList.add('mobile'); }
    this.input.enabled = true;
    startAmbience();
    this.startRound(0);
  }
  startRound(i) {
    this.roundIdx = i; const R = this.rounds[i]; this.R = R;
    this.clearWorld();
    const p = this.player; Object.assign(p, this.makePlayer(), { ult: Math.min(ULT_COST, this.carryUlt || 0) });
    p.pos.copy(this.map.spawnPoint); p.yaw = 0; p.pitch = 0;
    p.carrying = !!R.final;
    // barrier up
    const d = this.map.dyn; d.barrier.position.y = 2.5; d.barrier.visible = true; d.barrierSolid.on = true; d.barrier.material.uniforms.uA.value = 1;
    // bots
    const names = R.final ? R.defenders : R.bots;
    const posts = R.final ? ['aSite', 'aPlat'] : (POST_SETS[i] || shuffle(BONUS_POSTS).slice(0, names.length));
    this.bots = names.map((n, k) => {
      const pp = this.map.posts[posts[k % posts.length]];
      const b = new Bot(this.scene, n, pp[0] + (k >= posts.length ? 1.5 : 0), pp[1], { yaw: -PI / 2 + (Math.random() - 0.5) * 0.6, difficulty: Math.min(3, i), hp: 100 });
      b.teamIdx = k; // fixed HUD icon slot (indexOf breaks once dead bots are removed from the list)
      return b;
    });
    UI.teamIcons(this.bots.map((b) => b.name));
    this.rushQueue = []; this.cakePlanted = false; this.cakeT = 0; this.boomT = 0;
    this.cake.visible = false; d.plantRing.visible = !!R.final; d.plantBeacon.visible = !!R.final; this.plantLabel.visible = !!R.final;
    this.roundTime = R.final ? PLANT_PHASE_TIME : ROUND_TIME;
    this.liveT = 0; this.buyT = 0; this.countdownN = 4; this.state = 'buy'; this.timeScale = 1; this.slowT = 0;
    this.vm.equip = 1; this.vm.reloadT = 0; this.vm.ultT = 0; // a restart mid-reload / mid-ult must not carry the gun animation over
    UI.$('rdlabel').textContent = R.final ? 'FINAL ROUND' : `ROUND ${i + 1}`;
    UI.banner(R.final ? 'FINAL ROUND' : `ROUND ${i + 1}`, R.title.toUpperCase(), R.final ? 'CARRY THE CAKE TO A SITE' : '', 'round', 2100);
    UI.$('objective').textContent = R.final ? `BRING THE CAKE TO A SITE (THE PANTRY) · HOLD ${this.mobile ? 'PLANT' : 'F'} TO PLANT` : 'ELIMINATE ALL DEADLINES';
    UI.show('cakechip', !!R.final); UI.show('tF', false);
    sfx.roundStart();
    this.hudCache = {};
  }
  clearWorld() {
    this.bots.forEach((b) => b.dispose()); this.bots = [];
    this.proj.clear(); this.ps.clear(); this.decals.clear(); this.confetti.clear(); this.fireworks.rockets = [];
    UI.$('feed').innerHTML = ''; UI.hideBanner(); UI.tip('');
    UI.$('goldfx').classList.remove('on'); UI.show('plantbar', false);
    this.post.grade.uniforms.uGold.value = 0; this.post.grade.uniforms.uHurt.value = 0;
  }
  dropBarrier() {
    const d = this.map.dyn; d.barrierSolid.on = false; this.barrierAnim = 0.0001; sfx.barrier();
    this.bots.forEach((b) => (b.frozen = false)); this.state = 'live';
    UI.banner('', 'GO', '', 'round', 700);
  }
  winRound() {
    if (this.state !== 'live') return;
    this.state = 'won'; this.wonT = 0; this.score.me++;
    const p = this.player; const labels = [];
    if (!p.tookDamage) labels.push('FLAWLESS');
    if (p.kills >= 5) labels.push('ACE');
    if (p.hp < 30) labels.push('CLUTCH');
    this.winLabel = labels.join(' · ');
    this.slowT = 1.1; this.timeScale = 0.3;
    setTimeout(() => { sfx.win(); UI.banner('ENEMY TEAM ELIMINATED', 'ROUND WIN', this.winLabel, 'win', 2600); }, 450);
    this.carryUlt = p.ult;
  }
  loseRound(reason) {
    if (this.state !== 'live' && this.state !== 'buy') return;
    this.state = 'lost'; this.lostT = 0; this.score.them++;
    sfx.lose(); UI.banner(reason === 'time' ? "TIME'S UP" : 'ELIMINATED', 'ROUND LOSS', '', 'lose', 2400);
    this.input.fire = false;
  }
  afterWin() {
    this.input.unlock(); this.input.enabled = false;
    const R = this.R; const nextIdx = this.roundIdx + 1;
    const next = this.rounds[nextIdx];
    UI.showCard({
      winLabel: `ROUND ${this.roundIdx + 1} WIN${this.winLabel ? ' · ' + this.winLabel : ''}`,
      note: R.note, pending: R.pending, roundNum: this.roundIdx + 1,
      nextLabel: next && next.final ? 'FINAL ROUND ▸' : 'NEXT ROUND ▸',
      onNext: () => { this.input.enabled = true; this.input.lock(); this.startRound(nextIdx); },
    });
    this.state = 'card';
  }
  afterLoss() {
    this.input.unlock(); this.input.enabled = false; this.state = 'deadscreen';
    UI.showDead(this.lossReason === 'time' ? "TIME'S UP" : 'ELIMINATED', () => { this.input.enabled = true; this.input.lock(); this.startRound(this.roundIdx); });
  }

  // ── frame ────────────────────────────────────────────────────────────────
  frame() {
    const now = performance.now(); let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.paused) dt = 0;
    this.t += dt;
    if (this.state !== 'menu' && this.state !== 'card' && this.state !== 'deadscreen' && this.state !== 'end' && !this.paused) { for (let k = 0; k < (this.simSteps || 1); k++) this.update(dt); }
    else if (this.state === 'menu') this.menuCam(dt);
    else if (this.state === 'end') this.endUpdate(dt);
    this.animateWorld(dt * (this.paused ? 0 : 1));
    this.render(dt);
    this.input.frameEnd();
  }
  menuCam(dt) {
    const a = this.t * 0.06;
    this.camera.position.set(Math.sin(a) * 7, 9.5, 21 + Math.cos(a) * 3);
    this.camera.lookAt(0, 2, -14);
  }
  render(dt) {
    const hi = this.quality === 'high';
    if (hi) this.post.render(dt);
    else {
      const r = this.renderer; r.autoClear = true; r.render(this.scene, this.camera);
      if (this.state !== 'menu') { r.autoClear = false; r.clearDepth(); r.render(this.vm.scene, this.vm.camera); r.autoClear = true; }
    }
    this.post.weapon.enabled = this.state !== 'menu';
  }

  update(dt) {
    const p = this.player; const inp = this.input;
    // desktop: if the mouse isn't captured mid-round, show the pause menu (it has the RESUME button)
    if (!this.mobile && !inp.locked && !this.noAutoPause && (this.state === 'buy' || this.state === 'live')) { this.unlockedT = (this.unlockedT || 0) + dt; if (this.unlockedT > 0.8) { this.unlockedT = 0; this.pause(); return; } } else this.unlockedT = 0;
    // time scale (ult / last-kill slow-mo)
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0 && p.ultT <= 0) this.timeScale = 1; }
    if (p.ultT > 0) { p.ultT -= dt; this.timeScale = 0.4; if (p.ultT <= 0) { this.timeScale = 1; sfx.ultEnd(); } }
    const wdt = dt * this.timeScale;

    // state timers
    if (this.state === 'buy') {
      this.buyT += dt;
      const n = 3 - Math.floor(this.buyT - 2.1);
      if (this.buyT > 2.1 && n !== this.countdownN && n >= 1) { this.countdownN = n; UI.countdown(n); sfx.beep(false); }
      if (this.buyT >= 5.1) { sfx.beep(true); this.dropBarrier(); }
    } else if (this.state === 'live') {
      this.liveT += dt;
      if (!this.cakePlanted) { this.roundTime -= dt; if (this.roundTime <= 0) { this.lossReason = 'time'; this.loseRound('time'); } }
      // stalled rounds: send the remaining bots hunting
      const alive = this.bots.filter((b) => b.alive && !b.rush);
      if (!this.R.final && (this.liveT > 45 || (alive.length <= 2 && this.liveT > 25))) alive.forEach((b) => (b.hunt = true));
      if (this.R.final) this.updateFinal(dt);
    } else if (this.state === 'won') {
      this.wonT += dt; if (this.wonT > 3.4) this.afterWin();
    } else if (this.state === 'lost') {
      this.lostT += dt; if (this.lostT > 2.2) this.afterLoss();
    } else if (this.state === 'boom') {
      this.boomT += dt; this.updateBoom(dt);
    }

    if (p.alive && this.state !== 'boom') this.updatePlayer(dt, inp);
    else if (!p.alive) this.deathCam(dt);

    // bots & projectiles
    for (const b of this.bots) b.update(wdt, this);
    this.bots = this.bots.filter((b) => { if (!b.alive && b.dying > 2) { b.dispose(); return false; } return true; });
    this.proj.update(wdt, this);
    this.ps.update(wdt); this.tracers.update(dt); this.confetti.update(wdt); this.fireworks.update(wdt);

    if (this.state === 'live' && !this.R.final && this.bots.every((b) => !b.alive)) this.winRound();

    // shield regen
    if (p.alive && this.t - p.lastHurt > 4 && p.shield < 50) p.shield = Math.min(50, p.shield + 25 * dt);

    this.updateCamera(dt);
    this.updateHUD(dt);
  }

  updatePlayer(dt, inp) {
    const p = this.player; const live = this.state === 'live' || this.state === 'buy' || this.state === 'won';
    // look
    const sens = 0.0022 * this.settings.sens * (this.mobile ? 0.55 : 1);
    p.yaw -= inp.dx * sens; p.pitch -= inp.dy * sens;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
    if (this.mobile) this.aimAssist(dt);

    // movement input
    let fx = 0, fz = 0;
    if (inp.keys.has('KeyW')) fz += 1; if (inp.keys.has('KeyS')) fz -= 1;
    if (inp.keys.has('KeyD')) fx += 1; if (inp.keys.has('KeyA')) fx -= 1;
    fx += inp.move.x; fz += inp.move.y;
    const planting = this.R.final && p.carrying && this.inPlantZone() && (inp.keys.has('KeyF')) && p.onGround;
    if (planting) { fx = 0; fz = 0; }
    const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const wx = fx * cos - fz * sin, wz = -fx * sin - fz * cos; // world dir (forward is -z at yaw 0)
    const walking = inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight');
    const speed = (walking ? WALK : RUN) * (this.mobile ? Math.max(0.4, Math.min(1, len)) : 1) * (p.ultT > 0 ? 1.1 : 1);
    const accel = p.onGround ? 65 : 16;
    if (p.dashT > 0) {
      p.dashT -= dt; p.vel.x = p.dashDir.x * 34; p.vel.z = p.dashDir.z * 34; p.vel.y = Math.max(p.vel.y, 0);
      const cols = [[5, 1.2, 1.5], [5, 3.6, 0.5], [0.8, 3.6, 3.2], [4.6, 1, 4], [4.6, 4.4, 4]];
      // trail left behind the player (kept low and off-axis so it never blobs over the camera)
      for (let i = 0; i < 3; i++) { const c = cols[(Math.random() * cols.length) | 0]; const back = 1.2 + Math.random() * 0.8, side = (Math.random() - 0.5) * 1.6; this.ps.emit(p.pos.x - p.dashDir.x * back - p.dashDir.z * side, p.pos.y + 0.2 + Math.random() * 0.9, p.pos.z - p.dashDir.z * back + p.dashDir.x * side, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.06, 0.6, -1, 1.5); }
      // streaks that fly past the camera so the trail reads in first person
      const sx = -p.dashDir.z, sz = p.dashDir.x;
      for (let i = 0; i < 8; i++) {
        const c = cols[(Math.random() * cols.length) | 0]; const side = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9); const ahead = 1.5 + Math.random() * 2.5;
        this.ps.emit(p.pos.x + p.dashDir.x * ahead + sx * side, p.pos.y + 0.6 + Math.random() * 1.6, p.pos.z + p.dashDir.z * ahead + sz * side, -p.dashDir.x * 6, Math.random(), -p.dashDir.z * 6, c[0], c[1], c[2], 0.05, 0.5, 0, 0.5);
      }
      if (p.dashT <= 0) { p.vel.x *= 0.25; p.vel.z *= 0.25; }
    } else {
      const tx = wx * speed, tz = wz * speed;
      const k = Math.min(1, accel * dt / speed);
      if (p.onGround || len > 0.01) { p.vel.x += (tx - p.vel.x) * (p.onGround ? Math.min(1, 12 * dt) : k * 0.25); p.vel.z += (tz - p.vel.z) * (p.onGround ? Math.min(1, 12 * dt) : k * 0.25); }
    }
    // jump
    if (inp.consume('Space') && p.onGround && !planting) { p.vel.y = JUMP_V; p.onGround = false; sfx.jump(); }
    p.vel.y -= GRAV * dt * (p.updraftT > 0 ? 0.75 : 1);
    if (p.updraftT > 0) { p.updraftT -= dt; this.windSwirl(dt); }
    const was = p.onGround;
    const res = moveBody(p.pos, p.vel, dt, RADIUS, HEIGHT, p.onGround);
    p.onGround = res.onGround;
    if (!was && p.onGround && res.landedSpeed > 6) { sfx.land(res.landedSpeed / 6); this.vm.kick = 0.5; }
    // footsteps
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (p.onGround && hs > 2) { p.stepT -= dt * hs / 6.4; if (p.stepT <= 0) { p.stepT = 0.36; sfx.step(walking); } }
    // safety: never leave the map
    if (p.pos.y < -2 || Math.abs(p.pos.x) > 45 || Math.abs(p.pos.z) > 35) { p.pos.set(THREE.MathUtils.clamp(p.pos.x, -44, 44), Math.max(0, p.pos.y), THREE.MathUtils.clamp(p.pos.z, -34, 34)); p.vel.set(0, 0, 0); }

    // abilities
    if (inp.consume('KeyQ') && live) this.useDash(wx, wz, len);
    if (inp.consume('KeyE') && live) this.useUpdraft();
    if (inp.consume('KeyX') && live) this.useUlt();
    p.cdQ = Math.max(0, p.cdQ - dt); p.cdE = Math.max(0, p.cdE - dt);

    // cat rescue
    const cat = this.map.dyn.catHit;
    if (!p.catRescued && p.pos.y > 3.0 && Math.hypot(p.pos.x - cat.x, p.pos.z - cat.z) < 1.6) this.rescueCat();

    // weapon: fixed-rate full auto. fireCd is a time accumulator (it carries the remainder from frame to
    // frame instead of restarting each shot), so the cadence is exactly FIRE_DT at any frame rate.
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { p.ammo = MAG; } }
    if (inp.consume('KeyR') && p.ammo < MAG && p.reloadT <= 0 && !planting) this.reload();
    const canShoot = this.state !== 'buy' && !planting && p.reloadT <= 0;
    if ((inp.firing || inp.fireTap) && canShoot) {
      for (let n = 0; p.fireCd <= 1e-4 && n < 3; n++) { // 1e-4: float dust must not slip a shot to the next frame
        if (p.ammo > 0) { this.shoot(); p.fireCd += FIRE_DT; }
        else { sfx.dry(); this.reload(); p.fireCd = 0; break; }
      }
      p.fireCd = Math.max(p.fireCd - dt, -FIRE_DT); // time until the next shot is due (never bank a burst after a hitch)
    } else p.fireCd = Math.max(0, p.fireCd - dt);
    if (p.ammo === 0 && p.reloadT <= 0 && this.t - p.lastShot > 0.15 && !planting) this.reload(); // auto-reload on empty

    // recoil. Each shot raises a target; the aim offset (recoilP/Y: used by the bullets AND the camera) follows
    // it on a critically damped spring, so the view glides up and back down instead of snapping. A separate
    // visual-only punch gives each shot its kick. Recovery eases back once the trigger is released.
    let rc = p.rc;
    if (!rc || rc.p.x !== p.recoilP || rc.y.x !== p.recoilY) { // first use, or recoil was reset elsewhere (new round)
      rc = p.rc = { tp: p.recoilP, ty: p.recoilY, p: { x: p.recoilP, v: 0 }, y: { x: p.recoilY, v: 0 }, punch: { x: 0, v: 0 } };
    }
    if (this.t - p.lastShot > FIRE_DT + 0.05) { // trigger released (the margin covers a 20 fps frame)
      const k = 1 - Math.exp(-dt * 6);
      rc.tp -= rc.tp * k; rc.ty -= rc.ty * k;
      p.shotIdx = Math.max(0, p.shotIdx - dt * 20);
    }
    p.recoilP = damp2(rc.p, rc.tp, 30, dt); p.recoilY = damp2(rc.y, rc.ty, 24, dt);
    damp2(rc.punch, 0, 30, dt);

    // planting
    if (this.R.final && p.carrying) {
      const inZone = this.inPlantZone();
      UI.show('tF', inZone && this.mobile);
      if (inZone && this.state === 'live') {
        UI.tip(this.mobile ? '' : 'HOLD  F  TO PLANT THE CAKE'); // phones: the PLANT button sits where the tip would (it overlapped)
        if (planting) {
          if (p.plantT === 0) sfx.plantTick();
          p.plantT += dt; UI.show('plantbar'); UI.$('plantFill').style.width = `${Math.min(100, (p.plantT / FINAL_ROUND.plantSeconds) * 100)}%`;
          if (Math.floor(p.plantT * 4) !== Math.floor((p.plantT - dt) * 4)) sfx.plantTick();
          if (p.plantT >= FINAL_ROUND.plantSeconds) this.plantCake();
        } else { p.plantT = 0; UI.show('plantbar', false); }
      } else { UI.tip(''); p.plantT = 0; UI.show('plantbar', false); }
    }
    this.planting = planting;

    // viewmodel
    this.vm.update(dt, { moving: hs > 0.5, speed: hs, onGround: p.onGround, lookDX: inp.dx, lookDY: inp.dy, lowered: planting || this.state === 'won', tilt: p.dashT > 0 ? -fx * 0.15 : -fx * 0.03 });
  }

  aimAssist(dt) {
    const p = this.player; const cam = this.camera; let best = null, bestA = 0.14;
    const fwd = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const b of this.bots) {
      if (!b.alive || !b.canSee) continue;
      const tgt = _v.set(b.pos.x, b.pos.y + 1.25, b.pos.z).sub(cam.position); const d = tgt.length(); tgt.divideScalar(d);
      const a = Math.acos(Math.min(1, fwd.dot(tgt))); if (a < bestA) { bestA = a; best = b; }
    }
    if (!best) return;
    const tgt = _v.set(best.pos.x, best.pos.y + 1.3, best.pos.z).sub(cam.position);
    const yaw = Math.atan2(-tgt.x, -tgt.z), pitch = Math.atan2(tgt.y, Math.hypot(tgt.x, tgt.z));
    let dy = yaw - p.yaw; while (dy > PI) dy -= 2 * PI; while (dy < -PI) dy += 2 * PI;
    const k = Math.min(1, dt * (this.input.firing ? 5 : 2));
    p.yaw += dy * k; p.pitch += (pitch - p.pitch - p.recoilP) * k * 0.6;
  }

  updateCamera(dt) {
    const p = this.player; const cam = this.camera;
    if (!this.vmWarm) { this.vmWarm = true; this.vm.prewarm(this.renderer); } // first in-round frame (buy phase), not the first shot
    p.camY += (EYE - p.camY) * Math.min(1, dt * 14);
    const stepDiff = p.pos.y + EYE - (this.lastCamY ?? p.pos.y + EYE);
    if (p.onGround && stepDiff > 0 && stepDiff < 0.6) p.camY -= stepDiff * 0.8; // smooth step-ups
    this.lastCamY = p.pos.y + EYE;
    if (p.alive) {
      cam.position.set(p.pos.x, p.pos.y + p.camY, p.pos.z);
      cam.rotation.set(p.pitch + p.recoilP + (p.rc ? p.rc.punch.x : 0), p.yaw + p.recoilY, 0);
    }
    // crosshair: the arms open with the current spread plus a short pulse per shot, then ease back
    // (set as a transform only when the rounded gap changes; no class toggles or timers per shot)
    if (!this.xArms) { const el = UI.$('cross'); this.xArms = el ? [el.querySelector('.l'), el.querySelector('.r'), el.querySelector('.t'), el.querySelector('.b')] : []; this.xGap = 0; this.xGapPx = 0; }
    const pxPerRad = (innerHeight / 2) / Math.tan((cam.fov * PI) / 360);
    const since = this.t - p.lastShot, pulse = Math.max(0, 1 - since / FIRE_DT);
    const gapT = Math.min(10, weaponSpread(p.shotIdx, Math.hypot(p.vel.x, p.vel.z), p.onGround, this.mobile) * pxPerRad * 0.8) + (since < FIRE_DT + 0.05 ? 3 : 0) + pulse * 1.5;
    this.xGap += (gapT - this.xGap) * (1 - Math.exp(-dt * 22));
    const gpx = Math.round(this.xGap);
    if (gpx !== this.xGapPx && this.xArms.length === 4) {
      this.xGapPx = gpx; const [l, r, t, b] = this.xArms;
      l.style.transform = `translateX(${-gpx}px)`; r.style.transform = `translateX(${gpx}px)`; t.style.transform = `translateY(${-gpx}px)`; b.style.transform = `translateY(${gpx}px)`;
    }
    const targetFov = (this.mobile ? 78 : 72) + (p.dashT > 0 ? 10 : 0) + (p.ultT > 0 ? -4 : 0);
    if (Math.abs(cam.fov - targetFov) > 0.05) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
    // gold grade
    const g = this.post.grade.uniforms;
    const gold = p.ultT > 0 ? 1 : (this.state === 'boom' ? 0.6 : 0);
    g.uGold.value += (gold - g.uGold.value) * Math.min(1, dt * 4);
    g.uHurt.value = Math.max(0, g.uHurt.value - dt * 2.5);
    if (this.quality !== 'high') UI.$('goldfx').classList.toggle('on', p.ultT > 0);
    // muzzle light fade
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 200);
  }

  deathCam(dt) {
    const cam = this.camera; this.deathT = (this.deathT || 0) + dt;
    const t = Math.min(1, this.deathT / 0.8);
    cam.position.y = Math.max(0.35, this.player.pos.y + EYE - t * 1.3);
    cam.rotation.z = t * 0.5; cam.rotation.x = this.player.pitch - t * 0.3;
  }

  // ── combat ───────────────────────────────────────────────────────────────
  shoot() {
    const p = this.player;
    const S = this._shot || (this._shot = { dir: new THREE.Vector3(), o: new THREE.Vector3(), end: new THREE.Vector3(), back: new THREE.Vector3(), refl: new THREE.Vector3(), m: new THREE.Vector3(), e: new THREE.Euler(0, 0, 0, 'YXZ'), q: new THREE.Quaternion() });
    p.ammo--; p.lastShot = this.t;
    const i = p.shotIdx; const ult = p.ultT > 0;
    // the bullet goes exactly where the crosshair points right now (aim + current recoil offset, before this
    // shot's kick); spread is a uniform cone that is zero for the first shots from a standstill
    const hs = Math.hypot(p.vel.x, p.vel.z);
    const spread = weaponSpread(i, hs, p.onGround, this.mobile);
    const yaw = p.yaw + p.recoilY, pitch = p.pitch + p.recoilP;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dir = S.dir.set(-sy * cp, sp, -cy * cp);
    if (spread > 0) {
      const r = spread * Math.sqrt(Math.random()), a = Math.random() * PI * 2, rx = Math.cos(a) * r, ry = Math.sin(a) * r;
      dir.x += cy * rx + sy * sp * ry; dir.y += cp * ry; dir.z += -sy * rx + cy * sp * ry; dir.normalize(); // right = (cy,0,-sy), up = (sy*sp, cp, cy*sp)
    }
    // recoil kick for the following shots: a gentle climb that tops out, then a slow sideways wander
    const rc = p.rc;
    if (rc) {
      rc.tp = Math.min(RECOIL_MAX, rc.tp + recoilKick(i)); rc.ty = recoilSway(i + 1);
      rc.punch.v += i < 1 ? 0.12 : 0.2; // view punch (visual only, never moves the bullets)
    }
    p.shotIdx = Math.min(30, i + 1);
    const o = S.o.set(p.pos.x, p.pos.y + p.camY, p.pos.z);
    const wall = raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 250);
    let maxT = wall ? wall.t : 250;
    // bots
    const hb = this.mobile ? 1.35 : 1.12;
    let hitBot = null, hitT = maxT, head = false;
    for (const b of this.bots) {
      if (!b.alive) continue;
      const h = b.head();
      const th = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, h.x, h.y, h.z, 0.24 * hb);
      const tb = rayCylinder(o.x, o.y, o.z, dir.x, dir.y, dir.z, b.pos.x, b.pos.z, b.pos.y, b.pos.y + 1.45, 0.4 * hb);
      if (th > 0 && th < hitT && (tb < 0 || th <= tb + 0.3)) { hitT = th; hitBot = b; head = true; }
      else if (tb > 0 && tb < hitT) { hitT = tb; hitBot = b; head = false; }
    }
    // the cat (never takes damage)
    const c = this.map.dyn.catHit;
    const tc = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, c.x, c.y, c.z, 0.5);
    const end = S.end.copy(o).addScaledVector(dir, Math.min(hitT, maxT, tc > 0 ? tc : 1e9));
    const back = S.back.copy(dir).negate();
    if (tc > 0 && tc < hitT && tc < maxT) {
      UI.toast('NEVER. THE CAT IS SAFE.', 'NICE TRY', 1800); sfx.catSafe(); sfx.meow();
      this.ps.burst(end, 16, { speed: 3, color: [[5, 4, 1], [5, 1.5, 3]], size: 0.08, life: 0.6, grav: -1 });
    } else if (hitBot) {
      const mult = (head ? HS_MULT : 1) * (ult ? 2 : 1);
      const dmg = DMG_BODY * mult;
      const killed = hitBot.damage(dmg, 1, head, dir);
      if (head) {
        // headshot: a crown of gold sparks + bright glints, unmistakably different from a body hit
        this.ps.sparkBurst(end, 30, { speed: 10, color: [[6, 4.4, 1.1], [6, 5.4, 2.6], [5, 3.2, 0.6]], width: 0.017, life: 0.45, dir: back, spread: 1.2, grav: 9 });
        this.ps.burst(end, 10, { speed: 2.5, color: [6, 4.8, 1.6], size: 0.13, life: 0.3, grav: 1 });
        this.ps.burst(end, 1, { speed: 0, color: [6, 5, 2.4], size: 0.7, life: 0.09, grav: 0 });
      } else {
        this.ps.sparkBurst(end, 12, { speed: 6.5, color: [[5, 1.1, 1.4], [5, 2.8, 1.2]], width: 0.012, life: 0.28, dir: back, spread: 1 });
        this.ps.burst(end, 6, { speed: 3, color: [5, 1.2, 1.4], size: 0.08, life: 0.25, grav: 8 });
        this.ps.burst(end, 1, { speed: 0, color: [5, 2, 1.6], size: 0.4, life: 0.06, grav: 0 });
      }
      if (killed) this.onKill(hitBot, head);
      else { if (head) { sfx.headshot(); UI.hitmarker('hs'); } else { sfx.hit(); UI.hitmarker(''); } }
    } else if (wall) {
      this.decals.add(end, wall.normal);
      const n = _v.set(wall.normal[0], wall.normal[1], wall.normal[2]);
      // ricochet sparks fan out around the reflected ray, dust puffs off the surface
      const refl = S.refl.copy(dir).addScaledVector(n, -2 * dir.dot(n)).add(n).normalize();
      this.ps.sparkBurst(end, 9, { speed: 7.5, color: ult ? [[6, 4.4, 1.2], [6, 5.4, 2.6]] : [[5, 3.4, 1.2], [5, 2.2, 0.7]], width: 0.011, life: 0.28, dir: refl, spread: 0.75, grav: 16 });
      this.ps.burst(end, 1, { speed: 0, color: [5, 3.4, 1.5], size: 0.3, life: 0.05, grav: 0 });
      this.ps.puff(end, 3, { dir: n, speed: 1.5, spread: 0.6, size: 0.26, life: 0.85, color: [0.78, 0.7, 0.6], alpha: 0.5 });
    }
    // tracer (every shot, so the rhythm reads evenly) + flash + light. The tracer starts at the on-screen muzzle.
    const m = this.vm.muzzleCam(S.m);
    S.q.setFromEuler(S.e.set(p.pitch + p.recoilP + (rc ? rc.punch.x : 0), p.yaw + p.recoilY, 0));
    m.multiplyScalar(1.6).applyQuaternion(S.q).add(o);
    if (ult) this.tracers.fire(m, end, [6, 4.6, 1.3], 0.03, 0.12);
    else this.tracers.fire(m, end, [6, 4.2, 1.8], 0.015, 0.05);
    this.vm.fire(ult); sfx.shot(ult);
    if (this.quality === 'high') { this.muzzleLight.position.copy(o).addScaledVector(dir, 1.2); this.muzzleLight.intensity = 7; this.muzzleLight.color.set(ult ? 0xffd36a : 0xffc27a); }
    // gunfire alerts nearby bots
    for (const b of this.bots) if (b.alive && !b.aware && b.pos.distanceTo(p.pos) < 22) { b.aware = true; b.react = 0.8; b.lastSeenPos.copy(p.pos); b.lostT = 2; }
  }
  reload() {
    const p = this.player; if (p.reloadT > 0 || p.ammo === MAG) return;
    p.reloadT = RELOAD; this.vm.startReload(RELOAD); sfx.reload();
  }
  onKill(bot, head) {
    const p = this.player; p.kills++;
    UI.feed(PLAYER_NAME, bot.name, { hs: head });
    UI.hitmarker(head ? 'kill hs' : 'kill'); sfx.kill(p.kills); if (head) sfx.headshot();
    const idx = this.botIndex(bot); if (idx >= 0) UI.markBotDead(idx);
    const before = p.ult; p.ult = Math.min(ULT_COST, p.ult + 1);
    if (before < ULT_COST && p.ult === ULT_COST) { sfx.ultReady(); UI.toast('MAIN CHARACTER READY', 'PRESS X', 1600); }
    // the bot "shorts out": a pop of sparks from the chest, gold ones from the head on a headshot
    const chest = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.25, bot.pos.z);
    this.ps.burst(bot.head(), 18, { speed: 4, color: [[5, 1, 1.3], [5, 4, 1.2]], size: 0.08, life: 0.5, grav: 4 });
    this.ps.sparkBurst(chest, 26, { speed: 8, color: [[5, 0.9, 1.2], [5, 2.6, 1]], width: 0.014, life: 0.45, grav: 12, dir: new THREE.Vector3(0, 0.6, 0), spread: 1.2 });
    if (head) this.ps.sparkBurst(bot.head(), 36, { speed: 11, color: [[6, 4.4, 1.1], [6, 5.4, 2.6]], width: 0.018, life: 0.55, grav: 8, dir: new THREE.Vector3(0, 0.5, 0), spread: 1.3 });
    this.ps.puff(chest, 4, { size: 0.4, life: 1.0, speed: 0.8, color: [0.3, 0.3, 0.33], alpha: 0.45, grav: -0.8 });
  }
  botIndex(bot) { return bot.teamIdx ?? this.bots.indexOf(bot); }
  botFire(bot, target, dist) {
    const from = new THREE.Vector3(); bot.P.muzzle.getWorldPosition(from);
    const dir = target.clone().sub(from);
    // aim at where the player is, not where they will be (dodgeable); add spread
    const spread = 0.045 + dist * 0.0012;
    dir.normalize(); dir.x += (Math.random() - 0.5) * spread * 2; dir.y += (Math.random() - 0.5) * spread * 1.2; dir.z += (Math.random() - 0.5) * spread * 2; dir.normalize();
    const speed = 19 + Math.min(3, this.roundIdx) * 1.5;
    const dmg = 6 + Math.min(3, this.roundIdx);
    this.proj.spawn(from, dir, speed, dmg, bot);
    bot.onFire?.();
    this.ps.burst(from, 6, { speed: 2, color: [5, 0.8, 1], size: 0.08, life: 0.2, grav: 0 });
    this.ps.sparkBurst(from, 6, { speed: 5, color: [5, 1, 1.3], width: 0.01, life: 0.15, dir, spread: 0.5, grav: 0 });
    sfx.botShot(dist);
  }
  playerHit(dmg, owner) {
    const p = this.player; if (!p.alive || this.state === 'won' || this.state === 'boom') return;
    p.tookDamage = true; p.lastHurt = this.t;
    let d = dmg; const hadShield = p.shield > 0;
    if (p.shield > 0) { const s = Math.min(p.shield, d); p.shield -= s; d -= s; if (hadShield && p.shield <= 0) sfx.shieldBreak(); }
    p.hp -= d; sfx.hurt(); this.vm.hurt?.();
    this.post.grade.uniforms.uHurt.value = Math.min(0.7, this.post.grade.uniforms.uHurt.value + 0.35);
    const hf = UI.$('hurtfx'); hf.classList.add('on'); setTimeout(() => hf.classList.remove('on'), 90);
    if (owner) {
      const a = Math.atan2(owner.pos.x - p.pos.x, owner.pos.z - p.pos.z);
      UI.damageDir(-(a - (p.yaw + PI)));
      owner.aware = true;
    }
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; this.deathT = 0;
      UI.feed(owner ? owner.name : 'DEADLINE', PLAYER_NAME, { me: false });
      this.lossReason = 'dead'; this.loseRound('dead');
    }
  }
  whiz() { sfx.whiz(); }

  // ── abilities ────────────────────────────────────────────────────────────
  useDash(wx, wz, len) {
    const p = this.player; if (p.cdQ > 0 || p.dashT > 0) return;
    if (len < 0.1) { wx = -Math.sin(p.yaw); wz = -Math.cos(p.yaw); }
    const L = Math.hypot(wx, wz); p.dashDir.set(wx / L, 0, wz / L);
    p.dashT = 0.2; p.cdQ = DASH_CD; sfx.dash(); UI.pulse('abQ');
    const cols = [[5, 1.2, 1.5], [5, 3.6, 0.5], [0.8, 3.6, 3.2], [4.6, 1, 4], [4.6, 4.4, 4]];
    // burst of colour where the dash starts (kept low and behind so it doesn't white-out the view)
    const at = new THREE.Vector3(p.pos.x - p.dashDir.x * 0.8, p.pos.y + 0.6, p.pos.z - p.dashDir.z * 0.8);
    const soft = cols.map((c) => c.map((v) => v * 0.6));
    this.ps.burst(at, 30, { speed: 4, color: soft, size: 0.09, life: 0.8, grav: -0.5, drag: 2 });
    this.ps.sparkBurst(at, 26, { speed: 8, color: soft, width: 0.018, life: 0.5, grav: 0, drag: 3, stretch: 0.06 });
    // Garba ribbons: swirling colour streamers left along the dash path, plus mirror-work glints
    const d = p.dashDir.clone(), side = new THREE.Vector3(-d.z, 0, d.x);
    let k = 0;
    this.ps.addEmitter((dt, t) => {
      if (t > 0.32) return;
      const n = Math.max(2, Math.round(dt * 160));
      for (let i = 0; i < n; i++) {
        k++; const c = soft[k % soft.length]; const a = k * 0.9 + t * 30;
        const r = 0.55 + 0.25 * Math.sin(k * 1.7);
        const ox = side.x * Math.cos(a) * r, oz = side.z * Math.cos(a) * r, oy = 1.0 + Math.sin(a) * r;
        this.ps.sparks.emit(p.pos.x + ox - d.x * 0.6, p.pos.y + oy, p.pos.z + oz - d.z * 0.6,
          -d.x * 3 + side.x * Math.cos(a) * 1.5, Math.sin(a) * 1.5 + 0.4, -d.z * 3 + side.z * Math.cos(a) * 1.5,
          c[0], c[1], c[2], 0.035, 0.75, 0, 2.2, 0.12);
        if (i % 4 === 0) this.ps.emit(p.pos.x + ox * 1.6 - d.x, p.pos.y + oy * 0.8, p.pos.z + oz * 1.6 - d.z, (Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5), 3, 3, 2.8, 0.05, 0.6, -0.3, 1.5);
      }
    }, 0.4);
    this.vm.dash?.(cols);
  }
  useUpdraft() {
    const p = this.player; if (p.cdE > 0) return;
    p.vel.y = 14.6; p.onGround = false; p.cdE = UP_CD; p.updraftT = 0.7; sfx.updraft(); UI.pulse('abE');
    for (let i = 0; i < 48; i++) { const a = (i / 48) * PI * 2; this.ps.emit(p.pos.x + Math.cos(a) * 0.6, p.pos.y + 0.1, p.pos.z + Math.sin(a) * 0.6, Math.cos(a) * 7, 0.6, Math.sin(a) * 7, 2.6, 3.4, 3.6, 0.16, 0.6, 0, 3); }
    // ground shockwave + dust kicked up by the gust
    const g = new THREE.Vector3(p.pos.x, p.pos.y + 0.15, p.pos.z);
    for (let i = 0; i < 36; i++) { const a = (i / 36) * PI * 2; this.ps.sparks.emit(g.x + Math.cos(a) * 0.5, g.y, g.z + Math.sin(a) * 0.5, Math.cos(a) * 9, 0.8, Math.sin(a) * 9, 2.2, 3.4, 3.6, 0.03, 0.45, 0, 4, 0.06); }
    this.ps.puff(g, 10, { speed: 4, size: 0.5, life: 1.1, color: [0.85, 0.78, 0.7], alpha: 0.45, dir: new THREE.Vector3(0, 0.25, 0), spread: 1 });
    this.vm.updraft?.();
  }
  windSwirl(dt = 0.016) {
    // spiral wind lines that rise with the player (so they stay in view in first person)
    const p = this.player; const t = this.t;
    const n = Math.max(2, Math.round(dt * 200));
    for (let i = 0; i < n; i++) {
      const a = t * 13 + (i / n) * PI * 2 + Math.random() * 0.4; const r = 0.85 + Math.random() * 0.5;
      const y = p.pos.y - 0.2 + Math.random() * 2.2;
      const w = Math.random() < 0.25;
      this.ps.sparks.emit(p.pos.x + Math.cos(a) * r, y, p.pos.z + Math.sin(a) * r,
        -Math.sin(a) * 6.5 + p.vel.x * 0.8, p.vel.y * 0.75 + 1.5, Math.cos(a) * 6.5 + p.vel.z * 0.8,
        w ? 2.2 : 1.0, w ? 2.3 : 1.9, w ? 2.1 : 2.0, w ? 0.018 : 0.012, 0.45, 0, 1.2, 0.07);
    }
    if (Math.random() < 0.5) this.ps.emit(p.pos.x + (Math.random() - 0.5) * 2, p.pos.y + Math.random() * 2, p.pos.z + (Math.random() - 0.5) * 2, 0, p.vel.y * 0.6, 0, 2.6, 3.6, 3.6, 0.08, 0.5, 0, 1);
  }
  useUlt() {
    const p = this.player; if (p.ult < ULT_COST || p.ultT > 0) return;
    p.ult = 0; p.ultT = ULT_TIME; this.timeScale = 0.4; sfx.ult(); UI.pulse('abX');
    UI.banner('ULTIMATE', 'MAIN CHARACTER', 'EVERYTHING ELSE IS A SIDE QUEST', 'round', 1800);
    UI.flash();
    // golden shockwave, a pillar of light and a shower of glitter
    const gold = [[6, 4.4, 1.2], [6, 5.2, 2.4], [5, 3.2, 0.7]];
    const g = new THREE.Vector3(p.pos.x, p.pos.y + 0.2, p.pos.z);
    for (let i = 0; i < 72; i++) { const a = (i / 72) * PI * 2; const c = gold[i % 3]; this.ps.sparks.emit(g.x + Math.cos(a) * 0.6, g.y, g.z + Math.sin(a) * 0.6, Math.cos(a) * 14, 0.5, Math.sin(a) * 14, c[0], c[1], c[2], 0.04, 0.7, 0, 2.2, 0.05); }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * PI * 2, r = 1.6 + Math.random() * 0.6; const c = gold[i % 3]; this.ps.sparks.emit(g.x + Math.cos(a) * r, g.y, g.z + Math.sin(a) * r, 0, 7 + Math.random() * 7, 0, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.025, 0.9, 6, 1, 0.05); }
    for (let i = 0; i < 40; i++) { const a = Math.random() * PI * 2, r = 1.8 + Math.random() * 1.5; const c = gold[i % 3]; this.ps.emit(g.x + Math.cos(a) * r, g.y + Math.random() * 2.5, g.z + Math.sin(a) * r, Math.cos(a) * 1.5, 1 + Math.random() * 2, Math.sin(a) * 1.5, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.08, 1.2, 1, 1.5); }
    this.ps.addEmitter((dt) => {
      if (p.ultT <= 0 || !p.alive) return false;
      const n = Math.random() < dt * 40 ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * PI * 2, r = 1.2 + Math.random() * 2.2; const c = gold[(Math.random() * 3) | 0];
        this.ps.emit(p.pos.x + Math.cos(a) * r, p.pos.y + Math.random() * 2.4, p.pos.z + Math.sin(a) * r, 0, 0.6 + Math.random(), 0, c[0], c[1], c[2], 0.06, 1.2, -0.2, 0.5);
      }
    }, 999);
    this.vm.ult?.(ULT_TIME);
  }
  rescueCat() {
    const p = this.player; p.catRescued = true;
    p.hp = 100; p.shield = 50; p.ult = ULT_COST;
    UI.toast('CAT RESCUED · +1000 AURA', 'FULL HEAL · FULL SHIELD · ULT READY', 2800);
    sfx.aura(); sfx.meow();
    const c = this.map.dyn.catHit;
    this.ps.burst(c, 70, { speed: 5, color: [[5, 4, 1.2], [5, 1.4, 3], [1, 4, 3.6]], size: 0.12, life: 1.2, grav: -0.5, drag: 1.5 });
  }

  // ── final round ──────────────────────────────────────────────────────────
  inPlantZone() { const c = this.map.dyn.plantCenter; const p = this.player.pos; return Math.hypot(p.x - c.x, p.z - c.z) < this.map.dyn.plantRadius && p.y < 0.6; }
  plantCake() {
    const p = this.player; p.carrying = false; p.plantT = 0; this.cakePlanted = true; this.cakeT = FINAL_ROUND.defendSeconds;
    UI.show('plantbar', false); UI.tip(''); UI.show('cakechip', false); UI.show('tF', false);
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    this.cake.position.set(p.pos.x + fwd.x * 0.9, p.pos.y, p.pos.z + fwd.z * 0.9); this.cake.visible = true;
    this.cakeLight.position.copy(this.cake.position).add(new THREE.Vector3(0, 1, 0));
    const d = this.map.dyn; d.plantBeacon.visible = false; this.plantLabel.visible = false;
    sfx.planted(); UI.banner('CAKE PLANTED', 'DEFEND', `${FINAL_ROUND.defendSeconds} SECONDS · HOLD THE PANTRY`, 'round', 2200);
    UI.$('objective').textContent = 'DEFEND THE CAKE';
    this.beepT = 0;
    // queue the rush
    const spawns = ['bSite', 'backHall', 'bMain', 'mid', 'backHall2', 'bBoard'];
    this.rushQueue = FINAL_ROUND.rushers.map((n, i) => ({ name: n, at: 1.5 + Math.floor(i / 2) * 6, post: spawns[i % spawns.length] }));
    const all = this.bots.map((b) => b.name).concat(FINAL_ROUND.rushers);
    UI.teamIcons(all); this.bots.forEach((b, i) => { b.teamIdx = i; if (!b.alive) UI.markBotDead(i); });
    this.rushIdx = this.bots.length;
  }
  updateFinal(dt) {
    if (!this.cakePlanted) return;
    this.cakeT -= dt;
    const elapsed = FINAL_ROUND.defendSeconds - this.cakeT;
    // spawn rushers
    while (this.rushQueue.length && this.rushQueue[0].at <= elapsed) {
      const q = this.rushQueue.shift(); const pp = this.map.posts[q.post];
      const b = new Bot(this.scene, q.name, pp[0], pp[1], { yaw: PI, difficulty: 2, hp: 80, rush: this.cake.position.clone() });
      b.frozen = false; b.aware = true; b.teamIdx = this.rushIdx++; this.bots.push(b);
    }
    // beeps speed up
    this.beepT -= dt; const interval = this.cakeT > 10 ? 1 : this.cakeT > 5 ? 0.5 : 0.25;
    if (this.beepT <= 0) { this.beepT = interval; sfx.cakeBeep(); this.cake.userData.ring.material.opacity = 1; }
    if (this.cakeT <= 0) this.detonate();
  }
  detonate() {
    this.state = 'boom'; this.boomT = 0; this.cakeT = 0; this.score.me++;
    const c = this.cake.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    sfx.boom(); UI.flash();
    this.confetti.burst(c, 600, 16);
    this.ps.burst(c, 120, { speed: 18, color: [[3, 0.7, 0.9], [3, 2.1, 0.3], [0.5, 2.2, 2], [2.6, 2.5, 2.3]], size: 0.22, life: 1.6, grav: 3, drag: 1.4 });
    for (const b of this.bots) if (b.alive) { b.damage(9999, 1, false); }
    this.timeScale = 0.5; this.slowT = 2.5;
    this.post.grade.uniforms.uFlash.value = 0.3;
    UI.tip(''); UI.$('objective').textContent = '';
    this.input.fire = false;
  }
  updateBoom(dt) {
    const t = this.boomT; const p = this.player;
    this.post.grade.uniforms.uFlash.value = Math.max(0, this.post.grade.uniforms.uFlash.value - dt * 0.8);
    // look up at the fireworks
    p.pitch += (0.42 - p.pitch) * Math.min(1, dt * 1.2);
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    this.fwT = (this.fwT || 0) - dt;
    if (this.fwT <= 0) { this.fwT = 0.35 + Math.random() * 0.4; const c = this.cake.position; this.fireworks.launch(c.x + (Math.random() - 0.5) * 30 - Math.sin(p.yaw) * 20, c.z + (Math.random() - 0.5) * 30 - Math.cos(p.yaw) * 20); }
    if (Math.random() < dt * 3) this.confetti.burst(new THREE.Vector3(p.pos.x + (Math.random() - 0.5) * 16, 9, p.pos.z + (Math.random() - 0.5) * 16), 40, 6);
    this.vm.update(dt, { moving: false, speed: 0, onGround: true, lookDX: 0, lookDY: 0, lowered: true, tilt: 0 });
    if (t > 1.5 && !this.bannerShown) { this.bannerShown = true; UI.banner('THE CAKE HAS DETONATED', 'HAPPY BIRTHDAY', 'MATCH WIN', 'win', 3000); sfx.win(); }
    if (t > 5.2) this.showEnd();
  }
  showEnd() {
    this.state = 'end'; this.input.unlock(); this.input.enabled = false; this.bannerShown = false;
    UI.show('card', false); UI.show('pause', false); UI.stopNote();
    UI.show('hud', false); UI.show('touch', false); UI.hideBanner();
    const again = () => this.playAgain(); // resets the match and returns to map select
    // the post-game film plays first; the GG screen comes after it (and can replay it)
    const toEnding = () => UI.showEnding(again, () => { UI.show('ending', false); film(); });
    const film = () => import('./slideshow.js').then(({ playSlideshow }) => {
      if (this.state !== 'end') return;
      this.fwT = 1e9; // let the last fireworks burn out as the film fades in
      this.film = playSlideshow({
        onOpaque: () => { this.render = () => {}; }, // the 3D scene is fully covered: stop drawing it
        onDone: () => { delete this.render; this.fwT = 0; this.film = null; if (this.state === 'end') toEnding(); },
      });
    }).catch(() => { document.querySelectorAll('.film').forEach((e) => e.remove()); if (this.state === 'end') toEnding(); }); // never lose the GG screen
    film();
  }
  endUpdate(dt) {
    // keep the celebration going behind the ending screen
    this.fwT = (this.fwT || 0) - dt; const p = this.player;
    if (this.fwT <= 0) { this.fwT = 0.5 + Math.random() * 0.6; const c = this.cake.position; this.fireworks.launch(c.x + (Math.random() - 0.5) * 34 - Math.sin(p.yaw) * 22, c.z + (Math.random() - 0.5) * 34 - Math.cos(p.yaw) * 22); }
    this.fireworks.update(dt); this.ps.update(dt); this.confetti.update(dt);
    p.yaw += dt * 0.04; this.camera.rotation.set(p.pitch, p.yaw, 0);
  }

  // ── world animation ──────────────────────────────────────────────────────
  animateWorld(dt) {
    const d = this.map.dyn; const t = this.t;
    // barrier drop
    if (this.barrierAnim) {
      this.barrierAnim += dt; const k = Math.min(1, this.barrierAnim / 0.7);
      d.barrier.position.y = 2.5 - k * k * 5.2; d.barrier.material.uniforms.uA.value = 1 - k * 0.5;
      if (k >= 1) { d.barrier.visible = false; this.barrierAnim = 0; }
    }
    d.barrier.material.uniforms.uTime.value = t;
    for (const c of d.clouds) { c.userData.a += c.userData.sp * dt; c.position.x = Math.cos(c.userData.a) * c.userData.d; c.position.z = Math.sin(c.userData.a) * c.userData.d; }
    // cat idles: tail sway + head look
    if (d.cat) { d.cat.userData.tail.rotation.y = Math.sin(t * 2.2) * 0.35; d.cat.userData.head.rotation.y = Math.sin(t * 0.5) * 0.4; }
    // fountain spray
    if (dt > 0 && Math.random() < 0.9) { const f = d.fountain; for (let i = 0; i < 2; i++) { const a = Math.random() * PI * 2; this.ps.emit(f.x, f.y, f.z, Math.cos(a) * 1.2, 2.6 + Math.random(), Math.sin(a) * 1.2, 1.4, 2.2, 2.4, 0.07, 0.75, 7, 0); } }
    // string-light twinkle
    if (d.bulbs && Math.floor(t * 4) !== this.twk) {
      this.twk = Math.floor(t * 4); const im = d.bulbs; const c = new THREE.Color();
      for (let i = 0; i < 6; i++) { const k = (Math.random() * im.count) | 0; c.copy(d.bulbCols[k % 4]).multiplyScalar(0.5 + Math.random() * 0.8); im.setColorAt(k, c); }
      im.instanceColor.needsUpdate = true;
    }
    // neon flicker
    d.signs.forEach((s, i) => { if (i === 3) s.material.opacity = Math.sin(t * 23) > 0.97 || Math.sin(t * 7.3 + 1) > 0.995 ? 0.5 : 1; });
    // plant marker
    if (d.plantRing.visible) { d.plantRing.material.opacity = 0.5 + Math.sin(t * 4) * 0.3; this.plantLabel.position.y = 4.2 + Math.sin(t * 2) * 0.15; }
    // cake
    if (this.cake.visible) {
      this.cake.userData.flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 20 + i) * 0.2, 1.6 + Math.sin(t * 17 + i * 2) * 0.4, 1); });
      const r = this.cake.userData.ring; r.material.opacity = Math.max(0.15, r.material.opacity - dt * 2); r.scale.setScalar(1 + (1 - r.material.opacity) * 0.8);
      this.cakeLight.intensity = 2.5 + Math.sin(t * 25) * 0.6;
    } else this.cakeLight.intensity = 0;
  }

  // ── HUD ──────────────────────────────────────────────────────────────────
  set(id, key, val, fn) { if (this.hudCache[key] !== val) { this.hudCache[key] = val; fn(UI.$(id), val); } }
  updateHUD() {
    const p = this.player;
    const hp = Math.ceil(p.hp), sh = Math.ceil(p.shield);
    this.set('hpNum', 'hp', hp, (el, v) => { el.textContent = v; el.classList.toggle('low', v < 30); });
    this.set('shNum', 'sh', sh, (el, v) => (el.textContent = v));
    this.set('hpBar', 'hpb', hp, (el, v) => (el.style.width = v + '%'));
    this.set('shBar', 'shb', sh, (el, v) => (el.style.width = (v / 50) * 100 + '%'));
    this.set('hurtfx', 'low', p.hp < 30 && p.alive, (el, v) => el.classList.toggle('low', v));
    const ammoTxt = p.reloadT > 0 ? '··' : String(p.ammo);
    this.set('ammo', 'ammo', ammoTxt, (el, v) => { el.textContent = v; el.classList.toggle('low', p.ammo <= 5 && p.reloadT <= 0); });
    this.set('scoreMe', 'sm', this.score.me, (el, v) => (el.textContent = v));
    this.set('scoreThem', 'st', this.score.them, (el, v) => (el.textContent = v));
    let tm;
    if (this.state === 'boom') tm = 'GG';
    else if (this.cakePlanted && this.state === 'live') tm = '🎂 ' + Math.max(0, Math.ceil(this.cakeT));
    else if (this.state === 'buy') tm = '0:' + String(Math.max(0, Math.ceil(5.1 - this.buyT))).padStart(2, '0');
    else { const s = Math.max(0, Math.ceil(this.roundTime)); tm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    this.set('timer', 'tm', tm, (el, v) => { el.textContent = v; el.classList.toggle('urgent', !this.cakePlanted && this.roundTime < 20); el.classList.toggle('cake', !!this.cakePlanted); });
    const ab = (id, cd, max, key) => this.set(id, key, cd > 0 ? Math.ceil(cd * 10) : 0, (el) => {
      el.classList.toggle('ready', cd <= 0);
      el.querySelector('.cd').style.height = `${(cd / max) * 100}%`;
      el.querySelector('.cdn').textContent = cd > 0 ? Math.ceil(cd) : '';
    });
    ab('abQ', p.cdQ, DASH_CD, 'q'); ab('abE', p.cdE, UP_CD, 'e');
    this.set('pips', 'ult', p.ult + (p.ultT > 0 ? 10 : 0), (el) => {
      el.innerHTML = Array.from({ length: ULT_COST }, (_, i) => `<i class="${i < p.ult ? 'on' : ''}"></i>`).join('');
      UI.$('abX').classList.toggle('ready', p.ult >= ULT_COST); UI.$('tX').classList.toggle('ready', p.ult >= ULT_COST);
      UI.$('cross').classList.toggle('gold', p.ultT > 0);
    });
    this.drawMinimap();
  }

  buildMinimap() {
    const S = 3.8, W = 360, H = 300, ox = W / 2, oz = H / 2;
    this.mm = { S, ox, oz, cv: UI.$('minimap'), base: document.createElement('canvas') };
    const b = this.mm.base; b.width = W; b.height = H; const x = b.getContext('2d');
    x.fillStyle = 'rgba(236,232,225,0.10)'; x.fillRect(ox - 45 * S, oz - 35 * S, 90 * S, 70 * S);
    x.fillStyle = 'rgba(15,25,35,0.9)';
    for (const s of solids) {
      if (s.max[1] < 1.6 || s.min[1] > 2 || s.tag === 'barrier') continue;
      x.fillRect(ox + s.min[0] * S, oz + s.min[2] * S, (s.max[0] - s.min[0]) * S, (s.max[2] - s.min[2]) * S);
    }
    x.fillStyle = 'rgba(236,232,225,0.25)';
    for (const s of solids) { if (s.max[1] >= 1.6 || s.tag === 'barrier') continue; x.fillRect(ox + s.min[0] * S, oz + s.min[2] * S, (s.max[0] - s.min[0]) * S, (s.max[2] - s.min[2]) * S); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const labels = this.map.labels || [{ text: 'A', x: -27, z: -27 }, { text: 'B', x: 30, z: -21 }, { text: 'MID', x: 0, z: 10, size: 18, color: 'rgba(236,232,225,0.4)' }];
    for (const l of labels) { x.font = `${l.size || 28}px "Bebas Neue", Impact, sans-serif`; x.fillStyle = l.color || 'rgba(255,70,85,0.85)'; x.fillText(l.text, ox + l.x * S, oz + l.z * S); }
  }
  drawMinimap() {
    const { S, ox, oz, cv, base } = this.mm; const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height); x.drawImage(base, 0, 0);
    if (this.R && this.R.final && !this.cakePlanted) { x.strokeStyle = '#FFC21A'; x.lineWidth = 2; x.beginPath(); x.arc(ox - 27 * S, oz - 27 * S, 4.5 * S, 0, 7); x.stroke(); }
    if (this.cake.visible) { x.fillStyle = '#FFC21A'; x.beginPath(); x.arc(ox + this.cake.position.x * S, oz + this.cake.position.z * S, 5, 0, 7); x.fill(); }
    for (const b of this.bots) {
      if (!b.alive) continue;
      const px = ox + b.pos.x * S, pz = oz + b.pos.z * S;
      x.fillStyle = b.canSee ? '#FF4655' : 'rgba(255,70,85,0.55)';
      x.save(); x.translate(px, pz); x.rotate(PI / 4); x.fillRect(-4, -4, 8, 8); x.restore();
    }
    const p = this.player; const px = ox + p.pos.x * S, pz = oz + p.pos.z * S;
    x.save(); x.translate(px, pz); x.rotate(-p.yaw);
    x.fillStyle = 'rgba(127,227,214,0.25)'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 34, -PI / 2 - 0.6, -PI / 2 + 0.6); x.fill();
    x.fillStyle = '#7fe3d6'; x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 6); x.lineTo(0, 3); x.lineTo(-6, 6); x.closePath(); x.fill();
    x.restore();
  }
}

// Frees every GPU resource under `root` (geometries, materials, their textures, instanced
// buffers) and empties it. Sprites share one global geometry, so theirs is left alone.
function disposeObject(root) {
  const geos = new Set(), mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (o.geometry && !o.isSprite) geos.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    if (o.isInstancedMesh) o.dispose();
  });
  for (const m of mats) {
    for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
    if (m.uniforms) for (const u of Object.values(m.uniforms)) { const v = u && u.value; if (v && v.isTexture) texs.add(v); else if (Array.isArray(v)) v.forEach((t) => t && t.isTexture && texs.add(t)); }
    m.dispose();
  }
  geos.forEach((g) => g.dispose()); texs.forEach((t) => t.dispose());
  root.clear();
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function loadSettings(mobile) {
  const d = { volume: 0.8, sens: 1, quality: null };
  try { return { ...d, ...JSON.parse(localStorage.getItem('chikorant') || '{}') }; } catch (e) { return d; }
}
function saveSettings(s) { try { localStorage.setItem('chikorant', JSON.stringify(s)); } catch (e) { /* */ } }
export { getVolume };
