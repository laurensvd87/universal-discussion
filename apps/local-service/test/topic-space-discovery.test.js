import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTopicSpaceDiscovery } from '../src/application/topic-space-discovery.js';
import { createMemoryTopicSpacePolicyStore } from '../src/application/topic-space-policy.js';
import { buildTopicSpaceHierarchy } from '../src/domain/topic-space-grouping.js';
import { parseTopicSpacesResponse } from '../../../spikes/topic-resolution/browser/core/topic-space-contract.js';
import { makeRidgeTopicAdapter, RIDGE_PARAMETER_SHA256 } from '../src/domain/ridge-topic-adapter.js';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function direction(cosine = 1) {
  const vector = Array(384).fill(0);
  vector[0] = cosine; vector[1] = Math.sqrt(1 - cosine * cosine);
  return vector;
}
function entry(id, ordinal, cosine = 1) {
  return { rootId: id, topicId: `topic-${id}`, discussionId: `discussion-${id}`, sourceId: `source-${id}`,
    ordinal, title: `Title ${id}`, snippet: `Fresh text ${id}`, url: `https://www.wikipedia.org/${id}`,
    vector: direction(cosine), humanCount: 1, aiCount: 0, updatedAt: '2026-10-18T12:00:00.000Z' };
}
function fixture(t, rows = [entry('a', 0), entry('b', 1, 0.88)]) {
  const state = { rows, generation: 'synthetic-discovery', revision: 0, sourceStamp: 'a'.repeat(64), sourceVector: direction(), calls: { inputs: 0, cards: 0, source: 0 } };
  const version = () => ({ generation: state.generation, revision: state.revision });
  const fingerprint = () => createHash('sha256').update(JSON.stringify(state.rows)).digest('hex');
  const reads = {
    async header() { return { version: version() }; },
    async topicSpaceStamp() { return { version: version(), fingerprint: fingerprint(), rootCount: state.rows.length }; },
    async topicSpaceInputs() { state.calls.inputs++; return { version: version(), fingerprint: fingerprint(), entries: structuredClone(state.rows) }; },
    async topicSpaceCards(rootIds) {
      state.calls.cards++;
      assert.ok(rootIds.length <= 60);
      return { version: version(), cards: state.rows.filter(row => rootIds.includes(row.rootId)).map(({ vector, ordinal, ...card }) => structuredClone(card)) };
    },
    async topicSpaceSource(sourceId) { state.calls.source++; return { version: version(), sourceId, stamp: state.sourceStamp, vector: structuredClone(state.sourceVector) }; },
  };
  const policyStore = createMemoryTopicSpacePolicyStore({ ownerAccountId: 'owner' });
  const builds = [];
  const buildHierarchy = async (entries, options) => {
    const gate = deferred();
    builds.push({ gate, entries: structuredClone(entries), options: structuredClone(options) });
    await gate.promise;
    return buildTopicSpaceHierarchy(entries, options);
  };
  const discovery = createTopicSpaceDiscovery({ reads, policyStore, buildHierarchy });
  t.after(async () => { for (const build of builds) build.gate.resolve(); await discovery.close(); });
  return { state, reads, policyStore, discovery, builds };
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }
const query = (extra = {}) => ({ sourceId: null, query: '', offset: 0, limit: 20, ...extra });
async function ready(fixture) {
  const pending = fixture.discovery.start();
  await flush();
  assert.equal(fixture.builds.length, 1);
  fixture.builds[0].gate.resolve();
  await pending;
  await flush();
}
function threads(response) { return response.groups.flatMap(group => group.threads); }

test('concurrent initial queries coalesce a single bounded background hierarchy build', async t => {
  const fixtureValue = fixture(t);
  const { discovery, builds, state } = fixtureValue;
  const responses = await Promise.all(Array.from({ length: 8 }, () => discovery.query(query())));
  for (const response of responses) {
    assert.equal(parseTopicSpacesResponse(response).state, 'building');
    assert.deepEqual(response.groups, []);
  }
  await flush();
  assert.equal(builds.length, 1);
  assert.equal(state.calls.inputs, 1);
  builds[0].gate.resolve();
  await flush();
  const response = parseTopicSpacesResponse(await discovery.query(query()));
  assert.equal(response.state, 'ready');
  assert.equal(response.groups[0].threadCount, 2);
});

test('ready queries fetch fresh thread cards rather than retaining cached bodies', async t => {
  const value = fixture(t);
  await ready(value);
  const first = parseTopicSpacesResponse(await value.discovery.query(query()));
  assert.equal(threads(first)[0].snippet, 'Fresh text a');
  // The adapter fingerprint is authoritative: this isolated seam tests card reuse
  // independently of hierarchy invalidation, which is tested separately below.
  const originalStamp = await value.reads.topicSpaceStamp();
  value.reads.topicSpaceStamp = async () => structuredClone(originalStamp);
  value.state.rows[0].snippet = 'Replacement fresh body';
  const second = parseTopicSpacesResponse(await value.discovery.query(query()));
  assert.equal(threads(second).find(thread => thread.rootId === 'a').snippet, 'Replacement fresh body');
  assert.ok(value.state.calls.cards >= 2);
});

test('changed catalog fingerprint prevents stale build publication', async t => {
  const value = fixture(t);
  const pending = value.discovery.start();
  await flush();
  value.state.rows = [entry('replacement', 0, -1)];
  value.state.revision++;
  value.builds[0].gate.resolve();
  await pending;
  await flush();
  const response = await value.discovery.query(query());
  assert.equal(response.state, 'building');
  assert.deepEqual(response.groups, []);
});

test('deletion during fresh card loading cannot deliver deleted thread bodies', async t => {
  const value = fixture(t);
  await ready(value);
  const cards = value.reads.topicSpaceCards;
  value.reads.topicSpaceCards = async ids => {
    const previous = await cards(ids);
    value.state.rows = [];
    value.state.revision++;
    return previous;
  };
  try {
    const response = await value.discovery.query(query());
    assert.deepEqual(response.groups, []);
  } catch (error) { assert.ok(['conflict', 'unavailable'].includes(error.code)); }
});

test('current Source changes during query cannot deliver stale semantic results', async t => {
  const value = fixture(t);
  await ready(value);
  const cards = value.reads.topicSpaceCards;
  value.reads.topicSpaceCards = async ids => {
    const result = await cards(ids);
    value.state.sourceStamp = 'b'.repeat(64);
    value.state.sourceVector = direction(-1);
    return result;
  };
  try {
    const response = await value.discovery.query(query({ sourceId: 'source-current' }));
    assert.deepEqual(response.groups, []);
  } catch (error) { assert.ok(['conflict', 'unavailable'].includes(error.code)); }
});

test('policy changes during query cannot return results under an obsolete owner policy', async t => {
  const value = fixture(t);
  await ready(value);
  const cards = value.reads.topicSpaceCards;
  value.reads.topicSpaceCards = async ids => {
    const result = await cards(ids);
    value.policyStore.update({ expectedRevision: 0, defaultSpecificity: 100, topicOverrides: [] });
    return result;
  };
  try {
    const response = await value.discovery.query(query());
    assert.deepEqual(response.groups, []);
  } catch (error) { assert.ok(['conflict', 'unavailable'].includes(error.code)); }
});

test('owner actor is explicit, updates use CAS, and overrides accept existing base IDs only', async t => {
  const value = fixture(t);
  await ready(value);
  const { discovery } = value;
  assert.equal(discovery.owner().canManage, false);
  assert.equal(discovery.owner('owner').canManage, false);
  assert.equal(discovery.owner('account-other').canManage, false);
  assert.equal(discovery.owner('account-owner').canManage, true);
  const body = { expectedRevision: 0, defaultSpecificity: 50, topicOverrides: [] };
  await assert.rejects(() => discovery.updatePolicy(body, 'account-other'), { code: 'forbidden' });
  await assert.rejects(() => discovery.updatePolicy({ ...body, topicOverrides: [{ spaceId: 'unknown-base', specificity: 100, title: null }] }, 'account-owner'), { code: 'invalid' });
  const response = await discovery.query(query());
  const baseId = response.groups[0].policyTopicId;
  await discovery.updatePolicy({ ...body, topicOverrides: [{ spaceId: baseId, specificity: 100, title: 'Owner topic' }] }, 'account-owner');
  assert.equal(discovery.owner('account-owner').policy.revision, 1);
  await assert.rejects(() => discovery.updatePolicy(body, 'account-owner'), { code: 'conflict' });
  const narrow = await discovery.query(query());
  assert.equal(narrow.groups.length, 2);
  const childId = narrow.groups.find(group => group.id !== group.policyTopicId).id;
  await assert.rejects(() => discovery.updatePolicy({ expectedRevision: 1, defaultSpecificity: 50,
    topicOverrides: [{ spaceId: childId, specificity: 50, title: null }] }, 'account-owner'), { code: 'invalid' });
});

test('worker capacity is explicit and repeated same-fingerprint queries do not restart failed builds', async t => {
  const value = fixture(t);
  const pending = value.discovery.start();
  await flush();
  const error = new RangeError('synthetic capacity'); error.code = 'TOPIC_SPACE_CAPACITY';
  value.builds[0].gate.reject(error);
  await pending;
  for (let index = 0; index < 3; index++) {
    const response = parseTopicSpacesResponse(await value.discovery.query(query()));
    assert.equal(response.state, 'capacity');
    assert.deepEqual(response.groups, []);
  }
  assert.equal(value.builds.length, 1);
});

test('close awaits active build and disposed discovery cannot publish results', async t => {
  const value = fixture(t);
  const pending = value.discovery.start();
  await flush();
  let closed = false;
  const closing = value.discovery.close().then(() => { closed = true; });
  await flush();
  assert.equal(closed, false);
  value.builds[0].gate.resolve();
  await Promise.all([closing, pending]);
  assert.equal(closed, true);
  await assert.rejects(() => value.discovery.query(query()));
});

test('aborting one coalesced consumer leaves the other consumer live', async t => {
  const value = fixture(t);
  await ready(value);
  const gate = deferred(); t.after(() => gate.resolve());
  const cards = value.reads.topicSpaceCards;
  value.reads.topicSpaceCards = async ids => { const result = await cards(ids); await gate.promise; return result; };
  const controller = new AbortController();
  const rejected = assert.rejects(() => value.discovery.query(query(), { signal: controller.signal }));
  const accepted = value.discovery.query(query());
  await flush();
  assert.equal(value.state.calls.cards, 1);
  controller.abort(); gate.resolve();
  await rejected;
  assert.equal(parseTopicSpacesResponse(await accepted).state, 'ready');
});

test('each coalesced consumer renews its own current-context authority before delivery', async t => {
  const value = fixture(t);
  await ready(value);
  const gate = deferred(); t.after(() => gate.resolve());
  const cards = value.reads.topicSpaceCards;
  value.reads.topicSpaceCards = async ids => { const result = await cards(ids); await gate.promise; return result; };
  let current = true;
  const rejected = assert.rejects(() => value.discovery.query(query(), { isCurrent: () => current }));
  const accepted = value.discovery.query(query());
  await flush();
  current = false; gate.resolve();
  await rejected;
  assert.equal(parseTopicSpacesResponse(await accepted).state, 'ready');
  assert.equal(value.state.calls.cards, 1);
});

test('default real worker builds a validated synthetic represented hierarchy and close awaits worker lifecycle', async t => {
  const value = fixture(t);
  const discovery = createTopicSpaceDiscovery({ reads: value.reads, policyStore: value.policyStore });
  t.after(() => discovery.close());
  await discovery.start();
  const response = parseTopicSpacesResponse(await discovery.query(query()));
  assert.equal(response.state, 'ready');
  assert.equal(response.groups[0].threadCount, 2);
  await discovery.close();
  await assert.rejects(() => discovery.query(query()));
});

test('discovery and its real worker reject a well-formed adapter with unpinned coefficients', async t => {
  const value = fixture(t);
  const weights = Array(384 * 384).fill(0);
  for (let index = 0; index < 384; index++) weights[index * 384 + index] = 1;
  const unpinned = makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
  assert.notEqual(unpinned.parameterSha256, RIDGE_PARAMETER_SHA256);
  assert.throws(() => createTopicSpaceDiscovery({ reads: value.reads, policyStore: value.policyStore,
    topicAdapter: unpinned }), TypeError);
  assert.throws(() => createTopicSpaceDiscovery({ reads: value.reads, policyStore: value.policyStore,
    topicAdapter: { ...unpinned, parameterSha256: RIDGE_PARAMETER_SHA256 } }), TypeError);
  assert.equal(value.state.calls.inputs, 0);
  const worker = new Worker(new URL('../src/application/topic-space-build-worker.js', import.meta.url), {
    workerData: { entries: value.state.rows, generation: value.state.generation, topicAdapter: unpinned },
  });
  t.after(() => worker.terminate());
  const [result] = await once(worker, 'message');
  assert.deepEqual(result, { ok: false, capacity: false });
  await worker.terminate();
});

test('Source with no vector still renews Source and owner-policy freshness before delivery', async t => {
  const value = fixture(t);
  await ready(value);
  value.state.sourceVector = null;
  const source = value.reads.topicSpaceSource;
  value.reads.topicSpaceSource = async id => {
    const result = await source(id);
    if (value.state.calls.source === 1) {
      value.state.sourceStamp = 'b'.repeat(64);
      value.policyStore.update({ expectedRevision: 0, defaultSpecificity: 100, topicOverrides: [] });
    }
    return result;
  };
  await assert.rejects(() => value.discovery.query(query({ sourceId: 'source-current' })), { code: 'conflict' });
});

test('deliberate saves prune unchanged orphan overrides after deletion but reject new unknown settings', async t => {
  const value = fixture(t);
  await ready(value);
  const initial = await value.discovery.query(query());
  const oldBaseId = initial.groups[0].policyTopicId;
  const orphan = { spaceId: oldBaseId, specificity: 100, title: 'Preserved old label' };
  await value.discovery.updatePolicy({ expectedRevision: 0, defaultSpecificity: 0, topicOverrides: [orphan] }, 'account-owner');
  value.state.rows = [value.state.rows[1]];
  value.state.revision++;
  assert.equal((await value.discovery.query(query())).state, 'building');
  await flush();
  assert.equal(value.builds.length, 2);
  const refreshing = value.discovery.start();
  value.builds[1].gate.resolve();
  await refreshing;
  await assert.rejects(() => value.discovery.updatePolicy({ expectedRevision: 1, defaultSpecificity: 25,
    topicOverrides: [{ ...orphan, specificity: 50 }] }, 'account-owner'), { code: 'invalid' });
  await assert.rejects(() => value.discovery.updatePolicy({ expectedRevision: 1, defaultSpecificity: 25,
    topicOverrides: [{ spaceId: 'brand-new-unknown', specificity: 50, title: null }] }, 'account-owner'), { code: 'invalid' });
  const saved = await value.discovery.updatePolicy({ expectedRevision: 1, defaultSpecificity: 25, topicOverrides: [orphan] }, 'account-owner');
  assert.equal(saved.policy.revision, 2);
  assert.equal(saved.policy.defaultSpecificity, 25);
  assert.deepEqual(saved.policy.topicOverrides, []);
});
