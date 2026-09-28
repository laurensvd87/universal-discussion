import { applyCommand, createDemoState } from "../domain/demo-state.js";
import { discussionView } from "../domain/discussion-view.js";
import { fail } from "../domain/errors.js";
import { frozenClone, readExpectedVersion, readId } from "../domain/validation.js";

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
        topics: state.topics.map(({ id, title, kind }) => ({ id, title, kind })),
        sources: state.sources.map(({ id, url, title, provenance }) => ({
          id, url, title, provenance, topicId: topicIdFor(state, id),
        })),
      });
    },
    related(sourceId, limit = 5) {
      sourceId = readId(sourceId);
      if (!Number.isInteger(limit) || limit < 0 || limit > 100) fail("invalid", "Invalid request");
      const state = repository.load();
      const source = state.sources.find((entry) => entry.id === sourceId);
      if (!source) fail("not-found", "Object unavailable");
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
    command(expectedValue, command, actorId) {
      const expected = readExpectedVersion(expectedValue);
      const state = repository.load();
      if (state.generation !== expected.generation || state.revision !== expected.revision) fail("conflict", "State changed");
      const actor = actors.get(actorId);
      if (!actor) fail("forbidden", "Actor unavailable");
      const outcome = applyCommand(state, command, actor, { nextId, now });
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
