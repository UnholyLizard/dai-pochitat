// Small DOM and data helpers shared by the editor modules.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
export const round = (v, d = 4) => +(+v).toFixed(d);

// h('div.cls#id', {attrs, on: {click}}, ...children)
export function h(spec, props, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') Object.entries(v).forEach(([ev, fn]) => el.addEventListener(ev, fn));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach((k) => { if (k != null && k !== false) el.append(k instanceof Node ? k : String(k)); });
  return el;
}

export function get(obj, path) { return path.reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function set(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (o[path[i]] == null) o[path[i]] = typeof path[i + 1] === 'number' ? [] : {};
    o = o[path[i]];
  }
  if (value === undefined) delete o[path[path.length - 1]];
  else o[path[path.length - 1]] = value;
}
export const samePath = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
export const pathKey = (p) => (p || []).join('.');

export function fmtTime(t, fps = 60) {
  if (!isFinite(t)) return '—';
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}
export const frameOf = (t, fps = 60) => Math.round(t * fps);

export function debounce(fn, ms) {
  let id = 0;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

// tiny event bus
const subs = new Map();
export const on = (ev, fn) => { (subs.get(ev) || subs.set(ev, new Set()).get(ev)).add(fn); return () => subs.get(ev).delete(fn); };
export const emit = (ev, data) => (subs.get(ev) || []).forEach((fn) => fn(data));

export async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

let toastTimer = 0;
export function toast(msg, kind = 'info', ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const isTyping = (e) => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
