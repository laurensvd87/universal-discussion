// Explicit local-artifact checks: intentionally outside default test discovery.
// Run with the repository's external-capability denial guard. No inference,
// acquisition, report writes or new text fixtures occur in this file.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, test } from 'node:test';
import { cacheRoot, experimentRoot, modelAssets, safePath, verifyFile } from '../src/acquire.js';
import { assertFrozenCorpus, compareVectors, EXPECTED_CORPUS_DIGEST, validateTokenIds } from '../src/experiment-core.js';
import { getVectorMetadata, parseQuantizedTable, serializeQuantizedTable } from '../src/static-encoder.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireRuntime = createRequire(path.join(experimentRoot, 'runtime/package.json'));
let corpus, Tokenizer, staticJson, e5Json, e5Config, expectedIdentity, manifest;
const verifiedAssets = new Map();

async function json(filename, limit = 20 * 1024 * 1024) {
  await safePath(filename, { root: experimentRoot, allowMissing: false });
  const info = await lstat(filename);
  assert.ok(info.isFile() && info.size <= limit, 'bounded local JSON file required');
  return JSON.parse(await readFile(filename, 'utf8'));
}
async function verifiedAsset(target) {
  if (verifiedAssets.has(target)) return verifiedAssets.get(target);
  const spec = modelAssets.find(asset => asset.target === target);
  assert.ok(spec, `pinned specification required: ${target}`);
  const filename = path.join(cacheRoot, target);
  const verified = await verifyFile(filename, spec);
  const result = { ...verified, filename, spec };
  verifiedAssets.set(target, result);
  return result;
}
function pinnedVocabulary(tokenizerJson) {
  const byId = new Map();
  if (Array.isArray(tokenizerJson.model.vocab)) {
    tokenizerJson.model.vocab.forEach(([token], id) => byId.set(id, token));
  } else {
    for (const [token, id] of Object.entries(tokenizerJson.model.vocab)) byId.set(id, token);
  }
  for (const added of tokenizerJson.added_tokens) byId.set(added.id, added.content);
  return byId;
}
function checkVocabulary(tokenizer, tokenizerJson, rows) {
  const pinned = pinnedVocabulary(tokenizerJson);
  const actual = tokenizer.get_vocab();
  assert.equal(actual.size, pinned.size);
  // E5's pinned graph reserves 250037 rows for a 250002-token vocabulary.
  // Those unused rows must not be invented as tokenizer IDs.
  assert.ok(pinned.size <= rows);
  for (const [id, token] of pinned) {
    assert.ok(Number.isSafeInteger(id) && id >= 0 && id < rows);
    assert.equal(tokenizer.id_to_token(id), token);
    assert.equal(tokenizer.token_to_id(token), id);
    assert.equal(actual.get(token), id);
  }
  return pinned;
}
function checkEncodedRows(tokenizer, pinned, encoded, rows) {
  validateTokenIds(encoded.ids, { rows });
  assert.equal(encoded.ids.length, encoded.tokens.length);
  for (let index = 0; index < encoded.ids.length; index++) {
    const id = encoded.ids[index];
    assert.equal(tokenizer.id_to_token(id), pinned.get(id));
    assert.equal(tokenizer.token_to_id(pinned.get(id)), id);
    assert.equal(encoded.tokens[index], pinned.get(id));
  }
}
async function report(mode) {
  const directory = path.join(experimentRoot, 'output');
  await safePath(directory, { root: experimentRoot, allowMissing: false });
  const filenames = (await readdir(directory)).filter(name => name.startsWith(`${mode}-`) && name.endsWith('.json')).sort();
  assert.ok(filenames.length, `existing offline report required: ${mode}`);
  const value = await json(path.join(directory, filenames.at(-1)));
  assert.equal(value.mode, mode);
  assert.equal(value.corpusDigest, EXPECTED_CORPUS_DIGEST);
  assert.equal(value.corpusFreezeCommit, '821baf7');
  assert.equal(value.collection.vectors.length, corpus.descriptors.length);
  assert.deepEqual(value.collection.vectors.map(item => item.id), corpus.descriptors.map(item => item.id));
  return value;
}

before(async () => {
  assert.equal(globalThis[Symbol.for('universal-discussion.offline-capability-guard')]?.version,
    'offline-capability-guard/1.0.0', 'the explicit offline guard is required');
  corpus = assertFrozenCorpus(await json(path.join(experimentRoot, 'fixtures/corpus.json')));
  assert.equal(corpus.descriptors.length, 64);
  for (const [name, version] of [['@huggingface/transformers', '4.3.0'],
    ['@huggingface/tokenizers', '0.2.0'], ['onnxruntime-node', '1.30.0']]) {
    const pkg = await json(path.join(experimentRoot, 'runtime/node_modules', name, 'package.json'));
    assert.equal(pkg.version, version, `approved installed runtime required: ${name}`);
    assert.ok((await lstat(requireRuntime.resolve(name))).isFile(), `installed entry point required: ${name}`);
  }
  const nativeDirectory = path.join(experimentRoot, 'runtime/node_modules/onnxruntime-node/bin/napi-v6',
    process.platform, process.arch);
  assert.ok((await lstat(path.join(nativeDirectory, 'onnxruntime_binding.node'))).isFile(),
    'installed native runtime binding required without loading it');
  if (process.platform === 'win32') assert.ok((await lstat(path.join(nativeDirectory, 'onnxruntime.dll'))).isFile());
  for (const asset of modelAssets) await verifiedAsset(asset.target);
  const imported = await import(pathToFileURL(requireRuntime.resolve('@huggingface/tokenizers')).href);
  Tokenizer = imported.Tokenizer ?? imported.default?.Tokenizer;
  assert.equal(typeof Tokenizer, 'function');
  const tokenFile = await verifiedAsset('assets/static/0_StaticEmbedding/tokenizer.json');
  const sourceFile = await verifiedAsset('assets/static/0_StaticEmbedding/model.safetensors');
  expectedIdentity = { modelId: sourceFile.spec.repo, revision: sourceFile.spec.revision,
    sourceSha256: sourceFile.sha256, tokenizerSha256: tokenFile.sha256 };
  staticJson = await json(tokenFile.filename);
  e5Json = await json((await verifiedAsset('assets/e5/tokenizer.json')).filename);
  e5Config = await json((await verifiedAsset('assets/e5/tokenizer_config.json')).filename);
  manifest = await json(path.join(cacheRoot, 'derived/manifest.json'), 8192);
});

test('all 64 static descriptors preserve pinned IDs and add exactly CLS/SEP only when requested', () => {
  assert.equal(staticJson.truncation, null);
  assert.equal(staticJson.padding, null);
  const tokenizer = new Tokenizer(staticJson, {});
  const pinned = checkVocabulary(tokenizer, staticJson, 105879);
  assert.equal(pinned.size, 105879);
  assert.equal(tokenizer.token_to_id('[CLS]'), 101);
  assert.equal(tokenizer.token_to_id('[SEP]'), 102);
  for (const descriptor of corpus.descriptors) {
    for (const added of staticJson.added_tokens.filter(item => item.special)) assert.ok(!descriptor.text.includes(added.content));
    const plain = tokenizer.encode(descriptor.text, { add_special_tokens: false });
    const special = tokenizer.encode(descriptor.text, { add_special_tokens: true });
    assert.deepEqual(special.ids, [101, ...plain.ids, 102], descriptor.id);
    assert.ok(plain.ids.length > 0 && special.ids.length <= 512, descriptor.id);
    checkEncodedRows(tokenizer, pinned, plain, 105879);
    checkEncodedRows(tokenizer, pinned, special, 105879);
  }
});

test('all 64 E5 query inputs preserve pinned vocabulary and add exactly BOS/EOS within 512 IDs', async () => {
  assert.equal(e5Json.truncation, null);
  assert.equal(e5Json.padding, null);
  const modelConfig = await json((await verifiedAsset('assets/e5/config.json')).filename);
  const tokenizer = new Tokenizer(e5Json, e5Config);
  const pinned = checkVocabulary(tokenizer, e5Json, modelConfig.vocab_size);
  assert.equal(pinned.size, 250002);
  assert.equal(modelConfig.vocab_size, 250037);
  assert.equal(tokenizer.token_to_id('<s>'), 0);
  assert.equal(tokenizer.token_to_id('</s>'), 2);
  for (const descriptor of corpus.descriptors) {
    for (const added of e5Json.added_tokens.filter(item => item.special)) assert.ok(!descriptor.text.includes(added.content));
    const input = `query: ${descriptor.text}`;
    const plain = tokenizer.encode(input, { add_special_tokens: false });
    const special = tokenizer.encode(input, { add_special_tokens: true, return_token_type_ids: true });
    assert.deepEqual(special.ids, [0, ...plain.ids, 2], descriptor.id);
    assert.ok(special.ids.length <= 512, descriptor.id);
    assert.deepEqual(special.attention_mask, Array(special.ids.length).fill(1));
    assert.deepEqual(special.token_type_ids, Array(special.ids.length).fill(0));
    checkEncodedRows(tokenizer, pinned, plain, modelConfig.vocab_size);
    checkEncodedRows(tokenizer, pinned, special, modelConfig.vocab_size);
  }
});

test('derived 128/256 packs bind actual pinned source/tokenizer hashes and roundtrip exact bytes', async () => {
  assert.deepEqual(manifest.source, expectedIdentity);
  assert.deepEqual(manifest.packs.map(pack => pack.dimensions), [128, 256]);
  for (const pack of manifest.packs) {
    assert.equal(pack.filename, `static-int8-${pack.dimensions}.bin`);
    const filename = path.join(cacheRoot, 'derived', pack.filename);
    const verified = await verifyFile(filename, { size: pack.bytes, kind: 'sha256', hash: pack.sha256 });
    const bytes = await readFile(filename);
    assert.equal(sha(bytes), verified.sha256);
    const table = parseQuantizedTable(bytes, { expectedRows: 105879,
      expectedDimensions: pack.dimensions, expectedMetadata: expectedIdentity });
    assert.equal(table.sourceDimensions, 1024);
    assert.deepEqual(serializeQuantizedTable(table), bytes);
    const persisted = await report(`static-int8-${pack.dimensions}`);
    assert.deepEqual(persisted.measurements.implementation.numeric, getVectorMetadata(table));
    assert.equal(pack.withTokenizerBytes, pack.bytes + (await lstat(path.join(cacheRoot,
      'assets/static/0_StaticEmbedding/tokenizer.json'))).size);
  }
});

test('persisted matched FP32/int8 reports show measurable bounded conversion drift across all 64 descriptors', async t => {
  for (const dimensions of [128, 256]) {
    const reference = await report(`static-f32-${dimensions}`);
    const candidate = await report(`static-int8-${dimensions}`);
    for (const value of [reference, candidate]) {
      const numeric = value.measurements.implementation.numeric;
      assert.equal(numeric.sourceModelId, expectedIdentity.modelId);
      assert.equal(numeric.revision, expectedIdentity.revision);
      assert.equal(numeric.sourceSha256, expectedIdentity.sourceSha256);
      assert.equal(numeric.tokenizerSha256, expectedIdentity.tokenizerSha256);
      assert.equal(numeric.sourceDimensions, 1024);
      assert.equal(numeric.dimensions, dimensions);
      assert.equal(value.collection.dimensions, dimensions);
    }
    assert.equal(reference.measurements.implementation.numeric.storage, 'float32');
    assert.equal(candidate.measurements.implementation.numeric.storage, 'int8');
    assert.notEqual(reference.collection.modelId, candidate.collection.modelId);
    const comparison = compareVectors(reference.collection, candidate.collection,
      { allowRelatedVariantComparison: true });
    assert.equal(comparison.count, 64);
    assert.ok(comparison.meanDrift > 0 && comparison.maxDrift > 0);
    assert.ok(comparison.maxDrift <= 0.01, 'numeric conversion bound; no matching-quality threshold is inferred');
    t.diagnostic(`${dimensions} dimensions: mean cosine drift=${comparison.meanDrift}, max=${comparison.maxDrift}`);
  }
});
