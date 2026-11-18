// Render stage.html frame-by-frame.
// usage:
//   node render.cjs frames <outDir> [--workers 4] [--dpr 2] [--from 0] [--to <duration>] [--fps <seq fps>] [--force] [--prune]
//   node render.cjs stills <outDir> <t1,t2,...> [--dpr 1] [--fmt jpg|png] [--clean]
// common: [--seq <sequence.json>] (default stage/sequence.json) [--stage <dir>] [--log-every 120]
//   --stage  the work's stage folder (default: the sequence's own folder if it has a stage.html, else stage/);
//            the canvas size comes from the sequence's "canvas" ({ "w": 1080, "h": 1920 } for 9:16; default 1920×1080)
//   --force  re-render frames that already exist (default: skip them, so an interrupted render resumes)
//   --prune  delete frame files outside the rendered range (a shorter cut leaves no stale tail for encode.sh)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { SP, DEFAULT_SEQ, loadMeta, listMosaic, loadSequence, stageDirFor, canvasOf } = require('./stage-data.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let DPR = 1;
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes('--' + name);
const SEQ_FILE = path.resolve(arg('seq', DEFAULT_SEQ));
const STAGE_DIR = stageDirFor(SEQ_FILE, arg('stage', null));
const STAGE = 'file:///' + path.join(STAGE_DIR, 'stage.html').replace(/\\/g, '/');
const CANVAS = canvasOf(loadSequence(SEQ_FILE));

async function openStage(browser, dpr) {
  DPR = dpr;
  const ctx = await browser.newContext({ viewport: { width: CANVAS.w, height: CANVAS.h }, deviceScaleFactor: dpr });
  const META = loadMeta();
  const MOSAIC = listMosaic(STAGE_DIR);
  const SEQ = loadSequence(SEQ_FILE);
  const CLEAN = flag('clean');
  await ctx.addInitScript(({ META, MOSAIC, SEQ, CLEAN }) => { window.META = META; window.MOSAIC = MOSAIC; window.SEQ = SEQ; window.CLEAN = CLEAN; }, { META, MOSAIC, SEQ, CLEAN });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto(STAGE, { waitUntil: 'load' });
  try {
    await page.evaluate(() => window.ready);
  } catch (e) {
    throw new Error(`stage failed to load ${path.relative(SP, SEQ_FILE)}: ${e.message.split('\n')[0]}`);
  }
  const client = await ctx.newCDPSession(page);
  return { ctx, page, client };
}

async function shot(client, file, fmt) {
  // explicit clip.scale = DPR, otherwise CDP returns a 1x capture
  const clip = { x: 0, y: 0, width: CANVAS.w, height: CANVAS.h, scale: DPR };
  const r = await client.send('Page.captureScreenshot', fmt === 'png' ? { format: 'png', clip } : { format: 'jpeg', quality: 95, clip });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}

(async () => {
  const mode = process.argv[2];
  const outDir = process.argv[3];
  if (!['frames', 'stills'].includes(mode) || !outDir) {
    console.log('usage: node render.cjs frames|stills <outDir> [...] (see the header of render.cjs)');
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const logEvery = Math.max(1, +arg('log-every', 120));
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--hide-scrollbars'],
  });

  if (mode === 'stills') {
    const times = String(process.argv[4] || '').split(',').filter((s) => s.trim() !== '').map(Number);
    if (!times.length || times.some((t) => !isFinite(t))) throw new Error(`stills: bad time list "${process.argv[4]}"`);
    const fmt = arg('fmt', 'jpg');
    const { page, client } = await openStage(browser, +arg('dpr', 1));
    for (const t of times) {
      await page.evaluate((t) => window.render(t), t);
      const file = path.join(outDir, `t${t.toFixed(2).padStart(5, '0')}.${fmt}`);
      await shot(client, file, fmt);
      console.log('still', t, file);
    }
  } else {
    const from = +arg('from', 0);
    let to = +arg('to', 0);
    let fps = +arg('fps', 0);
    if (!to || !fps) {
      const probe = await openStage(browser, 1);
      const seq = await probe.page.evaluate(() => ({ duration: window.DURATION, fps: window.stage.model.fps }));
      await probe.ctx.close();
      to = to || seq.duration;
      fps = fps || seq.fps;
    }
    const workers = Math.max(1, +arg('workers', 4));
    const dpr = +arg('dpr', 2);
    const force = flag('force');
    const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
    const total = f1 - f0;
    if (flag('prune')) {
      let n = 0;
      for (const f of fs.readdirSync(outDir)) {
        const m = /^f(\d{5})\.jpg$/.exec(f);
        if (m && (+m[1] < f0 || +m[1] >= f1)) { fs.unlinkSync(path.join(outDir, f)); n++; }
      }
      if (n) console.log(`pruned ${n} frames outside ${f0}..${f1 - 1}`);
    }
    const per = Math.ceil(total / workers);
    const t0 = Date.now();
    let done = 0, skipped = 0;
    console.log(`rendering ${total} frames (${from}s -> ${to}s) at ${CANVAS.w * dpr}x${CANVAS.h * dpr} (${path.relative(SP, STAGE_DIR)}), ${workers} workers${force ? ', overwriting' : ''}`);
    await Promise.all([...Array(workers)].map(async (_, w) => {
      const a = f0 + w * per, b = Math.min(f1, a + per);
      if (a >= b) return;
      const { page, client } = await openStage(browser, dpr);
      for (let f = a; f < b; f++) {
        const file = path.join(outDir, `f${String(f).padStart(5, '0')}.jpg`);
        if (!force && fs.existsSync(file)) { done++; skipped++; continue; }
        await page.evaluate((t) => window.render(t), f / fps);
        await shot(client, file, 'jpg');
        done++;
        if (done % logEvery === 0) {
          const el = (Date.now() - t0) / 1000;
          const rendered = Math.max(1, done - skipped);
          console.log(`${done}/${total}  ${(el / rendered * 1000).toFixed(0)}ms/frame  eta ${((total - done) * el / rendered / 60).toFixed(1)}min`);
        }
      }
    }));
    console.log(`done ${total} frames${skipped ? ` (${skipped} already there, kept; --force re-renders them)` : ''} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  }
  await browser.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
