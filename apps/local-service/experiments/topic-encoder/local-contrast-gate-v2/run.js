import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizedTokenMap, eventVectors, retrievalRanks, cosine } from
  '../event-token-pool-v1/core.js';
import { fitDynamicAttention } from '../event-token-pool-v3/core.js';
import { PINS, sha256, parsePinnedBytes, validateChunk,
  combinePartitions, partitionTrain } from '../event-token-pool-v3/adapter.js';
import { prepareGraph, calibrate, evaluate, denominators } from
  '../local-contrast-gate-v1/core.js';
import { attachSingletons, calibrateAttachment } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(HERE, '../multilingual-authored-v2');
const MODEL_HASH = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const fail = code => { throw new TypeError(code); };

async function readChunk(chunk) {
  const file = path.join(CORPUS, `chunk-${chunk.toLowerCase()}`, 'records.jsonl');
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 ||
      stat.size > 2_000_000) fail('INPUT_FILE');
  const bytes = await readFile(file);
  if (bytes.length !== stat.size) fail('INPUT_FILE');
  return validateChunk(parsePinnedBytes(bytes, chunk), chunk);
}

async function sourceDigests() {
  const output = {};
  for (const name of ['README.md', 'core.js', 'core.test.js', 'run.js'])
    output[name] = sha256(await readFile(path.join(HERE, name)));
  for (const name of ['event-token-pool-v1/core.js',
    'event-token-pool-v3/core.js', 'event-token-pool-v3/adapter.js',
    'local-contrast-gate-v1/core.js', 'e5-infer.js'])
    output[name] = sha256(await readFile(path.resolve(HERE, '..', name)));
  for (const name of ['spikes/topic-resolution/browser/embedding/embedding-contract.js',
    'spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
    'spikes/topic-resolution/harness/deny-external-capabilities.js'])
    output[name] = sha256(await readFile(path.resolve(HERE, '../../../../..', name)));
  return output;
}

function screen(metrics, counts, baseline, attached) {
  if (counts.articles !== 108 || counts.events !== 18 ||
      counts.families !== 6 || counts.truePairs !== 270 ||
      counts.falsePairs !== 5508 || counts.hardFalsePairs !== 648 ||
      counts.crossLanguageTruePairs !== 252 ||
      baseline.trueEdges !== 84 || baseline.falseEdges !== 0 ||
      baseline.crossLanguageTrueEdges !== 69 || baseline.completeEvents !== 2 ||
      attached.baseEdges !== 84) fail('BASELINE_DRIFT');
  return metrics.falseEdges === 0 && metrics.hardFalseEdges === 0 &&
    metrics.groupedFalsePairs === 0 && metrics.mixedGroups === 0 &&
    metrics.trueEdges >= 81 && metrics.crossLanguageTrueEdges >= 63 &&
    metrics.completeEvents >= 4 && metrics.completeEvents > baseline.completeEvents &&
    metrics.trueEdges >= baseline.trueEdges &&
    metrics.crossLanguageTrueEdges >= baseline.crossLanguageTrueEdges;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', corpusOpened: false,
      modelLoaded: false, holdoutOpened: false, weightsSaved: false,
      externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--development')
    fail('ARGUMENTS');
  const codeSha256 = await sourceDigests();
  const chunks = {};
  for (const chunk of ['A', 'B', 'C1', 'C2', 'C3'])
    chunks[chunk] = await readChunk(chunk);
  const { train, development } = combinePartitions(chunks.A, chunks.B,
    chunks.C1, chunks.C2, chunks.C3);
  const { fit, calibration } = partitionTrain(train);
  const { embedDocumentsWithTokens } = await import('../e5-infer.js');
  const documents = fit.concat(calibration, development);
  const embedded = await embedDocumentsWithTokens(documents.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  if (embedded.assets.modelSha256 !== MODEL_HASH) fail('MODEL_DIGEST');
  const tokens = normalizedTokenMap(documents, embedded.tokenStates);
  const trained = fitDynamicAttention(fit, tokens);
  if (trained.steps !== 40 || trained.fitArticles !== 162 ||
      trained.dynamicTripletsPerStep !== 162) fail('TRAINING_PROTOCOL');
  const vectors = eventVectors(documents, tokens, trained.weights);
  const calibrationGraph = prepareGraph(calibration, vectors, cosine);
  const developmentGraph = prepareGraph(development, vectors, cosine);
  const calibrationSettings = calibrate(calibrationGraph);
  const attachmentSetting = calibrateAttachment(calibrationGraph,
    calibrationSettings['double-support'], calibrationSettings.triangle);
  const baseline = attachSingletons(developmentGraph,
    calibrationSettings['double-support'], calibrationSettings.triangle,
    { threshold: Number.MAX_VALUE });
  const baselineMetrics = evaluate(developmentGraph, baseline.edges);
  const attached = attachSingletons(developmentGraph,
    calibrationSettings['double-support'], calibrationSettings.triangle,
    attachmentSetting);
  const metrics = evaluate(developmentGraph, attached.edges);
  const counts = denominators(developmentGraph);
  process.stdout.write(`${JSON.stringify({ mode: 'local-contrast-gate-v2-development',
    researchOnly: true, topicTarget: 'owner-provisional-eventKey',
    input: 'packaged-E5-title-plus-384-body-chars-64-token-attention',
    codeSha256, corpusSha256: PINS, modelSha256: MODEL_HASH,
    fitArticles: fit.length, calibrationArticles: calibration.length,
    denominators: counts, retrieval: retrievalRanks(development, vectors),
    calibration: { triangle: calibrationSettings.triangle,
      doubleSupport: calibrationSettings['double-support'],
      attachment: attachmentSetting },
    baseline: baselineMetrics, attachment: {
      baseEdges: attached.baseEdges, addedEdges: attached.addedEdges,
      attachedSingletons: attached.attachedSingletons,
      eligibleProposals: attached.eligibleProposals,
      rejectedProposals: attached.rejectedProposals },
    metrics, continuationScreenMet: screen(metrics, counts, baselineMetrics, attached),
    holdoutOpened: false, weightsSaved: false, activated: false }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  const code = error instanceof TypeError && /^[A-Z_]+$/u.test(error.message)
    ? error.message : 'UNCLASSIFIED_FAILURE';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
