import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFreshBatch, syntheticSource } from './adaptive-neighborhood.js';

const groupNames = groups => groups.map(group => group.join(',')).sort();
const s = syntheticSource;
const angle = Math.acos(0.92);

function equilateral() {
  const x = (0.92 - 0.92 * 0.92) / Math.sin(angle);
  return [s('a', [1, 0, 0]), s('b', [0.92, Math.sin(angle), 0]),
    s('c', [0.92, x, Math.sqrt(1 - 0.92 ** 2 - x ** 2)])];
}

test('three mutually .92 pages form one whole neighborhood regardless of input order', () => {
  const pages = equilateral();
  const expected = compareFreshBatch(pages);
  assert.deepEqual(groupNames(expected.baseline), ['a', 'b', 'c']);
  assert.deepEqual(groupNames(expected.proposed), ['a,b,c']);
  for (const order of [[2, 0, 1], [1, 2, 0], [1, 0, 2]])
    assert.deepEqual(compareFreshBatch(order.map(i => pages[i])), expected);
});

test('bridge cannot join endpoints whose pair score is below floor', () => {
  const pages = [s('a', [Math.cos(-angle), Math.sin(-angle)]), s('b', [1, 0]),
    s('c', [Math.cos(angle), Math.sin(angle)])];
  const result = compareFreshBatch(pages);
  assert.deepEqual(groupNames(result.proposed), ['a,b', 'c']);
  assert.deepEqual(compareFreshBatch([...pages].reverse()), result);
});

test('supported cohesive subgroups create a stricter boundary', () => {
  const v = Math.sqrt(0.985), e = Math.sqrt(0.015), c = 0.94, offset = Math.sqrt(1 - c * c);
  const pages = [s('a1', [v, 0, e, 0]), s('a2', [v, 0, -e, 0]),
    s('b1', [v * c, v * offset, 0, e]), s('b2', [v * c, v * offset, 0, -e])];
  const result = compareFreshBatch(pages);
  assert.deepEqual(groupNames(result.proposed), ['a1,a2', 'b1,b2']);
  assert.equal(result.supportedBoundaryCount, 1);
});

test('near copies do not provide independent subgroup support', () => {
  const a = s('a', [1, 0]);
  const b = s('b', [0.92, Math.sin(angle)]);
  const pages = [a, s('a-copy', [1, 0], a.url), b, s('b-copy', [0.92, Math.sin(angle)], b.url)];
  const result = compareFreshBatch(pages);
  assert.deepEqual(groupNames(result.proposed), ['a,a-copy,b,b-copy']);
  assert.deepEqual(result.supportedTightGroups, []);
  assert.equal(result.supportedBoundaryCount, 0);
});

test('a distinct subject with .93 cosine is still falsely joined', () => {
  // Semantic labels are fixture truth only; neither planner receives them.
  const pages = [s('same-event', [1, 0]), s('different-event', [0.93, Math.sqrt(1 - 0.93 ** 2)])];
  const result = compareFreshBatch(pages);
  assert.deepEqual(groupNames(result.proposed), ['different-event,same-event']);
});
