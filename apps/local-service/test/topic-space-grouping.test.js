import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildTopicSpaceHierarchy as build, selectTopicSpaceGroups as select } from '../src/domain/topic-space-grouping.js';

function direction(cosine = 1) {
  const vector = Array(384).fill(0);
  vector[0] = cosine;
  vector[1] = Math.sqrt(1 - cosine * cosine);
  return vector;
}
function entry(id, ordinal, cosine = 1, extra = {}) {
  return { rootId: id, topicId: `topic-${id}`, discussionId: `discussion-${id}`, sourceId: null,
    ordinal, title: `Title ${id}`, snippet: '', url: null, vector: cosine === null ? null : direction(cosine),
    humanCount: 1, aiCount: 0, updatedAt: '2026-10-18T12:00:00.000Z', ...extra };
}
const options = { generation: 'generation-1' };
function settings(defaultSpecificity = 0, topicOverrides = []) {
  return { schema: 'topic-space-policy/v1', revision: 0, defaultSpecificity, topicOverrides };
}
function selected(hierarchy, specificity = 0, extra = {}) {
  return select(hierarchy, { policy: settings(specificity), ...extra });
}

test('five levels nest by fixed earliest exemplar and selected groups partition roots', () => {
  const hierarchy = build([entry('a', 0), entry('b', 1, 0.97), entry('c', 2, 0.945), entry('d', 3, 0.915), entry('e', 4, 0.88)], options);
  assert.equal(hierarchy.nodes.filter(node => node.level === 0).length, 1);
  for (const node of hierarchy.nodes.filter(node => node.level > 0)) {
    const parent = hierarchy.nodes.find(other => other.id === node.parentId);
    assert.equal(node.level, parent.level + 1);
    assert.ok(node.rootIds.every(id => parent.rootIds.includes(id)));
  }
  assert.deepEqual([0, 25, 50, 75, 100].map(value => selected(hierarchy, value).total), [1, 2, 3, 4, 5]);
  for (const specificity of [0, 25, 50, 75, 100]) {
    const roots = selected(hierarchy, specificity).groups.flatMap(group => group.rootIds);
    assert.equal(new Set(roots).size, roots.length);
    assert.equal(roots.length, 5);
  }
});

test('grouping does not transitively chain neighboring roots', () => {
  const hierarchy = build([entry('a', 0), entry('b', 1, 0.88), entry('c', 2, 0.6)], options);
  assert.ok(direction(0.88).reduce((sum, value, index) => sum + value * direction(0.6)[index], 0) > 0.8639003810829322);
  assert.deepEqual(hierarchy.nodes.filter(node => node.level === 0).map(node => node.rootIds), [['a', 'b'], ['c']]);
});

test('owner override refines only its base branch, preserving broad identity', () => {
  const hierarchy = build([entry('a', 0), entry('b', 1, 0.88), entry('c', 2, -1), entry('d', 3, -0.88)], options);
  const bases = hierarchy.nodes.filter(node => node.level === 0);
  const result = selected(hierarchy, 0, { policy: settings(0, [{ spaceId: bases[0].id, specificity: 100, title: 'Owner label' }]) });
  assert.equal(result.total, 3);
  assert.equal(result.groups.filter(group => group.policyTopicId === bases[0].id).length, 2);
  assert.deepEqual(result.groups.filter(group => group.policyTopicId === bases[0].id).map(group => group.title).sort(), ['Owner label — Title a', 'Owner label — Title b']);
  assert.equal(result.groups.find(group => group.id === bases[1].id).specificity, 0);
  assert.ok(hierarchy.nodes.some(node => node.id === bases[0].id));
  assert.equal(selected(hierarchy, 0, { policy: settings(0, [{ spaceId: bases[0].id, specificity: 0, title: 'Owner label' }]) }).groups.find(group => group.id === bases[0].id).title, 'Owner label');
});

test('base branch labels preserve child distinctions without changing IDs, membership or semantic authority', () => {
  const hierarchy = build([entry('a', 0), entry('b', 1, 0.88)], options);
  const base = hierarchy.nodes.find(node => node.level === 0);
  const baseline = selected(hierarchy, 100);
  const renamed = selected(hierarchy, 100, { policy: settings(100, [{ spaceId: base.id, specificity: 100, title: 'BBQ' }]) });
  assert.deepEqual(renamed.groups.map(({ title, ...group }) => group), baseline.groups.map(({ title, ...group }) => group));
  assert.deepEqual(renamed.groups.map(group => group.title).sort(), ['BBQ — Title a', 'BBQ — Title b']);
  assert.equal(selected(hierarchy, 100, { policy: settings(100, [{ spaceId: base.id, specificity: 100, title: 'BBQ' }]), vector: direction(-1) }).total, 0);
});

test('stable IDs survive permutation, serialization and later appends', () => {
  const rows = [entry('a', 0), entry('b', 1, 0.915), entry('c', 2, -1)];
  const hierarchy = build(rows, options);
  assert.deepEqual(build([...rows].reverse(), options), hierarchy);
  assert.deepEqual(selected(JSON.parse(JSON.stringify(hierarchy))), selected(hierarchy));
  const appended = build([...rows, entry('d', 3, -0.915)], options);
  assert.ok(hierarchy.nodes.every(node => appended.nodes.some(other => node.id === other.id)));
  assert.notEqual(build(rows, { generation: 'generation-2' }).nodes[0].id, hierarchy.nodes[0].id);
});

test('missing vectors stay separate and semantic searches require actual vectors', () => {
  const hierarchy = build([entry('a', 0, null), entry('b', 1, null), entry('c', 2)], options);
  assert.equal(selected(hierarchy).total, 3);
  assert.equal(selected(hierarchy, 0, { vector: direction() }).total, 1);
  assert.equal(selected(hierarchy, 0, { query: 'TITLE a' }).total, 1);
  assert.equal(selected(hierarchy, 0, { query: 'TITLE missing' }).total, 0);
});

test('semantic threshold follows selected specificity and text tokens use literal AND', () => {
  const hierarchy = build([entry('a', 0, 0.945, { snippet: 'red orange' })], options);
  assert.equal(selected(hierarchy, 0, { vector: direction(), query: 'red orange' }).total, 1);
  assert.equal(selected(hierarchy, 100, { vector: direction() }).total, 0);
  assert.equal(selected(hierarchy, 0, { query: 'red missing' }).total, 0);
});

test('ranking favors human participation over AI count and pagination caps groups', () => {
  const rows = Array.from({ length: 25 }, (_, index) => entry(`r${index}`, index, null, { humanCount: index, aiCount: 25 - index }));
  const hierarchy = build(rows, options);
  const result = selected(hierarchy);
  assert.equal(result.total, 25);
  assert.equal(result.groups.length, 20);
  assert.equal(result.groups[0].humanCount, 24);
  assert.equal(selected(hierarchy, 0, { offset: 20 }).groups.length, 5);
  assert.throws(() => selected(hierarchy, 0, { limit: 21 }), TypeError);
});

test('input is copied, output deeply frozen, and getters/proxies never execute', () => {
  const rows = [entry('a', 0)];
  const before = structuredClone(rows);
  const hierarchy = build(rows, options);
  assert.deepEqual(rows, before);
  rows[0].vector[0] = 0;
  assert.equal(hierarchy.entries[0].vector[0], 1);
  assert.ok(Object.isFrozen(hierarchy.nodes[0].rootIds));
  let calls = 0;
  const getter = entry('bad', 0);
  Object.defineProperty(getter, 'title', { get() { calls++; return 'bad'; } });
  assert.throws(() => build([getter], options), TypeError);
  const proxy = new Proxy({}, { get() { calls++; throw Error('executed'); }, getPrototypeOf() { calls++; throw Error('executed'); } });
  assert.throws(() => build([proxy], options), TypeError);
  assert.throws(() => build(new Proxy([], {}), options), TypeError);
  assert.throws(() => select(hierarchy, proxy), TypeError);
  assert.equal(calls, 0);
});

test('nonfinite, unnormalized and oversized input fails closed', () => {
  const bad = direction(); bad[12] = Infinity;
  assert.throws(() => build([entry('a', 0, 1, { vector: bad })], options), TypeError);
  assert.throws(() => build([entry('a', 0, 1, { vector: Array(384).fill(1) })], options), TypeError);
  assert.throws(() => build([entry('a', 0), entry('a', 1)], options), TypeError);
  assert.throws(() => build(Array(4097).fill(null), options), { code: 'TOPIC_SPACE_CAPACITY' });
  assert.throws(() => build([entry('a', 0)], { ...options, maxWorkUnits: 0 }), { code: 'TOPIC_SPACE_CAPACITY' });
  assert.throws(() => build([entry('a', 0), entry('b', 1)], { ...options, maxWorkUnits: 800 }), { code: 'TOPIC_SPACE_CAPACITY' });
});

test('serialized hierarchy rejects forged ancestry, duplicate membership and accessors', () => {
  const hierarchy = build([entry('a', 0), entry('b', 1, -1)], options);
  const malformed = structuredClone(hierarchy);
  malformed.nodes[1].rootIds.push('b');
  assert.throws(() => selected(malformed), TypeError);
  const getter = structuredClone(hierarchy);
  Object.defineProperty(getter.nodes[0], 'rootIds', { get() { throw new Error('must not run'); } });
  assert.throws(() => selected(getter), TypeError);
});

test('space IDs namespace the pinned Ridge representation and reject raw-era serialized IDs', () => {
  const hierarchy = build([entry('a', 0)], options);
  const expected = `space-${createHash('sha256').update(JSON.stringify(['topic-spaces/ridge-v1', options.generation, null, 0, 'a'])).digest('hex')}`;
  assert.equal(hierarchy.nodes[0].id, expected);
  const rawEra = structuredClone(hierarchy);
  rawEra.nodes[0].id = `space-${createHash('sha256').update(JSON.stringify([options.generation, null, 0, 'a'])).digest('hex')}`;
  assert.throws(() => selected(rawEra), TypeError);
});

test('all five conservative Ridge cuts govern grouping and semantic query filtering exactly', () => {
  const thresholds = [0.8639003810829322, 0.90, 0.93, 0.96, 0.99];
  for (const [level, threshold] of thresholds.entries()) {
    const specificity = level * 25;
    const atFloor = build([entry('a', 0), entry('b', 1, threshold)], options);
    const below = build([entry('a', 0), entry('b', 1, threshold - 1e-9)], options);
    assert.equal(selected(atFloor, specificity).total, 1, `grouping includes exact level ${level} floor`);
    assert.equal(selected(below, specificity).total, 2, `grouping excludes below level ${level} floor`);
    const queryAbove = build([entry('a', 0, threshold + 1e-9)], options);
    const queryBelow = build([entry('a', 0, threshold - 1e-9)], options);
    assert.equal(selected(queryAbove, specificity, { vector: direction() }).total, 1);
    assert.equal(selected(queryBelow, specificity, { vector: direction() }).total, 0);
  }
});
