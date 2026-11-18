# Showcase pipeline — «Дай почитать!»

Deterministic capture + motion-design render for `showcase/dai-pochitat-site/` (the 16:9 site film with a synthesized
score, raw / captioned / mockup stills). Copied from the MonteGigs "Nocturne" pipeline (`MG/MonteGigs/_pipeline`, whose
README has the history of the stage and the sequence format). Brief: `PROMPT.md`. The audio uses the `motion-reel`
skill's toolkit (`dsp.py`, `mix.mjs`).

1. `cd tools && npm install` (playwright-core + ffmpeg-static; drives the installed Chrome with the real GPU).
2. Capture build (from the repo root):
   `npx vite build --config _pipeline/vite.capture.config.mjs --outDir _pipeline/site --emptyOutDir`
   The normal production build plus three injected lines: `window.__dpStage` (the 3D book's public API),
   `window.__dpScene` (page-turn position, spreads, camera) and `window.__dpGame` (the reader's card). `src/` is never
   edited.
3. Footage: `node capture.cjs ../footage book,casting,chest,chat,catalog,mobile` (two processes in parallel are fine;
   ~170 ms/frame at 2880×1800). The shots are in `tools/shots.cjs`.
   - No dev server: `_pipeline/site/` is served from disk through request routing at `http://dp.localhost/`
     (a `*.localhost` host is a secure context: the site calls `crypto.randomUUID()`; `http://dp.local/` is not).
   - `/api/*` GETs (catalogue, events, suggestions, the casting tally) and book covers are answered by the live site
     once and kept in `cache/live/` (identical bytes on every later run). Nothing is written to the live site: a
     casting vote is answered locally with the cached tally plus that one vote; every other write gets a 404 (guest).
   - Frozen boot: `vt.js` is frozen by an init script; the clock is pinned to Sat 24 Oct 2026, 16:30 in Bar (`EPOCH`),
     so the birthday party reads as past and the 30 October evening as upcoming.
   - The book: every shot waits for the stage, walks all eight chapters (each spread loads its art in real time),
     removes what the walk left on screen (the "read to the end" toast), then runs `setup`. `book` calls the site's own
     `game.reset()` there, so the film starts with an empty reader's card; later shots seed `dp:game` (`game:`) so
     coins and stamps continue.
   - Never scroll with the site's own links in a shot (`goTo` uses `behavior: 'smooth'`, which runs in real time);
     drive `scroll` keyframes instead. `H.layer(id, v)` projects a pop-up layer of the 3D book to viewport px (the owl,
     the lamp, the candidate on stage) for the pointer; measure it after the page turn has settled.
   - Shot times sit on the score's grid (0.6 s a beat): a segment that starts on a beat keeps its clicks on beats.
   - Lab: `node capture.cjs ../lab/x <shot> --lab --shot`, `node probe.cjs <pre> "<js>" [--then <s> --eval2 "<js>"]`,
     `node peek.cjs ../lab/x [--theme night] [--mobile] [--route catalog/]`; quick look: `--every 6`.
4. Raw stills: `node stills.cjs [prefix...]` → `showcase/dai-pochitat-site/screenshots/raw` (desktop 2880×1800, phone
   1170×2532, the full page stitched from 900 px tiles at 1.5×).
5. Score and effects (from `_pipeline/`, `MOTION_REEL_SKILL` = the skill's folder):
   `uv run film/audio/score.py` (music.wav + `film/beats.json`: D major, 100 BPM, 22 bars = 52.8 s),
   `uv run film/audio/sfx.py` (sfx.wav + `film/hits.json`; hit times come from the sequence's anchors, so re-run it
   after retiming), `node $MOTION_REEL_SKILL/scripts/mix.mjs film --no-mux` (mix.wav, −14 LUFS, true peak ≤ −1 dBTP).
6. Stage: `stage/stage.html` + `stage/sequence.json`. Restyled to the site: Literata (display and body, italic
   highlight), Nunito (UI), Caveat (chapter labels) from `@fontsource`; paper `#f4e8cf`, ink `#2b1b12`, cobalt
   `#1f4dd8`, sun `#f6c343`, terracotta `#c94a30`; evening `#141a30`. Every themed colour is mixed by `--night`, set
   per frame from the sequence's `glow` envelopes: when the site's lamp is tapped, the film's backdrop turns to evening
   with it. Captions carry the site's chapter label (numbered ring + hand lettering) and a sun squiggle
   (`"squiggle": px`, `0` = none). `ambient.motes` (0–1): dust by day, fireflies in the evening.
   Preview: `node render.cjs stills ../preview 6.9,22.9 --dpr 1`; whole film: `frames ../frames_prev --dpr 0.5`;
   sheets: `node sheet.cjs ../frames_prev ../lab/sheet.jpg --step 60`.
7. Frames: `node render.cjs frames ../frames4k --workers 5 --dpr 2 --force --prune` (~7 min);
   encode: `./encode.sh ../frames4k ../../showcase/dai-pochitat-site/video dai-pochitat_site-presentation 330 ../film/audio/mix.wav`;
   QA: `./qa.sh ../../showcase/dai-pochitat-site/video dai-pochitat_site-presentation ../../showcase/dai-pochitat-site/screenshots/contact-sheet.jpg`.

`site/`, `cache/`, `footage/`, `lab/`, `preview*/`, `frames*/`, `tools/node_modules/`, `film/audio/*.wav` and
`showcase/` are working folders or media: git-ignored. `_pipeline/` and `showcase/` are excluded from ESLint.

## Works: the 9:16 Instagram cuts

| work | canvas | sequences | output |
| --- | --- | --- | --- |
| `stage/` | 1920×1080 | `sequence.json` (the site film, 52.8 s) | `showcase/dai-pochitat-site/video/` |
| `stage-instagram/` | 1080×1920 | `reel.json` (33.6 s), `story.json` (21.6 s) | `showcase/dai-pochitat-site/instagram/` |

The format (works, blocks, `bug`, `scrim`, caption layout `"v"`) is the Kotva reference's (`Business_dashboard/_pipeline/README.md`).
`stage-instagram/stage.html` is generated from this project's `stage/stage.html` (same brand, fonts, Day/Evening
mixing by `--night`) re-laid-out for a phone: the bug is the site's mark tile + wordmark, the caption scrim is the
paper colour (evening blue at night), the chapter label (ring + Caveat) heads every `"v"` caption.

1. Audio (from `_pipeline/`): `MOTION_REEL_SKILL=<skill> uv run stage-instagram/audio.py reel` (and `story`) re-cuts the
   film's music-box score bar by bar (`ORDER` in the script: lamp tap on the evening bar, band back on the next
   chapter) and places the film's SFX from the sequence's segments and footage clicks; then
   `node $MOTION_REEL_SKILL/scripts/mix.mjs stage-instagram/film-reel --no-mux` → `film-reel/audio/mix.wav` (−14 LUFS).
   Re-run both after retiming. The sequence length must equal the bar count × 2.4 s (the script asserts it).
2. Preview: `node render.cjs stills ../lab/ig 0,2.9,9.6 --seq ../stage-instagram/reel.json --dpr 0.5`; whole film at
   `frames ../lab/half_reel … --dpr 0.5` (~1.3 min).
3. Frames: `node render.cjs frames ../frames_reel --seq ../stage-instagram/reel.json --workers 5 --dpr 2 --force --prune`
   (same for `story` → `../frames_story`).
4. Encode: `./encode-vertical.sh ../frames_reel ../../showcase/dai-pochitat-site/instagram dai-pochitat_reel 174 ../stage-instagram/film-reel/audio/mix.wav`
   — with the 5th argument the master and `_ig.mp4` carry the score and `_ig_silent.mp4` is written for posting with
   music picked in the Instagram app.

## Notes from this run (fixes to copy back to the reference pipeline)

- Instagram run (not yet copied back: writing outside this repository was not permitted in that session):
  - `stage*/stage.html`: a segment's `"cursor": [a, b]` (footage s) — documented in the reference's sequence format but
    not implemented by its stages — now overrides the shot's cursor window (here: no pointer during the intro, so
    the cover frame is clean). Two lines in `compile()`'s `seg()` and `applyLayer()`.
  - `tools/encode-vertical.sh`: optional 5th argument, an audio file (AAC in the master and the upload file, plus a
    silent `_ig_silent.mp4`).
  - `stage-instagram/audio.py`: a score re-cut + sequence-driven SFX for any 9:16 cut, reusable wherever the 16:9
    film has its own `score.py` / `sfx.py`. Note that `from dsp import *` binds `rng` at import, so `dsp.seed()` does
    not reseed the instruments of an importing module: seed `module.rng` directly.

- `vt.js`: a paused animation never reaches `finished`, so `animation.finished` never resolved and a coin that removes
  itself after its flight stayed on the page (at 0,0). The shim now finishes an animation once the clock passes its
  end, 0.5 ms early: at 899.9999 of 900 ms Chrome already drops the animation from `document.getAnimations()`.
- `stage.html`: camera scale is interpolated in log space (a constant-rate dolly); a linear lerp lingered big.
- `encode.sh` takes an optional audio file (AAC 256 kb/s; 192 kb/s in the web cut); `sheet.cjs` replaces the slow
  shell loop for contact sheets of thousands of frames.
- The catalogue shot's first run fetches each search prefix from the live API in real time (the result lands a few
  frames later than on cached runs): capture it twice, keep the second.
- The reference stage's `editor/` is copied but was not run against this stage.
