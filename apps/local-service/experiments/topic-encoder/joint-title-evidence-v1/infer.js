import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLS_OUTPUT, exposeJointCls } from './onnx-output.js';
import { readAssetManifest, ORT_VERSION } from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

export const MODEL_REVISION = '1427fd652930e4ba29e8149678df786c240d8825';
export const MODEL_NAME = 'cross-encoder/mmarco-mMiniLMv2-L12-H384-v1';
export const MODEL_FILES = Object.freeze({
  'model.onnx': [118620016, '6c2513767fb63d008a4377bef7a7a3555433d9436342bb53e35a3a72ffc52d4b'],
  'tokenizer.json': [17082660, '62c24cdc13d4c9952d63718d6c9fa4c287974249e16b7ade6d5a85e7bbb75626'],
  'tokenizer_config.json': [435, 'e7fbfbfa6347b4e414c1cee50d142e2c2f9a895dad68b068ae83a8b564c3837e'],
  'config.json': [891, 'cc2cfe51aa3fd759d21d21acf5dfd6994aa67a3c9210636d22e143699d336c77'],
  'README.md': [2278, '474736a65d6393a060119a8dc304563af67af4d8d86ccfee4a05dd0df107fc11'],
});
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const ASSETS = path.join(ROOT, 'spikes/topic-resolution/browser/embedding/.assets');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new TypeError(code); };
async function verifiedFile(filename, size, hash) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== size) fail('ASSET_FILE');
  const bytes = await readFile(filename);
  if (bytes.length !== size || digest(bytes) !== hash) fail('ASSET_HASH');
  return bytes;
}
export function pairTokenInput(tokenizer, a, b, mode = 'title') {
  if (!a || !b || typeof a.title !== 'string' || typeof b.title !== 'string' ||
      !['title', 'title-lead'].includes(mode)) fail('PAIR_INPUT');
  const normalize = value => value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
  const text = row => mode === 'title' ? normalize(row.title) :
    `${normalize(row.title)}\n${normalize(row.lead ?? '').slice(0, 384)}`;
  const sides = [a, b].map(row => tokenizer.encode(text(row), { add_special_tokens: false }).ids);
  if (sides.some(ids => !Array.isArray(ids) || !ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 0 || id >= 250002)))
    fail('TOKEN_IDS');
  // XLM-R pair format. Truncation affects both sides equally, never discards B.
  const ids = [0, ...sides[0].slice(0, 254), 2, 2, ...sides[1].slice(0, 254), 2];
  return { ids, attention_mask: Array(ids.length).fill(1), token_type_ids: Array(ids.length).fill(0),
    sampled: sides.some(side => side.length > 254) };
}
export async function createJointEncoder(directory) {
  if (!path.isAbsolute(directory)) fail('ASSET_PATH');
  const resolved = await realpath(directory), root = await realpath(ROOT);
  const relative = path.relative(root, resolved);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) fail('ASSETS_INSIDE_REPOSITORY');
  const own = {};
  for (const [name, [size, hash]] of Object.entries(MODEL_FILES))
    own[name] = await verifiedFile(path.join(resolved, name), size, hash);
  const config = JSON.parse(own['config.json']);
  if (config.model_type !== 'xlm-roberta' || config.hidden_size !== 384 || config.num_hidden_layers !== 12 ||
      config.vocab_size !== 250002 || config.max_position_embeddings !== 514 || config.auto_map) fail('MODEL_CONFIG');
  if (!/^license:\s*apache-2\.0\s*$/mu.test(own['README.md'].toString('utf8'))) fail('MODEL_CARD_LICENSE');
  const manifest = readAssetManifest(JSON.parse(await readFile(path.join(ASSETS, 'manifest.json'))));
  const packaged = {};
  for (const name of ['tokenizers.mjs', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    const spec = manifest.get(name);
    packaged[name] = await verifiedFile(path.join(ASSETS, name), spec.bytes, spec.sha256);
  }
  const { Tokenizer } = await import('../../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
  const tokenizer = new Tokenizer(JSON.parse(own['tokenizer.json']), JSON.parse(own['tokenizer_config.json']));
  const ort = await import('../../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');
  if (ort.env.versions.web !== ORT_VERSION) fail('RUNTIME_VERSION');
  ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = { mjs: new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs', import.meta.url).href };
  ort.env.wasm.wasmBinary = packaged['ort-wasm-simd-threaded.wasm'];
  const model = exposeJointCls(own['model.onnx']);
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], executionMode: 'sequential',
    graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  if ([...session.inputNames].sort().join() !== 'attention_mask,input_ids' ||
      [...session.outputNames].sort().join() !== [CLS_OUTPUT, 'logits'].sort().join()) {
    await session.release(); fail('MODEL_IO');
  }
  let calls = 0, sampledInputs = 0;
  async function directional(a, b, mode) {
    const encoded = pairTokenInput(tokenizer, a, b, mode);
    const feeds = {}; let outputs;
    try {
      for (const name of session.inputNames)
        feeds[name] = new ort.Tensor('int64', BigInt64Array.from(name === 'input_ids' ? encoded.ids : encoded[name], BigInt), [1, encoded.ids.length]);
      outputs = await session.run(feeds);
      const hidden = outputs[CLS_OUTPUT], logits = outputs.logits;
      if (hidden.dims.join() !== '1,384' || hidden.data.length !== 384 || logits.data.length !== 1 ||
          [...hidden.data, ...logits.data].some(value => !Number.isFinite(value))) fail('MODEL_OUTPUT');
      calls++; sampledInputs += Number(encoded.sampled);
      return { hidden: Float64Array.from(hidden.data), logit: logits.data[0], tokens: encoded.ids.length };
    } finally { for (const tensor of [...Object.values(outputs ?? {}), ...Object.values(feeds)]) tensor.dispose(); }
  }
  return {
    async pair(a, b, mode = 'title') {
      const ab = await directional(a, b, mode), ba = await directional(b, a, mode);
      const hidden = new Float64Array(768);
      for (let i = 0; i < 384; i++) { hidden[i] = (ab.hidden[i] + ba.hidden[i]) / 2;
        hidden[384 + i] = Math.abs(ab.hidden[i] - ba.hidden[i]); }
      return { hidden, rankMean: (ab.logit + ba.logit) / 2, rankDifference: Math.abs(ab.logit - ba.logit),
        tokens: ab.tokens + ba.tokens };
    },
    async release() { await session.release(); },
    diagnostics() { return { calls, sampledInputs, model: MODEL_NAME, revision: MODEL_REVISION,
      originalModelSha256: MODEL_FILES['model.onnx'][1], jointOutputModelSha256: digest(model), runtime: ORT_VERSION }; },
  };
}
