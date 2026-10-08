// Offline experiment only. This loads the already-packaged, hash-pinned E5
// assets and never persists text or vectors.
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_CHARACTERS, MODEL_SHA256, ORT_VERSION, TOKENIZER_SHA256,
  poolHidden, prefixTokenInput, readAssetManifest } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(here, '../../../../spikes/topic-resolution/browser/embedding/.assets');

async function boundedFile(filename, maximum) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('Invalid fixed asset');
  const bytes = await readFile(filename);
  if (bytes.length > maximum) throw new Error('Asset exceeds bound');
  return bytes;
}

export class InferenceStageError extends Error {
  constructor(code) { super(code); this.name = 'InferenceStageError'; this.code = code; }
}

async function verifiedAssets(names) {
  const manifest = readAssetManifest(JSON.parse(await boundedFile(path.join(assetRoot, 'manifest.json'), 16384)));
  const verified = new Map();
  for (const filename of names) {
    const spec = manifest.get(filename);
    if (!spec) throw new Error('Packaged asset missing');
    const bytes = await boundedFile(path.join(assetRoot, filename), spec.bytes);
    if (bytes.length !== spec.bytes || createHash('sha256').update(bytes).digest('hex') !== spec.sha256)
      throw new Error('Packaged asset integrity mismatch');
    verified.set(filename, bytes);
  }
  return verified;
}

async function packagedTokenizer(verified) {
  const { Tokenizer } = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
  return new Tokenizer(JSON.parse(verified.get('tokenizer.json')),
    JSON.parse(verified.get('tokenizer_config.json')));
}

export function topicInput(document, mode = 'body') {
  if (!document || typeof document.title !== 'string' || typeof document.body !== 'string' ||
      !document.title.trim() || !document.body.trim()) throw new TypeError('Invalid experiment document');
  const normalize = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const title = normalize(document.title), body = normalize(document.body);
  if (mode === 'body') return body.slice(0, MAX_CHARACTERS);
  if (mode === 'title-lead') return `${title}\n${body}`.slice(0, MAX_CHARACTERS);
  throw new TypeError('Invalid experiment input mode');
}

export async function runPooledArticle(session, Tensor, encoded, pool = poolHidden) {
  const feeds = {};
  let result;
  try {
    try {
      for (const name of session.inputNames) {
        const values = name === 'input_ids' ? encoded.ids : encoded[name];
        feeds[name] = new Tensor('int64', BigInt64Array.from(values, BigInt), [1, encoded.ids.length]);
      }
      result = await session.run(feeds);
    } catch { throw new InferenceStageError('SESSION_RUN'); }
    try {
      return pool(result.last_hidden_state, encoded.attention_mask);
    } catch { throw new InferenceStageError('POOL'); }
  } finally {
    // ORT holds WASM-backed buffers for both feeds and outputs. Releasing the
    // session alone leaves article-level tensors alive until GC.
    const seen = new Set();
    let disposalError;
    for (const tensor of [...Object.values(result ?? {}), ...Object.values(feeds)]) {
      if (!tensor || seen.has(tensor) || typeof tensor.dispose !== 'function') continue;
      seen.add(tensor);
      try { tensor.dispose(); } catch (error) { disposalError ??= error; }
    }
    if (disposalError) throw new InferenceStageError('CLEANUP');
  }
}

export async function preflightLongInput(documents) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > 1200 ||
      new Set(documents.map(item => item?.id)).size !== documents.length ||
      documents.some(item => typeof item?.id !== 'string' || !item.id))
    throw new TypeError('Invalid experiment corpus');
  const verified = await verifiedAssets(['tokenizer.json', 'tokenizer_config.json', 'config.json']);
  const config = JSON.parse(verified.get('config.json'));
  if (config.vocab_size !== 250037 || config.max_position_embeddings !== 512)
    throw new Error('Packaged model config mismatch');
  const tokenizer = await packagedTokenizer(verified);
  let tokenizationFailures = 0, vocabRangeFailures = 0, sampledInputs = 0;
  for (const document of documents) {
    try {
      const encoded = prefixTokenInput(tokenizer, topicInput(document, 'title-lead'));
      if (encoded.ids.some(id => !Number.isSafeInteger(id) || id < 0 || id >= config.vocab_size)) {
        tokenizationFailures++; vocabRangeFailures++;
      } else if (encoded.sampled) sampledInputs++;
    } catch { tokenizationFailures++; }
  }
  return { articlesChecked: documents.length, tokenizationFailures, vocabRangeFailures,
    sampledInputs, modelSha256: MODEL_SHA256, tokenizerSha256: TOKENIZER_SHA256 };
}

export async function embedDocuments(documents, mode = 'body') {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > 1200 ||
      new Set(documents.map(item => item?.id)).size !== documents.length ||
      documents.some(item => typeof item?.id !== 'string' || !item.id))
    throw new TypeError('Invalid experiment corpus');
  const manifest = readAssetManifest(JSON.parse(await boundedFile(path.join(assetRoot, 'manifest.json'), 16384)));
  const verified = await verifiedAssets(manifest.keys());
  const ort = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');
  if (ort.env.versions.web !== ORT_VERSION) throw new Error('Runtime version mismatch');
  const tokenizer = await packagedTokenizer(verified);
  ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = {
    mjs: new URL('../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs', import.meta.url).href,
  };
  ort.env.wasm.wasmBinary = verified.get('ort-wasm-simd-threaded.wasm');
  const started = performance.now();
  let session;
  try {
    session = await ort.InferenceSession.create(verified.get('model.onnx'), {
      executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 3,
    });
  } catch { throw new InferenceStageError('SESSION_RUN'); }
  if ([...session.inputNames].sort().join() !== 'attention_mask,input_ids,token_type_ids' ||
      !session.outputNames.includes('last_hidden_state')) {
    try { await session.release(); } catch { throw new InferenceStageError('CLEANUP'); }
    throw new Error('Packaged graph mismatch');
  }
  const vectors = new Map();
  try {
    for (const document of documents) {
      let encoded;
      try { encoded = prefixTokenInput(tokenizer, topicInput(document, mode)); }
      catch { throw new InferenceStageError('TOKENIZE'); }
      vectors.set(document.id, await runPooledArticle(session, ort.Tensor, encoded));
    }
  } finally {
    try { await session.release(); } catch { throw new InferenceStageError('CLEANUP'); }
  }
  return { vectors, elapsedMs: performance.now() - started,
    assets: { modelSha256: MODEL_SHA256, tokenizerSha256: TOKENIZER_SHA256, runtime: ORT_VERSION } };
}
