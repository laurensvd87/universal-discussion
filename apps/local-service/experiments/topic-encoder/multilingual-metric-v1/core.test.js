import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIMENSION, dot, evaluate, focusInput, normalize, pairs, trainMetric,
  transform, validateSplits, zeroFalseCutoff } from './core.js';

function rows(split, families) {
  return Array.from({ length: families * 10 }, (_, i) => ({
    id: `mt1-${['en', 'nl', 'de', 'fr', 'es'][i % 5]}-${split}-${i}`,
    split, family: `${split}-${Math.floor(i / 10)}`,
    topicLabel: `${split}-${Math.floor(i / 5)}`,
    title: 'Invented title', body: 'Invented lead',
  }));
}

function vector(a, b) {
  const result = new Float64Array(DIMENSION);
  result[0] = a; result[1] = b;
  return normalize(result);
}

test('bounded focus input and family isolation', () => {
  const input = focusInput({ id: 'one', title: 'Title', body: `  A  ${'x'.repeat(400)}` });
  assert.equal(input.body.length, 384);
  assert.equal(input.body.slice(0, 2), 'A ');
  validateSplits(rows('train', 8), rows('validation', 4));
  const leaked = rows('validation', 4); leaked[0].family = 'train-0';
  assert.throws(() => validateSplits(rows('train', 8), leaked), /Family leakage/);
});

test('train-only cutoff rejects every train negative and counts hard negatives', () => {
  const articles = [
    { id: 'mt1-en-a', topicLabel: 'a', family: 'f' },
    { id: 'mt1-nl-a', topicLabel: 'a', family: 'f' },
    { id: 'mt1-de-b', topicLabel: 'b', family: 'f' },
  ];
  const vectors = new Map([
    [articles[0].id, vector(1, 0)], [articles[1].id, vector(0.98, 0.2)],
    [articles[2].id, vector(0.9, 0.43)],
  ]);
  const cutoff = zeroFalseCutoff(articles, vectors);
  const scored = evaluate(articles, vectors, cutoff);
  assert.equal(scored.falseAdmitted, 0);
  assert.equal(scored.hardFalseAdmitted, 0);
  assert.equal(scored.truePairs, 1);
  assert.equal(scored.trueAdmitted, 1);
  assert.equal(pairs(articles).filter(p => p.hardNegative).length, 2);
});

test('projection is deterministic, normalized and consumes vectors only', () => {
  const articles = rows('train', 8);
  const vectors = new Map(articles.map((row, i) => [row.id,
    vector(1 - (i % 5) * 0.01, (i % 5) * 0.01 + 0.1)]));
  const first = trainMetric(articles, vectors, { epochs: 2 });
  const second = trainMetric(articles, vectors, { epochs: 2 });
  assert.deepEqual(first, second);
  const projected = transform(vectors.get(articles[0].id), first);
  assert.ok(Math.abs(dot(projected, projected) - 1) < 1e-12);
  assert.ok(first.every(weight => weight > 0));
});
