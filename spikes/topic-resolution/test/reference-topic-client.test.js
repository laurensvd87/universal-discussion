import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../../../apps/local-service/src/domain/demo-state.js";
import { migrateReferenceTopicState } from "../../../apps/local-service/src/domain/reference-state-migration.js";
import { createFixedReferenceMatcher } from "../../../apps/local-service/src/domain/fixed-reference-topic-integration.js";
import { createMemoryRepository } from "../../../apps/local-service/src/adapters/memory-repository.js";
import { createDiscussionService } from "../../../apps/local-service/src/application/discussion-service.js";
import { createFixtureRankingAdapter } from "../../../apps/local-service/src/adapters/fixture-ranking.js";
import { createRequestHandler } from "../../../apps/local-service/src/http/request-handler.js";
import { createLocalServiceClient } from "../browser/core/local-service-client.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";

test("actual HTTP/client/controller chain renders canonical overlapping membership regardless of legacy preference", async t => {
  let serial = 0;
  const now = () => "2026-10-13T00:00:00.000Z", nextId = kind => `${kind}-${++serial}`;
  const initial = migrateReferenceTopicState(createDemoState({ generation: "generation-client-reference", createdAt: now(), sources: [], topicSeeds: [] }), { represent: () => null });
  const repository = createMemoryRepository(initial);
  const service = createDiscussionService({ repository, nextId, now, sources: [], topicSeeds: [], ranking: createFixtureRankingAdapter(),
    referenceMatcher: createFixedReferenceMatcher({ transform: values => values }) });
  const token = "synthetic-reference-capability-not-owner";
  const handle = createRequestHandler({ service, config: { hostHeader: "127.0.0.1:4174", origin: "chrome-extension://synthetic", capability: token } });
  const requests = [];
  const client = createLocalServiceClient({ getToken: async () => token, fetchImpl: async (url, options) => {
    requests.push({ path: new URL(url).pathname, body: options.body ? JSON.parse(options.body) : null });
    const response = await handle({ url: new URL(url).pathname, method: options.method,
      headers: { host: "127.0.0.1:4174", origin: "chrome-extension://synthetic", ...options.headers }, body: options.body ?? null });
    return new Response(response.body, { status: response.status, headers: response.headers });
  } });
  const input = (name, angle) => ({ expected: service.version(), operationId: `operation-${name}`,
    url: `https://example.org/article-${name}`, title: `Article ${name}`, extractorVersion: "main-text-prefix/v1",
    embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)] } });
  const a = await client.ingest(input("a", -.4)), b = await client.ingest(input("b", .4));
  const rootA = await client.command(service.version(), { type: "create-root", topicId: a.topicId, body: "Original A", originSourceId: a.sourceId }, "demo-alex");
  const rootB = await client.command(service.version(), { type: "create-root", topicId: b.topicId, body: "Original B", originSourceId: b.sourceId }, "demo-blair");
  const c = await client.ingest(input("middle", 0));
  const controller = createLocalDiscussionController({ client, session: { isPaired: async () => true },
    readActiveTab: async () => ({ tabId: 7, url: "https://example.org/article-middle" }),
    observeTabLifecycle: () => () => {}, lookupByNormalizedUrl: () => null });
  t.after(() => controller.dispose());
  await controller.setTopicViewMode("classic");
  await controller.open(); await controller.selectSource(c.sourceId);
  for (let attempt = 0; attempt < 8 && !controller.currentState().alternateDiscussion; attempt++) await new Promise(resolve => setImmediate(resolve));
  const state = controller.currentState();
  assert.equal(state.phase, "ready");
  assert.equal(state.sourceId, c.sourceId); assert.equal(state.topicId, c.topicId);
  assert.equal(state.alternateDiscussion.policyVersion, "ridge1-fixed-reference-radius/v1");
  assert.deepEqual(new Set(state.alternateDiscussion.roots.map(root => root.id)), new Set([rootA.result.contributionId, rootB.result.contributionId]));
  assert.equal(requests.filter(request => request.path === "/v1/sources/enrichment").at(-1).body.includeAlternate, true);
  const foreign = state.alternateDiscussion.roots.find(root => root.canonicalTopicId !== c.topicId);
  assert.equal(controller.begin("reply", foreign.id), false);
  const before = repository.load();
  await assert.rejects(client.command(service.version(), { type: "create-root", topicId: foreign.canonicalTopicId,
    originSourceId: c.sourceId, body: "Secondary write must not be implied" }, "demo-alex"));
  assert.deepEqual(repository.load(), before);
  controller.invalidateContext();
  assert.equal(controller.currentState().alternateDiscussion, null);
  assert.equal(controller.currentState().sourceId, null);
});
