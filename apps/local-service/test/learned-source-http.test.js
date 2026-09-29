import assert from "node:assert/strict";
import test from "node:test";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";
import { demoService } from "./helpers.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const TOKEN = "synthetic-capability-test-only-32-characters";
const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN });
function setup() { const service = demoService(); return { service, handle: createRequestHandler({ service, config }) }; }
function request(url, value, overrides = {}) {
  return { method: "POST", url, headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, "content-type": "application/json", origin: ORIGIN, ...overrides }, body: JSON.stringify(value) };
}
function input(service, name = "a") {
  const values = Array(384).fill(0); values[0] = 1;
  return { expected: service.catalog().version, operationId: `operation-${name}`, url: `https://example.com/articles/${name}`, title: `Synthetic article ${name}`, embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION };
}

test("ingest inherits mandatory bearer/Host/Origin checks and exact JSON-only payload validation", async () => {
  const { handle, service } = setup();
  const value = input(service);
  for (const [headers, status] of [
    [{ authorization: "" }, 401],
    [{ authorization: "Bearer wrong" }, 401],
    [{ host: "localhost:4174" }, 403],
    [{ origin: "https://example.com" }, 403],
    [{ origin: "null" }, 403],
    [{ "content-type": "text/plain" }, 400],
  ]) {
    const response = await handle(request("/v1/sources/ingest", value, headers));
    assert.equal(response.status, status);
    assert.ok(!response.body.includes("Synthetic article") && !response.body.includes("operation-a"));
  }
  const invalid = await handle(request("/v1/sources/ingest", { ...value, rawText: "Private body must not be accepted" }));
  assert.equal(invalid.status, 400);
  assert.ok(!invalid.body.includes("Private body"));
  assert.equal(service.catalog().sources.length, 8);
  const absentOrigin = request("/v1/sources/ingest", value);
  delete absentOrigin.headers.origin;
  const success = await handle(absentOrigin);
  assert.equal(success.status, 200);
  const parsed = JSON.parse(success.body);
  assert.equal(parsed.assignment, "provisional");
  assert.deepEqual(Object.keys(parsed).sort(), ["assignment", "policyVersion", "sourceId", "topicId", "version"]);
  assert.ok(!success.body.includes("values") && !success.body.includes("embedding"));
});

test("ingest requires expected version, repeats idempotently and excludes vectors from public projections", async () => {
  const { handle, service } = setup();
  const value = input(service);
  const first = await handle(request("/v1/sources/ingest", value));
  const repeat = await handle(request("/v1/sources/ingest", value));
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body, first.body);
  const changed = await handle(request("/v1/sources/ingest", { ...value, title: "Changed operation" }));
  assert.equal(changed.status, 409);
  const stale = await handle(request("/v1/sources/ingest", { ...input(service, "b"), expected: value.expected }));
  assert.equal(stale.status, 409);
  const hostileUrl = await handle(request("/v1/sources/ingest", { ...input(service, "secret"), url: "https://example.com/article?token=do-not-log-this" }));
  assert.equal(hostileUrl.status, 400);
  assert.ok(!hostileUrl.body.includes("do-not-log-this"));
  const catalog = await handle({ method: "GET", url: "/v1/catalog", headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}` }, body: null });
  const source = JSON.parse(catalog.body).sources.at(-1);
  assert.deepEqual(Object.keys(source).sort(), ["id", "provenance", "title", "topicId", "url"]);
});

test("correction/deletion commands require registered actor, exact confirmation and fresh version", async () => {
  const { handle, service } = setup();
  const ingested = JSON.parse((await handle(request("/v1/sources/ingest", input(service)))).body);
  const expected = service.catalog().version;
  const correction = { expected, command: { type: "correct-source", sourceId: ingested.sourceId, topicId: null } };
  for (const actor of [undefined, "forged-admin"]) {
    const headers = actor ? { "x-demo-actor": actor } : {};
    assert.equal((await handle(request("/v1/commands", correction, headers))).status, 403);
  }
  const corrected = await handle(request("/v1/commands", correction, { "x-demo-actor": "demo-alex" }));
  assert.equal(corrected.status, 200);
  assert.equal(JSON.parse(corrected.body).result.assignment, "confirmed");
  assert.equal((await handle(request("/v1/commands", correction, { "x-demo-actor": "demo-alex" }))).status, 409);
  const invalid = { expected: service.catalog().version, command: { type: "clear-learned-data", confirmation: "wrong" } };
  assert.equal((await handle(request("/v1/commands", invalid, { "x-demo-actor": "demo-alex" }))).status, 400);
  const clear = { expected: service.catalog().version, command: { type: "clear-learned-data", confirmation: "CLEAR LEARNED DATA" } };
  const cleared = await handle(request("/v1/commands", clear, { "x-demo-actor": "demo-alex" }));
  assert.equal(cleared.status, 200);
  assert.deepEqual(JSON.parse(cleared.body).result.forgottenSourceIds, [ingested.sourceId]);
  assert.equal(service.catalog().sources.length, 8);
});

test("the new ingestion endpoint retains the existing request-byte cap and sensitive-data-free errors", async () => {
  const { handle, service } = setup();
  const value = input(service);
  value.title = "secret payload ".repeat(10_000);
  const response = await handle(request("/v1/sources/ingest", value));
  assert.equal(response.status, 413);
  assert.ok(!response.body.includes("secret payload"));
  assert.equal(service.catalog().sources.length, 8);
});
