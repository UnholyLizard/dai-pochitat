// Admin console: Natasha's dialogues, readers and roles, bot status. Owner and admins only.
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/caveat/700.css';
import './admin.css';
import { api } from '../lib/api.js';
import { initBooks } from './books.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const status = $('[data-status]');

const nameOf = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `#${u.id}`;
const fmt = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
const ROLE = { owner: 'владелец', admin: 'админ', user: 'читатель' };

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

let data = null;
let openUser = null;

function showTab(name) {
  for (const b of $$('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
  if (name === 'bot') loadBot();
  if (name === 'books') initBooks();
}

function renderThreads() {
  const list = $('[data-threads]');
  list.replaceChildren(...data.threads.map((t) => {
    const b = node('button', { type: 'button' },
      node('strong', { textContent: nameOf(t) }),
      node('small', { textContent: `${t.last_dir === 'in' ? '' : '↩ '}${t.last_text}` }),
      node('small', { textContent: fmt(t.last_at) }));
    if (t.id === openUser) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => openThread(t.id, nameOf(t)));
    return node('li', {}, b);
  }));
  $('[data-no-threads]').hidden = data.threads.length > 0;
}

async function openThread(id, title) {
  openUser = id;
  $('[data-thread]').hidden = false;
  $('[data-thread-title]').textContent = title;
  const { messages } = await api(`/api/admin/thread?user=${id}`);
  const ol = $('[data-msgs]');
  ol.replaceChildren(...messages.map((m) => node('li', { className: m.dir === 'out' ? 'out' : '' }, m.text, node('time', { textContent: fmt(m.created_at) }))));
  ol.scrollTop = ol.scrollHeight;
  renderThreads();
}

function renderUsers() {
  $('[data-stats]').textContent = `Читателей: ${data.users.length} · сообщений в чате: ${data.messages} · голосов в кастинге: ${data.votes}`;
  const owner = data.me.role === 'owner';
  $('[data-users]').replaceChildren(...data.users.map((u) => {
    const act = node('td');
    if (owner && u.role !== 'owner') {
      const next = u.role === 'admin' ? 'user' : 'admin';
      const b = node('button', { type: 'button', textContent: next === 'admin' ? 'Сделать админом' : 'Снять админа' });
      b.addEventListener('click', async () => {
        await api('/api/admin/role', { method: 'POST', body: { user: u.id, role: next } });
        await load();
      });
      act.append(b);
    }
    return node('tr', {},
      node('td', { textContent: nameOf(u) }),
      node('td', { textContent: u.username ? `@${u.username}` : '—' }),
      node('td', {}, node('span', { className: `badge badge--${u.role}`, textContent: ROLE[u.role] })),
      node('td', { textContent: fmt(u.last_login) }),
      act);
  }));
}

async function loadBot() {
  let hook = { configured: false };
  try { hook = await api('/api/admin/webhook'); } catch { /* shown as not connected */ }
  const rows = [
    [data.bot.configured, data.bot.configured ? `Бот настроен: @${data.bot.username}` : 'Нет TG_BOT_USERNAME / TG_BOT_TOKEN / TG_WEBHOOK_SECRET'],
    [!!hook.url && hook.url.endsWith('/api/tg/webhook'), hook.url ? `Webhook: ${hook.url}` : 'Webhook не подключён'],
  ];
  if (hook.lastError) rows.push([false, `Последняя ошибка Telegram: ${hook.lastError}`]);
  $('[data-checks]').replaceChildren(...rows.map(([ok, text]) => node('li', { className: ok ? 'ok' : '', textContent: text })));
  $('[data-connect]').hidden = data.me.role !== 'owner';
}

async function load() {
  data = await api('/api/admin/overview');
  renderThreads();
  renderUsers();
}

async function init() {
  try {
    await load();
  } catch (err) {
    status.textContent = err.status === 401
      ? 'Войдите на сайте через Telegram, затем вернитесь сюда.'
      : err.status === 403 ? 'Доступ только для владельца и администраторов.' : 'Не удалось загрузить данные.';
    return;
  }
  const me = data.users.find((u) => u.id === data.me.id);
  $('[data-who]').textContent = `${me ? nameOf(me) : ''} · ${ROLE[data.me.role]}`;
  status.hidden = true;
  $('[data-app]').hidden = false;

  for (const b of $$('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('[data-reply]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.text;
    const text = input.value.trim();
    if (!text || !openUser) return;
    input.value = '';
    await api('/api/admin/reply', { method: 'POST', body: { user: openUser, text } });
    await openThread(openUser, $('[data-thread-title]').textContent);
    await load();
  });
  $('[data-connect]').addEventListener('click', async () => {
    const out = $('[data-connect-result]');
    out.textContent = '…';
    try {
      await api('/api/admin/webhook', { method: 'POST', body: {} });
      out.textContent = 'Webhook подключён.';
    } catch (err) {
      out.textContent = `Не получилось: ${err.message}`;
    }
    loadBot();
  });
  setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 15000);
}

init();
