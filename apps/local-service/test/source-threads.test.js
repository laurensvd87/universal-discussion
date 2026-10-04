import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";
import { deterministicDependencies } from "./helpers.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { operationDigestFor } from "../src/domain/source-threads.js";

const command = (service, value, actor = "demo-alex") => service.command(service.catalog().version, value, actor).result;
const code = (name) => (error) => error.code === name;
function input(service, name, angle = 0, changes = {}) {
  const values = Array(384).fill(0); values[0] = Math.cos(angle); values[1] = Math.sin(angle);
  return { expected: service.catalog().version, operationId: `operation-${name}`, url: `https://example.com/articles/${name}`,
    title: `Synthetic ${name}`, embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION, ...changes };
}
function temporaryPath(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "udl-anchor-test-"));
  t.after(() => { assert.ok(directory.startsWith(os.tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  return path.join(directory, "demo.sqlite");
}
function memoryApp(prepareState = () => {}) {
  const dependencies = deterministicDependencies();
  const state = createDemoState({ generation: dependencies.nextId("generation"), createdAt: dependencies.now(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  prepareState(state);
  const repository = createMemoryRepository(state);
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...dependencies });
  return { service, repository };
}

test("root Source anchor moves whole tree on explicit correction; reply's different page is display-only", () => {
  const app = memoryApp(); const service = app.service;
  const a = service.ingest(input(service, "anchor-a"));
  const b = service.ingest(input(service, "anchor-b", 0.1));
  assert.equal(a.topicId, b.topicId);
  const rootId = command(service, { type: "create-root", topicId: a.topicId, body: "Original root", originSourceId: a.sourceId }).contributionId;
  const discussionId = service.discussion(a.topicId).discussionId;
  const replyId = command(service, { type: "reply", discussionId, rootId, replyToId: rootId, body: "Reply from other page", originSourceId: b.sourceId }, "demo-blair").contributionId;
  const correction = command(service, { type: "correct-source", sourceId: a.sourceId, topicId: null });
  assert.equal(service.discussion(a.topicId).roots.length, 0);
  const moved = service.discussion(correction.topicId).roots[0];
  assert.equal(moved.id, rootId); assert.equal(moved.replies[0].id, replyId);
  assert.equal(moved.regrouped, true); assert.equal(moved.origin.sourceId, a.sourceId);
  assert.equal(moved.replies[0].origin.sourceId, b.sourceId);
  assert.equal(moved.replies[0].body, "Reply from other page");
  assert.throws(() => service.command(service.catalog().version, { type: "reply", discussionId, rootId, replyToId: null, body: "Stale destination" }, "demo-alex"), code("invalid"));
  command(service, { type: "withdraw", contributionId: rootId });
  const deleted = service.discussion(correction.topicId).roots[0];
  assert.deepEqual(Object.keys(deleted).sort(), ["id", "label", "replies", "replyToId", "rootId", "state"]);
  assert.equal(deleted.replies[0].id, replyId);
  assert.equal(deleted.replies[0].origin.sourceId, b.sourceId);
});

test("same stamped revisit keeps anchor, changed representation pins root before later Source correction", () => {
  const app = memoryApp(); const service = app.service;
  const initial = input(service, "drift"); const first = service.ingest(initial);
  const rootId = command(service, { type: "create-root", topicId: first.topicId, body: "Old context", originSourceId: first.sourceId }).contributionId;
  service.ingest(input(service, "drift", 0, { operationId: "same-input-new-receipt" }));
  let stored = app.repository.load().contributions.find((entry) => entry.id === rootId);
  assert.equal(stored.anchor.kind, "source");
  service.ingest(input(service, "drift", 0.2, { operationId: "changed-input" }));
  stored = app.repository.load().contributions.find((entry) => entry.id === rootId);
  assert.deepEqual(stored.anchor, { kind: "topic", topicId: first.topicId });
  const correction = command(service, { type: "correct-source", sourceId: first.sourceId, topicId: null });
  assert.notEqual(correction.topicId, first.topicId);
  assert.equal(service.discussion(first.topicId).roots[0].id, rootId);
  assert.deepEqual(service.discussion(correction.topicId).roots, []);
  assert.equal(service.discussion(first.topicId).roots[0].origin.sourceId, first.sourceId);
});

test("title-only revisit updates live origin label while preserving the representation anchor", () => {
  const app = memoryApp(); const service = app.service;
  const first = service.ingest(input(service, "title-edit"));
  const id = command(service, { type: "create-root", topicId: first.topicId, body: "Stable representation", originSourceId: first.sourceId }).contributionId;
  const revised = service.ingest(input(service, "title-edit", 0,
    { operationId: "different-receipt-title", title: "Revised display title" }));
  assert.equal(revised.topicId, first.topicId);
  const stored = app.repository.load().contributions.find((entry) => entry.id === id);
  assert.equal(stored.anchor.kind, "source");
  assert.equal(service.discussion(first.topicId).roots[0].origin.title, "Revised display title");
});

test("Forget purges root/reply origin IDs but preserves pinned thread; Clear removes learned roots in manual Topic", () => {
  const app = memoryApp(); const service = app.service;
  const a = service.ingest(input(service, "forget-a"));
  const b = service.ingest(input(service, "forget-b", 0.1));
  const rootId = command(service, { type: "create-root", topicId: a.topicId, body: "Root persists", originSourceId: a.sourceId }).contributionId;
  command(service, { type: "reply", discussionId: service.discussion(a.topicId).discussionId,
    rootId, replyToId: null, body: "Reply link removed", originSourceId: a.sourceId });
  command(service, { type: "forget-source", sourceId: a.sourceId });
  const projection = service.discussion(a.topicId).roots[0];
  assert.equal(projection.id, rootId); assert.equal(projection.origin, undefined);
  assert.equal(projection.replies[0].origin, undefined);
  assert.equal(app.repository.load().contributions.find((entry) => entry.id === rootId).anchor.kind, "topic");
  const secondRoot = command(service, { type: "create-root", topicId: b.topicId, body: "Learned but manually moved", originSourceId: b.sourceId }).contributionId;
  command(service, { type: "create-root", topicId: "harbor-s2", body: "Manual fixture remains", originSourceId: null });
  command(service, { type: "correct-source", sourceId: b.sourceId, topicId: "harbor-s2" });
  assert.equal(service.discussion("harbor-s2").roots.some((root) => root.id === secondRoot), true);
  command(service, { type: "clear-learned-data", confirmation: "CLEAR LEARNED DATA" });
  const fixture = service.discussion("harbor-s2").roots;
  assert.equal(fixture.length, 1); assert.equal(fixture[0].body, "Manual fixture remains");
  assert.equal(app.repository.load().contributions.some((entry) => entry.id === secondRoot), false);
});

test("origin command variants require retained Source linked to current destination", () => {
  const app = memoryApp(); const service = app.service;
  const learned = service.ingest(input(service, "validation"));
  const before = service.catalog().version;
  for (const value of [undefined, "missing", "harbor-overview"]) {
    assert.throws(() => service.command(before, { type: "create-root", topicId: learned.topicId, body: "Denied", originSourceId: value }, "demo-alex"), code("invalid"));
  }
  const rootId = command(service, { type: "create-root", topicId: learned.topicId, body: "Allowed", originSourceId: learned.sourceId }).contributionId;
  const discussionId = service.discussion(learned.topicId).discussionId;
  assert.throws(() => service.command(service.catalog().version, { type: "reply", discussionId, rootId,
    replyToId: null, body: "Other Topic", originSourceId: "harbor-overview" }, "demo-alex"), code("invalid"));
  assert.ok(service.discussion(learned.topicId).roots[0].origin.url.startsWith("https://example.com/"));
});

test("paired commands keep retained-only Sources readable but reject new root and reply origins", async () => {
  const retainedUrl = "https://accounts.example.com/articles/legacy";
  const app = memoryApp();
  const learned = app.service.ingest(input(app.service, "historical-origin"));
  const state = structuredClone(app.repository.load());
  const source = state.sources.find((entry) => entry.id === learned.sourceId);
  source.url = retainedUrl;
  source.operationDigest = operationDigestFor(source);
  state.revision += 1;
  app.repository.save({ generation: state.generation, revision: state.revision - 1 }, state);
  const config = validateStartupConfig({ host: "127.0.0.1", port: 4174,
    origin: `chrome-extension://${"a".repeat(32)}`, capability: "test-capability-value-32-characters" });
  const handle = createRequestHandler({ service: app.service, config });
  const request = (value) => handle({ method: "POST", url: "/v1/commands", headers: {
    host: "127.0.0.1:4174", authorization: `Bearer ${config.capability}`,
    "content-type": "application/json", "x-demo-actor": "demo-alex",
  }, body: JSON.stringify({ expected: app.service.catalog().version, command: value }) });
  assert.equal(app.service.catalog().sources.find((entry) => entry.id === learned.sourceId).url, retainedUrl);
  const rejectedRoot = await request({ type: "create-root", topicId: learned.topicId,
    body: "Rejected origin", originSourceId: learned.sourceId });
  assert.equal(rejectedRoot.status, 400);
  assert.equal(app.service.discussion(learned.topicId).roots.length, 0);

  const created = await request({ type: "create-root", topicId: learned.topicId, body: "No source origin" });
  assert.equal(created.status, 200);
  const rootId = JSON.parse(created.body).result.contributionId;
  const discussionId = app.service.discussion(learned.topicId).discussionId;
  const rejectedReply = await request({ type: "reply", discussionId, rootId,
    replyToId: rootId, body: "Rejected reply origin", originSourceId: learned.sourceId });
  assert.equal(rejectedReply.status, 400);
  assert.equal(app.service.discussion(learned.topicId).roots[0].replies.length, 0);
  const reply = await request({ type: "reply", discussionId, rootId, replyToId: rootId,
    body: "No source origin", originSourceId: null });
  assert.equal(reply.status, 200);
  assert.equal(app.service.discussion(learned.topicId).roots[0].replies[0].origin, undefined);
});

test("SQLite v1 migration is atomic, pins old roots and increments revision exactly once", (t) => {
  const databasePath = temporaryPath(t); const dependencies = deterministicDependencies();
  let app = createSqliteDemoService({ databasePath, ...dependencies });
  const rootId = command(app.service, { type: "create-root", topicId: "harbor-s2", body: "Old thread" }).contributionId;
  const before = app.service.catalog().version; app.close();
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT document FROM demo_state WHERE singleton = 1").get();
  const legacy = JSON.parse(row.document); legacy.schema = "demo-state/v1";
  for (const entry of legacy.contributions) { delete entry.anchor; delete entry.originalTopicId; delete entry.learnedOrigin; delete entry.originSourceId; }
  database.prepare("UPDATE demo_state SET schema = ?, document = ? WHERE singleton = 1").run(legacy.schema, JSON.stringify(legacy));
  database.close();
  const reopened = deterministicDependencies();
  app = createSqliteDemoService({ databasePath, now: reopened.now,
    nextId: (prefix) => `reopened-${reopened.nextId(prefix)}` });
  const after = app.service.catalog().version;
  assert.equal(after.generation, before.generation); assert.equal(after.revision, before.revision + 1);
  assert.equal(app.service.discussion("harbor-s2").roots[0].id, rootId);
  app.close();
  app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  assert.deepEqual(app.service.catalog().version, after); app.close();
});

test("v1 migration accepts reviewed learned Source records but invents no root origin", (t) => {
  const databasePath = temporaryPath(t);
  let app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  const learned = app.service.ingest(input(app.service, "legacy-learned"));
  const id = command(app.service, { type: "create-root", topicId: learned.topicId, body: "Before anchoring" }).contributionId;
  const before = app.service.catalog().version; app.close();
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT document FROM demo_state WHERE singleton = 1").get();
  const legacy = JSON.parse(row.document); legacy.schema = "demo-state/v1";
  for (const topic of legacy.topics) delete topic.retainTight;
  for (const source of legacy.sources) if (source.provenance === "owner-local-page-embedding/v1") {
    source.policyVersion = "provisional-all-source-cosine/v1";
  }
  for (const entry of legacy.contributions) {
    delete entry.anchor; delete entry.originalTopicId; delete entry.learnedOrigin; delete entry.originSourceId;
  }
  database.prepare("UPDATE demo_state SET schema = ?, document = ? WHERE singleton = 1").run(legacy.schema, JSON.stringify(legacy));
  database.close();
  app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  assert.equal(app.service.catalog().version.revision, before.revision + 1);
  const root = app.service.discussion(learned.topicId).roots[0];
  assert.equal(root.id, id); assert.equal(root.origin, undefined); assert.equal(root.regrouped, undefined);
  app.close();
});

test("corrupt v1 and failed migration serialization leave the exact old row recoverable", (t) => {
  const databasePath = temporaryPath(t); const dependencies = deterministicDependencies();
  const app = createSqliteDemoService({ databasePath, ...dependencies }); app.close();
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT document, revision FROM demo_state WHERE singleton = 1").get();
  const legacy = JSON.parse(row.document); legacy.schema = "demo-state/v1";
  const oldDocument = JSON.stringify(legacy);
  database.prepare("UPDATE demo_state SET schema = ?, document = ? WHERE singleton = 1").run(legacy.schema, oldDocument);
  database.close();
  assert.throws(() => createSqliteDemoService({ databasePath, ...deterministicDependencies(),
    repositoryOptions: { serialize() { throw new Error("synthetic migration write failure"); } } }), code("storage-failure"));
  let check = new DatabaseSync(databasePath);
  const untouched = check.prepare("SELECT schema, document, revision FROM demo_state WHERE singleton = 1").get();
  assert.equal(untouched.schema, "demo-state/v1");
  assert.equal(untouched.document, oldDocument);
  assert.equal(untouched.revision, row.revision);
  legacy.sourceLinks[0].topicId = "missing-topic";
  check.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run(JSON.stringify(legacy)); check.close();
  assert.throws(() => createSqliteDemoService({ databasePath, ...deterministicDependencies() }), code("storage-corrupt"));
  check = new DatabaseSync(databasePath);
  assert.equal(check.prepare("SELECT schema FROM demo_state WHERE singleton = 1").get().schema, "demo-state/v1");
  check.close();
});

test("corrupt learned-origin flag on Source anchor fails closed after SQLite reopen", (t) => {
  const databasePath = temporaryPath(t);
  const app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  const learned = app.service.ingest(input(app.service, "flag-integrity"));
  command(app.service, { type: "create-root", topicId: learned.topicId, body: "Protected learned origin", originSourceId: learned.sourceId });
  app.close();
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT document FROM demo_state WHERE singleton = 1").get();
  const tampered = JSON.parse(row.document);
  tampered.contributions[0].learnedOrigin = false;
  database.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run(JSON.stringify(tampered));
  database.close();
  assert.throws(() => createSqliteDemoService({ databasePath, ...deterministicDependencies() }), code("storage-corrupt"));
});

test("reopened learned Source rejects title/vector changes without a matching operation digest", (t) => {
  const mutations = [
    (source) => { source.title = "Tampered display title"; },
    (source) => { source.embedding.values[0] = 0.9; source.embedding.values[1] = Math.sqrt(1 - 0.9 ** 2); },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const databasePath = temporaryPath(t);
    const app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
    app.service.ingest(input(app.service, `digest-${index}`)); app.close();
    const database = new DatabaseSync(databasePath);
    const row = database.prepare("SELECT document FROM demo_state WHERE singleton = 1").get();
    const altered = JSON.parse(row.document); mutate(altered.sources.at(-1));
    database.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run(JSON.stringify(altered)); database.close();
    assert.throws(() => createSqliteDemoService({ databasePath, ...deterministicDependencies() }), code("storage-corrupt"));
  }
});

test("live adaptive .91 join and supported regrouping move a whole linked subtree across SQLite restart", (t) => {
  const databasePath = temporaryPath(t); const deps = deterministicDependencies();
  let app = createSqliteDemoService({ databasePath, ...deps });
  const a = app.service.ingest(input(app.service, "adaptive-a", 0));
  const b = app.service.ingest(input(app.service, "adaptive-b", Math.acos(.91)));
  assert.equal(b.topicId, a.topicId);
  const c = app.service.ingest(input(app.service, "adaptive-c", 1.1));
  const d = app.service.ingest(input(app.service, "adaptive-d", 1.3));
  assert.equal(c.topicId, d.topicId);
  assert.notEqual(c.topicId, a.topicId);
  // A stored old provisional group can be incoherent after earlier stable
  // revisits. Assemble that bounded shape directly; no owner data is involved.
  app.close();
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT document FROM demo_state WHERE singleton = 1").get();
  const combined = JSON.parse(row.document);
  for (const id of [c.sourceId, d.sourceId]) combined.sourceLinks.find((link) => link.sourceId === id).topicId = a.topicId;
  database.prepare("UPDATE demo_state SET document = ? WHERE singleton = 1").run(JSON.stringify(combined));
  database.close();
  const continued = deterministicDependencies();
  app = createSqliteDemoService({ databasePath, now: continued.now,
    nextId: (prefix) => `continued-${continued.nextId(prefix)}` });
  const rootId = command(app.service, { type: "create-root", topicId: a.topicId, body: "Linked C post", originSourceId: c.sourceId }).contributionId;
  const oldDiscussion = app.service.discussion(a.topicId).discussionId;
  const replyId = command(app.service, { type: "reply", discussionId: oldDiscussion, rootId,
    replyToId: rootId, body: "Reply from D", originSourceId: d.sourceId }, "demo-blair").contributionId;
  const before = app.service.catalog().version;
  app.service.ingest(input(app.service, "adaptive-trigger", Math.PI));
  const movedTopic = app.service.catalog().sources.find((entry) => entry.id === c.sourceId).topicId;
  assert.notEqual(movedTopic, a.topicId);
  const moved = app.service.discussion(movedTopic).roots[0];
  assert.equal(moved.id, rootId); assert.equal(moved.replies[0].id, replyId);
  assert.equal(moved.regrouped, true);
  assert.equal(app.service.discussion(a.topicId).roots.some((entry) => entry.id === rootId), false);
  assert.throws(() => app.service.command(before, { type: "reply", discussionId: oldDiscussion, rootId,
    replyToId: null, body: "Stale" }, "demo-alex"), code("conflict"));
  app.close();
  app = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
  assert.equal(app.service.discussion(movedTopic).roots[0].replies[0].id, replyId);
  assert.equal(app.service.catalog().sources.find((entry) => entry.id === c.sourceId).topicId, movedTopic);
  app.close();
});
