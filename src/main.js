// Self-hosted fonts (no third-party requests; unicode-range keeps downloads to the scripts in use).
import '@fontsource-variable/literata/wght.css';
import '@fontsource-variable/literata/wght-italic.css';
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/caveat/700.css';
import './styles/main.css';
import { bus, reducedMotion, $, $$, artUrl } from './lib/core.js';
import { initI18n, t, L, setLang } from './i18n/index.js';
import { game } from './game/state.js';
import { initSound, sfx } from './game/sfx.js';
import { initFeedback, toast } from './game/feedback.js';
import { initPassport, openPassport } from './game/passport.js';
import { initTheme, setNight, isNight, initScroll, getTarget, goTo, bookArea } from './ui/chrome.js';
import { initOracle, initSections, syncCritterButtons } from './ui/sections.js';
import { initPippi, send as askPippi, open as openPippi, close as closePippi } from './pippi/chat.js';
import { bookById } from './content/books.js';
import { initPWA, install } from './pwa.js';

initI18n();
initTheme();
initSound();
initFeedback();
initPassport();
initSections();
initScroll();
game.visit();
initPWA();

let stage = null;
const stageEl = $('.stage');
const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

/* ── Book folk (collectibles) ─────────────────────────────────────────── */
function collect(id, origin) {
  if (!game.collect(id, origin)) return;
  stage?.collect(id);
  sfx.pop();
}
syncCritterButtons();
bus.on('game', syncCritterButtons);
bus.on('reset', () => { stage?.reset(); syncCritterButtons(); });

for (const b of $$('[data-peek]')) b.addEventListener('click', () => collect(b.dataset.peek, center(b)));
$('[data-critter="badger"]')?.addEventListener('click', (e) => {
  const b = e.currentTarget;
  collect('badger', center(b));
  b.animate([{ translate: '0 28%' }, { translate: '0 -20%' }, { translate: '0 110%' }], { duration: 900, easing: 'ease-in-out' })
    .finished.then(syncCritterButtons);
});

/* ── What Pippi can do on the page ────────────────────────────────────── */
function pippiAction(a) {
  switch (a.type) {
    case 'goto':
      if (innerWidth < 860) closePippi();
      goTo(a.id);
      break;
    case 'oracle': goTo('chest'); break;
    case 'theme': setNight(!isNight(), { byUser: true }); break;
    case 'passport': openPassport(); break;
    case 'lang': setLang(a.lang); break;
    case 'solve': game.solve(a.id); break;
    case 'install': install(); break;
    case 'upside': {
      const root = document.documentElement;
      root.classList.add('is-upside');
      game.award('upside');
      setTimeout(() => root.classList.remove('is-upside'), reducedMotion.matches ? 2000 : 3800);
      break;
    }
  }
}
initPippi({ actions: pippiAction });

initOracle({
  onSpin() {
    game.award('oracle');
    stage?.celebrate('oracle');
  },
  onAsk(id) {
    askPippi(t('oracle.askText', { title: L(bookById(id).title) }));
  },
});

/* ── Clicks inside the pop-up book ────────────────────────────────────── */
function sceneAction(a) {
  const origin = { x: a.x, y: a.y };
  switch (a.type) {
    case 'open': goTo('house'); break;
    case 'critter': collect(a.id, origin); break;
    case 'night': setNight(!isNight(), { byUser: true }); break;
    case 'horse':
      sfx.pop();
      toast(t('toast.horse'));
      game.award('strong', origin);
      break;
    case 'cake':
      sfx.party();
      game.award('candles', origin);
      break;
    case 'pippi':
      sfx.pop();
      openPippi();
      break;
  }
}

bus.on('lang', () => { stage?.setLang(); game.award('polyglot'); });
bus.on('theme', (on) => stage?.setNight(on));

/* ── 3D, after the page itself is on screen ───────────────────────────── */
function webglOK() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

function fail() {
  const img = $('.stage__fallback img');
  img.src = artUrl('house');
  stageEl.classList.add('is-failed');
}

async function boot3d() {
  if (!webglOK()) { fail(); return; }
  try {
    const { createStage } = await import('./scene/stage.js');
    stage = await createStage({
      canvas: $('#stage-canvas'),
      getTarget,
      getArea: bookArea,
      t,
      reducedMotion,
      night: isNight(),
      isFound: game.isFound,
      onAction: sceneAction,
    });
    stageEl.classList.add('is-ready');
  } catch (err) {
    console.error('[stage]', err);
    fail();
  }
}
// Let the page paint and settle first; the book fades in right after.
if ('requestIdleCallback' in window) requestIdleCallback(boot3d, { timeout: 900 });
else setTimeout(boot3d, 200);
