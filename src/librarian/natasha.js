// The live chat with Natasha, the library's owner: messages go to her Telegram bot and her
// replies come back here. Needs a signed-in reader, so replies have somewhere to land.
import { prefs } from '../lib/core.js';
import { t } from '../i18n/index.js';
import { auth, startLogin, cancelLogin } from '../lib/auth.js';
import { api } from '../lib/api.js';

const POLL_OPEN = 4000;
const POLL_IDLE = 30000;

/**
 * @param {{ log: HTMLElement, gate: HTMLElement, onNew: (n: number) => void, isActive: () => boolean }} o
 */
export function createNatasha({ log, gate, onNew, isActive }) {
  const seen = new Set();
  let lastId = 0;
  let sending = false;
  let timer = 0;
  let loaded = false;

  const scroll = () => log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });

  function bubble(m, cls = '') {
    const li = document.createElement('li');
    li.className = `msg msg--${m.dir === 'out' ? 'librarian' : 'me'} ${cls}`.trim();
    li.textContent = m.text;
    if (m.id) { li.dataset.id = m.id; seen.add(m.id); lastId = Math.max(lastId, m.id); }
    log.append(li);
    scroll();
    return li;
  }

  function note(text) {
    const li = document.createElement('li');
    li.className = 'msg msg--note';
    li.textContent = text;
    log.append(li);
    scroll();
  }

  async function poll() {
    clearTimeout(timer);
    if (!auth.user) return;
    if (!sending && !document.hidden) {
      try {
        const { messages } = await api(`/api/natasha?after=${lastId}`);
        const fresh = messages.filter((m) => !seen.has(m.id));
        if (!loaded) {
          loaded = true;
          if (!fresh.length) note(t('natasha.intro'));
        }
        for (const m of fresh) bubble(m);
        const incoming = fresh.filter((m) => m.dir === 'out').length;
        if (incoming && !isActive()) onNew(incoming);
      } catch { /* offline: try again on the next tick */ }
    }
    timer = setTimeout(poll, isActive() ? POLL_OPEN : POLL_IDLE);
  }

  function renderGate() {
    gate.replaceChildren();
    const p = document.createElement('p');
    p.textContent = t(auth.canLogin ? 'natasha.gate' : 'natasha.gateOff');
    gate.append(p);
    if (!auth.canLogin) return;
    if (auth.pending) {
      const a = document.createElement('a');
      a.className = 'chat__gate-btn';
      a.href = auth.pending.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = t('account.openTelegram');
      const wait = document.createElement('p');
      wait.className = 'chat__gate-wait';
      wait.textContent = t('account.waiting');
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'chat__gate-link';
      cancel.textContent = t('account.cancel');
      cancel.addEventListener('click', cancelLogin);
      gate.append(a, wait, cancel);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat__gate-btn';
      b.textContent = t('account.login');
      b.addEventListener('click', () => startLogin().catch(() => { p.textContent = t('account.error'); }));
      gate.append(b);
    }
  }

  /** Show either the thread or the sign-in prompt, depending on who is looking. */
  function render() {
    const signedIn = !!auth.user;
    gate.hidden = signedIn;
    log.hidden = !signedIn;
    if (!signedIn) { clearTimeout(timer); renderGate(); return; }
    poll();
  }

  return {
    render,
    /** Called once the reader is known, so replies can be noticed even while the chat is closed. */
    watch() { if (auth.user && prefs.get('natasha')) poll(); else clearTimeout(timer); },
    reset() { seen.clear(); lastId = 0; loaded = false; log.replaceChildren(); },
    async send(text) {
      if (!auth.user) return;
      prefs.set('natasha', true);
      sending = true;
      const li = bubble({ dir: 'in', text }, 'is-sending');
      try {
        const r = await api('/api/natasha', { method: 'POST', body: { text } });
        li.classList.remove('is-sending');
        li.dataset.id = r.id;
        seen.add(r.id);
        lastId = Math.max(lastId, r.id);
        if (!r.delivered) note(t('natasha.undelivered'));
      } catch (err) {
        li.classList.add('is-failed');
        note(t(err.status === 429 ? 'natasha.slow' : 'natasha.failed'));
      } finally {
        sending = false;
        poll();
      }
    },
  };
}
