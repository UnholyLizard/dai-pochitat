You are a senior motion and product-presentation designer. This project already has its 16:9 site presentation (made with
`PROMPT.md`). Now cut an Instagram **reel** and **story** from it for our studio profile. Caption language: [EN].

- Reel: 9:16, 1080×1920, 25–35 s. Story: 9:16, 15–25 s (anything under 60 s plays as one card).
- Deliver a 60 fps master and a 30 fps upload file of each. Leave both silent: we add music in the Instagram app.
- Both end with our studio outro block, `craft-tower-outro`.

## Start from what exists, don't redo it
- Read `_pipeline/README.md` (the "Works" section), the 16:9 sequence `stage/sequence.json`, the footage meta
  (`footage/*/meta.json`: clicks, drags, measured targets) and `showcase/<project>-site/DESCRIPTION.md`.
- Reuse the captured footage. Capture new shots only when a beat really needs one (for example a phone-native view). If
  you do, show me the shot list before capturing.
- Every 9:16 sequence lives in the 9:16 work `stage-instagram/` (`reel.json`, `story.json`), with `"canvas": { "w": 1080, "h": 1920 }`.
  The stage editor (`node editor/server.cjs`) loads it next to the 16:9 work.
  If this project's `_pipeline` predates works and blocks, copy `stage-instagram/`, `blocks/`, `tools/encode-vertical.sh`,
  the work-aware `tools/render.cjs` + `tools/stage-data.cjs` and `editor/` from the Kotva reference pipeline
  (`Business_dashboard/_pipeline`). Then restyle `stage-instagram/stage.html` to the brand, as `PROMPT.md` asks for `stage/`.
- The outro is the block `blocks/craft-tower-outro/`, imported by one sequence line:
  `"outro": { "block": "craft-tower-outro", "in": <t>, "credit": "<Project> — a concept by" }` (≥ 4.5 s before the end).
  Don't fork or restyle it per project: it is the studio's sign-off. Its README has the settings.

## Structure
1. **Product intro, 0–3.6 s (required).** Viewers arrive without context, so say what the product is and who it is
   for before any feature. Show the product from frame 0 (the main screen building itself works well), with the brand
   bug (logo + name) and a two-line promise: a kicker naming the category and audience, then a title such as
   "Your whole business, *in one dashboard.*". The promise must be accurate: don't call a team tool "personal".
2. **Hook beat:** the most visual feature (3D, motion, a live result), as a close-up.
3. **2–3 feature beats** of 3–5 s, one feature each, in the 16:9 film's order. Prefer features that read in a tall
   frame: side panels, chats, mobile, single cards. Skip wide tables and boards unless a close-up carries them.
4. **Languages or mobile beat** if the product has one (the phone at `s` ≈ 1.25 fills a 9:16 frame).
5. **Studio outro** (the block), ≥ 4.5 s. End on it with no fade, so the reel loops cleanly.
- The story is the intro, 2–3 beats and the outro.
- Show me the beat list with times and captions before the full render.

## Layout rules for 9:16
- Instagram UI covers the top 250 px, the bottom 420 px and a ~130 px action column on the right of the lower half.
  Keep captions, click targets, toasts and the outro inside what's left (the editor's *Guides* draw these zones).
  Story UI is smaller, so a reel-safe layout serves both.
- Captions: layout `"v"` at x 72, y 340, w 936. Kicker plus a title of at most two lines, 84–92 px (about 20 characters
  per line at 92 px), and the second line in the highlight style. Add a body line only if the beat is long enough to read it.
- The browser is 1440 CSS px wide, so in 9:16 frame a region of the UI, not the whole window: `s` 0.75–0.82 for "the whole
  product" and 1.3–1.9 for close-ups.
- Render at `--dpr 2` (2160×3840, supersampled to 1080 wide), so `s` ≤ 2 stays native. Never go above 2.
- The browser content above the focus area runs under the captions. The stage's caption scrim fades it while a caption
  is up, and the phone sits above the scrim. Check every caption over light UI.
- Frame click targets above y ≈ 1500. Move the camera between "read" framing (target lower, caption above) and "act"
  framing (target higher, caption gone).
- Long waits inside one shot (AI thinking, streaming): jump-cut with two segments of the same shot and different
  `start` (`"xf": 0.25`) instead of speeding anything up.
- The brand bug runs through the intro and the hook beat. No HUD (leave `hud` out).

## Workflow
1. Recon: pick beats and the footage time ranges for each from the meta (events, scroll ranges, when content settles).
2. Write `reel.json` and `story.json`. Times follow footage through anchors (`@seg`, `{ "seg", "at" }`).
3. Preview key moments at `--dpr 0.5` (`render.cjs stills … --seq ../stage-instagram/reel.json`) and iterate. A
   half-res whole-film pass (`frames … --dpr 0.5`) catches timing problems.
4. Render with `node render.cjs frames ../frames_reel --seq ../stage-instagram/reel.json --workers 5 --dpr 2 --force --prune`,
   then the same for the story.
5. Encode with `./encode-vertical.sh ../frames_reel ../../showcase/<project>-site/instagram <project>_reel <coverFrame>`,
   then the same for the story.
6. QA (below), then update `DESCRIPTION.md`.

## Lessons from the first run (Kotva)
- Without an opening line saying what the product is, the reel was unclear. The product intro is now step 1.
- 9:16 close-ups magnify the UI 1.5–2×, so glitches invisible in 16:9 become obvious (chips re-animating on every
  keystroke). Step through every close-up frame by frame. Fix the product, not the video: then re-capture the shot and
  re-render every film that uses it (16:9 included), plus its stills.
- Cover frame: avoid moments with the cursor, a hover tooltip or a half-typed caption. The intro frame (logo + promise
  + product) makes the best cover, and it fits the profile grid's centre 1080×1440 (3:4) crop.
- Shots are fresh page loads, so state changed in an earlier beat must be re-applied in later shots (see `AFTER_REPLAN`
  in `capture.cjs`), or the reel contradicts itself.
- Crossfades between shots at different scroll positions double-expose. Keep them ≤ 0.34 s and hide them in a camera move.
- Set ambient envelopes' `out` to the sequence duration, or the editor reports items past the end.

## Deliverables in `showcase/<project>-site/instagram/`
- `<project>_reel_1080x1920_60.mp4`, `<project>_reel_ig.mp4`, `<project>_reel_cover.jpg`, and the same three for the story.
- `contact-sheet_reel.jpg` and `contact-sheet_story.jpg` (1 fps).
- In `DESCRIPTION.md`: rows in the assets table (with the real durations), and in "Ready-to-use copy" an Instagram caption
  (≤ 300 characters, ending "Designed & built by CRAFT-TOWER · craft-tower.com") plus 6–8 hashtags.
- Copy any pipeline fixes back into the reference `_pipeline` (stage, blocks, tools, editor) and its README.

## QA before reporting
- Check every output with ffmpeg: 1080×1920, 60 / 30 fps, the durations, H.264 High, yuv420p, bt709, and `moov` before `mdat`.
- Make the 1 fps contact sheets. Step through every transition, click and caption entrance frame by frame. Check a 1:1 crop of
  the tightest close-up.
- Check the cover and every caption against the safe zones.
- Check that every path in `DESCRIPTION.md` exists and that every number in it matches the code or tool output.
- When done, send me both upload files, the reel cover and the reel contact sheet.

## Working style
- Same as `PROMPT.md`: delegate small, fully specified tasks to Haiku agents. Do beat design, the stage and QA yourself.
  Browse read-only, and don't commit media without asking.
