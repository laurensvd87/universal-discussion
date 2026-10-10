import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTopicPartitions } from '../src/domain/topic-partition-comparison.js';
import { planAdaptiveTopics } from '../src/domain/adaptive-topics.js';

const fixture = () => ({
  sourceIds: ['a', 'b', 'c'],
  currentPartitions: [{ topicId: 't1', sourceIds: ['a', 'b'] }, { topicId: 't2', sourceIds: ['c'] }],
  candidatePartitions: [{ sourceIds: ['a'] }, { sourceIds: ['b', 'c'] }],
  sourceRoots: [{ rootId: 'root-a', sourceId: 'a' }, { rootId: 'root-c', sourceId: 'c' }],
});

test('comparison is inert and baseline assignments retain exact current Topic IDs', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = compareTopicPartitions(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.changedSourceIds, ['a', 'b', 'c']);
  assert.deepEqual(result.potentiallyAffectedRootIds, ['root-a', 'root-c']);
  assert.deepEqual(result.baselineAssignments, [
    { sourceId: 'a', topicId: 't1' }, { sourceId: 'b', topicId: 't1' }, { sourceId: 'c', topicId: 't2' },
  ]);
});

test('identical grouping in a different order changes no Sources or roots', () => {
  const input = fixture();
  input.candidatePartitions = [{ sourceIds: ['c'] }, { sourceIds: ['b', 'a'] }];
  const result = compareTopicPartitions(input);
  assert.deepEqual(result.changedSourceIds, []);
  assert.deepEqual(result.potentiallyAffectedRootIds, []);
});

test('incomplete or overlapping candidate partitions cannot produce a preview plan', () => {
  const input = fixture();
  for (const candidatePartitions of [
    [{ sourceIds: ['a', 'b'] }],
    [{ sourceIds: ['a', 'b'] }, { sourceIds: ['b', 'c'] }],
    [{ sourceIds: ['a', 'b', 'c'] }, { sourceIds: [] }],
  ]) assert.throws(() => compareTopicPartitions({ ...input, candidatePartitions }), TypeError);
});

test('fictional mutual-nearest pair is suppressed by current fixed lead rule', () => {
  const angle = { a: 0, b: Math.acos(0.95), c: -Math.acos(0.93) };
  const sources = Object.entries(angle).map(([id, radians]) => {
    const values = Array(384).fill(0);
    values[0] = Math.cos(radians); values[1] = Math.sin(radians);
    return { id, url: `https://example.com/${id}`, extractorVersion: 'main-text-prefix/v1',
      provenance: 'owner-local-page-embedding/v1',
      embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } };
  });
  const sourceLinks = ['a', 'b', 'c'].map((id) => ({ sourceId: id, topicId: `t-${id}`, method: 'learned-provisional' }));
  const result = planAdaptiveTopics({ sources, sourceLinks });
  assert.equal(result.partitions.some((part) => part.sourceIds.join(',') === 'a,b'), false);
  assert.deepEqual(result.partitions.map((part) => part.sourceIds), [['a'], ['b'], ['c']]);
  // The read-only candidate comparison can still show this desired pair.
  const comparison = compareTopicPartitions({ sourceIds: ['a', 'b', 'c'],
    currentPartitions: ['a', 'b', 'c'].map((id) => ({ topicId: `t-${id}`, sourceIds: [id] })),
    candidatePartitions: [{ sourceIds: ['a', 'b'] }, { sourceIds: ['c'] }] });
  assert.deepEqual(comparison.changedSourceIds, ['a', 'b']);
});
