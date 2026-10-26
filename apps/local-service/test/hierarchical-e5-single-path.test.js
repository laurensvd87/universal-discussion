import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSinglePathHierarchy, classifySinglePathHierarchy, SINGLE_PATH_ALGORITHM_VERSION }
  from '../src/domain/hierarchical-e5-single-path.js';
import { compileHierarchyArtifact, classifyHierarchy, HierarchyMatcherError }
  from '../src/domain/hierarchical-e5-matcher.js';

// Axis geometry checks the decision contract, not E5 quality or calibration.
const hash = 'c'.repeat(64);
const axis = index => Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
const similarity = value => {
  const v = axis(0);
  v[0] = value; v[1] = Math.sqrt(1 - value * value);
  return v;
};
const witness = (vector = axis(0)) => ({ sourceId: 'independent-synthetic-source', sourceVersion: 'source-v3',
  representation: 'raw-e5', representationHash: hash, vector });
function artifact(otherSimilarity = 0) {
  const nodes = [{ id: 'a', parentId: null }, { id: 'a-child', parentId: 'a' },
    { id: 'b', parentId: null }, { id: 'b-child', parentId: 'b' }];
  return { schema: 'hierarchical-e5-v1', representation: 'raw-e5', representationHash: hash,
    taxonomyVersion: 'synthetic-taxonomy-v2', evidenceVersion: 'axis-evidence-v2',
    calibrationVersion: 'unvalidated-v2-rules', calibrationStatus: 'synthetic', nodes,
    examples: ['a-child', 'b-child'].flatMap((nodeId, index) => [0, 1].map(group => ({
      id: `${nodeId}-${group}`, nodeId, kind: 'positive', groupId: `${nodeId}-family-${group}`,
      vector: index ? similarity(otherSimilarity) : axis(0),
    }))),
    nodeRules: nodes.map(node => ({ nodeId: node.id, enabled: true,
      minSimilarity: 0.5, meanSimilarity: 0.5, minSupport: 2, minMargin: 0.1, minNegativeMargin: 0 })),
  };
}
const decide = (a, w = witness()) => classifySinglePathHierarchy(compileSinglePathHierarchy(a), w);
const invalid = action => assert.throws(action, error => error instanceof HierarchyMatcherError && error.code === 'invalid-input');

test('v2 rejects identical root evidence even when v1 descendants bypass root ambiguity', () => {
  const a = artifact(1);
  for (const rule of a.nodeRules) rule.minMargin = 0;
  const original = classifyHierarchy(compileHierarchyArtifact(a), witness(), { multiPath: true });
  assert.deepEqual(original.paths, [['a', 'a-child'], ['b', 'b-child']]);
  const d = decide(a);
  assert.equal(d.status, 'unresolved');
  assert.equal(d.reason, 'ambiguous-root-branches');
  assert.equal(d.primaryNodeId, null);
  assert.deepEqual(d.paths, []);
  assert.equal(d.features.find(feature => feature.nodeId === 'a').siblingMargin, 0);
});

test('root contrast remains strict at zero and enforces the copied 0.1 margin', () => {
  const tie = artifact(1);
  tie.nodeRules.forEach(rule => { rule.minMargin = 0; });
  assert.equal(decide(tie).status, 'unresolved');
  const below = artifact(0.95);
  assert.equal(decide(below).reason, 'ambiguous-root-branches');
  const above = artifact(0.8);
  assert.deepEqual(decide(above).paths, [['a', 'a-child']]);
  const tiny = artifact(1 - Number.EPSILON);
  tiny.nodeRules.forEach(rule => { rule.minMargin = 0; });
  assert.deepEqual(decide(tiny).paths, [['a', 'a-child']]);
});

test('exact positive boundary is inclusive, without inventing tolerance', () => {
  // Binary arithmetic computes 1 - 0.9; use that exact feature value as boundary.
  const a = artifact(0.9);
  const boundary = 1 - 0.9;
  a.nodeRules.find(rule => rule.nodeId === 'a').minMargin = boundary;
  assert.deepEqual(decide(a).paths, [['a', 'a-child']]);
  a.nodeRules.find(rule => rule.nodeId === 'a').minMargin = boundary + Number.EPSILON;
  assert.equal(decide(a).reason, 'ambiguous-root-branches');
});

test('accepted child supplies ancestry with disabled or absolutely unsupported parent', () => {
  for (const disabled of [true, false]) {
    const a = artifact(0);
    const root = a.nodeRules.find(rule => rule.nodeId === 'a');
    root.enabled = !disabled;
    root.minSupport = 8;
    const d = decide(a);
    assert.deepEqual(d.paths, [['a', 'a-child']]);
    const rootFeature = d.features.find(feature => feature.nodeId === 'a');
    assert.equal(rootFeature.absoluteSupported, false);
    assert.equal(rootFeature.accepted, false);
  }
});

test('disabled child cannot be selected, while supported root may stop', () => {
  const a = artifact(0);
  a.nodeRules.find(rule => rule.nodeId === 'a-child').enabled = false;
  const d = decide(a);
  assert.deepEqual(d.paths, [['a']]);
  assert.equal(d.primaryNodeId, 'a');
  assert.equal(d.reason, 'supported-parent-stop');
  a.nodeRules.find(rule => rule.nodeId === 'a').enabled = false;
  assert.equal(decide(a).reason, 'insufficient-evidence');
});

test('one-root taxonomy permits null sibling margin and preserves all witnesses', () => {
  const a = artifact();
  a.nodes = a.nodes.filter(node => node.id.startsWith('a'));
  a.examples = a.examples.filter(row => row.nodeId.startsWith('a'));
  a.nodeRules = a.nodeRules.filter(rule => rule.nodeId.startsWith('a'));
  const d = decide(a);
  assert.deepEqual(d.paths, [['a', 'a-child']]);
  assert.equal(d.features.find(feature => feature.nodeId === 'a').siblingMargin, null);
  for (const field of ['sourceId', 'sourceVersion', 'representation', 'representationHash']) assert.equal(d[field], witness()[field]);
  for (const field of ['taxonomyVersion', 'evidenceVersion', 'calibrationVersion', 'calibrationStatus']) assert.equal(d[field], a[field]);
  assert.equal(d.algorithmVersion, SINGLE_PATH_ALGORITHM_VERSION);
  assert.equal(d.algorithmVersion, 'hierarchical-e5-single-path/v2');
  assert.equal(d.productionValidated, false);
});

test('opaque capability namespaces, representation identity and vectors are enforced', () => {
  const a = artifact();
  const compiled = compileSinglePathHierarchy(a);
  invalid(() => classifySinglePathHierarchy({}, witness()));
  invalid(() => classifySinglePathHierarchy(compileHierarchyArtifact(a), witness()));
  invalid(() => classifyHierarchy(compiled, witness()));
  invalid(() => classifySinglePathHierarchy(compiled, witness(), { multiPath: true }));
  invalid(() => classifySinglePathHierarchy(compiled, { ...witness(), representationHash: 'd'.repeat(64) }));
  invalid(() => classifySinglePathHierarchy(compiled, witness(Array(384).fill(0))));
  invalid(() => classifySinglePathHierarchy(compiled, witness(axis(0).slice(1))));
  invalid(() => compileSinglePathHierarchy({ ...a, schema: 'hierarchical-e5-v2' }));
});

test('private artifact copy, root margins and returned decisions resist caller mutation', () => {
  const a = artifact(0.8);
  const compiled = compileSinglePathHierarchy(a);
  const w = witness();
  const before = classifySinglePathHierarchy(compiled, w);
  a.nodeRules[0].minMargin = 2;
  a.nodes[0].id = 'replaced';
  a.nodes[1].parentId = null;
  a.examples[0].vector.fill(0);
  a.representationHash = 'd'.repeat(64);
  assert.deepEqual(classifySinglePathHierarchy(compiled, w), before);
  w.vector.fill(0);
  assert.deepEqual(classifySinglePathHierarchy(compiled, witness()), before);
  for (const value of [before, before.paths, before.paths[0], before.features,
    before.features[0], before.features[0].positiveSimilarities, before.work]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { before.paths[0].push('fake'); }, TypeError);
  assert.throws(() => { before.features[0].siblingMargin = 2; }, TypeError);
});
