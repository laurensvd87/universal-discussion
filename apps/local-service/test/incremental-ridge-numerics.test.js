import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncrementalPracticalTopicPlanner } from '../src/domain/ridge-topic-planner.js';
import { createPracticalTopicPlanner as frozenOracle } from './fixtures/ridge-topic-planner-prior.js';

const floor = .8639003810829322;
function source(id, angle, axis) {
  const values = Array(384).fill(0); values[axis] = Math.cos(angle); values[axis + 1] = Math.sin(angle);
  values[383] = -0;
  return { id, title: 'Synthetic numerical article', url: `https://example.org/${id}`,
    provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } };
}
const input = sources => ({ generation: 'numerical-generation', sources,
  sourceLinks: sources.map(({ id }) => ({ sourceId: id, method: 'learned-provisional' })) });
test('near-floor renormalization and affine transforms retain exact cold-oracle decisions after remote inserts', () => {
  const transform = values => values.map((value, index) => value * (1 + index % 7 * .0001));
  const parameters = { representation: 'synthetic-affine', artifactKey: 'affine-v1', floor, transform };
  const planner = createIncrementalPracticalTopicPlanner(parameters), full = frozenOracle(parameters);
  const boundary = Math.acos(floor);
  const sources = [];
  for (let group = 0; group < 4; group++) for (let index = 0; index < 8; index++) {
    const angle = index % 2 ? boundary + (index - 4) * 1e-14 : (index - 4) * 1e-14;
    const value = source(`s-${group}-${index}`, angle, group * 2);
    // Raw norm tolerance is unchanged; represented vectors must be normalized
    // in the same order as the frozen planner, never memoized post-normalization.
    value.embedding.values = value.embedding.values.map(number => number * (1 + group * 1e-7));
    sources.push(value);
  }
  for (let step = 0; step < 10; step++) {
    const snapshot = input(sources);
    assert.deepEqual(planner.plan(snapshot).partitions, full.plan(snapshot).partitions, `step ${step}`);
    if (step % 2) sources.reverse();
    else sources.unshift(source(`a-remote-${step}`, .1, 16 + step * 2));
  }
});

test('changed immutable artifact creates an isolated planner with no transformed/group cache reuse', () => {
  const snapshot = input([source('a', 0, 0), source('b', .4, 0), source('c', 0, 2)]);
  for (const scale of [1, .1, 10]) {
    const parameters = { representation: 'synthetic-affine', artifactKey: `artifact-${scale}`, floor,
      transform: values => values.map((value, index) => index % 2 ? value * scale : value) };
    const planner = createIncrementalPracticalTopicPlanner(parameters);
    const result = planner.plan(snapshot);
    assert.equal(result.diagnostics.incremental.reusedComponents, 0);
    assert.deepEqual(result.partitions, frozenOracle(parameters).plan(snapshot).partitions);
    assert.equal(planner.plan(snapshot).diagnostics.incremental.transformedSources, 0);
  }
});

test('compact exact transform identities avoid forward-scan thrashing beyond decimal-key cache capacity', () => {
  const transformBytes = 4 * 1024 * 1024;
  let random = 19937, transforms = 0;
  const sources = Array.from({ length: 600 }, (_, index) => {
    const value = source(`dense-${index}`, 0, 0);
    const raw = Array.from({ length: 384 }, () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random / 0x100000000 - .5;
    });
    const norm = Math.hypot(...raw); value.embedding.values = raw.map(number => number / norm);
    return value;
  });
  const oldChargedBytes = sources.reduce((sum, value) => sum +
    value.embedding.values.map(number => Object.is(number, -0) ? '-0' : String(number)).join(',').length * 2 + 384 * 8 + 256, 0);
  assert.ok(oldChargedBytes > transformBytes, 'the old decimal keys cannot retain this entire scan');
  const planner = createIncrementalPracticalTopicPlanner({ representation: 'synthetic-dense', artifactKey: 'dense-v1', floor,
    transform: values => { transforms++; return [...values]; }, cacheLimits: { transformBytes } });
  const snapshot = input(sources), cold = planner.plan(snapshot), transformed = transforms;
  assert.deepEqual(cold.partitions, frozenOracle({ representation: 'synthetic-dense', floor,
    transform: values => values }).plan(snapshot).partitions);
  assert.equal(cold.diagnostics.incremental.transformedSources, 600);
  assert.ok(cold.diagnostics.incremental.transformBytes <= transformBytes);
  const warm = planner.plan(snapshot);
  assert.deepEqual(warm.partitions, cold.partitions);
  assert.equal(transforms, transformed); assert.equal(warm.diagnostics.incremental.transformedSources, 0);
  assert.equal(warm.diagnostics.incremental.replannedSources, 0);
  assert.equal(warm.diagnostics.incremental.comparedGraphPairs, 0);
  snapshot.sources = snapshot.sources.slice(0, 300); snapshot.sourceLinks = snapshot.sourceLinks.slice(0, 300);
  const deleted = planner.plan(snapshot);
  assert.equal(deleted.diagnostics.incremental.transformedSources, 0);
  assert.ok(deleted.diagnostics.incremental.transformBytes < warm.diagnostics.incremental.transformBytes, 'removed raw and transformed vectors are purged');
  snapshot.generation = 'renewed-numerical-generation';
  assert.equal(planner.plan(snapshot).diagnostics.incremental.transformedSources, 300);
});
