// Checks that catch what would silently break a render: bad references, out-of-order segments or keys,
// footage that runs out (frozen last frame), missing shots/stills, items past the end.
import { $, h, on, emit, debounce, get, fmtTime } from './util.js';
import { S, T, Terr, select, setTime, duration } from './store.js';
import { forEachTime, typeOf } from './schema.js';

let list = [];

export function initIssues() {
  const run = debounce(() => { list = validate(); render(); }, 120);
  on('change', run);
  on('stage-ready', run);
  on('stage-error', run);
}

// the selectable item that owns a field path
function owner(path) {
  for (let n = path.length; n >= 0; n--) { const p = path.slice(0, n); if (typeOf(p)) return p; }
  return null;
}
const name = (path) => {
  const p = owner(path) || [];
  const it = get(S.seq, p);
  const id = it && it.id ? it.id : typeof p[p.length - 1] === 'number' ? `#${p[p.length - 1] + 1}` : p[p.length - 1];
  return `${p[0] || 'sequence'}${p.length > 1 ? ' ' + id : ''}${path.length > p.length ? '.' + path.slice(p.length).join('.') : ''}`;
};

export function validate() {
  const out = [];
  const seq = S.seq;
  if (!seq) return out;
  const add = (level, msg, path) => out.push({ level, msg, path });
  const dur = duration();
  if (S.stageError) add('error', `Stage rejected the sequence: ${S.stageError}`, null);
  if (!S.stageWin) return out;

  forEachTime(seq, (o, k, path) => {
    const err = Terr(o[k]);
    if (err) return add('error', `${name(path)}: ${err}`, owner(path));
    const t = T(o[k]);
    if (t < -1e-6) add('warn', `${name(path)} is before 0 (${t.toFixed(2)} s)`, owner(path));
    if (t > dur + 1e-6) add('warn', `${name(path)} is after the end (${fmtTime(t)} > ${fmtTime(dur)})`, owner(path));
  });

  // footage
  const ids = new Map();
  const segs = seq.segments || [];
  segs.forEach((s, i) => {
    const p = ['segments', i];
    if (s.id) { if (ids.has(s.id)) add('error', `Duplicate segment id "${s.id}"`, p); ids.set(s.id, p); }
    if (!s.shot && !s.still) add('error', `Segment ${s.id || i + 1} has neither a shot nor a still`, p);
    if (s.shot && !S.info.shots[s.shot]) add('error', `Segment ${s.id || i + 1}: no footage in footage/${s.shot}`, p);
    if (s.still && !S.info.assets.includes(s.still)) add('warn', `Segment ${s.id || i + 1}: stage/${s.still} not found`, p);
    const a = T(s.t0);
    if (i > 0 && a <= T(segs[i - 1].t0)) add('error', `Segment ${s.id || i + 1} starts before the previous one — the stage plays segments in list order`, p);
    const sh = s.shot && S.info.shots[s.shot];
    if (sh) {
      const f = sh.fps || 60;
      const end = a + (s.lead || 0) + (sh.frames - 1 - (s.start || 0)) / f;
      const next = i + 1 < segs.length ? T(segs[i + 1].t0) : NaN;
      if (Number.isFinite(next) && end < next - 0.05) add('warn', `${s.id || s.shot}: footage ends ${(next - end).toFixed(2)} s before the next segment (last frame holds)`, p);
      if ((s.start || 0) >= sh.frames) add('error', `${s.id || s.shot}: first frame ${s.start} is past the shot's ${sh.frames} frames`, p);
    }
  });
  if (seq.phone) {
    if (seq.phone.id && ids.has(seq.phone.id)) add('error', `Phone id "${seq.phone.id}" is also a segment id`, ['phone']);
    if (seq.phone.shot && !S.info.shots[seq.phone.shot]) add('error', `Phone: no footage in footage/${seq.phone.shot}`, ['phone']);
  }

  // cameras
  [['browser', 'camera'], ['phone', 'camera']].forEach((base) => {
    const ks = get(seq, base) || [];
    if (base[0] === 'browser' && !ks.length) add('error', 'The browser camera needs at least one keyframe', ['browser']);
    ks.forEach((k, i) => {
      if (i && T(k.t) < T(ks[i - 1].t)) add('error', `${base[0]} keyframe #${i + 1} is earlier than #${i} — keys must be in time order`, [...base, i]);
      ['cx', 'cy', 's', 'px', 'py'].forEach((n) => { if (typeof k[n] !== 'number') add('error', `${base[0]} keyframe #${i + 1}: ${n} is missing`, [...base, i]); });
    });
  });

  // captions and chips
  (seq.captions || []).forEach((c, i) => {
    const p = ['captions', i];
    if (T(c.out) <= T(c.in)) add('error', `Caption ${c.id || i + 1} ends before it starts`, p);
    else if (T(c.out) - T(c.in) < 1.2) add('warn', `Caption ${c.id || i + 1} is up for only ${(T(c.out) - T(c.in)).toFixed(2)} s (its lines take ~1.3 s to land)`, p);
    if (!(c.title || []).some((l) => String(l).trim())) add('warn', `Caption ${c.id || i + 1} has no title text`, p);
  });
  (seq.chips || []).forEach((c, i) => {
    const p = ['chips', i];
    const n = (c.items || []).length;
    if (n < 1) add('error', `Chip ${c.id || i + 1} has no items`, p);
    if (c.from >= n || c.to >= n) add('error', `Chip ${c.id || i + 1}: from/to point past its ${n} items`, p);
    const sw = T(c.switchAt);
    if (Number.isFinite(sw) && (sw < T(c.in) || sw > T(c.out))) add('warn', `Chip ${c.id || i + 1} switches outside its visible range`, p);
  });

  // anchors
  Object.entries(seq.anchors || {}).forEach(([n, a]) => {
    const p = ['anchors', n];
    if (ids.has(n) || (seq.phone && (seq.phone.id || 'phone') === n)) add('warn', `@${n} is both an anchor and a segment id — the anchor wins`, p);
    const seg = a.seg === (seq.phone && (seq.phone.id || 'phone')) ? seq.phone : segs.find((s) => s.id === a.seg);
    const sh = seg && seg.shot && S.info.shots[seg.shot];
    if (sh && a.at > sh.frames / (sh.fps || 60)) add('warn', `@${n}: ${a.at} s is past the end of ${seg.shot}`, p);
  });

  // HUD chapters
  const ch = ((seq.hud || {}).chapters || []).map((v) => T(v));
  if (ch.some((t, i) => i && t < ch[i - 1])) add('warn', 'HUD chapter starts are not in time order', ['hud']);
  if (seq.end && T(seq.end.in) > dur) add('warn', 'The end card starts after the sequence ends', ['end']);
  return out;
}

function render() {
  const errors = list.filter((x) => x.level === 'error').length;
  const warns = list.length - errors;
  const badge = $('#issuesBadge');
  badge.textContent = list.length ? String(list.length) : '';
  badge.dataset.level = errors ? 'error' : warns ? 'warn' : '';
  const st = $('#statusIssues');
  st.textContent = errors ? `${errors} error${errors > 1 ? 's' : ''}` : warns ? `${warns} warning${warns > 1 ? 's' : ''}` : 'No issues';
  st.dataset.level = errors ? 'error' : warns ? 'warn' : 'ok';
  const box = $('#issues');
  if (!list.length) { box.replaceChildren(h('p.empty', '✓ Nothing to fix — references resolve, footage and keys are in order.')); return; }
  box.replaceChildren(...list.map((x) => h(`button.issue.${x.level}`, { on: { click: () => { if (x.path) { select(x.path); const it = get(S.seq, x.path); const t = it && T(it.t0 != null ? it.t0 : it.t != null ? it.t : it.in); if (Number.isFinite(t)) setTime(t); } } } },
    h('i'), h('span', x.msg))));
}

export const issueCount = () => list.length;
export { emit };
