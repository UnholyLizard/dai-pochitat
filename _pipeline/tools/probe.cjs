// Lab probe: frozen boot, pre-roll, then run page JS (with the capture helpers) and print the result.
// usage: node probe.cjs <preSec> "<js returning a value>" [--mobile] [--y <scrollY>] [--settle <sec>] [--shot out.jpg] [--route path] [--season halloween [--season-store off]]
const C = require('./capture.cjs');
const { chromium } = require('playwright-core');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
(async () => {
  const browser = await chromium.launch({ executablePath: C.CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const vp = process.argv.includes('--mobile') ? C.MOBILE : C.DESKTOP;
  const { page } = await C.openSite(browser, { vp, tag: 'probe', route: arg('route', ''), season: arg('season', null), seasonStore: arg('season-store', arg('season', null)) });
  await C.preroll(page, +process.argv[2]);
  if (arg('y')) { await page.evaluate((y) => window.__mn.to(y), +arg('y')); await C.preroll(page, +arg('settle', 1)); await page.evaluate(() => window.__mn.imgs()); }
  const r = await page.evaluate(`(async () => { ${C.PRE} ${process.argv[3]} })()`);
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
  // --then <sec>: step the clock after the first js (never await timers/rAF in page js: the clock is frozen)
  if (arg('then')) { await C.preroll(page, +arg('then')); await page.evaluate(() => window.__mn.imgs()); }
  if (arg('eval2')) console.log(JSON.stringify(await page.evaluate(`(async () => { ${C.PRE} ${arg('eval2')} })()`), null, 1));
  if (arg('shot')) await page.screenshot({ path: arg('shot'), type: 'jpeg', quality: 85, scale: 'css' });
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
