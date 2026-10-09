import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGraphPolicies } from './core.js';

function fixture(bridges) {
  const docs = Array.from({ length: 6 }, (_, i) => ({ id: String(i),
    eventKey: i < 3 ? 'fictional-a' : 'fictional-b',
    lang: ['en', 'de', 'fr'][i % 3] }));
  const vectors = new Map(docs.map((doc, i) => [doc.id, i]));
  const scores = Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 6 }, (_, j) => i === j ? 1 :
      (i < 3) === (j < 3) ? 0.99 : 0.20));
  for (const [i, j] of bridges) scores[i][j] = scores[j][i] = 0.98;
  return { docs, vectors, scorer: (a, b) => scores[a][b] };
}

test('single false bridge contaminates threshold components but not triangle graph', () => {
  const { docs, vectors, scorer } = fixture([[0, 3]]);
  const result = evaluateGraphPolicies(docs, vectors, scorer, 0.95);
  assert.equal(result.thresholdComponents.components.mixedGroups, 1);
  assert.equal(result.thresholdComponents.components.joinedFalse, 9);
  assert.equal(result.triangleSupportedComponents.components.mixedGroups, 0);
  assert.equal(result.twoIndependentSupportBridge.components.mixedGroups, 0);
  assert.equal(result.triangleSupportedComponents.eligibleEdges.falseEdges, 0);
});

test('two independent bridges can still merge false events and are not a safety proof', () => {
  const { docs, vectors, scorer } = fixture([[0, 3], [1, 4]]);
  const result = evaluateGraphPolicies(docs, vectors, scorer, 0.95);
  assert.equal(result.triangleSupportedComponents.components.mixedGroups, 0);
  assert.equal(result.twoIndependentSupportBridge.components.mixedGroups, 1);
  assert.equal(result.twoIndependentSupportBridge.components.joinedFalse, 9);
});

test('connected same-event clique is exactly recovered without a size cap', () => {
  const docs = Array.from({ length: 24 }, (_, i) =>
    ({ id: String(i), eventKey: 'one-fictional-event', lang: i % 2 ? 'de' : 'en' }));
  const vectors = new Map(docs.map((doc, i) => [doc.id, i]));
  const result = evaluateGraphPolicies(docs, vectors, () => 0.99, 0.95);
  for (const policy of Object.values(result)) {
    assert.equal(policy.components.completeEvents, 1);
    assert.equal(policy.components.joinedFalse, 0);
    assert.equal(policy.components.crossLanguageTrueJoined, 144);
  }
});

test('labels are used only in aggregate evaluation, not graph decisions', () => {
  const first = fixture([[0, 3]]);
  const changed = first.docs.map((doc, i) => ({ ...doc, eventKey: `other-${i}` }));
  const before = evaluateGraphPolicies(first.docs, first.vectors, first.scorer, 0.95);
  const after = evaluateGraphPolicies(changed, first.vectors, first.scorer, 0.95);
  for (const name of Object.keys(before))
    assert.equal(before[name].components.groups, after[name].components.groups);
});
