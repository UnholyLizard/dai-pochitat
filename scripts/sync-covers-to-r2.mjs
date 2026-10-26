import fs from 'node:fs';
import path from 'node:path';

// Load credentials
function getCloudflareAuth() {
  const tomlPath = path.resolve(process.env.APPDATA || '', 'xdg.config/.wrangler/config/default.toml');
  if (!fs.existsSync(tomlPath)) {
    throw new Error(`Wrangler credentials not found at ${tomlPath}`);
  }
  const toml = fs.readFileSync(tomlPath, 'utf8');
  const tokenMatch = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!tokenMatch) {
    throw new Error('OAuth token not found in wrangler default.toml');
  }
  return {
    token: tokenMatch[1],
    accountId: '6368e1788eff644307aa148c58724cfa',
    bucket: 'dai-pochitat-covers'
  };
}

const CONCURRENCY = 6;
const PROGRESS_FILE = path.resolve('scratch/r2_sync_progress.json');

async function main() {
  const auth = getCloudflareAuth();
  console.log(`Authenticated with Cloudflare R2: bucket "${auth.bucket}" (Account ${auth.accountId})`);

  fs.mkdirSync(path.resolve('scratch'), { recursive: true });

  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch {
      progress = {};
    }
  }

  const tasks = [];

  // 1. Gather public/covers/*.webp
  const coversDir = path.resolve('public/covers');
  if (fs.existsSync(coversDir)) {
    const files = fs.readdirSync(coversDir).filter(f => f.endsWith('.webp'));
    for (const f of files) {
      tasks.push({
        localPath: path.join(coversDir, f),
        r2Key: `covers/${f}`,
        contentType: 'image/webp',
        size: fs.statSync(path.join(coversDir, f)).size
      });
    }
  }

  // 2. Gather public/covers-jpg/*.jpg
  const coversJpgDir = path.resolve('public/covers-jpg');
  if (fs.existsSync(coversJpgDir)) {
    const files = fs.readdirSync(coversJpgDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));
    for (const f of files) {
      tasks.push({
        localPath: path.join(coversJpgDir, f),
        r2Key: `covers-jpg/${f}`,
        contentType: 'image/jpeg',
        size: fs.statSync(path.join(coversJpgDir, f)).size
      });
    }
  }

  console.log(`Total covers found: ${tasks.length} (already recorded in progress: ${Object.keys(progress).length})`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let running = 0;
  let currentIndex = 0;

  async function uploadOne(task) {
    if (progress[task.r2Key] && progress[task.r2Key].size === task.size) {
      skipped++;
      return;
    }

    const fileBuffer = fs.readFileSync(task.localPath);
    const url = `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}/r2/buckets/${auth.bucket}/objects/${encodeURIComponent(task.r2Key)}`;

    let attempts = 0;
    while (attempts < 10) {
      attempts++;
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${auth.token}`,
            'Content-Type': task.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable'
          },
          body: fileBuffer
        });

        if (res.ok) {
          uploaded++;
          progress[task.r2Key] = { size: task.size, uploadedAt: Date.now() };
          return;
        }

        if (res.status === 429) {
          // Rate-limited: wait and retry
          const backoff = 2000 + attempts * 1000;
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }

        const errText = await res.text();
        if (attempts >= 10) {
          console.error(`\nFailed to upload ${task.r2Key} (HTTP ${res.status}): ${errText}`);
          failed++;
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempts));
        }
      } catch (err) {
        if (attempts >= 10) {
          console.error(`\nNetwork error on ${task.r2Key}: ${err.message}`);
          failed++;
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempts));
        }
      }
    }
  }

  return new Promise((resolvePromise) => {
    let lastReport = Date.now();

    function pump() {
      if (currentIndex >= tasks.length && running === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
        return resolvePromise({ total: tasks.length, uploaded, skipped, failed });
      }

      while (running < CONCURRENCY && currentIndex < tasks.length) {
        const task = tasks[currentIndex++];
        running++;

        uploadOne(task).finally(() => {
          running--;
          if (Date.now() - lastReport > 2000) {
            lastReport = Date.now();
            process.stdout.write(`\rProgress: ${currentIndex}/${tasks.length} | Uploaded: ${uploaded} | Skipped: ${skipped} | Failed: ${failed}`);
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
          }
          // Tiny sleep before dispatching next
          setTimeout(pump, 40);
        });
      }
    }

    pump();
  });
}

main().then(res => {
  console.log(`\n\n=== R2 Upload Complete ===`);
  console.log(`Total:    ${res.total}`);
  console.log(`Uploaded: ${res.uploaded}`);
  console.log(`Skipped:  ${res.skipped}`);
  console.log(`Failed:   ${res.failed}`);
}).catch(err => {
  console.error('\nFatal migration error:', err);
  process.exit(1);
});
