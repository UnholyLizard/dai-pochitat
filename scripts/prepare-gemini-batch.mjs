import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BATCH_SIZE = 50;
const outputDir = path.resolve('scratch/batches');
fs.mkdirSync(outputDir, { recursive: true });

console.log('Querying books needing enrichment from local D1...');
const raw = execSync('npx wrangler d1 execute dai-pochitat-casting --local --json --command "SELECT id, code, title_ru, author_ru, publisher, age_min, age_max, annotation_ru, primary_section FROM books WHERE title_en = \'\' OR title_en IS NULL;"', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

const jsonStart = raw.indexOf('[');
const books = JSON.parse(raw.slice(jsonStart))[0].results;
console.log(`Found ${books.length} books needing enrichment.`);

const systemPrompt = `You are an expert children's librarian and multi-lingual translator for "Дай почитать" (a cozy children's library in Bar, Montenegro).
Your task is to enrich book metadata with authentic translations in 3 languages (Russian RU, English EN, Montenegrin ME in Latin script), playful 1-sentence librarian pitches, mood categorization, and thematic tags.

Valid moods (choose 1 to 3 from this exact list):
["funny", "adventure", "magic", "spooky", "friends", "animals", "real"]

Provide the output strictly as valid JSON adhering to this schema:
{
  "id": string,
  "title_en": string,
  "title_me": string,
  "author_en": string,
  "author_me": string,
  "annotation_en": string,
  "annotation_me": string,
  "says_ru": string (witty, warm, 1-sentence librarian recommendation pitch),
  "says_en": string (witty, warm, 1-sentence librarian recommendation pitch),
  "says_me": string (witty, warm, 1-sentence librarian recommendation pitch in Montenegrin),
  "moods": string[] (subset of valid moods),
  "tags": string[] (3-6 lower-case tags),
  "dominant_color": string (hex color code e.g. "#2f8a84")
}`;

const allRequests = [];
const batchFiles = [];

for (let i = 0; i < books.length; i += BATCH_SIZE) {
  const chunk = books.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const batchName = `batch_${String(batchNum).padStart(3, '0')}`;

  const requests = chunk.map((b) => {
    const promptText = `Book Details:
ID: ${b.id}
Code: ${b.code}
Title (RU): ${b.title_ru}
Author (RU): ${b.author_ru || 'Unknown'}
Publisher: ${b.publisher || ''}
Age: ${b.age_min}-${b.age_max}
Section: ${b.primary_section}
Annotation (RU): ${b.annotation_ru || ''}`;

    return {
      request: {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${promptText}` }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      },
    };
  });

  const batchPayload = {
    batch: {
      displayName: `dp-enrich-${batchName}`,
      inputConfig: {
        requests: {
          requests,
        },
      },
    },
  };

  const filePath = path.join(outputDir, `${batchName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(batchPayload, null, 2), 'utf-8');
  batchFiles.push({ batchNum, batchName, filePath, count: chunk.length, bookIds: chunk.map((c) => c.id) });

  for (const r of requests) {
    allRequests.push(r);
  }
}

// Write master manifest
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(batchFiles, null, 2), 'utf-8');

// Also write JSONL for File API upload
const jsonlPath = path.join(outputDir, 'all_requests.jsonl');
fs.writeFileSync(jsonlPath, allRequests.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');

console.log(`Generated ${batchFiles.length} batch files in ${outputDir}.`);
console.log(`Master JSONL written to ${jsonlPath} (${allRequests.length} requests).`);
