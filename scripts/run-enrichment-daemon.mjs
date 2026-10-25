import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const activeBatchesFile = path.resolve('scratch/active_batches.json');

console.log('Starting enrichment poll daemon...');

let iteration = 0;
while (true) {
  iteration++;
  console.log(`\n=== Poll Iteration #${iteration} (${new Date().toLocaleTimeString()}) ===`);

  try {
    execSync('node --env-file=.env scripts/poll-and-apply-batch.mjs', { stdio: 'inherit' });
  } catch (err) {
    console.error('Error during poll:', err.message);
  }

  if (fs.existsSync(activeBatchesFile)) {
    const batches = JSON.parse(fs.readFileSync(activeBatchesFile, 'utf8'));
    const pending = batches.filter((b) => b.status !== 'APPLIED');
    console.log(`Batches: ${batches.length - pending.length} applied, ${pending.length} pending/running.`);
    if (pending.length === 0 && batches.length >= 26) {
      console.log('🎉 All 26 batches have been successfully processed and applied to D1!');
      break;
    }
  }

  // wait 15 seconds before next poll
  await new Promise((r) => setTimeout(r, 15000));
}
