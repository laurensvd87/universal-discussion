import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize, cosine, triplets, train, transform, pairCounts, trainCutoff,
  selectTrainMethod } from './core.js';

const vector = (x, y, z = 0) => Float64Array.from({ length: 384 }, (_, i) =>
  i === 0 ? x : i === 1 ? y : i === 2 ? z : 0);
const rows = [
  { id: 'a1', eventKey: 'event-a', category: 'transport', lang: 'en' },
  { id: 'a2', eventKey: 'event-a', category: 'transport', lang: 'fr' },
  { id: 'a3', eventKey: 'event-a', category: 'transport', lang: 'de' },
  { id: 'b1', eventKey: 'event-b', category: 'transport', lang: 'en' },
  { id: 'b2', eventKey: 'event-b', category: 'transport', lang: 'fr' },
  { id: 'b3', eventKey: 'event-b', category: 'transport', lang: 'de' },
];
const raw = new Map([
  ['a1', vector(1, .2)], ['a2', vector(.95, .25, .05)], ['a3', vector(.9, .3, -.04)],
  ['b1', vector(.96, -.2)], ['b2', vector(.93, -.25, .04)], ['b3', vector(.91, -.3, -.03)],
]);

test('train-only triplets use event labels and nearest hard negatives', () => {
  const normalized = new Map([...raw].map(([id, value]) => [id, normalize(value)]));
  const examples = triplets(rows, normalized);
  assert.equal(examples.length, 6);
  for (const t of examples) {
    const a = rows.find(x => x.id === t.anchor);
    assert.equal(rows.find(x => x.id === t.positive).eventKey, a.eventKey);
    assert.notEqual(rows.find(x => x.id === t.negative).eventKey, a.eventKey);
  }
  const fitted = train(rows, raw);
  assert.ok(fitted.axes.length <= 8);
  assert.equal(fitted.tripletCount, 6);
  assert.ok(fitted.axes.every(axis => Math.abs(cosine(axis, axis) - 1) < 1e-6));
});

test('train-only cutoff rejects every train negative; evaluation is aggregate', () => {
  const selected = selectTrainMethod(rows, raw);
  assert.ok([0, .25, .5, 1].includes(selected.strength));
  const projected = new Map(rows.map(r => [r.id,
    transform(raw.get(r.id), selected.model.axes, selected.strength)]));
  assert.equal(trainCutoff(rows, projected), selected.threshold);
  const counts = pairCounts(rows, projected, selected.threshold);
  assert.equal(counts.fp, 0);
  assert.equal(counts.sameCategoryFp, 0);
  assert.equal(counts.tp + counts.fn, 6);
  assert.equal(counts.crossLanguageTotal, 6);
  assert.equal(JSON.stringify(counts).includes('transport'), false);
  const before = transform(raw.get('a1'), selected.model.axes, selected.strength);
  rows[0].eventKey = 'changed';
  const after = transform(raw.get('a1'), selected.model.axes, selected.strength);
  rows[0].eventKey = 'event-a';
  assert.deepEqual(before, after);
});
