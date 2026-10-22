// Tiny shared plumbing: an event bus and safe persistent storage.

const target = new EventTarget();

export const bus = {
  on(type, fn) {
    const h = (e) => fn(e.detail);
    target.addEventListener(type, h);
    return () => target.removeEventListener(type, h);
  },
  emit(type, detail) {
    target.dispatchEvent(new CustomEvent(type, { detail }));
  },
};

/** localStorage that never throws (private mode, blocked storage …). */
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

const PREFS = 'dp:prefs';
export const prefs = {
  get: (k, fallback) => store.get(PREFS, {})[k] ?? fallback,
  set: (k, v) => store.set(PREFS, { ...store.get(PREFS, {}), [k]: v }),
};

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** URL of a generated illustration in public/art (respects Vite's base, e.g. GitHub Pages). */
export const artUrl = (id) => `${import.meta.env.BASE_URL}art/${id}.webp`;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Build DOM from a tagged template; values are escaped unless wrapped with raw(). */
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: String(s) });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function html(strings, ...values) {
  const out = strings.reduce((acc, s, i) => {
    const v = values[i - 1];
    const str = Array.isArray(v) ? v.map((x) => (x?.[RAW] ?? esc(x))).join('') : v?.[RAW] ?? esc(v);
    return acc + str + s;
  });
  return raw(out);
}
export function render(el, markup) {
  el.innerHTML = markup[RAW] ?? esc(markup);
}
export function fragment(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup[RAW];
  return tpl.content;
}
