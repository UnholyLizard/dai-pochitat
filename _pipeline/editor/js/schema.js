// The sequence format ("stage-sequence/1") as the editor sees it: item types, their fields and where they live.
// The stage (stage/stage.html, compile()) is the reference for what each field does; keep both in step.
import { get, round } from './util.js';

export const EASES = ['inOutCubic', 'inOutQuart', 'inOutQuint', 'inOutSine', 'outExpo', 'outCubic', 'outQuart', 'outBack', 'inCubic', 'inExpo', 'lin'];

// field: k (key), type, label, hint, and options per type
//   time  seconds or a reference ("@anchor", "@anchor+0.4", "@segmentId")    dur  seconds >= 0
//   num / px / int   numbers                text / id   strings               rich  one line with *em* / **bold**
//   lines  array of rich lines             enum / ease / shot / seg / still / icon   pick lists
//   group  nested object (fields)          list  array of objects (item)     times  array of times
const f = (k, type, label, o = {}) => ({ k, type, label: label || k, ...o });
const ENV = [f('in', 'time', 'In'), f('fadeIn', 'dur', 'Fade in'), f('out', 'time', 'Out'), f('fadeOut', 'dur', 'Fade out')];
const AMBIENT = [...ENV, f('amount', 'num', 'Opacity', { step: 0.01, min: 0, max: 1, optional: true }),
  f('dim', 'group', 'Dimmed', { fields: [...ENV, f('amount', 'num', 'Amount', { step: 0.01, min: 0, max: 1 })] })];

export const TYPES = {
  sequence: { label: 'Sequence', fields: [
    f('name', 'text', 'Title'),
    f('duration', 'dur', 'Duration', { min: 0.5, hint: 'Frames rendered: duration × fps' }),
    f('fps', 'int', 'Output fps', { min: 1, max: 120 }),
    f('crossfade', 'dur', 'Crossfade', { hint: 'Default dissolve between footage segments' }),
  ] },
  audio: { label: 'Audio track', fields: [
    f('src', 'audio', 'File', { hint: 'Relative to _pipeline, e.g. film/audio/mix.wav' }),
    f('t0', 'time', 'Starts at', { optional: true, hint: 'Playhead time when audio starts' }),
    f('offset', 'dur', 'Audio offset', { optional: true, hint: 'Start point within the audio file' }),
    f('dur', 'dur', 'Duration', { optional: true, placeholder: 'full file' }),
    f('volume', 'num', 'Volume', { step: 0.05, min: 0, max: 1, optional: true, placeholder: '1.0' }),
    f('mute', 'bool', 'Mute', { optional: true }),
  ] },
  segment: { label: 'Footage segment', fields: [
    f('id', 'id', 'Id', { hint: 'Referenced as @id (its start time)' }),
    f('shot', 'shot', 'Shot', { hint: 'Folder in footage/' }),
    f('still', 'still', 'Still image', { hint: 'Instead of a shot: an image in stage/assets' }),
    f('t0', 'time', 'Starts at'),
    f('lead', 'dur', 'Hold first frame'),
    f('start', 'int', 'First frame', { min: 0 }),
    f('xf', 'dur', 'Crossfade in', { optional: true, placeholder: 'default' }),
  ] },
  phone: { label: 'Phone footage', fields: [
    f('id', 'id', 'Id'), f('shot', 'shot', 'Shot'), f('t0', 'time', 'Starts at'), f('lead', 'dur', 'Hold first frame'), f('start', 'int', 'First frame', { min: 0 }),
  ] },
  key: { label: 'Camera keyframe', fields: [
    f('t', 'time', 'Time'),
    f('e', 'ease', 'Ease into key'),
    f('cx', 'px', 'Center X', { hint: 'Where the pivot lands on the stage canvas (1920×1080, or 1080×1920 for 9:16)' }), f('cy', 'px', 'Center Y'),
    f('s', 'num', 'Scale', { step: 0.005 }),
    f('rx', 'num', 'Tilt X°', { step: 0.5 }), f('ry', 'num', 'Tilt Y°', { step: 0.5 }), f('rz', 'num', 'Roll°', { step: 0.5 }),
    f('px', 'px', 'Pivot X', { hint: 'Point of the device (in its own pixels) placed at the center' }), f('py', 'px', 'Pivot Y'),
    f('o', 'num', 'Opacity', { step: 0.05, min: 0, max: 1 }),
  ] },
  caption: { label: 'Caption', fields: [
    f('id', 'id', 'Id'),
    f('layout', 'enum', 'Layout', { options: ['side', 'top'] }),
    f('in', 'time', 'In'), f('out', 'time', 'Out'),
    f('outDur', 'dur', 'Exit', { optional: true, placeholder: '0.55' }),
    f('x', 'px', 'X'), f('y', 'px', 'Y'), f('w', 'px', 'Width'),
    f('size', 'px', 'Title size', { optional: true, placeholder: 'auto' }),
    f('bodySize', 'px', 'Body size', { optional: true, placeholder: '20' }),
    f('num', 'text', 'Number'), f('kicker', 'text', 'Eyebrow'),
    f('title', 'lines', 'Title lines'), f('body', 'lines', 'Body lines'),
  ] },
  chip: { label: 'Segmented chip', fields: [
    f('id', 'id', 'Id'),
    f('in', 'time', 'In'), f('out', 'time', 'Out'), f('switchAt', 'time', 'Switch at'),
    f('from', 'int', 'From item', { min: 0 }), f('to', 'int', 'To item', { min: 0 }),
    f('align', 'enum', 'Anchor', { options: ['left', 'right'] }),
    f('x', 'px', 'X from edge'), f('y', 'px', 'Y'),
    f('items', 'list', 'Items', { item: [f('label', 'text', 'Label'), f('icon', 'icon', 'Icon'), f('w', 'px', 'Width')], blank: { label: 'Item', w: 120 } }),
  ] },
  title: { label: 'Title card', fields: [
    f('in', 'time', 'In'), f('out', 'time', 'Out'), f('outDur', 'dur', 'Exit'),
    f('num', 'text', 'Eyebrow'), f('kicker', 'text', 'Eyebrow 2'),
    f('word', 'text', 'Wordmark'), f('wordSize', 'px', 'Wordmark size'),
    f('sub', 'rich', 'Subtitle'), f('meta', 'lines', 'Meta row'),
  ] },
  end: { label: 'End card', fields: [
    f('in', 'time', 'In'), f('word', 'text', 'Wordmark'), f('wordSize', 'px', 'Wordmark size'),
    f('tag', 'rich', 'Tagline'), f('url', 'text', 'URL'), f('by', 'rich', 'Credit'),
  ] },
  hud: { label: 'HUD', fields: [
    ...ENV, f('word', 'text', 'Wordmark'), f('tagline', 'text', 'Tagline'),
    f('chapters', 'times', 'Chapter starts', { hint: 'One per line; the count sets “NN / total”' }),
    f('progressIn', 'time', 'Progress from'), f('progressOut', 'time', 'Progress to'),
  ] },
  glow: { label: 'Theme glow', fields: ENV },
  browser: { label: 'Browser', fields: [
    f('url', 'text', 'Address bar'),
    f('loadbar', 'group', 'Load bar', { fields: [f('in', 'time', 'Start'), f('out', 'time', 'Full'), f('fadeOut', 'dur', 'Fade out')] }),
    f('dim', 'group', 'Dim behind phone', { fields: [...ENV, f('amount', 'num', 'Amount', { step: 0.01, min: 0, max: 1 })] }),
    f('halo', 'group', 'Halo', { fields: [f('base', 'num', 'Base', { step: 0.01 }), f('night', 'num', 'Added by glow', { step: 0.01 })] }),
  ] },
  mosaic: { label: 'Mosaic', fields: [
    f('cols', 'int', 'Columns', { min: 1, max: 12 }), f('rows', 'int', 'Rows', { min: 1, max: 12 }),
    f('drift', 'num', 'Drift px/s'), f('tiltX', 'num', 'Tilt X°'), f('tiltZ', 'num', 'Tilt Z°'),
    f('open', 'group', 'Opener', { fields: [...ENV, f('opacity', 'num', 'Opacity', { step: 0.01 }), f('zoomRate', 'num', 'Zoom / s', { step: 0.001 }),
      f('push', 'group', 'Push in', { fields: [f('in', 'time', 'Start'), f('dur', 'dur', 'Duration'), f('amount', 'num', 'Amount', { step: 0.01 })] })] }),
    f('close', 'group', 'Closer', { fields: [f('in', 'time', 'In'), f('fadeIn', 'dur', 'Fade in'), f('opacity', 'num', 'Opacity', { step: 0.01 }), f('scale', 'num', 'Scale', { step: 0.01 }),
      f('settle', 'group', 'Settle', { fields: [f('in', 'time', 'Start'), f('dur', 'dur', 'Duration'), f('amount', 'num', 'Amount', { step: 0.01 })] })] }),
  ] },
  // background layers named by the stage (water, fireflies, roots, dust…): each an envelope with an optional dim
  ambient: { label: 'Ambient', fields: (obj) => Object.keys(obj || {}).map((k) => f(k, 'group', k, { fields: AMBIENT })) },
  fx: { label: 'Fades', fields: [
    f('fadeIn', 'group', 'From black', { fields: [f('in', 'time', 'Start'), f('dur', 'dur', 'Duration')] }),
    f('fadeOut', 'group', 'To black', { fields: [f('in', 'time', 'Start'), f('dur', 'dur', 'Duration')] }),
    f('grain', 'num', 'Grain', { step: 0.005, min: 0, max: 1 }),
  ] },
  flash: { label: 'Flash', fields: [
    f('at', 'time', 'At'), f('dur', 'dur', 'Duration'), f('x', 'num', 'X %'), f('y', 'num', 'Y %'), f('amount', 'num', 'Amount', { step: 0.01 }),
  ] },
  anchor: { label: 'Anchor', fields: [
    f('seg', 'seg', 'Segment', { hint: 'Footage the anchor is measured in' }),
    f('at', 'dur', 'Footage time', { hint: 'Seconds into the shot (e.g. a click from its meta)' }),
  ] },
};

// where each type lives in the sequence (list: an array of items, map: an object keyed by name)
export const SECTIONS = [
  { path: [], type: 'sequence' },
  { path: ['audio'], type: 'audio' },
  { path: ['segments'], type: 'segment', list: true },
  { path: ['phone'], type: 'phone' },
  { path: ['browser'], type: 'browser' },
  { path: ['browser', 'camera'], type: 'key', list: true },
  { path: ['phone', 'camera'], type: 'key', list: true },
  { path: ['glow'], type: 'glow', list: true },
  { path: ['captions'], type: 'caption', list: true },
  { path: ['chips'], type: 'chip', list: true },
  { path: ['title'], type: 'title' },
  { path: ['end'], type: 'end' },
  { path: ['hud'], type: 'hud' },
  { path: ['mosaic'], type: 'mosaic' },
  { path: ['ambient'], type: 'ambient' },
  { path: ['fx'], type: 'fx' },
  { path: ['fx', 'flashes'], type: 'flash', list: true },
  { path: ['anchors'], type: 'anchor', map: true },
];

// keys the format defines; any other top-level object is a stage-specific item (e.g. Loza's "year" counter),
// edited with fields inferred from its JSON (in/out/t/at… and @refs become times)
const KNOWN = new Set(['format', 'name', 'fps', 'duration', 'crossfade', 'render', ...SECTIONS.map((s) => s.path[0]).filter(Boolean)]);
export const extraKeys = (seq) => Object.keys(seq || {}).filter((k) => !KNOWN.has(k) && seq[k] && typeof seq[k] === 'object' && !Array.isArray(seq[k]));
const TIME_KEY = /^(t|t0|in|out|at)$|At$/;
export function inferFields(obj) {
  return Object.keys(obj || {}).map((k) => {
    const v = obj[k];
    if (typeof v === 'number') return f(k, TIME_KEY.test(k) ? 'time' : /^(dur|fade|lead)/i.test(k) ? 'dur' : 'num', k);
    if (typeof v === 'string') return f(k, parseRef(v) ? 'time' : 'text', k);
    if (Array.isArray(v)) return v.every((x) => typeof x === 'string') ? f(k, 'lines', k) : null;
    if (v && typeof v === 'object') return f(k, 'group', k, { fields: inferFields(v) });
    return null;
  }).filter(Boolean);
}
TYPES.extra = { label: 'Stage item', fields: inferFields };
// the fields of an item (some types derive them from the item itself)
export const fieldsOf = (type, obj) => { const fs = (TYPES[type] || TYPES.extra).fields; return typeof fs === 'function' ? fs(obj) : fs; };

export function typeOf(path) {
  if (!path) return null;
  if (path.length === 1 && !KNOWN.has(path[0])) return 'extra';
  for (const s of SECTIONS) {
    const n = s.path.length;
    const prefix = s.path.every((k, i) => path[i] === k);
    if (!prefix) continue;
    if ((s.list || s.map) && path.length === n + 1) return s.type;
    if (!s.list && !s.map && path.length === n) return s.type;
  }
  return null;
}

// ---------------------------------------------------------------------------
// time references
export function parseRef(v) {
  if (typeof v !== 'string') return null;
  const m = /^@([\w-]+)\s*(?:([+-])\s*(\d*\.?\d+))?$/.exec(v.trim());
  return m ? { name: m[1], off: m[2] ? (m[2] === '-' ? -1 : 1) * parseFloat(m[3]) : 0 } : null;
}
export function fmtRef(name, off) {
  const o = round(off, 4);
  return o ? `@${name}${o > 0 ? '+' : '-'}${Math.abs(o)}` : `@${name}`;
}
// shift a time value by dt seconds; a reference keeps its link and moves its offset
export function shiftTime(v, dt) {
  if (typeof v === 'number') return round(v + dt);
  const r = parseRef(v);
  return r ? fmtRef(r.name, r.off + dt) : v;
}

// visit every time field: cb(obj, key, path, field)
export function forEachTime(seq, cb) {
  const visit = (obj, fields, path) => {
    if (!obj || typeof obj !== 'object') return;
    (typeof fields === 'function' ? fields(obj) : fields).forEach((fd) => {
      if (fd.type === 'time' && obj[fd.k] != null) cb(obj, fd.k, [...path, fd.k], fd);
      else if (fd.type === 'group') visit(obj[fd.k], fd.fields, [...path, fd.k]);
      else if (fd.type === 'times' && Array.isArray(obj[fd.k])) obj[fd.k].forEach((_, i) => cb(obj[fd.k], i, [...path, fd.k, i], fd));
    });
  };
  SECTIONS.forEach((s) => {
    if (s.type === 'anchor' || s.type === 'sequence') return;          // anchors are footage times, not stage times
    const v = get(seq, s.path);
    if (s.list) (Array.isArray(v) ? v : []).forEach((it, i) => visit(it, TYPES[s.type].fields, [...s.path, i]));
    else visit(v, TYPES[s.type].fields, s.path);
  });
  extraKeys(seq).forEach((k) => visit(seq[k], inferFields(seq[k]), [k]));
}

// every reference name used anywhere (for rename / delete checks)
export function refsTo(seq, name) {
  const hits = [];
  forEachTime(seq, (o, k, path) => { const r = parseRef(o[k]); if (r && r.name === name) hits.push(path); });
  return hits;
}

export function renameRef(seq, from, to) {
  forEachTime(seq, (o, k) => { const r = parseRef(o[k]); if (r && r.name === from) o[k] = fmtRef(to, r.off); });
  Object.values(seq.anchors || {}).forEach((a) => { if (a.seg === from) a.seg = to; });
}

// a fresh item for "add" actions
export function blank(type, t, seq) {
  const r = (x) => round(x, 3);
  if (type === 'audio') return { src: 'film/audio/mix.wav', t0: r(t), volume: 1 };
  if (type === 'caption') return { id: uniqueId(seq.captions, 'c'), layout: 'side', in: r(t), out: r(t + 3), x: 128, y: 340, w: 520, num: String((seq.captions || []).length + 1).padStart(2, '0'), kicker: 'New caption', title: ['A new line,', '*in italics*'], body: ['Body copy.'] };
  if (type === 'glow') return { in: r(t), fadeIn: 0.8, out: r(t + 4), fadeOut: 0.8 };
  if (type === 'flash') return { at: r(t), dur: 0.9, x: 50, y: 20, amount: 0.08 };
  if (type === 'chip') return { id: uniqueId(seq.chips, 'chip'), in: r(t), out: r(t + 2), switchAt: r(t + 1), from: 0, to: 1, align: 'left', x: 128, y: 250, items: [{ label: 'One', w: 130 }, { label: 'Two', w: 130 }] };
  return null;
}
export function uniqueId(list, prefix) {
  const used = new Set((list || []).map((x) => x && x.id));
  let i = (list || []).length + 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}
