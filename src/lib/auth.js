// Telegram sign-in (through the library's bot or official login widget) and server-side saving of the reader's progress.
import { bus } from './core.js';
import { game } from '../game/state.js';
import { api } from './api.js';

// Telegram Mini App: the client launches the site with signed launch data in the URL fragment
// (#tgWebAppData=…). Keep it for this session and tidy the address bar.
const launchData = (() => {
  try {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData');
    if (fromHash) {
      sessionStorage.setItem('dp:tg', fromHash);
      history.replaceState(null, '', location.pathname + location.search);
    }
    return fromHash || (new URLSearchParams(location.search).has('tgapp') ? sessionStorage.getItem('dp:tg') : null);
  } catch {
    return null;
  }
})();

export const isTelegramMiniApp = () =>
  typeof window !== 'undefined' &&
  (!!window.Telegram?.WebApp?.initData || new URLSearchParams(location.search).has('tgapp') || !!sessionStorage.getItem('dp:tg'));

// Notify Telegram that the Mini App is loaded, expand to full height and lock vertical swipes
if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
  try {
    window.Telegram.WebApp.ready?.();
    window.Telegram.WebApp.expand?.();
    window.Telegram.WebApp.disableVerticalSwipes?.();
  } catch { /* ignore outside Telegram */ }
}

/** @type {{ user: null | { id: number, name: string, username: string, role: string }, canLogin: boolean, botUsername: string | null, pending: null | { url: string } }} */
export const auth = { user: null, canLogin: false, botUsername: null, pending: null };
export const isAdmin = () => auth.user?.role === 'owner' || auth.user?.role === 'admin';

function setUser(user, remoteGame) {
  auth.user = user;
  if (user && remoteGame) game.mergeRemote(remoteGame);
  bus.emit('auth', user);
  if (user) scheduleSave();
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  if (!auth.user) return;
  saveTimer = setTimeout(() => api('/api/me/game', { method: 'PUT', body: { game: game.exportProgress() } }).catch(() => {}), 1500);
}

export async function initAuth() {
  bus.on('game', scheduleSave);

  // If redirected from Telegram Mini App to external browser with handoff code
  const handoff = new URLSearchParams(location.search).get('handoff');
  if (handoff) {
    history.replaceState(null, '', location.pathname);
    try {
      const r = await api('/api/auth/handoff/exchange', { method: 'POST', body: { code: handoff } });
      auth.canLogin = true;
      setUser(r.user, r.game);
      bus.emit('auth', auth.user);
      return;
    } catch { /* fall through to regular check */ }
  }

  try {
    const me = await api('/api/me');
    auth.canLogin = me.login;
    auth.botUsername = me.botUsername || 'DaiPochitatBot';
    if (launchData && me.login) {
      try {
        const r = await api('/api/auth/webapp', { method: 'POST', body: { initData: launchData } });
        setUser(r.user, r.game);
      } catch {
        setUser(me.user, me.game); // stale or foreign launch data: fall back to whoever the cookie says
      }
    } else setUser(me.user, me.game);
  } catch {
    // Offline or no backend (plain `vite` dev): the site works anonymously.
  }
  bus.emit('auth', auth.user);
}

let pollTimer = 0;
export function cancelLogin() {
  clearTimeout(pollTimer);
  if (auth.pending) { auth.pending = null; bus.emit('auth', auth.user); }
}

/** Signs in via the Telegram Login Widget callback */
export async function loginWithWidget(data) {
  cancelLogin();
  const r = await api('/api/auth/widget', { method: 'POST', body: data });
  setUser(r.user, r.game);
  return r;
}

// Global callback for the official Telegram Login Widget iframe
if (typeof window !== 'undefined') {
  window.onTelegramAuth = (user) => {
    loginWithWidget(user).catch((err) => {
      console.warn('Telegram widget login failed', err);
    });
  };
}

/**
 * Transfers the session and opens the external browser (Safari/Chrome).
 * Bypasses Telegram Mini App's throttled WebGL and gestures.
 */
export async function openInExternalBrowser() {
  let dest = `${location.origin}${location.pathname}`;
  if (auth.user) {
    try {
      const { code } = await api('/api/auth/handoff/create', { method: 'POST', body: {} });
      dest = `${location.origin}${location.pathname}?handoff=${code}`;
    } catch { /* use plain origin */ }
  }
  if (window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(dest, { try_instant_view: false });
  } else {
    window.open(dest, '_blank', 'noopener');
  }
}

/** Starts the bot flow: returns the t.me link and resolves the sign-in in the background. */
export async function startLogin() {
  cancelLogin();
  const { code, secret, url, expiresIn } = await api('/api/auth/start', { method: 'POST', body: {} });
  const pending = { url };
  auth.pending = pending;
  bus.emit('auth', auth.user);
  const until = Date.now() + expiresIn * 1000;

  const poll = async () => {
    if (auth.pending !== pending) return;
    try {
      const r = await api('/api/auth/poll', { method: 'POST', body: { code, secret } });
      if (r.status === 'ok') { auth.pending = null; setUser(r.user, r.game); return; }
      if (r.status === 'expired') { cancelLogin(); return; }
    } catch { /* transient: keep trying until the code expires */ }
    if (Date.now() > until) cancelLogin();
    else pollTimer = setTimeout(poll, 2000);
  };
  pollTimer = setTimeout(poll, 2000);
  window.open(url, '_blank', 'noopener');
  return url;
}

export async function logout() {
  clearTimeout(saveTimer);
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* cookie expires on its own */ }
  setUser(null);
}
