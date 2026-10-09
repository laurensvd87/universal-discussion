import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionTrain, first32TokenMap, attendedVectors, pooledResidual,
  chooseDevelopmentVariant } from './core.js';

const DIM = 384;
const unit = k => {
  const result = new Float64Array(DIM);
  result[k] = 1;
  return result;
};

test('whole-family partition uses only train families', () => {
  const rows = [];
  for (let family = 0; family < 8; family++) for (let event = 0; event < 2; event++)
    for (let i = 0; i < 10; i++) rows.push({ id: `fictional-${family}-${event}-${i}`,
      eventKey: `fictional-event-${family}-${event}`,
      categories: [`fictional-family-${family}`] });
  const { fit, calibration } = partitionTrain(rows);
  assert.equal(fit.length, 120);
  assert.equal(calibration.length, 40);
  assert.equal(new Set(fit.map(row => row.categories[0])).size, 6);
  assert.equal(new Set(calibration.map(row => row.categories[0])).size, 2);
  assert.ok(fit.every(row => !calibration.some(other =>
    row.categories[0] === other.categories[0])));
});

test('first32 truncates copied states without mutating full 64-token input', () => {
  const documents = [{ id: 'fictional-a' }, { id: 'fictional-b' }];
  const long = new Float32Array(64 * DIM), short = new Float32Array(7 * DIM);
  for (let i = 0; i < 64; i++) long[i * DIM + i] = 1;
  for (let i = 0; i < 7; i++) short[i * DIM + i] = 1;
  const source = new Map([['fictional-a', { count: 64, states: long }],
    ['fictional-b', { count: 7, states: short }]]);
  const reduced = first32TokenMap(documents, source);
  assert.equal(reduced.get('fictional-a').count, 32);
  assert.equal(reduced.get('fictional-a').states.length, 32 * DIM);
  assert.equal(reduced.get('fictional-b').count, 7);
  reduced.get('fictional-a').states[0] = 8;
  assert.equal(source.get('fictional-a').states[0], 1);
  assert.throws(() => first32TokenMap([{ id: 'missing' }], source), /TOKEN_STATES/u);
});

test('attention and fixed pooled residual each produce unit compact vectors', () => {
  const documents = [{ id: 'fictional-a' }];
  const token = new Float32Array(DIM);
  token[0] = 1;
  const tokens = new Map([['fictional-a', { count: 1, states: token }]]);
  const attention = attendedVectors(documents, tokens, new Float64Array(DIM));
  const pooled = new Map([['fictional-a', unit(1)]]);
  const residual = pooledResidual(documents, attention, pooled).get('fictional-a');
  assert.ok(Math.abs(Math.hypot(...residual) - 1) < 1e-12);
  assert.ok(Math.abs(residual[0] - 0.75 / Math.hypot(0.75, 0.25)) < 1e-12);
  assert.ok(Math.abs(residual[1] - 0.25 / Math.hypot(0.75, 0.25)) < 1e-12);
});

const report = (complete, trueEdges, falseEdges = 0, rank1 = 40) => ({
  abstained: false,
  denominators: { articles: 40, events: 4, truePairs: 180, falsePairs: 600,
    hardFalsePairs: 200, crossLanguageTruePairs: 160 },
  edgeMetrics: { trueEdges, falseEdges, crossLanguageTrueEdges: trueEdges },
  components: { completeEvents: complete, mixedGroups: falseEdges ? 1 : 0 },
  retrieval: { eligible: 40, rank1, top3: 40 },
});

test('development selection requires precision, retrieval parity and strict v1 gain', () => {
  assert.equal(chooseDevelopmentVariant({
    'prefix-attention-32': report(3, 135),
    'attention64-pooled25': report(4, 140, 1),
  }).selected, null);
  assert.equal(chooseDevelopmentVariant({
    'prefix-attention-32': report(4, 136, 0, 39),
    'attention64-pooled25': report(3, 136),
  }).selected, 'attention64-pooled25');
  assert.equal(chooseDevelopmentVariant({
    'prefix-attention-32': report(4, 135),
    'attention64-pooled25': report(3, 160),
  }).selected, 'prefix-attention-32');
});
