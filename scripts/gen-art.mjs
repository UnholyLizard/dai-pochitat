// Generates the storybook illustrations with Gemini image models.
//   node scripts/gen-art.mjs                 → every missing asset
//   node scripts/gen-art.mjs house,olive     → only these ids
//   node scripts/gen-art.mjs --force house   → regenerate even if present
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, STYLE, STICKER } from './art-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(resolve(root, '.env'), 'utf8'))
    .split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]; }),
);
const KEY = env.GEMINI_API_KEY;
const BASE = (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/').replace(/\/?$/, '/');
const MODELS = (process.env.ART_MODEL || 'gemini-3.1-flash-image,gemini-nano-banana-2.1').split(',');
const CONCURRENCY = Number(process.env.ART_CONCURRENCY || 4);

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--')).flatMap((a) => a.split(','));
const queue = ASSETS.filter((a) => !only.length || only.includes(a.id));

const exists = (p) => access(p).then(() => true, () => false);

async function generate(asset) {
  const out = resolve(root, 'art/raw', `${asset.id}.png`);
  if (!force && await exists(out)) return `skip ${asset.id}`;

  const parts = [{ text: [STYLE, asset.subject, asset.kind === 'cut' ? STICKER(asset.key) : ''].join('\n\n') }];
  if (asset.ref) {
    const data = await readFile(resolve(root, 'art/ref', asset.ref));
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: data.toString('base64') } });
  }
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: asset.aspect, imageSize: asset.size || '1K' },
    },
  };

  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`${BASE}models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(`${res.status} ${json.error?.message?.slice(0, 200)}`);
        const img = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
        if (!img) throw new Error(`no image (${json.candidates?.[0]?.finishReason})`);
        const { data } = img.inlineData || img.inline_data;
        await writeFile(out, Buffer.from(data, 'base64'));
        return `ok   ${asset.id} (${model})`;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  return `FAIL ${asset.id}: ${lastErr?.message}`;
}

await mkdir(resolve(root, 'art/raw'), { recursive: true });
const pending = [...queue];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (pending.length) console.log(await generate(pending.shift()));
}));
