import test from 'node:test';
import assert from 'node:assert/strict';
import { compileHierarchyPrototypeScores, describeHierarchyPrototypeScores, scoreHierarchyPrototypeScores,
  HIERARCHY_PROTOTYPE_LIMITS, HierarchyPrototypeScoreError } from '../src/domain/hierarchical-e5-prototype-scores.js';

// Fresh analytic vectors, not descriptors encoded by a model or E5 quality data.
const axis = (k, sign = 1) => Array.from({ length: 384 }, (_, i) => i === k ? sign : 0);
function artifact() {
  return { schema: 'hierarchy-topic-descriptor-prototypes/v1', representation: 'raw-e5', representationHash: 'a'.repeat(64),
    nodes: [{ id: 'games', parentId: null, prototypes: [axis(0)] },
      { id: 'video', parentId: 'games', prototypes: [axis(1)] },
      { id: 'gta', parentId: 'video', prototypes: [axis(2), axis(3)] },
      { id: 'other-game', parentId: 'video', prototypes: [axis(4)] },
      { id: 'nature', parentId: null, prototypes: [axis(5)] }] };
}
const witness = vector => ({ sourceId: 'new-synthetic-source', sourceVersion: 'new-synthetic-v1',
  representation: 'raw-e5', representationHash: 'a'.repeat(64), vector });
const score = (vector, a = artifact()) => scoreHierarchyPrototypeScores(compileHierarchyPrototypeScores(a), witness(vector));
const f = (result, id) => result.features.find(row => row.nodeId === id);
const invalid = (fn, code = 'invalid-input') => assert.throws(fn, e => e instanceof HierarchyPrototypeScoreError && e.code === code);

test('exact direct maxima and descendant union support broad ancestors without a parent direct gate', () => {
  const result = score(axis(2));
  assert.equal(f(result, 'gta').directScore, 1); assert.equal(f(result, 'video').directScore, 0);
  assert.equal(f(result, 'video').subtreeScore, 1); assert.equal(f(result, 'games').subtreeScore, 1);
  assert.equal(f(result, 'games').directScore, 0);
  assert.equal(f(result, 'gta').parentDirectContrast, 1);
  assert.equal(f(result, 'video').parentDirectContrast, 1);
  assert.equal(f(result, 'games').parentDirectContrast, null);
  assert.equal(result.experimental, true); assert.equal(result.productionValidated, false);
  assert.equal(Object.hasOwn(result, 'primaryNodeId'), false); assert.equal(Object.hasOwn(result, 'accepted'), false);
});

test('sibling contrasts include root peers and ties; a sole sibling has no manufactured contrast', () => {
  const result = score(axis(2));
  assert.equal(f(result, 'gta').siblingContrast, 1); assert.equal(f(result, 'other-game').siblingContrast, -1);
  assert.equal(f(result, 'games').siblingContrast, 1); assert.equal(f(result, 'nature').siblingContrast, -1);
  assert.equal(f(result, 'video').siblingContrast, null);
  const both = axis(2); both[2] = Math.SQRT1_2; both[4] = Math.SQRT1_2;
  assert.equal(f(score(both), 'gta').siblingContrast, 0);
  assert.equal(f(score(both), 'other-game').siblingContrast, 0);
});

test('all negative direct scores stay negative and unrelated inputs still return raw features only', () => {
  const a = artifact(); a.nodes = [{ id: 'one', parentId: null, prototypes: [axis(0)] }];
  const negative = score(axis(0, -1), a);
  assert.equal(f(negative, 'one').directScore, -1); assert.equal(f(negative, 'one').subtreeScore, -1);
  assert.equal(f(negative, 'one').siblingContrast, null);
  const unrelated = score(axis(100));
  assert.ok(unrelated.features.every(row => row.directScore === 0 && row.subtreeScore === 0));
  assert.equal(Object.hasOwn(unrelated, 'status'), false);
});

test('work witnesses account for every declared prototype and exact coordinate product', () => {
  const a = artifact(), result = score(axis(3), a);
  assert.equal(result.work.dotProducts, 6); assert.equal(result.work.scalarProducts, 6 * 384);
  assert.equal(result.work.subtreeComparisons, 3);
  assert.ok(result.work.siblingComparisons <= a.nodes.length * 3);
  assert.equal(f(result, 'gta').directScore, 1);
});

test('canonical node order makes hash/features/work stable while declared prototype order remains bound', () => {
  const a = artifact(), b = artifact(); b.nodes.reverse();
  assert.deepEqual(score(axis(2), a), score(axis(2), b));
  const original = describeHierarchyPrototypeScores(compileHierarchyPrototypeScores(a));
  const swapped = artifact(); swapped.nodes.find(n => n.id === 'gta').prototypes.reverse();
  const changed = describeHierarchyPrototypeScores(compileHierarchyPrototypeScores(swapped));
  assert.notEqual(original.artifactHash, changed.artifactHash);
  assert.deepEqual(score(axis(2), a).features, score(axis(2), swapped).features);
  const signed = artifact(); signed.nodes[0].prototypes[0][3] = -0;
  assert.notEqual(describeHierarchyPrototypeScores(compileHierarchyPrototypeScores(signed)).artifactHash, original.artifactHash);
});

test('compiled prototypes, taxonomy and frozen outputs are isolated from caller mutation', () => {
  const a = artifact(), handle = compileHierarchyPrototypeScores(a), input = witness(axis(2));
  const result = scoreHierarchyPrototypeScores(handle, input), before = structuredClone(result);
  a.nodes[0].prototypes[0].fill(0); a.nodes[0].id = 'mutated'; input.vector.fill(0);
  assert.deepEqual(scoreHierarchyPrototypeScores(handle, witness(axis(2))), before);
  assert.deepEqual(result, before); assert.ok(Object.isFrozen(result.features[0]));
  assert.ok(Object.isFrozen(result.nodes)); assert.throws(() => { result.features[0].directScore = 7; }, TypeError);
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) { assert.notEqual(key, 'vector'); assert.notEqual(key, 'prototypes'); inspect(item); }
  };
  inspect(result);
});

test('paired and raw namespaces are explicit exact identities, without an automatic geometry fallback', () => {
  const a = artifact(); a.representation = 'paired-raw-e5-body-title-v1';
  const handle = compileHierarchyPrototypeScores(a);
  invalid(() => scoreHierarchyPrototypeScores(handle, witness(axis(2))));
  const result = scoreHierarchyPrototypeScores(handle, { ...witness(axis(2)), representation: a.representation });
  assert.equal(result.representation, a.representation);
  invalid(() => scoreHierarchyPrototypeScores(handle, { ...witness(axis(2)), representation: a.representation, representationHash: 'b'.repeat(64) }));
  for (const representation of ['pinned-ridge', 'unknown']) invalid(() => compileHierarchyPrototypeScores({ ...artifact(), representation }));
  invalid(() => compileHierarchyPrototypeScores({ ...artifact(), representationHash: 'A'.repeat(64) }));
});

test('hostile proxies/getters, sparse or extended arrays, and unknown fields never execute caller code', () => {
  let touched = 0; const poison = () => { touched++; throw Error('Hostile trap'); };
  invalid(() => compileHierarchyPrototypeScores(new Proxy(artifact(), { ownKeys: poison })));
  const a = artifact(); Object.defineProperty(a.nodes[0], 'prototypes', { enumerable: true, get: poison });
  invalid(() => compileHierarchyPrototypeScores(a));
  const b = artifact(); Object.defineProperty(b.nodes[0].prototypes[0], '1', { enumerable: true, get: poison });
  invalid(() => compileHierarchyPrototypeScores(b));
  const c = artifact(); c.nodes[0].prototypes = new Proxy([axis(0)], { get: poison });
  invalid(() => compileHierarchyPrototypeScores(c));
  const d = artifact(); d.nodes[0].extra = 'not-allowed'; invalid(() => compileHierarchyPrototypeScores(d));
  const e = artifact(); e.nodes[0].prototypes[0][Symbol('extra')] = true; invalid(() => compileHierarchyPrototypeScores(e));
  const handle = compileHierarchyPrototypeScores(artifact()), w = witness(axis(2));
  Object.defineProperty(w, 'vector', { enumerable: true, get: poison }); invalid(() => scoreHierarchyPrototypeScores(handle, w));
  invalid(() => describeHierarchyPrototypeScores({})); invalid(() => scoreHierarchyPrototypeScores({}, witness(axis(2))));
  assert.equal(touched, 0);
});

test('vector validation copies unit binary64 values rather than normalizing malformed inputs', () => {
  for (const vector of [Array(384).fill(0), Array(384).fill(1), new Float64Array(axis(0)), axis(0).slice(1),
    axis(0).map((n, i) => i === 3 ? Infinity : n), axis(0).map((n, i) => i === 3 ? NaN : n)]) {
    const a = artifact(); a.nodes[0].prototypes = [vector]; invalid(() => compileHierarchyPrototypeScores(a));
    invalid(() => score(vector));
  }
  invalid(() => score([...axis(0), 0]), 'capacity');
  const nearUnit = axis(2); nearUnit[2] = 0.999999;
  assert.equal(f(score(nearUnit), 'gta').directScore, 0.999999);
});

test('invalid taxonomy, empty prototype regions, node/depth/prototype/witness bounds reject explicitly', () => {
  for (const mutate of [a => { a.nodes[0].parentId = 'gta'; }, a => { a.nodes[1].parentId = 'absent'; },
    a => { a.nodes[1].id = a.nodes[0].id; }, a => { a.nodes[0].prototypes = []; }, a => { a.nodes = []; }]) {
    const a = artifact(); mutate(a); invalid(() => compileHierarchyPrototypeScores(a));
  }
  const oversized = artifact(); oversized.nodes = Array(1025).fill(oversized.nodes[0]);
  invalid(() => compileHierarchyPrototypeScores(oversized), 'capacity');
  const extra = artifact(); extra.nodes[0].prototypes = Array(5).fill(axis(0));
  invalid(() => compileHierarchyPrototypeScores(extra), 'capacity');
  const deep = artifact(); deep.nodes = Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, parentId: i ? `n${i - 1}` : null, prototypes: [axis(0)] }));
  invalid(() => compileHierarchyPrototypeScores(deep), 'capacity');
  const handle = compileHierarchyPrototypeScores(artifact());
  invalid(() => scoreHierarchyPrototypeScores(handle, { ...witness(axis(0)), sourceId: '😀'.repeat(81) }), 'capacity');
  invalid(() => scoreHierarchyPrototypeScores(handle, { ...witness(axis(0)), sourceVersion: ' ' }));
});

test('the maximum declared prototype population has inclusive preflight and exhaustive bounded scoring', () => {
  const a = artifact(), p = axis(0);
  a.nodes = Array.from({ length: 1024 }, (_, i) => ({ id: `n-${i}`, parentId: null, prototypes: [p, p, p, p] }));
  const handle = compileHierarchyPrototypeScores(a), result = scoreHierarchyPrototypeScores(handle, witness(p));
  assert.equal(result.prototypeCount, 4096); assert.equal(result.features.length, 1024);
  assert.equal(result.work.scalarProducts, 1_572_864);
  assert.ok(result.work.scalarProducts <= HIERARCHY_PROTOTYPE_LIMITS.maxScalarProducts);
  assert.ok(result.features.every(row => row.directScore === 1 && row.siblingContrast === 0));
});
