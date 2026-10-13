import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotTopicPlanner, matchingInputIdentity } from '../src/domain/alternate-topic-cache.js';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { createDemoState, applyCommand } from '../src/domain/demo-state.js';
import { BROWSER_MODEL_ID, MATCH_POLICY_VERSION, applyLearnedCommand } from '../src/domain/learned-sources.js';
import { operationDigestFor } from '../src/domain/source-threads.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';

const snapshot = () => ({ generation: 'one', revision: 1,
  sources: [{ id: 'source-one', url: 'https://example.org/one', title: 'One',
    provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'model-one', values: [1, 0] }, operationId: 'receipt-one' }],
  sourceLinks: [{ sourceId: 'source-one', topicId: 'topic-one', method: 'learned-provisional' }], contributions: [] });

test('matching identities ignore posts, revisions and receipts, but separate live routing and manual pins', () => {
  const state = snapshot(), identity = matchingInputIdentity(state);
  state.revision++; state.contributions.push({ body: 'never a matching input' }); state.sources[0].operationId = 'receipt-two';
  assert.deepEqual(matchingInputIdentity(state), identity);
  state.sourceLinks[0].topicId = 'topic-two';
  const moved = matchingInputIdentity(state);
  assert.equal(moved.grouping, identity.grouping); assert.equal(moved.ranking, identity.ranking);
  assert.notEqual(moved.routing, identity.routing);
  state.sourceLinks[0].method = 'manual-confirmed'; const pinned = matchingInputIdentity(state);
  state.sourceLinks[0].topicId = 'topic-three'; const repinned = matchingInputIdentity(state);
  assert.equal(pinned.grouping, repinned.grouping); assert.notEqual(pinned.ranking, repinned.ranking);
});

test('every retained semantic input changes matching identity', () => {
  for (const change of [s => s.sources[0].id = 'different', s => s.sources[0].url += '/different',
    s => s.sources[0].title += ' different', s => s.sources[0].provenance = 'other',
    s => s.sources[0].extractorVersion = 'other', s => s.sources[0].embedding.modelId = 'other',
    s => s.sources[0].embedding.values[1] = 0.1, s => s.sourceLinks[0].method = 'manual-confirmed']) {
    const state = snapshot(), before = matchingInputIdentity(state); change(state);
    assert.notEqual(matchingInputIdentity(state).grouping, before.grouping);
  }
});

test('partition cache reuses across discussion commits, fences generation/limits, and retries changed-input failure', () => {
  let calls = 0, fail = false;
  const plan = createSnapshotTopicPlanner(() => { calls++; if (fail) throw Error('capacity'); return { calls }; });
  const state = snapshot(), first = plan(state);
  state.revision++; state.sources[0].operationId = 'new'; state.contributions.push({ body: 'new' });
  assert.equal(plan(state), first); assert.equal(calls, 1);
  state.sourceLinks[0].topicId = 'new-topic'; assert.equal(plan(state), first);
  state.generation = 'two'; assert.equal(plan(state).calls, 2);
  state.limits = { maxWorkUnits: 10 }; assert.equal(plan(state).calls, 3);
  state.sources[0].title = 'changed'; fail = true; assert.throws(() => plan(state), /capacity/);
  fail = false; assert.equal(plan(state).calls, 5);
});

test('accessor and sparse vector inputs cannot reuse an already valid partition', () => {
  const state = snapshot(), plan = createSnapshotTopicPlanner(() => ({})); plan(state);
  Object.defineProperty(state.sources[0], 'operationId', { enumerable: true, get() { throw Error('must not invoke'); } });
  assert.throws(() => plan(state), /Invalid matching input/);
  const sparse = snapshot(); delete sparse.sources[0].embedding.values[1];
  assert.throws(() => matchingInputIdentity(sparse), /Invalid matching input/);
});

test('normalized identity agrees with exact snapshot inputs and excludes discussion/receipt commits', t => {
  let state = createDemoState({ generation: 'identity-generation', createdAt: '2026-10-13T12:00:00Z', sources: [],
    topicSeeds: [{ id: 'topic-one', title: 'One', kind: 'general' }, { id: 'topic-two', title: 'Two', kind: 'general' }] });
  const source = { id: 'source-one', url: 'https://example.org/one', title: 'One',
    provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1', policyVersion: MATCH_POLICY_VERSION,
    // Object insertion order is not mathematical identity; receipts/stamps
    // nevertheless retain their separate exact serialized representation.
    embedding: { values: [1, ...Array(383).fill(0)], modelId: BROWSER_MODEL_ID }, operationId: 'operation-one' };
  source.operationDigest = operationDigestFor(source);
  state.sources = [source]; state.sourceLinks = [{ sourceId: source.id, topicId: 'topic-one', method: 'learned-provisional' }];
  const repository = createNormalizedSqliteRepository(':memory:', state); t.after(() => repository.close());
  const matchingEvents = [];
  const unsubscribe = repository.subscribeMatching(event => matchingEvents.push(event));
  let sourcePages = 0;
  const service = createDiscussionService({ repository: { ...repository,
    readCatalogPage(input) { if (input.kind === 'sources') sourcePages++; return repository.readCatalogPage(input); },
    readTopicState() { throw Error('warming cannot read posts'); }, readSourceState() { throw Error('warming cannot read posts'); } },
    ranking: createFixtureRankingAdapter(), sources: [], topicSeeds: [], nextId: () => 'unused', now: () => '2026-10-13T12:00:00Z' });
  assert.deepEqual(service.warmMatching(), repository.version()); const warmedPages = sourcePages;
  const compare = () => {
    const identity = repository.readMatchingIdentity({ expectedVersion: repository.version() });
    assert.deepEqual(identity, { version: repository.version(), ...matchingInputIdentity(repository.load()) }); return identity;
  };
  const initial = compare();
  state = applyCommand(state, { type: 'create-root', topicId: 'topic-one', body: 'Fresh current discussion body' },
    { id: 'demo-alex', type: 'human', demo: true }, { nextId: () => 'contribution-one', now: () => '2026-10-13T12:01:00Z' }).state;
  repository.save(repository.version(), state); const posted = compare();
  assert.deepEqual(matchingEvents, [], 'a post never schedules matching work');
  assert.deepEqual(service.warmMatching(), repository.version()); assert.equal(sourcePages, warmedPages);
  assert.equal(posted.grouping, initial.grouping); assert.equal(posted.ranking, initial.ranking);
  state = structuredClone(state); state.revision++; state.sources[0].operationId = 'operation-two';
  repository.save(repository.version(), state); assert.equal(compare().grouping, initial.grouping);
  assert.deepEqual(matchingEvents, [], 'a receipt never schedules matching work');
  assert.deepEqual(service.warmMatching(), repository.version()); assert.equal(sourcePages, warmedPages);
  state = structuredClone(state); state.revision++; state.sourceLinks[0].topicId = 'topic-two';
  repository.save(repository.version(), state); const moved = compare();
  assert.deepEqual(matchingEvents, [], 'provisional routing is not geometry or a ranking pin');
  assert.equal(moved.grouping, initial.grouping); assert.notEqual(moved.routing, initial.routing);
  state = structuredClone(state); state.revision++; state.sources[0].title = 'Different qualification input';
  state.sources[0].operationDigest = operationDigestFor(state.sources[0]);
  repository.save(repository.version(), state); assert.notEqual(compare().grouping, initial.grouping);
  assert.deepEqual(matchingEvents, [{ version: repository.version() }]);
  state = structuredClone(state); state.revision++; state.sourceLinks[0].method = 'manual-confirmed';
  repository.save(repository.version(), state); assert.equal(matchingEvents.length, 2);
  state = structuredClone(state); state.revision++; state.sourceLinks[0].topicId = 'topic-one';
  repository.save(repository.version(), state); assert.equal(matchingEvents.length, 3, 'manual routing changes ranking authority');
  state = applyLearnedCommand(state, { type: 'forget-source', sourceId: source.id },
    { nextId: () => 'unused', now: () => '2026-10-13T12:00:00Z' }).state;
  repository.save(repository.version(), state); assert.equal(matchingEvents.length, 4, 'Source deletion schedules fresh preparation');
  const previous = repository.version();
  state = createDemoState({ generation: 'identity-reset-generation', createdAt: '2026-10-13T12:00:00Z', sources: [], topicSeeds: [] });
  repository.replace(previous, state); assert.equal(matchingEvents.length, 5, 'generation reset schedules fresh preparation');
  assert.deepEqual(matchingEvents.at(-1), { version: repository.version() });
  unsubscribe();
  assert.throws(() => repository.subscribeMatching(null), error => error.code === 'invalid');
  assert.throws(() => repository.readMatchingIdentity({ expectedVersion: initial.version }), error => error.code === 'conflict');
});
