import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTrainEvents, omitConflictingInputs, normalizeVectors, transform,
  tripletObjective, mineTriplets, fitDiagonal } from './core.js';

const DIM = 384;
const unit = (x, y) => {
  const vector = new Float64Array(DIM);
  vector[0] = x; vector[1] = y;
  const norm = Math.hypot(x, y);
  return Float64Array.from(vector, value => value / norm);
};

test('event partition remains whole and conflicting exact inputs leave fitting', () => {
  const rows = Array.from({ length: 749 }, (_, i) => ({ id: `d${i}`,
    eventKey: `e${Math.floor(i / 5)}`, duplicateKey: `x${i}` }));
  rows[0].duplicateKey = rows[5].duplicateKey;
  const { fit, calibration } = splitTrainEvents(rows);
  assert.equal(fit.length + calibration.length, 749);
  assert.equal(new Set(fit.map(row => row.eventKey))
    .intersection(new Set(calibration.map(row => row.eventKey))).size, 0);
  const clean = omitConflictingInputs(rows);
  assert.equal(clean.excluded, 2);
  assert.equal(clean.rows.length, 747);
});

test('diagonal cosine gradient agrees with central finite difference', () => {
  const a = unit(0.8, 0.6), p = unit(0.9, 0.44), n = unit(0.3, 0.95);
  const rows = [{ id: 'a' }, { id: 'p' }, { id: 'n' }];
  const vectors = new Map([['a', a], ['p', p], ['n', n]]);
  const lossAt = value => {
    const s = new Float64Array(DIM); s[0] = value;
    const mapped = transform(rows, vectors, s);
    return tripletObjective(mapped.get('a'), mapped.get('p'), mapped.get('n')).loss;
  };
  const h = 1e-5;
  const numeric = (lossAt(h) - lossAt(-h)) / (2 * h);
  const analytic = tripletObjective(a, p, n).gradient[0];
  assert.ok(Math.abs(numeric - analytic) < 1e-6);
});

test('training is deterministic, bounded, and mines cross-language positives', () => {
  const rows = [], vectors = new Map();
  for (let event = 0; event < 25; event++) for (let language = 0; language < 5; language++) {
    const id = `e${event}-${language}`;
    rows.push({ id, eventKey: `e${event}`, category: `c${event % 3}`,
      lang: ['en', 'fr', 'de', 'nl', 'es'][language] });
    vectors.set(id, unit(0.3 + event / 50, 0.2 + language / 50));
  }
  const normalized = normalizeVectors(rows, vectors);
  const triplets = mineTriplets(rows, normalized);
  assert.equal(triplets.length, rows.length);
  const first = fitDiagonal(rows, vectors), second = fitDiagonal(rows, vectors);
  assert.equal(first.steps, 40);
  assert.deepEqual(first.parameters, second.parameters);
  assert.ok([...first.parameters].every(value => Number.isFinite(value) && Math.abs(value) <= 0.5));
});
