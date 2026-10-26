import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { trainHierarchyLinearHeads } from '../src/domain/hierarchical-e5-linear-heads.js';
import { calibrateHierarchyHeadPolicy, compileHierarchyHeadAssignment, classifyHierarchyHeads } from '../src/domain/hierarchical-e5-head-policy.js';

const axis = direction => Array.from({ length: 384 }, (_, i) => i === direction ? 1 : 0);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const classes = [['gta', 0], ['minecraft', 1], ['games', 2], ['koalas', 3], ['nature', 4], [null, 5]];
function rows(split) {
  return classes.flatMap(([expectedTopicId, direction], k) => [0, 1].map(i => ({
    id: `${split}-${k}-${i}`, groupId: `${split}-origin-${k}-${i}`, split, language: ['en', 'de'][i],
    expectedTopicId, vector: axis(direction) })));
}
function model() {
  return trainHierarchyLinearHeads({ nodes: [{ id: 'games', parentId: null }, { id: 'gta', parentId: 'games' },
    { id: 'minecraft', parentId: 'games' }, { id: 'nature', parentId: null }, { id: 'koalas', parentId: 'nature' }],
    rows: rows('training').map(({ language, ...row }) => row), representation: 'raw-e5', representationHash: 'a'.repeat(64),
    trainingVersion: 'new-geometric-head-policy', lambda: 0.1 });
}
const calibrate = (m = model(), r = rows('calibration')) => calibrateHierarchyHeadPolicy({ model: m, rows: r,
  minimumAcceptedGroups: 2, targetPrecision: 1 });
const witness = direction => ({ sourceId: 'geometric-probe', sourceVersion: 'new-geometric-v1',
  representation: 'raw-e5', representationHash: 'a'.repeat(64), vector: axis(direction) });
const compile = (m, p) => compileHierarchyHeadAssignment({ model: m, policy: p });
function rehash(policy) { delete policy.policyHash;policy.policyHash = sha(policy);return policy; }

test('calibration is separate from training/development/test and rejects cohort ID/group leakage', () => {
  const m = model();
  for (const split of ['training', 'development', 'test']) assert.throws(() => calibrate(m, rows(split)));
  for (const key of ['id', 'groupId']) {
    const r = rows('calibration');r[0][key] = rows('training')[0][key];assert.throws(() => calibrate(m, r));
  }
  const r = rows('calibration');r[1].groupId = r[0].groupId;assert.throws(() => calibrate(m, r));
});

test('held-out decisions reach supported children, stop at parent and reject outside/unknown', () => {
  const m = model(), p = calibrate(m), handle = compile(m, p);
  assert.equal(p.productionValidated, false);assert.equal(p.experimental, true);
  for (const [gold, direction] of classes) {
    const d = classifyHierarchyHeads(handle, witness(direction));
    assert.equal(d.primaryNodeId, gold);assert.equal(d.productionValidated, false);
    assert.equal(d.policyHash, p.policyHash);assert.equal(d.modelParameterHash, m.parameterHash);
    assert.ok(Object.isFrozen(d.features));assert.ok(Object.isFrozen(d.paths));
    if (gold === 'gta') assert.deepEqual(d.paths, [['games', 'gta']]);
  }
  assert.equal(classifyHierarchyHeads(handle, witness(6)).status, 'unresolved');
  assert.equal(classifyHierarchyHeads(handle, witness(2)).reason, 'supported-parent-stop');
});

test('insufficient calibration support explicitly disables a child, not its accepted ancestor', () => {
  const m = model(), r = rows('calibration').filter(row => row.expectedTopicId !== 'gta' || row.id.endsWith('-0'));
  const p = calibrate(m, r);assert.equal(p.rules.find(rule => rule.nodeId === 'gta').enabled, false);
  assert.equal(classifyHierarchyHeads(compile(m, p), witness(0)).primaryNodeId, 'games');
});

test('model/policy identity, claimed production status and unsupported rule changes fail closed', () => {
  const m = model(), p = calibrate(m);
  for (const mutate of [p => { p.productionValidated = true; }, p => { p.modelParameterHash = 'b'.repeat(64); },
    p => { p.rules[0].minScore = -999; }, p => { p.rules[0].correctGroups = 999; },
    p => { p.rules[0].acceptedGroups = 0; }, p => { p.calibrationGroupHashes[0] = m.trainingGroupHashes[0]; }]) {
    const candidate = structuredClone(p);mutate(candidate);rehash(candidate);
    assert.throws(() => compile(m, candidate));
  }
  const changed = structuredClone(p);changed.rules[0].minMargin = 0;assert.throws(() => compile(m, changed));
  for (const key of ['representation', 'representationHash', 'trainingVersion']) {
    const changedModel = structuredClone(m);
    changedModel[key] = key === 'representation' ? 'pinned-ridge' : key === 'representationHash' ? 'b'.repeat(64) : 'another-training-version';
    assert.throws(() => compile(changedModel, p));
  }
});

test('calibration/compilation privately copy inputs and return frozen detached decisions', () => {
  const m = structuredClone(model()), r = rows('calibration'), p = calibrate(m, r), before = JSON.stringify(p);
  const mutable = structuredClone(p), handle = compile(m, mutable);
  m.heads[0].weights.fill(0);r[0].vector.fill(0);mutable.rules.forEach(rule => { rule.enabled = false; });
  assert.equal(JSON.stringify(p), before);assert.ok(Object.isFrozen(p.rules[0]));
  assert.equal(classifyHierarchyHeads(handle, witness(0)).primaryNodeId, 'gta');
});

test('hostile getters/proxies and invalid vectors do not execute caller code or normalize data', () => {
  let touched = 0;const m = model(), p = calibrate(m), handle = compile(m, p);
  const payload = { model: m, rows: rows('calibration'), minimumAcceptedGroups: 2, targetPrecision: 1 };
  Object.defineProperty(payload.rows[0], 'vector', { enumerable: true, get() { touched++;throw Error('PRIVATE'); } });
  assert.throws(() => calibrateHierarchyHeadPolicy(payload));assert.equal(touched, 0);
  assert.throws(() => compileHierarchyHeadAssignment(new Proxy({}, { ownKeys() { touched++;throw Error('PRIVATE'); } })));
  assert.equal(touched, 0);
  for (const vector of [axis(0).map(n => n * 2), new Float32Array(axis(0)), Array(384).fill(0)]) {
    assert.throws(() => classifyHierarchyHeads(handle, { ...witness(0), vector }));
  }
  assert.throws(() => classifyHierarchyHeads({}, witness(0)));
  assert.throws(() => classifyHierarchyHeads(handle, witness(0), { multiPath: true }));
});

test('root ambiguity cannot be bypassed by two locally accepted descendant heads', () => {
  const m = structuredClone(model()), p = structuredClone(calibrate(m));
  for (const head of m.heads) { head.weights.fill(0);head.weights[0] = head.nodeId === 'minecraft' ? -1 : 1;head.intercept = 0; }
  m.parameterHash = sha(m.heads);
  p.modelArtifactHash = sha(m);
  p.modelParameterHash = m.parameterHash;
  p.rules.forEach(rule => { rule.enabled = true;rule.minScore = 0.5;rule.minMargin = 0;
    rule.acceptedGroups = 2;rule.correctGroups = 2; });rehash(p);
  const d = classifyHierarchyHeads(compile(m, p), witness(0));
  assert.ok(d.features.find(f => f.nodeId === 'gta').accepted);
  assert.ok(d.features.find(f => f.nodeId === 'koalas').accepted);
  assert.equal(d.primaryNodeId, null);assert.deepEqual(d.paths, []);assert.equal(d.reason, 'ambiguous-branches');
});

test('finite calibration bound rejects before unsupported data can masquerade as fallback', () => {
  const m = model(), r = Array.from({ length: 513 }, (_, i) => ({ ...rows('calibration')[0], id: `over-${i}`, groupId: `over-group-${i}` }));
  assert.throws(() => calibrate(m, r), e => e.code === 'capacity');
});
