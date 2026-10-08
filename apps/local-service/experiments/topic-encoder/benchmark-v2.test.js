import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePairScores, zeroFalseJoinThreshold } from './benchmark-v2.js';

const documents = [
  { id: 'a1', family: 'a', topicLabel: 'a1' }, { id: 'a2', family: 'a', topicLabel: 'a1' },
  { id: 'b1', family: 'a', topicLabel: 'a2' }, { id: 'b2', family: 'a', topicLabel: 'a2' },
];
const vectors = new Map(documents.map((document, index) => [document.id, index]));
const score = (left, _leftVector, right) => left.topicLabel === right.topicLabel ? 0.9 : 0.7;

test('validation chooses a zero-false-pair threshold without holdout labels', () => {
  const selection = zeroFalseJoinThreshold(documents, vectors, score);
  assert.equal(selection.validationAccepted, 2);
  assert.equal(selection.validationPositives, 2);
  assert.ok(selection.threshold > 0.7 && selection.threshold < 0.9);
});

test('retrieval, hard negatives and genuine no-match abstention are distinct', () => {
  const result = evaluatePairScores(documents, vectors, score, 0.8);
  assert.equal(result.recallAt1, 1);
  assert.equal(result.hardPairAuc, 1);
  assert.equal(result.positivePairsAccepted, 2);
  assert.equal(result.allFalsePairs, 0);
  assert.equal(result.matchedQueryRecall, 1);
  assert.equal(result.noMatchAbstention, 1);
  assert.throws(() => evaluatePairScores(documents, vectors, () => NaN), /Non-finite/);
});
