import assert from "node:assert/strict";
import test from "node:test";
import { createLocalAiClient } from "../browser/core/local-ai-client.js";

function response(path, value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}
function client(fetchImpl) { return createLocalAiClient({ fetchImpl, getToken: async () => "a".repeat(64) }); }

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
    pending: false, account: { clientId: "client-a", label: "Owner" }, error: null });
  for (const value of [
    { connected: true, pending: false, account: null },
    { connected: true, planEnabled: "yes", pending: false, account: null },
    { connected: false, planEnabled: true, pending: false, account: null },
  ]) {
    await assert.rejects(client(async (url) => response(url, value)).status(), TypeError);
  }
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
