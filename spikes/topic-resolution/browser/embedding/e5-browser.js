import { DIMENSIONS, EXTRACTOR_VERSION, inputText, MODEL_ID, ORT_VERSION, poolHidden,
  prefixTokenInput, readAssetManifest } from './embedding-contract.js';
export { MODEL_ID, EXTRACTOR_VERSION };

const assetBase = new URL('./.assets/', import.meta.url);
const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');

// Packaged same-extension reads only. No CDN, server model path or first-run download.
async function packagedBytes(filename, maximum) {
  if (assetBase.protocol !== 'chrome-extension:' || !/^[A-Za-z0-9_.-]+$/u.test(filename)) throw new Error('Packaged embedding assets unavailable');
  const url = new URL(filename, assetBase).href;
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok || response.redirected || response.url !== url || !response.body) throw new Error('Packaged embedding assets unavailable');
  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new Error('Packaged embedding asset exceeds bound');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function initializePackaged() {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const manifest = readAssetManifest(JSON.parse(decoder.decode(await packagedBytes('manifest.json', 16384))));
  async function verified(filename) {
    const spec = manifest.get(filename);
    const bytes = await packagedBytes(filename, spec.bytes);
    if (bytes.length !== spec.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== spec.sha256)
      throw new Error('Packaged embedding integrity mismatch');
    return bytes;
  }
  // Verify executable files before their ordinary same-origin module imports.
  for (const filename of ['tokenizers.mjs', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs']) await verified(filename);
  const tokenJson = JSON.parse(decoder.decode(await verified('tokenizer.json')));
  const tokenConfig = JSON.parse(decoder.decode(await verified('tokenizer_config.json')));
  const modelConfig = JSON.parse(decoder.decode(await verified('config.json')));
  await verified('special_tokens_map.json');
  if (tokenJson.truncation !== null || tokenJson.padding !== null || modelConfig.hidden_size !== DIMENSIONS ||
    modelConfig.vocab_size !== 250037 || modelConfig.model_type !== 'bert') throw new Error('Incompatible packaged E5 configuration');
  const { Tokenizer } = await import('./.assets/tokenizers.mjs');
  const ort = await import('./.assets/ort.wasm.min.mjs');
  if (ort.env.versions.web !== ORT_VERSION) throw new Error('Incompatible packaged browser runtime');
  const tokenizer = new Tokenizer(tokenJson, tokenConfig);
  if (tokenizer.get_vocab().size !== 250002 || tokenizer.token_to_id('<s>') !== 0 || tokenizer.token_to_id('</s>') !== 2)
    throw new Error('Incompatible packaged E5 tokenizer');
  ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = true;
  ort.env.wasm.initTimeout = 30000;
  ort.env.wasm.wasmPaths = { mjs: new URL('ort-wasm-simd-threaded.mjs', assetBase).href,
    wasm: new URL('ort-wasm-simd-threaded.wasm', assetBase).href };
  ort.env.wasm.wasmBinary = await verified('ort-wasm-simd-threaded.wasm');
  const session = await ort.InferenceSession.create(await verified('model.onnx'), {
    executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 3,
  });
  if (JSON.stringify([...session.inputNames].sort()) !== JSON.stringify(['attention_mask', 'input_ids', 'token_type_ids']) ||
    !session.outputNames.includes('last_hidden_state')) {
    await session.release(); throw new Error('Incompatible packaged E5 graph');
  }
  return { tokenizer, ort, session };
}

// Injection is for dependency-free numeric tests; the exported default uses only
// the fixed packaged initializer. Reject overlapping work instead of retaining a
// queue of raw page text inside this inference adapter.
export function createBrowserEncoder({ initialize = initializePackaged } = {}) {
  let initialization;
  let busy = false;
  return Object.freeze({
    async embedText(text) {
      inputText(text);
      if (busy) throw new Error('Embedding inference busy');
      busy = true;
      try {
        initialization ??= Promise.resolve().then(initialize);
        const { tokenizer, ort, session } = await initialization;
        const tokens = prefixTokenInput(tokenizer, text);
        const feeds = {};
        for (const name of ['input_ids', 'attention_mask', 'token_type_ids']) {
          const values = name === 'input_ids' ? tokens.ids : tokens[name];
          feeds[name] = new ort.Tensor('int64', BigInt64Array.from(values, BigInt), [1, tokens.ids.length]);
        }
        const output = await session.run(feeds);
        return { modelId: MODEL_ID, values: poolHidden(output.last_hidden_state, tokens.attention_mask) };
      } finally { busy = false; }
    },
  });
}
const encoder = createBrowserEncoder();
export const embedText = text => encoder.embedText(text);
