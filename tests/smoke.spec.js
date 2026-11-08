import { test, expect } from '@playwright/test';

// /api/* is served by the Worker, which `vite preview` does not run; those failures are expected.
const expected = (text) => /\/api\/|Failed to load resource|\[catalog\]/.test(text);

test('page loads without console or CSP errors', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !expected(m.text())) problems.push(`console: ${m.text()}`);
  });
  await page.goto('/');
  await expect(page.locator('.brand')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});

test('hours and contacts are in the static HTML (no JS)', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('[data-hours] > div').first()).toBeAttached();
  await expect(page.locator('[data-contacts] a').first()).toBeAttached();
  await ctx.close();
});

test('JSON-LD names the library, not the studio, as publisher', async ({ page }) => {
  await page.goto('/');
  const graph = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph'];
  const site = graph.find((n) => n['@type'] === 'WebSite');
  const lib = graph.find((n) => n['@type'] === 'Library');
  expect(site.publisher['@id']).toBe(lib['@id']);
  expect(lib.provider).toBeUndefined();
});

test('the magic chest returns a book', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-oracle] button[type="submit"]').click({ force: true });
  await expect(page.locator('[data-oracle-result] .bookcard')).toBeVisible();
});

test('the librarian chat answers', async ({ page }) => {
  await page.goto('/');
  await page.locator('.librarian-fab').click({ force: true });
  const log = page.locator('[data-chat-log] > li');
  await expect(page.locator('#librarian')).toBeVisible();
  const before = await log.count();
  await page.locator('#chat-input').fill('Привет!');
  await page.locator('[data-chat-form] button[type="submit"]').click();
  await expect(log).not.toHaveCount(before);
  await expect.poll(() => log.count(), { timeout: 10_000 }).toBeGreaterThan(before + 1);
});

test("the reader's card opens", async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-open="passport"]').first().click();
  await expect(page.locator('#passport')).toBeVisible();
});

test('the service worker activates', async ({ page }) => {
  await page.goto('/');
  const active = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  expect(active).toBe(true);
});
