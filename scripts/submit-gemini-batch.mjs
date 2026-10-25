import fs from 'node:fs';
import path from 'node:path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY in environment.');
  process.exit(1);
}

const activeBatchesFile = path.resolve('scratch/active_batches.json');
let activeBatches = [];
if (fs.existsSync(activeBatchesFile)) {
  try {
    activeBatches = JSON.parse(fs.readFileSync(activeBatchesFile, 'utf8'));
  } catch {
    activeBatches = [];
  }
}

async function submitBatchFile(batchPath) {
  const batchData = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const batchName = path.basename(batchPath, '.json');
  console.log(`Submitting ${batchName} (${batchData.batch.inputConfig.requests.requests.length} books)...`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:batchGenerateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batchData),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Failed to submit ${batchName}: HTTP ${res.status}`, errText);
    return null;
  }

  const result = await res.json();
  console.log(`Successfully created batch job: ${result.name} (state: ${result.metadata?.state})`);

  const record = {
    batchName,
    jobId: result.name,
    submittedAt: Date.now(),
    requestCount: batchData.batch.inputConfig.requests.requests.length,
    status: result.metadata?.state || 'BATCH_STATE_PENDING',
  };

  activeBatches.push(record);
  fs.writeFileSync(activeBatchesFile, JSON.stringify(activeBatches, null, 2), 'utf8');
  return record;
}

async function main() {
  const args = process.argv.slice(2);
  const targetBatch = args.find((a) => a.startsWith('--batch='))?.split('=')[1];
  const countArg = args.find((a) => a.startsWith('--count='))?.split('=')[1];

  const batchesDir = path.resolve('scratch/batches');
  const files = fs.readdirSync(batchesDir).filter((f) => f.startsWith('batch_') && f.endsWith('.json')).sort();

  if (targetBatch) {
    const file = path.join(batchesDir, targetBatch.endsWith('.json') ? targetBatch : `${targetBatch}.json`);
    await submitBatchFile(file);
    return;
  }

  const limit = countArg ? parseInt(countArg, 10) : 1;
  console.log(`Submitting ${limit} batch(es)...`);

  // Filter out batches already submitted
  const submittedNames = new Set(activeBatches.map((b) => b.batchName));
  const remaining = files.filter((f) => !submittedNames.has(path.basename(f, '.json')));

  for (let i = 0; i < Math.min(limit, remaining.length); i++) {
    const file = path.join(batchesDir, remaining[i]);
    await submitBatchFile(file);
    // brief delay between submissions
    if (i < limit - 1) await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch(console.error);
