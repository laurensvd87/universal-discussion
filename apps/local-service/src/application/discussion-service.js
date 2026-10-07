import { applyCommand, createDemoState } from "../domain/demo-state.js";
import { discussionView } from "../domain/discussion-view.js";
import { priorDiscussionsView } from "../domain/prior-discussions.js";
import { fail } from "../domain/errors.js";
import { frozenClone, readExpectedVersion, readId } from "../domain/validation.js";
import { operationDigestFor, sourceStamp } from "../domain/source-threads.js";
import { rankRelatedSources } from "../../../../spikes/topic-resolution/browser/core/related-sources.js";
import { applyLearnedCommand, applyLearnedIngest, BROWSER_MODEL_ID, compatibleExtractor, ingestionResult, LEARNED_COMMANDS, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE, readLearnedIngest } from "../domain/learned-sources.js";

export const DEMO_ACTORS = Object.freeze([
  Object.freeze({ id: "demo-alex", displayName: "Alex · synthetic", type: "human", demo: true }),
  Object.freeze({ id: "demo-blair", displayName: "Blair · synthetic", type: "human", demo: true }),
]);

export function createDiscussionService({ repository, ranking, sources, topicSeeds, nextId, now }) {
  const actors = new Map(DEMO_ACTORS.map((actor) => [actor.id, actor]));
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
