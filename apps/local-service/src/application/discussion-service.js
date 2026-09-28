import { applyCommand, createDemoState } from "../domain/demo-state.js";
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
        sources: state.sources.map(({ id, url, title, topicId }) => ({ id, url, title, topicId })),
      });
    },
    related(sourceId, limit = 5) {
      sourceId = readId(sourceId);
      if (!Number.isInteger(limit) || limit < 0 || limit > 100) fail("invalid", "Invalid request");
      const state = repository.load();
      const source = state.sources.find((entry) => entry.id === sourceId);
      if (!source) fail("not-found", "Object unavailable");
      const results = ranking.rank(source, state.sources, limit).map(
        ({ id, url, title, topicId, relationship, method }) =>
          ({ id, url, title, topicId, relationship, method }),
      );
      return frozenClone({ version: version(state), model: ranking.model, results });
    },
    discussion(topicId) {
      topicId = readId(topicId);
      const state = repository.load();
      const topic = state.topics.find((entry) => entry.id === topicId);
      const discussion = state.discussions.find((entry) => entry.topicId === topicId);
      if (!topic || !discussion) fail("not-found", "Object unavailable");
      const contributions = state.contributions.filter((entry) => entry.discussionId === discussion.id);
      const roots = contributions.filter((entry) => entry.rootId === null).sort(newestFirst).map((root) => ({
        ...projectContribution(root),
        replies: contributions.filter((entry) => entry.rootId === root.id).sort(oldestFirst).map(projectContribution),
      }));
      return frozenClone({ version: version(state), topic: { id: topic.id, title: topic.title, kind: topic.kind }, discussionId: discussion.id, roots });
    },
    command(expectedValue, command, actorId) {
      const expected = readExpectedVersion(expectedValue);
      const state = repository.load();
      if (state.generation !== expected.generation || state.revision !== expected.revision) fail("conflict", "State changed");
      const next = applyCommand(state, command, this.actor(actorId), { nextId, now });
      return repository.save(expected, next);
    },
    reset(expectedValue, confirmation) {
      const expected = readExpectedVersion(expectedValue);
      if (confirmation !== "RESET DEMO STATE") fail("invalid", "Invalid request");
      const current = repository.load();
      if (current.generation !== expected.generation || current.revision !== expected.revision) fail("conflict", "State changed");
      const next = createDemoState({ generation: nextId("generation"), createdAt: now(), sources, topicSeeds });
      return repository.replace(expected, next);
    },
  });
}

function projectContribution(entry) {
  if (entry.withdrawn) return { id: entry.id, rootId: entry.rootId, replyToId: entry.replyToId, state: "deleted", label: "Deleted" };
  const latest = entry.revisions.at(-1);
  return {
    id: entry.id, rootId: entry.rootId, replyToId: entry.replyToId,
    state: "visible", authorId: entry.authorId, actorType: entry.actorType,
    body: latest.body, createdAt: entry.createdAt, edited: entry.revisions.length > 1,
  };
}

function newestFirst(left, right) {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function oldestFirst(left, right) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
