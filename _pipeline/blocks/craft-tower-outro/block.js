// CRAFT-TOWER studio outro — an importable stage block (see README.md in this folder).
// A sequence imports it with a top-level object:  "outro": { "block": "craft-tower-outro", "in": 27.5, "out": 32 }
// The stage loads this file, calls mount(host, cfg, ctx) once per apply and render(localTime) every frame.
// render() is a pure function of time, so the block renders identically in the editor, stills and frames.
// It works on any canvas (16:9, 9:16, 1:1): sizes follow the canvas, the lockup stays centred in the safe area.
(() => {
  const NAME = 'craft-tower-outro';
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');

  const DEFAULTS = {
    company: 'CRAFT-TOWER',      // wordmark (the hyphen is drawn in the logo's amber)
    legal: 'DOO',                // legal form, set as spaced caps under the wordmark
    tagline: 'Design, Web & Software Engineering Studio',
    url: 'craft-tower.com',
    credit: '',                  // optional line above the logo, e.g. "Kotva · a concept by" ({class:text} spans allowed)
    accent: '#FFA41B',           // the logo's beams, lantern and hyphen (brand logo light: orange-yellow)
    highlight: '#3B82F6',        // brand primary: credit line, URL arrow and URL frame
    ink: '#F8FAFC',              // the logo's tower (currentColor) and the wordmark
    bg: ['#05070B', '#0B1220'],  // background: centre, edge
    fadeIn: 0.5,                 // the block's own backdrop fades in over the previous scene
    outDur: 0,                   // > 0: the whole block fades out over this many seconds after "out"
    safeTop: null,               // px kept clear at the top / bottom (default: 9:16 → Instagram safe zones, else 0)
    safeBottom: null,
  };

  const STYLE = `
  @font-face { font-family: 'CT Inter'; font-weight: 100 900; src: url(${BASE}fonts/inter-latin-wght-normal.woff2) format('woff2-variations');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
  @font-face { font-family: 'CT Inter'; font-weight: 100 900; src: url(${BASE}fonts/inter-latin-ext-wght-normal.woff2) format('woff2-variations');
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  .ct-outro { position: absolute; inset: 0; overflow: hidden; font-family: 'CT Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .ct-outro * { box-sizing: border-box; }
  .ct-bg, .ct-sweep, .ct-haze { position: absolute; inset: 0; }
  .ct-lock { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .ct-credit { font-weight: 600; text-transform: uppercase; color: rgba(248, 250, 252, 0.62); white-space: nowrap; }
  .ct-credit .dot, .ct-credit em { color: var(--ct-highlight); font-style: normal; }
  .ct-logo { display: block; overflow: visible; color: var(--ct-ink); }
  .ct-word { font-weight: 900; color: var(--ct-ink); white-space: nowrap; line-height: 1; }
  .ct-word span { display: inline-block; will-change: transform; }
  .ct-word .ct-hy { color: var(--ct-accent); }
  .ct-legal { display: flex; align-items: center; justify-content: center; font-weight: 600; color: rgba(248, 250, 252, 0.78); text-transform: uppercase; }
  .ct-legal i { display: block; height: 1px; background: linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.75)); transform-origin: 100% 50%; }
  .ct-legal i:last-child { background: linear-gradient(90deg, rgba(245, 158, 11, 0.75), transparent); transform-origin: 0 50%; }
  .ct-tag { font-weight: 500; color: rgba(203, 213, 225, 0.92); letter-spacing: -0.005em; white-space: nowrap; }
  .ct-url { position: relative; display: inline-flex; align-items: center; font-weight: 650; color: var(--ct-ink); letter-spacing: 0.01em; border-radius: 999px; white-space: nowrap; }
  .ct-url svg.ring { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .ct-url .arrow { color: var(--ct-highlight); }
  `;

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const E = {
    outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inCubic: (p) => p * p * p,
    outBack: (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
    inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  };
  const P = (t, a, b, e = E.outCubic) => e(clamp((t - a) / (b - a)));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "{dot:.}" / "*x*" spans in the credit line
  const rich = (s) => esc(s).replace(/\{([\w-]+):([^{}]+)\}/g, '<span class="$1">$2</span>').replace(/\*(.+?)\*/g, '<em>$1</em>');

  // The studio logo (a lighthouse tower: lantern and sweeping beams over a stack of floors on a plinth), split into
  // parts so it can build itself. Coordinates are the original 32×32 symbol's.
  const LOGO = `
    <g class="ct-beams">
      <path class="ct-beam l" d="M13.7 7.3 3 4.7v5.2z" fill="var(--ct-accent)"/>
      <path class="ct-beam r" d="M18.3 7.3 29 4.7v5.2z" fill="var(--ct-accent)"/>
    </g>
    <path class="ct-part roof" d="M13.3 5.6 16 2.8l2.7 2.8z" fill="currentColor"/>
    <rect class="ct-part lamp" x="14.1" y="6" width="3.8" height="2.8" rx=".5" fill="var(--ct-accent)"/>
    <rect class="ct-part gallery" x="11.8" y="9.3" width="8.4" height="1.4" rx=".4" fill="currentColor"/>
    <rect class="ct-part f4" x="12.7" y="11.6" width="6.6" height="3.1" rx=".4" fill="currentColor"/>
    <rect class="ct-part f3" x="12.4" y="15.5" width="7.2" height="3.1" rx=".4" fill="currentColor"/>
    <rect class="ct-part f2" x="12.1" y="19.4" width="7.8" height="3.1" rx=".4" fill="currentColor"/>
    <rect class="ct-part f1" x="11.8" y="23.3" width="8.4" height="3.1" rx=".4" fill="currentColor"/>
    <rect class="ct-part plinth" x="8.5" y="27.3" width="15" height="2" rx=".5" fill="currentColor"/>`;

  // per-letter spans with the font's pair kerning measured back in (splitting drops it)
  function splitWord(host, text) {
    host.textContent = '';
    const probe = el('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit;letter-spacing:inherit';
    host.appendChild(probe);
    const w = (s) => { probe.textContent = s; return probe.getBoundingClientRect().width; };
    const chars = [...text];
    const kern = chars.map((c, i) => (i < chars.length - 1 ? w(c + chars[i + 1]) - w(c) - w(chars[i + 1]) : 0));
    probe.remove();
    return chars.map((c, i) => {
      const s = el('span', c === '-' ? 'ct-hy' : '');
      s.textContent = c;
      if (Math.abs(kern[i]) > 0.05) s.style.marginRight = `${kern[i].toFixed(2)}px`;
      host.appendChild(s);
      return s;
    });
  }

  function mount(host, cfgIn, ctx) {
    const cfg = { ...DEFAULTS, ...cfgIn };
    if (!document.getElementById('ct-outro-style')) { const st = el('style'); st.id = 'ct-outro-style'; st.textContent = STYLE; document.head.appendChild(st); }
    const W = ctx.w, H = ctx.h;
    const portrait = H > W * 1.2;
    // Instagram Reels/Stories: keep the top ~250 px and bottom ~420 px clear of UI; 16:9 has no overlay
    const safeTop = cfg.safeTop != null ? cfg.safeTop : portrait ? 250 : 0;
    const safeBottom = cfg.safeBottom != null ? cfg.safeBottom : portrait ? 420 : 0;
    const u = Math.min(W, H) / 1080;                       // size unit: 1 on 1920×1080 and 1080×1920
    const S = portrait
      ? { logo: 330, word: 108, legal: 24, tag: 33, url: 32, credit: 22, gap: 1 }
      : { logo: 236, word: 124, legal: 22, tag: 32, url: 28, credit: 20, gap: 0.8 };

    const root = el('div', 'ct-outro');
    root.style.setProperty('--ct-accent', cfg.accent);
    root.style.setProperty('--ct-highlight', cfg.highlight);
    root.style.setProperty('--ct-ink', cfg.ink);
    const bg = el('div', 'ct-bg');
    bg.style.background = `radial-gradient(ellipse 85% 70% at 50% 46%, ${cfg.bg[1]} 0%, ${cfg.bg[0]} 72%)`;
    const sweep = el('div', 'ct-sweep');
    const haze = el('div', 'ct-haze');
    const lock = el('div', 'ct-lock');

    const credit = el('div', 'ct-credit', rich(cfg.credit || ''));
    Object.assign(credit.style, { fontSize: `${S.credit * u}px`, letterSpacing: '0.3em', marginBottom: `${46 * u * S.gap}px` });
    if (!cfg.credit) credit.style.display = 'none';

    const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    logo.setAttribute('viewBox', '0 0 32 32');
    logo.setAttribute('class', 'ct-logo');
    logo.setAttribute('width', String(S.logo * u));
    logo.setAttribute('height', String(S.logo * u));
    logo.innerHTML = LOGO;

    const word = el('div', 'ct-word');
    Object.assign(word.style, { fontSize: `${S.word * u}px`, letterSpacing: '-0.035em', marginTop: `${34 * u * S.gap}px` });

    const legal = el('div', 'ct-legal');
    Object.assign(legal.style, { fontSize: `${S.legal * u}px`, letterSpacing: '0.62em', marginTop: `${26 * u * S.gap}px`, gap: `${22 * u}px` });
    const r1 = el('i'), r2 = el('i');
    r1.style.width = r2.style.width = `${120 * u}px`;
    const lt = el('span'); lt.textContent = cfg.legal; lt.style.marginRight = '-0.62em';   // the spacing trails the last letter
    legal.append(r1, lt, r2);

    const tag = el('div', 'ct-tag');
    tag.textContent = cfg.tagline;
    Object.assign(tag.style, { fontSize: `${S.tag * u}px`, marginTop: `${30 * u * S.gap}px` });

    const url = el('div', 'ct-url');
    Object.assign(url.style, { fontSize: `${S.url * u}px`, marginTop: `${44 * u * S.gap}px`, padding: `${0.62 * S.url * u}px ${1.15 * S.url * u}px`, gap: `${0.5 * S.url * u}px` });
    url.innerHTML = `<svg class="ring" preserveAspectRatio="none"><rect x="1" y="1" rx="0" fill="none" stroke="${cfg.highlight}" stroke-width="2" pathLength="100"/></svg><span class="txt">${esc(cfg.url)}</span><span class="arrow">→</span>`;

    lock.append(credit, logo, word, legal, tag, url);
    root.append(bg, sweep, haze, lock);
    host.appendChild(root);

    let letters = [];
    const parts = {};
    logo.querySelectorAll('.ct-part, .ct-beam').forEach((p) => { parts[p.getAttribute('class').split(' ').pop()] = p; });

    const ready = (async () => {
      await Promise.all(['900 100px "CT Inter"', '600 24px "CT Inter"', '500 32px "CT Inter"'].map((f) => document.fonts.load(f, 'CRAFT-TOWER DOO craft-tower.com')));
      letters = splitWord(word, cfg.company);
      // centre the lockup in the safe area once its height is known
      const h = lock.getBoundingClientRect().height;
      const top = safeTop + (H - safeTop - safeBottom - h) / 2;
      lock.style.top = `${Math.round(top)}px`;
      const ring = url.querySelector('rect');
      const rb = url.getBoundingClientRect();
      ring.setAttribute('width', String(rb.width - 2));
      ring.setAttribute('height', String(rb.height - 2));
      ring.setAttribute('rx', String((rb.height - 2) / 2));
      // the lantern's position on the canvas: origin of the background light sweep
      const lb = logo.getBoundingClientRect(), hb = host.getBoundingClientRect();
      inst.lantern = { x: lb.left - hb.left + (16 / 32) * lb.width, y: lb.top - hb.top + (7.3 / 32) * lb.height };
    })();

    const inst = {
      ready,
      lantern: { x: W / 2, y: H / 2 },
      // t: seconds since the block's "in"; o.out: its "out" on the same clock (Infinity when open-ended)
      render(t, o = {}) {
        const outA = cfg.outDur > 0 && Number.isFinite(o.out) ? 1 - P(t, o.out, o.out + cfg.outDur, E.inOutSine) : 1;
        root.style.opacity = String(outA);
        bg.style.opacity = String(P(t, 0, cfg.fadeIn, E.inOutSine));

        // lighthouse light: two opposite soft beams sweeping slowly round the lantern, after the lamp is lit
        const on = P(t, 1.0, 1.9, E.outCubic);
        const a = (t * 38 + 205) % 360;
        const { x, y } = inst.lantern;
        sweep.style.opacity = String(on * 0.9);
        sweep.style.background = `conic-gradient(from ${a.toFixed(2)}deg at ${x.toFixed(1)}px ${y.toFixed(1)}px,
          rgba(245,158,11,0) 0deg, rgba(245,158,11,0.11) 9deg, rgba(245,158,11,0.02) 24deg, rgba(245,158,11,0) 34deg,
          rgba(245,158,11,0) 180deg, rgba(245,158,11,0.09) 189deg, rgba(245,158,11,0.015) 204deg, rgba(245,158,11,0) 214deg)`;
        sweep.style.webkitMaskImage = sweep.style.maskImage = `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, #000 0%, rgba(0,0,0,0.6) 35%, transparent 75%)`;
        haze.style.opacity = String(on);
        haze.style.background = `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, rgba(245,158,11,${(0.16 + 0.05 * Math.sin(t * 2.2)).toFixed(3)}) 0%, rgba(245,158,11,0.04) ${(10 * u).toFixed(0)}%, transparent ${(30 * u).toFixed(0)}%)`;

        // credit line
        const c = P(t, 0.35, 1.0, E.outExpo);
        credit.style.opacity = String(c);
        credit.style.transform = `translateY(${((1 - c) * 14 * u).toFixed(2)}px)`;

        // the tower builds itself: plinth, four floors (bottom first), gallery, roof; then the lantern lights up
        const pl = P(t, 0.15, 0.55, E.outExpo);
        parts.plinth.style.transformOrigin = '16px 28.3px';
        parts.plinth.style.transform = `scaleX(${pl.toFixed(4)})`;
        parts.plinth.style.opacity = String(clamp(pl * 3));
        ['f1', 'f2', 'f3', 'f4', 'gallery', 'roof'].forEach((k, i) => {
          const p = P(t, 0.32 + i * 0.075, 0.32 + i * 0.075 + 0.42, E.outBack);
          const q = clamp((t - 0.32 - i * 0.075) / 0.12);
          parts[k].style.transform = `translateY(${((1 - p) * -5.5).toFixed(3)}px)`;
          parts[k].style.opacity = String(q);
        });
        const lamp = P(t, 0.95, 1.2, E.outCubic);
        const pulse = 0.5 + 0.5 * Math.sin((t - 1.0) * 3.1);
        parts.lamp.style.opacity = String(lamp);
        logo.style.filter = `drop-shadow(0 0 ${((4 + 10 * pulse * lamp) * u).toFixed(1)}px rgba(245,158,11,${(0.25 + 0.3 * lamp).toFixed(2)}))`;

        // beams extend from the lantern, then breathe in turn like a turning lens
        const ext = P(t, 1.05, 1.7, E.outExpo);
        const ph = (t - 1.05) * 2.1;
        const bl = ext * (0.86 + 0.14 * Math.cos(ph)), br = ext * (0.86 + 0.14 * Math.cos(ph + Math.PI));
        parts.l.style.transformOrigin = '13.7px 7.3px';
        parts.r.style.transformOrigin = '18.3px 7.3px';
        parts.l.style.transform = `scaleX(${bl.toFixed(4)})`;
        parts.r.style.transform = `scaleX(${br.toFixed(4)})`;
        parts.l.style.opacity = String((0.55 + 0.3 * (0.5 + 0.5 * Math.cos(ph))) * ext);
        parts.r.style.opacity = String((0.55 + 0.3 * (0.5 + 0.5 * Math.cos(ph + Math.PI))) * ext);

        // wordmark letters rise in; "DOO" between drawing rules; tagline; the URL pill draws its outline
        letters.forEach((s, i) => {
          const p = P(t, 1.1 + i * 0.035, 1.1 + i * 0.035 + 0.75, E.outExpo);
          s.style.opacity = String(p);
          s.style.transform = `translateY(${((1 - p) * 0.42).toFixed(3)}em)`;
          s.style.filter = p < 1 ? `blur(${((1 - p) * 10 * u).toFixed(2)}px)` : '';
        });
        const lg = P(t, 1.55, 2.2, E.outExpo);
        lt.style.opacity = String(lg);
        r1.style.transform = r2.style.transform = `scaleX(${P(t, 1.6, 2.4, E.outExpo).toFixed(4)})`;
        const tg = P(t, 1.8, 2.5, E.outExpo);
        tag.style.opacity = String(tg);
        tag.style.transform = `translateY(${((1 - tg) * 16 * u).toFixed(2)}px)`;
        const ur = P(t, 2.05, 2.7, E.outExpo);
        url.style.opacity = String(clamp(ur * 1.4));
        url.style.transform = `translateY(${((1 - ur) * 12 * u).toFixed(2)}px)`;
        const ring = url.querySelector('rect');
        ring.style.strokeDasharray = '100 100';
        ring.style.strokeDashoffset = String(100 - 100 * P(t, 2.15, 3.1, E.outCubic));
      },
    };
    return inst;
  }

  (window.STAGE_BLOCKS = window.STAGE_BLOCKS || {})[NAME] = { name: NAME, version: 1, defaults: DEFAULTS, minDuration: 3.4, mount };
})();
