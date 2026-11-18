// Live preview: the real stage in an iframe (same render(t) as the frame renderer), scaled to fit,
// with an overlay to move/resize captions and chips and to drag a camera keyframe's center.
import { $, h, clone, clamp, round, on, emit, get, samePath, toast } from './util.js';
import { S, edit, commit, changed, select, setTime, duration, fps, canvas } from './store.js';

let W = 1920, H = 1080;
let frame, inner, overlay, rendered, k = 1;
let stageWork = null;

export function initPreview() {
  frame = $('#stageFrame');
  inner = $('#stageInner');
  overlay = $('#overlay');
  rendered = $('#rendered');
  frame.addEventListener('load', async () => {
    const w = frame.contentWindow;
    try {
      await w.ready;
      S.stageWin = w;
      emit('stage-ready');
      scheduleApply();
    } catch (e) {
      S.stageError = `stage failed to load: ${e.message}`;
      emit('stage-error');
    }
  });
  setWork(S.work || 'stage');
  new ResizeObserver(fit).observe($('#viewport'));
  fit();
  on('change', (src) => { if (src === 'load') fit(); scheduleApply(); });
  on('time', () => draw(S.t));
  on('select', () => updateOverlay());
  rendered.addEventListener('error', () => { rendered.hidden = true; $('#renderedMiss').hidden = S.view !== 'rendered'; });
  rendered.addEventListener('load', () => { rendered.hidden = S.view !== 'rendered'; $('#renderedMiss').hidden = true; });
}

// each work has its own stage.html (stage/ = 16:9 film, stage-instagram/ = 9:16): switching work reloads the preview
export function setWork(work) {
  if (work === stageWork) return;
  stageWork = work;
  S.stageWin = null;
  frame.src = `/${work}/stage.html`;
}

function fit() {
  ({ w: W, h: H } = canvas());
  inner.style.width = `${W}px`;
  inner.style.height = `${H}px`;
  frame.style.width = `${W}px`;
  frame.style.height = `${H}px`;
  const vp = $('#viewport');
  const cs = window.getComputedStyle(vp);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availW = Math.max(10, vp.clientWidth - padX);
  const availH = Math.max(10, vp.clientHeight - padY);
  k = Math.max(0.05, Math.min(availW / W, availH / H));
  const box = $('#stageBox');
  box.style.width = `${W * k}px`;
  box.style.height = `${H * k}px`;
  inner.style.transform = `scale(${k})`;
  overlay.style.setProperty('--ik', String(1 / k));
  $('#zoomPct').textContent = `${Math.round(k * 100)}%`;
}

// --- apply + draw (serialized; a newer request replaces a pending one) ---
let applyQueued = false;
let chain = Promise.resolve();
export function scheduleApply() {
  if (applyQueued || !S.stageWin || !S.seq) return;
  applyQueued = true;
  // a macrotask, not rAF: coalesces a burst of edits and still runs in a background tab
  setTimeout(() => {
    applyQueued = false;
    chain = chain.then(async () => {
      try {
        // wait: false — don't hold the editor on first-time image decodes (they finish in the background)
        await S.stageWin.stage.apply(clone(S.seq), { wait: false });
        if (S.stageError) { S.stageError = null; emit('stage-error'); }
      } catch (e) {
        S.stageError = e.message;
        emit('stage-error');
      }
      draw(S.t);
    });
  });
}

// a frame waits for its images at most this long, so one slow decode can't stall scrubbing
const FRAME_WAIT = 1500;
let busy = false, want = null;
export async function draw(t) {
  want = t;
  if (busy || !S.stageWin) return;
  busy = true;
  try {
    while (want != null) {
      const x = want; want = null;
      if (S.view === 'rendered') showRendered(x);
      await Promise.race([S.stageWin.render(x), new Promise((r) => setTimeout(r, FRAME_WAIT))]);
      updateOverlay();
    }
  } catch (e) {
    S.stageError = `render failed: ${e.message}`;
    emit('stage-error');
  } finally { busy = false; }
}

function showRendered(t) {
  const dir = ($('#rFramesDir') && $('#rFramesDir').value) || 'frames4k';
  const f = Math.round(t * fps());
  const url = `/files/${dir}/f${String(f).padStart(5, '0')}.jpg?v=${S.renderStamp || 0}`;
  if (rendered.dataset.u !== url) { rendered.dataset.u = url; rendered.src = url; }
}

export function setView(v) {
  S.view = v;
  $('#viewport').dataset.view = v;
  rendered.hidden = v !== 'rendered';
  $('#renderedMiss').hidden = true;
  if (v === 'rendered') { rendered.dataset.u = ''; showRendered(S.t); }
  updateOverlay();
}

// --- playback (wall clock; frames the stage can't keep up with are dropped) ---
let raf = 0;
export function togglePlay(force) {
  const want = force != null ? force : !S.playing;
  if (want === S.playing) return;
  S.playing = want;
  emit('play', want);
  cancelAnimationFrame(raf);
  if (!want) return;
  const range = S.loopOn && S.loop ? S.loop : [0, duration()];
  let t0 = S.t >= range[1] - 1 / fps() || S.t < range[0] ? range[0] : S.t;
  let w0 = performance.now();
  const tick = (now) => {
    if (!S.playing) return;
    let t = t0 + (now - w0) / 1000;
    if (t >= range[1]) {
      if (S.loopOn && S.loop) { t0 = range[0]; w0 = now; t = range[0]; } else { setTime(range[1], 'play'); togglePlay(false); return; }
    }
    setTime(t, 'play');
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

// --- overlay ---------------------------------------------------------------
const isSel = (p) => samePath(S.sel, p);

export function updateOverlay() {
  if (!overlay) return;
  overlay.replaceChildren();
  if (S.guides) overlay.append(...guides());
  if (!S.stageWin || !S.stageWin.stage || S.view !== 'live' || S.playing) return;
  let boxes;
  try { boxes = S.stageWin.stage.boxes(); } catch { return; }
  boxes.captions.forEach((b, i) => {
    const p = ['captions', i];
    if (!b.vis && !isSel(p)) return;
    overlay.append(boxEl(b, p, 'cap', !b.vis));
  });
  boxes.chips.forEach((b, i) => {
    const p = ['chips', i];
    if (!b.vis && !isSel(p)) return;
    overlay.append(boxEl(b, p, 'chip', !b.vis));
  });
  if (S.sel && S.sel[S.sel.length - 2] === 'camera') {
    const key = get(S.seq, S.sel);
    if (key) overlay.append(gizmo(key));
  }
}

// action-safe (5 %) and title-safe (10 %) frames and centre lines for the current canvas; on 9:16 also the zones
// Instagram covers with UI (top 250 px, bottom 420 px, the action column on the right of the lower half)
function guides() {
  const px = (v) => `${v}px`;
  const box = (cls, l, t, r, b) => h(`div.guide.${cls}`, { style: { left: px(l), top: px(t), width: px(W - l - r), height: px(H - t - b) } });
  const out = [
    box('action', W * 0.05, H * 0.05, W * 0.05, H * 0.05),
    box('title', W * 0.1, H * 0.1, W * 0.1, H * 0.1),
    h('div.guide.center-h', { style: { left: '0', width: px(W), top: px(H / 2) } }),
    h('div.guide.center-v', { style: { top: '0', height: px(H), left: px(W / 2) } }),
  ];
  if (H > W * 1.5) {
    out.push(h('div.guide.ig', { style: { left: '0', top: '0', width: px(W), height: px(250) } }, h('span', 'Instagram UI · top 250 px')));
    out.push(h('div.guide.ig', { style: { left: '0', top: px(H - 420), width: px(W), height: px(420) } }, h('span', 'Instagram UI · bottom 420 px')));
    out.push(h('div.guide.ig', { style: { left: px(W - 130), top: px(H * 0.5), width: px(130), height: px(H * 0.5 - 420) } }));
  }
  return out;
}

function boxEl(b, path, kind, ghost) {
  const sel = isSel(path);
  const it = get(S.seq, path) || {};
  const el = h(`div.obox.${kind}`, { style: { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` } });
  if (sel) el.classList.add('sel');
  if (ghost) el.classList.add('ghost');
  el.append(h('span.otag', `${kind === 'cap' ? 'Caption' : 'Chip'} ${it.id || ''}`));
  el.addEventListener('pointerdown', (e) => startDrag(e, path, 'move'));
  if (sel && kind === 'cap') {
    const hw = h('div.ohandle.w', { title: 'Width' });
    const hs = h('div.ohandle.s', { title: 'Title size' });
    hw.addEventListener('pointerdown', (e) => startDrag(e, path, 'width', b));
    hs.addEventListener('pointerdown', (e) => startDrag(e, path, 'size', b));
    el.append(hw, hs);
  }
  return el;
}

function gizmo(key) {
  const el = h('div.gizmo', { style: { left: `${key.cx}px`, top: `${key.cy}px` }, title: 'Drag: camera center (cx, cy) of this keyframe' },
    h('i.gx'), h('i.gy'), h('span.gtag', `${round(key.cx, 1)}, ${round(key.cy, 1)} · ×${round(key.s, 3)}`));
  el.addEventListener('pointerdown', (e) => startDrag(e, S.sel, 'center'));
  return el;
}

function startDrag(e, path, mode, box) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  if (!isSel(path)) select(path);
  const it0 = clone(get(S.seq, path));
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false;
  // window listeners: the overlay is rebuilt after every draw, so the pressed element does not survive the drag
  const target = window;
  document.body.classList.add('dragging');
  const move = (ev) => {
    let dx = (ev.clientX - x0) / k, dy = (ev.clientY - y0) / k;
    if (!moved && Math.hypot(dx, dy) < 2) return;
    moved = true;
    if (ev.shiftKey && (mode === 'move' || mode === 'center')) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    edit((seq) => {
      const it = get(seq, path);
      if (mode === 'move') {
        it.x = Math.round(it0.x + (it0.align === 'right' ? -dx : dx));
        it.y = Math.round(it0.y + dy);
      } else if (mode === 'center') {
        it.cx = Math.round(it0.cx + dx);
        it.cy = Math.round(it0.cy + dy);
      } else if (mode === 'width') {
        it.w = Math.max(80, Math.round(it0.w + dx));
      } else if (mode === 'size') {
        const base = it0.size || (it0.layout === 'top' ? 48 : 72);
        it.size = clamp(Math.round(base * (1 + dx / Math.max(80, box.w))), 12, 240);
      }
    }, { commit: false, src: 'overlay' });
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    document.body.classList.remove('dragging');
    if (moved) commit();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

// stage coordinates of a click on the preview (for "jump to" helpers)
export function stagePoint(e) {
  const r = inner.getBoundingClientRect();
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
}

export function nudgeSelection(dx, dy) {
  if (!S.sel) return false;
  const it = get(S.seq, S.sel);
  if (!it) return false;
  if (typeof it.x === 'number' && typeof it.y === 'number') {
    edit((seq) => { const o = get(seq, S.sel); o.x += it.align === 'right' ? -dx : dx; o.y += dy; }, { src: 'overlay' });
    return true;
  }
  if (typeof it.cx === 'number') {
    edit((seq) => { const o = get(seq, S.sel); o.cx += dx; o.cy += dy; }, { src: 'overlay' });
    return true;
  }
  return false;
}

export function captureCamera(which, t) {
  if (!S.stageWin) { toast('Stage not ready', 'warn'); return null; }
  const st = S.stageWin.stage.camera(which, t);
  if (!st) return null;
  const r = (v, d = 3) => round(v, d);
  return { t: r(t), cx: r(st.cx, 1), cy: r(st.cy, 1), s: r(st.s, 4), rx: r(st.rx || 0, 2), ry: r(st.ry || 0, 2), rz: r(st.rz || 0, 2), px: r(st.px, 1), py: r(st.py, 1), o: r(st.o == null ? 1 : st.o, 3), e: 'inOutSine' };
}

export { changed };
