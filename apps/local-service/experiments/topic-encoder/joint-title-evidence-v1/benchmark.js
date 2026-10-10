// Separate, label-blind runtime measurement. Does not change the frozen head run.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { selectFreshEvents } from '../real-diagonal-fresh-v1/core.js';
import { selectBodyTransferEvents } from '../real-diagonal-body-transfer-v1/core.js';
import { selectFreshRethink } from '../topic-metric-rethink-v1/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { createJointEncoder } from './infer.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const CORPUS_SHA = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const SAMPLE_PAIRS = 64;
const fail = () => { throw new Error('BENCHMARK_CONTRACT'); };
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--private-dir' || args[2] !== '--input' || args[4] !== '--asset-dir' ||
      !path.isAbsolute(args[1]) || !path.isAbsolute(args[3])) fail();
  const [directory, input, root, info, dirInfo] = await Promise.all([
    realpath(args[1]), realpath(args[3]), realpath(ROOT), lstat(args[3]), lstat(args[1]),
  ]);
  if (!privateScopeAllowed(root, directory, input) || !info.isFile() || info.isSymbolicLink() ||
      !dirInfo.isDirectory() || dirInfo.isSymbolicLink() || info.size !== 14972999) fail();
  const bytes = await readFile(input);
  if (sha(bytes) !== CORPUS_SHA) fail();
  const corpus = parseCorpus(bytes, { leadCharacters: 4096 });
  const previous = selectEventDisjoint(corpus.documents), preliminary = selectEventDisjoint(corpus.documents, 300);
  const titleFresh = selectFreshEvents(corpus.documents, previous.documents, preliminary.documents);
  const bodyFresh = selectBodyTransferEvents(corpus.documents, previous.documents, preliminary.documents, titleFresh.documents);
  const cohort = selectFreshRethink(corpus.documents, [previous.documents, preliminary.documents,
    titleFresh.documents, bodyFresh.documents], 300);
  if (cohort.documents.length !== 296 || cohort.documents.some(row => row.title.length > 200)) fail();
  // Hash work sample of all unordered pairs, not nearest-count or membership pruning.
  // No event/category/language label is inspected when selecting or timing pairs.
  const pairs = [];
  for (let i = 0; i < cohort.documents.length; i++) for (let j = i + 1; j < cohort.documents.length; j++) {
    const a = cohort.documents[i], b = cohort.documents[j];
    const key = a.id < b.id ? `${a.id}\0${b.id}` : `${b.id}\0${a.id}`;
    pairs.push({ a, b, hash: sha(`joint-title-timing-v1\0${key}`) });
  }
  pairs.sort((a, b) => a.hash.localeCompare(b.hash));
  const selected = pairs.slice(0, SAMPLE_PAIRS);
  const started = performance.now(), encoder = await createJointEncoder(args[5]);
  const initializationMs = performance.now() - started, durations = [];
  let summedTokens = 0;
  try {
    for (const pair of selected) {
      const before = performance.now(), output = await encoder.pair(pair.a, pair.b);
      durations.push(performance.now() - before); summedTokens += output.tokens;
      // Neither scores nor features, article identities or prose are saved or printed.
    }
    const totalMs = durations.reduce((sum, value) => sum + value, 0);
    const ordered = [...durations].sort((a, b) => a - b);
    const percentile = fraction => ordered[Math.ceil(fraction * ordered.length) - 1];
    process.stdout.write(`${JSON.stringify({ stage: 'timing-only', samplePairs: SAMPLE_PAIRS,
      directionalCalls: encoder.diagnostics().calls, initializationMs: Math.round(initializationMs),
      inferenceTotalMs: Math.round(totalMs), meanPairMs: totalMs / SAMPLE_PAIRS,
      medianPairMs: percentile(.5), p95PairMs: percentile(.95), meanTokensPerDirection: summedTokens / (2 * SAMPLE_PAIRS),
      threads: 1, backend: 'WASM', sampledTokenInputs: encoder.diagnostics().sampledInputs,
      qualityMeasured: false, labelsUsedForTimingOrPairSelection: false, weightsSaved: false, vectorsSaved: false,
      noProviderCall: true, caveat: 'label-blind-all-pair-work-sample-not-the-candidate-pool;CPU-contention-included' })}\n`);
  } finally { await encoder.release(); }
}
main().catch(() => { process.stdout.write('{"stage":"failure","code":"FIXED_BENCHMARK_CONTRACT_FAILURE"}\n'); process.exitCode = 1; });
