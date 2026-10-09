import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint } from
  '../real-event-eval/core.js';
import { normalizedTokenMap, eventVectors, retrievalRanks, cosine } from
  '../event-token-pool-v1/core.js';
import { fitDynamicAttention } from '../event-token-pool-v3/core.js';
import { PINS, sha256, parsePinnedBytes, validateChunk, partitionTrain } from
  '../event-token-pool-v3/adapter.js';
import { prepareGraph, calibrate, admit, evaluate, denominators, VARIANTS } from
  '../local-contrast-gate-v1/core.js';
import { privateScopeAllowed } from './scope.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const CORPUS = path.resolve(HERE, '../multilingual-authored-v2');
const REAL_HASH = '8C296A8D1B0F344AD477C2541ACBF010F220D1695F63EBCE35700BF5C4CF392D';
const REAL_SIZE = 14_972_999;
const MODEL_HASH = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
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
  if (!privateScopeAllowed(repo, root, file))
    fail('path', 'PRIVATE_PATH_SCOPE');
  let info;
  try { info = await lstat(input); } catch { fail('path', 'INPUT_STAT'); }
  if (!info.isFile() || info.isSymbolicLink() || info.size !== REAL_SIZE)
    fail('input', 'INPUT_FILE_OR_SIZE');
  let bytes;
  try { bytes = await readFile(input); } catch { fail('input', 'INPUT_READ'); }
  if (bytes.length !== REAL_SIZE || sha256(bytes) !== REAL_HASH)
    fail('input', 'INPUT_DIGEST');
  return bytes;
}

async function readSynthetic(chunk) {
  const filename = path.join(CORPUS, `chunk-${chunk.toLowerCase()}`, 'records.jsonl');
  let info, bytes;
  try {
    info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 2_000_000)
      fail('synthetic', 'INPUT_FILE');
    bytes = await readFile(filename);
  } catch (error) {
    if (error instanceof EvalError) throw error;
    fail('synthetic', 'INPUT_READ');
  }
  if (bytes.length !== info.size || sha256(bytes) !== PINS[chunk])
    fail('synthetic', 'INPUT_DIGEST');
  try { return validateChunk(parsePinnedBytes(bytes, chunk), chunk); }
  catch { fail('synthetic', 'INPUT_SCHEMA'); }
}

async function sourceDigests() {
  const names = [
    'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/README.md',
    'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/scope.js',
    'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/scope.test.js',
    'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/run.js',
    'apps/local-service/experiments/topic-encoder/real-event-eval/core.js',
    'apps/local-service/experiments/topic-encoder/event-token-pool-v1/core.js',
    'apps/local-service/experiments/topic-encoder/event-token-pool-v3/core.js',
    'apps/local-service/experiments/topic-encoder/event-token-pool-v3/adapter.js',
    'apps/local-service/experiments/topic-encoder/local-contrast-gate-v1/core.js',
    'apps/local-service/experiments/topic-encoder/e5-infer.js',
    'spikes/topic-resolution/browser/embedding/embedding-contract.js',
    'spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',
    'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
    'spikes/topic-resolution/harness/deny-external-capabilities.js',
  ];
  const result = {};
  for (const name of names) result[name] = sha256(await readFile(path.join(ROOT, name)));
  return result;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', privateCorpusOpened: false,
      modelLoaded: false, testEmbedded: false, externalCapabilities: 'denied',
      pathsRequired: true })}\n`);
    return;
  }
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--private-dir' || args[2] !== '--input')
    fail('arguments', 'EXPECTED_PRIVATE_DIR_AND_INPUT');
  const started = performance.now();
  const codeSha256 = await sourceDigests();
  const a = await readSynthetic('A'), b = await readSynthetic('B');
  const { fit, calibration } = partitionTrain(a.concat(b));
  if (fit.length !== 162 || calibration.length !== 54)
    fail('synthetic', 'SPLIT_COUNT');

  const corpus = parseCorpus(await privateInput(args[1], args[3]));
  if (corpus.inputSha256.toUpperCase() !== REAL_HASH)
    fail('input', 'INPUT_DIGEST');
  const selection = selectEventDisjoint(corpus.documents);
  const trainCount = selection.documents.filter(doc => doc.split === 'train').length;
  const validation = selection.documents.filter(doc => doc.split === 'validation');
  const testCount = selection.documents.filter(doc => doc.split === 'test').length;
  if (selection.documents.length !== 1192 || trainCount !== 749 ||
      validation.length !== 150 || testCount !== 293 ||
      new Set(validation.map(doc => doc.eventKey)).size < 2)
    fail('selection', 'SPLIT_MISMATCH');
  // The real corpus has no family gold. Category is a reporting proxy only.
  const real = validation.map(doc => ({ id: doc.id, eventKey: doc.eventKey,
    lang: doc.lang, categories: [doc.category], title: doc.title, lead: doc.lead }));
  const { embedDocumentsWithTokens } = await import('../e5-infer.js');
  const synthetic = fit.concat(calibration);
  const syntheticEmbedded = await embedDocumentsWithTokens(synthetic.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  if (syntheticEmbedded.assets.modelSha256 !== MODEL_HASH)
    fail('model', 'MODEL_DIGEST');
  const syntheticTokens = normalizedTokenMap(synthetic, syntheticEmbedded.tokenStates);
  const trained = fitDynamicAttention(fit, syntheticTokens);
  if (trained.steps !== 40 || trained.fitArticles !== 162 ||
      trained.dynamicTripletsPerStep !== 162) fail('fit', 'TRAINING_PROTOCOL');
  const calibrationVectors = eventVectors(calibration, syntheticTokens, trained.weights);
  const settings = calibrate(prepareGraph(calibration, calibrationVectors, cosine));

  const realEmbedded = await embedDocumentsWithTokens(real.map(doc =>
    ({ id: doc.id, title: doc.title, body: doc.lead })), 'title-lead');
  if (realEmbedded.assets.modelSha256 !== MODEL_HASH)
    fail('model', 'MODEL_DIGEST');
  const realTokens = normalizedTokenMap(real, realEmbedded.tokenStates);
  const realVectors = eventVectors(real, realTokens, trained.weights);
  const graph = prepareGraph(real, realVectors, cosine);
  const counts = denominators(graph);
  if (counts.articles !== 150 || counts.truePairs !== 803 ||
      counts.falsePairs !== 10372) fail('selection', 'DENOMINATOR_MISMATCH');
  const results = {};
  for (const name of VARIANTS)
    results[name] = { calibration: settings[name],
      metrics: evaluate(graph, admit(graph, name, settings[name])) };
  process.stdout.write(`${JSON.stringify({
    mode: 'synthetic-to-globesumm-v1-validation', researchOnly: true,
    input: 'packaged-E5-title-plus-384-lead-chars-64-token-attention',
    sourceSha256: codeSha256, syntheticCorpusSha256: { A: PINS.A, B: PINS.B },
    privateCorpusSha256: REAL_HASH, modelSha256: MODEL_HASH,
    fitArticles: fit.length, calibrationArticles: calibration.length,
    selectedArticles: selection.documents.length, validationArticles: real.length,
    selectedTestArticlesUntouched: testCount,
    validation: { denominators: counts, retrieval: retrievalRanks(real, realVectors),
      results },
    timingsMs: { syntheticEmbedding: Math.round(syntheticEmbedded.elapsedMs),
      realValidationEmbedding: Math.round(realEmbedded.elapsedMs),
      total: Math.round(performance.now() - started) },
    caveats: ['reused-validation', 'no-family-or-viewpoint-gold',
      'category-only-hard-negative-proxy', 'offline-title-short-lead-input',
      'publisher-rights-unresolved', 'event-boundary-may-differ-from-topic'],
    testEmbedded: false, weightsSaved: false, activated: false,
  }, null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
