import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { createPracticalTopicPlanner, checkedUnit, PRACTICAL_POLICY } from './planner.js';
import { practicalSuccess } from './core.js';

const source = (id, radians = 0, extra = {}) => {
  const values = Array(384).fill(0);
  values[128] = Math.cos(radians); values[383] = Math.sin(radians);
  return { id, provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values }, ...extra };
};
const snapshot = sources => ({ sources,
  sourceLinks: sources.map(row => ({ sourceId: row.id, method: 'learned-provisional' })) });
const planner = options => createPracticalTopicPlanner({ representation: 'synthetic-trust-only',
  floor: 0.8, transform: values => values, ...options });
const metric = (correct = 10, pure = 10) => ({ status: 'complete', correctGroupedPairs: correct,
  purePages: pure, falseGroupedPairs: 0, mixedPages: 0 });
const cohort = () => ({ methods: { raw: metric(1, 2), diagonal: metric(), ridge1: metric(20, 20) } });

test('Trust: malformed exposure counts and aggregate overflow cannot pass the fresh gate', () => {
  for (const name of ['raw', 'diagonal', 'ridge1']) for (const key of
    ['correctGroupedPairs', 'purePages', 'falseGroupedPairs', 'mixedPages']) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, -1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1]) {
      const first = cohort(), second = cohort(); first.methods[name][key] = value;
      assert.equal(practicalSuccess([first, second]), false, `${name}.${key} must reject malformed counts`);
    }
    const first = cohort(); delete first.methods[name][key];
    assert.equal(practicalSuccess([first, cohort()]), false);
  }
  const first = cohort(), second = cohort();
  first.methods.ridge1.correctGroupedPairs = second.methods.ridge1.correctGroupedPairs = Number.MAX_SAFE_INTEGER;
  assert.equal(practicalSuccess([first, second]), false);
});

test('Trust: aggregate reach may improve unevenly but each fresh cohort keeps its own exposure veto', () => {
  const first = cohort(), second = cohort();
  second.methods.ridge1 = metric(5, 5);
  assert.equal(practicalSuccess([first, second]), true);
  first.methods.diagonal.falseGroupedPairs = 4; first.methods.diagonal.mixedPages = 4;
  second.methods.ridge1.falseGroupedPairs = 1;
  assert.equal(practicalSuccess([first, second]), false);
  second.methods.ridge1.falseGroupedPairs = 0; second.methods.ridge1.mixedPages = 1;
  assert.equal(practicalSuccess([first, second]), false);
  second.methods.ridge1.mixedPages = 0; second.methods.raw.status = 'capacity-failclosed';
  assert.equal(practicalSuccess([first, second]), false);
});

test('Trust: resource limits only tighten hard ceilings and exhausted coarse allowance is capacity', () => {
  for (const key of ['maxWorkUnits', 'workBudgetMs', 'maxCachedPairs', 'maxEdgeBytes']) {
    assert.throws(() => planner().plan({ ...snapshot([]), limits: { [key]: PRACTICAL_POLICY[key] + 1 } }), TypeError);
  }
  // Three snapshot descriptors, one limit descriptor and one post-limit check
  // exactly consume five work units before the empty coarse invocation.
  assert.throws(() => planner().plan({ ...snapshot([]), limits: { maxWorkUnits: 5 } }),
    error => error.code === 'capacity');
});

test('Trust: the final sampled elapsed time must still be below the same deadline', t => {
  let clock = 0; t.mock.method(performance, 'now', () => ++clock);
  const factory = planner(), input = { ...snapshot([]), limits: { workBudgetMs: 10_000 } };
  const measured = factory.plan(input).diagnostics.elapsedMs;
  assert.ok(measured > 0 && measured < 10_000);
  clock = 0; let result;
  assert.throws(() => { result = factory.plan({ ...input, limits: { workBudgetMs: measured } }); },
    error => error.code === 'capacity');
  assert.equal(result, undefined);
});

test('Trust: later-block edge or sorting expiry never returns an earlier refined block', t => {
  const input = snapshot([source('a-0', 0), source('a-1', 0.03),
    source('b-0', Math.PI), source('b-1', Math.PI + 0.03), source('b-2', Math.PI + 0.06)]);
  const factory = planner(), before = structuredClone(input);
  assert.deepEqual(factory.plan(input).partitions,
    [{ sourceIds: ['a-0', 'a-1'] }, { sourceIds: ['b-0', 'b-1', 'b-2'] }]);
  let result;
  assert.throws(() => { result = factory.plan({ ...input, limits: { maxEdgeBytes: PRACTICAL_POLICY.edgeChargedBytes } }); },
    error => error.code === 'capacity');
  assert.equal(result, undefined); assert.deepEqual(input, before);
  let clock = 0, sorts = 0;
  t.mock.method(performance, 'now', () => clock);
  const nativeSort = Array.prototype.sort;
  Array.prototype.sort = function(comparator) {
    if (this[0] && typeof this[0].left === 'number' && typeof this[0].value === 'number' && ++sorts === 2) {
      clock = PRACTICAL_POLICY.workBudgetMs + 1;
    }
    return nativeSort.call(this, comparator);
  };
  try {
    assert.throws(() => { result = factory.plan(input); }, error => error.code === 'capacity');
    assert.equal(sorts, 2); assert.equal(result, undefined); assert.deepEqual(input, before);
  } finally { Array.prototype.sort = nativeSort; }
});

test('Trust: negative exact duplicates are removed before transform or independent coarse support', () => {
  let calls = 0;
  const factory = planner({ transform: values => { calls++; return values; } });
  const input = snapshot([source('a', 0), source('a-copy', 0), source('b', 0.1),
    source('hub', 0, { url: 'https://fictional-publication.com/' }),
    source('search', 0.1, { url: 'https://fictional-publication.com/search?q=fictional' }),
    source('challenge', 0, { title: 'Checking your browser...' }),
    source('manual', 0), { id: 'legacy', provenance: 'legacy' }]);
  input.sourceLinks[6].method = 'manual-confirmed'; input.sourceLinks[7].method = 'legacy';
  const result = factory.plan(input);
  assert.equal(calls, 3);
  assert.equal(result.diagnostics.qualifiedSources, 3);
  assert.equal(result.diagnostics.quarantinedSources, 3);
  assert.equal(result.diagnostics.coarseUniqueEvidenceUnits, 2);
  assert.equal(result.diagnostics.coarseDuplicateSources, 1);
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'a-copy', 'b'] }, { sourceIds: ['challenge'] },
    { sourceIds: ['hub'] }, { sourceIds: ['search'] }]);
});

test('Trust: represented all-cross checks use all coordinates with no hidden raw veto', () => {
  const rows = [source('a', 0), source('b', Math.PI)];
  const represented = Array(384).fill(0); represented[383] = 1;
  const factory = planner({ transform: () => represented });
  const before = structuredClone(rows), result = factory.plan(snapshot(rows));
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }]);
  assert.deepEqual(rows, before);
  const input = snapshot([source('a', -0.4), source('b', 0), source('c', 0.4)]);
  const refined = planner({ floor: 0.9 }).plan(input);
  assert.deepEqual(refined.partitions, [{ sourceIds: ['a', 'b'] }, { sourceIds: ['c'] }]);
  for (const part of refined.partitions) for (let a = 0; a < part.sourceIds.length; a++) for (let b = a + 1; b < part.sourceIds.length; b++) {
    const left = input.sources.find(row => row.id === part.sourceIds[a]).embedding.values;
    const right = input.sources.find(row => row.id === part.sourceIds[b]).embedding.values;
    assert.ok(left.reduce((sum, value, index) => sum + value * right[index], 0) >= 0.9);
  }
});

test('Trust: snapshot proxies, symbols and descriptor accessors reject without callbacks', () => {
  let calls = 0;
  const proxy = new Proxy({}, { get() { calls++; throw Error('fixture proxy get'); },
    ownKeys() { calls++; throw Error('fixture proxy keys'); }, getPrototypeOf() { calls++; throw Error('fixture prototype'); } });
  const getter = () => { calls++; throw Error('fixture getter'); };
  const corruptions = [
    input => proxy,
    input => { input.sources = proxy; return input; },
    input => { input.sources[0] = proxy; return input; },
    input => { input.sourceLinks[0] = proxy; return input; },
    input => { input.limits = proxy; return input; },
    input => { input.sources[0].embedding.values = proxy; return input; },
    input => { input[Symbol('snapshot')] = true; return input; },
    input => { input.sources[0][Symbol('source')] = true; return input; },
    input => { input.sourceLinks[0][Symbol('link')] = true; return input; },
    input => { input.sources[0].embedding.values[Symbol('vector')] = true; return input; },
    input => { Object.defineProperty(input.sources[0], 'title', { get: getter, enumerable: true }); return input; },
    input => { Object.defineProperty(input.sourceLinks, '0', { get: getter, enumerable: true }); return input; },
    input => { Object.defineProperty(input.sources[0].embedding.values, '0', { get: getter, enumerable: true }); return input; },
  ];
  for (const corrupt of corruptions) assert.throws(() => planner().plan(corrupt(snapshot([source('fixture')]))), TypeError);
  assert.equal(calls, 0);
});

test('Trust: finite norm overflow and invalid represented vectors never reach indexed planning', () => {
  assert.throws(() => checkedUnit(Array(384).fill(Number.MAX_VALUE)), TypeError);
  for (const values of [Array(384).fill(Number.MAX_VALUE), Array(384).fill(Infinity),
    Array(384).fill(0), Array(383).fill(1), Array(384).fill('1')]) {
    let result;
    assert.throws(() => { result = planner({ transform: () => values }).plan(snapshot([source('fixture')])); }, TypeError);
    assert.equal(result, undefined);
  }
});

test('Trust: transform buffers, returned output and prior snapshots cannot affect later plans', () => {
  const buffer = Array(384).fill(0); buffer[383] = 1;
  const factory = planner({ transform: () => buffer });
  const first = factory.plan(snapshot([source('old-a'), source('old-b')]));
  first.partitions[0].sourceIds.push('return-only');
  const next = factory.plan(snapshot([source('new-a'), source('new-b')]));
  assert.deepEqual(next.partitions, [{ sourceIds: ['new-a', 'new-b'] }]);
  for (const token of ['old-a', 'return-only', '"values"', '"embedding"', '"url"', '"title"', '"weights"', '"meanX"', '"meanY"']) {
    assert.equal(JSON.stringify(next).includes(token), false);
  }
  assert.ok(Object.isFrozen(factory));
  assert.deepEqual(Object.keys(factory).sort(), ['plan', 'policyVersion', 'representation']);
});
