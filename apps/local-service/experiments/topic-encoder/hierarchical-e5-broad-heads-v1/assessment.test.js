// Separate broad paired-input reporting adaptation; closed experiment B remains unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { balancedDevelopmentLoss, evaluateFrozenHeads, wilson95 } from './assessment.js';
import { trainHierarchyLinearHeads } from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import { calibrateHierarchyHeadPolicy } from '../../../src/domain/hierarchical-e5-paired-head-policy.js';

// Fresh coordinate geometry only: no corpus imports, embeddings, fitted E5 heads
// or previously locked model outcomes. This checks reporting, not model quality.
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const axis = index => Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
const clone = value => structuredClone(value);
const nodes = [{ id: 'a', parentId: null }, { id: 'a1', parentId: 'a' },
  { id: 'a2', parentId: 'a' }, { id: 'b', parentId: null }];
const assignments = ['a1', 'a2', 'a', 'b', null];
function rowsFor(split) {
  return assignments.flatMap((expectedTopicId, coordinate) => [0, 1].map(index => ({
    id: `axis-${split}-${coordinate}-${index}`, groupId: `independent-${split}-${coordinate}-${index}`,
    split, language: ['en', 'de', 'nl'][coordinate % 3], expectedTopicId, vector: axis(coordinate),
  })));
}
function modelFor(lambda = 0.01) {
  const rows = rowsFor('training').map(({ language, ...row }) => row);
  return trainHierarchyLinearHeads({ nodes, rows, representation: 'paired-raw-e5-body-title-v1',
    representationHash: 'e'.repeat(64), trainingVersion: 'new-axis-report-fixture', lambda });
}
function fixture() {
  const model = modelFor();
  const policy = calibrateHierarchyHeadPolicy({ model, rows: rowsFor('calibration'), minimumAcceptedGroups: 2, targetPrecision: 1 });
  return { model, policy, rows: rowsFor('test'), developmentIdHashes: [], developmentGroupHashes: [] };
}
function sample(id, coordinate, expectedTopicId, split = 'test') {
  return { id, groupId: `family-${id}`, split, language: 'en', expectedTopicId, vector: axis(coordinate) };
}
function policyWith(f, change) {
  const policy = clone(f.policy);
  change(policy);
  const { policyHash, ...body } = policy;
  policy.policyHash = digest(body);
  return policy;
}

test('development loss is a macro average of node-balanced classes, not overall row MSE', () => {
  const model = clone(modelFor());
  const constants = { a: 0.2, a1: 0.7, a2: -0.4, b: -0.1 };
  for (const head of model.heads) { head.weights.fill(0); head.intercept = constants[head.nodeId]; }
  model.parameterHash = digest({schema:model.schema,representation:model.representation,representationHash:model.representationHash,heads:model.heads});
  const rows = [sample('d0', 0, 'a1', 'development'), sample('d1', 0, 'a1', 'development'),
    sample('d2', 0, 'a1', 'development'), sample('d3', 3, 'b', 'development'),
    sample('d4', 4, null, 'development'), sample('d5', 4, null, 'development')];
  const result = balancedDevelopmentLoss(model, rows);
  assert.ok(Math.abs(result.loss - 0.975) < 1e-12);
  assert.deepEqual(result.byNode.map(row => [row.nodeId, row.positiveRows, row.negativeRows]),
    [['a', 3, 3], ['a1', 3, 3], ['a2', 0, 6], ['b', 1, 5]]);
  assert.ok(Math.abs(result.byNode.find(row => row.nodeId === 'b').loss - 1.01) < 1e-12);
  // With no positive a2 row, the documented single-class fallback stays finite.
  assert.ok(Math.abs(result.byNode.find(row => row.nodeId === 'a2').loss - 0.36) < 1e-12);
  assert.equal(result.rows, 6); assert.equal(result.split, 'development');
  assert.equal(result.calibrationUsed, false); assert.equal(result.testUsed, false);
});

test('development selection rejects wrong splits, training provenance and dependent groups', () => {
  const model = modelFor();
  assert.throws(() => balancedDevelopmentLoss(model, rowsFor('calibration')));
  assert.throws(() => balancedDevelopmentLoss(model, rowsFor('test')));
  assert.throws(() => balancedDevelopmentLoss(model, []));
  for (const field of ['id', 'groupId']) {
    const rows = rowsFor('development');
    rows[0][field] = rowsFor('training')[0][field];
    assert.throws(() => balancedDevelopmentLoss(model, rows), /Split provenance overlaps/u);
  }
  for (const field of ['id', 'groupId']) {
    const rows = rowsFor('development'); rows[1][field] = rows[0][field];
    assert.throws(() => balancedDevelopmentLoss(model, rows));
  }
  const unknown = rowsFor('development'); unknown[0].expectedTopicId = 'not-in-taxonomy';
  assert.throws(() => balancedDevelopmentLoss(model, unknown));
});

test('frozen-head reporting binds exact model and policy identities and remains experimental', () => {
  const f = fixture();
  const result = evaluateFrozenHeads(f);
  assert.equal(result.modelArtifactHash, digest(f.model));
  assert.equal(result.policyHash, f.policy.policyHash);
  assert.equal(result.gate.productionValidated, false);
  assert.equal(result.gate.representativeWebValidation, false);
  assert.equal(result.independentGroups, 10);
  assert.equal(result.rowCount, 10);
  assert.equal(result.split, 'test');
  for (const field of ['productionValidated', 'experimental']) {
    const model = clone(f.model); model[field] = field === 'productionValidated';
    assert.throws(() => evaluateFrozenHeads({ ...f, model }));
    const policy = policyWith(f, p => { p[field] = field === 'productionValidated'; });
    assert.throws(() => evaluateFrozenHeads({ ...f, policy }));
  }
  assert.throws(() => evaluateFrozenHeads({ ...f, model: modelFor(0.02) }));
  assert.throws(() => evaluateFrozenHeads({ ...f, policy: { ...f.policy, policyHash: 'f'.repeat(64) } }));
  assert.throws(() => evaluateFrozenHeads({ ...f, developmentIdHashes: undefined }));
  assert.throws(() => evaluateFrozenHeads({ ...f, developmentGroupHashes: undefined }));
});

test('final test reporting rejects overlap with training, calibration and development identities or groups', () => {
  const f = fixture();
  for (const blockedSplit of ['training', 'calibration']) for (const field of ['id', 'groupId']) {
    const rows = rowsFor('test'); rows[0][field] = rowsFor(blockedSplit)[0][field];
    assert.throws(() => evaluateFrozenHeads({ ...f, rows }), /Split provenance overlaps/u);
  }
  for (const field of ['id', 'groupId']) {
    const key = field === 'id' ? 'developmentIdHashes' : 'developmentGroupHashes';
    assert.throws(() => evaluateFrozenHeads({ ...f, [key]: [hash(f.rows[0][field])] }), /Split provenance overlaps/u);
    const rows = rowsFor('test'); rows[1][field] = rows[0][field];
    assert.throws(() => evaluateFrozenHeads({ ...f, rows }));
  }
  for (const split of ['training', 'development', 'calibration']) {
    assert.throws(() => evaluateFrozenHeads({ ...f, rows: rowsFor(split) }));
  }
  assert.throws(() => evaluateFrozenHeads({ ...f, rows: [] }));
  const rows = rowsFor('test'); rows[0].expectedTopicId = 'invented-leaf';
  assert.throws(() => evaluateFrozenHeads({ ...f, rows }));
});

test('two-sided Wilson uncertainty does not mistake 150 perfect leaves for a 98% lower bound', () => {
  assert.equal(wilson95(0, 0), null);
  assert.ok(wilson95(150, 150).lower < 0.98);
  assert.ok(wilson95(300, 300).lower > 0.98);
  assert.equal(wilson95(0, 300).lower, 0);
  assert.ok(Math.abs(wilson95(300, 300).upper - 1) < 1e-15);
  assert.equal(wilson95(300, 300).method, 'Wilson-two-sided-95');
  assert.match(wilson95(300, 300).assumption, /independent-group/u);
  for (const pair of [[1, 0], [-1, 1], [0.5, 1], [1, 1.5], [NaN, 1]]) assert.throws(() => wilson95(...pair));
  const f = fixture();
  for (const count of [150, 300]) {
    const rows = Array.from({ length: count }, (_, i) => sample(`fresh-perfect-${i}`, 0, 'a1'));
    const result = evaluateFrozenHeads({ ...f, rows });
    assert.equal(result.leafAccepted, count);
    assert.equal(result.leafCorrect, count);
    assert.equal(result.gate.enoughIndependentLeafDecisions, true);
    assert.equal(result.gate.observedLeafPrecisionPass, true);
    assert.equal(result.gate.leafIntervalLowerBoundPass, count === 300);
    assert.equal(result.gate.productionValidated, false);
  }
});

test('zero assignments have null precision even when outside rejections are exact outcomes', () => {
  const f = fixture();
  const policy = policyWith(f, p => { p.rules.forEach(rule => { rule.enabled = false; }); });
  const rows = [sample('zero0', 4, null), sample('zero1', 4, null), sample('zero2', 0, 'a1')];
  const result = evaluateFrozenHeads({ ...f, policy, rows });
  assert.equal(result.accepted, 0); assert.equal(result.safeAccepted, 0);
  assert.equal(result.acceptedPrecision, null); assert.equal(result.coverage, 0);
  assert.equal(result.leafPrecision, null); assert.equal(result.leafPrecisionInterval95, null);
  assert.equal(result.correctDeepestOutcome, 2); assert.equal(result.deepestOutcomeAccuracy, 2 / 3);
  assert.equal(result.gate.observedLeafPrecisionPass, false);
  assert.equal(result.gate.leafIntervalLowerBoundPass, false);
});

test('whole-path metrics distinguish safe ancestors, over-specific leaves, wrong roots and rejection', () => {
  const f = fixture();
  const rows = [sample('ancestor', 2, 'a1'), sample('too-deep', 0, 'a'),
    sample('wrong-root', 3, 'a1'), sample('outside', 4, null)];
  const result = evaluateFrozenHeads({ ...f, rows });
  assert.deepEqual(result.outcomes.map(row => row.primaryNodeId), ['a', 'a1', 'b', null]);
  assert.equal(result.accepted, 3); assert.equal(result.safeAccepted, 1);
  assert.equal(result.acceptedPrecision, 1 / 3); assert.equal(result.coverage, 3 / 4);
  assert.equal(result.broadFallback, 1); assert.equal(result.overSpecificSameBranch, 1);
  assert.equal(result.wrongBroad, 1); assert.equal(result.observedBroadError, 1 / 4);
  assert.equal(result.leafAccepted, 2); assert.equal(result.leafCorrect, 0); assert.equal(result.leafPrecision, 0);
  assert.equal(result.correctDeepestOutcome, 1); assert.equal(result.deepestOutcomeAccuracy, 1 / 4);
  assert.deepEqual(result.outcomes.map(row => row.safeAccepted), [true, false, false, false]);
  assert.deepEqual(result.byGoldDepth.map(row => [row.value, row.rows]), [[2, 2], [1, 1], [0, 1]]);
  assert.deepEqual(result.byGoldBranch.map(row => [row.value, row.rows]), [['a', 3], ['outside', 1]]);
  assert.ok(result.timing.p95Ms >= result.timing.medianMs);
  assert.ok(result.timing.maximumMs >= result.timing.p95Ms);
});

test('wrong siblings are not mislabeled as over-specific descendants', () => {
  const result = evaluateFrozenHeads({ ...fixture(), rows: [sample('new-sibling-error', 0, 'a2')] });
  assert.equal(result.outcomes[0].primaryNodeId, 'a1');assert.equal(result.wrongSameBranch, 1);
  assert.equal(result.wrongSiblingOrCousin, 1);assert.equal(result.overSpecificSameBranch, 0);
});
