import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint } from
  '../real-event-eval/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { prepareGraph, calibrate, admit, evaluate, denominators } from
  '../local-contrast-gate-v1/core.js';
import { cosine } from '../event-token-pool-v1/core.js';
import { splitTrainEvents, omitConflictingInputs, fitDiagonal, transform,
  normalizeVectors } from '../real-diagonal-adapter-v1/core.js';
import { coverageForGraph } from '../real-diagonal-adapter-v1/coverage.js';
import { compareRelativeCoverage, verifyReviewedDigests } from './core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const REAL_HASH = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const REAL_SIZE = 14_972_999;
const MODEL_HASH = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const fail = (phase, code) => { throw new EvalError(phase, code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const sourceFiles = [
  'apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/README.md',
  'apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/core.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/core.test.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/run.js',
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
  if (names.sort().join('\0') !== expectedAssets.join('\0'))
    fail('assets', 'ASSET_INVENTORY');
  const result = {};
  for (const name of [...sourceFiles, ...names.map(item => `${assetDirectory}/${item}`)]) {
    const filename = path.join(ROOT, name);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) fail('source', 'SOURCE_FILE_TYPE');
    result[name] = await hashFile(filename);
  }
  let reviewed;
  try {
    reviewed = JSON.parse(await readFile(path.join(HERE, 'reviewed-source-sha256.json'), 'utf8'));
  } catch { fail('source', 'REVIEWED_MANIFEST_READ'); }
  try { verifyReviewedDigests(result, reviewed); }
  catch { fail('source', 'REVIEWED_SOURCE_MISMATCH'); }
  if (result[`${assetDirectory}/model.onnx`] !== MODEL_HASH)
    fail('assets', 'MODEL_DIGEST');
  return result;
}

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input))
    fail('path', 'ABSOLUTE_PATH_REQUIRED');
  let directoryInfo, root, file, repo, info;
  try {
    directoryInfo = await lstat(privateDir);
    [root, file, repo] = await Promise.all([
      realpath(privateDir), realpath(input), realpath(ROOT)]);
    info = await lstat(input);
  } catch { fail('path', 'PATH_ACCESS'); }
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() ||
      !privateScopeAllowed(repo, root, file)) fail('path', 'PRIVATE_PATH_SCOPE');
  if (!info.isFile() || info.isSymbolicLink() || info.size !== REAL_SIZE)
    fail('input', 'INPUT_FILE_OR_SIZE');
  let bytes;
  try { bytes = await readFile(input); } catch { fail('input', 'INPUT_READ'); }
  if (bytes.length !== REAL_SIZE || sha(bytes) !== REAL_HASH)
    fail('input', 'INPUT_DIGEST');
  return bytes;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', privateCorpusOpened: false,
      modelLoaded: false, selectedTestEmbedded: false, externalCapabilities: 'denied',
      sourceSha256: await sourceDigests() })}\n`);
    return;
  }
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--private-dir' || args[2] !== '--input')
    fail('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const started = performance.now();
  const sourceSha256 = await sourceDigests();
  const corpus = parseCorpus(await privateInput(args[1], args[3]));
  if (corpus.inputSha256 !== REAL_HASH) fail('input', 'INPUT_DIGEST');
  const selection = selectEventDisjoint(corpus.documents);
  const train = selection.documents.filter(row => row.split === 'train');
  const validationCount = selection.documents.filter(row => row.split === 'validation').length;
  const selectedTest = selection.documents.filter(row => row.split === 'test');
  if (selection.documents.length !== 1192 || train.length !== 749 ||
      validationCount !== 150 || selectedTest.length !== 293 ||
      new Set(train.map(row => row.eventKey)).size < 3 ||
      new Set(selectedTest.map(row => row.eventKey)).size < 3)
    fail('selection', 'SPLIT_MISMATCH');
  const trainEvents = new Set(train.map(row => row.eventKey));
  if (selectedTest.some(row => trainEvents.has(row.eventKey)))
    fail('selection', 'EVENT_OVERLAP');
  const { fit, calibration } = splitTrainEvents(train);
  const clean = omitConflictingInputs(train);
  const cleanIds = new Set(clean.rows.map(row => row.id));
  const fitting = fit.filter(row => cleanIds.has(row.id));
  if (fit.length !== 475 || fitting.length !== 475 || calibration.length !== 274)
    fail('selection', 'FIT_CALIBRATION_MISMATCH');

  // Test is not embedded until fitting and both calibration cutoffs are fixed.
  const { embedDocuments } = await import('../e5-infer.js');
  const trainEmbedded = await embedDocuments(train.map(row => ({
    id: row.id, title: row.title, body: row.lead })), 'title-lead');
  if (trainEmbedded.assets.modelSha256 !== MODEL_HASH) fail('model', 'MODEL_DIGEST');
  const trained = fitDiagonal(fitting, trainEmbedded.vectors);
  if (trained.steps !== 40) fail('fit', 'TRAINING_PROTOCOL');
  const calibrationRows = calibration.map(row => ({ ...row, categories: [row.category] }));
  const settings = {
    'raw-E5': calibrate(prepareGraph(calibrationRows,
      normalizeVectors(calibration, trainEmbedded.vectors), cosine))['double-support'],
    diagonal: calibrate(prepareGraph(calibrationRows,
      transform(calibration, trainEmbedded.vectors, trained.parameters), cosine))['double-support'],
  };
  const testEmbedded = await embedDocuments(selectedTest.map(row => ({
    id: row.id, title: row.title, body: row.lead })), 'title-lead');
  if (testEmbedded.assets.modelSha256 !== MODEL_HASH ||
      testEmbedded.assets.tokenizerSha256 !== trainEmbedded.assets.tokenizerSha256)
    fail('model', 'MODEL_DIGEST');
  const testRows = selectedTest.map(row => ({ ...row, categories: [row.category] }));
  const methods = {};
  let testDenominators;
  for (const [name, vectors] of [
    ['raw-E5', normalizeVectors(selectedTest, testEmbedded.vectors)],
    ['diagonal', transform(selectedTest, testEmbedded.vectors, trained.parameters)],
  ]) {
    const graph = prepareGraph(testRows, vectors, cosine);
    const denominator = denominators(graph);
    if (denominator.articles !== 293) fail('selection', 'TEST_DENOMINATOR');
    if (testDenominators && JSON.stringify(testDenominators) !== JSON.stringify(denominator))
      fail('evaluation', 'DENOMINATOR_MISMATCH');
    testDenominators = denominator;
    const admitted = admit(graph, 'double-support', settings[name]);
    const admission = evaluate(graph, admitted);
    methods[name] = { calibration: settings[name], admission,
      coverage: coverageForGraph(graph, admitted, admission) };
  }
  const decision = compareRelativeCoverage(methods['raw-E5'], methods.diagonal);
  process.stdout.write(`${JSON.stringify({ mode: 'real-diagonal-holdout-v1-one-shot',
    researchOnly: true, representation: 'packaged-E5-title-plus-384-lead',
    privateCorpusSha256: REAL_HASH, sourceSha256,
    modelSha256: MODEL_HASH, tokenizerSha256: testEmbedded.assets.tokenizerSha256,
    runtime: testEmbedded.assets.runtime, nodeVersion: process.version,
    selectedArticles: selection.documents.length, trainArticles: train.length,
    fitArticles: fitting.length, calibrationArticles: calibration.length,
    previouslyUsedValidationArticlesNotScored: validationCount,
    selectedTestArticles: selectedTest.length,
    unselectedArticlesUntouched: selection.unscoredArticles,
    fit: { steps: trained.steps, triplets: trained.triplets },
    test: { denominators: testDenominators, methods, decision },
    elapsedMs: Math.round(performance.now() - started),
    caveats: ['event-only-disjoint-split', 'no-publisher-viewpoint-gold',
      'exact-input-keys-not-publisher-identity', 'cross-split-duplicate-ambiguity',
      'publisher-rights-unresolved', 'offline-short-input-differs-from-live'],
    weightsSaved: false, activated: false,
  }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
