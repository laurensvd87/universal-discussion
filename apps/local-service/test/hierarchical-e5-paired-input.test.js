import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compilePairedE5Input, describePairedE5Input, applyPairedE5Input, PairedE5InputError }
  from '../src/domain/hierarchical-e5-paired-input.js';

// New analytic vectors only. No encoder, old experiment cohort or model request.
const hash = 'a'.repeat(64);
const axis = (i, sign = 1) => Array.from({ length: 384 }, (_, k) => k === i ? sign : 0);
const settings = (bodyWeight = 0.5, titleWeight = 0.5) => ({ bodyWeight, titleWeight, encoderHash: hash });
const sample = (bodyVector = axis(0), titleVector = axis(1)) => ({ sourceId: 'synthetic-source',
  sourceVersion: 'synthetic-capture-v1', bodyVector, titleVector });
const invalid = (fn, code = 'invalid-input') => assert.throws(fn, e => e instanceof PairedE5InputError && e.code === code);
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-14, `${a} versus ${b}`);

test('analytic orthogonal axes form the normalized weighted sum under a new immutable identity', () => {
  const handle = compilePairedE5Input(settings(0.75, 0.25));
  const result = applyPairedE5Input(handle, sample());
  assert.equal(result.status, 'available'); assert.equal(result.reason, null);
  close(result.vector[0], 3 / Math.sqrt(10)); close(result.vector[1], 1 / Math.sqrt(10));
  close(result.vector.reduce((sum, n) => sum + n * n, 0), 1);
  assert.equal(result.bodyTitleCosine, 0); assert.equal(result.experimental, true);
  assert.equal(result.productionValidated, false); assert.equal(result.sourceVersion, 'synthetic-capture-v1');
  assert.equal(result.representation, 'paired-raw-e5-body-title-v1'); assert.notEqual(result.representationHash, hash);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.vector));
});

test('both endpoints preserve every binary64 coordinate and signed zero without normalization', () => {
  const body = axis(0), title = axis(1); body[3] = -0; title[5] = -0;
  // Accepted input tolerance makes accidental endpoint normalization observable.
  body[0] = 0.999999; title[1] = 0.999998;
  for (const [weights, expected] of [[settings(1, 0), body], [settings(0, 1), title]]) {
    const result = applyPairedE5Input(compilePairedE5Input(weights), sample(body, title));
    assert.deepEqual(result.vector, expected); assert.notEqual(result.vector, expected);
    for (let i = 0; i < 384; i++) assert.equal(Object.is(result.vector[i], expected[i]), true);
  }
});

test('opposition is explicitly unavailable at balanced weights and never a topic fallback', () => {
  const handle = compilePairedE5Input(settings());
  const result = applyPairedE5Input(handle, sample(axis(0), axis(0, -1)));
  assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'zero-fused-norm');
  assert.equal(result.vector, null); assert.equal(result.bodyTitleCosine, -1);
  assert.equal(Object.hasOwn(result, 'topicId'), false);
  const tilted = applyPairedE5Input(compilePairedE5Input(settings(0.75, 0.25)), sample(axis(0), axis(0, -1)));
  assert.deepEqual(tilted.vector, axis(0));
});

test('max-scaled L2 preserves a tiny nonzero cancellation remainder instead of underflowing its norm', () => {
  const title = axis(0, -1); title[1] = 1e-300;
  const result = applyPairedE5Input(compilePairedE5Input(settings()), sample(axis(0), title));
  assert.equal(result.status, 'available'); assert.deepEqual(result.vector, axis(1));
});

test('definition and hash bind algorithm, endpoint rules, encoder identity and body/title field contracts', () => {
  const described = describePairedE5Input(compilePairedE5Input(settings()));
  const digest = createHash('sha256').update(JSON.stringify(described.definition)).digest('hex');
  assert.equal(described.representationHash, digest);
  assert.equal(described.definition.bodyContract.maxUtf16Units, 4096);
  assert.equal(described.definition.bodyContract.maxPrefixAndBodyTokenIds, 510);
  assert.equal(described.definition.titleContract.maxRetainedUtf16Units, 512);
  assert.equal(described.definition.titleContract.prefix, 'query: ');
  assert.ok(Object.isFrozen(described.definition.titleContract));
  assert.notEqual(describePairedE5Input(compilePairedE5Input(settings(0.75, 0.25))).representationHash, digest);
  assert.notEqual(describePairedE5Input(compilePairedE5Input({ ...settings(), encoderHash: 'b'.repeat(64) })).representationHash, digest);
  assert.deepEqual(describePairedE5Input(compilePairedE5Input(settings())), described);
  assert.equal(Object.keys(compilePairedE5Input(settings())).length, 0);
});

test('caller mutation does not change compiled settings or an earlier detached result', () => {
  const config = settings(), handle = compilePairedE5Input(config), input = sample();
  const before = applyPairedE5Input(handle, input), snapshot = structuredClone(before);
  config.bodyWeight = 1; config.titleWeight = 0; input.bodyVector.fill(0); input.titleVector.fill(0);
  assert.deepEqual(before, snapshot); assert.equal(describePairedE5Input(handle).definition.bodyWeight, 0.5);
  assert.throws(() => { before.vector[0] = 1; }, TypeError);
  assert.throws(() => { before.definition.titleContract.maxRetainedUtf16Units = 1024; }, TypeError);
  const repeat = applyPairedE5Input(handle, sample());
  assert.deepEqual(repeat, before); assert.notEqual(repeat.vector, before.vector);
});

test('weight validation is finite, bounded and exact, including equivalent zero-weight spelling', () => {
  for (const weights of [[0, 0], [1, 1], [-0.1, 1.1], [0.5, 0.499999999999],
    [NaN, 0], [Infinity, 0], ['0.5', 0.5], [null, 1]]) invalid(() => compilePairedE5Input(settings(...weights)));
  assert.equal(describePairedE5Input(compilePairedE5Input(settings(-0, 1))).representationHash,
    describePairedE5Input(compilePairedE5Input(settings(0, 1))).representationHash);
  for (const encoderHash of ['', 'A'.repeat(64), 'a'.repeat(63), null])
    invalid(() => compilePairedE5Input({ ...settings(), encoderHash }));
});

test('both vectors must remain valid at endpoints; no missing-title or invalid-body fallback', () => {
  const zero = Array(384).fill(0);
  invalid(() => applyPairedE5Input(compilePairedE5Input(settings(1, 0)), sample(axis(0), zero)));
  invalid(() => applyPairedE5Input(compilePairedE5Input(settings(0, 1)), sample(zero, axis(1))));
  const handle = compilePairedE5Input(settings());
  for (const badVector of [zero, axis(0).slice(1), new Float64Array(axis(0)),
    axis(0).map((n, i) => i === 3 ? NaN : n), axis(0).map((n, i) => i === 3 ? Infinity : n),
    axis(0).map((n, i) => i === 3 ? '0' : n)]) invalid(() => applyPairedE5Input(handle, sample(badVector)));
  invalid(() => applyPairedE5Input(handle, sample([...axis(0), 0])), 'capacity');
  const sparse = axis(0); delete sparse[2]; invalid(() => applyPairedE5Input(handle, sample(sparse)));
});

test('exact schemas and data descriptors reject proxies/getters without executing them', () => {
  let touched = 0; const poison = () => { touched++; throw Error('Hostile trap'); };
  invalid(() => compilePairedE5Input(new Proxy(settings(), { getPrototypeOf: poison, ownKeys: poison })));
  const config = settings(); Object.defineProperty(config, 'bodyWeight', { enumerable: true, get: poison });
  invalid(() => compilePairedE5Input(config));
  invalid(() => compilePairedE5Input({ ...settings(), titleText: 'not part of this vector-only API' }));
  const handle = compilePairedE5Input(settings()), input = sample();
  Object.defineProperty(input.bodyVector, '2', { enumerable: true, get: poison });
  invalid(() => applyPairedE5Input(handle, input));
  invalid(() => applyPairedE5Input(handle, sample(new Proxy(axis(0), { get: poison }))));
  const symbol = sample(); symbol[Symbol('extra')] = 1; invalid(() => applyPairedE5Input(handle, symbol));
  invalid(() => applyPairedE5Input({}, sample()));
  invalid(() => describePairedE5Input({}));
  assert.equal(touched, 0);
});

test('Source witness strings are bounded by UTF-16 units and are copied without coercion', () => {
  const handle = compilePairedE5Input(settings());
  for (const sourceId of ['', ' spaces ', 'line\nbreak', 1, null]) invalid(() => applyPairedE5Input(handle, { ...sample(), sourceId }));
  invalid(() => applyPairedE5Input(handle, { ...sample(), sourceId: '😀'.repeat(81) }), 'capacity');
  const sourceId = '😀'.repeat(80);
  assert.equal(applyPairedE5Input(handle, { ...sample(), sourceId }).sourceId, sourceId);
});
