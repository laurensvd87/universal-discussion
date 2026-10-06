import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { corpus } from '../topic-identity/corpus.js';
import { digest } from '../topic-identity/evaluate.js';
import { DIMENSIONS, embed, similarity, train } from './model.js';

test('trained embedding is bounded, normalized and deterministic', () => {
  const development = corpus.documents.filter(d => corpus.split.development.includes(d.family));
  const first = train(development), second = train(development);
  assert.deepEqual([...first.weights], [...second.weights]);
  assert.equal(first.trainingDocuments, 20);
  assert.equal(first.positivePairs, 10);
  assert.equal(first.hardNegativePairs, 20);
  assert.ok([...first.weights].every(value => value >= Math.exp(-1) && value <= Math.exp(1)));
  const vector = embed(corpus.documents[0], first);
  assert.equal(vector.length, DIMENSIONS);
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-10);
  assert.ok(Math.abs(similarity(vector, vector) - 1) < 1e-10);
});

test('holdout labels are never needed to embed', () => {
  const development = corpus.documents.filter(d => corpus.split.development.includes(d.family));
  const model = train(development);
  const source = corpus.documents.find(d => corpus.split.heldOut.includes(d.family));
  assert.deepEqual([...embed(source, model)], [...embed({ title: source.title, body: source.body }, model)]);
  assert.throws(() => embed({ title: '', body: 'x'.repeat(4097) }, model));
});

test('frozen held-out rank-one result remains a negative finding', () => {
  assert.equal(digest(corpus), '0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950');
  const development = corpus.documents.filter(d => corpus.split.development.includes(d.family));
  const heldOut = corpus.documents.filter(d => corpus.split.heldOut.includes(d.family));
  const model = train(development);
  const rankOne = learned => {
    const vectors = new Map(heldOut.map(d => [d.id, embed(d, model, learned)]));
    return heldOut.filter(doc => {
      const nearest = heldOut.filter(other => other.id !== doc.id)
        .sort((a, b) => similarity(vectors.get(doc.id), vectors.get(b.id)) -
          similarity(vectors.get(doc.id), vectors.get(a.id)) || a.id.localeCompare(b.id))[0];
      return nearest.topicLabel === doc.topicLabel;
    }).length;
  };
  // Post-measurement regression, not independent validation of general quality.
  assert.deepEqual([rankOne(false), rankOne(true)], [5, 5]);
});
