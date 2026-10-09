import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint } from
  '../real-event-eval/core.js';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { prepareGraph, calibrate, admit, evaluate, denominators } from
  '../local-contrast-gate-v1/core.js';
import { retrievalRanks, cosine } from '../event-token-pool-v1/core.js';
import { splitTrainEvents, omitConflictingInputs, fitDiagonal, transform,
  normalizeVectors } from './core.js';
import { coverageForGraph } from './coverage.js';
import { createHash } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const REAL_HASH = '8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const REAL_SIZE = 14_972_999;
const MODEL_HASH = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (phase, code) => { throw new EvalError(phase, code); };

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input))
    fail('path', 'ABSOLUTE_PATH_REQUIRED');
  let directoryInfo;
  try { directoryInfo = await lstat(privateDir); }
  catch { fail('path', 'PATH_ACCESS'); }
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
    fail('path', 'PRIVATE_DIRECTORY_TYPE');
  let root, file, repo;
  try { [root, file, repo] = await Promise.all([
    realpath(privateDir), realpath(input), realpath(ROOT),
  ]); } catch { fail('path', 'PATH_ACCESS'); }
  if (!privateScopeAllowed(repo, root, file)) fail('path', 'PRIVATE_PATH_SCOPE');
  let info;
  try { info = await lstat(input); } catch { fail('path', 'INPUT_STAT'); }
  if (!info.isFile() || info.isSymbolicLink() || info.size !== REAL_SIZE)
    fail('input', 'INPUT_FILE_OR_SIZE');
  let bytes;
  try { bytes = await readFile(input); } catch { fail('input', 'INPUT_READ'); }
  if (bytes.length !== REAL_SIZE || sha(bytes) !== REAL_HASH)
    fail('input', 'INPUT_DIGEST');
  return bytes;
}

const sourceFiles = [
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/README.md',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/core.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/core.test.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/coverage.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/coverage.test.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/run.js',
  'apps/local-service/experiments/topic-encoder/topic-coverage-metrics/core.js',
  'apps/local-service/experiments/topic-encoder/topic-coverage-metrics/core.test.js',
  'apps/local-service/experiments/topic-encoder/real-event-eval/core.js',
  'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/scope.js',
  'apps/local-service/experiments/topic-encoder/local-contrast-gate-v1/core.js',
  'apps/local-service/experiments/topic-encoder/event-token-pool-v1/core.js',
  'apps/local-service/experiments/topic-encoder/e5-infer.js',
  'spikes/topic-resolution/browser/embedding/embedding-contract.js',
  'spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs',
  'spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs',
  'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',
  'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
  'spikes/topic-resolution/harness/deny-external-capabilities.js',
];
async function sourceDigests() {
  const result = {};
  for (const name of sourceFiles) result[name] = sha(await readFile(path.join(ROOT, name)));
  return result;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', privateCorpusOpened: false,
      modelLoaded: false, testEmbedded: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  const args = process.argv.slice(2);
  const coverageMode = args.length === 5 && args[4] === '--coverage';
  if ((args.length !== 4 && !coverageMode) ||
      args[0] !== '--private-dir' || args[2] !== '--input')
    fail('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const started = performance.now();
  const sourceSha256 = await sourceDigests();
  const corpus = parseCorpus(await privateInput(args[1], args[3]));
  if (corpus.inputSha256 !== REAL_HASH) fail('input', 'INPUT_DIGEST');
  const selection = selectEventDisjoint(corpus.documents);
  const train = selection.documents.filter(row => row.split === 'train');
  const validation = selection.documents.filter(row => row.split === 'validation');
  const testCount = selection.documents.filter(row => row.split === 'test').length;
  if (selection.documents.length !== 1192 || train.length !== 749 ||
      validation.length !== 150 || testCount !== 293 ||
      new Set(validation.map(row => row.eventKey)).size !== 13)
    fail('selection', 'SPLIT_MISMATCH');
  const { fit, calibration } = splitTrainEvents(train);
  const calibrationGraphRows = calibration.map(row => ({ ...row, categories: [row.category] }));
  const validationGraphRows = validation.map(row => ({ ...row, categories: [row.category] }));
  const clean = omitConflictingInputs(train);
  const cleanIds = new Set(clean.rows.map(row => row.id));
  const fitting = fit.filter(row => cleanIds.has(row.id));
  if (fitting.length < 100) fail('selection', 'CLEAN_FIT_COUNT');

  // Gold labels and text stay in RAM. Selected test records are not embedded.
  const { embedDocuments } = await import('../e5-infer.js');
  const input = [...train, ...validation].map(row =>
    ({ id: row.id, title: row.title, body: row.lead }));
  const embedded = await embedDocuments(input, 'title-lead');
  if (embedded.assets.modelSha256 !== MODEL_HASH)
    fail('model', 'MODEL_DIGEST');
  const trained = fitDiagonal(fitting, embedded.vectors);
  if (trained.steps !== 40) fail('fit', 'TRAINING_PROTOCOL');

  const methods = {};
  for (const [name, vectors] of [
    ['raw-E5', normalizeVectors([...calibration, ...validation], embedded.vectors)],
    ['diagonal', transform([...calibration, ...validation], embedded.vectors,
      trained.parameters)],
  ]) {
    const calibrationGraph = prepareGraph(calibrationGraphRows, vectors, cosine);
    const setting = calibrate(calibrationGraph)['double-support'];
    const graph = prepareGraph(validationGraphRows, vectors, cosine);
    const denominator = denominators(graph);
    if (denominator.articles !== 150 || denominator.events !== 13 ||
        denominator.truePairs !== 803 || denominator.falsePairs !== 10372)
      fail('selection', 'DENOMINATOR_MISMATCH');
    const admitted = admit(graph, 'double-support', setting);
    const admission = evaluate(graph, admitted);
    methods[name] = { calibration: setting,
      retrieval: retrievalRanks(validation, vectors),
      admission,
      ...(coverageMode && { coverage: coverageForGraph(graph, admitted, admission) }) };
  }
  const score = methods.diagonal;
  const reference = methods['raw-E5'];
  const screen = score.retrieval.rank1 >= 145 &&
    score.admission.trueEdges >= 50 && score.admission.falseEdges === 0 &&
    score.admission.mixedGroups === 0 && score.admission.completeEvents >= 1 &&
    score.admission.trueEdges > reference.admission.trueEdges &&
    score.admission.falseEdges <= reference.admission.falseEdges &&
    score.admission.mixedGroups <= reference.admission.mixedGroups;
  process.stdout.write(`${JSON.stringify({
    mode: coverageMode ? 'real-diagonal-adapter-v1-relative-coverage' :
      'real-diagonal-adapter-v1-exploratory-validation', researchOnly: true,
    representation: 'packaged-E5-title-plus-384-lead',
    sourceSha256, privateCorpusSha256: REAL_HASH,
    assetManifestSha256: sourceSha256['spikes/topic-resolution/browser/embedding/.assets/manifest.json'],
    modelSha256: MODEL_HASH, tokenizerSha256: embedded.assets.tokenizerSha256,
    runtime: embedded.assets.runtime, nodeVersion: process.version,
    selectedArticles: selection.documents.length, fitArticles: fitting.length,
    calibrationArticles: calibration.length,
    conflictingInputTrainArticles: clean.excluded,
    excludedConflictingFitArticles: fit.length - fitting.length,
    selectedTestArticlesUntouched: testCount, unselectedArticlesUntouched: selection.unscoredArticles,
    fit: { steps: trained.steps, triplets: trained.triplets },
    validation: { denominators: denominators(prepareGraph(validationGraphRows,
      normalizeVectors(validation, embedded.vectors), cosine)), methods,
      predeclaredScreenPassed: screen },
    elapsedMs: Math.round(performance.now() - started),
    caveats: ['reused-exploratory-validation', 'event-only-disjoint-split',
      'no-publisher-viewpoint-gold', 'train-only-conflict-filter',
      'cross-split-duplicate-ambiguity', 'publisher-rights-unresolved',
      'offline-short-input-differs-from-live'],
    testEmbedded: false, weightsSaved: false, activated: false,
  }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
