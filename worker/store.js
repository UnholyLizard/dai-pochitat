// D1 access for users, sessions and the chat with Natasha.

import { randomHex, sha256 } from './util.js';

export const SESSION_MS = 30 * 24 * 3600 * 1000;
export const isAdmin = (u) => u?.role === 'owner' || u?.role === 'admin';

/** What the browser may know about a user. */
export const publicUser = (u) => ({
  id: u.id,
  name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `#${u.id}`,
  username: u.username,
  role: u.role,
});

export const findUserByTg = (env, tgId) => env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(tgId).first();

/** Create or refresh a user. The very first row ever inserted becomes the owner (one atomic statement). */
export async function upsertUser(env, from) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (tg_id, first_name, last_name, username, role, created_at, last_login)
     VALUES (?1, ?2, ?3, ?4, CASE WHEN EXISTS (SELECT 1 FROM users) THEN 'user' ELSE 'owner' END, ?5, ?5)
     ON CONFLICT(tg_id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
       username = excluded.username, last_login = excluded.last_login`,
  ).bind(from.id, (from.first_name ?? '').slice(0, 64), (from.last_name ?? '').slice(0, 64), (from.username ?? '').slice(0, 64), now).run();
  return findUserByTg(env, from.id);
}

export async function createSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_MS).run();
  return token;
}

export async function userByToken(env, token) {
  if (!/^[0-9a-f]{64}$/.test(token ?? '')) return null;
  return env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2',
  ).bind(await sha256(token), Date.now()).first();
}

export const dropSession = async (env, token) =>
  env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();

export async function adminsOf(env) {
  const { results } = await env.DB.prepare("SELECT * FROM users WHERE role IN ('owner', 'admin')").all();
  return results;
}

export const saveQuestion = (env, userId, text) =>
  env.DB.prepare("INSERT INTO chat_messages (user_id, dir, text, created_at) VALUES (?, 'in', ?, ?)").bind(userId, text, Date.now()).run();

export const saveReply = (env, userId, text) =>
  env.DB.prepare("INSERT INTO chat_messages (user_id, dir, text, created_at) VALUES (?, 'out', ?, ?)").bind(userId, text.slice(0, 2000), Date.now()).run();

export async function thread(env, userId, after = 0, limit = 100) {
  const { results } = await env.DB.prepare(
    'SELECT id, dir, text, created_at FROM chat_messages WHERE user_id = ?1 AND id > ?2 ORDER BY id ASC LIMIT ?3',
  ).bind(userId, after, limit).all();
  return results;
}
