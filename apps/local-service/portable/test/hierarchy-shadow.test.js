import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { initializeHierarchyShadow, publishShadowHierarchy, registerShadowSourceWitness,
  commitShadowDecision, bindShadowRoot, deleteShadowSource, deleteShadowRoot, revokeShadowRevision,
  readShadowPath, readShadowParentRoots } from '../canonical-v4/experimental/hierarchy-shadow/repository.js';

const hash = n => String(n).repeat(64);
const forest = () => [{ id: 'games', parentId: null, label: 'Games' },
  { id: 'video', parentId: 'games', label: 'Video games' }, { id: 'gta', parentId: 'video', label: 'GTA' },
  { id: 'nature', parentId: null, label: 'Nature' }];
const publication = (revision = 'revision-1', expectedRevision = null) => ({ expectedRevision, revision,
  artifactHash: hash(1), modelHash: hash(2), policyHash: hash(3), nodes: forest() });
async function context(t) {
  const db = await createPGliteDatabase(); t.after(() => db.close()); await initializeHierarchyShadow(db);
  return db;
}
async function source(db, sourceId = 'synthetic-source', sourceInputHash = hash(4)) {
  const registered = await registerShadowSourceWitness(db, { sourceId, sourceInputHash });
  return { revision: 'revision-1', artifactHash: hash(1), modelHash: hash(2), policyHash: hash(3),
    sourceId, sourceInputHash, sourceWitnessVersion: registered.sourceWitnessVersion, nodeId: 'gta' };
}
const page = (db, overrides = {}) => readShadowParentRoots(db, { nodeId: 'games', expectedRevision: null, expectedFeedVersion: null,
  afterRootId: null, limit: 100, ...overrides });
async function preparedBinding(db, sourceId, canonicalRootId, canonicalDestinationId = 'original-canonical-topic') {
  // Fixture convenience only: race tests below retain this returned packet and
  // mutate the database before calling the real bind API.
  const row = (await db.query(`SELECT s.current_revision AS revision,w.input_hash,w.witness_version::text AS witness_version,d.node_id
    FROM hierarchy_shadow.state s JOIN hierarchy_shadow.source_witnesses w ON w.source_id=$1
    LEFT JOIN hierarchy_shadow.decisions d ON d.source_id=w.source_id AND d.revision=s.current_revision WHERE s.singleton`, [sourceId])).rows[0];
  return { revision: row.revision, nodeId: row.node_id ?? 'gta', sourceId, sourceInputHash: row.input_hash,
    sourceWitnessVersion: row.witness_version, canonicalRootId, canonicalDestinationId };
}
const bind = async (db, sourceId, canonicalRootId, canonicalDestinationId = 'original-canonical-topic') =>
  bindShadowRoot(db, await preparedBinding(db, sourceId, canonicalRootId, canonicalDestinationId));
const count = async (db, table) => Number((await db.query(`SELECT count(*) AS n FROM hierarchy_shadow.${table}`)).rows[0].n);

test('explicit isolated initialization creates no canonical tables or active migration registration', async t => {
  const db = await context(t);
  assert.equal((await db.query("SELECT to_regnamespace('canonical_v4') AS namespace")).rows[0].namespace, null);
  assert.equal((await db.query('SELECT current_revision FROM hierarchy_shadow.state')).rows[0].current_revision, null);
  assert.deepEqual(await publishShadowHierarchy(db, publication()), { status: 'published', revision: 'revision-1' });
  assert.equal(await count(db, 'ancestors'), 7);
});

test('publication is conditional and atomic; historical artifacts and their closure stay immutable', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication());
  const history = (await db.query("SELECT * FROM hierarchy_shadow.nodes WHERE revision='revision-1' ORDER BY node_id")).rows;
  assert.equal((await publishShadowHierarchy(db, publication('revision-2', null))).status, 'stale-revision');
  const invalid = publication('revision-2', 'revision-1'); invalid.nodes[0].parentId = 'gta';
  await assert.rejects(publishShadowHierarchy(db, invalid), e => e.code === 'invalid-input');
  assert.equal(await count(db, 'revisions'), 1); assert.equal(await count(db, 'nodes'), 4);
  const changed = publication('revision-2', 'revision-1'); changed.nodes[0].label = 'Reviewed games label';
  await publishShadowHierarchy(db, changed);
  assert.deepEqual((await db.query("SELECT * FROM hierarchy_shadow.nodes WHERE revision='revision-1' ORDER BY node_id")).rows, history);
  for (const sql of ["UPDATE hierarchy_shadow.nodes SET label='mutated' WHERE revision='revision-1'",
    "DELETE FROM hierarchy_shadow.revisions WHERE revision='revision-1'",
    "INSERT INTO hierarchy_shadow.nodes VALUES('revision-1','late',NULL,'Late node')",
    "DELETE FROM hierarchy_shadow.ancestors WHERE revision='revision-1'"]) {
    await assert.rejects(db.query(sql), e => e.code === 'P2003');
  }
});

test('missing parents, duplicate IDs, cycles, depth and node bounds leave no partial publication', async t => {
  const db = await context(t);
  const cases = [
    [nodes => { nodes[0].parentId = 'absent'; }, 'invalid-input'],
    [nodes => { nodes[1].id = nodes[0].id; }, 'invalid-input'],
    [nodes => { nodes[0].parentId = 'gta'; }, 'invalid-input'],
    [nodes => nodes.splice(0, nodes.length, ...Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, parentId: i ? `n${i - 1}` : null, label: `Node ${i}` }))), 'capacity'],
    [nodes => nodes.splice(0, nodes.length, ...Array.from({ length: 129 }, (_, i) => ({ id: `n${i}`, parentId: null, label: `Node ${i}` }))), 'capacity']];
  for (const [mutate, code] of cases) {
    const input = publication(); mutate(input.nodes);
    await assert.rejects(publishShadowHierarchy(db, input), e => e.code === code);
    assert.equal(await count(db, 'revisions'), 0); assert.equal(await count(db, 'nodes'), 0);
  }
  await assert.rejects(db.transaction(async tx => {
    await publishShadowHierarchy(tx, publication());
    throw Error('synthetic rollback marker');
  }), /rollback marker/u);
  assert.equal(await count(db, 'revisions'), 0); assert.equal(await count(db, 'ancestors'), 0);
});

test('conditional decisions require current artifact, model, policy and exact Source incarnation/input', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication());
  const job = await source(db);
  for (const field of ['artifactHash', 'modelHash', 'policyHash']) {
    assert.equal((await commitShadowDecision(db, { ...job, [field]: hash(9) })).status, 'stale-model');
  }
  assert.equal((await commitShadowDecision(db, { ...job, sourceInputHash: hash(5) })).status, 'stale-source');
  assert.equal((await commitShadowDecision(db, { ...job, sourceId: 'absent' })).status, 'missing-source');
  assert.equal((await commitShadowDecision(db, job)).status, 'accepted');
  const path = await readShadowPath(db, { sourceId: job.sourceId });
  assert.deepEqual(path.path.map(n => n.id), ['games', 'video', 'gta']);
  assert.equal(path.modelHash, job.modelHash); assert.equal(path.status, 'assigned');
  const unchanged = await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: job.sourceInputHash });
  assert.equal(unchanged.changed, false); assert.equal(unchanged.requiresAssignment, false);
  assert.equal(unchanged.sourceWitnessVersion, job.sourceWitnessVersion);
  const changed = await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: hash(5) });
  assert.equal(changed.changed, true); assert.equal(changed.requiresAssignment, true);
  assert.equal((await commitShadowDecision(db, job)).status, 'stale-source');
  assert.equal((await readShadowPath(db, { sourceId: job.sourceId })).status, 'unassigned');
  await source(db, job.sourceId, job.sourceInputHash); // A -> B -> A must not revive an old job.
  assert.equal((await commitShadowDecision(db, job)).status, 'stale-source');
  await deleteShadowSource(db, { sourceId: job.sourceId });
  await source(db, job.sourceId, job.sourceInputHash);
  assert.equal((await commitShadowDecision(db, job)).status, 'stale-source');
});

test('canonical root IDs and destinations remain independent, deduplicated across Sources and ancestor feeds', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication());
  const first = await source(db, 'source-a'), second = await source(db, 'source-b');
  await commitShadowDecision(db, first); await commitShadowDecision(db, second);
  await bind(db, first.sourceId, 'actual-thread-1'); await bind(db, second.sourceId, 'actual-thread-1');
  await bind(db, first.sourceId, 'actual-thread-2', 'another-original-topic');
  assert.equal((await bind(db, first.sourceId, 'actual-thread-1', 'semantic-gta')).status, 'destination-conflict');
  const rootPage = await page(db);
  assert.deepEqual(rootPage.rootRefs, [{ canonicalRootId: 'actual-thread-1', canonicalDestinationId: 'original-canonical-topic' },
    { canonicalRootId: 'actual-thread-2', canonicalDestinationId: 'another-original-topic' }]);
  assert.deepEqual((await page(db, { nodeId: 'gta' })).rootRefs, rootPage.rootRefs);
  assert.ok(Object.isFrozen(rootPage.rootRefs));
  await commitShadowDecision(db, { ...first, nodeId: 'nature' });
  assert.deepEqual((await page(db)).rootRefs, rootPage.rootRefs);
  assert.equal((await page(db, { nodeId: 'nature' })).rootRefs.length, 0);
  assert.equal((await bind(db, first.sourceId, 'actual-thread-1')).status, 'semantic-binding-conflict');
  await bind(db, first.sourceId, 'new-nature-thread');
  assert.deepEqual((await page(db, { nodeId: 'nature' })).rootRefs.map(r => r.canonicalRootId), ['new-nature-thread']);
});

test('new publication hides stale decisions and rejects stale pagination instead of serving cached roots', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication()); const job = await source(db);
  await commitShadowDecision(db, job);
  for (const root of ['a-root', 'b-root', 'c-root']) await bind(db, job.sourceId, root);
  const first = await page(db, { limit: 2 }); assert.equal(first.nextAfterRootId, 'b-root');
  const second = await page(db, { expectedRevision: first.revision, expectedFeedVersion: first.feedVersion,
    afterRootId: first.nextAfterRootId, limit: 2 });
  assert.deepEqual(second.rootRefs.map(r => r.canonicalRootId), ['c-root']);
  await publishShadowHierarchy(db, publication('revision-2', 'revision-1'));
  assert.equal((await commitShadowDecision(db, job)).status, 'stale-model');
  assert.equal((await readShadowPath(db, { sourceId: job.sourceId })).status, 'unassigned');
  assert.equal((await page(db)).rootRefs.length, 0);
  assert.equal((await page(db, { expectedRevision: first.revision, expectedFeedVersion: first.feedVersion,
    afterRootId: first.nextAfterRootId })).status, 'stale-revision');
  const unchanged = await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: job.sourceInputHash });
  assert.equal(unchanged.changed, false); assert.equal(unchanged.requiresAssignment, true);
  await commitShadowDecision(db, { ...job, revision: 'revision-2' });
  assert.equal((await page(db)).rootRefs.length, 0);
  assert.equal((await bind(db, job.sourceId, 'a-root')).status, 'semantic-binding-conflict');
  await bind(db, job.sourceId, 'new-revision-root');
  assert.deepEqual((await page(db)).rootRefs.map(r => r.canonicalRootId), ['new-revision-root']);
});

test('scoped cursor versions survive unrelated branches and exact repeats but reject related changes', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication()); const game = await source(db, 'game-source');
  await commitShadowDecision(db, game);
  await bind(db, game.sourceId, 'a-thread'); await bind(db, game.sourceId, 'b-thread');
  const first = await page(db, { limit: 1 });
  const cursor = { expectedRevision: first.revision, expectedFeedVersion: first.feedVersion,
    afterRootId: first.nextAfterRootId, limit: 1 };
  assert.equal(first.nextAfterRootId, 'a-thread');
  const nature = { ...await source(db, 'nature-source'), nodeId: 'nature' };
  await commitShadowDecision(db, nature); await bind(db, nature.sourceId, 'unrelated-thread');
  assert.equal((await page(db, cursor)).status, 'ready');
  assert.equal((await page(db, cursor)).feedVersion, first.feedVersion);
  await commitShadowDecision(db, game);
  await registerShadowSourceWitness(db, { sourceId: game.sourceId, sourceInputHash: game.sourceInputHash });
  await bind(db, game.sourceId, 'a-thread');
  assert.equal((await page(db, cursor)).status, 'ready');
  assert.equal((await page(db, cursor)).feedVersion, first.feedVersion);
  const natureBefore = await page(db, { nodeId: 'nature' });
  const leafBefore = await page(db, { nodeId: 'gta' });
  await bind(db, game.sourceId, 'c-thread');
  const stale = await page(db, cursor);
  assert.equal(stale.status, 'stale-feed'); assert.deepEqual(stale.rootRefs, []);
  assert.notEqual(stale.feedVersion, first.feedVersion);
  assert.equal((await page(db, { nodeId: 'nature' })).feedVersion, natureBefore.feedVersion);
  assert.notEqual((await page(db, { nodeId: 'gta' })).feedVersion, leafBefore.feedVersion);
  const beforeMove = await page(db), oldLeaf = await page(db, { nodeId: 'gta' });
  await commitShadowDecision(db, { ...game, nodeId: 'video' });
  assert.equal((await page(db, { ...cursor, expectedFeedVersion: beforeMove.feedVersion })).status, 'ready');
  assert.equal((await page(db, { nodeId: 'gta' })).feedVersion, oldLeaf.feedVersion);
  assert.equal((await page(db, { nodeId: 'gta' })).rootRefs.length, 3);
  assert.equal((await page(db)).rootRefs.length, 3);
  assert.equal((await bind(db, game.sourceId, 'a-thread')).status, 'semantic-binding-conflict');
  await bind(db, game.sourceId, 'new-video-thread');
  assert.equal((await page(db, { ...cursor, expectedFeedVersion: beforeMove.feedVersion })).status, 'stale-feed');
  assert.equal((await page(db, { nodeId: 'gta' })).feedVersion, oldLeaf.feedVersion);
  const oldGames = await page(db), oldNature = await page(db, { nodeId: 'nature' });
  await commitShadowDecision(db, { ...game, nodeId: 'nature' });
  assert.equal((await page(db)).feedVersion, oldGames.feedVersion);
  assert.equal((await page(db, { nodeId: 'nature' })).feedVersion, oldNature.feedVersion);
  await bind(db, game.sourceId, 'new-nature-thread');
  assert.equal((await page(db)).feedVersion, oldGames.feedVersion);
  assert.notEqual((await page(db, { nodeId: 'nature' })).feedVersion, oldNature.feedVersion);
});

test('input/decision changes preserve historical feeds; root and Source erasure fence their cursors', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication()); const job = await source(db);
  await commitShadowDecision(db, job); await bind(db, job.sourceId, 'a-root'); await bind(db, job.sourceId, 'b-root');
  const current = () => page(db);
  const expectStale = async before => {
    const result = await page(db, { expectedRevision: before.revision, expectedFeedVersion: before.feedVersion,
      afterRootId: 'a-root', limit: 1 });
    assert.equal(result.status, 'stale-feed'); assert.deepEqual(result.rootRefs, []);
  };
  const initial = await current();
  assert.equal((await commitShadowDecision(db, { ...job, sourceInputHash: hash(9) })).status, 'stale-source');
  assert.equal((await bind(db, job.sourceId, 'a-root', 'wrong-destination')).status, 'destination-conflict');
  await deleteShadowRoot(db, { canonicalRootId: 'absent' });
  await deleteShadowSource(db, { sourceId: 'absent' });
  assert.equal((await current()).feedVersion, initial.feedVersion);
  await assert.rejects(db.transaction(async tx => {
    await commitShadowDecision(tx, { ...job, nodeId: 'nature' }); throw Error('rollback scoped mutation');
  }), /rollback scoped mutation/u);
  assert.equal((await current()).feedVersion, initial.feedVersion);
  const changed = await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: hash(5) });
  assert.equal((await current()).feedVersion, initial.feedVersion);
  assert.equal((await current()).rootRefs.length, 2);
  assert.equal((await bind(db, job.sourceId, 'unassigned-new-root')).status, 'unassigned-source');
  await commitShadowDecision(db, { ...job, sourceInputHash: hash(5), sourceWitnessVersion: changed.sourceWitnessVersion });
  assert.equal((await current()).feedVersion, initial.feedVersion);
  const beforeRootDelete = await current(); await deleteShadowRoot(db, { canonicalRootId: 'a-root' });
  await expectStale(beforeRootDelete);
  const beforeSourceDelete = await current(); await deleteShadowSource(db, { sourceId: job.sourceId });
  await expectStale(beforeSourceDelete);
});

test('Source deletion, root erasure and revision revocation remove their current reference dependencies', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication());
  const a = await source(db, 'source-a'), b = await source(db, 'source-b');
  await commitShadowDecision(db, a); await commitShadowDecision(db, b);
  await bind(db, a.sourceId, 'shared-root'); await bind(db, b.sourceId, 'shared-root');
  await bind(db, a.sourceId, 'only-a-root');
  await deleteShadowSource(db, { sourceId: a.sourceId });
  assert.deepEqual((await page(db)).rootRefs.map(r => r.canonicalRootId), ['shared-root']);
  assert.equal(await count(db, 'root_registry'), 1);
  await deleteShadowRoot(db, { canonicalRootId: 'shared-root' });
  assert.equal(await count(db, 'source_root_bindings'), 0); assert.equal(await count(db, 'decisions'), 1);
  await bind(db, b.sourceId, 'fresh-root');
  await revokeShadowRevision(db, { revision: 'revision-1' });
  assert.equal(await count(db, 'decisions'), 0); assert.equal(await count(db, 'source_root_bindings'), 0);
  assert.equal(await count(db, 'root_registry'), 0); assert.equal(await count(db, 'revisions'), 1);
  assert.equal((await commitShadowDecision(db, b)).status, 'revoked');
  assert.equal((await page(db)).rootRefs.length, 0);
});

test('explicit unresolved decisions are distinct from never-assigned Sources', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication()); const job = await source(db);
  assert.equal((await bind(db, job.sourceId, 'never-assigned-root')).status, 'unassigned-source');
  await commitShadowDecision(db, { ...job, nodeId: null });
  const result = await readShadowPath(db, { sourceId: job.sourceId });
  assert.equal(result.status, 'unresolved'); assert.deepEqual(result.path, []);
  assert.equal((await bind(db, job.sourceId, 'unresolved-root')).status, 'unassigned-source');
  assert.equal(await count(db, 'root_registry'), 0);
  assert.equal((await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: job.sourceInputHash })).requiresAssignment, false);
});

test('revocation erases snapshot-bound roots even after Source input invalidation removed its decision', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication()); const job = await source(db);
  await commitShadowDecision(db, job); await bind(db, job.sourceId, 'revoked-thread');
  const changed = await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: hash(5) });
  assert.equal(await count(db, 'decisions'), 0);
  assert.equal(await count(db, 'source_root_bindings'), 1);
  assert.equal((await page(db)).rootRefs[0].canonicalRootId, 'revoked-thread');
  await revokeShadowRevision(db, { revision: 'revision-1' });
  assert.equal(await count(db, 'root_registry'), 0); assert.equal(await count(db, 'source_root_bindings'), 0);
  await publishShadowHierarchy(db, publication('revision-2', null));
  await commitShadowDecision(db, { ...job, revision: 'revision-2', sourceInputHash: hash(5),
    sourceWitnessVersion: changed.sourceWitnessVersion });
  assert.equal((await page(db)).rootRefs.length, 0);
});

test('prepared root binds reject Source input ABA, erasure/recreation, changed decisions and new publications', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication()); const job = await source(db);
  await commitShadowDecision(db, job);
  const prepared = await preparedBinding(db, job.sourceId, 'prepared-root');
  await commitShadowDecision(db, { ...job, nodeId: 'nature' });
  assert.equal((await bindShadowRoot(db, prepared)).status, 'stale-decision');
  assert.equal(await count(db, 'root_registry'), 0);
  await commitShadowDecision(db, job);
  await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: hash(5) });
  assert.equal((await bindShadowRoot(db, prepared)).status, 'stale-source');
  const restored = await registerShadowSourceWitness(db, { sourceId: job.sourceId, sourceInputHash: job.sourceInputHash });
  await commitShadowDecision(db, { ...job, sourceWitnessVersion: restored.sourceWitnessVersion });
  assert.equal((await bindShadowRoot(db, prepared)).status, 'stale-source');
  const beforeErase = await preparedBinding(db, job.sourceId, 'erased-prepared-root');
  await deleteShadowSource(db, { sourceId: job.sourceId });
  assert.equal((await bindShadowRoot(db, beforeErase)).status, 'stale-source');
  const recreated = await source(db, job.sourceId); await commitShadowDecision(db, recreated);
  assert.equal((await bindShadowRoot(db, beforeErase)).status, 'stale-source');
  const beforePublish = await preparedBinding(db, job.sourceId, 'old-revision-root');
  await publishShadowHierarchy(db, publication('revision-2', 'revision-1'));
  assert.equal((await bindShadowRoot(db, beforePublish)).status, 'stale-revision');
  assert.equal(await count(db, 'root_registry'), 0); assert.equal(await count(db, 'source_root_bindings'), 0);
});

test('same-node rebind retains immutable original per-Source witness until Source erasure', async t => {
  const db = await context(t); await publishShadowHierarchy(db, publication());
  const first = await source(db, 'origin-source-a'), second = await source(db, 'origin-source-b');
  await commitShadowDecision(db, first); await commitShadowDecision(db, second);
  await bind(db, first.sourceId, 'shared-origin-root'); await bind(db, second.sourceId, 'shared-origin-root');
  const original = (await db.query(`SELECT input_hash,witness_version::text AS witness_version FROM hierarchy_shadow.source_root_bindings
    WHERE source_id=$1 AND canonical_root_id='shared-origin-root'`, [first.sourceId])).rows[0];
  assert.deepEqual(original, { input_hash: first.sourceInputHash, witness_version: first.sourceWitnessVersion });
  const before = await page(db);
  const changed = await registerShadowSourceWitness(db, { sourceId: first.sourceId, sourceInputHash: hash(5) });
  await commitShadowDecision(db, { ...first, sourceInputHash: hash(5), sourceWitnessVersion: changed.sourceWitnessVersion });
  assert.equal((await bindShadowRoot(db, await preparedBinding(db, first.sourceId, 'shared-origin-root'))).changed, false);
  assert.equal((await page(db)).feedVersion, before.feedVersion);
  assert.deepEqual((await db.query(`SELECT input_hash,witness_version::text AS witness_version FROM hierarchy_shadow.source_root_bindings
    WHERE source_id=$1 AND canonical_root_id='shared-origin-root'`, [first.sourceId])).rows[0], original);
  await assert.rejects(db.query('UPDATE hierarchy_shadow.source_root_bindings SET input_hash=$1 WHERE source_id=$2', [hash(9), first.sourceId]), e => e.code === 'P2003');
  await deleteShadowSource(db, { sourceId: first.sourceId });
  assert.equal((await db.query('SELECT 1 FROM hierarchy_shadow.source_root_bindings WHERE source_id=$1', [first.sourceId])).rows.length, 0);
  assert.equal(await count(db, 'source_root_bindings'), 1); assert.equal(await count(db, 'root_registry'), 1);
  assert.equal((await page(db)).rootRefs[0].canonicalRootId, 'shared-origin-root');
  await deleteShadowSource(db, { sourceId: second.sourceId });
  assert.equal(await count(db, 'source_root_bindings'), 0); assert.equal(await count(db, 'root_registry'), 0);
});

test('strict repository records, hostile inputs and hard page limits fail before SQL', async t => {
  const db = await context(t); let touched = 0;
  const trap = () => { touched++; throw Error('Hostile accessor executed'); };
  const poisoned = publication(); Object.defineProperty(poisoned.nodes[0], 'label', { enumerable: true, get: trap });
  await assert.rejects(publishShadowHierarchy(db, poisoned), e => e.code === 'invalid-input');
  await assert.rejects(publishShadowHierarchy(db, new Proxy(publication(), { ownKeys: trap })), e => e.code === 'invalid-input');
  await assert.rejects(publishShadowHierarchy(db, { ...publication(), rawVector: [] }), e => e.code === 'invalid-input');
  for (const limit of [0, 101, 1.5, NaN]) await assert.rejects(page(db, { limit }), e => e.code === 'invalid-input');
  await assert.rejects(page(db, { afterRootId: 'old-page' }), e => e.code === 'invalid-input');
  await assert.rejects(page(db, { expectedRevision: 'revision-1', afterRootId: 'old-page' }), e => e.code === 'invalid-input');
  await assert.rejects(page(db, { expectedFeedVersion: '1' }), e => e.code === 'invalid-input');
  await assert.rejects(page(db, { expectedRevision: 'revision-1', expectedFeedVersion: 1 }), e => e.code === 'invalid-input');
  await assert.rejects(bindShadowRoot(db, { sourceId: 'old-unfenced', canonicalRootId: 'old-root', canonicalDestinationId: 'old-topic' }), e => e.code === 'invalid-input');
  assert.equal(touched, 0); assert.equal(await count(db, 'revisions'), 0);
});
