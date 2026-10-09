import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSingletons, calibrateAttachment } from './core.js';

function fixture({ ambiguous = false, dense = false, wrong = false } = {}) {
  const n = dense ? 22 : 9;
  const documents = Array.from({ length: n }, (_, i) => ({
    id: `doc-${String(i).padStart(2, '0')}`,
    eventKey: i < 3 || (!wrong && i === 6) ? 'event-a' :
      i < 6 ? 'event-b' : `event-${i}`,
  }));
  const edge = (i, j, support, contrast) => ({ i, j, support, contrast });
  const pairs = [edge(0, 1, 2, .3), edge(1, 2, 2, .3),
    edge(3, 4, 2, .3), edge(4, 5, 2, .3),
    edge(0, 6, 1, .25), edge(1, 6, 1, .23)];
  if (ambiguous) pairs.push(edge(3, 6, 1, .22), edge(4, 6, 1, .21));
  if (dense) for (let i = 7; i < n - 1; i++)
    pairs.push(edge(0, i, 1, .2), edge(1, i, 1, .19));
  return { documents, pairs: pairs.sort((a, b) => a.i - b.i || a.j - b.j) };
}
const DOUBLE = { threshold: .1 }, TRIANGLE = { threshold: .1 };
const ids = (graph, edges) => edges.map(pair =>
  [graph.documents[pair.i].id, graph.documents[pair.j].id].sort().join('|')).sort();

test('one orphan attaches through two members and established groups stay separate', () => {
  const graph = fixture();
  const result = attachSingletons(graph, DOUBLE, TRIANGLE, { threshold: 0 });
  assert.equal(result.baseEdges, 4);
  assert.equal(result.addedEdges, 2);
  assert.equal(result.attachedSingletons, 1);
  assert.ok(!result.edges.some(pair => pair.i < 3 && pair.j >= 3 && pair.j < 6));
});

test('ambiguous two-group support abstains even when one group scores better', () => {
  const result = attachSingletons(fixture({ ambiguous: true }), DOUBLE,
    TRIANGLE, { threshold: 0 });
  assert.equal(result.addedEdges, 0);
});

test('negative attachment determines calibration margin and is rejected', () => {
  const graph = fixture({ wrong: true });
  const calibrated = calibrateAttachment(graph, DOUBLE, { threshold: .26 });
  assert.equal(calibrated.negativeCandidates, 1);
  assert.ok(calibrated.threshold > .23);
  assert.equal(attachSingletons(graph, DOUBLE, TRIANGLE,
    calibrated).addedEdges, 0);
});

test('row order does not change admitted links', () => {
  const graph = fixture();
  const reversed = { documents: [...graph.documents].reverse(),
    pairs: graph.pairs.map(({ i, j, ...rest }) =>
      ({ i: graph.documents.length - 1 - j,
        j: graph.documents.length - 1 - i, ...rest })).reverse() };
  assert.deepEqual(ids(graph, attachSingletons(graph, DOUBLE, TRIANGLE,
    { threshold: 0 }).edges), ids(reversed,
    attachSingletons(reversed, DOUBLE, TRIANGLE, { threshold: 0 }).edges));
});

test('dense groups have no member cap and single-edge chain links are ignored', () => {
  const graph = fixture({ dense: true });
  graph.pairs.push({ i: 2, j: 21, support: 1, contrast: .4 });
  const result = attachSingletons(graph, DOUBLE, TRIANGLE, { threshold: 0 });
  assert.equal(result.attachedSingletons, 15);
  assert.ok(!result.edges.some(pair => pair.i === 2 && pair.j === 21));
});

test('malformed graph, cutoff and score fail closed', () => {
  assert.throws(() => attachSingletons({}, DOUBLE, TRIANGLE,
    { threshold: 0 }), /ATTACH_GRAPH/u);
  assert.throws(() => attachSingletons(fixture(), DOUBLE, TRIANGLE,
    { threshold: NaN }), /ATTACH_MARGIN/u);
  const graph = fixture();
  graph.pairs[0].contrast = Infinity;
  assert.throws(() => attachSingletons(graph, DOUBLE, TRIANGLE,
    { threshold: 0 }), /ATTACH_PAIR/u);
});
