// After `vite build`: write dist/_headers (Cloudflare static assets) with a CSP that
// whitelists the exact inline scripts in index.html by hash, plus caching rules.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');

// Executable inline scripts only (JSON-LD data blocks are not subject to script-src).
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(([, body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);

const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/art/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400

/icons/*
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
