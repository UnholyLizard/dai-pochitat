// Edge caching helpers using Cloudflare Cache API (caches.default).
// Read-only GET requests cache responses at the Cloudflare edge POPs,
// eliminating repeated D1 queries within the Cache-Control TTL.
//
// Every cache key carries the catalog version (meta.catalog_version, migration 0009). An admin write
// bumps it, which retires *every* cached variant at once — `/api/books?collection=…&offset=48` included —
// in every POP, not only the exact URLs this POP could delete. Isolates re-read the version at most
// every VERSION_TTL ms, so readers see an edit within ~10 s.

const VERSION_TTL = 10_000;
let memo = { value: null, at: 0 };

/** Current catalog version, or null when there is no DB (tests, local static preview). */
export async function catalogVersion(env) {
  if (!env?.DB) return null;
  const now = Date.now();
  if (memo.value !== null && now - memo.at < VERSION_TTL) return memo.value;
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'catalog_version'").first();
    memo = { value: String(row?.value ?? '0'), at: now };
  } catch {
    memo = { value: '0', at: now }; // migration 0009 not applied yet: plain caching, as before
  }
  return memo.value;
}

/** Retire every cached public catalog response. */
export async function bumpCatalogVersion(env) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO meta (key, value) VALUES ('catalog_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
    ).run();
  } catch {
    // meta table missing: the exact-URL deletes in invalidateCache still run
  }
  memo = { value: null, at: 0 };
}

/** The request as the cache sees it: same URL plus the catalog version. */
export function cacheKey(request, version) {
  if (version == null) return request;
  const url = new URL(request.url);
  url.searchParams.set('__cv', version);
  return new Request(url.toString(), { method: 'GET' });
}

export async function cachedGet(request, ctx, handler, env) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = cache && request.method === 'GET' ? cacheKey(request, await catalogVersion(env)) : request;
  if (cache && request.method === 'GET') {
    try {
      const match = await cache.match(key);
      if (match) return match;
    } catch {
      // Ignore cache match failure, proceed to live handler
    }
  }

  const response = await handler();

  if (cache && request.method === 'GET' && response.status === 200) {
    const cc = response.headers.get('cache-control') || '';
    if (!cc.includes('no-store') && !cc.includes('private')) {
      ctx?.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    }
  }

  return response;
}

/**
 * Invalidate edge-cached entries on admin writes: bump the catalog version (all variants, all POPs)
 * when `env` is given, and delete the known unversioned URLs in this POP.
 */
export async function invalidateCache(requestOrUrl, extraPaths = [], env) {
  if (env) await bumpCatalogVersion(env);
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
