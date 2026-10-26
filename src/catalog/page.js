// The /catalog/ page: the whole shelf as a page of its own (no 3D book), light enough for phones.
import '@fontsource-variable/literata/wght.css';
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/caveat/700.css';
import '../styles/main.css';
import '../styles/catalog.css';
import { $, $$, prefs } from '../lib/core.js';
import { initI18n } from '../i18n/index.js';
import { initCatalog } from '../ui/catalog.js';

initI18n();

// Day / evening toggle (the home page's chrome.js drags the scroll-driven book along, so this is its own).
const root = document.documentElement;
const syncTheme = () => {
  const night = root.dataset.theme === 'night';
  $('meta[name="theme-color"]')?.setAttribute('content', night ? '#141a30' : '#f4e8cf');
  for (const b of $$('[data-theme-toggle]')) b.setAttribute('aria-pressed', String(night));
};
syncTheme();
for (const b of $$('[data-theme-toggle]')) {
  b.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'night' ? 'day' : 'night';
    prefs.set('theme', root.dataset.theme);
    syncTheme();
  });
}

// The filters stick right under the header, whatever height it wraps to.
const head = $('.catalog-head');
if (head) new ResizeObserver(() => root.style.setProperty('--catalog-head-h', `${head.offsetHeight}px`)).observe(head);

// "Ask the librarian" lives on the home page, which opens its chat from ?ask=.
initCatalog({ onAsk: (text) => location.assign(`/?ask=${encodeURIComponent(text)}`) });
