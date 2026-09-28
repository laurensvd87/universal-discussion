import assert from "node:assert/strict";
import test from "node:test";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { demoService } from "./helpers.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const TOKEN = "test-capability-value-32-characters";
const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN });

function handler() { return createRequestHandler({ service: demoService(), config }); }
function request(url, overrides = {}) {
  return {
    method: "GET", url,
    headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}` },
    body: null,
    ...overrides,
  };
}
function post(url, value, headers = {}) {
  return request(url, { method: "POST", headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
}

test("health requires exact Host and bearer but permits absent Origin", async () => {
  const handle = handler();
  let response = await handle(request("/v1/health"));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { protocol: "local-service/v1", capability: "paired-demo" });
  response = await handle(request("/v1/health", { headers: { host: "127.0.0.1:4174" } }));
  assert.equal(response.status, 401);
  response = await handle(request("/v1/health", { headers: { host: "localhost:4174", authorization: `Bearer ${TOKEN}` } }));
  assert.equal(response.status, 403);
  response = await handle(request("/v1/health", { headers: { host: "127.0.0.1:4174", authorization: "Bearer wrong" } }));
  assert.equal(response.status, 401);
});

test("supplied Origin must be the configured extension and CORS has no credentials", async () => {
  const handle = handler();
  let response = await handle(request("/v1/catalog", { headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, origin: ORIGIN } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers["access-control-allow-origin"], ORIGIN);
  assert.equal(Object.hasOwn(response.headers, "access-control-allow-credentials"), false);
  response = await handle(request("/v1/catalog", { headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, origin: "null" } }));
  assert.equal(response.status, 403);
  response = await handle(request("/v1/catalog", { headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, origin: "https://example.com" } }));
  assert.equal(response.status, 403);
});

test("preflight requires exact Origin and allowlisted method and headers", async () => {
  const handle = handler();
  const base = request("/v1/commands", { method: "OPTIONS", headers: {
    host: "127.0.0.1:4174", origin: ORIGIN,
    "access-control-request-method": "POST",
    "access-control-request-headers": "authorization, content-type, x-demo-actor",
  } });
  let response = await handle(base);
  assert.equal(response.status, 204);
  assert.equal(response.body, "");
  response = await handle({ ...base, headers: { ...base.headers, origin: "https://example.com" } });
  assert.equal(response.status, 403);
  response = await handle({ ...base, headers: { ...base.headers, "access-control-request-headers": "x-file-path" } });
  assert.equal(response.status, 403);
});

test("catalog and related DTOs exclude vectors and similarity scores", async () => {
  const handle = handler();
  let response = await handle(request("/v1/catalog"));
  assert.equal(response.status, 200);
  assert.equal(response.body.includes("embedding"), false);
  response = await handle(post("/v1/related", { sourceId: "harbor-overview", limit: 5 }));
  assert.equal(response.status, 200);
  const related = JSON.parse(response.body);
  assert.ok(related.results.length > 0);
  assert.equal(related.results.some((entry) => Object.hasOwn(entry, "similarity")), false);
});

test("commands require a registered server-side actor and expected version", async () => {
  const handle = handler();
  const catalog = JSON.parse((await handle(request("/v1/catalog"))).body);
  const command = { expected: catalog.version, command: { type: "create-root", topicId: "harbor-s2", body: "From handler" } };
  let response = await handle(post("/v1/commands", command, { "x-demo-actor": "demo-alex" }));
  assert.equal(response.status, 200);
  assert.equal(typeof JSON.parse(response.body).result.contributionId, "string");
  response = await handle(post("/v1/commands", command, { "x-demo-actor": "demo-alex" }));
  assert.equal(response.status, 409);
  const current = JSON.parse((await handle(request("/v1/catalog"))).body);
  response = await handle(post("/v1/commands", { expected: current.version, command: { type: "create-root", topicId: "harbor-s2", body: "No" } }, { "x-demo-actor": "forged-admin" }));
  assert.equal(response.status, 403);
  assert.equal(response.body.includes("forged-admin"), false);
});

test("discussion and reset routes expose only projected state", async () => {
  const handle = handler();
  let response = await handle(request("/v1/topics/harbor-s2/discussion"));
  assert.equal(response.status, 200);
  const before = JSON.parse(response.body).version;
  response = await handle(post("/v1/demo/reset", { expected: before, confirmation: "RESET DEMO STATE" }));
  assert.equal(response.status, 200);
  assert.notEqual(JSON.parse(response.body).version.generation, before.generation);
});

test("malformed, oversized, queried and unknown requests fail without sensitive echo", async () => {
  const handle = handler();
  let response = await handle(request("/v1/catalog?path=C%3A%5Csecret"));
  assert.equal(response.status, 400);
  assert.equal(response.body.includes("secret"), false);
  response = await handle(request("/v1/unknown"));
  assert.equal(response.status, 404);
  response = await handle(post("/v1/related", null));
  assert.equal(response.status, 400);
  response = await handle(request("/v1/catalog", { method: "POST", headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: "{" }));
  assert.equal(response.status, 400);
  response = await handle(request("/v1/health", { method: "POST", headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: `"${"x".repeat(65_537)}"` }));
  assert.equal(response.status, 413);
});

test("header accessors and inherited header bags reject without invocation", async () => {
  const handle = handler();
  let invoked = false;
  const accessorHeaders = {};
  Object.defineProperty(accessorHeaders, "host", { enumerable: true, get() { invoked = true; return "127.0.0.1:4174"; } });
  let response = await handle(request("/v1/health", { headers: accessorHeaders }));
  assert.equal(response.status, 400);
  assert.equal(invoked, false);
  response = await handle(request("/v1/health", { headers: Object.create({ host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}` }) }));
  assert.equal(response.status, 400);
});

test("startup configuration is fixed to loopback, port and one extension origin", () => {
  assert.equal(config.hostHeader, "127.0.0.1:4174");
  assert.throws(() => validateStartupConfig({ host: "0.0.0.0", port: 4174, origin: ORIGIN, capability: TOKEN }));
  assert.throws(() => validateStartupConfig({ host: "127.0.0.1", port: 9999, origin: ORIGIN, capability: TOKEN }));
  assert.throws(() => validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: "https://example.com", capability: TOKEN }));
});

test("unknown implementation failures become generic 500 responses", async () => {
  const handle = createRequestHandler({ service: { catalog() { throw new Error("private detail"); } }, config });
  const response = await handle(request("/v1/catalog"));
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(response.body), { error: "internal" });
  assert.equal(response.body.includes("private detail"), false);
});
