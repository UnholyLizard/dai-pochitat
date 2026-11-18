// Lab look at the capture build under the frozen clock: screenshots (1x) of every chapter at rest, or at given
// scroll positions, optionally after page js. Not footage.
// usage: node peek.cjs <outDir> [--mobile] [--theme night] [--lang ru] [--ys 0,900] [--route catalog/] [--eval "<js>"] [--then <sec>] [--name tag]
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright-core');
const C = require('./capture.cjs');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const mobile = process.argv.includes('--mobile');
  const browser = await chromium.launch(C.LAUNCH);
  const vp = mobile ? C.MOBILE : C.DESKTOP;
  const route = arg('route', '');
  const { page } = await C.openSite(browser, { vp: { ...vp, dpr: 1 }, tag: 'peek', lang: arg('lang', 'en'), theme: arg('theme', 'day'), route });
  await C.preroll(page, 1);
  const book = !route;
  if (book) {
    await C.until(page, 'window.__dpStage && window.__dpScene', { tag: 'peek' });
    for (const y of await page.evaluate(`(() => { ${C.PRE} return [...Object.values(H.stops()), 0]; })()`)) { await page.evaluate((y) => window.__mn.to(y), y); await C.preroll(page, 0.4); }
    await C.until(page, 'H.unready() === 0', { tag: 'peek' });
  }
  await C.preroll(page, 1.5);
  const stops = book ? await page.evaluate(`(() => { ${C.PRE} return H.stops(); })()`) : {};
  console.log(JSON.stringify({ stops, h: await page.evaluate(() => document.documentElement.scrollHeight) }));
  const ys = arg('ys') ? arg('ys').split(',').map(Number).map((y) => [`y${String(y).padStart(5, '0')}`, y]) : book ? Object.entries(stops) : [['top', 0]];
  const tag = arg('name', mobile ? 'm' : 'd');
  for (const [name, y] of ys) {
    await page.evaluate((y) => window.__mn.to(y), y);
    await C.preroll(page, 2.2);
    await page.evaluate(() => window.__mn.imgs());
    if (arg('eval')) { console.log(name, JSON.stringify(await page.evaluate(`(async () => { ${C.PRE} ${arg('eval')} })()`))); await C.preroll(page, +arg('then', 1.5)); await page.evaluate(() => window.__mn.imgs()); }
    await page.screenshot({ path: path.join(out, `${tag}_${name}.jpg`), type: 'jpeg', quality: 82 });
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
