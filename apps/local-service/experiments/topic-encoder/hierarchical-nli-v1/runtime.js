// Experimental title/premise NLI runner, not topic confidence or Source authority.
import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { performance } from 'node:perf_hooks';

const REVISION = 'ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e';
const ORT_VERSION = '1.31.0-dev.20260914-8d85527a0';
const FIXED = {
  'model_quantized.onnx': [107415176, '55614f3c7da74184742eaa0006b978744437aa91de9ba4913db42f94d7844a8f'],
  'tokenizer.json': [17082832, 'd0091a328b3441d754e481db5a390d7f3b8dabc6016869fd13ba350d23ddc4cd'],
  'config.json': [989, '3ebbbdf3c3803649b49715fd169207c0f42c4250dfea5dd304b1d8b8f745852a'],
  'tokenizer_config.json': [1286, '329b7d21f02c6c6c9d358733b03a34a89cd8e4fe36998869a6ab824b98e9bf9d'],
  'special_tokens_map.json': [964, '8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835'],
  'tokenizers.mjs': [98937, '1c4a848f86156201c033d6cd08c4cf81ae1088552acec3367f31ef086edf5af0'],
  'ort.wasm.min.mjs': [50195, '1617c813ada08592706d29a9963ab6258864dce4299bd402d2196bd648b63bfe'],
  'ort-wasm-simd-threaded.mjs': [24381, 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f'],
  'ort-wasm-simd-threaded.wasm': [14264838, '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3'],
};
const fail = message => { throw new TypeError(message); };
function record(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== keys.length) fail('Expected exact plain NLI record');
  const copy = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail('Expected NLI data fields');
    copy[key] = d.value;
  }
  return copy;
}
function dense(value, maximum) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) fail('Expected dense NLI array');
  const n = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (n > maximum || Reflect.ownKeys(value).length !== n + 1) fail('NLI array capacity or shape');
  return Array.from({ length: n }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail('Expected NLI array data');
    return d.value;
  });
}
export function validateNliManifest(input) {
  const m = record(input, ['schema', 'revision', 'assets']);
  if (m.schema !== 'hierarchy-nli-assets/v1' || m.revision !== REVISION) fail('NLI manifest identity mismatch');
  const assets = dense(m.assets, 9).map(a => record(a, ['filename', 'bytes', 'sha256']));
  const seen = new Set();
  for (const a of assets) {
    const expected = typeof a.filename === 'string' && Object.hasOwn(FIXED, a.filename) && FIXED[a.filename];
    if (!expected || seen.has(a.filename) || a.bytes !== expected[0] || a.sha256 !== expected[1]) fail('NLI asset identity mismatch');
    seen.add(a.filename); Object.freeze(a);
  }
  if (seen.size !== 9) fail('Incomplete NLI assets');
  return Object.freeze({ schema: m.schema, revision: m.revision, assets: Object.freeze(assets) });
}
export function validateNliConfiguration(config, tokenizerConfig, tokenizer) {
  if (config.model_type !== 'xlm-roberta' || config.hidden_size !== 384 || config.num_hidden_layers !== 6 ||
      config.num_attention_heads !== 12 || config.vocab_size !== 250002 || config.type_vocab_size !== 1 ||
      config.architectures?.length !== 1 || config.architectures[0] !== 'XLMRobertaForSequenceClassification' ||
      config.id2label?.['0'] !== 'entailment' || config.id2label?.['1'] !== 'neutral' || config.id2label?.['2'] !== 'contradiction' ||
      config.label2id?.entailment !== 0 || config.label2id?.neutral !== 1 || config.label2id?.contradiction !== 2 ||
      tokenizerConfig.tokenizer_class !== 'XLMRobertaTokenizer' || tokenizerConfig.model_max_length !== 512 ||
      tokenizer.get_vocab().size !== 250002 || tokenizer.token_to_id('<s>') !== 0 || tokenizer.token_to_id('<pad>') !== 1 ||
      tokenizer.token_to_id('</s>') !== 2 || tokenizer.token_to_id('<unk>') !== 3 || tokenizer.token_to_id('<mask>') !== 250001)
    fail('NLI tokenizer/configuration mismatch');
}
// Trusted dependency seam for synthetic tests; this does NOT verify model assets.
export function createNliPairRunner({ tokenizer, session, Tensor, release = async () => {} }) {
  const inputs = [...session.inputNames].sort();
  if (JSON.stringify(inputs) !== JSON.stringify(['attention_mask', 'input_ids']) &&
      JSON.stringify(inputs) !== JSON.stringify(['attention_mask', 'input_ids', 'token_type_ids'])) fail('NLI graph inputs mismatch');
  if (session.outputNames.length !== 1 || session.outputNames[0] !== 'logits') fail('NLI graph output mismatch');
  let busy = false, closed = false;
  return Object.freeze({
    experimental: true, productionValidated: false,
    async classifyPair(input) {
      const a = record(input, ['premise', 'hypothesis']);
      for (const s of [a.premise, a.hypothesis]) if (typeof s !== 'string' || !s.trim().length || s.length > 512 || s.includes('\0')) fail('NLI text capacity or shape');
      if (closed || busy) fail('NLI runner closed or busy');
      busy = true;
      const started = performance.now(), tensors = [];
      let output;
      try {
        const encoded = tokenizer.encode(a.premise, { text_pair: a.hypothesis, add_special_tokens: true, return_token_type_ids: true });
        const ids = dense(encoded.ids, 256), mask = dense(encoded.attention_mask, 256), segments = dense(encoded.token_type_ids, 256);
        if (ids.length < 5 || mask.length !== ids.length || segments.length !== ids.length || ids[0] !== 0 || ids.at(-1) !== 2 ||
            !ids.some((id, i) => id === 2 && ids[i + 1] === 2)) fail('NLI pair token shape');
        if (ids.some(id => !Number.isInteger(id) || id < 0 || id >= 250002) || mask.some(x => x !== 1) || segments.some(x => x !== 0)) fail('Invalid NLI token values');
        const feeds = Object.create(null);
        for (const name of inputs) {
          const source = name === 'input_ids' ? ids : name === 'attention_mask' ? mask : segments;
          const tensor = new Tensor('int64', BigInt64Array.from(source, BigInt), [1, ids.length]);
          tensors.push(tensor); feeds[name] = tensor;
        }
        output = await session.run(feeds);
        const logits = output?.logits;
        if (!logits || logits.type !== 'float32' || !Array.isArray(logits.dims) || logits.dims.length !== 2 || logits.dims[0] !== 1 || logits.dims[1] !== 3 ||
            !(logits.data instanceof Float32Array) || logits.data.length !== 3 || [...logits.data].some(x => !Number.isFinite(x))) fail('NLI logits mismatch');
        return Object.freeze({ logits: Object.freeze(Array.from(logits.data)), elapsedMs: performance.now() - started, tokenCount: ids.length });
      } finally {
        for (const tensor of [...Object.values(output ?? {}), ...tensors]) try { tensor?.dispose?.(); } catch { /* best effort disposal */ }
        busy = false;
      }
    },
    async close() {
      if (closed) return;
      if (busy) fail('NLI runner busy');
      closed = true;
      try { await session.release(); } finally { await release(); }
    },
  });
}
async function safeDirectory(root) {
  if (typeof root !== 'string' || !/^D:\\/iu.test(root) || path.win32.normalize(root) !== root || root.includes('..') || root.length > 220) fail('Expected bounded absolute D NLI asset directory');
  const parts = root.slice(3).split('\\').filter(Boolean);
  let current = root.slice(0, 3);
  for (const part of parts) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Unsafe NLI asset directory');
  }
}
async function readVerified(root, a) {
  const filename = path.join(root, a.filename), stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== a.bytes) fail('NLI asset size/path mismatch');
  const file = await open(filename, 'r');
  let bytes;
  try {
    const after = await file.stat();
    if (after.size !== a.bytes || after.ino !== stat.ino || after.dev !== stat.dev) fail('NLI asset changed');
    bytes = Buffer.alloc(a.bytes);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) fail('NLI asset truncated');
      offset += bytesRead;
    }
    const end = await file.stat();
    if (end.size !== a.bytes || createHash('sha256').update(bytes).digest('hex') !== a.sha256) fail('NLI asset digest mismatch');
    return bytes;
  } catch (error) { bytes?.fill(0); throw error; } finally { await file.close(); }
}
export async function createNliRuntime(options) {
  const { assetRoot, manifest } = record(options, ['assetRoot', 'manifest']);
  const checked = validateNliManifest(manifest);
  await safeDirectory(assetRoot);
  const verified = new Map();
  let session;
  const release = async () => { for (const bytes of verified.values()) bytes.fill(0); verified.clear(); };
  try {
    for (const a of checked.assets) verified.set(a.filename, await readVerified(assetRoot, a));
    const json = filename => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(verified.get(filename)));
    const { Tokenizer } = await import(pathToFileURL(path.join(assetRoot, 'tokenizers.mjs')).href);
    const ort = await import(pathToFileURL(path.join(assetRoot, 'ort.wasm.min.mjs')).href);
    if (ort.env.versions.web !== ORT_VERSION) fail('NLI ORT version mismatch');
    const tokenizer = new Tokenizer(json('tokenizer.json'), json('tokenizer_config.json'));
    validateNliConfiguration(json('config.json'), json('tokenizer_config.json'), tokenizer);
    ort.env.logLevel = 'error';
    Object.assign(ort.env.wasm, { numThreads: 1, proxy: false, simd: true, initTimeout: 30000,
      wasmPaths: { mjs: pathToFileURL(path.join(assetRoot, 'ort-wasm-simd-threaded.mjs')).href,
        wasm: pathToFileURL(path.join(assetRoot, 'ort-wasm-simd-threaded.wasm')).href },
      wasmBinary: verified.get('ort-wasm-simd-threaded.wasm') });
    session = await ort.InferenceSession.create(verified.get('model_quantized.onnx'), {
      executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 3,
    });
    return createNliPairRunner({ tokenizer, session, Tensor: ort.Tensor, release });
  } catch (error) { try { await session?.release(); } finally { await release(); } throw error; }
}
