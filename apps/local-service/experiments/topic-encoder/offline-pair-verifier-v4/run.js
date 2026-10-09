import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMap, evaluatePairs, developmentCutoff } from '../offline-pair-verifier-v1/core.js';
import { fitVerifier, verifierScore } from '../offline-pair-verifier-v2/core.js';
import { validatePartition, verifyIsolation } from '../offline-pair-verifier-v3/adapter.js';
import { agglomerativeCompleteLink } from '../offline-pair-verifier-v3/core.js';
import { evaluateGraphPolicies } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(HERE, '../multilingual-balanced-v1');
const HASHES = Object.freeze({
  train: '6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632',
  validation: '734E23078B989DAEDC037E0C3B0416EF835877FD42C4678CF410C54FCA440AD5',
});
const FROZEN_CUTOFF = 0.9805850963542602;
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fail = code => { throw new TypeError(code); };

async function readPartition(name, count, families) {
  const bytes = await readFile(path.join(CORPUS, `${name}.jsonl`));
  if (sha(bytes) !== HASHES[name]) fail('DIGEST');
  const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
  return validatePartition(rows, name, count, families);
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', corpusOpened: false,
      modelLoaded: false, testOpened: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--run') fail('ARGUMENTS');
  const train = await readPartition('train', 160, 8);
  const validation = await readPartition('validation', 40, 2);
  verifyIsolation(train, validation);
  const started = performance.now();
  const { embedDocuments } = await import('../e5-infer.js');
  const embedded = await embedDocuments(train.concat(validation).map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const vectors = normalizeMap(train.concat(validation), embedded.vectors);
  const model = fitVerifier(train, vectors);
  if (model.trainCounts.positives !== 720 || model.trainCounts.hardNegatives !== 800)
    fail('TRAIN_COUNTS');
  const score = (a, b) => verifierScore(model, a, b);
  const cutoff = developmentCutoff([validation], [vectors], score);
  if (cutoff === null || Math.abs(cutoff - FROZEN_CUTOFF) > 1e-12)
    fail('FROZEN_SCORE_MISMATCH');
  const graphs = evaluateGraphPolicies(validation, vectors, score, FROZEN_CUTOFF);
  const report = { mode: 'development-graph-diagnostic', researchOnly: true,
    representation: 'unchanged-v3-packaged-E5-title-plus-384-character-lead',
    corpusSha256: HASHES, modelSha256: embedded.assets.modelSha256,
    cutoff: FROZEN_CUTOFF, cutoffReproduced: true,
    validation: { articles: 40, families: 2, developments: 4,
      firstFitV3Reference: evaluatePairs(validation, vectors, score, FROZEN_CUTOFF),
      agglomerativeV3Reference: agglomerativeCompleteLink(validation, vectors, score, FROZEN_CUTOFF),
      graphPolicies: graphs },
    embeddingMs: Math.round(embedded.elapsedMs), totalMs: Math.round(performance.now() - started),
    testOpened: false, savedWeights: false, activated: false };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
