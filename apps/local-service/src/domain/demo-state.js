import { fail } from "./errors.js";
import { clone, readBody, readId, readRecord, readText } from "./validation.js";

export const STATE_SCHEMA = "demo-state/v1";
export const LIMITS = Object.freeze({ topics: 100, contributions: 1_000, revisions: 50 });
const TOPIC_KINDS = new Set(["general", "event", "product", "claim"]);

export function createDemoState({ generation, createdAt, sources, topicSeeds }) {
  const topics = topicSeeds.map((seed) => ({
    id: seed.id,
    kind: seed.kind,
    title: seed.title,
    createdAt,
  }));
  const discussions = topics.map((topic) => ({ id: `discussion-${topic.id}`, topicId: topic.id }));
  const sourceLinks = sources
    .filter((source) => source.topicId !== null)
    .map((source) => ({ sourceId: source.id, topicId: source.topicId, method: "fixture-confirmed" }));
  const sourceRecords = sources.map(({ id, url, title, embedding, provenance }) => ({
    id, url, title, embedding, provenance,
  }));
  return {
    schema: STATE_SCHEMA,
    generation,
    revision: 0,
    topics,
    discussions,
    contributions: [],
    sources: clone(sourceRecords),
    sourceLinks,
  };
}

function findDiscussion(state, discussionId) {
  const discussion = state.discussions.find((entry) => entry.id === discussionId);
  if (!discussion) fail("not-found", "Object unavailable");
  return discussion;
}

function findContribution(state, contributionId) {
  const contribution = state.contributions.find((entry) => entry.id === contributionId);
  if (!contribution) fail("not-found", "Object unavailable");
  return contribution;
}

function commandRecord(command, fields) {
  return readRecord(command, ["type", ...fields]);
}

export function applyCommand(state, command, actor, { nextId, now }) {
  if (!actor || actor.type !== "human" || actor.demo !== true) fail("forbidden", "Action unavailable");
  if (command === null || typeof command !== "object" || Array.isArray(command)) fail("invalid", "Invalid request");
  const prototype = Object.getPrototypeOf(command);
  const typeDescriptor = Object.getOwnPropertyDescriptor(command, "type");
  if (
    (prototype !== Object.prototype && prototype !== null) || !typeDescriptor ||
    !typeDescriptor.enumerable || !Object.hasOwn(typeDescriptor, "value")
  ) fail("invalid", "Invalid request");
  const type = readText(typeDescriptor.value, 64);
  const next = clone(state);
  const timestamp = now();
  let result;

  if (type === "create-topic") {
    const input = commandRecord(command, ["title", "kind"]);
    const title = readText(input.title, 200);
    if (!TOPIC_KINDS.has(input.kind)) fail("invalid", "Invalid request");
    if (next.topics.length >= LIMITS.topics) fail("capacity", "Capacity reached");
    const topicId = readId(nextId("topic"));
    const discussionId = readId(nextId("discussion"));
    ensureUnused(next, topicId, discussionId);
    next.topics.push({ id: topicId, title, kind: input.kind, createdAt: timestamp });
    next.discussions.push({ id: discussionId, topicId });
    result = { topicId, discussionId };
  } else if (type === "create-root") {
    const input = commandRecord(command, ["topicId", "body"]);
    const topicId = readId(input.topicId);
    const discussion = next.discussions.find((entry) => entry.topicId === topicId);
    if (!discussion) fail("not-found", "Object unavailable");
    const contributionId = readId(nextId("contribution"));
    ensureUnused(next, contributionId);
    addContribution(next, {
      id: contributionId, discussionId: discussion.id,
      rootId: null, replyToId: null, authorId: actor.id,
      body: readBody(input.body), timestamp,
    });
    result = { contributionId };
  } else if (type === "reply") {
    const input = commandRecord(command, ["discussionId", "rootId", "replyToId", "body"]);
    const discussion = findDiscussion(next, readId(input.discussionId));
    const root = findContribution(next, readId(input.rootId));
    if (root.discussionId !== discussion.id || root.rootId !== null || root.withdrawn) {
      fail("invalid", "Invalid request");
    }
    let replyToId = null;
    if (input.replyToId !== null) {
      const target = findContribution(next, readId(input.replyToId));
      const targetRoot = target.rootId ?? target.id;
      if (target.discussionId !== discussion.id || targetRoot !== root.id || target.withdrawn) {
        fail("invalid", "Invalid request");
      }
      replyToId = target.id;
    }
    const contributionId = readId(nextId("contribution"));
    ensureUnused(next, contributionId);
    addContribution(next, {
      id: contributionId, discussionId: discussion.id,
      rootId: root.id, replyToId, authorId: actor.id,
      body: readBody(input.body), timestamp,
    });
    result = { contributionId };
  } else if (type === "edit") {
    const input = commandRecord(command, ["contributionId", "body"]);
    const contribution = findContribution(next, readId(input.contributionId));
    if (contribution.withdrawn || contribution.authorId !== actor.id) fail("forbidden", "Action unavailable");
    if (contribution.revisions.length >= LIMITS.revisions) fail("capacity", "Capacity reached");
    contribution.revisions.push({ body: readBody(input.body), createdAt: timestamp });
    result = { contributionId: contribution.id };
  } else if (type === "withdraw") {
    const input = commandRecord(command, ["contributionId"]);
    const contribution = findContribution(next, readId(input.contributionId));
    if (contribution.withdrawn || contribution.authorId !== actor.id) fail("forbidden", "Action unavailable");
    contribution.withdrawn = true;
    contribution.authorId = null;
    contribution.revisions = [];
    result = { contributionId: contribution.id };
  } else {
    fail("forbidden", "Action unavailable");
  }
  next.revision += 1;
  return { state: next, result };
}

function ensureUnused(state, ...ids) {
  const existing = new Set([
    ...state.topics.map((entry) => entry.id),
    ...state.discussions.map((entry) => entry.id),
    ...state.contributions.map((entry) => entry.id),
    ...state.sources.map((entry) => entry.id),
  ]);
  if (new Set(ids).size !== ids.length || ids.some((id) => existing.has(id))) fail("conflict", "Identifier collision");
}

function addContribution(state, input) {
  if (state.contributions.length >= LIMITS.contributions) fail("capacity", "Capacity reached");
  state.contributions.push({
    id: input.id,
    discussionId: input.discussionId,
    rootId: input.rootId,
    replyToId: input.replyToId,
    authorId: input.authorId,
    actorType: "human",
    visibility: "local-public",
    withdrawn: false,
    createdAt: input.timestamp,
    revisions: [{ body: input.body, createdAt: input.timestamp }],
  });
}
