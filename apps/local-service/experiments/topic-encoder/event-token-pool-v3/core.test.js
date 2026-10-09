import test from 'node:test';
import assert from 'node:assert/strict';
import { mineDynamicTriplets, fitDynamicAttention } from './core.js';

const DIM = 384;
function unit(a, b = null) {
  const state = new Float32Array(DIM);
  if (b === null) state[a] = 1;
  else { state[a] = Math.SQRT1_2; state[b] = Math.SQRT1_2; }
  return state;
}
function item(...states) {
  const combined = new Float32Array(states.length * DIM);
  states.forEach((state, i) => combined.set(state, i * DIM));
  return { count: states.length, states: combined };
}
function fictional() {
  const rows = [
    ['a0', 'event-a', 'family-a', 'en', item(unit(0))],
    ['a1', 'event-a', 'family-a', 'nl', item(unit(0))],
    ['b0', 'event-b', 'family-a', 'en', item(unit(0), unit(1))],
    ['b1', 'event-b', 'family-a', 'nl', item(unit(0, 1))],
    ['c0', 'event-c', 'family-b', 'en', item(unit(0))],
    ['c1', 'event-c', 'family-b', 'nl', item(unit(1))],
    ['d0', 'event-d', 'family-b', 'en', item(unit(0, 1))],
    ['d1', 'event-d', 'family-b', 'nl', item(unit(1))],
  ];
  return { documents: rows.map(([id, eventKey, family, lang]) =>
    ({ id, eventKey, categories: [family], lang })),
  tokens: new Map(rows.map(([id, , , , token]) => [id, token])) };
}

test('dynamic hard-negative selection responds to current attention weights', () => {
  const { documents, tokens } = fictional();
  const favorZero = new Float64Array(DIM), favorOne = new Float64Array(DIM);
  favorZero[0] = 1;
  favorOne[1] = 1;
  const first = mineDynamicTriplets(documents, tokens, favorZero);
  const second = mineDynamicTriplets(documents, tokens, favorOne);
  assert.equal(first.length, documents.length);
  assert.equal(first[0].positive, 'a1');
  assert.equal(first[0].familyNegative, 'b0');
  assert.equal(second[0].familyNegative, 'b1');
  assert.equal(first[0].outsideNegative, 'c0');
  assert.equal(second[0].outsideNegative, 'c0');
});

test('fixed 40-step dual-negative training is deterministic and RAM-only', () => {
  const { documents, tokens } = fictional();
  const first = fitDynamicAttention(documents, tokens);
  const second = fitDynamicAttention(documents, tokens);
  assert.equal(first.steps, 40);
  assert.equal(first.dynamicTripletsPerStep, 8);
  assert.equal(first.tripletLossesPerStep, 16);
  assert.deepEqual([...first.weights], [...second.weights]);
  assert.ok([...first.weights].every(Number.isFinite));
  assert.ok(Math.hypot(...first.weights) > 0);
});

test('missing cross-language positive or outside-family negative fails closed', () => {
  const { documents, tokens } = fictional();
  assert.throws(() => mineDynamicTriplets(documents.map((doc, i) => i === 1 ?
    { ...doc, lang: 'en' } : doc), tokens, new Float64Array(DIM)), /TRAIN_STRATA/u);
  assert.throws(() => mineDynamicTriplets(documents.map(doc =>
    ({ ...doc, categories: ['one-family'] })), tokens,
  new Float64Array(DIM)), /TRAIN_STRATA/u);
});
