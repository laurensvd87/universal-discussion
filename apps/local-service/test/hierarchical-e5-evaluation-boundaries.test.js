import test from 'node:test';
import assert from 'node:assert/strict';
import { fitHierarchyCandidate, evaluateHierarchyCandidate, HIERARCHY_RULE_GRID }
  from '../src/domain/hierarchical-e5-evaluation.js';
import { compileHierarchyArtifact, scoreHierarchy } from '../src/domain/hierarchical-e5-matcher.js';

// Fresh orthogonal geometry only. These tests establish contracts, not E5 quality.
const axis = n => Array.from({ length: 384 }, (_, i) => i === n ? 1 : 0);
const rule = nodeId => ({ nodeId, enabled: true, minSimilarity: 0.8, meanSimilarity: 0.8,
  minMargin: 0, minNegativeMargin: 0, minSupport: 1 });
function artifact() {
  const nodes = [{ id: 'games', parentId: null }, { id: 'gta', parentId: 'games' },
    { id: 'nature', parentId: null }, { id: 'koalas', parentId: 'nature' }];
  const example = (id, nodeId, kind, direction) => ({ id, nodeId, kind, groupId: `origin-${id}`, vector: axis(direction) });
  return { schema: 'hierarchical-e5-v1', representation: 'raw-e5', representationHash: 'a'.repeat(64),
    taxonomyVersion: 'boundary-taxonomy', evidenceVersion: 'boundary-evidence', calibrationVersion: 'synthetic-only',
    calibrationStatus: 'synthetic', nodes, nodeRules: nodes.map(n => rule(n.id)), examples: [
      example('games-stop', 'games', 'stop', 0), example('gta-a', 'gta', 'positive', 1),
      example('gta-b', 'gta', 'positive', 1), example('nature-stop', 'nature', 'stop', 2),
      example('koala-a', 'koalas', 'positive', 3), example('koala-b', 'koalas', 'positive', 3),
      example('games-outside', 'games', 'outside', 4), example('nature-outside', 'nature', 'outside', 4)] };
}
function row(id, expectedTopicId, direction, split = 'development', groupId = `family-${id}`) {
  return { id, groupId, split, language: 'en', expectedTopicId, vector: axis(direction) };
}
function development() {
  return [['gta', 1], ['koalas', 3], [null, 4]].flatMap(([gold, direction], k) =>
    Array.from({ length: 3 }, (_, i) => row(`dev-${k}-${i}`, gold, direction)));
}
const fit = (a = artifact(), samples = development()) => fitHierarchyCandidate({ artifact: a, samples,
  minimumAcceptedGroups: 2, targetPrecision: 0.98 });
const evaluate = (a, samples) => evaluateHierarchyCandidate({ artifact: a, samples, split: 'test' });
const clone = value => structuredClone(value);

test('fitter admits the inclusive grid-work boundary and rejects excess before invalid-vector scoring', () => {
  const a = artifact();
  a.nodes = Array.from({ length: 100 }, (_, i) => ({ id: `root-${i}`, parentId: null }));
  a.nodeRules = a.nodes.map(n => rule(n.id)); a.examples = [];
  const gridSize = HIERARCHY_RULE_GRID.minimumSimilarities.length * HIERARCHY_RULE_GRID.margins.length *
    HIERARCHY_RULE_GRID.negativeMargins.length * HIERARCHY_RULE_GRID.independentSupport.length;
  assert.equal(gridSize * a.nodes.length * 250, 2_000_000);
  const samples = Array.from({ length: 250 }, (_, i) => row(`boundary-${i}`, null, 0));
  const acceptedBoundary = fit(a, samples);
  assert.equal(acceptedBoundary.developmentGroupCount, 250);
  assert.ok(acceptedBoundary.artifact.nodeRules.every(r => r.enabled === false));
  const oversized = [...samples, row('boundary-extra', null, 0)];
  // Finite but non-unit vectors fail only if scoring begins. Capacity must win.
  for (const sample of oversized) sample.vector.fill(0);
  assert.throws(() => fit(a, oversized), e => e instanceof RangeError && e.code === 'capacity');
});

test('fitting copies caller data and returns recursively frozen, detached rules and evidence', () => {
  const a = artifact(), samples = development(), fitted = fit(a, samples);
  const snapshot = clone(fitted);
  a.examples[1].vector.fill(0); a.examples[1].groupId = 'mutated-origin';
  a.nodeRules[1].enabled = false; a.nodes[1].parentId = null;
  samples[0].vector.fill(0); samples[0].expectedTopicId = null;
  assert.deepEqual(fitted, snapshot);
  assert.ok(Object.isFrozen(fitted.artifact.examples[1].vector));
  assert.ok(Object.isFrozen(fitted.artifact.nodeRules[1]));
  assert.throws(() => { fitted.artifact.examples[1].vector[1] = 0; }, TypeError);
  const result = evaluate(fitted.artifact, [row('detached-test', 'gta', 1, 'test')]);
  assert.equal(result.outcomes[0].primaryNodeId, 'gta');
});

test('evaluating changed held-out vectors never retunes or mutates the frozen candidate', () => {
  const fitted = fit(), before = clone(fitted.artifact);
  const correct = evaluate(fitted.artifact, [row('same-id', 'gta', 1, 'test')]);
  const wrong = evaluate(fitted.artifact, [row('same-id', 'gta', 3, 'test')]);
  assert.equal(correct.acceptedPrecision, 1); assert.equal(wrong.acceptedPrecision, 0);
  assert.equal(wrong.wrongBroad, 1);
  assert.equal(correct.artifactSha256, fitted.artifactSha256);
  assert.equal(wrong.artifactSha256, fitted.artifactSha256);
  assert.deepEqual(fitted.artifact, before);
  assert.equal(fitted.artifact.calibrationVersion, before.calibrationVersion);
});

test('evaluation copies rows and freezes outcome packets without freezing caller-owned samples', () => {
  const fitted = fit(), samples = [row('mutable-input', 'gta', 1, 'test')];
  const report = evaluate(fitted.artifact, samples), before = clone(report);
  assert.equal(Object.isFrozen(samples[0]), false);
  samples[0].vector.fill(0); samples[0].groupId = 'changed'; samples.push(row('extra', null, 4, 'test'));
  assert.deepEqual(report, before);
  assert.ok(Object.isFrozen(report.outcomes[0].work));
  assert.throws(() => { report.outcomes[0].primaryNodeId = 'nature'; }, TypeError);
});

test('invalid/distorted vectors reject instead of being normalized or silently dropped', () => {
  const fitted = fit();
  const nearUnit = axis(1); nearUnit[1] = 0.999;
  const badVectors = [Array(384).fill(0), nearUnit, axis(1).slice(0, 383), [...axis(1), 0],
    axis(1).map((x, i) => i === 5 ? NaN : x), axis(1).map((x, i) => i === 5 ? Infinity : x),
    axis(1).map((x, i) => i === 5 ? '0' : x), new Float64Array(axis(1))];
  const sparse = axis(1); delete sparse[5]; badVectors.push(sparse);
  for (const vector of badVectors) {
    const samples = [row('invalid-eval', 'gta', 1, 'test')]; samples[0].vector = vector;
    assert.throws(() => evaluate(fitted.artifact, samples), TypeError);
    const dev = development(); dev[0].vector = vector;
    assert.throws(() => fit(artifact(), dev), TypeError);
  }
  const outside = evaluate(fitted.artifact, [row('valid-but-unrelated', null, 5, 'test')]);
  assert.equal(outside.accepted, 0); assert.equal(outside.correctDeepestOutcome, 1);
});

test('duplicate development translations cannot meet the independent-group fitting minimum', () => {
  const samples = development();
  for (const sample of samples.filter(s => s.expectedTopicId === 'gta')) sample.groupId = 'one-gta-family';
  for (let i = 0; i < 40; i++) samples.push(row(`translation-${i}`, 'gta', 1, 'development', 'one-gta-family'));
  const fitted = fit(artifact(), samples), summary = fitted.summaries.find(s => s.nodeId === 'gta');
  assert.equal(summary.positiveGroups, 1); assert.equal(summary.enabled, false);
  assert.equal(fitted.artifact.nodeRules.find(r => r.nodeId === 'gta').enabled, false);
});

test('duplicating exemplar origins never creates independent support or a two-group rule', () => {
  const a = artifact();
  for (const e of a.examples.filter(e => e.nodeId === 'gta')) e.groupId = 'one-exemplar-origin';
  for (let i = 0; i < 30; i++) a.examples.push({ ...clone(a.examples[1]), id: `duplicate-exemplar-${i}` });
  const fitted = fit(a), r = fitted.artifact.nodeRules.find(r => r.nodeId === 'gta');
  assert.equal(r.enabled, true); assert.equal(r.minSupport, 1);
  const features = scoreHierarchy(compileHierarchyArtifact(fitted.artifact), {
    sourceId: 'group-probe', sourceVersion: 'test', representation: a.representation,
    representationHash: a.representationHash, vector: axis(1) });
  const f = features.features.find(f => f.nodeId === 'gta');
  assert.equal(f.positiveGroupCount, 1); assert.equal(f.support, 1);
  assert.equal(f.positiveSimilarities.length, 1);
});

test('one wrong translated capture makes its accepted independent group conservative', () => {
  const fitted = fit(), samples = [row('translation-en', 'gta', 1, 'test', 'shared-series'),
    row('translation-de', 'gta', 3, 'test', 'shared-series')];
  samples[1].language = 'de';
  const report = evaluate(fitted.artifact, samples);
  assert.equal(report.accepted, 2); assert.equal(report.safeAccepted, 1);
  assert.equal(report.acceptedGroups, 1); assert.equal(report.safeAcceptedGroups, 0);
  assert.equal(report.leafAcceptedGroups, 1); assert.equal(report.leafCorrectGroups, 0);
  assert.equal(report.leafGroupPrecision, 0); assert.equal(report.leafGroupPrecisionInterval95.lower, 0);
});

test('150 perfect independent leaves meet count but do not establish a 98-percent lower bound', () => {
  const fitted = fit(), samples = Array.from({ length: 150 }, (_, i) => row(`independent-${i}`, 'gta', 1, 'test'));
  const report = evaluate(fitted.artifact, samples);
  assert.equal(report.leafAcceptedGroups, 150); assert.equal(report.leafCorrectGroups, 150);
  assert.equal(report.leafGroupPrecision, 1);
  assert.equal(report.gate.enoughIndependentLeafDecisions, true);
  assert.equal(report.gate.observedLeafPrecisionPass, true);
  assert.ok(report.leafGroupPrecisionInterval95.lower > 0.97);
  assert.ok(report.leafGroupPrecisionInterval95.lower < 0.98);
  assert.equal(report.gate.intervalLowerBoundPass, false);
  assert.equal(report.gate.productionValidated, false);
  assert.equal(report.leafGroupPrecisionInterval95.method, 'Wilson-two-sided-95');
});

test('zero accepted leaves report null precision and interval, despite perfect outside accuracy', () => {
  const report = evaluate(fit().artifact, [row('outside-only', null, 5, 'test')]);
  assert.equal(report.coverage, 0); assert.equal(report.acceptedPrecision, null);
  assert.equal(report.leafGroupPrecision, null); assert.equal(report.leafGroupPrecisionInterval95, null);
  assert.equal(report.deepestOutcomeAccuracy, 1);
  assert.equal(report.gate.intervalLowerBoundPass, false); assert.equal(report.gate.observedLeafPrecisionPass, false);
  assert.equal(report.gate.productionValidated, false);
});

test('broad safe fallback and over-specific same-branch errors remain distinct metrics', () => {
  const fitted = fit(), broadOnly = clone(fitted.artifact);
  broadOnly.nodeRules.find(r => r.nodeId === 'gta').enabled = false;
  const fallback = evaluate(broadOnly, [row('broad-fallback', 'gta', 1, 'test')]);
  assert.equal(fallback.acceptedPrecision, 1); assert.equal(fallback.broadFallback, 1);
  assert.equal(fallback.correctDeepestOutcome, 0); assert.equal(fallback.leafAccepted, 0);
  const tooSpecific = evaluate(fitted.artifact, [row('too-specific', 'games', 1, 'test')]);
  assert.equal(tooSpecific.wrongBroad, 0); assert.equal(tooSpecific.broadFallback, 0);
  assert.equal(tooSpecific.acceptedPrecision, 0); assert.equal(tooSpecific.leafPrecision, 0);
});

test('a positive/outside exact tie cannot be fitted away with a zero-margin grid rule', () => {
  const a = artifact();
  a.examples.push({ id: 'contradictory-outside', groupId: 'contradictory-origin',
    nodeId: 'games', kind: 'outside', vector: axis(1) });
  const fitted = fit(a);
  assert.equal(fitted.artifact.nodeRules.find(r => r.nodeId === 'gta').enabled, false);
  const report = evaluate(fitted.artifact, [row('contradiction-test', 'gta', 1, 'test')]);
  assert.equal(report.accepted, 0); assert.equal(report.outcomes[0].primaryNodeId, null);
});
