// /api/admin/* — for the owner and admins only.

import { json, readJson, sameOrigin } from './util.js';
import { currentUser } from './account.js';
import { botReady, tg } from './telegram.js';
import { isAdmin, saveReply, thread } from './store.js';
import { booksAdminRoutes } from './books-admin.js';
import { usersAdminRoutes } from './users-admin.js';

const ROLES = new Set(['admin', 'user']);

async function overview(env) {
  const [{ results: users }, { results: threads }, counts] = await Promise.all([
    env.DB.prepare(
      `SELECT id, tg_id, first_name, last_name, username, role, created_at, last_login FROM users ORDER BY id ASC LIMIT 500`,
    ).all(),
    env.DB.prepare(
      `SELECT u.id, u.first_name, u.last_name, u.username, m.text AS last_text, m.dir AS last_dir, m.created_at AS last_at,
              (SELECT COUNT(*) FROM chat_messages c WHERE c.user_id = u.id) AS total
         FROM users u JOIN chat_messages m ON m.id = (SELECT MAX(id) FROM chat_messages WHERE user_id = u.id)
        ORDER BY m.id DESC LIMIT 100`,
    ).all(),
    env.DB.prepare('SELECT (SELECT COUNT(*) FROM votes) AS votes, (SELECT COUNT(*) FROM chat_messages) AS messages').first(),
  ]);
  return { users, threads, votes: counts.votes, messages: counts.messages, bot: { configured: botReady(env), username: env.TG_BOT_USERNAME ?? null } };
}

async function webhookInfo(env) {
  if (!env.TG_BOT_TOKEN) return { configured: false };
  const res = await tg(env, 'getWebhookInfo');
  return { configured: true, ok: !!res.ok, url: res.result?.url ?? '', pending: res.result?.pending_update_count ?? 0, lastError: res.result?.last_error_message ?? null };
}

export async function adminRoutes(request, env, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/admin/')) return null;

  const me = await currentUser(request, env);
  if (!me) return json({ error: 'unauthorized' }, 401);
  if (!isAdmin(me)) return json({ error: 'forbidden' }, 403);
  if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: 'forbidden' }, 403);

  if (path === '/api/admin/overview' && request.method === 'GET') return json({ me: { id: me.id, role: me.role }, ...(await overview(env)) });
  if (path === '/api/admin/webhook' && request.method === 'GET') return json(await webhookInfo(env));

  if (path === '/api/admin/thread' && request.method === 'GET') {
    const id = Number(url.searchParams.get('user'));
    if (!Number.isInteger(id)) return json({ error: 'bad request' }, 400);
    return json({ messages: await thread(env, id, 0, 300) });
  }

  const books = await booksAdminRoutes(request, env, url);
  if (books) return books;
  const readers = await usersAdminRoutes(request, env, url, me);
  if (readers) return readers;

  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const body = await readJson(request, 2048);
  if (!body) return json({ error: 'bad request' }, 400);

  if (path === '/api/admin/reply') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(Number(body.user)).first();
    if (!text || !target) return json({ error: 'bad request' }, 400);
    await saveReply(env, target.id, text);
    return json({ ok: true });
  }

  // The owner alone decides who else receives Natasha's chat.
  if (me.role !== 'owner') return json({ error: 'forbidden' }, 403);

  if (path === '/api/admin/role') {
    const target = await env.DB.prepare('SELECT id, role, tg_id FROM users WHERE id = ?').bind(Number(body.user)).first();
    // Custom readers have no Telegram account, so they can't receive Natasha's chat.
    if (!target || target.role === 'owner' || target.tg_id < 0 || !ROLES.has(body.role)) return json({ error: 'bad request' }, 400);
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, target.id).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/webhook') {
    if (!botReady(env)) return json({ error: 'bot not configured' }, 503);
    const host = request.headers.get('host') ?? url.host;
    const res = await tg(env, 'setWebhook', {
      url: `https://${host}/api/tg/webhook`,
      secret_token: env.TG_WEBHOOK_SECRET,
      allowed_updates: ['message', 'inline_query'],
    });
    // The bot's menu button opens the site as a Mini App (readers are signed in automatically).
    if (res.ok) {
      await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '📚 Библиотека', web_app: { url: `https://${host}/?tgapp=1` } } });
    }
    return json({ ok: !!res.ok, description: res.description ?? null }, res.ok ? 200 : 502);
  }

  return json({ error: 'not found' }, 404);
}
