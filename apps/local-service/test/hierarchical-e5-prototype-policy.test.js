import test from 'node:test';
import assert from 'node:assert/strict';
import { compileHierarchyPrototypeScores, describeHierarchyPrototypeScores } from '../src/domain/hierarchical-e5-prototype-scores.js';
import { compileHierarchyPrototypePolicy, describeHierarchyPrototypePolicy, classifyHierarchyPrototypePolicy }
  from '../src/domain/hierarchical-e5-prototype-policy.js';

// Fresh axes only. Explicit thresholds below are synthetic rules, not calibrated E5 values.
const axis = (k, sign = 1) => Array.from({ length: 384 }, (_, i) => i === k ? sign : 0);
function artifact() {
  return { schema: 'hierarchy-topic-descriptor-prototypes/v1', representation: 'paired-raw-e5-body-title-v1',
    representationHash: 'a'.repeat(64), nodes: [{ id: 'games', parentId: null, prototypes: [axis(0)] },
      { id: 'video', parentId: 'games', prototypes: [axis(1)] },
      { id: 'gta', parentId: 'video', prototypes: [axis(2)] },
      { id: 'other-game', parentId: 'video', prototypes: [axis(3)] },
      { id: 'nature', parentId: null, prototypes: [axis(4)] }] };
}
function policy(scorer) {
  const d = describeHierarchyPrototypeScores(scorer), nodes = d.nodes.map(({ id, parentId }) => ({ id, parentId }));
  return { schema: 'hierarchy-topic-descriptor-policy/v1', policyVersion: 'synthetic-explicit-rules-v1',
    scorerArtifactHash: d.artifactHash, representation: d.representation, representationHash: d.representationHash, nodes,
    nodeRules: nodes.map(n => ({ nodeId: n.id, enabled: true, minSubtreeScore: 0.8,
      minSiblingContrast: nodes.filter(x => x.parentId === n.parentId).length > 1 ? 0.05 : null,
      minParentDirectContrast: null })) };
}
const witness = vector => ({ sourceId: 'fresh-geometric-source', sourceVersion: 'capture-v1',
  representation: 'paired-raw-e5-body-title-v1', representationHash: 'a'.repeat(64), vector });
function context() {
  const a = artifact(), scorer = compileHierarchyPrototypeScores(a); return { a, scorer, p: policy(scorer) };
}
const classify = (vector, c = context()) => classifyHierarchyPrototypePolicy(compileHierarchyPrototypePolicy(c.scorer, c.p), witness(vector));
const invalid = fn => assert.throws(fn, e => e instanceof TypeError && e.code === 'invalid-input');

test('descendant union traverses one root and child path without a parent-centroid gate', () => {
  const result = classify(axis(2));
  assert.deepEqual(result.path, ['games', 'video', 'gta']); assert.equal(result.primaryNodeId, 'gta');
  assert.equal(result.reason, 'deepest-eligible-node'); assert.equal(result.sourceVersion, 'capture-v1');
  assert.equal(result.experimental, true); assert.equal(result.productionValidated, false);
  assert.equal(result.calibrationStatus, 'uncalibrated');
  assert.equal(Object.hasOwn(result, 'vector'), false); assert.equal(Object.hasOwn(result, 'features'), false);
  assert.ok(result.work.policyEvaluations <= 5); assert.equal(result.work.scalarProducts, 5 * 384);
});

test('generic or unknown-child evidence stops at the deepest eligible parent instead of forcing a leaf', () => {
  assert.deepEqual(classify(axis(0)).path, ['games']);
  const result = classify(axis(1));
  assert.deepEqual(result.path, ['games', 'video']); assert.equal(result.reason, 'supported-parent-stop');
  assert.equal(classify(axis(100)).reason, 'no-eligible-root');
});

test('eligible sibling ambiguity keeps the supported parent; eligible root ambiguity abstains', () => {
  const c = context(); for (const r of c.p.nodeRules) { r.minSubtreeScore = 0.6; if (r.minSiblingContrast !== null) r.minSiblingContrast = 0; }
  const children = axis(2); children[2] = Math.SQRT1_2; children[3] = Math.SQRT1_2;
  const stopped = classify(children, c);
  assert.deepEqual(stopped.path, ['games', 'video']); assert.equal(stopped.reason, 'ambiguous-children');
  const roots = axis(2); roots[2] = Math.SQRT1_2; roots[4] = Math.SQRT1_2;
  const rejected = classify(roots, c);
  assert.deepEqual(rejected.path, []); assert.equal(rejected.reason, 'ambiguous-roots');
  assert.equal(rejected.primaryNodeId, null); assert.equal(rejected.status, 'unresolved');
});

test('negative sibling contrast rules can make unequal peers ambiguous without a top-one tiebreak', () => {
  const c = context();
  for (const r of c.p.nodeRules) { r.minSubtreeScore = 0; if (r.minSiblingContrast !== null) r.minSiblingContrast = -2; }
  assert.equal(classify(axis(2), c).reason, 'ambiguous-roots');
});

test('optional parent-direct contrast prevents a premature child and disabled nodes stay ineligible', () => {
  const c = context(), mixed = axis(1); mixed[1] = 0.6; mixed[2] = 0.8;
  c.p.nodeRules.find(r => r.nodeId === 'gta').minParentDirectContrast = 0.3;
  assert.deepEqual(classify(mixed, c).path, ['games', 'video']);
  c.p.nodeRules.find(r => r.nodeId === 'gta').minParentDirectContrast = 0.1;
  assert.deepEqual(classify(mixed, c).path, ['games', 'video', 'gta']);
  c.p.nodeRules.find(r => r.nodeId === 'video').enabled = false;
  assert.deepEqual(classify(axis(2), c).path, ['games']);
});

test('all-negative prototypes are compared as raw scores, never clamped or treated as probabilities', () => {
  const a = artifact(); a.nodes = [{ id: 'one', parentId: null, prototypes: [axis(0)] }];
  const scorer = compileHierarchyPrototypeScores(a), p = policy(scorer), c = { scorer, p };
  assert.equal(classify(axis(0, -1), c).status, 'unresolved');
  p.nodeRules[0].minSubtreeScore = -1;
  assert.equal(classify(axis(0, -1), c).primaryNodeId, 'one', 'Only the explicit synthetic negative threshold permits this assignment');
});

test('policy identity binds scorer, representation, exact topology and per-node threshold settings', () => {
  const c = context(), first = describeHierarchyPrototypePolicy(compileHierarchyPrototypePolicy(c.scorer, c.p));
  c.p.nodes.reverse(); c.p.nodeRules.reverse();
  assert.deepEqual(describeHierarchyPrototypePolicy(compileHierarchyPrototypePolicy(c.scorer, c.p)), first);
  c.p.nodeRules[0].minSubtreeScore = 0.9;
  assert.notEqual(describeHierarchyPrototypePolicy(compileHierarchyPrototypePolicy(c.scorer, c.p)).policyHash, first.policyHash);
  const wrong = context(); wrong.a.nodes[0].prototypes = [axis(10)];
  invalid(() => compileHierarchyPrototypePolicy(compileHierarchyPrototypeScores(wrong.a), wrong.p));
  for (const mutate of [p => { p.scorerArtifactHash = 'b'.repeat(64); }, p => { p.representationHash = 'b'.repeat(64); },
    p => { p.representation = 'raw-e5'; }, p => { p.nodes[0].parentId = 'nature'; }]) {
    const d = context(); mutate(d.p); invalid(() => compileHierarchyPrototypePolicy(d.scorer, d.p));
  }
});

test('compiled rules and returned decisions are detached and recursively frozen', () => {
  const c = context(), handle = compileHierarchyPrototypePolicy(c.scorer, c.p);
  const before = classifyHierarchyPrototypePolicy(handle, witness(axis(2)));
  c.p.nodeRules.forEach(r => { r.enabled = false; }); c.p.nodes[0].id = 'mutated';
  c.a.nodes[0].prototypes[0].fill(0);
  assert.deepEqual(classifyHierarchyPrototypePolicy(handle, witness(axis(2))), before);
  assert.ok(Object.isFrozen(before.path)); assert.ok(Object.isFrozen(before.work));
  assert.throws(() => before.path.push('mutated'), TypeError);
  assert.ok(Object.isFrozen(describeHierarchyPrototypePolicy(handle).definition.nodeRules));
});

test('classification rejects forged features, wrong witnesses and capabilities rather than trusting caller scores', () => {
  const c = context(), handle = compileHierarchyPrototypePolicy(c.scorer, c.p);
  invalid(() => classifyHierarchyPrototypePolicy(handle, { ...witness(axis(2)), features: [{ subtreeScore: 1 }] }));
  invalid(() => classifyHierarchyPrototypePolicy(handle, { ...witness(axis(2)), representationHash: 'b'.repeat(64) }));
  invalid(() => classifyHierarchyPrototypePolicy(handle, { ...witness(axis(2)), vector: Array(384).fill(0) }));
  invalid(() => compileHierarchyPrototypePolicy({}, c.p));
  invalid(() => classifyHierarchyPrototypePolicy({}, witness(axis(2))));
});

test('exact schemas/proxies/accessors reject without executing hostile code', () => {
  const c = context(); let touched = 0; const poison = () => { touched++; throw Error('Private trap'); };
  invalid(() => compileHierarchyPrototypePolicy(c.scorer, new Proxy(c.p, { ownKeys: poison })));
  const p = structuredClone(c.p); Object.defineProperty(p.nodeRules[0], 'enabled', { enumerable: true, get: poison });
  invalid(() => compileHierarchyPrototypePolicy(c.scorer, p));
  invalid(() => compileHierarchyPrototypePolicy(c.scorer, { ...c.p, accepted: true }));
  const handle = compileHierarchyPrototypePolicy(c.scorer, c.p), w = witness(axis(2));
  Object.defineProperty(w, 'vector', { enumerable: true, get: poison });
  invalid(() => classifyHierarchyPrototypePolicy(handle, w)); assert.equal(touched, 0);
});

test('missing/duplicate rules, nonsensical topology contrasts and invalid thresholds fail closed', () => {
  for (const mutate of [p => { p.nodeRules.pop(); }, p => { p.nodeRules[1] = p.nodeRules[0]; },
    p => { p.nodeRules[0].minSubtreeScore = NaN; }, p => { p.nodeRules[0].minSubtreeScore = 1.1; },
    p => { p.nodeRules[0].enabled = 'yes'; },
    p => { p.nodeRules.find(r => r.nodeId === 'video').minSiblingContrast = 0; },
    p => { p.nodeRules.find(r => r.nodeId === 'gta').minSiblingContrast = null; },
    p => { p.nodeRules.find(r => r.nodeId === 'games').minParentDirectContrast = 0; }]) {
    const c = context(); mutate(c.p); invalid(() => compileHierarchyPrototypePolicy(c.scorer, c.p));
  }
  const c = context(); c.p.nodeRules = Array(1025).fill(c.p.nodeRules[0]);
  assert.throws(() => compileHierarchyPrototypePolicy(c.scorer, c.p), e => e.code === 'capacity');
});
