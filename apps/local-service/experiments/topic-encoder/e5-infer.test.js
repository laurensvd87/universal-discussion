import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { topicInput, embedDocuments, runPooledArticle, InferenceStageError } from './e5-infer.js';

test('experiment input is bounded and title mode is explicit', () => {
  const document = { title: '  Ferry   decision  ', body: '  The   invented ferry closes.  ' };
  assert.equal(topicInput(document), 'The invented ferry closes.');
  assert.equal(topicInput(document, 'title-lead'), 'Ferry decision\nThe invented ferry closes.');
  assert.throws(() => topicInput(document, 'unknown'), /Invalid/);
  assert.throws(() => topicInput({ title: '', body: 'text' }), /Invalid/);
});

test('hash-pinned offline E5 returns one normalized vector per synthetic document', async () => {
  const { vectors, assets } = await embedDocuments([
    { id: 'alpha', title: 'Invented ferry closes', body: 'The invented ferry closes for repairs.' },
    { id: 'beta', title: 'Invented ferry reopens', body: 'The invented ferry reopens after repairs.' },
  ]);
  assert.equal(vectors.size, 2);
  assert.equal(vectors.get('alpha').length, 384);
  assert.ok(Math.abs(Math.hypot(...vectors.get('alpha')) - 1) < 1e-9);
  assert.ok(assets.modelSha256 && assets.tokenizerSha256);
  await assert.rejects(embedDocuments([{ id: 'same', title: 'A', body: 'A' },
    { id: 'same', title: 'B', body: 'B' }]), /Invalid/);
});

test('per-article tensors are disposed on success and inference failure', async () => {
  const made = [];
  class FakeTensor {
    constructor() { this.disposed = false; made.push(this); }
    dispose() { this.disposed = true; }
  }
  const encoded = { ids: [0, 2], attention_mask: [1, 1], token_type_ids: [0, 0] };
  const output = new FakeTensor();
  const session = { inputNames: ['input_ids', 'attention_mask', 'token_type_ids'],
    run: async () => ({ last_hidden_state: output }) };
  const value = await runPooledArticle(session, FakeTensor, encoded, () => [0.25]);
  assert.deepEqual(value, [0.25]);
  assert.equal(made.length, 4);
  assert.ok(made.every(t => t.disposed));
  made.length = 0;
  session.run = async () => { throw new Error('fictional private error'); };
  await assert.rejects(runPooledArticle(session, FakeTensor, encoded),
    error => error instanceof InferenceStageError && error.code === 'SESSION_RUN');
  assert.equal(made.length, 3);
  assert.ok(made.every(t => t.disposed));
});
