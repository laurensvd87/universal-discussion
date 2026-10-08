import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preflightLongInput, runPooledArticle, InferenceStageError } from '../e5-infer.js';

test('packaged tokenizer preflight reports aggregate failures without ONNX inference', async () => {
  const result = await preflightLongInput([
    { id: 'fictional-1', title: 'Invented ferry opens', body: 'A fictional ferry opens.' },
    { id: 'fictional-2', title: 'Invented bridge closes', body: '\u0001Invalid synthetic control.' },
  ]);
  assert.equal(result.articlesChecked, 2);
  assert.equal(result.tokenizationFailures, 1);
  assert.equal(result.vocabRangeFailures, 0);
  assert.ok(result.modelSha256 && result.tokenizerSha256);
  const output = JSON.stringify(result);
  assert.equal(output.includes('ferry'), false);
  assert.equal(output.includes('fictional-1'), false);
});

test('inference errors use fixed run and pool codes while disposing tensors', async () => {
  let tensors = [];
  class Tensor {
    constructor() { this.disposed = false; tensors.push(this); }
    dispose() { this.disposed = true; }
  }
  const encoded = { ids: [1], attention_mask: [1], token_type_ids: [0] };
  const session = { inputNames: ['input_ids', 'attention_mask', 'token_type_ids'],
    run: async () => ({ last_hidden_state: new Tensor() }) };
  await assert.rejects(runPooledArticle(session, Tensor, encoded, () => {
    throw new Error('private synthetic text');
  }), { code: 'POOL' });
  assert.equal(tensors.length, 4);
  assert.ok(tensors.every(t => t.disposed));
  tensors = [];
  await assert.rejects(runPooledArticle({ ...session, run: async () => {
    throw new Error('private synthetic text');
  } }, Tensor, encoded, () => 1), { code: 'SESSION_RUN' });
  assert.equal(tensors.length, 3);
  assert.ok(tensors.every(t => t.disposed));
  assert.equal(new InferenceStageError('TOKENIZE').message, 'TOKENIZE');
});
