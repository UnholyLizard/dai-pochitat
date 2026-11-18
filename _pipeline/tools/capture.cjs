// Deterministic footage capture of «Дай почитать!» (Vite + three.js pop-up book, native scroll, virtual time).
// usage: node capture.cjs <outDir> <shot[,shot]> [--frames N] [--every K] [--lab [--eval "<js>"] [--shot]]
//   --every K  only save every K-th frame (quick previews; meta still has every frame)
//   --lab      run boot + setup only and print the measured data (no frames); --eval runs extra page js and prints it,
//              --shot also saves a screenshot of the first framing (lab_<shot>.jpg)
// Source: `_pipeline/site/` (the capture build, see README) served from disk through request routing
// (http://dp.localhost/). `/api/*` GETs and book covers are answered by the live site once and kept in `_pipeline/cache/`
// (identical bytes on every run); nothing is ever written to the live site: a casting vote is answered locally with
// the cached tally plus that one vote, every other write gets a quiet 404 (guest).
//
// Every shot boots in *virtual* time (frozen from the first script on): the 3D book, page turns, pop-ups, toasts and
// flying coins advance only when the capture steps the clock. Shots pre-roll the boot without saving frames (`pre`),
// wait for the book and its spreads (real-time texture loads), jump to their scroll position and settle.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const HOST = 'http://dp.localhost/';   // *.localhost is a secure context (crypto.randomUUID)
const LIVE = 'https://dai-pochitat.app';
const ROOT = path.resolve(__dirname, '..', 'site');
const CACHE = path.resolve(__dirname, '..', 'cache', 'live');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json' };

// one GET from the live site, kept on disk (body + content type)
async function live(route, urlPath) {
  fs.mkdirSync(CACHE, { recursive: true });
  const key = crypto.createHash('sha1').update(urlPath).digest('hex');
  const body = path.join(CACHE, key + '.bin'), meta = path.join(CACHE, key + '.json');
  if (!fs.existsSync(body)) {
    try {
      const r = await route.fetch({ url: LIVE + urlPath, headers: { accept: route.request().headers().accept || '*/*' } });
      if (r.status() !== 200) return null;
      fs.writeFileSync(body, await r.body());
      fs.writeFileSync(meta, JSON.stringify({ url: urlPath, type: r.headers()['content-type'] || 'application/octet-stream' }));
    } catch { return null; }
  }
  return { body: fs.readFileSync(body), type: JSON.parse(fs.readFileSync(meta, 'utf8')).type };
}

async function routeLocal(ctx) {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error(`no capture build in ${ROOT} (see _pipeline/README.md)`);
  await ctx.route(HOST + '**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    if (p.startsWith('/api/')) {
      if (req.method() === 'GET' && !/^\/api\/(me|auth|admin)\b/.test(p)) {
        const r = await live(route, p + u.search);
        if (r) return route.fulfill({ status: 200, body: r.body, headers: { 'content-type': r.type } });
      }
      // a casting vote: the live tally plus this one vote, answered here (no request leaves the machine)
      if (req.method() === 'POST' && p === '/api/casting') {
        const r = await live(route, '/api/casting');
        const tally = r ? JSON.parse(r.body.toString('utf8')) : { totals: {}, total: 0 };
        let cand = null;
        try { cand = JSON.parse(req.postData() || '{}').candidate; } catch {}
        if (cand) { tally.totals[cand] = (tally.totals[cand] || 0) + 1; tally.total += 1; }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tally) });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"capture"}' });
    }
    let f = path.join(ROOT, decodeURIComponent(p));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (f.startsWith(ROOT) && fs.existsSync(f)) {
      return route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' } });
    }
    // not in the build (book covers live in R2): the live site's copy
    if (path.extname(p)) {
      const r = await live(route, p + u.search);
      if (r) return route.fulfill({ status: 200, body: r.body, headers: { 'content-type': r.type, 'cache-control': 'max-age=31536000' } });
    }
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  // covers on other hosts (R2 / CDN): disk cache as well
  await ctx.route((url) => !url.href.startsWith(HOST) && /^https?:/.test(url.href), async (route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || !/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return route.abort();
    fs.mkdirSync(CACHE, { recursive: true });
    const key = crypto.createHash('sha1').update(url).digest('hex');
    const body = path.join(CACHE, key + '.bin'), meta = path.join(CACHE, key + '.json');
    if (!fs.existsSync(body)) {
      try {
        const r = await route.fetch();
        if (r.status() !== 200) return route.fulfill({ response: r });
        fs.writeFileSync(body, await r.body());
        fs.writeFileSync(meta, JSON.stringify({ url, type: r.headers()['content-type'] || 'image/jpeg' }));
      } catch { return route.abort(); }
    }
    route.fulfill({ status: 200, body: fs.readFileSync(body), headers: { 'content-type': JSON.parse(fs.readFileSync(meta, 'utf8')).type, 'access-control-allow-origin': '*' } });
  });
}
const VT = fs.readFileSync(path.join(__dirname, 'vt.js'), 'utf8');

// The clock is pinned to Saturday 24 Oct 2026, 16:30 in Bar (CEST): the birthday party reads as past (stamped) and
// the 30 October evening as upcoming, the same on every run.
const EPOCH = Date.UTC(2026, 9, 24, 14, 30, 0);

const ease = {
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  lin: (t) => t,
};
// keyframes: [[time, value, easeName?], ...] -> value at t (ease applies to segment ending at that key)
const track = (keys) => (t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const p = (t - t0) / (t1 - t0 || 1);
      return v0 + (v1 - v0) * (ease[e || 'inOutCubic'])(p);
    }
  }
  return keys[keys.length - 1][1];
};
// 2D cursor path through measured points: [[t, x, y, ease?], ...]
const path2 = (keys) => {
  const X = track(keys.map(([t, x, , e]) => [t, x, e]));
  const Y = track(keys.map(([t, , y, e]) => [t, y, e]));
  return (t) => ({ x: X(t), y: Y(t) });
};

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
// Footage is captured at 3x: the film's close-ups run the browser at up to 1.5x on a 3840 px canvas (1440 css px ->
// 4320 device px), so 2x footage would be upscaled there. (The site caps its WebGL canvas at 2x on desktop and 1.5x on
// phones, as it does on a real 3x screen; the page's text and UI are rendered at the full 3x.)
const DESKTOP = { w: 1440, h: 900, dpr: 3, mobile: false };
const MOBILE = { w: 390, h: 844, dpr: 3, mobile: true };

// In-page helpers (window.__mn). The page scrolls the window natively; the capture always jumps (never smooth).
const HELPERS = `
window.__mn = {
  stage() { return window.__dpStage; },
  scene() { return window.__dpScene; },
  rect(sel, root = document) {
    const e = typeof sel === 'string' ? root.querySelector(sel) : sel;
    if (!e) throw new Error('no element ' + sel);
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), l: Math.round(r.x), t: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY) };
  },
  // scroll position at which a chapter's spread is fully open (the site's own spreadTop)
  stop(id) {
    const el = document.getElementById(id); const r = el.getBoundingClientRect();
    if (el.dataset.spread === '0') return 0;
    return Math.max(0, Math.min(this.maxScroll(), Math.round(r.top + scrollY + r.height * 0.5 - innerHeight / 2)));
  },
  stops() { return Object.fromEntries([...document.querySelectorAll('[data-spread]')].map((e) => [e.id, this.stop(e.id)])); },
  centre(sel, vy) { const r = this.rect(sel); return Math.max(0, Math.min(this.maxScroll(), Math.round(r.top + r.h / 2 - vy))); },
  maxScroll() { return document.documentElement.scrollHeight - innerHeight; },
  y() { return window.scrollY; },
  to(y) { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); },
  // a pop-up layer of the 3D book on screen (viewport px): centre of its mesh at a height (0 = foot, 1 = top)
  layer(id, v = 0.5) {
    const S = this.scene(); if (!S) return null;
    for (const sp of S.spreads) for (const l of (sp && sp.layers) || []) {
      if (l.id !== id && l.def.art !== id) continue;
      if (!l.mesh) return null;
      l.mesh.updateWorldMatrix(true, false);
      const g = l.mesh.geometry; g.computeBoundingBox(); const b = g.boundingBox;
      const p = l.mesh.position.clone().set((b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * v, 0).applyMatrix4(l.mesh.matrixWorld).project(S.camera);
      const c = S.renderer.domElement.getBoundingClientRect();
      return { x: Math.round(c.left + (p.x + 1) / 2 * c.width), y: Math.round(c.top + (1 - p.y) / 2 * c.height), rise: +l.rise.toFixed(2), vis: l.root.visible };
    }
    return null;
  },
  // spreads of the book that are not built yet (textures load in real time)
  unready() { const S = this.scene(); if (!S) return 99; return S.spreads.filter((s) => s.def && !s.ready).length; },
  pending() { return [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > -200 && r.top < innerHeight + 200 && r.width && !i.complete; }); },
  async imgs() { await Promise.all(this.pending().map((i) => i.decode().catch(() => {}))); return this.pending().length; },
};`;

// Page code runs while the clock is frozen: timers and rAF only fire on a step, so setup code must never await them.
const PRE = 'const H = window.__mn, G = window.__dpStage, S = window.__dpScene;';

// a point inside a measured rect (dx/dy in px from its centre)
const at = (r, dx = 0, dy = 0) => [r.x + dx, r.y + dy];
// cursor parked off the content (lower left gutter of the text column: no hover targets)
const PARK = [36, 880];

const SHOTS = require('./shots.cjs')({ track, path2, at, PARK, DESKTOP, MOBILE });

const CSS_ALL = 'html{scroll-behavior:auto!important} *{scrollbar-width:none!important} ::-webkit-scrollbar{display:none} .skip-link{display:none!important}';

// Boot the site in a fresh context: routed from disk, language and theme pre-seeded (dp:prefs), clock pinned, seeded
// Math.random + virtual-time shim frozen before the first page script, helpers installed.
async function openSite(browser, { vp = DESKTOP, lang = 'en', theme = 'day', css = '', init = '', tag = 'site', route = '', ctx = null, frozen = true, game = null, teaser = false } = {}) {
  if (!ctx) {
    ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile,
      userAgent: vp.mobile ? UA_MOBILE : UA_DESKTOP, serviceWorkers: 'block',
      colorScheme: theme === 'night' ? 'dark' : 'light', locale: 'en-GB', timezoneId: 'Europe/Podgorica', reducedMotion: 'no-preference',
    });
    await routeLocal(ctx);
    // teaser: the librarian's "Hi! Want help finding a book?" bubble (once a day, 5 s after load) is on only for shots
    // that ask for it; `game` seeds the reader's card (dp:game) so coins and stamps continue from the previous shot
    await ctx.addInitScript(({ lang, theme, game, teaser, epoch }) => {
      try {
        if (sessionStorage.getItem('__cap')) return;      // a navigation inside the shot keeps what the visit earned
        sessionStorage.setItem('__cap', '1');
        const prefs = { lang, theme };
        if (!teaser) prefs.teaser = new Date(epoch).toDateString();
        localStorage.clear(); localStorage.setItem('dp:prefs', JSON.stringify(prefs));
        if (game) localStorage.setItem('dp:game', JSON.stringify(game));
      } catch {}
    }, { lang, theme, game, teaser, epoch: EPOCH });
    await ctx.addInitScript(({ css, epoch }) => { window.__shotCss = css; window.__vtSeed = 20261024; window.__vtEpoch = epoch; }, { css: CSS_ALL + (css || ''), epoch: EPOCH });
    await ctx.addInitScript(VT);
    if (frozen) await ctx.addInitScript(() => window.__vt.freeze());
    await ctx.addInitScript(() => {
      const s = document.createElement('style');
      s.textContent = window.__shotCss;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    });
    if (init) await ctx.addInitScript(init);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${tag}] pageerror`, e.message.slice(0, 200)));
  page.on('console', (m) => {
    const s = m.text();
    if ((m.type() === 'error' || m.type() === 'warning') && !/GL_INVALID_OPERATION|too many errors|GPU stall|404|Failed to load resource|AudioContext/.test(s)) console.log(`[${tag}] console`, s.slice(0, 200));
  });
  if (!vp.mobile) await page.mouse.move(PARK[0], PARK[1]);
  await page.goto(`${HOST}${route}`, { waitUntil: 'load' });
  await page.evaluate(HELPERS);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

// advance the virtual clock by `sec` without saving frames (the page renders every step, as in a real browser)
async function preroll(page, sec, fps = 60) {
  const n = Math.round(sec * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate((ms) => window.__vt.step(ms), 1000 / fps);
    await page.evaluate(() => window.__vt.settle());
  }
}
// step the clock until page js `cond` is true (real-time work such as texture loads lands between steps)
async function until(page, cond, { max = 40, fps = 60, tag = '' } = {}) {
  const t0 = Date.now();
  for (let i = 0; i < max * fps; i++) {
    if (await page.evaluate(`(() => { ${PRE} return !!(${cond}); })()`)) return (i / fps);
    await page.evaluate((ms) => window.__vt.step(ms), 1000 / fps);
    await page.evaluate(() => window.__vt.settle());
    if (Date.now() - t0 > 90000) break;
  }
  console.log(`[${tag}] until(${cond}) gave up`);
  return -1;
}

async function runShot(browser, name, outDir, opts) {
  const shot = SHOTS[name];
  const fps = 60;
  const vp = shot.vp;
  const { ctx, page } = await openSite(browser, { vp, lang: shot.lang, theme: shot.theme, css: shot.css, init: shot.init, tag: name, route: shot.route || '', game: shot.game, teaser: shot.teaser });
  const t0 = Date.now();
  if (shot.pre) await preroll(page, shot.pre, fps);
  // the 3D book: wait for the stage, then (walk) visit every chapter so each spread is built and its art is in
  if (shot.book !== false) {
    await until(page, 'window.__dpStage && window.__dpScene', { tag: name });
    if (shot.walk !== false) {
      for (const y of await page.evaluate(`(() => { ${PRE} const s = Object.values(H.stops()); return [...s, 0]; })()`)) {
        await page.evaluate((y) => window.__mn.to(y), y);
        await preroll(page, 0.4, fps);
      }
      await until(page, 'H.unready() === 0', { tag: name });
      await preroll(page, 1.2, fps);
    }
  }
  // what the boot walk left on screen (the "read to the end" stamp toast) is not part of the shot
  if (shot.book !== false) await page.evaluate(() => document.querySelectorAll('.toast, .flying-coin').forEach((e) => e.remove()));
  console.log(`[${name}] booted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // game state after the walk: the walk itself earns stamps ("open", "finish"); a shot can reset to what it needs
  const data = (await page.evaluate(`(async () => { ${PRE} ${shot.setup || ''} })()`)) || {};
  const scrollTo = (y) => page.evaluate((y) => window.__mn.to(y), y);
  if (shot.scroll) { const y0 = shot.scroll(0, data); if (y0 != null) await scrollTo(y0); }
  const firstMouse = async () => {
    let m0 = null;
    try { m0 = shot.mouse ? shot.mouse(0, data) : null; } catch { return; }
    if (m0 && !vp.mobile) await page.mouse.move(m0.x, m0.y);
  };
  await firstMouse();
  if (shot.settle) await preroll(page, shot.settle, fps);
  await page.evaluate(() => window.__mn.imgs());
  if (shot.after) { Object.assign(data, (await page.evaluate(`(async () => { ${PRE} ${shot.after} })()`)) || {}); await firstMouse(); }
  if (opts.lab) {
    const extra = arg('eval') ? await page.evaluate(`(async () => { ${PRE} ${arg('eval')} })()`) : null;
    console.log(extra != null ? (typeof extra === 'string' ? extra : JSON.stringify(extra, null, 1)) : JSON.stringify(data, null, 1));
    if (process.argv.includes('--shot')) await page.screenshot({ path: path.join(outDir, `lab_${name}.jpg`), type: 'jpeg', quality: 85, scale: 'css' });
    await ctx.close(); return;
  }

  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^f\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(dir, f));
  const total = Math.min(Math.round(shot.dur * fps), opts.maxFrames || Infinity);
  const byFrame = (list) => { const m = new Map(); (list || []).forEach(([t, ...v]) => { const f = Math.round(t * fps); m.set(f, (m.get(f) || []).concat([v.length > 1 ? v : v[0]])); }); return m; };
  const clicks = new Set((shot.clicks || []).map((c) => Math.round(c * fps)));
  const downs = new Set((shot.drags || []).map(([a]) => Math.round(a * fps)));
  const ups = new Set((shot.drags || []).map(([, b]) => Math.round(b * fps)));
  const events = byFrame(shot.events);
  const keys = byFrame(shot.keys);
  const measures = byFrame(shot.measure);
  const wheels = byFrame(shot.wheel);
  const typed = new Map();
  for (const [a, b, text] of shot.typing || []) {
    [...text].forEach((ch, i) => { const f = Math.round((a + (b - a) * (i / Math.max(1, text.length - 1))) * fps); typed.set(f, (typed.get(f) || '') + ch); });
  }
  const meta = { name, fps, vp, frames: [], cursor: shot.cursor || null, clicks: [...(shot.clicks || []), ...(shot.fakeClicks || [])].sort((a, b) => a - b), drags: shot.drags || [], data };
  let isDown = false;
  const t1 = Date.now();

  for (let f = 0; f < total; f++) {
    const t = f / fps;
    for (const [key, js] of measures.get(f) || []) data[key] = await page.evaluate(`(() => { ${PRE} return ${js}; })()`);
    const m = shot.mouse ? shot.mouse(t, data) : null;
    if (m && !vp.mobile) await page.mouse.move(m.x, m.y, { steps: isDown ? 2 : 1 });
    if (downs.has(f) && m) { await page.mouse.down(); isDown = true; }
    if (ups.has(f) && m) { await page.mouse.up(); isDown = false; }
    if (clicks.has(f) && m) {
      if (vp.mobile) await page.touchscreen.tap(m.x, m.y);
      else { await page.mouse.down(); await page.mouse.up(); }
    }
    for (const dy of wheels.get(f) || []) await page.mouse.wheel(0, dy);
    for (const k of keys.get(f) || []) await page.keyboard.press(k);
    if (typed.has(f)) await page.keyboard.type(typed.get(f));
    const sv = shot.scroll ? shot.scroll(t, data) : null;
    const y = sv == null ? null : Math.round(sv * 2) / 2;
    const js = (events.get(f) || []).join('\n') + (shot.perFrame ? '\n' + shot.perFrame(t, data) : '');
    await page.evaluate(`(() => { ${PRE} ${js}
      ${y != null ? `if (Math.abs(${y} - H.y()) > 0.25) H.to(${y});` : ''}
      window.__vt.step(${f > 0 ? 1000 / fps : 0}); })()`);
    await page.evaluate(() => window.__vt.settle());
    if (shot.waitImgs !== false) await page.evaluate(() => window.__mn && window.__mn.imgs());
    if (!opts.every || f % opts.every === 0 || f === total - 1) {
      await page.screenshot({ path: path.join(dir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
    }
    const sy = await page.evaluate(() => Math.round(window.scrollY));
    meta.frames.push({ y: sy, m: m ? [Math.round(m.x), Math.round(m.y)] : null, d: isDown ? 1 : 0 });
    if (shot.log && f % 30 === 0) console.log(`[${name}] t=${t.toFixed(2)}`, JSON.stringify(await page.evaluate(`(() => { ${PRE} return ${shot.log}; })()`)));
    if (f % 120 === 0) console.log(`[${name}] ${f}/${total}  ${((Date.now() - t1) / (f + 1)).toFixed(0)}ms/frame`);
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
  await ctx.close();
  console.log(`[${name}] done ${total} frames in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
}

const LAUNCH = { executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] };
module.exports = { SHOTS, track, path2, openSite, preroll, until, routeLocal, HELPERS, PRE, DESKTOP, MOBILE, CHROME, ROOT, EPOCH, LAUNCH, HOST };

if (require.main === module) {
  (async () => {
    const outDir = process.argv[2];
    const names = process.argv[3].split(',');
    const opts = { maxFrames: +arg('frames', 0), every: +arg('every', 0), lab: process.argv.includes('--lab') };
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch(LAUNCH);
    for (const n of names) {
      if (!SHOTS[n]) throw new Error(`unknown shot "${n}" (have: ${Object.keys(SHOTS).join(', ')})`);
      await runShot(browser, n, outDir, opts);
    }
    await browser.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
