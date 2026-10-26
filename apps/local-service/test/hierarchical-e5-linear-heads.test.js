import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { trainHierarchyLinearHeads, compileHierarchyLinearHeads, scoreHierarchyLinearHeads,
  LINEAR_HEAD_LIMITS, HierarchyLinearHeadError } from '../src/domain/hierarchical-e5-linear-heads.js';

// New geometric fixtures establish arithmetic and safety only, never E5 quality.
const axis = (direction, sign = 1) => Array.from({ length: 384 }, (_, i) => i === direction ? sign : 0);
const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(value));
function fixture() {
  return { nodes: [{ id: 'games', parentId: null }, { id: 'gta', parentId: 'games' },
    { id: 'nature', parentId: null }, { id: 'koalas', parentId: 'nature' }],
  representation: 'raw-e5', representationHash: 'a'.repeat(64), trainingVersion: 'new-geometric-training-v1',
  lambda: 0.1, rows: [['gta', 0], ['games', 1], ['nature', 2], [null, 3]].flatMap(([expectedTopicId, direction], k) =>
    Array.from({ length: 2 }, (_, i) => ({ id: `private-training-row-${k}-${i}`, groupId: `private-origin-${k}-${i}`,
      split: 'training', expectedTopicId, vector: axis(direction) }))) };
}
const witness = vector => ({ sourceId: 'probe', sourceVersion: 'geometric-v1', representation: 'raw-e5',
  representationHash: 'a'.repeat(64), vector });
const score = (model, vector) => scoreHierarchyLinearHeads(compileHierarchyLinearHeads(model), witness(vector));
const raw = (model, vector, nodeId) => score(model, vector).scores.find(h => h.nodeId === nodeId).score;
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} versus ${expected}`);
const invalid = (fn, code = 'invalid-input') => assert.throws(fn, e => e instanceof HierarchyLinearHeadError && e.code === code);

test('centered dual Ridge reproduces an independently derived affine solution with nonzero intercept', () => {
  const input = fixture(); input.nodes = [{ id: 'one', parentId: null }]; input.lambda = 2;
  input.rows = Array.from({ length: 6 }, (_, i) => ({ id: `affine-${i}`, groupId: `affine-origin-${i}`,
    split: 'training', expectedTopicId: i < 2 ? 'one' : null, vector: axis(0, i < 2 ? 1 : -1) }));
  const model = trainHierarchyLinearHeads(input), h = model.heads[0];
  // X mean and target mean are -1/3; sum centered squares=16/3.
  // w=(16/3)/(16/3+2)=8/11; b=mean(y)-w*mean(x)=-1/11.
  close(h.weights[0], 8 / 11); close(h.intercept, -1 / 11);
  assert.ok(h.weights.slice(1).every(w => w === 0));
  close(raw(model, axis(0), 'one'), 7 / 11);
  close(raw(model, axis(0, -1), 'one'), -9 / 11);
  close(raw(model, axis(1), 'one'), -1 / 11);
  assert.equal(model.experimental, true); assert.equal(model.productionValidated, false);
});

test('descendant positives support approved ancestors, broad-only rows do not label a child', () => {
  const model = trainHierarchyLinearHeads(fixture());
  const games = model.heads.find(h => h.nodeId === 'games'), gta = model.heads.find(h => h.nodeId === 'gta');
  assert.equal(games.positiveGroups, 4); assert.equal(games.negativeGroups, 4);
  assert.equal(gta.positiveGroups, 2); assert.equal(gta.negativeGroups, 6);
  assert.ok(raw(model, axis(0), 'games') > 0); assert.ok(raw(model, axis(0), 'gta') > 0);
  assert.ok(raw(model, axis(1), 'games') > 0); assert.ok(raw(model, axis(1), 'gta') < 0);
  assert.ok(raw(model, axis(3), 'games') < 0); assert.ok(raw(model, axis(3), 'nature') < 0);
});

test('at least two positive and two negative independent groups are required for enabled heads', () => {
  const model = trainHierarchyLinearHeads(fixture()), absent = model.heads.find(h => h.nodeId === 'koalas');
  assert.equal(absent.enabled, false); assert.equal(absent.positiveGroups, 0);
  assert.equal(absent.intercept, 0); assert.ok(absent.weights.every(w => w === 0));
  const onePositive = fixture(); onePositive.rows.splice(0, 1);
  assert.equal(trainHierarchyLinearHeads(onePositive).heads.find(h => h.nodeId === 'gta').enabled, false);
  const noNegatives = fixture(); noNegatives.rows = noNegatives.rows.slice(0, 2);
  assert.ok(trainHierarchyLinearHeads(noNegatives).heads.every(h => !h.enabled));
});

test('one shared Gram and Cholesky factor serve all enabled heads with exact work counts', () => {
  const model = trainHierarchyLinearHeads(fixture()), n = 8, d = 384;
  const enabled = model.heads.filter(h => h.enabled).length;
  assert.equal(model.trainingWork.gramProducts, n * (n + 1) / 2 * d);
  assert.equal(model.trainingWork.choleskyProducts, n * (n - 1) * (n + 1) / 6);
  assert.equal(model.trainingWork.solveProducts, enabled * n * (n - 1));
  assert.equal(model.trainingWork.weightProducts, enabled * n * d);
  assert.ok(model.trainingWork.units <= LINEAR_HEAD_LIMITS.maxTrainingWork);
  const result = score(model, axis(0));
  assert.equal(result.work.dotProducts, enabled); assert.equal(result.work.scalarProducts, enabled * 384);
  assert.equal(result.scores.find(h => h.nodeId === 'koalas').score, 0);
});

test('serialized output retains coefficients and opaque provenance, never training rows or vectors', () => {
  const input = fixture(), model = trainHierarchyLinearHeads(input), serialized = JSON.stringify(model);
  for (const row of input.rows) {
    assert.equal(serialized.includes(row.id), false); assert.equal(serialized.includes(row.groupId), false);
  }
  const scan = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.notEqual(key, 'rows'); assert.notEqual(key, 'vector'); scan(child);
    }
  };
  scan(model);
  assert.deepEqual(model.trainingIdHashes, input.rows.map(r => sha(r.id)).sort());
  assert.deepEqual(model.trainingGroupHashes, input.rows.map(r => sha(r.groupId)).sort());
  assert.equal(model.provenanceHash, digest({ trainingIdHashes: model.trainingIdHashes, trainingGroupHashes: model.trainingGroupHashes }));
  assert.ok(Object.isFrozen(model.heads[0].weights)); assert.ok(Object.isFrozen(model.trainingIdHashes));
});

test('node and row order are canonical, repeated fitting is deterministic, hash identities bind their inputs', () => {
  const input = fixture(), reordered = fixture(); reordered.nodes.reverse(); reordered.rows.reverse();
  const first = trainHierarchyLinearHeads(input);
  assert.deepEqual(trainHierarchyLinearHeads(reordered), first);
  assert.deepEqual(trainHierarchyLinearHeads(input), first);
  const changedLambda = fixture(); changedLambda.lambda = 2;
  const second = trainHierarchyLinearHeads(changedLambda);
  assert.equal(second.trainingHash, first.trainingHash); assert.notEqual(second.settingsHash, first.settingsHash);
  assert.notEqual(second.parameterHash, first.parameterHash);
  const changedVersion = fixture(); changedVersion.trainingVersion = 'new-version';
  assert.notEqual(trainHierarchyLinearHeads(changedVersion).trainingHash, first.trainingHash);
  const changedParent = fixture(); changedParent.nodes[1].parentId = null;
  assert.notEqual(trainHierarchyLinearHeads(changedParent).taxonomyHash, first.taxonomyHash);
});

test('caller mutation cannot affect the trained artifact, compiled heads or returned scores', () => {
  const input = fixture(), trained = trainHierarchyLinearHeads(input), snapshot = structuredClone(trained);
  input.rows[0].vector.fill(0); input.nodes[0].id = 'mutated';
  assert.deepEqual(trained, snapshot);
  const serialized = structuredClone(trained), compiled = compileHierarchyLinearHeads(serialized);
  const before = scoreHierarchyLinearHeads(compiled, witness(axis(0)));
  serialized.heads[0].weights.fill(100); serialized.heads[0].intercept = 100;
  serialized.trainingIdHashes.fill('b'.repeat(64));
  assert.deepEqual(scoreHierarchyLinearHeads(compiled, witness(axis(0))), before);
  assert.ok(Object.isFrozen(before.scores[0]));
  assert.throws(() => { before.scores[0].score = 100; }, TypeError);
  invalid(() => scoreHierarchyLinearHeads({}, witness(axis(0))));
});

test('split leakage, duplicate IDs and duplicate origin groups reject instead of inflating independence', () => {
  for (const split of ['development', 'calibration', 'test']) {
    const a = fixture(); a.rows[0].split = split; invalid(() => trainHierarchyLinearHeads(a));
  }
  for (const key of ['id', 'groupId']) {
    const a = fixture(); a.rows[1][key] = a.rows[0][key]; invalid(() => trainHierarchyLinearHeads(a));
  }
});

test('finite unit-vector validation rejects distorted, sparse, typed and oversized representations', () => {
  const distorted = axis(0); distorted[0] = 0.999;
  const sparse = axis(0); delete sparse[2];
  for (const vector of [Array(384).fill(0), distorted, sparse, new Float64Array(axis(0)),
    axis(0).slice(1), [...axis(0), 0], axis(0).map((n, i) => i === 5 ? Infinity : n)]) {
    const a = fixture(); a.rows[0].vector = vector;
    invalid(() => trainHierarchyLinearHeads(a), vector.length > 384 ? 'capacity' : 'invalid-input');
  }
  const model = trainHierarchyLinearHeads(fixture());
  invalid(() => score(model, distorted));
});

test('strict descriptor schemas reject nested getters, proxies and extra fields without invoking traps', () => {
  let touched = 0;
  const trap = () => { touched++; throw Error('Private trap executed'); };
  const a = fixture(); Object.defineProperty(a.rows[0], 'vector', { enumerable: true, get: trap });
  invalid(() => trainHierarchyLinearHeads(a));
  invalid(() => trainHierarchyLinearHeads(new Proxy(fixture(), { getPrototypeOf: trap, ownKeys: trap })));
  const b = fixture(); b.rows[0].vector = new Proxy(axis(0), { get: trap });
  invalid(() => trainHierarchyLinearHeads(b));
  const c = fixture(); c.rows[0].url = 'must-not-be-accepted'; invalid(() => trainHierarchyLinearHeads(c));
  const model = structuredClone(trainHierarchyLinearHeads(fixture()));
  Object.defineProperty(model.heads[0], 'weights', { enumerable: true, get: trap });
  invalid(() => compileHierarchyLinearHeads(model));
  const compiled = compileHierarchyLinearHeads(trainHierarchyLinearHeads(fixture())), w = witness(axis(0));
  Object.defineProperty(w, 'sourceId', { enumerable: true, get: trap });
  invalid(() => scoreHierarchyLinearHeads(compiled, w));
  assert.equal(touched, 0);
});

test('compile rejects mutated coefficients, provenance, taxonomy, settings and production claims', () => {
  const good = trainHierarchyLinearHeads(fixture());
  for (const mutate of [a => { a.heads[0].weights[0] += 1; }, a => { a.nodes[0].parentId = 'nature'; },
    a => { a.lambda = 2; }, a => { a.trainingIdHashes[0] = 'f'.repeat(64); },
    a => { a.trainingGroupHashes.pop(); }, a => { a.trainingGroupHashes.reverse(); },
    a => { a.productionValidated = true; }, a => { a.experimental = false; },
    a => { a.heads[0].weights[0] = NaN; }, a => { a.trainingHash = 'A'.repeat(64); },
    a => { a.heads[0].positiveGroups = 0; }, a => { a.trainingWork.units = 0; }]) {
    const candidate = structuredClone(good); mutate(candidate); invalid(() => compileHierarchyLinearHeads(candidate));
  }
});

test('representation namespaces and exact hashes must match the trained frozen geometry', () => {
  const model = trainHierarchyLinearHeads(fixture()), compiled = compileHierarchyLinearHeads(model);
  invalid(() => scoreHierarchyLinearHeads(compiled, { ...witness(axis(0)), representation: 'pinned-ridge' }));
  invalid(() => scoreHierarchyLinearHeads(compiled, { ...witness(axis(0)), representationHash: 'b'.repeat(64) }));
  const input = fixture(); input.representation = 'pinned-ridge';
  const ridge = compileHierarchyLinearHeads(trainHierarchyLinearHeads(input));
  assert.ok(scoreHierarchyLinearHeads(ridge, { ...witness(axis(0)), representation: 'pinned-ridge' }).scores.length);
});

test('declared node, row, depth and UTF-16 bounds fail explicitly as capacity', () => {
  const a = fixture(); a.nodes = Array(129).fill(a.nodes[0]); invalid(() => trainHierarchyLinearHeads(a), 'capacity');
  const b = fixture(); b.rows = Array(385).fill(b.rows[0]); invalid(() => trainHierarchyLinearHeads(b), 'capacity');
  const c = fixture(); c.nodes = Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, parentId: i ? `n${i - 1}` : null }));
  invalid(() => trainHierarchyLinearHeads(c), 'capacity');
  const d = fixture(); d.trainingVersion = '😀'.repeat(81); invalid(() => trainHierarchyLinearHeads(d), 'capacity');
});

test('bad taxonomy, labels, lambda and unsupported schema fail closed', () => {
  for (const mutate of [a => { a.nodes[0].parentId = 'gta'; }, a => { a.nodes[0].parentId = 'absent'; },
    a => { a.rows[0].expectedTopicId = 'absent'; }, a => { a.nodes[1].id = a.nodes[0].id; },
    a => { a.lambda = 0; }, a => { a.lambda = 1e-8; }, a => { a.lambda = 1001; },
    a => { a.lambda = NaN; }, a => { a.rows = []; }, a => { a.representation = 'unidentified'; }]) {
    const a = fixture(); mutate(a); invalid(() => trainHierarchyLinearHeads(a));
  }
  const a = structuredClone(trainHierarchyLinearHeads(fixture())); a.schema = 'production-v1';
  invalid(() => compileHierarchyLinearHeads(a));
});

test('positive regularization handles identical feature vectors without fabricating score certainty', () => {
  const a = fixture(); a.lambda = LINEAR_HEAD_LIMITS.minLambda;
  for (const row of a.rows) row.vector = axis(0);
  const model = trainHierarchyLinearHeads(a);
  assert.ok(model.heads.every(h => h.weights.every(w => w === 0)));
  close(raw(model, axis(0), 'games'), 0);
  close(raw(model, axis(0), 'gta'), -0.5);
  assert.equal(score(model, axis(0)).productionValidated, false);
});

test('maximum declared node and row populations remain finite within the counted arithmetic budget', () => {
  const input = fixture();
  input.nodes = Array.from({ length: 128 }, (_, i) => ({ id: `leaf-${i}`, parentId: null }));
  input.rows = Array.from({ length: 384 }, (_, i) => ({ id: `maximum-row-${i}`, groupId: `maximum-origin-${i}`,
    split: 'training', expectedTopicId: `leaf-${i % 128}`, vector: axis(i % 128) }));
  const model = trainHierarchyLinearHeads(input);
  assert.equal(model.heads.length, 128); assert.ok(model.heads.every(h => h.enabled));
  assert.equal(model.trainingIdHashes.length, 384);
  assert.ok(model.trainingWork.units > 70_000_000);
  assert.ok(model.trainingWork.units <= LINEAR_HEAD_LIMITS.maxTrainingWork);
  assert.ok(model.heads.every(h => h.weights.every(Number.isFinite) && Number.isFinite(h.intercept)));
  assert.equal(score(model, axis(0)).scores.length, 128);
});
