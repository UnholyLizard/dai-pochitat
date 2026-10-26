// /api/admin/books* — catalog management for the owner and admins: list (with hidden statuses),
// create, edit, change status, delete, cover upload, and metadata lookup. Called from adminRoutes
// after the admin check, so every handler here may assume an authenticated admin.

import { json, readJson, log, limited, tooMany } from './util.js';
import { lookup, normalizeIsbn } from './lookup.js';
import { withLoans } from './loans.js';

/** Statuses a reader never sees in the public catalog, Telegram inline search or deep links. */
export const HIDDEN_STATUSES = ['lost', 'archived'];
export const STATUSES = ['available', 'borrowed', 'reserved', 'repair', ...HIDDEN_STATUSES];
const AGE_GROUPS = ['little', 'middle', 'big', 'teen', 'adult'];

const TEXT = {
  title_ru: 300, title_en: 300, title_me: 300,
  author_ru: 200, author_en: 200, author_me: 200,
  illustrator: 200, publisher: 200,
  annotation_ru: 4000, annotation_en: 4000, annotation_me: 4000,
  says_ru: 500, says_en: 500, says_me: 500,
  condition_notes: 500, primary_section: 32, language: 8,
};
const FTS_FIELDS = ['title_ru', 'title_en', 'title_me', 'author_ru', 'author_en', 'author_me', 'annotation_ru'];

const MAX_BODY = 64 * 1024;
const MAX_COVER = 1024 * 1024;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

const bad = (message) => json({ error: message }, 400);

/** Validate a (possibly partial) book payload → { values } of DB columns, or { error }. */
function clean(body, { partial }) {
  const v = {};
  for (const [key, max] of Object.entries(TEXT)) {
    if (!(key in body)) continue;
    if (body[key] != null && typeof body[key] !== 'string') return { error: `${key} must be text` };
    v[key] = (body[key] ?? '').trim().slice(0, max) || null;
  }
  if (!partial || 'title_ru' in body) {
    if (!v.title_ru) return { error: 'title_ru is required' };
  }
  if (!partial || 'primary_section' in body) {
    v.primary_section ||= partial ? undefined : 'adults';
    if (!v.primary_section) return { error: 'primary_section is required' };
  }
  if ('language' in body) v.language ||= 'ru';
  if ('isbn' in body) {
    const raw = String(body.isbn ?? '').trim();
    if (raw && !normalizeIsbn(raw)) return { error: 'isbn is not valid' };
    v.isbn = normalizeIsbn(raw) || null;
  }
  if ('year' in body) {
    const y = body.year === '' || body.year == null ? null : Number(body.year);
    if (y !== null && !(Number.isInteger(y) && y >= 1000 && y <= 2100)) return { error: 'year is not valid' };
    v.year = y;
  }
  for (const key of ['age_min', 'age_max']) {
    if (!(key in body)) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < 0 || n > 99) return { error: `${key} must be 0-99` };
    v[key] = n;
  }
  if ((v.age_min ?? 0) > (v.age_max ?? 99)) return { error: 'age_min is above age_max' };
  if ('age_group' in body) {
    if (!AGE_GROUPS.includes(body.age_group)) return { error: 'age_group is not valid' };
    v.age_group = body.age_group;
  }
  if ('dominant_color' in body) {
    if (body.dominant_color && !/^#[0-9a-fA-F]{6}$/.test(body.dominant_color)) return { error: 'dominant_color must be #rrggbb' };
    v.dominant_color = body.dominant_color || '#2f8a84';
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) return { error: 'status is not valid' };
    v.status = body.status;
  }
  for (const [field, column] of [['moods', 'moods_json'], ['tags', 'tags_json']]) {
    if (!(field in body)) continue;
    if (!Array.isArray(body[field])) return { error: `${field} must be a list` };
    v[column] = JSON.stringify(body[field].map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 20));
  }
  return { values: v };
}

/** Same buckets the public age filter uses. */
const ageGroupFor = (min) => (min >= 16 ? 'adult' : min >= 11 ? 'big' : min >= 7 ? 'middle' : 'little');

async function nextCode(env) {
  const row = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS n FROM books WHERE code LIKE 'DP-%'").first();
  return `DP-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

const findBook = (env, id) => env.DB.prepare('SELECT rowid AS _rowid, * FROM books WHERE id = ?1 OR code = ?1').bind(id).first();
const publicRow = ({ _rowid, ...b }) => b;

function ftsStatements(env, rowidSql, bind, book) {
  return [
    env.DB.prepare(`DELETE FROM books_fts WHERE rowid = ${rowidSql}`).bind(...bind),
    env.DB.prepare(
      `INSERT INTO books_fts (rowid, ${FTS_FIELDS.join(', ')}) VALUES (${rowidSql}, ${FTS_FIELDS.map(() => '?').join(', ')})`,
    ).bind(...bind, ...FTS_FIELDS.map((f) => book[f] ?? '')),
  ];
}

async function list(env, url) {
  const q = (url.searchParams.get('q') ?? '').trim();
  const status = url.searchParams.get('status') ?? '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const where = [];
  const binds = [];
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(`(b.code LIKE ?1 ESCAPE '\\' OR b.isbn LIKE ?1 ESCAPE '\\' OR b.title_ru LIKE ?1 ESCAPE '\\' OR b.title_en LIKE ?1 ESCAPE '\\' OR b.title_me LIKE ?1 ESCAPE '\\' OR b.author_ru LIKE ?1 ESCAPE '\\' OR b.author_en LIKE ?1 ESCAPE '\\' OR b.author_me LIKE ?1 ESCAPE '\\')`);
    binds.push(like);
  }
  if (status === 'hidden') where.push(`b.status IN (${HIDDEN_STATUSES.map((s) => `'${s}'`).join(',')})`);
  else if (STATUSES.includes(status)) where.push(`b.status = ?${binds.push(status)}`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows, total, counts] = await Promise.all([
    env.DB.prepare(`SELECT b.* FROM books b ${clause} ORDER BY b.code ASC LIMIT ${limit} OFFSET ${offset}`).bind(...binds).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM books b ${clause}`).bind(...binds).first(),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM books GROUP BY status').all(),
  ]);
  return json({
    books: await withLoans(env, rows.results ?? []),
    total: total?.n ?? 0,
    limit,
    offset,
    counts: Object.fromEntries((counts.results ?? []).map((r) => [r.status, r.n])),
  });
}

async function create(env, body) {
  const { values, error } = clean(body, { partial: false });
  if (error) return bad(error);

  let code = typeof body.code === 'string' && body.code.trim() ? body.code.trim() : null;
  if (code && !CODE.test(code)) return bad('code is not valid');
  if (code && (await env.DB.prepare('SELECT 1 FROM books WHERE code = ?1 OR id = ?2').bind(code, code.toLowerCase()).first())) {
    return json({ error: 'code already exists' }, 409);
  }
  code ??= await nextCode(env);
  const id = code.toLowerCase();

  const now = Date.now();
  const book = {
    age_min: 0, age_max: 99, age_group: ageGroupFor(values.age_min ?? 0), language: 'ru', status: 'available',
    dominant_color: '#2f8a84', moods_json: '[]', tags_json: '[]',
    ...values, id, code, cover_url: null, created_at: now, updated_at: now,
  };
  const cols = Object.keys(book);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO books (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map((c) => book[c] ?? null)),
      ...ftsStatements(env, '(SELECT rowid FROM books WHERE id = ?)', [id], book),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return json({ error: 'code already exists' }, 409);
    throw err;
  }
  log('log', 'book created', { code });
  return json({ book }, 201);
}

async function update(env, id, body) {
  const current = await findBook(env, id);
  if (!current) return json({ error: 'not found' }, 404);
  const { values, error } = clean(body, { partial: true });
  if (error) return bad(error);
  const cols = Object.keys(values).filter((c) => values[c] !== undefined);
  if (!cols.length) return bad('nothing to update');

  // A book that is out stays 'borrowed' (or goes lost/archived); returning it is done through the loan.
  if (values.status && ['available', 'reserved', 'repair'].includes(values.status) && current.status === 'borrowed'
    && (await env.DB.prepare('SELECT 1 FROM loans WHERE book_id = ? AND returned_at IS NULL').bind(current.id).first())) {
    return json({ error: 'the book is out: return it from the reader first' }, 409);
  }
  const next = { ...publicRow(current), ...values, updated_at: Date.now() };
  if (next.age_min > next.age_max) return bad('age_min is above age_max');
  if ('age_min' in values && !('age_group' in values)) {
    next.age_group = ageGroupFor(next.age_min);
    cols.push('age_group');
  }
  const set = [...cols, 'updated_at'];
  await env.DB.batch([
    env.DB.prepare(`UPDATE books SET ${set.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...set.map((c) => next[c] ?? null), current.id),
    ...ftsStatements(env, '?', [current._rowid], next),
  ]);
  log('log', 'book updated', { code: current.code, fields: cols });
  return json({ book: next });
}

async function remove(env, id, url) {
  const book = await findBook(env, id);
  if (!book) return json({ error: 'not found' }, 404);
  // Deleting is irreversible: the caller must echo the shelf code, as the UI's confirm dialog does.
  if (url.searchParams.get('confirm') !== book.code) return json({ error: 'confirmation does not match the book code' }, 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM books_fts WHERE rowid = ?').bind(book._rowid),
    env.DB.prepare('DELETE FROM collection_books WHERE book_id = ?').bind(book.id),
    env.DB.prepare('DELETE FROM loans WHERE book_id = ?').bind(book.id),
    env.DB.prepare('DELETE FROM books WHERE id = ?').bind(book.id),
  ]);
  if (env.COVERS_BUCKET) {
    await env.COVERS_BUCKET.delete([`covers/${book.code}.webp`, `covers-jpg/${book.code}.jpg`]).catch(() => {});
  }
  log('log', 'book deleted', { code: book.code });
  return json({ ok: true });
}

const isWebp = (b) => b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP';
const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/**
 * Cover upload. The browser has already converted the image to the catalog's formats
 * (WebP ≤600px for the site, JPEG ≤480×720 for Telegram); here they are only verified and stored.
 */
async function uploadCover(request, env, id) {
  if (!env.COVERS_BUCKET) return json({ error: 'storage not configured' }, 503);
  const book = await findBook(env, id);
  if (!book) return json({ error: 'not found' }, 404);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (!length || length > 2 * MAX_COVER + 4096) return bad('cover is too large');

  let form;
  try {
    form = await request.formData();
  } catch {
    return bad('multipart body expected');
  }
  const webp = form.get('webp');
  const jpg = form.get('jpg');
  if (typeof webp === 'string' || typeof jpg === 'string' || !webp || !jpg) return bad('webp and jpg parts are required');
  if (webp.size > MAX_COVER || jpg.size > MAX_COVER) return bad('cover is too large');
  const [w, j] = [new Uint8Array(await webp.arrayBuffer()), new Uint8Array(await jpg.arrayBuffer())];
  if (!isWebp(w) || !isJpeg(j)) return bad('unsupported image format');

  const httpMetadata = (contentType) => ({ contentType, cacheControl: 'public, max-age=31536000, immutable' });
  await Promise.all([
    env.COVERS_BUCKET.put(`covers/${book.code}.webp`, w, { httpMetadata: httpMetadata('image/webp') }),
    env.COVERS_BUCKET.put(`covers-jpg/${book.code}.jpg`, j, { httpMetadata: httpMetadata('image/jpeg') }),
  ]);
  // Covers are served `immutable`, so every replacement gets a fresh URL (?v= is ignored by the R2 lookup).
  const now = Date.now();
  const cover_url = `/covers/${book.code}.webp?v=${now}`;
  await env.DB.prepare('UPDATE books SET cover_url = ?, updated_at = ? WHERE id = ?').bind(cover_url, now, book.id).run();
  return json({ cover_url });
}

async function removeCover(env, id) {
  const book = await findBook(env, id);
  if (!book) return json({ error: 'not found' }, 404);
  await env.DB.prepare('UPDATE books SET cover_url = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), book.id).run();
  if (env.COVERS_BUCKET) await env.COVERS_BUCKET.delete([`covers/${book.code}.webp`, `covers-jpg/${book.code}.jpg`]).catch(() => {});
  return json({ ok: true });
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|\[.*\]|\d{1,3}(\.\d{1,3}){3})$/i;

/** Fetch a remote cover (found by the lookup) so the browser can convert it; same-origin CORS-free. */
async function fetchImage(env, body) {
  const target = URL.parse(String(body.url ?? ''));
  if (!target || target.protocol !== 'https:' || PRIVATE_HOST.test(target.hostname) || target.username || target.password) return bad('https image URL required');
  const res = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 DaiPochitatLibrary/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/') || type.includes('svg')) return json({ error: 'not an image' }, 422);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > 8 * 1024 * 1024) return json({ error: 'image is too large' }, 413);
  return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'no-store' } });
}

/** Returns a Response for /api/admin/books*, /api/admin/lookup and /api/admin/fetch-image, else null. */
export async function booksAdminRoutes(request, env, url) {
  const path = url.pathname;
  const m = path.match(/^\/api\/admin\/books(?:\/([^/]+)(\/cover)?)?$/);
  const isLookup = path === '/api/admin/lookup';
  const isFetch = path === '/api/admin/fetch-image';
  if (!m && !isLookup && !isFetch) return null;
  const method = request.method;

  if (isLookup || isFetch) {
    if (method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (await limited(request, env)) return tooMany();
    const body = await readJson(request, 4096);
    if (!body) return bad('bad request');
    if (isFetch) return fetchImage(env, body);
    const res = await lookup(env, body);
    return res.error ? json(res, res.status ?? 502) : json(res);
  }

  let id;
  try {
    id = m[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return bad('bad id');
  }

  if (!id) {
    if (method === 'GET') return list(env, url);
    if (method === 'POST') {
      const body = await readJson(request, MAX_BODY);
      return body ? create(env, body) : bad('bad request');
    }
    return json({ error: 'method not allowed' }, 405);
  }

  if (m[2]) {
    if (method === 'POST') return uploadCover(request, env, id);
    if (method === 'DELETE') return removeCover(env, id);
    return json({ error: 'method not allowed' }, 405);
  }

  if (method === 'GET') {
    const book = await findBook(env, id);
    return book ? json({ book: publicRow(book) }) : json({ error: 'not found' }, 404);
  }
  if (method === 'PUT' || method === 'PATCH') {
    const body = await readJson(request, MAX_BODY);
    return body ? update(env, id, body) : bad('bad request');
  }
  if (method === 'DELETE') return remove(env, id, url);
  return json({ error: 'method not allowed' }, 405);
}
