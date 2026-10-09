import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedTokenMap, attend, tripletObjective, mineStaticTriplets,
  fitAttention, eventVectors, maxNegativeCutoff } from './core.js';

const DIM = 384;
const tokenPack = values => {
  const states = new Float32Array(values.length * DIM);
  values.forEach(([x, y, z], i) => {
    states[i * DIM] = x;
    states[i * DIM + 1] = y;
    states[i * DIM + 2] = z;
  });
  return { states, count: values.length };
};
const fixture = () => {
  const docs = [
    { id: 'a-en', eventKey: 'a', categories: ['family'], lang: 'en' },
    { id: 'a-fr', eventKey: 'a', categories: ['family'], lang: 'fr' },
    { id: 'b-en', eventKey: 'b', categories: ['family'], lang: 'en' },
    { id: 'b-fr', eventKey: 'b', categories: ['family'], lang: 'fr' },
  ];
  const copied = new Map([
    ['a-en', tokenPack([[1, 0.2, 0.1], [0.2, 1, 0.1]])],
    ['a-fr', tokenPack([[0.9, 0.3, 0.1], [0.1, 1, 0.2]])],
    ['b-en', tokenPack([[0.1, 0.2, 1], [0.2, 1, 0.1]])],
    ['b-fr', tokenPack([[0.2, 0.1, 1], [0.1, 1, 0.3]])],
  ]);
  const pooled = new Map([
    ['a-en', [1, 0, ...Array(DIM - 2).fill(0)]],
    ['a-fr', [0.9, 0.1, ...Array(DIM - 2).fill(0)]],
    ['b-en', [0, 1, ...Array(DIM - 2).fill(0)]],
    ['b-fr', [0.1, 0.9, ...Array(DIM - 2).fill(0)]],
  ]);
  return { docs, tokens: normalizedTokenMap(docs, copied), pooled };
};

test('bounded token normalization and attention produce a unit vector', () => {
  const { docs, tokens } = fixture();
  const result = attend(tokens.get(docs[0].id), new Float64Array(DIM));
  assert.ok(Math.abs(Math.hypot(...result.vector) - 1) < 1e-9);
  assert.equal(result.alpha.length, 2);
  assert.ok(Math.abs(result.alpha[0] - 0.5) < 1e-12);
});

test('analytic attention triplet gradient matches finite difference on fictional states', () => {
  const { tokens } = fixture();
  const weights = new Float64Array(DIM);
  weights[0] = 0.11; weights[1] = -0.07; weights[2] = 0.03;
  const args = [tokens.get('a-en'), tokens.get('a-fr'), tokens.get('b-en')];
  const { gradient } = tripletObjective(...args, weights);
  for (const k of [0, 1, 2]) {
    const epsilon = 1e-5;
    weights[k] += epsilon;
    const plus = tripletObjective(...args, weights).loss;
    weights[k] -= 2 * epsilon;
    const minus = tripletObjective(...args, weights).loss;
    weights[k] += epsilon;
    assert.ok(Math.abs(gradient[k] - (plus - minus) / (2 * epsilon)) < 2e-4);
  }
});

test('static triplets use cross-language positives and same-family negatives', () => {
  const { docs, pooled } = fixture();
  const triplets = mineStaticTriplets(docs, pooled);
  assert.equal(triplets.length, 4);
  for (const item of triplets) {
    const a = docs.find(doc => doc.id === item.anchor);
    const p = docs.find(doc => doc.id === item.positive);
    const n = docs.find(doc => doc.id === item.negative);
    assert.equal(a.eventKey, p.eventKey);
    assert.notEqual(a.lang, p.lang);
    assert.notEqual(a.eventKey, n.eventKey);
    assert.equal(a.categories[0], n.categories[0]);
  }
});

test('fixed training is deterministic and calibration abstains above one', () => {
  const { docs, tokens, pooled } = fixture();
  const first = fitAttention(docs, pooled, tokens);
  const second = fitAttention(docs, pooled, tokens);
  assert.deepEqual([...first.weights], [...second.weights]);
  const vectors = eventVectors(docs, tokens, first.weights);
  assert.equal(vectors.size, 4);
  const identical = new Map(docs.map(doc => [doc.id, Float64Array.from({ length: DIM },
    (_, k) => k === 0 ? 1 : 0)]));
  assert.equal(maxNegativeCutoff(docs, identical), null);
});
