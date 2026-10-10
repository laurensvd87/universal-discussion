import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTopicPartitions } from '../src/domain/topic-partition-comparison.js';

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
