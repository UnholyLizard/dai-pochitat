import { bus, reducedMotion, $, $$, html, raw, fragment, artUrl } from '../lib/core.js';
import { t } from '../i18n/index.js';
import { game } from './state.js';
import { sfx } from './sfx.js';
import { CRITTERS } from '../content/game.js';

const toasts = $('[data-toasts]');
let lastPointer = { x: innerWidth / 2, y: innerHeight / 2 };
addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });

/** @param {{ icon?: object, ms?: number, action?: { label: string, run: () => void } }} [o] */
export function toast(markup, { icon, ms = 3600, action } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.append(fragment(html`${icon ?? ''}<span>${markup}</span>`));
  const leave = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 400);
  };
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast__action';
    b.textContent = action.label;
    b.addEventListener('click', () => { leave(); action.run(); });
    el.classList.add('toast--action');
    el.append(b);
  }
  toasts.append(el);
  setTimeout(leave, ms);
}

const coinIcon = html`<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-coin"/></svg>`;
const imgIcon = (src) => html`<img src="${src}" alt="">`;

/** A gold coin flies from where the thing happened to the counter in the header. */
function flyCoin(from) {
  const counter = $('.hud__coins');
  if (!counter || reducedMotion.matches) return Promise.resolve();
  const to = counter.querySelector('svg').getBoundingClientRect();
  const coin = document.createElement('div');
  coin.className = 'flying-coin';
  coin.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-coin"/></svg>';
  document.body.append(coin);
  const sx = from.x - 15, sy = from.y - 15, ex = to.left + to.width / 2 - 15, ey = to.top + to.height / 2 - 15;
  const mx = (sx + ex) / 2 + (Math.random() - 0.5) * 120, my = Math.min(sy, ey) - 140;
  const frames = Array.from({ length: 13 }, (_, i) => {
    const k = i / 12, a = (1 - k) ** 2, b = 2 * (1 - k) * k, c = k * k;
    return { transform: `translate(${a * sx + b * mx + c * ex}px, ${a * sy + b * my + c * ey}px) rotate(${k * 540}deg) scale(${1 + Math.sin(k * Math.PI) * 0.5})` };
  });
  return coin.animate(frames, { duration: 900, easing: 'cubic-bezier(.3,.1,.3,1)' }).finished.then(() => coin.remove());
}

function syncCoins() {
  for (const el of $$('[data-coins]')) el.textContent = game.state.coins;
}

export function initFeedback() {
  syncCoins();
  bus.on('game', syncCoins);

  bus.on('award', async ({ type, id, origin }) => {
    sfx.coin();
    // i18n strings are ours (trusted) and may carry <b>.
    if (type === 'critter') {
      const c = CRITTERS.find((x) => x.id === id);
      toast(raw(`${t('toast.found', { name: t(`critter.${id}.name`) })}<br><small>${t(`critter.${id}.fact`)}</small>`), {
        icon: imgIcon(artUrl(c.art)),
        ms: 5200,
      });
    } else {
      sfx.stamp();
      toast(raw(t('toast.stamp', { name: t(`stamp.${id}`) })), { icon: coinIcon });
    }
    await flyCoin(origin ?? lastPointer);
    const counter = $('.hud__coins');
    counter?.classList.remove('is-bump');
    void counter?.offsetWidth;
    counter?.classList.add('is-bump');
  });

  bus.on('rank', (r) => {
    sfx.chime();
    toast(raw(t('toast.rank', { rank: t(`rank.${r}`) })), { icon: coinIcon, ms: 5000 });
  });
}

export { coinIcon, imgIcon };
