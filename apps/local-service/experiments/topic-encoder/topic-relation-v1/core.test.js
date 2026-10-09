import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLexicon, fitModel, groupRows, makePairs, pairFeatures, pairCounts } from './core.js';

const rows = [
  { id: 'a', title: 'North Quay coolant leak', body: 'Battery launch delayed after a coolant leak.', topicLabel: 'one', family: 'f' },
  { id: 'b', title: 'Coolant leak delays launch', body: 'North Quay battery launch awaits a pressure test.', topicLabel: 'one', family: 'f' },
  { id: 'c', title: 'North Quay charging fee', body: 'Battery charging receives a new overnight tariff.', topicLabel: 'two', family: 'f' },
  { id: 'd', title: 'Orchard crate repair', body: 'Growers replace broken containers.', topicLabel: 'three', family: 'g' },
];
const vectors = new Map([['a', [1, 0]], ['b', [0.99, 0.01]], ['c', [0.95, 0.05]], ['d', [0, 1]]]);

test('pair features use local title/body evidence and ignore gold labels', () => {
  const lexicon = buildLexicon(rows);
  const actual = pairFeatures(rows[0], rows[1], vectors.get('a'), vectors.get('b'), lexicon);
  const changed = pairFeatures({ ...rows[0], topicLabel: 'other', family: 'other' }, rows[1], vectors.get('a'), vectors.get('b'), lexicon);
  assert.deepEqual(actual, changed);
  assert.equal(actual.length, 6);
  assert.ok(actual[1] > 0);
});

test('training is deterministic and pair counts distinguish hard adjacent negatives', () => {
  const lexicon = buildLexicon(rows);
  const pairs = makePairs(rows, vectors, lexicon);
  const model = fitModel(pairs, { passes: 10 });
  assert.deepEqual(model, fitModel(pairs, { passes: 10 }));
  const scored = makePairs(rows, vectors, lexicon, model);
  assert.equal(pairCounts(scored, -Infinity).hardTotal, 2);
  assert.equal(pairCounts(scored, -Infinity).trueTotal, 1);
});

test('grouping has no member cap, is order-independent, and abstains on a conflicting bridge', () => {
  const many = Array.from({ length: 31 }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}` }));
  const pairs = [];
  for (let i = 0; i < many.length; i++) for (let j = i + 1; j < many.length; j++)
    pairs.push({ a: many[i].id, b: many[j].id, score: 2, features: [0.9] });
  assert.equal(groupRows(many, pairs, { cutoff: 1, floor: 0, cosineFloor: 0.8 })[0].length, 31);
  const bridge = [
    { a: 'a', b: 'b', score: 2, features: [0.95] },
    { a: 'b', b: 'c', score: 1.5, features: [0.95] },
    { a: 'a', b: 'c', score: -1, features: [0.95] },
  ];
  const rule = { cutoff: 1, floor: 0, cosineFloor: 0.8 };
  const expected = [['a', 'b'], ['c']];
  assert.deepEqual(groupRows([{ id: 'c' }, { id: 'a' }, { id: 'b' }], bridge, rule), expected);
  assert.deepEqual(groupRows([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [...bridge].reverse(), rule), expected);
});
