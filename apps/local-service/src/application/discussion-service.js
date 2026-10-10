import { applyCommand, createDemoState } from "../domain/demo-state.js";
import { discussionView } from "../domain/discussion-view.js";
import { priorDiscussionsView } from "../domain/prior-discussions.js";
import { fail } from "../domain/errors.js";
import { frozenClone, readExpectedVersion, readId } from "../domain/validation.js";
import { operationDigestFor, sourceStamp } from "../domain/source-threads.js";
import { rankRelatedSources } from "../../../../spikes/topic-resolution/browser/core/related-sources.js";
import { applyLearnedCommand, applyLearnedIngest, BROWSER_MODEL_ID, compatibleExtractor, ingestionResult, LEARNED_COMMANDS, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE, readLearnedIngest } from "../domain/learned-sources.js";
import { createOwnerTopicPlanner } from "../domain/owner-topic-planner.js";
import { createSnapshotTopicPlanner } from "../domain/alternate-topic-cache.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";

export const DEMO_ACTORS = Object.freeze([
  Object.freeze({ id: "demo-alex", displayName: "Alex · synthetic", type: "human", demo: true }),
  Object.freeze({ id: "demo-blair", displayName: "Blair · synthetic", type: "human", demo: true }),
]);
const ALTERNATE_SOURCE_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export function createDiscussionService({ repository, ranking, sources, topicSeeds, nextId, now,
  alternateAdapter = null, alternateBodyMetric = null, alternateRidgeAdapter = null }) {
  const actors = new Map(DEMO_ACTORS.map((actor) => [actor.id, actor]));
  let ownerPlanner = null;
  if (alternateAdapter !== null || alternateBodyMetric !== null || alternateRidgeAdapter !== null) {
    try { ownerPlanner = createOwnerTopicPlanner({ diagonalAdapter: alternateAdapter, bodyMetric: alternateBodyMetric,
      ridgeAdapter: alternateRidgeAdapter }); }
    catch { /* Invalid selected weights disable only the experimental read. */ }
  }
  const alternatePlan = createSnapshotTopicPlanner(state => ownerPlanner.plan(state));
  function version(state) { return { generation: state.generation, revision: state.revision }; }

  return Object.freeze({
    actor(actorId) {
      const actor = actors.get(actorId);
      if (!actor) fail("forbidden", "Actor unavailable");
      return actor;
    },
    catalog() {
      const state = repository.load();
      return frozenClone({
        version: version(state),
        model: ranking.model,
        actors: DEMO_ACTORS.map(({ id, displayName, type }) => ({ id, displayName, type })),
        topics: state.topics.map(({ id, title, kind, provenance }) => ({
          id, title, kind, ...(provenance === LEARNED_TOPIC_PROVENANCE ? { learned: true } : {}),
        })),
        sources: state.sources.map(({ id, url, title, provenance }) => ({
          id, url, title, provenance, topicId: topicIdFor(state, id),
        })),
      });
    },
    // A private Insight can outlive unrelated catalog writes, but remains bound
    // to the exact captured Source representation and its current Topic.
    insightAnchor(topicId, sourceId) {
      topicId = readId(topicId);
      sourceId = readId(sourceId);
      const state = repository.load();
      const topic = state.topics.find((entry) => entry.id === topicId);
      const source = state.sources.find((entry) => entry.id === sourceId);
      if (!topic || !source || topicIdFor(state, sourceId) !== topicId) fail("conflict", "State changed");
      return frozenClone({ version: version(state), topicId, sourceId,
        topicTitle: topic.title, topicKind: topic.kind, sourceTitle: source.title,
        sourceProvenance: source.provenance, sourceStamp: sourceStamp(source) });
    },
    related(sourceId, limit = 5) {
      sourceId = readId(sourceId);
      if (!Number.isInteger(limit) || limit < 0 || limit > 100) fail("invalid", "Invalid request");
      const state = repository.load();
      const source = state.sources.find((entry) => entry.id === sourceId);
      if (!source) fail("not-found", "Object unavailable");
      if (source.provenance === LEARNED_SOURCE_PROVENANCE) {
        const candidates = state.sources.filter((entry) => entry.provenance === LEARNED_SOURCE_PROVENANCE && entry.embedding.modelId === source.embedding.modelId && compatibleExtractor(entry.extractorVersion)).map((entry) => ({
          id: entry.id, url: entry.url, title: entry.title, embedding: entry.embedding,
          topicId: state.sourceLinks.find((link) => link.sourceId === entry.id && link.method === "manual-confirmed")?.topicId ?? null,
        }));
        const results = rankRelatedSources(candidates.find((entry) => entry.id === sourceId), candidates, { limit, minSimilarity: 0.85 }).map(
          ({ id, url, title, relationship, method }) => ({ id, url, title, topicId: topicIdFor(state, id), relationship, method }),
        );
        return frozenClone({ version: version(state), model: { id: BROWSER_MODEL_ID, status: "experimental-local" }, results });
      }
      const rankable = state.sources.map((entry) => ({
        id: entry.id, url: entry.url, title: entry.title,
        topicId: topicIdFor(state, entry.id), embedding: entry.embedding,
      }));
      const rankableSource = rankable.find((entry) => entry.id === sourceId);
      const results = ranking.rank(rankableSource, rankable, limit).map(
        ({ id, url, title, topicId, relationship, method }) =>
          ({ id, url, title, topicId, relationship, method }),
      );
      return frozenClone({ version: version(state), model: ranking.model, results });
    },
    discussion(topicId) {
      topicId = readId(topicId);
      const state = repository.load();
      return frozenClone(discussionView(state, topicId));
    },
    alternateDiscussion(sourceId) {
      sourceId = readId(sourceId);
      if (!ALTERNATE_SOURCE_ID.test(sourceId)) fail("invalid", "Invalid request");
      if (ownerPlanner === null) fail("unavailable", "Alternate discussion unavailable");
      const state = repository.load();
      const source = state.sources.find((entry) => entry.id === sourceId);
      const link = state.sourceLinks.find((entry) => entry.sourceId === sourceId);
      if (!source || source.provenance !== LEARNED_SOURCE_PROVENANCE || !link) fail("not-found", "Object unavailable");
      const current = discussionView(state, link.topicId);
      const canonical = { topic: current.topic, discussionId: current.discussionId };
      const base = { policyVersion: ownerPlanner.policyVersion, representation: ownerPlanner.representation,
        version: version(state), sourceId, canonical };
      if (link.method === "manual-confirmed") {
        return boundedAlternateView({ ...base, mode: "canonical-pinned", sourceIds: [sourceId],
          roots: current.roots.map((root) => ({ ...root, canonicalTopicId: link.topicId,
            canonicalDiscussionId: current.discussionId })), pinnedRoots: [] });
      }
      if (link.method !== "learned-provisional") fail("unavailable", "Alternate discussion unavailable");
      let plan;
      try { plan = alternatePlan(state); }
      catch (error) {
        if (error instanceof TypeError) fail("unavailable", "Alternate discussion unavailable");
        throw error;
      }
      const group = plan.partitions.find((part) => part.sourceIds.includes(sourceId));
      if (!group) fail("unavailable", "Alternate discussion unavailable");
      const members = new Set(group.sourceIds);
      const sourceById = new Map(state.sources.map((entry) => [entry.id, entry]));
      const linkById = new Map(state.sourceLinks.map((entry) => [entry.sourceId, entry]));
      const discussionByTopic = new Map(state.discussions.map((entry) => [entry.topicId, entry.id]));
      const renderedByTopic = new Map();
      function renderedRoot(root, topicId) {
        if (!renderedByTopic.has(topicId)) renderedByTopic.set(topicId,
          new Map(discussionView(state, topicId).roots.map((entry) => [entry.id, entry])));
        const rendered = renderedByTopic.get(topicId).get(root.id);
        return rendered ? { ...rendered, canonicalTopicId: topicId,
          canonicalDiscussionId: discussionByTopic.get(topicId) } : null;
      }
      const roots = [];
      for (const root of state.contributions) {
        if (root.rootId !== null || root.anchor.kind !== "source" || !members.has(root.anchor.sourceId)) continue;
        const origin = sourceById.get(root.anchor.sourceId);
        const rootLink = linkById.get(root.anchor.sourceId);
        if (!origin || origin.provenance !== LEARNED_SOURCE_PROVENANCE || rootLink?.method !== "learned-provisional") continue;
        const topicId = state.discussions.find((entry) => entry.id === root.discussionId)?.topicId;
        if (!topicId) continue;
        const rendered = renderedRoot(root, topicId);
        if (rendered) roots.push(rendered);
      }
      roots.sort(newestRootFirst);
      const projected = new Set(roots.map((root) => root.id));
      // A different provisional Source in the current canonical Topic may
      // belong to another candidate group. Its root remains stored and can
      // still be read through that Source or the canonical Topic endpoint.
      // Only canonical topic/legacy/manual roots stay as local pinned context.
      const pinnedRoots = state.contributions.filter((root) => root.rootId === null &&
        root.discussionId === current.discussionId && !projected.has(root.id) &&
        (root.anchor.kind !== "source" || linkById.get(root.anchor.sourceId)?.method === "manual-confirmed"))
        .map((root) => renderedRoot(root, link.topicId)).filter(Boolean).sort(newestRootFirst);
      return boundedAlternateView({ ...base, mode: "alternate-provisional", sourceIds: group.sourceIds,
        roots, pinnedRoots });
    },
    priorDiscussions(sourceId) {
      return frozenClone(priorDiscussionsView(repository.load(), sourceId));
    },
    ingest(value) {
      const input = readLearnedIngest(value);
      const state = repository.load();
      if (state.generation !== input.expected.generation) fail("conflict", "State changed");
      const operationDigest = operationDigestFor(input);
      const receipt = state.sources.find((source) => source.provenance === LEARNED_SOURCE_PROVENANCE && source.operationId === input.operationId);
      if (receipt) {
        if (receipt.url !== input.url || receipt.operationDigest !== operationDigest) fail("conflict", "Operation changed");
        return frozenClone({ version: version(state), ...ingestionResult(state, receipt) });
      }
      if (state.revision !== input.expected.revision) fail("conflict", "State changed");
      const outcome = applyLearnedIngest(state, input, operationDigest, { nextId, now });
      const saved = repository.save(input.expected, outcome.state);
      return frozenClone({ version: version(saved), ...outcome.result });
    },
    command(expectedValue, command, actorId, generatedProof = null) {
      const expected = readExpectedVersion(expectedValue);
      const state = repository.load();
      if (state.generation !== expected.generation || state.revision !== expected.revision) fail("conflict", "State changed");
      const actor = actors.get(actorId);
      if (!actor) fail("forbidden", "Actor unavailable");
      const type = command && Object.getOwnPropertyDescriptor(command, "type");
      const learned = type && type.enumerable && Object.hasOwn(type, "value") && LEARNED_COMMANDS.has(type.value);
      const outcome = learned ? applyLearnedCommand(state, command, { nextId, now }) : applyCommand(state, command, actor, { nextId, now, generatedProof });
      const saved = repository.save(expected, outcome.state);
      return frozenClone({ version: version(saved), result: outcome.result });
    },
    reset(expectedValue, confirmation) {
      const expected = readExpectedVersion(expectedValue);
      if (confirmation !== "RESET DEMO STATE") fail("invalid", "Invalid request");
      const current = repository.load();
      if (current.generation !== expected.generation || current.revision !== expected.revision) fail("conflict", "State changed");
      const next = createDemoState({ generation: nextId("generation"), createdAt: now(), sources, topicSeeds });
      return frozenClone(version(repository.replace(expected, next)));
    },
  });
}

function topicIdFor(state, sourceId) {
  return state.sourceLinks.find((link) => link.sourceId === sourceId)?.topicId ?? null;
}

function newestRootFirst(left, right) {
  return right.createdAt < left.createdAt ? -1 : right.createdAt > left.createdAt ? 1 :
    right.id < left.id ? -1 : right.id > left.id ? 1 : 0;
}

function boundedAlternateView(value) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RESPONSE_BYTES) {
    fail("capacity", "Discussion capacity reached");
  }
  return frozenClone(value);
}
