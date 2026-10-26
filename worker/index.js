// Casting votes, the catalog, Telegram sign-in, Natasha's chat and admin. Only /api/* reaches this Worker
// (assets.run_worker_first); everything else is served straight from ./dist.
//
//   GET  /api/casting                       → { totals: { [candidate]: n }, total }
//   POST /api/casting { voter, candidate }  → same shape; one vote per anonymous voter id,
//                                             which may be changed later.

import { json, log } from './util.js';
import { accountRoutes } from './account.js';
import { adminRoutes } from './admin.js';
import { webhook } from './telegram.js';
import { serveCover } from './covers.js';
import { HIDDEN_STATUSES } from './books-admin.js';
import { withDueDates } from './loans.js';

const CANDIDATES = new Set(['ginger', 'cinder', 'patches', 'mila', 'nika', 'tim', 'marko', 'bookmark']);
const VOTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 512;


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

async function listBooks(url, env) {
  const q = (url.searchParams.get('q') || '').trim();
  const section = url.searchParams.get('section');
  const collection = url.searchParams.get('collection');
  const ageGroup = url.searchParams.get('age_group');
  const age = Number(url.searchParams.get('age'));
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  let sql;
  const binds = [];
  const where = [];

  if (q) {
    const ftsQuery = q.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, ' ').trim().split(/\s+/).filter(Boolean).map((w) => `"${w}"*`).join(' ');
    if (ftsQuery) {
      sql = 'SELECT b.* FROM books_fts f JOIN books b ON b.rowid = f.rowid WHERE books_fts MATCH ?';
      binds.push(ftsQuery);
    }
  }

  if (!sql) {
    sql = 'SELECT b.* FROM books b';
  }

  if (collection) {
    where.push('b.id IN (SELECT book_id FROM collection_books cb JOIN collections c ON c.id = cb.collection_id WHERE c.slug = ? OR c.id = ?)');
    binds.push(collection, collection);
  }
  if (section) {
    where.push('b.primary_section = ?');
    binds.push(section);
  }
  if (ageGroup) {
    if (ageGroup === 'adult') {
      where.push("(b.age_group = 'adult' OR b.age_min >= 16)");
    } else if (ageGroup === 'big' || ageGroup === 'teen') {
      where.push("(b.age_group = 'big' OR (b.age_min >= 11 AND b.age_min < 16))");
    } else {
      where.push('b.age_group = ?');
      binds.push(ageGroup);
    }
  }
  if (!Number.isNaN(age) && age > 0) {
    where.push('b.age_min <= ? AND b.age_max >= ?');
    binds.push(age, age);
  }

  // Lost and archived books are managed from the admin console only.
  where.push(`b.status NOT IN (${HIDDEN_STATUSES.map((s) => `'${s}'`).join(', ')})`);

  if (url.searchParams.get('available') === '1') where.push("b.status = 'available'");

  const lang = url.searchParams.get('lang');
  if (lang) {
    where.push('b.language = ?');
    binds.push(lang);
  }

  const mood = url.searchParams.get('mood');
  if (mood) {
    where.push('b.moods_json LIKE ?');
    binds.push(`%"${mood}"%`);
  }

  if (where.length > 0) {
    sql += (sql.includes('WHERE') ? ' AND ' : ' WHERE ') + where.join(' AND ');
  }

  let countSql = sql.replace('SELECT b.* FROM', 'SELECT COUNT(*) AS total FROM');
  const countBinds = [...binds];

  sql += ' ORDER BY b.code ASC LIMIT ? OFFSET ?';
  binds.push(limit, offset);

  const [booksRes, countRes] = await Promise.all([
    env.DB.prepare(sql).bind(...binds).all(),
    env.DB.prepare(countSql).bind(...countBinds).first(),
  ]);

  const results = await withDueDates(env, booksRes.results || []);
  const total = Number(countRes?.total ?? results.length);

  return json({ books: results, total, limit, offset, count: results.length }, 200, { 'cache-control': 'public, max-age=60, s-maxage=60' });
}

async function getBook(id, env) {
  const book = await env.DB.prepare('SELECT * FROM books WHERE id = ?1 OR code = ?1').bind(id).first();
  if (!book || HIDDEN_STATUSES.includes(book.status)) return json({ error: 'not found' }, 404);
  const [withDue] = await withDueDates(env, [book]);
  return json({ book: withDue }, 200, { 'cache-control': 'public, max-age=60, s-maxage=60' });
}

async function listCollections(env) {
  const { results } = await env.DB.prepare('SELECT * FROM collections ORDER BY id ASC').all();
  return json({ collections: results }, 200, { 'cache-control': 'public, max-age=300, s-maxage=86400' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Book covers served from R2
    if (url.pathname.startsWith('/covers/') || url.pathname.startsWith('/covers-jpg/')) {
      return await serveCover(request, env, ctx);
    }

    // Accounts, Natasha's chat, admin and the Telegram webhook
    if (url.pathname === '/api/tg/webhook' && request.method === 'POST') return webhook(request, env);
    if (url.pathname.startsWith('/api/me') || url.pathname.startsWith('/api/auth/') || url.pathname === '/api/natasha' || url.pathname.startsWith('/api/admin/')) {
      try {
        return (await accountRoutes(request, env, url)) ?? (await adminRoutes(request, env, url)) ?? json({ error: 'not found' }, 404);
      } catch (err) {
        log('error', 'account route failed', { path: url.pathname, error: String(err?.message ?? err) });
        return json({ error: 'unavailable' }, 503);
      }
    }

    // Casting endpoints
    if (url.pathname === '/api/casting') {
      try {
        if (request.method === 'GET') return json(await totals(env), 200, { 'cache-control': 'public, max-age=15' });
        if (request.method === 'POST') return await vote(request, env);
        return json({ error: 'method not allowed' }, 405, { allow: 'GET, POST' });
      } catch (err) {
        log('error', 'casting failed', { error: String(err?.message ?? err) });
        return json({ error: 'unavailable' }, 503);
      }
    }

    // Books catalog endpoints
    if (url.pathname === '/api/books') {
      try {
        if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { allow: 'GET' });
        return await listBooks(url, env);
      } catch (err) {
        log('error', 'listBooks failed', { error: String(err?.message ?? err) });
        return json({ error: 'unavailable' }, 503);
      }
    }

    if (url.pathname.startsWith('/api/books/')) {
      try {
        if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { allow: 'GET' });
        const id = decodeURIComponent(url.pathname.replace('/api/books/', ''));
        return await getBook(id, env);
      } catch (err) {
        log('error', 'getBook failed', { error: String(err?.message ?? err) });
        return json({ error: 'unavailable' }, 503);
      }
    }

    if (url.pathname === '/api/collections') {
      try {
        if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { allow: 'GET' });
        return await listCollections(env);
      } catch (err) {
        log('error', 'listCollections failed', { error: String(err?.message ?? err) });
        return json({ error: 'unavailable' }, 503);
      }
    }

    return json({ error: 'not found' }, 404);
  },
};
