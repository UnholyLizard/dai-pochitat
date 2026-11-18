// stills.cjs - raw high-resolution screenshots of the «Дай почитать!» capture build (served from disk via capture.cjs).
// usage: node stills.cjs            -> every still
//        node stills.cjs d05 m03    -> only files whose names start with one of the prefixes
// Output: showcase/dai-pochitat-site/screenshots/raw/  (desktop 2880×1800 PNG, phone 1170×2532 PNG, full page 2160 wide)
// Each group = one fresh context under the frozen clock (capture.cjs openSite): the book boots, every spread is built
// (walk), then each step jumps to its scroll position, lets the page turn and the pop-ups settle in virtual time, runs
// its page js (a click on the site's own control) and saves the frame. A step the filter does not select still runs
// (it sets up the state the next one expects) but writes no file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const C = require('./capture.cjs');

const OUT = path.resolve(__dirname, '..', '..', 'showcase', 'dai-pochitat-site', 'screenshots', 'raw');
const DESK = { w: 1440, h: 900, dpr: 2, mobile: false };
const MOB = { w: 390, h: 844, dpr: 3, mobile: true };
const FULL = { w: 1440, h: 900, dpr: 1.5, mobile: false };
const filters = process.argv.slice(2);
const wanted = (file) => filters.length === 0 || filters.some((f) => file.startsWith(f));

// the reader's card as a returning reader has it (coins = stamps + book folk found)
const card = (stamps, found, vote = null, librarian = 'ginger') => ({
  v: 1, coins: stamps.length + found.length, name: '', wish: [], solved: [], cardNo: '2610', visits: 2, lastVisit: Date.UTC(2026, 9, 24, 14, 0, 0),
  stamps: Object.fromEntries(stamps.map((s) => [s, 1])), found: Object.fromEntries(found.map((s) => [s, 1])), librarian, vote, voter: '00000000-0000-4000-8000-000000000000',
});
const READER = card(['open', 'night', 'jury', 'finish', 'oracle', 'chat'], ['owl', 'mouse'], 'cinder', 'cinder');
const CHAPTERS = ['top', 'house', 'room', 'casting', 'chest', 'events', 'find', 'end'];
const NAMES = ['cover', 'house', 'room', 'casting', 'chest', 'events', 'find', 'back-cover'];
const chapters = (prefix, tag = '') => CHAPTERS.map((id, i) => ({ file: `${prefix}${String(i + 1).padStart(2, '0')}_${NAMES[i]}${tag}.png`, stop: id }));

const GROUPS = [
  // every chapter at rest, Day, English, first visit
  { vp: DESK, steps: chapters('d') },
  // key states
  { vp: DESK, opts: { theme: 'night' }, steps: [{ file: 'd09_cover_evening.png', stop: 'top' }, { file: 'd10_room_evening.png', stop: 'room' }, { file: 'd11_chest_evening.png', stop: 'chest' }] },
  { vp: DESK, opts: { lang: 'ru' }, steps: [{ file: 'd12_cover_ru.png', stop: 'top' }, { file: 'd13_house_ru.png', stop: 'house' }, { file: 'd14_casting_ru.png', stop: 'casting' }] },
  { vp: DESK, opts: { game: READER }, steps: [
    { file: 'd15_casting_results.png', stop: 'casting', dy: 150 },
    { file: 'd16_chest_book.png', stop: 'chest', js: `document.querySelector('[data-oracle] input[value="magic"]').click(); document.querySelector('[data-oracle]').requestSubmit();`, dy: 190, settle: 2.5 },
    { file: 'd17_chat.png', stop: 'events', js: `document.querySelector('.librarian-fab').click();`, settle: 4.5 },
    { file: 'd18_reader_card.png', stop: 'events', js: `document.querySelector('.librarian-fab').click(); document.querySelector('.hud__coins').click();`, settle: 1.5 },
  ] },
  { vp: DESK, steps: [
    { file: 'd19_magnifier.png', stop: 'house', js: `document.querySelector('[data-zoom-open]').click();`, settle: 2.5 },
    { file: 'd20_menu.png', stop: 'house', js: `document.querySelector('[data-zoom-close]').click(); document.getElementById('menu').showPopover();`, settle: 2.0 },
  ] },
  // the catalogue (its own page)
  { vp: DESK, opts: { route: 'catalog/' }, book: false, steps: [
    { file: 'd21_catalogue.png', y: 0 },
    { file: 'd22_catalogue_search.png', y: 0, js: `const q = document.querySelector('.catalog-search-input'); q.focus(); q.value = 'dragon'; q.dispatchEvent(new Event('input', { bubbles: true }));`, settle: 2.5 },
    { file: 'd23_catalogue_book.png', y: 0, js: `document.querySelector('.catalog-card').click();`, settle: 1.5 },
  ] },
  // full page, stitched from viewport tiles (the 3D stage is fixed: each tile shows the book where that scroll puts it)
  { vp: FULL, full: 'f01_fullpage.png', steps: [] },
  // phone
  // (on a phone the map chapter's card is taller than the screen: frame it from the card's top, not the spread's stop)
  { vp: MOB, steps: chapters('m').map((s) => (s.stop === 'find' ? { ...s, cardTop: 215 } : s)) },
  { vp: MOB, opts: { game: READER }, steps: [
    { file: 'm09_reader_card.png', stop: 'house', js: `document.querySelector('.hud__coins').click();`, settle: 1.5 },
  ] },
  { vp: MOB, opts: { theme: 'night', game: READER }, steps: [
    { file: 'm10_room_evening.png', stop: 'room' },
    { file: 'm11_chat_evening.png', stop: 'room', js: `document.querySelector('.librarian-fab').click();`, settle: 4.5 },
  ] },
];

async function boot(browser, g) {
  const o = g.opts || {};
  const { ctx, page } = await C.openSite(browser, { vp: g.vp, lang: o.lang || 'en', theme: o.theme || 'day', game: o.game || null, route: o.route || '', tag: 'stills' });
  await C.preroll(page, 1);
  if (g.book !== false) {
    await C.until(page, 'window.__dpStage && window.__dpScene', { tag: 'stills' });
    for (const y of await page.evaluate(`(() => { ${C.PRE} return [...Object.values(H.stops()), 0]; })()`)) { await page.evaluate((y) => window.__mn.to(y), y); await C.preroll(page, 0.4); }
    await C.until(page, 'H.unready() === 0', { tag: 'stills' });
    await C.preroll(page, 1.2);
    await page.evaluate(() => document.querySelectorAll('.toast, .flying-coin').forEach((e) => e.remove()));
  } else await C.preroll(page, 2.5);
  if (!g.vp.mobile) await page.mouse.move(36, 880);
  return { ctx, page };
}

async function stitchFull(page, out) {
  // the header and the floating controls appear once (top of the page), not on every tile
  await page.addStyleTag({ content: '.topbar{position:absolute!important}.librarian-dock,.zoom-btn,.read-progress,[data-book-hint],[data-book-doodle]{display:none!important}' });
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = 900; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-full-'));
  const tiles = [];
  for (let y = 0, i = 0; y < H; y += vh, i++) {
    const top = Math.min(y, H - vh);
    await page.evaluate((y) => window.__mn.to(y), top);
    await C.preroll(page, 2.4);
    await page.evaluate(() => window.__mn.imgs());
    const f = path.join(dir, `t${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: f, type: 'png' });
    tiles.push({ f, crop: y - top });
  }
  let FF = path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'); if (!fs.existsSync(FF)) FF = FF.slice(0, -4);
  const k = FULL.dpr;
  const chain = tiles.map((t, i) => `[${i}]crop=iw:ih-${Math.round(t.crop * k)}:0:${Math.round(t.crop * k)}[c${i}]`).join(';');
  execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...tiles.flatMap((t) => ['-i', t.f]), '-filter_complex', `${chain};${tiles.map((_, i) => `[c${i}]`).join('')}vstack=inputs=${tiles.length}`, out]);
  fs.rmSync(dir, { recursive: true, force: true });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(C.LAUNCH);
  let n = 0;
  for (const g of GROUPS) {
    const files = [...g.steps.map((s) => s.file), g.full].filter(Boolean);
    if (!files.some(wanted)) continue;
    const { ctx, page } = await boot(browser, g);
    for (const s of g.steps) {
      const y = s.y != null ? s.y : s.cardTop != null ? await page.evaluate(([id, top]) => window.__mn.rect(`#${id} .card`).top - top, [s.stop, s.cardTop])
        : await page.evaluate((id) => window.__mn.stop(id), s.stop);
      await page.evaluate((y) => window.__mn.to(y), y + (s.dy || 0));
      await C.preroll(page, 2.4);
      if (s.js) { await page.evaluate(`(() => { ${s.js} })()`); await C.preroll(page, s.settle || 1.5); }
      await page.evaluate(() => window.__mn.imgs());
      if (wanted(s.file)) { await page.screenshot({ path: path.join(OUT, s.file), type: 'png' }); console.log('still', s.file); n++; }
    }
    if (g.full && wanted(g.full)) { await stitchFull(page, path.join(OUT, g.full)); console.log('still', g.full); n++; }
    await ctx.close();
  }
  await browser.close();
  console.log(`${n} stills -> ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
