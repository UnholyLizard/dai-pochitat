import fs from 'node:fs';
import path from 'node:path';

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
const GOOGLE_BOOKS_API_KEY = env.GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_API_KEY;

/**
 * 1. Open Library API (Keyless, Instant)
 */
export async function searchOpenLibrary(title, author = '') {
  const q = author ? `${title} ${author}` : title;
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=3`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DaiPochitatLibrary/1.0' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    const docs = data.docs || [];
    return {
      source: 'open_library',
      matches: docs.map(d => ({
        title: d.title,
        authors: d.author_name || [],
        publisher: (d.publisher || [])[0] || null,
        year: d.first_publish_year || null,
        isbn: (d.isbn || [])[0] || null,
        coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null
      }))
    };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

/**
 * 2. Google Books API (Free, but needs Google Cloud Books API key)
 */
export async function searchGoogleBooks(title, author = '', apiKey = '') {
  let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`${title} ${author}`.trim())}&maxResults=3`;
  if (apiKey) url += `&key=${apiKey}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DaiPochitatLibrary/1.0' } });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || `HTTP ${res.status}` };
    const items = data.items || [];
    return {
      source: 'google_books',
      matches: items.map(item => {
        const v = item.volumeInfo || {};
        const isbns = (v.industryIdentifiers || []).map(id => id.identifier);
        let cover = v.imageLinks?.large || v.imageLinks?.medium || v.imageLinks?.thumbnail || null;
        if (cover) {
          cover = cover.replace(/^http:\/\//, 'https://').replace(/&edge=curl/g, '').replace(/zoom=1/g, 'zoom=2');
        }
        return {
          title: v.title,
          authors: v.authors || [],
          publisher: v.publisher || null,
          year: v.publishedDate?.slice(0, 4) || null,
          isbn: isbns[0] || null,
          coverUrl: cover
        };
      })
    };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

/**
 * 3. Gemini 3.8 Flash with Google Search Grounding (Authentic Russian & Balkan real store scans)
 */
export async function searchWithGeminiGrounded(title, author = '', publisher = '') {
  if (!GEMINI_API_KEY) {
    return { error: 'No GEMINI_API_KEY found in .env' };
  }
  
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `Find the authentic physical book metadata and high-resolution cover image URL for this edition:
Title: "${title}"
Author: "${author}"
Publisher: "${publisher}"

Search Russian bookstore sites (e.g. labirint.ru, livelib.ru, ozon.ru, samokatbook.ru, chitai-gorod.ru) or official publisher sites.
Return STRICT JSON ONLY in this exact format:
{
  "title": "Exact book title",
  "author": "Author name",
  "publisher": "Publisher name",
  "isbn": "ISBN if found",
  "year": 2020,
  "cover_image_url": "Direct https URL to the book cover image (e.g. s1.livelib.ru, img.labirint.ru, ozon-st.cdn.ngenix.net)",
  "summary": "1-2 sentence description"
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
    
    // Parse JSON from code fence or raw string
    const jsonMatch = textPart.match(/```json\s*([\s\S]*?)\s*```/) || textPart.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { raw: textPart };
    }
    
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    return {
      source: 'gemini_grounded',
      result: parsed,
      groundingSources: (candidate?.groundingMetadata?.groundingChunks || []).slice(0, 3).map(c => c.web?.uri).filter(Boolean)
    };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

/**
 * Download an image and save to disk
 */
export async function downloadCoverImage(url, destPath) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return { ok: true, size: buffer.length };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

// CLI Driver
if (process.argv[1].endsWith('find-covers.mjs')) {
  const args = process.argv.slice(2);
  const titleArg = args.find((_, i) => args[i - 1] === '--title') || (args[0] && !args[0].startsWith('--') ? args[0] : 'Где живет птичка');
  const authorArg = args.find((_, i) => args[i - 1] === '--author') || 'Елена Цветаева';
  const pubArg = args.find((_, i) => args[i - 1] === '--pub') || 'Клевер';
  
  console.log('============================================================');
  console.log(`Searching Cover & Metadata for: "${titleArg}" (${authorArg})`);
  console.log('============================================================\n');
  
  // 1. Open Library
  console.log('1. Querying Open Library API (Keyless)...');
  const ol = await searchOpenLibrary(titleArg, authorArg);
  if (ol.matches?.length > 0 && ol.matches[0].coverUrl) {
    console.log(`   ✓ Found Open Library cover: ${ol.matches[0].coverUrl}`);
    console.log(`     Title: ${ol.matches[0].title} | ISBN: ${ol.matches[0].isbn || 'N/A'}`);
  } else {
    console.log(`   ✗ No cover in Open Library (${ol.error || '0 matches with covers'})`);
  }
  
  // 2. Google Books
  console.log('\n2. Querying Google Books API...');
  const gb = await searchGoogleBooks(titleArg, authorArg, GOOGLE_BOOKS_API_KEY);
  if (gb.matches?.length > 0 && gb.matches[0].coverUrl) {
    console.log(`   ✓ Found Google Books cover: ${gb.matches[0].coverUrl}`);
    console.log(`     Title: ${gb.matches[0].title} | ISBN: ${gb.matches[0].isbn || 'N/A'}`);
  } else {
    console.log(`   ✗ Google Books: ${gb.error || 'No cover image found'}`);
  }
  
  // 3. Gemini 3.8 Grounded Search
  console.log('\n3. Querying Gemini 3.8 Flash with Google Search Grounding...');
  const gm = await searchWithGeminiGrounded(titleArg, authorArg, pubArg);
  if (gm.result) {
    console.log(`   ✓ Success! Authentic data located via Google Grounding:`);
    console.log(`     Title:      ${gm.result.title}`);
    console.log(`     Author:     ${gm.result.author}`);
    console.log(`     Publisher:  ${gm.result.publisher}`);
    console.log(`     ISBN:       ${gm.result.isbn || 'N/A'}`);
    console.log(`     Year:       ${gm.result.year || 'N/A'}`);
    console.log(`     Cover URL:  ${gm.result.cover_image_url || 'N/A'}`);
    if (gm.groundingSources?.length) {
      console.log(`     Sources:    ${gm.groundingSources.join(', ')}`);
    }
    
    if (gm.result.cover_image_url) {
      console.log(`\n4. Testing Cover Download...`);
      const testDest = path.resolve('scratch/test_cover.jpg');
      const dl = await downloadCoverImage(gm.result.cover_image_url, testDest);
      if (dl.ok) {
        console.log(`   ✓ Cover successfully downloaded to ${testDest} (${(dl.size / 1024).toFixed(1)} KB)`);
      } else {
        console.log(`   ✗ Download failed: ${dl.error}`);
      }
    }
  } else {
    console.log(`   ✗ Gemini Grounding failed: ${gm.error}`);
  }
  
  console.log('\n============================================================');
}
