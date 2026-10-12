import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { BROWSER_MODEL_ID } from "../src/domain/learned-sources.js";
import { ServiceError } from "../src/domain/errors.js";
import { createTransportHandler, TRANSPORT_LIMITS } from "../src/http/loopback-listener.js";
import { createRequestHandler, MAX_BODY_BYTES } from "../src/http/request-handler.js";
import { deterministicDependencies } from "./helpers.js";

const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`, capability: "synthetic-ingestion-capability" };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function setup(t, { delay = 0, capacity = false, accounts = null, wrap = handle => handle } = {}) {
  let now = 0;
  const timers = [];
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const timer = { callback, due: now + delay, cancelled: false, unref() {} }; timers.push(timer); return timer;
  });
  t.mock.method(globalThis, "clearTimeout", timer => { timer.cancelled = true; });
  const time = { elapse(ms) { now += ms; }, advance(ms) {
    now += ms;
    for (const timer of timers) if (!timer.cancelled && timer.due <= now) { timer.cancelled = true; timer.callback(); }
  }, live() { return timers.filter(timer => !timer.cancelled).map(timer => timer.due); } };
  const initial = { schema: "demo-state/v3", generation: "synthetic-ingestion", revision: 0,
    topics: [], discussions: [], sources: [], sourceLinks: [], contributions: [] };
  const raw = createNormalizedSqliteRepository(":memory:", initial);
  t.after(() => raw.close());
  const repository = { ...raw, save(expected, next) {
    time.elapse(delay);
    if (capacity) throw new ServiceError("capacity", "Synthetic capacity reached");
    return raw.save(expected, next);
  } };
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(), sources: [],
    topicSeeds: [], ...deterministicDependencies() });
  let calls = 0;
  const handle = createRequestHandler({ config, accounts, accountWrites: accounts !== null,
    pairingVerifier: { verify: value => value === config.capability },
    service: { ...service, ingest(input) { calls++; return service.ingest(input); } } });
  let context;
  const transport = createTransportHandler((request, internal) => { context = internal; return wrap(handle)(request, internal); });
  function socket() {
    const value = Object.assign(new EventEmitter(), { destroyed: false, destroy() {
      if (this.destroyed) return; this.destroyed = true; this.emit("close");
    } });
    transport.bindSocket(value); return value;
  }
  function exchange({ method = "POST", url = "/v1/sources/ingest", headers = {}, connection = socket() } = {}) {
    const values = { Host: config.hostHeader, Origin: config.origin, Authorization: `Bearer ${config.capability}`,
      "Content-Type": "application/json", ...headers };
    const request = Object.assign(new EventEmitter(), { method, url, socket: connection, aborted: false,
      rawHeaders: Object.entries(values).filter(([, value]) => value !== null).flat(), resume() {} });
    const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { this.body = body; this.writableEnded = true; this.emit("close"); connection.destroy(); } });
    connection.once("close", () => { if (!response.writableEnded) { response.destroyed = true; response.emit("close"); } });
    transport(request, response);
    return { request, response, connection, send(body) { if (body !== null) request.emit("data", Buffer.from(body)); request.emit("end"); } };
  }
  const input = { expected: service.version(), operationId: "synthetic-ingestion-operation", url: "https://example.org/ingestion-deadline",
    title: "Synthetic ingestion deadline", embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] },
    extractorVersion: "crawler-static-html-prefix/v1" };
  return { service, handle, time, socket, exchange, input, get calls() { return calls; }, get context() { return context; } };
}

test("slow synchronous canonical ingestion delivers accepted receipt beyond five seconds; exact replay is revision stable", async t => {
  const f = setup(t, { delay: 6_000 });
  const first = f.exchange(); first.send(JSON.stringify(f.input)); await flush();
  assert.equal(first.response.status, 200);
  const accepted = JSON.parse(first.response.body);
  assert.equal(accepted.version.revision, 1);
  assert.equal(f.service.exactSource(accepted.sourceId).url, f.input.url);
  const replay = f.exchange(); replay.send(JSON.stringify(f.input)); await flush();
  assert.equal(replay.response.status, 200);
  assert.deepEqual(JSON.parse(replay.response.body), accepted);
  assert.deepEqual(f.service.version(), accepted.version);
});

test("slow real service capacity failure is surfaced without mutation", async t => {
  const f = setup(t, { delay: 6_000, capacity: true });
  const x = f.exchange(); x.send(JSON.stringify(f.input)); await flush();
  assert.equal(x.response.status, 413);
  assert.deepEqual(JSON.parse(x.response.body), { error: "capacity" });
  assert.equal(f.service.version().revision, 0);
});

test("both ingestion clocks remain thirty seconds absolute from acceptance; repeated and crossed lease cannot extend", async t => {
  const f = setup(t, { wrap: handle => async (request, context) => { await handle(request, context); return new Promise(() => {}); } });
  const connection = f.socket(); f.time.elapse(4_900);
  const x = f.exchange({ connection }); x.send(JSON.stringify(f.input)); await flush();
  assert.deepEqual(f.time.live(), [30_000, 30_000]);
  assert.equal(f.context.leaseAuthenticatedIngestion(999_999), false);
  assert.equal(f.context.leaseAuthenticatedModels(), false);
  assert.deepEqual(f.time.live(), [30_000, 30_000]);
  f.time.advance(25_099); assert.equal(connection.destroyed, false);
  f.time.advance(1); assert.equal(connection.destroyed, true);
  assert.equal(f.context.leaseAuthenticatedIngestion(), false);
  assert.equal(x.request.listenerCount("data"), 0);
});

test("synchronous completion at thirty seconds cannot escape expired timer awaiting dispatch", async t => {
  const f = setup(t, { delay: 30_000 });
  const x = f.exchange(); x.send(JSON.stringify(f.input)); await flush();
  assert.equal(x.response.status, 408);
  assert.equal(f.service.version().revision, 1);
  assert.equal(x.response.body.includes("sourceId"), false);
});

test("expired original five seconds prevents ingestion dispatch before timer callbacks", async t => {
  const f = setup(t); const x = f.exchange(); f.time.elapse(5_000);
  x.send(JSON.stringify(f.input)); await flush();
  assert.equal(f.calls, 0); assert.equal(f.service.version().revision, 0);
  assert.equal(x.response.status, 408);
});

for (const [name, options, alter, status] of [
  ["missing pairing", { headers: { Authorization: null } }, input => input, 401],
  ["wrong pairing", { headers: { Authorization: "Bearer rejected" } }, input => input, 401],
  ["wrong Host", { headers: { Host: "localhost:4174" } }, input => input, 403],
  ["wrong Origin", { headers: { Origin: "https://example.org" } }, input => input, 403],
  ["query", { url: "/v1/sources/ingest?timeout=30000" }, input => input, 400],
  ["wrong route", { url: "/v1/sources/ingest-other" }, input => input, 404],
  ["GET body", { method: "GET" }, input => input, 400],
  ["wrong content type", { headers: { "Content-Type": "text/plain" } }, input => input, 400],
  ["extra timeout field", {}, input => ({ ...input, timeout: 30_000 }), 400],
  ["invalid expected", {}, input => ({ ...input, expected: { revision: 0 } }), 400],
  ["invalid operation", {}, input => ({ ...input, operationId: "" }), 400],
  ["private URL", {}, input => ({ ...input, url: "http://127.0.0.1/private" }), 400],
  ["oversize title", {}, input => ({ ...input, title: "a".repeat(201) }), 400],
  ["unsupported extractor", {}, input => ({ ...input, extractorVersion: "unknown" }), 400],
  ["unsupported model", {}, input => ({ ...input, embedding: { ...input.embedding, modelId: "unknown" } }), 400],
  ["invalid vector", {}, input => ({ ...input, embedding: { ...input.embedding, values: Array(384).fill(0) } }), 400],
]) {
  test(`${name} cannot lease ingestion response or dispatch mutation`, async t => {
    const f = setup(t, { wrap: handle => async (request, context) => {
      const result = await handle(request, context); assert.equal(result.status, status); return new Promise(() => {});
    } });
    const x = f.exchange(options); x.send(JSON.stringify(alter(f.input))); await flush();
    assert.equal(f.calls, 0); assert.deepEqual(f.time.live(), [5_000, 5_000]);
    f.time.advance(5_000); assert.equal(x.connection.destroyed, true);
  });
}

test("rejected optional account proof cannot lease ingestion", async t => {
  const f = setup(t, { accounts: { me() { throw new ServiceError("unauthorized", "Synthetic rejection"); } } });
  let leases = 0;
  const result = await f.handle({ method: "POST", url: "/v1/sources/ingest", body: JSON.stringify(f.input), headers: {
    host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`,
    "content-type": "application/json", "x-account-session": "synthetic-session" } },
  { leaseAuthenticatedIngestion() { leases++; return true; } });
  assert.equal(result.status, 401); assert.equal(leases, 0); assert.equal(f.calls, 0);
});

test("raw headers and incomplete authenticated ingestion bodies expire at five seconds", t => {
  const f = setup(t); const headers = f.socket(); const x = f.exchange();
  x.request.emit("data", Buffer.from('{"expected":'));
  f.time.advance(4_999); assert.equal(headers.destroyed, false); assert.equal(x.connection.destroyed, false);
  f.time.advance(1); assert.equal(headers.destroyed, true); assert.equal(x.connection.destroyed, true);
  assert.equal(f.calls, 0);
});

test("oversize raw ingestion is rejected before lease and retains byte and connection caps", async t => {
  const f = setup(t); const x = f.exchange(); x.send("x".repeat(MAX_BODY_BYTES + 1)); await flush();
  assert.equal(x.response.status, 413); assert.equal(f.calls, 0);
  assert.equal(MAX_BODY_BYTES, 65_536); assert.equal(TRANSPORT_LIMITS.connections, 16);
  assert.equal(TRANSPORT_LIMITS.requestMs, 5_000); assert.equal(TRANSPORT_LIMITS.authenticatedIngestionMs, 30_000);
});

for (const termination of ["aborted", "close"]) {
  test(`${termination} before dispatch cannot revive ingestion lease`, async t => {
    const f = setup(t); const x = f.exchange();
    if (termination === "aborted") { x.request.aborted = true; x.request.emit("aborted"); }
    else x.connection.destroy();
    x.send(JSON.stringify(f.input)); await flush();
    assert.equal(f.calls, 0); assert.equal(x.response.status, undefined);
    assert.equal(x.request.listenerCount("data"), 0);
  });
  test(`${termination} after lease suppresses a late accepted ingestion response`, async t => {
    let complete;
    const f = setup(t, { wrap: handle => async (request, context) => {
      const result = await handle(request, context);
      return new Promise(resolve => { complete = () => resolve(result); });
    } });
    const x = f.exchange(); x.send(JSON.stringify(f.input)); await flush();
    assert.deepEqual(f.time.live(), [30_000, 30_000]);
    assert.equal(f.service.version().revision, 1);
    if (termination === "aborted") { x.request.aborted = true; x.request.emit("aborted"); }
    else x.connection.destroy();
    assert.equal(f.context.leaseAuthenticatedIngestion(), false);
    complete(); await flush();
    assert.equal(x.response.status, undefined); assert.equal(x.request.listenerCount("data"), 0);
    f.time.advance(30_000); assert.equal(x.connection.destroyed, true);
    assert.equal(f.service.version().revision, 1);
  });
}

test("single argument authenticated ingestion handler remains compatible", async t => {
  const f = setup(t);
  const result = await f.handle({ method: "POST", url: "/v1/sources/ingest", body: JSON.stringify(f.input), headers: {
    host: config.hostHeader, authorization: `Bearer ${config.capability}`, "content-type": "application/json" } });
  assert.equal(result.status, 200); assert.equal(f.calls, 1);
});
