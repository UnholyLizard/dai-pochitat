// Casting votes for the librarian's role. Only /api/* reaches this Worker
// (assets.run_worker_first); everything else is served straight from ./dist.
//
//   GET  /api/casting                       → { totals: { [candidate]: n }, total }
//   POST /api/casting { voter, candidate }  → same shape; one vote per anonymous voter id,
//                                             which may be changed later.

const CANDIDATES = new Set(['ginger', 'cinder', 'patches', 'mila', 'nika', 'tim', 'marko', 'bookmark']);
const VOTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 512;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

const log = (level, msg, fields = {}) => console[level](JSON.stringify({ msg, ...fields }));

async function totals(env) {
  const { results } = await env.DB.prepare('SELECT candidate, COUNT(*) AS n FROM votes GROUP BY candidate').all();
  const out = {};
  let total = 0;
  for (const { candidate, n } of results) {
    if (!CANDIDATES.has(candidate)) continue;
    out[candidate] = n;
    total += n;
  }
  return { totals: out, total };
}

async function vote(request, env) {
  // Same-origin only: the page posts here, other sites can't stuff the ballot box.
  // (Loopback is allowed for local development, where wrangler presents the production host.)
  const origin = URL.parse(request.headers.get('origin') ?? '');
  const host = request.headers.get('host') ?? new URL(request.url).host;
  const local = origin && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (request.headers.has('origin') && origin?.host !== host && !local) return json({ error: 'forbidden' }, 403);

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.VOTE_LIMIT) {
    const { success } = await env.VOTE_LIMIT.limit({ key: ip });
    if (!success) return json({ error: 'slow down' }, 429, { 'retry-after': '60' });
  }

  const length = Number(request.headers.get('content-length') ?? 0);
  if (!length || length > MAX_BODY) return json({ error: 'bad request' }, 400);
  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const { voter, candidate } = body ?? {};
  if (typeof voter !== 'string' || !VOTER.test(voter) || !CANDIDATES.has(candidate)) return json({ error: 'bad vote' }, 400);

  await env.DB.prepare(
    `INSERT INTO votes (voter, candidate, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(voter) DO UPDATE SET candidate = excluded.candidate, updated_at = excluded.updated_at`,
  ).bind(voter, candidate, Date.now()).run();
  log('log', 'vote', { candidate });
  return json(await totals(env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/casting') return json({ error: 'not found' }, 404);
    try {
      if (request.method === 'GET') return json(await totals(env), 200, { 'cache-control': 'public, max-age=15' });
      if (request.method === 'POST') return await vote(request, env);
      return json({ error: 'method not allowed' }, 405, { allow: 'GET, POST' });
    } catch (err) {
      log('error', 'casting failed', { error: String(err?.message ?? err) });
      return json({ error: 'unavailable' }, 503);
    }
  },
};
