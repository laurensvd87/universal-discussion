import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMap, developmentCutoff } from '../offline-pair-verifier-v1/core.js';
import { fitVerifier, verifierScore } from '../offline-pair-verifier-v2/core.js';
import { validatePartition, verifyIsolation } from '../offline-pair-verifier-v3/adapter.js';
import { validateHoldout, triangleOnly } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRAIN_ROOT = path.resolve(HERE, '../multilingual-balanced-v1');
const HOLDOUT = path.resolve(HERE, '../multilingual-independent-v1/records.json');
const HASHES = Object.freeze({
  train: '6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632',
  validation: '734E23078B989DAEDC037E0C3B0416EF835877FD42C4678CF410C54FCA440AD5',
  holdout: 'A6F1917A33E44BD80F50366DD1FE5290B576247F61DD83BCC3531BEE3C137B3A',
});
const FROZEN_CUTOFF = 0.9805850963542602;
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fail = code => { throw new TypeError(code); };

async function readPartition(name, count, families) {
  const bytes = await readFile(path.join(TRAIN_ROOT, `${name}.jsonl`));
  if (sha(bytes) !== HASHES[name]) fail('TRAIN_DIGEST');
  return validatePartition(bytes.toString('utf8').trimEnd().split(/\r?\n/u)
    .map(line => JSON.parse(line)), name, count, families);
}

async function readSealedHoldoutOnce() {
  const info = await lstat(HOLDOUT);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 2 * 1024 * 1024)
    fail('HOLDOUT_FILE_BOUND');
  const bytes = await readFile(HOLDOUT);
  if (sha(bytes) !== HASHES.holdout) fail('HOLDOUT_DIGEST');
  return validateHoldout(JSON.parse(bytes.toString('utf8')));
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', dataOpened: false,
      modelLoaded: false, holdoutOpened: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--run') fail('ARGUMENTS');
  const started = performance.now();
  const train = await readPartition('train', 160, 8);
  const validation = await readPartition('validation', 40, 2);
  verifyIsolation(train, validation);
  const { embedDocuments } = await import('../e5-infer.js');
  const developmentEmbedded = await embedDocuments(train.concat(validation).map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const developmentVectors = normalizeMap(train.concat(validation), developmentEmbedded.vectors);
  const model = fitVerifier(train, developmentVectors);
  if (model.trainCounts.positives !== 720 || model.trainCounts.hardNegatives !== 800)
    fail('TRAIN_COUNTS');
  const score = (a, b) => verifierScore(model, a, b);
  const reproduced = developmentCutoff([validation], [developmentVectors], score);
  if (reproduced === null || Math.abs(reproduced - FROZEN_CUTOFF) > 1e-12)
    fail('FROZEN_SCORE_MISMATCH');
  // The sealed holdout is opened only after the frozen model/cutoff reproduce.
  const documents = await readSealedHoldoutOnce();
  const holdoutEmbedded = await embedDocuments(documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const holdoutVectors = normalizeMap(documents, holdoutEmbedded.vectors);
  const outcome = triangleOnly(documents, holdoutVectors, score, FROZEN_CUTOFF);
  if (outcome.denominators.articles !== 80 || outcome.denominators.events !== 8 ||
      outcome.denominators.families !== 4 || outcome.denominators.truePairs !== 360 ||
      outcome.denominators.falsePairs !== 2800 || outcome.denominators.hardFalsePairs !== 400 ||
      outcome.denominators.crossLanguageTruePairs !== 320) fail('DENOMINATORS');
  process.stdout.write(`${JSON.stringify({ mode: 'one-shot-independent-synthetic-holdout',
    researchOnly: true, policy: 'frozen-triangle-supported-components-only',
    representation: 'packaged-E5-title-plus-384-character-lead',
    modelSha256: developmentEmbedded.assets.modelSha256,
    inputSha256: HASHES, frozenCutoff: FROZEN_CUTOFF, cutoffReproduced: true,
    outcome, embeddingMs: { development: Math.round(developmentEmbedded.elapsedMs),
      holdout: Math.round(holdoutEmbedded.elapsedMs) },
    totalMs: Math.round(performance.now() - started), savedWeights: false,
    activated: false }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
