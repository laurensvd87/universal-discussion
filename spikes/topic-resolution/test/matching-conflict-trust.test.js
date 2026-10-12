import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { createRequestHandler } from "../../../apps/local-service/src/http/request-handler.js";
import { validateStartupConfig } from "../../../apps/local-service/src/http/startup-config.js";
import { BROWSER_MODEL_ID } from "../../../apps/local-service/src/domain/learned-sources.js";
import { createLocalServiceClient } from "../browser/core/local-service-client.js";
import { createBackgroundMatcher } from "../browser/core/background-matcher.js";

const TOKEN = "synthetic-matching-trust-capability-only";
const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const DOCUMENT_URL = "https://example.org/trust-matching?id=visible&sid=synthetic-private-witness";
const SOURCE_URL = "https://example.org/trust-matching?id=visible";
function composition(t, lostResponse) {
  let serial = 0, reads = 0, embeddings = 0, attestations = 0, versions = 0;
  const posts = [], statuses = [];
  const service = createMemoryDemoService({ nextId: kind => `${kind}-${++serial}`, now: () => "2026-10-12T12:00:00.000Z" });
  const handler = createRequestHandler({ service, config: validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN }) });
  const client = createLocalServiceClient({ getToken: async () => TOKEN, fetchImpl: async (url, options) => {
    const route = new URL(url).pathname;
    if (route === "/v1/version") versions++;
    if (route === "/v1/sources/ingest") {
      posts.push(JSON.parse(options.body));
      if (!lostResponse && posts.length === 1) service.command(service.catalog().version,
        { type: "create-root", topicId: "reserved-domain-demo", originSourceId: "reserved-example-com", body: "Synthetic concurrent write" }, "demo-alex");
    }
    const response = await handler({ method: options.method, url: route,
      headers: { Host: "127.0.0.1:4174", Origin: ORIGIN, ...options.headers }, body: options.body ?? null });
    statuses.push(response.status);
    if (lostResponse && route === "/v1/sources/ingest") {
      assert.equal(response.status, 200); throw new Error("Synthetic lost response after acceptance");
    }
    return new Response(response.body, { status: response.status, headers: response.headers });
  } });
  const matcher = createBackgroundMatcher({ client, getPreferences: async () => ({ enabled: true, sessionWindowId: 7, sessionRevision: 3, blockedOrigins: [] }),
    readForeground: async () => ({ tabId: 4, windowId: 7, url: DOCUMENT_URL }), isPaired: async () => true,
    hasPermission: async () => true, nextOperationId: () => "trust-matching-operation",
    reader: {
      async read(tabId, sourceUrl, documentUrl) {
        reads++; assert.equal(tabId, 4); assert.equal(sourceUrl, SOURCE_URL); assert.equal(documentUrl, DOCUMENT_URL);
        return { documentId: "synthetic-document", result: { status: "collected", title: "Synthetic page", text: "SAMPLE_TEXT_NOT_RETAINED", extractorVersion: "main-text-prefix/v1" } };
      },
      async attest(tabId, documentId, sourceUrl, documentUrl) {
        attestations++; assert.equal(tabId, 4); assert.equal(documentId, "synthetic-document");
        assert.equal(sourceUrl, SOURCE_URL); assert.equal(documentUrl, DOCUMENT_URL); return { status: "attested" };
      },
    }, embed: async () => { embeddings++; return { modelId: BROWSER_MODEL_ID, values: Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0) }; },
  });
  t.after(() => matcher.dispose());
  return { matcher, service, posts, statuses, counts: () => ({ reads, embeddings, attestations, versions }) };
}

test("Trust: real non-writing HTTP409 recovers once with the same operation/vector and renewed exact page proof", async t => {
  const f = composition(t, false); await f.matcher.refresh();
  assert.equal(f.matcher.currentState().phase, "ready"); assert.deepEqual(f.statuses, [200, 409, 200, 200]);
  assert.deepEqual(f.counts(), { reads: 1, embeddings: 1, attestations: 2, versions: 2 });
  assert.equal(f.posts.length, 2); const [initial, retried] = f.posts;
  assert.equal(initial.expected.generation, retried.expected.generation); assert.equal(retried.expected.revision, initial.expected.revision + 1);
  const representation = ({ expected, ...value }) => value;
  assert.deepEqual(representation(initial), representation(retried)); assert.equal(retried.operationId, "trust-matching-operation");
  assert.equal(f.service.catalog().sources.filter(source => source.url === SOURCE_URL).length, 1);
  assert.doesNotMatch(JSON.stringify(f.posts), /SAMPLE_TEXT|synthetic-private-witness/u);
});

test("Trust: an accepted canonical ingestion with a lost response is never automatically retried", async t => {
  const f = composition(t, true); await f.matcher.refresh();
  assert.equal(f.matcher.currentState().phase, "error"); assert.equal(f.matcher.currentState().reason, "unavailable");
  assert.equal(f.posts.length, 1); assert.deepEqual(f.counts(), { reads: 1, embeddings: 1, attestations: 1, versions: 1 });
  assert.equal(f.service.catalog().sources.filter(source => source.url === SOURCE_URL).length, 1);
  assert.equal(f.matcher.currentState().sourceId, null);
});
