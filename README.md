# «Дай почитать!» — website concept

**Live:** https://dai-pochitat-mne.craft-tower.com · installable PWA, works offline

A cozy, game-like site for a small non-profit kids & teens library in the yellow
Kompas school-garden house in Bar, Montenegro. Russian and English.

**The idea: the whole site is a pop-up book on a sunlit table.** Scrolling turns its
pages; each chapter is a paper scene that stands up from the spread (three.js).
Pippi is the librarian who chats, recommends books and tells riddles; visitors
collect coins, stamps and hidden "book folk" in a personal library card.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # lint + production build (+ dist/_headers with CSP)
npm run deploy   # build + wrangler deploy → Cloudflare Workers
```

## What's inside

| Chapter (spread) | Pop-up scene | Page content |
|---|---|---|
| Cover | Cloth book with gold foil, the house on a tipped-in plate | Hero, Pippi intro |
| 1 · The yellow house | The real building (redrawn from the photo), olive tree, cypresses, mountains | About the library |
| 2 · The room | Window to the sea, fringed lamp (click → evening), shelves, kids on cushions | What's there, how it works |
| 3 · Pippi's chest | Pippi on a treasure chest, spotted horse (click → she lifts it) | **Book oracle**: age + mood → a book |
| 4 · Parties | Balloons, bunting, cake of books (click → confetti) | Events as tickets, "Add to calendar" (.ics) |
| 5 · Find us | Illustrated map of Bar, 3D pin over the house, sailboat | Address, hours, joining steps, contacts |
| Back cover | "The end… or the beginning?" | Footer (+ a badger hiding in it) |

**Game layer** (all stored in the visitor's browser, `localStorage`):
coins → ranks (Guest → Captain of the Book Seas), 12 stamps, 6 hidden critters
(5 in the 3D scenes, 1 in the footer), wish-list, a secret word for the librarian
at the top rank — a reason to visit the real library.

**Evening mode** — the lamp in chapter 2 or the header toggle: night lighting,
fireflies instead of dust, dark UI. Follows the OS colour scheme on first visit.

## PWA

- Installable (manifest with icons, maskable icon, shortcuts to the chest / parties / map, screenshots).
- Offline: the app shell, fonts and 3D engine are precached by a Workbox service worker
  (`vite-plugin-pwa`); illustrations are cached as the reader turns the pages, so a book
  read once opens without internet. Pippi works offline too (her brain is local).
- Updates wait for the reader: a toast offers "Refresh" when a new version is deployed,
  so an open book never loses the 3D chunk it was built with.
- Install is offered in the Contents menu and by Pippi (ask her "how do I install it?");
  on iPhone she explains *Share → Add to Home Screen*. Installing earns the «Книга дома» stamp.

## Hosting

Cloudflare Workers static assets (`wrangler.jsonc`), custom domain
`dai-pochitat-mne.craft-tower.com`. `scripts/postbuild.mjs` writes `dist/_headers`:
a strict CSP (inline scripts allowed by hash), HSTS, immutable caching for hashed assets,
`no-cache` for the service worker and manifest. Unknown paths get `public/404.html`.

CI (`.github/workflows/ci.yml`) lints and builds every push / PR. Pushes to `main`
deploy automatically once a `CLOUDFLARE_API_TOKEN` repository secret exists
(token permissions: *Workers Scripts: Edit*, *Workers Routes: Edit*, zone *DNS: Edit*
for the custom domain); the account id is the `CLOUDFLARE_ACCOUNT_ID` repository variable.

## Project map

```
index.html                 page copy (Russian is the source of truth)
src/main.js                wiring: UI ↔ game ↔ Pippi ↔ 3D
src/content/               ← everything the library edits: books, events, hours, contacts
src/i18n/                  en.js (everything) + ru.js (script-only strings)
src/scene/                 three.js: book & page curl, pop-up layers, canvas-painted covers/pages
src/pippi/                 chat UI + librarian brain (scripted now, AI-ready)
src/game/                  coins/stamps state, reader's card, toasts, synthesized sounds
src/ui/                    scroll → book position, theme, oracle, events, contacts
src/pwa.js                 service worker registration, install prompt, offline notes
scripts/                   Gemini art, background removal, icons, post-build headers
```

## Pippi as an AI librarian (next step)

The chat already talks to a swappable "brain" (`src/pippi/librarian.js`):
`reply(message, context) → [{ say } | { book } | { chips } | { action }]`.
Set `VITE_PIPPI_ENDPOINT` to a server that speaks this contract (an LLM with
tools such as `searchCatalog`, `isOnShelf`, `reserveBook`, `getEvents`) and Pippi
becomes a real agent — the UI does not change. Pippi can already act on the page
(`goto`, `theme`, `passport`, `lang`, `upside`), so the agent can too.

## Art pipeline

All illustrations were generated with `gemini-3.1-flash-image` in one shared
picture-book style (`scripts/art-manifest.mjs`), the house from the real photo.
The reference photo (`art/ref/building.jpg`) is kept out of the repository because it
shows children; put it back locally before regenerating `house`. Icons: `npm run art:icons`.

```bash
npm run art -- house,olive        # (re)generate; reads GEMINI_API_KEY from .env
npm run art:cut -- house,olive    # cut out → public/art/*.webp + src/scene/art-meta.json
```

## Before going live — placeholders to replace

- `src/content/library.js` — **hours, Telegram/Instagram links, e-mail are invented.**
- `src/content/events.js` — only the 25 September birthday is real; the rest are samples.
- `src/content/books.js` — sample shelf; swap for the real catalogue.
- JSON-LD and the address block still need the street address.
- Ages 3–17, "free card", "2 books for 2 weeks" are assumptions.

## Rights note

Pippi Longstocking is a protected character (The Astrid Lindgren Company).
The art here is an original "inspired-by" redhead, but using the **name** and the
recognizable look on a public site should be cleared with the rights holder
(non-profit library use is often granted) — or rename her (e.g. «Рыжик»), which is
a copy change in `index.html` and `src/i18n`.
