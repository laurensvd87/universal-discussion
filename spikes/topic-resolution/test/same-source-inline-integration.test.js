import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState } from "../../../apps/local-service/src/domain/demo-state.js";
import { createDiscussionService } from "../../../apps/local-service/src/application/discussion-service.js";
import { createMemoryRepository } from "../../../apps/local-service/src/adapters/memory-repository.js";
import { createFixtureRankingAdapter } from "../../../apps/local-service/src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../../../apps/local-service/src/adapters/fixture-catalog.js";
import { createChatGPTRuntime } from "../../../apps/local-service/src/ai/chatgpt-runtime.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { createInsightController } from "../browser/core/insight-controller.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

const CURRENT = "reserved-domain-demo", EARLIER = "harbor-s2", SOURCE = "reserved-example-com";
const DISCUSSION = `discussion-${EARLIER}`;
const tick = () => new Promise((resolve) => setImmediate(resolve));

function seededService() {
  let sequence = 0;
  const nextId = (kind) => `${kind}-integration-${++sequence}`;
  const now = () => "2026-10-11T12:00:00.000Z";
  const state = createDemoState({ generation: nextId("generation"), createdAt: now(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const contribution = (id, rootId, replyToId, body) => ({ id, discussionId: DISCUSSION,
    rootId, replyToId, authorId: "demo-blair", actorType: "human",
    visibility: "local-public", withdrawn: false, createdAt: now(),
    revisions: [{ body, createdAt: now() }] });
  state.contributions.push({ ...contribution("historical-root", null, null, "Original opener"),
    originSourceId: SOURCE, anchor: { kind: "topic", topicId: EARLIER },
    originalTopicId: EARLIER, learnedOrigin: false });
  state.contributions.push(contribution("historical-parent", "historical-root", "historical-root", "Original parent"));
  return createDiscussionService({ repository: createMemoryRepository(state),
    ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES,
    topicSeeds: SYNTHETIC_TOPIC_SEEDS, nextId, now });
}

async function harness({ shareOnCompletion = true } = {}) {
  const service = seededService(), requests = [], commands = [], providerInputs = [];
  const runtime = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true,
      account: { clientId: "synthetic-account", label: "Synthetic" } }), dispose() {} },
    insightsAdapter: { async createInsight(input) { providerInputs.push(input);
      return { body: "Synthetic answer", citations: [], model: "synthetic" }; },
    cancel() {}, dispose() {} } });
  const aiClient = {
    status: async () => ({ connected: true, planEnabled: true, pending: false,
      account: { clientId: "synthetic-account", label: "Synthetic" } }),
    models: async () => [{ slug: "synthetic", displayName: "Synthetic" }],
    start: async (value, actor) => { requests.push(value); return runtime.create(value, actor); },
    result: async (id, actor) => runtime.result({ operationId: id }, actor),
    resumable: async (actor) => runtime.resumable(actor).job,
    cancel: async (id, actor) => runtime.cancel({ operationId: id }, actor).cancelled,
  };
  let insight;
  const client = { health: async () => ({}), catalog: async () => service.catalog(),
    discussion: async (id) => service.discussion(id),
    related: async (id, limit) => service.related(id, limit),
    priorDiscussions: async (id) => service.priorDiscussions(id),
    command: async (expected, command, actor) => {
      commands.push(command);
      return command.type.startsWith("share-insight")
        ? runtime.share({ expected, command }, actor, (proof) => service.command(expected, command, actor, proof))
        : service.command(expected, command, actor);
    } };
  const discussion = createLocalDiscussionController({ client,
    session: { isPaired: async () => true },
    readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: () => () => {},
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    onStateChange: (state) => insight?.observe(state) });
  const newInsight = () => createInsightController({ aiClient,
    shareInsight: (review) => discussion.shareInsight(review),
    readArticle: async () => ({ url: "https://example.com/", documentId: "synthetic-doc",
      text: "Synthetic public page content" }),
    attestArticle: async () => true, randomId: () => `insight-integration-${requests.length + 1}`,
    shareOnCompletion });
  insight = newInsight();
  await discussion.open(); await tick();
  await insight.checkConnection(); await insight.loadModels();
  return { service, runtime, discussion, get insight() { return insight; },
    reopenInsight() { insight.dispose(); insight = newInsight(); insight.observe(discussion.currentState());
      return insight; }, requests, commands, providerInputs };
}

test("human and deliberate sparkle reply to earlier same-Source chain while current page stays selected", async () => {
  const app = await harness();
  const binding = { topicId: EARLIER, discussionId: DISCUSSION, rootId: "historical-root" };
  const before = app.discussion.currentState();
  assert.equal(before.topicId, CURRENT);
  assert.equal(before.sourceId, SOURCE);
  assert.equal(before.earlierDiscussions[0].roots[0].id, "historical-root");
  assert.equal(app.discussion.begin("reply", "historical-parent", binding), true);
  app.discussion.setDraft("Human nested reply");
  assert.equal(await app.discussion.submitDraft(), true);
  const human = app.service.discussion(EARLIER).roots[0].replies.find((reply) => reply.body === "Human nested reply");
  assert.equal(human.replyToId, "historical-parent");
  assert.equal(human.origin.sourceId, SOURCE);
  assert.equal(app.discussion.currentState().createdPost.topicId, EARLIER);
  assert.equal(app.discussion.currentState().createdPost.id, human.id);
  assert.equal(app.discussion.currentState().topicId, CURRENT);
  assert.equal(app.discussion.currentState().sourceId, SOURCE);

  assert.equal(await app.insight.createFollowup(human.id, binding), true);
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].context.topic.id, CURRENT);
  assert.equal(app.requests[0].context.currentSource.id, SOURCE);
  assert.equal(app.requests[0].followupQuestionId, human.id);
  assert.equal(app.requests[0].followupTopicId, EARLIER);
  assert.equal(app.providerInputs[0].followup.questionBody, "Human nested reply");
  const shared = app.service.discussion(EARLIER).roots[0].replies.find((reply) => reply.body === "Synthetic answer");
  assert.equal(shared.replyToId, human.id);
  assert.equal(shared.actorType, "agent");
  assert.equal(shared.origin.sourceId, SOURCE);
  assert.equal(app.commands.at(-1).topicId, EARLIER);
  assert.equal(app.discussion.currentState().createdPost.id, shared.id);
  assert.equal(app.discussion.currentState().createdPost.topicId, EARLIER);
  assert.equal(app.discussion.currentState().topicId, CURRENT);
  assert.equal(app.discussion.currentState().sourceId, SOURCE);
  app.runtime.dispose();
});

test("recovered historical result stays private and a full-body edit prevents sharing", async () => {
  const app = await harness({ shareOnCompletion: false });
  const binding = { topicId: EARLIER, discussionId: DISCUSSION, rootId: "historical-root" };
  assert.equal(await app.insight.createFollowup("historical-parent", binding), true);
  assert.equal(app.service.discussion(EARLIER).roots[0].replies.filter((reply) => reply.actorType === "agent").length, 0);
  const resumed = app.reopenInsight();
  await resumed.checkConnection(); await resumed.loadModels();
  assert.equal(await resumed.resumeInsights(), true);
  assert.equal(resumed.currentState().draft, "Synthetic answer");
  assert.equal(app.commands.length, 0);
  app.service.command(app.service.catalog().version,
    { type: "edit", contributionId: "historical-parent", body: "Edited full parent" }, "demo-blair");
  await app.discussion.open(); await tick();
  assert.equal(await resumed.share(), false);
  assert.equal(app.commands.length, 0);
  assert.equal(app.service.discussion(EARLIER).roots[0].replies.filter((reply) => reply.actorType === "agent").length, 0);
  app.runtime.dispose();
});
