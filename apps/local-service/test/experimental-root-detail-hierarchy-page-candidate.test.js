import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePairedE5Input, describePairedE5Input } from '../src/domain/hierarchical-e5-paired-input.js';
import { trainHierarchyLinearHeads } from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import { calibrateHierarchyHeadPolicy } from '../src/domain/hierarchical-e5-observed-head-policy.js';
import { compileExperimentalHierarchyPageCandidate as compile, describeExperimentalHierarchyPageCandidate as describe,
  classifyExperimentalHierarchyPageCandidate as classify } from '../src/application/experimental-root-detail-hierarchy-page-candidate.js';

// Fresh geometric fixtures only. No corpus, captured page, encoder or model file.
const axis = (i, sign = 1) => Array.from({ length: 384 }, (_, j) => i === j ? sign : 0);
const inputDefinition = { bodyWeight: .5, titleWeight: .5, encoderHash: 'c'.repeat(64) };
const construction = 'b'.repeat(64);
const nodes = [{ id: 'games', parentId: null }, { id: 'gta', parentId: 'games' }, { id: 'online', parentId: 'gta' },
  { id: 'nature', parentId: null }, { id: 'animals', parentId: 'nature' }, { id: 'koalas', parentId: 'animals' }];
const classes = [['online', 0], ['gta', 1], ['games', 2], ['koalas', 3], ['animals', 4], ['nature', 5], [null, 6]];
function rows(split, root, disagree) {
  return classes.flatMap(([label, i]) => [0, 1, 2].map(j => ({ id: `${split}-${i}-${j}`, groupId: `${split}-family-${i}-${j}`,
    split, expectedTopicId: root ? (label === null ? null : i < 3 || (disagree && i === 3) ? 'games' : 'nature') : label,
    vector: axis(i) })));
}
function trained(root, disagree = false) {
  const representationHash = describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
  const model = trainHierarchyLinearHeads({ nodes: root ? nodes.filter(n => n.parentId === null) : nodes,
    rows: rows('training', root, disagree), representation: 'paired-raw-e5-body-title-v1', representationHash,
    trainingVersion: 'fresh-root-detail-application-geometry-v1', lambda: .1 });
  const policy = calibrateHierarchyHeadPolicy({ model,
    rows: rows('calibration', root, disagree).map(r => ({ ...r, language: 'en' })), minimumAcceptedGroups: 3, targetPrecision: 1 });
  return { model, policy };
}
const root = trained(true), detail = trained(false), conflictingRoot = trained(true, true);
function fixture(disagree = false) {
  const r = disagree ? conflictingRoot : root;
  return structuredClone({ inputDefinition, inputConstructionHash: construction, rootModel: r.model, rootPolicy: r.policy,
    detailModel: detail.model, detailPolicy: detail.policy, ownerGrouping: { revision: 'owner-v1', defaultMaxDepth: 1, overrides: [] } });
}
const witness = i => ({ sourceId: 'fresh-geometric-source', sourceVersion: 'version-exact-7', inputConstructionHash: construction,
  bodyVector: axis(i), titleVector: axis(i) });

test('independent root/detail agreement supports full depth; owner display only truncates', () => {
  const d = classify(compile(fixture()), witness(0));
  assert.deepEqual(d.supportedPath, ['games', 'gta', 'online']); assert.deepEqual(d.selectedPath, ['games']);
  assert.equal(d.deepestSupportedNodeId, 'online'); assert.equal(d.primaryNodeId, 'games'); assert.equal(d.reason, 'owner-depth-cut');
  assert.equal(d.independentRootId, 'games'); assert.equal(d.detailEvaluated, true); assert.equal(d.sourceVersion, 'version-exact-7');
  assert.equal(d.experimental, true); assert.equal(d.productionValidated, false); assert.equal(d.assignmentAuthority, false);
  for (const key of ['bodyVector', 'titleVector', 'vector', 'scores', 'features', 'confidence']) assert.equal(Object.hasOwn(d, key), false);
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.supportedPath) && Object.isFrozen(d.selectedPath));
});

test('default and deepest per-node override inspect full supported path without promoting it', () => {
  const a = fixture(); a.ownerGrouping.overrides = [{ nodeId: 'games', maxDepth: 1 }, { nodeId: 'gta', maxDepth: 2 },
    { nodeId: 'online', maxDepth: 3 }, { nodeId: 'nature', maxDepth: 2 }];
  const h = compile(a);
  assert.deepEqual(classify(h, witness(0)).selectedPath, ['games', 'gta', 'online']);
  assert.deepEqual(classify(h, witness(1)).selectedPath, ['games', 'gta']);
  assert.deepEqual(classify(h, witness(3)).selectedPath, ['nature', 'animals']);
  assert.deepEqual(classify(h, witness(5)).selectedPath, ['nature']);
  a.ownerGrouping.defaultMaxDepth = 8; a.ownerGrouping.overrides = [];
  assert.deepEqual(classify(compile(a), witness(2)).selectedPath, ['games']);
});

test('root ambiguity cannot be rescued by detail or owner overrides', () => {
  const a = fixture(); a.ownerGrouping.defaultMaxDepth = 8;
  const h = compile(a), w = witness(0), mixed = axis(0).map((v, i) => (v + axis(3)[i]) / Math.sqrt(2));
  w.bodyVector = mixed; w.titleVector = mixed;
  for (const input of [w, witness(6), witness(7)]) {
    const d = classify(h, input);
    assert.equal(d.status, 'unresolved'); assert.equal(d.reason, 'independent-root-unresolved');
    assert.equal(d.detailEvaluated, false); assert.deepEqual(d.supportedPath, []); assert.deepEqual(d.selectedPath, []);
  }
});

test('root/detail cross-root disagreement retains only independently accepted root', () => {
  const a = fixture(true); a.ownerGrouping.defaultMaxDepth = 8;
  const d = classify(compile(a), witness(3));
  assert.equal(d.reason, 'independent-root-detail-disagreement'); assert.equal(d.detailEvaluated, true);
  assert.deepEqual(d.supportedPath, ['games']); assert.deepEqual(d.selectedPath, ['games']);
});

test('unavailable zero-norm fusion is unresolved with no root fallback', () => {
  const d = classify(compile(fixture()), { ...witness(0), titleVector: axis(0, -1) });
  assert.equal(d.reason, 'zero-fused-norm'); assert.equal(d.status, 'unresolved'); assert.equal(d.independentRootId, null);
  assert.equal(d.detailEvaluated, false); assert.deepEqual(d.selectedPath, []);
});

test('builder identity is required even when paired namespace matches', () => {
  const h = compile(fixture());
  for (const value of [undefined, '', 'A'.repeat(64), 'd'.repeat(64)]) {
    assert.throws(() => classify(h, { ...witness(0), inputConstructionHash: value }));
  }
  const missing = witness(0); delete missing.inputConstructionHash; assert.throws(() => classify(h, missing));
  const a = fixture(); delete a.inputConstructionHash; assert.throws(() => compile(a));
  const b = fixture(); b.inputConstructionHash = 'd'.repeat(64); const other = describe(compile(b));
  assert.equal(other.representationHash, describe(h).representationHash);
  assert.notEqual(other.semanticIdentityHash, describe(h).semanticIdentityHash);
});

test('semantic identity excludes owner cuts while group identity includes canonicalized settings', () => {
  const a = fixture(); a.ownerGrouping.overrides = [{ nodeId: 'gta', maxDepth: 3 }, { nodeId: 'nature', maxDepth: 2 }];
  const first = describe(compile(a)); a.ownerGrouping.overrides.reverse(); assert.deepEqual(describe(compile(a)), first);
  a.ownerGrouping.revision = 'owner-v2'; a.ownerGrouping.defaultMaxDepth = 3;
  const second = describe(compile(a)); assert.equal(second.semanticIdentityHash, first.semanticIdentityHash);
  assert.notEqual(second.groupIdentityHash, first.groupIdentityHash); assert.notEqual(second.ownerGroupingHash, first.ownerGroupingHash);
});

test('private compiled artifacts, settings and decisions survive caller mutation', () => {
  const a = fixture(), h = compile(a), w = witness(0), d = classify(h, w);
  a.detailModel.nodes[0].id = 'changed'; a.rootModel.nodes[0].id = 'changed'; a.rootPolicy.schema = 'changed';
  a.ownerGrouping.defaultMaxDepth = 8; a.inputDefinition.encoderHash = 'f'.repeat(64); a.inputConstructionHash = 'f'.repeat(64);
  w.sourceVersion = 'changed'; w.bodyVector.fill(0); w.titleVector.fill(0);
  assert.deepEqual(classify(h, witness(0)), d); assert.equal(d.sourceVersion, 'version-exact-7');
  assert.throws(() => d.selectedPath.push('forged')); assert.ok(Object.isFrozen(describe(h)));
});

test('exact schemas, depth bounds and no personal/unknown overrides', () => {
  for (const change of [a => { a.personalGrouping = {}; }, a => { a.ownerGrouping.personal = true; },
    a => { a.ownerGrouping.defaultMaxDepth = '2'; }, a => { a.ownerGrouping.defaultMaxDepth = 9; },
    a => { a.ownerGrouping.overrides = [{ nodeId: 'unknown', maxDepth: 2 }]; },
    a => { a.ownerGrouping.overrides = [{ nodeId: 'online', maxDepth: 2 }]; },
    a => { a.ownerGrouping.overrides = [{ nodeId: 'gta', maxDepth: 3 }, { nodeId: 'gta', maxDepth: 3 }]; }]) {
    const a = fixture(); change(a); assert.throws(() => compile(a));
  }
  const h = compile(fixture()); assert.throws(() => classify(h, { ...witness(0), reply: true }));
  assert.throws(() => compile(fixture(), {})); assert.throws(() => describe(h, {}));
  assert.throws(() => classify(h, witness(0), {})); assert.throws(() => describe({})); assert.throws(() => classify({}, witness(0)));
});

test('getters, proxies and arbitrary coercion never execute', () => {
  let calls = 0;
  const proxy = new Proxy({}, { getPrototypeOf() { calls++; throw Error('trap'); }, ownKeys() { calls++; throw Error('trap'); } });
  assert.throws(() => compile(proxy));
  const a = fixture(); Object.defineProperty(a.ownerGrouping, 'revision', { enumerable: true, get() { calls++; return 'bad'; } });
  assert.throws(() => compile(a));
  const h = compile(fixture()), w = witness(0);
  Object.defineProperty(w, 'bodyVector', { enumerable: true, get() { calls++; return axis(0); } });
  assert.throws(() => classify(h, w)); assert.throws(() => classify(h, proxy));
  assert.throws(() => classify(h, { ...witness(0), bodyVector: proxy }));
  assert.throws(() => classify(h, { ...witness(0), inputConstructionHash: { toString() { calls++; return construction; } } }));
  const b = fixture(); b.ownerGrouping.defaultMaxDepth = { valueOf() { calls++; return 2; } }; assert.throws(() => compile(b));
  assert.equal(calls, 0);
});

test('paired-input/model representation and artifact tampering fail before use', () => {
  for (const change of [a => { a.inputDefinition.encoderHash = 'd'.repeat(64); },
    a => { a.detailPolicy.representationHash = 'd'.repeat(64); }, a => { a.rootModel.trainingVersion = 'different-model'; }]) {
    const a = fixture(); change(a); assert.throws(() => compile(a));
  }
});
