import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { embedChunks, fixedFailure, LONG_VIEW_CHUNK } from './chunks.js';
import { InferenceStageError } from '../e5-infer.js';

const vector = value => Float32Array.from({ length: 384 }, (_, i) => i === 0 ? value : 0);
const assets = { modelSha256: 'fictional-model-hash', tokenizerSha256: 'fictional-tokenizer-hash',
  runtime: 'fictional-runtime' };

test('bounded chunks preserve every vector, input order, and asset identity', async () => {
  const documents = Array.from({ length: 185 }, (_, i) => ({ id: `d${i}`, title: 'Fictional', body: 'Fictional' }));
  const calls = [];
  const fake = async (slice, mode) => {
    assert.equal(mode, 'title-lead');
    calls.push(slice.length);
    return { vectors: new Map([...slice].reverse().map(d => [d.id, vector(Number(d.id.slice(1)) + 1)])),
      assets: { ...assets }, elapsedMs: 7 };
  };
  const output = await embedChunks(documents, fake);
  assert.deepEqual(calls, [LONG_VIEW_CHUNK, LONG_VIEW_CHUNK, 25]);
  assert.deepEqual([...output.vectors.keys()], documents.map(d => d.id));
  assert.equal(output.vectors.get('d184')[0], 185);
  assert.deepEqual(output.assets, assets);
  assert.equal(output.elapsedMs, 21);
  assert.equal(documents.length, 185);
});

test('asset drift and hidden exceptions yield fixed, content-free stage diagnostics', async () => {
  const docs = [{ id: 'fictional-a' }, { id: 'fictional-b' }];
  let calls = 0;
  const drift = async slice => ({ vectors: new Map(slice.map(d => [d.id, vector(1)])),
    assets: { ...assets, modelSha256: ++calls === 1 ? assets.modelSha256 : 'different' }, elapsedMs: 1 });
  await assert.rejects(embedChunks(docs, drift, 1));
  assert.deepEqual(fixedFailure('long-embed', new Error('C:\\private\\secret article')),
    { stage: 'long-embed', phase: 'internal', code: 'UNCLASSIFIED_FAILURE' });
  assert.deepEqual(fixedFailure('not-a-stage', new Error('secret')),
    { stage: 'validation', phase: 'internal', code: 'UNCLASSIFIED_FAILURE' });
  assert.deepEqual(fixedFailure('long-embed', new InferenceStageError('POOL')),
    { stage: 'long-embed', phase: 'inference', code: 'POOL' });
  assert.deepEqual(fixedFailure('preflight-long', new InferenceStageError('secret')),
    { stage: 'preflight-long', phase: 'internal', code: 'UNCLASSIFIED_FAILURE' });
});
