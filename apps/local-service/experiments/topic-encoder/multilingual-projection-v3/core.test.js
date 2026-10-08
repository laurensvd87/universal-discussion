import assert from 'node:assert/strict';
import { test } from 'node:test';
import { D, cutoff, dot, evaluate, normalize, project, trainProjection } from './core.js';

function vector(a, b) { const x = new Float64Array(D); x[0] = a; x[1] = b; return normalize(x); }
const rows = [
  { id: 'mt-en-a', family: 'f', topicLabel: 'a' },
  { id: 'mt-nl-a', family: 'f', topicLabel: 'a' },
  { id: 'mt-de-b', family: 'f', topicLabel: 'b' },
  { id: 'mt-fr-b', family: 'f', topicLabel: 'b' },
];
const vectors = new Map(rows.map((row, i) => [row.id,
  [vector(1, 0), vector(.9, .1), vector(0, 1), vector(.1, .9)][i]]));

test('hard-negative contrastive axes and residual are deterministic', () => {
  const a = trainProjection(rows, vectors), b = trainProjection(rows, vectors);
  assert.deepEqual(a, b);
  assert.ok(a.axes.length > 0);
  assert.ok(a.eigenvalues.every(x => x > 0));
  const y = project(vectors.get(rows[0].id), a, 2);
  assert.ok(Math.abs(dot(y, y) - 1) < 1e-12);
});

test('train cutoff rejects all negatives and partition diagnostics count exact topics', () => {
  const score = evaluate(rows, vectors, cutoff(rows, vectors));
  assert.equal(score.pairs.fp, 0);
  assert.equal(score.pairs.hardFp, 0);
  assert.equal(score.pairs.crossTrueTotal, 2);
  assert.equal(score.partition.totalTopics, 2);
  assert.equal(score.partition.mixedGroups, 0);
});
