import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { safeDiagnostic, EvalError } from '../real-event-eval/core.js';
import { fitDiagonal } from '../real-diagonal-adapter-v1/core.js';
import { loadOwned, loadPrivate, selectedValidation, scoreMethods, protocol } from './runner.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceNames = [
  'apps/local-service/experiments/topic-encoder/owned-diagonal-transfer-v1/README.md',
  'apps/local-service/experiments/topic-encoder/owned-diagonal-transfer-v1/runner.js',
  'apps/local-service/experiments/topic-encoder/owned-diagonal-transfer-v1/runner.test.js',
  'apps/local-service/experiments/topic-encoder/owned-diagonal-transfer-v1/run.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/core.js',
  'apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/coverage.js',
  'apps/local-service/experiments/topic-encoder/local-contrast-gate-v1/core.js',
  'apps/local-service/experiments/topic-encoder/topic-coverage-metrics/core.js',
  'apps/local-service/experiments/topic-encoder/real-event-eval/core.js',
  'apps/local-service/experiments/topic-encoder/e5-infer.js',
  'apps/local-service/experiments/topic-encoder/event-token-pool-v1/core.js',
  'apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/scope.js',
  'spikes/topic-resolution/browser/embedding/embedding-contract.js',
  'spikes/topic-resolution/harness/deny-external-capabilities.js',
  'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
  'spikes/topic-resolution/browser/embedding/.assets/model.onnx',
  'spikes/topic-resolution/browser/embedding/.assets/tokenizer.json',
  'spikes/topic-resolution/browser/embedding/.assets/tokenizer_config.json',
  'spikes/topic-resolution/browser/embedding/.assets/config.json',
  'spikes/topic-resolution/browser/embedding/.assets/special_tokens_map.json',
  'spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs',
  'spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs',
  'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',
  'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.wasm',
];
async function sourceDigests() {
  let bytes, frozen;
  try {
    bytes = await readFile(path.join(HERE, 'freeze.json'));
    frozen = JSON.parse(bytes);
  } catch { throw new EvalError('freeze', 'MANIFEST_READ'); }
  if (frozen?.schema !== 'owned-diagonal-transfer-freeze/v1' ||
      !frozen.files || typeof frozen.files !== 'object' ||
      Object.keys(frozen.files).sort().join('\n') !== [...sourceNames].sort().join('\n'))
    throw new EvalError('freeze', 'INVENTORY');
  const result = {};
  for (const name of sourceNames) {
    const expected = frozen.files[name];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected))
      throw new EvalError('freeze', 'HASH_FORMAT');
    let info, digest;
    try {
      const filename = path.join(ROOT, name);
      info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink())
        throw new EvalError('freeze', 'FILE_TYPE');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(filename)) hash.update(chunk);
      digest = hash.digest('hex');
    } catch { throw new EvalError('freeze', 'FILE_READ'); }
    if (digest !== expected) throw new EvalError('freeze', 'DIGEST_MISMATCH');
    result[name] = digest;
  }
  return { sourceSha256: result, freezeSha256: sha(bytes) };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--dry-run') {
    const { freezeSha256 } = await sourceDigests();
    const owned = await loadOwned();
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', ownedCounts: owned.counts,
      ownedSha256: { a: protocol.expected.a, b: protocol.expected.b },
      freezeSha256, frozenInventoryVerified: true,
      realOpened: false, modelLoaded: false, fitted: false, externalCapabilities: 'denied' })}\n`);
    return;
  }
  if (args.length !== 5 || args[0] !== '--reviewed' ||
      args[1] !== '--private-dir' || args[3] !== '--input')
    throw new EvalError('arguments', 'REVIEWED_PRIVATE_DIR_INPUT_REQUIRED');
  const { sourceSha256, freezeSha256 } = await sourceDigests();
  const owned = await loadOwned();
  const real = selectedValidation(await loadPrivate(args[2], args[4]));
  // Only synthetic A/B plus the already-used 150 validation rows are embedded.
  const rows = [...owned.a, ...owned.b, ...real.validation];
  const input = rows.map(row => ({ id: row.id, title: row.title,
    body: (row.body ?? row.lead).normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 384) }));
  const { embedDocuments } = await import('../e5-infer.js');
  const embedded = await embedDocuments(input, 'title-lead');
  if (embedded.assets.modelSha256.toUpperCase() !== protocol.expected.model)
    throw new EvalError('model', 'DIGEST');
  const fit = fitDiagonal(owned.a.map(row => ({ ...row, category: row.family })),
    embedded.vectors);
  const result = scoreMethods(owned.a, owned.b, real.validation,
    embedded.vectors, fit.parameters);
  process.stdout.write(`${JSON.stringify({ mode: 'owned-diagonal-transfer-v1',
    researchOnly: true, reviewedFlag: true, syntheticOnlyFitAndCalibration: true,
    sourceSha256, freezeSha256, inputSha256: { syntheticA: protocol.expected.a,
      syntheticB: protocol.expected.b, privateReal: protocol.expected.real },
    modelSha256: protocol.expected.model,
    tokenizerSha256: embedded.assets.tokenizerSha256,
    synthetic: { fitReports: owned.a.length, calibrationReports: owned.b.length,
      fitSteps: fit.steps, fitTriplets: fit.triplets },
    transfer: { validationReports: real.validation.length, methods: result.methods,
      relativeCoverageImprovementWithNoObservedFalseIncrease:
        result.relativeCoverageImprovementWithNoObservedFalseIncrease,
      routeChurnComparedWithLive: result.routeChurnComparedWithLive },
    selectedTestReportsNotEmbeddedOrScored: real.selectedTestCount,
    unselectedReportsNotEmbeddedOrScored: real.unselectedCount,
    limitations: ['spent-validation', 'synthetic-calibration-domain-shift',
      'no-verified-publisher-or-viewpoint-gold', 'exact-input-is-not-independent-publisher',
      'offline-title-lead-differs-from-live-body-input', 'product-rights-review-open'],
    weightsSaved: false, activated: false, providerCalls: false }, null, 2)}\n`);
}
try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
