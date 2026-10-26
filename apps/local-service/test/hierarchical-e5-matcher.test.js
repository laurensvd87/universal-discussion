import test from 'node:test';
import assert from 'node:assert/strict';
import { compileHierarchyArtifact, scoreHierarchy, classifyHierarchy, HIERARCHY_LIMITS,
  HierarchyMatcherError } from '../src/domain/hierarchical-e5-matcher.js';

// Geometric unit vectors are new synthetic data, not E5 quality evidence.
const hash = 'a'.repeat(64);
function unit(entries) {
  const v = Array(384).fill(0);
  for (const [i, n] of entries) v[i] = n;
  const norm = Math.sqrt(v.reduce((sum, n) => sum + n * n, 0));
  return v.map(n => n / norm);
}
const axis = i => unit([[i, 1]]);
const gta = unit([[0, 0.6], [2, 0.8]]);
const craft = unit([[0, 0.6], [3, 0.8]]);
const koala = unit([[1, 0.6], [8, 0.8]]);
const query = vector => ({ sourceId: 'synthetic-source', sourceVersion: 'revision-1',
  representation: 'raw-e5', representationHash: hash, vector });
function fixture() {
  const nodes = [{ id: 'games', parentId: null }, { id: 'video', parentId: 'games' },
    { id: 'gta', parentId: 'video' }, { id: 'craft', parentId: 'video' },
    { id: 'nature', parentId: null }, { id: 'koalas', parentId: 'nature' }];
  const examples = [];
  const add = (nodeId, kind, vector) => {
    for (let i = 0; i < 2; i++) examples.push({ id: `${nodeId}-${kind}-${i}`,
      nodeId, kind, groupId: `${nodeId}-${kind}-origin-${i}`, vector: [...vector] });
  };
  add('gta', 'positive', gta); add('craft', 'positive', craft);
  add('koalas', 'positive', koala); add('video', 'stop', axis(0));
  add('games', 'stop', axis(10)); add('nature', 'stop', axis(1));
  add('games', 'outside', axis(7)); add('nature', 'outside', axis(7));
  return { schema: 'hierarchical-e5-v1', representation: 'raw-e5', representationHash: hash,
    taxonomyVersion: 'reviewed-taxonomy-v1', evidenceVersion: 'new-synthetic-v1',
    calibrationVersion: 'synthetic-rules-v1', calibrationStatus: 'synthetic', nodes, examples,
    nodeRules: nodes.map(n => ({ nodeId: n.id, enabled: true, minSimilarity: 0.8, meanSimilarity: 0.8,
      minMargin: 0.05, minNegativeMargin: 0.05, minSupport: 2 })) };
}
function decide(vector, a = fixture(), options) {
  return classifyHierarchy(compileHierarchyArtifact(a), query(vector), options);
}
function invalid(action, code = 'invalid-input') {
  assert.throws(action, e => e instanceof HierarchyMatcherError && e.code === code);
}

test('specific GTA and koala evidence supplies approved ancestry and exact versions', () => {
  for (const [vector, expected] of [[gta, ['games', 'video', 'gta']], [koala, ['nature', 'koalas']]]) {
    const d = decide(vector);
    assert.equal(d.status, 'assigned'); assert.deepEqual(d.paths, [expected]);
    assert.equal(d.primaryNodeId, expected.at(-1)); assert.equal(d.calibrationStatus, 'synthetic');
    assert.equal(d.sourceVersion, 'revision-1'); assert.equal(d.representationHash, hash);
    assert.equal(d.work.dotProducts, fixture().examples.length);
    assert.equal(d.work.scalarProducts, d.work.dotProducts * 384);
    assert.ok(d.work.units <= HIERARCHY_LIMITS.maxWork);
  }
});

test('generic pages and unrepresented children stop at the supported parent', () => {
  assert.deepEqual(decide(axis(10)).paths, [['games']]);
  assert.deepEqual(decide(axis(0)).paths, [['games', 'video']]);
  assert.deepEqual(decide(unit([[0, 0.9], [6, Math.sqrt(0.19)]])).paths, [['games', 'video']]);
  assert.deepEqual(decide(axis(1)).paths, [['nature']]);
});

test('equally supported siblings fall back only to a supported ancestor', () => {
  const ambiguous = unit([[0, 0.6], [2, Math.sqrt(0.32)], [3, Math.sqrt(0.32)]]);
  const a = fixture();
  for (const r of a.nodeRules) r.minMargin = 0;
  const d = decide(ambiguous, a, { multiPath: true });
  assert.deepEqual(d.paths, [['games', 'video']]);
  assert.equal(d.features.find(f => f.nodeId === 'gta').siblingMargin, 0);
  for (const r of a.nodeRules.filter(r => ['games', 'video'].includes(r.nodeId))) {
    r.minSimilarity = 0.99; r.meanSimilarity = 0.99;
  }
  assert.equal(decide(ambiguous, a).status, 'unresolved');
});

test('unrelated nearest neighbor, empty evidence and missing branch are unresolved', () => {
  assert.equal(decide(axis(7)).status, 'unresolved');
  assert.equal(decide(axis(30)).status, 'unresolved');
  const a = fixture(); a.examples = [];
  assert.equal(decide(gta, a).status, 'unresolved');
  for (const r of a.nodeRules) r.minNegativeMargin = 0;
  assert.equal(decide(gta, a).status, 'unresolved');
  a.examples = fixture().examples.filter(e => !['nature', 'koalas'].includes(e.nodeId));
  assert.equal(decide(koala, a).status, 'unresolved');
});

test('strong child does not need a parent centroid or parent threshold gate', () => {
  const a = fixture();
  for (const r of a.nodeRules.filter(r => ['games', 'video'].includes(r.nodeId))) r.minSupport = 8;
  const d = decide(gta, a);
  assert.deepEqual(d.paths, [['games', 'video', 'gta']]);
  assert.equal(d.features.find(f => f.nodeId === 'games').absoluteSupported, false);
});

test('ancestor outside evidence vetoes a deep exact match; STOP counters specialization', () => {
  const a = fixture();
  a.examples.push({ id: 'contradiction', nodeId: 'games', kind: 'outside', groupId: 'outside-gta', vector: gta });
  assert.equal(decide(gta, a).status, 'unresolved');
  const b = fixture();
  b.examples.push({ id: 'generic-gta', nodeId: 'video', kind: 'stop', groupId: 'generic-gta', vector: gta });
  assert.deepEqual(decide(gta, b).paths, [['games', 'video']]);
});

test('duplicate origin groups cannot manufacture independent positive support', () => {
  const a = fixture();
  for (const e of a.examples.filter(e => e.nodeId === 'gta')) e.groupId = 'same-origin';
  const f = decide(gta, a).features.find(f => f.nodeId === 'gta');
  assert.equal(f.support, 1); assert.equal(f.meanSimilarity, null); assert.equal(f.accepted, false);
});

test('distinct confident branches permit optional multiple paths with deterministic primary', () => {
  const a = fixture();
  // A synthetic cross-branch vector with disjoint local sibling alternatives.
  const both = unit(gta.map((n, i) => [i, n + koala[i]]).filter(([, n]) => n));
  for (const r of a.nodeRules) { r.minSimilarity = 0.65; r.meanSimilarity = 0.65; }
  const d = decide(both, a, { multiPath: true });
  assert.deepEqual(d.paths, [['games', 'video', 'gta'], ['nature', 'koalas']]);
  assert.equal(d.primaryNodeId, 'gta');
  assert.equal(decide(both, a).paths.length, 1);
});

test('ambiguous intermediate forks cannot be bypassed by strong local cousin leaves', () => {
  const a = fixture();
  a.nodes.push({ id: 'board', parentId: 'games' }, { id: 'chess', parentId: 'board' });
  for (const id of ['board', 'chess']) a.nodeRules.push({ ...a.nodeRules[0], nodeId: id });
  for (let i = 0; i < 2; i++) a.examples.push({ id: `chess${i}`, nodeId: 'chess',
    kind: 'positive', groupId: `chess-origin${i}`, vector: craft });
  a.examples = a.examples.filter(e => e.nodeId !== 'craft');
  const both = unit([[0, 0.6], [2, Math.sqrt(0.32)], [3, Math.sqrt(0.32)]]);
  assert.deepEqual(decide(both, a, { multiPath: true }).paths, [['games']]);
  assert.deepEqual(decide(both, a).paths, [['games']]);
  a.nodeRules.find(r => r.nodeId === 'games').enabled = false;
  assert.equal(decide(both, a).status, 'unresolved');
});

test('artifact order does not change arithmetic, decisions, or work accounting', () => {
  const a = fixture(), b = fixture();
  b.nodes.reverse(); b.examples.reverse(); b.nodeRules.reverse();
  assert.deepEqual(decide(gta, a), decide(gta, b));
});

test('feature scorer exposes independent group maxima for frozen-grid calibration', () => {
  const a = fixture(), compiled = compileHierarchyArtifact(a);
  const s = scoreHierarchy(compiled, query(gta));
  const f = s.features.find(f => f.nodeId === 'gta');
  assert.deepEqual(f.positiveSimilarities, [1, 1]);
  assert.equal(f.bestSimilarity, 1); assert.equal(f.meanSimilarity, 1);
  assert.equal(f.positiveGroupCount, 2);
  assert.equal(f.negativeSimilarity, 0); assert.equal(f.parentStopSimilarity, 0.6);
  assert.ok(f.siblingMargin > 0); assert.equal(f.negativeMargin, 1);
  assert.ok(Object.isFrozen(s.features)); assert.ok(Object.isFrozen(f.positiveSimilarities));
});

test('compiled data and all returned decisions are detached from caller mutation', () => {
  const a = fixture(), c = compileHierarchyArtifact(a), witness = query([...gta]);
  const before = classifyHierarchy(c, witness);
  a.examples[0].vector.fill(0); a.nodes[0].id = 'tampered'; a.nodeRules[0].minSimilarity = -1;
  assert.deepEqual(classifyHierarchy(c, witness), before);
  witness.vector.fill(0);
  assert.deepEqual(before.paths, [['games', 'video', 'gta']]);
  assert.throws(() => before.paths[0].push('tampered'), TypeError);
  invalid(() => classifyHierarchy({}, query(gta)));
});

test('exact schemas reject unknown fields, accessors, symbols, prototypes and proxies without executing them', () => {
  const poison = () => { throw new Error('Getter or proxy trap executed'); };
  const a = fixture(); Object.defineProperty(a, 'nodes', { enumerable: true, get: poison });
  invalid(() => compileHierarchyArtifact(a));
  invalid(() => compileHierarchyArtifact(new Proxy(fixture(), { get: poison, ownKeys: poison, getPrototypeOf: poison })));
  for (const mutate of [a => { a.extra = true; }, a => { a[Symbol('extra')] = 1; },
    a => { Object.setPrototypeOf(a, null); }, a => { a.nodes[0].label = 'Games'; },
    a => { a.examples[0].vector[Symbol('extra')] = 1; },
    a => { Object.defineProperty(a.examples[0].vector, '0', { enumerable: true, get: poison }); },
    a => { a.examples[0].vector = new Proxy(gta, { get: poison }); }]) {
    const b = fixture(); mutate(b); invalid(() => compileHierarchyArtifact(b));
  }
  const c = compileHierarchyArtifact(fixture()), w = query(gta);
  Object.defineProperty(w, 'sourceId', { enumerable: true, get: poison });
  invalid(() => scoreHierarchy(c, w));
  invalid(() => classifyHierarchy(c, query(gta), { multiPath: true, other: true }));
});

test('unit vectors are norm checked, copied exactly, and never implicitly transformed', () => {
  for (const vector of [Array(384).fill(0), Array(384).fill(1), [...gta, 0], gta.slice(1),
    gta.map((n, i) => i === 1 ? NaN : n), gta.map((n, i) => i === 1 ? Infinity : n),
    gta.map((n, i) => i === 1 ? '0' : n), new Float64Array(gta)]) {
    invalid(() => decide(vector), vector.length > 384 ? 'capacity' : 'invalid-input');
  }
  const hole = [...gta]; delete hole[1]; invalid(() => decide(hole));
  const sign = [...gta]; sign[100] = -0;
  assert.equal(decide(sign).primaryNodeId, 'gta');
});

test('raw E5 and pinned Ridge namespaces and hashes are strict independent identities', () => {
  const a = fixture(), c = compileHierarchyArtifact(a);
  invalid(() => scoreHierarchy(c, { ...query(gta), representation: 'pinned-ridge' }));
  invalid(() => scoreHierarchy(c, { ...query(gta), representationHash: 'b'.repeat(64) }));
  for (const bad of ['a'.repeat(63), 'A'.repeat(64), '', null]) {
    const b = fixture(); b.representationHash = bad; invalid(() => compileHierarchyArtifact(b));
  }
  a.representation = 'pinned-ridge';
  const d = classifyHierarchy(compileHierarchyArtifact(a), { ...query(gta), representation: 'pinned-ridge' });
  assert.equal(d.primaryNodeId, 'gta');
});

test('invalid taxonomy, evidence, acceptance rules and claimed production calibration fail closed', () => {
  for (const mutate of [a => { a.nodes[0].parentId = 'gta'; }, a => { a.nodes[0].parentId = 'absent'; },
    a => { a.nodes[1].id = 'games'; }, a => { a.nodeRules.pop(); },
    a => { a.nodeRules[0].minMargin = -0.1; }, a => { a.nodeRules[0].minSupport = 0; },
    a => { a.nodeRules[0].meanSimilarity = 1.01; }, a => { a.nodeRules[0].minSupport = 1.5; },
    a => { a.examples[0].kind = 'negative'; }, a => { a.examples[0].nodeId = 'absent'; },
    a => { a.examples[1].id = a.examples[0].id; }, a => { a.calibrationStatus = 'production'; },
    a => { a.taxonomyVersion = ' '; }, a => { a.evidenceVersion = 'line\nbreak'; },
    a => { a.calibrationVersion = ''; }]) {
    const a = fixture(); mutate(a); invalid(() => compileHierarchyArtifact(a));
  }
});

test('explicitly disabled sparse nodes never assign, while descendant evidence stays available', () => {
  const a = fixture(); a.nodeRules.find(r => r.nodeId === 'gta').enabled = false;
  assert.deepEqual(decide(gta, a).paths, [['games', 'video']]);
  const b = fixture(); delete b.nodeRules[0].enabled;
  invalid(() => compileHierarchyArtifact(b));
});

test('finite node, exemplar, UTF-16 and depth budgets reject capacity, never choose broad fallback', () => {
  const a = fixture(); a.nodes = Array(513).fill(a.nodes[0]);
  invalid(() => compileHierarchyArtifact(a), 'capacity');
  const b = fixture(); b.examples = Array(4097).fill(b.examples[0]);
  invalid(() => compileHierarchyArtifact(b), 'capacity');
  const c = fixture(); c.evidenceVersion = '😀'.repeat(81);
  invalid(() => compileHierarchyArtifact(c), 'capacity');
  const d = fixture();
  d.nodes = Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, parentId: i ? `n${i - 1}` : null }));
  invalid(() => compileHierarchyArtifact(d), 'capacity');
});

test('inclusive exact-scoring operation budget rejects an oversized computation explicitly', () => {
  const a = fixture();
  a.nodes = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, parentId: i ? `n${i - 1}` : null }));
  a.nodes.push(...Array.from({ length: 504 }, (_, i) => ({ id: `empty${i}`, parentId: null })));
  const baseRule = a.nodeRules[0];
  a.nodeRules = a.nodes.map(n => ({ ...baseRule, nodeId: n.id }));
  a.examples = Array.from({ length: 4096 }, (_, i) => ({ id: `e${i}`, nodeId: 'n7',
    kind: 'positive', groupId: `g${i}`, vector: unit([[0, (Math.sin(i * 42) + 1) / 2], [1, 1]]) }));
  const compiled = compileHierarchyArtifact(a);
  invalid(() => classifyHierarchy(compiled, query(axis(0))), 'capacity');
});
