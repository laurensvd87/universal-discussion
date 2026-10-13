import assert from "node:assert/strict";
import test from "node:test";
import { demoService } from "../../../apps/local-service/test/helpers.js";
import { readEnrichment, readEnrichmentRequest } from "../browser/core/local-service-contract.js";
import { createLocalServiceClient } from "../browser/core/local-service-client.js";

const request = { sourceId: "harbor-overview", topicId: "harbor-s2", includeAlternate: false };
const TOKEN = "synthetic-test-capability-for-client-only";
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() { return JSON.parse(JSON.stringify(demoService().enrichment(request))); }

test("coherent enrichment projects core, related and prior DTOs without mutating input", () => {
  const value = fixture(); const original = structuredClone(value);
  assert.deepEqual(readEnrichment(value, request), value); assert.deepEqual(value, original);
  assert.deepEqual(readEnrichmentRequest(request), request);
});

for (const [name, alter] of [
  ["extra top field", v => { v.raw = "not allowed"; }],
  ["cross-version core", v => { v.discussion.version.revision++; }],
  ["cross-version related", v => { v.related.version.revision++; }],
  ["cross-version prior", v => { v.priorDiscussions.version.revision++; }],
  ["wrong source assignment", v => { v.catalog.sources.find(s => s.id === request.sourceId).topicId = "topic-foreign"; }],
  ["wrong core title", v => { v.discussion.topic.title = "Foreign title"; }],
  ["wrong prior source", v => { v.priorDiscussions.sourceId = "foreign-source"; }],
  ["wrong prior current topic", v => { v.priorDiscussions.currentTopicId = "foreign-topic"; }],
  ["unexplained absent related", v => { v.related = null; }],
  ["body and related error", v => { v.errors.related = "capacity"; }],
  ["raw error details", v => { v.errors.related = "secret: raw provider detail"; v.related = null; }],
  ["extra error field", v => { v.errors.raw = "no"; }],
  ["unrequested alternate error", v => { v.errors.alternate = "unavailable"; }],
  ["unrequested alternate body", v => { v.alternateDiscussion = {}; }],
]) test(`enrichment rejects ${name}`, () => {
  const value = fixture(); alter(value); assert.throws(() => readEnrichment(value, request));
});

test("optional section failures preserve strictly validated canonical bodies", () => {
  const value = fixture(); value.related = null; value.priorDiscussions = null;
  value.errors.related = "capacity"; value.errors.prior = "unavailable";
  const result = readEnrichment(value, request); assert.equal(result.discussion.topic.id, request.topicId);
  assert.equal(result.related, null); assert.equal(result.priorDiscussions, null);
  const alternate = { ...request, includeAlternate: true };
  value.errors.alternate = "unavailable"; assert.equal(readEnrichment(value, alternate).alternateDiscussion, null);
});

test("related Source metadata must exactly match the coherent catalog", () => {
  const value = fixture(); assert.ok(value.related.results.length > 0);
  for (const field of ["url", "title", "topicId"]) {
    const altered = structuredClone(value);
    altered.related.results[0][field] = field === "url" ? "https://example.org/foreign" : "foreign-metadata";
    assert.throws(() => readEnrichment(altered, request));
  }
  const altered = structuredClone(value);
  altered.catalog.sources = altered.catalog.sources.filter(s => s.id !== altered.related.results[0].id);
  assert.throws(() => readEnrichment(altered, request));
});

test("enrichment input getters and extra fields never trigger HTTP", async () => {
  let calls = 0;
  const client = createLocalServiceClient({ getToken: async () => TOKEN, fetchImpl: async () => { calls++; return json(fixture()); } });
  const getter = { ...request }; Object.defineProperty(getter, "sourceId", { enumerable: true, get() { assert.fail("Getter must not execute"); } });
  for (const value of [getter, { ...request, timeout: 999_999 }, { ...request, sourceId: null }, { ...request, topicId: null },
    { ...request, includeAlternate: "true" }]) await assert.rejects(client.enrichment(value), { code: "invalid-request" });
  assert.equal(calls, 0);
});

test("enrichment alone has thirty seconds and returns frozen strict DTO after eleven", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolve, calls = 0, signal;
  const client = createLocalServiceClient({ getToken: async () => TOKEN, fetchImpl: async (url, options) => {
    calls++; signal = options.signal; assert.equal(url, "http://127.0.0.1:4174/v1/sources/enrichment");
    assert.deepEqual(JSON.parse(options.body), request); assert.equal(options.redirect, "error");
    return new Promise(done => { resolve = done; });
  } });
  const pending = client.enrichment(request); await flush(); t.mock.timers.tick(11_000); await flush();
  assert.equal(signal.aborted, false); resolve(json(fixture())); const result = await pending;
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.discussion), true); assert.equal(calls, 1);
});

test("enrichment expires at thirty seconds without retry or credential clearing", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, clears = 0, signal;
  const client = createLocalServiceClient({ getToken: async () => TOKEN, onUnauthorized: async () => { clears++; },
    fetchImpl: async (_url, options) => { calls++; signal = options.signal; return new Promise(() => {}); } });
  const pending = client.enrichment(request); const rejection = assert.rejects(pending, { code: "unavailable" }); await flush();
  t.mock.timers.tick(29_999); await flush(); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); await rejection; assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(clears, 0);
});

test("core context keeps five-second timeout, and aborted enrichment never dispatches", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); let calls = 0;
  const client = createLocalServiceClient({ getToken: async () => TOKEN,
    fetchImpl: async () => { calls++; return new Promise(() => {}); } });
  const core = client.catalogContext({ sourceId: request.sourceId, topicId: request.topicId });
  const rejected = assert.rejects(core, { code: "unavailable" }); await flush(); t.mock.timers.tick(5_000); await rejected;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.enrichment(request, { signal: controller.signal }), { code: "unavailable" }); assert.equal(calls, 1);
});
