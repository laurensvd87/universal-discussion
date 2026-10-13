import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createTransportHandler, TRANSPORT_LIMITS } from "../src/http/loopback-listener.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { ServiceError } from "../src/domain/errors.js";

const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`, capability: "synthetic-projection-capability" };
const input = { sourceId: "source-test", topicId: "topic-test", includeAlternate: true };
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function setup(t, { wrap = handle => handle, accounts = null } = {}) {
  let now = 0, revision = 0, valid = true, calls = 0, complete, context;
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
  const service = { version: () => ({ generation: "synthetic-projection", revision }),
    readPublic() { calls++; return new Promise(resolve => { complete = () => resolve({ synthetic: "projection-payload" }); }); } };
  const handle = createRequestHandler({ config, service, accounts, accountWrites: accounts !== null,
    pairingVerifier: { verify: value => valid && value === config.capability } });
  const transport = createTransportHandler((request, internal) => { context = internal; return wrap(handle)(request, internal); });
  function socket() {
    const value = Object.assign(new EventEmitter(), { destroyed: false, destroy() {
      if (this.destroyed) return; this.destroyed = true; this.emit("close");
    } });
    transport.bindSocket(value); return value;
  }
  function exchange({ method = "POST", url = "/v1/sources/enrichment", headers = {}, connection = socket() } = {}) {
    const values = { Host: config.hostHeader, Origin: config.origin, Authorization: `Bearer ${config.capability}`,
      "Content-Type": "application/json", ...headers };
    const request = Object.assign(new EventEmitter(), { method, url, socket: connection, aborted: false,
      rawHeaders: Object.entries(values).filter(([, value]) => value !== null).flat(), resume() {} });
    const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
      writeHead(status) { this.status = status; },
      end(body) { this.body = body; this.writableEnded = true; this.emit("close"); connection.destroy(); } });
    connection.once("close", () => { if (!response.writableEnded) { response.destroyed = true; response.emit("close"); } });
    transport(request, response);
    return { request, response, connection, send(body = JSON.stringify(input)) {
      if (body !== null) request.emit("data", Buffer.from(body)); request.emit("end");
    } };
  }
  return { time, socket, exchange, finish() { complete(); }, revoke() { valid = false; }, changeVersion() { revision++; },
    get calls() { return calls; }, get context() { return context; } };
}

test("validated paired enrichment completes after eleven seconds without extending core deadline", async t => {
  const f = setup(t); const x = f.exchange(); x.send(); await flush();
  assert.equal(f.calls, 1); assert.deepEqual(f.time.live(), [30_000, 30_000]);
  f.time.advance(11_000); f.finish(); await flush();
  assert.equal(x.response.status, 200); assert.equal(JSON.parse(x.response.body).synthetic, "projection-payload");
  assert.equal(TRANSPORT_LIMITS.requestMs, 5_000); assert.equal(TRANSPORT_LIMITS.authenticatedProjectionMs, 30_000);
});

test("projection lease is absolute from acceptance and cannot be repeated or crossed", async t => {
  const f = setup(t); const connection = f.socket(); f.time.elapse(4_900);
  const x = f.exchange({ connection }); x.send(); await flush();
  assert.deepEqual(f.time.live(), [30_000, 30_000]);
  assert.equal(f.context.leaseAuthenticatedProjection(999_999), false);
  assert.equal(f.context.leaseAuthenticatedModels(), false);
  assert.equal(f.context.leaseAuthenticatedIngestion(), false);
  f.time.advance(25_099); assert.equal(connection.destroyed, false);
  f.time.advance(1); assert.equal(connection.destroyed, true);
  f.finish(); await flush(); assert.equal(x.response.status, undefined);
});

for (const [name, options, body, status] of [
  ["missing pairing", { headers: { Authorization: null } }, input, 401],
  ["wrong pairing", { headers: { Authorization: "Bearer rejected" } }, input, 401],
  ["wrong Host", { headers: { Host: "localhost:4174" } }, input, 403],
  ["wrong Origin", { headers: { Origin: "https://example.org" } }, input, 403],
  ["missing Origin", { headers: { Origin: null } }, input, 403],
  ["query", { url: "/v1/sources/enrichment?timeout=30000" }, input, 400],
  ["wrong method", { method: "GET" }, input, 400],
  ["wrong content type", { headers: { "Content-Type": "text/plain" } }, input, 400],
  ["caller timeout", {}, { ...input, timeout: 30_000 }, 400],
  ["null source", {}, { ...input, sourceId: null }, 400],
  ["null topic", {}, { ...input, topicId: null }, 400],
  ["nonboolean alternate", {}, { ...input, includeAlternate: 1 }, 400],
]) test(`${name} cannot lease or dispatch enrichment`, async t => {
  const f = setup(t, { wrap: handle => async (request, context) => {
    const result = await handle(request, context); assert.equal(result.status, status); return new Promise(() => {});
  } });
  const x = f.exchange(options); x.send(JSON.stringify(body)); await flush();
  assert.equal(f.calls, 0); assert.deepEqual(f.time.live(), [5_000, 5_000]);
  f.time.advance(5_000); assert.equal(x.connection.destroyed, true);
});

test("raw headers and incomplete bodies retain five seconds; expired body cannot dispatch", async t => {
  const f = setup(t); const raw = f.socket(); const x = f.exchange();
  x.request.emit("data", Buffer.from('{"sourceId":'));
  f.time.elapse(5_000); x.request.emit("end"); await flush();
  assert.equal(f.calls, 0); assert.equal(x.response.status, 408);
  f.time.advance(0); assert.equal(raw.destroyed, true);
});

for (const kind of ["revocation", "version", "abort", "expired"]) test(`${kind} suppresses late projection payload`, async t => {
  const f = setup(t); const x = f.exchange(); x.send(); await flush();
  if (kind === "revocation") f.revoke();
  if (kind === "version") f.changeVersion();
  if (kind === "abort") { x.request.aborted = true; x.request.emit("aborted"); }
  if (kind === "expired") f.time.elapse(30_000);
  f.finish(); await flush();
  assert.notEqual(x.response.status, 200);
  assert.equal(x.response.body?.includes("projection-payload") ?? false, false);
});

test("optional account proof is renewed after projection and rejected before lease", async t => {
  let authorized = true;
  const accounts = { me() { if (!authorized) throw new ServiceError("unauthorized", "Synthetic account expired"); return {}; } };
  const f = setup(t, { accounts });
  const x = f.exchange({ headers: { "X-Account-Session": "synthetic-account-session" } }); x.send(); await flush();
  authorized = false; f.finish(); await flush();
  assert.notEqual(x.response.status, 200); assert.equal(x.response.body?.includes("projection-payload") ?? false, false);
  const y = f.exchange({ headers: { "X-Account-Session": "synthetic-account-session" } }); y.send(); await flush();
  assert.equal(y.response.status, 401); assert.equal(f.calls, 1);
});

for (const [method, url, body] of [["GET", "/v1/health", null], ["GET", "/v1/version", null],
  ["POST", "/v1/catalog/context", { sourceId: "source-test", topicId: "topic-test" }],
  ["GET", "/v1/topics/topic-test/discussion", null],
  ["GET", "/v1/sources/source-test/alternate-discussion", null],
  ["POST", "/v1/related", { sourceId: "source-test", limit: 20 }]]) {
  test(`${url} has no projection lease`, async t => {
    const f = setup(t, { wrap: handle => async (request, context) => { await handle(request, context); return new Promise(() => {}); } });
    const x = f.exchange({ method, url }); x.send(body === null ? null : JSON.stringify(body)); await flush();
    assert.deepEqual(f.time.live(), [5_000, 5_000]); f.time.advance(5_000); assert.equal(x.connection.destroyed, true);
  });
}
