import assert from "node:assert/strict";
import test from "node:test";
import { createLocalAiClient, ModelListFailure } from "../browser/core/local-ai-client.js";

function response(path, value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}
function client(fetchImpl) { return createLocalAiClient({ fetchImpl, getToken: async () => "a".repeat(64) }); }

test("Insight client accepts explicit web-research opt-out without changing the request", async () => {
  let body;
  const value = client(async (_url, options) => {
    body = JSON.parse(options.body);
    return response(_url, { operationId: "op-a", state: "running" });
  });
  const request = { operationId: "op-a", model: "model-a", articleText: "Public synthetic text.",
    allowWebResearch: false };
  assert.deepEqual(await value.start(request, "demo-alex"), { operationId: "op-a", state: "running" });
  assert.equal(body.allowWebResearch, false);
});

test("fixed loopback endpoint and guarded request options", async () => {
  let request;
  const value = client(async (url, options) => {
    request = { url, options };
    return response(url, { connected: false, planEnabled: false, pending: false, account: null });
  });
  assert.equal((await value.status()).connected, false);
  assert.equal(request.url, "http://127.0.0.1:4174/v1/ai/status");
  assert.equal(request.options.credentials, "omit"); assert.equal(request.options.redirect, "error");
  assert.equal(request.options.referrerPolicy, "no-referrer");
  assert.equal(request.options.cache, "no-store");
});

test("status requires a consistent plan grant and preserves a connected account without it", async () => {
  const verifiedNoPlan = client(async (url) => response(url, { connected: true, planEnabled: false,
    pending: false, account: { clientId: "client-a", label: "Owner" } }));
  assert.deepEqual(await verifiedNoPlan.status(), { connected: true, planEnabled: false,
    pending: false, account: { clientId: "client-a", label: "Owner" }, error: null,
    failureStage: null, failureSubstage: null });
  for (const value of [
    { connected: true, pending: false, account: null },
    { connected: true, planEnabled: "yes", pending: false, account: null },
    { connected: false, planEnabled: true, pending: false, account: null },
  ]) {
    await assert.rejects(client(async (url) => response(url, value)).status(), TypeError);
  }
});

test("authenticated status projects only fixed failure stages with the generic error", async () => {
  const stages = ["callback-invalid", "callback-expired", "callback-busy", "token-exchange-rejected",
    "token-exchange-failed", "token-response-invalid", "discovery-failed",
    "identity-verification-failed", "registration-failed"];
  const base = { connected: false, planEnabled: false, pending: false, account: null };
  for (const failureStage of stages) {
    const projected = await client(async (url) => response(url,
      { ...base, error: "connection-failed", failureStage })).status();
    assert.equal(projected.error, "connection-failed");
    assert.equal(projected.failureStage, failureStage);
  }
  for (const value of [
    { ...base, error: "connection-failed", failureStage: "provider-secret-detail" },
    { ...base, failureStage: "callback-expired" },
    { ...base, error: "connection-failed", failureStage: null },
    { ...base, error: "connection-failed", failureStage: { code: "callback-expired" } },
  ]) await assert.rejects(client(async (url) => response(url, value)).status(), TypeError);
  assert.equal((await client(async (url) => response(url, { ...base, error: "connection-failed" })).status()).failureStage, null);
});

test("status projects only six fixed identity substages under the exact failure stage", async () => {
  const base = { connected: false, planEnabled: false, pending: false, account: null };
  const substages = ["jwks-request-failed", "jwks-invalid", "token-header-invalid",
    "matching-key-invalid", "signature-invalid", "claims-invalid"];
  for (const failureSubstage of substages) {
    const projected = await client(async (url) => response(url, { ...base, error: "connection-failed",
      failureStage: "identity-verification-failed", failureSubstage })).status();
    assert.equal(projected.failureSubstage, failureSubstage);
  }
  for (const value of [
    { ...base, failureSubstage: "claims-invalid" },
    { ...base, error: "connection-failed", failureSubstage: "claims-invalid" },
    { ...base, error: "connection-failed", failureStage: "registration-failed", failureSubstage: "claims-invalid" },
    { ...base, error: "connection-failed", failureStage: "identity-verification-failed", failureSubstage: null },
    { ...base, error: "connection-failed", failureStage: "identity-verification-failed", failureSubstage: "raw-token-data" },
    { ...base, error: "connection-failed", failureStage: "identity-verification-failed", failureSubstage: { code: "claims-invalid" } },
  ]) await assert.rejects(client(async (url) => response(url, value)).status(), TypeError);
  assert.equal((await client(async (url) => response(url, { ...base, error: "connection-failed",
    failureStage: "identity-verification-failed" })).status()).failureSubstage, null);
});

test("authorization URL and citation URLs reject unsafe targets", async () => {
  const badAuth = client(async (url) => response(url, { authorizationUrl: "https://evil.example/authorize" }));
  await assert.rejects(badAuth.connect(), TypeError);
  const badCitation = client(async (url) => response(url, { operationId: "op-a", state: "completed", result: {
    body: "Finding", model: "model-a", citations: [{ startIndex: 0, endIndex: 7,
      url: "https://mail.example.org/inbox", title: "Inbox" }] } }));
  await assert.rejects(badCitation.result("op-a", "demo-alex"), TypeError);
});

test("mismatched operation and oversized body fail closed", async () => {
  const wrong = client(async (url) => response(url, { operationId: "op-b", state: "running" }));
  await assert.rejects(wrong.result("op-a", "demo-alex"), TypeError);
  const oversized = client(async () => new Response("x".repeat(70_000), {
    headers: { "Content-Type": "application/json" } }));
  await assert.rejects(oversized.status(), TypeError);
});

test("resumable insight lookup is actor-bound and accepts only bounded job metadata", async () => {
  let request;
  const job = { operationId: "op-a", state: "running", expected: { generation: "generation-a", revision: 2 },
    topicId: "topic-a", originSourceId: "source-a", rootId: null, replyToId: null, discussionId: null };
  const valid = client(async (url, options) => { request = { url, options }; return response(url, { job }); });
  assert.deepEqual(await valid.resumable("demo-alex"), job);
  assert.equal(request.url, "http://127.0.0.1:4174/v1/ai/insights/resumable");
  assert.equal(request.options.headers["X-Demo-Actor"], "demo-alex");
  assert.equal(await client(async (url) => response(url, { job: null })).resumable("demo-alex"), null);
  for (const candidate of [
    { ...job, state: "failed" }, { ...job, articleText: "Private page text" },
    { ...job, expected: { generation: "generation-a", revision: -1 } },
    { ...job, rootId: "root-a" }, { ...job, originSourceId: "source-a", replyToId: undefined },
  ]) await assert.rejects(client(async (url) => response(url, { job: candidate })).resumable("demo-alex"), TypeError);
});

test("failed insight result exposes only fixed research details", async () => {
  const details = ["response-redirect", "response-content-type", "response-content-json",
    "response-content-html", "response-content-text", "response-content-missing", "response-content-other", "response-stream",
    "response-too-large", "response-encoding", "response-event", "response-no-final",
    "response-empty-output", "response-no-message", "response-message-unfinished", "response-refusal",
    "response-no-text", "response-blank-text", "response-unsafe-text", "response-output-too-large", "response-incomplete",
    "response-output-empty", "response-search-only", "response-reasoning-only",
    "response-final-item-missing", "response-item-identity", "response-item-conflict",
    "response-item-prefix", "response-item-text", "response-stream-text-unfinalized",
    "response-failed", "response-http-400"];
  for (const detail of details) {
    const value = await client(async (url) => response(url,
      { operationId: "op-a", state: "failed", error: "invalid-response", detail })).result("op-a", "demo-alex");
    assert.equal(value.detail, detail);
  }
  for (const value of [
    { operationId: "op-a", state: "failed", error: "invalid-response", detail: "private provider text" },
    { operationId: "op-a", state: "failed", error: "invalid-response", detail: { code: "response-event" } },
    { operationId: "op-a", state: "running", detail: "response-event" },
    { operationId: "op-a", state: "completed", detail: "response-event" },
  ]) await assert.rejects(client(async (url) => response(url, value)).result("op-a", "demo-alex"), TypeError);
});

test("model list accepts only exact success or fixed failure responses", async () => {
  const models = [{ slug: "model-a", displayName: "Model A" }];
  assert.deepEqual(await client(async (url) => response(url, { models })).models(), models);
  for (const failure of ["access-rejected", "rate-limited", "timed-out", "invalid-response",
    "provider-unavailable", "busy"]) {
    await assert.rejects(client(async (url) => response(url, { failure })).models(),
      (error) => error instanceof ModelListFailure && error.failure === failure &&
        !error.message.includes(failure));
  }
  for (const detail of ["catalog-redirect", "catalog-content-type", "catalog-body", "catalog-too-large",
    "catalog-stream", "catalog-encoding", "catalog-json", "catalog-shape", "catalog-entry"]) {
    await assert.rejects(client(async (url) => response(url, { failure: "invalid-response", detail })).models(),
      (error) => error instanceof ModelListFailure && error.failure === "invalid-response" && error.detail === detail);
  }
  for (const value of [
    { failure: "access-rejected", detail: "catalog-entry" },
    { failure: "invalid-response", detail: "private response" },
    { failure: "access-rejected", models: [] },
    { failure: "unexpected" }, { failure: null }, { failure: { code: "busy" } },
    { models, detail: "private response" },
  ]) await assert.rejects(client(async (url) => response(url, value)).models(), TypeError);
});

test("diagnostics require paired fixed-code events and discard provider data", async () => {
  const events = [{ kind: "models", outcome: "success" },
    { kind: "models", outcome: "invalid-response", detail: "catalog-entry" },
    { kind: "insight", outcome: "invalid-response", detail: "response-no-final" },
    { kind: "insight", outcome: "invalid-response", detail: "response-content-json" }];
  let path;
  const valid = client(async (url) => { path = url; return response(url, { events }); });
  assert.deepEqual(await valid.diagnostics(), { events });
  assert.equal(path, "http://127.0.0.1:4174/v1/ai/diagnostics");
  for (const value of [
    { events: [{ kind: "models", outcome: "success", detail: "catalog-entry" }] },
    { events: [{ kind: "models", outcome: "invalid-response", detail: "provider-secret" }] },
    { events: [{ kind: "insight", outcome: "invalid-response", detail: "provider-secret" }] },
    { events: [{ kind: "insight", outcome: "provider-secret" }] },
    { events: [{ kind: "login", outcome: "success" }] },
    { events: Array.from({ length: 21 }, () => events[0]) },
    { events, account: "private" },
  ]) await assert.rejects(client(async (url) => response(url, value)).diagnostics(), TypeError);
});

test("model listing has its own 30-second deadline", async () => {
  const realSetTimeout = globalThis.setTimeout;
  const delays = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    delays.push(delay);
    return realSetTimeout(callback, delay, ...args);
  };
  try {
    const value = createLocalAiClient({ fetchImpl: async (url) => response(url,
      url.endsWith("/models") ? { models: [] } : { connected: false, planEnabled: false, pending: false, account: null }),
    getToken: async () => "a".repeat(64), timeoutMs: 1234 });
    await value.status(); await value.models();
    assert.deepEqual(delays, [1234, 30000]);
  } finally { globalThis.setTimeout = realSetTimeout; }
});
