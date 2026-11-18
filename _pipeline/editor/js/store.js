// Editor state: the sequence being edited, selection, playhead, undo history.
// Every edit mutates S.seq and calls changed(); commit() closes an undo step (drags and typing commit once at the end).
import { emit, clamp, get, clone } from './util.js';

export const S = {
  seq: null,          // the sequence (plain JSON)
  name: null,         // "<work>/<file>.json" (null for an imported, unsaved sequence)
  work: 'stage',      // the work (stage folder) the sequence belongs to: its stage.html renders it
  etag: null,         // hash of the file as loaded/saved, for the server's overwrite check
  savedJson: '',      // JSON of the last load/save, for the dirty flag
  sel: null,          // selected item path, e.g. ['captions', 2]
  t: 0,               // playhead (s)
  version: 0,         // bumps on every change (caches key on it)
  info: { shots: {}, assets: [], mosaic: [], bash: false },
  loop: null,         // [a, b] in/out range or null
  loopOn: false,
  playing: false,
  ripple: false,
  snap: true,
  view: 'live',       // live | rendered
  guides: false,
  stageWin: null,     // the stage iframe's window once ready
  stageError: null,
};

let base = '';
const past = [];
const future = [];

export function loadSeq(seq, { name = null, etag = null, savedJson } = {}) {
  S.seq = seq;
  S.name = name;
  S.etag = etag;
  S.savedJson = savedJson != null ? savedJson : JSON.stringify(seq);
  base = JSON.stringify(seq);
  past.length = 0; future.length = 0;
  S.sel = null;
  S.t = clamp(S.t, 0, duration());
  changed('load');
  emit('select');
  emit('history');
}

export function changed(src = 'edit') {
  S.version++;
  emit('change', src);
}

export function commit() {
  const now = JSON.stringify(S.seq);
  if (now === base) return false;
  past.push(base);
  if (past.length > 400) past.shift();
  base = now;
  future.length = 0;
  emit('history');
  return true;
}

// apply fn to the sequence; live edits (typing, dragging) pass commit: false and commit at the end
export function edit(fn, { commit: doCommit = true, src = 'edit' } = {}) {
  fn(S.seq);
  changed(src);
  if (doCommit) commit();
}

function restore(json, src) {
  S.seq = JSON.parse(json);
  if (S.sel && get(S.seq, S.sel) === undefined && S.sel.length) S.sel = null;
  changed(src);
  emit('select');
  emit('history');
}
export function undo() { commit(); if (!past.length) return; future.push(base); base = past.pop(); restore(base, 'undo'); }
export function redo() { if (!future.length) return; past.push(base); base = future.pop(); restore(base, 'redo'); }
export const canUndo = () => past.length > 0 || JSON.stringify(S.seq) !== base;
export const canRedo = () => future.length > 0;
export const isDirty = () => !!S.seq && JSON.stringify(S.seq) !== S.savedJson;
export function markSaved(name, etag) { S.name = name; S.etag = etag; S.savedJson = JSON.stringify(S.seq); emit('history'); }
export const snapshot = () => clone(S.seq);

export function select(path) {
  S.sel = path && path.length ? path : null;
  emit('select');
}

export const duration = () => (S.seq && S.seq.duration) || 10;
// the canvas the stage renders on ("canvas" in the sequence; 1920×1080 when absent)
export const canvas = () => ({ w: (S.seq && S.seq.canvas && +S.seq.canvas.w) || 1920, h: (S.seq && S.seq.canvas && +S.seq.canvas.h) || 1080 });
export const workOf = (name) => (name && name.includes('/') ? name.split('/')[0] : 'stage');
export const fps = () => (S.seq && S.seq.fps) || 60;

export function setTime(t, src) {
  S.t = clamp(Math.round(t * fps()) / fps(), 0, duration());
  emit('time', src);
}

// time resolution through the stage's own resolver (single source of truth for "@ref" semantics)
let rv = -1, rcache = null;
export function resolver() {
  if (rv === S.version && rcache) return rcache;
  rv = S.version;
  rcache = S.stageWin && S.stageWin.stage && S.seq ? S.stageWin.stage.resolver(S.seq) : null;
  return rcache;
}
export function T(v) {
  const r = resolver();
  if (!r || v == null) return NaN;
  try { return r.time(v); } catch { return NaN; }
}
export function Terr(v) {
  const r = resolver();
  if (!r) return 'stage not ready';
  try { r.time(v); return null; } catch (e) { return e.message; }
}
