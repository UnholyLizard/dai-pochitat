// Serves book covers from the Cloudflare R2 bucket `COVERS_BUCKET`.
// Both `/covers/*` (WebP) and `/covers-jpg/*` (JPEG for Telegram bots) are handled.
// Strong caching headers (`public, max-age=31536000, immutable`) ensure Cloudflare edge
// and browser caches avoid repeated fetches.

const MIME_TYPES = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function serveCover(request, env, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  // Key without leading slash: e.g. "covers/DP-0001.webp" or "covers-jpg/DP-0001.jpg"
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Security check against directory traversal
  if (!key || key.includes('..') || key.startsWith('/')) {
    return new Response('Not Found', { status: 404 });
  }

  // Check Cloudflare Edge Cache
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const cached = await cache.match(request).catch(() => null);
    if (cached) return cached;
  }

  // If R2 is not configured, fall back to static assets
  if (!env.COVERS_BUCKET) {
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }

  const object = await env.COVERS_BUCKET.get(key).catch(() => null);

  // If not found in R2, fall back to ASSETS (graceful fallback)
  if (!object) {
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  }

  const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
  const contentType = object.httpMetadata?.contentType || MIME_TYPES[ext] || 'application/octet-stream';

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', CACHE_CONTROL);
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }
  headers.set('Content-Length', String(object.size));

  // Conditional GET (304 Not Modified)
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && object.httpEtag && (ifNoneMatch === object.httpEtag || ifNoneMatch === '*')) {
    return new Response(null, { status: 304, headers });
  }

  const response = new Response(request.method === 'HEAD' ? null : object.body, {
    status: 200,
    headers,
  });

  if (cache && request.method === 'GET') {
    ctx?.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  }

  return response;
}
