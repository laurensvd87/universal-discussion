import assert from 'node:assert/strict';
import test from 'node:test';
import { blendVector, comparePairVectors, cosine, TITLE_BLEND_WEIGHTS } from './title-vector-core.js';

const vector = (a, b = 0) => [a, b, ...Array(382).fill(0)];

test('only four predeclared weights are accepted', () => {
  assert.deepEqual(TITLE_BLEND_WEIGHTS, [0, 0.25, 0.5, 1]);
  assert.throws(() => blendVector(vector(1), vector(0, 1), 0.75), TypeError);
});

test('endpoints preserve their own normalized vector', () => {
  assert.equal(cosine(blendVector(vector(1), vector(0, 1), 0), vector(1)), 1);
  assert.equal(cosine(blendVector(vector(1), vector(0, 1), 1), vector(0, 1)), 1);
});

test('pair scores are symmetric, bounded and body-only equals original body cosine', () => {
  const a = { body: vector(1), title: vector(0, 1) };
  const b = { body: vector(0.8, 0.6), title: vector(1) };
  const forward = comparePairVectors(a, b), reverse = comparePairVectors(b, a);
  assert.deepEqual(forward, reverse);
  assert.ok(Math.abs(forward.body - 0.8) < 1e-12);
  assert.ok(Object.values(forward).every(score => score >= -1 && score <= 1));
});

test('opposing vectors fail closed on a zero midpoint', () => {
  assert.throws(() => blendVector(vector(1), vector(-1), 0.5), TypeError);
});
