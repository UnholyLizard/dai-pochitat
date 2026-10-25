// Telegram sign-in (through the library's bot) and server-side saving of the reader's progress.
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

/** @type {{ user: null | { id: number, name: string, username: string, role: string }, canLogin: boolean, pending: null | { url: string } }} */
export const auth = { user: null, canLogin: false, pending: null };
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
  try {
    const me = await api('/api/me');
    auth.canLogin = me.login;
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
