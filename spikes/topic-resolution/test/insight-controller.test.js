import assert from "node:assert/strict";
import test from "node:test";
import { createInsightController } from "../browser/core/insight-controller.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

async function harness({ command, aiClient, readArticle, attestArticle, openAuthorization, randomId } = {}) {
  let sequence = 0;
  const service = createMemoryDemoService({ nextId: (kind) => `${kind}-${++sequence}`, now: () => "2026-09-29T12:00:00.000Z" });
  const commands = []; let changed;
  const client = {
    health: async () => ({}), catalog: async () => service.catalog(),
    discussion: async (id) => service.discussion(id), related: async (id, limit) => service.related(id, limit),
    command: async (expected, value, actor) => {
      commands.push(value);
      return command ? command(expected, value, actor) : service.command(expected, value, actor);
    },
  };
  let insight;
  const discussion = createLocalDiscussionController({ client, session: { isPaired: async () => true },
    readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: (_, callback) => { changed = callback; return () => {}; },
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    onStateChange: (state) => insight?.observe(state),
  });
  insight = createInsightController({ shareInsight: discussion.shareInsight, aiClient, readArticle,
    attestArticle, openAuthorization, randomId });
  await discussion.open();
  return { service, insight, discussion, commands, navigate: () => changed() };
}

test("real projection -> context -> exact preview -> one AI-labelled local root, not context persistence", async () => {
  const app = await harness(); const { insight, discussion, service } = app;
  assert.equal(insight.currentState().available, true);
  assert.equal(insight.prepare(), true);
  assert.equal(insight.currentState().context.currentSource.id, "reserved-example-com");
  assert.equal(insight.currentState().context.sameTopicSources[0].id, "reserved-example-org");
  insight.setDraft("Synthetic AI-assisted finding: compare the two reserved examples.");
  assert.equal(await insight.share(), false); // No preview, no mutation.
  assert.equal(insight.preview(), true);
  assert.equal(service.discussion("reserved-domain-demo").roots.length, 0);
  assert.equal(await insight.share(), true);
  const saved = service.discussion("reserved-domain-demo").roots[0];
  assert.equal(saved.actorType, "agent"); assert.equal(saved.insight.operatorId, "demo-alex");
  assert.equal(saved.origin.sourceId, "reserved-example-com");
  assert.deepEqual(Object.keys(app.commands[0]).sort(), ["body", "originSourceId", "topicId", "type"]);
  assert.equal(insight.currentState().draft, ""); assert.equal(insight.currentState().context, null);
  assert.equal(insight.currentState().status, "shared");
  assert.equal(await insight.share(), false); assert.equal(app.commands.length, 1);
  await discussion.selectSource("reserved-example-org");
  assert.equal(discussion.currentState().discussion.roots[0].id, saved.id);
  assert.equal(discussion.begin("edit", saved.id), true);
  discussion.setDraft("Edited import stays AI-assisted"); await discussion.submitDraft();
  assert.equal(service.discussion("reserved-domain-demo").roots[0].actorType, "agent");
  await discussion.selectActor("demo-blair");
  assert.equal(discussion.begin("edit", saved.id), false); assert.equal(await discussion.withdraw(saved.id), false);
  await discussion.selectActor("demo-alex"); assert.equal(await discussion.withdraw(saved.id), true);
  assert.equal(service.discussion("reserved-domain-demo").roots[0].state, "deleted");
});

test("AI research requires explicit page preview, model and credit consent; answer remains private", async () => {
  const calls = [];
  const aiClient = {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "client-a", label: "Owner" } }),
    models: async () => [{ slug: "model-a", displayName: "Model A" }],
    start: async (request) => { calls.push(request); return { operationId: request.operationId, state: "running" }; },
    result: async (operationId) => ({ operationId, state: "completed", result: { body: "Useful synthetic finding.", model: "model-a", citations: [] } }),
    cancel: async () => true,
  };
  const app = await harness({ aiClient,
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public text and redact-me" }),
    attestArticle: async (_, article) => { assert.equal(article.documentId, "doc-a"); },
    randomId: () => "op-a" });
  assert.equal(app.insight.prepare(), true);
  assert.equal(await app.insight.checkConnection(), true);
  assert.equal(await app.insight.loadModels(), true);
  assert.equal(await app.insight.createInsights(), false);
  assert.equal(await app.insight.readPageText(), true);
  assert.equal(app.insight.currentState().ai.article.text, undefined);
  app.insight.setArticleText("Public text"); app.insight.selectModel("model-a");
  assert.equal(await app.insight.createInsights(), false);
  app.insight.setCostConsent(true);
  assert.equal(await app.insight.createInsights(), true);
  assert.equal(calls.length, 1); assert.equal(calls[0].articleText, "Public text");
  assert.equal(app.insight.currentState().draft, "Useful synthetic finding.");
  assert.equal(app.service.discussion("reserved-domain-demo").roots.length, 0);
  assert.equal(await app.insight.share(), false);
});

test("connected identity without plan access permits only explicit re-consent and local drafting", async () => {
  let planEnabled = false, modelsCalled = 0, starts = 0, connects = 0;
  const opened = [];
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled, pending: false,
      account: { clientId: "client-a", label: "Owner" } }),
    connect: async () => { connects++; return { authorizationUrl: "https://auth.openai.com/api/accounts/authorize?synthetic=1" }; },
    models: async () => { modelsCalled++; return [{ slug: "model-a", displayName: "A" }]; },
    start: async () => { starts++; }, cancel: async () => true,
  }, openAuthorization: async (url) => { opened.push(url); },
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public text" }),
    attestArticle: async () => true, randomId: () => "op-no-plan" });
  app.insight.prepare();
  assert.equal(await app.insight.checkConnection(), true);
  assert.equal(app.insight.currentState().ai.status, "planUnavailable");
  assert.equal(app.insight.currentState().ai.planEnabled, false);
  assert.equal(await app.insight.loadModels(), false);
  assert.equal(modelsCalled, 0);
  assert.equal(await app.insight.readPageText(), true);
  app.insight.setCostConsent(true);
  assert.equal(await app.insight.createInsights(), false);
  assert.equal(starts, 0); assert.equal(connects, 0);
  app.insight.setDraft("Private manual insight");
  assert.equal(app.insight.preview(), true);
  assert.equal(await app.insight.connect(), true);
  assert.equal(connects, 1); assert.equal(opened.length, 1);
  planEnabled = true;
  assert.equal(await app.insight.checkConnection(), true);
  assert.equal(app.insight.currentState().ai.planEnabled, true);
  assert.equal(await app.insight.loadModels(), true);
  assert.equal(modelsCalled, 1);
});

test("navigation during attestation drops the answer without contacting the AI", async () => {
  let finish;
  const calls = [];
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: null }),
    models: async () => [{ slug: "model-a", displayName: "Model A" }],
    start: async (...args) => { calls.push(args); }, cancel: async () => true,
  }, readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public text" }),
    attestArticle: () => new Promise((resolve) => { finish = resolve; }), randomId: () => "op-b" });
  app.insight.prepare(); await app.insight.checkConnection(); await app.insight.loadModels();
  await app.insight.readPageText(); app.insight.selectModel("model-a"); app.insight.setCostConsent(true);
  const running = app.insight.createInsights(); app.navigate(); finish(true);
  assert.equal(await running, false); assert.equal(calls.length, 0);
  assert.equal(app.insight.currentState().ai.articleText, "");
});

test("page changes preserve explicit sign-in while disconnect fences a stale authorization tab", async () => {
  let release;
  let connectCalls = 0;
  let disconnectCalls = 0;
  const opened = [];
  const app = await harness({ aiClient: {
    connect: async () => { connectCalls++; return new Promise((resolve) => { release = resolve; }); },
    disconnect: async () => { disconnectCalls++; return { revocationConfirmed: false }; },
  }, openAuthorization: async (url) => { opened.push(url); } });
  app.insight.prepare();
  const pending = app.insight.connect();
  assert.equal(await app.insight.connect(), false);
  assert.equal(connectCalls, 1);
  app.navigate();
  release({ authorizationUrl: "https://auth.openai.com/api/accounts/authorize?synthetic=1" });
  assert.equal(await pending, true);
  assert.deepEqual(opened, ["https://auth.openai.com/api/accounts/authorize?synthetic=1"]);
  assert.equal(disconnectCalls, 0);

  await app.insight.disconnect();
  const second = app.insight.connect();
  assert.equal(connectCalls, 2);
  const disconnecting = app.insight.disconnect();
  release({ authorizationUrl: "https://auth.openai.com/api/accounts/authorize?synthetic=2" });
  assert.equal(await second, false);
  await disconnecting;
  assert.equal(opened.length, 1);
  assert.equal(disconnectCalls, 2);
});

test("duplicate Create clicks dispatch only one provider operation", async () => {
  let release;
  const calls = [];
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: null }),
    models: async () => [{ slug: "model-a", displayName: "Model A" }],
    start: async (request) => { calls.push(request); return new Promise((resolve) => { release = resolve; }); },
    cancel: async () => true,
  }, readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public synthetic article" }),
    attestArticle: async () => true, randomId: () => "op-only" });
  app.insight.prepare(); await app.insight.checkConnection(); await app.insight.loadModels();
  await app.insight.readPageText(); app.insight.selectModel("model-a"); app.insight.setCostConsent(true);
  const first = app.insight.createInsights();
  assert.equal(await app.insight.createInsights(), false);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  app.insight.cancelInsights();
  release({ operationId: "op-only", state: "running" });
  assert.equal(await first, false);
  assert.equal(calls.length, 1);
});

test("safe research failures give actionable status without importing provider text or retrying", async () => {
  for (const [code, expected] of [
    ["rate-limit", "usageLimit"], ["model-unavailable", "modelUnavailable"],
    ["unsupported-capability", "webResearchUnavailable"], ["unauthorized", "authorizationExpired"],
    ["timeout", "researchTimeout"], ["busy", "researchBusy"],
    ["provider-secret-detail", "generationFailed"],
  ]) {
    let starts = 0;
    const app = await harness({ aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false, account: null }),
      models: async () => [{ slug: "model-a", displayName: "Model A" }],
      start: async () => { starts++; return { state: "running" }; },
      result: async () => ({ operationId: "op-failed", state: "failed", error: code }),
      cancel: async () => true,
    }, readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public text" }),
      attestArticle: async () => true, randomId: () => "op-failed" });
    app.insight.prepare(); await app.insight.checkConnection(); await app.insight.loadModels();
    await app.insight.readPageText(); app.insight.selectModel("model-a"); app.insight.setCostConsent(true);
    assert.equal(await app.insight.createInsights(), false, code);
    const outcome = app.insight.currentState();
    assert.equal(outcome.ai.status, expected, code);
    assert.equal(outcome.ai.result, null, code);
    assert.equal(outcome.draft, "", code);
    assert.equal(starts, 1, code);
  }
});

test("editing invalidates preview; navigation/actor/source/version changes clear private context", async () => {
  const app = await harness(); const { insight, discussion } = app;
  insight.prepare(); insight.setDraft("Before edit"); insight.preview(); insight.setDraft("After edit");
  assert.equal(insight.currentState().preview, null); assert.equal(await insight.share(), false);
  insight.preview(); app.navigate();
  assert.equal(insight.currentState().context, null); assert.equal(insight.currentState().draft, "");
  assert.equal(insight.currentState().status, "changed"); assert.equal(await insight.share(), false);
  await discussion.open(); insight.prepare(); insight.setDraft("Private draft"); insight.preview();
  await discussion.selectActor("demo-blair"); assert.equal(insight.currentState().draft, "");
  insight.prepare(); insight.setDraft("Another draft"); insight.preview();
  await discussion.selectSource("reserved-example-org"); assert.equal(insight.currentState().preview, null);
  insight.prepare(); insight.setDraft("Version bound"); insight.preview();
  const fresh = structuredClone(discussion.currentState()); fresh.catalog.version.revision += 1;
  insight.observe(fresh); assert.equal(insight.currentState().available, false); assert.equal(insight.currentState().context, null);
  assert.equal(app.commands.length, 0);
});

test("Topic-only preparation and opt-in human excerpts work; hostile controls never share", async () => {
  const app = await harness(); await app.discussion.selectTopic("reserved-domain-demo");
  app.discussion.setDraft("Human opening"); await app.discussion.submitDraft();
  assert.equal(app.insight.prepare(), true); assert.equal(app.insight.currentState().context.currentSource, null);
  assert.deepEqual(app.insight.currentState().context.discussion, []);
  assert.equal(app.insight.prepare({ includeDiscussion: true }), true);
  assert.equal(app.insight.currentState().context.discussion[0].body, "Human opening");
  app.insight.setDraft("Hidden\u0000control"); assert.equal(app.insight.preview(), false);
  assert.equal(app.insight.setDraft("x".repeat(8001)), false);
  app.insight.setDraft("A visible draft"); app.insight.preview();
  assert.equal(await app.insight.share(), true);
  const root = app.service.discussion("reserved-domain-demo").roots.find((entry) => entry.actorType === "agent");
  assert.equal(root.origin, undefined);
});

test("stale exact review cannot retarget, duplicate click or uncertain failure cannot replay", async () => {
  let resolve;
  const app = await harness({ command: () => new Promise((done) => { resolve = done; }) });
  app.insight.prepare(); app.insight.setDraft("Reviewed"); app.insight.preview();
  const pending = app.insight.share(); assert.equal(await app.insight.share(), false);
  assert.equal(app.insight.setDraft("Changed while pending"), false);
  assert.equal(app.commands.length, 1);
  resolve({}); await pending;
  assert.equal(app.insight.currentState().draft, "");
  const next = await harness();
  const state = next.discussion.currentState();
  const review = { body: "Wrong target", expected: state.discussion.version, actorId: state.actorId,
    topicId: state.topicId, sourceId: "reserved-example-org" };
  assert.equal(await next.discussion.shareInsight(review), false);
  review.sourceId = state.sourceId; review.expected = { ...review.expected, revision: 1234 };
  assert.equal(await next.discussion.shareInsight(review), false); assert.equal(next.commands.length, 0);
});

test("service failure requires a fresh read; dispose erases unshared memory and blocks calls", async () => {
  const app = await harness({ command: async () => { throw Object.assign(new Error("uncertain"), { code: "unavailable" }); } });
  app.insight.prepare(); app.insight.setDraft("Not retried"); app.insight.preview();
  assert.equal(await app.insight.share(), false); assert.equal(app.insight.currentState().status, "failed");
  assert.equal(await app.insight.share(), false); assert.equal(app.commands.length, 1);
  assert.equal(app.discussion.currentState().needsFreshRead, true);
  await app.discussion.open(); app.insight.prepare(); app.insight.setDraft("Private memory");
  app.insight.dispose(); assert.equal(app.insight.currentState().draft, "");
  assert.equal(app.insight.prepare(), false); assert.equal(await app.insight.share(), false);
});
