import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPGliteDatabase } from '../src/database.js';
import { importCanonicalV4 } from '../canonical-v4/index.js';
import { createCanonicalV4ReadFacade } from '../canonical-v4/read-facade.js';
import { createCanonicalV4RuntimeRepository } from '../canonical-v4/runtime-repository.js';
import { createPostgresCanonicalService } from '../../src/application/create-postgres-canonical-service.js';
import { openDormantPostgresApplication } from '../../src/startup.js';
import { createCanonicalPages } from '../../src/application/canonical-pages.js';
import { applyCommand, createDemoState } from '../../src/domain/demo-state.js';
import { applyLearnedIngest, BROWSER_MODEL_ID, readLearnedIngest } from '../../src/domain/learned-sources.js';
import { operationDigestFor, sourceStamp } from '../../src/domain/source-threads.js';
import { readEnrichment } from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';
import { projectRelatedPages } from '../../../../spikes/topic-resolution/browser/core/related-page-suggestions.js';
import {
  createNormalizedSqliteRepository,
  migrateNormalizedReferenceStorage,
} from '../../src/adapters/normalized-sqlite-repository.js';

const STAMP = '2026-10-13T16:00:00.000Z';
const RUNTIME_STAMP = '2026-10-13T16:01:00.000Z';
const ACTOR = {
  id: 'demo-alex',
  type: 'human',
  demo: true,
};
const version = (state) => ({ generation: state.generation, revision: state.revision });
const vector = (angle) => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const code = (wanted) => (error) => error?.code === wanted;

function buildImportedFixture(t, { extraPages = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-pg-v4-read-'));
  const filename = path.join(directory, 'canonical.sqlite');
  let serial = 0;
  const dependencies = { nextId: (kind) => `${kind}-read-${++serial}`, now: () => STAMP };
  let state = createDemoState({ generation: 'synthetic-postgres-v4-read', createdAt: STAMP,
    sources: [], topicSeeds: [] });
  for (const [name, angle] of [['a', 0], ['b', 0.08], ['c', 1.7],
    ...(extraPages ? [['d', 2.8], ['e', -1.8]] : [])]) {
    const input = readLearnedIngest({ expected: version(state), operationId: `operation-read-${name}`,
      url: `https://example.org/postgres-v4-read/${name}`, title: `Read source ${name}`,
      extractorVersion: 'main-text-prefix/v1', embedding: { modelId: BROWSER_MODEL_ID, values: vector(angle) } });
    state = applyLearnedIngest(state, input, operationDigestFor(input), dependencies).state;
  }
  const primaryBySource = new Map(state.sourceLinks.map((link) => [link.sourceId, link.topicId]));
  const topicA = primaryBySource.get(state.sources[0].id);
  const topicB = state.topics.find((topic) => topic.id !== topicA).id;
  const sourceA = state.sources.find((source) => primaryBySource.get(source.id) === topicA).id;
  const sourceB = state.sources.find((source) => primaryBySource.get(source.id) === topicB).id;
  let applied = applyCommand(state, { type: 'create-root', topicId: topicA,
    originSourceId: sourceA, body: 'Imported root A' }, ACTOR, dependencies);
  state = applied.state;
  const rootA = applied.result.contributionId;
  state = applyCommand(state, { type: 'reply', discussionId: state.discussions.find((entry) => entry.topicId === topicA).id,
    rootId: rootA, replyToId: rootA, originSourceId: sourceA, body: 'Imported reply A' }, ACTOR, dependencies).state;
  applied = applyCommand(state, { type: 'create-root', topicId: topicA,
    originSourceId: sourceA, body: 'Imported second root A' }, ACTOR, dependencies);
  state = applied.state;
  state = applyCommand(state, { type: 'create-root', topicId: topicB,
    originSourceId: sourceB, body: 'Imported root B' }, ACTOR, dependencies).state;

  let repository = createNormalizedSqliteRepository(filename, state);
  repository.close();
  state = migrateNormalizedReferenceStorage(filename, version(state), { represent: (source) => source.embedding.values });
  repository = createNormalizedSqliteRepository(filename, null);
  const next = structuredClone(repository.load());
  const overlap = next.sources.find((source) => source.id !== sourceA && source.id !== sourceB) ?? next.sources[1];
  next.sources.find((source) => source.id === overlap.id).topicIds = [topicA, topicB].sort();
  next.revision += 1;
  repository.save(version(state), next);
  repository.close();
  return {
    filename,
    directory,
    state: next,
    topicA,
    topicB,
    sourceA,
    sourceB,
    overlapSource: overlap.id,
    discussionA: next.discussions.find((entry) => entry.topicId === topicA).id,
    discussionB: next.discussions.find((entry) => entry.topicId === topicB).id,
  };
}

async function setup(t, options) {
  const fixture = buildImportedFixture(t, options);
  const database = await createPGliteDatabase();
  const sqliteHandles = [];
  t.after(async () => {
    for (const handle of sqliteHandles) handle.close();
    await database.close();
    rmSync(fixture.directory, { recursive: true, force: true });
  });
  await importCanonicalV4({ database, sqlitePath: fixture.filename });
  return { fixture, database, reads: createCanonicalV4ReadFacade({ database }), sqliteHandles };
}

function expectedPublicSource(state, sourceId) {
  const source = state.sources.find((entry) => entry.id === sourceId);
  const link = state.sourceLinks.find((entry) => entry.sourceId === sourceId);
  return {
    id: source.id,
    url: source.url,
    title: source.title,
    provenance: source.provenance,
    topicId: link.topicId,
    ...(source.topicIds ? { topicIds: [...source.topicIds] } : {}),
  };
}

function assertNoPrivateKeys(value) {
  const hidden = new Set(['embedding', 'operationId', 'operationDigest', 'values_double', 'reference',
    'command_receipts', 'requestDigest']);
  const visit = (entry) => {
    if (entry === null || typeof entry !== 'object') return;
    for (const [key, child] of Object.entries(entry)) {
      assert.equal(hidden.has(key), false, `${key} must remain private`);
      visit(child);
    }
  };
  visit(value);
}

test('canonical v4 reads preserve current public projections, byte ordering, overlap and primary routing', async (t) => {
  const { fixture, database, reads, sqliteHandles } = await setup(t);
  const sqlite = createNormalizedSqliteRepository(fixture.filename, null, { readOnly: true });
  sqliteHandles.push(sqlite);

  assert.deepEqual(await reads.header(), {
    schema: 'demo-state/v4',
    version: version(fixture.state),
    catalogVersion: 0,
    matchingVersion: 0,
  });
  assert.deepEqual(await reads.version(), version(fixture.state));
  assert.deepEqual(await reads.exactSource(fixture.overlapSource),
    expectedPublicSource(fixture.state, fixture.overlapSource));

  const overlap = await reads.catalogContext({ sourceId: null, topicId: fixture.topicB });
  const overlapped = overlap.sources.find((source) => source.id === fixture.overlapSource);
  assert.ok(overlapped, 'overlapping membership appears in the secondary Topic context');
  assert.equal(overlapped.topicId,
    fixture.state.sourceLinks.find((link) => link.sourceId === fixture.overlapSource).topicId,
  'the primary link remains the page-resolution destination');
  assert.ok(overlapped.topicIds.includes(fixture.topicB));
  const referenceSourceId = fixture.state.topics.find((topic) => topic.id === fixture.topicB).reference?.sourceId;
  assert.ok(referenceSourceId);
  assert.ok(overlap.sources.some((source) => source.id === referenceSourceId),
    'Topic context retains its fixed-reference Source closure');
  if (overlapped.topicId !== fixture.topicB) {
    await assert.rejects(reads.catalogContext({ sourceId: fixture.overlapSource, topicId: fixture.topicB }),
      code('conflict'), 'an overlapping membership is not promoted to primary routing authority');
  }

  const sqliteSourcePage = sqlite.readCatalogPage({ kind: 'sources', limit: 2, after: null });
  const postgresSourcePage = await reads.catalogPage({ kind: 'sources', limit: 2, cursor: null });
  assert.deepEqual(postgresSourcePage.items.map((entry) => entry.id),
    sqliteSourcePage.items.map((entry) => entry.id));
  assert.deepEqual(postgresSourcePage.items,
    sqliteSourcePage.items.map((source) => expectedPublicSource(fixture.state, source.id)));

  const sqliteDiscussion = createCanonicalPages(sqlite).contributions({
    topicId: fixture.topicA, limit: 2, cursor: null,
  });
  const postgresDiscussion = await reads.discussionPage({
    topicId: fixture.topicA, limit: 2, cursor: null,
  });
  assert.deepEqual(postgresDiscussion.items, sqliteDiscussion.items);
  assert.deepEqual((await reads.topicDiscussion(fixture.topicA)).topic, sqliteDiscussion.topic);
  assert.equal((await reads.topicDiscussion(fixture.topicA)).discussionId, sqliteDiscussion.discussionId);

  const bootstrapReference = fixture.state.topics.find((topic) => topic.reference?.sourceId).reference;
  await database.transaction(async (tx) => {
    const { rows: sourceOrdinals } = await tx.query(
      'SELECT COALESCE(max(ordinal)+1,0) AS next FROM canonical_v4.sources');
    const { rows: topicOrdinals } = await tx.query(
      'SELECT COALESCE(max(ordinal)+1,0) AS next FROM canonical_v4.topics');
    const { rows: discussionOrdinals } = await tx.query(
      'SELECT COALESCE(max(ordinal)+1,0) AS next FROM canonical_v4.discussions');
    const firstSourceOrdinal = Number(sourceOrdinals[0].next);
    const firstTopicOrdinal = Number(topicOrdinals[0].next);
    const firstDiscussionOrdinal = Number(discussionOrdinals[0].next);
    for (let index = 0; index < 101; index += 1) {
      const id = `000-unlinked-${String(index).padStart(3, '0')}`;
      const source = { id, url: `https://unlinked.example/${index}`, title: `Unlinked ${index}`,
        provenance: 'project-created-hand-authored-demo/1' };
      await tx.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'sources')", [id]);
      await tx.query(`INSERT INTO canonical_v4.sources
        (id,ordinal,payload,url,title,provenance,has_embedding)
        VALUES($1,$2,$3,$4,$5,$6,false)`,
      [id, firstSourceOrdinal + index, JSON.stringify(source), source.url, source.title, source.provenance]);

      const topic = { id: `000-topic-${String(index).padStart(3, '0')}`, kind: 'general',
        title: `Bootstrap Topic ${index}`, createdAt: STAMP,
        ...(index === 0 ? { reference: bootstrapReference } : {}) };
      const discussion = { id: `000-discussion-${String(index).padStart(3, '0')}`, topicId: topic.id };
      await tx.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'topics'),($2,'discussions')",
        [topic.id, discussion.id]);
      await tx.query(`INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at)
        VALUES($1,$2,$3,$4,$5,$6)`,
      [topic.id, firstTopicOrdinal + index, JSON.stringify(topic), topic.kind, topic.title, topic.createdAt]);
      await tx.query(`INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload)
        VALUES($1,$2,$3,$4)`,
      [discussion.id, discussion.topicId, firstDiscussionOrdinal + index, JSON.stringify(discussion)]);
      if (index === 0) await tx.query(`INSERT INTO canonical_v4.fixed_references
        (topic_id,payload,source_id,parameter_sha256,values_double,vector_mirror)
        VALUES($1,$2,$3,$4,$5,$6::vector)`,
      [topic.id, JSON.stringify(bootstrapReference), bootstrapReference.sourceId,
        bootstrapReference.parameterSha256, bootstrapReference.values,
        `[${bootstrapReference.values.map((value) => String(Math.fround(value))).join(',')}]`]);
    }
  });
  assert.deepEqual(await reads.exactSource('000-unlinked-000'), {
    id: '000-unlinked-000',
    url: 'https://unlinked.example/0',
    title: 'Unlinked 0',
    provenance: 'project-created-hand-authored-demo/1',
    topicId: null,
  });
  const boundedBootstrap = await reads.catalogContext({ sourceId: null, topicId: null });
  assert.equal(boundedBootstrap.truncated.topics, true);
  assert.equal(boundedBootstrap.truncated.sources, true);
  assert.equal(boundedBootstrap.topics.filter((topic) => topic.id.startsWith('000-topic-')).length, 100,
    'the existing 100-Topic bootstrap presentation window is bounded independently of closure');
  assert.equal(boundedBootstrap.sources.filter((source) => source.id.startsWith('000-unlinked-')).length, 100,
    'the advertised 100-Source presentation window is bounded');
  assert.ok(boundedBootstrap.sources.some((source) => source.id === bootstrapReference.sourceId),
    'fixed-reference closure is retained beyond the presentation window');

  for (const dto of [await reads.exactSource(fixture.sourceA), overlap, boundedBootstrap,
    postgresSourcePage, postgresDiscussion]) {
    assertNoPrivateKeys(dto);
    assert.ok(Object.isFrozen(dto));
  }
});

test('canonical v4 reads accept a retained fixed-reference row whose payload is JSON null', async (t) => {
  const { fixture, database, reads } = await setup(t);
  const topic = fixture.state.topics.find((entry) => entry.reference?.sourceId);
  assert.ok(topic);

  await database.transaction(async (tx) => {
    await tx.query(`UPDATE canonical_v4.topics SET
      payload=jsonb_set(payload::jsonb,'{reference}','null'::jsonb,false)::text,
      write_version=write_version+1
      WHERE id=$1`, [topic.id]);
    await tx.query(`UPDATE canonical_v4.fixed_references SET
      payload='null',source_id=NULL,parameter_sha256=NULL,values_double=NULL,vector_mirror=NULL
      WHERE topic_id=$1`, [topic.id]);
  });

  const { rows } = await database.query(
    'SELECT payload,source_id,parameter_sha256,values_double FROM canonical_v4.fixed_references WHERE topic_id=$1',
    [topic.id],
  );
  assert.deepEqual(rows, [{ payload: 'null', source_id: null, parameter_sha256: null, values_double: null }]);

  const catalog = await reads.catalogPage({ kind: 'topics', limit: 100, cursor: null });
  assert.ok(catalog.items.some((entry) => entry.id === topic.id));
  const discussion = await reads.discussionPage({ topicId: topic.id, limit: 100, cursor: null });
  assert.equal(discussion.topic.id, topic.id);
});

test('scope-bound cursors survive unrelated writes and expose a coherent runtime append', async (t) => {
  const { fixture, database, reads } = await setup(t);
  let serial = 0;
  const runtime = createCanonicalV4RuntimeRepository({
    database,
    nextId: () => `contribution-read-runtime-${++serial}`,
    now: () => RUNTIME_STAMP,
  });
  const discussionFirst = await reads.discussionPage({ topicId: fixture.topicA, limit: 1, cursor: null });
  const catalogFirst = await reads.catalogPage({ kind: 'sources', limit: 1, cursor: null });
  assert.ok(discussionFirst.nextCursor);
  assert.ok(catalogFirst.nextCursor);

  const initial = await runtime.version();
  await runtime.command({ actorId: ACTOR.id, requestId: 'read-request-unrelated', expected: initial,
    command: { type: 'create-root', topicId: fixture.topicB, originSourceId: fixture.sourceB,
      body: 'Unrelated runtime root B' } });
  const continuedDiscussion = await reads.discussionPage({
    topicId: fixture.topicA, limit: 1, cursor: discussionFirst.nextCursor,
  });
  assert.equal(continuedDiscussion.discussionVersion, discussionFirst.discussionVersion);
  assert.equal(continuedDiscussion.version.revision, initial.revision + 1,
    'the DTO comes from the newer coherent snapshot without rejecting its unchanged discussion scope');
  await reads.catalogPage({ kind: 'sources', limit: 1, cursor: catalogFirst.nextCursor });

  const afterUnrelated = await runtime.version();
  const accepted = await runtime.command({ actorId: ACTOR.id, requestId: 'read-request-visible', expected: afterUnrelated,
    command: { type: 'create-root', topicId: fixture.topicA, originSourceId: fixture.sourceA,
      body: 'Visible runtime root A' } });
  await assert.rejects(reads.discussionPage({
    topicId: fixture.topicA, limit: 1, cursor: discussionFirst.nextCursor,
  }), code('conflict'), 'a changed discussion invalidates only its own continuation');

  const current = await reads.discussionPage({ topicId: fixture.topicA, limit: 100, cursor: null });
  const appended = current.items.find((entry) => entry.id === accepted.result.contributionId);
  assert.equal(appended.body, 'Visible runtime root A');
  assert.equal(appended.origin.sourceId, fixture.sourceA);
  assert.equal(current.discussionVersion, discussionFirst.discussionVersion + 1);
  assert.equal((await reads.header()).version.revision, initial.revision + 2);
});

test('PostgreSQL discovery and account thread closure stay snapshot-coherent and canonical-only', async (t) => {
  const { fixture, reads } = await setup(t);
  const found = await reads.discover({ query: 'Imported', limit: 1, cursor: null });
  assert.equal(found.results.length, 1);
  assert.ok(found.results[0].visibleCount > 0);
  assert.ok(found.results[0].snippet.includes('Imported'));
  assert.ok(found.results[0].sources.every((source) => source.url.startsWith('https://')));
  if (found.nextCursor !== null) {
    const continued = await reads.discover({ query: 'Imported', limit: 1, cursor: found.nextCursor });
    assert.equal(continued.version.generation, found.version.generation);
    assert.notEqual(continued.results[0]?.topicId, found.results[0].topicId);
    await assert.rejects(reads.discover({ query: 'different', limit: 1, cursor: found.nextCursor }), code('conflict'));
  }
  await assert.rejects(reads.discover({ query: '*', limit: 20, cursor: null }), code('invalid'));

  const account = await reads.accountThreads(ACTOR.id);
  assert.deepEqual(account.version, version(fixture.state));
  assert.ok(account.threads.length >= 2);
  assert.ok(account.threads.every((thread) => thread.root.actorType === 'human'));
  assert.ok(account.threads.some((thread) => thread.root.replies.length === 1));
  assertNoPrivateKeys(account);
});

test('legacy full and page-matching composites use one repeatable-read snapshot', async (t) => {
  const { fixture, database, reads } = await setup(t);
  const catalog = await reads.fullCatalog();
  assert.equal(catalog.topics.length, fixture.state.topics.length);
  assert.equal(catalog.sources.length, fixture.state.sources.length);
  const discussion = await reads.fullDiscussion(fixture.topicA);
  assert.equal(discussion.items.length, 3);

  const selection = await reads.selectionBundle({ sourceId: fixture.sourceA, topicId: fixture.topicA });
  assert.deepEqual(selection.catalog.version, selection.discussion.version);
  assert.equal(selection.catalog.sources.find((source) => source.id === fixture.sourceA)?.topicId, fixture.topicA);
  assert.equal(selection.discussion.topic.id, fixture.topicA);
  const manualSelection = await reads.selectionBundle({ sourceId: null, topicId: fixture.topicA });
  assert.deepEqual(manualSelection.catalog.version, manualSelection.discussion.version);
  assert.equal(manualSelection.discussion.topic.id, fixture.topicA);
  const overlap = fixture.state.sources.find((source) => source.id === fixture.overlapSource);
  const overlapPrimary = fixture.state.sourceLinks.find((link) => link.sourceId === fixture.overlapSource).topicId;
  const overlapSelection = await reads.selectionBundle({ sourceId: fixture.overlapSource, topicId: overlapPrimary });
  assert.equal(overlapSelection.catalog.sources.find((source) => source.id === fixture.overlapSource)?.topicId, overlapPrimary);
  const overlapSecondary = overlap.topicIds.find((topicId) => topicId !== overlapPrimary);
  await assert.rejects(reads.selectionBundle({ sourceId: fixture.overlapSource, topicId: overlapSecondary }), code('conflict'));

  const sourceUrl = fixture.state.sources.find((source) => source.id === fixture.sourceA).url;
  const urlSelection = await reads.urlSelection({ url: sourceUrl });
  assert.deepEqual(urlSelection.catalog.version, urlSelection.discussion.version);
  assert.equal(urlSelection.catalog.sources.filter((source) => source.url === sourceUrl).length, 1);
  assert.equal(urlSelection.catalog.sources.find((source) => source.url === sourceUrl).id, fixture.sourceA);
  assert.equal(urlSelection.discussion.topic.id, fixture.topicA);
  await assert.rejects(reads.urlSelection({ url: `${sourceUrl}#document-fragment` }), code('invalid'));
  await assert.rejects(reads.urlSelection({ url: `${sourceUrl}?utm_source=tracking` }), code('invalid'));
  await assert.rejects(reads.urlSelection({ url: 'https://example.org/postgres-v4-read/missing' }), code('not-found'));

  const page = await reads.catalogPageWithContexts({ kind: 'sources', limit: 2, cursor: null });
  assert.equal(page.page.items.length, 2);
  assert.equal(page.contexts.length, 2);
  assert.ok(page.contexts.every((context) => context.catalogVersion === page.page.catalogVersion));

  const alternate = await reads.alternateBundle(fixture.overlapSource);
  assert.equal(alternate.discussions.length,
    fixture.state.sources.find((source) => source.id === fixture.overlapSource).topicIds.length);
  const primaryBySource = new Map(fixture.state.sourceLinks.map((link) => [link.sourceId, link.topicId]));
  const selectedMemberships = new Set(fixture.state.sources.find((source) =>
    source.id === fixture.overlapSource).topicIds);
  const expectedAlternateSourceIds = fixture.state.sources.filter((source) =>
    (source.topicIds ?? [primaryBySource.get(source.id)].filter(Boolean))
      .some((topicId) => selectedMemberships.has(topicId))).map((source) => source.id).sort();
  assert.deepEqual(alternate.sourceIds, expectedAlternateSourceIds);
  assert.equal(Object.hasOwn(alternate, 'catalog'), false,
    'the alternate projection never materializes the full catalog');
  assert.ok(alternate.discussions.every((entry) =>
    entry.version.generation === alternate.version.generation &&
    entry.version.revision === alternate.version.revision));

  const normalizedPayload = JSON.parse((await database.query(
    'SELECT payload FROM canonical_v4.sources WHERE id=$1', [fixture.sourceA])).rows[0].payload);
  assert.equal(Object.hasOwn(normalizedPayload, 'embedding'), false,
    'normalized imported Source payloads do not duplicate their embedding');
  const importedSource = fixture.state.sources.find((source) => source.id === fixture.sourceA);
  const importedAnchor = await reads.insightAnchor(fixture.topicA, fixture.sourceA);
  assert.equal(importedAnchor.sourceStamp, sourceStamp(importedSource),
    'the Insight stamp includes the authoritative normalized embedding');
  const related = await reads.relatedSources(fixture.sourceA, 20);
  assert.deepEqual(related.version, alternate.version);
  assert.ok(related.results.some((entry) => entry.id === fixture.overlapSource));

  const topicOnlyInsight = await reads.insightBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, includeDiscussion: false, destinationTopicId: fixture.topicB });
  assert.equal(Object.hasOwn(topicOnlyInsight.discussion, 'items'), false);
  assert.ok(Array.isArray(topicOnlyInsight.followupDiscussion.items));
  assertComponentVersions(topicOnlyInsight);
  const currentPageInsight = await reads.insightBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, includeDiscussion: false, includeRelatedSources: false,
    destinationTopicId: fixture.topicB });
  assert.equal(currentPageInsight.related, null);
  assertComponentVersions(currentPageInsight);
  await assert.rejects(reads.insightBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, includeDiscussion: false, includeRelatedSources: null,
    destinationTopicId: null }), code('invalid'));
  const fullInsight = await reads.insightBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, includeDiscussion: true, destinationTopicId: null });
  assert.ok(Array.isArray(fullInsight.discussion.items));
  assert.equal(fullInsight.followupDiscussion, null);
  assertComponentVersions(fullInsight);
  const jobBundle = await reads.insightJobBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, destinationTopicId: fixture.topicB });
  assert.ok(Array.isArray(jobBundle.followupDiscussion.items));
  assertComponentVersions(jobBundle);

  const enrichment = await reads.enrichmentBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, includeAlternate: true });
  assert.deepEqual(enrichment.catalog.version, enrichment.discussion.version);
  assert.deepEqual(enrichment.catalog.version, enrichment.version);
  assert.equal(enrichment.alternate?.version.generation, enrichment.version.generation);
  assertNoPrivateKeys(enrichment);

  const service = createPostgresCanonicalService({ reads,
    runtime: { command() { assert.fail('read projections cannot invoke a command'); } } });
  assert.equal(service.coherentSnapshotReads, true);
  const publicCatalog = await service.catalog();
  assert.equal(publicCatalog.sources.length, fixture.state.sources.length);
  const publicSelection = await service.selection({ sourceId: fixture.sourceA, topicId: fixture.topicA });
  assert.deepEqual(publicSelection.catalog.version, publicSelection.discussion.version);
  const publicUrlSelection = await service.urlSelection({ url: sourceUrl });
  assert.deepEqual(publicUrlSelection.catalog.version, publicUrlSelection.discussion.version);
  assert.equal(publicUrlSelection.discussion.topic.id, fixture.topicA);
  assert.equal((await service.discussion(fixture.topicA)).roots.length, 2);
  assert.equal((await service.alternateDiscussion(fixture.overlapSource)).sourceId, fixture.overlapSource);
  const publicInsight = await service.insightBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, includeDiscussion: false, destinationTopicId: fixture.topicB });
  assert.deepEqual(publicInsight.discussion.roots, []);
  assert.equal(publicInsight.followupDiscussion.roots.length, 1);
  assertComponentVersions(publicInsight);
  const publicJob = await service.insightJobBundle({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, destinationTopicId: null });
  assert.equal(publicJob.followupDiscussion, null);
  assertComponentVersions(publicJob);
  const projected = await service.enrichment({ sourceId: fixture.sourceA,
    topicId: fixture.topicA, includeAlternate: true });
  assert.deepEqual(projected.catalog.version, projected.discussion.version);
  assert.equal((await service.discover.search({ query: 'Imported', limit: 20, cursor: null })).results.length, 2);
  assertNoPrivateKeys(projected);
});

function assertComponentVersions(bundle) {
  const values = Object.values(bundle).filter((value) => value && typeof value === 'object' &&
    Object.hasOwn(value, 'version'));
  assert.ok(values.length > 0);
  assert.ok(values.every((value) => value.version.generation === bundle.version.generation &&
    value.version.revision === bundle.version.revision));
}

test('PostgreSQL enrichment supplies exact cross-Topic metadata through the real client and page projection', async (t) => {
  const { database, reads, fixture } = await setup(t, { extraPages: true });
  const remote = fixture.state.sources.filter(source => /\/[de]$/.test(source.url));
  assert.equal(remote.length, 2);
  const base = await reads.catalogContext({ sourceId: fixture.sourceB, topicId: fixture.topicB });
  assert.ok(remote.every(source => !base.sources.some(row => row.id === source.id)));
  const header = await reads.header();
  const memberships = (await database.query('SELECT * FROM canonical_v4.topic_memberships ORDER BY source_id,ordinal')).rows;
  async function angle(source, offset) {
    const values = vector(1.7 + offset);
    await database.query('UPDATE canonical_v4.embeddings SET payload=$2,values_double=$3 WHERE source_id=$1',
      [source.id, JSON.stringify({ modelId: BROWSER_MODEL_ID, values }), values]);
  }
  const service = createPostgresCanonicalService({ reads,
    runtime: { command() { assert.fail('enrichment attempted a write'); } } });
  const request = { sourceId: fixture.sourceB, topicId: fixture.topicB, includeAlternate: false };
  for (const offsets of [[0.45, 0.47], [0.62, 0.61]]) {
    await angle(remote[0], offsets[0]); await angle(remote[1], offsets[1]);
    const ordinary = offsets[0] < 0.5;
    const parsed = readEnrichment(await service.enrichment(request), request);
    assert.equal(parsed.errors.related, null);
    assert.deepEqual(parsed.related.results.map(row => row.id), ordinary ? remote.map(row => row.id) : [remote[1].id]);
    const projected = projectRelatedPages({ phase: 'ready', error: null, needsFreshRead: false,
      connected: true, sourceId: request.sourceId, topicId: request.topicId,
      catalog: parsed.catalog, related: parsed.related, discussion: parsed.discussion });
    assert.deepEqual(projected.pages.filter(row => remote.some(source => source.id === row.id)).map(row => row.id),
      parsed.related.results.map(row => row.id));
    for (const result of parsed.related.results) {
      const row = parsed.catalog.sources.find(source => source.id === result.id);
      assert.equal(row.url, result.url); assert.equal(row.title, result.title); assert.equal(row.topicId, result.topicId);
      assert.ok(row.topicIds.every(id => parsed.catalog.topics.some(topic => topic.id === id)));
    }
    assert.equal(parsed.catalog.sources.length, base.sources.length + parsed.related.results.length,
      'unrelated Topics do not expand to all members or unrelated references');
    assertNoPrivateKeys(parsed);
    const mismatched = structuredClone(parsed);
    mismatched.related.results[0].title += ' forged';
    assert.throws(() => readEnrichment(mismatched, request));
  }
  assert.deepEqual(await reads.header(), header);
  assert.deepEqual((await database.query('SELECT * FROM canonical_v4.topic_memberships ORDER BY source_id,ordinal')).rows, memberships);

  // Missing optional metadata must not reject the ready primary discussion.
  const omittedId = remote[1].id;
  const missingDatabase = { query: (...args) => database.query(...args),
    transaction: work => database.transaction(tx => work({ dialect: tx.dialect,
      async query(sql, parameters) {
        const result = await tx.query(sql, parameters);
        return sql.includes('SELECT * FROM canonical_v4.sources WHERE id IN') && parameters.includes(omittedId)
          ? { ...result, rows: result.rows.filter(row => row.id !== omittedId) } : result;
      } })) };
  const missingService = createPostgresCanonicalService({ reads: createCanonicalV4ReadFacade({ database: missingDatabase }),
    runtime: { command() { assert.fail('optional recovery attempted a write'); } } });
  const missing = readEnrichment(await missingService.enrichment(request), request);
  assert.equal(missing.errors.related, 'invalid-response');
  assert.equal(missing.related, null);
  assert.deepEqual(missing.catalog.sources, base.sources);
  assert.equal(missing.discussion.topic.id, fixture.topicB);

  // Exact normalized Topic mirrors are still required for newly added rows.
  const remoteTopic = fixture.state.sourceLinks.find(link => link.sourceId === omittedId).topicId;
  await database.query('UPDATE canonical_v4.topics SET title=$2 WHERE id=$1', [remoteTopic, 'Synthetic mirror drift']);
  const corrupted = readEnrichment(await service.enrichment(request), request);
  assert.equal(corrupted.related, null);
  assert.equal(corrupted.errors.related, 'invalid-response');
  assert.deepEqual(corrupted.catalog.sources, base.sources);
  assert.equal(corrupted.discussion.topic.id, fixture.topicB);

  await database.query('UPDATE canonical_v4.topics SET title=$2 WHERE id=$1',
    [remoteTopic, fixture.state.topics.find(topic => topic.id === remoteTopic).title]);
  // Real normalized rows exercise the existing 500-Topic closure boundary.
  const extraTopics = Array.from({ length: 501 }, (_, i) => ({
    id: `zz-optional-cap-${String(i).padStart(3, '0')}`, title: `Synthetic metadata ${i}`,
    kind: 'general', createdAt: STAMP }));
  const ordinal = Number((await database.query('SELECT max(ordinal)+1 AS next FROM canonical_v4.topics')).rows[0].next);
  await database.query(`INSERT INTO canonical_v4.id_registry(id,kind)
    SELECT value->>'id','topics' FROM jsonb_array_elements($1::jsonb)`, [JSON.stringify(extraTopics)]);
  await database.query(`INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at)
    SELECT value->>'id',$2+position-1,value::text,value->>'kind',value->>'title',value->>'createdAt'
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS entries(value,position)`,
  [JSON.stringify(extraTopics), ordinal]);
  const originalSource = JSON.parse((await database.query('SELECT payload FROM canonical_v4.sources WHERE id=$1', [omittedId])).rows[0].payload);
  for (const count of [500, 501]) {
    const topicIds = [remoteTopic, ...extraTopics.slice(0, count - base.topics.length - 1).map(topic => topic.id)].sort();
    await database.query('UPDATE canonical_v4.sources SET payload=$2 WHERE id=$1',
      [omittedId, JSON.stringify({ ...originalSource, topicIds })]);
    await database.query('DELETE FROM canonical_v4.topic_memberships WHERE source_id=$1', [omittedId]);
    await database.query(`INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT $1,id,position-1 FROM unnest($2::text[]) WITH ORDINALITY AS entries(id,position)`, [omittedId, topicIds]);
    const bounded = readEnrichment(await service.enrichment(request), request);
    if (count === 500) {
      assert.equal(bounded.errors.related, null);
      assert.equal(bounded.catalog.topics.length, 500);
      assert.deepEqual(bounded.related.results.map(row => row.id), [omittedId]);
    } else {
      assert.equal(bounded.errors.related, 'capacity');
      assert.equal(bounded.related, null);
      assert.deepEqual(bounded.catalog.sources, base.sources);
      assert.equal(bounded.discussion.topic.id, fixture.topicB);
    }
  }
});

test('Related returns one 0.80+ best page only without 0.88 matches, including public and Insight consumers', async (t) => {
  const { database, reads, fixture } = await setup(t);
  const ids = [fixture.sourceA, fixture.overlapSource, fixture.sourceB];
  const before = (await database.query('SELECT source_id,topic_id,ordinal FROM canonical_v4.topic_memberships ORDER BY source_id,ordinal')).rows;
  const header = await reads.header();
  async function setScore(id, score) {
    const values = [score, score === 0.8 ? 0.6 : Math.sqrt(1 - score * score), ...Array(382).fill(0)];
    const payload = { modelId: BROWSER_MODEL_ID, values };
    await database.query('UPDATE canonical_v4.embeddings SET payload=$2,values_double=$3 WHERE source_id=$1',
      [id, JSON.stringify(payload), values]);
  }
  await setScore(ids[0], 1); await setScore(ids[1], 0.85); await setScore(ids[2], 0.83);
  const service = createPostgresCanonicalService({ reads, runtime: { command() { assert.fail('read attempted a command'); } } });
  let result = await service.related(ids[0], 100);
  assert.deepEqual(result.results.map(item => item.id), [ids[1]]);
  assert.ok(result.results.every(item => item.relationship === 'related' && item.method === 'vector-similarity' &&
    Object.keys(item).sort().join() === 'id,method,relationship,title,topicId,url'));
  const insight = await reads.insightBundle({ sourceId: ids[0], topicId: fixture.topicA,
    includeDiscussion: false, destinationTopicId: null, includeRelatedSources: true });
  assert.deepEqual(insight.related.results.map(item => item.id), [ids[1]]);
  assert.deepEqual((await reads.relatedSources(ids[0], 0)).results, []);

  await setScore(ids[1], 0.8); await setScore(ids[2], 0.799999);
  assert.deepEqual((await reads.relatedSources(ids[0], 100)).results.map(item => item.id), [ids[1]]);
  await setScore(ids[1], 0.799999);
  assert.deepEqual((await reads.relatedSources(ids[0], 100)).results, []);
  await setScore(ids[1], 0.90); await setScore(ids[2], 0.83);
  assert.deepEqual((await reads.relatedSources(ids[0], 100)).results.map(item => item.id), [ids[1]]);
  await setScore(ids[2], 0.91);
  assert.deepEqual((await reads.relatedSources(ids[0], 100)).results.map(item => item.id), [ids[2], ids[1]]);
  assert.deepEqual(await reads.header(), header);
  assert.deepEqual((await database.query('SELECT source_id,topic_id,ordinal FROM canonical_v4.topic_memberships ORDER BY source_id,ordinal')).rows, before);

  // Corruption below both floors must still invalidate the exhaustive read.
  await setScore(ids[1], 0.79); await setScore(ids[2], 0.81);
  await database.query('UPDATE canonical_v4.embeddings SET model_id=$2 WHERE source_id=$1', [ids[1], 'typed-mirror-drift']);
  await assert.rejects(reads.relatedSources(ids[0], 100), code('storage-corrupt'));
});

test('optional heavy reads have two admissions without consuming core selection capacity', async (t) => {
  const { reads, fixture } = await setup(t);
  let release, admit;
  const gate = new Promise(resolve => { release = resolve; });
  const admitted = new Promise(resolve => { admit = resolve; });
  let starts = 0;
  const heldReads = { ...reads, async relatedSources(id, limit) {
    if (++starts === 2) admit();
    await gate;
    return reads.relatedSources(id, limit);
  } };
  const service = createPostgresCanonicalService({ reads: heldReads,
    runtime: { command() { assert.fail('read attempted a write'); } } });
  const first = service.related(fixture.sourceA, 20), second = service.related(fixture.sourceA, 5);
  try {
    await admitted;
    await assert.rejects(service.related(fixture.sourceA, 10), code('capacity'));
    const core = await service.selection({ sourceId: fixture.sourceA, topicId: fixture.topicA });
    assert.equal(core.discussion.topic.id, fixture.topicA);
    assert.equal(starts, 2);
  } finally { release(); await Promise.all([first, second]); }
});

test('lossless text wire survives nested snapshots and rejects a below-floor signed-zero mirror drift', async (t) => {
  const { database, reads, fixture } = await setup(t);
  let packedQueries = 0;
  const wireDatabase = { query: (...args) => database.query(...args),
    transaction: work => database.transaction(tx => work({ dialect: 'canonical-snapshot', wireDialect: 'pg',
      query(sql, parameters) {
        if (sql.includes('array_send(values_double)')) packedQueries++;
        return tx.query(sql, parameters);
      } })) };
  const wire = createCanonicalV4ReadFacade({ database: wireDatabase });
  assert.deepEqual(await wire.relatedSources(fixture.sourceA, 20), await reads.relatedSources(fixture.sourceA, 20));
  const before = packedQueries;
  assert.deepEqual(await wire.relatedSources(fixture.sourceA, 20), await reads.relatedSources(fixture.sourceA, 20));
  assert.equal(packedQueries, before, 'unchanged verified catalog reuses vectors without binary hydration');
  // A logically unchanged UPDATE still creates a new dependency tuple version.
  // Force fresh hydration so nesting must retain its lossless wire dialect,
  // rather than accidentally satisfying the assertion from the warm cache.
  await database.query('UPDATE canonical_v4.embeddings SET values_double=values_double WHERE source_id=$1', [fixture.sourceB]);
  const request = { sourceId: fixture.sourceA, topicId: fixture.topicA, includeAlternate: false };
  assert.deepEqual(await wire.enrichmentBundle(request), await reads.enrichmentBundle(request));
  assert.ok(packedQueries > before, 'native wire mode survives same-snapshot facade nesting');
  // This candidate is below both retrieval floors, and JSON encodes this slot
  // as +0. PostgreSQL preserves -0 in the exact binary representation.
  await database.query("UPDATE canonical_v4.embeddings SET values_double[3]='-0'::float8 WHERE source_id=$1", [fixture.sourceB]);
  await assert.rejects(wire.relatedSources(fixture.sourceA, 20), code('storage-corrupt'));
});

test('related Sources use the normalized embedding relation and reject every duplicate or typed-mirror drift', async (t) => {
  const { fixture, database, reads } = await setup(t);
  const sourceRow = (await database.query(
    'SELECT payload FROM canonical_v4.sources WHERE id=$1', [fixture.sourceA])).rows[0];
  const mirrorRow = (await database.query(`SELECT payload,model_id,dimensions,values_double
    FROM canonical_v4.embeddings WHERE source_id=$1`, [fixture.sourceA])).rows[0];
  const source = JSON.parse(sourceRow.payload), embedding = JSON.parse(mirrorRow.payload);
  assert.equal(Object.hasOwn(source, 'embedding'), false);
  assert.ok((await reads.relatedSources(fixture.sourceA, 20)).results.length > 0);

  const initialAnchor = await reads.insightAnchor(fixture.topicA, fixture.sourceA);
  const changedEmbedding = { ...embedding, values: [...embedding.values] };
  changedEmbedding.values[0] += 0.001;
  await database.query(`UPDATE canonical_v4.embeddings
    SET payload=$2,values_double=$3::double precision[] WHERE source_id=$1`,
  [fixture.sourceA, JSON.stringify(changedEmbedding), changedEmbedding.values]);
  const changedStamp = sourceStamp({ ...source, embedding: changedEmbedding });
  const changedAnchor = await reads.insightAnchor(fixture.topicA, fixture.sourceA);
  assert.notEqual(changedAnchor.sourceStamp, initialAnchor.sourceStamp,
    'authoritative embedding changes invalidate the generated-job anchor');
  assert.equal(changedAnchor.sourceStamp, changedStamp);
  await database.query(`UPDATE canonical_v4.embeddings
    SET payload=$2,values_double=$3::double precision[] WHERE source_id=$1`,
  [fixture.sourceA, mirrorRow.payload, mirrorRow.values_double]);

  await database.query('UPDATE canonical_v4.sources SET payload=$2 WHERE id=$1',
    [fixture.sourceA, JSON.stringify({ ...source, embedding })]);
  assert.ok((await reads.relatedSources(fixture.sourceA, 20)).results.length > 0,
    'a newer exact duplicate remains accepted');
  const divergentEmbedding = { ...embedding, values: [...embedding.values] };
  divergentEmbedding.values[0] += 0.001;
  await database.query('UPDATE canonical_v4.sources SET payload=$2 WHERE id=$1',
    [fixture.sourceA, JSON.stringify({ ...source, embedding: divergentEmbedding })]);
  await assert.rejects(reads.relatedSources(fixture.sourceA, 20), code('storage-corrupt'));

  await database.query('UPDATE canonical_v4.sources SET payload=$2 WHERE id=$1',
    [fixture.sourceA, sourceRow.payload]);
  await database.query('UPDATE canonical_v4.embeddings SET model_id=$2 WHERE source_id=$1',
    [fixture.sourceA, `${mirrorRow.model_id}-drift`]);
  await assert.rejects(reads.relatedSources(fixture.sourceA, 20), code('storage-corrupt'));
  await database.query('UPDATE canonical_v4.embeddings SET model_id=$2 WHERE source_id=$1',
    [fixture.sourceA, mirrorRow.model_id]);

  const driftedValues = [...mirrorRow.values_double];
  driftedValues[0] += 0.001;
  await database.query('UPDATE canonical_v4.embeddings SET values_double=$2 WHERE source_id=$1',
    [fixture.sourceA, driftedValues]);
  await assert.rejects(reads.relatedSources(fixture.sourceA, 20), code('storage-corrupt'));
  await database.query('UPDATE canonical_v4.embeddings SET values_double=$2 WHERE source_id=$1',
    [fixture.sourceA, mirrorRow.values_double]);

  await database.query('UPDATE canonical_v4.embeddings SET payload=$2 WHERE source_id=$1',
    [fixture.sourceA, JSON.stringify({ ...embedding, values: embedding.values.slice(1) })]);
  await assert.rejects(reads.relatedSources(fixture.sourceA, 20), code('storage-corrupt'));
});

test('related Source exhaustive hydration rejects filtered candidate embedding mirror drift', async (t) => {
  const { fixture, database, reads } = await setup(t);
  assert.equal((await reads.relatedSources(fixture.sourceA, 20)).results
    .some((entry) => entry.id === fixture.overlapSource), true);
  const row = (await database.query(`SELECT payload,model_id,values_double FROM canonical_v4.embeddings
    WHERE source_id=$1`, [fixture.overlapSource])).rows[0];
  const embedding = JSON.parse(row.payload);
  embedding.values[0] += 0.001;
  await database.query('UPDATE canonical_v4.embeddings SET payload=$2 WHERE source_id=$1',
    [fixture.overlapSource, JSON.stringify(embedding)]);
  await assert.rejects(reads.relatedSources(fixture.sourceA, 20), code('storage-corrupt'));

  await database.query('UPDATE canonical_v4.embeddings SET payload=$2 WHERE source_id=$1',
    [fixture.overlapSource, row.payload]);
  await database.query('UPDATE canonical_v4.embeddings SET model_id=$2 WHERE source_id=$1',
    [fixture.overlapSource, `${row.model_id}-drift`]);
  await assert.rejects(reads.relatedSources(fixture.sourceA, 20), code('storage-corrupt'),
    'a different-model typed drift cannot disappear before mirror verification');

  await database.query('UPDATE canonical_v4.embeddings SET model_id=$2 WHERE source_id=$1',
    [fixture.overlapSource, row.model_id]);
  await database.query(`UPDATE canonical_v4.embeddings SET values_double=$2::double precision[]
    WHERE source_id=$1`, [fixture.overlapSource, vector(Math.PI)]);
  await assert.rejects(reads.relatedSources(fixture.sourceA, 20), code('storage-corrupt'),
    'a below-threshold typed-vector drift cannot disappear before mirror verification');
});

test('alternate bundle stays scoped when an unrelated full catalog cannot fit', async (t) => {
  const { fixture, database, reads } = await setup(t);
  const id = 'zzzz-unrelated-oversized-source';
  const source = { id, url: 'https://oversized.example/unrelated', title: 'x'.repeat(1_050_000),
    provenance: 'project-created-hand-authored-demo/1' };
  const ordinal = Number((await database.query(
    'SELECT COALESCE(max(ordinal)+1,0) AS next FROM canonical_v4.sources')).rows[0].next);
  await database.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'sources')", [id]);
  await database.query(`INSERT INTO canonical_v4.sources
    (id,ordinal,payload,url,title,provenance,has_embedding) VALUES($1,$2,$3,$4,$5,$6,false)`,
  [id, ordinal, JSON.stringify(source), source.url, source.title, source.provenance]);
  await assert.rejects(reads.fullCatalog(), code('capacity'));
  const alternate = await reads.alternateBundle(fixture.overlapSource);
  assert.equal(alternate.sourceIds.includes(id), false);
  assert.equal(Object.hasOwn(alternate, 'catalog'), false);
  assert.ok(alternate.sourceIds.includes(fixture.overlapSource));
});

test('dormant PostgreSQL startup keeps app and worker database ownership explicit', async (t) => {
  const { fixture, database } = await setup(t);
  const workerDatabase = Object.freeze({ query: (...args) => database.query(...args),
    transaction: (work) => database.transaction(work) });
  let urlSelectionTransactions = 0, urlSelectionClosed = 0;
  const urlSelectionDatabase = Object.freeze({
    query: (...args) => database.query(...args),
    transaction(work) {
      urlSelectionTransactions += 1;
      return database.transaction(work);
    },
    async close() { urlSelectionClosed += 1; },
  });
  let disposed = 0, serial = 0;
  const application = await openDormantPostgresApplication({
    config: { host: '127.0.0.1', port: 4174, origin: `chrome-extension://${'e'.repeat(32)}`,
      capability: 'postgres-startup-capability-token' },
    databasePath: fixture.filename,
    canonicalDatabase: database,
    urlSelectionDatabase,
    urlSelectionDatabaseOwned: true,
    ingestionWorkerDatabase: workerDatabase,
    referenceMatcher: { represent: () => null },
    nextId: (kind) => `${kind}-postgres-startup-${++serial}`,
    now: () => STAMP,
    ai: { dispose() { disposed += 1; }, restore: async () => false },
  });
  const response = await application.handle({ method: 'GET', url: '/v1/catalog', body: null, headers: {
    host: '127.0.0.1:4174', origin: `chrome-extension://${'e'.repeat(32)}`,
    authorization: 'Bearer postgres-startup-capability-token',
  } });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).sources.length, fixture.state.sources.length);
  const selected = await application.handle({ method: 'POST', url: '/v1/catalog/selection', headers: {
    host: '127.0.0.1:4174', origin: `chrome-extension://${'e'.repeat(32)}`,
    authorization: 'Bearer postgres-startup-capability-token', 'content-type': 'application/json',
  }, body: JSON.stringify({ sourceId: fixture.sourceA, topicId: fixture.topicA }) });
  assert.equal(selected.status, 200);
  const selectedBody = JSON.parse(selected.body);
  assert.deepEqual(selectedBody.catalog.version, selectedBody.discussion.version);
  assert.equal(selectedBody.discussion.topic.id, fixture.topicA);
  assert.equal(urlSelectionTransactions, 0,
    'ordinary reads stay on the general PostgreSQL pool');
  const sourceUrl = fixture.state.sources.find((source) => source.id === fixture.sourceA).url;
  const selectedByUrl = await application.handle({ method: 'POST', url: '/v1/catalog/url-selection', headers: {
    host: '127.0.0.1:4174', origin: `chrome-extension://${'e'.repeat(32)}`,
    authorization: 'Bearer postgres-startup-capability-token', 'content-type': 'application/json',
  }, body: JSON.stringify({ url: sourceUrl }) });
  assert.equal(selectedByUrl.status, 200);
  const selectedByUrlBody = JSON.parse(selectedByUrl.body);
  assert.deepEqual(selectedByUrlBody.catalog.version, selectedByUrlBody.discussion.version);
  assert.equal(selectedByUrlBody.discussion.topic.id, fixture.topicA);
  assert.equal(urlSelectionTransactions, 2,
    'both the current-version fence and exact authenticated URL recovery read own the isolated pool');
  const edited = await application.handle({ method: 'POST', url: '/v1/commands', headers: {
    host: '127.0.0.1:4174', origin: `chrome-extension://${'e'.repeat(32)}`,
    authorization: 'Bearer postgres-startup-capability-token', 'content-type': 'application/json',
    'x-demo-actor': ACTOR.id,
  }, body: JSON.stringify({ expected: version(fixture.state), command: { type: 'edit',
    contributionId: fixture.state.contributions[0].id, body: 'Edited through PostgreSQL startup wiring' } }) });
  assert.equal(edited.status, 200);
  assert.equal(JSON.parse(edited.body).result.contributionId, fixture.state.contributions[0].id);
  await application.close();
  assert.equal(disposed, 1);
  assert.equal(urlSelectionClosed, 1);
  assert.deepEqual((await database.query('SELECT 1 AS still_open')).rows, [{ still_open: 1 }]);
});

test('canonical v4 reads fail closed on malformed requests, missing objects and typed-mirror drift', async (t) => {
  const { fixture, database, reads } = await setup(t);
  await assert.rejects(reads.exactSource('missing-source'), code('not-found'));
  for (const input of [
    { kind: 'other', limit: 1, cursor: null },
    { kind: 'sources', limit: 0, cursor: null },
    { kind: 'sources', limit: 101, cursor: null },
    { kind: 'sources', limit: 1, cursor: '!' },
    { kind: 'sources', limit: 1, cursor: null, private: true },
  ]) await assert.rejects(reads.catalogPage(input), code('invalid'));
  await assert.rejects(reads.discussionPage({ topicId: fixture.topicA, limit: 1, cursor: null, actorId: ACTOR.id }),
    code('invalid'));

  const sourcePage = await reads.catalogPage({ kind: 'sources', limit: 1, cursor: null });
  await assert.rejects(reads.catalogPage({ kind: 'topics', limit: 1, cursor: sourcePage.nextCursor }), code('invalid'));
  const discussionPage = await reads.discussionPage({ topicId: fixture.topicA, limit: 1, cursor: null });
  await assert.rejects(reads.discussionPage({
    topicId: fixture.topicB, limit: 1, cursor: discussionPage.nextCursor,
  }), code('conflict'));

  await database.query('UPDATE canonical_v4.runtime_state SET catalog_version=catalog_version+1 WHERE singleton=true');
  await assert.rejects(reads.catalogPage({
    kind: 'sources', limit: 1, cursor: sourcePage.nextCursor,
  }), code('conflict'), 'only a catalog-scope version change invalidates a catalog continuation');

  const { rows: revisions } = await database.query(`SELECT revision.contribution_id,revision.ordinal,revision.payload
    FROM canonical_v4.revisions AS revision
    JOIN canonical_v4.contributions AS contribution ON contribution.id=revision.contribution_id
    WHERE contribution.discussion_id=$1 ORDER BY contribution.ordinal,revision.ordinal LIMIT 1`, [fixture.discussionA]);
  const malformedRevision = { ...JSON.parse(revisions[0].payload), hidden: 'not canonical' };
  await database.query(`UPDATE canonical_v4.revisions SET payload=$3
    WHERE contribution_id=$1 AND ordinal=$2`,
  [revisions[0].contribution_id, revisions[0].ordinal, JSON.stringify(malformedRevision)]);
  await assert.rejects(reads.discussionPage({
    topicId: fixture.topicA, limit: 100, cursor: null,
  }), code('storage-corrupt'));

  await database.query('UPDATE canonical_v4.sources SET title=$2 WHERE id=$1',
    [fixture.sourceA, 'Drifted typed title']);
  await assert.rejects(reads.exactSource(fixture.sourceA), code('storage-corrupt'));
});
