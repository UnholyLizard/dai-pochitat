/**
 * The librarian agent (whoever won the reader's casting).
 *
 * The chat UI talks to a "brain" with one method:
 *
 *   reply(message: string, context) → Promise<Reply[]>
 *
 *   context = { lang: 'ru'|'en', state: { name, coins, found, stamps, wish, solved }, isNight,
 *               librarian: candidate id (src/content/librarians.js — voice & personality),
 *               history: {from, text}[], app: { canInstall, ios, standalone } }
 *
 *   Reply = { say: string }                    — a chat bubble (plain text)
 *         | { book: string }                   — a book card, by id from src/content/books.js
 *         | { chips: { label, send?, action? }[] } — quick replies under the log
 *         | { action: Action }                 — something the librarian does on the page
 *
 *   Action = { type: 'goto', id }  | { type: 'theme' } | { type: 'upside' } | { type: 'passport' }
 *          | { type: 'lang', lang } | { type: 'solve', id } | { type: 'oracle' } | { type: 'install' }
 *
 * Brains also implement greet(context) and takeOver(context) (first words after a casting pick).
 *
 * Today the scripted brain answers locally. Set VITE_LIBRARIAN_ENDPOINT to a server that
 * speaks the same contract (e.g. an LLM with tools: searchCatalog, isOnShelf,
 * reserveBook, getEvents) and the librarian becomes a real AI agent — no UI changes.
 */
import { createScriptedBrain } from './brain-scripted.js';

function createRemoteBrain(endpoint, fallback) {
  return {
    greet: fallback.greet,
    takeOver: fallback.takeOver,
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
        // Offline, slow or broken server: the librarian still answers.
        return fallback.reply(message, context);
      }
    },
  };
}

export function createLibrarian() {
  const scripted = createScriptedBrain();
  const endpoint = import.meta.env.VITE_LIBRARIAN_ENDPOINT;
  return endpoint ? createRemoteBrain(endpoint, scripted) : scripted;
}
