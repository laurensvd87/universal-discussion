import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, unlink, rmdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BODY_METRIC_MAX_BYTES, BODY_METRIC_PACKED_LENGTH, createBodyTopicMetricTransform,
  loadBodyTopicMetric, makeBodyTopicMetric, readBodyTopicMetric } from '../src/domain/body-topic-metric.js';
import { covarianceFit, makeMetric, metricVector, unit } from '../experiments/topic-encoder/topic-metric-rethink-v1/core.js';

const rows = Array.from({ length: 16 }, (_, i) => ({ id: `fictional-${i}`, eventKey: `invented-event-${i >> 2}` }));
const vectors = new Map(rows.map((row, i) => [row.id, unit(Array.from({ length: 384 }, (_, k) =>
  Math.sin((k + 1) * (i + 1) / 43) + 0.3 * Math.cos((k + 1) * ((i >> 2) + 1) / 7)))]));
const research = makeMetric(covarianceFit(rows, vectors), 'within-shrink-50');
const artifact = makeBodyTopicMetric({ mean: research.mean, lower: research.lower });
const clone = () => JSON.parse(JSON.stringify(artifact));
const rehash = value => {
  const { manifestSha256, ...fields } = value;
  value.manifestSha256 = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  return value;
};

test('BODY packed metric agrees with frozen pure research transform on fictional fit', () => {
  assert.equal(artifact.lower.length, BODY_METRIC_PACKED_LENGTH);
  const transform = createBodyTopicMetricTransform(artifact);
  for (const vector of vectors.values()) {
    const prior = Array.from(vector), actual = transform(vector), expected = metricVector(vector, research);
    for (let k = 0; k < 384; k++) assert.ok(Math.abs(actual[k] - expected[k]) < 1e-12);
    assert.deepEqual(Array.from(vector), prior);
    assert.ok(Math.abs(Math.hypot(...actual) - 1) < 1e-12);
    assert.ok(Object.isFrozen(actual));
  }
});

test('BODY artifact copies arrays, freezes everything and closure isolates later caller mutation', () => {
  assert.ok(Object.isFrozen(artifact) && Object.isFrozen(artifact.mean) && Object.isFrozen(artifact.lower));
  assert.throws(() => { artifact.lower[0] = 0; }, TypeError);
  const mutable = clone(), transform = createBodyTopicMetricTransform(mutable), vector = [...vectors.values()][0];
  const prior = transform(vector);
  mutable.lower.fill(0); mutable.mean.fill(1); mutable.manifestSha256 = '0'.repeat(64);
  assert.deepEqual(transform(vector), prior);
  const mean = Float64Array.from(research.mean), lower = Float64Array.from(research.lower);
  const result = makeBodyTopicMetric({ mean, lower });
  mean.fill(1); lower.fill(0);
  assert.deepEqual(result, artifact);
  assert.deepEqual(Object.keys(transform), []);
});

test('BODY strict schema pins model, tokenizer, BODY source fit and frozen protocol', () => {
  for (const key of ['schema', 'dimensions', 'selected', 'modelId', 'modelSha256', 'tokenizerSha256',
    'fitProtocolSha256', 'privateCorpusSha256', 'fitArticles', 'fitRepresentation']) {
    const bad = clone(); bad[key] = typeof bad[key] === 'number' ? bad[key] + 1 : `${bad[key]}-wrong`;
    assert.throws(() => readBodyTopicMetric(rehash(bad)), TypeError, key);
  }
  const extra = clone(); extra.unapproved = true;
  assert.throws(() => readBodyTopicMetric(extra), TypeError);
  for (const key of Object.keys(artifact)) {
    const missing = clone(); delete missing[key];
    assert.throws(() => readBodyTopicMetric(missing), TypeError, key);
  }
  const stale = clone(); stale.mean[0] += 0.01;
  assert.throws(() => readBodyTopicMetric(stale), TypeError);
  const order = Object.fromEntries(Object.entries(clone()).reverse());
  assert.deepEqual(readBodyTopicMetric(order), artifact, 'manifest uses canonical fields, not caller insertion order');
});

test('BODY rejects accessors, extra own keys, sparse and nonfinite coefficients without getter execution', () => {
  let getterCalls = 0;
  const accessor = clone();
  Object.defineProperty(accessor, 'mean', { enumerable: true, get() { getterCalls++; return artifact.mean; } });
  assert.throws(() => readBodyTopicMetric(accessor), TypeError);
  const entry = clone();
  Object.defineProperty(entry.lower, '0', { enumerable: true, get() { getterCalls++; return 0.1; } });
  assert.throws(() => readBodyTopicMetric(entry), TypeError);
  assert.equal(getterCalls, 0);
  const proxied = new Proxy(clone(), { get() { getterCalls++; throw new Error('must not execute'); } });
  assert.throws(() => readBodyTopicMetric(proxied), TypeError);
  assert.equal(getterCalls, 0);
  const symbolic = clone(); symbolic[Symbol('hidden')] = true;
  assert.throws(() => readBodyTopicMetric(symbolic), TypeError);
  const sparse = clone(); delete sparse.lower[70];
  assert.throws(() => readBodyTopicMetric(sparse), TypeError);
  const extra = clone(); extra.mean.note = 1;
  assert.throws(() => readBodyTopicMetric(extra), TypeError);
  for (const value of [NaN, Infinity, -Infinity, '0', null, 1.01]) {
    const bad = clone(); bad.lower[2] = value;
    assert.throws(() => readBodyTopicMetric(bad), TypeError);
  }
  for (const value of [0, -0.01, 1e-10]) {
    const bad = clone(); bad.lower[2] = value;
    assert.throws(() => readBodyTopicMetric(rehash(bad)), TypeError);
  }
  const short = clone(); short.lower.pop();
  assert.throws(() => readBodyTopicMetric(short), TypeError);
});

test('BODY constructor rejects malformed dense matrix and wrong asset identity', () => {
  const lower = Float64Array.from(research.lower); lower[1] = 0.1;
  assert.throws(() => makeBodyTopicMetric({ mean: research.mean, lower }), TypeError);
  assert.throws(() => makeBodyTopicMetric({ mean: research.mean, lower: research.lower },
    { modelSha256: '0'.repeat(64), tokenizerSha256: artifact.tokenizerSha256 }), TypeError);
  assert.throws(() => makeBodyTopicMetric({ mean: research.mean, lower: research.lower },
    { modelSha256: artifact.modelSha256, tokenizerSha256: '0'.repeat(64) }), TypeError);
});

test('BODY current-vector validation rejects wrong input and centered degeneracy', () => {
  const transform = createBodyTopicMetricTransform(artifact), vector = [...vectors.values()][0];
  assert.ok(transform(Float32Array.from(vector)).every(Number.isFinite));
  for (const bad of [null, new Array(384), Array(384).fill(0), Array(384).fill(1),
    [1], [...vector].map((v, i) => i === 5 ? NaN : v), [...vector].map(v => 2 * v),
    { length: 384 }, new Int32Array(384)]) assert.throws(() => transform(bad), TypeError);
  const sparse = [...vector]; delete sparse[3];
  assert.throws(() => transform(sparse), TypeError);
  let calls = 0;
  const accessor = [...vector];
  Object.defineProperty(accessor, '2', { get() { calls++; return 0; } });
  assert.throws(() => transform(accessor), TypeError); assert.equal(calls, 0);
  const typedAccessor = Float64Array.from(vector);
  Object.defineProperty(typedAccessor, 'length', { get() { calls++; return 384; } });
  assert.throws(() => transform(typedAccessor), TypeError); assert.equal(calls, 0);
  assert.throws(() => transform(new Proxy(vector, { get() { calls++; throw new Error('must not execute'); } })), TypeError);
  assert.equal(calls, 0);
  const degenerate = clone(); degenerate.mean = [...vector];
  const zero = createBodyTopicMetricTransform(rehash(degenerate));
  assert.throws(() => zero(vector), TypeError);
});

test('BODY loader validates bounded regular JSON, rejects corrupt/oversized/empty/directory/symlink paths', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'udl-fictional-body-metric-'));
  const files = [];
  const fixture = async (name, content) => {
    const filename = path.join(directory, name); files.push(filename); await writeFile(filename, content); return filename;
  };
  try {
    const good = await fixture('good.json', `${JSON.stringify(artifact)}\n`);
    assert.deepEqual(await loadBodyTopicMetric(good), artifact);
    assert.ok(Buffer.byteLength(JSON.stringify(artifact)) <= BODY_METRIC_MAX_BYTES);
    for (const [name, bytes] of [['invalid.json', '{'], ['utf8.json', Buffer.from([0xc0, 0xaf])],
      ['empty.json', ''], ['large.json', Buffer.alloc(BODY_METRIC_MAX_BYTES + 1)],
      ['incomplete.json', JSON.stringify({ schema: artifact.schema })]]) {
      await assert.rejects(loadBodyTopicMetric(await fixture(name, bytes)));
    }
    await assert.rejects(loadBodyTopicMetric(directory));
    const subdirectory = path.join(directory, 'folder'); await mkdir(subdirectory);
    await assert.rejects(loadBodyTopicMetric(subdirectory)); await rmdir(subdirectory);
    const linked = path.join(directory, 'link.json');
    try { await symlink(good, linked); files.push(linked); await assert.rejects(loadBodyTopicMetric(linked)); }
    catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) t.diagnostic('Windows symlink fixture unavailable'); else throw error; }
  } finally {
    for (const filename of files) await unlink(filename);
    await rmdir(directory);
  }
});
