You are a senior motion and product-presentation designer. Create a high-end product presentation of this project's website for our design-concept site: a short cinematic video plus a full screenshot set.
- Length: 45–55 s, 16:9, 60 fps. Caption language: [EN].

## Use the reference pipeline, don't reinvent it
- `\_pipeline` and adapt it (see its README):
- `tools/vt.js`: virtual-time shim. It virtualizes timers, rAF, performance.now and Date.now, and drives CSS animations and transitions through WAAPI, so every frame is deterministic.
- `tools/capture.cjs`: the `SHOTS` table (viewport, scroll keyframes, mouse paths, clicks, per-shot CSS). Writes JPEG frames plus meta.json (scrollY, mouse, clicks).
- `tools/stills.cjs`: raw screenshots.
- `stage/stage.html`: the HTML motion stage, with `render(t)` as a pure function of time. It has the 3D browser "camera", phone mockup, cursor with click ripples, kinetic captions, HUD, a screenshot-mosaic opener and end card, and grain and vignette.
- `tools/render.cjs`: parallel frame renderer (`frames` and `stills` modes, `--clean` hides captions).
- Tooling: `playwright-core` and `ffmpeg-static` in `tools/`, driving the installed Chrome (no Chromium download).

## Workflow
1. Recon. Read the site code: sections, toggles, the localStorage keys for theme, language and cookie consent, fixed overlays, and any smooth-scroll or scroll-jacking. Take one screenshot of the target. Use the deployed site if local dev lacks real content. If you use dev, hide the dev overlays.
2. Shot list. Plan 6–8 shots of 4–11 s, one feature per shot. Show me the list before capturing.
3. Capture. Desktop at 1440×900 @2x, mobile at 390×844 @2x, 60 fps, deterministic.
4. Raw stills (delegate to a Haiku agent). Every desktop section @2x, the key states (modes, themes, languages), full-page captures, and mobile @3x.
5. Stage. Restyle it to the brand (the site's colors and font), write the timeline and captions in `stage/sequence.json`, preview key moments at 1x with `render.cjs stills`, and iterate. The visual editor (`node editor/server.cjs`) edits the sequence live and runs stills/frames/encode; use it for timing passes and caption tweaks.
6. Render 3840×2160 frames, encode, run QA, and export the presentation and mockup stills.
7. Description. Write `DESCRIPTION.md` from `_pipeline/DESCRIPTION.template.md` (see the section below).

## Lessons from showcase #1 (craft-tower.com)
- Raw CDP `Page.captureScreenshot` ignores deviceScaleFactor. Use `page.screenshot` or `clip.scale = DPR`. Check output resolution with ffmpeg before any long render.
- Pre-seed localStorage (cookie consent, theme, language) so no banners appear. Force `scroll-behavior:auto` and hide scrollbars. Walk the whole page once to load lazy images before freezing time.
- To replay entrance animations, scroll away in real time, freeze time, then scroll back.
- Drive scrolling with your own eased keyframes, not wheel events, so the site's scroll handlers don't interfere.
- Measure control positions in the page with getBoundingClientRect instead of guessing. Store them in meta for the cursor overlay and zoom targets.
- Hide fixed hints and widgets per shot with injected CSS when they cover content. Keep them in the shots where they are part of the story.
- Time stage effects to the site's real transitions. Find them by checking frame brightness and timing.
- Per-letter text animation breaks kerning (e.g. "To"), so compensate. Keep zoom-ins clear of captions, and fade the HUD during close-ups.
- Never fake resolution (no upscaling).

## Lessons from showcase #2 (Mirna guesthouse)
- Expose live 3D scenes through a capture-only Vite config plugin (`vite.capture.config.mjs`), not by editing `src/`.
- After resetting scene state in `onFreeze`, render it once explicitly, or frame 0 shows the stale last paint.
- Measure click targets only after the scroll before them has settled (`measure` entries in `capture.cjs`).
- Cross-tab demos: send the real request from a second tab and hold the page's `storage` listeners (wrapped at
  registration) until a chosen frame. A capturing `stopImmediatePropagation()` listener does not hold them reliably.
- Grep the built CSS for `backdrop-filter`: Lightning CSS keeps only the last of the prefixed/standard pair.
- Put a caption up before the event it announces (the toast arriving), not after it.

## Deliverables in `showcase/<project>-site/`
- `video/`: `<project>_site-presentation_4k60.mp4` (CRF 17), `_1080p60.mp4` (CRF 15), `_1080p60_web.mp4` (CRF 22, maxrate 8M) and `poster_4k.jpg`. All H.264 High, yuv420p, tagged bt709, `+faststart`.
- `screenshots/raw/`, `screenshots/presentation/` (with captions, 3840×2160), `screenshots/mockups/` (no captions, 3840×2160) and `contact-sheet.jpg`.
- `DESCRIPTION.md`: what the product is and its strengths, for the design-concept site.
- Copy any pipeline fixes back into the reference `_pipeline` folder.

## DESCRIPTION.md
- Start from `_pipeline/DESCRIPTION.template.md` and keep its section order: pitch, overview, strengths, at a glance, design language, showcase assets, ready-to-use copy. Drop a section only when it truly doesn't apply.
- Source every claim from the project itself: README, code, translation files, tool output (for example `npm run check`) and what you saw while capturing. Write in the caption language.
- Strengths are concrete and checkable, not adjectives. Name the feature, then what it does for the user ("Hints connect back to earlier lessons", not "smart hints").
- Re-check every number, name and price against code or tool output before saving. Never invent metrics, users, awards, reviews or testimonials. Leave out anything you can't verify.
- Take the palette and fonts from the site's own tokens (CSS variables, font links) and use the same hex values as the stage.
- Asset paths are relative to `showcase/<project>-site/` and must match the files you delivered. Give the live URL only if the user confirmed it.
- Keep it scannable: short paragraphs, one idea per bullet, and a compact table for the facts.

## QA before reporting
- Check that every path in `DESCRIPTION.md` exists and every number in it matches the code or tool output.
- Make a 1-fps contact sheet of the final video. Step frame by frame through every transition and click. Check a 1:1 crop of the tightest zoom for sharpness. Check every output's resolution and duration with ffmpeg.
- When done, send me the web cut and the contact sheet.

## Working style
- Delegate small, fully specified tasks (tool setup, raw stills, renaming, contact sheets) to Haiku subagents at medium or high effort. Do shot design, the stage and QA yourself.
- Browse read-only: no form submissions, logins or purchases.
- Don't commit media without asking, since `showcase/` can be hundreds of MB.
- Leave the video silent unless I provide a music track.
