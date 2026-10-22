import { bus, $, $$, html, render, artUrl } from '../lib/core.js';
import { t, plural, L } from '../i18n/index.js';
import { game, rankOf } from './state.js';
import { STAMPS, CRITTERS, RANKS } from '../content/game.js';
import { bookById } from '../content/books.js';
import { LIBRARY } from '../content/library.js';
import { sfx } from './sfx.js';

const dialog = $('#passport');
const body = $('[data-passport]');
let seen = new Set(Object.keys(game.state.stamps));

// Each stamp keeps the same jaunty angle on every render.
const tilt = (id) => ((id.charCodeAt(0) * 37 + id.length * 11) % 30) - 15;

function view() {
  const s = game.state;
  const r = rankOf(s.coins);
  const next = RANKS[r + 1];
  const from = RANKS[r];
  const pct = next ? ((s.coins - from) / (next - from)) * 100 : 100;
  const avatar = CRITTERS.find((c) => s.found[c.id]);
  const fresh = new Set(Object.keys(s.stamps).filter((id) => !seen.has(id)));
  seen = new Set(Object.keys(s.stamps));

  return html`
    <header class="pp-head">
      <div class="pp-photo"><img src="${artUrl(avatar ? avatar.art : 'pippi-avatar')}" alt=""></div>
      <div>
        <p class="pp-kicker">${t('passport.kicker', { no: s.cardNo })}</p>
        <h2 class="pp-title" id="passport-title">${t('passport.title')}</h2>
        <label class="pp-name">
          <span class="visually-hidden">${t('passport.name')}</span>
          <input data-pp-name value="${s.name}" placeholder="${t('passport.namePh')}" maxlength="40" autocomplete="given-name">
        </label>
      </div>
    </header>

    <section class="pp-rank">
      <div class="pp-rank__row">
        <span class="pp-rank__name">${t(`rank.${r}`)}</span>
        <span class="pp-rank__coins"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-coin"/></svg>${s.coins} ${plural(s.coins, 'coin')}</span>
      </div>
      <div class="pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="--p:${pct}%"></i></div>
      <p class="pp-rank__next">${next
        ? t('passport.next', { n: next - s.coins, coins: plural(next - s.coins, 'coin'), rank: t(`rank.${r + 1}`) })
        : t('passport.max')}</p>
    </section>

    ${r >= RANKS.length - 1 ? html`
      <section class="pp-secret">
        <span>${t('passport.secret')}</span>
        <b>${L(LIBRARY.secretWord)}</b>
        <span>${t('passport.secretHint')}</span>
      </section>` : ''}

    <section class="pp-section">
      <h3>${t('passport.stamps')}</h3>
      <ul class="pp-stamps">
        ${STAMPS.map(({ id, ink }) => s.stamps[id]
          ? html`<li class="stamp is-earned ${fresh.has(id) ? 'is-new' : ''}" style="--ink-c:${ink};--r:${tilt(id)}deg">${t(`stamp.${id}`)}</li>`
          : html`<li class="stamp" aria-label="?">?</li>`)}
      </ul>
    </section>

    <section class="pp-section">
      <h3>${t('passport.critters')}</h3>
      <ul class="pp-critters">
        ${CRITTERS.map((c) => html`
          <li class="pp-critter ${s.found[c.id] ? 'is-found' : ''}">
            <img src="${artUrl(c.art)}" alt="" width="72" height="72" loading="lazy">
            <span>${s.found[c.id] ? t(`critter.${c.id}.name`) : '?'}</span>
          </li>`)}
      </ul>
    </section>

    <section class="pp-section">
      <h3>${t('passport.wish')}</h3>
      ${s.wish.length
        ? html`<ul class="pp-wish">${s.wish.map((id) => {
            const b = bookById(id);
            return b ? html`<li><span><b>${L(b.title)}</b> — ${L(b.author)}</span><button type="button" data-unwish="${id}">${t('passport.remove')}</button></li>` : '';
          })}</ul>`
        : html`<p class="pp-empty">${t('passport.wishEmpty')}</p>`}
    </section>

    <footer class="pp-foot">
      <span>${t('passport.local')}</span>
      <button type="button" data-pp-reset>${t('passport.reset')}</button>
    </footer>`;
}

function draw() {
  const focused = document.activeElement?.matches?.('[data-pp-name]');
  render(body, view());
  if (focused) {
    const input = $('[data-pp-name]', body);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

export function openPassport() {
  draw();
  if (!dialog.open) dialog.showModal();
  if (Object.keys(game.state.stamps).length) sfx.stamp();
}

export function initPassport() {
  for (const b of $$('[data-open="passport"]')) b.addEventListener('click', openPassport);

  // Light-dismiss fallback where <dialog closedby> isn't supported (Safari).
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
      if (!inside) dialog.close();
    });
  }

  let timer;
  body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-pp-name]')) return;
    clearTimeout(timer);
    timer = setTimeout(() => game.setName(e.target.value), 500);
  });
  body.addEventListener('click', (e) => {
    const un = e.target.closest('[data-unwish]');
    if (un) game.toggleWish(un.dataset.unwish);
    if (e.target.closest('[data-pp-reset]') && confirm(t('passport.resetConfirm'))) game.reset();
  });

  bus.on('game', () => dialog.open && draw());
  bus.on('lang', () => dialog.open && draw());
}
