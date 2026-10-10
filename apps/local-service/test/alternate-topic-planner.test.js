import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDiagonalAdapter } from '../src/domain/diagonal-adapter.js';
import { planAlternateTopics } from '../src/domain/alternate-topic-planner.js';

const source = (id, angle, method = 'learned-provisional') => {
  const values = Array(384).fill(0);
  values[0] = Math.cos(angle); values[1] = Math.sin(angle);
  return {
    source: { id, provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
      embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } },
    link: { sourceId: id, topicId: `topic-${id}`, method },
  };
};

const run = (items, adapter = null) => planAlternateTopics({
  sources: items.map(item => item.source),
  sourceLinks: items.map(item => item.link), adapter,
});

test('mutual high similarity can group a sparse translated-style pair without a 0.04 competitor lead', () => {
  const result = run([source('a', 0), source('b', Math.acos(0.951)), source('c', -Math.acos(0.932))]);
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }, { sourceIds: ['c'] }]);
  assert.deepEqual(result.diagnostics, {
    representation: 'raw-e5-baseline', sources: 3, comparedPairs: 3, acceptedSeeds: 1, supportedJoins: 0,
  });
});

test('crowded mutual pair needs a shared high-similarity witness', () => {
  const items = [source('a', 0), source('b', Math.acos(0.96)),
    source('c', -Math.acos(0.945)), source('d', -Math.acos(0.946)), source('e', -Math.acos(0.947))];
  const result = run(items);
  assert.equal(result.partitions.some(part => part.sourceIds.includes('a') && part.sourceIds.includes('b')), false);
});

test('multiple high-similarity witnesses attach a third member, but an unrelated theme stays separate', () => {
  const result = run([source('a', 0), source('b', 0.10), source('c', 0.20), source('d', 0.85)]);
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b', 'c'] }, { sourceIds: ['d'] }]);
  assert.equal(result.diagnostics.supportedJoins, 1);
});

test('one Topic may contain many supporting pages and input order does not change the partition', () => {
  const items = Array.from({ length: 150 }, (_, index) =>
    source(`s${String(index).padStart(3, '0')}`, 0));
  const forward = run(items);
  const reverse = run([...items].reverse());
  assert.equal(forward.partitions.length, 1);
  assert.equal(forward.partitions[0].sourceIds.length, 150);
  assert.deepEqual(reverse.partitions, forward.partitions);
});

test('manual-confirmed Source is omitted, and input vectors are never changed', () => {
  const items = [source('a', 0), source('b', 0.1), source('manual', 0.05, 'manual-confirmed')];
  const before = structuredClone(items);
  assert.deepEqual(run(items).partitions, [{ sourceIds: ['a', 'b'] }]);
  assert.deepEqual(items, before);
});

test('optional owner-local adapter is used in memory without replacing retained E5 vectors', () => {
  const items = [source('a', 0), source('b', 0.1)];
  const before = structuredClone(items);
  const parameters = Array(384).fill(0); parameters[1] = 0.2;
  const adapter = makeDiagonalAdapter(parameters, { triplets: 100 });
  const result = run(items, adapter);
  assert.equal(result.diagnostics.representation, 'owner-local-diagonal-adapter/v1');
  assert.deepEqual(result.partitions, [{ sourceIds: ['a', 'b'] }]);
  assert.deepEqual(items, before);
});

test('bad normalized vectors and duplicate links fail closed', () => {
  const items = [source('a', 0), source('b', 0.1)];
  items[0].source.embedding.values[0] = 0.4;
  assert.throws(() => run(items), TypeError);
  const valid = [source('a', 0), source('b', 0.1)];
  assert.throws(() => planAlternateTopics({ sources: valid.map(item => item.source),
    sourceLinks: [valid[0].link, valid[0].link] }), TypeError);
});
