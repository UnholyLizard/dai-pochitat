// Inspector: fields for the selected item, generated from the schema. Typing applies live (preview + timeline)
// and becomes one undo step on blur/enter; number labels scrub with the mouse (Shift ×10, Alt ×0.1).
import { $, h, clamp, clone, round, get, set, on, emit, fmtTime, toast } from './util.js';
import { S, T, Terr, edit, commit, changed, select, setTime, duration, fps } from './store.js';
import { TYPES, EASES, typeOf, fieldsOf, parseRef, fmtRef, renameRef, refsTo, forEachTime, uniqueId } from './schema.js';
import { captureCamera } from './preview.js';
import { confirmAsk } from './dialog.js';

let refreshers = [];

export function initInspector() {
  on('select', build);
  on('stage-ready', build);
  on('change', (src) => {
    if (src === 'inspector') return;
    if (src === 'load' || src === 'undo' || src === 'redo') return build();
    if (S.sel && get(S.seq, S.sel) === undefined) { select(null); return; }
    refresh();
  });
  on('time', (src) => { if (src !== 'play') refresh(); });
}

function refresh() {
  if (refreshers.some((fn) => fn() === 'rebuild')) build();
}

const typeLabel = (type) => (type === 'extra' ? `Stage item` : (TYPES[type] || { label: type }).label);

let lastSel = '';
function build() {
  refreshers = [];
  const root = $('#inspect');
  // a new selection starts at the top of the panel; a rebuild of the same item keeps the scroll position
  const key = JSON.stringify(S.sel);
  if (key !== lastSel) { root.parentElement.scrollTop = 0; lastSel = key; }
  if (!S.seq) { root.replaceChildren(h('p.empty', 'No sequence loaded.')); return; }
  const path = S.sel || [];
  const type = typeOf(path) || 'sequence';
  const obj = path.length ? get(S.seq, path) : S.seq;
  if (obj === undefined) { root.replaceChildren(); return; }
  const head = h('div.ihead',
    h('div.ititle', h('span.ikind', typeLabel(type)), h('span.iname', titleOf(type, path, obj))),
    actions(type, path, obj));
  const body = h('div.ibody');
  if (type === 'anchor') body.append(anchorName(path));
  body.append(fields(fieldsOf(type, obj), path, obj));
  const extra = extras(type, path, obj);
  if (extra) body.append(extra);
  root.replaceChildren(head, body);
}

function titleOf(type, path, obj) {
  if (type === 'sequence') return S.name || 'unsaved';
  if (type === 'extra') return path[0];
  if (type === 'anchor') return '@' + path[path.length - 1];
  if (type === 'key') return `#${path[path.length - 1] + 1} · ${path[0]}`;
  if (obj && obj.id) return obj.id;
  if (typeof path[path.length - 1] === 'number') return `#${path[path.length - 1] + 1}`;
  return '';
}

// ---------------------------------------------------------------------------
function actions(type, path, obj) {
  const box = h('div.iact');
  const btn = (label, title, fn, cls = '') => box.append(h(`button.ghost${cls}`, { title, on: { click: fn } }, label));
  const parentPath = path.slice(0, -1);
  const isList = typeof path[path.length - 1] === 'number' && Array.isArray(get(S.seq, parentPath));
  const start = itemStart(type, obj);
  if (Number.isFinite(start)) btn('⇥', 'Move the playhead here', () => setTime(start));
  if (isList) {
    btn('⧉', 'Duplicate (Ctrl+D)', () => duplicateSel());
  }
  if (isList || type === 'anchor') btn('🗑', 'Delete (Del)', () => deleteSel(), '.danger');
  return box;
}

function itemStart(type, obj) {
  if (!obj) return NaN;
  const v = type === 'segment' || type === 'phone' ? obj.t0 : type === 'key' ? obj.t : type === 'flash' ? obj.at : type === 'anchor' ? null : obj.in;
  if (type === 'anchor') return T('@' + S.sel[S.sel.length - 1]);
  return v == null ? NaN : T(v);
}

export function duplicateSel() {
  const path = S.sel;
  if (!path || typeof path[path.length - 1] !== 'number') return false;
  const parent = path.slice(0, -1);
  const list = get(S.seq, parent);
  if (!Array.isArray(list)) return false;
  const i = path[path.length - 1];
  const copy = clone(list[i]);
  if (copy.id) copy.id = uniqueId(list, String(copy.id).replace(/\d+$/, '') || 'item');
  // place the copy right after the original in time
  const type = typeOf(path);
  if (type === 'key') copy.t = round(T(copy.t) + 0.5, 3);
  edit((seq) => { get(seq, parent).splice(i + 1, 0, copy); });
  select([...parent, i + 1]);
  return true;
}

export async function deleteSel() {
  const path = S.sel;
  if (!path) return false;
  const type = typeOf(path);
  const parent = path.slice(0, -1);
  const last = path[path.length - 1];
  if (type === 'anchor') {
    const used = refsTo(S.seq, last);
    if (used.length && !(await confirmAsk(`Delete @${last}?`, `It is used by ${used.length} time field(s); they keep their current times as plain numbers.`, 'Delete', true))) return false;
    edit((seq) => { unlinkRefs(seq, last); delete seq.anchors[last]; });
    select(null);
    return true;
  }
  if (typeof last !== 'number' || !Array.isArray(get(S.seq, parent))) return false;
  const obj = get(S.seq, path);
  if ((type === 'segment') && obj.id) {
    const used = refsTo(S.seq, obj.id).length + Object.values(S.seq.anchors || {}).filter((a) => a.seg === obj.id).length;
    if (used && !(await confirmAsk(`Delete segment “${obj.id}”?`, `It is referenced ${used} time(s) (@${obj.id} or anchors). Linked times keep their current values as plain numbers.`, 'Delete', true))) return false;
  }
  if (type === 'key' && get(S.seq, parent).length <= 1) { toast('A camera needs at least one keyframe', 'warn'); return false; }
  edit((seq) => {
    if (type === 'segment' && obj.id) unlinkRefs(seq, obj.id);
    get(seq, parent).splice(last, 1);
  });
  const n = get(S.seq, parent).length;
  select(n ? [...parent, Math.min(last, n - 1)] : null);
  return true;
}

// replace every "@name…" by its current resolved time (before the name disappears)
function unlinkRefs(seq, name) {
  forEachTime(seq, (o, k) => { const r = parseRef(o[k]); if (r && r.name === name) o[k] = round(T(o[k]), 4); });
}

// ---------------------------------------------------------------------------
function fields(list, path, obj) {
  const wrap = h('div.fields');
  list.forEach((fd) => { const el = field(fd, path, obj); if (el) wrap.append(el); });
  return wrap;
}

const set_ = (fpath, v, doCommit = false) => edit((seq) => set(seq, fpath, v), { commit: doCommit, src: 'inspector' });

function field(fd, path, obj) {
  const fpath = [...path, fd.k];
  const cur = () => get(S.seq, fpath);
  const row = h(`div.f.t-${fd.type}`);
  const id = `f-${fpath.join('-')}`;
  const label = h('label', { title: fd.hint || '', for: id }, fd.label);
  const control = h('div.fc');
  row.append(label, control);
  // the label names the first input/select/textarea of the control
  queueMicrotask(() => { const c = control.querySelector('input, select, textarea'); if (c && !c.id) c.id = id; });

  switch (fd.type) {
    case 'time': return timeField(fd, fpath, row, label, control);
    case 'dur': case 'num': case 'px': case 'int': return numField(fd, fpath, row, label, control);
    case 'bool': {
      const chk = h('input', { type: 'checkbox' });
      chk.checked = !!cur();
      chk.addEventListener('change', () => {
        edit((seq) => { set(seq, fpath, chk.checked ? true : undefined); }, { src: 'inspector-commit' });
      });
      control.append(chk);
      refreshers.push(() => { chk.checked = !!cur(); });
      return row;
    }
    case 'audio': {
      let opts = (S.info && S.info.audioFiles) || [];
      const v = cur() || '';
      if (v && !opts.includes(v)) opts = [v, ...opts];
      const sel = h('select',
        h('option', { value: '' }, '— Pick audio file —'),
        opts.map((o) => h('option', { value: o }, o))
      );
      sel.value = v;
      sel.addEventListener('change', () => {
        edit((seq) => { set(seq, fpath, sel.value || undefined); }, { src: 'inspector-commit' });
      });
      control.append(sel);
      refreshers.push(() => { if (document.activeElement !== sel) sel.value = cur() || ''; });
      return row;
    }
    case 'text': case 'id': case 'rich': {
      const inp = h('input', { type: 'text', value: cur() == null ? '' : String(cur()), placeholder: fd.placeholder || '', spellcheck: fd.type === 'rich' });
      let before = cur();
      inp.addEventListener('focus', () => { before = cur(); });
      // ids rename references on commit, so they are not applied keystroke by keystroke
      if (fd.type !== 'id') inp.addEventListener('input', () => set_(fpath, inp.value === '' && fd.optional ? undefined : inp.value));
      inp.addEventListener('change', () => {
        if (fd.type === 'id' && before && inp.value && before !== inp.value) {
          if (!/^[\w-]+$/.test(inp.value)) { toast('Ids may use letters, digits, _ and -', 'warn'); set_(fpath, before); inp.value = before; return; }
          const used = refsTo(S.seq, before).length;
          if (used || Object.values(S.seq.anchors || {}).some((a) => a.seg === before)) edit((seq) => renameRef(seq, before, inp.value), { commit: false, src: 'inspector' });
        }
        if (fd.type === 'id') set_(fpath, inp.value === '' ? undefined : inp.value);
        commit();
        changed('inspector-commit');
      });
      control.append(inp);
      if (fd.type === 'rich') row.append(h('div.aux', 'Markup: *italic* · **bold** · `chip`'));
      refreshers.push(() => { if (document.activeElement !== inp) inp.value = cur() == null ? '' : String(cur()); });
      return row;
    }
    case 'lines': case 'times': {
      const toText = (v) => (Array.isArray(v) ? v.map((x) => String(x)).join('\n') : '');
      const ta = h('textarea', { rows: Math.max(2, (cur() || []).length + 1), spellcheck: fd.type === 'lines' });
      ta.value = toText(cur());
      const parse = () => {
        const lines = ta.value.split('\n');
        while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
        if (fd.type === 'lines') return lines;
        const vals = lines.map((s) => { const x = s.trim(); return x !== '' && isFinite(Number(x)) ? round(Number(x)) : x; });
        const bad = vals.filter((v) => typeof v === 'string' && !parseRef(v));
        ta.classList.toggle('bad', bad.length > 0);
        return bad.length ? null : vals;
      };
      ta.addEventListener('input', () => { const v = parse(); if (v) set_(fpath, v); });
      ta.addEventListener('change', () => { commit(); });
      control.append(ta);
      if (fd.type === 'lines') row.append(h('div.aux', 'One line per row · *italic* · **bold** · `chip`'));
      else row.append(h('div.aux', fd.hint || 'One time per row: seconds or @ref'));
      refreshers.push(() => { if (document.activeElement !== ta) ta.value = toText(cur()); });
      return row;
    }
    case 'enum': case 'ease': case 'shot': case 'seg': case 'still': case 'icon': {
      let opts = fd.type === 'enum' ? fd.options : fd.type === 'ease' ? EASES : fd.type === 'shot' ? Object.keys(S.info.shots)
        : fd.type === 'seg' ? [...(S.seq.segments || []).map((s) => s.id).filter(Boolean), ...(S.seq.phone ? [S.seq.phone.id || 'phone'] : [])]
        : fd.type === 'still' ? S.info.assets : ((S.stageWin && S.stageWin.stage.icons) || ['sun', 'moon']);
      const v = cur();
      const optional = fd.optional || ['shot', 'still', 'icon', 'ease'].includes(fd.type);
      if (v != null && v !== '' && !opts.includes(v)) opts = [...opts, v];
      const sel = h('select', optional ? h('option', { value: '' }, fd.type === 'ease' ? 'inOutCubic (default)' : '—') : null, opts.map((o) => h('option', { value: o }, o)));
      sel.value = v == null ? '' : v;
      sel.addEventListener('change', () => {
        const val = sel.value === '' ? undefined : sel.value;
        edit((seq) => {
          set(seq, fpath, val);
          // a segment shows either a shot or a still
          if (val && fd.k === 'shot') set(seq, [...path, 'still'], undefined);
          if (val && fd.k === 'still') set(seq, [...path, 'shot'], undefined);
        }, { src: 'inspector-commit' });
      });
      control.append(sel);
      if (fd.type === 'shot' && v && !S.info.shots[v]) row.classList.add('warn');
      refreshers.push(() => { if (document.activeElement !== sel) sel.value = cur() == null ? '' : cur(); });
      return row;
    }
    case 'group': {
      const g = cur();
      const fs = h('fieldset.grp', h('legend', fd.label));
      if (g == null) {
        fs.classList.add('off');
        fs.querySelector('legend').append(h('button.mini', { on: { click: () => edit((seq) => set(seq, fpath, defaults(fd.fields)), { src: 'inspector-commit' }) || build() } }, '+ add'));
        refreshers.push(() => (cur() != null ? 'rebuild' : null));
        return fs;
      }
      fs.querySelector('legend').append(h('button.mini', { title: 'Remove', on: { click: () => { edit((seq) => set(seq, fpath, undefined), { src: 'inspector-commit' }); build(); } } }, '×'));
      fs.append(fields(fd.fields, fpath, g));
      refreshers.push(() => (cur() == null ? 'rebuild' : null));
      return fs;
    }
    case 'list': {
      const items = cur() || [];
      const fs = h('fieldset.grp.list', h('legend', fd.label));
      items.forEach((it, i) => {
        const card = h('div.litem', h('div.lhead', h('span', `#${i + 1}`), h('button.mini', { title: 'Remove', on: { click: () => { edit((seq) => get(seq, fpath).splice(i, 1), { src: 'inspector-commit' }); build(); } } }, '×')));
        card.append(fields(fd.item, [...fpath, i], it));
        fs.append(card);
      });
      fs.append(h('button.mini.addrow', { on: { click: () => { edit((seq) => { if (!get(seq, fpath)) set(seq, fpath, []); get(seq, fpath).push(clone(fd.blank || {})); }, { src: 'inspector-commit' }); build(); } } }, `+ ${fd.label.replace(/s$/, '').toLowerCase()}`));
      const n = items.length;
      refreshers.push(() => ((cur() || []).length !== n ? 'rebuild' : null));
      return fs;
    }
    default: return null;
  }
}

function defaults(list) {
  const o = {};
  list.forEach((fd) => {
    if (fd.type === 'time') o[fd.k] = round(S.t + (fd.k === 'out' ? 2 : 0), 3);
    else if (fd.type === 'dur') o[fd.k] = 0.5;
    else if (fd.k === 'amount' || fd.k === 'opacity') o[fd.k] = 0.5;
  });
  return o;
}

// number with a scrubbable label
function numField(fd, fpath, row, label, control) {
  const cur = () => get(S.seq, fpath);
  const step = fd.step || (fd.type === 'dur' ? 0.05 : fd.type === 'num' ? 0.01 : 1);
  const dec = fd.type === 'int' || fd.type === 'px' ? 0 : 4;
  const fix = (v) => { let x = fd.type === 'int' ? Math.round(v) : round(v, dec || 4); if (fd.min != null) x = Math.max(fd.min, x); if (fd.max != null) x = Math.min(fd.max, x); if (fd.type === 'dur') x = Math.max(0, x); return x; };
  const inp = h('input', { type: 'number', step: String(step), value: cur() == null ? '' : cur(), placeholder: fd.placeholder || '' });
  inp.addEventListener('input', () => {
    if (inp.value === '') { if (fd.optional) set_(fpath, undefined); return; }
    const v = Number(inp.value);
    if (Number.isFinite(v)) set_(fpath, fix(v));
  });
  inp.addEventListener('change', () => commit());
  control.append(inp);
  if (fd.type === 'dur') control.append(h('span.unit', 's'));
  if (fd.type === 'px') control.append(h('span.unit', 'px'));
  label.classList.add('scrub');
  label.title = `${fd.hint ? fd.hint + '\n' : ''}Drag to change · Shift ×10 · Alt ×0.1`;
  label.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX; const v0 = Number(cur()) || 0; let moved = false;
    document.body.classList.add('scrubbing');
    const mv = (ev) => {
      const px = ev.clientX - x0;
      if (!moved && Math.abs(px) < 2) return;
      moved = true;
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      const v = fix(v0 + Math.round(px / 3) * step * mult);
      inp.value = v;
      set_(fpath, v);
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('scrubbing'); if (moved) commit(); else inp.focus(); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
  refreshers.push(() => { if (document.activeElement !== inp) inp.value = cur() == null ? '' : cur(); });
  return row;
}

// seconds or a reference; shows the resolved time, links to anchors, sets to the playhead
function timeField(fd, fpath, row, label, control) {
  const cur = () => get(S.seq, fpath);
  const inp = h('input.tin', { type: 'text', value: cur() == null ? '' : String(cur()), spellcheck: false, placeholder: fd.optional ? 'none' : '' });
  const aux = h('div.aux');
  const parse = (s) => {
    const x = s.trim();
    if (x === '') return fd.optional ? { v: undefined } : null;
    if (isFinite(Number(x))) return { v: round(Number(x)) };
    if (parseRef(x)) { const r = parseRef(x); return { v: fmtRef(r.name, r.off) }; }
    return null;
  };
  const show = () => {
    const v = cur();
    const err = v == null ? null : Terr(v);
    const t = T(v);
    row.classList.toggle('bad', !!err);
    row.classList.toggle('linked', !!parseRef(v));
    aux.textContent = err ? err : v == null ? '' : `${parseRef(v) ? '= ' : ''}${fmtTime(t)} · f${Math.round(t * fps())}${t > duration() + 1e-6 ? ' · after the end' : ''}`;
  };
  inp.addEventListener('input', () => { const p = parse(inp.value); inp.classList.toggle('bad', !p); if (p) { set_(fpath, p.v); show(); } });
  inp.addEventListener('change', () => commit());
  const names = () => [...Object.keys(S.seq.anchors || {}), ...(S.seq.segments || []).map((s) => s.id).filter(Boolean), ...(S.seq.phone ? [S.seq.phone.id || 'phone'] : [])];
  const link = h('select.link', { title: 'Link to an anchor or a segment start (keeps the current time as offset)', 'aria-label': `Link ${fd.label} to an anchor` });
  const fillLink = () => {
    const v = cur(); const r = parseRef(v);
    link.replaceChildren(h('option', { value: '' }, r ? '⛓' : '🔗'), ...(r ? [h('option', { value: '=unlink' }, 'Unlink (keep time)')] : []), ...names().map((n) => h('option', { value: n }, '@' + n)));
    link.value = '';
  };
  fillLink();
  link.addEventListener('focus', fillLink);
  link.addEventListener('change', () => {
    const v = cur(); const t = T(v);
    if (link.value === '=unlink') set_(fpath, round(t), true);
    else if (link.value) { const at = T('@' + link.value); set_(fpath, fmtRef(link.value, Number.isFinite(t) ? t - at : 0), true); }
    inp.value = cur() == null ? '' : String(cur());
    fillLink(); show();
  });
  const here = h('button.mini', { title: 'Set to the playhead (a link keeps its anchor)', on: { click: () => {
    const v = cur(); const r = parseRef(v);
    set_(fpath, r ? fmtRef(r.name, S.t - T('@' + r.name)) : round(S.t, 4), true);
    inp.value = String(cur()); show();
  } } }, '⌖');
  control.append(inp, here, link);
  row.append(aux);
  show();
  refreshers.push(() => { if (document.activeElement !== inp) inp.value = cur() == null ? '' : String(cur()); show(); });
  return row;
}

function anchorName(path) {
  const name = path[path.length - 1];
  const row = h('div.f', h('label', 'Name'));
  const inp = h('input', { type: 'text', value: name, spellcheck: false });
  inp.addEventListener('change', () => {
    const to = inp.value.trim();
    if (to === name) return;
    if (!/^[\w-]+$/.test(to) || (S.seq.anchors || {})[to]) { toast(!/^[\w-]+$/.test(to) ? 'Names may use letters, digits, _ and -' : `@${to} already exists`, 'warn'); inp.value = name; return; }
    edit((seq) => {
      const a = {};
      Object.entries(seq.anchors).forEach(([k, v]) => { a[k === name ? to : k] = v; });
      seq.anchors = a;
      renameRef(seq, name, to);
    });
    select([...path.slice(0, -1), to]);
  });
  row.append(h('div.fc', inp));
  return row;
}

// ---------------------------------------------------------------------------
function extras(type, path, obj) {
  const box = h('div.extras');
  if (type === 'sequence') {
    const frames = Math.round(duration() * fps());
    box.append(h('h4', 'Overview'), h('dl.stats',
      h('dt', 'Frames'), h('dd', `${frames} at ${fps()} fps`),
      h('dt', 'Segments'), h('dd', String((S.seq.segments || []).length)),
      h('dt', 'Captions'), h('dd', String((S.seq.captions || []).length)),
      h('dt', 'Keyframes'), h('dd', `${(get(S.seq, ['browser', 'camera']) || []).length} browser · ${(get(S.seq, ['phone', 'camera']) || []).length} phone`)));
    const anchors = Object.keys(S.seq.anchors || {});
    if (anchors.length) {
      box.append(h('h4', 'Anchors'), h('div.chips', anchors.map((n) => h('button.chipbtn', { on: { click: () => select(['anchors', n]) } }, `@${n}`, h('small', fmtTime(T('@' + n)))))));
    }
    // insert / remove time at the playhead: every absolute time after it moves (links follow their anchors)
    const dtIn = h('input', { type: 'number', step: '0.05', value: '1' });
    box.append(h('h4', 'Time'), h('div.tool',
      h('span', 'Shift everything after the playhead by'), dtIn, h('span.unit', 's'),
      h('button', { on: { click: () => shiftAfter(S.t, Number(dtIn.value)) } }, 'Apply')),
    h('p.hint', 'Positive inserts time, negative removes it. Footage segments, keys, captions and the duration move together; @references follow their anchors.'));
    return box;
  }
  if (type === 'segment' || type === 'phone') {
    const sh = obj.shot && S.info.shots[obj.shot];
    if (!sh) return obj.still ? box.append(h('img.thumbbig', { src: `/stage/${obj.still}`, alt: '' })) || box : null;
    const f = sh.fps || 60;
    const base = T(obj.t0) + (obj.lead || 0) - (obj.start || 0) / f;
    box.append(h('img.thumbbig', { src: `/footage/${obj.shot}/f${String(obj.start || 0).padStart(4, '0')}.jpg`, alt: '' }));
    box.append(h('dl.stats',
      h('dt', 'Footage'), h('dd', `${sh.frames} frames · ${(sh.frames / f).toFixed(2)} s @ ${f} fps`),
      h('dt', 'Viewport'), h('dd', sh.vp ? `${sh.vp.w}×${sh.vp.h} @${sh.vp.dpr}x` : '—'),
      h('dt', 'Ends at'), h('dd', fmtTime(base + (sh.frames - 1) / f))));
    if ((sh.clicks || []).length) {
      box.append(h('h4', 'Clicks in this shot'), h('div.chips', sh.clicks.map((c, i) => h('button.chipbtn', { title: 'Move the playhead to this click', on: { click: () => setTime(base + c) } },
        `#${i + 1}`, h('small', `${c.toFixed(2)} s → ${fmtTime(base + c)}`)))));
      const segId = obj.id || (type === 'phone' ? 'phone' : null);
      if (segId) box.append(h('p.hint', 'To sync captions or effects to a click, add an anchor on this segment and link times to it.'));
    }
    return box;
  }
  if (type === 'anchor') {
    const seg = [...(S.seq.segments || []), ...(S.seq.phone ? [S.seq.phone] : [])].find((s) => (s.id || (s === S.seq.phone ? 'phone' : '')) === obj.seg);
    const sh = seg && seg.shot && S.info.shots[seg.shot];
    const used = refsTo(S.seq, path[path.length - 1]).length;
    box.append(h('dl.stats', h('dt', 'Resolves to'), h('dd', fmtTime(T('@' + path[path.length - 1]))), h('dt', 'Used by'), h('dd', `${used} time field${used === 1 ? '' : 's'}`)));
    if (sh && (sh.clicks || []).length) {
      box.append(h('h4', `Clicks in ${seg.shot}`), h('div.chips', sh.clicks.map((c, i) => h('button.chipbtn', { on: { click: () => edit((seq) => { set(seq, [...path, 'at'], c); }, { src: 'inspector-commit' }) || build() } }, `#${i + 1}`, h('small', `${c.toFixed(2)} s`)))));
    }
    return box;
  }
  if (type === 'key') {
    const which = path[0] === 'phone' ? 'phone' : 'browser';
    box.append(h('div.tool',
      h('button', { title: 'Copy the camera as interpolated at the playhead into this keyframe (keeps its time)', on: { click: () => {
        const st = captureCamera(which, S.t); if (!st) return;
        edit((seq) => { const k = get(seq, path); Object.assign(k, { ...st, t: k.t, e: k.e }); }, { src: 'inspector-commit' });
      } } }, 'Copy view at playhead'),
      h('button', { title: 'Insert a keyframe at the playhead with the current interpolated camera (K)', on: { click: () => emit('add', { what: which === 'phone' ? 'pkey' : 'bkey', t: S.t }) } }, 'Add key at playhead')));
    box.append(h('p.hint', 'Drag the crosshair on the preview to move this keyframe’s center.'));
    return box;
  }
  if (type === 'caption') {
    box.append(h('p.hint', 'Drag the caption on the preview to move it; the right handle sets the width, the corner handle the title size.'));
    return box;
  }
  return null;
}

export function shiftAfter(t0, dt) {
  if (!Number.isFinite(dt) || !dt) return;
  edit((seq) => {
    forEachTime(seq, (o, k) => { if (typeof o[k] === 'number' && o[k] >= t0 - 1e-6) o[k] = round(Math.max(t0, o[k] + dt)); });
    seq.duration = round(Math.max(0.5, (seq.duration || 10) + dt));
  });
  toast(`${dt > 0 ? 'Inserted' : 'Removed'} ${Math.abs(dt)} s at ${fmtTime(t0)}`);
}
