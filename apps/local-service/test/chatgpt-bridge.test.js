import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createChatGPTRuntime, createChatGPTRegistrationStore } from "../src/ai/chatgpt-runtime.js";
import { ChatGPTConnectionFailure } from "../src/ai/chatgpt-connection.js";
import { ChatGptInsightError } from "../src/ai/chatgpt-insights.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { inspectRequestHead } from "../src/http/loopback-listener.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { openDormantLocalApplication } from "../src/startup.js";
import { buildInsightContext } from "../../../spikes/topic-resolution/browser/core/insight-context.js";
import { demoService, deterministicDependencies } from "./helpers.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const TOKEN = "test-capability-value-32-characters";
const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN });
function request(method, url, body, headers = {}) {
  return { method, url, headers: { host: config.hostHeader, authorization: `Bearer ${TOKEN}`,
    ...(method === "POST" ? { "content-type": "application/json" } : {}), ...headers },
  body: method === "POST" ? JSON.stringify(body) : null };
}
function body(result) { return JSON.parse(result.body); }
function fixture() {
  const service = demoService();
  const catalog = service.catalog();
  const sourceId = "reserved-example-com", topicId = "reserved-domain-demo";
  const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
    related: service.related(sourceId, 5), sourceId, topicId });
  return { service, catalog, context };
}

test("paired bridge reconstructs the exact context from twenty local nominations", async () => {
  const base = demoService();
  const limits = [];
  const service = { ...base, related(sourceId, limit) {
    limits.push(limit);
    return base.related(sourceId, limit);
  } };
  const catalog = service.catalog();
  const sourceId = "harbor-overview";
  const topicId = catalog.sources.find((source) => source.id === sourceId).topicId;
  const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
    related: service.related(sourceId, 20), sourceId, topicId });
  const seen = [];
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { createInsight: async ({ context: providerContext }) => {
      seen.push(providerContext);
      return { body: "Synthetic finding.", citations: [], model: "synthetic" };
    }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  const input = { operationId: "twenty-nominations", model: "synthetic", context,
    articleText: "Public synthetic article.", allowWebResearch: false, expected: catalog.version };
  assert.equal((await handle(request("POST", "/v1/ai/insights", input, actor))).status, 200);
  assert.deepEqual(limits, [20, 20]);
  assert.deepEqual(seen, [context]);
  assert.ok(context.sameTopicSources.length + context.relatedSources.length <= 4);
  ai.dispose();
});

test("registration persists only stable opaque host ID and non-secret account identity", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "discussion-chatgpt-registration-"));
  try {
    const store = createChatGPTRegistrationStore(dir);
    assert.match(store.hostId, /^urn:uuid:[0-9a-f-]{36}$/u);
    await store.writeRegistration({ clientId: "synthetic-client", subject: "synthetic-subject", email: null, label: "Demo" });
    assert.equal(createChatGPTRegistrationStore(dir).hostId, store.hostId);
    const disk = readFileSync(path.join(dir, "chatgpt-registration.json"), "utf8");
    assert.ok(!disk.includes("accessToken"));
    assert.ok(!disk.includes("refreshToken"));
    await assert.rejects(store.writeRegistration({ clientId: "x", subject: "y", email: null, label: "z", accessToken: "secret" }));
    assert.equal(readFileSync(path.join(dir, "chatgpt-registration.json"), "utf8"), disk);
    await store.writeRegistration(null);
    assert.equal(await store.readRegistration(), null);
    const restarted = createChatGPTRegistrationStore(dir);
    assert.equal(restarted.hostId, store.hostId);
    assert.equal(await restarted.readRegistration(), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("paired bridge accepts rebuilt current context and isolates async result by actor", async () => {
  const { service, catalog, context } = fixture();
  let finish;
  let calls = 0;
  let cancellations = 0;
  const connectionAdapter = { status: () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "synthetic", label: "Demo" } }),
    start: async () => "https://auth.openai.com/example", completeCallback: async () => {}, disconnect: async () => ({ revocationConfirmed: true }), dispose() {} };
  const insightsAdapter = { listModels: async () => [{ slug: "synthetic", displayName: "Synthetic" }],
    createInsight: () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); }, cancel() { cancellations += 1; }, dispose() {} };
  const ai = createChatGPTRuntime({ service, connectionAdapter, insightsAdapter });
  const handle = createRequestHandler({ service, config, ai });
  const input = { operationId: "op-one", model: "synthetic", context, articleText: "Public synthetic article.",
    allowWebResearch: true, expected: catalog.version };
  const authorized = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  const resumePath = "/v1/ai/insights/resumable";
  assert.deepEqual(body(await handle(request("GET", resumePath, null, authorized))), { job: null });
  assert.equal((await handle(request("GET", resumePath, null, { origin: ORIGIN }))).status, 403);
  assert.equal((await handle(request("GET", resumePath, null, { ...authorized, authorization: "Bearer wrong" }))).status, 401);
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/status", null, { origin: ORIGIN }))), connectionAdapter.status());
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/models", null, { origin: ORIGIN }))),
    { models: [{ slug: "synthetic", displayName: "Synthetic" }] });
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights", input, authorized))), { operationId: "op-one", state: "running" });
  const summary = { operationId: "op-one", state: "running", expected: catalog.version,
    topicId: "reserved-domain-demo", originSourceId: "reserved-example-com",
    rootId: null, replyToId: null, discussionId: null };
  assert.deepEqual(body(await handle(request("GET", resumePath, null, authorized))), { job: summary });
  assert.deepEqual(body(await handle(request("GET", resumePath, null,
    { ...authorized, "x-demo-actor": "demo-blair" }))), { job: null });
  assert.equal(calls, 1);
  assert.equal((await handle(request("POST", "/v1/ai/insights", input, authorized))).status, 409);
  assert.equal((await handle(request("POST", "/v1/ai/insights/result", { operationId: "op-one" }, { ...authorized, "x-demo-actor": "demo-blair" }))).status, 403);
  finish({ body: "A useful finding.", citations: [], model: "synthetic" });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights/result", { operationId: "op-one" }, authorized))),
    { operationId: "op-one", state: "completed", result: { body: "A useful finding.", citations: [], model: "synthetic" } });
  assert.deepEqual(body(await handle(request("GET", resumePath, null, authorized))),
    { job: { ...summary, state: "completed" } });
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights/cancel", { operationId: "op-one" }, authorized))), { cancelled: true });
  assert.equal((await handle(request("POST", "/v1/ai/insights/result", { operationId: "op-one" }, authorized))).status, 404);
  assert.deepEqual(body(await handle(request("GET", resumePath, null, authorized))), { job: null });
  assert.equal(cancellations, 0);
  ai.dispose();
});

test("resumable private result expires from RAM after 30 minutes and stale work is hidden", async () => {
  const { service, catalog, context } = fixture();
  let clock = 1_000;
  let cancellations = 0;
  const ai = createChatGPTRuntime({ service, now: () => clock,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false }), dispose() {} },
    insightsAdapter: { createInsight: async () => ({ body: "PRIVATE_RESULT_SENTINEL", citations: [], model: "synthetic" }),
      cancel() { cancellations += 1; }, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { "x-demo-actor": "demo-alex" };
  const input = { operationId: "resumable-expiry", model: "synthetic", context,
    articleText: "PRIVATE_ARTICLE_SENTINEL", allowWebResearch: false, expected: catalog.version };
  assert.equal((await handle(request("POST", "/v1/ai/insights", input, actor))).status, 200);
  await Promise.resolve(); await Promise.resolve();
  clock += 30 * 60_000 - 1;
  const summary = body(await handle(request("GET", "/v1/ai/insights/resumable", null, actor)));
  assert.equal(summary.job.state, "completed");
  assert.equal(JSON.stringify(summary).includes("PRIVATE_"), false);
  clock += 1;
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/insights/resumable", null, actor))), { job: null });
  assert.equal((await handle(request("POST", "/v1/ai/insights/result", { operationId: input.operationId }, actor))).status, 404);
  assert.equal(cancellations, 0);
  ai.dispose();
});

test("follow-up bridge sends only server-selected thread text and shares one exact robot reply", async () => {
  const service = demoService();
  const actor = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  const rootCommand = { type: "share-insight", operationId: "prior-generated-op",
    topicId: "reserved-domain-demo", body: "A short robot opener.", originSourceId: "reserved-example-com" };
  const rootProof = { kind: "generated-insight", operationId: rootCommand.operationId,
    actorId: "demo-alex", topicId: rootCommand.topicId, body: rootCommand.body,
    originSourceId: rootCommand.originSourceId, rootId: null, replyToId: null, discussionId: null };
  const rootId = service.command(service.catalog().version, rootCommand, "demo-alex", rootProof).result.contributionId;
  const discussionId = service.discussion(rootCommand.topicId).discussionId;
  const ownQuestion = "What evidence supports the opener?";
  const questionId = service.command(service.catalog().version, { type: "reply", discussionId,
    rootId, replyToId: rootId, body: ownQuestion }, "demo-alex").result.contributionId;
  const otherQuestionId = service.command(service.catalog().version, { type: "reply", discussionId,
    rootId, replyToId: rootId, body: "Other user's private question" }, "demo-blair").result.contributionId;
  service.command(service.catalog().version, { type: "create-root", topicId: rootCommand.topicId,
    body: "Unrelated discussion must stay local." }, "demo-blair");
  const catalog = service.catalog();
  const context = buildInsightContext({ catalog, discussion: service.discussion(rootCommand.topicId),
    related: service.related(rootCommand.originSourceId, 5), sourceId: rootCommand.originSourceId,
    topicId: rootCommand.topicId });
  const providerInputs = [];
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false }), dispose() {} },
    insightsAdapter: { createInsight: async (value) => {
      providerInputs.push(value);
      return { body: "One concise generated reply.", citations: [], model: "synthetic" };
    }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const input = { operationId: "followup-through-bridge", model: "synthetic", context,
    articleText: "Public synthetic current-page text.", allowWebResearch: false,
    expected: catalog.version, followupQuestionId: questionId };
  assert.equal((await handle(request("POST", "/v1/ai/insights",
    { ...input, operationId: "other-question", followupQuestionId: otherQuestionId }, actor))).status, 403);
  assert.equal((await handle(request("POST", "/v1/ai/insights",
    { ...input, operationId: "forged-question", followupQuestionId: "missing-question" }, actor))).status, 404);
  assert.equal(providerInputs.length, 0);
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights", input, actor))),
    { operationId: input.operationId, state: "running" });
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/insights/resumable", null, actor))),
    { job: { operationId: input.operationId, state: "completed", expected: catalog.version,
      topicId: rootCommand.topicId, originSourceId: rootCommand.originSourceId,
      rootId, replyToId: questionId, discussionId } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(providerInputs.length, 1);
  assert.deepEqual(providerInputs[0].followup,
    { parentBody: rootCommand.body, questionBody: ownQuestion });
  assert.equal(JSON.stringify(providerInputs[0]).includes("Other user's private question"), false);
  assert.equal(JSON.stringify(providerInputs[0]).includes("Unrelated discussion must stay local"), false);
  assert.equal(body(await handle(request("POST", "/v1/ai/insights/result",
    { operationId: input.operationId }, actor))).state, "completed");
  const shareCommand = { type: "share-insight-reply", operationId: input.operationId,
    topicId: rootCommand.topicId, discussionId, rootId, replyToId: questionId,
    originSourceId: rootCommand.originSourceId, body: "One concise generated reply." };
  assert.equal((await handle(request("POST", "/v1/commands", { expected: catalog.version,
    command: { ...shareCommand, body: "Altered reply" } }, actor))).status, 400);
  assert.equal((await handle(request("POST", "/v1/commands", { expected: catalog.version,
    command: shareCommand }, actor))).status, 200);
  const reply = service.discussion(rootCommand.topicId).roots.find((item) => item.id === rootId)
    .replies.find((item) => item.actorType === "agent");
  assert.equal(reply.replyToId, questionId);
  assert.equal(reply.body, shareCommand.body);
  assert.deepEqual(reply.insight, { kind: "generated", operatorId: "demo-alex" });
  assert.equal((await handle(request("POST", "/v1/commands", { expected: catalog.version,
    command: shareCommand }, actor))).status, 404);
  ai.dispose();
});

test("paired bridge filters only named related sources from an exact full context", async () => {
  const service = demoService();
  const catalog = service.catalog();
  const sourceId = "harbor-overview";
  const topicId = catalog.sources.find((source) => source.id === sourceId).topicId;
  const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
    related: service.related(sourceId, 5), sourceId, topicId });
  assert.equal(context.relatedSources.length, 2);
  assert.ok(context.sameTopicSources.length > 0);
  const excludedId = context.relatedSources[0].id;
  const providerContexts = [];
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { createInsight: async ({ context: providerContext }) => {
      providerContexts.push(providerContext);
      return { body: "Synthetic finding.", citations: [], model: "synthetic" };
    }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  const input = { operationId: "filtered-related", model: "synthetic", context,
    articleText: "Public synthetic article.", allowWebResearch: true, expected: catalog.version,
    excludedRelatedSourceIds: [excludedId] };
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights", input, actor))),
    { operationId: "filtered-related", state: "running" });
  assert.deepEqual(providerContexts, [{ ...context,
    relatedSources: context.relatedSources.slice(1),
    coverage: { ...context.coverage, relatedTotal: context.coverage.relatedTotal - 1 } }]);
  for (const [name, changes] of [
    ["unknown", { excludedRelatedSourceIds: ["forged-related"] }],
    ["current", { excludedRelatedSourceIds: [context.currentSource.id] }],
    ["duplicate", { excludedRelatedSourceIds: [excludedId, excludedId] }],
    ["wrong-type", { excludedRelatedSourceIds: excludedId }],
    ["filtered-context", { context: { ...context, relatedSources: context.relatedSources.slice(1) } }],
    ["forged-current", { context: { ...context,
      currentSource: { ...context.currentSource, title: "Forged current title" } } }],
    ["forged-same-topic", { context: { ...context,
      sameTopicSources: [{ ...context.sameTopicSources[0], title: "Forged peer title" }, ...context.sameTopicSources.slice(1)] } }],
    ["forged-candidate", { context: { ...context,
      relatedSources: [{ ...context.relatedSources[0], title: "Forged candidate title" }, ...context.relatedSources.slice(1)] } }],
  ]) {
    const response = await handle(request("POST", "/v1/ai/insights",
      { ...input, operationId: `reject-${name}`, ...changes }, actor));
    assert.equal(response.status, 400, name);
  }
  assert.equal(providerContexts.length, 1);
  ai.dispose();
});

test("paired bridge checks related excerpts against filtered catalog context before accepting a job", async () => {
  const service = demoService();
  const catalog = service.catalog();
  const sourceId = "harbor-overview";
  const topicId = catalog.sources.find((source) => source.id === sourceId).topicId;
  const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
    related: service.related(sourceId, 5), sourceId, topicId });
  const excludedSameTopic = context.sameTopicSources[0];
  const excludedRelated = context.relatedSources[0];
  const accepted = context.relatedSources[1];
  const seen = [];
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { createInsight: async ({ context: providerContext, relatedExcerpts }) => {
      seen.push({ context: providerContext, relatedExcerpts });
      return { body: "Synthetic finding.", citations: [], model: "synthetic" };
    }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  const input = { operationId: "valid-related-excerpt", model: "synthetic", context,
    articleText: "Public synthetic article.", allowWebResearch: false, expected: catalog.version,
    excludedRelatedSourceIds: [excludedSameTopic.id, excludedRelated.id],
    relatedExcerpts: [{ sourceId: accepted.id, url: accepted.url, text: "Public signed-out excerpt." }] };
  for (const [name, excerpts] of [
    ["excluded-same-topic", [{ sourceId: excludedSameTopic.id, url: excludedSameTopic.url, text: "Excluded." }]],
    ["excluded-related", [{ sourceId: excludedRelated.id, url: excludedRelated.url, text: "Excluded." }]],
    ["current", [{ sourceId: context.currentSource.id, url: context.currentSource.url, text: "Current." }]],
    ["forged-url", [{ sourceId: accepted.id, url: "https://example.net/forged", text: "Forged." }]],
    ["duplicate", [input.relatedExcerpts[0], input.relatedExcerpts[0]]],
    ["null", null],
  ]) {
    const response = await handle(request("POST", "/v1/ai/insights",
      { ...input, operationId: `invalid-${name}`, relatedExcerpts: excerpts }, actor));
    assert.equal(response.status, 400, name);
  }
  assert.equal(seen.length, 0);
  const outcome = await handle(request("POST", "/v1/ai/insights", input, actor));
  assert.equal(outcome.status, 200, JSON.stringify(body(outcome)));
  assert.deepEqual(seen, [{ context: { ...context,
    sameTopicSources: context.sameTopicSources.slice(1), relatedSources: context.relatedSources.slice(1),
    coverage: { ...context.coverage,
      sameTopicTotal: context.coverage.sameTopicTotal - 1,
      relatedTotal: context.coverage.relatedTotal - 1 } },
  relatedExcerpts: input.relatedExcerpts }]);
  ai.dispose();
});

test("paired bridge may exclude every selected non-current source", async () => {
  const service = demoService();
  const catalog = service.catalog();
  const sourceId = "harbor-overview";
  const topicId = catalog.sources.find((source) => source.id === sourceId).topicId;
  const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
    related: service.related(sourceId, 5), sourceId, topicId });
  const selected = [...context.sameTopicSources, ...context.relatedSources];
  assert.ok(selected.length > 1);
  const seen = [];
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { createInsight: async ({ context: providerContext }) => {
      seen.push(providerContext); return { body: "Synthetic finding.", citations: [], model: "synthetic" };
    }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  const input = { operationId: "exclude-all-selected", model: "synthetic", context,
    articleText: "Public synthetic article.", allowWebResearch: false, expected: catalog.version,
    excludedRelatedSourceIds: selected.map((source) => source.id), relatedExcerpts: [] };
  assert.equal((await handle(request("POST", "/v1/ai/insights", input, actor))).status, 200);
  assert.deepEqual(seen, [{ ...context, sameTopicSources: [], relatedSources: [],
    coverage: { ...context.coverage,
      sameTopicTotal: context.coverage.sameTopicTotal - context.sameTopicSources.length,
      relatedTotal: context.coverage.relatedTotal - context.relatedSources.length } }]);
  ai.dispose();
});

test("paired research result and diagnostics retain fixed failure detail only", async () => {
  const { service, catalog, context } = fixture();
  const secret = "SECRET_PROVIDER_RESEARCH_TEXT_URL_TOKEN";
  let calls = 0;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { createInsight: async () => { calls += 1;
      throw Object.assign(new ChatGptInsightError("invalid-response", "response-content-json"),
        { message: secret, requestId: secret, body: secret }); },
      cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  const input = { operationId: "research-failure", model: "synthetic", context,
    articleText: "Public synthetic article.", allowWebResearch: true, expected: catalog.version };
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights", input, actor))),
    { operationId: "research-failure", state: "running" });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights/result",
    { operationId: "research-failure" }, actor))),
    { operationId: "research-failure", state: "failed", error: "invalid-response", detail: "response-content-json" });
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/diagnostics", null, { origin: ORIGIN }))),
    { events: [{ kind: "insight", outcome: "invalid-response", detail: "response-content-json" }] });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(ai.diagnostics()).includes(secret), false);
  ai.dispose();
});

test("verified account without plan permission cannot list models or create insight", async () => {
  const { service, catalog, context } = fixture();
  let providerCalls = 0;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: false, pending: false,
      account: { clientId: "synthetic", label: "Demo" } }), dispose() {} },
    insightsAdapter: { listModels: async () => { providerCalls += 1; return []; },
      createInsight: async () => { providerCalls += 1; return { body: "No", citations: [], model: "synthetic" }; },
      cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const status = body(await handle(request("GET", "/v1/ai/status", null, { origin: ORIGIN })));
  assert.equal(status.connected, true);
  assert.equal(status.planEnabled, false);
  assert.equal((await handle(request("GET", "/v1/ai/models", null, { origin: ORIGIN }))).status, 401);
  const input = { operationId: "no-plan", model: "synthetic", context, articleText: "Public article.",
    allowWebResearch: true, expected: catalog.version };
  assert.equal((await handle(request("POST", "/v1/ai/insights", input,
    { origin: ORIGIN, "x-demo-actor": "demo-alex" }))).status, 401);
  assert.equal(providerCalls, 0);
  ai.dispose();
});

test("authenticated model-list failures expose only fixed categories", async () => {
  const service = demoService();
  const providerSecret = "SECRET_PROVIDER_BODY_TOKEN_REQUEST_ID_STATUS";
  const failures = [
    ["unauthorized", "access-rejected"], ["rate-limit", "rate-limited"],
    ["timeout", "timed-out"], ["invalid-response", "invalid-response"],
    ["provider-unavailable", "provider-unavailable"], ["cancelled", "provider-unavailable"],
    ["busy", "busy"],
  ];
  let nextError;
  let calls = 0;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { listModels: async () => { calls += 1; throw nextError; }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  for (const [code, failure] of failures) {
    nextError = Object.assign(new ChatGptInsightError(code), { detail: providerSecret, status: 503, requestId: providerSecret });
    const response = await handle(request("GET", "/v1/ai/models", null, { origin: ORIGIN }));
    assert.equal(response.status, 200);
    assert.deepEqual(body(response), { failure });
    assert.equal(response.body.includes(providerSecret), false);
  }
  assert.equal(calls, failures.length);
  for (const error of [new ChatGptInsightError(providerSecret), new Error(providerSecret)]) {
    nextError = error;
    const response = await handle(request("GET", "/v1/ai/models", null, { origin: ORIGIN }));
    assert.equal(response.status, 500);
    assert.equal(response.body.includes(providerSecret), false);
  }
  assert.equal(calls, failures.length + 2);
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/diagnostics", null, { origin: ORIGIN }))), {
    events: failures.map(([, outcome]) => ({ kind: "models", outcome })),
  });
  assert.equal((await handle({ method: "GET", url: "/v1/ai/diagnostics",
    headers: { host: config.hostHeader }, body: null })).status, 401);
  assert.equal((await handle(request("GET", "/v1/ai/diagnostics", null, { origin: "https://untrusted.example" }))).status, 403);
  ai.dispose();
});

test("malformed provider catalog cannot expose body or request details through model route", async () => {
  const providerSecret = "SECRET_PROVIDER_MODEL_BODY_REQUEST_ID";
  let requests = 0;
  const service = demoService();
  const ai = createChatGPTRuntime({ service,
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify({ models: providerSecret, request_id: providerSecret }),
        { headers: { "content-type": "application/json" } });
    },
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }),
      getAccessToken: async () => "synthetic-oauth-token-for-tests", dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const response = await handle(request("GET", "/v1/ai/models", null, { origin: ORIGIN }));
  assert.equal(response.status, 200);
  assert.deepEqual(body(response), { failure: "invalid-response", detail: "catalog-shape" });
  assert.equal(response.body.includes(providerSecret), false);
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/diagnostics"))), {
    events: [{ kind: "models", outcome: "invalid-response", detail: "catalog-shape" }],
  });
  assert.equal(requests, 1);
  ai.dispose();
});

test("model diagnostics retain only the last 20 fixed outcomes in process memory", async () => {
  const service = demoService();
  let nextError = null;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true }), dispose() {} },
    insightsAdapter: { listModels: async () => {
      if (nextError) throw nextError;
      return [{ slug: "SECRET_MODEL_ID", displayName: "SECRET_MODEL_NAME" }];
    }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  for (let index = 0; index < 22; index += 1) {
    nextError = index === 0 ? new ChatGptInsightError("invalid-response", "catalog-json") : null;
    const response = await handle(request("GET", "/v1/ai/models"));
    assert.equal(response.status, 200);
  }
  const diagnostics = body(await handle(request("GET", "/v1/ai/diagnostics")));
  assert.equal(diagnostics.events.length, 20);
  assert.deepEqual(diagnostics.events, Array.from({ length: 20 }, () => ({ kind: "models", outcome: "success" })));
  assert.equal(JSON.stringify(diagnostics).includes("SECRET"), false);
  ai.dispose();
  assert.deepEqual(ai.diagnostics(), { events: [] });
});

test("forged context, stale revision, invalid actor and missing capability never invoke provider", async () => {
  const { service, catalog, context } = fixture();
  let calls = 0;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { createInsight: async () => { calls += 1; return { body: "No", citations: [], model: "synthetic" }; }, cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const input = { operationId: "op-one", model: "synthetic", context, articleText: "Public article.",
    allowWebResearch: true, expected: catalog.version };
  for (const [value, actor, expected] of [
    [{ ...input, context: { ...context, topic: { ...context.topic, title: "Forged" } } }, "demo-alex", 400],
    [{ ...input, expected: { ...catalog.version, revision: catalog.version.revision + 1 } }, "demo-alex", 409],
    [input, "forged-admin", 403],
  ]) assert.equal((await handle(request("POST", "/v1/ai/insights", value, { "x-demo-actor": actor }))).status, expected);
  assert.equal((await handle(request("POST", "/v1/ai/insights", input,
    { authorization: "Bearer wrong", "x-demo-actor": "demo-alex" }))).status, 401);
  assert.equal(calls, 0);
  ai.dispose();
});

test("changed catalog version invalidates an in-flight result without exposing the old finding", async () => {
  const { service, catalog, context } = fixture();
  let finish;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
    insightsAdapter: { createInsight: () => new Promise((resolve) => { finish = resolve; }), cancel() {}, dispose() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { "x-demo-actor": "demo-alex" };
  const input = { operationId: "stale-one", model: "synthetic", context, articleText: "Public article.",
    allowWebResearch: true, expected: catalog.version };
  assert.equal((await handle(request("POST", "/v1/ai/insights", input, actor))).status, 200);
  service.command(catalog.version, { type: "create-root", topicId: "reserved-domain-demo", body: "New post" }, "demo-alex");
  finish({ body: "Sensitive stale finding", citations: [], model: "synthetic" });
  await Promise.resolve(); await Promise.resolve();
  const result = body(await handle(request("POST", "/v1/ai/insights/result", { operationId: "stale-one" }, actor)));
  assert.deepEqual(result, { operationId: "stale-one", state: "failed", error: "stale-context" });
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/insights/resumable", null, actor))), { job: null });
  assert.equal(JSON.stringify(result).includes("Sensitive"), false);
  ai.dispose();
});

test("reset and disconnect clear late provider results and cannot replay operation IDs", async () => {
  const { service, catalog, context } = fixture();
  let finish;
  let cancelled = 0;
  const connectionAdapter = { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }),
    disconnect: async () => ({ revocationConfirmed: false }), dispose() {} };
  const insightsAdapter = { createInsight: () => new Promise((resolve) => { finish = resolve; }),
    cancel: () => { cancelled += 1; }, dispose() {}, clearModels() {} };
  const ai = createChatGPTRuntime({ service, connectionAdapter, insightsAdapter });
  const handle = createRequestHandler({ service, config, ai });
  const actor = { "x-demo-actor": "demo-alex" };
  const input = { operationId: "reset-id", model: "synthetic", context, articleText: "Public article.",
    allowWebResearch: true, expected: catalog.version };
  assert.equal((await handle(request("POST", "/v1/ai/insights", input, actor))).status, 200);
  assert.equal((await handle(request("POST", "/v1/demo/reset", { expected: catalog.version, confirmation: "RESET DEMO STATE" }))).status, 200);
  finish({ body: "Late private finding", citations: [], model: "synthetic" });
  await Promise.resolve(); await Promise.resolve();
  assert.equal((await handle(request("POST", "/v1/ai/insights/result", { operationId: "reset-id" }, actor))).status, 404);
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/insights/resumable", null, actor))), { job: null });
  assert.equal((await handle(request("POST", "/v1/ai/insights", { ...input, expected: service.catalog().version }, actor))).status, 409);
  const after = service.catalog();
  const nextContext = buildInsightContext({ catalog: after, discussion: service.discussion(context.topic.id),
    related: service.related(context.currentSource.id, 5), sourceId: context.currentSource.id, topicId: context.topic.id });
  assert.equal((await handle(request("POST", "/v1/ai/insights", { ...input, operationId: "disconnect-id", context: nextContext,
    expected: after.version }, actor))).status, 200);
  assert.equal((await handle(request("POST", "/v1/ai/disconnect", {}))).status, 200);
  finish({ body: "Late disconnected finding", citations: [], model: "synthetic" });
  await Promise.resolve(); await Promise.resolve();
  assert.equal((await handle(request("POST", "/v1/ai/insights/result", { operationId: "disconnect-id" }, actor))).status, 404);
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/insights/resumable", null, actor))), { job: null });
  assert.equal(cancelled, 2);
  ai.dispose();
});

test("wrong-state callback cannot block a later valid callback", async () => {
  const service = demoService();
  let pending = true;
  let completed = false;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: completed, planEnabled: completed, pending, account: null }),
      completeCallback: async ({ url }) => {
        if (!url.includes("state=valid")) throw new Error("Invalid state");
        completed = true; pending = false;
      }, dispose() {} },
    insightsAdapter: { cancel() {}, dispose() {}, clearModels() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const callback = async (state) => handle({ method: "GET", url: `/auth/callback?code=synthetic&state=${state}`,
    headers: { host: config.hostHeader }, body: null });
  assert.equal((await callback("wrong")).status, 200);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ai.status().pending, true);
  assert.equal(ai.status().error, "connection-failed");
  assert.equal((await callback("valid")).status, 200);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ai.status().connected, true);
  assert.equal(ai.status().error, undefined);
  ai.dispose();
});

test("authenticated AI status projects only allowlisted in-memory callback stage", async () => {
  const service = demoService();
  let nextError = new ChatGPTConnectionFailure("token-exchange-rejected");
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: false, planEnabled: false, pending: false, account: null }),
      completeCallback: async () => { throw nextError; },
      start: async () => "https://auth.openai.com/example", disconnect: async () => ({}), dispose() {} },
    insightsAdapter: { cancel() {}, dispose() {}, clearModels() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const callback = async () => {
    await handle({ method: "GET", url: "/auth/callback?code=SECRET_CODE&state=SECRET_STATE",
      headers: { host: config.hostHeader }, body: null });
    await Promise.resolve(); await Promise.resolve();
  };
  await callback();
  const status = body(await handle(request("GET", "/v1/ai/status")));
  assert.equal(status.error, "connection-failed");
  assert.equal(status.failureStage, "token-exchange-rejected");
  assert.equal(status.failureSubstage, undefined);
  assert.equal(JSON.stringify(status).includes("SECRET"), false);
  assert.equal((await handle({ method: "GET", url: "/v1/ai/status", headers: { host: config.hostHeader }, body: null })).status, 401);
  nextError = new ChatGPTConnectionFailure("identity-verification-failed", "matching-key-invalid");
  await callback();
  const identityStatus = body(await handle(request("GET", "/v1/ai/status")));
  assert.equal(identityStatus.failureStage, "identity-verification-failed");
  assert.equal(identityStatus.failureSubstage, "matching-key-invalid");
  assert.equal(JSON.stringify(identityStatus).includes("SECRET"), false);
  nextError = Object.assign(new ChatGPTConnectionFailure("identity-verification-failed"),
    { failureSubstage: "SECRET_PROVIDER_TEXT" });
  await callback();
  assert.equal(ai.status().failureStage, "identity-verification-failed");
  assert.equal(ai.status().failureSubstage, undefined);
  assert.equal(JSON.stringify(ai.status()).includes("SECRET"), false);
  nextError = Object.assign(new Error("SECRET_PROVIDER_TEXT"), { failureStage: "registration-failed" });
  await callback();
  assert.equal(ai.status().failureStage, undefined);
  assert.equal(ai.status().failureSubstage, undefined);
  assert.equal(JSON.stringify(ai.status()).includes("SECRET"), false);
  assert.equal((await handle(request("POST", "/v1/ai/connect", {}))).status, 200);
  assert.equal(ai.status().error, undefined);
  assert.equal(ai.status().failureSubstage, undefined);
  await ai.disconnect({});
  assert.equal(ai.status().failureStage, undefined);
  assert.equal(ai.status().failureSubstage, undefined);
  ai.dispose();
});

test("second callback reports busy while first verification remains in flight", async () => {
  const service = demoService();
  let finish;
  let calls = 0;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: false, planEnabled: false, pending: true, account: null }),
      completeCallback: () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); }, dispose() {} },
    insightsAdapter: { cancel() {}, dispose() {}, clearModels() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const callback = (code) => handle({ method: "GET", url: `/auth/callback?code=${code}&state=synthetic`,
    headers: { host: config.hostHeader }, body: null });
  assert.equal((await callback("FIRST_SECRET")).status, 200);
  assert.equal((await callback("SECOND_SECRET")).status, 200);
  assert.equal(calls, 1);
  const busy = body(await handle(request("GET", "/v1/ai/status")));
  assert.equal(busy.pending, true);
  assert.equal(busy.error, "connection-failed");
  assert.equal(busy.failureStage, "callback-busy");
  assert.equal(JSON.stringify(busy).includes("SECRET"), false);
  finish();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ai.status().failureStage, undefined);
  assert.equal(ai.status().error, undefined);
  ai.dispose();
});

test("disconnect fences a late callback failure and permits a fresh callback", async () => {
  const service = demoService();
  const completions = [];
  let connected = false;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected, planEnabled: connected, pending: false, account: null }),
      completeCallback: () => new Promise((resolve, reject) => { completions.push({ resolve, reject }); }),
      disconnect: async () => { connected = false; return { revocationConfirmed: false }; }, dispose() {} },
    insightsAdapter: { cancel() {}, dispose() {}, clearModels() {} } });
  const handle = createRequestHandler({ service, config, ai });
  const callback = (code) => handle({ method: "GET", url: `/auth/callback?code=${code}&state=synthetic`,
    headers: { host: config.hostHeader }, body: null });
  assert.equal((await callback("FIRST_SECRET")).status, 200);
  assert.equal(ai.status().pending, true);
  await ai.disconnect({});
  assert.equal(ai.status().pending, false);
  assert.equal(ai.status().error, undefined);
  assert.equal(ai.status().failureStage, undefined);
  assert.equal((await callback("SECOND_SECRET")).status, 200);
  assert.equal(completions.length, 2);
  completions[0].reject(new ChatGPTConnectionFailure("identity-verification-failed", "signature-invalid"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ai.status().pending, true);
  assert.equal(ai.status().error, undefined);
  assert.equal(ai.status().failureStage, undefined);
  assert.equal(ai.status().failureSubstage, undefined);
  connected = true;
  completions[1].resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(ai.status().connected, true);
  assert.equal(ai.status().pending, false);
  assert.equal(ai.status().failureStage, undefined);
  ai.dispose();
});

test("provider request article and finding remain absent from SQLite and dormant startup creates no AI registration", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "discussion-chatgpt-sqlite-"));
  const databasePath = path.join(dir, "demo.sqlite");
  try {
    const dependencies = deterministicDependencies();
    const application = openDormantLocalApplication({ config: { host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN },
      databasePath, ...dependencies });
    assert.equal((await application.handle(request("GET", "/v1/ai/status"))).status, 404);
    application.close();
    assert.equal(existsSync(path.join(dir, "chatgpt-registration.json")), false);
    assert.equal(readFileSync(path.join(dir, "demo.sqlite")).includes("SECRET_ARTICLE_SENTINEL"), false);
    assert.equal(readFileSync(path.join(dir, "demo.sqlite")).includes("SECRET_FINDING_SENTINEL"), false);
    const { service, close } = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
    const catalog = service.catalog();
    const sourceId = "reserved-example-com", topicId = "reserved-domain-demo";
    const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
      related: service.related(sourceId, 5), sourceId, topicId });
    const ai = createChatGPTRuntime({ service,
      connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false, account: null }), dispose() {} },
      insightsAdapter: { createInsight: async () => ({ body: "SECRET_FINDING_SENTINEL", citations: [], model: "synthetic" }),
        cancel() {}, dispose() {} } });
    const result = ai.create({ operationId: "private-one", model: "synthetic", context,
      articleText: "SECRET_ARTICLE_SENTINEL", allowWebResearch: true, expected: catalog.version }, "demo-alex");
    assert.equal(result.state, "running");
    await Promise.resolve(); await Promise.resolve();
    assert.equal(ai.result({ operationId: "private-one" }, "demo-alex").state, "completed");
    ai.dispose(); close();
    const bytes = readFileSync(databasePath);
    assert.equal(bytes.includes("SECRET_ARTICLE_SENTINEL"), false);
    assert.equal(bytes.includes("SECRET_FINDING_SENTINEL"), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("dormant provider transport defers protected credential read until explicit restore", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "discussion-chatgpt-dormant-"));
  try {
    let calls = 0;
    let protectedReads = 0;
    let protectedHostId;
    const application = openDormantLocalApplication({ config: { host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN },
      databasePath: path.join(dir, "demo.sqlite"), ...deterministicDependencies(),
      chatgptFetchImpl: async () => { calls += 1; throw new Error("Unexpected network request"); },
      chatgptRefreshStore: ({ hostId }) => {
        protectedHostId = hostId;
        return { async read() { protectedReads += 1; return null; }, async write() {}, async clear() {} };
      } });
    assert.equal(calls, 0);
    assert.equal(protectedReads, 0);
    assert.equal(existsSync(path.join(dir, "chatgpt-registration.json")), true);
    assert.equal(protectedHostId, JSON.parse(readFileSync(path.join(dir, "chatgpt-registration.json"), "utf8")).hostId);
    assert.equal(await application.restore(), false);
    assert.equal(protectedReads, 1);
    assert.equal(calls, 0);
    application.close();
    assert.equal(calls, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("callback is narrow generic HTML and all application routes retain capability", async () => {
  let callback = null;
  const ai = { callback: (url) => { callback = url; }, status: () => ({ connected: false, pending: false, account: null }) };
  const handle = createRequestHandler({ service: demoService(), config, ai });
  const good = await handle({ method: "GET", url: "/auth/callback?code=synthetic&state=synthetic",
    headers: { host: config.hostHeader }, body: null });
  assert.equal(good.status, 200);
  assert.equal(good.headers["cache-control"], "no-store");
  assert.equal(good.body.includes("synthetic"), false);
  assert.match(good.body, /Sign-in response received; verification is not yet complete\. Return to extension and check status\./u);
  assert.equal(good.body.includes("Connection received"), false);
  assert.equal(callback, "http://127.0.0.1:4174/auth/callback?code=synthetic&state=synthetic");
  const secretCallback = await handle({ method: "GET", url: "/auth/callback?code=SECRET_CODE&state=SECRET_STATE&client_id=SECRET_CLIENT",
    headers: { host: config.hostHeader }, body: null });
  assert.equal(secretCallback.status, 200);
  assert.equal(JSON.stringify(secretCallback).includes("SECRET"), false);
  const cancelled = await handle({ method: "GET", url: "/auth/callback?error=access_denied&error_description=SECRET_REASON&state=SECRET_STATE",
    headers: { host: config.hostHeader }, body: null });
  assert.equal(cancelled.status, 200);
  assert.match(cancelled.body, /Sign-in was cancelled or declined\. No account was connected\./u);
  assert.equal(JSON.stringify(cancelled).includes("SECRET"), false);
  assert.equal((await handle({ method: "GET", url: "/auth/callback?code=x", headers: { host: config.hostHeader, origin: "https://evil.example" }, body: null })).status, 400);
  assert.equal((await handle({ method: "GET", url: "/v1/ai/status", headers: { host: config.hostHeader }, body: null })).status, 401);
  assert.equal((await handle({ method: "GET", url: `/v1/ai/status?${"x".repeat(3000)}`, headers: { host: config.hostHeader }, body: null })).status, 400);
  const head = (method, url) => inspectRequestHead({ method, url, rawHeaders: ["Host", config.hostHeader] });
  assert.equal(head("GET", `/auth/callback?code=${"x".repeat(3000)}`).status, undefined);
  assert.equal(head("GET", `/v1/ai/status?code=${"x".repeat(3000)}`).status, 414);
  assert.equal(head("POST", `/auth/callback?code=${"x".repeat(3000)}`).status, 414);
});
