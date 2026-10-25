// Small helpers shared by the Worker's route modules.

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

export const log = (level, msg, fields = {}) => console[level](JSON.stringify({ msg, ...fields }));

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/** Same-origin only (loopback allowed for local development). Guards every state-changing call. */
export function sameOrigin(request) {
  if (!request.headers.has('origin')) return true;
  const origin = URL.parse(request.headers.get('origin'));
  const host = request.headers.get('host') ?? new URL(request.url).host;
  return !!origin && (origin.host === host || LOOPBACK.includes(origin.hostname));
}

/** Parse a small JSON body; returns null when it's missing, too big or malformed. */
export async function readJson(request, max = 2048) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (!length || length > max) return null;
  try {
    const body = JSON.parse(await request.text());
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomHex = (bytes = 16) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function limited(request, env, name = 'API_LIMIT') {
  if (!env[name]) return false;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env[name].limit({ key: `${name}:${ip}` });
  return !success;
}

export const tooMany = () => json({ error: 'slow down' }, 429, { 'retry-after': '60' });
