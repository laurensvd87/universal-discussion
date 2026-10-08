import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { evaluateVectors, strictValidationThreshold } from './metrics.js';

const docs = [
  { id: 'a1', family: 'a', topicLabel: 'a1', viewpoint: 'for' },
  { id: 'a2', family: 'a', topicLabel: 'a1', viewpoint: 'against' },
  { id: 'b1', family: 'a', topicLabel: 'a2', viewpoint: 'for' },
  { id: 'b2', family: 'a', topicLabel: 'a2', viewpoint: 'against' },
];
const vectors = new Map([
  ['a1', Float32Array.of(1, 0)], ['a2', Float32Array.of(0.9, 0.1)],
  ['b1', Float32Array.of(0, 1)], ['b2', Float32Array.of(0.1, 0.9)],
]);

test('cross-view positives and hard negatives stay distinct', () => {
  const score = evaluateVectors(docs, vectors, 0.9);
  assert.equal(score.top1, 4);
  assert.equal(score.positives, 2);
  assert.equal(score.crossViewPositives, 2);
  assert.equal(score.hardNegatives, 4);
  assert.equal(score.correctPairs, 2);
  assert.equal(score.falsePairs, 0);
  assert.equal(score.matchedAbstained, 0);
  assert.equal(score.noMatchQueries, 0);
  assert(score.insertionOrders.every(order => order.correct === 2 && order.falseJoins === 0));
});

test('strict threshold comes only from validation negatives', () => {
  const threshold = strictValidationThreshold(docs, vectors);
  assert(threshold > evaluateVectors(docs, vectors).allNegativeMax);
  assert.equal(evaluateVectors(docs, vectors, threshold).falsePairs, 0);
});

test('loose identity threshold exposes hard joins across insertion orders', () => {
  const score = evaluateVectors(docs, vectors, 0.05);
  assert.equal(score.falsePairs, 3);
  assert.equal(score.hardFalsePairs, 3);
  assert(score.insertionOrders.some(order => order.falseJoins > 0));
});

test('invalid vectors and missing partners fail closed', () => {
  assert.throws(() => evaluateVectors(docs, new Map([['a1', [1, 0]]])));
  assert.equal(evaluateVectors(docs.slice(0, 3), vectors).noMatchQueries, 1);
  const wrongDimensions = new Map(vectors);
  wrongDimensions.set('b2', Float32Array.of(1, 2, 3));
  assert.throws(() => evaluateVectors(docs, wrongDimensions));
});

test('singleton no-match abstention is separate from matched-query outcomes', () => {
  const score = evaluateVectors(docs.slice(0, 3), vectors, 0.9);
  assert.equal(score.matchedQueries, 2);
  assert.equal(score.noMatchQueries, 1);
  assert.equal(score.noMatchAbstained, 1);
  assert.equal(score.top1, 2);
  assert.equal(score.matchedCorrect, 2);
});
