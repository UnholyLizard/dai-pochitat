// Chapter three: the casting for the librarian's role. Readers audition the candidates,
// try them in the chat and vote; the tally lives on the server (worker/index.js).
import { bus, $, html, render, raw, artUrl } from '../lib/core.js';
import { t, L } from '../i18n/index.js';
import { game } from '../game/state.js';
import { sfx } from '../game/sfx.js';
import { toast } from '../game/feedback.js';
import { LIBRARIANS, librarianById } from '../content/librarians.js';

const API = `${import.meta.env.BASE_URL}api/casting`;

let root;
let selected;
let lineIndex = 0;
let tally = null;      // { totals, total } from the server, null until loaded
let status = 'idle';   // idle | sending | offline | error
let lastFetch = 0;
let onPick = () => {};
let onChat = () => {};

async function fetchTally(force = false) {
  if (!force && Date.now() - lastFetch < 20000) return;
  lastFetch = Date.now();
  try {
    const res = await fetch(API, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    tally = await res.json();
    if (status === 'offline') status = 'idle';
  } catch {
    if (!tally) status = navigator.onLine ? 'error' : 'offline';
  }
  draw();
}

async function castVote() {
  const id = selected;
  status = 'sending';
  draw();
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voter: game.state.voter, candidate: id }),
    });
    if (!res.ok) throw new Error(String(res.status));
    tally = await res.json();
    lastFetch = Date.now();
    status = 'idle';
    game.setVote(id);
  } catch {
    status = navigator.onLine ? 'error' : 'offline';
  }
  // Even if the count failed, the reader's pick answers in the chat from now on.
  game.setLibrarian(id);
  const name = L(librarianById(id).name);
  toast(t('casting.thanks', { name }), { action: { label: t('casting.chat'), run: () => onChat() } });
  sfx.chime();
  draw();
}

function results() {
  const voted = game.state.vote;
  if (!voted) return html`<p class="casting__note">${t('casting.hidden')}</p>`;
  if (!tally) return status === 'offline' || status === 'error' ? html`<p class="casting__note">${t('casting.offline')}</p>` : '';
  const total = Math.max(1, tally.total);
  const rows = LIBRARIANS.map((c) => ({ c, n: tally.totals[c.id] ?? 0 })).sort((a, b) => b.n - a.n);
  return html`
    <h3 class="casting__results-title">${t('casting.results')}</h3>
    <ol class="tally">
      ${rows.map(({ c, n }) => html`
        <li class="tally__row ${c.id === voted ? 'is-yours' : ''}" style="--c:${c.color};--p:${((n / total) * 100).toFixed(1)}%">
          <img src="${artUrl(`${c.id}-avatar`)}" alt="" width="28" height="28" loading="lazy">
          <span class="tally__name">${L(c.name)}${c.id === voted ? html` <small>· ${t('casting.yours')}</small>` : ''}</span>
          <span class="tally__bar" aria-hidden="true"><i></i></span>
          <span class="tally__n">${n}</span>
        </li>`)}
    </ol>
    <p class="casting__note">${t('casting.total', { n: tally.total })}</p>`;
}

function voteLabel() {
  const name = L(librarianById(selected).name);
  if (game.state.vote === selected) return t('casting.voted', { name });
  return t(game.state.vote ? 'casting.revote' : 'casting.vote', { name });
}

function draw() {
  if (!root) return;
  const c = librarianById(selected);
  const lines = c.voice.audition;
  const line = lines[lineIndex % lines.length];
  const already = game.state.vote === selected;
  render(root, html`
    <fieldset class="casting__picker">
      <legend class="visually-hidden">${t('casting.candidates')}</legend>
      <div class="casting__grid">
        ${LIBRARIANS.map((x) => html`
          <label class="cand" style="--c:${x.color}">
            <input type="radio" name="candidate" value="${x.id}" ${raw(x.id === selected ? 'checked' : '')}>
            <span class="cand__face"><img src="${artUrl(`${x.id}-avatar`)}" alt="" width="64" height="64" loading="lazy"></span>
            <span class="cand__name">${L(x.name)}</span>
            ${x.id === game.state.vote ? html`<span class="cand__mark" aria-label="${t('casting.yours')}">♥</span>` : ''}
          </label>`)}
      </div>
    </fieldset>
    <div class="casting__audition" style="--c:${c.color}">
      <p class="casting__role"><b>${L(c.name)}</b> · ${L(c.role)}. ${L(c.tagline)}.</p>
      <blockquote class="casting__line" aria-live="polite">
        <span class="visually-hidden">${t('casting.says', { name: L(c.name) })}</span>
        «${L(line)}»
      </blockquote>
      <div class="casting__actions">
        <button class="btn btn--primary btn--small" type="button" data-cast-vote ${raw(already || status === 'sending' ? 'disabled' : '')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart"/></svg><span>${voteLabel()}</span>
        </button>
        <button class="btn btn--small" type="button" data-cast-line>${t('casting.another')}</button>
        <button class="btn btn--ghost btn--small" type="button" data-cast-chat>${t('casting.chat')}</button>
      </div>
      ${status === 'error' ? html`<p class="casting__note casting__note--warn">${t('casting.error')}</p>` : ''}
    </div>
    <div class="casting__results" aria-live="polite">${results()}</div>`);
}

function select(id, { announce = true } = {}) {
  if (id === selected) { lineIndex += 1; draw(); return; }
  selected = id;
  lineIndex = Math.floor(Math.random() * 3);
  onPick(id);
  if (announce) sfx.pop();
  draw();
  // Keep keyboard focus on the radio the reader just chose.
  root.querySelector(`input[value="${id}"]`)?.focus({ preventScroll: true });
}

/** @param {{ onPick: (id: string) => void, onChat: () => void }} o */
export function initCasting(o) {
  root = $('[data-casting]');
  onPick = o.onPick;
  onChat = o.onChat;
  selected = game.state.vote ?? game.state.librarian;
  draw();

  root.addEventListener('change', (e) => {
    if (e.target.name === 'candidate') select(e.target.value);
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-cast-vote]')) castVote();
    if (e.target.closest('[data-cast-line]')) { lineIndex += 1; sfx.pluck(); draw(); }
    if (e.target.closest('[data-cast-chat]')) { game.setLibrarian(selected); onChat(); }
  });

  bus.on('lang', draw);
  bus.on('game', draw);
  // Results refresh when the reader turns to the casting spread.
  bus.on('spread', (n) => { if (n === 3 && game.state.vote) fetchTally(); });
  if (game.state.vote) fetchTally(true);

  return {
    /** A click on a candidate standing on the 3D stage. */
    audition(id) { select(id); },
    get selected() { return selected; },
  };
}
