// Admin "Читатели" tab: readers grouped by confirmed library card, custom (walk-in) readers,
// staff notes, loans per reader.
import { api } from '../lib/api.js';
import { $, node, todayIso, fmtDay, debounce } from './dom.js';
import { openLoan, initLoanDialog } from './loans.js';

const ROLE = { owner: 'владелец', admin: 'админ', user: 'читатель' };
const nameOf = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? `@${u.username}` : `#${u.id}`);
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many);

let ready = false;
let meRole = 'admin';
let state = { q: '', filter: '', users: [], summary: { open: 0, overdue: 0 } };
let editing = null; // { user, loans, today } for an existing reader, null for a new custom one
let onChange = () => {};

const matches = (u) => {
  if (state.filter === 'debt') return u.open_loans > 0;
  if (state.filter === 'overdue') return u.overdue > 0;
  if (state.filter === 'custom') return u.custom;
  return true;
};

function row(u) {
  const bits = [u.library_no ? `№ ${u.library_no}` : null, u.username ? `@${u.username}` : null, u.contact || null].filter(Boolean);
  const badges = [
    node('span', { className: `badge badge--${u.role}`, textContent: ROLE[u.role] }),
    u.custom ? node('span', { className: 'badge', textContent: 'вручную' }) : null,
    u.open_loans ? node('span', { className: 'badge badge--loan', textContent: `${u.open_loans} ${plural(u.open_loans, 'книга', 'книги', 'книг')}` }) : null,
    u.overdue ? node('span', { className: 'badge badge--overdue', textContent: `просрочено: ${u.overdue}` }) : null,
    u.notes ? node('span', { className: 'badge', title: u.notes, textContent: '📝' }) : null,
  ].filter(Boolean);
  const b = node('button', { type: 'button', className: 'reader' },
    node('span', { className: 'reader__main' },
      node('strong', { textContent: nameOf(u) }),
      node('small', { textContent: bits.join(' · ') || 'без контактов' })),
    node('span', { className: 'reader__badges' }, ...badges));
  b.addEventListener('click', () => openEditor(u.id));
  return node('li', {}, b);
}

function group(title, users, className = '') {
  if (!users.length) return null;
  return node('section', { className: `readers ${className}` },
    node('h3', {}, title, node('small', { textContent: ` ${users.length}` })),
    node('ul', {}, ...users.map(row)));
}

function render() {
  const shown = state.users.filter(matches);
  const confirmed = shown.filter((u) => u.library_no);
  const rest = shown.filter((u) => !u.library_no);
  $('[data-stats]').textContent = `Читателей: ${state.users.length} · книг на руках: ${state.summary.open}${state.summary.overdue ? ` · просрочено: ${state.summary.overdue}` : ''}`;
  const list = $('[data-u-list]');
  const parts = [group('С подтверждённым читательским билетом', confirmed, 'readers--card'), group('Без подтверждённого билета', rest)].filter(Boolean);
  list.replaceChildren(...(parts.length ? parts : [node('p', { className: 'note', textContent: 'Никого не найдено.' })]));
}

async function load() {
  const data = await api(`/api/admin/users?q=${encodeURIComponent(state.q)}`);
  state.users = data.users;
  state.summary = data.summary;
  render();
}

/* ---------------------------------------------------------------- editor */

const form = () => $('[data-u-form]');

function setError(text) {
  const el = $('[data-u-error]');
  el.hidden = !text;
  el.textContent = text ?? '';
}

function loanItem(l, { open }) {
  const title = l.title_ru || l.title_en || l.book_id;
  const overdue = open && l.due_date < (editing?.today ?? todayIso());
  const main = node('span', { className: 'loans__main' },
    node('strong', { textContent: `«${title}»` }),
    node('small', { textContent: `${l.code} · выдана ${new Date(l.loaned_at).toLocaleDateString()}${l.returned_at ? ` · возвращена ${new Date(l.returned_at).toLocaleDateString()}` : ''}${l.note ? ` · ${l.note}` : ''}` }));
  if (!open) return node('li', {}, main, node('span', { className: 'note', textContent: `до ${fmtDay(l.due_date)}` }));

  const due = node('input', { type: 'date', value: l.due_date, 'aria-label': 'Вернуть до' });
  due.addEventListener('change', async () => {
    try {
      await api(`/api/admin/loans/${l.id}`, { method: 'PATCH', body: { due_date: due.value } });
      await reloadEditor();
    } catch (err) {
      setError(err.message);
      due.value = l.due_date;
    }
  });
  const back = node('button', { type: 'button', className: 'ghost', textContent: 'Принять' });
  back.addEventListener('click', async () => {
    try {
      await api(`/api/admin/loans/${l.id}/return`, { method: 'POST', body: {} });
      await reloadEditor();
    } catch (err) {
      setError(err.message);
    }
  });
  return node('li', { className: overdue ? 'is-overdue' : '' }, main, due, back);
}

function fill(detail) {
  const { user: u, loans } = detail;
  const f = form();
  f.reset();
  for (const el of f.elements) if (el.name && u[el.name] != null) el.value = u[el.name];
  f.elements.first_name.disabled = !u.custom;
  f.elements.last_name.disabled = !u.custom;
  $('[data-u-tg]').textContent = u.custom
    ? 'Читатель добавлен вручную — войти на сайт он не может.'
    : `Telegram${u.username ? ` @${u.username}` : ''}: имя берётся из Telegram.`;
  $('[data-u-title]').textContent = nameOf(u);
  $('[data-u-delete]').hidden = !u.custom;
  $('[data-u-loans-box]').hidden = false;
  const open = loans.filter((l) => !l.returned_at);
  $('[data-u-loans]').replaceChildren(...open.map((l) => loanItem(l, { open: true })));
  $('[data-u-no-loans]').hidden = open.length > 0;
  $('[data-u-history]').replaceChildren(...loans.filter((l) => l.returned_at).map((l) => loanItem(l, { open: false })));
  const roleBox = $('[data-u-role-box]');
  roleBox.hidden = !(meRole === 'owner' && !u.custom && u.role !== 'owner');
  $('[data-u-role]').textContent = u.role === 'admin' ? 'Снять админа' : 'Сделать админом (получает чат Наташи)';
}

async function reloadEditor() {
  if (!editing) return;
  editing = await api(`/api/admin/users/${editing.user.id}`);
  fill(editing);
  await load();
  await onChange();
}

async function openEditor(id) {
  setError(null);
  if (id == null) {
    editing = null;
    const f = form();
    f.reset();
    f.elements.first_name.disabled = false;
    f.elements.last_name.disabled = false;
    $('[data-u-title]').textContent = 'Новый читатель';
    $('[data-u-tg]').textContent = 'Читатель без Telegram: записывается персоналом, войти на сайт не может.';
    $('[data-u-loans-box]').hidden = true;
    $('[data-u-role-box]').hidden = true;
    $('[data-u-delete]').hidden = true;
  } else {
    editing = await api(`/api/admin/users/${id}`);
    fill(editing);
  }
  $('[data-u-editor]').showModal();
}

async function save(e) {
  e.preventDefault();
  setError(null);
  const btn = $('[data-u-save]');
  btn.disabled = true;
  try {
    const body = {};
    for (const el of form().elements) if (el.name && !el.disabled) body[el.name] = el.value;
    if (editing) await api(`/api/admin/users/${editing.user.id}`, { method: 'PATCH', body });
    else await api('/api/admin/users', { method: 'POST', body });
    $('[data-u-editor]').close();
    await load();
  } catch (err) {
    setError(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function remove() {
  if (!editing || !confirm(`Удалить читателя «${nameOf(editing.user)}» вместе с историей выдач?`)) return;
  try {
    await api(`/api/admin/users/${editing.user.id}`, { method: 'DELETE' });
    $('[data-u-editor]').close();
    await load();
  } catch (err) {
    setError(err.message);
  }
}

async function toggleRole() {
  if (!editing) return;
  const role = editing.user.role === 'admin' ? 'user' : 'admin';
  try {
    await api('/api/admin/role', { method: 'POST', body: { user: editing.user.id, role } });
    await reloadEditor();
  } catch (err) {
    setError(err.message);
  }
}

/** `role` is the signed-in staff member's role; `changed` runs when loans changed (to refresh the overview). */
export function initUsers({ role, changed }) {
  meRole = role;
  onChange = changed ?? (() => {});
  if (ready) { load().catch(() => {}); return; }
  ready = true;
  initLoanDialog();
  $('[data-u-q]').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load().catch(() => {}); }));
  $('[data-u-filter]').addEventListener('change', (e) => { state.filter = e.target.value; render(); });
  $('[data-u-add]').addEventListener('click', () => openEditor(null));
  $('[data-u-close]').addEventListener('click', () => $('[data-u-editor]').close());
  $('[data-u-cancel]').addEventListener('click', () => $('[data-u-editor]').close());
  $('[data-u-form]').addEventListener('submit', save);
  $('[data-u-delete]').addEventListener('click', remove);
  $('[data-u-role]').addEventListener('click', toggleRole);
  $('[data-u-issue]').addEventListener('click', () => {
    if (editing) openLoan({ user: { id: editing.user.id, name: nameOf(editing.user) }, onDone: reloadEditor });
  });
  load().catch((err) => { $('[data-stats]').textContent = `Не удалось загрузить читателей: ${err.message}`; });
}
