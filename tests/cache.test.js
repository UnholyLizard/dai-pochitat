import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedGet, invalidateCache } from '../worker/cache.js';

test('cachedGet - returns cached response on cache hit', async () => {
  const cachedResponse = new Response(JSON.stringify({ cached: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  const mockCache = {
    match: async () => cachedResponse,
    put: async () => {},
    delete: async () => true,
  };
  globalThis.caches = { default: mockCache };

  let handlerCalled = false;
  const request = new Request('https://dai-pochitat.app/api/books', { method: 'GET' });
  const ctx = { waitUntil: () => {} };

  const res = await cachedGet(request, ctx, async () => {
    handlerCalled = true;
    return new Response('{}');
  });

  assert.equal(handlerCalled, false, 'Handler should not be called on cache hit');
  const data = await res.json();
  assert.equal(data.cached, true);

  delete globalThis.caches;
});

test('cachedGet - calls handler and caches response on cache miss', async () => {
  let putCalledWith = null;
  const mockCache = {
    match: async () => null,
    put: async (req, res) => {
      putCalledWith = { url: req.url, status: res.status };
    },
    delete: async () => true,
  };
  globalThis.caches = { default: mockCache };

  let waitedPromise = null;
  const ctx = {
    waitUntil: (p) => {
      waitedPromise = p;
    },
  };
  const request = new Request('https://dai-pochitat.app/api/books?limit=20', { method: 'GET' });

  const res = await cachedGet(request, ctx, async () => {
    return new Response(JSON.stringify({ books: [] }), {
      status: 200,
      headers: { 'cache-control': 'public, max-age=60, s-maxage=60' },
    });
  });

  assert.equal(res.status, 200);
  assert.ok(waitedPromise, 'waitUntil should be called');
  await waitedPromise;
  assert.ok(putCalledWith, 'cache.put should have been executed');
  assert.equal(putCalledWith.url, 'https://dai-pochitat.app/api/books?limit=20');

  delete globalThis.caches;
});

test('cachedGet - skips caching for no-store or private responses', async () => {
  const mockCache = {
    match: async () => null,
    put: async () => {
      assert.fail('put should not be called for no-store');
    },
  };
  globalThis.caches = { default: mockCache };

  let waited = false;
  const ctx = {
    waitUntil: () => {
      waited = true;
    },
  };
  const request = new Request('https://dai-pochitat.app/api/books', { method: 'GET' });

  const res = await cachedGet(request, ctx, async () => {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  });

  assert.equal(res.status, 404);
  assert.equal(waited, false);

  delete globalThis.caches;
});

test('invalidateCache - deletes known and extra endpoints', async () => {
  const deletedUrls = [];
  const mockCache = {
    delete: async (req) => {
      deletedUrls.push(req.url);
      return true;
    },
  };
  globalThis.caches = { default: mockCache };

  await invalidateCache('https://dai-pochitat.app/api/admin/books/123', ['/api/books/123', '/api/books/DP-0123']);

  assert.ok(deletedUrls.includes('https://dai-pochitat.app/api/books'));
  assert.ok(deletedUrls.includes('https://dai-pochitat.app/api/suggestions'));
  assert.ok(deletedUrls.includes('https://dai-pochitat.app/api/collections'));
  assert.ok(deletedUrls.includes('https://dai-pochitat.app/api/books/123'));
  assert.ok(deletedUrls.includes('https://dai-pochitat.app/api/books/DP-0123'));

  delete globalThis.caches;
});
