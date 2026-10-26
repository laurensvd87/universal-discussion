import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBrowserEncoder, readBoundedPackagedBytes } from '../browser/embedding/e5-browser.js';
import { DIMENSIONS, E5_REVISION, EXTRACTOR_VERSION, inputText, MODEL_ID, MODEL_SHA256,
  ORT_VERSION, poolHidden, prefixTokenInput, readAssetManifest, TOKENIZER_SHA256,
  TOKENIZER_VERSION } from '../browser/embedding/embedding-contract.js';
import { checkPackagingBudget, copyVerifiedAsset } from '../harness/package-browser-embedding.js';

function manifest() {
  return { schema: 'browser-e5-assets/v1', modelId: MODEL_ID, extractorVersion: EXTRACTOR_VERSION,
    revision: E5_REVISION, tokenizerVersion: TOKENIZER_VERSION, ortVersion: ORT_VERSION,
    assets: ['model.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json', 'special_tokens_map.json',
      'tokenizers.mjs', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']
      .map(filename => ({ filename, bytes: filename === 'model.onnx' ? 118308185 : filename === 'tokenizer.json' ? 17082730 : 1,
        sha256: filename === 'model.onnx' ? MODEL_SHA256 : filename === 'tokenizer.json' ? TOKENIZER_SHA256 : 'a'.repeat(64) })) };
}
function hidden(tokens = 3) {
  const data = new Float32Array(tokens * DIMENSIONS);
  for (let token = 0; token < tokens; token++) for (let col = 0; col < DIMENSIONS; col++) data[token * DIMENSIONS + col] = (token + 1) * ((col % 7) - 3);
  return { data, dims: [1, tokens, DIMENSIONS] };
}
function stubRuntime(run) {
  return { tokenizer: { encode: () => ({ ids: [123] }) },
    ort: { Tensor: class { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } } },
    session: { run } };
}

test('browser inference initializes lazily once, produces int64 feeds and normalized distinct-space output', async () => {
  let loads = 0;
  const encoder = createBrowserEncoder({ initialize: async () => {
    loads++;
    return stubRuntime(async feeds => {
      assert.deepEqual(feeds.input_ids.data, new BigInt64Array([0n, 123n, 2n]));
      assert.deepEqual(feeds.attention_mask.data, new BigInt64Array([1n, 1n, 1n]));
      assert.deepEqual(feeds.token_type_ids.data, new BigInt64Array([0n, 0n, 0n]));
      assert.deepEqual(feeds.input_ids.dims, [1, 3]);
      assert.equal(feeds.input_ids.type, 'int64');
      return { last_hidden_state: hidden() };
    });
  } });
  assert.equal(loads, 0);
  const result = await encoder.embedText('owned synthetic descriptor');
  assert.equal(result.modelId, MODEL_ID);
  assert.equal(result.values.length, DIMENSIONS);
  assert.ok(result.values.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...result.values) - 1) < 1e-12);
  assert.deepEqual(await encoder.embedText('owned synthetic descriptor'), result);
  assert.equal(loads, 1);
});

test('versioned deterministic token prefix reserves BOS/EOS and preserves query preprocessing', () => {
  let input;
  const tokenizer = { encode(text, options) {
    input = text; assert.deepEqual(options, { add_special_tokens: false });
    return { ids: Array.from({ length: 900 }, (_, i) => i + 10) };
  } };
  const tokens = prefixTokenInput(tokenizer, 'bounded main region');
  assert.equal(input, 'query: bounded main region');
  assert.equal(tokens.ids.length, 512);
  assert.deepEqual(tokens.ids, [0, ...Array.from({ length: 510 }, (_, i) => i + 10), 2]);
  assert.equal(tokens.sampled, true);
  assert.deepEqual(prefixTokenInput(tokenizer, 'bounded main region'), tokens);
  const short = prefixTokenInput({ encode: () => ({ ids: [5, 6] }) }, 'text');
  assert.deepEqual(short.ids, [0, 5, 6, 2]);
  assert.equal(short.sampled, false);
  for (const ids of [[], [250037], [-1], [NaN], [1.5], ['3'], Array(2), Array(16385).fill(1)]) assert.throws(() => prefixTokenInput({ encode: () => ({ ids }) }, 'text'));
});

test('input rejects overlimit and empty text before runtime initialization and permits ordinary rendered whitespace', async () => {
  let loads = 0;
  const encoder = createBrowserEncoder({ initialize: async () => { loads++; assert.fail('must not initialize'); } });
  for (const text of ['', '  ', 'x'.repeat(4097), null, 1, 'x\u0000y']) await assert.rejects(encoder.embedText(text), /Invalid embedding text/);
  assert.equal(loads, 0);
  assert.equal(inputText('x'.repeat(4096)).length, 4096);
  assert.equal(inputText('main\ntext\tregion'), 'main\ntext\tregion');
});

test('pooling includes active special-token rows, excludes pad rows and rejects unsafe native output', () => {
  const output = hidden();
  output.data.fill(0);
  output.data[0] = 3; output.data[DIMENSIONS + 1] = 100; output.data[2 * DIMENSIONS + 2] = 4;
  const expected = Array(DIMENSIONS).fill(0); expected[0] = 3 / 5; expected[2] = 4 / 5;
  const pooled = poolHidden(output, [1, 0, 1]);
  for (let i = 0; i < pooled.length; i++) assert.ok(Math.abs(pooled[i] - expected[i]) < 1e-12);
  assert.throws(() => poolHidden(output, [0, 0, 0]));
  assert.throws(() => poolHidden(output, [1, 2, 1]));
  assert.throws(() => poolHidden(output, [1, , 1]));
  assert.throws(() => poolHidden({ data: output.data, dims: [1, 3, 383] }, [1, 1, 1]));
  assert.throws(() => poolHidden({ data: new Float32Array(384), dims: [1, 3, 384] }, [1, 1, 1]));
  for (const value of [NaN, Infinity, -Infinity]) {
    const malformed = hidden(); malformed.data[0] = value;
    assert.throws(() => poolHidden(malformed, [1, 1, 1]));
  }
  assert.throws(() => poolHidden({ data: new Float32Array(384), dims: [1, 1, 384] }, [1]));
});

test('failed initialization stays failed and concurrent calls reject without a raw-text queue', async () => {
  let loads = 0;
  const failed = createBrowserEncoder({ initialize: async () => { loads++; throw new Error('incompatible runtime'); } });
  await assert.rejects(failed.embedText('text'), /incompatible/);
  await assert.rejects(failed.embedText('text'), /incompatible/);
  assert.equal(loads, 1);
  let release;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const encoder = createBrowserEncoder({ initialize: async () => stubRuntime(async () => {
    await new Promise(resolve => { release = resolve; markStarted(); }); return { last_hidden_state: hidden() };
  }) });
  const first = encoder.embedText('first');
  await started;
  await assert.rejects(encoder.embedText('second'), /busy/);
  release(); await first;
});

function assetStream(chunks, error = null) {
  const counts = { reads:0,cancels:0,releases:0 };
  return { counts, body: { getReader() { return {
    async read() { const index=counts.reads++; if(error)throw error;return index<chunks.length?{value:chunks[index],done:false}:{done:true}; },
    async cancel() { counts.cancels++; }, releaseLock() { counts.releases++; },
  }; } } };
}
const assetHash = bytes => createHash('sha256').update(bytes).digest('hex');

test('packaged streaming uses one manifest-bounded buffer and verifies exact bytes across chunks', async () => {
  const bytes=Uint8Array.from([1,2,3,4,5]), stream=assetStream([bytes.subarray(0,2),bytes.subarray(2)]);
  const result=await readBoundedPackagedBytes(stream.body,bytes.length,assetHash(bytes));
  assert.deepEqual(result,bytes);assert.equal(result.buffer.byteLength,bytes.length);
  assert.deepEqual(stream.counts,{reads:3,cancels:0,releases:1});
  const manifest=assetStream([Uint8Array.from([1,2,3])]);
  const bounded=await readBoundedPackagedBytes(manifest.body,16);
  assert.deepEqual([...bounded],[1,2,3]);assert.equal(bounded.buffer.byteLength,16,
    'short bounded manifest keeps a view on its one preallocation, not another concatenation allocation');
});

test('packaged streaming immediately owns chunks, even when a reader reuses its backing buffer', async () => {
  const shared=new Uint8Array(2);let reads=0,released=0;
  const body={getReader:()=>({async read(){reads++;if(reads>2)return{done:true};shared.fill(reads);return{done:false,value:shared};},async cancel(){assert.fail('valid stream cancelled');},releaseLock(){released++;}})};
  const expected=Uint8Array.from([1,1,2,2]);
  assert.deepEqual(await readBoundedPackagedBytes(body,4,assetHash(expected)),expected);
  assert.equal(released,1);
});

test('packaged stream overflow, short reads, hash mismatch and read failures cancel and release the reader', async () => {
  const cases=[
    {chunks:[Uint8Array.from([1,2,3])],maximum:2,hash:assetHash(Uint8Array.from([1,2]))},
    {chunks:[Uint8Array.from([1])],maximum:2,hash:assetHash(Uint8Array.from([1,2]))},
    {chunks:[Uint8Array.from([1,2])],maximum:2,hash:'0'.repeat(64)},
    {chunks:[],maximum:2,hash:null,error:new Error('synthetic read failure')},
  ];
  for(const item of cases){const stream=assetStream(item.chunks,item.error);await assert.rejects(readBoundedPackagedBytes(stream.body,item.maximum,item.hash));assert.equal(stream.counts.cancels,1);assert.equal(stream.counts.releases,1);}
  for(const maximum of [0,-1,1.5,Infinity,120*1024*1024+1]){
    const stream=assetStream([]);await assert.rejects(readBoundedPackagedBytes(stream.body,maximum));assert.equal(stream.counts.reads,0);
  }
});

test('packaged hash failure also cancels and releases without changing encoder failure policy', async t => {
  t.mock.method(crypto.subtle,'digest',async()=>{throw new Error('synthetic digest failure');});
  const stream=assetStream([Uint8Array.from([1,2])]);
  await assert.rejects(readBoundedPackagedBytes(stream.body,2,'0'.repeat(64)),/synthetic digest failure/u);
  assert.equal(stream.counts.cancels,1);assert.equal(stream.counts.releases,1);
});

test('asset manifest requires pinned graph/tokenizer/runtime identity and fixed local filenames', () => {
  assert.equal(readAssetManifest(manifest()).size, 9);
  for (const [key, value] of [['modelId', 'node-e5'], ['revision', 'main'], ['ortVersion', 'other'], ['extractorVersion', 'other']]) {
    assert.throws(() => readAssetManifest({ ...manifest(), [key]: value }));
  }
  for (const change of [asset => { asset.filename = '../remote'; }, asset => { asset.bytes = 0; },
    asset => { asset.bytes = Infinity; }, asset => { asset.sha256 = 'x'; }, asset => { asset.sha256 = '0'.repeat(64); }]) {
    const value = manifest(); change(value.assets[0]); assert.throws(() => readAssetManifest(value));
  }
  const duplicate = manifest(); duplicate.assets[1] = duplicate.assets[0];
  assert.throws(() => readAssetManifest(duplicate));
});

test('packaging budget accounts for existing experiment, extension assets and pending copies', () => {
  checkPackagingBudget(1_000_000_000, 10_000_000, 150_000_000);
  assert.throws(() => checkPackagingBudget(2_000_000_000, 100_000_000, 100_000_000), /installed cap/);
  for (const value of [-1, NaN, Infinity, 0.5]) assert.throws(() => checkPackagingBudget(value, 0, 0));
});

test('packaging verifies exact source/destination bytes, resumes valid copies and rejects links/path escapes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'murmingle-browser-assets-'));
  try {
    const sourceRoot = path.join(root, 'input'); const outputRoot = path.join(root, 'output');
    await mkdir(sourceRoot); await mkdir(outputRoot);
    const bytes = Buffer.from('owned synthetic binary');
    const source = path.join(sourceRoot, 'asset'); await writeFile(source, bytes);
    const spec = { sourceRoot, outputRoot, source, filename: 'model.onnx', bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') };
    await copyVerifiedAsset(spec);
    assert.deepEqual(await readFile(path.join(outputRoot, 'model.onnx')), bytes);
    await copyVerifiedAsset(spec);
    await assert.rejects(copyVerifiedAsset({ ...spec, filename: '../escape' }), /specification/);
    await assert.rejects(copyVerifiedAsset({ ...spec, bytes: bytes.length - 1 }), /size mismatch/);
    await writeFile(path.join(outputRoot, 'model.onnx'), 'invalid retained copy');
    await assert.rejects(copyVerifiedAsset(spec), /integrity/);
    const linked = path.join(root, 'linked');
    await symlink(sourceRoot, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(copyVerifiedAsset({ ...spec, sourceRoot: linked, source: path.join(linked, 'asset') }), /symlink/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
