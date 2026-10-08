// Offline, read-only benchmark. No owner database, provider or network path.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { embedDocuments } from '../e5-infer.js';
import { currentMatcher, evaluateMatcher, runSynthetic } from './benchmark.js';
import { loadCdecTestIfAvailable, loadLuna } from './corpora.js';

async function main() {
  const option = process.argv[2] ?? '--synthetic';
  if (process.argv.length > 3 || !['--synthetic', '--luna', '--cdec'].includes(option))
    throw new Error('Usage: node run.js [--synthetic|--luna|--cdec]');
  let output;
  if (option === '--synthetic') output = {
    dataset: 'invented-vector-geometry', matcher: 'current-production-planner',
    results: await runSynthetic(currentMatcher),
  };
  else {
    const splits = option === '--luna' ? await loadLuna() :
      { test: await loadCdecTestIfAvailable() };
    if (!splits.test) output = { dataset: 'CDEC-WN', available: false };
    else {
      const all = Object.values(splits).flat();
      const { vectors, elapsedMs, assets } = await embedDocuments(all, 'body');
      const results = {};
      for (const [split, rows] of Object.entries(splits))
        results[split] = await evaluateMatcher(rows, vectors, currentMatcher);
      output = { dataset: option === '--luna' ? 'frozen-Luna' : 'CDEC-WN CC BY 4.0 test storylines',
        representation: 'packaged E5 body input', modelSha256: assets.modelSha256,
        embeddingMs: elapsedMs, matcher: 'current-production-planner', results };
    }
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
