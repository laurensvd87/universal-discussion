import test from 'node:test';
import assert from 'node:assert/strict';
import { fitHierarchyCandidate, evaluateHierarchyCandidate } from '../src/domain/hierarchical-e5-evaluation.js';

const vector = axis => Array.from({ length: 384 }, (_, i) => i === axis ? 1 : 0);
function fixture() {
  const nodes = [{ id: 'games', parentId: null }, { id: 'gta', parentId: 'games' },
    { id: 'nature', parentId: null }, { id: 'koalas', parentId: 'nature' }];
  const prototype = (id, nodeId, kind, axis) => ({ id, nodeId, kind, groupId: id, vector: vector(axis) });
  return { schema: 'hierarchical-e5-v1', representation: 'raw-e5', representationHash: 'a'.repeat(64),
    taxonomyVersion: 'taxonomy-v1', evidenceVersion: 'evidence-v1', calibrationVersion: 'unfitted', calibrationStatus: 'synthetic', nodes,
    examples: [prototype('generic-games', 'games', 'stop', 0), prototype('gta-1', 'gta', 'positive', 1),
      prototype('gta-2', 'gta', 'positive', 1), prototype('generic-nature', 'nature', 'stop', 2),
      prototype('koalas-1', 'koalas', 'positive', 3), prototype('koalas-2', 'koalas', 'positive', 3),
      prototype('outside-games', 'games', 'outside', 4), prototype('outside-nature', 'nature', 'outside', 4)],
    nodeRules: nodes.map(node => ({ nodeId: node.id, enabled: true, minSimilarity: 0, meanSimilarity: 0,
      minMargin: 0, minNegativeMargin: 0, minSupport: 1 })) };
}
function samples(split = 'development') {
  return [['gta', 1], ['koalas', 3], [null, 4]].flatMap(([expectedTopicId, axis], index) =>
    Array.from({ length: 3 }, (_, j) => ({ id: `${split}-${index}-${j}`, groupId: `${split}-family-${index}-${j}`,
      split, language: ['en', 'de', 'nl'][j], expectedTopicId, vector: vector(axis) })));
}
const fit = (artifact = fixture(), rows = samples()) => fitHierarchyCandidate({ artifact, samples: rows,
  minimumAcceptedGroups: 2, targetPrecision: 0.98 });

test('development fitting produces explicit per-node candidate rules without a production claim', () => {
  const result = fit();
  assert.equal(result.productionValidated, false);assert.equal(result.fittingSplit, 'development');
  assert.match(result.artifactSha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.artifact.calibrationStatus, 'candidate');
  assert.ok(result.summaries.some(row => row.nodeId === 'gta' && row.enabled && row.observedPrecision === 1));
  assert.ok(Object.isFrozen(result.artifact.nodeRules));
});

test('locked split evaluation measures real classifier decisions and uncertainty without retuning', () => {
  const fitted = fit(), before = JSON.stringify(fitted.artifact);
  const result = evaluateHierarchyCandidate({ artifact: fitted.artifact, samples: samples('test'), split: 'test' });
  assert.equal(result.artifactSha256, fitted.artifactSha256);assert.equal(JSON.stringify(fitted.artifact), before);
  assert.equal(result.rowCount, 9);assert.equal(result.accepted, 6);assert.equal(result.acceptedPrecision, 1);
  assert.equal(result.correctDeepestOutcome, 9);assert.equal(result.leafAcceptedGroups, 6);
  assert.equal(result.gate.productionValidated, false);assert.equal(result.gate.enoughIndependentLeafDecisions, false);
  assert.ok(result.leafGroupPrecisionInterval95.lower < 0.98);assert.equal(result.byLanguage.length, 3);
  assert.ok(result.timing.p95Ms >= 0);assert.equal(result.wrongBroad, 0);
});

test('calibration/final-test rows cannot be used to fit thresholds and evidence leakage is rejected', () => {
  assert.throws(() => fit(fixture(), samples('test')), /Invalid hierarchy evaluation/u);
  assert.throws(() => fit(fixture(), samples('calibration')), /Invalid hierarchy evaluation/u);
  for (const field of ['id', 'groupId']) {
    const artifact = fixture(), rows = samples();rows[0][field] = artifact.examples[0][field];
    assert.throws(() => fit(artifact, rows), /Invalid hierarchy evaluation/u);
    rows[0].split = 'test';
    assert.throws(() => evaluateHierarchyCandidate({ artifact, samples: [rows[0]], split: 'test' }), /Invalid hierarchy evaluation/u);
  }
});

test('insufficient independent support disables a topic instead of manufacturing confidence', () => {
  const rows = samples().filter(row => row.expectedTopicId !== 'gta' || row.id.endsWith('-0'));
  const result = fit(fixture(), rows);
  assert.equal(result.artifact.nodeRules.find(rule => rule.nodeId === 'gta').enabled, false);
});

test('translations within one family cannot multiply independent evaluation support', () => {
  const fitted = fit(), rows = samples('test');
  rows.filter(row => row.expectedTopicId === 'gta').forEach(row => { row.groupId = 'same-gta-family'; });
  const report = evaluateHierarchyCandidate({ artifact: fitted.artifact, samples: rows, split: 'test' });
  assert.equal(report.leafAccepted, 6);assert.equal(report.leafAcceptedGroups, 4);
});

test('accessors, proxies and nonfinite data are rejected without executing untrusted code', () => {
  let touched = 0;
  const payload = { artifact: fixture(), samples: samples(), minimumAcceptedGroups: 2, targetPrecision: 1 };
  Object.defineProperty(payload.samples[0], 'vector', { enumerable: true, get() { touched++;throw Error('PRIVATE'); } });
  assert.throws(() => fitHierarchyCandidate(payload));assert.equal(touched, 0);
  const proxy = new Proxy({}, { getPrototypeOf() { touched++;throw Error('PRIVATE'); } });
  assert.throws(() => fitHierarchyCandidate(proxy));assert.equal(touched, 0);
  assert.throws(() => fitHierarchyCandidate({ artifact: fixture(), samples: samples(), minimumAcceptedGroups: 2, targetPrecision: NaN }));
});

test('unknown split, duplicate ids and inconsistent gold within a family fail closed', () => {
  const artifact = fixture();
  const duplicate = samples();duplicate[1].id = duplicate[0].id;assert.throws(() => fit(artifact, duplicate));
  const mixed = samples();mixed[3].groupId = mixed[0].groupId;assert.throws(() => fit(artifact, mixed));
  assert.throws(() => evaluateHierarchyCandidate({ artifact, samples: samples(), split: 'training' }));
});
