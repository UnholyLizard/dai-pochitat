import { bus, $, $$, html, render, raw, artUrl } from '../lib/core.js';
import { t, plural, L, getLang } from '../i18n/index.js';
import { game, rankOf } from './state.js';
import { STAMPS, CRITTERS, RANKS } from '../content/game.js';
import { bookById, resolveBook } from '../content/books.js';
import { LIBRARY } from '../content/library.js';
import { sfx } from './sfx.js';
import { auth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { toast, imgIcon, coinIcon } from './feedback.js';

const dialog = $('#passport');
const body = $('[data-passport]');
let seen = new Set(Object.keys(game.state.stamps));
let activeCritterId = null;
let confirmingReset = false;
let loans = []; // the signed-in reader's books on loan (empty when anonymous)

const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'long' });
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Podgorica' }).format(new Date());

// Hearts come from the whole catalogue, so look up any title the suggestion pool doesn't know.
async function resolveWishes() {
  const missing = game.state.wish.filter((id) => !bookById(id));
  if (!missing.length) return;
  await Promise.all(missing.map(resolveBook));
  if (dialog.open) draw();
}

async function loadLoans() {
  if (!auth.user) { loans = []; return; }
  try { loans = (await api('/api/me/loans')).loans; } catch { loans = []; }
  if (dialog.open) draw();
}

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
  const activeCritter = (activeCritterId && s.found[activeCritterId]) ? CRITTERS.find((c) => c.id === activeCritterId) : null;

  return html`
    <header class="pp-head">
      <div class="pp-photo"><img src="${artUrl(avatar ? avatar.art : 'ginger-avatar')}" alt=""></div>
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

    ${loans.length ? html`
    <section class="pp-section">
      <h3>${t('passport.loans')}</h3>
      <ul class="pp-loans">
        ${loans.map((l) => html`<li class="${l.due_date < todayIso() ? 'is-overdue' : ''}"><b>${(getLang() === 'en' ? l.title_en : l.title_ru) || l.title_ru || l.title_en || l.title_me}</b><span>${t('passport.loanDue', { date: day(l.due_date) })}</span></li>`)}
      </ul>
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
        ${CRITTERS.map((c) => {
          const found = !!s.found[c.id];
          return found
            ? html`
              <li class="pp-critter is-found">
                <button type="button" class="pp-critter__btn ${activeCritterId === c.id ? 'is-active' : ''}" data-pp-critter="${c.id}" aria-label="${t(`critter.${c.id}.name`)}">
                  <img src="${artUrl(c.art)}" alt="" width="72" height="72" loading="lazy">
                  <span class="pp-critter__name">${t(`critter.${c.id}.name`)}</span>
                </button>
              </li>`
            : html`
              <li class="pp-critter pp-critter--locked" aria-label="${t('passport.critters')}">
                <div class="pp-critter__placeholder" aria-hidden="true">
                  <span class="pp-critter__mark">?</span>
                </div>
                <span class="pp-critter__name pp-critter__name--locked">?</span>
              </li>`;
        })}
      </ul>
      ${activeCritter ? html`
        <div class="pp-critter-card" role="region" aria-live="polite">
          <img src="${artUrl(activeCritter.art)}" alt="" class="pp-critter-card__img" width="56" height="56">
          <div class="pp-critter-card__text">
            <h4>${t(`critter.${activeCritter.id}.name`)}</h4>
            <p>${t(`critter.${activeCritter.id}.fact`)}</p>
          </div>
          <button type="button" class="pp-critter-card__close" data-close-critter aria-label="${t('ui.close')}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-close"/></svg>
          </button>
        </div>` : ''}
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

    <div class="pp-foot">
      <span class="pp-foot-info">${t('passport.local')}</span>
      ${confirmingReset ? html`
        <div class="pp-reset-confirm" role="alert">
          <p class="pp-reset-confirm__msg">${t('passport.resetConfirm')}</p>
          <div class="pp-reset-confirm__actions">
            <button type="button" class="btn btn--small pp-btn--reset" data-pp-confirm-reset>${t('passport.resetYes')}</button>
            <button type="button" class="btn btn--small pp-btn--cancel" data-pp-cancel-reset>${t('passport.resetCancel')}</button>
          </div>
        </div>` : html`
        <button type="button" class="pp-reset-btn" data-pp-reset>${t('passport.reset')}</button>`}
    </div>`;
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
  loadLoans();
  resolveWishes();
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

  dialog.addEventListener('close', () => {
    confirmingReset = false;
    activeCritterId = null;
  });

  let timer;
  body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-pp-name]')) return;
    clearTimeout(timer);
    timer = setTimeout(() => game.setName(e.target.value), 500);
  });
  body.addEventListener('click', (e) => {
    const un = e.target.closest('[data-unwish]');
    if (un) game.toggleWish(un.dataset.unwish);

    const critterBtn = e.target.closest('[data-pp-critter]');
    if (critterBtn) {
      const id = critterBtn.dataset.ppCritter;
      if (!game.isFound(id)) return;
      const c = CRITTERS.find((x) => x.id === id);
      activeCritterId = activeCritterId === id ? null : id;
      draw();
      sfx.pop();
      if (activeCritterId && c) {
        toast(raw(`${t('toast.found', { name: t(`critter.${id}.name`) })}<br><small>${t(`critter.${id}.fact`)}</small>`), {
          icon: imgIcon(artUrl(c.art)),
          ms: 5200,
        });
      }
      return;
    }

    if (e.target.closest('[data-close-critter]')) {
      activeCritterId = null;
      draw();
      return;
    }

    if (e.target.closest('[data-pp-reset]')) {
      confirmingReset = true;
      draw();
      const confirmBox = $('.pp-reset-confirm', body);
      confirmBox?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      $('[data-pp-confirm-reset]', body)?.focus();
      return;
    }

    if (e.target.closest('[data-pp-cancel-reset]')) {
      confirmingReset = false;
      draw();
      return;
    }

    if (e.target.closest('[data-pp-confirm-reset]')) {
      confirmingReset = false;
      activeCritterId = null;
      seen.clear();
      dialog.close();
      window.scrollTo(0, 0);
      game.reset();
      sfx.pop();
      toast(raw(t('passport.resetDone')), { icon: coinIcon });
      return;
    }
  });

  bus.on('game', () => { if (!dialog.open) return; draw(); resolveWishes(); });
  bus.on('lang', () => dialog.open && draw());
  bus.on('auth', () => { loans = []; if (dialog.open) loadLoans(); });
}
