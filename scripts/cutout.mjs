// Turns raw Gemini stickers (subject + paper border on a chroma background) into
// trimmed transparent WebP cut-outs, and writes their sizes to src/scene/art-meta.json.
//   node scripts/cutout.mjs            → every raw image
//   node scripts/cutout.mjs house,sun  → only these ids
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ASSETS } from './art-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2).flatMap((a) => a.split(','));
const metaPath = resolve(root, 'src/scene/art-meta.json');
const meta = await readFile(metaPath, 'utf8').then(JSON.parse, () => ({}));

// Longest side of the published file, per asset family.
const maxSide = (id) =>
  id === 'house' ? 1600
  : id.startsWith('critter-') ? 384
  : /-(hello|think)$/.test(id) ? 640
  : /-stage$/.test(id) ? 1024
  : 1280;

const T_SOFT = 46;   // ≤ this distance from the key colour → fully transparent
const T_HARD = 150;  // ≥ this distance → fully opaque
const FILL = 120;    // background flood fill may cross pixels up to this distance

function keyColour(px, w, h) {
  // Median of the outer 6px ring: robust against a stray corner speck.
  const rs = [], gs = [], bs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x > 5 && y > 5 && x < w - 6 && y < h - 6) continue;
    const i = (y * w + x) * 4;
    rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

function cut(px, w, h) {
  const key = keyColour(px, w, h);
  const dist = (i) => Math.hypot(px[i] - key[0], px[i + 1] - key[1], px[i + 2] - key[2]);
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (bg[p] || dist(p * 4) > FILL) return;
    bg[p] = 1; stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  // Enclosed gaps (between an arm and the body …) are background too: seed them from
  // any pixel that is almost exactly the key colour.
  for (let p = 0; p < w * h; p++) if (!bg[p] && dist(p * 4) < 34) { bg[p] = 1; stack.push(p); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  const isMagenta = key[0] > 180 && key[2] > 180 && key[1] < 120;
  // Magenta mixed with dark outline ink inside tiny gaps survives the fill as a purple speck;
  // the palette has no saturated magenta-purple, so such pixels are background.
  if (isMagenta) {
    for (let p = 0; p < w * h; p++) {
      const i = p * 4, r = px[i], g = px[i + 1], b = px[i + 2];
      if (r > 110 && b > 100 && Math.abs(r - b) < 45 && g < 0.62 * Math.min(r, b)) bg[p] = 1;
    }
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (!bg[p]) {
      // Opaque, but if it touches the background clean any chroma spill.
      const x = p % w, y = (p / w) | 0;
      const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w]);
      if (edge) despill(px, i, isMagenta);
      continue;
    }
    const a = Math.min(1, Math.max(0, (dist(i) - T_SOFT) / (T_HARD - T_SOFT)));
    if (a === 0) { px[i + 3] = 0; continue; }
    // Un-mix the key colour out of the anti-aliased edge.
    for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, (px[i + c] - (1 - a) * key[c]) / a));
    despill(px, i, isMagenta);
    px[i + 3] = Math.round(a * 255);
  }
}

function despill(px, i, isMagenta) {
  const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
  if (isMagenta) {
    const lim = g + 40;
    if (r > lim && b > lim) { px[i] = Math.min(r, Math.max(lim, b - 30)); px[i + 2] = Math.min(b, lim + 10); }
  } else if (g > Math.max(r, b) + 30) {
    px[i + 1] = Math.max(r, b) + 30;
  }
}

async function processOne(asset) {
  const src = resolve(root, 'art/raw', `${asset.id}.png`);
  if (!await access(src).then(() => true, () => false)) return `miss ${asset.id}`;
  const out = resolve(root, 'public/art', `${asset.id}.webp`);

  if (asset.kind === 'plain') {
    const info = await sharp(src).resize({ width: 2048, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(out);
    meta[asset.id] = { w: info.width, h: info.height };
    return `ok   ${asset.id} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}kB`;
  }

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  cut(data, info.width, info.height);
  const keyed = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  const trimmed = await keyed.png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true }));
  const side = maxSide(asset.id);
  const res = await sharp(trimmed.data)
    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84, alphaQuality: 90, effort: 5 })
    .toFile(out);
  meta[asset.id] = { w: res.width, h: res.height };
  if (asset.id.endsWith('-hello')) {
    // Small copy for the chat button, avatars and casting cards (shown at ≤ 140 CSS px).
    const avatar = asset.id.replace(/-hello$/, '-avatar');
    // Tall portraits are cropped to head and shoulders so every face sits the same in a circle.
    const tall = res.height / res.width > 1.1;
    await sharp(out)
      .resize(tall ? { width: 280, height: 300, fit: 'cover', position: 'top' } : { width: 280 })
      .webp({ quality: 86, alphaQuality: 90 })
      .toFile(resolve(root, 'public/art', `${avatar}.webp`));
    const m = await sharp(resolve(root, 'public/art', `${avatar}.webp`)).metadata();
    meta[avatar] = { w: m.width, h: m.height };
  }
  return `ok   ${asset.id} ${res.width}x${res.height} ${(res.size / 1024).toFixed(0)}kB`;
}

await mkdir(resolve(root, 'public/art'), { recursive: true });
for (const asset of ASSETS.filter((a) => !only.length || only.includes(a.id))) console.log(await processOne(asset));
await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n');
