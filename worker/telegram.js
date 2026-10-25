// Telegram Bot API: sign-in by bot, the relay to Natasha, and the webhook that receives replies.
//
// Secrets (wrangler secret put …): TG_BOT_TOKEN, TG_WEBHOOK_SECRET. Variable: TG_BOT_USERNAME.

import { json, log, safeEqual } from './util.js';
import { handleInline } from './inline.js';
import { findUserByTg, upsertUser, adminsOf, saveReply, isAdmin } from './store.js';

export const botReady = (env) => !!(env.TG_BOT_TOKEN && env.TG_BOT_USERNAME && env.TG_WEBHOOK_SECRET);

export async function tg(env, method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) log('warn', 'telegram call failed', { method, code: data.error_code, description: data.description });
  return data;
}

const enc = new TextEncoder();
const hmac = async (key, data) => crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(data));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const INIT_DATA_MAX_AGE = 24 * 3600;

/**
 * Check the `initData` a Telegram Mini App was launched with (HMAC-SHA256, key derived from the
 * bot token) and return the Telegram user inside, or null.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyInitData(env, initData) {
  if (!env.TG_BOT_TOKEN || typeof initData !== 'string' || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac(enc.encode('WebAppData'), env.TG_BOT_TOKEN);
  if (!safeEqual(toHex(await hmac(secret, check)), hash)) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > INIT_DATA_MAX_AGE) return null;
  try {
    const user = JSON.parse(params.get('user') ?? '');
    return Number.isInteger(user?.id) && !user.is_bot ? user : null;
  } catch {
    return null;
  }
}

export const displayName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `#${u.id}`;

/** Forward a reader's question to every admin; returns how many chats it reached. */
export async function forwardToNatasha(env, user, text) {
  const admins = await adminsOf(env);
  const handle = user.username ? ` (@${user.username})` : '';
  const header = `💬 ${displayName(user)}${handle} · #${user.id}`;
  const results = await Promise.allSettled(admins.map(async (a) => {
    const res = await tg(env, 'sendMessage', {
      chat_id: a.tg_id,
      text: `${header}\n\n${text}\n\n↩️ Ответьте на это сообщение, чтобы ответ появился в чате на сайте.`,
    });
    if (!res.ok) return false;
    await env.DB.prepare('INSERT OR REPLACE INTO tg_relay (chat_id, tg_message_id, user_id) VALUES (?1, ?2, ?3)')
      .bind(a.tg_id, res.result.message_id, user.id).run();
    return true;
  }));
  return results.filter((r) => r.status === 'fulfilled' && r.value).length;
}

const say = (env, chat_id, text) => tg(env, 'sendMessage', { chat_id, text });

async function loginByBot(env, from, code) {
  const now = Date.now();
  const user = await upsertUser(env, from);
  const res = await env.DB.prepare('UPDATE login_tokens SET user_id = ?1 WHERE code = ?2 AND user_id IS NULL AND expires_at > ?3')
    .bind(user.id, code, now).run();
  if (!res.meta.changes) {
    return say(env, from.id, 'Ссылка устарела. Вернитесь на сайт и нажмите «Войти» ещё раз.\nThis link has expired — please try again on the site.');
  }
  const owner = user.role === 'owner' ? '\n\n👑 Вы вошли первой(-ым), поэтому вы — владелец библиотеки на сайте. Сообщения читателей для Наташи будут приходить сюда.' : '';
  return say(env, from.id, `✅ Готово, ${displayName(user)}! Возвращайтесь на сайт — вход выполнен.\nSigned in — you can go back to the site.${owner}`);
}

async function relayReply(env, from, msg) {
  const row = await env.DB.prepare('SELECT user_id FROM tg_relay WHERE chat_id = ?1 AND tg_message_id = ?2')
    .bind(msg.chat.id, msg.reply_to_message.message_id).first();
  if (!row) return say(env, from.id, 'Не нашла, кому это адресовано. Ответьте именно на сообщение читателя.');
  await saveReply(env, row.user_id, msg.text);
  return tg(env, 'setMessageReaction', {
    chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '👍' }],
  });
}

/** POST /api/tg/webhook */
export async function webhook(request, env) {
  if (!botReady(env) || !safeEqual(request.headers.get('x-telegram-bot-api-secret-token') ?? '', env.TG_WEBHOOK_SECRET)) {
    return json({ error: 'forbidden' }, 403);
  }
  const update = await request.json().catch(() => null);
  if (update?.inline_query) {
    await handleInline(env, update.inline_query, new URL(request.url).origin, tg);
    return json({ ok: true });
  }
  const msg = update?.message;
  // Always answer 200 so Telegram doesn't retry updates we deliberately ignore.
  if (!msg?.from || msg.chat?.type !== 'private' || msg.from.is_bot || typeof msg.text !== 'string') return json({ ok: true });

  try {
    const login = /^\/start(?:@\w+)?\s+login_([0-9a-f]{16,64})$/.exec(msg.text);
    if (login) {
      await loginByBot(env, msg.from, login[1]);
    } else if (msg.text.startsWith('/start')) {
      await say(env, msg.from.id, 'Привет! Это бот библиотеки «Дай почитать!». Чтобы войти на сайт или написать Наташе, нажмите «Войти» на сайте.\nHi! This is the library’s bot — sign in on the website to chat with Natasha.');
    } else {
      const user = await findUserByTg(env, msg.from.id);
      if (user && isAdmin(user) && msg.reply_to_message) await relayReply(env, msg.from, msg);
      else if (user && isAdmin(user)) await say(env, msg.from.id, 'Чтобы ответить читателю, используйте «Ответить» на его сообщение.');
      else await say(env, msg.from.id, 'Написать Наташе можно в чате на сайте — откройте его и выберите «Наташа».');
    }
  } catch (err) {
    log('error', 'webhook failed', { error: String(err?.message ?? err) });
  }
  return json({ ok: true });
}
