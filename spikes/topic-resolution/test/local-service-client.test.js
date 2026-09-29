import assert from "node:assert/strict";
import test from "node:test";
import { createLocalServiceClient, LocalServiceClientError } from "../browser/core/local-service-client.js";
import { createRequestHandler } from "../../../apps/local-service/src/http/request-handler.js";
import { demoService } from "../../../apps/local-service/test/helpers.js";

const TOKEN = "synthetic-test-capability-for-client-only";
const VERSION = { generation: "generation-test", revision: 0 };
const HEALTH = { protocol: "local-service/v1", capability: "paired-demo" };
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}
function client(fetchImpl, extras = {}) { return createLocalServiceClient({ fetchImpl, getToken: async () => TOKEN, ...extras }); }
function code(expected) {
  return (error) => error instanceof LocalServiceClientError && error.code === expected &&
    error.message === "Local service request failed" && !error.message.includes(TOKEN);
}
function serviceClient() {
  const service = demoService();
  const handle = createRequestHandler({ service, config: { hostHeader: "127.0.0.1:4174", origin: "chrome-extension://synthetic", capability: TOKEN } });
  const requests = [];
  const api = client(async (url, options) => {
    requests.push({ url, options });
    const response = await handle({ url: new URL(url).pathname, method: options.method,
      headers: { host: "127.0.0.1:4174", ...options.headers }, body: options.body ?? null });
    return new Response(response.body, { status: response.status, headers: response.headers });
  });
  return { api, service, requests };
}

test("thin client interoperates with actual in-process /v1 human discussion lifecycle", async () => {
  const { api, requests } = serviceClient();
  assert.deepEqual(await api.health(), HEALTH);
  const catalog = await api.catalog();
  assert.equal(catalog.sources.length, 8);
  assert.deepEqual(catalog.sources.filter((source) => source.provenance === "project-created-reserved-domain-bridge/1")
    .map((source) => source.id), ["reserved-example-com", "reserved-example-org"]);
  assert.equal(catalog.actors.length, 2);
  assert.equal(Object.isFrozen(catalog.sources[0]), true);
  assert.equal("embedding" in catalog.sources[0], false);
  const related = await api.related("harbor-overview", 3);
  assert.equal(related.results.length, 3);
  assert.equal("similarity" in related.results[0], false);
  const created = await api.command(catalog.version, { type: "create-topic", title: "Synthetic topic", kind: "general" }, "demo-alex");
  let view = await api.discussion(created.result.topicId);
  const root = await api.command(view.version, { type: "create-root", topicId: view.topic.id, body: "<script>synthetic</script>\nSecond paragraph\tTabbed" }, "demo-alex");
  view = await api.discussion(view.topic.id);
  assert.equal(view.roots[0].body, "<script>synthetic</script>\nSecond paragraph\tTabbed");
  const reply = await api.command(view.version, { type: "reply", discussionId: view.discussionId,
    rootId: root.result.contributionId, replyToId: null, body: "Synthetic reply" }, "demo-blair");
  view = await api.discussion(view.topic.id);
  await api.command(view.version, { type: "edit", contributionId: root.result.contributionId, body: "Edited demo" }, "demo-alex");
  view = await api.discussion(view.topic.id);
  assert.equal(view.roots[0].edited, true);
  assert.equal(view.roots[0].replies[0].id, reply.result.contributionId);
  await api.command(view.version, { type: "withdraw", contributionId: root.result.contributionId }, "demo-alex");
  view = await api.discussion(view.topic.id);
  assert.equal(view.roots[0].state, "deleted");
  assert.equal("body" in view.roots[0], false);
  assert.equal("authorId" in view.roots[0], false);
  assert.equal(view.roots[0].replies[0].body, "Synthetic reply");
  const reset = await api.reset(view.version, "RESET DEMO STATE");
  assert.notEqual(reset.version.generation, view.version.generation);
  assert.equal(reset.version.revision, 0);
  for (const { url, options } of requests) {
    assert.equal(new URL(url).origin, "http://127.0.0.1:4174");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal("Cookie" in options.headers, false);
  }
});

test("approved ingestion crosses the strict client boundary without raw text or vector DTO leaks", async () => {
  const { api, requests } = serviceClient();
  const catalog = await api.catalog();
  const embedding = { modelId: "e5-small-q8-browser-main-prefix-v1", values: Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0) };
  const payload = { expected: catalog.version, operationId: "browser-ingest-a", url: "https://example.com/public-article",
    title: "Synthetic article", embedding, extractorVersion: "main-text-prefix/v1" };
  const first = await api.ingest(payload);
  const next = await api.catalog();
  assert.equal(first.assignment, "provisional");
  assert.equal(next.sources.find(s => s.id === first.sourceId).topicId, first.topicId);
  assert.equal(JSON.stringify(next).includes("values"), false);
  assert.deepEqual(await api.ingest(payload), first);
  assert.equal((await api.related(first.sourceId)).model.status, "experimental-local");
  const before = requests.length;
  for (const bad of [{ ...payload, text: "Raw text must not cross the boundary" },
    { ...payload, url: "https://example.com/?token=synthetic-secret" },
    { ...payload, embedding: { ...embedding, values: Array(384).fill(0) } },
    { ...payload, embedding: { ...embedding, modelId: "other-model" } }]) {
    await assert.rejects(api.ingest(bad), code("invalid-request"));
  }
  assert.equal(requests.length, before);
  const corrected = await api.command(next.version, { type: "correct-source", sourceId: first.sourceId, topicId: null }, "demo-alex");
  assert.equal(corrected.result.assignment, "confirmed");
  const forgotten = await api.command(corrected.version, { type: "forget-source", sourceId: first.sourceId }, "demo-alex");
  assert.equal(forgotten.result.sourceId, first.sourceId);
  const removed = await api.command(forgotten.version, { type: "delete-learned-topic", topicId: corrected.result.topicId,
    confirmation: "DELETE TOPIC AND DISCUSSION" }, "demo-alex");
  assert.equal(removed.result.topicId, corrected.result.topicId);
  const cleared = await api.command(removed.version, { type: "clear-learned-data", confirmation: "CLEAR LEARNED DATA" }, "demo-alex");
  assert.ok(Array.isArray(cleared.result.deletedTopicIds));
});

test("fallback extractor crosses the exact HTTP allowlist and unknown versions send no request", async () => {
  const { api, requests } = serviceClient();
  const embedding = { modelId: "e5-small-q8-browser-main-prefix-v1", values: Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0) };
  const first = await api.ingest({ expected: (await api.catalog()).version, operationId: "semantic-region",
    url: "https://example.com/semantic", title: "Synthetic legacy region", embedding, extractorVersion: "main-text-prefix/v1" });
  const payload = { expected: (await api.catalog()).version, operationId: "generic-region",
    url: "https://example.org/generic", title: "Synthetic generic region", embedding, extractorVersion: "article-container-prefix/v1" };
  const fallback = await api.ingest(payload);
  assert.equal(fallback.topicId, first.topicId);
  assert.equal(JSON.parse(requests.at(-1).options.body).extractorVersion, "article-container-prefix/v1");
  const count = requests.length;
  for (const extractorVersion of ["article-container-prefix/v2", "whole-body/v1", null, {}]) {
    await assert.rejects(api.ingest({ ...payload, extractorVersion }), code("invalid-request"));
  }
  await assert.rejects(api.ingest({ ...payload, text: "Raw fallback text" }), code("invalid-request"));
  assert.equal(requests.length, count);
});

test("strict command/input allowlist prevents context, vectors, role and raw URL transfer", async () => {
  let calls = 0;
  const api = client(async () => { calls++; return json(HEALTH); });
  for (const command of [
    { type: "create-root", topicId: "harbor-s2", body: "demo", url: "https://private.invalid" },
    { type: "create-root", topicId: "harbor-s2", body: "demo", authorId: "demo-blair" },
    { type: "create-topic", title: "Demo", kind: "general", embedding: [1] },
    { type: "agent-root", topicId: "harbor-s2", body: "demo" },
    { type: "reply", discussionId: "discussion", rootId: "root", body: "demo" },
    { type: "edit", contributionId: "root", body: "demo", revisions: [] },
    { type: "withdraw", contributionId: "root", provider: "demo" },
  ]) await assert.rejects(api.command(VERSION, command, "demo-alex"), code("invalid-request"));
  await assert.rejects(api.command(VERSION, { type: "withdraw", contributionId: "root" }, "admin"), code("invalid-request"));
  await assert.rejects(api.command({ ...VERSION, url: "private" }, { type: "withdraw", contributionId: "root" }, "demo-alex"), code("invalid-request"));
  await assert.rejects(api.related("https://private.invalid"), code("invalid-request"));
  await assert.rejects(api.discussion("../health"), code("invalid-request"));
  await assert.rejects(api.related("harbor-overview", 101), code("invalid-request"));
  await assert.rejects(api.reset(VERSION, "yes"), code("invalid-request"));
  assert.equal(calls, 0);
});

test("accessors and symbols are rejected without invoking untrusted input", async () => {
  let invoked = false;
  const command = { type: "create-root", topicId: "topic", get body() { invoked = true; return "demo"; } };
  const api = client(async () => json(HEALTH));
  await assert.rejects(api.command(VERSION, command, "demo-alex"), code("invalid-request"));
  await assert.rejects(api.command(VERSION, { type: "withdraw", contributionId: "root", [Symbol("hidden")]: 1 }, "demo-alex"), code("invalid-request"));
  assert.equal(invoked, false);
});

test("service errors are mapped once without retry or sensitive response echoes", async () => {
  for (const [status, label] of [[400, "invalid-request"], [401, "unauthorized"], [403, "unavailable"], [404, "unavailable"], [409, "conflict"], [413, "capacity"], [500, "unavailable"]]) {
    let calls = 0;
    const api = client(async () => { calls++; return json({ error: TOKEN, body: "private demo" }, status); });
    await assert.rejects(api.command(VERSION, { type: "withdraw", contributionId: "root" }, "demo-alex"), code(label));
    assert.equal(calls, 1);
  }
  await assert.rejects(client(async () => { throw new Error(TOKEN); }).health(), code("unavailable"));
  let called = false;
  await assert.rejects(client(async () => { called = true; }, { getToken: async () => "invalid\r\nheader" }).health(), code("unauthorized"));
  assert.equal(called, false);
});

test("redirects, mismatched endpoints, content types, encodings and oversized bodies fail closed", async () => {
  const cases = [
    () => ({ ...json(HEALTH), redirected: true }),
    () => ({ ...json(HEALTH), url: "http://127.0.0.1:4175/v1/health" }),
    () => json(HEALTH, 200, { "content-type": "text/html" }),
    () => json(HEALTH, 200, { "content-length": "1048577" }),
    () => json(HEALTH, 200, { "content-length": "nonsense" }),
    () => new Response(" ".repeat(1048577), { headers: { "content-type": "application/json" } }),
    () => new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    () => new Response("{bad", { headers: { "content-type": "application/json" } }),
    () => json({ ...HEALTH, vectors: [1] }),
  ];
  for (const response of cases) await assert.rejects(client(async () => response()).health(), code("invalid-response"));
});

test("timeout and cancellation settle even if transport or stream ignores abort", async () => {
  let options;
  const never = new Promise(() => {});
  await assert.rejects(client(async (_, input) => { options = input; return never; }, { timeoutMs: 10 }).health(), code("unavailable"));
  assert.equal(options.signal.aborted, true);
  let streamCanceled = false;
  const stream = new ReadableStream({ pull() { return never; }, cancel() { streamCanceled = true; } });
  await assert.rejects(client(async () => new Response(stream, { headers: { "content-type": "application/json" } }), { timeoutMs: 10 }).health(), code("unavailable"));
  assert.equal(streamCanceled, true);
  const abort = new AbortController();
  const pending = client(async () => never).health({ signal: abort.signal });
  abort.abort();
  await assert.rejects(pending, code("unavailable"));
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  let called = false;
  await assert.rejects(client(async () => { called = true; }).health({ signal: alreadyAborted.signal }), code("unavailable"));
  assert.equal(called, false);
});

test("early response rejection cancels unconsumed bodies and aborts the transport", async () => {
  for (const kind of ["redirect", "url", "type", "length"]) {
    let canceled = false;
    let options;
    const stream = new ReadableStream({ cancel() { canceled = true; } });
    const response = new Response(stream, { headers: { "content-type": kind === "type" ? "text/html" : "application/json",
      ...(kind === "length" ? { "content-length": "1048577" } : {}) } });
    if (kind === "redirect") Object.defineProperty(response, "redirected", { value: true });
    if (kind === "url") Object.defineProperty(response, "url", { value: "http://127.0.0.1:4175/v1/health" });
    await assert.rejects(client(async (_, input) => { options = input; return response; }).health(), code("invalid-response"));
    assert.equal(canceled, true);
    assert.equal(options.signal.aborted, true);
  }
});

test("catalog, related, discussion and mutation DTOs reject extra fields and malformed topology", async () => {
  const { service } = serviceClient();
  const catalog = structuredClone(service.catalog());
  for (const mutate of [
    (value) => { value.sources[0].embedding = [1]; },
    (value) => { value.sources[0].url = "https://private.invalid"; },
    (value) => { value.sources[0].topicId = "missing"; },
    (value) => { value.actors[0].type = "agent"; },
    (value) => { value.topics.push(value.topics[0]); },
    (value) => { value.model.status = "learned"; },
  ]) {
    const value = structuredClone(catalog); mutate(value);
    await assert.rejects(client(async () => json(value)).catalog(), code("invalid-response"));
  }
  const related = structuredClone(service.related("harbor-overview", 3));
  related.results[0].similarity = 1;
  await assert.rejects(client(async () => json(related)).related("harbor-overview", 3), code("invalid-response"));
  const view = structuredClone(service.discussion("harbor-s2"));
  view.roots.push({ id: "root", rootId: null, replyToId: null, state: "deleted", label: "Deleted", body: "old", replies: [] });
  await assert.rejects(client(async () => json(view)).discussion("harbor-s2"), code("invalid-response"));
  delete view.roots[0].body;
  view.roots[0].replies.push({ id: "reply", rootId: "other-root", replyToId: null, state: "deleted", label: "Deleted" });
  await assert.rejects(client(async () => json(view)).discussion("harbor-s2"), code("invalid-response"));
  await assert.rejects(client(async () => json({ version: VERSION, result: { contributionId: "root" } }))
    .command(VERSION, { type: "withdraw", contributionId: "root" }, "demo-alex"), code("invalid-response"));
  await assert.rejects(client(async () => json({ version: VERSION })).reset(VERSION, "RESET DEMO STATE"), code("invalid-response"));
});
