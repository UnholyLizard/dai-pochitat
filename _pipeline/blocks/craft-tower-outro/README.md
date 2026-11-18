# CRAFT-TOWER outro — stage block

The studio sign-off for every showcase film: the lighthouse logo builds itself (plinth, floors, gallery, roof), the
lantern lights up and its two amber beams sweep the background, then **CRAFT-TOWER** · DOO · *Design, Web & Software
Engineering Studio* · `craft-tower.com`. One block, any canvas: 16:9 films, 9:16 reels and stories, 1:1 posts.

## Use it in a sequence

Add one top-level object (the key is free; `outro` by convention) and make the sequence end ≥ 4.5 s after `in`:

```json
"outro": { "block": "craft-tower-outro", "in": 23.6, "credit": "Kotva — a concept by" }
```

The block covers the whole frame with its own backdrop (fading in over the last scene), so nothing else needs to end
before it. In the editor it appears under *Stage items* with a bar from `in` (to `out`, if set).

| field | default | |
| --- | --- | --- |
| `block` | — | `"craft-tower-outro"` |
| `in` / `out` | — / open-ended | stage times (seconds or `@refs`) |
| `credit` | `""` | a line above the logo, e.g. `"Kotva — a concept by"`; `{dot:.}` / `*x*` spans allowed |
| `company`, `legal`, `tagline`, `url` | `CRAFT-TOWER`, `DOO`, `Design, Web & Software Engineering Studio`, `craft-tower.com` | the studio's details |
| `accent`, `ink`, `bg` | `#F59E0B`, `#F8FAFC`, `["#05070B", "#0B1220"]` | the logo's amber, the tower/wordmark, the backdrop (centre, edge) |
| `fadeIn` | `0.5` | backdrop fade over the previous scene (s) |
| `outDur` | `0` | > 0: fade the block out over this many seconds after `out` |
| `safeTop`, `safeBottom` | 9:16 → `250`, `420`; else `0` | px kept clear for platform UI; the lockup centres between them |

Timing (seconds after `in`): logo 0.15–1.2, beams 1.05–1.7, wordmark 1.1–2.2, DOO 1.55–2.4, tagline 1.8–2.5,
URL 2.05–3.1. Everything has landed by 3.4 s (`minDuration`); 4.5–5 s reads comfortably.

## Files

- `block.js` — the block (no dependencies). `render(t)` is a pure function of time, so editor, stills and frames match.
- `fonts/` — Inter variable (latin + latin-ext, the craft-tower.com typeface), SIL Open Font License (`Inter-LICENSE.txt`).
- Demo: `stage/studio-outro.json` (16:9, the block alone); in use at the end of `stage-instagram/reel.json` / `story.json`.

## Taking it to another project's pipeline

1. Copy `_pipeline/blocks/` (this folder and `loader.js`).
2. In that project's `stage.html` (once): `<script src="../blocks/loader.js"></script>` before the stage script, a
   `<div id="blocks" class="fill"></div>` layer under the grain/vignette, and three hooks —
   `blocks: StageBlocks.collect(seq, T)` in `compile()`, `await StageBlocks.mount($('#blocks'), M.blocks, { w, h })`
   after `buildDom()` in `apply()`, and `StageBlocks.render(t)` in `render()`.
3. Add the `"outro"` object to the sequence.

A new block is a folder `blocks/<name>/block.js` that registers
`window.STAGE_BLOCKS[name] = { name, version, defaults, minDuration, mount(host, cfg, { w, h }) }`; `mount` returns
`{ ready: Promise, render(localT, { out }) }` (see `loader.js`).
