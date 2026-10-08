import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairs, score, trainPolicy, countPairs } from './core.js';

const vector = (x, y) => Float64Array.from({ length: 384 }, (_, i) => i === 0 ? x : i === 1 ? y : 0);
const rows = [
  { id: 'a1', eventKey: 'a', category: 'invented', lang: 'en' },
  { id: 'a2', eventKey: 'a', category: 'invented', lang: 'fr' },
  { id: 'b1', eventKey: 'b', category: 'invented', lang: 'en' },
  { id: 'b2', eventKey: 'b', category: 'invented', lang: 'fr' },
];
const short = new Map([
  ['a1', vector(1, 0)], ['a2', vector(.9, .1)],
  ['b1', vector(.8, .2)], ['b2', vector(.7, .3)],
]);
const long = new Map([
  ['a1', vector(1, 0)], ['a2', vector(.99, .02)],
  ['b1', vector(0, 1)], ['b2', vector(.02, .99)],
]);

test('two-view policy is selected on train, and train negatives are rejected', () => {
  const sample = pairs(rows, short, long);
  const policy = trainPolicy(sample);
  const counts = countPairs(sample, p => score(p, policy.weight) >= policy.threshold);
  assert.ok(policy.weight < 1);
  assert.equal(counts.fp, 0);
  assert.equal(counts.sameCategoryFp, 0);
  assert.equal(counts.tp + counts.fn, 2);
  assert.equal(counts.crossLanguageTotal, 2);
  assert.equal(policy.trainTp, counts.tp);
  assert.equal(JSON.stringify(counts).includes('invented'), false);
});

test('pair scores depend only on embeddings; gold labels stay out of inference', () => {
  const initial = pairs(rows, short, long);
  const altered = pairs(rows.map(r => ({ ...r, eventKey: `secret-${r.id}`,
    category: `secret-${r.id}`, lang: 'xx' })), short, long);
  assert.deepEqual(initial.map(p => [p.short, p.long]), altered.map(p => [p.short, p.long]));
  assert.throws(() => pairs(rows, new Map(), long));
});
