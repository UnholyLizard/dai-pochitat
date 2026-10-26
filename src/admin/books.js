// Admin "Книги" tab: list with status filters, add/edit editor with Google Books + Gemini lookup,
// cover conversion (WebP + Telegram JPEG, done in the browser), status changes and confirmed delete.
import { api } from '../lib/api.js';
import { openLoan, initLoanDialog } from './loans.js';
import { fmtDay, todayIso } from './dom.js';

const $ = (sel, root = document) => root.querySelector(sel);

const STATUS = {
  available: 'Доступна', borrowed: 'Выдана', reserved: 'Зарезервирована', repair: 'В ремонте',
  lost: 'Потеряна', archived: 'В архиве',
};
const HIDDEN = new Set(['lost', 'archived']);
const SECTIONS = {
  '0+': '0+', '7-9': '7–9 лет', teens: 'Подросткам', adults: 'Взрослым', classics: 'Классика',
  comics: 'Комиксы и манга', poetry: 'Стихи', me_sr: 'Черногорские / сербские', en: 'English', nonfiction: 'Познавательное',
};
const LANGS = { ru: 'Русский', en: 'English', me: 'Crnogorski', sr: 'Srpski', de: 'Deutsch', fr: 'Français', uk: 'Українська' };
const PAGE = 50;

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}
const options = (map) => Object.entries(map).map(([value, label]) => node('option', { value, textContent: label }));

let ready = false;
let state = { q: '', status: '', offset: 0, total: 0, books: [], counts: {} };
let editing = null; // book being edited, or null for a new one
let pendingCover = null; // { webp: Blob, jpg: Blob } converted but not yet uploaded
let removeCover = false;
let coverPreviewUrl = null;

/* ---------------------------------------------------------------- cover conversion */

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b && b.type === type ? resolve(b) : reject(new Error(`Браузер не умеет ${type}`))), type, quality));
}

/** Same formats as scripts/make-inline-covers.mjs: WebP ≤600 px wide, JPEG ≤480×720 on white. */
async function convertCover(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const draw = (maxW, maxH, background) => {
      const k = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * k));
      canvas.height = Math.max(1, Math.round(bitmap.height * k));
      const ctx = canvas.getContext('2d');
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    };
    const [webp, jpg] = await Promise.all([
      canvasBlob(draw(600, Infinity), 'image/webp', 0.85),
      canvasBlob(draw(480, 720, '#ffffff'), 'image/jpeg', 0.8),
    ]);
    return { webp, jpg };
  } finally {
    bitmap.close();
  }
}

async function setPendingCover(blob) {
  const msg = $('[data-b-lookup-msg]');
  try {
    pendingCover = await convertCover(blob);
    removeCover = false;
    showCover(URL.createObjectURL(pendingCover.webp));
  } catch (err) {
    pendingCover = null;
    msg.textContent = `Не удалось обработать изображение: ${err.message}`;
  }
}

function showCover(src) {
  if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  coverPreviewUrl = src?.startsWith('blob:') ? src : null;
  const img = $('[data-b-cover]');
  img.hidden = !src;
  if (src) img.src = src; else img.removeAttribute('src');
  $('[data-b-cover-clear]').hidden = !src;
}

async function uploadCover(book) {
  if (removeCover && !pendingCover) {
    await api(`/api/admin/books/${encodeURIComponent(book.id)}/cover`, { method: 'DELETE' });
    return;
  }
  if (!pendingCover) return;
  const form = new FormData();
  form.set('webp', pendingCover.webp, `${book.code}.webp`);
  form.set('jpg', pendingCover.jpg, `${book.code}.jpg`);
  const res = await fetch(`/api/admin/books/${encodeURIComponent(book.id)}/cover`, { method: 'POST', body: form, credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'не удалось загрузить обложку');
}

/* ---------------------------------------------------------------- list */

function renderList() {
  const list = $('[data-b-list]');
  list.replaceChildren(...state.books.map((b) => {
    const select = node('select', { 'aria-label': `Статус ${b.code}` }, ...options(STATUS));
    select.value = b.status;
    select.addEventListener('change', async () => {
      try {
        await api(`/api/admin/books/${encodeURIComponent(b.id)}`, { method: 'PUT', body: { status: select.value } });
        await load({ keepOffset: true });
      } catch (err) {
        select.value = b.status;
        alert(`Не получилось: ${err.message}`);
      }
    });
    const edit = node('button', { type: 'button', className: 'ghost', textContent: 'Править' });
    edit.addEventListener('click', () => openEditor(b));
    const cover = node('div', { className: 'thumb' });
    if (b.cover_url) cover.append(node('img', { src: b.cover_url, alt: '', loading: 'lazy' }));
    const title = b.title_ru || b.title_en || b.title_me;
    const author = b.author_ru || b.author_en || b.author_me || '—';
    return node('li', { className: HIDDEN.has(b.status) ? 'is-hidden' : '' },
      cover,
      node('div', { className: 'books__main' },
        node('strong', { textContent: title }),
        node('small', { textContent: `${b.code} · ${author}${b.year ? ` · ${b.year}` : ''}` }),
        ...(b.loan ? [node('small', { className: b.loan.due_date < todayIso() ? 'is-overdue' : '', textContent: `У: ${b.loan.user} · до ${fmtDay(b.loan.due_date)}${b.loan.due_date < todayIso() ? ' · просрочено' : ''}` })] : [])),
      node('span', { className: `badge badge--${b.status}`, textContent: STATUS[b.status] ?? b.status }),
      select, edit);
  }));
  $('[data-b-count]').textContent = state.total
    ? `Показано ${state.books.length} из ${state.total}${HIDDEN.has(state.status) || state.status === 'hidden' ? ' · эти книги не видны читателям' : ''}`
    : 'Ничего не найдено.';
  $('[data-b-more]').hidden = state.books.length >= state.total;
}

function renderStatusFilter() {
  const sel = $('[data-b-status]');
  const all = Object.values(state.counts).reduce((a, b) => a + b, 0);
  const hidden = [...HIDDEN].reduce((a, s) => a + (state.counts[s] ?? 0), 0);
  sel.replaceChildren(
    node('option', { value: '', textContent: `Все статусы (${all})` }),
    node('option', { value: 'hidden', textContent: `Скрытые от читателей (${hidden})` }),
    ...Object.entries(STATUS).map(([v, label]) => node('option', { value: v, textContent: `${label} (${state.counts[v] ?? 0})` })));
  sel.value = state.status;
}

async function load({ more = false, keepOffset = false } = {}) {
  const limit = keepOffset ? Math.max(state.books.length, PAGE) : PAGE;
  const offset = more ? state.books.length : 0;
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (state.q) params.set('q', state.q);
  if (state.status) params.set('status', state.status);
  const data = await api(`/api/admin/books?${params}`);
  state.books = more ? [...state.books, ...data.books] : data.books;
  state.total = data.total;
  state.counts = data.counts;
  renderStatusFilter();
  renderList();
}

/* ---------------------------------------------------------------- editor */

const form = () => $('[data-b-form]');
const field = (name) => form().elements[name];

function fillForm(book) {
  const f = form();
  f.reset();
  for (const el of f.elements) {
    if (!el.name || !(el.name in book) || book[el.name] == null) continue;
    el.value = book[el.name];
  }
  const tags = (() => { try { return JSON.parse(book.tags_json ?? '[]'); } catch { return []; } })();
  field('tags').value = tags.join(', ');
  field('code').disabled = !!book.id; // the shelf code is the identity of an existing book
  if (!book.id) field('code').value = '';
}

function setError(text) {
  const el = $('[data-b-error]');
  el.hidden = !text;
  el.textContent = text ?? '';
}

function openEditor(book) {
  editing = book ?? null;
  pendingCover = null;
  removeCover = false;
  setError(null);
  $('[data-b-lookup-msg]').textContent = '';
  $('[data-b-cands]').replaceChildren();
  fillForm(book ?? { status: 'available', primary_section: 'adults', language: 'ru', age_min: 0, age_max: 99, dominant_color: '#2f8a84' });
  $('[data-b-title]').textContent = book ? `Правка: ${book.code}` : 'Новая книга';
  $('[data-b-delete]').hidden = !book;
  $('[data-b-file]').value = '';
  showCover(book?.cover_url ?? null);
  renderLoanBox(book);
  $('[data-b-editor]').showModal();
}

function renderLoanBox(book) {
  const box = $('[data-b-loan-box]');
  box.hidden = !book;
  if (!book) return;
  const out = book.loan;
  $('[data-b-loan-text]').textContent = out
    ? `Сейчас у: ${out.user} · вернуть до ${fmtDay(out.due_date)}${out.due_date < todayIso() ? ' (просрочено)' : ''}`
    : 'Книга на полке.';
  $('[data-b-loan-return]').hidden = !out;
  $('[data-b-loan-issue]').hidden = !!out || !['available', 'reserved'].includes(book.status);
}

function closeEditor() {
  showCover(null);
  $('[data-b-editor]').close();
}

function payload() {
  const f = form();
  const body = {};
  for (const el of f.elements) {
    if (!el.name || el.type === 'file' || el.disabled) continue;
    body[el.name] = el.value;
  }
  body.tags = body.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (!body.code) delete body.code;
  for (const k of ['year', 'age_min', 'age_max']) if (body[k] === '') delete body[k];
  return body;
}

async function save(e) {
  e.preventDefault();
  setError(null);
  const btn = $('[data-b-save]');
  btn.disabled = true;
  btn.textContent = 'Сохраняю…';
  try {
    const body = payload();
    let book;
    if (editing) {
      ({ book } = await api(`/api/admin/books/${encodeURIComponent(editing.id)}`, { method: 'PUT', body }));
    } else {
      ({ book } = await api('/api/admin/books', { method: 'POST', body }));
      editing = book; // if the cover upload fails, a retry edits this book instead of creating a twin
    }
    try {
      await uploadCover(book);
    } catch (err) {
      setError(`Книга сохранена, но обложка не загрузилась: ${err.message}`);
      await load({ keepOffset: true });
      return;
    }
    closeEditor();
    await load({ keepOffset: true });
  } catch (err) {
    setError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}

/* ---------------------------------------------------------------- lookup (Google Books + Gemini) */

// Only empty fields are filled, so the librarian's own entries are never overwritten.
function applySuggestion(s) {
  const filled = [];
  const set = (name, value) => {
    const el = field(name);
    if (!el || value == null || value === '' || el.value.trim() !== '') return;
    el.value = value;
    el.classList.add('is-suggested');
    filled.push(name);
  };
  for (const name of ['title_ru', 'title_en', 'title_me', 'author_ru', 'author_en', 'author_me', 'illustrator', 'publisher', 'year', 'isbn',
    'annotation_ru', 'annotation_en', 'annotation_me', 'age_min', 'age_max']) set(name, s[name]);
  if (s.language && field('language').value === 'ru' && !editing) field('language').value = s.language in LANGS ? s.language : field('language').value;
  set('tags', (s.tags ?? []).join(', '));
  return filled;
}

async function runLookup() {
  const msg = $('[data-b-lookup-msg]');
  const btn = $('[data-b-lookup]');
  const body = {
    isbn: field('isbn').value,
    publisher: field('publisher').value,
    title: field('title_ru').value || field('title_en').value || field('title_me').value,
    author: field('author_ru').value || field('author_en').value || field('author_me').value,
  };
  if (!body.isbn.trim() && !body.title.trim() && !body.author.trim()) {
    msg.textContent = 'Укажите хотя бы ISBN, название или автора.';
    return;
  }
  btn.disabled = true;
  msg.textContent = 'Ищу в Google Books и спрашиваю Gemini… это до полминуты.';
  $('[data-b-cands]').replaceChildren();
  try {
    const res = await api('/api/admin/lookup', { method: 'POST', body });
    for (const el of form().querySelectorAll('.is-suggested')) el.classList.remove('is-suggested');
    const filled = applySuggestion(res.suggestion);
    const notes = [`Заполнено полей: ${filled.length}. Проверьте их перед сохранением.`];
    if (!res.ai) notes.push('Gemini недоступен — только данные Google Books.');
    if (res.warnings?.length) notes.push(res.warnings.join('; '));
    msg.textContent = notes.join(' ');
    renderCandidates(res.candidates);
  } catch (err) {
    msg.textContent = err.status === 404 ? 'Ничего не нашлось — уточните данные.' : `Ошибка поиска: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function renderCandidates(cands) {
  $('[data-b-cands]').replaceChildren(...cands.filter((c) => c.cover_url).map((c) => {
    const use = node('button', { type: 'button', className: 'ghost', textContent: 'Взять обложку' });
    use.addEventListener('click', async () => {
      use.disabled = true;
      use.textContent = '…';
      try {
        const res = await fetch('/api/admin/fetch-image', {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: c.cover_url }),
        });
        if (!res.ok) throw new Error('не удалось скачать');
        await setPendingCover(await res.blob());
        use.textContent = '✓ Выбрана';
      } catch (err) {
        use.disabled = false;
        use.textContent = `Не вышло: ${err.message}`;
      }
    });
    return node('li', {},
      node('div', { className: 'books__main' },
        node('strong', { textContent: c.title }),
        node('small', { textContent: [c.authors.join(', '), c.publisher, c.year, c.isbn].filter(Boolean).join(' · ') })),
      use);
  }));
}

/* ---------------------------------------------------------------- delete */

function askDelete() {
  if (!editing) return;
  const dlg = $('[data-b-confirm]');
  const input = $('[name="typed"]', dlg);
  input.value = '';
  $('[data-b-confirm-ok]').disabled = true;
  $('[data-b-confirm-code]').textContent = editing.code;
  $('[data-b-confirm-text]').textContent = `«${editing.title_ru}» (${editing.code})`;
  dlg.showModal();
  input.focus();
}

async function doDelete(e) {
  e.preventDefault();
  const ok = $('[data-b-confirm-ok]');
  ok.disabled = true;
  try {
    await api(`/api/admin/books/${encodeURIComponent(editing.id)}?confirm=${encodeURIComponent(editing.code)}`, { method: 'DELETE' });
    $('[data-b-confirm]').close();
    closeEditor();
    await load({ keepOffset: true });
  } catch (err) {
    ok.disabled = false;
    $('[data-b-confirm]').close();
    setError(`Не удалось удалить: ${err.message}`);
  }
}

/* ---------------------------------------------------------------- init */

export async function initBooks() {
  if (ready) return;
  ready = true;
  field('primary_section')?.replaceChildren(...options(SECTIONS));
  field('language')?.replaceChildren(...options(LANGS));
  field('status')?.replaceChildren(...options(STATUS));

  let timer;
  $('[data-b-q]').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value.trim(); load().catch(() => {}); }, 300);
  });
  $('[data-b-status]').addEventListener('change', (e) => { state.status = e.target.value; load().catch(() => {}); });
  $('[data-b-add]').addEventListener('click', () => openEditor(null));
  $('[data-b-more]').addEventListener('click', () => load({ more: true }).catch(() => {}));

  form().addEventListener('submit', save);
  $('[data-b-close]').addEventListener('click', closeEditor);
  $('[data-b-cancel]').addEventListener('click', closeEditor);
  $('[data-b-lookup]').addEventListener('click', runLookup);
  $('[data-b-delete]').addEventListener('click', askDelete);
  initLoanDialog();
  $('[data-b-loan-issue]').addEventListener('click', () => {
    if (!editing) return;
    openLoan({
      book: { id: editing.id, code: editing.code, title: editing.title_ru || editing.title_en || editing.title_me },
      onDone: async () => { closeEditor(); await load({ keepOffset: true }); },
    });
  });
  $('[data-b-loan-return]').addEventListener('click', async () => {
    if (!editing?.loan) return;
    try {
      await api(`/api/admin/loans/${editing.loan.id}/return`, { method: 'POST', body: {} });
      closeEditor();
      await load({ keepOffset: true });
    } catch (err) {
      setError(err.message);
    }
  });
  $('[data-b-file]').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) setPendingCover(f); });
  $('[data-b-cover-clear]').addEventListener('click', () => {
    pendingCover = null;
    removeCover = !!editing?.cover_url;
    $('[data-b-file]').value = '';
    showCover(null);
  });
  form().addEventListener('input', (e) => e.target.classList?.remove('is-suggested'));

  const dlg = $('[data-b-confirm]');
  $('[name="typed"]', dlg).addEventListener('input', (e) => {
    $('[data-b-confirm-ok]').disabled = e.target.value.trim() !== editing?.code;
  });
  $('[data-b-confirm-cancel]').addEventListener('click', () => dlg.close());
  $('[data-b-confirm-form]').addEventListener('submit', doDelete);

  try {
    await load();
  } catch (err) {
    $('[data-b-count]').textContent = `Не удалось загрузить книги: ${err.message}`;
  }
}
