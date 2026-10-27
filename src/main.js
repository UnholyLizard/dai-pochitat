// Self-hosted fonts (no third-party requests; unicode-range keeps downloads to the scripts in use).
import '@fontsource-variable/literata/wght.css';
import '@fontsource-variable/literata/wght-italic.css';
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/caveat/700.css';
import './styles/main.css';
import { bus, reducedMotion, $, $$, raw, artUrl, viewport } from './lib/core.js';
import { initI18n, t, L, setLang } from './i18n/index.js';
import { game } from './game/state.js';
import { CRITTERS } from './content/game.js';
import { initSound, sfx } from './game/sfx.js';
import { initFeedback, toast, imgIcon } from './game/feedback.js';
import { initPassport, openPassport } from './game/passport.js';
import { initTheme, setNight, isNight, initScroll, getTarget, goTo, bookArea } from './ui/chrome.js';
import { initOracle, initSections, syncCritterButtons } from './ui/sections.js';
import { initLibrarian, send as askLibrarian, open as openLibrarian, close as closeLibrarian } from './librarian/chat.js';
import { bookById, loadSuggestions } from './content/books.js';

loadSuggestions(); // live catalogue picks for the chest and the librarian (offline list until it lands)
import { initPWA, install } from './pwa.js';
import { initCasting } from './ui/casting.js';
import { initMenu } from './ui/menu.js';
import { initAuth } from './lib/auth.js';

initI18n();
initTheme();
initSound();
initFeedback();
initPassport();
initSections();
initMenu();
initScroll();
game.visit();
initPWA();

let stage = null;
const stageEl = $('.stage');
const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

/* ── Book folk (collectibles) ─────────────────────────────────────────── */
function collect(id, origin) {
  if (!game.collect(id, origin)) {
    if (game.isAllFound()) {
      sfx.pop();
      const c = CRITTERS.find((x) => x.id === id);
      if (c) {
        toast(raw(`${t('toast.found', { name: t(`critter.${id}.name`) })}<br><small>${t(`critter.${id}.fact`)}</small>`), {
          icon: imgIcon(artUrl(c.art)),
          ms: 5200,
        });
      }
    }
    return;
  }
  stage?.collect(id);
  sfx.pop();
}
syncCritterButtons();
bus.on('game', syncCritterButtons);
bus.on('reset', () => { stage?.reset(); syncCritterButtons(); });
bus.on('allFound', () => { stage?.returnCritters(); syncCritterButtons(); });

for (const b of $$('[data-peek]')) b.addEventListener('click', () => collect(b.dataset.peek, center(b)));
$('[data-critter="badger"]')?.addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!game.isAllFound()) {
    collect('badger', center(b));
    b.animate([{ translate: '0 28%' }, { translate: '0 -20%' }, { translate: '0 110%' }], { duration: 900, easing: 'ease-in-out' })
      .finished.then(syncCritterButtons);
  } else {
    b.animate([{ translate: '0 0' }, { translate: '0 -20%' }, { translate: '0 0' }], { duration: 400, easing: 'ease-out' });
    collect('badger', center(b));
  }
});

/* ── What the librarian can do on the page ────────────────────────────────────── */
function librarianAction(a) {
  switch (a.type) {
    case 'goto':
      if (innerWidth < 860) closeLibrarian();
      goTo(a.id);
      break;
    case 'oracle': goTo('chest'); break;
    case 'catalog': location.assign('/catalog/'); break;
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
initLibrarian({ actions: librarianAction });
// The catalog page sends "ask the librarian about this book" back here.
const ask = new URLSearchParams(location.search).get('ask');
if (ask) {
  history.replaceState(null, '', location.pathname + location.hash);
  openLibrarian();
  askLibrarian(ask.slice(0, 300));
}
initAuth();

const casting = initCasting({
  onPick: (id) => stage?.setCandidate(id),
  onChat: () => openLibrarian(),
});

initOracle({
  onSpin() {
    game.award('oracle');
    stage?.celebrate('oracle');
  },
  onAsk(id) {
    askLibrarian(t('oracle.askText', { title: L(bookById(id).title) }));
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
    case 'audition':
      casting.audition(a.id);
      break;
    case 'librarian':
      sfx.pop();
      openLibrarian();
      break;
  }
}

bus.on('lang', () => { stage?.setLang(); game.award('polyglot'); });
bus.on('theme', (on) => stage?.setNight(on));

/* ── Things placed relative to the 3D book ─────────────────────────────── */
const hint = $('[data-book-hint]');
const doodle = $('[data-book-doodle]');
const zoomBtn = $('[data-zoom-open]');
const zoomUi = $('[data-zoom-ui]');
let zoomed = false;

let hintOut = window.scrollY > 2;
if (hintOut) hint.classList.add('is-out');

function syncHintScroll() {
  const shouldBeOut = window.scrollY > 2;
  if (shouldBeOut !== hintOut) {
    hintOut = shouldBeOut;
    hint.classList.toggle('is-out', hintOut);
    if (!hintOut) {
      sfx.pluck();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(10); } catch (err) { void err; }
      }
    }
  }
}
addEventListener('scroll', syncHintScroll, { passive: true });

function placeByBook(r) {
  const vw = viewport().w;
  if (r.closed) {
    // Under the closed cover, on its left: the scroll hint. Beside it: the hand-written note.
    if (window.scrollY <= 2) {
      hint.style.top = `${Math.round(r.bottom + 26)}px`;
      if (vw >= 860) {
        hint.style.left = `${Math.max(16, Math.round(r.left))}px`;
        hint.style.right = 'auto';
        hint.style.translate = 'none';
      } else {
        hint.style.left = '50%';
        hint.style.right = 'auto';
        hint.style.translate = '-50% 0';
      }
    }
    if (vw >= 860) {
      doodle.style.left = `${Math.round(r.left + 30)}px`;
      doodle.style.top = `${Math.round(Math.max(r.top - 92, 70))}px`;
    } else {
      doodle.style.top = `${Math.round(Math.max(r.top - 70, 60))}px`;
    }
  }
  // The magnifier rests on the book's near right corner, avoiding collision with the companion badge.
  let x = Math.min(r.right - 30, vw - 64);
  let y = Math.min(r.bottom - 30, viewport().small - 64);
  const fab = $('.librarian-fab');
  if (fab) {
    const f = fab.getBoundingClientRect();
    const margin = 14;
    const collidesX = x + 52 > f.left - margin && x < f.right + margin;
    const collidesY = y + 52 > f.top - margin && y < f.bottom + margin;
    if (collidesX && collidesY) {
      if (f.left - 52 - margin >= 16) {
        x = f.left - 52 - margin;
      } else {
        y = f.top - 52 - margin;
      }
    }
  }
  zoomBtn.style.left = `${Math.round(x)}px`;
  zoomBtn.style.top = `${Math.round(y)}px`;
}

function setZoom(on) {
  if (!stage || on === zoomed) return;
  zoomed = on;
  if (on) { closeLibrarian(); $('#menu')?.hidePopover?.(); $('#toc')?.hidePopover?.(); }
  stage.setZoom(on);
  document.documentElement.classList.toggle('is-zoomed', on);
  stageEl.classList.toggle('is-zoomed', on);
  zoomUi.hidden = !on;
  zoomBtn.hidden = on;
  // Everything behind the magnified book is out of reach until it closes.
  for (const el of $$('.topbar, main, footer, .librarian-dock, .skip-link')) el.inert = on;
  if (on) {
    sfx.pop();
    stage.enableTilt();
    $('[data-zoom-close]').focus();
  } else zoomBtn.focus({ preventScroll: true });
}

zoomBtn.addEventListener('click', () => { zoomBtn.classList.remove('is-new'); setZoom(true); });
$('[data-zoom-close]').addEventListener('click', () => setZoom(false));
$('[data-zoom-in]').addEventListener('click', () => stage?.zoomBy(1.3));
$('[data-zoom-out]').addEventListener('click', () => stage?.zoomBy(1 / 1.3));
document.addEventListener('keydown', (e) => {
  if (!zoomed) return;
  const pan = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[e.key];
  if (e.key === 'Escape') setZoom(false);
  else if (e.key === '+' || e.key === '=') stage.zoomBy(1.3);
  else if (e.key === '-') stage.zoomBy(1 / 1.3);
  else if (pan) { e.preventDefault(); stage.panBy(...pan); }
});

const zoomArea = () => {
  const { w, small: h } = viewport();
  const bottom = w < 860 ? 150 : 130; // room for the toolbar
  return { x: 10, y: 12, w: w - 20, h: h - 12 - bottom };
};

// Tilting the phone sways the book; iOS only allows that after a tap, so ask on the first
// touch of the book, the magnifier or the "open the book" button.
for (const el of [$('#stage-canvas'), zoomBtn, $('.hero__cta .btn--primary')]) {
  el?.addEventListener('pointerup', () => stage?.enableTilt(), { once: true });
}

/* ── 3D, after the page itself is on screen ───────────────────────────── */
function webglOK() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

function fail() {
  const img = $('.stage__fallback img');
  if (img) img.src = artUrl('house');
  stageEl.classList.remove('is-ready');
  stageEl.classList.add('is-failed');
}

async function boot3d() {
  if (!webglOK()) { fail(); return; }
  const canvas = $('#stage-canvas');
  canvas?.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('[stage] WebGL context lost, switching to 2D fallback');
    fail();
  });
  try {
    const { createStage } = await import('./scene/stage.js');
    stage = await createStage({
      canvas,
      getTarget,
      getArea: bookArea,
      getZoomArea: zoomArea,
      onBookRect: placeByBook,
      t,
      reducedMotion,
      night: isNight(),
      isFound: game.isFound,
      isAllFound: game.isAllFound,
      candidate: casting.selected,
      onAction: sceneAction,
    });
    stageEl.classList.add('is-ready');
    zoomBtn.hidden = false;
    zoomBtn.classList.add('is-new');
  } catch (err) {
    console.error('[stage]', err);
    fail();
  }
}
// Let the page paint and settle first; the book fades in right after.
if ('requestIdleCallback' in window) requestIdleCallback(boot3d, { timeout: 900 });
else setTimeout(boot3d, 200);
