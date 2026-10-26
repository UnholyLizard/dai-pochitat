// "Выдать книгу" dialog, shared by the readers tab (reader known) and the books tab (book known).
import { api } from '../lib/api.js';
import { $, node, todayIso, addDaysIso, debounce } from './dom.js';

const LOAN_DAYS = 14; // the library lends for two weeks (see LIBRARY.loan in src/content/library.js)
const LENDABLE = new Set(['available', 'reserved']);

let ctx = null; // { onDone }
let user = null; // { id, name }
let book = null; // { id, code, title }

const nameOf = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? `@${u.username}` : `#${u.id}`);

function setError(text) {
  const el = $('[data-l-error]');
  el.hidden = !text;
  el.textContent = text ?? '';
}

function refresh() {
  $('[data-l-ok]').disabled = !(user && book);
  $('[data-l-user-fixed]').textContent = user ? `${user.name}` : '';
  $('[data-l-book-fixed]').textContent = book ? `${book.code} · ${book.title}` : '';
  $('[data-l-user-fixed]').hidden = !user;
  $('[data-l-user-pick]').hidden = !!user;
  $('[data-l-book-fixed]').hidden = !book;
  $('[data-l-book-pick]').hidden = !!book;
}

function pickList(list, items) {
  list.replaceChildren(...items);
}

async function searchUsers() {
  const q = $('[data-l-user-q]').value.trim();
  const { users } = await api(`/api/admin/users?q=${encodeURIComponent(q)}`);
  pickList($('[data-l-user-list]'), users.slice(0, 8).map((u) => {
    const b = node('button', { type: 'button', textContent: `${nameOf(u)}${u.library_no ? ` · № ${u.library_no}` : ' · билет не подтверждён'}` });
    b.addEventListener('click', () => { user = { id: u.id, name: nameOf(u) }; refresh(); });
    return node('li', {}, b);
  }));
}

async function searchBooks() {
  const q = $('[data-l-book-q]').value.trim();
  const { books } = await api(`/api/admin/books?q=${encodeURIComponent(q)}&limit=8`);
  pickList($('[data-l-book-list]'), books.map((b) => {
    const ok = LENDABLE.has(b.status);
    const title = b.title_ru || b.title_en || b.title_me;
    const btn = node('button', { type: 'button', disabled: !ok, textContent: `${b.code} · ${title}${ok ? '' : b.loan ? ` — у ${b.loan.user}` : ' — недоступна'}` });
    btn.addEventListener('click', () => { book = { id: b.id, code: b.code, title }; refresh(); });
    return node('li', {}, btn);
  }));
}

/** Open the dialog. Pass `user` and/or `book` when already known; `onDone` runs after a successful loan. */
export function openLoan({ user: u = null, book: b = null, onDone } = {}) {
  ctx = { onDone };
  user = u;
  book = b;
  setError(null);
  $('[data-l-user-q]').value = '';
  $('[data-l-book-q]').value = '';
  pickList($('[data-l-user-list]'), []);
  pickList($('[data-l-book-list]'), []);
  const f = $('[data-l-form]');
  f.elements.due_date.value = addDaysIso(todayIso(), LOAN_DAYS);
  f.elements.note.value = '';
  refresh();
  $('[data-l-dialog]').showModal();
  if (!user) searchUsers().catch(() => {});
  if (!book) searchBooks().catch(() => {});
}

let inited = false;
export function initLoanDialog() {
  if (inited) return;
  inited = true;
  const dlg = $('[data-l-dialog]');
  const close = () => dlg.close();
  $('[data-l-close]').addEventListener('click', close);
  $('[data-l-cancel]').addEventListener('click', close);
  $('[data-l-user-q]').addEventListener('input', debounce(() => searchUsers().catch(() => {})));
  $('[data-l-book-q]').addEventListener('input', debounce(() => searchBooks().catch(() => {})));
  // Tap the chosen reader / book to pick another one.
  $('[data-l-user-fixed]').addEventListener('click', () => { user = null; refresh(); searchUsers().catch(() => {}); });
  $('[data-l-book-fixed]').addEventListener('click', () => { book = null; refresh(); searchBooks().catch(() => {}); });
  $('[data-l-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!user || !book) return;
    const btn = $('[data-l-ok]');
    btn.disabled = true;
    setError(null);
    try {
      await api('/api/admin/loans', {
        method: 'POST',
        body: { book: book.id, user: user.id, due_date: e.target.elements.due_date.value, note: e.target.elements.note.value },
      });
      dlg.close();
      await ctx?.onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}
