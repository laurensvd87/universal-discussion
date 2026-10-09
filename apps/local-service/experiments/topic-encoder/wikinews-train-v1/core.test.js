import test from 'node:test';
import assert from 'node:assert/strict';
import { fitMetric, freezeOnValidation, scoreFrozen, scoreRaw, normalize,
  validationCutoff } from './core.js';

const vector = (x, y) => {
  const item = new Float64Array(384);
  item[0] = x; item[1] = y;
  return item;
};
const doc = (id, eventKey, lang) =>
  ({ id, eventKey, lang, categories: ['world'], duplicateKey: id });
const train = [doc('a1', 'a', 'en'), doc('a2', 'a', 'de'),
  doc('b1', 'b', 'en'), doc('b2', 'b', 'fr')];
const validation = [doc('c1', 'c', 'en'), doc('c2', 'c', 'de'),
  doc('d1', 'd', 'en'), doc('d2', 'd', 'fr')];
const testDocs = [doc('e1', 'e', 'en'), doc('e2', 'e', 'de'),
  doc('f1', 'f', 'en'), doc('f2', 'f', 'fr')];
const vectors = new Map([
  ['a1', vector(1, 0)], ['a2', vector(.98, .02)],
  ['b1', vector(0, 1)], ['b2', vector(.02, .98)],
  ['c1', vector(1, 0)], ['c2', vector(.98, .02)],
  ['d1', vector(0, 1)], ['d2', vector(.02, .98)],
  ['e1', vector(1, 0)], ['e2', vector(.98, .02)],
  ['f1', vector(0, 1)], ['f2', vector(.02, .98)],
]);

test('learned metric and calibration use train/validation only', () => {
  const frozen = freezeOnValidation(train, validation, vectors);
  assert.equal(frozen.model.triplets, 4);
  assert.equal(frozen.candidates.length, 4);
  assert.equal(frozen.candidates[0].pairs.falseAdmitted, 0);
  assert.equal(frozen.selected.strength, 0); // Ties prefer identity.
  assert.equal(frozen.selected.pairs.trueAdmitted, 2);
  const test = scoreFrozen(testDocs, vectors, frozen.model, frozen.selected);
  assert.equal(test.pairAdmission.trueAdmitted, 2);
  assert.equal(test.pairAdmission.falseAdmitted, 0);
  assert.equal(test.wholeTopics.predictedGroups, 2);
  assert.equal(test.wholeTopics.falseJoined, 0);
  assert.equal(scoreRaw(testDocs, vectors, .94).wholeTopics.trueJoined, 2);
});

test('hard negative mining remains bounded when groups share broad categories', () => {
  const fitted = fitMetric(train, vectors);
  assert.equal(fitted.categoryTriplets, 4);
  assert.equal(fitted.weights.length, 384);
  assert.ok([...fitted.weights].every(value => value >= .5 && value <= 2));
  assert.throws(() => normalize(vector(0, 0)), /VECTOR/u);
});

test('identical conflicting event vectors force abstention during validation', () => {
  const conflict = new Map(validation.map(item => [item.id,
    item.id === 'd2' ? normalize(vector(1, 0)) : normalize(vectors.get(item.id))]));
  assert.equal(validationCutoff(validation, conflict), null);
});

test('all validation candidates may abstain without attempting held-out admission', () => {
  const conflicting = new Map(vectors);
  for (const item of validation) conflicting.set(item.id, vector(1, 0));
  const frozen = freezeOnValidation(train, validation, conflicting);
  assert.equal(frozen.selected, null);
  assert.ok(frozen.candidates.every(item => item.threshold === null && item.pairs === null));
  assert.equal(scoreFrozen(testDocs, vectors, frozen.model, frozen.selected), null);
});
