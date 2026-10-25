// The hamburger menu: contents, evening mode, sound, language, Telegram account, admin link.
import { bus, $ } from '../lib/core.js';
import { t } from '../i18n/index.js';
import { auth, isAdmin, startLogin, cancelLogin, logout } from '../lib/auth.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export function initMenu() {
  const menu = $('#menu');
  const account = $('[data-account]');
  const adminLink = $('[data-admin-link]');
  if (!menu || !account) return;

  function render() {
    adminLink.hidden = !isAdmin();
    account.replaceChildren();

    if (auth.user) {
      const row = el('div', 'menu__who');
      row.append(el('span', 'menu__avatar', [...auth.user.name][0]?.toUpperCase() ?? '?'));
      const names = el('div');
      names.append(el('strong', '', auth.user.name));
      const sub = [auth.user.username && `@${auth.user.username}`, auth.user.role !== 'user' && t(`account.role.${auth.user.role}`)].filter(Boolean).join(' · ');
      if (sub) names.append(el('small', '', sub));
      row.append(names);
      const out = el('button', 'menu__link', t('account.logout'));
      out.type = 'button';
      out.addEventListener('click', logout);
      account.append(row, el('p', 'menu__hint', t('account.saved')), out);
      return;
    }

    if (!auth.canLogin) return; // no bot configured: stay anonymous, show nothing
    if (auth.pending) {
      const open = el('a', 'menu__login', t('account.openTelegram'));
      open.href = auth.pending.url;
      open.target = '_blank';
      open.rel = 'noopener';
      const cancel = el('button', 'menu__link', t('account.cancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', cancelLogin);
      account.append(open, el('p', 'menu__hint', t('account.waiting')), cancel);
      return;
    }
    const login = el('button', 'menu__login', t('account.login'));
    login.type = 'button';
    login.addEventListener('click', () => startLogin().catch(() => {
      account.append(el('p', 'menu__hint', t('account.error')));
    }));
    account.append(login, el('p', 'menu__hint', t('account.why')));
  }

  bus.on('auth', render);
  bus.on('lang', render);
  render();

  // Picking a destination closes the menu; the toggles (theme, sound, language) keep it open.
  menu.addEventListener('click', (e) => {
    if (e.target.closest('[data-menu-close]') || e.target.closest('a[href^="#"]') || e.target.closest('[data-open="catalog"]')) {
      menu.hidePopover?.();
    }
  });
}
