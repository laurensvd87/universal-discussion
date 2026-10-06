import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";
import { priorDiscussionsView } from "../src/domain/prior-discussions.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { changePairing, loadPairingVerifier } from "../src/http/pairing-store.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { deterministicDependencies } from "./helpers.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const TOKEN = "synthetic-capability-test-only-32-characters";
const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: TOKEN });

function input(service, name, angle = 0, changes = {}) {
  const values = Array(384).fill(0);
  values[0] = Math.cos(angle); values[1] = Math.sin(angle);
  return { expected: service.catalog().version, operationId: `operation-${name}`,
    url: `https://example.com/articles/${name}`, title: `Synthetic ${name}`,
    embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION, ...changes };
}
function command(service, value) {
  return service.command(service.catalog().version, value, "demo-alex").result;
}
function request(sourceId, headers = {}, method = "GET") {
  return { method, url: `/v1/sources/${encodeURIComponent(sourceId)}/prior-discussions`,
    headers: { host: "127.0.0.1:4174", authorization: `Bearer ${TOKEN}`, origin: ORIGIN, ...headers }, body: null };
}

test("view rejects unlinked IDs and orders bounded Topic groups by latest matching root", () => {
  const state = { generation: "synthetic", revision: 7,
    sources: [{ id: "source" }], sourceLinks: [{ sourceId: "source", topicId: "current" }],
    topics: [{ id: "current", title: "Current", kind: "semantic" },
      { id: "old-a", title: "Old A", kind: "semantic" }, { id: "old-b", title: "Old B", kind: "semantic" }],
    discussions: [{ id: "discussion-a", topicId: "old-a" }, { id: "discussion-b", topicId: "old-b" }],
    contributions: [
      { id: "r1", rootId: null, withdrawn: false, originSourceId: "source", discussionId: "discussion-a", createdAt: "2026-01-01" },
      { id: "r2", rootId: null, withdrawn: false, originSourceId: "source", discussionId: "discussion-b", createdAt: "2026-01-02" },
      { id: "r3", rootId: null, withdrawn: false, originSourceId: "source", discussionId: "discussion-a", createdAt: "2026-01-03" },
      { id: "reply", rootId: "r3", withdrawn: false, originSourceId: "source", discussionId: "discussion-a", createdAt: "2026-01-04" },
    ] };
  assert.deepEqual(priorDiscussionsView(state, "source"), { version: { generation: "synthetic", revision: 7 },
    sourceId: "source", currentTopicId: "current", topics: [
      { id: "old-a", title: "Old A", kind: "semantic", rootCount: 2 },
      { id: "old-b", title: "Old B", kind: "semantic", rootCount: 1 },
    ] });
  assert.throws(() => priorDiscussionsView(state, "missing"), (error) => error.code === "not-found");
  assert.throws(() => priorDiscussionsView(state, "\0"), (error) => error.code === "invalid");
  state.sourceLinks = [];
  assert.throws(() => priorDiscussionsView(state, "source"), (error) => error.code === "not-found");
});

test("pinned old Source roots remain discoverable across SQLite restart; other roots stay excluded", async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "udl-prior-discussions-"));
  t.after(() => { assert.ok(directory.startsWith(os.tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  const databasePath = path.join(directory, "demo.sqlite");
  let app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  const service = app.service;
  const first = service.ingest(input(service, "prior"));
  const second = service.ingest(input(service, "other", 0.05));
  assert.equal(first.topicId, second.topicId);
  const root = command(service, { type: "create-root", topicId: first.topicId, body: "Old context",
    originSourceId: first.sourceId }).contributionId;
  command(service, { type: "create-root", topicId: first.topicId, body: "Another visible root",
    originSourceId: first.sourceId });
  command(service, { type: "create-root", topicId: first.topicId, body: "Unrelated Source",
    originSourceId: second.sourceId });
  command(service, { type: "create-root", topicId: first.topicId, body: "Manual root" });
  const withdrawn = command(service, { type: "create-root", topicId: first.topicId, body: "Withdrawn",
    originSourceId: first.sourceId }).contributionId;
  command(service, { type: "withdraw", contributionId: withdrawn });
  service.ingest(input(service, "prior", 0.2, { operationId: "changed-vector" }));
  const current = command(service, { type: "correct-source", sourceId: first.sourceId, topicId: null });
  assert.notEqual(current.topicId, first.topicId);
  assert.deepEqual(service.discussion(current.topicId).roots, []);
  const expected = { version: service.catalog().version, sourceId: first.sourceId,
    currentTopicId: current.topicId, topics: [{ id: first.topicId,
      title: service.catalog().topics.find((topic) => topic.id === first.topicId).title,
      kind: service.catalog().topics.find((topic) => topic.id === first.topicId).kind, rootCount: 2 }] };
  const handle = createRequestHandler({ service, config });
  const response = await handle(request(first.sourceId));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), expected);
  assert.ok(!response.body.includes("Old context"));
  assert.ok(!response.body.includes(root));
  assert.equal((await handle(request(first.sourceId, { authorization: "Bearer wrong" }))).status, 401);
  assert.equal((await handle(request(first.sourceId, { origin: "https://example.com" }))).status, 403);
  assert.equal((await handle(request(first.sourceId, { host: "localhost:4174" }))).status, 403);
  assert.equal((await handle(request("missing"))).status, 404);
  assert.equal((await handle(request("\0"))).status, 400);
  assert.equal((await handle(request(first.sourceId, {}, "POST"))).status, 400);
  const pairingPath = path.join(directory, "pairing.json");
  const pairedToken = changePairing({ filePath: pairingPath, origin: ORIGIN, action: "init" });
  const paired = createRequestHandler({ service, config,
    pairingVerifier: loadPairingVerifier({ filePath: pairingPath, origin: ORIGIN }) });
  assert.equal((await paired(request(first.sourceId))).status, 401);
  assert.equal((await paired(request(first.sourceId,
    { authorization: `Bearer ${pairedToken}` }))).status, 200);
  app.close();

  app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  assert.deepEqual(app.service.priorDiscussions(first.sourceId), expected);
  assert.deepEqual(app.service.catalog().version, expected.version);
  command(app.service, { type: "forget-source", sourceId: first.sourceId });
  assert.equal(app.service.discussion(first.topicId).roots.some((entry) => entry.id === root), true);
  assert.equal(app.service.discussion(first.topicId).roots.find((entry) => entry.id === root).origin, undefined);
  assert.equal((await createRequestHandler({ service: app.service, config })(request(first.sourceId))).status, 404);
  app.close();
});
