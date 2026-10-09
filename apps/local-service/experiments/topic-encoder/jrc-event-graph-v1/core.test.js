import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventGraph, evaluateGraph } from './core.js';

const doc = (id, title, cluster, language = 'en') =>
  ({ id, title, cluster, language, source: `host${id}.example` });
const vectorMap = (documents, vectors) => new Map(documents.map((item, i) => [item.id, vectors[i]]));

test('isolated high-cosine but title-conflicting pair abstains', () => {
  const documents = [doc('a', 'Bridge opening in capital', 'a'),
    doc('b', 'Bank merger in coastal town', 'b')];
  const vectors = vectorMap(documents, [[1, 0], [0.95, Math.sqrt(1 - 0.95 ** 2)]]);
  const graph = buildEventGraph(documents, vectors);
  const report = evaluateGraph(documents, graph);
  assert.equal(report.baseline090.components.mixedGroups, 1);
  assert.equal(report.graph.components.mixedGroups, 0);
  assert.equal(report.graph.components.groups, 2);
});

test('cross-host exact-title pair can seed a group', () => {
  const documents = [doc('a', 'Bridge opening in capital', 'same'),
    doc('b', 'Bridge opening in capital', 'same')];
  const graph = buildEventGraph(documents, vectorMap(documents, [[1, 0], [1, 0]]));
  assert.equal(evaluateGraph(documents, graph).graph.components.completeLabels, 1);
});

test('cross-language local triangle can group without lexical overlap', () => {
  const documents = [doc('a', 'Bridge opens today', 'same', 'en'),
    doc('b', 'Le pont ouvre ce jour', 'same', 'fr'),
    doc('c', 'Die Brücke öffnet heute', 'same', 'de'),
    doc('d', 'Most otwarto dzisiaj', 'same', 'pl')];
  const graph = buildEventGraph(documents, vectorMap(documents,
    documents.map(() => [1, 0])));
  const result = evaluateGraph(documents, graph);
  assert.equal(result.graph.components.completeLabels, 1);
  assert.ok(result.graph.mergeEdges.differentLanguageTrue > 0);
});

test('no fixed member cap and labels do not influence matcher', () => {
  const documents = Array.from({ length: 32 }, (_, i) =>
    doc(String(i), 'Same fictional event', 'all'));
  const vectors = vectorMap(documents, documents.map(() => [1, 0]));
  const first = buildEventGraph(documents, vectors);
  const changedGold = documents.map((item, i) => ({ ...item, cluster: `fake${i}` }));
  const second = buildEventGraph(changedGold, vectors);
  assert.deepEqual(first.assignments, second.assignments);
  assert.equal(new Set(first.assignments).size, 1);
});

test('same-host pairs cannot form candidate edges', () => {
  const documents = [doc('a', 'Same event', 'same'), doc('b', 'Same event', 'same')];
  documents[1].source = documents[0].source;
  const graph = buildEventGraph(documents, vectorMap(documents, [[1, 0], [1, 0]]));
  assert.equal(graph.candidates.length, 0);
  assert.equal(new Set(graph.assignments).size, 2);
});
