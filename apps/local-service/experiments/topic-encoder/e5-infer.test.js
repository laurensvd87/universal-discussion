import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { topicInput, embedDocuments, embedDocumentsWithTokens, copyContentTokenStates,
  runPooledArticle, InferenceStageError } from './e5-infer.js';

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

test('bounded token states skip BOS/query/EOS and are copied before disposal', async () => {
  const encoded = { ids: [0, 71, 72, 42, 2], attention_mask: [1, 1, 1, 1, 1],
    token_type_ids: [0, 0, 0, 0, 0] };
  const data = new Float32Array(5 * 384);
  data[3 * 384] = 0.75;
  const hidden = { dims: [1, 5, 384], data, disposed: false,
    dispose() { this.disposed = true; data.fill(0); } };
  const states = copyContentTokenStates(hidden, encoded, [71, 72]);
  assert.equal(states.count, 1);
  assert.equal(states.states[0], 0.75);
  data[3 * 384] = 0.5;
  assert.equal(states.states[0], 0.75);
  assert.throws(() => copyContentTokenStates(hidden, encoded, [71, 73]), /Invalid/);
  class FakeTensor { constructor() { this.disposed = false; } dispose() { this.disposed = true; } }
  const session = { inputNames: ['input_ids', 'attention_mask', 'token_type_ids'],
    run: async () => ({ last_hidden_state: hidden }) };
  const result = await runPooledArticle(session, FakeTensor, encoded, () => [0.25],
    (output, input) => copyContentTokenStates(output, input, [71, 72]));
  assert.equal(result.tokenStates.states[0], 0.5);
  assert.equal(hidden.disposed, true);
  assert.equal(result.tokenStates.states[0], 0.5);
  assert.deepEqual(result.vector, [0.25]);
  const secondData = new Float32Array(5 * 384);
  const secondHidden = { dims: [1, 5, 384], data: secondData, disposed: false,
    dispose() { this.disposed = true; } };
  session.run = async () => ({ last_hidden_state: secondHidden });
  await assert.rejects(runPooledArticle(session, FakeTensor, encoded, () => [0.25],
    (output, input) => copyContentTokenStates(output, input, [71, 73])),
  error => error instanceof InferenceStageError && error.code === 'TOKEN_STATES');
  assert.equal(secondHidden.disposed, true);
});

test('content-token copy is capped at 64 positions', () => {
  const encoded = { ids: [0, 71, 72, ...Array(70).fill(42), 2] };
  const hidden = { dims: [1, encoded.ids.length, 384],
    data: new Float32Array(encoded.ids.length * 384) };
  const result = copyContentTokenStates(hidden, encoded, [71, 72]);
  assert.equal(result.count, 64);
  assert.equal(result.states.byteLength, 64 * 384 * 4);
  const oversized = { ids: [0, 71, 72, ...Array(510).fill(42), 2] };
  const oversizedHidden = { dims: [1, oversized.ids.length, 384],
    data: new Float32Array(oversized.ids.length * 384) };
  assert.throws(() => copyContentTokenStates(oversizedHidden, oversized, [71, 72]),
    /Invalid token-state contract/);
});

test('packaged E5 fictional token extraction returns bounded copied states', async () => {
  const { vectors, tokenStates } = await embedDocumentsWithTokens([
    { id: 'fictional', title: 'Imaginary ferry access decision',
      body: 'An invented cooperative changed one ferry ramp schedule.' },
  ]);
  assert.equal(vectors.get('fictional').length, 384);
  const copied = tokenStates.get('fictional');
  assert.ok(copied.count >= 1 && copied.count <= 64);
  assert.equal(copied.states.length, copied.count * 384);
  assert.ok([...copied.states].every(Number.isFinite));
});
