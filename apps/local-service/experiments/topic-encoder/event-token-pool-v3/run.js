import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMap } from '../offline-pair-verifier-v1/core.js';
import { triangleOnly } from '../offline-pair-verifier-v5/core.js';
import { normalizedTokenMap, fitAttention, eventVectors, maxNegativeCutoff,
  retrievalRanks, cosine } from '../event-token-pool-v1/core.js';
import { fitDynamicAttention } from './core.js';
import { PINS, sha256, parsePinnedBytes, validateChunk,
  combinePartitions, partitionTrain } from './adapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(HERE, '../multilingual-authored-v2');
const MODEL_HASH = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const fail = code => { throw new TypeError(code); };

async function readChunk(chunk) {
  const file = path.join(CORPUS, `chunk-${chunk.toLowerCase()}`, 'records.jsonl');
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 2_000_000)
    fail('INPUT_FILE');
  const bytes = await readFile(file);
  if (bytes.length !== info.size) fail('INPUT_FILE');
  return validateChunk(parsePinnedBytes(bytes, chunk), chunk);
}

function scorePolicy(development, calibration, vectors) {
  const cutoff = maxNegativeCutoff(calibration, vectors);
  const retrieval = retrievalRanks(development, vectors);
  if (cutoff === null) return { abstained: true, cutoff, retrieval };
  const { researchScreen: ignored, ...aggregate } =
    triangleOnly(development, vectors, cosine, cutoff);
  return { abstained: false, cutoff, retrieval, ...aggregate,
    edgeRecall: aggregate.edgeMetrics.trueEdges / aggregate.denominators.truePairs,
    crossLanguageEdgeRecall: aggregate.edgeMetrics.crossLanguageTrueEdges /
      aggregate.denominators.crossLanguageTruePairs };
}

function developmentScreen(dynamic, staticReference) {
  if (dynamic.abstained) return { met: false, reason: 'CALIBRATION_ABSTAINED' };
  const d = dynamic.denominators, e = dynamic.edgeMetrics, c = dynamic.components;
  if (d.articles !== 108 || d.events !== 18 || d.families !== 6 ||
      d.truePairs !== 270 || d.falsePairs !== 5508 ||
      d.hardFalsePairs !== 648 || d.crossLanguageTruePairs !== 252)
    fail('DENOMINATORS');
  const comparator = !staticReference.abstained &&
    (e.trueEdges >= staticReference.edgeMetrics.trueEdges &&
      c.completeEvents >= staticReference.components.completeEvents &&
      dynamic.retrieval.rank1 >= staticReference.retrieval.rank1 &&
      (e.trueEdges > staticReference.edgeMetrics.trueEdges ||
        c.completeEvents > staticReference.components.completeEvents));
  return { requiredTrueEdges: 81, requiredCrossLanguageTrueEdges: 63,
    requiredCompleteEvents: 4, requiredRank1: 87,
    requiredFalseEdges: 0, requiredMixedGroups: 0,
    comparatorNonregressionAndStrictGain: comparator,
    met: e.falseEdges === 0 && e.hardFalseEdges === 0 && c.mixedGroups === 0 &&
      e.trueEdges >= 81 && e.crossLanguageTrueEdges >= 63 &&
      c.completeEvents >= 4 && dynamic.retrieval.rank1 >= 87 && comparator };
}

async function sourceDigests() {
  const result = {};
  for (const name of ['run.js', 'adapter.js', 'core.js', 'README.md'])
    result[name] = sha256(await readFile(path.join(HERE, name)));
  for (const name of ['event-token-pool-v1/core.js', 'e5-infer.js',
    'offline-pair-verifier-v1/core.js', 'offline-pair-verifier-v5/core.js'])
    result[name] = sha256(await readFile(path.resolve(HERE, '..', name)));
  for (const name of ['spikes/topic-resolution/browser/embedding/embedding-contract.js',
    'spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
    'spikes/topic-resolution/harness/deny-external-capabilities.js'])
    result[name] = sha256(await readFile(path.resolve(HERE, '../../../../..', name)));
  return result;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', corpusOpened: false,
      modelLoaded: false, holdoutOpened: false, weightsSaved: false,
      externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--development') fail('ARGUMENTS');
  const started = performance.now();
  const codeSha256 = await sourceDigests();
  const chunks = {};
  for (const chunk of ['A', 'B', 'C1', 'C2', 'C3']) chunks[chunk] = await readChunk(chunk);
  const { train, development } = combinePartitions(chunks.A, chunks.B,
    chunks.C1, chunks.C2, chunks.C3);
  const { fit, calibration } = partitionTrain(train);
  const { embedDocumentsWithTokens } = await import('../e5-infer.js');
  const documents = fit.concat(calibration, development);
  const embedded = await embedDocumentsWithTokens(documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  if (embedded.assets.modelSha256 !== MODEL_HASH) fail('MODEL_DIGEST');
  const tokens = normalizedTokenMap(documents, embedded.tokenStates);
  const pooled = normalizeMap(documents, embedded.vectors);
  const trainingStarted = performance.now();
  const dynamicModel = fitDynamicAttention(fit, tokens);
  const staticModel = fitAttention(fit, pooled, tokens);
  if (dynamicModel.steps !== 40 || dynamicModel.dynamicTripletsPerStep !== 162 ||
      staticModel.steps !== 40 || staticModel.triplets !== 162) fail('TRAINING_PROTOCOL');
  const trainingMs = Math.round(performance.now() - trainingStarted);
  const dynamicVectors = eventVectors(documents, tokens, dynamicModel.weights);
  const staticVectors = eventVectors(documents, tokens, staticModel.weights);
  const dynamic = scorePolicy(development, calibration, dynamicVectors);
  const staticReference = scorePolicy(development, calibration, staticVectors);
  const rawPooled = scorePolicy(development, calibration, pooled);
  const output = { mode: 'event-token-pool-v3-development', researchOnly: true,
    primaryTopicTarget: 'owner-provisional-atomic-eventKey',
    inputParity: 'packaged-E5-title-plus-first-384-body-characters-first-64-content-token-states',
    corpusSha256: PINS, codeSha256, modelSha256: MODEL_HASH,
    train: { fitArticles: fit.length, fitFamilies: 9, fitEvents: 27,
      calibrationArticles: calibration.length, calibrationFamilies: 3,
      calibrationEvents: 9, dynamicTripletsPerStep: dynamicModel.dynamicTripletsPerStep,
      dynamicLossesPerStep: dynamicModel.tripletLossesPerStep,
      attentionSteps: dynamicModel.steps },
    development: { articles: development.length, families: 6, events: 18,
      dynamic, staticReference, rawPooled,
      continuationScreen: developmentScreen(dynamic, staticReference) },
    embeddingMs: Math.round(embedded.elapsedMs), trainingMs,
    totalMs: Math.round(performance.now() - started),
    holdoutOpened: false, weightsSaved: false, activated: false };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
