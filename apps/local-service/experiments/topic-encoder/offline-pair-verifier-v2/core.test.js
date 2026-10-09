import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../offline-pair-verifier-v1/core.js';
import { pairFeatures, fitVerifier, verifierScore } from './core.js';

const basis = index => {
  const vector = new Float64Array(384);
  vector[index] = 1;
  return normalize(vector);
};
const fixture = () => {
  const docs = [
    { id: 'a1', eventKey: 'a', categories: ['family'] },
    { id: 'a2', eventKey: 'a', categories: ['family'] },
    { id: 'b1', eventKey: 'b', categories: ['family'] },
    { id: 'b2', eventKey: 'b', categories: ['family'] },
  ];
  return { docs, vectors: new Map(docs.map((doc, i) => [doc.id, basis(i < 2 ? 0 : 1)])) };
};

test('769 full-coordinate features are symmetric and retain coordinate identity', () => {
  const a = basis(0), b = basis(1);
  const forward = pairFeatures(a, b), reverse = pairFeatures(b, a);
  assert.equal(forward.length, 769);
  assert.deepEqual([...forward], [...reverse]);
  assert.equal(forward[1], 1);
  assert.equal(forward[2], 1);
  assert.equal(forward[385], 0);
});

test('full-coordinate logistic fit is deterministic, symmetric and train-only', () => {
  const { docs, vectors } = fixture();
  const first = fitVerifier(docs, vectors), second = fitVerifier(docs, vectors);
  assert.deepEqual(first.trainCounts, { positives: 2, hardNegatives: 4 });
  assert.deepEqual([...first.weights], [...second.weights]);
  assert.equal(verifierScore(first, vectors.get('a1'), vectors.get('b1')),
    verifierScore(first, vectors.get('b1'), vectors.get('a1')));
  assert.ok(verifierScore(first, vectors.get('a1'), vectors.get('a2')) >
    verifierScore(first, vectors.get('a1'), vectors.get('b1')));
});

test('unrelated-family negatives are not mislabeled as hard negatives', () => {
  const { docs, vectors } = fixture();
  docs[3].categories = ['unrelated'];
  const model = fitVerifier(docs, vectors);
  assert.deepEqual(model.trainCounts, { positives: 2, hardNegatives: 2 });
});
