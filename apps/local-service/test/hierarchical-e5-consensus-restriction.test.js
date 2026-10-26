import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { trainHierarchyLinearHeads } from '../src/domain/hierarchical-e5-linear-heads.js';
import { calibrateHierarchyHeadPolicy, compileHierarchyHeadAssignment, classifyHierarchyHeads } from '../src/domain/hierarchical-e5-head-policy.js';
import { compileHierarchyConsensusRestriction, classifyHierarchyConsensusRestriction,
  CONSENSUS_RESTRICTION_ALGORITHM_VERSION, CONSENSUS_RESTRICTION_DEFINITION_HASH,
  HierarchyConsensusRestrictionError } from '../src/domain/hierarchical-e5-consensus-restriction.js';

// New axis-only fixtures, unrelated to real E5 vectors or any closed cohort.
const axis = direction => Array.from({ length: 384 }, (_, i) => i === direction ? 1 : 0);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const representationHash = '6'.repeat(64);
const categories = ['branch-a-leaf-one', 'branch-a-leaf-two', 'branch-a', 'branch-b-leaf', 'branch-b', null];
function rows(split) {
  return categories.flatMap((expectedTopicId, direction) => [0, 1].map(i => ({
    id: `consensus-${split}-${direction}-${i}`, groupId: `independent-${split}-${direction}-${i}`,
    split, language: i ? 'nl' : 'de', expectedTopicId, vector: axis(direction) })));
}
function fixture(lambda = 0.05) {
  const model = trainHierarchyLinearHeads({ nodes: [{ id: 'branch-a', parentId: null },
    { id: 'branch-a-leaf-one', parentId: 'branch-a' }, { id: 'branch-a-leaf-two', parentId: 'branch-a' },
    { id: 'branch-b', parentId: null }, { id: 'branch-b-leaf', parentId: 'branch-b' }],
    rows: rows('training').map(({ language, ...row }) => row), representation: 'raw-e5', representationHash,
    trainingVersion: 'independent-axis-consensus-fixture', lambda });
  const policy = calibrateHierarchyHeadPolicy({ model, rows: rows('calibration'), minimumAcceptedGroups: 2, targetPrecision: 1 });
  return { model, policy };
}
function input(body = 0, title = 0) {
  return { sourceId: 'synthetic-source-consensus', sourceVersion: 'exact-source-version-47',
    representation: 'raw-e5', representationHash, bodyVector: axis(body), titleVector: axis(title) };
}
const compile = pair => compileHierarchyConsensusRestriction(pair);
const decide = (body, title, pair = fixture()) => classifyHierarchyConsensusRestriction(compile(pair), input(body, title));
const invalid = action => assert.throws(action, error => error instanceof TypeError);

test('two agreeing accepted leaves preserve exactly the existing body path', () => {
  const decision = decide(0, 0);
  assert.deepEqual(decision.paths, [['branch-a', 'branch-a-leaf-one']]);
  assert.equal(decision.primaryNodeId, 'branch-a-leaf-one');
  assert.equal(decision.reason, 'body-path-confirmed');
  assert.equal(decision.views.body.primaryNodeId, decision.views.title.primaryNodeId);
});

test('a specific title never promotes a body parent; a title parent restricts a body leaf', () => {
  assert.deepEqual(decide(2, 0).paths, [['branch-a']]);
  assert.equal(decide(2, 0).reason, 'body-path-confirmed');
  const restricted = decide(0, 2);
  assert.deepEqual(restricted.paths, [['branch-a']]);
  assert.equal(restricted.reason, 'restricted-to-shared-ancestor');
});

test('different same-root leaves restrict to their approved common ancestor', () => {
  const decision = decide(0, 1);
  assert.deepEqual(decision.paths, [['branch-a']]);
  assert.equal(decision.views.body.primaryNodeId, 'branch-a-leaf-one');
  assert.equal(decision.views.title.primaryNodeId, 'branch-a-leaf-two');
  assert.equal(decision.reason, 'restricted-to-shared-ancestor');
});

test('different roots or either unresolved view abstain rather than choose a title branch', () => {
  for (const [body, title, reason] of [[0, 3, 'conflicting-root-branches'], [5, 0, 'body-unresolved'],
    [0, 5, 'title-unresolved'], [5, 5, 'body-unresolved']]) {
    const decision = decide(body, title);
    assert.equal(decision.status, 'unresolved'); assert.equal(decision.primaryNodeId, null);
    assert.deepEqual(decision.paths, []); assert.equal(decision.reason, reason);
  }
});

test('every possible axis pair produces a prefix of the original body path', () => {
  const pair = fixture(), handle = compile(pair), base = compileHierarchyHeadAssignment(pair);
  for (let body = 0; body < 6; body++) for (let title = 0; title < 6; title++) {
    const witness = input(body, title);
    const original = classifyHierarchyHeads(base, { sourceId: witness.sourceId, sourceVersion: witness.sourceVersion,
      representation: witness.representation, representationHash, vector: witness.bodyVector });
    const decision = classifyHierarchyConsensusRestriction(handle, witness);
    if (decision.paths.length) assert.deepEqual(decision.paths[0], original.paths[0].slice(0, decision.paths[0].length));
    if (!original.paths.length) assert.deepEqual(decision.paths, []);
  }
});

test('guard identity binds exact base artifacts and preserves source/version without confidence fields', () => {
  const pair = fixture(), decision = decide(0, 0, pair);
  assert.equal(decision.algorithmVersion, CONSENSUS_RESTRICTION_ALGORITHM_VERSION);
  assert.equal(decision.guardDefinitionHash, CONSENSUS_RESTRICTION_DEFINITION_HASH);
  assert.match(decision.guardHash, /^[a-f0-9]{64}$/u);
  assert.equal(decision.modelArtifactHash, digest(pair.model));
  assert.equal(decision.modelParameterHash, pair.model.parameterHash);
  assert.equal(decision.trainingHash, pair.model.trainingHash);
  assert.equal(decision.policyHash, pair.policy.policyHash);
  assert.equal(decision.sourceId, input().sourceId); assert.equal(decision.sourceVersion, input().sourceVersion);
  assert.equal(decision.representationHash, representationHash);
  assert.equal(decision.experimental, true); assert.equal(decision.productionValidated, false);
  assert.equal(decision.uncalibratedTransfer, true); assert.equal(decision.assignmentAuthority, false);
  assert.ok(!/vector|confidence|probability|features|scores/iu.test(Object.keys(decision).join(' ')));
  assert.notEqual(decision.guardHash, decide(0, 0, fixture(0.1)).guardHash);
});

test('different model/policy pairs, capability namespaces and representation identities fail', () => {
  const pair = fixture(), other = fixture(0.1), handle = compile(pair);
  invalid(() => compile({ model: other.model, policy: pair.policy }));
  invalid(() => classifyHierarchyConsensusRestriction(compileHierarchyHeadAssignment(pair), input()));
  invalid(() => classifyHierarchyHeads(handle, { sourceId: 'x', sourceVersion: 'v', representation: 'raw-e5', representationHash, vector: axis(0) }));
  invalid(() => classifyHierarchyConsensusRestriction({}, input()));
  for (const change of [{ representation: 'pinned-ridge' }, { representationHash: '7'.repeat(64) }]) {
    invalid(() => classifyHierarchyConsensusRestriction(handle, { ...input(), ...change }));
  }
});

test('mutations cannot change compiled state or detached deeply frozen results', () => {
  const pair = structuredClone(fixture()), handle = compile(pair), witness = input();
  const before = classifyHierarchyConsensusRestriction(handle, witness);
  pair.model.heads[0].weights.fill(0); pair.model.representationHash = '7'.repeat(64);
  pair.policy.rules.forEach(rule => { rule.enabled = false; });
  witness.bodyVector.fill(0); witness.titleVector.fill(0); witness.sourceVersion = 'changed';
  assert.deepEqual(classifyHierarchyConsensusRestriction(handle, input()), before);
  for (const value of [before, before.paths, before.paths[0], before.views, before.views.body, before.views.title]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { before.paths[0].push('promoted'); }, TypeError);
  assert.throws(() => { before.views.title.primaryNodeId = 'promoted'; }, TypeError);
});

test('proxy and accessor traps remain uninvoked at compilation, witness and vector boundaries', () => {
  let touches = 0;
  const hostile = target => new Proxy(target, {
    get() { touches++; throw Error('DO NOT EXECUTE'); },
    getPrototypeOf() { touches++; throw Error('DO NOT EXECUTE'); },
    ownKeys() { touches++; throw Error('DO NOT EXECUTE'); },
    getOwnPropertyDescriptor() { touches++; throw Error('DO NOT EXECUTE'); },
  });
  const pair = fixture(), handle = compile(pair);
  invalid(() => compile(hostile(pair)));
  invalid(() => compile({ model: hostile(pair.model), policy: pair.policy }));
  const getterPair = { model: pair.model, policy: pair.policy };
  Object.defineProperty(getterPair, 'model', { enumerable: true, get() { touches++; throw Error('NO'); } });
  invalid(() => compile(getterPair));
  const deepPair = structuredClone(pair);
  Object.defineProperty(deepPair.model.heads[0], 'weights', { enumerable: true, get() { touches++; throw Error('NO'); } });
  invalid(() => compile(deepPair));
  invalid(() => classifyHierarchyConsensusRestriction(handle, hostile(input())));
  for (const field of ['bodyVector', 'titleVector']) {
    invalid(() => classifyHierarchyConsensusRestriction(handle, { ...input(), [field]: hostile(axis(0)) }));
    const coordinates = axis(0);
    Object.defineProperty(coordinates, '0', { enumerable: true, get() { touches++; throw Error('NO'); } });
    invalid(() => classifyHierarchyConsensusRestriction(handle, { ...input(), [field]: coordinates }));
    const getterWitness = input();
    Object.defineProperty(getterWitness, field, { enumerable: true, get() { touches++; throw Error('NO'); } });
    invalid(() => classifyHierarchyConsensusRestriction(handle, getterWitness));
  }
  assert.equal(touches, 0);
});

test('exact arity, exact fields and finite bounded unit-vector contracts fail explicitly', () => {
  const pair = fixture(), handle = compile(pair);
  invalid(() => compileHierarchyConsensusRestriction()); invalid(() => compileHierarchyConsensusRestriction(pair, {}));
  invalid(() => compile({ ...pair, options: {} }));
  invalid(() => classifyHierarchyConsensusRestriction(handle));
  invalid(() => classifyHierarchyConsensusRestriction(handle, input(), {}));
  invalid(() => classifyHierarchyConsensusRestriction(handle, { ...input(), multiPath: true }));
  for (const bad of [new Float32Array(axis(0)), Array(384).fill(0), axis(0).slice(1), axis(0).map(n => n * 2)]) {
    invalid(() => classifyHierarchyConsensusRestriction(handle, { ...input(), titleVector: bad }));
  }
  const sparse = axis(0); delete sparse[5];
  invalid(() => classifyHierarchyConsensusRestriction(handle, { ...input(), bodyVector: sparse }));
  for (const oversized of [{ sourceVersion: 's'.repeat(161) }, { bodyVector: [...axis(0), 0] }]) {
    assert.throws(() => classifyHierarchyConsensusRestriction(handle, { ...input(), ...oversized }),
      error => error instanceof HierarchyConsensusRestrictionError && error.code === 'capacity');
  }
});
