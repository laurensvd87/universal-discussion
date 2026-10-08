import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { topicInput, embedDocuments } from './e5-infer.js';

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
