import * as THREE from 'three';

// Canvas-painted textures: printed pages, cloth covers with gold foil, page edges.
const PAGE = { w: 1024, h: 1365 };
const COVER = { w: 1060, h: 1440 };

const FONTS = [
  ['700 60px Caveat', 'Глава Chapter'],
  ['italic 800 120px "Literata Variable"', 'Дай почитать! The'],
  ['italic 500 40px "Literata Variable"', '12'],
  ['900 30px "Nunito Variable"', 'БИБЛИОТЕКА LIBRARY'],
];
export const ensureFonts = () =>
  Promise.all(FONTS.map(([f, sample]) => document.fonts.load(f, sample).catch(() => null)));

let noise;
function grainPattern(ctx) {
  if (!noise) {
    noise = document.createElement('canvas');
    noise.width = noise.height = 256;
    const n = noise.getContext('2d');
    const img = n.createImageData(256, 256);
    let seed = 1234567;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const v = 110 + (seed % 70);
      img.data[i] = v; img.data[i + 1] = v * 0.86; img.data[i + 2] = v * 0.66;
      img.data[i + 3] = 10 + (seed % 22);
    }
    n.putImageData(img, 0, 0);
  }
  return ctx.createPattern(noise, 'repeat');
}

function canvasTexture(canvas, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * A printed page: paper, half of the spread's ground illustration, gutter shade, folio.
 * @param {'L'|'R'} half
 */
export function paintPage(canvas, { ground, half, folio, foot }) {
  canvas.width = PAGE.w; canvas.height = PAGE.h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7eedb';
  ctx.fillRect(0, 0, PAGE.w, PAGE.h);

  if (ground) {
    const sw = ground.width / 2;
    ctx.drawImage(ground, half === 'L' ? 0 : sw, 0, sw, ground.height, 0, 0, PAGE.w, PAGE.h);
  }

  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(0, 0, PAGE.w, PAGE.h);

  // Gutter shade towards the spine, a whisper of shade on the outer edge.
  const spineX = half === 'L' ? PAGE.w : 0;
  const g = ctx.createLinearGradient(spineX, 0, half === 'L' ? PAGE.w * 0.82 : PAGE.w * 0.18, 0);
  g.addColorStop(0, 'rgba(90,55,20,0.34)');
  g.addColorStop(0.35, 'rgba(90,55,20,0.1)');
  g.addColorStop(1, 'rgba(90,55,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAGE.w, PAGE.h);
  const o = ctx.createLinearGradient(half === 'L' ? 0 : PAGE.w, 0, half === 'L' ? 40 : PAGE.w - 40, 0);
  o.addColorStop(0, 'rgba(90,55,20,0.12)');
  o.addColorStop(1, 'rgba(90,55,20,0)');
  ctx.fillStyle = o;
  ctx.fillRect(0, 0, PAGE.w, PAGE.h);

  // Printed text lives on the near edge of the page, where pop-ups never cover it.
  ctx.fillStyle = 'rgba(43,27,18,0.82)';
  ctx.textBaseline = 'alphabetic';
  if (folio) {
    ctx.font = 'italic 500 44px "Literata Variable"';
    ctx.textAlign = half === 'L' ? 'left' : 'right';
    ctx.fillText(folio, half === 'L' ? 70 : PAGE.w - 70, PAGE.h - 56);
  }
  if (foot) {
    ctx.font = '700 50px Caveat';
    ctx.textAlign = half === 'L' ? 'left' : 'right';
    ctx.fillStyle = 'rgba(201,74,48,0.9)';
    ctx.fillText(foot, half === 'L' ? 130 : PAGE.w - 130, PAGE.h - 56);
  }
  return canvas;
}

export function pageTexture(opts) {
  return canvasTexture(paintPage(document.createElement('canvas'), opts));
}

export function repaintPage(texture, opts) {
  paintPage(texture.image, opts);
  texture.needsUpdate = true;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Cloth cover with gold foil. mode: 'color' | 'mask' (the same drawing rendered twice:
 * once in colour, once as a white-on-black foil mask that makes the gold glow).
 */
export function paintCover(canvas, { side, mode, house, olive, cypress, ginger, t }) {
  // The foil mask doesn't need full resolution.
  const k = mode === 'color' ? 1 : 0.5;
  canvas.width = COVER.w * k; canvas.height = COVER.h * k;
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  const { w, h } = COVER;
  const color = mode === 'color';
  const foil = color ? (() => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#fbe39a'); g.addColorStop(0.45, '#d9a43c'); g.addColorStop(0.55, '#f6d27a'); g.addColorStop(1, '#b8832a');
    return g;
  })() : '#ffffff';

  // Cloth
  ctx.fillStyle = color ? '#1e3ea8' : '#000000';
  ctx.fillRect(0, 0, w, h);
  if (color) {
    ctx.globalAlpha = 0.07;
    for (let y = 0; y < h; y += 3) { ctx.fillStyle = y % 6 ? '#fff' : '#000'; ctx.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { ctx.fillStyle = x % 6 ? '#000' : '#fff'; ctx.fillRect(x, 0, 1, h); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, w, h);
    const v = ctx.createRadialGradient(w * 0.45, h * 0.4, h * 0.2, w / 2, h / 2, h * 0.8);
    v.addColorStop(0, 'rgba(255,255,255,0.06)');
    v.addColorStop(1, 'rgba(0,0,20,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  // Foil frame
  ctx.strokeStyle = foil;
  ctx.fillStyle = foil;
  ctx.lineWidth = 6;
  rr(ctx, 52, 52, w - 104, h - 104, 26); ctx.stroke();
  ctx.lineWidth = 2.5;
  rr(ctx, 70, 70, w - 140, h - 140, 18); ctx.stroke();
  for (const [x, y] of [[70, 70], [w - 70, 70], [70, h - 70], [w - 70, h - 70]]) star(ctx, x, y, 22);

  const shadow = (on) => {
    if (!color) return;
    ctx.shadowColor = on ? 'rgba(0,0,30,0.55)' : 'transparent';
    ctx.shadowOffsetY = on ? 4 : 0;
    ctx.shadowBlur = on ? 3 : 0;
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (side === 'front') {
    shadow(true);
    ctx.font = 'italic 850 176px "Literata Variable"';
    ctx.fillText('Дай', w / 2, 320);
    ctx.font = 'italic 850 138px "Literata Variable"';
    ctx.fillText('почитать!', w / 2, 476);
    shadow(false);

    // Tipped-in illustration plate
    const pw = 560, ph = 600, px = (w - pw) / 2, py = 580;
    if (color) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,30,0.45)'; ctx.shadowOffsetY = 8; ctx.shadowBlur = 18;
      ctx.fillStyle = '#f8efdb';
      rr(ctx, px, py, pw, ph, 18); ctx.fill();
      ctx.restore();
      ctx.save();
      rr(ctx, px + 16, py + 16, pw - 32, ph - 32, 10); ctx.clip();
      const sky = ctx.createLinearGradient(0, py, 0, py + ph);
      sky.addColorStop(0, '#9fc3f2'); sky.addColorStop(0.7, '#f6e6c4');
      ctx.fillStyle = sky; ctx.fillRect(px, py, pw, ph);
      // Green hills of Rumija behind the house, a lawn in front: the yellow house needs its garden.
      const hill = (color, y0, amp, phase) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px, py + ph);
        for (let x = 0; x <= pw; x += 20) ctx.lineTo(px + x, py + y0 - Math.sin((x / pw) * Math.PI * 1.3 + phase) * amp);
        ctx.lineTo(px + pw, py + ph);
        ctx.closePath();
        ctx.fill();
      };
      hill('#a9c98a', 300, 70, 0.4);
      hill('#7fae5f', 380, 46, 2.1);
      const lawn = ctx.createLinearGradient(0, py + ph - 150, 0, py + ph);
      lawn.addColorStop(0, '#8fbf5e'); lawn.addColorStop(1, '#5f9440');
      ctx.fillStyle = lawn;
      ctx.beginPath();
      ctx.moveTo(px, py + ph - 120);
      ctx.quadraticCurveTo(px + pw / 2, py + ph - 165, px + pw, py + ph - 118);
      ctx.lineTo(px + pw, py + ph); ctx.lineTo(px, py + ph); ctx.closePath();
      ctx.fill();
      // daisies
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) {
        const fx = px + 30 + rnd() * (pw - 60), fy = py + ph - 95 + rnd() * 75;
        ctx.fillStyle = i % 3 ? '#fff8e8' : '#f6c343';
        ctx.beginPath(); ctx.arc(fx, fy, 3 + rnd() * 2.5, 0, Math.PI * 2); ctx.fill();
      }
      const draw = (img, cx, bottom, h) => {
        if (!img) return;
        const iw = h * (img.width / img.height);
        ctx.drawImage(img, cx - iw / 2, bottom - h, iw, h);
      };
      draw(cypress, px + pw - 66, py + ph - 70, 330);
      draw(house, w / 2 + 14, py + ph - 52, ph - 120);
      draw(olive, px + 104, py + ph - 34, 270);
      ctx.restore();
    }
    ctx.strokeStyle = foil; ctx.lineWidth = 4;
    rr(ctx, px - 10, py - 10, pw + 20, ph + 20, 24); ctx.stroke();

    ctx.font = '900 34px "Nunito Variable"';
    ctx.letterSpacing = '6px';
    shadow(true);
    ctx.fillStyle = foil;
    ctx.fillText(t('cover.sub').toUpperCase(), w / 2, h - 150);
    ctx.letterSpacing = '0px';
    shadow(false);
  } else {
    // Back cover: a library stamp and a promise.
    const cx = w / 2, cy = h * 0.42, R = 230;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R - 70, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '900 38px "Nunito Variable"';
    const ring = `${t('cover.ring')} ★ `;
    const chars = [...ring.repeat(2)].slice(0, 44);
    chars.forEach((ch, i) => {
      const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * (R - 36), cy + Math.sin(a) * (R - 36));
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(ch, 0, 12);
      ctx.restore();
    });
    // a little open book in the middle
    ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 90, cy - 40); ctx.quadraticCurveTo(cx - 40, cy - 64, cx, cy - 30);
    ctx.quadraticCurveTo(cx + 40, cy - 64, cx + 90, cy - 40);
    ctx.lineTo(cx + 90, cy + 60); ctx.quadraticCurveTo(cx + 40, cy + 34, cx, cy + 66);
    ctx.quadraticCurveTo(cx - 40, cy + 34, cx - 90, cy + 60); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 66); ctx.stroke();

    // Ginger, thinking, sits right above the question she is asking.
    const gh = 260, gw = gh * (ginger ? ginger.width / ginger.height : 1), gy = 850;
    if (color && ginger) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,30,0.45)'; ctx.shadowOffsetY = 8; ctx.shadowBlur = 18;
      ctx.drawImage(ginger, cx - gw / 2, gy, gw, gh);
      ctx.restore();
    }

    shadow(true);
    ctx.font = 'italic 800 92px "Literata Variable"';
    ctx.fillText(t('cover.back1'), cx, 1215);
    ctx.font = 'italic 600 64px "Literata Variable"';
    ctx.fillText(t('cover.back2'), cx, 1215 + 92);
    shadow(false);
  }
  return canvas;
}

export function coverTextures({ house, olive, cypress, ginger, t }) {
  const make = (side) => ({
    color: canvasTexture(paintCover(document.createElement('canvas'), { side, mode: 'color', house, olive, cypress, ginger, t })),
    mask: canvasTexture(paintCover(document.createElement('canvas'), { side, mode: 'mask', t }), false),
  });
  return { front: make('front'), back: make('back') };
}

export function repaintCovers(set, { house, olive, cypress, ginger, t }) {
  for (const side of ['front', 'back']) {
    for (const mode of ['color', 'mask']) {
      paintCover(set[side][mode].image, { side, mode, house, olive, cypress, ginger, t });
      set[side][mode].needsUpdate = true;
    }
  }
}

export function edgeTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe3c8';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 3) {
    ctx.fillStyle = `rgba(120,90,50,${0.12 + ((y * 7) % 5) * 0.03})`;
    ctx.fillRect(0, y, 64, 1);
  }
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Soft dark ellipse that grounds the book on the page background. */
export function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(60,32,10,0.55)');
  g.addColorStop(0.55, 'rgba(60,32,10,0.22)');
  g.addColorStop(1, 'rgba(60,32,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return canvasTexture(c);
}

/** A little cloud with a short aside in it ("hmm…"): the thought bubbles that pop up off the page. */
export function thoughtTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fffaf0';
  ctx.shadowColor = 'rgba(60,32,10,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  // One cloud shape: draw it with the shadow, then again without, so the bumps read as one piece.
  const cloud = () => {
    ctx.beginPath(); ctx.roundRect(40, 70, 432, 190, 95); ctx.fill();
    for (const [x, y, r] of [[130, 110, 60], [256, 90, 72], [380, 110, 58]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    for (const [x, y, r] of [[120, 282, 24], [92, 305, 14]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  };
  cloud();
  ctx.shadowColor = 'transparent';
  cloud();
  ctx.fillStyle = 'rgba(43,27,18,0.88)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = 96;
  do { ctx.font = `700 ${px}px Caveat`; px -= 4; } while (ctx.measureText(text).width > 380 && px > 40);
  ctx.fillText(text, 256, 165);
  return canvasTexture(c);
}

/** Round soft sprite for dust motes / fireflies / lamp glow. */
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.25, 'rgba(255,214,140,0.55)');
  g.addColorStop(1, 'rgba(255,190,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}
