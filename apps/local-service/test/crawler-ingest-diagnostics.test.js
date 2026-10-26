import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createCrawlState } from "../src/crawler/crawl-state.js";
import { runCrawler } from "../src/crawler/crawl-runner.js";
import { representationDigest } from "../src/crawler/diversity.js";
import { CrawlerApiError, createLocalIngestClient, fixedIngestError, fixedIngestDetail } from "../src/crawler/local-ingest-client.js";
import { createProgressReporter } from "../src/ops/crawl-cli.js";

const TOKEN = "A".repeat(43);
const VERSION = { generation: "diagnostic-generation", revision: 3 };
const vector = Array(384).fill(0); vector[0] = 1;
const representation = { url: "https://fixture.alpha.org/article/PRIVATE_URL", title: "PRIVATE_TITLE",
  embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: vector },
  extractorVersion: "crawler-static-html-prefix/v1" };
const manifest = { schema: "murmingle-crawl-manifest/v1", rightsAcknowledged: true,
  buckets: [{ id: "fixture", rightsBasis: "Synthetic offline fixture permission.", maxPages: 20,
    allowedHosts: ["fixture.alpha.org"], allowedQueryKeys: [], seeds: [representation.url] }] };

function transport(descriptors) {
  const calls = [];
  return { calls, requestImpl(options, receive) {
    const outgoing = new EventEmitter();
    outgoing.destroyed = false;
    outgoing.destroy = () => { outgoing.destroyed = true; outgoing.emit("close"); };
    outgoing.end = body => {
      calls.push({ options, body: body ? Buffer.from(body) : null, outgoing });
      const descriptor = descriptors.shift();
      queueMicrotask(() => {
        if (descriptor === "silence") return;
        if (descriptor === "request-close") { outgoing.emit("close"); return; }
        const incoming = new PassThrough();
        incoming.statusCode = descriptor.status ?? 200;
        incoming.headers = { "content-type": "application/json", ...descriptor.headers };
        if (descriptor.complete !== undefined) incoming.complete = descriptor.complete;
        receive(incoming);
        if (descriptor.event) { incoming.write("{\"private\":"); incoming.emit(descriptor.event); return; }
        if (descriptor.incomplete) { incoming.write("{\"private\":"); return; }
        incoming.end(JSON.stringify(descriptor.value));
      });
    };
    return outgoing;
  } };
}

test("fixed ingest diagnostics never forward arbitrary errors, fields, getters or content", () => {
  for (const error of [new Error("PRIVATE_TITLE"), { code: "capacity" }, new CrawlerApiError("PRIVATE_URL"),
    Object.defineProperty(new CrawlerApiError("capacity"), "code", { get() { throw new Error(TOKEN); } }),
    Object.defineProperty(new CrawlerApiError("capacity"), "code", { get() { return "capacity"; } })])
    assert.equal(fixedIngestError(error), "unknown");
  for (const code of ["capacity", "conflict", "unauthorized", "forbidden", "ambiguous", "invalid-response", "unavailable",
    "invalid-request", "request-capacity", "request-too-large"])
    assert.equal(fixedIngestError(new CrawlerApiError(code)), code);
  assert.equal(fixedIngestDetail(new CrawlerApiError('unavailable', 'status-cancelled:authority-expired')),
    'status-cancelled:authority-expired');
  for (const error of [{ detail: 'status-missing' }, new CrawlerApiError('unavailable', 'PRIVATE_SUBJECT'),
    Object.defineProperty(new CrawlerApiError('unavailable'), 'detail', { get() { throw new Error(TOKEN); } })])
    assert.equal(fixedIngestDetail(error), null);
});

for (const event of ["aborted", "close", "request-close"]) {
  test(`truncated ${event} promptly retries the exact operation and retains the generation fence`, async () => {
    const failed = event === "request-close" ? event : { event };
    const fixture = transport([failed, failed, { value: { version: { ...VERSION, generation: "changed" } } }]);
    const client = createLocalIngestClient({ token: TOKEN, timeoutMs: 1000, requestImpl: fixture.requestImpl });
    await assert.rejects(client.ingest(representation, "diagnostic-operation", VERSION), { code: "conflict" });
    assert.equal(fixture.calls.length, 3);
    assert.deepEqual(fixture.calls[0].body, fixture.calls[1].body);
    assert.equal(fixture.calls[2].options.path, "/v1/version");
    assert.equal(fixture.calls[0].outgoing.destroyed, true);
  });
}

test("a silent outgoing request is bounded by the unchanged request deadline", { timeout: 3000 }, async () => {
  const fixture = transport(["silence"]);
  const client = createLocalIngestClient({ token: TOKEN, timeoutMs: 1000, requestImpl: fixture.requestImpl });
  await assert.rejects(client.version(), { code: "ambiguous" });
  assert.equal(fixture.calls[0].outgoing.destroyed, true);
});

test("completed JSON with a mismatched declared length is ambiguous and cannot become accepted", async () => {
  const fixture = transport([{ headers: { "content-length": "10000" }, value: { version: VERSION } }]);
  await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl }).version(), { code: "ambiguous" });
});

test("response complete=false is ambiguous even when its JSON looks complete", async () => {
  const fixture = transport([{ complete: false, value: { version: VERSION } }]);
  await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl }).version(), { code: "ambiguous" });
});

test("an incomplete response that stays open is bounded by the unchanged deadline", { timeout: 3000 }, async () => {
  const fixture = transport([{ incomplete: true }]);
  await assert.rejects(createLocalIngestClient({ token: TOKEN, timeoutMs: 1000, requestImpl: fixture.requestImpl }).version(), { code: "ambiguous" });
  assert.equal(fixture.calls[0].outgoing.destroyed, true);
});

test("a synchronous response validation failure tears down the outgoing request without dispatching or leaking a timer", async () => {
  let destroyed = false, ended = false;
  const requestImpl = (options, receive) => {
    const incoming = new PassThrough();
    incoming.headers = { "content-type": "text/plain" };
    receive(incoming);
    const outgoing = new EventEmitter();
    outgoing.destroy = () => { destroyed = true; };
    outgoing.end = () => { ended = true; };
    return outgoing;
  };
  await assert.rejects(createLocalIngestClient({ token: TOKEN, timeoutMs: 1000, requestImpl }).version(), { code: "invalid-response" });
  assert.equal(destroyed, true);
  assert.equal(ended, false);
});

test("continuous transport ambiguity consumes only the existing five ingest attempts", async () => {
  const descriptors = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    descriptors.push("request-close");
    if (attempt % 2 === 1) descriptors.push({ value: { version: VERSION } });
  }
  const fixture = transport(descriptors);
  await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl }).ingest(representation,
    "bounded-operation", VERSION), { code: "conflict" });
  const ingests = fixture.calls.filter(call => call.options.path === "/v1/sources/ingest");
  assert.equal(ingests.length, 5);
  for (const call of ingests) assert.deepEqual(call.body, ingests[0].body);
  assert.equal(descriptors.length, 0);
});

test("HTTP capacity distinguishes only the exact known request-too-large envelope", async () => {
  for (const [value, code] of [[{ error: "request-too-large" }, "request-too-large"], [{ error: "capacity" }, "capacity"],
    [{ error: "PRIVATE_TITLE" }, "capacity"], [{ error: "request-too-large", private: TOKEN }, "capacity"]]) {
    const fixture = transport([{ status: 413, value }]);
    await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl }).version(), { code });
  }
});

test("failed ingestion emits an immediate fixed diagnostic and retains staging across a deliberate restart", async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "crawler-diagnostic-"));
  const filename = path.join(directory, "synthetic.sqlite");
  let state = createCrawlState({ filename });
  t.after(() => { try { state.close(); } catch {} rmSync(directory, { recursive: true, force: true }); });
  state.bindGeneration(VERSION.generation);
  state.enqueue({ url: representation.url, bucket: "fixture", depth: 0, priority: 0 });
  const row = state.next({ maxDepth: 0, perHost: 20 });
  const contentDigest = createHash("sha256").update("synthetic").digest("hex");
  state.stage({ urlDigest: row.urlDigest, title: representation.title, vector, extractorVersion: representation.extractorVersion,
    representationDigest: representationDigest({ url: representation.url, title: representation.title, vector,
      extractorVersion: representation.extractorVersion }), contentDigest, simhash: "0000000000000000", links: [] });
  const staged = state.listStaged(20);
  const events = [], output = [];
  const reporter = createProgressReporter({ write: text => output.push(text), schedule: () => null, cancel() {} });
  t.after(() => reporter.close());
  let ingests = 0;
  const options = { manifest, apply: true, maxPages: 1,
    fetchPublic: async () => { throw new Error("Must not fetch after failed ingest"); },
    embedder: { embed() { throw new Error("Must not embed"); } } };
  for (const [error, code] of [[new CrawlerApiError("capacity"), "capacity"], [new Error(TOKEN), "unknown"]]) {
    const result = await runCrawler({ ...options, state,
      client: { knownSourceUrls: async () => ({ version: VERSION, urls: [] }), ingest: async () => { ingests++; throw error; } },
      onProgress: value => { events.push(value); reporter.onProgress(value); } });
    assert.equal(result.reason, "ingest-unavailable");
    assert.equal(result.ingestError, code);
    assert.deepEqual(state.listStaged(20), staged);
    assert.ok(output.includes(`Crawler ingest failed: ${code}\n`));
    state.close(); state = createCrawlState({ filename });
    assert.deepEqual(state.listStaged(20), staged);
  }
  assert.equal(ingests, 2);
  const recovered = await runCrawler({ ...options, state,
    client: { knownSourceUrls: async () => ({ version: VERSION, urls: [] }),
      ingest: async () => ({ sourceId: "source-diagnostic", topicId: "topic-diagnostic", version: { ...VERSION, revision: 4 } }) } });
  assert.equal(recovered.ingestedThisRun, 1);
  assert.equal(Object.hasOwn(recovered, "ingestError"), false);
  assert.equal(state.listStaged(20).length, 0);
  const diagnostic = JSON.stringify({ events, output, recovered });
  for (const content of [TOKEN, representation.url, representation.title]) assert.equal(diagnostic.includes(content), false);
});

test("progress reporter rejects arbitrary failure strings and non-string payloads", () => {
  const output = [];
  const reporter = createProgressReporter({ write: value => output.push(value), schedule: () => null, cancel() {} });
  for (const ingestError of [TOKEN, { toString() { throw new Error("private"); } }])
    reporter.onProgress({ event: "ingest-failed", phase: "applying", attemptedThisRun: 1, stagedThisRun: 1,
      ingestedThisRun: 0, ingestError });
  reporter.close();
  assert.equal(output.join("").includes(TOKEN), false);
  assert.equal(output.filter(value => value === "Crawler ingest failed: unknown\n").length, 2);
});
