import { LIMITS, STATE_SCHEMA } from "./demo-state.js";
import { readBody } from "./validation.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE, MATCH_POLICY_VERSION, readLearnedEmbedding, readLearnedUrl } from "./learned-sources.js";

const TOPIC_KINDS = new Set(["general", "event", "product", "claim"]);
const ACTORS = new Set(["demo-alex", "demo-blair"]);
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export function assertValidPersistedState(state) {
  record(state, ["schema", "generation", "revision", "topics", "discussions", "contributions", "sources", "sourceLinks"]);
  if (state.schema !== STATE_SCHEMA || !integer(state.revision, 0)) invalid();
  text(state.generation, 128);
  array(state.topics, LIMITS.topics);
  array(state.discussions, LIMITS.topics);
  array(state.contributions, LIMITS.contributions);
  array(state.sources, 100);
  array(state.sourceLinks, 100);

  const topicIds = unique(state.topics, (topic) => {
    record(topic, ["id", "kind", "title", "createdAt", ...(topic.provenance === LEARNED_TOPIC_PROVENANCE ? ["provenance"] : [])]);
    text(topic.id, 128); text(topic.title, 200); text(topic.createdAt, 64);
    if (!TOPIC_KINDS.has(topic.kind)) invalid();
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
      if (source.extractorVersion !== EXTRACTOR_VERSION || source.policyVersion !== MATCH_POLICY_VERSION || !/^[a-f0-9]{64}$/u.test(source.operationDigest) || source.embedding?.modelId !== BROWSER_MODEL_ID) invalid();
      if (readLearnedUrl(source.url) !== source.url) invalid();
      readLearnedEmbedding(source.embedding);
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
    record(contribution, ["id", "discussionId", "rootId", "replyToId", "authorId", "actorType", "visibility", "withdrawn", "createdAt", "revisions"]);
    text(contribution.id, 128); text(contribution.discussionId, 128); text(contribution.createdAt, 64);
    if (!discussionIds.has(contribution.discussionId) || contribution.actorType !== "human" || contribution.visibility !== "local-public" || typeof contribution.withdrawn !== "boolean") invalid();
    if (contribution.rootId !== null) text(contribution.rootId, 128);
    if (contribution.replyToId !== null) text(contribution.replyToId, 128);
    array(contribution.revisions, LIMITS.revisions);
    if (contribution.withdrawn) {
      if (contribution.authorId !== null || contribution.revisions.length !== 0) invalid();
    } else {
      if (!ACTORS.has(contribution.authorId) || contribution.revisions.length === 0) invalid();
      for (const revision of contribution.revisions) {
        record(revision, ["body", "createdAt"]); readBody(revision.body); text(revision.createdAt, 64);
      }
    }
    return contribution.id;
  });
  for (const contribution of state.contributions) {
    if (contribution.rootId === null) {
      if (contribution.replyToId !== null) invalid();
      continue;
    }
    const root = state.contributions.find((entry) => entry.id === contribution.rootId);
    if (!root || root.rootId !== null || root.discussionId !== contribution.discussionId) invalid();
    if (contribution.replyToId !== null) {
      if (!contributionIds.has(contribution.replyToId)) invalid();
      const target = state.contributions.find((entry) => entry.id === contribution.replyToId);
      if (target.discussionId !== contribution.discussionId || (target.rootId ?? target.id) !== root.id) invalid();
    }
  }
  return state;
}

function record(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const keys = Object.keys(value).sort();
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) invalid();
}

function array(value, maximum) {
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
