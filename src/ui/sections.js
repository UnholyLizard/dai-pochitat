// Content rendered from src/content: the book oracle, event tickets, hours & contacts.
import { bus, $, $$, html, render } from '../lib/core.js';
import { t, L, getLang } from '../i18n/index.js';
import { findBooks } from '../content/books.js';
import { EVENTS } from '../content/events.js';
import { LIBRARY } from '../content/library.js';
import { game } from '../game/state.js';
import { sfx } from '../game/sfx.js';

/* ── A book card (oracle + chat) ───────────────────────────────────────── */
export function bookCard(b, { compact = false } = {}) {
  const curLang = getLang();
  const title = typeof b.title === 'object' ? L(b.title) : (b[`title_${curLang}`] || b.title_ru || b.title || '');
  const author = typeof b.author === 'object' ? L(b.author) : (b[`author_${curLang}`] || b.author_ru || b.author || '');
  const says = typeof b.says === 'object' ? L(b.says) : (b[`says_${curLang}`] || b.says_ru || b.says || '');
  const ages = b.age
    ? (b.age[1] >= 99 ? t('oracle.agesPlus', { min: b.age[0] }) : t('oracle.ages', { min: b.age[0], max: b.age[1] }))
    : (b.age_min != null ? (b.age_max >= 99 ? t('oracle.agesPlus', { min: b.age_min }) : t('oracle.ages', { min: b.age_min, max: b.age_max })) : '');
  const wanted = game.state.wish.includes(b.id);
  const coverUrl = b.cover_url || b.coverUrl;
  const color = b.color || b.dominant_color || '#2f8a84';
  return html`
    <article class="bookcard" data-book="${b.id}">
      <div class="bookcard__cover" style="--c:${color}" aria-hidden="true">
        ${coverUrl ? html`<img class="bookcard__cover-img" src="${coverUrl}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
        <span>${title}</span>
      </div>
      <div>
        <h3>${title}</h3>
        <p class="bookcard__author">${author}</p>
        <span class="bookcard__age">${ages}</span>
        ${says ? html`<p class="bookcard__says">${says}</p>` : ''}
      </div>
      <div class="bookcard__actions">
        ${compact ? '' : html`<button class="btn btn--sun btn--small" type="button" data-oracle-next>${t('oracle.another')}</button>`}
        <button class="btn btn--small" type="button" data-wish="${b.id}" aria-pressed="${wanted}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart"/></svg>
          <span>${t(wanted ? 'oracle.wanted' : 'oracle.want')}</span>
        </button>
        ${compact ? '' : html`<button class="btn btn--ghost btn--small" type="button" data-ask-book="${b.id}">${t('oracle.ask')}</button>`}
      </div>
    </article>`;
}

// Wish-list buttons work wherever a book card appears.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-wish]');
  if (!btn) return;
  const on = game.toggleWish(btn.dataset.wish);
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('span').textContent = t(on ? 'oracle.wanted' : 'oracle.want');
  if (on) sfx.pop();
});

/* ── The magic chest ─────────────────────────────────────────────────────── */
const queues = new Map();
let shown = null;

/** Next book for a filter: cycles through matches in a shuffled order, never repeating back-to-back. */
export function drawBook(age, mood) {
  const key = `${age}|${mood}`;
  let q = queues.get(key);
  if (!q?.length) {
    const pool = findBooks({ age, mood });
    q = pool.map((b) => [Math.random(), b]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    if (q.length > 1 && q[0].id === shown?.id) q.push(q.shift());
    queues.set(key, q);
  }
  shown = q.shift() ?? null;
  return shown;
}

export function initOracle({ onSpin, onAsk }) {
  const form = $('[data-oracle]');
  const out = $('[data-oracle-result]');
  const spin = () => {
    const data = new FormData(form);
    const book = drawBook(data.get('age'), data.get('mood'));
    if (!book) { render(out, html`<p class="pp-empty">${t('oracle.empty')}</p>`); return; }
    render(out, bookCard(book));
    sfx.pop();
    onSpin(book);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); spin(); });
  out.addEventListener('click', (e) => {
    if (e.target.closest('[data-oracle-next]')) spin();
    const ask = e.target.closest('[data-ask-book]');
    if (ask) onAsk(ask.dataset.askBook);
  });
  bus.on('lang', () => { if (shown && out.firstElementChild?.matches('.bookcard')) render(out, bookCard(shown)); });
  return { spin };
}

/* ── Events ────────────────────────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
const icsDate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
};

function downloadIcs(ev) {
  const esc = (s) => s.replace(/([,;\\])/g, '\\$1');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dai pochitat//Library//RU',
    'BEGIN:VEVENT',
    `UID:${ev.id}@dai-pochitat`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART;TZID=Europe/Podgorica:${icsDate(ev.start)}`,
    `DTEND;TZID=Europe/Podgorica:${icsDate(ev.end)}`,
    `SUMMARY:${esc(L(ev.title))}`,
    `DESCRIPTION:${esc(L(ev.text))}`,
    `LOCATION:${esc(L(LIBRARY.address))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${ev.id}.ics` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawEvents() {
  const list = $('[data-events]');
  const locale = getLang() === 'ru' ? 'ru-RU' : 'en-GB';
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const month = new Intl.DateTimeFormat(locale, { month: 'short' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const now = Date.now();
  // Most recent past event first (as a thank-you), then what's coming.
  const past = EVENTS.filter((e) => new Date(e.end) < now).slice(-1);
  const next = EVENTS.filter((e) => new Date(e.end) >= now).slice(0, 2);
  render(list, html`${[...past, ...next].map((ev) => {
    const s = new Date(ev.start), e = new Date(ev.end);
    const isPast = e < now;
    return html`
      <li class="ticket ${isPast ? 'ticket--past' : ''}">
        <div class="ticket__date" aria-hidden="true">
          <span class="ticket__day">${day.format(s)}</span>
          <span class="ticket__month">${month.format(s).replace('.', '')}</span>
        </div>
        <div class="ticket__body">
          <h3>${L(ev.title)}</h3>
          <p class="ticket__meta"><time datetime="${ev.start}">${weekday.format(s)}, ${day.format(s)} ${month.format(s)} · ${time.format(s)}–${time.format(e)}</time> · ${L(ev.ages)}</p>
          <p>${L(ev.text)}</p>
          ${isPast ? '' : html`<button class="btn btn--ghost btn--small" type="button" data-ics="${ev.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-calendar"/></svg>${t('events.add')}</button>`}
        </div>
        ${isPast ? html`<span class="ticket__stamp">${t('events.past')}</span>` : ''}
      </li>`;
  })}`);
}

/* ── Hours & contacts ──────────────────────────────────────────────────── */
function drawFind() {
  render($('[data-hours]'), html`${LIBRARY.hours.map((h) => html`<div><dt>${L(h.days)}</dt><dd>${L(h.time)}</dd></div>`)}`);
  render($('[data-contacts]'), html`
    <a class="btn btn--primary btn--small" href="${LIBRARY.mapsUrl}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-map"/></svg>${t('find.maps')}</a>
    ${LIBRARY.contacts.map((c) => html`<a class="btn btn--small" href="${c.href}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${c.icon}"/></svg>${t(`find.${c.kind}`)}</a>`)}`);
}

export function initSections() {
  drawEvents();
  drawFind();
  $('[data-events]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ics]');
    if (b) downloadIcs(EVENTS.find((x) => x.id === b.dataset.ics));
  });
  bus.on('lang', () => { drawEvents(); drawFind(); });
}

/** Hide keyboard "peek" buttons and the badger once their critter is found, or show all when all are found. */
export function syncCritterButtons() {
  const all = game.isAllFound();
  for (const b of $$('[data-peek]')) b.hidden = !all && game.isFound(b.dataset.peek);
  const badger = $('[data-critter="badger"]');
  if (badger) {
    badger.hidden = !all && game.isFound('badger');
    if (!game.isFound('badger')) badger.style.translate = '';
  }
}
