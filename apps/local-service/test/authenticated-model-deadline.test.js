import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createTransportHandler, TRANSPORT_LIMITS } from "../src/http/loopback-listener.js";
import { createRequestHandler } from "../src/http/request-handler.js";

const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`, capability: "synthetic-capability" };
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

function clock(t) {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return { advance(ms) { now += ms; t.mock.timers.tick(ms); }, elapseWithoutTimers(ms) { now += ms; } };
}

function setup(t, { ai = true, accounts = null, wrapHandle = (handle) => handle } = {}) {
  const time = clock(t);
  let resolveModels;
  let modelCalls = 0;
  let pairingCalls = 0;
  const pendingModels = new Promise((resolve) => { resolveModels = resolve; });
  const handle = createRequestHandler({ config, service: { catalog: () => ({ syntheticCatalog: true }) },
    ai: ai ? { models() { modelCalls += 1; return pendingModels; } } : null,
    pairingVerifier: { verify(value) { pairingCalls += 1; return value === config.capability; } },
    accounts, accountWrites: accounts !== null,
  });
  const transport = createTransportHandler(wrapHandle(handle));
  function socket() {
    const value = Object.assign(new EventEmitter(), { destroyed: false, destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emit("close");
    } });
    transport.bindSocket(value);
    return value;
  }
  function exchange({ method = "GET", url = "/v1/ai/models", headers = {}, connection = socket() } = {}) {
    const values = { Host: config.hostHeader, Origin: config.origin, Authorization: `Bearer ${config.capability}`, ...headers };
    const request = Object.assign(new EventEmitter(), { method, url, socket: connection,
      rawHeaders: Object.entries(values).filter(([, value]) => value !== null).flat(),
      resume() { this.resumed = true; },
    });
    const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
      writeHead(status, responseHeaders) { this.status = status; this.headers = responseHeaders; },
      end(body) { this.body = body; this.writableEnded = true; this.emit("close"); connection.destroy(); },
    });
    connection.once("close", () => {
      if (!response.writableEnded) { response.destroyed = true; response.emit("close"); }
    });
    transport(request, response);
    return { request, response, connection };
  }
  return { time, socket, exchange, transport, handle, resolveModels,
    get modelCalls() { return modelCalls; }, get pairingCalls() { return pairingCalls; } };
}

test("authenticated model response leases both deadlines and completes beyond five seconds", async (t) => {
  const fixture = setup(t);
  const exchange = fixture.exchange();
  exchange.request.emit("end");
  assert.equal(fixture.pairingCalls, 1);
  assert.equal(fixture.modelCalls, 1);
  fixture.time.advance(6_000);
  assert.equal(exchange.connection.destroyed, false);
  assert.equal(exchange.response.status, undefined);
  fixture.resolveModels({ models: ["synthetic-model"] });
  await flush();
  assert.equal(exchange.response.status, 200);
  assert.equal(exchange.response.headers.connection, "close");
  assert.equal(exchange.connection.destroyed, true);
  assert.equal(exchange.request.listenerCount("data"), 0);
});

test("native privileged authenticated model GET keeps existing omitted-Origin semantics", async (t) => {
  const fixture = setup(t);
  const exchange = fixture.exchange({ headers: { Origin: null } });
  exchange.request.emit("end");
  fixture.time.advance(6_000);
  fixture.resolveModels({ models: [] });
  await flush();
  assert.equal(exchange.response.status, 200);
  assert.equal(exchange.response.headers["access-control-allow-origin"], undefined);
});

test("authenticated hung model response closes at thirty seconds total from socket acceptance", async (t) => {
  const fixture = setup(t);
  const connection = fixture.socket();
  fixture.time.advance(4_000);
  const exchange = fixture.exchange({ connection });
  exchange.request.emit("end");
  fixture.time.advance(25_999);
  assert.equal(connection.destroyed, false);
  fixture.time.advance(1);
  assert.equal(connection.destroyed, true);
  assert.equal(exchange.request.listenerCount("data"), 0);
  fixture.resolveModels({ models: [] });
  await flush();
  assert.equal(exchange.response.status, undefined);
});

for (const [name, options, body, status] of [
  ["missing pairing", { headers: { Authorization: null } }, null, 401],
  ["wrong pairing", { headers: { Authorization: "Bearer rejected-synthetic" } }, null, 401],
  ["wrong Host", { headers: { Host: "localhost:4174" } }, null, 403],
  ["wrong Origin", { headers: { Origin: "https://untrusted.invalid" } }, null, 403],
  ["query", { url: "/v1/ai/models?timeout=30000" }, null, 400],
  ["nonempty GET body", {}, "{}", 400],
  ["POST models", { method: "POST", headers: { "Content-Type": "application/json" } }, "{}", 403],
  ["other method", { method: "PUT" }, null, 400],
]) {
  test(`${name} cannot obtain an authenticated model deadline`, async (t) => {
    const fixture = setup(t);
    let leases = 0;
    const request = { method: options.method ?? "GET", url: options.url ?? "/v1/ai/models", body,
      headers: Object.fromEntries(Object.entries({ host: config.hostHeader, origin: config.origin,
        authorization: `Bearer ${config.capability}`, ...Object.fromEntries(Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])) })
        .filter(([, value]) => value !== null)),
    };
    const result = await fixture.handle(request, { leaseAuthenticatedModels() { leases += 1; return true; } });
    assert.equal(result.status, status);
    assert.equal(leases, 0);
    assert.equal(fixture.modelCalls, 0);
  });
}

test("absent AI never leases model response time", async (t) => {
  const fixture = setup(t, { ai: false });
  let leased = false;
  const request = { method: "GET", url: "/v1/ai/models", body: null,
    headers: { host: config.hostHeader, authorization: `Bearer ${config.capability}` } };
  const result = await fixture.handle(request, { leaseAuthenticatedModels() { leased = true; return true; } });
  assert.equal(result.status, 404);
  assert.equal(leased, false);
});

test("rejected optional account proof never leases model response time", async (t) => {
  const fixture = setup(t, { accounts: { me() { throw new Error("synthetic rejection"); } } });
  let leases = 0;
  const result = await fixture.handle({ method: "GET", url: "/v1/ai/models", body: null,
    headers: { host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`, "x-account-session": "synthetic-session" },
  }, { leaseAuthenticatedModels() { leases += 1; return true; } });
  assert.equal(result.status, 500);
  assert.equal(leases, 0);
  assert.equal(fixture.modelCalls, 0);
});

test("incomplete raw headers and trickling authenticated model body retain five seconds", (t) => {
  const fixture = setup(t);
  const rawHeaders = fixture.socket();
  const exchange = fixture.exchange({ headers: { "Content-Length": "1" } });
  fixture.time.advance(4_999);
  assert.equal(rawHeaders.destroyed, false);
  assert.equal(exchange.connection.destroyed, false);
  exchange.request.emit("data", Buffer.from("x"));
  fixture.time.advance(1);
  assert.equal(rawHeaders.destroyed, true);
  assert.equal(exchange.connection.destroyed, true);
  assert.equal(fixture.modelCalls, 0);
  assert.equal(exchange.request.listenerCount("data"), 0);
});

test("other authenticated requests keep both five-second deadlines", async (t) => {
  let verified = false;
  const fixture = setup(t, { wrapHandle: (handle) => async (request, context) => {
    await handle(request, context);
    verified = true;
    return new Promise(() => {});
  } });
  const exchange = fixture.exchange({ url: "/v1/catalog" });
  exchange.request.emit("end");
  await flush();
  assert.equal(verified, true);
  fixture.time.advance(5_000);
  await flush();
  assert.equal(exchange.connection.destroyed, true);
  assert.equal(fixture.modelCalls, 0);
});

for (const [name, options, body] of [
  ["unauthenticated models", { headers: { Authorization: "Bearer synthetic-rejected" } }, null],
  ["queried models", { url: "/v1/ai/models?timeout=30000" }, null],
  ["POST models", { method: "POST", headers: { "Content-Type": "application/json" } }, "{}"],
  ["models with body", {}, "{}"],
]) {
  test(`delayed ${name} response cannot lease either transport deadline`, async (t) => {
    let rejected = false;
    const fixture = setup(t, { wrapHandle: (handle) => async (request, context) => {
      const result = await handle(request, context);
      assert.ok(result.status >= 400);
      rejected = true;
      return new Promise(() => {});
    } });
    const exchange = fixture.exchange(options);
    if (body !== null) exchange.request.emit("data", Buffer.from(body));
    exchange.request.emit("end");
    await flush();
    assert.equal(rejected, true);
    fixture.time.advance(4_999);
    assert.equal(exchange.connection.destroyed, false);
    fixture.time.advance(1);
    assert.equal(exchange.connection.destroyed, true);
    assert.equal(fixture.modelCalls, 0);
    assert.equal(exchange.request.listenerCount("data"), 0);
  });
}

test("repeated or late lease attempts cannot move the original absolute deadline", async (t) => {
  let context;
  const fixture = setup(t, { wrapHandle: (handle) => (request, lease) => {
    context = lease;
    return handle(request, lease);
  } });
  const exchange = fixture.exchange();
  exchange.request.emit("end");
  fixture.time.advance(4_000);
  assert.equal(context.leaseAuthenticatedModels(), false);
  fixture.time.advance(26_000);
  assert.equal(exchange.connection.destroyed, true);
  assert.equal(context.leaseAuthenticatedModels(), false);
  fixture.resolveModels({ models: [] });
  await flush();
  assert.equal(exchange.response.status, undefined);
});

test("late model completion cannot beat an expired timer awaiting event-loop dispatch", async (t) => {
  const fixture = setup(t);
  const exchange = fixture.exchange();
  exchange.request.emit("end");
  fixture.time.elapseWithoutTimers(30_000);
  fixture.resolveModels({ models: [] });
  await flush();
  assert.equal(exchange.response.status, 408);
  assert.equal(exchange.connection.destroyed, true);
});

test("expired original deadline cannot be restored even before timer callback dispatch", async (t) => {
  const fixture = setup(t);
  const exchange = fixture.exchange();
  fixture.time.elapseWithoutTimers(5_000);
  exchange.request.emit("end");
  await flush();
  assert.equal(fixture.modelCalls, 0);
  assert.equal(exchange.response.status, 408);
});

for (const termination of ["aborted", "close"]) {
  test(`${termination} cancels leased response and suppresses late model result`, async (t) => {
    const fixture = setup(t);
    const exchange = fixture.exchange();
    exchange.request.emit("end");
    if (termination === "aborted") exchange.request.emit("aborted");
    else exchange.connection.destroy();
    fixture.resolveModels({ models: [] });
    await flush();
    assert.equal(exchange.response.status, undefined);
    assert.equal(exchange.request.listenerCount("data"), 0);
    fixture.time.advance(30_000);
    assert.equal(exchange.connection.destroyed, true);
  });
}

test("single-argument request handlers remain compatible without internal transport context", async (t) => {
  const fixture = setup(t);
  const pending = fixture.handle({ method: "GET", url: "/v1/ai/models", body: "",
    headers: { host: config.hostHeader, authorization: `Bearer ${config.capability}` } });
  fixture.resolveModels({ models: [] });
  assert.equal((await pending).status, 200);
  assert.equal(TRANSPORT_LIMITS.requestMs, 5_000);
  assert.equal(TRANSPORT_LIMITS.authenticatedModelsMs, 30_000);
  assert.equal(TRANSPORT_LIMITS.connections, 4096);
});
