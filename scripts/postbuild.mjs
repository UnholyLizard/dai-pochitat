// After `vite build`: write dist/_headers (Cloudflare static assets) with a CSP that
// whitelists the exact inline scripts in index.html by hash, plus caching rules.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
// Every built page contributes its inline scripts to the one site-wide CSP.
const html = (await Promise.all(['index.html', 'catalog/index.html'].map((f) => readFile(resolve(dist, f), 'utf8')))).join('\n');

// Executable inline scripts only (JSON-LD data blocks are not subject to script-src).
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
  // Browsers normalise CRLF to LF in script text before hashing it, so hash the same thing.
  .map(([, body]) => `'sha256-${createHash('sha256').update(body.replace(/\r\n?/g, '\n')).digest('base64')}'`)
  .filter((h, i, all) => all.indexOf(h) === i);

const csp = [
  "default-src 'self'",
  `script-src 'self' https://telegram.org ${hashes.join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://t.me https://*.telegram.org",
  "font-src 'self'",
  "connect-src 'self' https://api.telegram.org https://oauth.telegram.org",
  "frame-src 'self' https://oauth.telegram.org https://web.telegram.org",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/art/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400

/icons/*
  Cache-Control: public, max-age=604800

/covers-jpg/*
  Cache-Control: public, max-age=604800

/sw.js
  Cache-Control: no-cache

/registerSW.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json
`;

await writeFile(resolve(dist, '_headers'), headers);
console.log(`_headers written (${hashes.length} inline script hash${hashes.length === 1 ? '' : 'es'})`);
