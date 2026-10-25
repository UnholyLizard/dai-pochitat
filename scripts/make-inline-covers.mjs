// Telegram's inline `photo` results must be JPEG, but the catalog covers are WebP.
// Writes a 480px-wide JPEG twin of every public/covers/*.webp into public/covers-jpg/ (skipping fresh ones).
import { readdir, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const src = resolve(root, 'covers');
const out = resolve(root, 'covers-jpg');

const files = (await readdir(src).catch(() => [])).filter((f) => f.endsWith('.webp'));
await mkdir(out, { recursive: true });

let made = 0;
for (let i = 0; i < files.length; i += 16) {
  await Promise.all(files.slice(i, i + 16).map(async (f) => {
    const to = resolve(out, `${basename(f, '.webp')}.jpg`);
    const [a, b] = await Promise.all([stat(resolve(src, f)), stat(to).catch(() => null)]);
    if (b && b.mtimeMs >= a.mtimeMs) return;
    await sharp(resolve(src, f))
      .resize({ width: 480, height: 720, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(to);
    made++;
  }));
}
console.log(`covers-jpg: ${made} written, ${files.length - made} up to date`);
