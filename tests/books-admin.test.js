// Admin book routes ↔ collections, run against the real schema (migration 0002 + 0008) in node:sqlite
// through a minimal D1 shim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { booksAdminRoutes } from '../worker/books-admin.js';
import { collectionsAdminRoutes } from '../worker/collections-admin.js';
import { cachedGet, invalidateCache, catalogVersion } from '../worker/cache.js';
import { SCREEN_COLLECTION, SCREEN_BOOK_IDS } from '../src/content/screen-adaptations.js';

/** The slice of the D1 API the worker uses: prepare().bind().all/first/run and batch(). */
function d1(db) {
  const prepare = (sql) => {
    let args = [];
    const stmt = {
      bind: (...a) => { args = a; return stmt; },
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      first: async () => db.prepare(sql).get(...args) ?? null,
      run: async () => { db.prepare(sql).run(...args); return { success: true }; },
      exec: () => db.prepare(sql).run(...args),
    };
    return stmt;
  };
  return {
    prepare,
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { for (const s of stmts) s.exec(); db.exec('COMMIT'); } catch (err) { db.exec('ROLLBACK'); throw err; }
      return [];
    },
  };
}

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync('migrations/0002_catalog_books.sql', 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY, book_id TEXT, user_id INTEGER, due_date TEXT, returned_at INTEGER)');
  db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, username TEXT)');
  db.exec(`INSERT INTO collections (id, title_ru, title_en, title_me, slug, created_at)
           VALUES ('love_and_warmth', 'Про любовь и семью', 'Love', 'Ljubav', 'love-and-family', 0)`);
  const add = db.prepare(`INSERT INTO books (id, code, title_ru, primary_section, created_at, updated_at) VALUES (?, ?, ?, 'teens', 0, 0)`);
  add.run('груффало-875', 'DP-0875', 'Груффало');
  add.run('матильда-145', 'DP-0145', 'Матильда');
  db.exec(fs.readFileSync('migrations/0008_screen_adaptations_collection.sql', 'utf8'));
  db.exec(fs.readFileSync('migrations/0009_catalog_meta.sql', 'utf8'));
  return { db, env: { DB: d1(db) } };
}

async function call(env, method, path, body) {
  const url = new URL(`https://dp.test${path}`);
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-length'] = String(Buffer.byteLength(init.body)); // set by the Workers runtime, not by Node
  }
  const req = new Request(url, init);
  const res = (await booksAdminRoutes(req, env, url)) ?? (await collectionsAdminRoutes(req, env, url));
  return { status: res.status, data: await res.json() };
}

test('migration 0008 links the screen collection only to books that exist', () => {
  const { db } = setup();
  const linked = db.prepare('SELECT book_id FROM collection_books WHERE collection_id = ?').all(SCREEN_COLLECTION).map((r) => r.book_id);
  assert.deepEqual(linked.sort(), ['груффало-875', 'матильда-145']);
  assert.ok(SCREEN_BOOK_IDS.has('груффало-875'));
});

test('admin list returns per-book collections, counts, and filters by collection', async () => {
  const { env } = setup();
  const all = await call(env, 'GET', '/api/admin/books');
  assert.equal(all.status, 200);
  assert.deepEqual(all.data.books.find((b) => b.id === 'матильда-145').collections, [SCREEN_COLLECTION]);
  assert.equal(all.data.collections.find((c) => c.id === SCREEN_COLLECTION).n, 2);

  const love = await call(env, 'GET', '/api/admin/books?collection=love_and_warmth');
  assert.equal(love.data.total, 0);
  const none = await call(env, 'GET', '/api/admin/books?collection=none');
  assert.equal(none.data.total, 0);
});

test('admin update replaces collections, keeps other fields, and rejects unknown ids', async () => {
  const { env, db } = setup();
  const res = await call(env, 'PUT', '/api/admin/books/матильда-145', { collections: ['love_and_warmth', SCREEN_COLLECTION] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.book.collections, ['love_and_warmth', SCREEN_COLLECTION]);

  const off = await call(env, 'PUT', '/api/admin/books/матильда-145', { collections: ['love_and_warmth'] });
  assert.deepEqual(off.data.book.collections, ['love_and_warmth']);
  assert.equal(db.prepare('SELECT title_ru FROM books WHERE id = ?').get('матильда-145').title_ru, 'Матильда');

  const bad = await call(env, 'PUT', '/api/admin/books/матильда-145', { collections: ['nope'] });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /unknown collections/);

  const untouched = await call(env, 'PUT', '/api/admin/books/матильда-145', { title_ru: 'Матильда!' });
  assert.deepEqual(untouched.data.book.collections, ['love_and_warmth']);
});

test('admin create and GET carry collections', async () => {
  const { env } = setup();
  const made = await call(env, 'POST', '/api/admin/books', {
    title_ru: 'Новая', primary_section: 'teens', ai_translate: false, title_en: 'New', collections: [SCREEN_COLLECTION],
  });
  assert.equal(made.status, 201);
  const got = await call(env, 'GET', `/api/admin/books/${encodeURIComponent(made.data.book.code)}`);
  assert.deepEqual(got.data.book.collections, [SCREEN_COLLECTION]);
});

test('admin moods: known moods are saved, unknown ones rejected', async () => {
  const { env, db } = setup();
  const ok = await call(env, 'PUT', '/api/admin/books/матильда-145', { moods: ['funny', 'magic'] });
  assert.equal(ok.status, 200);
  assert.equal(db.prepare('SELECT moods_json FROM books WHERE id = ?').get('матильда-145').moods_json, '["funny","magic"]');
  const bad = await call(env, 'PUT', '/api/admin/books/матильда-145', { moods: ['sad'] });
  assert.equal(bad.status, 400);
});

test('admin collections: create, rename, duplicate slug, delete keeps books', async () => {
  const { env, db } = setup();
  const made = await call(env, 'POST', '/api/admin/collections', { slug: 'sea-tales', title_ru: 'Про море' });
  assert.equal(made.status, 201);
  assert.equal(made.data.collection.id, 'sea_tales');
  assert.equal(made.data.collection.title_en, 'Про море'); // falls back to Russian

  assert.equal((await call(env, 'POST', '/api/admin/collections', { slug: 'sea-tales', title_ru: 'Ещё' })).status, 409);
  assert.equal((await call(env, 'POST', '/api/admin/collections', { slug: 'Море!', title_ru: 'x' })).status, 400);

  const renamed = await call(env, 'PUT', '/api/admin/collections/sea_tales', { title_en: 'Sea tales' });
  assert.equal(renamed.data.collection.title_en, 'Sea tales');

  await call(env, 'PUT', '/api/admin/books/груффало-875', { collections: ['sea_tales'] });
  const listed = await call(env, 'GET', '/api/admin/collections');
  assert.equal(listed.data.collections.find((c) => c.id === 'sea_tales').n, 1);

  assert.equal((await call(env, 'DELETE', '/api/admin/collections/sea_tales')).status, 409); // no confirmation
  assert.equal((await call(env, 'DELETE', '/api/admin/collections/sea_tales?confirm=sea_tales')).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM collection_books WHERE collection_id = 'sea_tales'").get().n, 0);
  assert.ok(db.prepare('SELECT 1 FROM books WHERE id = ?').get('груффало-875'));
});

test('cache: keys carry the catalog version, and an admin write retires every variant', async () => {
  const { env } = setup();
  const keys = [];
  globalThis.caches = { default: { match: async (req) => { keys.push(req.url); return null; }, put: async () => { }, delete: async () => true } };
  try {
    const request = new Request('https://dp.test/api/books?collection=screen_adaptations&offset=48');
    const handler = async () => new Response('{}', { status: 200 });
    await cachedGet(request, { waitUntil: () => { } }, handler, env);
    const before = await catalogVersion(env);
    await invalidateCache(request.url, [], env);
    const after = await catalogVersion(env);
    await cachedGet(request, { waitUntil: () => { } }, handler, env);
    assert.notEqual(before, after);
    assert.match(keys[0], new RegExp(`__cv=${before}$`));
    assert.match(keys[1], new RegExp(`__cv=${after}$`));
  } finally {
    delete globalThis.caches;
  }
});
