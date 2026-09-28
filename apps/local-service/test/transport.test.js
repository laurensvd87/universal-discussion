import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";
import { createTransportHandler, inspectRequestHead, TRANSPORT_LIMITS } from "../src/http/loopback-listener.js";
import { APP_DATABASE_PATH, createProcessDependencies } from "../src/startup.js";
import { parseCliArguments } from "../src/cli.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
function head(overrides = {}) {
  return { rawHeaders: ["Host", "127.0.0.1:4174"], method: "POST", url: "/v1/commands", ...overrides };
}
function fakeExchange(overrides = {}) {
  const request = Object.assign(new EventEmitter(), head(overrides), { resume() { this.resumed = true; } });
  const response = Object.assign(new EventEmitter(), {
    destroyed: false, writableEnded: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; this.writableEnded = true; this.emit("close"); },
  });
  return { request, response };
}

test("dormant imports leave the offline guard intact and CLI accepts only one extension Origin", () => {
  assert.ok(globalThis[Symbol.for("universal-discussion.offline-capability-guard")]);
  assert.equal(parseCliArguments(["--origin", ORIGIN]), ORIGIN);
  for (const args of [[], ["--origin", "null"], ["--origin", ORIGIN, "--port", "4175"], ["--origin", "https://example.com"]]) {
    assert.throws(() => parseCliArguments(args));
  }
  assert.equal(APP_DATABASE_PATH, path.resolve("data/demo.sqlite"));
});

test("production dependencies use independent random process tokens and opaque IDs", () => {
  const first = createProcessDependencies();
  const second = createProcessDependencies();
  // Do not include generated values in assertions/logs on failure.
  assert.ok(/^[A-Za-z0-9_-]{43}$/u.test(first.capability));
  assert.ok(first.capability !== second.capability);
  const identifiers = Array.from({ length: 100 }, () => first.nextId("generation"));
  assert.ok(new Set(identifiers).size === identifiers.length);
  assert.ok(identifiers.every((id) => /^generation-[0-9a-f-]{36}$/u.test(id)));
  assert.ok(first.nextId("generation") !== second.nextId("generation"));
});

test("raw head rejects ambiguous duplicate headers and stream metadata before body allocation", () => {
  for (const name of ["Host", "Origin", "Authorization", "Content-Length", "X-Demo-Actor", "X-Other"]) {
    assert.equal(inspectRequestHead(head({ rawHeaders: [name, "a", name.toLowerCase(), "b"] })).status, 400);
  }
  assert.equal(inspectRequestHead(head({ rawHeaders: ["Content-Length", "65537"] })).status, 413);
  assert.equal(inspectRequestHead(head({ rawHeaders: ["Content-Length", "4", "Transfer-Encoding", "chunked"] })).status, 400);
  for (const value of ["-1", "01", "1e5", "4, 4"]) {
    assert.equal(inspectRequestHead(head({ rawHeaders: ["Content-Length", value] })).status, 400);
  }
  assert.equal(inspectRequestHead(head({ rawHeaders: ["Content-Encoding", "gzip"] })).status, 400);
  assert.equal(inspectRequestHead(head({ rawHeaders: ["Expect", "100-continue"] })).status, 400);
  assert.equal(inspectRequestHead(head({ rawHeaders: ["Transfer-Encoding", "gzip"] })).status, 400);
  assert.ok(inspectRequestHead(head({ rawHeaders: ["Transfer-Encoding", "chunked"] })).headers);
});

test("raw head enforces aggregate/count/name/value/URL limits", () => {
  assert.equal(inspectRequestHead(head({ rawHeaders: Array.from({ length: 33 }, (_, i) => [`x-${i}`, "a"]).flat() })).status, 431);
  assert.equal(inspectRequestHead(head({ rawHeaders: ["a".repeat(129), "v"] })).status, 431);
  assert.equal(inspectRequestHead(head({ rawHeaders: ["X", "v".repeat(8193)] })).status, 431);
  assert.equal(inspectRequestHead(head({ rawHeaders: ["X", "v".repeat(8192), "Y", "v".repeat(8192)] })).status, 431);
  assert.equal(inspectRequestHead(head({ url: "/".repeat(2049) })).status, 414);
  assert.equal(inspectRequestHead(head({ method: "PUT" })).status, 400);
  assert.equal(TRANSPORT_LIMITS.requestMs, 5000);
  assert.equal(TRANSPORT_LIMITS.connections, 16);
});

test("stream adapter rejects oversized chunked bodies and never invokes application", () => {
  let called = false;
  const { request, response } = fakeExchange();
  createTransportHandler(async () => { called = true; })(request, response);
  request.emit("data", Buffer.alloc(32768));
  request.emit("data", Buffer.alloc(32769));
  request.emit("end");
  assert.equal(response.status, 413);
  assert.equal(called, false);
  assert.equal(request.listenerCount("data"), 0);
});

test("stream adapter rejects raw duplicates before collecting any body", () => {
  let called = false;
  const { request, response } = fakeExchange({ rawHeaders: ["Host", "a", "host", "b"] });
  createTransportHandler(async () => { called = true; })(request, response);
  assert.equal(response.status, 400);
  assert.equal(request.listenerCount("data"), 0);
  assert.equal(called, false);
});

test("stream adapter accepts only raw Buffer chunks before materialization", () => {
  let called = false;
  const { request, response } = fakeExchange();
  createTransportHandler(async () => { called = true; })(request, response);
  request.emit("data", "already-decoded text");
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("stream adapter bounds UTF-8 bytes and rejects malformed encoding without echo", async () => {
  let called = false;
  const { request, response } = fakeExchange();
  createTransportHandler(async () => { called = true; })(request, response);
  request.emit("data", Buffer.from([0xc3, 0x28]));
  request.emit("end");
  assert.equal(response.status, 400);
  assert.equal(called, false);
  const success = fakeExchange();
  createTransportHandler(async (input) => {
    assert.equal(input.body, "demo\ntext");
    return { status: 200, headers: { "cache-control": "no-store" }, body: "{}" };
  })(success.request, success.response);
  success.request.emit("data", Buffer.from("demo\n"));
  success.request.emit("data", Buffer.from("text"));
  success.request.emit("end");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(success.response.status, 200);
  assert.equal(success.response.headers.connection, "close");
});

test("aborted stream and generic application failure expose no material and no late response", async () => {
  let called = false;
  const aborted = fakeExchange();
  createTransportHandler(async () => { called = true; })(aborted.request, aborted.response);
  aborted.request.emit("data", Buffer.from("synthetic discarded body"));
  aborted.request.emit("aborted");
  aborted.request.emit("end");
  assert.equal(called, false);
  assert.equal(aborted.request.listenerCount("data"), 0);
  const failed = fakeExchange();
  createTransportHandler(async () => { throw new Error("untrusted detail"); })(failed.request, failed.response);
  failed.request.emit("end");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(failed.response.status, 500);
  assert.equal(failed.response.body.includes("untrusted"), false);
});
