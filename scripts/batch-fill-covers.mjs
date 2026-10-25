import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { buildCatalogDataset } from './import-catalog.mjs';

// Load environment variables from .env
function loadEnv() {
  if (!fs.existsSync('.env')) return {};
  const content = fs.readFileSync('.env', 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*['"]?(.*?)['"]?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

const catalogDir = path.resolve('Дай почитать каталог книг');
const resourcesDir = path.join(catalogDir, 'resources');
const publicCoversDir = path.resolve('public/covers');
const progressFile = path.resolve('scratch/covers_progress.json');

// Ensure directories exist
fs.mkdirSync(publicCoversDir, { recursive: true });
fs.mkdirSync(path.resolve('scratch'), { recursive: true });

// Load existing progress or initialize
let progress = {};
if (fs.existsSync(progressFile)) {
  try {
    progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
  } catch {
    progress = {};
  }
}

function saveProgress() {
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), 'utf-8');
}

/**
 * Step 1: Optimize existing covers from Google Sheets export to public/covers/
 */
export async function syncExistingCovers(books) {
  console.log('--- Step 1: Syncing existing covers from resources/ to public/covers/ ---');
  let converted = 0;
  let skipped = 0;
  let missing = 0;
  
  for (const b of books) {
    if (!b.cover_url) continue;
    const baseName = path.basename(b.cover_url);
    const srcPath = path.join(resourcesDir, baseName);
    
    // Target WebP file
    const targetName = `${b.code}.webp`;
    const destPath = path.join(publicCoversDir, targetName);
    
    if (fs.existsSync(destPath)) {
      skipped++;
      continue;
    }
    
    if (!fs.existsSync(srcPath)) {
      missing++;
      continue;
    }
    
    try {
      await sharp(srcPath)
        .resize({ width: 600, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(destPath);
      converted++;
      if (converted % 100 === 0) {
        console.log(`  Processed ${converted} existing covers...`);
      }
    } catch (err) {
      console.warn(`  Failed converting ${srcPath}: ${err.message}`);
    }
  }
  
  console.log(`✓ Existing covers sync complete: ${converted} converted, ${skipped} already existed, ${missing} missing source files.\n`);
}

/**
 * Step 2: Query Gemini 3.8 Flash Grounding for authentic book cover & ISBN
 */
async function findBookCoverViaGemini(title, author, publisher) {
  if (!GEMINI_API_KEY) {
    return { error: 'No GEMINI_API_KEY available' };
  }
  
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `Find the authentic physical book cover image and metadata for this edition:
Title: "${title}"
Author: "${author || ''}"
Publisher: "${publisher || ''}"

Search Russian/Balkan bookstores or publisher websites (e.g., labirint.ru, livelib.ru, ozon.ru, samokatbook.ru, clever-media.ru, kreativnicentar.rs, chitai-gorod.ru).
Return ONLY a strict JSON object:
{
  "title": "Exact title",
  "author": "Author name",
  "publisher": "Publisher name",
  "isbn": "ISBN if found",
  "year": 2020,
  "cover_image_url": "Direct https URL to the book cover image scan",
  "summary": "1-2 sentence annotation"
}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });
    
    if (!res.ok) {
      const err = await res.json();
      return { error: err.error?.message || `HTTP ${res.status}` };
    }
    
    const data = await res.json();
    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.find(p => p.text)?.text || '';
    
    const jsonMatch = textPart.match(/```json\s*([\s\S]*?)\s*```/) || textPart.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'No JSON returned' };
    
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    return {
      result: parsed,
      sources: (candidate?.groundingMetadata?.groundingChunks || []).slice(0, 2).map(c => c.web?.uri).filter(Boolean)
    };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

/**
 * Step 3: Download cover image and optimize to WebP
 */
async function downloadAndOptimizeCover(url, destPath) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    
    await sharp(buffer)
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(destPath);
      
    const stat = fs.statSync(destPath);
    return { ok: true, size: stat.size };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

/**
 * Step 4: Main Batch Processing
 */
export async function runBatchFillCovers({ limit = 105, delayMs = 1200 } = {}) {
  // Load canonical books directly from catalog parser
  const catalogData = buildCatalogDataset();
  const allBooks = catalogData.books || [];
  
  // 1. Sync existing covers
  await syncExistingCovers(allBooks);
  
  // 2. Identify missing covers
  const missing = allBooks.filter(b => b.needs_cover && b.raw_title);
  console.log(`--- Step 2: Filling missing covers for ${missing.length} books ---`);
  
  let processed = 0;
  let newlyFound = 0;
  let alreadyDone = 0;
  let failed = 0;
  
  const targetBatch = missing.slice(0, limit);
  console.log(`Processing batch of up to ${targetBatch.length} books (limit=${limit})...\n`);
  
  const sqlUpdates = [];
  
  for (let i = 0; i < targetBatch.length; i++) {
    const b = targetBatch[i];
    const targetFile = `${b.code}.webp`;
    const targetPath = path.join(publicCoversDir, targetFile);
    
    // If already in progress and downloaded
    if (progress[b.id]?.status === 'found' && fs.existsSync(targetPath)) {
      alreadyDone++;
      continue;
    }
    
    processed++;
    console.log(`[${processed}/${targetBatch.length}] ${b.code}: "${b.raw_title}" (${b.raw_author || 'No author'}, ${b.primary_section})`);
    
    const searchRes = await findBookCoverViaGemini(b.raw_title, b.raw_author, b.publisher);
    
    if (searchRes.result?.cover_image_url) {
      const coverUrl = searchRes.result.cover_image_url;
      console.log(`   → Found cover scan: ${coverUrl}`);
      
      const dl = await downloadAndOptimizeCover(coverUrl, targetPath);
      if (dl.ok) {
        console.log(`   ✓ Saved WebP to public/covers/${targetFile} (${(dl.size / 1024).toFixed(1)} KB)`);
        newlyFound++;
        
        progress[b.id] = {
          code: b.code,
          title: b.raw_title,
          status: 'found',
          sourceUrl: coverUrl,
          isbn: searchRes.result.isbn || null,
          year: searchRes.result.year || null,
          publisher: searchRes.result.publisher || null,
          savedFile: targetFile,
          savedSize: dl.size
        };
        
        // Prepare SQL update for D1
        const relPath = `/covers/${targetFile}`;
        const isbnVal = searchRes.result.isbn ? `'${searchRes.result.isbn.replace(/'/g, "''")}'` : 'isbn';
        const yearVal = searchRes.result.year && Number.isInteger(Number(searchRes.result.year)) ? Number(searchRes.result.year) : 'year';
        const pubVal = searchRes.result.publisher ? `'${searchRes.result.publisher.replace(/'/g, "''")}'` : 'publisher';
        
        sqlUpdates.push(`UPDATE books SET cover_url = '${relPath}', isbn = ${isbnVal}, year = ${yearVal}, publisher = ${pubVal}, updated_at = ${Date.now()} WHERE id = '${b.id}';`);
      } else {
        console.log(`   ✗ Image download failed: ${dl.error}`);
        progress[b.id] = { code: b.code, title: b.raw_title, status: 'download_failed', error: dl.error };
        failed++;
      }
    } else {
      console.log(`   ✗ No cover found: ${searchRes.error || 'No URL returned'}`);
      progress[b.id] = { code: b.code, title: b.raw_title, status: 'not_found', error: searchRes.error };
      failed++;
    }
    
    saveProgress();
    
    // Save SQL updates batch periodically
    if (sqlUpdates.length > 0 && sqlUpdates.length % 5 === 0) {
      fs.writeFileSync(path.resolve('scratch/cover_updates.sql'), sqlUpdates.join('\n'), 'utf-8');
    }
    
    // Pause to respect rate-limits
    if (i < targetBatch.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  // Write final SQL updates file
  if (sqlUpdates.length > 0) {
    fs.writeFileSync(path.resolve('scratch/cover_updates.sql'), sqlUpdates.join('\n'), 'utf-8');
    console.log(`\nWrote ${sqlUpdates.length} D1 SQL updates to scratch/cover_updates.sql`);
  }
  
  console.log('\n============================================================');
  console.log('BATCH COVER FILL SUMMARY:');
  console.log(`  Total Missing Evaluated: ${targetBatch.length}`);
  console.log(`  Newly Retrieved & Saved:  ${newlyFound}`);
  console.log(`  Already Completed:        ${alreadyDone}`);
  console.log(`  Could Not Be Retrieved:   ${failed}`);
  console.log(`  Progress saved to:        scratch/covers_progress.json`);
  console.log('============================================================\n');
}

if (process.argv[1].endsWith('batch-fill-covers.mjs')) {
  const limitArg = process.argv.slice(2).find((_, i, a) => a[i - 1] === '--limit');
  const limit = limitArg ? Number(limitArg) : 105;
  await runBatchFillCovers({ limit });
}
