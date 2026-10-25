import { bus, store } from '../lib/core.js';
import { CRITTERS, RANKS } from '../content/game.js';
import { DEFAULT_LIBRARIAN, LIBRARIANS } from '../content/librarians.js';

const KEY = 'dp:game';

const fresh = () => ({
  v: 1,
  coins: 0,
  found: {},
  stamps: {},
  name: '',
  wish: [],
  solved: [],
  cardNo: String(1000 + Math.floor(Math.random() * 9000)),
  visits: 0,
  lastVisit: 0,
  librarian: DEFAULT_LIBRARIAN, // who answers in the chat (chosen in the casting)
  vote: null,                   // the reader's vote in the casting
  voter: crypto.randomUUID(),   // anonymous id so a vote can be changed, not repeated
});

let state = { ...fresh(), ...store.get(KEY, {}) };
// v1 → v2: the chat stamp was renamed.
if (state.stamps.pippi) { state.stamps.chat = state.stamps.pippi; delete state.stamps.pippi; }
if (!LIBRARIANS.some((l) => l.id === state.librarian)) state.librarian = DEFAULT_LIBRARIAN;
const save = () => store.set(KEY, state);

export const rankOf = (coins) => RANKS.reduce((r, need, i) => (coins >= need ? i : r), 0);

function addCoin(detail) {
  const before = rankOf(state.coins);
  state.coins += 1;
  save();
  bus.emit('award', detail);
  const after = rankOf(state.coins);
  if (after > before) bus.emit('rank', after);
  bus.emit('game', state);
}

export const game = {
  get state() { return state; },

  /** Count this visit; returns the previous visit time (0 for a first visit). */
  visit() {
    const last = state.lastVisit;
    if (Date.now() - last > 30 * 60 * 1000) state.visits += 1;
    state.lastVisit = Date.now();
    save();
    return last;
  },

  award(id, origin) {
    if (state.stamps[id]) return false;
    state.stamps[id] = Date.now();
    addCoin({ type: 'stamp', id, origin });
    return true;
  },

  collect(id, origin) {
    if (state.found[id]) return false;
    state.found[id] = Date.now();
    addCoin({ type: 'critter', id, origin });
    if (CRITTERS.every((c) => state.found[c.id])) {
      setTimeout(() => game.award('tracker'), 1400);
      bus.emit('allFound');
    }
    return true;
  },

  isFound: (id) => !!state.found[id],
  isAllFound: () => CRITTERS.every((c) => !!state.found[c.id]),

  setName(name) {
    state.name = name.trim().slice(0, 40);
    save();
    if (state.name) game.award('named');
    bus.emit('game', state);
  },

  toggleWish(bookId) {
    const i = state.wish.indexOf(bookId);
    if (i >= 0) state.wish.splice(i, 1);
    else state.wish.unshift(bookId);
    save();
    bus.emit('game', state);
    return i < 0;
  },

  solve(riddleId) {
    if (!state.solved.includes(riddleId)) state.solved.push(riddleId);
    save();
    game.award('riddle');
  },

  /** The reader picked who answers in the chat. */
  setLibrarian(id) {
    if (state.librarian === id) return;
    state.librarian = id;
    save();
    bus.emit('librarian', id);
  },

  /** Remember the reader's casting vote (the server keeps the tally). */
  setVote(id) {
    state.vote = id;
    save();
    game.award('jury');
    bus.emit('game', state);
  },

  /** Everything worth keeping on the server (the anonymous casting voter id stays on this device). */
  exportProgress() {
    const copy = { ...state };
    delete copy.voter;
    return copy;
  },

  /** Fold progress saved on the server into this device's: nothing earned on either side is lost. */
  mergeRemote(remote) {
    if (!remote || typeof remote !== 'object') return;
    const times = (a, b) => {
      const out = { ...a };
      for (const [k, v] of Object.entries(b ?? {}).slice(0, 200)) {
        if (typeof v === 'number' && k.length <= 40) out[k] = out[k] ? Math.min(out[k], v) : v;
      }
      return out;
    };
    const list = (a, b) => [...new Set([...a, ...(Array.isArray(b) ? b.filter((x) => typeof x === 'string').slice(0, 500) : [])])];
    state.stamps = times(state.stamps, remote.stamps);
    state.found = times(state.found, remote.found);
    state.wish = list(state.wish, remote.wish);
    state.solved = list(state.solved, remote.solved);
    if (!state.name && typeof remote.name === 'string') state.name = remote.name.slice(0, 40);
    state.coins = Math.max(state.coins, Number(remote.coins) || 0, Object.keys(state.stamps).length + Object.keys(state.found).length);
    state.visits = Math.max(state.visits, Number(remote.visits) || 0);
    if (!state.vote && LIBRARIANS.some((l) => l.id === remote.vote)) state.vote = remote.vote;
    save();
    if (state.librarian === DEFAULT_LIBRARIAN && remote.librarian !== DEFAULT_LIBRARIAN && LIBRARIANS.some((l) => l.id === remote.librarian)) {
      state.librarian = remote.librarian;
      save();
      bus.emit('librarian', state.librarian);
    }
    bus.emit('game', state);
  },

  reset() {
    // Progress starts over; the casting choice and anonymous voter id are preferences, not progress.
    const { cardNo, visits, lastVisit, librarian, vote, voter } = state;
    state = { ...fresh(), cardNo, visits, lastVisit, librarian, vote, voter };
    save();
    bus.emit('reset');
    bus.emit('game', state);
  },
};
