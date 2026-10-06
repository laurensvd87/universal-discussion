import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS, dot, project, trainProjection } from './e5-projection.js';

function unit(index) { const value = new Float64Array(DIMENSIONS); value[index] = 1; return value; }
test('projection trains deterministically on supplied vectors and normalizes output', () => {
  const documents = [
    { id: 'a1', family: 'a', topicLabel: 'one' },
    { id: 'a2', family: 'a', topicLabel: 'one' },
    { id: 'b1', family: 'a', topicLabel: 'two' },
    { id: 'b2', family: 'a', topicLabel: 'two' },
  ];
  const vectors = new Map([['a1', unit(0)], ['a2', unit(0)], ['b1', unit(1)], ['b2', unit(1)]]);
  const first = trainProjection(documents, vectors);
  assert.deepEqual([...first.weights], [...trainProjection(documents, vectors).weights]);
  assert.equal(first.positivePairs, 2);
  assert.equal(first.hardNegativePairs, 4);
  assert.ok(first.weights[0] > first.weights[2]);
  const projected = project(unit(0), first);
  assert.ok(Math.abs(dot(projected, projected) - 1) < 1e-10);
  assert.throws(() => project(new Float64Array(5), first));
});
