import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { seedCanonicalV4RuntimeFixture } from './canonical-v4-runtime-fixture.js';
import { createCanonicalV4ReadFacade } from '../canonical-v4/read-facade.js';
import { createPostgresCanonicalService } from '../../src/application/create-postgres-canonical-service.js';
import { createChatGPTRuntime } from '../../src/ai/chatgpt-runtime.js';
import { BROWSER_MODEL_ID } from '../../src/domain/learned-sources.js';
import { buildInsightContext } from '../../../../spikes/topic-resolution/browser/core/insight-context.js';
import { readEnrichment } from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';

// Entirely synthetic, in-memory canonical data and an inert provider adapter.
async function setup(t) {
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  for (const sourceId of [fixture.sourceA, fixture.sourceB, fixture.historicalSource]) {
    const row = (await database.query('SELECT payload FROM canonical_v4.sources WHERE id=$1', [sourceId])).rows[0];
    const provenance = sourceId === fixture.historicalSource
      ? 'project-created-hand-authored-demo/1' : 'owner-local-page-embedding/v1';
    const payload = { ...JSON.parse(row.payload), provenance,
      ...(sourceId === fixture.historicalSource ? {} : { extractorVersion: 'main-text-prefix/v1' }) };
    await database.query('UPDATE canonical_v4.sources SET payload=$2,provenance=$3,extractor_version=$4 WHERE id=$1',
      [sourceId, JSON.stringify(payload), provenance, payload.extractorVersion ?? null]);
  }
  for (const [sourceId, score] of [[fixture.sourceA, 1], [fixture.sourceB, 0.9]]) {
    const values = [score, Math.sqrt(1 - score * score), ...Array(382).fill(0)];
    await database.query('UPDATE canonical_v4.sources SET has_embedding=true WHERE id=$1', [sourceId]);
    await database.query(`INSERT INTO canonical_v4.embeddings
      (source_id,payload,model_id,dimensions,values_double)
      VALUES($1,$2,$3,384,$4::double precision[])`,
    [sourceId, JSON.stringify({ modelId: BROWSER_MODEL_ID, values }), BROWSER_MODEL_ID, values]);
  }
  const reads = createCanonicalV4ReadFacade({ database });
  const service = createPostgresCanonicalService({ reads,
    runtime: { command() { assert.fail('Insight context reads cannot write'); } } });
  const calls = [];
  const runtime = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true,
      account: { clientId: 'synthetic-related', label: 'Synthetic' } }), dispose() {} },
    insightsAdapter: { async createInsight(value) {
      calls.push(value);
      return { body: 'Synthetic answer', citations: [], model: 'synthetic' };
    }, cancel() {}, dispose() {} } });
  t.after(() => runtime.dispose());
  return { database, reads, fixture, service, runtime, calls };
}

function contextFor(bundle, fixture, excludedRelatedSourceIds = []) {
  return buildInsightContext({ catalog: bundle.catalog, discussion: bundle.discussion,
    related: bundle.related, sourceId: fixture.sourceA, topicId: fixture.topicA,
    includeDiscussion: false, sourceLimit: 6, excludedRelatedSourceIds });
}

function requestFor(context, fixture, operationId, includeRelatedSources = true) {
  return { operationId, model: 'synthetic', context, articleText: 'Synthetic public page text',
    allowWebResearch: false, includeRelatedSources,
    expected: { generation: fixture.generation, revision: fixture.revision } };
}

test('same-snapshot public Related context is accepted by Insight reconstruction and inert runtime', async (t) => {
  const { reads, fixture, service, runtime, calls } = await setup(t);
  const input = { sourceId: fixture.sourceA, topicId: fixture.topicA, includeAlternate: false };
  const base = await reads.catalogContext({ sourceId: input.sourceId, topicId: input.topicId });
  // This fixture deliberately has a cross-Topic Related page absent from base context.
  assert.equal(base.sources.some(source => source.id === fixture.sourceB), false);
  const enrichment = readEnrichment(await service.enrichment(input), input);
  assert.equal(enrichment.errors.related, null);
  assert.ok(enrichment.related.results.some(source => source.id === fixture.sourceB));
  const clientContext = contextFor(enrichment, fixture);
  assert.ok(clientContext.relatedSources.some(source => source.id === fixture.sourceB));
  const bundle = await service.insightBundle({ sourceId: fixture.sourceA, topicId: fixture.topicA,
    includeDiscussion: false, includeRelatedSources: true, destinationTopicId: null });
  assert.deepEqual(bundle.version, enrichment.catalog.version, 'no revision race is needed to reproduce this defect');
  assert.equal((await runtime.create(requestFor(clientContext, fixture, 'related-context'), 'demo-alex')).state, 'running');
  assert.equal(calls.length, 1);
  assert.deepEqual(contextFor(bundle, fixture), clientContext);
  await new Promise(resolve => setImmediate(resolve));

  const forgedRelated = structuredClone(clientContext);
  forgedRelated.relatedSources.find(source => source.id === fixture.sourceB).title += ' forged';
  await assert.rejects(runtime.create(requestFor(forgedRelated, fixture, 'forged-related'), 'demo-alex'),
    error => error.code === 'invalid');
  await assert.rejects(runtime.create({ ...requestFor(clientContext, fixture, 'invalid-exclusion'),
    excludedRelatedSourceIds: ['source-not-in-canonical-choices'] }, 'demo-alex'),
  error => error.code === 'invalid');
  assert.equal(calls.length, 1, 'forged Related metadata and exclusions cannot dispatch');

  const excludedContext = contextFor(enrichment, fixture, [fixture.sourceB]);
  assert.equal(excludedContext.relatedSources.some(source => source.id === fixture.sourceB), false);
  assert.equal((await runtime.create({ ...requestFor(excludedContext, fixture, 'excluded-related'),
    excludedRelatedSourceIds: [fixture.sourceB] }, 'demo-alex')).state, 'running');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].context, excludedContext);
  await new Promise(resolve => setImmediate(resolve));

  // Existing same-Topic followup authority applies even when the root's origin
  // is historical; Related hydration supplies evidence, never a new destination.
  const followupDiscussion = await service.discussion(fixture.topicA);
  assert.equal(followupDiscussion.topic.id, fixture.topicA);
  const root = followupDiscussion.roots.find(entry => entry.id === fixture.historicalRoot);
  assert.equal(root.actorType, 'human');
  assert.equal((await runtime.create({ ...requestFor(clientContext, fixture, 'related-followup'),
    followupQuestionId: root.id }, 'demo-alex')).state, 'running');
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].context, clientContext);
  assert.deepEqual(calls[2].followup, { parentBody: root.body, questionBody: root.body });
});

test('disabled Related avoids exhaustive vectors and forged context never reaches the inert provider', async (t) => {
  const { database, fixture, service, runtime, calls } = await setup(t);
  // This unrelated typed-vector mirror corruption must fail an exhaustive scan,
  // while the explicitly current-page-only request still works.
  await database.query('UPDATE canonical_v4.embeddings SET model_id=$2 WHERE source_id=$1',
    [fixture.sourceB, 'synthetic-corrupt-model']);
  const bundle = await service.insightBundle({ sourceId: fixture.sourceA, topicId: fixture.topicA,
    includeDiscussion: false, includeRelatedSources: false, destinationTopicId: null });
  assert.equal(bundle.related, null);
  const context = contextFor(bundle, fixture);
  const forged = structuredClone(context);
  forged.currentSource.title += ' forged';
  await assert.rejects(Promise.resolve().then(() => runtime.create(
    requestFor(forged, fixture, 'forged-context', false), 'demo-alex')), error => {
      assert.equal(error.code, 'invalid', error.stack); return true;
    });
  assert.equal(calls.length, 0);
  await assert.rejects(service.insightBundle({ sourceId: fixture.sourceA, topicId: fixture.topicA,
    includeDiscussion: false, includeRelatedSources: true, destinationTopicId: null }),
  error => error.code === 'storage-corrupt');
  assert.equal((await runtime.create(requestFor(context, fixture, 'no-related-context', false), 'demo-alex')).state, 'running');
  assert.equal(calls.length, 1);
});
