import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, pairFeatures, fitVerifier, verifierScore,
  developmentCutoff, evaluatePairs } from './core.js';

const basis = (first, second = 0) => {
  const result = new Float64Array(384);
  result[first] = 1;
  if (second) result[second] = 0.2;
  return normalize(result);
};
const make = (prefix, category) => [
  { id: `${prefix}1`, eventKey: `${prefix}A`, categories: [category], lang: 'en' },
  { id: `${prefix}2`, eventKey: `${prefix}A`, categories: [category], lang: 'fr' },
  { id: `${prefix}3`, eventKey: `${prefix}B`, categories: [category], lang: 'en' },
  { id: `${prefix}4`, eventKey: `${prefix}B`, categories: [category], lang: 'de' },
];
const mapped = docs => new Map(docs.map((doc, i) => [doc.id,
  i < 2 ? basis(0, i) : basis(1, i)]));

test('fixed feature extraction and verifier are symmetric', () => {
  const wiki = make('w', 'news'), synthetic = make('s', 'fiction');
  const w = mapped(wiki), s = mapped(synthetic);
  assert.deepEqual([...pairFeatures(w.get('w1'), w.get('w3'))],
    [...pairFeatures(w.get('w3'), w.get('w1'))]);
  const model = fitVerifier(wiki, synthetic, w, s);
  assert.equal(verifierScore(model, w.get('w1'), w.get('w3')),
    verifierScore(model, w.get('w3'), w.get('w1')));
  assert.deepEqual(model.trainCounts, [2, 3, 2, 4]);
});

test('fixed training is deterministic and does not need test records', () => {
  const wiki = make('w', 'news'), synthetic = make('s', 'fiction');
  const w = mapped(wiki), s = mapped(synthetic);
  const first = fitVerifier(wiki, synthetic, w, s);
  const second = fitVerifier(wiki, synthetic, w, s);
  assert.deepEqual([...first.parameters], [...second.parameters]);
});

test('impossible zero-false validation gate abstains', () => {
  const docs = make('x', 'fiction');
  const vectors = new Map(docs.map(doc => [doc.id, basis(0)]));
  const threshold = developmentCutoff([docs], [vectors], () => 1);
  assert.equal(threshold, null);
  const result = evaluatePairs(docs, vectors, () => 1, threshold);
  assert.equal(result.abstained, true);
  assert.equal(result.pair.trueAdmitted, 0);
  assert.equal(result.topics.groups, 4);
});

test('aggregate pair and complete-link group metrics separate hard false joins', () => {
  const docs = make('x', 'same-family');
  const vectors = mapped(docs);
  const result = evaluatePairs(docs, vectors, (a, b) => pairFeatures(a, b)[0], 0.9);
  assert.equal(result.pair.trueTotal, 2);
  assert.equal(result.pair.falseTotal, 4);
  assert.equal(result.pair.hardFalseTotal, 4);
  assert.equal(result.pair.crossLanguageTrueTotal, 2);
  assert.equal(result.topics.completeEvents, 2);
  assert.equal(result.topics.joinedFalse, 0);
});
