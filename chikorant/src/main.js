import './style.css';
import './mapselect.css';
import { Game } from './game.js';
import { initAudio, startLobbyMusic, stopLobbyMusic, stopAmbience, sfx } from './audio.js';
import { MAPS } from './config.js';
import { mapInfo } from './maps/index.js';
import * as UI from './ui.js';

const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const params = new URLSearchParams(location.search);
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  // canvas textures need the display font loaded first (don't wait forever)
  try { await Promise.race([Promise.all([document.fonts.load('80px "Bebas Neue"'), document.fonts.load('80px "Anton"'), document.fonts.load('700 20px Inter')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback fonts */ }
  const game = new Game({ canvas: document.getElementById('c'), mobile, quality: params.get('q') || (mobile ? 'low' : 'high'), forceQuality: params.has('q') });
  if (params.has('debug')) { window.G = game; game.noAutoPause = true; }
  UI.buildSelect(mobile);
  UI.buildMapSelect(MAPS);
  const splash = UI.$('splash'); splash.classList.add('ready');

  let started = false;
  const toSelect = () => {
    if (started) return; started = true;
    initAudio(); startLobbyMusic(); sfx.click();
    if (mobile) { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el)?.catch?.(() => {}); try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* */ } }
    UI.show('splash', false); UI.show('select');
  };
  splash.addEventListener('click', toSelect);
  splash.addEventListener('touchend', (e) => { e.preventDefault(); toSelect(); });
  addEventListener('keydown', (e) => { if (!UI.$('splash').hidden && (e.code === 'Enter' || e.code === 'Space')) toSelect(); });

  // agent select → LOCK IN → map select → CONFIRM → intro → round 1
  const openMaps = () => UI.openMapSelect({
    current: game.mapId,
    available: (id) => game.mapAvailable(id),
    preview: (id) => game.previewMap(id),
    onConfirm: async (id) => {
      game.input.enabled = true; game.input.lock(); // must happen inside the click gesture
      sfx.lockIn();
      await nextPaint(); // show "LOADING" before a (blocking) map build
      const loaded = await game.loadMap(id);
      if (loaded !== id) UI.setMapAvailable(id, false);
      stopLobbyMusic(); UI.setIntroMap(mapInfo(loaded)); UI.show('mapsel', false); UI.show('intro');
      setTimeout(() => { UI.show('intro', false); game.begin(); }, 2300);
    },
  });
  game.onPlayAgain = () => { stopAmbience(); startLobbyMusic(); openMaps(); };

  const lock = UI.$('lockin');
  lock.addEventListener('click', () => {
    if (lock.classList.contains('locked')) return;
    lock.classList.add('locked'); lock.textContent = 'LOCKED IN';
    UI.$('select').classList.add('locked'); UI.$('lockflash').classList.add('on');
    sfx.lockIn();
    setTimeout(() => { UI.show('select', false); openMaps(); }, 1300);
  });

  // ?skip jumps straight into round 1 (optionally on ?map=<id>)
  if (params.has('skip')) {
    initAudio(); UI.show('splash', false);
    const id = await game.loadMap(params.get('map') || game.mapId);
    UI.setIntroMap(mapInfo(id)); game.begin();
  }
}
boot();
