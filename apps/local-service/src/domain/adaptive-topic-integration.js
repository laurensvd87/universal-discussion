import { fail } from "./errors.js";
import { LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE } from "./learned-sources.js";
import { planAdaptiveTopics, ADAPTIVE_TOPIC_POLICY } from "./adaptive-topics.js";
import { readId } from "./validation.js";
import { routeSourceThreads } from "./source-threads.js";

// Reconcile the bounded pure plan into stable Topic identities and materialized
// root routing. All mutation remains inside the caller's one repository save.
export function applyAdaptiveTopicPlan(state, { nextId, now }, { planner = planAdaptiveTopics } = {}) {
  const learned = state.sources.filter((entry) => entry.provenance === LEARNED_SOURCE_PROVENANCE);
  const learnedIds = new Set(learned.map((entry) => entry.id));
  const topicsById = new Map(state.topics.map((entry) => [entry.id, entry]));
  const sourcesById = new Map(state.sources.map((entry) => [entry.id, entry]));
  const currentLinksBySource = new Map(state.sourceLinks.map((entry) => [entry.sourceId, entry]));
  const linksByTopic = new Map();
  for (const link of state.sourceLinks) {
    if (!linksByTopic.has(link.topicId)) linksByTopic.set(link.topicId, []);
    linksByTopic.get(link.topicId).push(link);
  }
  const oldLinks = new Map(state.sourceLinks.map((entry) => [entry.sourceId, { ...entry }]));
  const previousPartitions = state.topics.map((topic) => ({
    sourceIds: (linksByTopic.get(topic.id) ?? []).filter((link) => learnedIds.has(link.sourceId)).map((link) => link.sourceId),
    pinnedTopicId: (linksByTopic.get(topic.id) ?? []).some((link) => link.method === "manual-confirmed") ? topic.id : null,
    retainTight: topic.provenance === LEARNED_TOPIC_PROVENANCE ? topic.retainTight : false,
  })).filter((entry) => entry.sourceIds.length);
  const result = planner({ sources: state.sources, sourceLinks: state.sourceLinks, previousPartitions });
  if (result?.policyVersion !== ADAPTIVE_TOPIC_POLICY.version || !Array.isArray(result.partitions) ||
      result.partitions.length > learned.length) fail("invalid", "Invalid adaptive Topic plan");
  const seen = new Set();
  for (const part of result.partitions) {
    if (!Array.isArray(part?.sourceIds) || part.sourceIds.length === 0 ||
        typeof part.retainTight !== "boolean" || !(part.pinnedTopicId === null || typeof part.pinnedTopicId === "string")) {
      fail("invalid", "Invalid adaptive Topic plan");
    }
    for (const id of part.sourceIds) {
      if (!learnedIds.has(id) || seen.has(id)) fail("invalid", "Invalid adaptive Topic plan");
      seen.add(id);
    }
    const manualPins = new Set(part.sourceIds.filter((id) => oldLinks.get(id)?.method === "manual-confirmed")
      .map((id) => oldLinks.get(id).topicId));
    if (manualPins.size > 1 || (manualPins.size === 1 && !manualPins.has(part.pinnedTopicId))) fail("invalid", "Invalid adaptive Topic plan");
    if (manualPins.size === 0 && part.pinnedTopicId !== null) fail("invalid", "Invalid adaptive Topic plan");
    if (part.pinnedTopicId !== null && !topicsById.has(part.pinnedTopicId)) fail("invalid", "Invalid adaptive Topic plan");
  }
  if (seen.size !== learned.length) fail("invalid", "Incomplete adaptive Topic plan");

  const assignedTopics = new Set();
  const assignments = new Map();
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const ordered = [...result.partitions].sort((a, b) => compare(a.sourceIds.join("\0"), b.sourceIds.join("\0")));
  // Reserve manual destinations first, then keep maximum old membership overlap.
  for (const part of ordered.filter((entry) => entry.pinnedTopicId !== null)) {
    assignments.set(part, part.pinnedTopicId); assignedTopics.add(part.pinnedTopicId);
  }
  const overlaps = [];
  for (const part of ordered.filter((entry) => entry.pinnedTopicId === null)) {
    const counts = new Map();
    for (const id of part.sourceIds) {
      const old = oldLinks.get(id);
      if (!old || old.method !== "learned-provisional" || assignedTopics.has(old.topicId)) continue;
      const topic = topicsById.get(old.topicId);
      if (topic?.provenance !== LEARNED_TOPIC_PROVENANCE) continue;
      counts.set(old.topicId, (counts.get(old.topicId) ?? 0) + 1);
    }
    for (const [topicId, count] of counts) overlaps.push({ part, topicId, count });
  }
  overlaps.sort((a, b) => b.count - a.count || compare(a.topicId, b.topicId) ||
    compare(a.part.sourceIds.join("\0"), b.part.sourceIds.join("\0")));
  for (const { part, topicId } of overlaps) {
    if (!assignments.has(part) && !assignedTopics.has(topicId)) {
      assignments.set(part, topicId); assignedTopics.add(topicId);
    }
  }
  const allIds = new Set([...state.topics, ...state.discussions, ...state.sources, ...state.contributions].map((entry) => entry.id));
  function freshId(kind) {
    const id = readId(nextId(kind));
    if (allIds.has(id)) fail("conflict", "Identifier collision");
    allIds.add(id); return id;
  }
  for (const part of ordered) {
    let topicId = assignments.get(part);
    if (!topicId) {
      topicId = freshId("topic");
      const source = sourcesById.get(part.sourceIds[0]);
      const topic = { id: topicId, kind: "general", title: source.title, createdAt: now(),
        provenance: LEARNED_TOPIC_PROVENANCE, retainTight: part.retainTight };
      state.topics.push(topic); topicsById.set(topicId, topic);
      state.discussions.push({ id: freshId("discussion"), topicId });
    }
    const topic = topicsById.get(topicId);
    if (topic.provenance === LEARNED_TOPIC_PROVENANCE) topic.retainTight ||= part.retainTight;
    for (const sourceId of part.sourceIds) {
      const old = currentLinksBySource.get(sourceId);
      if (old) old.topicId = topicId;
      else {
        const link = { sourceId, topicId, method: "learned-provisional" };
        state.sourceLinks.push(link); currentLinksBySource.set(sourceId, link);
      }
      const source = sourcesById.get(sourceId);
      source.policyVersion = ADAPTIVE_TOPIC_POLICY.version;
    }
  }
  routeSourceThreads(state);
  return result;
}
