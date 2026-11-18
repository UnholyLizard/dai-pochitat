// Imported blocks for any stage.html: a top-level sequence object with "block": "<name>" — e.g.
//   "outro": { "block": "craft-tower-outro", "in": 27.5, "out": 32, "credit": "Kotva · a concept by" }
// loads blocks/<name>/block.js (once) and mounts it above the scene. Its other fields are the block's settings
// (see the block's README); "in" / "out" are stage times (seconds or "@refs"), the block renders in local time.
// Block contract: window.STAGE_BLOCKS[name] = { name, version, defaults, minDuration, mount(host, cfg, { w, h }) },
// mount() returns { ready: Promise, render(localT, { out }) } and must be a pure function of time.
(() => {
  const REG = (window.STAGE_BLOCKS = window.STAGE_BLOCKS || {});
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
  const loads = {};
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  function load(name) {
    if (REG[name]) return Promise.resolve(REG[name]);
    if (!/^[\w-]+$/.test(name)) return Promise.reject(new Error(`bad block name "${name}"`));
    if (!loads[name]) {
      loads[name] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = `${BASE}${name}/block.js`;
        s.onload = () => (REG[name] ? res(REG[name]) : rej(new Error(`block "${name}" did not register`)));
        s.onerror = () => { delete loads[name]; rej(new Error(`block "${name}" not found (blocks/${name}/block.js)`)); };
        document.head.appendChild(s);
      });
    }
    return loads[name];
  }

  // [{ key, name, in, out, cfg }] with times resolved by the stage's own resolver T(value, default)
  const collect = (seq, T) => Object.keys(seq || {}).filter((k) => isObj(seq[k]) && typeof seq[k].block === 'string')
    .map((k) => { const v = seq[k]; return { key: k, name: v.block, in: T(v.in, 0), out: v.out == null ? Infinity : T(v.out), cfg: v }; });

  let live = [];
  async function mount(container, list, ctx) {
    await Promise.all(list.map((b) => load(b.name)));
    container.replaceChildren();
    live = list.map((b) => {
      const host = document.createElement('div');
      host.className = 'stage-block';
      host.dataset.block = b.key;
      host.style.cssText = 'position:absolute;inset:0;visibility:hidden';
      container.appendChild(host);
      return { ...b, host, inst: REG[b.name].mount(host, b.cfg, ctx) };
    });
    await Promise.all(live.map((b) => b.inst.ready));
  }

  function render(t) {
    for (const b of live) {
      const vis = t >= b.in - 1e-6 && t <= b.out + (+b.cfg.outDur || 0);
      b.host.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) b.inst.render(t - b.in, { out: b.out - b.in });
    }
  }

  window.StageBlocks = { load, collect, mount, render, get live() { return live; } };
})();
