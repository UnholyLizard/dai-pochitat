// Renders the PWA / home-screen icons from one SVG (an open yellow book with a red bookmark on cobalt).
import sharp from 'sharp';

const logo = (s) => `<g transform="translate(256 270) scale(${s}) translate(-24 -26)">
  <path d="M32.5 4h6.5v16l-3.25-2.8-3.25 2.8z" fill="#e5533d" stroke="#2b1b12" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M5 13c7-3 13-2 19 3 6-5 12-6 19-3v26c-7-3-13-2-19 3-6-5-12-6-19-3z" fill="#f6c343" stroke="#2b1b12" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M24 16v26" stroke="#2b1b12" stroke-width="2.2"/>
  <path d="M10 20c3-1 6-1 9 1M10 26c3-1 6-1 9 1M10 32c3-1 6-1 9 1M29 21c3-2 6-2 9-1M29 27c3-2 6-2 9-1M29 33c3-2 6-2 9-1" stroke="#1f4dd8" stroke-width="1.8" stroke-linecap="round" fill="none"/>
</g>`;
const svg = (rx, s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><radialGradient id="g" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#3a68f0"/><stop offset="1" stop-color="#1638a6"/></radialGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>${logo(s)}</svg>`);

const out = 'public/icons/';
await sharp(svg(112, 8.2)).resize(512).png().toFile(`${out}icon-512.png`);
await sharp(svg(112, 8.2)).resize(192).png().toFile(`${out}icon-192.png`);
await sharp(svg(0, 6.2)).resize(512).png().toFile(`${out}maskable-512.png`); // logo inside the 80% safe zone
await sharp(svg(0, 7.4)).resize(180).png().toFile(`${out}apple-touch-icon.png`);

for (const [name, art] of [['chest', 'ginger-avatar'], ['find', 'house'], ['events', 'cake']]) {
  const img = await sharp(`public/art/${art}.webp`).resize(150, 150, { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: 192, height: 192, channels: 4, background: '#f6c343' } })
    .composite([{ input: img, gravity: 'center' }]).png().toFile(`${out}shortcut-${name}.png`);
}
console.log('icons ok');
