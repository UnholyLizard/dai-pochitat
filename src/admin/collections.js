// Admin "Коллекции" tab: curated shelves shown as pills in the catalog. Create, rename, describe, delete;
// "Книги" opens the Книги tab filtered by the collection, where books are added to it one by one.
import { api } from '../lib/api.js';
import { refreshBooks } from './books.js';

const $ = (sel, root = document) => root.querySelector(sel);

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

const FIELDS = ['title_ru', 'title_en', 'title_me', 'slug', 'description_ru', 'description_en', 'description_me'];

let ready = false;
let collections = [];
let editing = null;

const form = () => $('[data-c-form]');

/** Cyrillic title → a URL slug suggestion (the librarian can change it before saving). */
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = (text) => String(text).toLowerCase()
  .replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');

function render() {
  $('[data-c-list]').replaceChildren(...collections.map((c) => {
    const books = node('button', { type: 'button', className: 'ghost', textContent: `Книги (${c.n ?? 0})` });
    books.addEventListener('click', async () => {
      await refreshBooks({ collection: c.id });
      document.querySelector('[data-tab="books"]')?.click();
    });
    const edit = node('button', { type: 'button', className: 'ghost', textContent: 'Править' });
    edit.addEventListener('click', () => openEditor(c));
    const link = node('a', { href: `/catalog/?collection=${encodeURIComponent(c.id)}`, target: '_blank', rel: 'noopener', textContent: 'в каталоге ↗' });
    return node('li', {},
      node('div', { className: 'thumb thumb--coll', textContent: String(c.n ?? 0) }),
      node('div', { className: 'books__main' },
        node('strong', { textContent: c.title_ru }),
        node('small', { textContent: [c.title_en !== c.title_ru ? c.title_en : '', c.slug].filter(Boolean).join(' · ') }),
        ...(c.description_ru ? [node('small', { textContent: c.description_ru })] : [])),
      link, books, edit);
  }));
  $('[data-c-count]').textContent = collections.length ? `Коллекций: ${collections.length}` : 'Коллекций пока нет.';
}

async function load() {
  ({ collections } = await api('/api/admin/collections'));
  render();
}

function setError(text) {
  const el = $('[data-c-error]');
  el.hidden = !text;
  el.textContent = text ?? '';
}

function openEditor(c) {
  editing = c ?? null;
  const f = form();
  f.reset();
  for (const k of FIELDS) f.elements[k].value = c?.[k] ?? '';
  f.elements.slug.dataset.touched = c ? '1' : '';
  $('[data-c-title]').textContent = c ? `Коллекция: ${c.title_ru}` : 'Новая коллекция';
  $('[data-c-delete]').hidden = !c;
  setError(null);
  $('[data-c-editor]').showModal();
}

async function save(e) {
  e.preventDefault();
  setError(null);
  const f = form();
  const body = Object.fromEntries(FIELDS.map((k) => [k, f.elements[k].value.trim()]));
  const btn = $('[data-c-save]');
  btn.disabled = true;
  try {
    if (editing) await api(`/api/admin/collections/${encodeURIComponent(editing.id)}`, { method: 'PUT', body });
    else await api('/api/admin/collections', { method: 'POST', body });
    $('[data-c-editor]').close();
    await load();
    await refreshBooks(); // the book editor's collection picks and the list filter
  } catch (err) {
    setError(err.message);
  } finally {
    btn.disabled = false;
  }
}

function askDelete() {
  if (!editing) return;
  const dlg = $('[data-c-confirm]');
  const input = $('[name="typed"]', dlg);
  input.value = '';
  $('[data-c-confirm-ok]').disabled = true;
  $('[data-c-confirm-code]').textContent = editing.id;
  $('[data-c-confirm-text]').textContent = `«${editing.title_ru}» — книг в ней: ${editing.n ?? 0}`;
  dlg.showModal();
  input.focus();
}

async function doDelete(e) {
  e.preventDefault();
  const ok = $('[data-c-confirm-ok]');
  ok.disabled = true;
  try {
    await api(`/api/admin/collections/${encodeURIComponent(editing.id)}?confirm=${encodeURIComponent(editing.id)}`, { method: 'DELETE' });
    $('[data-c-confirm]').close();
    $('[data-c-editor]').close();
    await load();
    await refreshBooks({ collection: '' });
  } catch (err) {
    $('[data-c-confirm]').close();
    setError(`Не удалось удалить: ${err.message}`);
  }
}

export async function initCollections() {
  if (ready) { await load().catch(() => { }); return; }
  ready = true;
  const f = form();
  f.addEventListener('submit', save);
  // A new collection's slug follows its Russian title until the librarian edits the slug by hand.
  f.elements.title_ru.addEventListener('input', () => {
    if (!f.elements.slug.dataset.touched) f.elements.slug.value = slugify(f.elements.title_ru.value);
  });
  f.elements.slug.addEventListener('input', () => { f.elements.slug.dataset.touched = '1'; });
  $('[data-c-add]').addEventListener('click', () => openEditor(null));
  $('[data-c-close]').addEventListener('click', () => $('[data-c-editor]').close());
  $('[data-c-cancel]').addEventListener('click', () => $('[data-c-editor]').close());
  $('[data-c-delete]').addEventListener('click', askDelete);
  const dlg = $('[data-c-confirm]');
  $('[name="typed"]', dlg).addEventListener('input', (e) => { $('[data-c-confirm-ok]').disabled = e.target.value.trim() !== editing?.id; });
  $('[data-c-confirm-cancel]').addEventListener('click', () => dlg.close());
  $('[data-c-confirm-form]').addEventListener('submit', doDelete);
  try {
    await load();
  } catch (err) {
    $('[data-c-count]').textContent = `Не удалось загрузить коллекции: ${err.message}`;
  }
}
