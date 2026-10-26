import { bus, prefs, $$ } from '../lib/core.js';
import en from './en.js';
import ru from './ru.js';

// Russian copy in index.html is the source of truth; it's harvested at start-up.
// ru.js only holds strings that exist in scripts. en.js mirrors everything.
const dict = { ru: { ...ru }, en };
let lang = document.documentElement.lang === 'en' ? 'en' : 'ru';

const attrPairs = (el) => el.dataset.i18nAttr.split(';').map((p) => p.split(':').map((s) => s.trim()));

// Pages other than the home page name their own title / description keys on <html>.
const titleKey = () => document.documentElement.dataset.titleKey || 'meta.title';
const descKey = () => document.documentElement.dataset.descKey || 'meta.desc';

export const getLang = () => lang;

export function t(key, vars) {
  let s = dict[lang][key] ?? dict.ru[key];
  if (s == null) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing ${lang}:${key}`);
    s = key;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}

/** Plural word: plural(5, 'coin') → «монеток» / "coins". Keys: coin.one|few|many|other */
export function plural(n, base) {
  const form = new Intl.PluralRules(lang).select(n);
  return t(`${base}.${form}`) ?? t(`${base}.other`);
}

/** Pick the current language from a {ru, en} pair (content data). */
export const L = (pair) => (pair && typeof pair === 'object' ? pair[lang] ?? pair.ru : pair);

function apply() {
  const root = document.documentElement;
  root.lang = lang;
  for (const el of $$('[data-i18n]')) {
    const s = t(el.dataset.i18n);
    if (el.innerHTML !== s) el.innerHTML = s;
  }
  for (const el of $$('[data-i18n-attr]')) for (const [attr, key] of attrPairs(el)) el.setAttribute(attr, t(key));
  for (const b of $$('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  document.title = t(titleKey());
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(descKey()));
}

export function setLang(next) {
  if (next === lang || !dict[next]) return;
  lang = next;
  prefs.set('lang', lang);
  apply();
  bus.emit('lang', lang);
}

export function initI18n() {
  for (const el of $$('[data-i18n]')) dict.ru[el.dataset.i18n] ??= el.innerHTML.trim();
  for (const el of $$('[data-i18n-attr]')) for (const [attr, key] of attrPairs(el)) dict.ru[key] ??= el.getAttribute(attr);
  if (import.meta.env.DEV) {
    const missing = Object.keys(dict.ru).filter((k) => !(k in en));
    if (missing.length) console.warn('[i18n] en is missing', missing);
  }
  if (lang !== 'ru') apply();
  else document.title = t(titleKey());
  for (const b of $$('[data-lang]')) b.addEventListener('click', () => setLang(b.dataset.lang));
}
