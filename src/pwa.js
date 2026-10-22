// Installable, offline-capable book: service-worker updates, install prompt, connectivity notes.
import { registerSW } from 'virtual:pwa-register';
import { bus, $$ } from './lib/core.js';
import { t } from './i18n/index.js';
import { game } from './game/state.js';
import { toast } from './game/feedback.js';

let deferred = null;

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canInstall = () => !!deferred && !isStandalone();

function sync() {
  for (const b of $$('[data-install]')) b.hidden = !canInstall();
  bus.emit('installable', canInstall());
}

/** Shows the browser's install dialog (Chromium only). Resolves true if the reader accepted. */
export async function install() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  sync();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export function initPWA() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // offered in the contents and by Pippi instead of the browser's mini-infobar
    deferred = e;
    sync();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    sync();
    toast(t('pwa.installed'));
    game.award('installed');
  });
  if (isStandalone()) game.award('installed');
  document.addEventListener('click', (e) => { if (e.target.closest('[data-install]')) install(); });
  sync();

  // A new version waits until the reader says so — an open book keeps its own 3D chunk.
  const updateSW = registerSW({
    onNeedRefresh() {
      toast(t('pwa.update'), { ms: 60000, action: { label: t('pwa.reload'), run: () => updateSW(true) } });
    },
    onOfflineReady() {
      toast(t('pwa.offlineReady'), { ms: 5000 });
    },
  });

  addEventListener('offline', () => toast(t('pwa.offline'), { ms: 5000 }));
  addEventListener('online', () => toast(t('pwa.online')));
}
