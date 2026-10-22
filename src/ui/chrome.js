// Page chrome: theme (day / evening), scroll → book position, contents, in-page links.
import { bus, prefs, reducedMotion, $, $$ } from '../lib/core.js';
import { t } from '../i18n/index.js';
import { game } from '../game/state.js';
import { toast } from '../game/feedback.js';
import { sfx } from '../game/sfx.js';

/* ── Day / evening ─────────────────────────────────────────────────────── */
const root = document.documentElement;
export const isNight = () => root.dataset.theme === 'night';

export function setNight(on, { byUser = false } = {}) {
  if (on === isNight()) return;
  const apply = () => {
    root.dataset.theme = on ? 'night' : 'day';
    $('meta[name="theme-color"]')?.setAttribute('content', on ? '#141a30' : '#f4e8cf');
    for (const b of $$('[data-theme-toggle]')) b.setAttribute('aria-pressed', String(on));
  };
  // Cross-fade the whole page where View Transitions exist.
  if (document.startViewTransition && !reducedMotion.matches) document.startViewTransition(apply);
  else apply();
  prefs.set('theme', on ? 'night' : 'day');
  bus.emit('theme', on);
  if (byUser) {
    sfx.click();
    toast(t(on ? 'toast.night' : 'toast.day'));
    if (on) game.award('night');
  }
}

export function initTheme() {
  for (const b of $$('[data-theme-toggle]')) {
    b.setAttribute('aria-pressed', String(isNight()));
    b.addEventListener('click', () => setNight(!isNight(), { byUser: true }));
  }
}

/* ── Scroll → book position ────────────────────────────────────────────── */
// Each [data-spread] section owns one spread. The book is settled while the middle
// half of a section is centred and turns across section boundaries.
let sections = [];
let target = 0;
let current = -1;

function measure() {
  sections = $$('[data-spread]').map((el) => {
    const r = el.getBoundingClientRect();
    return { el, top: r.top + scrollY, height: r.height, spread: Number(el.dataset.spread) };
  });
  update();
}

function update() {
  if (!sections.length) return;
  const c = scrollY + innerHeight / 2;
  let g = 0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (c >= s.top || i === 0) g = i + Math.min(1, Math.max(0, (c - s.top) / s.height));
  }
  const x = g - 0.25;
  const k = Math.floor(x);
  const fr = x - k;
  target = Math.max(0, Math.min(sections.length - 1, k + Math.min(1, Math.max(0, (fr - 0.5) / 0.5))));

  const now = Math.round(target);
  if (now !== current) {
    const prev = current;
    current = now;
    bus.emit('spread', now);
    if (prev !== -1 && Math.abs(now - prev) === 1) sfx.page();
    for (const a of $$('.toc__list a')) a.setAttribute('aria-current', String(a.hash === `#${sections[now]?.el.id}`));
  }
  if (target > 0.9) game.award('open');
  if (target >= sections.length - 1.05) game.award('finish');
}

export const getTarget = () => target;

/** Scroll position at which a spread is fully open. */
export function spreadTop(id) {
  const s = sections.find((x) => x.el.id === id);
  if (!s) return 0;
  if (s.spread === 0) return 0;
  return Math.max(0, s.top + s.height * 0.5 - innerHeight / 2);
}

export function goTo(id) {
  scrollTo({ top: spreadTop(id), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

export function initScroll() {
  const cards = new ResizeObserver((entries) => {
    for (const e of entries) e.target.style.setProperty('--card-h', `${e.borderBoxSize[0].blockSize}px`);
  });
  for (const c of $$('.chapter > .card')) cards.observe(c);
  measure();
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', measure);
  new ResizeObserver(measure).observe(document.body);

  // In-page links land where their spread is open, not at the section's top.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.hash.length < 2 || !sections.some((s) => s.el.id === a.hash.slice(1))) return;
    e.preventDefault();
    $('#toc')?.hidePopover?.();
    goTo(a.hash.slice(1));
    history.replaceState(null, '', a.hash);
  });

  if (location.hash.length > 1) requestAnimationFrame(() => scrollTo({ top: spreadTop(location.hash.slice(1)) }));
}

/** Where the book should sit on screen: right of the text column, or the top half on phones. */
export function bookArea() {
  const vw = innerWidth, vh = innerHeight;
  const header = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 72;
  if (vw < 860) return { x: 0, y: header * 0.6, w: vw, h: vh * 0.52 };
  const card = $('#house .card');
  const right = card ? card.getBoundingClientRect().right : vw * 0.45;
  const x = right + vw * 0.01;
  return { x, y: header * 0.7, w: vw - x - vw * 0.015, h: vh - header * 0.7 - 16 };
}
