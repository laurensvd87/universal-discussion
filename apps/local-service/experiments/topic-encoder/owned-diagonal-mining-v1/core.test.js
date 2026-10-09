import test from 'node:test';
import assert from 'node:assert/strict';
import { mineComparisons, fitMultiDiagonal } from './core.js';

function fixture() {
  const rows = [], vectors = new Map();
  for (let family = 0; family < 6; family++)
    for (let event = 0; event < 3; event++)
      for (let report = 0; report < 6; report++) {
        const id = `f${family}e${event}r${report}`;
        rows.push({ id, family: `f${family}`, eventKey: `f${family}e${event}`,
          lang: ['en', 'nl', 'de', 'fr', 'es', 'en'][report] });
        const vector = new Float64Array(384);
        vector[0] = 1;
        vector[1 + family] = 0.12;
        vector[7 + family * 3 + event] = 0.16;
        vector[25 + report] = 0.04;
        vectors.set(id, vector);
      }
  return { rows, vectors };
}

test('multiple mined comparisons cover cross-language positives and both negative scopes', () => {
  const { rows, vectors } = fixture();
  const comparisons = mineComparisons(rows, vectors);
  assert.equal(comparisons.length, 108 * 6);
  const byId = new Map(rows.map(row => [row.id, row]));
  const first = comparisons.filter(item => item.anchor === rows[0].id);
  assert.equal(new Set(first.map(item => item.positive)).size, 2);
  assert.equal(new Set(first.map(item => item.negative)).size, 3);
  for (const item of first) {
    const anchor = byId.get(item.anchor), positive = byId.get(item.positive);
    const negative = byId.get(item.negative);
    assert.equal(positive.eventKey, anchor.eventKey);
    assert.notEqual(positive.lang, anchor.lang);
    assert.notEqual(negative.eventKey, anchor.eventKey);
  }
  assert.equal(new Set(first.map(item => byId.get(item.negative).family)).size, 2);
});

test('RAM-only fit is deterministic, bounded and rejects missing vectors', () => {
  const { rows, vectors } = fixture();
  const one = fitMultiDiagonal(rows, vectors);
  const two = fitMultiDiagonal(rows, vectors);
  assert.equal(one.steps, 40);
  assert.equal(one.remineRounds, 8);
  assert.equal(one.comparisonsPerRound, 648);
  assert.deepEqual(one.parameters, two.parameters);
  assert.ok([...one.parameters].some(value => value !== 0));
  assert.ok([...one.parameters].every(value => Number.isFinite(value) &&
    Math.abs(value) <= 0.5));
  vectors.delete(rows[0].id);
  assert.throws(() => mineComparisons(rows, vectors), /FIT_VECTOR/u);
});
