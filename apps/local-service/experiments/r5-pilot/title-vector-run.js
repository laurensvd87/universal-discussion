import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJsonSha256 } from '../../../../spikes/topic-resolution/evaluation/canonical-json.js';
import { loadFrozenOwnerReview, prepareOwnerReview } from './owner-review.js';
import { comparePairVectors, TITLE_BLEND_WEIGHTS } from './title-vector-core.js';
import { inputText, prefixTokenInput, poolHidden, readAssetManifest, ORT_VERSION,
  MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RECORD_DIRECTORY = path.resolve(HERE, '../../../../spikes/topic-resolution/review/work/r5-pilot');
const ASSET_DIRECTORY = path.resolve(HERE, '../../../../spikes/topic-resolution/browser/embedding/.assets');
const RECORD_NAME = /^[0-9a-f-]{36}\.json$/u;

async function boundedFile(filename, maximum) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum)
    throw new Error('Invalid local input');
  const bytes = await readFile(filename);
  if (bytes.length > maximum) throw new Error('Invalid local input');
  return bytes;
}

async function frozenSources() {
  const frozen = await loadFrozenOwnerReview();
  const directory = RECORD_DIRECTORY, stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      path.resolve(await realpath(directory)) !== directory) throw new Error('Invalid pilot directory');
  const names = await readdir(directory);
  if (names.includes('.lock') || names.some(name => name !== 'inventory.json' && !RECORD_NAME.test(name)))
    throw new Error('Invalid pilot inventory');
  const entries = [], byDigest = new Map();
  for (const name of names.filter(name => RECORD_NAME.test(name))) {
    const bytes = await boundedFile(path.join(directory, name), 131072);
    entries.push({ filename: name, bytes: bytes.toString('utf8') });
    byDigest.set(createHash('sha256').update(bytes).digest('hex'), JSON.parse(bytes.toString('utf8')));
  }
  const current = prepareOwnerReview(entries,
    JSON.parse((await boundedFile(path.join(directory, 'inventory.json'), 4096)).toString('utf8')));
  if (canonicalJsonSha256(frozen) !== canonicalJsonSha256(current) ||
      frozen.sources.length !== 6 || frozen.pairs.length !== 15)
    throw new Error('Frozen pilot task mismatch');
  const sources = new Map(frozen.sources.map(source => {
    const record = byDigest.get(source.sourceSha256);
    if (!record || record.schema !== 'r5-pilot-source/v1' || record.title !== source.title ||
        record.url !== source.url || record.publicationValue !== source.publicationValue ||
        record.publicationPrecision !== source.publicationPrecision)
      throw new Error('Frozen pilot Source mismatch');
    return [source.id, { title: inputText(record.title), body: record.vector }];
  }));
  return { sources, pairs: frozen.pairs };
}

export async function packagedModel() {
  const manifest = readAssetManifest(JSON.parse((await boundedFile(path.join(ASSET_DIRECTORY, 'manifest.json'), 16384)).toString('utf8')));
  const verified = new Map();
  for (const [filename, spec] of manifest) {
    const bytes = await boundedFile(path.join(ASSET_DIRECTORY, filename), spec.bytes);
    if (bytes.length !== spec.bytes || createHash('sha256').update(bytes).digest('hex') !== spec.sha256)
      throw new Error('Packaged E5 integrity mismatch');
    verified.set(filename, bytes);
  }
  const { Tokenizer } = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
  const ort = await import('../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');
  if (ort.env.versions.web !== ORT_VERSION) throw new Error('Packaged runtime mismatch');
  const tokenJson = JSON.parse(verified.get('tokenizer.json'));
  const config = JSON.parse(verified.get('config.json'));
  if (tokenJson.truncation !== null || tokenJson.padding !== null ||
      config.hidden_size !== 384 || config.model_type !== 'bert')
    throw new Error('Packaged configuration mismatch');
  const tokenizer = new Tokenizer(tokenJson, JSON.parse(verified.get('tokenizer_config.json')));
  ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = { mjs: new URL('../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs', import.meta.url).href };
  ort.env.wasm.wasmBinary = verified.get('ort-wasm-simd-threaded.wasm');
  const session = await ort.InferenceSession.create(verified.get('model.onnx'), {
    executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 3,
  });
  if ([...session.inputNames].sort().join() !== 'attention_mask,input_ids,token_type_ids' ||
      !session.outputNames.includes('last_hidden_state')) {
    await session.release(); throw new Error('Packaged graph mismatch');
  }
  return { session, tokenizer, ort };
}

export async function runTitleVectorProbe() {
  const { sources, pairs } = await frozenSources();
  const { session, tokenizer, ort } = await packagedModel();
  const started = performance.now();
  try {
    for (const source of sources.values()) {
      const encoded = prefixTokenInput(tokenizer, source.title);
      const feeds = {};
      for (const name of session.inputNames) {
        const values = name === 'input_ids' ? encoded.ids : encoded[name];
        feeds[name] = new ort.Tensor('int64', BigInt64Array.from(values, BigInt), [1, encoded.ids.length]);
      }
      const result = await session.run(feeds);
      source.titleVector = poolHidden(result.last_hidden_state, encoded.attention_mask);
      delete source.title;
    }
  } finally { await session.release(); }
  const diagnostics = pairs.map(pair => {
    const a = sources.get(pair.sourceAId), b = sources.get(pair.sourceBId);
    return { pairId: pair.id, scores: comparePairVectors(
      { body: a.body, title: a.titleVector }, { body: b.body, title: b.titleVector }) };
  });
  return { schema: 'r5-title-vector-shadow/v1', sourceCount: sources.size, pairCount: pairs.length,
    titleBlendWeights: TITLE_BLEND_WEIGHTS, modelSha256: MODEL_SHA256,
    tokenizerSha256: TOKENIZER_SHA256, ortVersion: ORT_VERSION,
    elapsedMs: performance.now() - started, pairs: diagnostics };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    process.stderr.write('No arguments accepted.\n'); process.exitCode = 1;
  } else {
    runTitleVectorProbe().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
      () => { process.stderr.write('Title-vector probe unavailable; inspect frozen pilot and packaged assets.\n');
        process.exitCode = 1; });
  }
}
