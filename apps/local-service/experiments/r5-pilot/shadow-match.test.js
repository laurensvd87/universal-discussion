import assert from 'node:assert/strict';
import test from 'node:test';
import { pairDiagnostics, publicationInterval, titleTokens, topKVectorPairs } from './shadow-match.js';

const vector = (x, y = 0) => [x, y, ...Array(382).fill(0)];
const source = (title, date, values = vector(1)) => ({ title, publicationValue: date,
  publicationPrecision: 'instant', vector: values });

test('title tokens preserve negation and numbers, remove only fixed function words', () => {
  assert.deepEqual([...titleTokens('The 2022 vote is NOT final: vote')], ['2022', 'vote', 'not', 'final']);
});

test('vector floor includes exact boundary and lexical channel can retrieve below it', () => {
  const a = source('Court rejects appeal today', '2026-01-01T12:00:00Z');
  const atFloor = source('Different words entirely', '2026-01-01T12:00:00Z',
    vector(0.9, Math.sqrt(1 - 0.9 ** 2)));
  assert.equal(pairDiagnostics(a, atFloor).vectorCandidate, true);
  const below = source('Court rejects appeal later', '2026-01-01T12:00:00Z', vector(0.89, Math.sqrt(1 - 0.89 ** 2)));
  const result = pairDiagnostics(a, below);
  assert.equal(result.vectorCandidate, false);
  assert.equal(result.lexicalCandidate, true);
  assert.equal(result.shadowCandidate, true);
});

test('lexical threshold requires two shared tokens and does not assert a join', () => {
  const a = source('Vote passed', '2026-01-01T00:00:00Z', vector(1));
  const b = source('Vote failed', '2026-01-01T00:00:00Z', vector(0, 1));
  assert.equal(pairDiagnostics(a, b).lexicalCandidate, false);
  assert.equal(pairDiagnostics(a, b).shadowCandidate, false);
});

test('day precision produces a bounded lag and no midnight fiction', () => {
  const day = { ...source('Two shared words', '2026-01-01T00:00:00Z'),
    publicationValue: '2026-01-01', publicationPrecision: 'day' };
  const near = source('Other shared words', '2026-01-04T12:00:00Z');
  const result = pairDiagnostics(day, near);
  assert.equal(result.timeBand, 'ambiguous-72h');
  assert.equal(result.minimumLagHours, 60);
  assert.equal(result.maximumLagHours, 84);
  assert.deepEqual(publicationInterval('2026-01-01', 'day'),
    [Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-01-02T00:00:00Z')]);
});

test('invalid dates and vectors fail closed', () => {
  assert.throws(() => publicationInterval('2026-02-30', 'day'), TypeError);
  assert.throws(() => publicationInterval('2026-02-30T12:00:00Z', 'instant'), TypeError);
  assert.throws(() => pairDiagnostics(source('A', '2026-01-01T00:00:00Z', vector(0)),
    source('B', '2026-01-01T00:00:00Z')), TypeError);
});

test('top-K retrieves below-floor neighbors without making a Topic join', () => {
  const entries = [
    { id: 'source-001', vector: vector(1) },
    { id: 'source-002', vector: vector(0.8, 0.6) },
    { id: 'source-003', vector: vector(-1) },
  ];
  assert.deepEqual(topKVectorPairs(entries, 1).map(item => item.pairKey),
    ['source-001:source-002', 'source-002:source-003']);
  assert.ok(0.8 < 0.9);
});

test('top-K nominations are bounded and deterministic under ties and input order', () => {
  const entries = Array.from({ length: 5 }, (_, index) => ({
    id: `source-${String(index + 1).padStart(3, '0')}`, vector: vector(1),
  }));
  const expected = topKVectorPairs(entries, 2);
  assert.deepEqual(topKVectorPairs([...entries].reverse(), 2), expected);
  assert.ok(expected.length <= entries.length * 2);
  assert.deepEqual(topKVectorPairs(entries, 1).map(item => item.pairKey), [
    'source-001:source-002', 'source-001:source-003', 'source-001:source-004', 'source-001:source-005',
  ]);
  assert.deepEqual(topKVectorPairs(entries, 1).map(item => item.bestRank), [1, 1, 1, 1]);
});
