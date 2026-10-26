// /api/admin/users* and /api/admin/loans* — readers, staff notes and book loans for the owner and
// admins. Called from adminRoutes after the role check.
//
// Custom readers (walk-ins without Telegram) have a negative tg_id and cannot sign in.
// "Confirmed" = a library card number (library_no) staff have entered for the reader.

import { json, log, readJson } from './util.js';
import { today, validDate } from './loans.js';

const MAX_BODY = 8192;
const LIBRARY_NO = /^[\p{L}\p{N}][\p{L}\p{N} ./\-№#]{0,31}$/u;
const bad = (error, status = 400) => json({ error }, status);
const nameOf = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `#${u.id}`;

const USER_COLS = 'u.id, u.tg_id, u.first_name, u.last_name, u.username, u.role, u.library_no, u.notes, u.contact, u.created_at, u.last_login';
const present = (u) => ({ ...u, custom: u.tg_id < 0, tg_id: undefined });

/** Validate the editable fields; `custom` readers also own their name (Telegram's name wins otherwise). */
function clean(body, { custom, partial }) {
  const v = {};
  const text = (key, max) => {
    if (!(key in body)) return null;
    if (typeof body[key] !== 'string') return `${key} must be text`;
    v[key] = body[key].trim().slice(0, max);
    return null;
  };
  const errors = [
    custom && text('first_name', 64),
    custom && text('last_name', 64),
    text('contact', 200),
    text('notes', 2000),
  ].filter(Boolean);
  if (errors.length) return { error: errors[0] };
  if (custom && !partial && !v.first_name) return { error: 'first name is required' };
  if (custom && 'first_name' in v && !v.first_name) return { error: 'first name is required' };

  if ('library_no' in body) {
    const no = typeof body.library_no === 'string' ? body.library_no.trim() : body.library_no === null ? '' : null;
    if (no === null) return { error: 'library_no must be text' };
    if (no && !LIBRARY_NO.test(no)) return { error: 'library_no is not valid' };
    v.library_no = no || null;
  }
  return { values: v };
}

async function list(env, url) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
  const binds = [today()];
  let where = '';
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    binds.push(like);
    where = `WHERE (u.first_name || ' ' || u.last_name) LIKE ?2 ESCAPE '\\' OR u.username LIKE ?2 ESCAPE '\\'
                OR u.library_no LIKE ?2 ESCAPE '\\' OR u.contact LIKE ?2 ESCAPE '\\' OR u.notes LIKE ?2 ESCAPE '\\'`;
  }
  const [rows, sum] = await Promise.all([
    env.DB.prepare(
      `SELECT ${USER_COLS},
              (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.returned_at IS NULL) AS open_loans,
              (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.returned_at IS NULL AND l.due_date < ?1) AS overdue
         FROM users u ${where}
        ORDER BY (u.library_no IS NULL), lower(u.first_name || ' ' || u.last_name), u.id LIMIT 1000`,
    ).bind(...binds).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS open, COALESCE(SUM(due_date < ?1), 0) AS overdue FROM loans WHERE returned_at IS NULL`,
    ).bind(today()).first(),
  ]);
  return json({ users: (rows.results ?? []).map(present), summary: { open: sum?.open ?? 0, overdue: sum?.overdue ?? 0 } });
}

async function detail(env, id) {
  const user = await env.DB.prepare(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`).bind(id).first();
  if (!user) return json({ error: 'not found' }, 404);
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.book_id, l.loaned_at, l.due_date, l.returned_at, l.note, b.code, b.title_ru, b.title_en
       FROM loans l JOIN books b ON b.id = l.book_id WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 200`,
  ).bind(id).all();
  return json({ user: present(user), loans: results ?? [], today: today() });
}

async function create(env, body) {
  const { values, error } = clean(body, { custom: true, partial: false });
  if (error) return bad(error);
  const now = Date.now();
  let row;
  try {
    row = await env.DB.prepare(
      `INSERT INTO users (tg_id, first_name, last_name, username, role, library_no, notes, contact, created_at, last_login)
       VALUES (COALESCE((SELECT MIN(tg_id) FROM users WHERE tg_id < 0), 0) - 1, ?1, ?2, '', 'user', ?3, ?4, ?5, ?6, ?6)
       RETURNING id`,
    ).bind(values.first_name, values.last_name ?? '', values.library_no ?? null, values.notes ?? '', values.contact ?? '', now).first();
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return bad('library number is already taken', 409);
    throw err;
  }
  log('log', 'custom reader created', { id: row.id });
  return detail(env, row.id).then(async (r) => json(await r.json(), 201));
}

async function update(env, id, body) {
  const current = await env.DB.prepare('SELECT id, tg_id FROM users WHERE id = ?').bind(id).first();
  if (!current) return json({ error: 'not found' }, 404);
  const { values, error } = clean(body, { custom: current.tg_id < 0, partial: true });
  if (error) return bad(error);
  const cols = Object.keys(values);
  if (!cols.length) return bad('nothing to update');
  try {
    await env.DB.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .bind(...cols.map((c) => values[c]), id).run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return bad('library number is already taken', 409);
    throw err;
  }
  return detail(env, id);
}

async function remove(env, id) {
  const user = await env.DB.prepare('SELECT id, tg_id, (SELECT COUNT(*) FROM loans WHERE user_id = users.id AND returned_at IS NULL) AS open FROM users WHERE id = ?').bind(id).first();
  if (!user) return json({ error: 'not found' }, 404);
  if (user.tg_id > 0) return bad('only custom readers can be deleted', 403);
  if (user.open) return bad('the reader still has books', 409);
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  log('log', 'custom reader deleted', { id });
  return json({ ok: true });
}

async function usersRoutes(request, env, url, m) {
  const method = request.method;
  const id = m[1] ? Number(m[1]) : null;
  if (!id) {
    if (method === 'GET') return list(env, url);
    if (method === 'POST') {
      const body = await readJson(request, MAX_BODY);
      return body ? create(env, body) : bad('bad request');
    }
    return json({ error: 'method not allowed' }, 405);
  }
  if (method === 'GET') return detail(env, id);
  if (method === 'PATCH' || method === 'PUT') {
    const body = await readJson(request, MAX_BODY);
    return body ? update(env, id, body) : bad('bad request');
  }
  if (method === 'DELETE') return remove(env, id);
  return json({ error: 'method not allowed' }, 405);
}

// ── loans ─────────────────────────────────────────────────────────────────────

async function listLoans(env, url) {
  const state = url.searchParams.get('state') ?? 'open';
  const book = url.searchParams.get('book');
  const user = Number(url.searchParams.get('user'));
  const where = [];
  const binds = [today()];
  if (state === 'open' || state === 'overdue') where.push('l.returned_at IS NULL');
  if (state === 'overdue') where.push('l.due_date < ?1');
  if (book) where.push(`l.book_id = ?${binds.push(book)}`);
  if (Number.isInteger(user) && user > 0) where.push(`l.user_id = ?${binds.push(user)}`);
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.book_id, l.user_id, l.loaned_at, l.due_date, l.returned_at, l.note, b.code, b.title_ru, b.title_en,
            u.first_name, u.last_name, u.username
       FROM loans l JOIN books b ON b.id = l.book_id JOIN users u ON u.id = l.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.returned_at IS NOT NULL, l.due_date, l.id DESC LIMIT 200`,
  ).bind(...binds).all();
  return json({
    loans: (results ?? []).map(({ first_name, last_name, username, ...l }) => ({ ...l, user: nameOf({ id: l.user_id, first_name, last_name, username }) })),
    today: today(),
  });
}

async function issue(env, me, body) {
  const bookKey = typeof body.book === 'string' ? body.book.trim() : '';
  const userId = Number(body.user);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
  if (!bookKey || !Number.isInteger(userId)) return bad('book and user are required');
  if (!validDate(body.due_date)) return bad('due_date must be a valid YYYY-MM-DD date');

  const [book, user] = await Promise.all([
    env.DB.prepare('SELECT id, code, status FROM books WHERE id = ?1 OR code = ?1').bind(bookKey).first(),
    env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first(),
  ]);
  if (!book || !user) return json({ error: 'not found' }, 404);
  if (!['available', 'reserved', 'borrowed'].includes(book.status)) return bad(`book is ${book.status}`, 409);

  const now = Date.now();
  try {
    // One batch: if the unique "one open loan per book" index rejects the insert, the status is untouched.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO loans (book_id, user_id, loaned_at, due_date, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(book.id, user.id, now, body.due_date, note, me.id),
      env.DB.prepare("UPDATE books SET status = 'borrowed', updated_at = ? WHERE id = ?").bind(now, book.id),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return bad('the book is already out', 409);
    throw err;
  }
  log('log', 'book issued', { code: book.code, user: user.id });
  return json({ ok: true }, 201);
}

async function giveBack(env, id) {
  const loan = await env.DB.prepare('SELECT id, book_id, returned_at FROM loans WHERE id = ?').bind(id).first();
  if (!loan) return json({ error: 'not found' }, 404);
  if (loan.returned_at) return bad('already returned', 409);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE loans SET returned_at = ? WHERE id = ? AND returned_at IS NULL').bind(now, id),
    env.DB.prepare("UPDATE books SET status = 'available', updated_at = ? WHERE id = ? AND status = 'borrowed'").bind(now, loan.book_id),
  ]);
  log('log', 'book returned', { book: loan.book_id });
  return json({ ok: true });
}

async function extend(env, id, body) {
  const loan = await env.DB.prepare('SELECT id, returned_at FROM loans WHERE id = ?').bind(id).first();
  if (!loan) return json({ error: 'not found' }, 404);
  if (loan.returned_at) return bad('already returned', 409);
  const sets = [];
  const binds = [];
  if ('due_date' in body) {
    if (!validDate(body.due_date)) return bad('due_date must be a valid YYYY-MM-DD date');
    sets.push('due_date = ?');
    binds.push(body.due_date);
  }
  if ('note' in body) {
    if (typeof body.note !== 'string') return bad('note must be text');
    sets.push('note = ?');
    binds.push(body.note.trim().slice(0, 300));
  }
  if (!sets.length) return bad('nothing to update');
  await env.DB.prepare(`UPDATE loans SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  return json({ ok: true });
}

async function loansRoutes(request, env, url, me, m) {
  const method = request.method;
  const id = m[1] ? Number(m[1]) : null;
  if (!id) {
    if (method === 'GET') return listLoans(env, url);
    if (method === 'POST') {
      const body = await readJson(request, MAX_BODY);
      return body ? issue(env, me, body) : bad('bad request');
    }
    return json({ error: 'method not allowed' }, 405);
  }
  if (m[2]) return method === 'POST' ? giveBack(env, id) : json({ error: 'method not allowed' }, 405);
  if (method === 'PATCH') {
    const body = await readJson(request, MAX_BODY);
    return body ? extend(env, id, body) : bad('bad request');
  }
  return json({ error: 'method not allowed' }, 405);
}

/** Returns a Response for /api/admin/users* and /api/admin/loans*, else null. */
export async function usersAdminRoutes(request, env, url, me) {
  const u = url.pathname.match(/^\/api\/admin\/users(?:\/(\d+))?$/);
  if (u) return usersRoutes(request, env, url, u);
  const l = url.pathname.match(/^\/api\/admin\/loans(?:\/(\d+)(\/return)?)?$/);
  if (l) return loansRoutes(request, env, url, me, l);
  return null;
}
