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
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("paired bridge accepts rebuilt current context and isolates async result by actor", async () => {
  const { service, catalog, context } = fixture();
  let finish;
  let calls = 0;
  const connectionAdapter = { status: () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "synthetic", label: "Demo" } }),
    start: async () => "https://auth.openai.com/example", completeCallback: async () => {}, disconnect: async () => ({ revocationConfirmed: true }), dispose() {} };
  const insightsAdapter = { listModels: async () => [{ slug: "synthetic", displayName: "Synthetic" }],
    createInsight: () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); }, cancel() {}, dispose() {} };
  const ai = createChatGPTRuntime({ service, connectionAdapter, insightsAdapter });
  const handle = createRequestHandler({ service, config, ai });
  const input = { operationId: "op-one", model: "synthetic", context, articleText: "Public synthetic article.",
    allowWebResearch: true, expected: catalog.version };
  const authorized = { origin: ORIGIN, "x-demo-actor": "demo-alex" };
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/status", null, { origin: ORIGIN }))), connectionAdapter.status());
  assert.deepEqual(body(await handle(request("GET", "/v1/ai/models", null, { origin: ORIGIN }))),
    { models: [{ slug: "synthetic", displayName: "Synthetic" }] });
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights", input, authorized))), { operationId: "op-one", state: "running" });
  assert.equal(calls, 1);
  assert.equal((await handle(request("POST", "/v1/ai/insights", input, authorized))).status, 409);
  assert.equal((await handle(request("POST", "/v1/ai/insights/result", { operationId: "op-one" }, { ...authorized, "x-demo-actor": "demo-blair" }))).status, 403);
  finish({ body: "A useful finding.", citations: [], model: "synthetic" });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights/result", { operationId: "op-one" }, authorized))),
    { operationId: "op-one", state: "completed", result: { body: "A useful finding.", citations: [], model: "synthetic" } });
  assert.deepEqual(body(await handle(request("POST", "/v1/ai/insights/cancel", { operationId: "op-one" }, authorized))), { cancelled: true });
  assert.equal(body(await handle(request("POST", "/v1/ai/insights/result", { operationId: "op-one" }, authorized))).state, "failed");
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

test("explicit provider transport performs no network request on startup or shutdown", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "discussion-chatgpt-dormant-"));
  try {
    let calls = 0;
    const application = openDormantLocalApplication({ config: { host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN },
      databasePath: path.join(dir, "demo.sqlite"), ...deterministicDependencies(),
      chatgptFetchImpl: async () => { calls += 1; throw new Error("Unexpected network request"); } });
    assert.equal(calls, 0);
    assert.equal(existsSync(path.join(dir, "chatgpt-registration.json")), true);
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
  assert.equal((await handle({ method: "GET", url: "/auth/callback?code=x", headers: { host: config.hostHeader, origin: "https://evil.example" }, body: null })).status, 400);
  assert.equal((await handle({ method: "GET", url: "/v1/ai/status", headers: { host: config.hostHeader }, body: null })).status, 401);
  assert.equal((await handle({ method: "GET", url: `/v1/ai/status?${"x".repeat(3000)}`, headers: { host: config.hostHeader }, body: null })).status, 400);
  const head = (method, url) => inspectRequestHead({ method, url, rawHeaders: ["Host", config.hostHeader] });
  assert.equal(head("GET", `/auth/callback?code=${"x".repeat(3000)}`).status, undefined);
  assert.equal(head("GET", `/v1/ai/status?code=${"x".repeat(3000)}`).status, 414);
  assert.equal(head("POST", `/auth/callback?code=${"x".repeat(3000)}`).status, 414);
});
