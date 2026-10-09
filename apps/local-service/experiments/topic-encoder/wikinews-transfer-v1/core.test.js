import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTransfer } from './core.js';

const vector = (first, second) => Float64Array.from({ length: 384 }, (_, index) =>
  index === 0 ? first : index === 1 ? second : 0);
const documents = [
  { id: 'a', eventKey: 'one', lang: 'en', categories: ['family'], duplicateKey: 'a' },
  { id: 'b', eventKey: 'one', lang: 'nl', categories: ['family'], duplicateKey: 'b' },
  { id: 'c', eventKey: 'two', lang: 'de', categories: ['family'], duplicateKey: 'c' },
];
const vectors = new Map([
  ['a', vector(1, 0)], ['b', vector(0.96, 0.28)], ['c', vector(0, 1)],
]);

test('frozen metrics recover only the exact gold group and count hard negatives', () => {
  const frozen = { rawThreshold: 0.9,
    model: { weights: Float64Array.from({ length: 384 }, () => 1) },
    selected: { strength: 0, threshold: 0.9 } };
  const result = evaluateTransfer(documents, vectors, frozen);
  for (const rule of Object.values(result)) {
    assert.equal(rule.pairAdmission.trueAdmitted, 1);
    assert.equal(rule.pairAdmission.falseAdmitted, 0);
    assert.equal(rule.wholeTopics.trueJoined, 1);
    assert.equal(rule.wholeTopics.falseJoined, 0);
    assert.equal(rule.wholeTopics.hardFalseTotal, 2);
    assert.equal(rule.exactGoldTopics, 2);
  }
});

test('an unusable wiki validation cutoff explicitly abstains on transfer', () => {
  const frozen = { rawThreshold: null, model: { weights: new Float64Array(384) },
    selected: null };
  const result = evaluateTransfer(documents, vectors, frozen);
  assert.equal(result.rawWikiCalibrated.abstained, true);
  assert.equal(result.learnedWikiCalibrated.abstained, true);
  assert.equal(result.fixed094.wholeTopics.trueJoined, 1);
});

test('a false whole-topic join cannot count as an exact recovered topic', () => {
  const crowded = new Map(vectors);
  crowded.set('c', vector(0.98, 0.2));
  const frozen = { rawThreshold: 0.9, model: { weights: Float64Array.from(
    { length: 384 }, () => 1) }, selected: { strength: 0, threshold: 0.9 } };
  const result = evaluateTransfer(documents, crowded, frozen).rawWikiCalibrated;
  assert.equal(result.wholeTopics.falseJoined, 2);
  assert.equal(result.exactGoldTopics, 0);
});
