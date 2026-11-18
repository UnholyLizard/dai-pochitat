// Virtual-time shim, injected before any page script.
// Mode 'real': virtual clock follows the wall clock (page loads normally).
// Mode 'virtual': clock only moves on __vt.step(ms) -> deterministic frames.
(() => {
  if (window.__vt) return;
  // Optional seeded Math.random (set window.__vtSeed in an earlier init script) so procedural pages
  // (particles, random lines, WebGL scenes) produce identical footage on every capture run.
  if (window.__vtSeed != null) {
    let s = window.__vtSeed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = {
    setTimeout: window.setTimeout.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    perfNow: performance.now.bind(performance),
    dateNow: Date.now.bind(Date),
  };
  // Optional pinned wall clock (set window.__vtEpoch = ms in an earlier init script): the page opens at that date and
  // time, and `new Date()` follows the virtual clock too, so date-dependent copy ("Tuesday, 13 October") is identical
  // on every capture run whatever day it is rendered.
  const dateBase = (window.__vtEpoch != null ? +window.__vtEpoch : R.dateNow()) - R.perfNow();
  if (window.__vtEpoch != null) {
    const D = Date;
    const VDate = function (...a) {
      if (!new.target) return new D(VDate.now()).toString();
      return Reflect.construct(D, a.length ? a : [VDate.now()], new.target);
    };
    VDate.prototype = D.prototype;
    VDate.parse = D.parse;
    VDate.UTC = D.UTC;
    window.Date = VDate;
  }
  let mode = 'real';
  let now = R.perfNow();
  let offset = 0; // real -> virtual offset while in real mode
  let realAtStep = R.perfNow(); // wall clock at the end of the last virtual step

  const timers = new Map();
  let nextTimerId = 1;
  let rafQueue = new Map();
  let nextRafId = 1;

  const runTimersUntil = (target) => {
    for (;;) {
      let best = null;
      for (const [id, t] of timers) {
        if (t.at <= target && (!best || t.at < best[1].at || (t.at === best[1].at && id < best[0]))) best = [id, t];
      }
      if (!best) break;
      const [id, t] = best;
      if (t.at > now) now = t.at;
      if (t.interval != null) t.at += t.interval; else timers.delete(id);
      try { t.fn(...t.args); } catch (e) { console.error(e); }
    }
    if (target > now) now = target;
  };

  const flushRaf = (ts) => {
    const q = rafQueue;
    rafQueue = new Map();
    for (const fn of q.values()) { try { fn(ts); } catch (e) { console.error(e); } }
  };

  window.setTimeout = (fn, delay = 0, ...args) => {
    if (typeof fn !== 'function') return 0;
    const id = nextTimerId++;
    timers.set(id, { fn, at: now + Math.max(0, +delay || 0), args, interval: null });
    return id;
  };
  window.setInterval = (fn, delay = 0, ...args) => {
    if (typeof fn !== 'function') return 0;
    const id = nextTimerId++;
    const iv = Math.max(4, +delay || 0);
    timers.set(id, { fn, at: now + iv, args, interval: iv });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = nextRafId++; rafQueue.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafQueue.delete(id); };
  window.requestIdleCallback = (fn, opts) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 12 }), 1);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);
  // window.__vtLivePerf (opt-in per shot): inside a virtual frame, performance.now() also advances with the wall clock,
  // so a page that times its own work (e.g. "0.08 ms" under a search box) shows a real measurement instead of 0.00.
  // Not monotonic across frames, so only enable it for shots where nothing else reads performance.now() directly.
  performance.now = () => (mode === 'real' ? R.perfNow() - offset : now + (window.__vtLivePerf ? R.perfNow() - realAtStep : 0));
  Date.now = () => Math.round(dateBase + performance.now());

  // Real-mode pump: keep virtual clock glued to the wall clock.
  const pumpTimers = () => {
    if (mode === 'real') runTimersUntil(R.perfNow() - offset);
    R.setTimeout(pumpTimers, 2);
  };
  const pumpRaf = () => {
    if (mode === 'real') { runTimersUntil(R.perfNow() - offset); flushRaf(now); }
    R.raf(pumpRaf);
  };
  R.setTimeout(pumpTimers, 0);
  R.raf(pumpRaf);

  // CSS animations / transitions are driven through the Web Animations API.
  const owned = new WeakSet();
  const adoptAnimations = () => {
    for (const a of document.getAnimations()) {
      if (!owned.has(a)) {
        owned.add(a);
        try { a.pause(); a.currentTime = 0; } catch {}
      }
    }
  };
  const advanceAnimations = (ms) => {
    for (const a of document.getAnimations()) {
      if (!owned.has(a)) { owned.add(a); try { a.pause(); a.currentTime = 0; } catch {} }
      // A paused animation never reaches 'finished', so `animation.finished` (a coin removed after its flight) and
      // transitionend / animationend would never fire: finish it once the clock passes its end.
      try {
        if (a.playState === 'finished') continue;
        const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
        const next = (a.currentTime || 0) + ms;
        // (0.5 ms early: at 899.9999 of 900 ms Chrome already counts the effect as over and drops the animation from
        // document.getAnimations(), still paused, so it would never be finished)
        if (Number.isFinite(end) && next >= end - 0.5) a.finish(); else a.currentTime = next;
      } catch {}
    }
  };

  window.__vt = {
    freeze() {
      if (mode === 'virtual') return;
      now = R.perfNow() - offset;
      mode = 'virtual';
      for (const a of document.getAnimations()) { owned.add(a); try { a.pause(); } catch {} }
    },
    step(ms) {
      runTimersUntil(now + ms);
      advanceAnimations(ms);
      flushRaf(now);
      realAtStep = R.perfNow();
    },
    // let the browser run layout / observers / React commits, then pin any new animations at t=0
    settle() {
      return new Promise((res) => R.raf(() => R.raf(() => { adoptAnimations(); res(); })));
    },
    now: () => now,
    get mode() { return mode; },
  };
})();
