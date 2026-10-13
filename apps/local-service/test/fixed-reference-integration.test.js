import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/domain/demo-state.js";
import { migrateReferenceTopicState } from "../src/domain/reference-state-migration.js";
import { createFixedReferenceMatcher } from "../src/domain/fixed-reference-topic-integration.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { deterministicDependencies } from "./helpers.js";
import { readCatalog, readAlternateDiscussion, readIngestionOutcome } from "../../../spikes/topic-resolution/browser/core/local-service-contract.js";
import { prepareIngestion } from "../src/application/ingestion-plan.js";

const vector = angle => { const values = Array(384).fill(0); values[0] = Math.cos(angle); values[1] = Math.sin(angle); return values; };
const input = (service, name, angle) => ({ expected: service.version(), operationId: `operation-${name}`,
  url: `https://example.com/article-${name}`, title: `Synthetic article ${name}`,
  embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: vector(angle) }, extractorVersion: "main-text-prefix/v1" });
function setup(normalized = false) {
  const dependencies = deterministicDependencies();
  const initial = migrateReferenceTopicState(createDemoState({ generation: "generation-reference", createdAt: dependencies.now(), sources: [], topicSeeds: [] }),
    { represent() { assert.fail("empty state has no reference candidates"); } });
  const repository = normalized ? createNormalizedSqliteRepository(":memory:", initial) : createMemoryRepository(initial);
  const matcher = createFixedReferenceMatcher({ transform: values => values });
  const service = createDiscussionService({ repository, ...dependencies, sources: [], topicSeeds: [], ranking: createFixtureRankingAdapter(), referenceMatcher: matcher });
  return { dependencies, repository, matcher, service };
}

for (const normalized of [false, true]) test(`actual ${normalized ? "normalized indexed" : "memory"} service bridge stores two memberships and reads both original discussions`, () => {
  const { service, repository } = setup(normalized);
  try {
    const a = readIngestionOutcome(service.ingest(input(service, "a", -.4)));
    const b = readIngestionOutcome(service.ingest(input(service, "b", .4)));
    assert.notEqual(a.topicId, b.topicId);
    const postA = service.command(service.version(), { type: "create-root", topicId: a.topicId, originSourceId: a.sourceId, body: "Original A" }, "demo-alex");
    const postB = service.command(service.version(), { type: "create-root", topicId: b.topicId, originSourceId: b.sourceId, body: "Original B" }, "demo-blair");
    const storedBefore = repository.load().contributions;
    const c = readIngestionOutcome(service.ingest(input(service, "middle", 0)));
    assert.deepEqual(c.topicIds, [a.topicId, b.topicId].sort());
    assert.equal(repository.load().topics.length, 2);
    assert.deepEqual(repository.load().contributions, storedBefore);
    const catalog = readCatalog(service.catalogContext({ sourceId: c.sourceId, topicId: c.topicId }));
    assert.equal(JSON.stringify(catalog).includes("parameterSha256"), false);
    assert.equal(JSON.stringify(catalog).includes('"values"'), false);
    const canonical = service.discussion(c.topicId);
    const combined = readAlternateDiscussion(service.alternateDiscussion(c.sourceId), c.sourceId, catalog, canonical);
    assert.deepEqual(new Set(combined.roots.map(root => root.id)), new Set([postA.result.contributionId, postB.result.contributionId]));
    assert.deepEqual(new Set(combined.roots.map(root => root.canonicalTopicId)), new Set([a.topicId, b.topicId]));
    assert.equal(repository.load().sources.length, 3);
    if (normalized) {
      assert.equal(repository.readTopicSources(a.topicId).items.length, 2);
      assert.equal(repository.readTopicSources(b.topicId).items.length, 2);
    }
    const afterC = repository.load();
    service.command(service.version(), { type: "create-root", topicId: c.topicId, originSourceId: c.sourceId, body: "Middle page contribution" }, "demo-alex");
    const afterPost = repository.load();
    assert.deepEqual(afterPost.topics, afterC.topics);
    assert.deepEqual(afterPost.sources, afterC.sources);
    assert.deepEqual(afterPost.sourceLinks, afterC.sourceLinks);
    assert.equal(afterPost.schema, "demo-state/v4");
  } finally { repository.close?.(); }
});

test("actual scoped ingestion saves closure and failures never create a falsely unmatched Topic", () => {
  const { service, repository, dependencies, matcher } = setup(true);
  try {
    service.ingest(input(service, "a", -.4)); service.ingest(input(service, "b", .4));
    const before = repository.load(), request = input(service, "middle", 0);
    const plan = prepareIngestion(before, request, { ...dependencies, referenceMatcher: matcher });
    const saved = repository.saveScoped(request.expected, plan.before, plan.after);
    assert.equal(saved.schema, "demo-state/v4");
    assert.equal(repository.load().topics.length, 2);
    assert.equal(repository.load().sources.find(source => source.url === request.url).topicIds.length, 2);
    const stable = repository.load();
    const unavailable = createDiscussionService({ repository, ...dependencies, sources: [], topicSeeds: [], ranking: createFixtureRankingAdapter() });
    assert.throws(() => unavailable.ingest(input(unavailable, "unavailable", 1.8)), { code: "unavailable" });
    assert.deepEqual(repository.load(), stable);
    assert.throws(() => repository.saveScoped(request.expected, plan.before, plan.after), { code: "conflict" });
  } finally { repository.close(); }
});

test("changed pages do not move old posts; erasing a reference disables it; manual correction never regroups", () => {
  const { service, repository } = setup(true);
  try {
    const a = service.ingest(input(service, "a", -.4)), b = service.ingest(input(service, "b", .4));
    service.command(service.version(), { type: "create-root", topicId: a.topicId, originSourceId: a.sourceId, body: "Historical A" }, "demo-alex");
    const old = repository.load().contributions[0];
    const changed = service.ingest({ ...input(service, "a", 1.8), operationId: "changed-a" });
    assert.notEqual(changed.topicId, a.topicId);
    const post = repository.load().contributions[0];
    assert.equal(post.discussionId, old.discussionId); assert.deepEqual(post.revisions, old.revisions);
    assert.equal(post.anchor.kind, "topic");
    const originalReference = repository.load().topics.find(topic => topic.id === a.topicId).reference;
    assert.deepEqual(originalReference.values, vector(-.4), "changing reference page never shifts the fixed reference");
    const corrected = service.command(service.version(), { type: "correct-source", sourceId: changed.sourceId, topicId: b.topicId }, "demo-alex");
    assert.deepEqual(corrected.result.topicIds, [b.topicId]);
    const pinned = service.ingest({ ...input(service, "a", -2), operationId: "manual-page-change" });
    assert.deepEqual(pinned.topicIds, [b.topicId]);
    service.command(service.version(), { type: "forget-source", sourceId: a.sourceId }, "demo-alex");
    assert.equal(repository.load().topics.find(topic => topic.id === a.topicId).reference, null);
    assert.equal(repository.load().contributions[0].discussionId, old.discussionId);
    assert.equal(repository.load().contributions[0].originSourceId, undefined);
  } finally { repository.close(); }
});
