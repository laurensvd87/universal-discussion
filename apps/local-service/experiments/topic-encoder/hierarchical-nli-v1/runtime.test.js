import test from 'node:test';
import assert from 'node:assert/strict';
import { createNliPairRunner, createNliRuntime, validateNliManifest, validateNliConfiguration } from './runtime.js';

function fixture(overrides = {}) {
  const state = { disposed: 0, runs: 0, released: 0, encoded: null };
  const tokenizer = { encode(premise, options) {
    state.encoded = { premise, options };
    return { ids: [0, 10, 2, 2, 20, 2], attention_mask: Array(6).fill(1), token_type_ids: Array(6).fill(0) };
  } };
  class Tensor {
    constructor(type, data, dims) { Object.assign(this, { type, data, dims }); }
    dispose() { state.disposed++; }
  }
  const session = { inputNames: ['input_ids', 'attention_mask', 'token_type_ids'], outputNames: ['logits'],
    async run(feeds) {
      state.runs++;
      assert.deepEqual(feeds.input_ids.dims, [1, 6]);
      assert.equal(feeds.input_ids.data[0], 0n);
      return { logits: new Tensor('float32', new Float32Array([2, -1, .5]), [1, 3]) };
    }, async release() { state.released++; } };
  return { state, tokenizer, session, Tensor, ...overrides };
}
const pair = () => ({ premise: 'A short title', hypothesis: 'This text is about games.' });

test('raw ordered logits, pair options, detached frozen output, disposal and close', async () => {
  const f = fixture(), runner = createNliPairRunner(f);
  const result = await runner.classifyPair(pair());
  assert.deepEqual(result.logits, [2, -1, .5]);
  assert.equal(result.tokenCount, 6); assert.ok(Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.logits));
  assert.deepEqual(f.state.encoded.options, { text_pair: pair().hypothesis, add_special_tokens: true, return_token_type_ids: true });
  assert.equal(f.state.disposed, 4);
  assert.equal(runner.experimental, true); assert.equal(runner.productionValidated, false);
  await runner.close(); await runner.close(); assert.equal(f.state.released, 1);
  await assert.rejects(runner.classifyPair(pair()), /closed/);
});

test('two-input XLM-R graph is supported but unexpected graph names are rejected', async () => {
  const f = fixture(); f.session.inputNames.pop();
  const runner = createNliPairRunner(f); await runner.classifyPair(pair()); await runner.close();
  f.session.inputNames.push('unexpected'); assert.throws(() => createNliPairRunner(f), /inputs/);
  const g = fixture(); g.session.outputNames = ['scores']; assert.throws(() => createNliPairRunner(g), /output/);
});

test('hostile records are rejected without running getters or proxy traps', async () => {
  const f = fixture(), runner = createNliPairRunner(f); let touched = false;
  const getter = { get premise() { touched = true; return 'bad'; }, hypothesis: 'topic' };
  const proxy = new Proxy({}, { getPrototypeOf() { touched = true; throw Error('trap'); } });
  for (const input of [getter, proxy, { ...pair(), extra: true }, Object.assign(Object.create(null), pair())])
    await assert.rejects(runner.classifyPair(input), /plain|fields/);
  assert.equal(touched, false); assert.equal(f.state.runs, 0); await runner.close();
});

test('text bounds reject before tokenizing or model work', async () => {
  const f = fixture(), runner = createNliPairRunner(f);
  for (const premise of ['', ' ', 'x'.repeat(513), 'bad\0text', null]) await assert.rejects(runner.classifyPair({ premise, hypothesis: 'topic' }));
  assert.equal(f.state.encoded, null); assert.equal(f.state.runs, 0); await runner.close();
});

test('overlength, invalid vocab, segment, attention and pair structure fail closed', async () => {
  for (const mutate of [
    e => { e.ids = Array(257).fill(2); }, e => { e.ids[1] = 250002; }, e => { e.ids[1] = -1; },
    e => { e.ids[1] = 1.5; }, e => { e.token_type_ids[1] = 1; }, e => { e.attention_mask[1] = 0; },
    e => { e.ids[3] = 9; }, e => { delete e.ids[1]; },
    e => { Object.defineProperty(e.ids, '1', { get() { throw Error('must not invoke'); }, enumerable: true }); },
  ]) {
    const f = fixture(), original = f.tokenizer.encode;
    f.tokenizer.encode = (...args) => { const e = original(...args); mutate(e); return e; };
    const runner = createNliPairRunner(f); await assert.rejects(runner.classifyPair(pair()), /NLI/);
    assert.equal(f.state.runs, 0); await runner.close();
  }
});

test('invalid logits reject and every tensor is disposed even on failure', async () => {
  for (const tensor of [
    { type: 'float32', dims: [3], data: new Float32Array(3) },
    { type: 'float32', dims: [1, 3], data: new Float32Array([0, NaN, 0]) },
    { type: 'float64', dims: [1, 3], data: new Float64Array(3) },
  ]) {
    const f = fixture(); tensor.dispose = () => f.state.disposed++;
    f.session.run = async () => ({ logits: tensor });
    const runner = createNliPairRunner(f); await assert.rejects(runner.classifyPair(pair()), /logits/);
    assert.equal(f.state.disposed, 4); await runner.close();
  }
  const f = fixture(); f.session.run = async () => { throw Error('synthetic failure'); };
  const runner = createNliPairRunner(f); await assert.rejects(runner.classifyPair(pair()), /synthetic/);
  assert.equal(f.state.disposed, 3); await runner.close();
});

test('overlapping work and close while busy reject; input mutation does not affect captured text', async () => {
  const f = fixture(); let finish; const original = f.session.run;
  f.session.run = feeds => new Promise(resolve => { finish = async () => resolve(await original(feeds)); });
  const runner = createNliPairRunner(f), input = pair(), work = runner.classifyPair(input);
  input.premise = 'changed'; assert.equal(f.state.encoded.premise, 'A short title');
  await assert.rejects(runner.classifyPair(pair()), /busy/); await assert.rejects(runner.close(), /busy/);
  await finish(); await work; await runner.close();
});

test('manifest/config reject missing, forged, accessor and proxy metadata before I/O', async () => {
  for (const input of [{}, { schema: 'hierarchy-nli-assets/v1', revision: 'a'.repeat(40), assets: [] },
    new Proxy({}, {}), { get schema() { throw Error('not called'); }, revision: '', assets: [] }])
    assert.throws(() => validateNliManifest(input), /NLI/);
  await assert.rejects(createNliRuntime({ assetRoot: 'C:\\wrong', manifest: {} }), /NLI/);
  assert.throws(() => validateNliConfiguration({}, {}, {}), /mismatch/);
});

test('exact pinned manifest is copied/frozen; duplicate entries, wrong bytes and traversal fail', () => {
  const entries = [
    ['model_quantized.onnx',107415176,'55614f3c7da74184742eaa0006b978744437aa91de9ba4913db42f94d7844a8f'],
    ['tokenizer.json',17082832,'d0091a328b3441d754e481db5a390d7f3b8dabc6016869fd13ba350d23ddc4cd'],
    ['config.json',989,'3ebbbdf3c3803649b49715fd169207c0f42c4250dfea5dd304b1d8b8f745852a'],
    ['tokenizer_config.json',1286,'329b7d21f02c6c6c9d358733b03a34a89cd8e4fe36998869a6ab824b98e9bf9d'],
    ['special_tokens_map.json',964,'8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835'],
    ['tokenizers.mjs',98937,'1c4a848f86156201c033d6cd08c4cf81ae1088552acec3367f31ef086edf5af0'],
    ['ort.wasm.min.mjs',50195,'1617c813ada08592706d29a9963ab6258864dce4299bd402d2196bd648b63bfe'],
    ['ort-wasm-simd-threaded.mjs',24381,'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f'],
    ['ort-wasm-simd-threaded.wasm',14264838,'06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3'],
  ];
  const make = () => ({ schema: 'hierarchy-nli-assets/v1', revision: 'ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e',
    assets: entries.map(([filename,bytes,sha256]) => ({filename,bytes,sha256})) });
  const input = make(), checked = validateNliManifest(input);
  input.assets[0].bytes = 1; assert.equal(checked.assets[0].bytes,107415176);
  assert.ok(Object.isFrozen(checked.assets[0]) && Object.isFrozen(checked.assets));
  for (const change of [m => {m.assets[0].filename='../model.onnx';},m=>{m.assets.pop();},
    m=>{m.assets[0]=m.assets[1];},m=>{m.assets[0].bytes++;},m=>{m.assets[0].sha256='a'.repeat(64);}]) {
    const m=make();change(m);assert.throws(()=>validateNliManifest(m),/NLI/);
  }
});

test('configuration binds six-layer XLM-R and exact entailment/neutral/contradiction order', () => {
  const config={model_type:'xlm-roberta',hidden_size:384,num_hidden_layers:6,num_attention_heads:12,vocab_size:250002,type_vocab_size:1,
    architectures:['XLMRobertaForSequenceClassification'],id2label:{0:'entailment',1:'neutral',2:'contradiction'},
    label2id:{entailment:0,neutral:1,contradiction:2}};
  const tc={tokenizer_class:'XLMRobertaTokenizer',model_max_length:512};
  const specials={'<s>':0,'<pad>':1,'</s>':2,'<unk>':3,'<mask>':250001};
  const tokenizer={get_vocab:()=>({size:250002}),token_to_id:s=>specials[s]};
  assert.doesNotThrow(()=>validateNliConfiguration(config,tc,tokenizer));
  for(const change of [c=>{c.num_hidden_layers=12;},c=>{c.model_type='bert';},c=>{c.id2label[0]='contradiction';}]){
    const copy=structuredClone(config);change(copy);assert.throws(()=>validateNliConfiguration(copy,tc,tokenizer),/mismatch/);
  }
});
