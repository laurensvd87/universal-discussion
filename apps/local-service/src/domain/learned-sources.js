import { fail } from "./errors.js";
import { clone, readExpectedVersion, readId, readRecord, readText } from "./validation.js";
import { LIMITS } from "./demo-state.js";
import { inspectPageUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

export const LEARNED_SOURCE_PROVENANCE = "owner-local-page-embedding/v1";
export const LEARNED_TOPIC_PROVENANCE = "owner-local-learned-topic/v1";
export const BROWSER_MODEL_ID = "e5-small-q8-browser-main-prefix-v1";
export const EXTRACTOR_VERSION = "main-text-prefix/v1";
export const MATCH_POLICY_VERSION = "provisional-all-source-cosine/v1";
export const MATCH_POLICY = Object.freeze({ minSimilarity: 0.94, distinctTopicMargin: 0.04 });
export const LEARNED_COMMANDS = new Set(["correct-source", "forget-source", "delete-learned-topic", "clear-learned-data"]);

export function readLearnedUrl(value) {
  readText(value, 2048);
  // The shared reader owns public-site/context exclusions. This backend does
  // not fetch the URL or claim it can identify authentication from a string.
  const inspected = inspectPageUrl(value);
  if (!inspected?.supported) fail("invalid", "Unsupported page context");
  return inspected.url;
}

function denseNumbers(values) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype || values.length !== 384) fail("invalid", "Invalid request");
  const descriptors = Object.getOwnPropertyDescriptors(values);
  if (Reflect.ownKeys(descriptors).length !== 385) fail("invalid", "Invalid request");
  const result = [];
  for (let index = 0; index < 384; index += 1) {
    const item = descriptors[index];
    if (!item || !Object.hasOwn(item, "value") || !item.enumerable || !Number.isFinite(item.value)) fail("invalid", "Invalid request");
    result.push(item.value);
  }
  return result;
}

export function readLearnedEmbedding(value) {
  const input = readRecord(value, ["modelId", "values"]);
  if (input.modelId !== BROWSER_MODEL_ID) fail("invalid", "Unsupported model space");
  const values = denseNumbers(input.values);
  // Browser output is already L2 normalized. Permit floating-point noise, not
  // arbitrary magnitude or a zero vector; canonicalize accepted small drift.
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.01) fail("invalid", "Invalid request");
  return { modelId: input.modelId, values: values.map((value) => value / norm) };
}

export function readLearnedIngest(value) {
  const input = readRecord(value, ["expected", "operationId", "url", "title", "embedding", "extractorVersion"]);
  if (input.extractorVersion !== EXTRACTOR_VERSION) fail("invalid", "Unsupported extractor version");
  return {
    expected: readExpectedVersion(input.expected), operationId: readId(input.operationId),
    url: readLearnedUrl(input.url), title: readText(input.title, 200),
    embedding: readLearnedEmbedding(input.embedding), extractorVersion: input.extractorVersion,
  };
}

function freshId(state, nextId, kind) {
  const id = readId(nextId(kind));
  if ([...state.topics, ...state.discussions, ...state.contributions, ...state.sources].some((item) => item.id === id)) fail("conflict", "Identifier collision");
  return id;
}
function createLearnedTopic(state, title, { nextId, now }) {
  if (state.topics.length >= LIMITS.topics) fail("capacity", "Capacity reached");
  const topicId = freshId(state, nextId, "topic");
  state.topics.push({ id: topicId, kind: "general", title, createdAt: now(), provenance: LEARNED_TOPIC_PROVENANCE });
  const discussionId = freshId(state, nextId, "discussion");
  state.discussions.push({ id: discussionId, topicId });
  return topicId;
}
function cosine(left, right) {
  return Math.max(-1, Math.min(1, left.reduce((sum, value, index) => sum + value * right[index], 0)));
}
function provisionalTopic(state, embedding) {
  const scores = [];
  for (const topic of state.topics.filter((item) => item.provenance === LEARNED_TOPIC_PROVENANCE)) {
    const sourceIds = new Set(state.sourceLinks.filter((link) => link.topicId === topic.id).map((link) => link.sourceId));
    const members = state.sources.filter((source) => sourceIds.has(source.id));
    // Never expand a Topic via a single neighbor or a mixed vector space.
    if (!members.length || members.some((source) => source.provenance !== LEARNED_SOURCE_PROVENANCE || source.embedding.modelId !== embedding.modelId || source.extractorVersion !== EXTRACTOR_VERSION)) continue;
    const similarities = members.map((source) => cosine(embedding.values, source.embedding.values));
    scores.push({ topicId: topic.id, score: Math.min(...similarities) });
  }
  scores.sort((left, right) => right.score - left.score || (left.topicId < right.topicId ? -1 : 1));
  const first = scores[0];
  if (!first || first.score < MATCH_POLICY.minSimilarity) return null;
  // Ambiguity uses the closest compatible member of every other Topic, even
  // a Topic whose other members made it ineligible for automatic expansion.
  // A low cluster minimum must not hide a competing near-identical Source.
  const competing = state.sources.filter((source) => source.provenance === LEARNED_SOURCE_PROVENANCE && source.embedding.modelId === embedding.modelId && source.extractorVersion === EXTRACTOR_VERSION && state.sourceLinks.some((link) => link.sourceId === source.id && link.topicId !== first.topicId));
  if (competing.some((source) => first.score - cosine(embedding.values, source.embedding.values) < MATCH_POLICY.distinctTopicMargin)) return null;
  return first.topicId;
}

export function ingestionResult(state, source) {
  const link = state.sourceLinks.find((item) => item.sourceId === source.id);
  if (!link) fail("not-found", "Object unavailable");
  return { sourceId: source.id, topicId: link.topicId, assignment: link.method === "manual-confirmed" ? "confirmed" : "provisional", policyVersion: source.policyVersion };
}

export function applyLearnedIngest(state, input, operationDigest, dependencies) {
  const next = clone(state);
  let source = next.sources.find((item) => item.url === input.url);
  if (source && source.provenance !== LEARNED_SOURCE_PROVENANCE) fail("forbidden", "Source unavailable for ingestion");
  if (!source && next.sources.length >= 100) fail("capacity", "Capacity reached");
  if (!source) {
    const topicId = provisionalTopic(next, input.embedding) ?? createLearnedTopic(next, input.title, dependencies);
    source = { id: freshId(next, dependencies.nextId, "source"), url: input.url, title: input.title,
      embedding: input.embedding, provenance: LEARNED_SOURCE_PROVENANCE,
      extractorVersion: input.extractorVersion, operationId: input.operationId, operationDigest, policyVersion: MATCH_POLICY_VERSION };
    next.sources.push(source);
    next.sourceLinks.push({ sourceId: source.id, topicId, method: "learned-provisional" });
  } else {
    // Stable assignment on revisit/update: content drift cannot move a comment
    // destination or override an owner's confirmed association automatically.
    Object.assign(source, { title: input.title, embedding: input.embedding, extractorVersion: input.extractorVersion,
      operationId: input.operationId, operationDigest });
  }
  next.revision += 1;
  return { state: next, result: ingestionResult(next, source) };
}

function learnedSource(state, sourceId) {
  const source = state.sources.find((item) => item.id === readId(sourceId));
  if (!source || source.provenance !== LEARNED_SOURCE_PROVENANCE) fail("not-found", "Object unavailable");
  return source;
}
function removeSources(state, ids) {
  const removed = new Set(ids);
  state.sources = state.sources.filter((source) => !removed.has(source.id));
  state.sourceLinks = state.sourceLinks.filter((link) => !removed.has(link.sourceId));
}
function removeTopics(state, ids) {
  const removed = new Set(ids);
  const discussions = new Set(state.discussions.filter((discussion) => removed.has(discussion.topicId)).map((discussion) => discussion.id));
  state.contributions = state.contributions.filter((contribution) => !discussions.has(contribution.discussionId));
  state.discussions = state.discussions.filter((discussion) => !discussions.has(discussion.id));
  state.topics = state.topics.filter((topic) => !removed.has(topic.id));
}

export function applyLearnedCommand(state, value, dependencies) {
  const next = clone(state);
  const type = value.type;
  let result;
  if (type === "correct-source") {
    const input = readRecord(value, ["type", "sourceId", "topicId"]);
    const source = learnedSource(next, input.sourceId);
    const link = next.sourceLinks.find((item) => item.sourceId === source.id);
    const previousTopicId = link.topicId;
    const topicId = input.topicId === null ? createLearnedTopic(next, source.title, dependencies) : readId(input.topicId);
    if (!next.topics.some((topic) => topic.id === topicId)) fail("not-found", "Object unavailable");
    link.topicId = topicId; link.method = "manual-confirmed";
    result = { ...ingestionResult(next, source), previousTopicId };
  } else if (type === "forget-source") {
    const input = readRecord(value, ["type", "sourceId"]);
    const source = learnedSource(next, input.sourceId);
    removeSources(next, [source.id]);
    result = { sourceId: source.id };
  } else if (type === "delete-learned-topic") {
    const input = readRecord(value, ["type", "topicId", "confirmation"]);
    if (input.confirmation !== "DELETE TOPIC AND DISCUSSION") fail("invalid", "Invalid request");
    const topicId = readId(input.topicId);
    if (!next.topics.some((topic) => topic.id === topicId && topic.provenance === LEARNED_TOPIC_PROVENANCE)) fail("forbidden", "Topic unavailable for deletion");
    const forgottenSourceIds = next.sourceLinks.filter((link) => link.topicId === topicId).map((link) => link.sourceId);
    if (forgottenSourceIds.some((id) => next.sources.find((source) => source.id === id)?.provenance !== LEARNED_SOURCE_PROVENANCE)) fail("forbidden", "Topic unavailable for deletion");
    removeSources(next, forgottenSourceIds); removeTopics(next, [topicId]);
    result = { topicId, forgottenSourceIds };
  } else if (type === "clear-learned-data") {
    const input = readRecord(value, ["type", "confirmation"]);
    if (input.confirmation !== "CLEAR LEARNED DATA") fail("invalid", "Invalid request");
    const forgottenSourceIds = next.sources.filter((source) => source.provenance === LEARNED_SOURCE_PROVENANCE).map((source) => source.id);
    const deletedTopicIds = next.topics.filter((topic) => topic.provenance === LEARNED_TOPIC_PROVENANCE).map((topic) => topic.id);
    removeSources(next, forgottenSourceIds); removeTopics(next, deletedTopicIds);
    result = { forgottenSourceIds, deletedTopicIds };
  } else fail("forbidden", "Action unavailable");
  next.revision += 1;
  return { state: next, result };
}
