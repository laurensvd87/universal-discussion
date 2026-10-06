import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { corpus } from '../topic-identity/corpus.js';
import { digest, validateCorpus, inputFor } from '../topic-identity/evaluate.js';
import { dot, project, trainProjection } from './e5-projection.js';
import { readAssetManifest, prefixTokenInput, poolHidden, ORT_VERSION,
  MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const EXPECTED_CORPUS = '0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950';
const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(here, '../../../../spikes/topic-resolution/browser/embedding/.assets');
async function boundedFile(filename, maximum) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('Invalid fixed asset');
  const bytes = await readFile(filename);
  if (bytes.length > maximum) throw new Error('Asset exceeds bound');
  return bytes;
}
function evaluate(documents, vectorMap) {
  const rows = documents.map(document => {
    const ranking = documents.filter(other => other.id !== document.id).map(other => ({
      id: other.id, same: other.topicLabel === document.topicLabel,
      hard: other.family === document.family && other.topicLabel !== document.topicLabel,
      score: dot(vectorMap.get(document.id), vectorMap.get(other.id)),
    })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return { id: document.id, partnerRank: ranking.findIndex(item => item.same) + 1,
      hardFirst: ranking[0].hard };
  });
  return { queries: rows.length, sameSubjectAt1: rows.filter(row => row.partnerRank === 1).length,
    sameSubjectAt3: rows.filter(row => row.partnerRank <= 3).length,
    hardNegativeAt1: rows.filter(row => row.hardFirst).length,
    ranks: rows };
}
async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  validateCorpus(corpus);
  if (digest(corpus) !== EXPECTED_CORPUS) throw new Error('Frozen corpus mismatch');
  const manifest = readAssetManifest(JSON.parse(await boundedFile(path.join(assetRoot, 'manifest.json'), 16384)));
  const verified = new Map();
  for (const [filename, spec] of manifest) {
    const bytes = await boundedFile(path.join(assetRoot, filename), spec.bytes);
    if (bytes.length !== spec.bytes || createHash('sha256').update(bytes).digest('hex') !== spec.sha256)
      throw new Error('Packaged asset integrity mismatch');
    verified.set(filename, bytes);
  }
  const { Tokenizer } = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
  const ort = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');
  if (ort.env.versions.web !== ORT_VERSION) throw new Error('Runtime version mismatch');
  const tokenJson = JSON.parse(verified.get('tokenizer.json'));
  const config = JSON.parse(verified.get('config.json'));
  if (tokenJson.truncation !== null || tokenJson.padding !== null || config.hidden_size !== 384 ||
      config.model_type !== 'bert') throw new Error('Packaged configuration mismatch');
  const tokenizer = new Tokenizer(tokenJson, JSON.parse(verified.get('tokenizer_config.json')));
  ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = { mjs: new URL('../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs', import.meta.url).href };
  ort.env.wasm.wasmBinary = verified.get('ort-wasm-simd-threaded.wasm');
  const started = performance.now();
  const session = await ort.InferenceSession.create(verified.get('model.onnx'), {
    executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 3,
  });
  if ([...session.inputNames].sort().join() !== 'attention_mask,input_ids,token_type_ids' ||
      !session.outputNames.includes('last_hidden_state')) throw new Error('Packaged graph mismatch');
  const base = new Map();
  try {
    for (const document of corpus.documents) {
      const encoded = prefixTokenInput(tokenizer, inputFor(document, 'body-prefix'));
      const feeds = {};
      for (const name of session.inputNames) {
        const values = name === 'input_ids' ? encoded.ids : encoded[name];
        feeds[name] = new ort.Tensor('int64', BigInt64Array.from(values, BigInt), [1, encoded.ids.length]);
      }
      const result = await session.run(feeds);
      base.set(document.id, poolHidden(result.last_hidden_state, encoded.attention_mask));
    }
  } finally { await session.release(); }
  const inferenceMs = performance.now() - started;
  const development = corpus.documents.filter(d => corpus.split.development.includes(d.family));
  const heldOut = corpus.documents.filter(d => corpus.split.heldOut.includes(d.family));
  const trainingStarted = performance.now();
  const head = trainProjection(development, base);
  const projected = new Map(corpus.documents.map(d => [d.id, project(base.get(d.id), head)]));
  const headMs = performance.now() - trainingStarted;
  const report = { schema: 'synthetic-e5-projection-report/v1', corpusDigest: EXPECTED_CORPUS,
    provenance: { node: process.version, runtime: ORT_VERSION, modelSha256: MODEL_SHA256,
      tokenizerSha256: TOKENIZER_SHA256, execution: 'Node CPU WASM; packaged E5; synthetic only' },
    training: { documents: head.trainingDocuments, samePairs: head.positivePairs,
      hardNegativePairs: head.hardNegativePairs, headDimensions: head.weights.length,
      headFloat32Bytes: head.weights.length * 4 },
    timing: { e5Inference32DocumentsMs: inferenceMs, headTrainAndProject32DocumentsMs: headMs },
    development: { e5: evaluate(development, base), projected: evaluate(development, projected) },
    heldOut: { e5: evaluate(heldOut, base), projected: evaluate(heldOut, projected) } };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
main().catch(error => { process.stderr.write(`Offline E5 projection failed: ${error.message}\n`); process.exitCode = 1; });
