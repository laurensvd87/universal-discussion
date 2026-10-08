import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreLanguagePairs } from './stratified-metrics.js';

const rows = [
  { id: 'm3-en-001', family: 'metro', topicLabel: 'rail-closure' },
  { id: 'm3-nl-002', family: 'metro', topicLabel: 'rail-closure' },
  { id: 'm3-de-003', family: 'metro', topicLabel: 'rail-price' },
  { id: 'm3-fr-004', family: 'metro', topicLabel: 'rail-price' },
];
const languageOf = row => row.id.split('-')[1];

test('stratified score separates translated true pairs from adjacent-event false joins', () => {
  const result = scoreLanguagePairs(rows,
    [['m3-en-001', 'm3-nl-002', 'm3-de-003'], ['m3-fr-004']], languageOf);
  assert.deepEqual(result.crossLanguage, { joined: 1, total: 2 });
  assert.deepEqual(result.adjacentEvent, { falseJoins: 2, total: 4 });
  assert.deepEqual(result.languagePairs['en/nl'],
    { truePairs: 1, joinedTrue: 1, differentPairs: 0, falseJoins: 0 });
  assert.deepEqual(result.languagePairs['de/en'],
    { truePairs: 0, joinedTrue: 0, differentPairs: 1, falseJoins: 1 });
});

test('invalid partitions and languages fail rather than biasing evaluation', () => {
  assert.throws(() => scoreLanguagePairs(rows, [['m3-en-001']], languageOf), TypeError);
  assert.throws(() => scoreLanguagePairs(rows, rows.map(row => [row.id]), () => ''), TypeError);
});
