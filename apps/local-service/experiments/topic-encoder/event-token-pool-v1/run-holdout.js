import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMap } from '../offline-pair-verifier-v1/core.js';
import { validatePartition } from '../offline-pair-verifier-v3/adapter.js';
import { normalizedTokenMap, fitAttention, eventVectors, maxNegativeCutoff,
  retrievalRanks } from './core.js';
import { PINNED, sha256, partitionTrain, afterFrozenCalibration,
  validateV3Holdout, scoreV3, holdoutScreen } from './holdout-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRAIN = path.resolve(HERE, '../multilingual-balanced-v1/train.jsonl');
const HOLDOUT = path.resolve(HERE, '../topic-benchmark/multilingual-holdout-v3/holdout.jsonl');
const fail = code => { throw new TypeError(code); };

async function pinnedRows(filename, expectedHash, maxBytes, expectedLines) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maxBytes)
    fail('INPUT_FILE');
  const bytes = await readFile(filename); // exactly one content read of this pinned path
  if (bytes.length !== info.size || sha256(bytes) !== expectedHash) fail('INPUT_DIGEST');
  const content = bytes.toString('utf8');
  if (!content.endsWith('\n')) fail('INPUT_FORMAT');
  const lines = content.trimEnd().split(/\r?\n/u);
  if (lines.length !== expectedLines) fail('INPUT_COUNT');
  return lines.map(line => JSON.parse(line));
}

async function codeDigests() {
  const result = {};
  for (const name of ['run-holdout.js', 'holdout-core.js', 'core.js'])
    result[name] = sha256(await readFile(path.join(HERE, name)));
  result['e5-infer.js'] = sha256(await readFile(path.resolve(HERE, '../e5-infer.js')));
  result['offline-pair-verifier-v5/core.js'] = sha256(await readFile(path.resolve(HERE,
    '../offline-pair-verifier-v5/core.js')));
  return result;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', trainOpened: false,
      holdoutOpened: false, modelLoaded: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--one-shot') fail('ARGUMENTS');
  const started = performance.now();
  const codeSha256 = await codeDigests();
  const train = validatePartition(await pinnedRows(TRAIN, PINNED.trainSha256, 2_000_000, 160),
    'train', 160, 8);
  const { fit, calibration } = partitionTrain(train);
  const { embedDocumentsWithTokens } = await import('../e5-infer.js');
  const trainEmbedded = await embedDocumentsWithTokens(train.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  const pooledTrain = normalizeMap(train, trainEmbedded.vectors);
  const tokenTrain = normalizedTokenMap(train, trainEmbedded.tokenStates);
  const trainingStarted = performance.now();
  const model = fitAttention(fit, pooledTrain, tokenTrain);
  if (model.triplets !== 120 || model.steps !== 40) fail('TRAINING_PROTOCOL');
  const trainingMs = Math.round(performance.now() - trainingStarted);
  const learnedCutoff = maxNegativeCutoff(calibration,
    eventVectors(calibration, tokenTrain, model.weights));
  const rawCutoff = maxNegativeCutoff(calibration, pooledTrain);
  // No holdout path has been opened before this reproducibility check.
  const holdoutOpenedAt = performance.now();
  const holdout = validateV3Holdout(await afterFrozenCalibration(learnedCutoff,
    rawCutoff, trainEmbedded.assets.modelSha256, () =>
      pinnedRows(HOLDOUT, PINNED.holdoutSha256, 2_000_000, 60)), train);
  const holdoutEmbedded = await embedDocumentsWithTokens(holdout.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  if (holdoutEmbedded.assets.modelSha256 !== PINNED.modelSha256)
    fail('MODEL_DIGEST');
  const pooledHoldout = normalizeMap(holdout, holdoutEmbedded.vectors);
  const tokenHoldout = normalizedTokenMap(holdout, holdoutEmbedded.tokenStates);
  const learnedHoldout = eventVectors(holdout, tokenHoldout, model.weights);
  const learned = scoreV3(holdout, learnedHoldout, learnedCutoff);
  const report = { mode: 'one-shot-v3-holdout', researchOnly: true,
    inputSha256: { train: PINNED.trainSha256, holdout: PINNED.holdoutSha256 },
    codeSha256, modelSha256: PINNED.modelSha256,
    training: { fitArticles: fit.length, fitFamilies: 6,
      calibrationArticles: calibration.length, calibrationFamilies: 2,
      staticCrossLanguageTriplets: model.triplets, attentionSteps: model.steps,
      learnedCutoff, rawCalibrationCutoff: rawCutoff },
    holdout: { articles: holdout.length, learnedRetrieval: retrievalRanks(holdout, learnedHoldout),
      rawRetrieval: retrievalRanks(holdout, pooledHoldout),
      learnedTriangle: learned,
      rawFixed094Triangle: scoreV3(holdout, pooledHoldout, 0.94),
      rawCalibratedTriangle: scoreV3(holdout, pooledHoldout, rawCutoff),
      primaryScreen: holdoutScreen(learned) },
    embeddingMs: { train: Math.round(trainEmbedded.elapsedMs),
      holdout: Math.round(holdoutEmbedded.elapsedMs) }, trainingMs,
    afterHoldoutOpenMs: Math.round(performance.now() - holdoutOpenedAt),
    totalMs: Math.round(performance.now() - started),
    savedWeights: false, activated: false };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
