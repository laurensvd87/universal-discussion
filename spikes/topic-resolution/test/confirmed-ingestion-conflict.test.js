import assert from "node:assert/strict";
import test from "node:test";
import { createLocalServiceClient, LocalServiceClientError, isConfirmedIngestionConflict } from "../browser/core/local-service-client.js";
import { createBackgroundMatcher } from "../browser/core/background-matcher.js";
import { createRequestHandler } from "../../../apps/local-service/src/http/request-handler.js";
import { demoService } from "../../../apps/local-service/test/helpers.js";

const payload = { expected: { generation: "g", revision: 4 }, operationId: "operation-a",
  url: "https://example.com/article", title: "Synthetic", extractorVersion: "main-text-prefix/v1",
  embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: [1, ...Array(383).fill(0)] } };
const body = '{"error":"conflict"}';
const clientFor = (fetchImpl, options = {}) => createLocalServiceClient({ fetchImpl,
  getToken: () => "synthetic-test-capability-for-client-only", ...options });
async function rejection(client, action = () => client.ingest(payload)) {
  try { await action(); } catch (error) { return error; }
  assert.fail("Expected rejected request");
}
test("only complete canonical ingestion HTTP409 brands the transport error", async () => {
  const client = clientFor(async () => new Response(body, { status: 409, headers: { "content-type": "application/json" } }));
  const error = await rejection(client);
  assert.equal(error.code, "conflict"); assert.ok(isConfirmedIngestionConflict(error));
  const constructed = new LocalServiceClientError("conflict"); constructed.confirmedIngestionConflict = true;
  for (const value of [constructed, { code: "conflict", confirmedIngestionConflict: true }, null, undefined, "conflict"])
    assert.equal(isConfirmedIngestionConflict(value), false);
});
for (const value of ['', '{"error":', '{"error":"other"}', '{"error":"conflict","extra":true}',
  '{"error":"conflict","error":"conflict"}', '{"error":"conflict"} trailing', body + ' '.repeat(300)]) {
  test(`noncanonical conflict response stays unbranded (${value.length} bytes)`, async () => {
    const error = await rejection(clientFor(async () => new Response(value,
      { status: 409, headers: { "content-type": "application/json" } })));
    assert.equal(error.code, "conflict"); assert.equal(isConfirmedIngestionConflict(error), false);
  });
}
for (const headers of [{}, { "content-type": "text/html" }, { "content-type": "application/json", "content-length": "999" },
  { "content-type": "application/json", "content-length": "18" }, { "content-type": "application/json", "content-length": "bad" }]) {
  test(`wrong MIME/length conflict stays unbranded ${JSON.stringify(headers)}`, async () => {
    const error = await rejection(clientFor(async () => ({ status: 409, headers: new Headers(headers),
      body: new Response(body).body })));
    assert.equal(error.code, "conflict"); assert.equal(isConfirmedIngestionConflict(error), false);
  });
}
test("other routes and local beforeDispatch conflicts cannot brand matching recovery", async () => {
  const client = clientFor(async () => new Response(body, { status: 409, headers: { "content-type": "application/json" } }));
  const error = await rejection(client, () => client.version());
  assert.equal(error.code, "conflict"); assert.equal(isConfirmedIngestionConflict(error), false);
  const local = await rejection(client, () => client.privateConversation("list", {}, "account-test",
    { beforeDispatch: async () => false }));
  assert.equal(isConfirmedIngestionConflict(local), false);
});
test("partial, broken, invalid UTF8 and timed-out error streams never prove rejection", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const encoder = new TextEncoder();
  for (const kind of ["partial", "broken", "utf8", "timeout", "invalid-chunk"]) {
    let stage = 0;
    const stream = new ReadableStream({ pull(controller) {
      if (stage++ === 0) {
        if (kind === "utf8") { controller.enqueue(Uint8Array.from([255])); controller.close(); }
        else controller.enqueue(encoder.encode(kind === "partial" ? '{"error":' : body));
      } else if (kind === "timeout") return new Promise(() => {});
      else if (kind === "broken") controller.error(new Error("synthetic stream failure"));
      else if (kind === "invalid-chunk") { controller.enqueue("invalid"); controller.close(); }
      else controller.close();
    } });
    const pending = rejection(clientFor(async () => ({ status: 409,
      headers: new Headers({ "content-type": "application/json" }), body: stream }), { timeoutMs: 20 }));
    if (kind === "timeout") {
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
      t.mock.timers.tick(30_000);
    }
    const error = await pending;
    assert.equal(isConfirmedIngestionConflict(error), false, kind);
  }
});
test("actual in-process service conflict recovers one unchanged attested representation", async () => {
  const service = demoService();
  const token = "synthetic-test-capability-for-client-only";
  const handle = createRequestHandler({ service, config: { hostHeader: "127.0.0.1:4174",
    origin: "chrome-extension://synthetic", capability: token } });
  const ingestions = [];
  const statuses = [];
  const client = clientFor(async (url, options) => {
    if (url.endsWith("/sources/ingest")) ingestions.push(JSON.parse(options.body));
    const response = await handle({ url: new URL(url).pathname, method: options.method,
      headers: { host: "127.0.0.1:4174", ...options.headers }, body: options.body ?? null });
    if (url.endsWith("/sources/ingest")) statuses.push(response.status);
    return new Response(response.body, { status: response.status, headers: response.headers });
  });
  const foreground = { tabId: 1, windowId: 1, url: payload.url };
  let reads = 0, embeddings = 0, attestations = 0;
  const matcher = createBackgroundMatcher({
    getPreferences: async () => ({ enabled: true, sessionWindowId: 1, sessionRevision: 1, blockedOrigins: [] }),
    readForeground: async () => foreground, hasPermission: async () => true, isPaired: async () => true,
    nextOperationId: () => "matching-operation", client,
    reader: { read: async () => { reads++; return { documentId: "document-a", result: {
      status: "collected", title: payload.title, text: "Synthetic bounded text",
      extractorVersion: payload.extractorVersion } }; },
    attest: async () => { attestations++; return { status: "attested" }; } },
    embed: async () => {
      embeddings++;
      service.command(service.catalog().version, { type: "create-topic", title: "Concurrent synthetic topic", kind: "general" }, "demo-alex");
      return payload.embedding;
    },
  });
  await matcher.refresh();
  assert.equal(matcher.currentState().phase, "ready");
  assert.deepEqual(statuses, [409, 200]);
  assert.equal(reads, 1); assert.equal(embeddings, 1); assert.equal(attestations, 2);
  const [{ expected: before, ...first }, { expected: after, ...second }] = ingestions;
  assert.deepEqual(first, second); assert.equal(after.generation, before.generation);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(service.catalog().version.revision, after.revision + 1);
  matcher.dispose();
});
