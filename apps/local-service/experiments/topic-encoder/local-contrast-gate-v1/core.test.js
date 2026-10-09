import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareGraph, calibrate, admit, evaluate, VARIANTS } from './core.js';

function fixture(crossScore, exceptional = false) {
  const documents = Array.from({ length: 12 }, (_, i) => ({
    id: `doc-${String(i).padStart(2, '0')}`,
    eventKey: i < 6 ? 'event-a' : 'event-b',
    categories: ['same-family'], lang: ['en', 'nl', 'de', 'fr', 'es', 'en'][i % 6],
  }));
  const vectors = new Map(documents.map(doc => [doc.id, doc.id]));
  const scorer = (a, b) => {
    const left = Number(a.slice(-2)), right = Number(b.slice(-2));
    if (exceptional && ((left === 0 && right === 6) ||
        (left === 6 && right === 0))) return 0.99;
    if ((left < 6) === (right < 6)) return 0.9;
    if (crossScore > 0.9) return left % 6 < 3 && right % 6 < 3 ?
      crossScore : 0.2;
    return crossScore;
  };
  return { documents, vectors, scorer };
}

function edgeIds(graph, edges) {
  return edges.map(({ i, j }) => [graph.ids[i], graph.ids[j]].sort().join('|'))
    .sort();
}

test('isolated high-score wrong neighbor lacks mutual triangle support', () => {
  const { documents, vectors, scorer } = fixture(0.2, true);
  const graph = prepareGraph(documents, vectors, scorer);
  const bad = graph.pairs.find(({ i, j }) => i === 0 && j === 6);
  assert.equal(bad.support, 0);
  const settings = calibrate(graph);
  for (const name of VARIANTS) {
    const metrics = evaluate(graph, admit(graph, name, settings[name]));
    assert.equal(metrics.falseEdges, 0, name);
    assert.equal(metrics.mixedGroups, 0, name);
    assert.ok(metrics.trueEdges > 0, name);
  }
});

test('calibration rejects supported same-family hard-negative edges', () => {
  const { documents, vectors, scorer } = fixture(0.95);
  const graph = prepareGraph(documents, vectors, scorer);
  const settings = calibrate(graph);
  assert.ok(settings.triangle.negativeCandidates > 0);
  assert.ok(settings['double-support'].negativeCandidates > 0);
  for (const name of VARIANTS) {
    const metrics = evaluate(graph, admit(graph, name, settings[name]));
    assert.equal(metrics.falseEdges, 0, name);
    assert.equal(metrics.hardFalseEdges, 0, name);
  }
});

test('zero-negative calibration and exact boundary abstain', () => {
  const { documents, vectors, scorer } = fixture(0.2, true);
  const graph = prepareGraph(documents, vectors, scorer);
  const settings = calibrate(graph);
  assert.equal(settings.triangle.negativeCandidates, 0);
  assert.equal(settings.triangle.threshold, 0);
  const boundary = { pairs: [{ i: 0, j: 1, support: 1, contrast: 0 },
    { i: 0, j: 2, support: 1, contrast: 0.1 }] };
  assert.deepEqual(admit(boundary, 'triangle', settings.triangle),
    [boundary.pairs[1]]);
});

test('all admission variants are stable when rows are reordered', () => {
  const { documents, vectors, scorer } = fixture(0.2, true);
  const first = prepareGraph(documents, vectors, scorer);
  const second = prepareGraph([...documents].reverse(), vectors, scorer);
  const firstCalibration = calibrate(first), secondCalibration = calibrate(second);
  for (const name of VARIANTS) {
    assert.equal(firstCalibration[name].threshold, secondCalibration[name].threshold);
    assert.deepEqual(edgeIds(first, admit(first, name, firstCalibration[name])),
      edgeIds(second, admit(second, name, secondCalibration[name])));
  }
});

test('seed expansion requires two links into one unambiguous component', () => {
  const edge = (i, j, support) => ({ i, j, support, contrast: 0.2 });
  const seeds = [edge(0, 1, 3), edge(0, 2, 3), edge(1, 2, 3),
    edge(3, 4, 3), edge(3, 5, 3), edge(4, 5, 3)];
  const first = [edge(0, 6, 2), edge(1, 6, 2)];
  const second = [edge(3, 6, 2), edge(4, 6, 2)];
  const bridge = edge(2, 3, 2);
  const base = { documents: Array.from({ length: 7 }, (_, id) => ({ id })) };
  const unambiguous = admit({ ...base, pairs: seeds.concat(first) },
    'seed-expand', { threshold: 0.1 });
  assert.equal(unambiguous.length, 8);
  const ambiguous = admit({ ...base, pairs: seeds.concat(first, second) },
    'seed-expand', { threshold: 0.1 });
  assert.equal(ambiguous.length, 6);
  const noBridge = admit({ ...base, pairs: seeds.concat(first, bridge) },
    'seed-expand', { threshold: 0.1 });
  assert.equal(noBridge.length, 8);
  assert.ok(!noBridge.includes(bridge));
  const reversed = { documents: [...base.documents].reverse(),
    pairs: seeds.concat(first, bridge).map(({ i, j, ...rest }) =>
      ({ i: 6 - j, j: 6 - i, ...rest })).reverse() };
  const reversedIds = new Set(admit(reversed, 'seed-expand',
    { threshold: 0.1 }).map(({ i, j }) =>
    [reversed.documents[i].id, reversed.documents[j].id].sort().join('|')));
  const originalIds = new Set(noBridge.map(({ i, j }) =>
    [base.documents[i].id, base.documents[j].id].sort().join('|')));
  assert.deepEqual(reversedIds, originalIds);
});

test('missing, malformed, or nonfinite input fails closed', () => {
  const { documents, vectors, scorer } = fixture(0.2);
  assert.throws(() => prepareGraph(documents, new Map(), scorer), /GRAPH_VECTOR/u);
  assert.throws(() => prepareGraph(documents, vectors, () => NaN), /GRAPH_SCORE/u);
  assert.throws(() => prepareGraph(documents, vectors, () => 1.2), /GRAPH_SCORE/u);
  assert.throws(() => prepareGraph([...documents, documents[0]], vectors, scorer),
    /GRAPH_IDS/u);
  const graph = prepareGraph(documents, vectors, scorer);
  assert.throws(() => admit(graph, 'triangle', { threshold: NaN }),
    /ADMISSION_INPUT/u);
  assert.throws(() => evaluate(graph, [{ i: 0, j: 0 }]), /EVALUATION_EDGE/u);
});
