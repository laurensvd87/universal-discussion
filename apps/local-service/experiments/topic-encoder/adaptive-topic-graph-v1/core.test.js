import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupDocuments, scoreGroups } from './core.js';

test('supported linkage can bridge weak viewpoint pairs when every member has support', () => {
  // Cosines are represented by unit vectors to exercise the actual geometry.
  const vectors = new Map([
    ['a', [1, 0]], ['b', [0.98, 0.199]], ['c', [0.91, 0.414]],
    ['d', [-1, 0]],
  ]);
  const rows = [
    { id: 'a', topicLabel: 'one', family: 'same' },
    { id: 'b', topicLabel: 'one', family: 'same' },
    { id: 'c', topicLabel: 'one', family: 'same' },
    { id: 'd', topicLabel: 'two', family: 'same' },
  ];
  const rule = { method: 'supported', minimum: 0.90, mean: 0.94, cover: 0.90 };
  const groups = groupDocuments(rows, vectors, rule);
  assert.deepEqual(groups, [['a', 'b', 'c'], ['d']]);
  assert.deepEqual(groupDocuments([...rows].reverse(), vectors, rule), groups);
  const result = scoreGroups(rows, groups);
  assert.equal(result.joinedTrue, 3);
  assert.equal(result.joinedFalse, 0);
  assert.equal(result.exactGoldTopics, 2);
});

test('unsupported bridging source cannot absorb a whole topic', () => {
  const rows = ['a', 'b', 'c'].map((id, index) => ({ id, topicLabel: index === 2 ? 'two' : 'one', family: 'family' }));
  const vectors = new Map([['a', [1, 0]], ['b', [0.99, 0.14]], ['c', [0.8, 0.6]]]);
  assert.deepEqual(groupDocuments(rows, vectors,
    { method: 'supported', minimum: 0.90, mean: 0.94, cover: 0.94 }), [['a', 'b'], ['c']]);
});

test('no fixed group-size cap; all mutually identical members join', () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: `doc${String(index).padStart(3, '0')}` }));
  const vectors = new Map(rows.map(doc => [doc.id, [1, 0]]));
  assert.equal(groupDocuments(rows, vectors, { method: 'supported', minimum: 0.9, mean: 0.94, cover: 0.94 })[0].length, 101);
});

test('nearest-neighbor veto refuses a triangle containing a better-supported outside source', () => {
  const rows = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  const vectors = new Map([
    ['a', [1, 0]], ['b', [Math.cos(20 * Math.PI / 180), Math.sin(20 * Math.PI / 180)]],
    ['c', [Math.cos(29 * Math.PI / 180), Math.sin(29 * Math.PI / 180)]],
    ['d', [Math.cos(35 * Math.PI / 180), Math.sin(35 * Math.PI / 180)]],
  ]);
  const groups = groupDocuments(rows, vectors,
    { method: 'triangle-nearest', minimum: 0.86, mean: 0.90, cover: 0.86, strongPair: 1.01 });
  assert.ok(!groups.some(group => group.includes('a') && group.includes('b') && group.includes('c')));
});
