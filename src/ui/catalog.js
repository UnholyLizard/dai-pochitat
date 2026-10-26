// Full physical library catalog browser: shelf view, live FTS search, faceted filters, and book inspector.
import { bus, $, $$, html, render } from '../lib/core.js';
import { t, L, getLang } from '../i18n/index.js';
import { game } from '../game/state.js';
import { sfx } from '../game/sfx.js';
import { send as askLibrarian, open as openLibrarian } from '../librarian/chat.js';
import { BOOKS } from '../content/books.js';

let modal = null;
let drawer = null;
let searchInput = null;
let gridEl = null;
let statusEl = null;
let loadMoreBtn = null;

let state = {
  q: '',
  ageGroup: '',
  mood: '',
  collection: '',
  language: '',
  limit: 24,
  offset: 0,
  total: 0,
  loading: false,
  books: [],
};

let debounceTimer = null;

// Fallback records (BOOKS) keep { ru, en } pairs; API rows have flat *_ru / *_en columns.
function getLocalizedField(b, field) {
  const lang = getLang();
  const value = b[`${field}_${lang}`] || b[`${field}_ru`] || b[field] || '';
  return typeof value === 'object' ? (L(value) ?? '') : value;
}

function getLanguageLabel(code) {
  const lang = getLang();
  const map = {
    ru: { ru: 'Русский', en: 'Английский', me: 'Черногорский' },
    en: { ru: 'Russian', en: 'English', me: 'Montenegrin' },
  };
  return map[lang]?.[code] || map.ru[code] || (code ? code.toUpperCase() : '');
}

function getBookAges(b) {
  if (b.age_min != null) {
    return b.age_max >= 99
      ? t('oracle.agesPlus', { min: b.age_min })
      : t('oracle.ages', { min: b.age_min, max: b.age_max });
  }
  if (b.age) {
    return b.age[1] >= 99
      ? t('oracle.agesPlus', { min: b.age[0] })
      : t('oracle.ages', { min: b.age[0], max: b.age[1] });
  }
  return '';
}

// Covers are inline-free: production CSP blocks inline onload/onerror handlers,
// so the fit class is set from listeners instead.
// Width >= height: show the whole cover, contained and centred. Portrait keeps filling the frame.
function markCover(img) {
  img.classList.toggle('is-fit', img.naturalWidth >= img.naturalHeight);
}

function renderBookCard(b) {
  const title = getLocalizedField(b, 'title');
  const author = getLocalizedField(b, 'author');
  const says = getLocalizedField(b, 'says');
  const ages = getBookAges(b);
  const coverUrl = b.cover_url || b.coverUrl;
  const color = b.dominant_color || b.color || '#3a4a58';
  const wanted = game.state.wish.includes(b.id);
  const langBadge = (b.language || 'ru').toUpperCase();

  return html`
    <article class="catalog-card" data-book-id="${b.id}" style="--dominant:${color}">
      <div class="catalog-card__cover">
        ${coverUrl ? html`<img class="catalog-card__cover-img" src="${coverUrl}" alt="" loading="lazy" decoding="async">` : ''}
        <span class="catalog-card__lang">${langBadge}</span>
        ${ages ? html`<span class="catalog-card__age">${ages}</span>` : ''}
        <button class="catalog-card__wish" type="button" data-wish="${b.id}" aria-pressed="${wanted}" title="${t(wanted ? 'oracle.wanted' : 'oracle.want')}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart"/></svg>
        </button>
      </div>
      <div class="catalog-card__content">
        <h4 class="catalog-card__title">${title}</h4>
        <p class="catalog-card__author">${author}</p>
        ${says ? html`<p class="catalog-card__quote">«${says}»</p>` : ''}
      </div>
    </article>
  `;
}

async function fetchBooks({ reset = false } = {}) {
  if (state.loading) return;
  state.loading = true;

  if (reset) {
    state.offset = 0;
    state.total = 0;
    state.books = [];
    if (gridEl) gridEl.innerHTML = '';
  }

  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.ageGroup) params.set('age_group', state.ageGroup);
  if (state.mood) params.set('mood', state.mood);
  if (state.collection) params.set('collection', state.collection);
  if (state.language) params.set('lang', state.language);
  params.set('limit', String(state.limit));
  params.set('offset', String(state.offset));

  try {
    const res = await fetch(`/api/books?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const newBooks = data.books || [];
    state.total = Number(data.total ?? newBooks.length);
    state.books = reset ? newBooks : [...state.books, ...newBooks];
    state.offset += newBooks.length;
  } catch (err) {
    console.warn('[catalog] API query fallback to local static data:', err);
    // Fallback filter over mock BOOKS
    const filtered = BOOKS.filter((b) => {
      if (state.q) {
        const ql = state.q.toLowerCase();
        const tr = (b.title?.ru || b.title || '').toLowerCase();
        const te = (b.title?.en || '').toLowerCase();
        const ar = (b.author?.ru || b.author || '').toLowerCase();
        if (!tr.includes(ql) && !te.includes(ql) && !ar.includes(ql)) return false;
      }
      if (state.ageGroup && b.ageGroup !== state.ageGroup) return false;
      if (state.mood && !b.moods?.includes(state.mood)) return false;
      if (state.language && (b.language || 'ru') !== state.language) return false;
      return true;
    });
    state.total = filtered.length;
    state.books = filtered.slice(0, state.limit);
    state.offset = state.books.length;
  } finally {
    state.loading = false;
    updateUI();
  }
}

function updateUI() {
  if (!gridEl) return;

  if (state.books.length === 0) {
    render(gridEl, html`
      <div class="catalog-empty">
        <div class="catalog-empty__icon">📚</div>
        <p>${t('catalog.empty')}</p>
        <button class="btn btn--sun btn--small" type="button" data-catalog-reset>${t('catalog.reset')}</button>
      </div>
    `);
    if (statusEl) statusEl.textContent = t('catalog.showing', { shown: 0, total: 0 });
    if (loadMoreBtn) loadMoreBtn.hidden = true;
    return;
  }

  // Render cards
  render(gridEl, html`${state.books.map(renderBookCard)}`);
  for (const img of $$('.catalog-card__cover-img', gridEl)) {
    if (img.complete && img.naturalWidth) markCover(img);
  }

  // Status & Load More
  if (statusEl) {
    statusEl.textContent = t('catalog.showing', { shown: state.books.length, total: state.total });
  }

  if (loadMoreBtn) {
    const hasMore = state.books.length < state.total;
    loadMoreBtn.hidden = !hasMore;
    if (hasMore) {
      const remaining = Math.max(0, state.total - state.books.length);
      loadMoreBtn.textContent = t('catalog.loadMore', { remaining });
    }
  }
}

function openBookDrawer(book) {
  if (!drawer) return;
  const title = getLocalizedField(book, 'title');
  const author = getLocalizedField(book, 'author');
  const annotation = getLocalizedField(book, 'annotation');
  const says = getLocalizedField(book, 'says');
  const ages = getBookAges(book);
  const coverUrl = book.cover_url || book.coverUrl;
  const wanted = game.state.wish.includes(book.id);
  const langLabel = getLanguageLabel(book.language || 'ru');

  let tags;
  try {
    tags = typeof book.tags_json === 'string' ? JSON.parse(book.tags_json) : (book.tags || []);
  } catch {
    tags = [];
  }

  const drawerContent = $('.book-drawer__content', drawer);
  if (!drawerContent) return;

  render(drawerContent, html`
    <button class="book-drawer__close" type="button" data-drawer-close aria-label="${t('catalog.close')}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-close"/></svg>
    </button>
    <div class="book-drawer__left">
      <div class="book-drawer__cover">
        ${coverUrl ? html`<img src="${coverUrl}" alt="" loading="lazy">` : ''}
      </div>
      <div class="book-drawer__actions">
        <button class="btn btn--small btn--wide" type="button" data-wish="${book.id}" aria-pressed="${wanted}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart"/></svg>
          <span>${t(wanted ? 'oracle.wanted' : 'oracle.want')}</span>
        </button>
      </div>
    </div>
    <div class="book-drawer__right">
      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span class="catalog-badge">${ages}</span>
        <span class="book-drawer__lang">🌐 ${langLabel}</span>
      </div>
      <h3 style="margin: 0.5rem 0 0.2rem; font-family: var(--serif, serif); font-size: 1.4rem;">${title}</h3>
      <p style="margin: 0 0 0.85rem; opacity: 0.8; font-weight: 600;">${author}</p>
      
      ${says ? html`<div class="book-drawer__quote">«${says}»</div>` : ''}
      
      ${annotation ? html`<p style="line-height: 1.55; font-size: 0.95rem; opacity: 0.9;">${annotation}</p>` : ''}

      <dl class="book-drawer__meta">
        <dt>${t('catalog.origLang')}</dt><dd>${langLabel}</dd>
        ${book.publisher ? html`<dt>${t('catalog.publisher')}</dt><dd>${book.publisher}</dd>` : ''}
        ${book.year ? html`<dt>${t('catalog.year')}</dt><dd>${book.year}</dd>` : ''}
        ${book.isbn ? html`<dt>${t('catalog.isbn')}</dt><dd>${book.isbn}</dd>` : ''}
        ${book.illustrator ? html`<dt>${t('catalog.illustrator')}</dt><dd>${book.illustrator}</dd>` : ''}
      </dl>

      ${tags.length ? html`
        <div class="book-drawer__tags">
          ${tags.map((tag) => html`<span class="book-drawer__tag">#${tag}</span>`)}
        </div>
      ` : ''}

      <div style="margin-top: 1.5rem;">
        <button class="btn btn--sun" type="button" data-ask-about="${book.id}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-send"/></svg>
          <span>${t('catalog.askAbout')}</span>
        </button>
      </div>
    </div>
  `);

  drawer.removeAttribute('hidden');
}

function closeBookDrawer() {
  if (drawer) drawer.setAttribute('hidden', '');
}

export function openCatalog({ q = '', ageGroup = '', mood = '', collection = '' } = {}) {
  if (!modal) return;
  if (q) state.q = q;
  if (ageGroup) state.ageGroup = ageGroup;
  if (mood) state.mood = mood;
  if (collection) state.collection = collection;

  if (searchInput && q) searchInput.value = q;
  syncFilterPills();

  document.documentElement.classList.add('is-modal-open');
  document.body.classList.add('is-modal-open');

  if (typeof modal.showModal === 'function' && !modal.open) {
    modal.showModal();
  }
  fetchBooks({ reset: true });
}

export function closeCatalog() {
  document.documentElement.classList.remove('is-modal-open');
  document.body.classList.remove('is-modal-open');
  if (modal?.open) modal.close();
  closeBookDrawer();
}

function syncFilterPills() {
  for (const p of $$('[data-age-group]', modal)) {
    p.classList.toggle('is-active', p.dataset.ageGroup === state.ageGroup);
  }
  for (const p of $$('[data-mood]', modal)) {
    p.classList.toggle('is-active', p.dataset.mood === state.mood);
  }
  for (const p of $$('[data-collection]', modal)) {
    p.classList.toggle('is-active', p.dataset.collection === state.collection);
  }
  for (const p of $$('[data-language]', modal)) {
    p.classList.toggle('is-active', p.dataset.language === state.language);
  }

  // Count of active filters stays visible on the toggle while the panel is hidden
  const countEl = $('[data-catalog-filters-count]', modal);
  if (countEl) {
    const active = [state.ageGroup, state.mood, state.collection, state.language].filter(Boolean).length;
    countEl.textContent = String(active);
    countEl.hidden = active === 0;
  }
}

export function initCatalog() {
  modal = $('#catalog');
  if (!modal) return;

  drawer = $('#book-drawer');
  searchInput = $('[data-catalog-search]', modal);
  gridEl = $('[data-catalog-grid]', modal);
  statusEl = $('[data-catalog-status]', modal);
  loadMoreBtn = $('[data-catalog-loadmore]', modal);

  // Global openers
  for (const b of $$('[data-open="catalog"]')) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      openCatalog();
    });
  }

  // Closer
  $('[data-close="catalog"]', modal)?.addEventListener('click', closeCatalog);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCatalog();
  });
  modal.addEventListener('cancel', closeCatalog);

  // Drawer closer
  drawer?.addEventListener('click', (e) => {
    if (e.target === drawer || e.target.closest('[data-drawer-close]')) closeBookDrawer();
  });

  // Keyboard shortcut: '/' opens catalog search
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      openCatalog();
      setTimeout(() => searchInput?.focus(), 50);
    }
  });

  // Search input debounced
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = searchInput.value.trim();
      fetchBooks({ reset: true });
    }, 280);
  });

  // Clear search button
  $('[data-catalog-clear]', modal)?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.q = '';
    fetchBooks({ reset: true });
  });

  // Filter clicks
  modal.addEventListener('click', (e) => {
    const pill = e.target.closest('.catalog-pill');
    if (!pill) return;

    if ('ageGroup' in pill.dataset) {
      state.ageGroup = state.ageGroup === pill.dataset.ageGroup ? '' : pill.dataset.ageGroup;
    } else if ('mood' in pill.dataset) {
      state.mood = state.mood === pill.dataset.mood ? '' : pill.dataset.mood;
    } else if ('collection' in pill.dataset) {
      state.collection = state.collection === pill.dataset.collection ? '' : pill.dataset.collection;
    } else if ('language' in pill.dataset) {
      state.language = state.language === pill.dataset.language ? '' : pill.dataset.language;
    }
    syncFilterPills();
    fetchBooks({ reset: true });
  });

  // Reset all filters button
  modal.addEventListener('click', (e) => {
    if (!e.target.closest('[data-catalog-reset]')) return;
    state.q = '';
    state.ageGroup = '';
    state.mood = '';
    state.collection = '';
    state.language = '';
    if (searchInput) searchInput.value = '';
    syncFilterPills();
    fetchBooks({ reset: true });
  });

  // Load more button
  loadMoreBtn?.addEventListener('click', () => {
    fetchBooks({ reset: false });
  });

  // Cover images: fit mode is decided on load; broken covers are dropped.
  // Capture phase, because load/error do not bubble.
  gridEl?.addEventListener('load', (e) => {
    if (e.target.matches('.catalog-card__cover-img')) markCover(e.target);
  }, true);
  gridEl?.addEventListener('error', (e) => {
    if (e.target.matches('.catalog-card__cover-img')) e.target.remove();
  }, true);

  // Mobile filter toggle: hides the pill rows, keeps the search field
  const filtersToggle = $('[data-catalog-filters-toggle]', modal);
  const filtersPanel = $('[data-catalog-filters]', modal);
  filtersToggle?.addEventListener('click', () => {
    const expanded = filtersToggle.getAttribute('aria-expanded') !== 'true';
    filtersToggle.setAttribute('aria-expanded', String(expanded));
    if (filtersPanel) filtersPanel.hidden = !expanded;
  });

  // Card click -> open detail drawer
  gridEl?.addEventListener('click', (e) => {
    if (e.target.closest('[data-wish]')) return; // let wish handler do its thing
    const card = e.target.closest('[data-book-id]');
    if (!card) return;
    const bookId = card.dataset.bookId;
    const book = state.books.find((b) => b.id === bookId);
    if (book) {
      sfx.rustle?.();
      openBookDrawer(book);
    }
  });

  // Ask about book in drawer -> chat with librarian
  drawer?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ask-about]');
    if (!btn) return;
    const bookId = btn.dataset.askAbout;
    const book = state.books.find((b) => b.id === bookId);
    if (!book) return;

    closeBookDrawer();
    closeCatalog();
    const title = getLocalizedField(book, 'title');
    openLibrarian();
    askLibrarian(t('oracle.askText', { title }));
  });

  // Deep link from the Telegram inline bot: /?book=DP-0001 opens that book's card.
  const wanted = new URLSearchParams(location.search).get('book');
  if (wanted) {
    fetch(`/api/books/${encodeURIComponent(wanted)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.book) return;
        if (!state.books.some((b) => b.id === data.book.id)) state.books.push(data.book);
        openCatalog();
        openBookDrawer(data.book);
      })
      .catch(() => {});
  }

  // Update on language change
  bus.on('lang', () => {
    syncFilterPills();
    updateUI();
  });
}
