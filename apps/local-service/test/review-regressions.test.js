import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState } from "../src/domain/demo-state.js";
import { MAX_RESPONSE_BYTES } from "../src/domain/discussion-view.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { deterministicDependencies } from "./helpers.js";

const adapters = [
  ["memory", createMemoryRepository],
  ["sqlite", (state) => createSqliteRepository(":memory:", state)],
];
const code = (expected) => (error) => error.code === expected;
const version = (state) => ({ generation: state.generation, revision: state.revision });
const timestamp = "2026-09-28T12:00:00.000Z";
const config = validateStartupConfig({
  host: "127.0.0.1", port: 4174, origin: `chrome-extension://${"b".repeat(32)}`,
  capability: "synthetic-review-test-capability-only",
});

function seed() {
  return createDemoState({ generation: "review-generation", createdAt: timestamp, sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
}
function setup(t, factory, initial = seed(), dependencies = deterministicDependencies()) {
  const repository = factory(initial);
  t.after(() => repository.close?.());
  const service = createDiscussionService({
    repository, ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES,
    topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...dependencies,
  });
  return { repository, service };
}
function storedRoot(id, body) {
  return {
    id, discussionId: "discussion-harbor-s2", rootId: null, replyToId: null,
    authorId: "demo-alex", actorType: "human", visibility: "local-public", withdrawn: false,
    createdAt: timestamp, revisions: [{ body, createdAt: timestamp }],
    anchor: { kind: "topic", topicId: "harbor-s2" }, originalTopicId: "harbor-s2", learnedOrigin: false,
  };
}
function request(method, url, value) {
  return {
    method, url,
    headers: { host: config.hostHeader, authorization: `Bearer ${config.capability}`, origin: config.origin,
      "content-type": "application/json", "x-demo-actor": "demo-alex" },
    body: value === undefined ? null : JSON.stringify(value),
  };
}

for (const [name, factory] of adapters) {
  test(`${name}: withdrawn thread disappears only after every descendant is withdrawn`, (t) => {
    const { repository, service } = setup(t, factory);
    const rootId = service.command(service.catalog().version,
      { type: "create-root", topicId: "harbor-s2", body: "Root text" }, "demo-alex").result.contributionId;
    const discussionId = service.discussion("harbor-s2").discussionId;
    const firstId = service.command(service.catalog().version,
      { type: "reply", discussionId, rootId, replyToId: rootId, body: "First reply" }, "demo-blair").result.contributionId;
    const secondId = service.command(service.catalog().version,
      { type: "reply", discussionId, rootId, replyToId: firstId, body: "Second reply" }, "demo-alex").result.contributionId;
    service.command(service.catalog().version, { type: "withdraw", contributionId: rootId }, "demo-alex");
    let view = service.discussion("harbor-s2");
    assert.equal(view.roots[0].label, "Deleted by user");
    assert.deepEqual(view.roots[0].replies.map((reply) => reply.id), [firstId, secondId]);
    service.command(view.version, { type: "withdraw", contributionId: firstId }, "demo-blair");
    view = service.discussion("harbor-s2");
    assert.equal(view.roots[0].replies[0].label, "Deleted by user");
    assert.equal(view.roots[0].replies[1].body, "Second reply");
    service.command(view.version, { type: "withdraw", contributionId: secondId }, "demo-alex");
    assert.deepEqual(service.discussion("harbor-s2").roots, []);
    assert.deepEqual(repository.load().contributions.map((entry) => entry.id), [rootId, firstId, secondId]);
    assert.ok(repository.load().contributions.every((entry) => entry.withdrawn && entry.revisions.length === 0));
  });

  test(`${name}: multiline CRUD preserves text and purges all revisions on withdrawal`, (t) => {
    const { repository, service } = setup(t, factory);
    const body = "First paragraph\r\n\tIndented second paragraph\n<html>plain text</html>";
    const root = service.command(service.catalog().version, { type: "create-root", topicId: "harbor-s2", body }, "demo-alex");
    assert.equal(service.discussion("harbor-s2").roots[0].body, body);
    const reply = service.command(service.catalog().version, {
      type: "reply", discussionId: "discussion-harbor-s2", rootId: root.result.contributionId,
      replyToId: root.result.contributionId, body: "Reply\nwith second line",
    }, "demo-blair");
    assert.deepEqual(Object.keys(reply).sort(), ["result", "version"]);
    service.command(service.catalog().version, { type: "edit", contributionId: root.result.contributionId, body: "Edited\nparagraph" }, "demo-alex");
    const before = service.catalog().version;
    for (const bad of ["bad\u0000text", "bad\u001btext", "bad\u202etext"]) {
      assert.throws(() => service.command(before, { type: "edit", contributionId: root.result.contributionId, body: bad }, "demo-alex"), code("invalid"));
    }
    assert.throws(() => service.command(before, { type: "create-topic", title: "Title\nextra line", kind: "general" }, "demo-alex"), code("invalid"));
    assert.deepEqual(service.catalog().version, before);
    const removed = service.command(before, { type: "withdraw", contributionId: root.result.contributionId }, "demo-alex");
    assert.deepEqual(Object.keys(removed).sort(), ["result", "version"]);
    const persisted = repository.load().contributions.find((item) => item.id === root.result.contributionId);
    assert.equal(persisted.authorId, null);
    assert.deepEqual(persisted.revisions, []);
    assert.equal(service.discussion("harbor-s2").roots[0].replies[0].body, "Reply\nwith second line");
    assert.equal(JSON.stringify(repository.load()).includes("Edited"), false);
  });

  test(`${name}: repository rejects non-successor versions and same-generation reset`, (t) => {
    const { repository } = setup(t, factory);
    const original = repository.load();
    const expected = version(original);
    for (const replacement of [
      { ...original }, { ...original, revision: 2 }, { ...original, revision: 1, generation: "other" },
    ]) {
      assert.throws(() => repository.save(expected, replacement), code("conflict"));
      assert.deepEqual(repository.load(), original);
    }
    assert.throws(() => repository.replace(expected, original), code("conflict"));
    assert.throws(() => repository.replace(expected, { ...original, generation: "new", revision: 1 }), code("conflict"));
    repository.save(expected, { ...original, revision: 1 });
    assert.throws(() => repository.save(expected, { ...original, revision: 2 }), code("conflict"));
    repository.replace({ ...expected, revision: 1 }, { ...original, generation: "new" });
    assert.throws(() => repository.save(expected, { ...original, revision: 1 }), code("conflict"));
  });

  test(`${name}: repeated generation factory fails without resetting the state`, (t) => {
    const deps = deterministicDependencies();
    const { service } = setup(t, factory, seed(), { ...deps, nextId: (prefix) => prefix === "generation" ? "review-generation" : deps.nextId(prefix) });
    service.command(service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "Keep me" }, "demo-alex");
    const before = service.discussion("harbor-s2");
    assert.throws(() => service.reset(before.version, "RESET DEMO STATE"), code("conflict"));
    assert.deepEqual(service.discussion("harbor-s2"), before);
  });

  test(`${name}: response capacity rejects writes before commit and leaves discussion readable`, async (t) => {
    const initial = seed();
    initial.contributions = Array.from({ length: 125 }, (_, index) => storedRoot(`seed-root-${index}`, "x".repeat(8000)));
    const { service } = setup(t, factory, initial);
    const handle = createRequestHandler({ service, config });
    let reached = false;
    for (let index = 0; index < 10; index++) {
      const expected = service.catalog().version;
      const response = await handle(request("POST", "/v1/commands", {
        expected, command: { type: "create-root", topicId: "harbor-s2", body: "x".repeat(8000) },
      }));
      if (response.status === 413) {
        assert.deepEqual(service.catalog().version, expected);
        assert.equal(response.headers["access-control-allow-origin"], config.origin);
        reached = true;
        break;
      }
      assert.equal(response.status, 200);
    }
    assert.equal(reached, true);
    const before = service.discussion("harbor-s2");
    const rejectedEdit = await handle(request("POST", "/v1/commands", {
      expected: before.version, command: { type: "edit", contributionId: "seed-root-0", body: "€".repeat(8000) },
    }));
    assert.equal(rejectedEdit.status, 413);
    assert.deepEqual(service.discussion("harbor-s2"), before);
    const response = await handle(request("GET", "/v1/topics/harbor-s2/discussion"));
    assert.equal(response.status, 200);
    assert.ok(Buffer.byteLength(response.body) <= MAX_RESPONSE_BYTES);
    service.command(before.version, { type: "withdraw", contributionId: "seed-root-0" }, "demo-alex");
    service.command(service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "Space released by withdrawal" }, "demo-alex");
  });

  test(`${name}: both adapters reject a snapshot over the aggregate byte budget`, (t) => {
    const { repository } = setup(t, factory);
    const original = repository.load();
    const next = structuredClone(original);
    next.revision++;
    next.contributions = Array.from({ length: 22 }, (_, index) => ({
      ...storedRoot(`large-${index}`, "x"),
      revisions: Array.from({ length: 50 }, () => ({ body: "x".repeat(8000), createdAt: timestamp })),
    }));
    assert.throws(() => repository.save(version(original), next), code("capacity"));
    assert.deepEqual(repository.load(), original);
  });
}
