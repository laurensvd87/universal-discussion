import assert from 'node:assert/strict';
import { test } from 'node:test';
import { D, cutoff, dot, evaluate, normalize, pairs, project, trainProjection } from './core.js';

function v(a, b) { const x = new Float64Array(D); x[0] = a; x[1] = b; return normalize(x); }
const rows = [
  { id: 'mt1-en-a', family: 'f', topicLabel: 'a' },
  { id: 'mt1-nl-a', family: 'f', topicLabel: 'a' },
  { id: 'mt1-de-b', family: 'f', topicLabel: 'b' },
  { id: 'mt1-fr-b', family: 'f', topicLabel: 'b' },
];
const vectors = new Map(rows.map((x, i) => [x.id, [v(1, 0), v(.9, .1), v(0, 1), v(.1, .9)][i]]));

test('contrastive fit is deterministic and yields a non-diagonal normalized residual', () => {
  const a = trainProjection(rows, vectors, 2), b = trainProjection(rows, vectors, 2);
  assert.deepEqual(a, b);
  const y = project(vectors.get(rows[0].id), a, 1);
  assert.ok(Math.abs(dot(y, y) - 1) < 1e-12);
  assert.ok(a.axes.some(axis => Math.abs(axis[0]) > .01 && Math.abs(axis[1]) > .01));
  assert.equal(a.axes.length, 2);
});

test('train cutoff gives zero false admissions and cross-language counts are explicit', () => {
  const threshold = cutoff(rows, vectors);
  const result = evaluate(rows, vectors, threshold);
  assert.equal(result.pairs.fp, 0);
  assert.equal(result.pairs.hardFp, 0);
  assert.equal(result.pairs.totalCrossTrue, 2);
  assert.equal(pairs(rows).filter(x => x.hard).length, 4);
});
