import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY in environment.');
  process.exit(1);
}

const activeBatchesFile = path.resolve('scratch/active_batches.json');
if (!fs.existsSync(activeBatchesFile)) {
  console.log('No active batches found.');
  process.exit(0);
}

function escapeSql(str) {
  if (str == null) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

async function checkAndApply() {
  const activeBatches = JSON.parse(fs.readFileSync(activeBatchesFile, 'utf8'));
  let updatedAny = false;

  for (const record of activeBatches) {
    if (record.status === 'APPLIED') continue;

    console.log(`Checking ${record.batchName} (${record.jobId})...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/${record.jobId}?key=${GEMINI_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch status for ${record.jobId}: HTTP ${res.status}`);
      continue;
    }

    const data = await res.json();
    const state = data.metadata?.state;
    console.log(`  State: ${state}`);

    if (state === 'BATCH_STATE_SUCCEEDED') {
      const inlined = data.response?.inlinedResponses?.inlinedResponses || data.metadata?.output?.inlinedResponses?.inlinedResponses;
      if (!inlined?.length) {
        console.warn(`  Batch succeeded but no inlined responses found.`);
        continue;
      }

      console.log(`  Parsing ${inlined.length} responses...`);
      const sqlUpdates = [];
      let parsedCount = 0;

      for (const item of inlined) {
        const text = item.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        try {
          const b = JSON.parse(text);
          if (!b.id) continue;

          parsedCount++;
          sqlUpdates.push(`
UPDATE books SET
  title_en = ${escapeSql(b.title_en || '')},
  title_me = ${escapeSql(b.title_me || '')},
  author_en = ${escapeSql(b.author_en || '')},
  author_me = ${escapeSql(b.author_me || '')},
  annotation_en = ${escapeSql(b.annotation_en || '')},
  annotation_me = ${escapeSql(b.annotation_me || '')},
  says_ru = ${escapeSql(b.says_ru || '')},
  says_en = ${escapeSql(b.says_en || '')},
  says_me = ${escapeSql(b.says_me || '')},
  moods_json = ${escapeSql(JSON.stringify(b.moods || []))},
  tags_json = ${escapeSql(JSON.stringify(b.tags || []))},
  dominant_color = ${escapeSql(b.dominant_color || '#2f8a84')},
  updated_at = ${Date.now()}
WHERE id = ${escapeSql(b.id)};

DELETE FROM books_fts WHERE rowid = (SELECT rowid FROM books WHERE id = ${escapeSql(b.id)});
INSERT INTO books_fts (rowid, title_ru, title_en, title_me, author_ru, author_en, author_me, annotation_ru)
  SELECT rowid, title_ru, title_en, title_me, author_ru, author_en, author_me, annotation_ru FROM books WHERE id = ${escapeSql(b.id)};
`);
        } catch (e) {
          console.warn(`  Failed to parse response JSON:`, e.message);
        }
      }

      if (sqlUpdates.length > 0) {
        const tmpSql = path.resolve(`scratch/apply_${record.batchName}.sql`);
        fs.writeFileSync(tmpSql, sqlUpdates.join('\n'), 'utf8');
        console.log(`  Applying ${parsedCount} book updates to local D1...`);
        execSync(`npx wrangler d1 execute dai-pochitat-casting --local --file=${tmpSql}`, { stdio: 'inherit' });
        record.status = 'APPLIED';
        record.appliedAt = Date.now();
        record.appliedCount = parsedCount;
        updatedAny = true;
        console.log(`  Successfully applied ${record.batchName}!`);
      }
    } else {
      record.status = state;
      updatedAny = true;
    }
  }

  if (updatedAny) {
    fs.writeFileSync(activeBatchesFile, JSON.stringify(activeBatches, null, 2), 'utf8');
  }
}

checkAndApply().catch(console.error);
