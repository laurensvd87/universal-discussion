// Pure /v1 validation. Only the explicit ingestion path accepts approved vectors.
import { inspectPageUrl, PAGE_CONTENT_EXTRACTOR_VERSIONS } from "./page-content-policy.js";
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const KINDS = ["general", "event", "product", "claim"];
const ACTORS = ["demo-alex", "demo-blair"];
const LEARNED_POLICIES = ["provisional-all-source-cosine/v1", "adaptive-supported-partitions/v1"];
function invalid() { throw new TypeError("Invalid local service value"); }

export function record(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) invalid();
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) invalid();
    result[key] = descriptor.value;
  }
  return result;
}
function text(value, max, multiline = false) {
  if (typeof value !== "string" || !value.trim() || value.length > max || UNSAFE.test(multiline ? value.replace(/[\r\n\t]/gu, "") : value)) invalid();
  return value;
}
export function readId(value) {
  text(value, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value)) invalid();
  return value;
}
export function readVersion(value) {
  const item = record(value, ["generation", "revision"]);
  if (!Number.isSafeInteger(item.revision) || item.revision < 0) invalid();
  return { generation: readId(item.generation), revision: item.revision };
}
function array(value, max, project) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) invalid();
    return project(descriptor.value);
  });
}
function unique(items) {
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid();
  return items;
}
function oneOf(value, values) { if (!values.includes(value)) invalid(); return value; }
function nullableId(value) { return value === null ? null : readId(value); }
function sourceUrl(value) {
  text(value, 8192);
  if (/\s|\\/u.test(value)) invalid();
  const url = new URL(value);
  // Preserve fixture compatibility; other Sources require the ADR-018 URL policy.
  if (inspectPageUrl(value).supported) return value;
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port ||
      !(url.hostname.endsWith(".example") || ["example.com", "example.org"].includes(url.hostname))) invalid();
  return value;
}
export function readPostOrigin(value) {
  const item = record(value, ["sourceId", "url", "title"]);
  const url = sourceUrl(item.url);
  const parsed = new URL(url);
  if (parsed.hash || parsed.toString() !== url) invalid();
  if (!inspectPageUrl(url).supported) {
    // Reserved fixture hosts retain compatibility, but never bypass the same
    // private-path and credential-query checks applied to public Sources.
    parsed.hostname = "example.com";
    if (!inspectPageUrl(parsed.toString()).supported) invalid();
  }
  return { sourceId: readId(item.sourceId), url, title: text(item.title, 512) };
}
function model(value) {
  const item = record(value, ["id", "status"]);
  if (item.status === "fixture-only" && item.id === "hand-authored-demo-vectors/1") return item;
  if (item.status === "model-unavailable" && item.id === null) return item;
  if (item.status === "experimental-local" && item.id === "e5-small-q8-browser-main-prefix-v1") return item;
  invalid();
}
function topic(value) {
  const item = record(value, ["id", "title", "kind"]);
  return { id: readId(item.id), title: text(item.title, 200), kind: oneOf(item.kind, KINDS) };
}
export function readActorId(value) { return oneOf(value, ACTORS); }
export function readLimit(value) { if (!Number.isInteger(value) || value < 0 || value > 100) invalid(); return value; }
export function readPairingToken(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 512 || !/^[A-Za-z0-9._~+/-]+={0,2}$/u.test(value)) invalid();
  return value;
}
export function readCommand(value) {
  if (!value || typeof value !== "object") invalid();
  const type = Object.getOwnPropertyDescriptor(value, "type");
  if (!type?.enumerable || !Object.hasOwn(type, "value")) invalid();
  let item;
  switch (type.value) {
    case "create-topic":
      item = record(value, ["type", "title", "kind"]);
      return { type: item.type, title: text(item.title, 200), kind: oneOf(item.kind, KINDS) };
    case "create-root":
      item = record(value, ["type", "topicId", "body", ...(Object.hasOwn(value, "originSourceId") ? ["originSourceId"] : [])]);
      return { type: item.type, topicId: readId(item.topicId), body: text(item.body, 8000, true),
        ...(Object.hasOwn(item, "originSourceId") ? { originSourceId: nullableId(item.originSourceId) } : {}) };
    case "reply":
      item = record(value, ["type", "discussionId", "rootId", "replyToId", "body", ...(Object.hasOwn(value, "originSourceId") ? ["originSourceId"] : [])]);
      return { type: item.type, discussionId: readId(item.discussionId), rootId: readId(item.rootId), replyToId: nullableId(item.replyToId), body: text(item.body, 8000, true),
        ...(Object.hasOwn(item, "originSourceId") ? { originSourceId: nullableId(item.originSourceId) } : {}) };
    case "edit":
      item = record(value, ["type", "contributionId", "body"]);
      return { type: item.type, contributionId: readId(item.contributionId), body: text(item.body, 8000, true) };
    case "withdraw":
      item = record(value, ["type", "contributionId"]);
      return { type: item.type, contributionId: readId(item.contributionId) };
    case "correct-source":
      item = record(value, ["type", "sourceId", "topicId"]);
      return { type: item.type, sourceId: readId(item.sourceId), topicId: nullableId(item.topicId) };
    case "forget-source":
      item = record(value, ["type", "sourceId"]);
      return { type: item.type, sourceId: readId(item.sourceId) };
    case "delete-learned-topic":
      item = record(value, ["type", "topicId", "confirmation"]);
      return { type: item.type, topicId: readId(item.topicId), confirmation: oneOf(item.confirmation, ["DELETE TOPIC AND DISCUSSION"]) };
    case "clear-learned-data":
      item = record(value, ["type", "confirmation"]);
      return { type: item.type, confirmation: oneOf(item.confirmation, ["CLEAR LEARNED DATA"]) };
    default: invalid();
  }
}
export function readConfirmation(value) { return oneOf(value, ["RESET DEMO STATE"]); }
export function readHealth(value) {
  const item = record(value, ["protocol", "capability"]);
  oneOf(item.protocol, ["local-service/v1"]); oneOf(item.capability, ["paired-demo"]);
  return item;
}
export function readCatalog(value) {
  const item = record(value, ["version", "model", "actors", "topics", "sources"]);
  const actors = unique(array(item.actors, 2, (value) => {
    const actor = record(value, ["id", "displayName", "type"]);
    return { id: readActorId(actor.id), displayName: text(actor.displayName, 200), type: oneOf(actor.type, ["human"]) };
  }));
  const topics = unique(array(item.topics, 100, (value) => {
    const hasMarker = Object.hasOwn(value ?? {}, "learned");
    if (!hasMarker) return topic(value);
    const marked = record(value, ["id", "title", "kind", "learned"]);
    if (marked.learned !== true) invalid();
    return { ...topic({ id: marked.id, title: marked.title, kind: marked.kind }), learned: true };
  }));
  const topicIds = new Set(topics.map((item) => item.id));
  const sources = unique(array(item.sources, 100, (value) => {
    const source = record(value, ["id", "url", "title", "provenance", "topicId"]);
    const topicId = nullableId(source.topicId);
    if (topicId !== null && !topicIds.has(topicId)) invalid();
    return { id: readId(source.id), url: sourceUrl(source.url), title: text(source.title, 512),
      provenance: oneOf(source.provenance, ["project-created-hand-authored-demo/1", "project-created-reserved-domain-bridge/1", "owner-local-page-embedding/v1"]), topicId };
  }));
  return { version: readVersion(item.version), model: model(item.model), actors, topics, sources };
}
export function readRelated(value, limit) {
  const item = record(value, ["version", "model", "results"]);
  const results = unique(array(item.results, limit, (value) => {
    const entry = record(value, ["id", "url", "title", "topicId", "relationship", "method"]);
    const relationship = oneOf(entry.relationship, ["same-topic", "related"]);
    const method = oneOf(entry.method, [relationship === "same-topic" ? "confirmed-topic" : "vector-similarity"]);
    const topicId = nullableId(entry.topicId);
    if (relationship === "same-topic" && topicId === null) invalid();
    return { id: readId(entry.id), url: sourceUrl(entry.url), title: text(entry.title, 512), topicId, relationship, method };
  }));
  return { version: readVersion(item.version), model: model(item.model), results };
}
function contribution(value, rootId, isRoot) {
  const state = Object.getOwnPropertyDescriptor(value ?? {}, "state")?.value;
  const fields = state === "deleted" ? ["id", "rootId", "replyToId", "state", "label"] :
    ["id", "rootId", "replyToId", "state", "authorId", "actorType", "body", "createdAt", "edited"];
  if (state === "visible" && Object.hasOwn(value ?? {}, "origin")) fields.push("origin");
  if (state === "visible" && isRoot && Object.hasOwn(value ?? {}, "regrouped")) fields.push("regrouped");
  const item = record(value, isRoot ? [...fields, "replies"] : fields);
  const projected = { id: readId(item.id), rootId: nullableId(item.rootId), replyToId: nullableId(item.replyToId), state: oneOf(item.state, ["deleted", "visible"]) };
  if (projected.rootId !== rootId || (isRoot && projected.replyToId !== null)) invalid();
  if (state === "deleted") projected.label = oneOf(item.label, ["Deleted"]);
  else {
    if (typeof item.edited !== "boolean" || typeof item.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item.createdAt) || !Number.isFinite(Date.parse(item.createdAt))) invalid();
    Object.assign(projected, { authorId: readActorId(item.authorId), actorType: oneOf(item.actorType, ["human"]),
      body: text(item.body, 8000, true), createdAt: item.createdAt, edited: item.edited });
    if (Object.hasOwn(item, "origin")) projected.origin = readPostOrigin(item.origin);
  }
  if (Object.hasOwn(item, "regrouped")) {
    if (item.regrouped !== true) invalid();
    projected.regrouped = true;
  }
  if (isRoot) projected.replies = array(item.replies, 1000, (reply) => contribution(reply, projected.id, false));
  return projected;
}
export function readDiscussion(value, topicId) {
  const item = record(value, ["version", "topic", "discussionId", "roots"]);
  const projectedTopic = topic(item.topic);
  if (projectedTopic.id !== topicId) invalid();
  const roots = array(item.roots, 1000, (root) => contribution(root, null, true));
  const all = roots.flatMap((root) => [root, ...root.replies]);
  if (all.length > 1000) invalid();
  unique(all);
  for (const root of roots) {
    const ids = new Set([root.id, ...root.replies.map((reply) => reply.id)]);
    if (root.replies.some((reply) => reply.replyToId !== null && !ids.has(reply.replyToId))) invalid();
  }
  return { version: readVersion(item.version), topic: projectedTopic, discussionId: readId(item.discussionId), roots };
}
export function readOutcome(value, commandType) {
  const item = record(value, ["version", "result"]);
  if (commandType === "correct-source") {
    const result = record(item.result, ["sourceId", "topicId", "previousTopicId", "assignment", "policyVersion"]);
    return { version: readVersion(item.version), result: { sourceId: readId(result.sourceId), topicId: readId(result.topicId),
      previousTopicId: nullableId(result.previousTopicId), assignment: oneOf(result.assignment, ["confirmed"]),
      policyVersion: oneOf(result.policyVersion, LEARNED_POLICIES) } };
  }
  if (["forget-source", "delete-learned-topic", "clear-learned-data"].includes(commandType)) {
    const fields = commandType === "forget-source" ? ["sourceId"] : commandType === "delete-learned-topic" ? ["topicId", "forgottenSourceIds"] : ["forgottenSourceIds", "deletedTopicIds"];
    const result = record(item.result, fields);
    for (const key of fields) result[key] = key.endsWith("Ids") ? array(result[key], 100, readId) : readId(result[key]);
    return { version: readVersion(item.version), result };
  }
  const fields = commandType === "create-topic" ? ["topicId", "discussionId"] : ["contributionId"];
  const result = record(item.result, fields);
  for (const field of fields) result[field] = readId(result[field]);
  return { version: readVersion(item.version), result };
}
export function readIngestion(value) {
  const item = record(value, ["expected", "operationId", "url", "title", "embedding", "extractorVersion"]);
  const url = inspectPageUrl(item.url);
  if (!url.supported || url.url !== item.url) invalid();
  const embedding = record(item.embedding, ["modelId", "values"]);
  oneOf(embedding.modelId, ["e5-small-q8-browser-main-prefix-v1"]);
  const values = array(embedding.values, 384, (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1.001) invalid();
    return value;
  });
  if (values.length !== 384 || Math.abs(Math.hypot(...values) - 1) > 0.001) invalid();
  return { expected: readVersion(item.expected), operationId: readId(item.operationId), url: url.url,
    title: text(item.title, 200), embedding: { modelId: embedding.modelId, values },
    extractorVersion: oneOf(item.extractorVersion, PAGE_CONTENT_EXTRACTOR_VERSIONS) };
}
export function readIngestionOutcome(value) {
  const item = record(value, ["version", "sourceId", "topicId", "assignment", "policyVersion"]);
  return { version: readVersion(item.version), sourceId: readId(item.sourceId), topicId: readId(item.topicId),
    assignment: oneOf(item.assignment, ["provisional", "confirmed"]),
    policyVersion: oneOf(item.policyVersion, LEARNED_POLICIES) };
}
export function readReset(value) { const item = record(value, ["version"]); return { version: readVersion(item.version) }; }
export function freeze(value) {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
