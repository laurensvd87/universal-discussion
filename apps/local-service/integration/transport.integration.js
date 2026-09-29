import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { lookup } from "node:dns";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startLocalApplication } from "../src/startup.js";
import { TRANSPORT_LIMITS } from "../src/http/loopback-listener.js";
import { deterministicDependencies } from "../test/helpers.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const TOKEN = "integration-only-injected-demo-token";
const SECOND_TOKEN = "integration-only-restarted-demo-token";
const HOST = "127.0.0.1:4174";
const config = (capability = TOKEN) => ({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability });

function request(url, { method = "GET", body, headers = {}, token = TOKEN } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const outgoing = http.request({
      host: "127.0.0.1", port: 4174, path: url, method, agent: false,
      headers: {
        host: HOST, ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (incoming) => {
      let bytes = 0;
      const chunks = [];
      incoming.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 1_048_576) { outgoing.destroy(new Error("Response exceeded test budget")); return; }
        chunks.push(chunk);
      });
      incoming.on("error", reject);
      incoming.on("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.setTimeout(6000, () => outgoing.destroy(new Error("Local request timed out")));
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}

function rawRequest(text, { end = true } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 4174 });
    let response = "";
    const deadline = setTimeout(() => socket.destroy(new Error("Raw request timed out")), 6500);
    socket.on("connect", () => end ? socket.end(text) : socket.write(text));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.length > 16384) socket.destroy(new Error("Raw test response exceeded budget"));
    });
    socket.on("error", reject);
    socket.on("close", () => { clearTimeout(deadline); resolve(response); });
  });
}

test("separate integration guard denies external I/O and non-approved endpoints", () => {
  assert.ok(globalThis[Symbol.for("universal-discussion.loopback-capability-guard")]);
  const denied = (fn) => assert.throws(fn, { code: "LOOPBACK_CAPABILITY_DENIED" });
  denied(() => lookup("example.com", () => {}));
  denied(() => fetch("http://127.0.0.1:4174/v1/health"));
  denied(() => https.get("https://example.com"));
  denied(() => execSync("echo forbidden"));
  denied(() => net.createConnection({ host: "127.0.0.1", port: 4175 }));
  denied(() => net.createConnection({ host: "example.com", port: 4174 }));
  const server = net.createServer();
  denied(() => server.listen({ host: "0.0.0.0", port: 4174 }));
});

test("approved fixed loopback transport, rejection bounds, persistence and restart pairing", { timeout: 30000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "udl-loopback-"));
  const databasePath = path.join(directory, "demo.sqlite");
  let application;
  try {
    application = await startLocalApplication({ config: config(), databasePath, ...deterministicDependencies() });
    let response = await request("/v1/health");
    assert.equal(response.status, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal((await request("/v1/health", { token: null })).status, 401);
    assert.equal((await request("/v1/health", { token: "wrong" })).status, 401);
    assert.equal((await request("/v1/health", { headers: { host: "localhost:4174" } })).status, 403);
    for (const origin of ["null", "https://example.com", `chrome-extension://${"b".repeat(32)}`]) {
      assert.equal((await request("/v1/health", { headers: { origin } })).status, 403);
    }
    response = await request("/v1/health", { headers: { origin: ORIGIN } });
    assert.equal(response.status, 200);
    assert.equal(response.headers["access-control-allow-origin"], ORIGIN);
    response = await request("/v1/commands", { method: "OPTIONS", token: null, headers: {
      origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type, x-demo-actor",
    } });
    assert.equal(response.status, 204);
    assert.equal(response.body, "");
    assert.equal((await request("/v1/commands", { method: "OPTIONS", token: null, headers: { "access-control-request-method": "POST" } })).status, 403);
    assert.equal((await request("/v1/catalog?url=secret")).status, 400);

    const raw = (suffix) => `POST /v1/commands HTTP/1.1\r\nHost: ${HOST}\r\n${suffix}`;
    let rejected = await rawRequest(raw(`Authorization: Bearer ${TOKEN}\r\nAuthorization: Bearer ${TOKEN}\r\nContent-Length: 0\r\n\r\n`));
    assert.match(rejected, /^HTTP\/1\.1 400/u);
    rejected = await rawRequest(raw(`${Array.from({ length: 32 }, (_, i) => `X-Test-${i}: v\r\n`).join("")}Content-Length: 0\r\n\r\n`));
    assert.match(rejected, /^HTTP\/1\.1 431/u);
    // A duplicate after Node's former maxHeadersCount=32 boundary must be observed.
    rejected = await rawRequest(raw(`${Array.from({ length: 30 }, (_, i) => `X-Test-${i}: v\r\n`).join("")}host: ${HOST}\r\nContent-Length: 0\r\n\r\n`));
    assert.match(rejected, /^HTTP\/1\.1 (400|431)/u);
    rejected = await rawRequest(raw(`Content-Length: 65537\r\n\r\n`));
    assert.match(rejected, /^HTTP\/1\.1 413/u);
    rejected = await rawRequest(raw(`X-Large: ${"x".repeat(17000)}\r\n\r\n`));
    assert.match(rejected, /^HTTP\/1\.1 431/u);
    rejected = await rawRequest(raw(`Transfer-Encoding: chunked\r\n\r\n10001\r\n${"x".repeat(65537)}\r\n0\r\n\r\n`));
    assert.match(rejected, /^HTTP\/1\.1 413/u);
    rejected = await rawRequest(raw(`Expect: 100-continue\r\nContent-Length: 4\r\n\r\n`));
    assert.match(rejected, /^HTTP\/1\.1 400/u);
    const started = Date.now();
    await rawRequest(raw(`Content-Length: 4\r\n\r\nx`), { end: false });
    assert.ok(Date.now() - started <= TRANSPORT_LIMITS.requestMs + 1500);
    assert.equal((await request("/v1/health")).status, 200);

    let catalog = JSON.parse((await request("/v1/catalog")).body);
    assert.equal(catalog.sources.length, 8);
    response = await request("/v1/commands", { method: "POST", headers: { "x-demo-actor": "demo-alex" }, body: {
      expected: catalog.version, command: { type: "create-root", topicId: "reserved-domain-demo", body: "Synthetic integration root\nSecond paragraph", originSourceId: "reserved-example-com" },
    } });
    assert.equal(response.status, 200);
    const contributionId = JSON.parse(response.body).result.contributionId;
    assert.equal((await request("/v1/commands", { method: "POST", headers: { "x-demo-actor": "demo-alex" }, body: {
      expected: catalog.version, command: { type: "create-root", topicId: "reserved-domain-demo", body: "Stale synthetic root" },
    } })).status, 409);
    const discussionPath = "/v1/topics/reserved-domain-demo/discussion";
    let view = JSON.parse((await request(discussionPath)).body);
    assert.equal(view.roots[0].origin.sourceId, "reserved-example-com");
    assert.equal(view.roots[0].origin.url, "https://example.com/");
    response = await request("/v1/commands", { method: "POST", headers: { "x-demo-actor": "demo-blair" }, body: {
      expected: view.version, command: { type: "reply", discussionId: view.discussionId, rootId: contributionId, replyToId: null, body: "Synthetic reply", originSourceId: "reserved-example-org" },
    } });
    assert.equal(response.status, 200);
    view = JSON.parse((await request(discussionPath)).body);
    response = await request("/v1/commands", { method: "POST", headers: { "x-demo-actor": "demo-alex" }, body: {
      expected: view.version, command: { type: "edit", contributionId, body: "Synthetic edited root" },
    } });
    assert.equal(response.status, 200);

    // A second own app must fail rather than selecting a fallback port. Its DB closes.
    await assert.rejects(startLocalApplication({ config: config(), databasePath: path.join(directory, "occupied.sqlite"), ...deterministicDependencies() }), /approved loopback endpoint/u);
    assert.equal((await request("/v1/health")).status, 200);
    await application.close();
    application = await startLocalApplication({ config: config(SECOND_TOKEN), databasePath, ...deterministicDependencies() });
    assert.equal((await request("/v1/health")).status, 401);
    view = JSON.parse((await request(discussionPath, { token: SECOND_TOKEN })).body);
    assert.equal(view.roots[0].body, "Synthetic edited root");
    assert.equal(view.roots[0].replies[0].body, "Synthetic reply");
    assert.equal(view.roots[0].origin.sourceId, "reserved-example-com");
    assert.equal(view.roots[0].replies[0].origin.sourceId, "reserved-example-org");
    response = await request("/v1/commands", { token: SECOND_TOKEN, method: "POST", headers: { "x-demo-actor": "demo-alex" }, body: {
      expected: view.version, command: { type: "withdraw", contributionId },
    } });
    assert.equal(response.status, 200);
    view = JSON.parse((await request(discussionPath, { token: SECOND_TOKEN })).body);
    assert.equal(view.roots[0].state, "deleted");
    assert.equal(Object.hasOwn(view.roots[0], "origin"), false);
    assert.equal(view.roots[0].replies[0].origin.sourceId, "reserved-example-org");
    assert.equal(JSON.stringify(view).includes("Synthetic edited root"), false);
    assert.equal(view.roots[0].replies[0].body, "Synthetic reply");
    response = await request("/v1/demo/reset", { token: SECOND_TOKEN, method: "POST", body: { expected: view.version, confirmation: "RESET DEMO STATE" } });
    assert.equal(response.status, 200);
    assert.ok(JSON.parse(response.body).version.generation !== view.version.generation);
  } finally {
    try { await application?.close(); } finally {
      const target = path.resolve(directory);
      assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
      assert.ok(path.basename(target).startsWith("udl-loopback-"));
      rmSync(target, { recursive: true, force: true });
    }
  }
});
