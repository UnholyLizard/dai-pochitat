// Timeline: one row per kind of sequence item. Bars move (body) or trim (edges), keyframes and markers retime;
// everything snaps to frames, and with Snap on to the playhead, other edges, clicks and anchors.
// Ripple shifts every later absolute time with a moved item (references follow their anchors on their own).
import { $, h, clamp, clone, round, get, on, emit, pathKey, samePath, fmtTime } from './util.js';
import { S, T, edit, commit, changed, select, setTime, duration, fps } from './store.js';
import { shiftTime, forEachTime, parseRef, extraKeys } from './schema.js';

const LABEL_W = 184;
const LANE_H = 22;
const PAD_R = 80;
let pps = 20;          // pixels per second
let fitMode = true;
let ITEMS = [];        // flat list of drawn items (index = data-i)
let lastScrollLeft = 0;

// ---------------------------------------------------------------------------
// item builders. An item: {path, kind: bar|key|mark, a, b, aT?, bT?, label, sub, cls,
//   move: [timePaths] | fn(seq, dt), edgeA, edgeB (same forms), fadeA, fadeB, tail, ticks, hold, lead, xf, thumb, err}
const isRef = (v) => !!parseRef(v);
const lastKeyT = (seq, base) => { const ks = get(seq, base) || []; return ks.length ? T(ks[ks.length - 1].t) : NaN; };
const finite = (v, d) => (Number.isFinite(v) ? v : d);

function envItem(path, o, label, extraMove = []) {
  if (!o) return null;
  const a = T(o.in);
  const bT = o.out == null ? duration() : T(o.out);
  return {
    path, kind: 'bar', a, b: bT + (o.out == null ? 0 : (o.fadeOut || 0)), aT: a, bT, label, cls: '',
    fadeA: o.fadeIn || 0, fadeB: o.out == null ? 0 : (o.fadeOut || 0), ref: isRef(o.in) || isRef(o.out),
    move: [[...path, 'in'], [...path, 'out'], ...extraMove], edgeA: [[...path, 'in']], edgeB: o.out == null ? null : [[...path, 'out']],
  };
}
function durItem(path, o, label, extraMove = []) {
  if (!o) return null;
  const a = T(o.in);
  return {
    path, kind: 'bar', a, b: a + (o.dur || 0), aT: a, bT: a + (o.dur || 0), label, cls: '',
    move: [[...path, 'in'], ...extraMove], edgeA: [[...path, 'in']],
    edgeB: (seq, dt) => { const x = get(seq, path); x.dur = Math.max(0, round(x.dur + dt)); },
  };
}
function markItem(path, timePath, t, label, cls = '') {
  return { path, kind: 'mark', a: t, b: t, label, cls, move: [timePath], ref: isRef(get(S.seq, timePath)) };
}

// keep footage content in place while the cut moves: t0 + lead - start/fps stays constant
function trimHead(i, a0, fpsShot) {
  return (seq, dt) => {
    const s = seq.segments[i];
    const K = a0 + (s.lead || 0) - (s.start || 0) / fpsShot;
    s.t0 = shiftTime(s.t0, dt);
    const d = K - (a0 + dt);
    if (d >= 0) { s.lead = round(d); s.start = 0; } else { s.lead = 0; s.start = Math.round(-d * fpsShot); }
  };
}

const ROWS = [
  { id: 'audio', label: 'Audio track', cls: 'audio', sel: ['audio'], add: 'audio', items(seq) {
    const au = seq.audio;
    if (!au) return [];
    const tr = typeof au === 'string' ? { src: au } : au;
    if (!tr.src) return [];
    const a = T(tr.t0 || 0);
    const b = tr.dur ? a + tr.dur : duration();
    const base = tr.src.split('/').pop();
    const sub = tr.mute ? 'muted' : `${tr.src}${tr.volume != null && tr.volume !== 1 ? ` · ${Math.round(tr.volume * 100)}%` : ''}`;
    return [{
      path: ['audio'], kind: 'bar', a, b, aT: a, bT: b,
      label: tr.label || base, sub, cls: 'audio',
      ref: isRef(tr.t0),
      move: [['audio', 't0']],
      edgeA: [['audio', 't0']],
      edgeB: (s, dt) => {
        if (typeof s.audio === 'string') s.audio = { src: s.audio };
        s.audio.dur = Math.max(0.5, round((s.audio.dur || (duration() - a)) + dt));
      }
    }];
  } },
  { id: 'segments', label: 'Footage', cls: 'foot', add: 'segment', items(seq) {
    const segs = seq.segments || [];
    const end = finite(lastKeyT(seq, ['browser', 'camera']), duration());
    return segs.map((s, i) => {
      const a = T(s.t0);
      const nextA = i + 1 < segs.length ? T(segs[i + 1].t0) : end;
      const sh = s.shot ? S.info.shots[s.shot] : null;
      const f = (sh && sh.fps) || 60;
      const it = { path: ['segments', i], kind: 'bar', a, b: Math.max(a, finite(nextA, a)), aT: a, label: s.id || s.shot || 'still', sub: s.still ? 'still' : s.shot, cls: 'foot', ref: isRef(s.t0) };
      if (s.shot && !sh) it.err = `no footage/${s.shot}`;
      if (sh) {
        const base = a + (s.lead || 0) - (s.start || 0) / f;
        it.ticks = (sh.clicks || []).map((c) => base + c).filter((x) => x >= a && x <= it.b);
        const fe = base + (sh.frames - 1) / f;
        if (fe < it.b - 1 / f) it.hold = [Math.max(a, fe), it.b];
        if (s.lead) it.lead = [a, a + s.lead];
        it.thumb = `/footage/${s.shot}/f${String(s.start || 0).padStart(4, '0')}.jpg`;
      } else if (s.still) it.thumb = `/stage/${s.still}`;
      if (i > 0) it.xf = s.xf != null ? s.xf : (seq.crossfade != null ? seq.crossfade : 0.34);
      it.move = [['segments', i, 't0']];
      it.edgeA = trimHead(i, a, f);
      return it;
    });
  } },
  { id: 'bcam', label: 'Browser camera', cls: 'cam', items: (seq) => keyItems(seq, ['browser', 'camera']), add: 'bkey' },
  { id: 'phone', label: 'Phone footage', cls: 'foot', sel: ['phone'], items(seq) {
    const p = seq.phone;
    if (!p) return [];
    const a = T(p.t0);
    const sh = S.info.shots[p.shot];
    const f = (sh && sh.fps) || 60;
    const end = finite(lastKeyT(seq, ['phone', 'camera']), duration());
    const it = { path: ['phone'], kind: 'bar', a, b: Math.max(a, end), aT: a, label: p.id || 'phone', sub: p.shot, cls: 'foot', move: [['phone', 't0']] };
    if (!sh) it.err = `no footage/${p.shot}`;
    else {
      const base = a + (p.lead || 0) - (p.start || 0) / f;
      it.ticks = (sh.clicks || []).map((c) => base + c);
      const fe = base + (sh.frames - 1) / f;
      if (fe < it.b) it.hold = [Math.max(a, fe), it.b];
      if (p.lead) it.lead = [a, a + p.lead];
      it.thumb = `/footage/${p.shot}/f${String(p.start || 0).padStart(4, '0')}.jpg`;
    }
    return [it];
  } },
  { id: 'pcam', label: 'Phone camera', cls: 'cam', items: (seq) => keyItems(seq, ['phone', 'camera']), add: 'pkey' },
  { id: 'captions', label: 'Captions', cls: 'cap', add: 'caption', items(seq) {
    return (seq.captions || []).map((c, i) => {
      const a = T(c.in), bT = T(c.out);
      const plain = String((c.title || [])[0] || '').replace(/\*/g, '');
      return { path: ['captions', i], kind: 'bar', a, b: bT + (c.outDur != null ? c.outDur : 0.55), aT: a, bT, tail: [bT, bT + (c.outDur != null ? c.outDur : 0.55)],
        label: `${c.num || ''} ${c.kicker || c.id || ''}`.trim(), sub: plain, cls: 'cap', ref: isRef(c.in) || isRef(c.out),
        move: [['captions', i, 'in'], ['captions', i, 'out']], edgeA: [['captions', i, 'in']], edgeB: [['captions', i, 'out']] };
    });
  } },
  { id: 'chips', label: 'Chips', cls: 'chip', add: 'chip', items(seq) {
    const out = [];
    (seq.chips || []).forEach((c, i) => {
      const a = T(c.in), bT = T(c.out);
      out.push({ path: ['chips', i], kind: 'bar', a, b: bT + 0.5, aT: a, bT, tail: [bT, bT + 0.5], label: c.id, sub: (c.items || []).map((x) => x.label).join(' / '), cls: 'chip',
        move: [['chips', i, 'in'], ['chips', i, 'out'], ['chips', i, 'switchAt']], edgeA: [['chips', i, 'in']], edgeB: [['chips', i, 'out']] });
      if (c.switchAt != null) out.push(markItem(['chips', i], ['chips', i, 'switchAt'], T(c.switchAt), 'switch', 'chip'));
    });
    return out;
  } },
  { id: 'cards', label: 'Title · End', cls: 'card', items(seq) {
    const out = [];
    const ti = seq.title;
    if (ti) {
      const a = T(ti.in), bT = T(ti.out), od = ti.outDur != null ? ti.outDur : 0.85;
      out.push({ path: ['title'], kind: 'bar', a, b: bT + od, aT: a, bT, tail: [bT, bT + od], label: 'Title', sub: ti.word, cls: 'card',
        move: [['title', 'in'], ['title', 'out']], edgeA: [['title', 'in']], edgeB: [['title', 'out']] });
    }
    const en = seq.end;
    if (en) {
      const a = T(en.in);
      out.push({ path: ['end'], kind: 'bar', a, b: Math.max(a, duration()), aT: a, label: 'End card', sub: en.word, cls: 'card', move: [['end', 'in']], edgeA: [['end', 'in']] });
    }
    return out;
  } },
  { id: 'hud', label: 'HUD', cls: 'hud', sel: ['hud'], items(seq) {
    if (!seq.hud) return [];
    const out = [envItem(['hud'], seq.hud, 'HUD')];
    (seq.hud.chapters || []).forEach((v, j) => out.push(markItem(['hud'], ['hud', 'chapters', j], T(v), String(j + 1).padStart(2, '0'), 'hud')));
    return out;
  } },
  { id: 'glow', label: 'Theme glow', cls: 'night', add: 'glow', items: (seq) => (seq.glow || []).map((n, i) => envItem(['glow', i], n, 'glow')) },
  { id: 'browserfx', label: 'Load bar · Dim', cls: 'fx', sel: ['browser'], items(seq) {
    const b = seq.browser || {};
    const out = [];
    if (b.loadbar) {
      const L = b.loadbar; const a = T(L.in), bT = T(L.out);
      out.push({ path: ['browser'], kind: 'bar', a, b: bT + (L.fadeOut || 0), aT: a, bT, fadeB: L.fadeOut || 0, label: 'load bar', cls: 'fx',
        move: [['browser', 'loadbar', 'in'], ['browser', 'loadbar', 'out']], edgeA: [['browser', 'loadbar', 'in']], edgeB: [['browser', 'loadbar', 'out']] });
    }
    if (b.dim) out.push(envItem(['browser'], b.dim, 'dim'));
    out.forEach((it) => { if (it.label === 'dim') { it.move = [['browser', 'dim', 'in'], ['browser', 'dim', 'out']]; it.edgeA = [['browser', 'dim', 'in']]; it.edgeB = [['browser', 'dim', 'out']]; } });
    return out;
  } },
  { id: 'mosaic', label: 'Mosaic', cls: 'mosaic', sel: ['mosaic'], items(seq) {
    const m = seq.mosaic;
    if (!m) return [];
    const out = [];
    if (m.open) {
      const it = envItem(['mosaic'], m.open, 'opener');
      it.move = [['mosaic', 'open', 'in'], ['mosaic', 'open', 'out'], ['mosaic', 'open', 'push', 'in']];
      it.edgeA = [['mosaic', 'open', 'in']]; it.edgeB = [['mosaic', 'open', 'out']];
      out.push(it);
      if (m.open.push) { const p = durItem(['mosaic'], m.open.push, 'push'); p.move = [['mosaic', 'open', 'push', 'in']]; p.edgeA = [['mosaic', 'open', 'push', 'in']];
        p.edgeB = (s, dt) => { const x = s.mosaic.open.push; x.dur = Math.max(0, round(x.dur + dt)); }; p.thin = true; out.push(p); }
    }
    if (m.close) {
      const a = T(m.close.in);
      out.push({ path: ['mosaic'], kind: 'bar', a, b: Math.max(a, duration()), aT: a, fadeA: m.close.fadeIn || 0, label: 'closer', cls: 'mosaic',
        move: [['mosaic', 'close', 'in'], ['mosaic', 'close', 'settle', 'in']], edgeA: [['mosaic', 'close', 'in']] });
      if (m.close.settle) { const p = durItem(['mosaic'], m.close.settle, 'settle'); p.move = [['mosaic', 'close', 'settle', 'in']]; p.edgeA = p.move;
        p.edgeB = (s, dt) => { const x = s.mosaic.close.settle; x.dur = Math.max(0, round(x.dur + dt)); }; p.thin = true; out.push(p); }
    }
    return out;
  } },
  { id: 'ambient', label: 'Ambient', cls: 'amb', sel: ['ambient'], items(seq) {
    const a = seq.ambient || {};
    const out = [];
    const env = (p, o, label) => { const it = envItem(['ambient'], o, label); if (!it) return null; it.move = [[...p, 'in'], [...p, 'out']]; it.edgeA = [[...p, 'in']]; it.edgeB = [[...p, 'out']]; out.push(it); return it; };
    // one bar per layer the stage defines, plus a thin bar where it is dimmed
    Object.keys(a).forEach((k) => {
      env(['ambient', k], a[k], k);
      if (a[k] && a[k].dim) { const it = env(['ambient', k, 'dim'], a[k].dim, `${k} dimmed`); if (it) it.thin = true; }
    });
    return out;
  } },
  { id: 'fx', label: 'Fades · Flash', cls: 'fx', add: 'flash', items(seq) {
    const fx = seq.fx || {};
    const out = [];
    if (fx.fadeIn) { const it = durItem(['fx'], fx.fadeIn, 'from black'); it.move = [['fx', 'fadeIn', 'in']]; it.edgeA = it.move; it.edgeB = (s, dt) => { s.fx.fadeIn.dur = Math.max(0, round(s.fx.fadeIn.dur + dt)); }; out.push(it); }
    if (fx.fadeOut) { const it = durItem(['fx'], fx.fadeOut, 'to black'); it.move = [['fx', 'fadeOut', 'in']]; it.edgeA = it.move; it.edgeB = (s, dt) => { s.fx.fadeOut.dur = Math.max(0, round(s.fx.fadeOut.dur + dt)); }; out.push(it); }
    (fx.flashes || []).forEach((fl, i) => {
      const a = T(fl.at);
      out.push({ path: ['fx', 'flashes', i], kind: 'bar', a, b: a + (fl.dur || 0), aT: a, label: 'flash', cls: 'flash', ref: isRef(fl.at), move: [['fx', 'flashes', i, 'at']], edgeA: [['fx', 'flashes', i, 'at']],
        edgeB: (s, dt) => { const x = s.fx.flashes[i]; x.dur = Math.max(0.05, round(x.dur + dt)); } });
    });
    return out;
  } },
  // stage-specific items: any other top-level object with in/out (Loza's year counter) or at/dur (Starfall's burst)
  { id: 'extra', label: 'Stage items', cls: 'card', hideEmpty: true, items(seq) {
    return extraKeys(seq).filter((k) => seq[k].in != null || seq[k].at != null).map((k) => {
      const o = seq[k];
      const sk = o.in != null ? 'in' : 'at';
      const a = T(o[sk]);
      const byDur = o.out == null && typeof o.dur === 'number';
      const bT = o.out != null ? T(o.out) : byDur ? a + o.dur : duration();
      return { path: [k], kind: 'bar', a, b: bT, aT: a, bT, label: k, cls: 'card', ref: isRef(o[sk]) || isRef(o.out),
        move: [[k, sk], ...(o.out != null ? [[k, 'out']] : [])], edgeA: [[k, sk]],
        edgeB: o.out != null ? [[k, 'out']] : byDur ? (s, dt) => { s[k].dur = Math.max(0.05, round(s[k].dur + dt)); } : null };
    });
  } },
  { id: 'anchors', label: 'Anchors', cls: 'anchor', add: 'anchor', items(seq) {
    return Object.keys(seq.anchors || {}).map((name) => {
      const t = T('@' + name);
      return { path: ['anchors', name], kind: 'mark', a: t, b: t, label: '@' + name, cls: 'anchor',
        move: (s, dt) => { const an = s.anchors[name]; an.at = round((an.at || 0) + dt); } };
    });
  } },
];

function keyItems(seq, base) {
  const ks = get(seq, base) || [];
  return ks.map((k, i) => {
    const t = T(k.t);
    const prev = i > 0 ? T(ks[i - 1].t) : NaN;
    return { path: [...base, i], kind: 'key', a: t, b: t, label: '', cls: 'cam', ease: k.e || 'inOutCubic', prev, ref: isRef(k.t), move: [[...base, i, 't']], order: prev > t };
  });
}

// ---------------------------------------------------------------------------
export function initTimeline() {
  const sc = $('#tlScroll');
  sc.addEventListener('wheel', onWheel, { passive: false });
  sc.addEventListener('scroll', () => { lastScrollLeft = sc.scrollLeft; });
  new ResizeObserver(() => { if (fitMode) fitZoom(); }).observe(sc);
  $('#tlCanvas').addEventListener('pointerdown', onDown);
  $('#tlCanvas').addEventListener('dblclick', onDbl);
  on('change', () => render());
  on('select', () => render());
  on('time', (src) => { placePlayhead(); if (src === 'play') follow(); });
  on('loop', () => render());
  $('#tlZoom').addEventListener('input', (e) => { fitMode = false; setZoom(+e.target.value, sc.clientWidth / 2); });
}

export function fitZoom() {
  const sc = $('#tlScroll');
  pps = Math.max(2, (sc.clientWidth - LABEL_W - 24) / duration());
  fitMode = true;
  $('#tlZoom').value = String(Math.log2(pps));
  render();
}

function setZoom(log2, anchorX) {
  const sc = $('#tlScroll');
  const tAt = (sc.scrollLeft + anchorX - LABEL_W) / pps;
  pps = clamp(2 ** log2, 2, 600);
  render();
  sc.scrollLeft = Math.max(0, tAt * pps + LABEL_W - anchorX);
}

function onWheel(e) {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) return;           // plain wheel scrolls rows, shift+wheel scrolls time
  e.preventDefault();
  const sc = $('#tlScroll');
  const x = e.clientX - sc.getBoundingClientRect().left;
  fitMode = false;
  const z = Math.log2(pps) - Math.sign(e.deltaY) * 0.25;
  $('#tlZoom').value = String(z);
  setZoom(z, x);
}

function follow() {
  const sc = $('#tlScroll');
  const x = LABEL_W + S.t * pps;
  if (x < sc.scrollLeft + LABEL_W + 20 || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - LABEL_W - 60;
}

const X = (t) => LABEL_W + t * pps;

// ---------------------------------------------------------------------------
export function render() {
  if (!S.seq) return;
  const canvas = $('#tlCanvas');
  const dur = duration();
  const width = LABEL_W + dur * pps + PAD_R;
  canvas.style.width = `${width}px`;
  ITEMS = [];
  const frag = document.createDocumentFragment();
  frag.append(ruler(dur, width));
  ROWS.forEach((row) => {
    let items = [];
    try { items = row.items(S.seq).filter(Boolean); } catch (e) { items = []; }
    if (row.hideEmpty && !items.length) return;
    const lanes = assignLanes(items);
    const n = Math.max(1, lanes);
    const rowEl = h('div.tl-row', { dataset: { row: row.id }, style: { height: `${n * LANE_H + 6}px` } });
    const label = h('div.tl-label', h('span.tl-dot.' + row.cls), h('span.tl-name', row.label));
    if (row.add) label.append(h('button.tl-add', { title: `Add at playhead`, dataset: { add: row.add } }, '+'));
    if (row.sel) label.addEventListener('click', (e) => { if (!e.target.closest('.tl-add')) select(row.sel); });
    rowEl.append(label);
    const lane = h('div.tl-lane', { style: { width: `${dur * pps}px` } });
    // keyframe rows: interpolation spans between keys
    items.filter((it) => it.kind === 'key' && Number.isFinite(it.prev) && Number.isFinite(it.a)).forEach((it) => {
      const w = (it.a - it.prev) * pps;
      if (w > 2) lane.append(h('div.kspan', { style: { left: `${it.prev * pps}px`, width: `${w}px` } }, w > 70 ? h('span', it.ease) : null));
    });
    items.forEach((it) => lane.append(itemEl(it)));
    rowEl.append(lane);
    frag.append(rowEl);
  });
  // loop range, playhead, snap guide
  if (S.loop) frag.append(h('div#tlLoop' + (S.loopOn ? '.on' : ''), { style: { left: `${X(S.loop[0])}px`, width: `${(S.loop[1] - S.loop[0]) * pps}px` } }));
  frag.append(h('div#tlEnd', { style: { left: `${X(dur)}px` } }));
  frag.append(h('div#tlPlayhead', h('i')));
  frag.append(h('div#tlSnap'));
  canvas.replaceChildren(frag);
  $('#tlScroll').scrollLeft = lastScrollLeft;
  placePlayhead();
}

function assignLanes(items) {
  const ends = [];
  items.forEach((it) => {
    if (it.kind !== 'bar') { it.lane = 0; return; }
    const a = finite(it.a, 0), b = finite(it.b, a);
    let l = 0;
    while (ends[l] != null && ends[l] > a + 1e-6) l++;
    ends[l] = b;
    it.lane = l;
  });
  // markers and keys ride on the first lane, centered on the row when it has one lane
  return ends.length || 1;
}

function itemEl(it) {
  const i = ITEMS.push(it) - 1;
  const bad = !Number.isFinite(it.a);
  const sel = samePath(S.sel, it.path);
  const top = it.lane * LANE_H + 3;
  if (it.kind === 'key' || it.kind === 'mark') {
    const el = h(`div.${it.kind}.${it.cls}`, { dataset: { i }, style: { left: `${finite(it.a, 0) * pps}px`, top: `${it.kind === 'mark' ? top : 3}px` },
      title: `${it.label ? it.label + ' · ' : ''}${fmtTime(it.a)} · f${Math.round(finite(it.a, 0) * fps())}${it.ref ? ' · linked' : ''}` });
    if (sel) el.classList.add('sel');
    if (it.ref) el.classList.add('ref');
    if (bad || it.order) el.classList.add('err');
    if (it.kind === 'mark' && it.label) el.append(h('span', it.label));
    return el;
  }
  const a = finite(it.a, 0), b = Math.max(a, finite(it.b, a));
  const w = Math.max(3, (b - a) * pps);
  const el = h(`div.bar.${it.cls || 'plain'}`, { dataset: { i }, style: { left: `${a * pps}px`, width: `${w}px`, top: `${top}px` } });
  if (it.thin) el.classList.add('thin');
  if (sel) el.classList.add('sel');
  if (bad || it.err) el.classList.add('err');
  if (it.ref) el.classList.add('ref');
  if (it.thumb && w > 40) el.style.setProperty('--thumb', `url("${it.thumb}")`), el.classList.add('has-thumb');
  const span = (cls, x0, x1, extra) => { const ww = (x1 - x0) * pps; if (ww > 0.5) el.append(h(`i.${cls}`, { style: { left: `${(x0 - a) * pps}px`, width: `${ww}px`, ...(extra || {}) } })); };
  if (it.fadeA) span('ramp-in', a, a + it.fadeA);
  if (it.fadeB) span('ramp-out', b - it.fadeB, b);
  if (it.tail) span('tail', it.tail[0], it.tail[1]);
  if (it.lead) span('leadz', it.lead[0], it.lead[1]);
  if (it.hold) span('hold', it.hold[0], it.hold[1]);
  if (it.xf) span('xf', a, a + it.xf);
  (it.ticks || []).forEach((t) => el.append(h('i.tick', { style: { left: `${(t - a) * pps}px` } })));
  el.append(h('span.bl', it.label || ''));
  if (it.sub && w > 90) el.append(h('span.bs', it.sub));
  el.title = `${it.label}${it.sub ? ' — ' + it.sub : ''}\n${fmtTime(a)} → ${fmtTime(b)} (${(b - a).toFixed(2)} s)${it.err ? '\n⚠ ' + it.err : ''}${it.hold ? `\nholds last frame ${(it.hold[1] - it.hold[0]).toFixed(2)} s` : ''}`;
  if (it.edgeA) el.append(h('b.ea'));
  if (it.edgeB) el.append(h('b.eb'));
  return el;
}

function ruler(dur, width) {
  const r = h('div.tl-ruler-row', { style: { width: `${width}px` } });
  r.append(h('div.tl-corner', h('span#tlTime', fmtTime(S.t)), h('span#tlFrame', `f${Math.round(S.t * fps())}`)));
  const lane = h('div.tl-ruler', { style: { width: `${dur * pps}px` } });
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const minor = steps.find((s) => s * pps >= 9) || 60;
  const major = steps.find((s) => s * pps >= 70 && s >= minor) || 60;
  for (let t = 0; t <= dur + 1e-9; t = round(t + minor, 6)) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    lane.append(h(`i.${isMajor ? 'M' : 'm'}`, { style: { left: `${t * pps}px` } }, isMajor ? h('span', t >= 60 ? fmtTime(t).replace(/\.00$/, '') : `${round(t, 2)}s`) : null));
  }
  r.append(lane);
  return r;
}

function placePlayhead() {
  const ph = $('#tlPlayhead');
  if (ph) ph.style.left = `${X(S.t)}px`;
  const tt = $('#tlTime'); if (tt) tt.textContent = fmtTime(S.t);
  const tf = $('#tlFrame'); if (tf) tf.textContent = `f${Math.round(S.t * fps())}`;
}

// ---------------------------------------------------------------------------
// interaction
function timeAt(clientX) {
  const r = $('#tlCanvas').getBoundingClientRect();
  return (clientX - r.left - LABEL_W) / pps;
}

function onDbl(e) {
  const lane = e.target.closest('.tl-lane');
  if (!lane || e.target.closest('.bar,.key,.mark')) return;
  const row = e.target.closest('.tl-row').dataset.row;
  const def = ROWS.find((r) => r.id === row);
  if (def && def.add) emit('add', { what: def.add, t: clamp(timeAt(e.clientX), 0, duration()) });
}

function onDown(e) {
  if (e.button !== 0) return;
  const add = e.target.closest('.tl-add');
  if (add) { emit('add', { what: add.dataset.add, t: S.t }); return; }
  if (e.target.closest('.tl-label')) return;
  const itemEl = e.target.closest('[data-i]');
  if (!itemEl) {
    if (e.target.closest('.tl-ruler-row') || e.target.closest('.tl-lane')) scrub(e);
    return;
  }
  const it = ITEMS[+itemEl.dataset.i];
  const mode = e.target.closest('.ea') ? 'a' : e.target.closest('.eb') ? 'b' : 'move';
  const op = mode === 'a' ? it.edgeA : mode === 'b' ? it.edgeB : it.move;
  e.preventDefault();
  if (!samePath(S.sel, it.path)) select(it.path);
  if (it.kind === 'key' && Number.isFinite(it.a)) setTime(it.a);
  if (!op) return;
  drag(e, it, mode, op);
}

function scrub(e) {
  const go = (ev) => setTime(clamp(timeAt(ev.clientX), 0, duration()));
  go(e);
  if (!e.target.closest('.tl-ruler-row')) select(null);
  const mv = (ev) => go(ev);
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
}

function snapTargets(except) {
  const pts = [0, duration(), S.t];
  ITEMS.forEach((it) => {
    if (it === except || samePath(it.path, except.path) && it.kind === except.kind && it.label === except.label) return;
    [it.a, it.b, it.aT, it.bT].forEach((v) => Number.isFinite(v) && pts.push(v));
    (it.ticks || []).forEach((v) => pts.push(v));
  });
  return pts;
}

function applyOp(seq, op, dt) {
  if (typeof op === 'function') return op(seq, dt);
  op.forEach((p) => {
    const o = get(seq, p.slice(0, -1));
    const k = p[p.length - 1];
    if (o && o[k] != null) o[k] = shiftTime(o[k], dt);
  });
}

function drag(e, it, mode, op) {
  const orig = clone(S.seq);
  const x0 = e.clientX;
  const f = fps();
  const edges = mode === 'move' ? [it.a, it.b] : mode === 'a' ? [it.aT != null ? it.aT : it.a] : [it.bT != null ? it.bT : it.b];
  const targets = snapTargets(it);
  const ownPaths = new Set(Array.isArray(op) ? op.map(pathKey) : []);
  // ripple: only bars push what comes after them (a retimed key, anchor or switch marker never does)
  const rippleFrom = it.kind !== 'bar' ? null : mode === 'move' ? it.a : mode === 'b' ? (it.bT != null ? it.bT : it.b) : null;
  const tol = 7 / pps;
  const guide = $('#tlSnap');
  let moved = false;
  let lastDt = 0;
  document.body.classList.add('dragging');
  const mv = (ev) => {
    let dt = (ev.clientX - x0) / pps;
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    moved = true;
    // clamp edges so a bar keeps at least one frame
    if (mode === 'a' && Number.isFinite(it.bT != null ? it.bT : it.b) && it.kind === 'bar') dt = Math.min(dt, (it.bT != null ? it.bT : it.b) - edges[0] - 1 / f);
    if (mode === 'b' && it.kind === 'bar') dt = Math.max(dt, (it.aT != null ? it.aT : it.a) - edges[0] + 1 / f);
    let snapAt = null;
    if (S.snap && !ev.shiftKey) {
      let best = tol;
      edges.forEach((ed) => targets.forEach((tg) => { const d = tg - (ed + dt); if (Math.abs(d) < Math.abs(best)) { best = d; snapAt = tg; } }));
      if (snapAt != null) dt += best;
    }
    dt = Math.round(dt * f) / f;
    if (dt === lastDt && moved) { showGuide(snapAt); return; }
    lastDt = dt;
    const draft = clone(orig);
    applyOp(draft, op, dt);
    if (S.ripple && rippleFrom != null && Number.isFinite(rippleFrom)) {
      forEachTime(draft, (o, k, path) => {
        if (ownPaths.has(pathKey(path)) || typeof o[k] !== 'number') return;
        if (o[k] >= rippleFrom - 1e-6) o[k] = round(o[k] + dt);
      });
      draft.duration = round(Math.max(0.5, (orig.duration || 10) + dt));
    }
    S.seq = draft;
    changed('timeline');
    showGuide(snapAt);
    emit('drag-info', { dt, mode, it });
  };
  const showGuide = (t) => { if (!guide) return; guide.style.display = t == null ? 'none' : 'block'; if (t != null) guide.style.left = `${X(t)}px`; };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('dragging');
    const g = $('#tlSnap'); if (g) g.style.display = 'none';
    emit('drag-info', null);
    if (!moved) return;
    if (it.kind === 'key') sortKeys(it.path);
    commit();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
}

// keyframes must stay in time order for the stage's track(); keep the dragged key selected
function sortKeys(path) {
  const base = path.slice(0, -1);
  const ks = get(S.seq, base);
  if (!Array.isArray(ks)) return;
  const moved = ks[path[path.length - 1]];
  const sorted = [...ks].sort((p, q) => T(p.t) - T(q.t));
  if (sorted.every((x, i) => x === ks[i])) return;
  ks.splice(0, ks.length, ...sorted);
  changed('timeline');
  select([...base, ks.indexOf(moved)]);
}

export function setLoopFromSelection() {
  const it = ITEMS.find((x) => samePath(x.path, S.sel) && x.kind === 'bar');
  if (!it) return false;
  S.loop = [Math.max(0, it.a), Math.min(duration(), it.b)];
  emit('loop');
  return true;
}
export const zoomInfo = () => ({ pps, fit: fitMode });

// every item edge on the timeline, for [ / ] navigation
export function edgeTimes() {
  const s = new Set();
  ITEMS.forEach((it) => [it.a, it.b, it.bT].forEach((v) => Number.isFinite(v) && s.add(Math.round(v * fps()) / fps())));
  return [...s].sort((p, q) => p - q);
}
