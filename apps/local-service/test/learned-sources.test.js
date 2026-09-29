import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { ServiceError } from "../src/domain/errors.js";
import { assertValidPersistedState } from "../src/domain/persisted-state.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION, readLearnedIngest } from "../src/domain/learned-sources.js";
import { ADAPTIVE_TOPIC_POLICY } from "../src/domain/adaptive-topics.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { deterministicDependencies, demoService } from "./helpers.js";

function setup() {
  const dependencies = deterministicDependencies();
  const state = createDemoState({ generation: dependencies.nextId("generation"), createdAt: dependencies.now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createMemoryRepository(state);
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...dependencies });
  return { service, repository };
}
function vector(angle = 0) { const values = Array(384).fill(0); values[0] = Math.cos(angle); values[1] = Math.sin(angle); return values; }
function input(service, suffix, angle = 0, overrides = {}) {
  return { expected: service.catalog().version, operationId: `operation-${suffix}`, url: `https://example.com/articles/${suffix}`, title: `Invented page ${suffix}`, embedding: { modelId: BROWSER_MODEL_ID, values: vector(angle) }, extractorVersion: EXTRACTOR_VERSION, ...overrides };
}
function command(service, value) { return service.command(service.catalog().version, value, "demo-alex"); }
const isCode = (code) => (error) => error instanceof ServiceError && error.code === code;
const FALLBACK_EXTRACTOR = "article-container-prefix/v1";

test("reviewed capture policies share the unchanged vector space without changing existing links or comments", () => {
  const { service, repository } = setup();
  const first = service.ingest(input(service, "legacy-region"));
  command(service, { type: "create-root", topicId: first.topicId, body: "Preserved across capture policies" });
  const fallback = service.ingest(input(service, "generic-region", 0.1, { extractorVersion: FALLBACK_EXTRACTOR }));
  assert.equal(fallback.topicId, first.topicId);
  assert.equal(service.discussion(fallback.topicId).roots[0].body, "Preserved across capture policies");
  assert.equal(repository.load().sources.find(source => source.id === fallback.sourceId).extractorVersion, FALLBACK_EXTRACTOR);
  assert.equal(service.related(first.sourceId).results[0].id, fallback.sourceId);
  assert.equal(service.related(fallback.sourceId).results[0].id, first.sourceId);
  const mixed = service.ingest(input(service, "mixed-members", 0.05));
  assert.equal(mixed.topicId, first.topicId);
  const corrected = command(service, { type: "correct-source", sourceId: first.sourceId, topicId: null }).result;
  const updated = service.ingest(input(service, "legacy-region", Math.PI / 2,
    { operationId: "changed-capture-policy", extractorVersion: FALLBACK_EXTRACTOR }));
  assert.equal(updated.sourceId, first.sourceId);
  assert.equal(updated.topicId, corrected.topicId);
  assert.equal(updated.assignment, "confirmed");
  assert.equal(service.discussion(fallback.topicId).roots[0].body, "Preserved across capture policies");
  assertValidPersistedState(repository.load());
});

test("fallback members still enforce all-member and competing-Topic ambiguity rules", () => {
  const service = demoService();
  const first = service.ingest(input(service, "mixed-chain-a"));
  const second = service.ingest(input(service, "mixed-chain-b", 0.3, { extractorVersion: FALLBACK_EXTRACTOR }));
  assert.equal(second.topicId, first.topicId);
  const chain = service.ingest(input(service, "mixed-chain-c", 0.6));
  assert.notEqual(chain.topicId, first.topicId);
  const separated = command(service, { type: "correct-source", sourceId: second.sourceId, topicId: null }).result;
  const ambiguous = service.ingest(input(service, "mixed-ambiguous", 0.15));
  assert.notEqual(ambiguous.topicId, first.topicId);
  assert.notEqual(ambiguous.topicId, separated.topicId);
});

test("learned pages share a provisional Topic and existing comments without moving posts or exposing scores", () => {
  const { service, repository } = setup();
  const first = service.ingest(input(service, "first"));
  assert.equal(first.assignment, "provisional");
  assert.equal(first.policyVersion, ADAPTIVE_TOPIC_POLICY.version);
  command(service, { type: "create-root", topicId: first.topicId, body: "Project-created comment on this subject" });
  const second = service.ingest(input(service, "second", 0.1));
  assert.equal(second.topicId, first.topicId);
  assert.equal(service.discussion(second.topicId).roots[0].body, "Project-created comment on this subject");
  const unrelated = service.ingest(input(service, "unrelated", Math.PI / 2));
  assert.notEqual(unrelated.topicId, first.topicId);
  const related = service.related(second.sourceId, 100);
  assert.equal(related.model.status, "experimental-local");
  assert.equal(related.model.id, BROWSER_MODEL_ID);
  assert.equal(related.results[0].id, first.sourceId);
  assert.equal(related.results[0].relationship, "related");
  assert.equal(related.results[0].topicId, first.topicId);
  assert.ok(related.results.every((item) => !Object.hasOwn(item, "similarity") && !Object.hasOwn(item, "embedding")));
  assert.ok(service.catalog().sources.every((item) => !Object.hasOwn(item, "embedding") && !Object.hasOwn(item, "operationId")));
  assert.equal(repository.load().sources.length, SYNTHETIC_SOURCES.length + 3);
});

test("ingestion retains one current source/receipt, repeats idempotently and fences stale writes/reset", () => {
  const { service, repository } = setup();
  const request = input(service, "repeat");
  const first = service.ingest(request);
  assert.deepEqual(service.ingest(request), first);
  const before = service.catalog().version;
  assert.throws(() => service.ingest({ ...request, title: "Changed same operation" }), isCode("conflict"));
  assert.deepEqual(service.catalog().version, before);
  const update = input(service, "repeat", Math.PI / 2, { operationId: "operation-revised", title: "Current title" });
  const revised = service.ingest(update);
  assert.equal(revised.sourceId, first.sourceId);
  assert.notEqual(revised.topicId, first.topicId);
  const persisted = repository.load().sources.find((source) => source.id === first.sourceId);
  assert.equal(persisted.title, "Current title");
  assert.equal(persisted.operationId, "operation-revised");
  assert.equal(persisted.embedding.values[1], 1);
  assert.equal(Object.hasOwn(persisted, "history"), false);
  assert.throws(() => service.ingest(request), isCode("conflict"));
  const pending = input(service, "late");
  command(service, { type: "forget-source", sourceId: first.sourceId });
  assert.throws(() => service.ingest(pending), isCode("conflict"));
  assert.throws(() => service.ingest(update), isCode("conflict"));
  const beforeReset = input(service, "old-generation");
  service.reset(service.catalog().version, "RESET DEMO STATE");
  assert.throws(() => service.ingest(beforeReset), isCode("conflict"));
});

test("raw text, mixed models, malformed vectors and over-limit fields fail atomically", () => {
  const service = demoService();
  const changes = [
    (value) => { value.body = "DO NOT ACCEPT PAGE BODY"; },
    (value) => { delete value.expected; },
    (value) => { value.title = "x".repeat(201); },
    (value) => { value.operationId = "x".repeat(129); },
    (value) => { value.extractorVersion = "unreviewed-extractor"; },
    // ADR-019 A's measured proposal is dormant; recognition must not activate it.
    (value) => { value.extractorVersion = "article-title-lead/v1"; },
    (value) => { value.extractorVersion = "container-title-lead/v1"; },
    (value) => { value.embedding.modelId = "same-dimensions-unrelated-space"; },
    (value) => { value.embedding.values.pop(); },
    (value) => { value.embedding.values.push(0); },
    (value) => { value.embedding.values[0] = Infinity; },
    (value) => { value.embedding.values[0] = NaN; },
    (value) => { value.embedding.values.fill(0); },
    (value) => { value.embedding.values[0] = 2; },
    (value) => { delete value.embedding.values[10]; },
    (value) => { value.embedding.values.extra = 1; },
    (value) => { Object.defineProperty(value.embedding.values, "0", { enumerable: true, get() { throw new Error("Getter executed"); } }); },
  ];
  for (const change of changes) {
    const request = input(service, "invalid"); change(request);
    const before = service.catalog();
    assert.throws(() => service.ingest(request), isCode("invalid"));
    assert.deepEqual(service.catalog(), before);
  }
  const accepted = input(service, "rounding"); accepted.embedding.values[0] = 1.00001;
  assert.equal(readLearnedIngest(accepted).embedding.values[0], 1);
});

test("public URL identity preserves functional queries while refusing private/secret/local contexts", () => {
  const service = demoService();
  const first = service.ingest(input(service, "identity", 0, { url: "https://example.com/articles/item?edition=2#read" }));
  assert.equal(service.catalog().sources.find((source) => source.id === first.sourceId).url, "https://example.com/articles/item?edition=2");
  const distinct = service.ingest(input(service, "identity-other", 0, { url: "https://example.com/articles/item?edition=3" }));
  assert.notEqual(distinct.sourceId, first.sourceId);
  const invalid = ["http://example.com/article", "https://user:password@example.com/article", "https://127.0.0.1/article", "https://192.168.1.1/article", "https://localhost/article", "file:///secret", "chrome://settings", "https://mail.google.com/mail/u/0", "https://example.com/account", "https://example.com/articles/item?token=secret"];
  for (const url of invalid) assert.throws(() => service.ingest(input(service, "invalid-url", 0, { url })), isCode("invalid"));
  assert.throws(() => service.ingest(input(service, "too-long", 0, { url: `https://example.com/${"a".repeat(2048)}` })), isCode("invalid"));
  assert.throws(() => service.ingest(input(service, "fixture-overwrite", 0, { url: "https://example.com/" })), isCode("forbidden"));
});

test("all-member policy prevents single-neighbor chains and competing Topics force separation", () => {
  const service = demoService();
  const a = service.ingest(input(service, "chain-a", 0));
  const b = service.ingest(input(service, "chain-b", 0.3));
  assert.equal(a.topicId, b.topicId);
  const c = service.ingest(input(service, "chain-c", 0.6));
  assert.notEqual(c.topicId, a.topicId);
  // Owner correction creates two near-identical Topics. No ambiguity may be
  // hidden by another Topic's weaker representative.
  const separated = command(service, { type: "correct-source", sourceId: b.sourceId, topicId: null }).result;
  assert.notEqual(separated.topicId, a.topicId);
  const ambiguous = service.ingest(input(service, "ambiguous", 0.15));
  assert.notEqual(ambiguous.topicId, a.topicId);
  assert.notEqual(ambiguous.topicId, separated.topicId);
});

test("manual correction remains confirmed on revisit and never moves old comments", () => {
  const service = demoService();
  const first = service.ingest(input(service, "correction"));
  command(service, { type: "create-root", topicId: first.topicId, body: "Stays in original Discussion" });
  const correction = command(service, { type: "correct-source", sourceId: first.sourceId, topicId: null }).result;
  assert.equal(correction.previousTopicId, first.topicId);
  assert.equal(correction.assignment, "confirmed");
  assert.equal(service.discussion(first.topicId).roots[0].body, "Stays in original Discussion");
  assert.deepEqual(service.discussion(correction.topicId).roots, []);
  const repeat = service.ingest(input(service, "correction", Math.PI / 2, { operationId: "corrected-new-operation" }));
  assert.equal(repeat.topicId, correction.topicId);
  assert.equal(repeat.assignment, "confirmed");
  const demoLink = command(service, { type: "correct-source", sourceId: first.sourceId, topicId: "harbor-s2" }).result;
  assert.equal(demoLink.assignment, "confirmed");
  assert.equal(demoLink.topicId, "harbor-s2");
  assert.throws(() => command(service, { type: "correct-source", sourceId: "harbor-overview", topicId: null }), isCode("not-found"));
});

test("Forget preserves comments; deleting a learned Topic purges all its sources and revision bodies", () => {
  const { service, repository } = setup();
  const a = service.ingest(input(service, "delete-a"));
  const b = service.ingest(input(service, "delete-b", 0.1));
  const root = command(service, { type: "create-root", topicId: a.topicId, body: "Original learned comment" }).result.contributionId;
  command(service, { type: "edit", contributionId: root, body: "Current learned comment" });
  command(service, { type: "forget-source", sourceId: a.sourceId });
  assert.equal(service.discussion(a.topicId).roots[0].body, "Current learned comment");
  assert.ok(!repository.load().sources.some((source) => source.id === a.sourceId));
  assert.throws(() => command(service, { type: "delete-learned-topic", topicId: b.topicId, confirmation: "wrong" }), isCode("invalid"));
  const removed = command(service, { type: "delete-learned-topic", topicId: b.topicId, confirmation: "DELETE TOPIC AND DISCUSSION" }).result;
  assert.deepEqual(removed.forgottenSourceIds, [b.sourceId]);
  const serialized = JSON.stringify(repository.load());
  for (const text of ["Original learned comment", "Current learned comment", "operation-delete-a", "operation-delete-b", a.sourceId, b.sourceId]) assert.ok(!serialized.includes(text));
  assert.throws(() => service.discussion(b.topicId), isCode("not-found"));
  assert.throws(() => command(service, { type: "delete-learned-topic", topicId: "harbor-s2", confirmation: "DELETE TOPIC AND DISCUSSION" }), isCode("forbidden"));
});

test("catalog identifies only learned Topics, including retained orphan Discussions after Forget", () => {
  const service = demoService();
  const manual = command(service, { type: "create-topic", title: "Deliberately created manual Topic", kind: "general" }).result.topicId;
  const learned = service.ingest(input(service, "orphan-marker"));
  command(service, { type: "create-root", topicId: learned.topicId, body: "Keep until owner deletes the learned Topic" });
  command(service, { type: "forget-source", sourceId: learned.sourceId });
  const catalog = service.catalog();
  assert.ok(!catalog.sources.some((source) => source.id === learned.sourceId));
  assert.deepEqual(catalog.topics.filter((topic) => topic.learned === true).map((topic) => topic.id), [learned.topicId]);
  for (const topic of catalog.topics.filter((topic) => topic.id !== learned.topicId)) {
    assert.deepEqual(Object.keys(topic).sort(), ["id", "kind", "title"]);
  }
  assert.ok(catalog.topics.some((topic) => topic.id === manual && !Object.hasOwn(topic, "learned")));
  assert.equal(service.discussion(learned.topicId).roots[0].body, "Keep until owner deletes the learned Topic");
  command(service, { type: "delete-learned-topic", topicId: learned.topicId, confirmation: "DELETE TOPIC AND DISCUSSION" });
  assert.ok(!service.catalog().topics.some((topic) => topic.id === learned.topicId));
  assert.ok(service.catalog().topics.some((topic) => topic.id === manual && !Object.hasOwn(topic, "learned")));
});

test("clear learned data purges orphan Topics, vectors, receipts and learned comments while preserving demo", () => {
  const { service, repository } = setup();
  command(service, { type: "create-root", topicId: "harbor-s2", body: "Preserve this deliberate demo comment" });
  const first = service.ingest(input(service, "clear-a"));
  command(service, { type: "create-root", topicId: first.topicId, body: "Learned comment to erase" });
  const second = service.ingest(input(service, "clear-b", Math.PI / 2));
  command(service, { type: "forget-source", sourceId: first.sourceId });
  command(service, { type: "correct-source", sourceId: second.sourceId, topicId: "harbor-s2" });
  const pending = input(service, "before-clear");
  const outcome = command(service, { type: "clear-learned-data", confirmation: "CLEAR LEARNED DATA" }).result;
  assert.equal(outcome.deletedTopicIds.length, 2);
  assert.deepEqual(outcome.forgottenSourceIds, [second.sourceId]);
  assert.equal(service.catalog().sources.length, SYNTHETIC_SOURCES.length);
  assert.equal(service.catalog().topics.length, SYNTHETIC_TOPIC_SEEDS.length);
  assert.equal(service.discussion("harbor-s2").roots[0].body, "Preserve this deliberate demo comment");
  const serialized = JSON.stringify(repository.load());
  for (const text of ["Learned comment to erase", "operation-clear", "owner-local-page-embedding", "owner-local-learned-topic"]) assert.ok(!serialized.includes(text));
  assert.throws(() => service.ingest(pending), isCode("conflict"));
});

test("learned catalog capacity rejects before mutation and preserves existing readable data", () => {
  const service = demoService();
  for (let index = 0; index < 100 - SYNTHETIC_SOURCES.length; index += 1) service.ingest(input(service, `capacity-${index}`));
  const before = service.catalog();
  assert.throws(() => service.ingest(input(service, "over-capacity")), isCode("capacity"));
  assert.deepEqual(service.catalog(), before);
  assert.equal(before.sources.length, 100);
});

test("SQLite preserves learned state/assignment across reopen and durably clears matching material", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "udl-learned-service-"));
  const databasePath = path.join(directory, "demo.sqlite");
  t.after(() => { assert.ok(directory.startsWith(os.tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  const dependencies = deterministicDependencies();
  let app = createSqliteDemoService({ databasePath, ...dependencies });
  const first = app.service.ingest(input(app.service, "persist-a"));
  command(app.service, { type: "create-root", topicId: first.topicId, body: "Durable learned comment" });
  const second = app.service.ingest(input(app.service, "persist-b", 0.1, { extractorVersion: FALLBACK_EXTRACTOR }));
  assert.equal(second.topicId, first.topicId);
  const correction = command(app.service, { type: "correct-source", sourceId: second.sourceId, topicId: null }).result;
  app.close();
  app = createSqliteDemoService({ databasePath, ...dependencies });
  assert.equal(app.service.discussion(first.topicId).roots[0].body, "Durable learned comment");
  assert.equal(app.service.catalog().sources.find((source) => source.id === second.sourceId).topicId, correction.topicId);
  command(app.service, { type: "clear-learned-data", confirmation: "CLEAR LEARNED DATA" });
  app.close();
  app = createSqliteDemoService({ databasePath, ...dependencies });
  assert.equal(app.service.catalog().sources.length, SYNTHETIC_SOURCES.length);
  assert.equal(app.service.catalog().topics.length, SYNTHETIC_TOPIC_SEEDS.length);
  app.close();
  const database = new DatabaseSync(databasePath);
  const document = database.prepare("SELECT document FROM demo_state WHERE singleton = 1").get().document;
  assert.ok(!document.includes("Durable learned comment"));
  assert.ok(!document.includes("owner-local-page-embedding"));
  database.close();
});

test("persisted old fixture schema still loads; malformed learned records fail closed", () => {
  const { service, repository } = setup();
  assertValidPersistedState(structuredClone(repository.load()));
  service.ingest(input(service, "persist-validation"));
  const changes = [
    (value) => { value.sources.at(-1).embedding.values = [1]; },
    (value) => { value.sources.at(-1).extractorVersion = "unknown"; },
    (value) => { value.sources.at(-1).operationDigest = "not-sha256"; },
    (value) => { value.sourceLinks.pop(); },
    (value) => { value.sources.at(-1).url = "https://127.0.0.1/private"; },
  ];
  for (const change of changes) { const value = structuredClone(repository.load()); change(value); assert.throws(() => assertValidPersistedState(value)); }
});
