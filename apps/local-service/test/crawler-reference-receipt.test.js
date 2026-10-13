import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createDemoState } from '../src/domain/demo-state.js';
import { migrateReferenceTopicState } from '../src/domain/reference-state-migration.js';
import { createFixedReferenceMatcher } from '../src/domain/fixed-reference-topic-integration.js';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { createRequestHandler } from '../src/http/request-handler.js';
import { createLocalIngestClient } from '../src/crawler/local-ingest-client.js';
import { deterministicDependencies } from './helpers.js';
import { createHash } from 'node:crypto';
import { createCrawlState } from '../src/crawler/crawl-state.js';
import { runCrawler } from '../src/crawler/crawl-runner.js';
import { representationDigest } from '../src/crawler/diversity.js';

const token = 'A'.repeat(43);
const representation = (name, angle) => ({ url: `https://example.org/article-${name}`, title: `Synthetic ${name}`,
  extractorVersion: 'crawler-static-html-prefix/v1', embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1',
    values: [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)] } });

// Exercise real HTTP routing and canonical commits without opening a socket or
// contacting the running service. Only the transport stream is synthetic.
function setup(t, { legacy = false, mutate = value => value, status = null, hold = false } = {}) {
  const dependencies = deterministicDependencies();
  let initial = createDemoState({ generation: 'generation-crawler-receipt', createdAt: dependencies.now(), sources: [], topicSeeds: [] });
  if (!legacy) initial = migrateReferenceTopicState(initial, { represent() { assert.fail('empty fixture has no references'); } });
  const repository = createNormalizedSqliteRepository(':memory:', initial); t.after(() => repository.close());
  const service = createDiscussionService({ repository, ...dependencies, sources: [], topicSeeds: [], ranking: createFixtureRankingAdapter(),
    referenceMatcher: createFixedReferenceMatcher({ transform: values => values }) });
  const handle = createRequestHandler({ service, config: { hostHeader: '127.0.0.1:4174', capability: token,
    origin: `chrome-extension://${'a'.repeat(32)}` } });
  const calls = [], pending = [];
  const requestImpl = (options, receive) => {
    const outgoing = new EventEmitter(); outgoing.destroy = () => outgoing;
    outgoing.end = bytes => {
      const body = bytes ? Buffer.from(bytes).toString('utf8') : null;
      calls.push({ method: options.method, path: options.path, body: body === null ? null : JSON.parse(body) });
      Promise.resolve().then(async () => {
        const response = status === null ? await handle({ method: options.method, url: options.path,
          headers: { ...options.headers, host: '127.0.0.1:4174' }, body })
          : { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'invalid-request' }) };
        const value = mutate(JSON.parse(response.body));
        const emit = () => {
          const incoming = new PassThrough(), payload = Buffer.from(JSON.stringify(value));
          incoming.statusCode = response.status; incoming.complete = true;
          incoming.headers = { ...response.headers, 'content-length': String(payload.length) };
          receive(incoming); incoming.end(payload);
        };
        if (hold) pending.push(emit); else emit();
      }).catch(() => outgoing.emit('error', new Error('Synthetic transport failure')));
    };
    return outgoing;
  };
  return { repository, service, calls, pending, requestImpl, client: createLocalIngestClient({ token, requestImpl }) };
}

test('crawler accepts real v4 A/B/C receipts, all memberships and the retained primary without extra requests', async t => {
  const f = setup(t);
  let operation = 0;
  const ingest = (name, angle) => f.client.ingest(representation(name, angle), `crawler-operation-${name}-${++operation}`, f.service.version());
  const a = await ingest('a', -.4), b = await ingest('b', .4), c = await ingest('c', 0);
  assert.notEqual(a.topicId, b.topicId);
  assert.deepEqual(c.topicIds, [a.topicId, b.topicId].sort());
  assert.equal(c.topicId, c.topicIds[0]); assert.equal(c.policyVersion, 'ridge1-fixed-reference-radius/v1');
  const updated = await ingest('c', .1);
  assert.equal(updated.sourceId, c.sourceId); assert.equal(updated.topicId, c.topicId);
  assert.deepEqual(updated.topicIds, c.topicIds);
  const onlyB = await ingest('c', .6);
  assert.deepEqual(onlyB.topicIds, [b.topicId]); assert.equal(onlyB.topicId, b.topicId);
  const restored = await ingest('c', 0);
  assert.deepEqual(restored.topicIds, c.topicIds);
  assert.equal(restored.topicId, b.topicId, 'surviving primary is retained even when it is not the first sorted membership');
  const stored = f.repository.load().sources.find(source => source.id === c.sourceId);
  assert.deepEqual(stored.topicIds, c.topicIds);
  assert.equal(f.repository.load().topics.length, 2);
  assert.equal(f.calls.length, 6); assert.ok(f.calls.every(call => call.path === '/v1/sources/ingest'));
});

test('crawler preserves actual legacy receipt compatibility without inventing membership fields', async t => {
  const f = setup(t, { legacy: true });
  const result = await f.client.ingest(representation('legacy', 0), 'crawler-legacy-operation', f.service.version());
  assert.equal(result.policyVersion, 'adaptive-supported-partitions/v1'); assert.equal(Object.hasOwn(result, 'topicIds'), false);
  assert.equal(f.calls.length, 1); assert.equal(f.repository.load().schema, 'demo-state/v2');
});

test('malformed completed v4 receipts are terminal even when the canonical ingestion was accepted', async t => {
  const mutations = [
    value => ({ ...value, unknown: 'must-not-pass' }),
    value => ({ ...value, policyVersion: 'unknown-policy/v1' }),
    value => { const { topicIds, ...missing } = value; return missing; },
    value => ({ ...value, topicIds: [] }),
    value => ({ ...value, topicIds: [value.topicId, value.topicId] }),
    value => ({ ...value, topicIds: ['topic-secondary-only'] }),
    value => ({ ...value, topicIds: ['zzz-topic', value.topicId] }),
    value => ({ ...value, topicIds: [value.topicId, 'topic:invalid'] }),
    value => ({ ...value, topicIds: [value.topicId, null] }),
    value => ({ ...value, topicIds: Array(2) }),
    value => ({ ...value, version: { ...value.version, generation: 'wrong-generation' } }),
  ];
  for (const [index, mutate] of mutations.entries()) {
    const f = setup(t, { mutate });
    await assert.rejects(f.client.ingest(representation(`invalid-${index}`, 0), `crawler-invalid-${index}`, f.service.version()), { code: 'invalid-response' });
    assert.equal(f.calls.length, 1, `mutation ${index} must not retry the accepted operation`);
    assert.equal(f.repository.load().sources.length, 1);
    assert.equal(f.repository.load().revision, 2); // Explicit empty-state conversion + the accepted command.
  }
});

test('complete HTTP timeout remains terminal and does not add a receipt retry', async t => {
  const f = setup(t, { status: 408 }), before = f.repository.load();
  await assert.rejects(f.client.ingest(representation('timeout', 0), 'crawler-timeout-operation', f.service.version()), { code: 'response-timeout' });
  assert.equal(f.calls.length, 1); assert.deepEqual(f.repository.load(), before);
});

test('deliberate same-operation replay after a malformed accepted reply returns the durable v4 receipt without duplicate data or revision change', async t => {
  let replies = 0;
  const f = setup(t, { mutate: value => ++replies === 1 ? { ...value, unrecognizedTransportField: true } : value });
  const page = representation('accepted-before-invalid-reply', .2), operationId = 'crawler-exact-replay-operation';
  const expected = f.service.version();
  await assert.rejects(f.client.ingest(page, operationId, expected), { code: 'invalid-response' });
  assert.equal(f.calls.length, 1, 'invalid response does not automatically replay');
  const accepted = f.repository.load(); assert.equal(accepted.sources.length, 1); assert.equal(accepted.topics.length, 1);
  const resumedClient = createLocalIngestClient({ token, requestImpl: f.requestImpl });
  const receipt = await resumedClient.ingest(page, operationId, expected);
  assert.equal(receipt.sourceId, accepted.sources[0].id); assert.deepEqual(receipt.topicIds, accepted.sources[0].topicIds);
  assert.deepEqual(receipt.version, { generation: accepted.generation, revision: accepted.revision });
  assert.deepEqual(f.repository.load(), accepted, 'receipt replay never creates a Source/Topic/post or advances revision');
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1].body, f.calls[0].body);
  assert.ok(f.calls.every(call => call.path === '/v1/sources/ingest'));
});

test('a valid v4 receipt arriving after ten seconds is accepted once within the existing thirty-second ingest timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = setup(t, { hold: true });
  const result = f.client.ingest(representation('delayed', 0), 'crawler-delayed-operation', f.service.version());
  await new Promise(setImmediate);
  assert.equal(f.repository.load().sources.length, 1); assert.equal(f.pending.length, 1);
  t.mock.timers.tick(11_000); assert.equal(f.calls.length, 1);
  f.pending.shift()();
  const receipt = await result;
  assert.deepEqual(receipt.topicIds, [receipt.topicId]); assert.equal(f.calls.length, 1);
});

test('bounded real crawler resume recognizes an already accepted v4 Source without refetch, reembedding or duplicate ingestion', async t => {
  let malformed = false;
  const f = setup(t, { mutate: value => {
    if (Object.hasOwn(value, 'topicIds') && !malformed) { malformed = true; return { ...value, invalidReceiptField: true }; }
    return value;
  } });
  const state = createCrawlState({ filename: ':memory:' }); t.after(() => state.close());
  const page = representation('staged-real-runner', 0);
  const manifest = { schema: 'murmingle-crawl-manifest/v1', rightsAcknowledged: true,
    buckets: [{ id: 'fixture', rightsBasis: 'Synthetic offline fixture only.', maxPages: 1,
      allowedHosts: ['example.org'], allowedQueryKeys: [], seeds: [page.url] }] };
  state.bindGeneration(f.service.version().generation);
  state.enqueue({ url: page.url, bucket: 'fixture', depth: 0, priority: 0 });
  const row = state.next({ maxDepth: 0, perHost: 20 });
  state.stage({ urlDigest: row.urlDigest, title: page.title, vector: page.embedding.values, extractorVersion: page.extractorVersion,
    representationDigest: representationDigest({ url: page.url, title: page.title, vector: page.embedding.values, extractorVersion: page.extractorVersion }),
    contentDigest: createHash('sha256').update('Synthetic staged page').digest('hex'), simhash: '0000000000000000', links: [] });
  const options = { state, manifest, apply: true, maxPages: 1,
    fetchPublic: async () => { assert.fail('staged/resumed accepted page must not be fetched'); },
    embedder: { embed() { assert.fail('staged/resumed accepted page must not be embedded'); } } };
  const failed = await runCrawler({ ...options, client: f.client });
  assert.equal(failed.reason, 'ingest-unavailable'); assert.equal(failed.ingestError, 'invalid-response');
  assert.equal(state.listStaged(10).length, 1);
  const accepted = f.repository.load(); assert.equal(accepted.sources.length, 1);
  const resumed = await runCrawler({ ...options, client: createLocalIngestClient({ token, requestImpl: f.requestImpl }) });
  assert.equal(resumed.reason, 'campaign-limit', 'the explicit one-page synthetic campaign limit remains intact');
  assert.equal(resumed.ingestedThisRun, 0, 'known accepted Source is not claimed as a new ingestion');
  assert.equal(state.listStaged(10).length, 0); assert.equal(state.counts().existing, 1);
  assert.deepEqual(f.repository.load(), accepted);
  assert.equal(f.calls.filter(call => call.path === '/v1/sources/ingest').length, 1);
});
