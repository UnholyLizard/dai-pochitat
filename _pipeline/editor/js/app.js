// Stage editor: wires the modules together — files, transport, tabs, adding items, shortcuts, drafts.
import { $, $$, h, api, on, emit, toast, clamp, round, get, isTyping, fmtTime, debounce } from './util.js';
import { S, loadSeq, edit, commit, changed, undo, redo, canUndo, canRedo, isDirty, markSaved, select, setTime, duration, fps, T, workOf } from './store.js';
import { blank, typeOf } from './schema.js';
import { initPreview, togglePlay, setView, captureCamera, nudgeSelection, updateOverlay, setWork } from './preview.js';
import { initTimeline, fitZoom, setLoopFromSelection, edgeTimes } from './timeline.js';
import { initInspector, duplicateSel, deleteSel } from './inspector.js';
import { initIssues } from './issues.js';
import { initRender } from './render.js';
import { ask, confirmAsk } from './dialog.js';
import { initAudio, toggleMute, isMuted } from './audio.js';

const DRAFT = (name) => `stage-editor:draft:${name || '_unsaved'}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: drafts are a convenience */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ---------------------------------------------------------------------------
async function boot() {
  initPreview();
  initAudio();
  initTimeline();
  initInspector();
  initIssues();
  wireHeader();
  wireTransport();
  wireTabs();
  wireSplitter();
  wireShortcuts();
  on('add', ({ what, t }) => addItem(what, t));
  on('seek', (t) => setTime(t));
  on('history', syncHeader);
  on('change', () => { syncHeader(); saveDraft(); });
  on('play', (p) => { $('#btnPlay').classList.toggle('on', p); $('#btnPlay').setAttribute('aria-label', p ? 'Pause' : 'Play'); updateOverlay(); });
  on('time', () => { $('#tcTime').value = fmtTime(S.t); $('#tcFrame').textContent = `f${Math.round(S.t * fps())} / ${Math.round(duration() * fps())}`; });
  on('stage-error', () => {
    const b = $('#stageErr');
    b.hidden = !S.stageError;
    b.textContent = S.stageError ? `Preview shows the last valid state — ${S.stageError}` : '';
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  try {
    S.info = await api('/api/info');
  } catch (e) {
    toast(`Server not reachable: ${e.message}`, 'error', 10000);
    return;
  }
  initRender();
  await refreshList();
  let want = new URLSearchParams(location.search).get('seq') || store.get('stage-editor:last') || 'stage/sequence.json';
  if (!want.includes('/')) want = `stage/${want}`;                // names saved before works existed
  const list = $('#seqPick');
  const name = [...list.options].some((o) => o.value === want) ? want : list.options[0] && list.options[0].value;
  if (name) await openByName(name);
  else toast('No sequence in any stage folder — use Open… to import one', 'warn', 8000);
}

// stage ready can come before or after the sequence: whichever is last triggers the first draw
on('stage-ready', () => { if (S.seq) { changed('load'); fitZoom(); } });

// ---------------------------------------------------------------------------
// files
async function refreshList() {
  const list = await api('/api/sequences');
  const sel = $('#seqPick');
  // one group per work (stage folder), labelled with its canvas
  const groups = new Map();
  list.forEach((s) => { if (!groups.has(s.work)) groups.set(s.work, []); groups.get(s.work).push(s); });
  sel.replaceChildren(...[...groups].map(([work, items]) => h('optgroup', { label: `${work}/ · ${items[0].canvas.w}×${items[0].canvas.h}` },
    items.map((s) => h('option', { value: s.name }, `${s.file}${s.title && s.title !== s.file ? ' — ' + s.title : ''}`)))));
  if (S.name) sel.value = S.name;
  return list;
}

async function openByName(name, { skipDirtyCheck = false } = {}) {
  if (!skipDirtyCheck && isDirty() && !(await confirmAsk('Discard unsaved changes?', `Changes to ${S.name || 'this sequence'} are not saved.`, 'Discard', true))) { $('#seqPick').value = S.name || ''; return; }
  try {
    const r = await api(`/api/sequence?name=${encodeURIComponent(name)}`);
    if (r.work !== S.work) {
      S.work = r.work;
      setWork(r.work);
      S.info = await api(`/api/info?work=${encodeURIComponent(r.work)}`);
    }
    loadSeq(r.seq, { name: r.name, etag: r.etag });
    store.set('stage-editor:last', r.name);
    $('#seqPick').value = r.name;
    history.replaceState(null, '', `?seq=${encodeURIComponent(r.name)}`);
    fitZoom();
    offerDraft(r);
  } catch (e) { toast(`Could not open ${name}: ${e.message}`, 'error', 8000); }
}

// a draft kept in this browser from an unsaved session (crash, closed tab)
async function offerDraft(r) {
  const d = store.get(DRAFT(r.name));
  if (!d || !d.seq) return;
  if (JSON.stringify(d.seq) === JSON.stringify(r.seq)) { store.del(DRAFT(r.name)); return; }
  const changedOnDisk = d.etag !== r.etag;
  const ok = await confirmAsk('Restore unsaved changes?', `This browser kept edits to ${r.name} from ${new Date(d.at).toLocaleString()}.${changedOnDisk ? ' The file on disk has changed since then.' : ''}`, 'Restore');
  if (ok) { S.seq = d.seq; changed('load'); commit(); syncHeader(); } else store.del(DRAFT(r.name));
}
const saveDraft = debounce(() => {
  if (!S.seq) return;
  if (isDirty()) store.set(DRAFT(S.name), { seq: S.seq, etag: S.etag, at: Date.now() });
  else store.del(DRAFT(S.name));
}, 800);

async function save({ as = false } = {}) {
  if (!S.seq) return;
  let name = S.name;
  if (as || !name) {
    const list = [...$('#seqPick').options].map((o) => o.value);
    name = await ask({ title: 'Save sequence as', body: `A JSON file in a work folder (_pipeline/${S.work}/ renders it with that work's stage).`, ok: 'Save',
      input: { value: name ? name.replace(/\.json$/, '-copy.json') : `${S.work}/sequence-new.json`, validate: (v) => (/^(stage[\w-]*\/)?[\w][\w.-]*\.json$/.test(v) ? null : 'Use <work>/<name>.json — letters, digits, - _ .') } });
    if (!name) return;
    if (!name.includes('/')) name = `${S.work}/${name}`;
    if (workOf(name) !== S.work && !(await confirmAsk(`Save into ${workOf(name)}/?`, `The sequence was made for ${S.work}/; ${workOf(name)}/ renders it with its own stage.`, 'Save', true))) return;
    if (name !== S.name && list.includes(name) && !(await confirmAsk(`Replace ${name}?`, `The current file is kept in ${workOf(name)}/.history/.`, 'Replace', true))) return;
  }
  const isNew = name !== S.name;
  const oldName = S.name;
  try {
    const r = await put(name, isNew);
    markSaved(r.name, r.etag);
    // the edits now live in the saved file: drop the draft of the file they came from too
    store.del(DRAFT(oldName));
    store.del(DRAFT(r.name));
    store.set('stage-editor:last', r.name);
    await refreshList();
    $('#seqPick').value = r.name;
    history.replaceState(null, '', `?seq=${encodeURIComponent(r.name)}`);
    toast(`Saved ${r.name}${r.backup ? ' · previous version in .history/' : ''}`, 'ok');
  } catch (e) { toast(`Save failed: ${e.message}`, 'error', 8000); }
}

async function put(name, force) {
  try {
    return await api(`/api/sequence?name=${encodeURIComponent(name)}`, { method: 'PUT', body: { seq: S.seq, etag: force ? null : S.etag, force } });
  } catch (e) {
    if (e.status !== 409) throw e;
    const ok = await confirmAsk('The file changed on disk', `${name} was modified outside the editor since you opened it. Overwrite it? The disk version is kept in ${workOf(name)}/.history/.`, 'Overwrite', true);
    if (!ok) throw new Error('cancelled');
    return api(`/api/sequence?name=${encodeURIComponent(name)}`, { method: 'PUT', body: { seq: S.seq, force: true } });
  }
}

function importFile() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.addEventListener('change', async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const seq = JSON.parse(await file.text());
      if (!seq || !String(seq.format || '').startsWith('stage-sequence/')) throw new Error('not a stage sequence (needs "format": "stage-sequence/1")');
      if (isDirty() && !(await confirmAsk('Discard unsaved changes?', 'The imported file replaces the open sequence.', 'Import', true))) return;
      loadSeq(seq, { name: null, savedJson: '' });
      fitZoom();
      toast(`Imported ${file.name} — Save writes it into ${S.work}/`, 'ok', 5000);
    } catch (e) { toast(`Import failed: ${e.message}`, 'error', 8000); }
  });
  inp.click();
}

function exportFile() {
  const blob = new Blob([JSON.stringify(S.seq, null, 2) + '\n'], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: (S.name || 'sequence.json').split('/').pop() });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function showHistory() {
  if (!S.name) return toast('Save the sequence first', 'warn');
  const list = await api(`/api/history?name=${encodeURIComponent(S.name)}`);
  if (!list.length) return toast('No backups yet — one is kept on every save', 'info');
  let chosen = null;
  const pick = h('div.hist', list.map((b) => h('button', { type: 'button', on: { click: (e) => { chosen = b; e.target.closest('form').requestSubmit(); } } },
    b.stamp.replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)$/, '$1-$2-$3 $4:$5:$6'))));
  await ask({ title: `Backups of ${S.name}`, body: pick, ok: 'Close', cancel: null });
  if (!chosen) return;
  const r = await api(`/api/history/file?file=${encodeURIComponent(chosen.file)}&work=${encodeURIComponent(S.work)}`);
  edit((seq) => { Object.keys(seq).forEach((k) => delete seq[k]); Object.assign(seq, r.seq); }, { src: 'load' });
  toast(`Loaded backup ${chosen.stamp} — Save to keep it`, 'ok', 5000);
}

function syncHeader() {
  const dirty = isDirty();
  $('#fileState').textContent = dirty ? 'Unsaved' : S.name ? 'Saved' : '';
  $('#fileState').dataset.dirty = dirty ? '1' : '';
  $('#btnSave').disabled = !dirty && !!S.name;
  $('#btnUndo').disabled = !canUndo();
  $('#btnRedo').disabled = !canRedo();
  document.title = `${dirty ? '● ' : ''}${S.name || 'unsaved'} — Stage Editor`;
}

// ---------------------------------------------------------------------------
function wireHeader() {
  $('#seqPick').addEventListener('change', (e) => openByName(e.target.value));
  $('#btnOpen').addEventListener('click', importFile);
  $('#btnSave').addEventListener('click', () => save());
  $('#btnSaveAs').addEventListener('click', () => save({ as: true }));
  $('#btnExport').addEventListener('click', exportFile);
  $('#btnHistory').addEventListener('click', showHistory);
  $('#btnRevert').addEventListener('click', async () => { if (S.name && (!isDirty() || await confirmAsk('Revert to the saved file?', 'Unsaved changes are discarded.', 'Revert', true))) openByName(S.name, { skipDirtyCheck: true }); });
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnHelp').addEventListener('click', showHelp);
}

function wireTransport() {
  $('#btnPlay').addEventListener('click', () => togglePlay());
  $('#btnStart').addEventListener('click', () => setTime(S.loopOn && S.loop ? S.loop[0] : 0));
  $('#btnEnd').addEventListener('click', () => setTime(S.loopOn && S.loop ? S.loop[1] : duration()));
  $('#btnPrev').addEventListener('click', () => setTime(S.t - 1 / fps()));
  $('#btnNext').addEventListener('click', () => setTime(S.t + 1 / fps()));
  $('#tcTime').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(v) || /^f(\d+)$/i.exec(v);
    if (!m) { e.target.value = fmtTime(S.t); return; }
    setTime(/^f/i.test(v) ? +m[1] / fps() : (+(m[1] || 0)) * 60 + +m[2]);
  });
  $('#btnLoop').addEventListener('click', () => { S.loopOn = !S.loopOn; if (S.loopOn && !S.loop) S.loop = [0, duration()]; syncLoop(); });
  $('#btnIn').addEventListener('click', () => setLoop(0));
  $('#btnOut').addEventListener('click', () => setLoop(1));
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => { $$('#viewSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); setView(b.dataset.view); }));
  $('#btnGuides').addEventListener('click', () => { S.guides = !S.guides; $('#btnGuides').setAttribute('aria-pressed', String(S.guides)); updateOverlay(); });
  const syncAudioBtn = (muted) => {
    const b = $('#btnAudio');
    if (!b) return;
    b.setAttribute('aria-pressed', String(muted));
    b.setAttribute('title', muted ? 'Unmute audio (M)' : 'Mute audio (M)');
    const onI = b.querySelector('.i-audio-on');
    const offI = b.querySelector('.i-audio-off');
    if (onI) onI.hidden = muted;
    if (offI) offI.hidden = !muted;
  };
  const btnAudio = $('#btnAudio');
  if (btnAudio) {
    btnAudio.addEventListener('click', () => toggleMute());
    syncAudioBtn(isMuted());
    on('audio-mute', (m) => syncAudioBtn(m));
  }
  $('#btnRipple').addEventListener('click', () => { S.ripple = !S.ripple; $('#btnRipple').setAttribute('aria-pressed', String(S.ripple)); });
  $('#btnSnap').addEventListener('click', () => { S.snap = !S.snap; $('#btnSnap').setAttribute('aria-pressed', String(S.snap)); });
  $('#btnFit').addEventListener('click', fitZoom);
  $('#addMenu').addEventListener('change', (e) => { if (e.target.value) addItem(e.target.value, S.t); e.target.value = ''; });
  on('drag-info', (d) => { $('#dragInfo').textContent = d ? `${d.dt >= 0 ? '+' : ''}${d.dt.toFixed(3)} s · ${d.dt * fps() >= 0 ? '+' : ''}${Math.round(d.dt * fps())} f${S.ripple && d.it.kind === 'bar' && d.mode !== 'a' ? ' · ripple' : ''}` : ''; });
  on('rendered', () => setView(S.view));
}

function setLoop(i) {
  const r = S.loop ? [...S.loop] : [0, duration()];
  r[i] = S.t;
  if (r[1] <= r[0]) r[1 - i] = i ? Math.max(0, S.t - 1) : Math.min(duration(), S.t + 1);
  S.loop = r; S.loopOn = true;
  syncLoop();
}
function syncLoop() {
  $('#btnLoop').setAttribute('aria-pressed', String(S.loopOn));
  $('#loopInfo').textContent = S.loop ? `${fmtTime(S.loop[0])} – ${fmtTime(S.loop[1])}` : '';
  emit('loop');
}

// timeline height: drag the line above it (kept per browser)
function wireSplitter() {
  // on :root, so the toast (outside #app) sits above the timeline too
  const apply = (px) => { const v = clamp(Math.round(px), 160, Math.round(innerHeight * 0.72)); document.documentElement.style.setProperty('--tl-h', `${v}px`); return v; };
  const saved = store.get('stage-editor:tl-h');
  if (saved) apply(saved);
  $('.tl-resize').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const y0 = e.clientY; const h0 = $('.timeline').getBoundingClientRect().height;
    document.body.classList.add('resizing');
    const mv = (ev) => apply(h0 - (ev.clientY - y0));
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); store.set('stage-editor:tl-h', $('.timeline').getBoundingClientRect().height); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
}

function wireTabs() {
  const show = (name) => {
    $$('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.tabpane').forEach((p) => { p.hidden = p.dataset.tab !== name; });
  };
  $$('.tabs [role=tab]').forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  on('tab', show);
  on('select', () => { if (S.sel) show('inspect'); });
  $('#statusIssues').addEventListener('click', () => show('issues'));
}

// ---------------------------------------------------------------------------
async function addItem(what, t) {
  if (!S.seq) return;
  t = clamp(t, 0, duration());
  if (what === 'bkey' || what === 'pkey') {
    const which = what === 'pkey' ? 'phone' : 'browser';
    if (which === 'phone' && !S.seq.phone) return toast('No phone in this sequence', 'warn');
    const k = captureCamera(which, t);
    if (!k) return;
    const base = [which, 'camera'];
    const ks = get(S.seq, base) || [];
    const same = ks.findIndex((x) => Math.abs(T(x.t) - t) < 0.5 / fps());
    if (same >= 0) { select([...base, same]); return toast('There is already a keyframe here', 'info'); }
    let i = ks.findIndex((x) => T(x.t) > t);
    if (i < 0) i = ks.length;
    edit((seq) => { const list = get(seq, base); list.splice(i, 0, k); });
    select([...base, i]);
    return;
  }
  if (what === 'audio') {
    const audioFiles = (S.info && S.info.audioFiles) || [];
    const src = audioFiles[0] || 'film/audio/mix.wav';
    edit((seq) => {
      seq.audio = { src, t0: round(t, 3), volume: 1 };
    });
    select(['audio']);
    return;
  }
  if (what === 'segment') {
    const shots = Object.keys(S.info.shots);
    const used = new Set((S.seq.segments || []).map((s) => s.shot));
    const shot = shots.find((s) => !used.has(s) && s !== (S.seq.phone || {}).shot) || shots[0];
    if (!shot) return toast('No footage captured yet', 'warn');
    const segs = S.seq.segments || [];
    let i = segs.findIndex((s) => T(s.t0) > t);
    if (i < 0) i = segs.length;
    const id = segs.some((s) => s.id === shot) ? `${shot}${segs.length + 1}` : shot;
    edit((seq) => { seq.segments = seq.segments || []; seq.segments.splice(i, 0, { id, shot, t0: round(t, 3), lead: 0, start: 0 }); });
    select(['segments', i]);
    return;
  }
  if (what === 'anchor') {
    // measured in the footage under the playhead (browser segment, or the phone once it is up)
    const segs = (S.seq.segments || []).filter((s) => s.id && s.shot);
    let seg = null;
    segs.forEach((s) => { if (T(s.t0) <= t) seg = s; });
    const ph = S.seq.phone;
    if (ph && ph.shot && T(ph.t0) <= t && (!seg || T(ph.t0) > T(seg.t0))) seg = ph;
    if (!seg) return toast('Anchors are measured in footage: move the playhead over a shot', 'warn');
    const segId = seg === ph ? ph.id || 'phone' : seg.id;
    const sh = S.info.shots[seg.shot];
    const at = round(t - T(seg.t0) - (seg.lead || 0) + (seg.start || 0) / ((sh && sh.fps) || 60), 3);
    const name = await ask({ title: 'New anchor', body: `A named moment ${at.toFixed(2)} s into “${segId}”. Times linked to it (@name) follow the footage when it moves.`, ok: 'Add',
      input: { value: 'mark', validate: (v) => (!/^[\w-]+$/.test(v) ? 'Letters, digits, _ and -' : (S.seq.anchors || {})[v] ? 'Already exists' : null) } });
    if (!name) return;
    edit((seq) => { seq.anchors = seq.anchors || {}; seq.anchors[name] = { seg: segId, at }; });
    select(['anchors', name]);
    return;
  }
  const map = { caption: ['captions'], chip: ['chips'], glow: ['glow'], flash: ['fx', 'flashes'] };
  if (map[what]) {
    const item = blank(what, t, S.seq);
    const base = map[what];
    edit((seq) => { const l = get(seq, base); if (l) l.push(item); else { let o = seq; base.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); o[base[base.length - 1]] = [item]; } });
    select([...base, get(S.seq, base).length - 1]);
  }
}

// ---------------------------------------------------------------------------
function wireShortcuts() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save({ as: e.shiftKey }); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); importFile(); return; }
    if (document.querySelector('dialog[open]')) return;
    if (isTyping(e)) { if (e.key === 'Escape') e.target.blur(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod) return;
    const f = 1 / fps();
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'm': case 'M': toggleMute(); break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        if (e.altKey) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') nudgeSelection(dir * d, 0); else nudgeSelection(0, dir * d); break; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') break;
        e.preventDefault(); setTime(S.t + dir * (e.shiftKey ? 1 : f)); break;
      }
      case 'Home': setTime(0); break;
      case 'End': setTime(duration()); break;
      case '[': case ']': { const ed = edgeTimes(); const x = e.key === '[' ? [...ed].reverse().find((v) => v < S.t - f / 2) : ed.find((v) => v > S.t + f / 2); if (x != null) setTime(x); break; }
      case 'i': case 'I': setLoop(0); break;
      case 'o': case 'O': setLoop(1); break;
      case 'l': case 'L': if (setLoopFromSelection()) { S.loopOn = true; syncLoop(); } else { S.loopOn = !S.loopOn; if (S.loopOn && !S.loop) S.loop = [0, duration()]; syncLoop(); } break;
      case 'k': case 'K': addItem(S.sel && S.sel[0] === 'phone' ? 'pkey' : 'bkey', S.t); break;
      case 'f': case 'F': fitZoom(); break;
      case 'g': case 'G': $('#btnGuides').click(); break;
      case 'v': case 'V': $(`#viewSeg button[data-view="${S.view === 'live' ? 'rendered' : 'live'}"]`).click(); break;
      case 'Delete': case 'Backspace': if (S.sel) { e.preventDefault(); deleteSel(); } break;
      case 'Escape': select(null); break;
      case '?': showHelp(); break;
      default: break;
    }
  });
}

function showHelp() {
  const rows = [
    ['Space', 'Play / pause'], ['← →', 'Step one frame (Shift: one second)'], ['[ ]', 'Previous / next edge on the timeline'],
    ['Home End', 'Start / end'], ['I  O', 'Loop in / out at the playhead'], ['L', 'Loop the selected bar (or toggle loop)'],
    ['K', 'Add a camera keyframe at the playhead'], ['Alt + arrows', 'Nudge the selected caption, chip or key center (Shift ×10)'],
    ['Ctrl D', 'Duplicate'], ['Del', 'Delete'], ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'], ['Ctrl S / Ctrl Shift S', 'Save / save as'],
    ['F', 'Fit the timeline'], ['Ctrl + wheel', 'Zoom the timeline'], ['G', 'Safe-area guides'], ['V', 'Live / rendered frames'],
    ['Shift while dragging', 'No snapping (or axis lock on the preview)'], ['Double-click a row', 'Add an item there'],
  ];
  ask({ title: 'Shortcuts', body: h('dl.keys', rows.map(([k, v]) => [h('dt', k.split(' ').map((x) => h('kbd', x))), h('dd', v)])), ok: 'Close', cancel: null });
}

// console handle for debugging and scripted checks (local tool): stageEditor.S.seq, stageEditor.T('@meTap')
window.stageEditor = { S, T, edit, select, setTime };

boot();
