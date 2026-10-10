import { IMPORTED_INSIGHT_AUTHOR_ID, LIMITS, STATE_SCHEMA } from "./demo-state.js";
import { readBody } from "./validation.js";
import { operationDigestFor, sourceStamp } from "./source-threads.js";
import { BROWSER_MODEL_ID, compatibleExtractor, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE, MATCH_POLICY_VERSION, readLearnedEmbedding } from "./learned-sources.js";
import { ADAPTIVE_TOPIC_POLICY } from "./adaptive-topics.js";
import { inspectRetainedSourceDtoUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

const TOPIC_KINDS = new Set(["general", "event", "product", "claim"]);
const ACTORS = new Set(["demo-alex", "demo-blair"]);
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export function assertValidPersistedState(state) {
  return assertState(state, false);
}

export function assertValidLegacyPersistedState(state) {
  return assertState(state, true);
}

function assertState(state, legacy) {
  record(state, ["schema", "generation", "revision", "topics", "discussions", "contributions", "sources", "sourceLinks"]);
  if (state.schema !== (legacy ? "demo-state/v1" : STATE_SCHEMA) || !integer(state.revision, 0)) invalid();
  text(state.generation, 128);
  array(state.topics);
  array(state.discussions);
  array(state.contributions, LIMITS.contributions);
  array(state.sources);
  array(state.sourceLinks);

  const topicIds = unique(state.topics, (topic) => {
    record(topic, ["id", "kind", "title", "createdAt", ...(topic.provenance === LEARNED_TOPIC_PROVENANCE ? ["provenance", ...(!legacy ? ["retainTight"] : [])] : [])]);
    text(topic.id, 128); text(topic.title, 200); text(topic.createdAt, 64);
    if (!TOPIC_KINDS.has(topic.kind)) invalid();
    if (!legacy && topic.provenance === LEARNED_TOPIC_PROVENANCE && typeof topic.retainTight !== "boolean") invalid();
    return topic.id;
  });
  const discussionIds = unique(state.discussions, (discussion) => {
    record(discussion, ["id", "topicId"]);
    text(discussion.id, 128); text(discussion.topicId, 128);
    if (!topicIds.has(discussion.topicId)) invalid();
    return discussion.id;
  });
  if (discussionIds.size !== topicIds.size || new Set(state.discussions.map((entry) => entry.topicId)).size !== topicIds.size) invalid();

  const sourceIds = unique(state.sources, (source) => {
    const learned = source.provenance === LEARNED_SOURCE_PROVENANCE;
    record(source, ["id", "url", "title", "embedding", "provenance", ...(learned ? ["extractorVersion", "operationId", "operationDigest", "policyVersion"] : [])]);
    text(source.id, 128); text(source.title, 512); text(source.provenance, 128); validUrl(source.url);
    validEmbedding(source.embedding);
    if (learned) {
      text(source.title, 200); text(source.operationId, 128);
      if (!compatibleExtractor(source.extractorVersion) || !(legacy ? source.policyVersion === MATCH_POLICY_VERSION :
          [MATCH_POLICY_VERSION, ADAPTIVE_TOPIC_POLICY.version].includes(source.policyVersion)) ||
          !/^[a-f0-9]{64}$/u.test(source.operationDigest) || source.embedding?.modelId !== BROWSER_MODEL_ID) invalid();
      const retainedUrl = inspectRetainedSourceDtoUrl(source.url);
      if (!retainedUrl.supported || retainedUrl.url !== source.url) invalid();
      readLearnedEmbedding(source.embedding);
      if (source.operationDigest !== operationDigestFor(source)) invalid();
    }
    return source.id;
  });
  const linkedSources = new Set();
  for (const link of state.sourceLinks) {
    record(link, ["sourceId", "topicId", "method"]);
    text(link.sourceId, 128); text(link.topicId, 128); text(link.method, 64);
    if (!sourceIds.has(link.sourceId) || !topicIds.has(link.topicId) || linkedSources.has(link.sourceId)) invalid();
    const source = state.sources.find((item) => item.id === link.sourceId);
    if (source.provenance === LEARNED_SOURCE_PROVENANCE && !["learned-provisional", "manual-confirmed"].includes(link.method)) invalid();
    linkedSources.add(link.sourceId);
  }
  if (state.sources.some((source) => source.provenance === LEARNED_SOURCE_PROVENANCE && !linkedSources.has(source.id))) invalid();

  const contributionIds = unique(state.contributions, (contribution) => {
    record(contribution, ["id", "discussionId", "rootId", "replyToId", "authorId", "actorType", "visibility", "withdrawn", "createdAt", "revisions",
      ...(!legacy && Object.hasOwn(contribution, "insight") ? ["insight"] : []),
      ...(!legacy && contribution.rootId === null ? ["anchor", "originalTopicId", "learnedOrigin"] : []),
      ...(!legacy && Object.hasOwn(contribution, "originSourceId") ? ["originSourceId"] : [])]);
    text(contribution.id, 128); text(contribution.discussionId, 128); text(contribution.createdAt, 64);
    if (!discussionIds.has(contribution.discussionId) || !["human", "agent"].includes(contribution.actorType) ||
        (legacy && contribution.actorType !== "human") || contribution.visibility !== "local-public" || typeof contribution.withdrawn !== "boolean") invalid();
    if (contribution.actorType === "agent") {
      if (contribution.rootId !== null && contribution.insight?.kind !== "generated" && !contribution.withdrawn) invalid();
      if (contribution.withdrawn) {
        if (Object.hasOwn(contribution, "insight")) invalid();
      } else {
        record(contribution.insight, ["kind", "operatorId"]);
        if (!["manual-import", "generated"].includes(contribution.insight.kind) || !ACTORS.has(contribution.insight.operatorId) ||
            contribution.authorId !== IMPORTED_INSIGHT_AUTHOR_ID) invalid();
      }
    } else if (Object.hasOwn(contribution, "insight")) invalid();
    if (contribution.rootId !== null) text(contribution.rootId, 128);
    if (contribution.replyToId !== null) text(contribution.replyToId, 128);
    if (!legacy) {
      if (Object.hasOwn(contribution, "originSourceId")) {
        text(contribution.originSourceId, 128);
        if (contribution.withdrawn || !sourceIds.has(contribution.originSourceId)) invalid();
      }
      if (contribution.rootId === null) {
        text(contribution.originalTopicId, 128);
        if (typeof contribution.learnedOrigin !== "boolean") invalid();
        const anchor = contribution.anchor;
        const currentTopic = state.discussions.find((entry) => entry.id === contribution.discussionId)?.topicId;
        if (anchor?.kind === "topic") {
          record(anchor, ["kind", "topicId"]); text(anchor.topicId, 128);
          if (anchor.topicId !== currentTopic) invalid();
        } else if (anchor?.kind === "source") {
          record(anchor, ["kind", "sourceId", "stamp"]); text(anchor.sourceId, 128);
          const source = state.sources.find((entry) => entry.id === anchor.sourceId);
          if (contribution.withdrawn || contribution.originSourceId !== anchor.sourceId || !source ||
              contribution.learnedOrigin !== (source.provenance === LEARNED_SOURCE_PROVENANCE) ||
              !/^[a-f0-9]{64}$/u.test(anchor.stamp) || anchor.stamp !== sourceStamp(source) ||
              state.sourceLinks.find((entry) => entry.sourceId === source.id)?.topicId !== currentTopic) invalid();
        } else invalid();
      }
    }
    array(contribution.revisions, LIMITS.revisions);
    if (contribution.withdrawn) {
      if (contribution.authorId !== null || contribution.revisions.length !== 0) invalid();
    } else {
      if ((contribution.actorType === "human" && !ACTORS.has(contribution.authorId)) ||
          (contribution.actorType === "agent" && contribution.authorId !== IMPORTED_INSIGHT_AUTHOR_ID) ||
          contribution.revisions.length === 0) invalid();
      for (const revision of contribution.revisions) {
        record(revision, ["body", "createdAt"]); readBody(revision.body); text(revision.createdAt, 64);
      }
    }
    return contribution.id;
  });
  const contributionsById = new Map(state.contributions.map((entry) => [entry.id, entry]));
  for (const contribution of state.contributions) {
    if (contribution.rootId === null) {
      if (contribution.replyToId !== null) invalid();
      continue;
    }
    const root = contributionsById.get(contribution.rootId);
    if (!root || root.rootId !== null || root.discussionId !== contribution.discussionId) invalid();
    if (contribution.replyToId !== null) {
      if (!contributionIds.has(contribution.replyToId)) invalid();
      const target = contributionsById.get(contribution.replyToId);
      if (target.discussionId !== contribution.discussionId || (target.rootId ?? target.id) !== root.id) invalid();
      // Command-time targets already exist, but a persisted state must also
      // reject cycles introduced by corruption or a malformed import.
      const ancestors = new Set([contribution.id]);
      let ancestor = target;
      while (ancestor !== null) {
        if (ancestors.has(ancestor.id)) invalid();
        ancestors.add(ancestor.id);
        ancestor = ancestor.replyToId === null ? null : contributionsById.get(ancestor.replyToId);
        if (ancestor === undefined) invalid();
      }
    }
    // Generated replies may address any canonical message in this thread.
    // The existence, discussion, root ancestry and cycle checks above apply
    // equally to human and generated replies, including older withdrawn targets.
    if (contribution.actorType === "agent" && !contribution.withdrawn && contribution.replyToId === null) invalid();
  }
  return state;
}

function record(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const keys = Object.keys(value).sort();
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) invalid();
}

function array(value, maximum = Infinity) {
  if (!Array.isArray(value) || value.length > maximum) invalid();
}

function unique(values, inspect) {
  const result = new Set();
  for (const value of values) {
    const id = inspect(value);
    if (result.has(id)) invalid();
    result.add(id);
  }
  return result;
}

function integer(value, minimum) { return Number.isSafeInteger(value) && value >= minimum; }
function text(value, maximum) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() === "" || UNSAFE_TEXT.test(value)) invalid();
}
function validUrl(value) {
  text(value, 8_192);
  let url;
  try { url = new URL(value); } catch { invalid(); }
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) invalid();
}
function validEmbedding(value) {
  if (value === null) return;
  record(value, ["modelId", "values"]); text(value.modelId, 128); array(value.values, 1_536);
  if (value.values.length === 0 || value.values.some((entry) => !Number.isFinite(entry))) invalid();
}
function invalid() { throw new TypeError("Invalid persisted state"); }
