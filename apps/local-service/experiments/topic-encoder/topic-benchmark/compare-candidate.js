// Frozen candidate comparison. Gold labels are scored only after matching.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { embedDocuments } from '../e5-infer.js';
import { matchTopicDocuments } from '../topic-method/matcher.js';
import { currentMatcher, evaluateMatcher, runSynthetic } from './benchmark.js';
import { loadLuna } from './corpora.js';

const candidate = sources => matchTopicDocuments(sources).partitions;

async function main() {
  const option = process.argv[2] ?? '--synthetic';
  if (process.argv.length > 3 || !['--synthetic', '--validation', '--validation-title-lead'].includes(option))
    throw new Error('Usage: node compare-candidate.js [--synthetic|--validation|--validation-title-lead]');
  if (option === '--synthetic') {
    const [current, proposed] = await Promise.all([runSynthetic(currentMatcher), runSynthetic(candidate)]);
    process.stdout.write(`${JSON.stringify({ dataset: 'invented-vector-geometry', current, proposed }, null, 2)}\n`);
    return;
  }
  const splits = await loadLuna();
  const names = ['validation'];
  const documents = names.flatMap(name => splits[name]);
  const inputMode = option === '--validation-title-lead' ? 'title-lead' : 'body';
  const { vectors, assets, elapsedMs } = await embedDocuments(documents, inputMode);
  const results = {};
  for (const name of names) {
    const rows = splits[name];
    results[name] = {
      current: await evaluateMatcher(rows, vectors, currentMatcher),
      proposed: await evaluateMatcher(rows, vectors, candidate),
    };
  }
  process.stdout.write(`${JSON.stringify({ dataset: 'frozen-Luna',
    representation: `packaged E5 ${inputMode} input`, modelSha256: assets.modelSha256,
    embeddingMs: elapsedMs, results }, null, 2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
