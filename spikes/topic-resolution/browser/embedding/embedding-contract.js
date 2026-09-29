export const MODEL_ID = 'e5-small-q8-browser-main-prefix-v1';
// Historical asset-manifest identity, not the per-capture region provenance.
// ADR-021 also accepts article-container-prefix/v1 with this unchanged transform.
export const EXTRACTOR_VERSION = 'main-text-prefix/v1';
export const DIMENSIONS = 384;
export const MAX_CHARACTERS = 4096;
export const MAX_TOKENS = 512;
export const TOKENIZER_VERSION = '0.2.0';
export const ORT_VERSION = '1.31.0-dev.20260914-8d85527a0';
export const E5_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const MODEL_SHA256 = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
export const TOKENIZER_SHA256 = '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39';

export function inputText(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARACTERS ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)) throw new TypeError('Invalid embedding text');
  return text;
}

// Versioned deterministic sampling: retain query-prefix IDs and the first main
// text token IDs; reserve both special-token positions. Never claim full coverage.
export function prefixTokenInput(tokenizer, text) {
  const encoded = tokenizer.encode(`query: ${inputText(text)}`, { add_special_tokens: false });
  if (!Array.isArray(encoded.ids) || !encoded.ids.length || encoded.ids.length > 16384) throw new TypeError('Invalid embedding token IDs');
  for (const id of encoded.ids) if (!Number.isSafeInteger(id) || id < 0 || id >= 250037) throw new TypeError('Invalid embedding token IDs');
  const ids = [0, ...encoded.ids.slice(0, MAX_TOKENS - 2), 2];
  return { ids, attention_mask: Array(ids.length).fill(1), token_type_ids: Array(ids.length).fill(0),
    sampled: encoded.ids.length > MAX_TOKENS - 2 };
}

export function poolHidden(hidden, mask) {
  if (!hidden || !Array.isArray(hidden.dims) || hidden.dims.length !== 3 ||
    hidden.dims[0] !== 1 || hidden.dims[2] !== DIMENSIONS ||
    !Number.isInteger(hidden.dims[1]) || hidden.dims[1] < 1 || hidden.dims[1] > MAX_TOKENS ||
    !(hidden.data instanceof Float32Array) || hidden.data.length !== hidden.dims[1] * DIMENSIONS ||
    !Array.isArray(mask) || mask.length !== hidden.dims[1] || mask.some(value => value !== 0 && value !== 1))
    throw new TypeError('Invalid embedding output');
  const active = mask.reduce((sum, value) => sum + value, 0);
  for (const value of mask) if (value !== 0 && value !== 1) throw new TypeError('Invalid embedding output');
  let scale = 0;
  for (let i = 0; i < hidden.data.length; i++) {
    const value = hidden.data[i];
    if (!Number.isFinite(value)) throw new TypeError('Invalid embedding output');
    if (mask[Math.floor(i / DIMENSIONS)]) scale = Math.max(scale, Math.abs(value));
  }
  if (!active || !scale) throw new TypeError('Embedding vector unavailable');
  const mean = new Float64Array(DIMENSIONS);
  for (let token = 0; token < mask.length; token++) if (mask[token]) {
    for (let col = 0; col < DIMENSIONS; col++) mean[col] += hidden.data[token * DIMENSIONS + col] / scale / active;
  }
  const maximum = Math.max(...mean.map(Math.abs));
  if (!maximum) throw new TypeError('Embedding vector unavailable');
  const scaled = Array.from(mean, value => value / maximum);
  const norm = Math.hypot(...scaled);
  if (!Number.isFinite(norm) || !norm) throw new TypeError('Embedding vector unavailable');
  return scaled.map(value => value / norm);
}

export function readAssetManifest(manifest) {
  const names = ['model.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json',
    'special_tokens_map.json', 'tokenizers.mjs', 'ort.wasm.min.mjs',
    'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
  if (!manifest || manifest.schema !== 'browser-e5-assets/v1' || manifest.modelId !== MODEL_ID ||
    manifest.extractorVersion !== EXTRACTOR_VERSION || manifest.revision !== E5_REVISION ||
    manifest.tokenizerVersion !== TOKENIZER_VERSION || manifest.ortVersion !== ORT_VERSION ||
    !Array.isArray(manifest.assets) || manifest.assets.length !== names.length) throw new TypeError('Invalid embedding asset manifest');
  const assets = new Map();
  for (const asset of manifest.assets) {
    if (!asset || !names.includes(asset.filename) || assets.has(asset.filename) ||
      !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > 120 * 1024 * 1024 ||
      typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(asset.sha256)) throw new TypeError('Invalid embedding asset manifest');
    assets.set(asset.filename, asset);
  }
  if (assets.get('model.onnx').sha256 !== MODEL_SHA256 || assets.get('model.onnx').bytes !== 118308185 ||
    assets.get('tokenizer.json').sha256 !== TOKENIZER_SHA256 || assets.get('tokenizer.json').bytes !== 17082730)
    throw new TypeError('Unexpected embedding assets');
  return assets;
}
