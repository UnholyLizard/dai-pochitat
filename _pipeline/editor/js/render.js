// Render panel: stills (preview moments), frames (the full 4K sequence or the loop range) and encode,
// run by the server through tools/render.cjs and tools/encode.sh with the sequence as currently edited.
import { $, h, api, on, emit, toast, fmtTime, round } from './util.js';
import { S, T, edit, duration, fps, canvas } from './store.js';
import { confirmAsk } from './dialog.js';

let current = null;    // job being followed
let es = null;
const gallery = [];

export function initRender() {
  $('#rStillsGo').addEventListener('click', () => runStills());
  $('#rStillsAddT').addEventListener('click', () => { const f = $('#rTimes'); f.value = [f.value.trim(), round(S.t, 3)].filter(Boolean).join(', '); });
  $('#rStillsCaps').addEventListener('click', () => {
    // one moment per caption, once its lines have landed
    $('#rTimes').value = (S.seq.captions || []).map((c) => round(Math.min(T(c.in) + 1.4, T(c.out)), 2)).filter(Number.isFinite).join(', ');
  });
  $('#rFramesGo').addEventListener('click', () => runFrames());
  $('#rEncodeGo').addEventListener('click', () => runEncode());
  $('#rPosterHere').addEventListener('click', () => { $('#rPoster').value = Math.round(S.t * fps()); $('#rPoster').dispatchEvent(new Event('change')); });
  $('#rCancel').addEventListener('click', async () => { if (current) await api(`/api/jobs/${current.id}/cancel`, { method: 'POST', body: {} }).catch((e) => toast(e.message, 'error')); });
  $('#rRange').addEventListener('change', syncRange);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox' || e.target.closest('.lb-close')) closeLightbox(); });
  on('change', (src) => { if (src === 'load') loadTargets(); syncInfo(); });
  // output folders, video name, audio track and poster live in the sequence ("render"), so each project keeps its own
  [['#rFramesDir', 'frames'], ['#rVideoOut', 'video'], ['#rName', 'name'], ['#rAudio', 'audio'], ['#rPoster', 'poster']].forEach(([sel, key]) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = key === 'poster' ? Math.round(+el.value) : el.value.trim();
      edit((seq) => { seq.render = { ...(seq.render || {}), [key]: v || undefined }; }, { src: 'render-panel' });
    });
  });
  on('loop', syncRange);
  syncRange();
  // reattach to a job that is still running (e.g. after a page reload)
  api('/api/jobs').then((jobs) => { const run = jobs.find((j) => j.state === 'running'); if (run) follow(run); else if (jobs[0]) showJob(jobs[0]); }).catch(() => {});
}

function loadTargets() {
  const r = (S.seq && S.seq.render) || {};
  $('#rFramesDir').value = r.frames || 'frames4k';
  $('#rVideoOut').value = r.video || '../showcase/video';
  $('#rName').value = r.name || 'presentation';
  $('#rPoster').value = r.poster != null ? r.poster : 156;

  const audioSel = $('#rAudio');
  if (audioSel) {
    let opts = (S.info && S.info.audioFiles) || [];
    const chosen = r.audio || (S.seq && S.seq.audio && (typeof S.seq.audio === 'string' ? S.seq.audio : S.seq.audio.src)) || '';
    if (chosen && !opts.includes(chosen)) opts = [chosen, ...opts];
    audioSel.replaceChildren(
      h('option', { value: '' }, 'None (silent)'),
      ...opts.map((o) => h('option', { value: o }, o))
    );
    audioSel.value = chosen || (opts[0] || '');
  }
}

function syncInfo() {
  const n = Math.round(duration() * fps());
  const dpr = +$('#rDpr').value || 2;
  const c = canvas();
  $('#rFramesInfo').textContent = `${n} frames · ${c.w * dpr}×${c.h * dpr} · ${fmtTime(duration())}${c.h > c.w ? ' · 9:16 → Instagram encode' : ''}`;
}
function syncRange() {
  const loop = $('#rRange').value === 'loop';
  if (loop && !S.loop) { $('#rRange').value = 'full'; toast('Set a loop range first (I / O keys, or L on a selected bar)', 'warn'); }
  const isLoop = $('#rRange').value === 'loop';
  $('#rPrune').disabled = isLoop;
  if (isLoop) $('#rPrune').checked = false;
  $('#rRangeInfo').textContent = isLoop && S.loop ? `${fmtTime(S.loop[0])} → ${fmtTime(S.loop[1])}` : 'whole sequence';
  syncInfo();
}

async function start(body) {
  if (current && current.state === 'running') { toast(`A ${current.kind} job is still running`, 'warn'); return; }
  try {
    const job = await api('/api/jobs', { method: 'POST', body: { ...body, seq: S.seq, work: S.work } });
    follow(job);
    emit('tab', 'render');
  } catch (e) { toast(e.message, 'error', 6000); }
}

function runStills() {
  const times = $('#rTimes').value.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!times.length || times.some((t) => !Number.isFinite(t))) return toast('Times: seconds separated by commas', 'warn');
  start({ kind: 'stills', times, dpr: +$('#rStillDpr').value, clean: $('#rClean').checked, fmt: $('#rFmt').value, out: $('#rStillsOut').value });
}

async function runFrames() {
  const body = { kind: 'frames', out: $('#rFramesDir').value, dpr: +$('#rDpr').value, workers: +$('#rWorkers').value, force: $('#rForce').checked, prune: $('#rPrune').checked };
  if ($('#rRange').value === 'loop' && S.loop) { body.from = S.loop[0]; body.to = S.loop[1]; }
  const n = Math.round(((body.to != null ? body.to - body.from : duration())) * fps());
  if (body.prune && !(await confirmAsk('Render the full sequence?', `${n} frames into ${body.out}/. Frame files outside this range are deleted so encode.sh sees no stale tail.`, 'Render'))) return;
  start(body);
}

function runEncode() {
  if (!S.info.bash) return toast('Encoding needs bash (Git for Windows); set PIPELINE_BASH to its path', 'error', 6000);
  const c = canvas();
  const audioVal = $('#rAudio') ? $('#rAudio').value : '';
  start({ kind: 'encode', frames: $('#rFramesDir').value, out: $('#rVideoOut').value, name: $('#rName').value, audio: audioVal, poster: +$('#rPoster').value, expectFrames: Math.round(duration() * fps()), vertical: c.h > c.w });
}

// ---------------------------------------------------------------------------
function follow(job) {
  current = job;
  if (es) es.close();
  showJob(job);
  es = new EventSource(`/api/jobs/${job.id}/events`);
  es.addEventListener('snapshot', (e) => { const d = JSON.parse(e.data); Object.assign(current, d); $('#rLog').replaceChildren(); d.log.forEach(logLine); (d.outputs || []).forEach(addOutput); showJob(current); });
  es.addEventListener('log', (e) => logLine(JSON.parse(e.data)));
  es.addEventListener('progress', (e) => { current.progress = JSON.parse(e.data); showJob(current); });
  es.addEventListener('output', (e) => { const o = JSON.parse(e.data); current.outputs = [...(current.outputs || []), o]; addOutput(o); });
  es.addEventListener('state', (e) => {
    Object.assign(current, JSON.parse(e.data));
    showJob(current);
    es.close(); es = null;
    if (current.kind === 'frames' && current.state === 'done') { S.renderStamp = Date.now(); emit('rendered'); }
    toast(`${current.label}: ${current.state}`, current.state === 'done' ? 'ok' : current.state === 'cancelled' ? 'info' : 'error');
  });
  es.onerror = () => { if (es && es.readyState === 2) es = null; };
}

function showJob(job) {
  const card = $('#rJob');
  card.hidden = false;
  card.dataset.state = job.state;
  $('#rJobLabel').textContent = job.label || job.kind;
  $('#rJobState').textContent = job.state;
  const p = job.progress;
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : job.state === 'done' ? 100 : null;
  $('#rBar').style.width = pct == null ? '' : `${pct}%`;
  $('#rBar').parentElement.classList.toggle('indet', pct == null && job.state === 'running');
  $('#rJobPct').textContent = pct == null ? '' : `${pct}%${p ? ` · ${p.done}/${p.total}` : ''}`;
  $('#rCancel').hidden = job.state !== 'running';
  const vids = (job.outputs || []).filter((o) => /\.mp4$/.test(o.file));
  $('#rVideos').replaceChildren(...vids.map((o) => h('a.vid', { href: o.url, target: '_blank', rel: 'noopener' }, o.file.split('/').pop(), h('small', `${(o.size / 1048576).toFixed(1)} MB`))));
}

function logLine(e) {
  const box = $('#rLog');
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
  box.append(h(`div.l.${e.stream}`, e.s));
  while (box.childElementCount > 600) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
  const eta = /eta ([\d.]+)min/.exec(e.s);
  if (eta) $('#rJobEta').textContent = `~${eta[1]} min left`;
  else if (e.stream === 'sys') $('#rJobEta').textContent = '';
}

function addOutput(o) {
  if (!/\.(jpe?g|png)$/i.test(o.file)) return;
  gallery.unshift(o);
  if (gallery.length > 48) gallery.pop();
  $('#rGallery').replaceChildren(...gallery.map((g, i) => h('button.shot', { title: `${g.file} — open`, on: { click: () => openLightbox(i) } },
    h('img', { src: g.url, alt: `still at ${g.t} s`, loading: 'lazy' }), h('span', `${g.t != null ? g.t.toFixed(2) + ' s' : ''}`))));
}

function openLightbox(i) {
  const g = gallery[i];
  const lb = $('#lightbox');
  lb.replaceChildren(h('figure', h('img', { src: g.url, alt: '' }), h('figcaption', h('span', g.file),
    g.t != null ? h('button', { on: { click: () => { closeLightbox(); emit('seek', g.t); } } }, `Go to ${g.t.toFixed(2)} s`) : null,
    h('a', { href: g.url, target: '_blank', rel: 'noopener' }, 'Open full size'), h('button.lb-close', 'Close'))));
  lb.hidden = false;
}
function closeLightbox() { $('#lightbox').hidden = true; }
