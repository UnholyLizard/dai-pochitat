# «Дай почитать!» — website concept

**Live:** https://dai-pochitat-mne.craft-tower.com · installable PWA, works offline

A cozy, game-like site for a small non-profit kids & teens library in the yellow
Kompas school-garden house in Bar, Montenegro. Russian and English.

**The idea: the whole site is a pop-up book on a sunlit table.** Scrolling turns its
pages; each chapter is a paper scene that stands up from the spread (three.js).
A red-haired librarian (nicknamed «Рыжик» / Ginger) chats, recommends books and tells
riddles — unless readers vote someone else into the role in the **casting**. Visitors
collect coins, stamps and hidden "book folk" in a personal library card.

```bash
npm install
npm run dev          # http://localhost:5173 (page only)
npm run dev:worker   # build + local D1 + wrangler dev on :8787 (page + /api); `npm run dev` proxies /api to it
npm run check        # lint + production build (+ dist/_headers with CSP)
npm run deploy       # build → wrangler deploy → apply D1 migrations (remote)
```

## What's inside

| Chapter (spread) | Pop-up scene | Page content |
|---|---|---|
| Cover | Cloth book with gold foil, the house on a tipped-in plate | Hero, meet the librarian |
| 1 · The yellow house | The real building (redrawn from the photo), olive tree, cypresses, mountains | About the library |
| 2 · The room | Window to the sea, fringed lamp (click → evening), shelves, kids on cushions | What's there, how it works |
| 3 · Casting | Puppet-theatre stage, spotlight, director's chair; the chosen candidate pops up on stage | **Casting for the librarian's role**: audition, try in chat, vote, live results |
| 4 · The magic chest | The librarian on a treasure chest, spotted horse (click → it gets lifted) | **Book oracle**: age + mood → a book |
| 5 · Parties | Balloons, bunting, cake of books (click → confetti) | Events as tickets, "Add to calendar" (.ics) |
| 6 · Find us | Illustrated map of Bar, 3D pin over the house, sailboat | Address, hours, joining steps, contacts |
| Back cover | "The end… or the beginning?" | Footer (+ a badger hiding in it) |

**Casting.** Eight candidates (`src/content/librarians.js`): the current red-haired
librarian, Cinder the black cat, Patches the calico explorer cat, Mila the literature
student, Nika the teen comic artist, Tim the junior professor, Captain Marko from Bar
harbour and Bookmark the robot. Each has a headshot, a full-body audition pose, a card
and a **voice**: whoever the reader picks answers in the chat in their own style.
Votes go to `/api/casting` (a small Worker + D1, one anonymous vote per browser,
changeable, rate-limited, same-origin only); results show after you vote.

**Game layer** (stored in the visitor's browser, `localStorage`):
coins → ranks (Guest → Captain of the Book Seas), 14 stamps, 7 hidden critters
(6 in the 3D scenes, 1 in the footer), wish-list, a secret word for the librarian
at the top rank — a reason to visit the real library.

**Evening mode** — the lamp in chapter 2 or the header toggle: night lighting,
fireflies instead of dust, dark UI. Follows the OS colour scheme on first visit.

**Magnifier** — the round button on the book's corner opens it full-screen: drag to move,
pinch / wheel / ＋ − to zoom, Esc or "Back to reading" to return (the rest of the page is
`inert` meanwhile). **Tilt** — on phones the book sways with the gyroscope like it does with
the mouse on a computer (iOS asks permission on the first tap on the book or the magnifier).
On phones the 3D stage is sized to `100lvh` and the book placed within `100svh`, so the
address bar sliding in and out never makes it jump.

## PWA

- Installable (manifest with icons, maskable icon, shortcuts to the chest / parties / map, screenshots).
- Offline: the app shell, fonts and 3D engine are precached by a Workbox service worker
  (`vite-plugin-pwa`); illustrations are cached as the reader turns the pages, so a book
  read once opens without internet. The librarian works offline too (the brain is local);
  casting votes need a connection.
- Updates wait for the reader: a toast offers "Refresh" when a new version is deployed,
  so an open book never loses the 3D chunk it was built with.
- Install is offered in the Contents menu and by the librarian (ask "how do I install it?");
  on iPhone they explain *Share → Add to Home Screen*. Installing earns the «Книга дома» stamp.

## Hosting

Cloudflare Workers (`wrangler.jsonc`): static assets from `dist/`, plus `worker/index.js`
for `/api/*` only (`run_worker_first`). D1 database `dai-pochitat-casting` (created on
first deploy; schema in `migrations/`), rate-limit binding `VOTE_LIMIT`, Workers Logs and
traces on. Custom domain `dai-pochitat-mne.craft-tower.com`. `scripts/postbuild.mjs`
writes `dist/_headers`: a strict CSP (inline scripts allowed by hash), HSTS, immutable
caching for hashed assets, `no-cache` for the service worker and manifest. Unknown
paths get `public/404.html`.

CI (`.github/workflows/ci.yml`) lints and builds every push / PR. Pushes to `main`
deploy automatically once a `CLOUDFLARE_API_TOKEN` repository secret exists
(token permissions: *Workers Scripts: Edit*, *Workers Routes: Edit*, *D1: Edit*, zone
*DNS: Edit* for the custom domain); the account id is the `CLOUDFLARE_ACCOUNT_ID`
repository variable.

## Project map

```
index.html                 page copy (Russian is the source of truth)
src/main.js                wiring: UI ↔ game ↔ librarian ↔ 3D
src/content/               ← everything the library edits: books, events, hours, contacts, candidates
src/i18n/                  en.js (everything) + ru.js (script-only strings)
src/scene/                 three.js: book & page curl, pop-up layers, canvas-painted covers/pages
src/librarian/             chat UI + librarian brain (scripted, persona-aware, AI-ready)
src/game/                  coins/stamps state, reader's card, toasts, synthesized sounds
src/ui/                    scroll → book position, theme, casting, oracle, events, contacts
src/pwa.js                 service worker registration, install prompt, offline notes
worker/, migrations/       /api/casting Worker and its D1 schema
scripts/                   Gemini art, background removal, icons, post-build headers
```

## The librarian as an AI agent (next step)

The chat already talks to a swappable "brain" (`src/librarian/librarian.js`):
`reply(message, context) → [{ say } | { book } | { chips } | { action }]`, and the
context carries the casting winner's id so an LLM can speak in that candidate's voice.
Set `VITE_LIBRARIAN_ENDPOINT` to a server that speaks this contract (an LLM with tools
such as `searchCatalog`, `isOnShelf`, `reserveBook`, `getEvents`) and the librarian
becomes a real agent — the UI does not change. It can already act on the page
(`goto`, `theme`, `passport`, `lang`, `upside`, `install`), so the agent can too.

## Art pipeline

All illustrations were generated with `gemini-3.1-flash-image` in one shared
picture-book style (`scripts/art-manifest.mjs`), the house from the real photo.
Candidates' full-body poses are generated from their own headshots (`ref: 'raw/…'`)
so faces and outfits stay consistent. The reference photo (`art/ref/building.jpg`) is
kept out of the repository because it shows children; put it back locally before
regenerating `house`. Icons: `npm run art:icons`.

```bash
npm run art -- house,olive        # (re)generate; reads GEMINI_API_KEY from .env
npm run art:cut -- house,olive    # cut out → public/art/*.webp (+ avatars) + src/scene/art-meta.json
```

## Before going live — placeholders to replace

- `src/content/library.js` — **hours, Telegram/Instagram links, e-mail are invented.**
- `src/content/events.js` — only the 25 September birthday is real; the rest are samples.
- `src/content/books.js` — sample shelf; swap for the real catalogue.
- JSON-LD and the address block still need the street address.
- Ages 3–17, "free card", "2 books for 2 weeks" are assumptions.

## Characters

The red-haired librarian is an original picture-book character; the site never uses
a name for her other than the nickname «Рыжик» / Ginger. Mila is an original character
too (no real-person likeness). To rename anyone, edit `src/content/librarians.js`.
