// /api/me, /api/auth/*, /api/natasha — the signed-in reader's side.

import { json, readJson, sameOrigin, randomHex, sha256, safeEqual, limited, tooMany } from './util.js';
import { botReady, forwardToNatasha, verifyInitData, verifyWidgetAuth } from './telegram.js';
import {
  createSession, userByToken, upsertUser, dropSession, publicUser, saveQuestion, thread, SESSION_MS,
} from './store.js';

const COOKIE = 'dp_sid';
const LOGIN_MS = 10 * 60 * 1000;
const MAX_GAME = 20_000;

const tokenOf = (request) => /(?:^|;\s*)dp_sid=([0-9a-f]+)/.exec(request.headers.get('cookie') ?? '')?.[1];

function setCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export const currentUser = (request, env) => userByToken(env, tokenOf(request));

const parseGame = (u) => {
  try { return u.game_json ? JSON.parse(u.game_json) : null; } catch { return null; }
};

async function startLogin(request, env) {
  if (!botReady(env)) return json({ error: 'login unavailable' }, 503);
  const now = Date.now();
  await env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now).run();
  const code = randomHex(12);
  const secret = randomHex(24);
  await env.DB.prepare('INSERT INTO login_tokens (code, secret_hash, expires_at) VALUES (?, ?, ?)')
    .bind(code, await sha256(secret), now + LOGIN_MS).run();
  return json({ code, secret, url: `https://t.me/${env.TG_BOT_USERNAME}?start=login_${code}`, expiresIn: LOGIN_MS / 1000 });
}

async function pollLogin(request, env) {
  const body = await readJson(request);
  if (typeof body?.code !== 'string' || typeof body?.secret !== 'string') return json({ error: 'bad request' }, 400);
  const row = await env.DB.prepare('SELECT * FROM login_tokens WHERE code = ?').bind(body.code).first();
  if (!row || row.expires_at < Date.now() || !safeEqual(row.secret_hash, await sha256(body.secret))) return json({ status: 'expired' });
  if (!row.user_id) return json({ status: 'pending' });

  // One-shot: the row is consumed by whoever presents the secret first.
  const gone = await env.DB.prepare('DELETE FROM login_tokens WHERE code = ?').bind(row.code).run();
  if (!gone.meta.changes) return json({ status: 'expired' });
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
  const token = await createSession(env, user.id);
  return json({ status: 'ok', user: publicUser(user), game: parseGame(user) }, 200, {
    'set-cookie': setCookie(request, token, SESSION_MS / 1000),
  });
}

/** Mini App auto-login: the launch data is signed by Telegram, so no tap in the bot is needed. */
async function webappLogin(request, env) {
  const body = await readJson(request, 5000);
  const from = await verifyInitData(env, body?.initData);
  if (!from) return json({ error: 'bad init data' }, 401);
  const user = await upsertUser(env, from);
  const token = await createSession(env, user.id);
  return json({ status: 'ok', user: publicUser(user), game: parseGame(user) }, 200, {
    'set-cookie': setCookie(request, token, SESSION_MS / 1000),
  });
}

/** Official Telegram Login Widget: verifies SHA256(bot_token) signature. */
async function widgetLogin(request, env) {
  const body = await readJson(request, 4096);
  const from = await verifyWidgetAuth(env, body);
  if (!from) return json({ error: 'bad widget auth' }, 401);
  const user = await upsertUser(env, from);
  const token = await createSession(env, user.id);
  return json({ status: 'ok', user: publicUser(user), game: parseGame(user) }, 200, {
    'set-cookie': setCookie(request, token, SESSION_MS / 1000),
  });
}

/** Create a short-lived single-use handoff code so readers in Telegram Mini App can open their browser signed in. */
async function createHandoff(request, env, user) {
  const code = randomHex(16);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO login_tokens (code, secret_hash, user_id, expires_at) VALUES (?, ?, ?, ?)')
    .bind(code, 'handoff', user.id, now + 5 * 60 * 1000).run();
  return json({ code });
}

/** Redeem a handoff code in the external browser. */
async function exchangeHandoff(request, env) {
  const body = await readJson(request, 1024);
  if (typeof body?.code !== 'string' || !/^[0-9a-f]{32}$/.test(body.code)) return json({ error: 'bad request' }, 400);
  const row = await env.DB.prepare('SELECT user_id FROM login_tokens WHERE code = ? AND secret_hash = ? AND expires_at > ?')
    .bind(body.code, 'handoff', Date.now()).first();
  if (!row) return json({ error: 'expired' }, 401);
  await env.DB.prepare('DELETE FROM login_tokens WHERE code = ?').bind(body.code).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
  if (!user) return json({ error: 'user not found' }, 404);
  const token = await createSession(env, user.id);
  return json({ status: 'ok', user: publicUser(user), game: parseGame(user) }, 200, {
    'set-cookie': setCookie(request, token, SESSION_MS / 1000),
  });
}

async function logout(request, env) {
  const token = tokenOf(request);
  if (token) await dropSession(env, token);
  return json({ ok: true }, 200, { 'set-cookie': setCookie(request, '', 0) });
}

async function saveGame(request, env, user) {
  const body = await readJson(request, MAX_GAME);
  if (!body?.game || typeof body.game !== 'object' || Array.isArray(body.game)) return json({ error: 'bad request' }, 400);
  await env.DB.prepare('UPDATE users SET game_json = ? WHERE id = ?').bind(JSON.stringify(body.game), user.id).run();
  return json({ ok: true });
}

async function natasha(request, env, user) {
  if (request.method === 'GET') {
    const after = Math.max(Number(new URL(request.url).searchParams.get('after')) || 0, 0);
    return json({ messages: await thread(env, user.id, after) });
  }
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, { allow: 'GET, POST' });
  if (await limited(request, env, 'CHAT_LIMIT')) return tooMany();
  const body = await readJson(request, 1024);
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 500) : '';
  if (!text) return json({ error: 'empty' }, 400);
  const saved = await saveQuestion(env, user.id, text);
  const delivered = botReady(env) ? await forwardToNatasha(env, user, text) : 0;
  return json({ id: saved.meta.last_row_id, delivered });
}

/** Returns a Response for account routes, or null when the path isn't one of ours. */
export async function accountRoutes(request, env, url) {
  const path = url.pathname;
  const post = request.method === 'POST';
  if (path === '/api/me' && request.method === 'GET') {
    const user = await currentUser(request, env);
    return json({
      user: user ? publicUser(user) : null,
      game: user ? parseGame(user) : null,
      login: botReady(env),
      botUsername: env.TG_BOT_USERNAME ?? null,
    });
  }
  if (!path.startsWith('/api/auth/') && path !== '/api/me/game' && path !== '/api/natasha') return null;

  if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: 'forbidden' }, 403);

  if (path === '/api/auth/start' && post) return (await limited(request, env)) ? tooMany() : startLogin(request, env);
  if (path === '/api/auth/webapp' && post) return (await limited(request, env)) ? tooMany() : webappLogin(request, env);
  if (path === '/api/auth/widget' && post) return (await limited(request, env)) ? tooMany() : widgetLogin(request, env);
  if (path === '/api/auth/handoff/exchange' && post) return (await limited(request, env)) ? tooMany() : exchangeHandoff(request, env);
  if (path === '/api/auth/poll' && post) return pollLogin(request, env);
  if (path === '/api/auth/logout' && post) return logout(request, env);

  const user = await currentUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (path === '/api/auth/handoff/create' && post) return createHandoff(request, env, user);
  if (path === '/api/me/game' && request.method === 'PUT') return saveGame(request, env, user);
  if (path === '/api/natasha') return natasha(request, env, user);
  return json({ error: 'not found' }, 404);
}
