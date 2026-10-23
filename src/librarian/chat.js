import { bus, prefs, $, $$, fragment, artUrl } from '../lib/core.js';
import { getLang, L } from '../i18n/index.js';
import { game } from '../game/state.js';
import { sfx } from '../game/sfx.js';
import { bookById } from '../content/books.js';
import { librarianById } from '../content/librarians.js';
import { bookCard } from '../ui/sections.js';
import { isNight } from '../ui/chrome.js';
import { createLibrarian } from './librarian.js';
import { canInstall, isIOS, isStandalone } from '../pwa.js';

const panel = $('#librarian');
const log = $('[data-chat-log]');
const chipsEl = $('[data-chat-chips]');
const form = $('[data-chat-form]');
const input = $('#chat-input');
const fab = $('.librarian-fab');
const teaser = $('[data-librarian-teaser]');

const brain = createLibrarian();
const history = [];
let greeted = false;
let busy = Promise.resolve();
let runAction = () => {};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isOpen = () => panel.matches(':popover-open');
const scrollDown = () => log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });

function bubble(from, text) {
  const li = document.createElement('li');
  li.className = `msg msg--${from}`;
  li.textContent = text;
  log.append(li);
  history.push({ from, text });
  scrollDown();
}

function chips(list = []) {
  chipsEl.replaceChildren(...list.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.label;
    b.addEventListener('click', () => {
      if (c.action) runAction(c.action);
      else send(c.send ?? c.label);
    });
    return b;
  }));
}

async function play(replies) {
  for (const r of replies) {
    if (r.chips) { chips(r.chips); continue; }
    if (r.action) { runAction(r.action); continue; }
    const typing = document.createElement('li');
    typing.className = 'msg msg--librarian msg--typing';
    typing.setAttribute('aria-hidden', 'true');
    typing.innerHTML = '<i></i><i></i><i></i>';
    log.append(typing);
    scrollDown();
    await wait(r.say ? Math.min(1300, 350 + r.say.length * 9) : 450);
    typing.remove();
    if (r.say) bubble('librarian', r.say);
    if (r.book) {
      const b = bookById(r.book);
      if (b) {
        const li = document.createElement('li');
        li.className = 'msg msg--book';
        li.append(fragment(bookCard(b, { compact: true })));
        log.append(li);
        scrollDown();
      }
    }
    sfx.pluck();
  }
}

const context = () => ({
  lang: getLang(),
  state: game.state,
  isNight: isNight(),
  history,
  librarian: game.state.librarian,
  app: { canInstall: canInstall(), ios: isIOS(), standalone: isStandalone() },
});

/** Put the chosen candidate's face and name on the chat button and header. */
function dress() {
  const who = librarianById(game.state.librarian);
  const src = artUrl(`${who.id}-avatar`);
  for (const img of $$('[data-librarian-face]')) img.src = src;
  for (const el of $$('[data-librarian-name]')) el.textContent = L(who.name);
  for (const el of $$('[data-librarian-role]')) el.textContent = L(who.role);
  fab.dataset.who = who.id;
}

export function send(text) {
  const q = text.trim();
  if (!q) return;
  if (!isOpen()) open();
  bubble('me', q);
  chips([]);
  game.award('chat');
  busy = busy.then(async () => play(await brain.reply(q, context())));
  return busy;
}

function greet() {
  greeted = true;
  busy = busy.then(() => play(brain.greet(context())));
}

export function open() {
  if (!isOpen()) panel.showPopover();
  fab.classList.add('is-open');
  fab.setAttribute('aria-expanded', 'true');
  teaser.hidden = true;
  if (!greeted) greet();
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 250);
}

export function close() {
  if (isOpen()) panel.hidePopover();
  fab.classList.remove('is-open');
  fab.setAttribute('aria-expanded', 'false');
}

/** @param {{ actions: (a: object) => void }} o */
export function initLibrarian({ actions }) {
  runAction = actions;
  dress();
  fab.setAttribute('aria-expanded', 'false');
  fab.addEventListener('click', () => (isOpen() ? close() : open()));
  for (const b of $$('[data-open="librarian"]')) if (b !== fab) b.addEventListener('click', open);
  for (const b of $$('[data-close="librarian"]')) b.addEventListener('click', () => { close(); fab.focus(); });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); fab.focus(); } });
  panel.addEventListener('toggle', (e) => { if (e.newState === 'closed') fab.classList.remove('is-open'); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value;
    input.value = '';
    send(q);
  });

  // A small hello bubble, once a day, if the visitor hasn't met the librarian yet.
  const today = new Date().toDateString();
  if (prefs.get('teaser') !== today) {
    setTimeout(() => {
      if (isOpen() || greeted) return;
      teaser.hidden = false;
      prefs.set('teaser', today);
      setTimeout(() => { teaser.hidden = true; }, 12000);
    }, 5000);
  }
  $('[data-teaser-close]').addEventListener('click', () => { teaser.hidden = true; });

  // A new librarian from the casting takes over the chat and says hello.
  bus.on('librarian', () => {
    dress();
    fab.animate([{ rotate: '0deg' }, { rotate: '-12deg' }, { rotate: '10deg' }, { rotate: '0deg' }], { duration: 600 });
    if (greeted) busy = busy.then(() => play(brain.takeOver(context())));
  });

  // Names and quick replies follow the language switch.
  bus.on('lang', () => {
    dress();
    if (greeted) chips(brain.greet(context()).find((r) => r.chips)?.chips);
  });
}
