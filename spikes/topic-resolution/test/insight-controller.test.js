import assert from "node:assert/strict";
import test from "node:test";
import { ModelListFailure } from "../browser/core/local-ai-client.js";
import { createInsightController, createInsightResumeGate } from "../browser/core/insight-controller.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

async function harness({ command, aiClient, readArticle, attestArticle, readRelatedExcerpts,
  loadRelatedTextPreference, saveRelatedTextPreference, openAuthorization, randomId } = {}) {
  let sequence = 0;
  const service = createMemoryDemoService({ nextId: (kind) => `${kind}-${++sequence}`, now: () => "2026-09-29T12:00:00.000Z" });
  const commands = []; let changed;
  const client = {
    health: async () => ({}), catalog: async () => service.catalog(),
    discussion: async (id) => service.discussion(id), related: async (id, limit) => service.related(id, limit),
    command: async (expected, value, actor) => {
      commands.push(value);
      if (command) return command(expected, value, actor);
      const generated = ["share-insight", "share-insight-reply"].includes(value.type);
      return service.command(expected, value, actor, generated ? {
        kind: "generated-insight", operationId: value.operationId, actorId: actor,
        topicId: value.topicId, originSourceId: value.originSourceId, body: value.body,
        rootId: value.rootId ?? null, replyToId: value.replyToId ?? null,
        discussionId: value.discussionId ?? null,
      } : null);
    },
  };
  let insight;
  const discussion = createLocalDiscussionController({ client, session: { isPaired: async () => true },
    readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: (_, callback) => { changed = callback; return () => {}; },
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    onStateChange: (state) => insight?.observe(state),
  });
  const newInsight = () => createInsightController({ shareInsight: discussion.shareInsight, aiClient, readArticle,
    attestArticle, readRelatedExcerpts, loadRelatedTextPreference, saveRelatedTextPreference,
    openAuthorization, randomId });
  insight = newInsight();
  await discussion.open();
  return { service, insight, discussion, commands, navigate: () => changed(),
    reopenInsight: () => { insight = newInsight(); insight.observe(discussion.currentState()); return insight; } };
}

async function generatedHarness(options = {}) {
  const cancelled = [];
  const app = await harness({
    aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "client-a", label: "Owner" } }),
      models: async () => [{ slug: "model-a", displayName: "A" }],
      start: async (request) => ({ operationId: request.operationId, state: "running" }),
      result: async (operationId) => ({ operationId, state: "completed", result: { body: "Generated answer", model: "model-a", citations: [] } }),
      cancel: async (operationId) => { cancelled.push(operationId); return true; },
    },
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public article" }),
    attestArticle: async () => true, randomId: () => "generated-op", ...options,
  });
  await app.insight.checkConnection(); await app.insight.loadModels();
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  return { ...app, cancelled };
}

test("resume gate waits for a ready Topic after model startup and checks each context only once", async () => {
  let attempts = 0;
  const gate = createInsightResumeGate(() => { attempts++; });
  const state = { phase: "choose-topic", catalog: { version: { generation: "g", revision: 1 } },
    topicId: null, sourceId: null, actorId: "demo-alex", selection: "auto" };
  assert.equal(gate.observe(state, true), false);
  gate.prime();
  assert.equal(gate.observe(state, true), false);
  const ready = { ...state, phase: "ready", topicId: "topic-a", sourceId: "source-a" };
  assert.equal(gate.observe(ready, false), false);
  assert.equal(gate.observe(ready, true), true);
  assert.equal(gate.observe(ready, true), false);
  await Promise.resolve();
  assert.equal(attempts, 1);
  assert.equal(gate.observe({ ...ready, sourceId: "source-b" }, true), true);
  await Promise.resolve();
  assert.equal(attempts, 2);
});

test("formatted generated result -> one explicit immutable AI-labelled local root", async () => {
  const app = await generatedHarness(); const { insight, discussion, service } = app;
  assert.equal(insight.currentState().available, true);
  assert.equal(insight.currentState().context.currentSource.id, "reserved-example-com");
  assert.equal(insight.currentState().context.sameTopicSources[0].id, "reserved-example-org");
  assert.equal(insight.setDraft("Edited answer"), false);
  assert.equal(insight.currentState().draft, "Generated answer");
  assert.equal(await insight.createInsights({ automatic: true }), false);
  assert.equal(insight.selectModel("model-a"), false);
  assert.equal(await insight.readPageText(), false);
  assert.equal(service.discussion("reserved-domain-demo").roots.length, 0);
  assert.equal(await insight.share(), true);
  assert.deepEqual(app.cancelled, [], "Share must not cancel the completed service proof during the busy transition");
  const saved = service.discussion("reserved-domain-demo").roots[0];
  assert.equal(saved.actorType, "agent"); assert.equal(saved.insight.operatorId, "demo-alex");
  assert.equal(saved.origin.sourceId, "reserved-example-com");
  assert.deepEqual(Object.keys(app.commands[0]).sort(), ["body", "operationId", "originSourceId", "topicId", "type"]);
  assert.equal(insight.currentState().draft, ""); assert.equal(insight.currentState().context, null);
  assert.equal(insight.currentState().status, "shared");
  assert.equal(await insight.share(), false); assert.equal(app.commands.length, 1);
  await discussion.selectSource("reserved-example-org");
  assert.equal(discussion.currentState().discussion.roots[0].id, saved.id);
  assert.equal(discussion.begin("edit", saved.id), false);
  await discussion.selectActor("demo-blair");
  assert.equal(discussion.begin("edit", saved.id), false); assert.equal(await discussion.withdraw(saved.id), false);
  await discussion.selectActor("demo-alex"); assert.equal(await discussion.withdraw(saved.id), true);
  assert.equal(service.discussion("reserved-domain-demo").roots.length, 0);
});

test("same-Topic linked pages can be excluded individually while the current page cannot", async () => {
  const app = await harness();
  assert.equal(app.insight.prepare(), true);
  const context = app.insight.currentState().context;
  assert.equal(context.sameTopicSources[0].id, "reserved-example-org");
  assert.equal(app.insight.setRelatedSourceIncluded("reserved-example-org", false), true);
  assert.deepEqual(app.insight.currentState().excludedRelatedSourceIds, ["reserved-example-org"]);
  assert.equal(app.insight.setRelatedSourceIncluded(context.currentSource.id, false), false);
  assert.equal(app.insight.setRelatedSourceIncluded("reserved-example-org", true), true);
  assert.deepEqual(app.insight.currentState().excludedRelatedSourceIds, []);
});

test("related text is fetched only at explicit Insight click and default-on can be disabled", async () => {
  let fetches = 0, request;
  const reader = async (context, excluded, signal) => {
    fetches++;
    assert.equal(context.currentSource.id, "reserved-example-com");
    assert.deepEqual(excluded, []);
    assert.equal(signal.aborted, false);
    return [{ sourceId: "reserved-example-org", url: "https://example.org/", text: "Public context ".repeat(12) }];
  };
  const aiClient = { status: async () => ({ connected: true, planEnabled: true, pending: false,
    account: { clientId: "client-a", label: "Owner" } }),
  models: async () => [{ slug: "model-a", displayName: "A" }],
  start: async (value) => { request = value; return { operationId: value.operationId, state: "running" }; },
  result: async (operationId) => ({ operationId, state: "completed", result: { body: "Answer", model: "model-a", citations: [] } }),
  cancel: async () => true };
  const saved = [];
  const app = await harness({ aiClient, readRelatedExcerpts: reader, saveRelatedTextPreference: (value) => saved.push(value),
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc", text: "Public article" }),
    attestArticle: async () => true, randomId: () => "related-op" });
  assert.equal(fetches, 0);
  await app.insight.checkConnection(); await app.insight.loadModels();
  assert.equal(fetches, 0);
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  assert.equal(fetches, 1);
  assert.equal(request.relatedExcerpts.length, 1);
  assert.equal(app.insight.currentState().relatedExcerptCount, 1);
  app.insight.discard();
  assert.equal(app.insight.setRelatedPageTextEnabled(false), true);
  await Promise.resolve();
  assert.deepEqual(saved, [false]);
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  assert.equal(fetches, 1);
  assert.equal(Object.hasOwn(request, "relatedExcerpts"), false);
});

test("saved related-text off is hydrated before a Get insights fetch can begin", async () => {
  let resolvePreference, fetches = 0, request;
  const preference = new Promise((resolve) => { resolvePreference = resolve; });
  const app = await harness({
    loadRelatedTextPreference: () => preference,
    readRelatedExcerpts: async () => { fetches++; return []; },
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc", text: "Public article" }),
    attestArticle: async () => true, randomId: () => "saved-off-op",
    aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false,
        account: { clientId: "client-a", label: "Owner" } }),
      models: async () => [{ slug: "model-a", displayName: "A" }],
      start: async (value) => { request = value; return { operationId: value.operationId }; },
      result: async (operationId) => ({ operationId, state: "completed",
        result: { body: "Answer", model: "model-a", citations: [] } }),
      cancel: async () => true,
    },
  });
  await app.insight.checkConnection(); await app.insight.loadModels();
  const running = app.insight.createInsights({ automatic: true });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(fetches, 0);
  resolvePreference(false);
  assert.equal(await running, true);
  assert.equal(fetches, 0);
  assert.equal(Object.hasOwn(request, "relatedExcerpts"), false);
  assert.equal(app.insight.currentState().relatedPageTextEnabled, false);
});

test("turning related-text off takes effect before its storage write resolves", async () => {
  let resolvePreference, resolveWrite;
  const preference = new Promise((resolve) => { resolvePreference = resolve; });
  const write = new Promise((resolve) => { resolveWrite = resolve; });
  const app = await harness({ loadRelatedTextPreference: () => preference,
    saveRelatedTextPreference: () => write });
  assert.equal(app.insight.setRelatedPageTextEnabled(false), true);
  assert.equal(app.insight.currentState().relatedPageTextEnabled, false);
  resolvePreference(true);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(app.insight.currentState().relatedPageTextEnabled, false);
  resolveWrite();
});

test("turning related-text off during its read aborts the read and omits its excerpts", async () => {
  let readSignal, finishRead, request;
  const app = await harness({
    readRelatedExcerpts: async (_context, _excluded, signal) => {
      readSignal = signal;
      return new Promise((resolve) => { finishRead = resolve; });
    },
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc", text: "Public article" }),
    attestArticle: async () => true, randomId: () => "toggle-off-op",
    aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false,
        account: { clientId: "client-a", label: "Owner" } }),
      models: async () => [{ slug: "model-a", displayName: "A" }],
      start: async (value) => { request = value; return { operationId: value.operationId }; },
      result: async (operationId) => ({ operationId, state: "completed",
        result: { body: "Answer", model: "model-a", citations: [] } }),
      cancel: async () => true,
    },
  });
  await app.insight.checkConnection(); await app.insight.loadModels();
  const running = app.insight.createInsights({ automatic: true });
  for (let step = 0; step < 12 && !readSignal; step++) await Promise.resolve();
  assert.ok(readSignal);
  assert.equal(app.insight.setRelatedPageTextEnabled(false), true);
  assert.equal(readSignal.aborted, true);
  finishRead([{ sourceId: "reserved-example-org", url: "https://example.org/",
    text: "Public context ".repeat(12) }]);
  assert.equal(await running, true);
  assert.equal(Object.hasOwn(request, "relatedExcerpts"), false);
  assert.equal(app.insight.currentState().relatedExcerptCount, null);
});

test("a failed saved related-text read fails closed before any page fetch", async () => {
  let fetches = 0;
  const app = await harness({ loadRelatedTextPreference: async () => { throw new Error("storage unavailable"); },
    readRelatedExcerpts: async () => { fetches++; return []; },
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc", text: "Public article" }),
    attestArticle: async () => true, randomId: () => "storage-failed-op",
    aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false,
        account: { clientId: "client-a", label: "Owner" } }),
      models: async () => [{ slug: "model-a", displayName: "A" }],
      start: async (value) => ({ operationId: value.operationId }),
      result: async (operationId) => ({ operationId, state: "completed",
        result: { body: "Answer", model: "model-a", citations: [] } }),
      cancel: async () => true,
    } });
  await app.insight.checkConnection(); await app.insight.loadModels();
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  assert.equal(fetches, 0);
  assert.equal(app.insight.currentState().relatedPageTextEnabled, false);
});

test("turning related-text off during article attestation removes fetched excerpts before send", async () => {
  let finishAttestation, request;
  const app = await harness({
    readRelatedExcerpts: async () => [{ sourceId: "reserved-example-org", url: "https://example.org/",
      text: "Public context ".repeat(12) }],
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc", text: "Public article" }),
    attestArticle: () => new Promise((resolve) => { finishAttestation = resolve; }),
    randomId: () => "attestation-opt-out-op",
    aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false,
        account: { clientId: "client-a", label: "Owner" } }),
      models: async () => [{ slug: "model-a", displayName: "A" }],
      start: async (value) => { request = value; return { operationId: value.operationId }; },
      result: async (operationId) => ({ operationId, state: "completed",
        result: { body: "Answer", model: "model-a", citations: [] } }),
      cancel: async () => true,
    } });
  await app.insight.checkConnection(); await app.insight.loadModels();
  const running = app.insight.createInsights({ automatic: true });
  for (let step = 0; step < 12 && !finishAttestation; step++) await Promise.resolve();
  assert.ok(finishAttestation);
  assert.equal(app.insight.setRelatedPageTextEnabled(false), true);
  finishAttestation();
  assert.equal(await running, true);
  assert.equal(Object.hasOwn(request, "relatedExcerpts"), false);
  assert.equal(app.insight.currentState().relatedExcerptCount, null);
});

test("closed popup detaches a running local insight; reopened popup restores it without a second provider start", async () => {
  let request, starts = 0, firstResult;
  const cancelled = [];
  let first = true;
  const aiClient = {
    status: async () => ({ connected: true, planEnabled: true, pending: false,
      account: { clientId: "client-a", label: "Owner" } }),
    models: async () => [{ slug: "model-a", displayName: "A" }],
    start: async (value) => { request = value; starts++; return { operationId: value.operationId, state: "running" }; },
    resumable: async () => ({ operationId: request.operationId, state: "running", expected: request.expected,
      topicId: request.context.topic.id, originSourceId: request.context.currentSource.id,
      rootId: null, replyToId: null, discussionId: null }),
    result: async (operationId) => {
      if (first) { first = false; return new Promise((resolve) => { firstResult = resolve; }); }
      return { operationId, state: "completed", result: { body: "Recovered private insight.",
        model: "model-a", citations: [] } };
    },
    cancel: async (operationId) => { cancelled.push(operationId); return true; },
  };
  const app = await harness({ aiClient, readArticle: async () => ({ url: "https://example.com/",
    documentId: "doc-a", text: "Public synthetic article" }), attestArticle: async () => true,
  randomId: () => "resumable-op" });
  await app.insight.checkConnection(); await app.insight.loadModels();
  const running = app.insight.createInsights({ automatic: true });
  for (let attempt = 0; !firstResult && attempt < 20; attempt++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof firstResult, "function");
  app.insight.dispose();
  firstResult({ operationId: request.operationId, state: "running" });
  assert.equal(await running, false);
  assert.deepEqual(cancelled, []);
  const reopened = app.reopenInsight();
  await reopened.checkConnection(); await reopened.loadModels();
  assert.equal(await reopened.resumeInsights(), true);
  assert.equal(reopened.currentState().draft, "Recovered private insight.");
  assert.equal(starts, 1);
  assert.equal(await reopened.share(), true);
  assert.equal(app.service.discussion("reserved-domain-demo").roots[0].body, "Recovered private insight.");
});

test("a completed private insight survives popup closure only while the local service still holds it", async () => {
  let request;
  const cancelled = [];
  const aiClient = {
    status: async () => ({ connected: true, planEnabled: true, pending: false,
      account: { clientId: "client-a", label: "Owner" } }),
    models: async () => [{ slug: "model-a", displayName: "A" }],
    start: async (value) => { request = value; return { operationId: value.operationId, state: "running" }; },
    resumable: async () => ({ operationId: request.operationId, state: "completed", expected: request.expected,
      topicId: request.context.topic.id, originSourceId: request.context.currentSource.id,
      rootId: null, replyToId: null, discussionId: null }),
    result: async (operationId) => ({ operationId, state: "completed", result: {
      body: "Saved only in service RAM.", model: "model-a", citations: [] } }),
    cancel: async (operationId) => { cancelled.push(operationId); return true; },
  };
  const app = await harness({ aiClient, readArticle: async () => ({ url: "https://example.com/",
    documentId: "doc-a", text: "Public synthetic article" }), attestArticle: async () => true,
  randomId: () => "completed-op" });
  await app.insight.checkConnection(); await app.insight.loadModels();
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  app.insight.dispose();
  assert.deepEqual(cancelled, []);
  const reopened = app.reopenInsight();
  await reopened.checkConnection(); await reopened.loadModels();
  assert.equal(await reopened.resumeInsights(), true);
  assert.equal(reopened.currentState().draft, "Saved only in service RAM.");
  reopened.discard();
  assert.deepEqual(cancelled, ["completed-op"]);
});

test("reopen refuses a resumable result from another source without fetching its private body", async () => {
  let request, resultReads = 0;
  const aiClient = {
    status: async () => ({ connected: true, planEnabled: true, pending: false,
      account: { clientId: "client-a", label: "Owner" } }),
    models: async () => [{ slug: "model-a", displayName: "A" }],
    start: async (value) => { request = value; return { operationId: value.operationId, state: "running" }; },
    resumable: async () => ({ operationId: request.operationId, state: "completed", expected: request.expected,
      topicId: request.context.topic.id, originSourceId: request.context.currentSource.id,
      rootId: null, replyToId: null, discussionId: null }),
    result: async (operationId) => { resultReads++; return { operationId, state: "completed", result: {
      body: "Private old-page result.", model: "model-a", citations: [] } }; },
    cancel: async () => true,
  };
  const app = await harness({ aiClient, readArticle: async () => ({ url: "https://example.com/",
    documentId: "doc-a", text: "Public synthetic article" }), attestArticle: async () => true,
  randomId: () => "old-page-op" });
  await app.insight.checkConnection(); await app.insight.loadModels();
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  app.insight.dispose();
  await app.discussion.selectSource("reserved-example-org");
  const reopened = app.reopenInsight();
  await reopened.checkConnection(); await reopened.loadModels();
  assert.equal(await reopened.resumeInsights(), false);
  assert.equal(resultReads, 1, "new popup must not read the old-page result");
  assert.equal(reopened.currentState().draft, "");
});

test("own published question gets one unchanged private robot follow-up", async () => {
  let number = 0;
  const app = await generatedHarness({ randomId: () => `followup-${++number}` });
  const { insight, discussion, service } = app;
  assert.equal(await insight.share(), true);
  const root = service.discussion("reserved-domain-demo").roots[0];
  assert.equal(discussion.begin("reply", root.id), true);
  discussion.setDraft("What evidence supports that?");
  assert.equal(await discussion.submitDraft(), true);
  const question = service.discussion("reserved-domain-demo").roots[0].replies[0];
  assert.equal(await insight.createFollowup(question.id), true);
  assert.equal(insight.currentState().draft, "Generated answer");
  assert.equal(insight.currentState().preview, null);
  assert.equal(await insight.share(), true);
  const replies = service.discussion("reserved-domain-demo").roots[0].replies;
  assert.equal(replies.length, 2);
  assert.equal(replies[1].replyToId, question.id);
  assert.equal(replies[1].actorType, "agent");
  assert.equal(replies[1].insight.kind, "generated");
  assert.equal(discussion.begin("edit", replies[1].id), false);
  assert.equal(await discussion.withdraw(replies[1].id), true);
  assert.equal(service.discussion("reserved-domain-demo").roots[0].replies[1].label, "Deleted by user");
});

test("AI research requires page text, model and credit consent; answer stays private until Share", async () => {
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
  assert.equal(calls[0].allowWebResearch, true);
  assert.equal(app.insight.currentState().draft, "Useful synthetic finding.");
  assert.equal(app.service.discussion("reserved-domain-demo").roots.length, 0);
  app.insight.discard();
  assert.equal(app.service.discussion("reserved-domain-demo").roots.length, 0);
});

test("provider citation survives private preview and explicit AI-labelled share in the body", async () => {
  const marker = "citeturn0search0";
  const answer = `A concise question for this page ${marker} What do you think?`;
  const startIndex = answer.indexOf(marker);
  const aiClient = {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "client-a", label: "Owner" } }),
    models: async () => [{ slug: "model-a", displayName: "A" }],
    start: async (request) => ({ operationId: request.operationId, state: "running" }),
    result: async (operationId) => ({ operationId, state: "completed", result: { body: answer, model: "model-a",
      citations: [{ startIndex, endIndex: startIndex + marker.length, title: "Source", url: "https://example.org/article" }] } }),
    cancel: async () => true,
  };
  const app = await harness({ aiClient,
    readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public article" }),
    attestArticle: async () => {}, randomId: () => "citation-op" });
  await app.insight.checkConnection();
  await app.insight.loadModels();
  assert.equal(await app.insight.readPageText(), true);
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  const draft = "A concise question for this page [↗](https://example.org/article) What do you think?";
  assert.equal(app.insight.currentState().draft, draft);
  assert.equal(app.service.discussion("reserved-domain-demo").roots.length, 0);
  assert.equal(app.insight.setDraft("Changed citation"), false);
  assert.equal(app.insight.preview(), true);
  assert.equal(app.insight.currentState().preview.body, draft);
  assert.equal(await app.insight.share(), true);
  assert.equal(app.service.discussion("reserved-domain-demo").roots[0].body, draft);
});

test("one User click reads the current page and omits unchecked related links from provider context", async () => {
  const calls = [];
  let currentUrl;
  const aiClient = {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "client-a", label: "Owner" } }),
    models: async () => [{ slug: "model-a", displayName: "A" }, { slug: "model-b", displayName: "B" }],
    start: async (request) => { calls.push(request); return { operationId: request.operationId, state: "running" }; },
    result: async (operationId) => ({ operationId, state: "completed", result: { body: "Current-page insight.", model: "model-b", citations: [] } }),
    cancel: async () => true,
  };
  const app = await harness({ aiClient,
    readArticle: async () => ({ url: currentUrl, documentId: "doc-harbor", text: "The public current page" }),
    attestArticle: async (_, article) => { assert.equal(article.documentId, "doc-harbor"); },
    randomId: () => "one-click-harbor" });
  await app.discussion.selectSource("harbor-overview");
  const before = app.insight.currentState();
  assert.ok(before.context?.currentSource);
  assert.ok(before.context.relatedSources.length > 0);
  currentUrl = before.context.currentSource.url;
  assert.equal(await app.insight.checkConnection(), true);
  assert.equal(await app.insight.loadModels(), true);
  assert.equal(app.insight.currentState().ai.model, "model-b");
  const excluded = before.context.relatedSources[0].id;
  assert.equal(app.insight.setRelatedSourceIncluded(excluded, false), true);
  assert.equal(app.insight.setRelatedSourceIncluded(before.context.currentSource.id, false), false);
  assert.equal(app.insight.setAllowWebResearch(false), true);
  assert.equal(app.insight.currentState().allowWebResearch, false);
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].articleText, "The public current page");
  assert.equal(calls[0].context.currentSource.id, before.context.currentSource.id);
  assert.equal(calls[0].context.relatedSources.some((source) => source.id === excluded), true);
  assert.deepEqual(calls[0].excludedRelatedSourceIds, [excluded]);
  assert.equal(calls[0].allowWebResearch, false);
  assert.equal(app.insight.currentState().context.relatedSources.some((source) => source.id === excluded), true);
  assert.equal(app.insight.currentState().draft, "Current-page insight.");
  assert.equal(app.service.discussion(before.context.topic.id).roots.length, 0);
  assert.equal(app.insight.prepare(), false);
  app.insight.discard();
  assert.equal(app.insight.prepare(), true);
  assert.equal(app.insight.currentState().allowWebResearch, false);
});

test("navigation during automatic page reading prevents provider send", async () => {
  let finishRead, starts = 0;
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "client-a", label: "Owner" } }),
    models: async () => [{ slug: "model-a", displayName: "A" }],
    start: async () => { starts++; }, cancel: async () => true,
  }, readArticle: () => new Promise((resolve) => { finishRead = resolve; }),
    attestArticle: async () => true, randomId: () => "stale-read" });
  await app.insight.checkConnection(); await app.insight.loadModels();
  const running = app.insight.createInsights({ automatic: true });
  assert.equal(await app.insight.createInsights({ automatic: true }), false);
  app.navigate();
  finishRead({ url: "https://example.com/", documentId: "doc-old", text: "Old public text" });
  assert.equal(await running, false);
  assert.equal(starts, 0);
  assert.equal(app.insight.currentState().ai.articleText, "");
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
  assert.equal(app.insight.preview(), false);
  assert.equal(await app.insight.connect(), true);
  assert.equal(connects, 1); assert.equal(opened.length, 1);
  planEnabled = true;
  assert.equal(await app.insight.checkConnection(), true);
  assert.equal(app.insight.currentState().ai.planEnabled, true);
  assert.equal(await app.insight.loadModels(), true);
  assert.equal(modelsCalled, 1);
});

test("failed model listing uses its own status and clears stale model choices", async () => {
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: null }),
    models: async () => { throw new Error("private provider detail"); },
  } });
  assert.equal(await app.insight.checkConnection(), true);
  assert.equal(await app.insight.loadModels(), false);
  const ai = app.insight.currentState().ai;
  assert.equal(ai.status, "modelListUnavailable");
  assert.deepEqual(ai.models, []);
  assert.equal(ai.model, "");
  assert.equal(JSON.stringify(ai).includes("private provider detail"), false);
});

test("fixed model-list failures map to fixed status; unrelated errors remain generic", async () => {
  let failure, calls = 0;
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: null }),
    models: async () => { calls++; throw failure; },
  } });
  await app.insight.checkConnection();
  for (const [code, status] of [
    ["access-rejected", "modelListAccessRejected"], ["rate-limited", "modelListRateLimited"],
    ["timed-out", "modelListTimedOut"], ["invalid-response", "modelListInvalidResponse"],
    ["provider-unavailable", "modelListProviderUnavailable"], ["busy", "modelListBusy"],
  ]) {
    failure = new ModelListFailure(code);
    assert.equal(await app.insight.loadModels(), false);
    assert.equal(app.insight.currentState().ai.status, status);
    assert.deepEqual(app.insight.currentState().ai.models, []);
  }
  failure = new Error("access-rejected");
  assert.equal(await app.insight.loadModels(), false);
  assert.equal(app.insight.currentState().ai.status, "modelListUnavailable");
  assert.equal(calls, 7);
});

test("fixed catalog detail and explicit diagnostics remain bounded to local UI state", async () => {
  const events = [{ kind: "models", outcome: "invalid-response", detail: "catalog-shape" }];
  let reads = 0;
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account: null }),
    models: async () => { throw new ModelListFailure("invalid-response", "catalog-shape"); },
    diagnostics: async () => { reads++; return { events }; },
    disconnect: async () => ({ revocationConfirmed: true }),
  } });
  await app.insight.checkConnection();
  assert.equal(reads, 0);
  assert.equal(await app.insight.loadModels(), false);
  assert.equal(app.insight.currentState().ai.modelFailureDetail, "catalog-shape");
  assert.deepEqual(app.insight.currentState().ai.diagnostics.localEvents,
    [{ kind: "models", outcome: "invalid-response", detail: "catalog-shape" }]);
  assert.equal(await app.insight.loadDiagnostics(), true);
  assert.equal(reads, 1);
  assert.deepEqual(app.insight.currentState().ai.diagnostics, { status: "ready", events,
    localEvents: [{ kind: "models", outcome: "invalid-response", detail: "catalog-shape" }] });
  await app.insight.disconnect();
  assert.deepEqual(app.insight.currentState().ai.diagnostics, { status: "idle", events: [], localEvents: [] });
});

test("fresh connection status fences stale model lists and preserves newer list busy state", async () => {
  let account = { clientId: "client-a", label: "Owner A" };
  const finish = [];
  const app = await harness({ aiClient: {
    status: async () => ({ connected: true, planEnabled: true, pending: false, account }),
    models: async () => new Promise((resolve) => { finish.push(resolve); }),
  } });
  await app.insight.checkConnection();
  const stale = app.insight.loadModels();
  assert.equal(app.insight.currentState().ai.status, "loadingModels");
  account = { clientId: "client-b", label: "Owner B" };
  await app.insight.checkConnection();
  assert.equal(app.insight.currentState().ai.status, "connected");
  assert.deepEqual(app.insight.currentState().ai.models, []);
  const fresh = app.insight.loadModels();
  finish[0]([{ slug: "old-model", displayName: "Old" }]);
  assert.equal(await stale, false);
  assert.equal(await app.insight.loadModels(), false);
  finish[1]([{ slug: "new-model", displayName: "New" }]);
  assert.equal(await fresh, true);
  assert.deepEqual(app.insight.currentState().ai.models, [{ slug: "new-model", displayName: "New" }]);
  assert.equal(app.insight.currentState().ai.status, "chooseModel");
  assert.equal(app.insight.selectModel("new-model"), true);
  account = { clientId: "client-c", label: "Owner C" };
  await app.insight.checkConnection();
  assert.deepEqual(app.insight.currentState().ai.models, []);
  assert.equal(app.insight.currentState().ai.model, "");
});

test("connection loss clears a selected model and fences an in-flight list", async () => {
  let planEnabled = true;
  let finish;
  const app = await harness({ aiClient: {
    status: async () => ({ connected: planEnabled, planEnabled, pending: false,
      account: planEnabled ? { clientId: "client-a", label: "Owner" } : null }),
    models: async () => new Promise((resolve) => { finish = resolve; }),
  } });
  await app.insight.checkConnection();
  const listing = app.insight.loadModels();
  planEnabled = false;
  await app.insight.checkConnection();
  finish([{ slug: "old-model", displayName: "Old" }]);
  assert.equal(await listing, false);
  assert.equal(app.insight.currentState().ai.status, "disconnected");
  assert.deepEqual(app.insight.currentState().ai.models, []);
  assert.equal(app.insight.currentState().ai.model, "");
});

test("connection failure stage clears on a new attempt and a successful status", async () => {
  let nextStatus = { connected: false, planEnabled: false, pending: false, account: null,
    error: "connection-failed", failureStage: "identity-verification-failed", failureSubstage: "claims-invalid" };
  let connects = 0;
  const app = await harness({ aiClient: {
    status: async () => nextStatus,
    connect: async () => { connects++; return { authorizationUrl: "https://auth.openai.com/api/accounts/authorize?synthetic=1" }; },
  }, openAuthorization: async () => {} });
  assert.equal(await app.insight.checkConnection(), false);
  assert.equal(app.insight.currentState().ai.status, "connectionFailed");
  assert.equal(app.insight.currentState().ai.failureStage, "identity-verification-failed");
  assert.equal(app.insight.currentState().ai.failureSubstage, "claims-invalid");
  assert.equal(await app.insight.connect(), true);
  assert.equal(connects, 1);
  assert.equal(app.insight.currentState().ai.failureStage, null);
  assert.equal(app.insight.currentState().ai.failureSubstage, null);
  nextStatus = { connected: true, planEnabled: true, pending: false,
    account: { clientId: "client-a", label: "Owner" } };
  assert.equal(await app.insight.checkConnection(), true);
  assert.equal(app.insight.currentState().ai.status, "connected");
  assert.equal(app.insight.currentState().ai.failureStage, null);
  assert.equal(app.insight.currentState().ai.failureSubstage, null);
});

test("identity substage is scoped to its failure and clears on disconnect", async () => {
  let nextStatus = { connected: false, planEnabled: false, pending: false, account: null,
    error: "connection-failed", failureStage: "identity-verification-failed", failureSubstage: "jwks-invalid" };
  const app = await harness({ aiClient: {
    status: async () => nextStatus,
    disconnect: async () => ({ revocationConfirmed: true }),
  } });
  await app.insight.checkConnection();
  assert.equal(app.insight.currentState().ai.failureSubstage, "jwks-invalid");
  nextStatus = { ...nextStatus, failureStage: "registration-failed" };
  await app.insight.checkConnection();
  assert.equal(app.insight.currentState().ai.failureSubstage, null);
  await app.insight.disconnect();
  assert.equal(app.insight.currentState().ai.failureSubstage, null);
  assert.equal(app.insight.currentState().ai.failureStage, null);
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
  const running = app.insight.createInsights();
  for (let attempt = 0; !finish && attempt < 20; attempt++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof finish, "function");
  app.navigate(); finish(true);
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

test("research failure retains only a fixed diagnostic detail in popup memory", async () => {
  for (const detail of ["response-no-final", "response-output-empty", "response-search-only",
    "response-reasoning-only", "response-final-item-missing", "response-item-identity",
    "response-item-conflict", "response-item-prefix", "response-item-text", "response-stream-text-unfinalized",
    "response-content-json", "response-content-html",
    "response-content-text", "response-content-missing", "response-content-other", "response-content-type"]) {
    const app = await harness({ aiClient: {
      status: async () => ({ connected: true, planEnabled: true, pending: false, account: null }),
      models: async () => [{ slug: "model-a", displayName: "Model A" }],
      start: async () => ({ state: "running" }),
      result: async () => ({ operationId: "op-failed", state: "failed", error: "invalid-response", detail }),
      cancel: async () => true,
    }, readArticle: async () => ({ url: "https://example.com/", documentId: "doc-a", text: "Public text" }),
      attestArticle: async () => true, randomId: () => "op-failed" });
    app.insight.prepare(); await app.insight.checkConnection(); await app.insight.loadModels();
    await app.insight.readPageText(); app.insight.selectModel("model-a"); app.insight.setCostConsent(true);
    assert.equal(await app.insight.createInsights(), false);
    assert.equal(app.insight.currentState().ai.researchFailureDetail, detail);
    assert.equal(app.insight.currentState().draft, "");
    app.insight.discard();
    assert.equal(app.insight.currentState().ai.researchFailureDetail, null);
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
  assert.equal(await app.insight.share(), false);
  const root = app.service.discussion("reserved-domain-demo").roots.find((entry) => entry.actorType === "agent");
  assert.equal(root, undefined);
});

test("stale exact review cannot retarget, duplicate click or uncertain failure cannot replay", async () => {
  let resolve;
  const app = await generatedHarness({ command: () => new Promise((done) => { resolve = done; }) });
  app.insight.preview();
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
  const app = await generatedHarness({ command: async () => { throw Object.assign(new Error("uncertain"), { code: "unavailable" }); } });
  app.insight.preview();
  assert.equal(await app.insight.share(), false); assert.equal(app.insight.currentState().status, "failed");
  assert.equal(await app.insight.share(), false); assert.equal(app.commands.length, 1);
  assert.equal(app.discussion.currentState().needsFreshRead, true);
  await app.discussion.open(); app.insight.prepare(); app.insight.setDraft("Private memory");
  app.insight.dispose(); assert.equal(app.insight.currentState().draft, "");
  assert.equal(app.insight.prepare(), false); assert.equal(await app.insight.share(), false);
});
