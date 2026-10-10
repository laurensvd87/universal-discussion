import assert from 'node:assert/strict';
import test from 'node:test';
import { makeBodyTopicMetric, createBodyTopicMetricTransform, readBodyTopicMetric } from '../src/domain/body-topic-metric.js';

const fixture = () => {
  const mean = Array(384).fill(0), lower = new Float64Array(384 ** 2);
  for (let row = 0; row < 384; row++) lower[row * 384 + row] = 0.5;
  return { mean, lower };
};

test('Trust: packed last-row coupling follows an independently calculated triangular solve', () => {
  const metric = fixture();
  metric.lower[383 * 384] = 0.2;
  const artifact = makeBodyTopicMetric(metric);
  assert.equal(artifact.lower[73536], 0.2);
  assert.equal(artifact.lower[73919], 0.5);
  const source = Array(384).fill(0); source[0] = 1 + 5e-6;
  const output = createBodyTopicMetricTransform(artifact)(source);
  // Solve L*y=e0: y0=2 and y383=-(0.2*2)/0.5=-0.8.
  const length = Math.hypot(2, -0.8);
  assert.ok(Math.abs(output[0] - 2 / length) < 1e-14);
  assert.ok(Math.abs(output[383] + 0.8 / length) < 1e-14);
  for (let coordinate = 1; coordinate < 383; coordinate++) assert.equal(output[coordinate], 0);
  assert.equal(source[0], 1 + 5e-6);
});

test('Trust: artifact constructors reject hostile input descriptors and proxies without invoking user code', () => {
  let calls = 0;
  const metric = fixture();
  const hostile = { lower: metric.lower };
  Object.defineProperty(hostile, 'mean', { enumerable: true, get() { calls++; return metric.mean; } });
  assert.throws(() => makeBodyTopicMetric(hostile), TypeError);
  const proxy = new Proxy(metric, { ownKeys() { calls++; return []; }, getPrototypeOf() { calls++; return Object.prototype; } });
  assert.throws(() => makeBodyTopicMetric(proxy), TypeError);
  const arrays = fixture();
  Object.defineProperty(arrays.mean, 'toJSON', { get() { calls++; return () => []; } });
  assert.throws(() => makeBodyTopicMetric(arrays), TypeError);
  const artifact = JSON.parse(JSON.stringify(makeBodyTopicMetric(metric)));
  const trapped = new Proxy(artifact.lower, { ownKeys() { calls++; return []; }, get() { calls++; return 0; } });
  artifact.lower = trapped;
  assert.throws(() => readBodyTopicMetric(artifact), TypeError);
  assert.equal(calls, 0);
});

test('Trust: separate closures preserve their private coefficients after callers replace every artifact field', () => {
  const metric = fixture();
  const artifact = JSON.parse(JSON.stringify(makeBodyTopicMetric(metric)));
  const transform = createBodyTopicMetricTransform(artifact);
  const source = Array(384).fill(0); source[80] = 1;
  const prior = transform(source);
  for (const key of Object.keys(artifact)) artifact[key] = null;
  assert.deepEqual(transform(source), prior);
  assert.equal(Object.isFrozen(transform), true);
  assert.equal(Object.isFrozen(prior), true);
  assert.equal(Object.getOwnPropertySymbols(transform).length, 0);
  assert.equal(Object.keys(transform).length, 0);
});
