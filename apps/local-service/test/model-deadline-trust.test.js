import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createTransportHandler } from "../src/http/loopback-listener.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const TOKEN = "synthetic-model-deadline-trust-capability";
function clock(t) {
  let now = 0; const timers = [];
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const timer = { callback, due: now + delay, cancelled: false, unref() {} }; timers.push(timer); return timer;
  });
  t.mock.method(globalThis, "clearTimeout", timer => { timer.cancelled = true; });
  return { set(value) { now = value; }, live() { return timers.filter(timer => !timer.cancelled); } };
}
function exchange(headers = []) {
  const socket = Object.assign(new EventEmitter(), { destroyed: false, destroy() { this.destroyed = true; this.emit("close"); } });
  const request = Object.assign(new EventEmitter(), { socket, method: "GET", url: "/v1/ai/models", aborted: false,
    rawHeaders: ["Host", "127.0.0.1:4174", "Authorization", `Bearer ${TOKEN}`, ...headers], resume() {} });
  const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    writeHead(status) { this.status = status; }, end(body) { this.body = body; this.writableEnded = true; this.emit("close"); } });
  return { socket, request, response };
}
const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN });

test("Trust: authenticated model lease near five seconds is thirty seconds total from acceptance for both clocks", async t => {
  const time = clock(t); const f = exchange(); let called = 0, context, resolve;
  const handler = createRequestHandler({ config, service: {}, ai: { models() { called++; return new Promise(done => { resolve = done; }); } } });
  const transport = createTransportHandler((request, internal) => { context = internal; return handler(request, internal); });
  transport.bindSocket(f.socket); time.set(4900); transport(f.request, f.response); f.request.emit("end");
  assert.equal(called, 1); assert.deepEqual(time.live().map(timer => timer.due), [30000, 30000]);
  assert.equal(context.leaseAuthenticatedModels(), false); assert.deepEqual(time.live().map(timer => timer.due), [30000, 30000]);
  resolve([]); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.response.status, 200); f.socket.destroy();
});

test("Trust: an expired initial socket deadline cannot be revived even before queued timer callbacks execute", async t => {
  const time = clock(t); const f = exchange(); let called = 0;
  const transport = createTransportHandler(createRequestHandler({ config, service: {}, ai: { models() { called++; return []; } } }));
  transport.bindSocket(f.socket); time.set(5000); transport(f.request, f.response); f.request.emit("end");
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(called, 0); assert.equal(f.response.status, 408); assert.ok(time.live().every(timer => timer.due <= 5000));
  f.socket.destroy();
});

test("Trust: raw HTTP fields cannot forge a deadline lease and wrong Origin never invokes models", async t => {
  const time = clock(t); const f = exchange(["Origin", "https://example.org", "leaseAuthenticatedModels", "true"]); let called = 0;
  const transport = createTransportHandler(createRequestHandler({ config, service: {}, ai: { models() { called++; return []; } } }));
  transport.bindSocket(f.socket); time.set(4000); transport(f.request, f.response); f.request.emit("end");
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(called, 0); assert.equal(f.response.status, 403); assert.ok(time.live().every(timer => timer.due <= 5000));
  f.socket.destroy();
});
