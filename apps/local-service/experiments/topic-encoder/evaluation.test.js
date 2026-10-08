import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holdout } from './data/holdout.js';
import { HOLDOUT_DIGEST, digestDocuments, evaluateHoldout, validateHoldout } from './evaluation.js';

const labels = [...new Set(holdout.documents.map(d => d.topicLabel))];
const families = [...new Set(holdout.documents.map(d => d.family))];
const oneHot = (index, count) => Array.from({ length: count }, (_, i) => i === index ? 1 : 0);

test('holdout has a frozen digest and independent families', () => {
  assert.equal(validateHoldout(), holdout);
  assert.equal(digestDocuments(holdout.documents), HOLDOUT_DIGEST);
  assert.equal(holdout.documents.length, 36);
  assert.equal(holdout.freshFamilies.length, 6);
  assert.ok(holdout.freshFamilies.every(family => !holdout.legacyFamilies.includes(family)));
  assert.throws(() => validateHoldout({ ...holdout, documents: holdout.documents.slice(1) }), /Invalid holdout/);
});

test('metric suite distinguishes topic retrieval from coarse family similarity', () => {
  const topicVectors = Object.fromEntries(holdout.documents.map(d =>
    [d.id, oneHot(labels.indexOf(d.topicLabel), labels.length)]));
  const exact = evaluateHoldout({ vectors: topicVectors, threshold: 0.8 });
  assert.equal(exact.viewpointRecallAt1, 1);
  assert.equal(exact.pairwiseHardAuc, 1);
  assert.equal(exact.falseJoinPairs, 0);
  assert.equal(exact.missedSameTopicPairs, 0);
  assert.equal(exact.noMatchAbstentionRate, 1);
  assert.equal(exact.matchedQueryAbstentionRate, 0);
  assert.equal(exact.matchedQueryRecallAtThreshold, 1);
  assert.ok(exact.orders.every(order => order.falseJoins === 0 && order.missedPositivePairs === 0));

  const familyVectors = Object.fromEntries(holdout.documents.map(d =>
    [d.id, oneHot(families.indexOf(d.family), families.length)]));
  const coarse = evaluateHoldout({ vectors: familyVectors, threshold: 0.8 });
  assert.equal(coarse.pairwiseHardAuc, 0.5);
  assert.equal(coarse.hardFalseJoinPairs, 36);
  assert.ok(coarse.orders.every(order => order.falseJoins > 0));
  assert.equal(coarse.noMatchAbstentionRate, 0);
  assert.equal(coarse.matchedQueryRecallAtThreshold, 0.5);
});

test('vector map and threshold-free evaluation are supported', () => {
  const vectors = Object.fromEntries(holdout.documents.map(d =>
    [d.id, oneHot(labels.indexOf(d.topicLabel), labels.length)]));
  const result = evaluateHoldout({ vectors, vectorMap: vector => Float32Array.from(vector, value => value * 4) });
  assert.equal(result.viewpointRecallAt5, 1);
  assert.equal(result.threshold, undefined);
  assert.equal(result.orders, undefined);
  assert.throws(() => evaluateHoldout({ vectors: { ...vectors, [holdout.documents[0].id]: [NaN] } }), /Invalid vector/);
  const english = evaluateHoldout({ vectors, slice: 'fresh', threshold: 0.8 });
  assert.equal(english.documentCount, 24);
  assert.equal(english.sameTopicPairs, 12);
  assert.equal(english.noMatchAbstentionRate, 1);
  assert.equal(english.matchedQueryRecallAtThreshold, 1);
});
