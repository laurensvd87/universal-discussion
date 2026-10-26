import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPGliteDatabase } from '../src/database.js';
import { trainHierarchyLinearHeads } from '../../src/domain/hierarchical-e5-linear-heads.js';
import { calibrateHierarchyHeadPolicy, compileHierarchyHeadAssignment, classifyHierarchyHeads } from '../../src/domain/hierarchical-e5-head-policy.js';
import { compileHierarchyConsensusRestriction, classifyHierarchyConsensusRestriction }
  from '../../src/domain/hierarchical-e5-consensus-restriction.js';
import { initializeHierarchyShadow, publishShadowHierarchy, registerShadowSourceWitness, commitShadowDecision,
  bindShadowRoot, deleteShadowSource, revokeShadowRevision, readShadowPath, readShadowParentRoots }
  from '../canonical-v4/experimental/hierarchy-shadow/repository.js';

// Entirely geometric and isolated; these mirrors grant no canonical/native authority.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const axis = direction => Array.from({ length: 384 }, (_, i) => i === direction ? 1 : 0);
const nodes = [{ id: 'cooking', parentId: null, label: 'Cooking' }, { id: 'kapsalon', parentId: 'cooking', label: 'Kapsalon' },
  { id: 'pasta', parentId: 'cooking', label: 'Pasta' }, { id: 'nature', parentId: null, label: 'Nature' },
  { id: 'koalas', parentId: 'nature', label: 'Koalas' }];
const classes = [['kapsalon', 0], ['pasta', 1], ['cooking', 2], ['koalas', 3], ['nature', 4], [null, 5]];
function rows(split) {
  return classes.flatMap(([expectedTopicId, direction], k) => [0, 1].map(i => ({ id: `${split}-${k}-${i}`,
    groupId: `${split}-family-${k}-${i}`, split, expectedTopicId, vector: axis(direction) })));
}
async function setup(t) {
  const model = trainHierarchyLinearHeads({ nodes: nodes.map(({ id, parentId }) => ({ id, parentId })), rows: rows('training'),
    representation: 'raw-e5', representationHash: 'a'.repeat(64), trainingVersion: 'new-geometric-integration', lambda: 0.01 });
  const policy = calibrateHierarchyHeadPolicy({ model, rows: rows('calibration').map(r => ({ ...r, language: 'en' })),
    minimumAcceptedGroups: 2, targetPrecision: 1 });
  const artifact = { model, policy, nodes }, artifactHash = hash(artifact), revision = 'isolated-hierarchy-1';
  const publication = { expectedRevision: null, revision, artifactHash, modelHash: hash(model), policyHash: policy.policyHash, nodes };
  const db = await createPGliteDatabase();t.after(() => db.close());await initializeHierarchyShadow(db);
  await publishShadowHierarchy(db, publication);
  return { db, model, policy, publication, compiled: compileHierarchyHeadAssignment({ model, policy }) };
}
async function prepare(f, sourceId, direction) {
  const vector = axis(direction), sourceInputHash = hash({ sourceId, representationHash: f.model.representationHash, vector });
  const witness = await registerShadowSourceWitness(f.db, { sourceId, sourceInputHash });
  const decision = classifyHierarchyHeads(f.compiled, { sourceId, sourceVersion: sourceInputHash,
    representation: f.model.representation, representationHash: f.model.representationHash, vector });
  const { expectedRevision, nodes: ignored, ...snapshot } = f.publication;
  return { ...snapshot, sourceId, sourceInputHash, sourceWitnessVersion: witness.sourceWitnessVersion, nodeId: decision.primaryNodeId };
}
const feed = (f, nodeId, extra = {}) => readShadowParentRoots(f.db, { nodeId, expectedRevision: null,
  expectedFeedVersion: null, afterRootId: null, limit: 20, ...extra });
const binding = (prepared, canonicalRootId, canonicalDestinationId) => ({ revision: prepared.revision,
  nodeId: prepared.nodeId, sourceId: prepared.sourceId, sourceInputHash: prepared.sourceInputHash,
  sourceWitnessVersion: prepared.sourceWitnessVersion, canonicalRootId, canonicalDestinationId });

test('classifier to shadowdecision to parentfeed preserves original routes and stops/rejects appropriately', async t => {
  const f = await setup(t);
  for (const [gold, direction] of classes) {
    const prepared = await prepare(f, `page-${direction}`, direction);
    assert.equal(prepared.nodeId, gold);
    assert.equal((await commitShadowDecision(f.db, prepared)).status, 'accepted');
    if (gold !== null) assert.equal((await bindShadowRoot(f.db,
      binding(prepared, `existing-root-${direction}`, `legacy-container-${direction}`))).status, 'bound');
  }
  assert.deepEqual((await readShadowPath(f.db, { sourceId: 'page-0' })).path.map(n => n.id), ['cooking', 'kapsalon']);
  const cooking = await feed(f, 'cooking');assert.equal(cooking.rootRefs.length, 3);
  assert.deepEqual(cooking.rootRefs[0], { canonicalRootId: 'existing-root-0', canonicalDestinationId: 'legacy-container-0' });
  assert.equal((await feed(f, 'kapsalon')).rootRefs.length, 1);
  assert.equal((await readShadowPath(f.db, { sourceId: 'page-5' })).status, 'unresolved');
  assert.equal((await f.db.query("SELECT to_regnamespace('canonical_v4') AS value")).rows[0].value, null);
});

test('a source change or tree publication between classification and commit rejects the prepared old job', async t => {
  const f = await setup(t), oldSourceJob = await prepare(f, 'changed-page', 0);
  const freshSourceJob = await prepare(f, 'changed-page', 3);
  assert.equal((await commitShadowDecision(f.db, oldSourceJob)).status, 'stale-source');
  assert.equal((await commitShadowDecision(f.db, freshSourceJob)).status, 'accepted');
  const pendingModelJob = await prepare(f, 'new-model-page', 1);
  await publishShadowHierarchy(f.db, { ...f.publication, expectedRevision: f.publication.revision, revision: 'isolated-hierarchy-2' });
  assert.equal((await commitShadowDecision(f.db, pendingModelJob)).status, 'stale-model');
  assert.equal((await readShadowPath(f.db, { sourceId: 'new-model-page' })).status, 'unassigned');
});

test('historical root membership does not move when its page is later reclassified', async t => {
  const f = await setup(t), first = await prepare(f, 'moving-page', 0);
  await commitShadowDecision(f.db, first);
  await bindShadowRoot(f.db, binding(first, 'stable-root', 'stable-legacy-topic'));
  const before = await feed(f, 'cooking'), replacement = await prepare(f, 'moving-page', 3);
  await commitShadowDecision(f.db, replacement);
  assert.equal((await readShadowPath(f.db, { sourceId: first.sourceId })).nodeId, 'koalas');
  const after = await feed(f, 'cooking');assert.deepEqual(after.rootRefs, before.rootRefs);
  assert.equal(after.feedVersion, before.feedVersion);assert.equal((await feed(f, 'nature')).rootRefs.length, 0);
  assert.equal((await bindShadowRoot(f.db, binding(first, 'stale-new-root', 'stable-legacy-topic'))).status, 'stale-source');
  assert.equal((await bindShadowRoot(f.db, binding(replacement, 'stable-root', 'stable-legacy-topic'))).status, 'semantic-binding-conflict');
});

test('source erasure and model revocation remove dependent projections without touching canonical data', async t => {
  const f = await setup(t), page = await prepare(f, 'erasable-page', 0);
  await commitShadowDecision(f.db, page);
  await bindShadowRoot(f.db, binding(page, 'removable-root', 'original-route'));
  await deleteShadowSource(f.db, { sourceId: page.sourceId });assert.equal((await feed(f, 'cooking')).rootRefs.length, 0);
  const second = await prepare(f, 'revoked-page', 3);await commitShadowDecision(f.db, second);
  await bindShadowRoot(f.db, binding(second, 'revoked-root', 'another-original-route'));
  await registerShadowSourceWitness(f.db, { sourceId: second.sourceId, sourceInputHash: 'b'.repeat(64) });
  await revokeShadowRevision(f.db, { revision: f.publication.revision });
  for (const table of ['decisions', 'root_registry', 'source_root_bindings']) {
    assert.equal(Number((await f.db.query(`SELECT count(*) AS value FROM hierarchy_shadow.${table}`)).rows[0].value), 0);
  }
});

test('two-view restriction has its own publication identity and cannot promote or bind a conflicting branch', async t => {
  const f = await setup(t), guard = compileHierarchyConsensusRestriction({ model: f.model, policy: f.policy });
  const witness = (sourceId, body, title) => ({ sourceId, sourceVersion: 'synthetic-paired-input',
    representation: f.model.representation, representationHash: f.model.representationHash,
    bodyVector: axis(body), titleVector: axis(title) });
  const metadata = classifyHierarchyConsensusRestriction(guard, witness('identity-only', 0, 0));
  // The restriction is a different decision policy, never silently published
  // under the base body's policy/artifact identity.
  const publication = { ...f.publication, expectedRevision: f.publication.revision,
    revision: 'isolated-restriction-1', artifactHash: hash({ model: f.model, policy: f.policy, nodes,
      guardDefinitionHash: metadata.guardDefinitionHash }), policyHash: metadata.guardHash };
  await publishShadowHierarchy(f.db, publication);
  for (const [sourceId, body, title, expected] of [['conflict', 0, 3, null],
    ['no-title-promotion', 2, 0, 'cooking'], ['agreement', 0, 0, 'kapsalon']]) {
    const input = witness(sourceId, body, title), sourceInputHash = hash({ input, guardHash: metadata.guardHash });
    const registered = await registerShadowSourceWitness(f.db, { sourceId, sourceInputHash });
    const decision = classifyHierarchyConsensusRestriction(guard, input);
    assert.equal(decision.primaryNodeId, expected);
    const prepared = { revision: publication.revision, artifactHash: publication.artifactHash,
      modelHash: publication.modelHash, policyHash: publication.policyHash, sourceId, sourceInputHash,
      sourceWitnessVersion: registered.sourceWitnessVersion, nodeId: decision.primaryNodeId };
    assert.equal((await commitShadowDecision(f.db, prepared)).status, 'accepted');
    const path = await readShadowPath(f.db, { sourceId });
    assert.equal(path.policyHash, metadata.guardHash);
    if (expected !== null) {
      assert.equal((await bindShadowRoot(f.db, binding(prepared, `guard-root-${sourceId}`, `original-${sourceId}`))).status, 'bound');
    } else {
      assert.equal(path.status, 'unresolved');
      assert.equal((await bindShadowRoot(f.db, { ...binding(prepared, 'rejected-root', 'original-conflict'),
        nodeId: 'kapsalon' })).status, 'unassigned-source');
    }
  }
  assert.equal((await feed(f, 'cooking')).rootRefs.length, 2);
  assert.equal((await feed(f, 'kapsalon')).rootRefs.length, 1);
  assert.equal((await feed(f, 'nature')).rootRefs.length, 0);
});
