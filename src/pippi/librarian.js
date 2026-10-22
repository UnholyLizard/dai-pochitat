/**
 * Pippi, the librarian agent.
 *
 * The chat UI talks to a "brain" with one method:
 *
 *   reply(message: string, context) → Promise<Reply[]>
 *
 *   context = { lang: 'ru'|'en', state: { name, coins, found, stamps, wish, solved }, isNight,
 *               history: {from, text}[], app: { canInstall, ios, standalone } }
 *
 *   Reply = { say: string }                    — a chat bubble (plain text)
 *         | { book: string }                   — a book card, by id from src/content/books.js
 *         | { chips: { label, send?, action? }[] } — quick replies under the log
 *         | { action: Action }                 — something Pippi does on the page
 *
 *   Action = { type: 'goto', id }  | { type: 'theme' } | { type: 'upside' } | { type: 'passport' }
 *          | { type: 'lang', lang } | { type: 'solve', id } | { type: 'oracle' } | { type: 'install' }
 *
 * Today the scripted brain answers locally. Set VITE_PIPPI_ENDPOINT to a server that
 * speaks the same contract (e.g. an LLM with tools: searchCatalog, isOnShelf,
 * reserveBook, getEvents) and Pippi becomes a real AI librarian — no UI changes.
 */
import { createScriptedBrain } from './brain-scripted.js';

function createRemoteBrain(endpoint, fallback) {
  return {
    greet: fallback.greet,
    async reply(message, context) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message,
            lang: context.lang,
            history: context.history.slice(-12),
            reader: { name: context.state.name, coins: context.state.coins, wish: context.state.wish },
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(String(res.status));
        const { replies } = await res.json();
        if (!Array.isArray(replies)) throw new Error('bad reply');
        return replies;
      } catch {
        // Offline, slow or broken server: Pippi still answers.
        return fallback.reply(message, context);
      }
    },
  };
}

export function createLibrarian() {
  const scripted = createScriptedBrain();
  const endpoint = import.meta.env.VITE_PIPPI_ENDPOINT;
  return endpoint ? createRemoteBrain(endpoint, scripted) : scripted;
}
