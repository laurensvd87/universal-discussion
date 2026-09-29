import { createHash } from "node:crypto";
import { fail } from "./errors.js";
import { readId } from "./validation.js";

const LEARNED = "owner-local-page-embedding/v1";

export function sourceStamp(source) {
  return createHash("sha256").update(JSON.stringify({
    url: source.url, embedding: source.embedding, extractorVersion: source.extractorVersion ?? null,
  })).digest("hex");
}

export function operationDigestFor(input) {
  return createHash("sha256").update(JSON.stringify({ url: input.url, title: input.title,
    embedding: input.embedding, extractorVersion: input.extractorVersion })).digest("hex");
}

export function contributionOrigin(state, sourceId, topicId) {
  if (sourceId === undefined || sourceId === null) return null;
  const id = readId(sourceId);
  const source = state.sources.find((entry) => entry.id === id);
  const link = state.sourceLinks.find((entry) => entry.sourceId === id);
  if (!source || link?.topicId !== topicId) fail("invalid", "Source is not linked to destination");
  return source;
}

export function rootAssociation(topicId, source) {
  return {
    anchor: source ? { kind: "source", sourceId: source.id, stamp: sourceStamp(source) } : { kind: "topic", topicId },
    originalTopicId: topicId,
    learnedOrigin: source?.provenance === LEARNED,
  };
}

function currentTopic(state, root) {
  const discussion = state.discussions.find((entry) => entry.id === root.discussionId);
  if (!discussion) fail("invalid", "Root destination unavailable");
  return discussion.topicId;
}

export function pinSourceRoots(state, sourceId) {
  for (const root of state.contributions) {
    if (root.rootId === null && root.anchor?.kind === "source" && root.anchor.sourceId === sourceId) {
      root.anchor = { kind: "topic", topicId: currentTopic(state, root) };
    }
  }
}

export function removeSourceOrigins(state, sourceIds) {
  const ids = new Set(sourceIds);
  for (const id of ids) pinSourceRoots(state, id);
  for (const entry of state.contributions) {
    if (ids.has(entry.originSourceId)) delete entry.originSourceId;
  }
}

export function withdrawAssociation(state, contribution) {
  delete contribution.originSourceId;
  if (contribution.rootId === null) {
    contribution.anchor = { kind: "topic", topicId: currentTopic(state, contribution) };
  }
}

// Materialized routing is changed once for the entire subtree. IDs, bodies,
// authors and reply topology never change, and replies never select destination.
export function routeSourceThreads(state) {
  for (const root of state.contributions.filter((entry) => entry.rootId === null)) {
    let topicId;
    if (root.anchor.kind === "source") {
      const source = state.sources.find((entry) => entry.id === root.anchor.sourceId);
      if (!source || sourceStamp(source) !== root.anchor.stamp) {
        root.anchor = { kind: "topic", topicId: currentTopic(state, root) };
      } else topicId = state.sourceLinks.find((entry) => entry.sourceId === source.id)?.topicId;
    }
    topicId ??= root.anchor.kind === "topic" ? root.anchor.topicId : null;
    if (!topicId) fail("invalid", "Root destination unavailable");
    const discussion = state.discussions.find((entry) => entry.topicId === topicId);
    if (!discussion) fail("invalid", "Root destination unavailable");
    for (const entry of state.contributions) {
      if (entry.id === root.id || entry.rootId === root.id) entry.discussionId = discussion.id;
    }
  }
}

export function purgeLearnedThreads(state) {
  const roots = new Set(state.contributions.filter((entry) => entry.rootId === null && entry.learnedOrigin).map((entry) => entry.id));
  state.contributions = state.contributions.filter((entry) => !roots.has(entry.rootId ?? entry.id));
}
