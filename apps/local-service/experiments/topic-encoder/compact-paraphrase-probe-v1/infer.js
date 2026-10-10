import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { poolHidden, MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { runPooledArticle } from '../e5-infer.js';

const directory = path.join(os.tmpdir(), 'udl-paraphrase-research-20261010');
const hash = '783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672';
export async function embedParaphrase(rows) {
  return embedModel(rows, { directory, hash, prefix: '', maxTokens: 128,
    tokenHash: '2c3387be76557bd40970cec13153b3bbf80407865484b209e655e5e4729076b8' });
}
export async function embedE5Short(rows) {
  return embedModel(rows, { directory: new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/', import.meta.url),
    hash: MODEL_SHA256, tokenHash: TOKENIZER_SHA256, prefix: 'query: ', maxTokens: 128 });
}
async function embedModel(rows, { directory: root, hash: expectedHash, tokenHash, prefix, maxTokens }) {
  const filename = name => root instanceof URL ? new URL(name, root) : path.join(root, name);
  for (const name of ['model.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json']) {
    const info = await lstat(filename(name));
    if (!info.isFile() || info.isSymbolicLink() || info.size > 125_000_000) throw new Error('Invalid model asset');
  }
  const [model, tokenJson, tokenConfig, config] = await Promise.all([
    readFile(filename('model.onnx')),
    readFile(filename('tokenizer.json'), 'utf8'),
    readFile(filename('tokenizer_config.json'), 'utf8'),
    readFile(filename('config.json'), 'utf8'),
  ]);
  if (createHash('sha256').update(model).digest('hex') !== expectedHash ||
      createHash('sha256').update(tokenJson).digest('hex') !== tokenHash || JSON.parse(config).hidden_size !== 384)
    throw new Error('Unexpected research model');
  const { Tokenizer } = await import('../../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
  const ort = await import('../../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');
  const tokenizer = new Tokenizer(JSON.parse(tokenJson), JSON.parse(tokenConfig));
  ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { mjs: new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs', import.meta.url).href };
  ort.env.wasm.wasmBinary = await readFile(new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.wasm', import.meta.url));
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], executionMode: 'sequential', logSeverityLevel: 3 });
  const vectors = new Map(); const started = performance.now();
  try {
    for (const row of rows) {
      const text = row.body.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 4096);
      const encoded = tokenizer.encode(prefix + text, { add_special_tokens: false });
      const ids = [0, ...encoded.ids.slice(0, maxTokens - 2), 2];
      const mask = Array(ids.length).fill(1);
      const vector = await runPooledArticle(session, ort.Tensor, { ids, attention_mask: mask, token_type_ids: Array(ids.length).fill(0) }, poolHidden);
      vectors.set(row.id, vector);
    }
  } finally { await session.release(); }
  return { vectors, elapsedMs: performance.now() - started };
}
