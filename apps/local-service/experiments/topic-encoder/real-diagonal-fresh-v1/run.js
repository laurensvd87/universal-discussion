import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { prepareGraph, calibrate, admit, evaluate, denominators } from '../local-contrast-gate-v1/core.js';
import { cosine } from '../event-token-pool-v1/core.js';
import { splitTrainEvents, omitConflictingInputs, fitDiagonal, transform,
  normalizeVectors } from '../real-diagonal-adapter-v1/core.js';
import { coverageForGraph } from '../real-diagonal-adapter-v1/coverage.js';
import { selectFreshEvents, compareRelativeCoverage, verifyReviewedDigests } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const REAL_HASH = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const REAL_SIZE = 14_972_999;
const MODEL_HASH = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const fail = (phase, code) => { throw new EvalError(phase, code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = [
  'apps/local-service/experiments/topic-encoder/real-diagonal-fresh-v1/README.md',
  'apps/local-service/experiments/topic-encoder/real-diagonal-fresh-v1/core.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-fresh-v1/core.test.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-fresh-v1/run.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/core.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/core.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/coverage.js',
  'apps/local-service/experiments/topic-encoder/topic-coverage-metrics/core.js',
  'apps/local-service/experiments/topic-encoder/real-event-eval/core.js',
  'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/scope.js',
  'apps/local-service/experiments/topic-encoder/local-contrast-gate-v1/core.js',
  'apps/local-service/experiments/topic-encoder/event-token-pool-v1/core.js',
  'apps/local-service/experiments/topic-encoder/e5-infer.js',
  'spikes/topic-resolution/browser/embedding/embedding-contract.js',
  'spikes/topic-resolution/harness/deny-external-capabilities.js',
];
const assetDirectory = 'spikes/topic-resolution/browser/embedding/.assets';
const expectedAssets = [
  'config.json', 'manifest.json', 'model.onnx', 'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm', 'ort.wasm.min.mjs', 'special_tokens_map.json',
  'tokenizer.json', 'tokenizers.mjs', 'tokenizer_config.json',
].sort();
async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function sourceDigests() {
  const names = await readdir(path.join(ROOT, assetDirectory));
  if (names.sort().join('\0') !== expectedAssets.join('\0')) fail('assets', 'ASSET_INVENTORY');
  const actual = {};
  for (const name of [...sourceFiles, ...names.map(item => `${assetDirectory}/${item}`)]) {
    const filename = path.join(ROOT, name);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) fail('source', 'SOURCE_FILE_TYPE');
    actual[name] = await hashFile(filename);
  }
  let reviewed;
  try { reviewed = JSON.parse(await readFile(path.join(HERE, 'reviewed-source-sha256.json'), 'utf8')); }
  catch { fail('source', 'REVIEWED_MANIFEST_READ'); }
  try { verifyReviewedDigests(actual, reviewed); }
  catch { fail('source', 'REVIEWED_SOURCE_MISMATCH'); }
  if (actual[`${assetDirectory}/model.onnx`] !== MODEL_HASH) fail('assets', 'MODEL_DIGEST');
  return actual;
}
async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input)) fail('path', 'ABSOLUTE_PATH_REQUIRED');
  let directoryInfo, root, file, repo, info;
  try {
    directoryInfo = await lstat(privateDir);
    [root, file, repo] = await Promise.all([realpath(privateDir), realpath(input), realpath(ROOT)]);
    info = await lstat(input);
  } catch { fail('path', 'PATH_ACCESS'); }
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() ||
      !privateScopeAllowed(repo, root, file)) fail('path', 'PRIVATE_PATH_SCOPE');
  if (!info.isFile() || info.isSymbolicLink() || info.size !== REAL_SIZE)
    fail('input', 'INPUT_FILE_OR_SIZE');
  let bytes;
  try { bytes = await readFile(input); } catch { fail('input', 'INPUT_READ'); }
  if (bytes.length !== REAL_SIZE || sha(bytes) !== REAL_HASH) fail('input', 'INPUT_DIGEST');
  return bytes;
}
async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', privateCorpusOpened: false,
      modelLoaded: false, freshSelectionScored: false, externalCapabilities: 'denied',
      sourceSha256: await sourceDigests() })}\n`);
    return;
  }
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--private-dir' || args[2] !== '--input')
    fail('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const sourceSha256 = await sourceDigests();
  const corpus = parseCorpus(await privateInput(args[1], args[3]));
  if (corpus.inputSha256 !== REAL_HASH) fail('input', 'INPUT_DIGEST');
  const previous = selectEventDisjoint(corpus.documents);
  const preliminary = selectEventDisjoint(corpus.documents, 300);
  const train = previous.documents.filter(row => row.split === 'train');
  if (previous.documents.length !== 1192 || train.length !== 749 ||
      previous.documents.filter(row => row.split === 'validation').length !== 150 ||
      previous.documents.filter(row => row.split === 'test').length !== 293)
    fail('selection', 'PREVIOUS_SPLIT_MISMATCH');
  const fresh = selectFreshEvents(corpus.documents, previous.documents, preliminary.documents);
  const { fit, calibration } = splitTrainEvents(train);
  const cleanIds = new Set(omitConflictingInputs(train).rows.map(row => row.id));
  const fitting = fit.filter(row => cleanIds.has(row.id));
  if (fit.length !== 475 || fitting.length !== 475 || calibration.length !== 274)
    fail('selection', 'FIT_CALIBRATION_MISMATCH');
  const { embedDocuments } = await import('../e5-infer.js');
  const embedded = await embedDocuments(train.map(row => ({
    id: row.id, title: row.title, body: row.lead })), 'title-lead');
  if (embedded.assets.modelSha256 !== MODEL_HASH) fail('model', 'MODEL_DIGEST');
  const trained = fitDiagonal(fitting, embedded.vectors);
  if (trained.steps !== 40) fail('fit', 'TRAINING_PROTOCOL');
  const calRows = calibration.map(row => ({ ...row, categories: [row.category] }));
  const settings = {
    'raw-E5': calibrate(prepareGraph(calRows,
      normalizeVectors(calibration, embedded.vectors), cosine))['double-support'],
    diagonal: calibrate(prepareGraph(calRows,
      transform(calibration, embedded.vectors, trained.parameters), cosine))['double-support'],
  };
  const freshEmbedded = await embedDocuments(fresh.documents.map(row => ({
    id: row.id, title: row.title, body: row.lead })), 'title-lead');
  if (freshEmbedded.assets.modelSha256 !== MODEL_HASH ||
      freshEmbedded.assets.tokenizerSha256 !== embedded.assets.tokenizerSha256)
    fail('model', 'MODEL_DIGEST');
  const freshRows = fresh.documents.map(row => ({ ...row, categories: [row.category] }));
  const methods = {};
  let commonDenominators;
  for (const [name, vectors] of [
    ['raw-E5', normalizeVectors(fresh.documents, freshEmbedded.vectors)],
    ['diagonal', transform(fresh.documents, freshEmbedded.vectors, trained.parameters)],
  ]) {
    const graph = prepareGraph(freshRows, vectors, cosine);
    const currentDenominators = denominators(graph);
    if (currentDenominators.articles !== fresh.documents.length ||
        commonDenominators && JSON.stringify(commonDenominators) !== JSON.stringify(currentDenominators))
      fail('evaluation', 'DENOMINATOR_MISMATCH');
    commonDenominators = currentDenominators;
    const admitted = admit(graph, 'double-support', settings[name]);
    const admission = evaluate(graph, admitted);
    methods[name] = { calibration: settings[name], admission,
      coverage: coverageForGraph(graph, admitted, admission) };
  }
  process.stdout.write(`${JSON.stringify({ mode: 'real-diagonal-fresh-v1-one-shot',
    researchOnly: true, representation: 'packaged-E5-title-plus-384-lead',
    privateCorpusSha256: REAL_HASH, sourceSha256, modelSha256: MODEL_HASH,
    tokenizerSha256: freshEmbedded.assets.tokenizerSha256, runtime: freshEmbedded.assets.runtime,
    nodeVersion: process.version, previousSelectedArticlesExcluded: 1192,
    preliminarySelectedArticlesExcluded: fresh.excludedPreliminaryArticles,
    exposedEventsExcluded: fresh.exposedEventsExcluded,
    availableFreshArticles: fresh.availableArticles, availableFreshEvents: fresh.availableEvents,
    freshArticles: fresh.documents.length,
    freshEvents: new Set(fresh.documents.map(row => row.eventKey)).size,
    fitArticles: fitting.length, calibrationArticles: calibration.length,
    fit: { steps: trained.steps, triplets: trained.triplets },
    test: { denominators: commonDenominators, methods,
      decision: compareRelativeCoverage(methods['raw-E5'], methods.diagonal) },
    caveats: ['event-only-disjoint-split', 'no-publisher-viewpoint-gold',
      'exact-input-keys-not-publisher-identity', 'possible-cross-cohort-template-overlap',
      'publisher-rights-unresolved', 'offline-short-input-differs-from-live'],
    weightsSaved: false, activated: false,
  }, null, 2)}\n`);
}
try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
