import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDiagonalAdapter } from '../src/domain/diagonal-adapter.js';
import { planAlternateTopics } from '../src/domain/alternate-topic-planner.js';
import { planIndexedAlternateTopics } from '../src/domain/alternate-topic-planner-indexed.js';

const source = (id, values, method = 'learned-provisional') => ({
  source: { id, provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } },
  link: { sourceId: id, topicId: `topic-${id}`, method },
});
const angle = (id, radians, method) => {
  const values = Array(384).fill(0); values[0] = Math.cos(radians); values[1] = Math.sin(radians);
  return source(id, values, method);
};
const input = items => ({ sources: items.map(item => item.source), sourceLinks: items.map(item => item.link) });
const run = (items, options = {}) => planIndexedAlternateTopics({ ...input(items), ...options });
const seededRandom = seed => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
  value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};
const unit = values => {
  const norm = Math.hypot(...values);
  return values.map(value => value / norm);
};

test('indexed planner preserves sparse, crowded-witness, multiple-support and bridge decisions', () => {
  const fixtures = [
    [angle('a', 0), angle('b', Math.acos(0.951)), angle('c', -Math.acos(0.932))],
    [angle('a', 0), angle('b', Math.acos(0.96)), angle('c', -Math.acos(0.945)),
      angle('d', -Math.acos(0.946)), angle('e', -Math.acos(0.947))],
    [angle('a', 0), angle('b', 0.1), angle('c', 0.2), angle('d', 0.85)],
    [angle('a', -0.31), angle('b', -0.3), angle('bridge', 0), angle('c', 0.3), angle('d', 0.31)],
  ];
  for (const items of fixtures) assert.deepEqual(run(items).partitions, planAlternateTopics(input(items)).partitions);
});

test('indexed exact retrieval and lazy merge queue match deterministic random distinct-vector cases', () => {
  const random = seededRandom(8721);
  for (let trial = 0; trial < 100; trial++) {
    const items = Array.from({ length: 3 + Math.floor(random() * 28) }, (_, i) => {
      const values = Array(384).fill(0);
      const cluster = Math.floor(random() * 4);
      values[cluster] = 1;
      for (let d = 4; d < 12; d++) values[d] = (random() - 0.5) * (trial % 2 ? 0.12 : 0.38);
      return source(`s${String(i).padStart(3, '0')}`, unit(values));
    });
    assert.deepEqual(run(items).partitions, planAlternateTopics(input(items)).partitions, `trial ${trial}`);
    assert.deepEqual(run([...items].reverse()).partitions, run(items).partitions, `reversed trial ${trial}`);
  }
});

test('identical vectors share all Source IDs but cannot manufacture a second independent support witness', () => {
  const originals = [angle('a', 0), angle('b', 0.1), angle('border', 0.4)];
  const duplicated = [...originals,
    ...Array.from({ length: 200 }, (_, i) => angle(`copy-${i}`, 0.1))];
  const result = run(duplicated);
  const group = result.partitions.find(part => part.sourceIds.includes('a'));
  assert.equal(group.sourceIds.includes('border'), false);
  assert.equal(group.sourceIds.length, 202);
  assert.equal(result.diagnostics.uniqueEvidenceUnits, 3);
  assert.equal(result.diagnostics.duplicateSources, 200);
  assert.equal(result.partitions.flatMap(part => part.sourceIds).length, duplicated.length);
  assert.equal(planAlternateTopics(input(duplicated)).partitions.some(part =>
    part.sourceIds.includes('a') && part.sourceIds.includes('border')), true,
  'legacy page multiplicity really would manufacture support in this fixture');
});

test('crowded near-threshold geometry, shuffled IDs and valid near-unit norms retain small-case parity', () => {
  const random = seededRandom(119863);
  for (let trial = 0; trial < 180; trial++) {
    const count = 8 + Math.floor(random() * 24);
    const items = Array.from({ length: count }, (_, i) => {
      const boundary = trial % 3 === 0 ? Math.acos(0.94) : Math.acos(0.90);
      const radians = (i % 3 - 1) * boundary + (random() - 0.5) * 0.09;
      const values = Array(384).fill(0);
      values[0] = Math.cos(radians); values[1] = Math.sin(radians);
      values[2] = (random() - 0.5) * 0.07;
      const normalized = unit(values);
      const scale = trial % 2 ? 1 + (random() - 0.5) * 1.8e-5 : 1;
      return source(`s${String((i * 7 + trial) % (count * 7 + 1)).padStart(4, '0')}`,
        normalized.map(value => value * scale));
    });
    const expected = planAlternateTopics(input(items)).partitions;
    assert.deepEqual(run(items).partitions, expected, `near-threshold trial ${trial}`);
    // Fisher-Yates affects capture/input order while retaining the actual IDs.
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]];
    }
    assert.deepEqual(run(items).partitions, expected, `shuffled near-threshold trial ${trial}`);
  }
});

test('5000 exact duplicates do not allocate or compare a dense neighborhood', () => {
  const result = run(Array.from({ length: 5000 }, (_, i) => angle(`s${String(i).padStart(5, '0')}`, 0)));
  assert.equal(result.partitions.length, 1);
  assert.equal(result.partitions[0].sourceIds.length, 5000);
  assert.equal(result.diagnostics.uniqueEvidenceUnits, 1);
  assert.equal(result.diagnostics.comparedPairs, 0);
  assert.equal(result.diagnostics.peakCachedPairs, 0);
});

test('1500 unrelated distinct Sources are accepted without the legacy pair-count page ceiling', () => {
  const random = seededRandom(193);
  const items = Array.from({ length: 1500 }, (_, i) => source(`s${String(i).padStart(5, '0')}`,
    unit(Array.from({ length: 384 }, () => random() - 0.5))));
  const result = run(items);
  assert.equal(result.partitions.length, 1500);
  assert.equal(result.diagnostics.sources, 1500);
  assert.equal(result.diagnostics.peakCachedPairs <= 65_536, true);
  assert.throws(() => planAlternateTopics(input(items)), error => error.code === 'capacity');
});

test('near duplicates remain distinct evidence, and one supported Topic has no fixed member cap', () => {
  const random = seededRandom(961);
  const items = Array.from({ length: 1000 }, (_, i) => {
    const values = Array(384).fill(0); values[0] = 1;
    for (let d = 1; d < 9; d++) values[d] = (random() - 0.5) * 0.02;
    return source(`s${String(i).padStart(5, '0')}`, unit(values));
  });
  const result = run(items);
  assert.equal(result.diagnostics.uniqueEvidenceUnits, 1000);
  assert.equal(result.partitions.length, 1);
  assert.equal(result.partitions[0].sourceIds.length, 1000);
  assert.equal(result.diagnostics.boundCertifications > 0, true);
});

test('capacity exhaustion has no partial partition; cache eviction cannot truncate candidates', () => {
  const items = Array.from({ length: 40 }, (_, i) => angle(`s${String(i).padStart(3, '0')}`, i * 0.004));
  assert.throws(() => run(items, { limits: { maxWorkUnits: 2 } }), error => error.code === 'capacity');
  assert.throws(() => run(items, { limits: { workBudgetMs: Number.MIN_VALUE } }), error => error.code === 'capacity');
  assert.deepEqual(run(items, { limits: { maxCachedPairs: 0 } }).partitions, run(items).partitions);
  assert.deepEqual(run(items, { limits: { maxCachedPairs: 3 } }).partitions, run(items).partitions);
  assert.throws(() => run(items, { limits: { topK: 2 } }), TypeError);
});

test('manual pins are omitted, adapters remain in-memory, malformed inputs fail and inputs are immutable', () => {
  const items = [angle('a', 0), angle('b', 0.1), angle('manual', 0.05, 'manual-confirmed')];
  const before = structuredClone(items);
  const parameters = Array(384).fill(0); parameters[1] = 0.2;
  const adapter = makeDiagonalAdapter(parameters, { triplets: 100 });
  const result = run(items, { adapter });
  assert.equal(result.diagnostics.representation, 'owner-local-diagonal-adapter/v1');
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }]);
  assert.deepEqual(items, before);
  assert.deepEqual(run([]).partitions, []);
  assert.throws(() => run([items[0], items[0]]), TypeError);
  assert.throws(() => planIndexedAlternateTopics({ ...input(items), sourceLinks: [items[0].link, items[0].link] }), TypeError);
  const bad = structuredClone(items); bad[0].source.embedding.values[0] = 0.4;
  assert.throws(() => run(bad), TypeError);
  const unknown = structuredClone(items); unknown[0].link.method = 'unknown';
  assert.throws(() => run(unknown), TypeError);
});
