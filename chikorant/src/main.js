import './style.css';
import { Game } from './game.js';
import { initAudio, startLobbyMusic, stopLobbyMusic, sfx } from './audio.js';
import * as UI from './ui.js';

const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const params = new URLSearchParams(location.search);

async function boot() {
  // canvas textures need the display font loaded first (don't wait forever)
  try { await Promise.race([Promise.all([document.fonts.load('80px "Bebas Neue"'), document.fonts.load('80px "Anton"'), document.fonts.load('700 20px Inter')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback fonts */ }
  const game = new Game({ canvas: document.getElementById('c'), mobile, quality: params.get('q') || (mobile ? 'low' : 'high') });
  if (params.has('debug')) { window.G = game; game.noAutoPause = true; }
  UI.buildSelect(mobile);
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

  const lock = UI.$('lockin');
  lock.addEventListener('click', () => {
    if (lock.classList.contains('locked')) return;
    lock.classList.add('locked'); lock.textContent = 'LOCKED IN';
    UI.$('select').classList.add('locked'); UI.$('lockflash').classList.add('on');
    sfx.lockIn();
    game.input.enabled = true; game.input.lock(); // must happen inside the click gesture
    setTimeout(() => {
      stopLobbyMusic(); UI.show('select', false); UI.show('intro');
      setTimeout(() => { UI.show('intro', false); game.begin(); }, 2300);
    }, 1300);
  });

  if (params.has('skip')) { initAudio(); UI.show('splash', false); game.begin(); }
}
boot();
