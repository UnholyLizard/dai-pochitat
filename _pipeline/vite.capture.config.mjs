// Capture build of «Дай почитать!»: the normal production build plus three injected lines that expose the game
// state (`window.__dpGame`, so a shot can start from the site's own "start over") and the 3D book
// (`window.__dpStage`: the stage's public API; `window.__dpScene`: book position, spreads, camera) so the capture can
// wait for spreads, read the page-turn position and measure pop-up layers on screen. `src/` is never edited.
// usage (from the repo root): npx vite build --config _pipeline/vite.capture.config.mjs --outDir _pipeline/site --emptyOutDir
import base from '../vite.config.js';

// [file suffix, anchor, injected after the anchor]
const HOOKS = [
  ['/src/main.js', "stageEl.classList.add('is-ready');", ' window.__dpStage = stage;'],
  ['/src/main.js', 'game.visit();', ' window.__dpGame = game;'],
  ['/src/scene/stage.js', 'renderer.setAnimationLoop(tick);',
    ' window.__dpScene = { get B() { return B; }, spreads, book, camera, renderer, scene, get candidate() { return candidate; } };'],
];

export default {
  ...base,
  build: { ...base.build, sourcemap: false },
  plugins: [
    ...(base.plugins || []),
    {
      name: 'dp-capture-hooks',
      enforce: 'pre',
      transform(code, id) {
        const file = id.replace(/\\/g, '/').split('?')[0];
        const hooks = HOOKS.filter(([suffix]) => file.endsWith(suffix));
        if (!hooks.length) return null;
        for (const [suffix, anchor, add] of hooks) {
          if (!code.includes(anchor)) throw new Error(`capture hook anchor "${anchor}" not found in ${suffix}`);
          code = code.replace(anchor, anchor + add);
        }
        return code;
      },
    },
  ],
};
