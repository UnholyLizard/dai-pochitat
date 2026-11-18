// /api/admin/collections* — curated shelves (catalog pills): list with book counts, create, edit, delete.
// Which books belong to a collection is edited per book (books-admin.js, `collections` field).
// Called from adminRoutes after the admin check.

import { json, readJson, log } from './util.js';

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const TEXT = { title_ru: 80, title_en: 80, title_me: 80, description_ru: 500, description_en: 500, description_me: 500 };
const bad = (message) => json({ error: message }, 400);

/** Validate a (possibly partial) collection payload → { values } or { error }. */
function clean(body, { partial }) {
  const v = {};
  for (const [key, max] of Object.entries(TEXT)) {
    if (!(key in body)) continue;
    if (body[key] != null && typeof body[key] !== 'string') return { error: `${key} must be text` };
    v[key] = (body[key] ?? '').trim().slice(0, max);
  }
  if ('slug' in body) {
    const slug = String(body.slug ?? '').trim().toLowerCase();
    if (!SLUG.test(slug)) return { error: 'slug: latin letters, digits and dashes' };
    v.slug = slug;
  }
  if (!partial && !v.slug) return { error: 'slug is required' };
  if (!partial || 'title_ru' in body) {
    if (!v.title_ru) return { error: 'title_ru is required' };
  }
  // The table wants every title; an empty one falls back to Russian.
  for (const k of ['title_en', 'title_me']) if (k in v && !v[k]) v[k] = v.title_ru ?? null;
  return { values: v };
}

async function list(env) {
  const { results } = await env.DB.prepare(
    `SELECT c.*, COUNT(cb.book_id) AS n
       FROM collections c LEFT JOIN collection_books cb ON cb.collection_id = c.id
      GROUP BY c.id ORDER BY c.created_at ASC, c.id ASC`,
  ).all();
  return json({ collections: results ?? [] });
}

async function create(env, body) {
  const { values, error } = clean(body, { partial: false });
  if (error) return bad(error);
  const id = values.slug.replace(/-/g, '_');
  const row = {
    id, slug: values.slug, title_ru: values.title_ru,
    title_en: values.title_en || values.title_ru, title_me: values.title_me || values.title_ru,
    description_ru: values.description_ru || null, description_en: values.description_en || null, description_me: values.description_me || null,
    created_at: Date.now(),
  };
  const cols = Object.keys(row);
  try {
    await env.DB.prepare(`INSERT INTO collections (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map((c) => row[c])).run();
  } catch (err) {
    if (/UNIQUE|PRIMARY/i.test(String(err?.message))) return json({ error: 'a collection with this slug already exists' }, 409);
    throw err;
  }
  log('log', 'collection created', { id });
  return json({ collection: { ...row, n: 0 } }, 201);
}

async function update(env, id, body) {
  const current = await env.DB.prepare('SELECT * FROM collections WHERE id = ?').bind(id).first();
  if (!current) return json({ error: 'not found' }, 404);
  const { values, error } = clean(body, { partial: true });
  if (error) return bad(error);
  const cols = Object.keys(values);
  if (!cols.length) return bad('nothing to update');
  try {
    await env.DB.prepare(`UPDATE collections SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((c) => values[c] || null), id).run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return json({ error: 'a collection with this slug already exists' }, 409);
    throw err;
  }
  log('log', 'collection updated', { id, fields: cols });
  return json({ collection: { ...current, ...values } });
}

async function remove(env, id, url) {
  const current = await env.DB.prepare('SELECT id FROM collections WHERE id = ?').bind(id).first();
  if (!current) return json({ error: 'not found' }, 404);
  // Irreversible for the links: the caller echoes the id, as the UI's confirm dialog does. Books stay.
  if (url.searchParams.get('confirm') !== id) return json({ error: 'confirmation does not match the collection id' }, 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM collection_books WHERE collection_id = ?').bind(id),
    env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(id),
  ]);
  log('log', 'collection deleted', { id });
  return json({ ok: true });
}

/** Returns a Response for /api/admin/collections*, else null. */
export async function collectionsAdminRoutes(request, env, url) {
  const m = url.pathname.match(/^\/api\/admin\/collections(?:\/([^/]+))?$/);
  if (!m) return null;
  let id;
  try {
    id = m[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return bad('bad id');
  }
  const method = request.method;

  if (!id) {
    if (method === 'GET') return list(env);
    if (method === 'POST') {
      const body = await readJson(request, 8192);
      return body ? create(env, body) : bad('bad request');
    }
    return json({ error: 'method not allowed' }, 405);
  }
  if (method === 'PUT' || method === 'PATCH') {
    const body = await readJson(request, 8192);
    return body ? update(env, id, body) : bad('bad request');
  }
  if (method === 'DELETE') return remove(env, id, url);
  return json({ error: 'method not allowed' }, 405);
}
