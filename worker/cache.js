// Edge caching helpers using Cloudflare Cache API (caches.default).
// Read-only GET requests cache responses at the Cloudflare edge POPs,
// eliminating repeated D1 queries within the Cache-Control TTL.

export async function cachedGet(request, ctx, handler) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache && request.method === 'GET') {
    try {
      const match = await cache.match(request);
      if (match) return match;
    } catch {
      // Ignore cache match failure, proceed to live handler
    }
  }

  const response = await handler();

  if (cache && request.method === 'GET' && response.status === 200) {
    const cc = response.headers.get('cache-control') || '';
    if (!cc.includes('no-store') && !cc.includes('private')) {
      ctx?.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
  }

  return response;
}

/**
 * Invalidate edge-cached entries for known paths on admin writes.
 */
export async function invalidateCache(requestOrUrl, extraPaths = []) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (!cache) return;
  try {
    const raw = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl?.url;
    if (!raw) return;
    const origin = new URL(raw).origin;
    const paths = ['/api/books', '/api/suggestions', '/api/collections', ...extraPaths];
    await Promise.all(
      paths.map((p) => {
        const targetUrl = new URL(p, origin).toString();
        return cache.delete(new Request(targetUrl, { method: 'GET' })).catch(() => false);
      })
    );
  } catch {
    // Ignore cache invalidation failures
  }
}
