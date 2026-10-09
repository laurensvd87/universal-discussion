import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMap } from '../offline-pair-verifier-v1/core.js';
import { validatePartition, verifyIsolation } from '../offline-pair-verifier-v3/adapter.js';
import { triangleOnly } from '../offline-pair-verifier-v5/core.js';
import { normalizedTokenMap, fitAttention, maxNegativeCutoff,
  retrievalRanks, cosine } from '../event-token-pool-v1/core.js';
import { first32TokenMap, attendedVectors, pooledResidual,
  chooseDevelopmentVariant, partitionTrain } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(HERE, '../multilingual-balanced-v1');
const HASHES = Object.freeze({
  train: '6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632',
  validation: '734E23078B989DAEDC037E0C3B0416EF835877FD42C4678CF410C54FCA440AD5',
});
const MODEL_HASH = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const fail = code => { throw new TypeError(code); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

async function readPartition(name, count, families) {
  const file = path.join(CORPUS, `${name}.jsonl`);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 2_000_000)
    fail('INPUT_FILE');
  const bytes = await readFile(file);
  if (bytes.length !== stat.size || sha256(bytes) !== HASHES[name]) fail('INPUT_DIGEST');
  const content = bytes.toString('utf8');
  if (!content.endsWith('\n')) fail('INPUT_FORMAT');
  const lines = content.trimEnd().split(/\r?\n/u);
  if (lines.length !== count) fail('INPUT_COUNT');
  return validatePartition(lines.map(line => JSON.parse(line)), name, count, families);
}

function scoreVariant(validation, calibration, vectors) {
  const cutoff = maxNegativeCutoff(calibration, vectors);
  if (cutoff === null) return { abstained: true, cutoff, retrieval:
    retrievalRanks(validation, vectors) };
  const { researchScreen: ignored, ...policy } = triangleOnly(validation,
    vectors, cosine, cutoff);
  return { abstained: false, cutoff, retrieval: retrievalRanks(validation, vectors),
    ...policy };
}

function assertV1Reference(report) {
  if (report.abstained || Math.abs(report.cutoff - 0.8690268344580456) > 1e-10 ||
      report.retrieval.rank1 !== 40 || report.retrieval.top3 !== 40 ||
      report.edgeMetrics.trueEdges !== 135 || report.edgeMetrics.falseEdges !== 0 ||
      report.edgeMetrics.hardFalseEdges !== 0 ||
      report.edgeMetrics.crossLanguageTrueEdges !== 120 ||
      report.components.completeEvents !== 3 || report.components.mixedGroups !== 0)
    fail('V1_REFERENCE_DRIFT');
}

async function sourceDigests() {
  const result = {};
  for (const name of ['run.js', 'core.js', 'README.md'])
    result[name] = sha256(await readFile(path.join(HERE, name)));
  for (const name of ['event-token-pool-v1/core.js',
    'e5-infer.js', 'offline-pair-verifier-v5/core.js'])
    result[name] = sha256(await readFile(path.resolve(HERE, '..', name)));
  return result;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', corpusOpened: false,
      holdoutOpened: false, modelLoaded: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--development') fail('ARGUMENTS');
  const started = performance.now();
  const codeSha256 = await sourceDigests();
  const train = await readPartition('train', 160, 8);
  const validation = await readPartition('validation', 40, 2);
  verifyIsolation(train, validation);
  const { fit, calibration } = partitionTrain(train);
  const { embedDocumentsWithTokens } = await import('../e5-infer.js');
  const documents = fit.concat(calibration, validation);
  const embedded = await embedDocumentsWithTokens(documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  if (embedded.assets.modelSha256 !== MODEL_HASH) fail('MODEL_DIGEST');
  const pooled = normalizeMap(documents, embedded.vectors);
  const fullTokens = normalizedTokenMap(documents, embedded.tokenStates);
  const prefixTokens = first32TokenMap(documents, fullTokens);
  const trainingStarted = performance.now();
  const fullModel = fitAttention(fit, pooled, fullTokens);
  const prefixModel = fitAttention(fit, pooled, prefixTokens);
  if (fullModel.triplets !== 120 || prefixModel.triplets !== 120 ||
      fullModel.steps !== 40 || prefixModel.steps !== 40) fail('TRAINING_PROTOCOL');
  const trainingMs = Math.round(performance.now() - trainingStarted);
  const fullVectors = attendedVectors(documents, fullTokens, fullModel.weights);
  const prefixVectors = attendedVectors(documents, prefixTokens, prefixModel.weights);
  const residualVectors = pooledResidual(documents, fullVectors, pooled);
  const reports = {
    'v1-attention-64': scoreVariant(validation, calibration, fullVectors),
    'prefix-attention-32': scoreVariant(validation, calibration, prefixVectors),
    'attention64-pooled25': scoreVariant(validation, calibration, residualVectors),
  };
  assertV1Reference(reports['v1-attention-64']);
  const selection = chooseDevelopmentVariant(reports);
  const output = { mode: 'token-pool-v2-development', researchOnly: true,
    inputParity: 'packaged-E5-title-plus-first-384-body-characters-first-64-or-32-token-states',
    corpusSha256: HASHES, codeSha256, modelSha256: MODEL_HASH,
    train: { fitArticles: fit.length, fitFamilies: 6,
      calibrationArticles: calibration.length, calibrationFamilies: 2,
      staticTripletsPerFit: fullModel.triplets, attentionSteps: fullModel.steps },
    development: { articles: validation.length, events: 4, families: 2,
      reports, selection }, embeddingMs: Math.round(embedded.elapsedMs), trainingMs,
    totalMs: Math.round(performance.now() - started), holdoutOpened: false,
    weightsSaved: false, activated: false };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
