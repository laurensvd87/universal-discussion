// Pure /v1 validation. Only the explicit ingestion path accepts approved vectors.
import { inspectPageUrl, inspectRetainedSourceDtoUrl, PAGE_CONTENT_EXTRACTOR_VERSIONS } from "./page-content-policy.js";
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const KINDS = ["general", "event", "product", "claim"];
const ACTORS = ["demo-alex", "demo-blair"];
export const REFERENCE_TOPIC_POLICY = "ridge1-fixed-reference-radius/v1";
export const HIERARCHY_SOURCE_POLICY = "hierarchy-source-container/v1";
const LEARNED_POLICIES = ["provisional-all-source-cosine/v1", "adaptive-supported-partitions/v1", REFERENCE_TOPIC_POLICY, HIERARCHY_SOURCE_POLICY];
// Every valid catalog/prior-topic JSON row takes more than 32 bytes on the wire.
// The HTTP client rejects responses over 1 MiB, so this bounds direct projections
// without retaining the retired 100-row PoC ceiling.
export const MAX_CATALOG_ENTRIES = Math.floor(1_048_576 / 32);
// The shortest valid serialized ID array item is "a", plus its comma.
const MAX_RESULT_IDS = Math.floor(1_048_576 / 4);
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
function topicMemberships(value, primary) {
  const ids = array(value, MAX_CATALOG_ENTRIES, readId);
  if (primary === null || !ids.length || !ids.includes(primary) ||
      ids.some((id, index) => index > 0 && ids[index - 1] >= id)) invalid();
  return ids;
}
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
function retainedSourceDtoUrl(value) {
  text(value, 8192);
  if (/\s|\\/u.test(value)) invalid();
  if (inspectRetainedSourceDtoUrl(value).supported) return value;
  // Preserve the pre-existing synthetic Source fixture exception unchanged.
  return sourceUrl(value);
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
export function isAccountActorId(value) {
  return typeof value === "string" && /^account-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
}
export function readActorId(value) { return isAccountActorId(value) ? value : oneOf(value, ACTORS); }
export function readLimit(value) { if (!Number.isInteger(value) || value < 0 || value > 100) invalid(); return value; }
export function readPairingToken(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 512 || !/^[A-Za-z0-9._~+/-]+={0,2}$/u.test(value)) invalid();
  return value;
}
export function readSemanticReplyWitness(value) {
    const target = record(value, ["nodeId", "topicId", "rootRevision", "targetRevision"]);
    if (![target.rootRevision, target.targetRevision].every(value => Number.isSafeInteger(value) && value > 0)) invalid();
    return Object.freeze({ nodeId: text(target.nodeId, 160), topicId: readId(target.topicId),
      rootRevision: target.rootRevision, targetRevision: target.targetRevision });
}
export function readSemanticPublication(value) {
  const item=record(value,['semanticTarget','evidence','articleDigest','rootDigest','targetDigest','expiresAt']);
  const evidence=record(item.evidence,['sourceId','sourceVersion','operationId','operationDigest','sourceStamp']);
  const digest=value=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))invalid();return value;};
  if(typeof evidence.sourceVersion!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(evidence.sourceVersion)||
      BigInt(evidence.sourceVersion)>9223372036854775807n||!Number.isSafeInteger(item.expiresAt)||item.expiresAt<=0)invalid();
  return Object.freeze({semanticTarget:readSemanticReplyWitness(item.semanticTarget),
    evidence:Object.freeze({sourceId:readId(evidence.sourceId),sourceVersion:evidence.sourceVersion,
      operationId:readId(evidence.operationId),operationDigest:digest(evidence.operationDigest),sourceStamp:digest(evidence.sourceStamp)}),
    articleDigest:digest(item.articleDigest),rootDigest:digest(item.rootDigest),targetDigest:digest(item.targetDigest),expiresAt:item.expiresAt});
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
    case "share-insight":
      item = record(value, ["type", "topicId", "body", "operationId", "originSourceId"]);
      return { type: item.type, topicId: readId(item.topicId), body: text(item.body, 8000, true),
        operationId: readId(item.operationId), originSourceId: nullableId(item.originSourceId) };
    case "share-insight-reply":
      item = record(value, ["type", "topicId", "discussionId", "rootId", "replyToId", "body", "operationId", "originSourceId",
        ...(Object.hasOwn(value,'semanticPublication')?['semanticPublication']:[])]);
      const publication=Object.hasOwn(item,'semanticPublication')?readSemanticPublication(item.semanticPublication):null;
      if(publication&&(publication.semanticTarget.topicId!==item.topicId||item.originSourceId!==null&&item.originSourceId!==publication.evidence.sourceId))invalid();
      return { type: item.type, topicId: readId(item.topicId), discussionId: readId(item.discussionId),
        rootId: readId(item.rootId), replyToId: readId(item.replyToId), body: text(item.body, 8000, true),
        operationId: readId(item.operationId), originSourceId: nullableId(item.originSourceId),
        ...(publication?{semanticPublication:publication}:{}) };
    case "reply":
      item = record(value, ["type", "discussionId", "rootId", "replyToId", "body", ...(Object.hasOwn(value, "originSourceId") ? ["originSourceId"] : []),
        ...(Object.hasOwn(value, "semanticTarget") ? ["semanticTarget"] : [])]);
      if (Object.hasOwn(item, "semanticTarget") && item.replyToId === null) invalid();
      return { type: item.type, discussionId: readId(item.discussionId), rootId: readId(item.rootId), replyToId: nullableId(item.replyToId), body: text(item.body, 8000, true),
        ...(Object.hasOwn(item, "originSourceId") ? { originSourceId: nullableId(item.originSourceId) } : {}),
        ...(Object.hasOwn(item, "semanticTarget") ? { semanticTarget: readSemanticReplyWitness(item.semanticTarget) } : {}) };
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
  oneOf(item.protocol, ["local-service/v1"]); oneOf(item.capability, ["paired-demo", "paired-durable-v1"]);
  return item;
}
export function readSemanticCapabilities(value) {
  const item = record(value, ["protocol"]);
  oneOf(item.protocol, ["semantic-topics/v1"]);
  return Object.freeze(item);
}
export function readCatalog(value) {
  const item = record(value, ["version", "model", "actors", "topics", "sources"]);
  const actors = unique(array(item.actors, MAX_CATALOG_ENTRIES, (value) => {
    const actor = record(value, ["id", "displayName", "type"]);
    return { id: readActorId(actor.id), displayName: text(actor.displayName, 200), type: oneOf(actor.type, ["human"]) };
  }));
  const topics = unique(array(item.topics, MAX_CATALOG_ENTRIES, (value) => {
    const hasMarker = Object.hasOwn(value ?? {}, "learned");
    if (!hasMarker) return topic(value);
    const marked = record(value, ["id", "title", "kind", "learned"]);
    if (marked.learned !== true) invalid();
    return { ...topic({ id: marked.id, title: marked.title, kind: marked.kind }), learned: true };
  }));
  const topicIds = new Set(topics.map((item) => item.id));
  const sources = unique(array(item.sources, MAX_CATALOG_ENTRIES, (value) => {
    const hasMemberships = Object.hasOwn(value ?? {}, "topicIds");
    const hasPolicy = Object.hasOwn(value ?? {}, "assignmentPolicy");
    const source = record(value, ["id", "url", "title", "provenance", "topicId", ...(hasMemberships ? ["topicIds"] : []),
      ...(hasPolicy ? ["assignmentPolicy"] : [])]);
    const topicId = nullableId(source.topicId);
    if (topicId !== null && !topicIds.has(topicId)) invalid();
    const memberships = hasMemberships ? topicMemberships(source.topicIds, topicId) : null;
    if (memberships && (source.provenance !== "owner-local-page-embedding/v1" ||
        memberships.some(id => !topicIds.has(id)))) invalid();
    if (hasPolicy && (source.provenance !== "owner-local-page-embedding/v1" || !LEARNED_POLICIES.includes(source.assignmentPolicy))) invalid();
    if (source.assignmentPolicy === HIERARCHY_SOURCE_POLICY && !memberships) invalid();
    return { id: readId(source.id), url: retainedSourceDtoUrl(source.url), title: text(source.title, 512),
      provenance: oneOf(source.provenance, ["project-created-hand-authored-demo/1", "project-created-reserved-domain-bridge/1", "owner-local-page-embedding/v1"]), topicId,
      ...(memberships ? { topicIds: memberships } : {}), ...(hasPolicy ? { assignmentPolicy: source.assignmentPolicy } : {}) };
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
    return { id: readId(entry.id), url: retainedSourceDtoUrl(entry.url), title: text(entry.title, 512), topicId, relationship, method };
  }));
  return { version: readVersion(item.version), model: model(item.model), results };
}
export function readPriorDiscussions(value, sourceId) {
  const item = record(value, ["version", "sourceId", "currentTopicId", "topics"]);
  if (readId(item.sourceId) !== sourceId) invalid();
  const currentTopicId = nullableId(item.currentTopicId);
  const topics = unique(array(item.topics, MAX_CATALOG_ENTRIES, (value) => {
    const entry = record(value, ["id", "title", "kind", "rootCount"]);
    const projected = topic({ id: entry.id, title: entry.title, kind: entry.kind });
    if (projected.id === currentTopicId || !Number.isSafeInteger(entry.rootCount) ||
        entry.rootCount < 1 || entry.rootCount > 1000) invalid();
    return { ...projected, rootCount: entry.rootCount };
  }));
  return { version: readVersion(item.version), sourceId, currentTopicId, topics };
}
function contribution(value, rootId, isRoot, { preview = false, partial = false } = {}) {
  const state = Object.getOwnPropertyDescriptor(value ?? {}, "state")?.value;
  const fields = state === "deleted" ? ["id", "rootId", "replyToId", "state", "label"] :
    ["id", "rootId", "replyToId", "state", "authorId", "actorType", "body", "createdAt", "edited"];
  if (state === "visible" && Object.hasOwn(value ?? {}, "origin")) fields.push("origin");
  if (state === "visible" && Object.hasOwn(value ?? {}, "insight")) fields.push("insight");
  if (state === "visible" && isRoot && Object.hasOwn(value ?? {}, "regrouped")) fields.push("regrouped");
  const item = record(value, isRoot && !preview ? [...fields, "replies"] : fields);
  const projected = { id: readId(item.id), rootId: nullableId(item.rootId), replyToId: nullableId(item.replyToId), state: oneOf(item.state, ["deleted", "visible"]) };
  if (projected.rootId !== rootId || (isRoot && projected.replyToId !== null)) invalid();
  if (state === "deleted") projected.label = oneOf(item.label, ["Deleted by user"]);
  else {
    if (typeof item.edited !== "boolean" || typeof item.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item.createdAt) || !Number.isFinite(Date.parse(item.createdAt))) invalid();
    const actorType = oneOf(item.actorType, ["human", "agent"]);
    if (actorType === "agent") {
      if (item.authorId !== "demo-imported-ai" || !Object.hasOwn(item, "insight")) invalid();
      const insight = record(item.insight, ["kind", "operatorId"]);
      if (insight.kind !== "manual-import" && insight.kind !== "generated") invalid();
      if (!isRoot && insight.kind !== "generated") invalid();
      projected.insight = { kind: insight.kind, operatorId: readActorId(insight.operatorId) };
    } else if (Object.hasOwn(item, "insight")) invalid();
    Object.assign(projected, { authorId: actorType === "agent" ? item.authorId : readActorId(item.authorId), actorType,
      body: text(item.body, 8000, true), createdAt: item.createdAt, edited: item.edited });
    if (Object.hasOwn(item, "origin")) projected.origin = readPostOrigin(item.origin);
  }
  if (Object.hasOwn(item, "regrouped")) {
    if (item.regrouped !== true) invalid();
    projected.regrouped = true;
  }
  if (isRoot && !preview) projected.replies = array(item.replies, partial ? 50 : 1000, (reply) => contribution(reply, projected.id, false));
  return projected;
}
function semanticNode(value) { return text(value, 160); }
function semanticCursor(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(value)) invalid();
  return value;
}
function semanticRequest(value, thread) {
  const item = record(value, ["nodeId", ...(thread ? ["rootId"] : []), "limit", "cursor"]);
  if (!Number.isInteger(item.limit) || item.limit < 1 || item.limit > 50) invalid();
  return { nodeId: semanticNode(item.nodeId), ...(thread ? { rootId: readId(item.rootId) } : {}), limit: item.limit, cursor: semanticCursor(item.cursor) };
}
export function readSemanticFeedRequest(value) { return semanticRequest(value, false); }
export function readSemanticThreadRequest(value) { return semanticRequest(value, true); }
export function readSemanticTargetRequest(value) {
  const item = record(value, ["nodeId", "rootId", "targetId"]);
  return { nodeId: semanticNode(item.nodeId), rootId: readId(item.rootId), targetId: readId(item.targetId) };
}
function semanticActors(value, posts) {
  const actors = unique(array(value, 104, value => {
    const actor = record(value, ["id", "displayName", "type"]);
    return { id: readActorId(actor.id), displayName: text(actor.displayName, 200), type: oneOf(actor.type, ["human"]) };
  }));
  const ids = new Set(actors.map(a => a.id));
  const needed = new Set(posts.filter(post => post.state === "visible").map(post => post.actorType === "agent" ? post.insight.operatorId : post.authorId));
  if (ids.size !== needed.size || [...needed].some(id => !ids.has(id))) invalid();
  return actors;
}
function semanticHeader(item, expected) {
  if (!Number.isSafeInteger(item.policyRevision) || item.policyRevision < 0) invalid();
  const nodeId = semanticNode(item.nodeId);
  if (expected && nodeId !== expected.nodeId) invalid();
  return { version: readVersion(item.version), policyRevision: item.policyRevision, nodeId };
}
export function readSemanticFeed(value, expected = null) {
  const item = record(value, ["version", "policyRevision", "nodeId", "roots", "nextCursor", "actors"]);
  const header = semanticHeader(item, expected);
  const roots = array(item.roots, expected?.limit ?? 50, value => {
    const card = record(value, ["topic", "discussionId", "root"]), root = contribution(card.root, null, true, { preview: true });
    if (root.state !== "visible") invalid();
    return { topic: topic(card.topic), discussionId: readId(card.discussionId), root };
  });
  if (new Set(roots.map(card => card.root.id)).size !== roots.length) invalid();
  const destinations = new Map(), topics = new Map();
  for (const card of roots) {
    if (destinations.has(card.discussionId) && destinations.get(card.discussionId) !== card.topic.id ||
        topics.has(card.topic.id) && topics.get(card.topic.id) !== card.discussionId) invalid();
    destinations.set(card.discussionId, card.topic.id); topics.set(card.topic.id, card.discussionId);
  }
  return { ...header, roots, nextCursor: semanticCursor(item.nextCursor), actors: semanticActors(item.actors, roots.map(card => card.root)) };
}
function semanticThread(value, expected, target) {
  const item = record(value, ["version", "policyRevision", "nodeId", "topic", "discussionId", "root",
    ...(target ? ["targetId", "rootRevision", "targetRevision"] : ["nextCursor"]), "actors"]);
  const header = semanticHeader(item, expected), root = contribution(item.root, null, true, { partial: true });
  if (root.state !== "visible" || expected && root.id !== expected.rootId || root.replies.length > (target ? 1 : expected?.limit ?? 50)) invalid();
  unique([root, ...root.replies]);
  if (root.replies.some(reply => reply.id === reply.replyToId)) invalid();
  const tail = target ? { targetId: readId(item.targetId), rootRevision: item.rootRevision, targetRevision: item.targetRevision } : { nextCursor: semanticCursor(item.nextCursor) };
  if (target) {
    if (![tail.rootRevision, tail.targetRevision].every(n => Number.isSafeInteger(n) && n > 0) || expected && tail.targetId !== expected.targetId) invalid();
    if (tail.targetId === root.id) {
      if (root.replies.length !== 0 || tail.targetRevision !== tail.rootRevision) invalid();
    } else if (root.replies.length !== 1 || root.replies[0].id !== tail.targetId || root.replies[0].state !== "visible") invalid();
  }
  // A reply's parent may be on another page. Its root binding remains exact;
  // canonical destination comes from this card, never from the foreground page.
  return { ...header, topic: topic(item.topic), discussionId: readId(item.discussionId), root, ...tail,
    actors: semanticActors(item.actors, [root, ...root.replies]) };
}
export function readSemanticThread(value, expected = null) { return semanticThread(value, expected, false); }
export function readSemanticTarget(value, expected = null) { return semanticThread(value, expected, true); }
export function readSemanticTopicsRequest(value) { return freeze(record(value, [])); }
export function readSemanticContextRequest(value) {
  const item = record(value, ["sourceId"]);
  return freeze({ sourceId: readId(item.sourceId) });
}
function semanticPath(value, nonempty = false) {
  const path = array(value, 8, semanticNode);
  if (nonempty && path.length === 0 || new Set(path).size !== path.length) invalid();
  return path;
}
function semanticTopicCard(value) {
  const item = record(value, ["id", "title", "path"]), path = semanticPath(item.path, true), id = semanticNode(item.id);
  if (path.at(-1) !== id) invalid();
  return { id, title: text(item.title, 160), path };
}
function semanticPolicyRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
export function readSemanticTopics(value) {
  const item = record(value, ["version", "policyRevision", "topics"]);
  const topics = unique(array(item.topics, 512, semanticTopicCard)), byId = new Map(topics.map(card => [card.id, card]));
  // Owner cuts may omit intermediate nodes. Any ancestor that IS listed must
  // still describe the exact same declared ancestry prefix.
  for (const card of topics) for (let i = 0; i < card.path.length; i++) {
    const ancestor = byId.get(card.path[i]);
    if (ancestor && (ancestor.path.length !== i + 1 || ancestor.path.some((id, index) => id !== card.path[index]))) invalid();
  }
  return freeze({ version: readVersion(item.version), policyRevision: semanticPolicyRevision(item.policyRevision), topics });
}
export function readSemanticContext(value, expected = null) {
  const item = record(value, ["version", "policyRevision", "sourceId", "sourceVersion", "status", "supportedPath", "selectedPath", "topic"]);
  const sourceId = readId(item.sourceId), sourceVersion = item.sourceVersion;
  if (expected && sourceId !== expected.sourceId || typeof sourceVersion !== "string" ||
      !/^(0|[1-9][0-9]{0,18})$/u.test(sourceVersion) || BigInt(sourceVersion) > 9223372036854775807n) invalid();
  const status = oneOf(item.status, ["pending", "classified", "excluded"]), supportedPath = semanticPath(item.supportedPath), selectedPath = semanticPath(item.selectedPath);
  if (selectedPath.length > supportedPath.length || selectedPath.some((id, index) => id !== supportedPath[index]) ||
      status !== "classified" && (supportedPath.length || selectedPath.length)) invalid();
  const topic = item.topic === null ? null : semanticTopicCard(item.topic);
  if (selectedPath.length === 0 ? topic !== null : topic === null || topic.id !== selectedPath.at(-1) ||
      topic.path.length !== selectedPath.length || topic.path.some((id, index) => id !== selectedPath[index])) invalid();
  return freeze({ version: readVersion(item.version), policyRevision: semanticPolicyRevision(item.policyRevision), sourceId, sourceVersion,
    status, supportedPath, selectedPath, topic });
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
    const repliesById = new Map(root.replies.map((reply) => [reply.id, reply]));
    for (const reply of root.replies) {
      const seen = new Set();
      let current = reply;
      while (current.replyToId !== null && current.replyToId !== root.id) {
        if (seen.has(current.id)) invalid();
        seen.add(current.id);
        current = repliesById.get(current.replyToId);
        if (!current) invalid();
      }
    }
  }
  return { version: readVersion(item.version), topic: projectedTopic, discussionId: readId(item.discussionId), roots };
}
export function readAlternateDiscussion(value, sourceId, catalog, canonicalDiscussion) {
  const item = record(value, ["mode", "policyVersion", "representation", "version", "sourceId", "canonical", "sourceIds", "roots", "pinnedRoots"]);
  const mode = oneOf(item.mode, ["alternate-provisional", "canonical-pinned"]);
  const knownPolicy = item.representation === "owner-local-diagonal-adapter/v1"
    ? ["alternate-local-neighborhood/v1", "alternate-indexed-independent-evidence/v2"].includes(item.policyVersion)
    : item.representation === "owner-local-body-topic-metric/v1" && item.policyVersion === "alternate-indexed-body-metric/v1" ||
      item.representation === "owner-local-linear-teacher-transfer/ridge1-v1" &&
      ["ridge1-qualified-complete-link/v1", REFERENCE_TOPIC_POLICY].includes(item.policyVersion);
  if (!knownPolicy ||
      readId(item.sourceId) !== sourceId) invalid();
  const version = readVersion(item.version);
  if (!catalog || !canonicalDiscussion || version.generation !== catalog.version?.generation ||
      version.revision !== catalog.version?.revision || version.generation !== canonicalDiscussion.version?.generation ||
      version.revision !== canonicalDiscussion.version?.revision) invalid();
  const canonical = record(item.canonical, ["topic", "discussionId"]);
  const canonicalTopic = topic(canonical.topic);
  const current = catalog.sources.find((source) => source.id === sourceId);
  const referenceView = item.policyVersion === REFERENCE_TOPIC_POLICY;
  if (current?.provenance !== "owner-local-page-embedding/v1" || current.topicId !== canonicalTopic.id ||
      canonicalTopic.id !== canonicalDiscussion.topic.id || canonicalTopic.title !== canonicalDiscussion.topic.title ||
      canonicalTopic.kind !== canonicalDiscussion.topic.kind ||
      readId(canonical.discussionId) !== canonicalDiscussion.discussionId) invalid();
  if (referenceView !== Array.isArray(current.topicIds) ||
      referenceView && !current.topicIds.includes(canonicalTopic.id)) invalid();
  const sourceIds = array(item.sourceIds, MAX_CATALOG_ENTRIES, readId);
  if (!sourceIds.includes(sourceId) || new Set(sourceIds).size !== sourceIds.length ||
      (mode === "canonical-pinned" && (sourceIds.length !== 1 || sourceIds[0] !== sourceId)) ||
      sourceIds.some((id) => !catalog.sources.some((source) => source.id === id &&
        source.provenance === "owner-local-page-embedding/v1" && source.topicId !== null &&
        (!referenceView || source.topicIds?.some(id => current.topicIds.includes(id)))))) invalid();
  const allIds = new Set();
  function roots(value, pinned) {
    return array(value, 1000, (raw) => {
      const state = Object.getOwnPropertyDescriptor(raw ?? {}, "state")?.value;
      const fields = state === "deleted" ? ["id", "rootId", "replyToId", "state", "label", "replies"] :
        ["id", "rootId", "replyToId", "state", "authorId", "actorType", "body", "createdAt", "edited", "replies"];
      if (state === "visible" && Object.hasOwn(raw, "origin")) fields.push("origin");
      if (state === "visible" && Object.hasOwn(raw, "insight")) fields.push("insight");
      if (state === "visible" && Object.hasOwn(raw, "regrouped")) fields.push("regrouped");
      const { canonicalTopicId, canonicalDiscussionId, ...post } = record(raw,
        [...fields, "canonicalTopicId", "canonicalDiscussionId"]);
      const id = readId(canonicalTopicId);
      const topicRow = catalog.topics.find((entry) => entry.id === id);
      if (!topicRow || (pinned && id !== canonicalTopic.id) || referenceView && !current.topicIds.includes(id)) invalid();
      const discussionId = readId(canonicalDiscussionId);
      if (id === canonicalTopic.id && discussionId !== canonicalDiscussion.discussionId) invalid();
      const rendered = readDiscussion({ version, topic: { id: topicRow.id, title: topicRow.title, kind: topicRow.kind },
        discussionId, roots: [post] }, id).roots[0];
      for (const entry of [rendered, ...rendered.replies]) {
        if (allIds.has(entry.id)) invalid();
        allIds.add(entry.id);
      }
      if (!referenceView && !pinned && mode === "alternate-provisional" && rendered.origin && !sourceIds.includes(rendered.origin.sourceId)) invalid();
      return { ...rendered, canonicalTopicId: id, canonicalDiscussionId: discussionId };
    });
  }
  const projectedRoots = roots(item.roots, false);
  const pinnedRoots = roots(item.pinnedRoots, true);
  if (allIds.size > 1000 || (mode === "canonical-pinned" && pinnedRoots.length !== 0)) invalid();
  return { mode, policyVersion: item.policyVersion, representation: item.representation, version,
    sourceId, canonical: { topic: canonicalTopic, discussionId: canonical.discussionId }, sourceIds,
    roots: projectedRoots, pinnedRoots };
}
export function readEnrichmentRequest(value) {
  const item = record(value, ["sourceId", "topicId", "includeAlternate"]);
  if (typeof item.includeAlternate !== "boolean") invalid();
  return { sourceId: readId(item.sourceId), topicId: readId(item.topicId), includeAlternate: item.includeAlternate };
}
export function readEnrichment(value, request) {
  const input = readEnrichmentRequest(request);
  const item = record(value, ["catalog", "discussion", "related", "priorDiscussions", "alternateDiscussion", "errors"]);
  const catalog = readCatalog(item.catalog);
  const source = catalog.sources.find(source => source.id === input.sourceId);
  const topicRow = catalog.topics.find(topic => topic.id === input.topicId);
  if (!source || source.topicId !== input.topicId || !topicRow) invalid();
  const discussion = readDiscussion(item.discussion, input.topicId);
  const same = version => version.generation === catalog.version.generation && version.revision === catalog.version.revision;
  if (!same(discussion.version) || discussion.topic.title !== topicRow.title || discussion.topic.kind !== topicRow.kind) invalid();
  const rawErrors = record(item.errors, ["related", "prior", "alternate"]);
  const errors = {};
  for (const key of ["related", "prior", "alternate"]) errors[key] = rawErrors[key] === null ? null :
    oneOf(rawErrors[key], ["unavailable", "capacity", "conflict", "invalid-response"]);
  const present = (body, error) => { if ((body === null) !== (error !== null)) invalid(); };
  present(item.related, errors.related); present(item.priorDiscussions, errors.prior);
  let related = null, priorDiscussions = null, alternateDiscussion = null;
  if (item.related !== null) {
    related = readRelated(item.related, 20);
    if (!same(related.version)) invalid();
    for (const entry of related.results) {
      const row = catalog.sources.find(source => source.id === entry.id);
      if (!row || row.url !== entry.url || row.title !== entry.title || row.topicId !== entry.topicId) invalid();
    }
  }
  if (item.priorDiscussions !== null) {
    priorDiscussions = readPriorDiscussions(item.priorDiscussions, input.sourceId);
    if (!same(priorDiscussions.version) || priorDiscussions.currentTopicId !== input.topicId) invalid();
    for (const entry of priorDiscussions.topics) {
      const row = catalog.topics.find(topic => topic.id === entry.id);
      if (!row || row.title !== entry.title || row.kind !== entry.kind) invalid();
    }
  }
  if (!input.includeAlternate) {
    if (item.alternateDiscussion !== null || errors.alternate !== null) invalid();
  } else {
    present(item.alternateDiscussion, errors.alternate);
    if (item.alternateDiscussion !== null)
      alternateDiscussion = readAlternateDiscussion(item.alternateDiscussion, input.sourceId, catalog, discussion);
  }
  return { catalog, discussion, related, priorDiscussions, alternateDiscussion, errors };
}
export function readOutcome(value, commandType) {
  const item = record(value, ["version", "result"]);
  if (commandType === "correct-source") {
    const hasMemberships = Object.hasOwn(item.result ?? {}, "topicIds");
    const result = record(item.result, ["sourceId", "topicId", "previousTopicId", "assignment", "policyVersion", ...(hasMemberships ? ["topicIds"] : [])]);
    const memberships = hasMemberships ? topicMemberships(result.topicIds, result.topicId) : null;
    if ([REFERENCE_TOPIC_POLICY, HIERARCHY_SOURCE_POLICY].includes(result.policyVersion) && !memberships) invalid();
    return { version: readVersion(item.version), result: { sourceId: readId(result.sourceId), topicId: readId(result.topicId),
      previousTopicId: nullableId(result.previousTopicId), assignment: oneOf(result.assignment, ["confirmed"]),
      policyVersion: oneOf(result.policyVersion, LEARNED_POLICIES), ...(memberships ? { topicIds: memberships } : {}) } };
  }
  if (["forget-source", "delete-learned-topic", "clear-learned-data"].includes(commandType)) {
    const fields = commandType === "forget-source" ? ["sourceId"] : commandType === "delete-learned-topic" ? ["topicId", "forgottenSourceIds"] : ["forgottenSourceIds", "deletedTopicIds"];
    const result = record(item.result, fields);
    for (const key of fields) result[key] = key.endsWith("Ids") ? array(result[key], MAX_RESULT_IDS, readId) : readId(result[key]);
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
  const hasMemberships = Object.hasOwn(value ?? {}, "topicIds");
  const item = record(value, ["version", "sourceId", "topicId", "assignment", "policyVersion", ...(hasMemberships ? ["topicIds"] : [])]);
  const memberships = hasMemberships ? topicMemberships(item.topicIds, item.topicId) : null;
  if ([REFERENCE_TOPIC_POLICY, HIERARCHY_SOURCE_POLICY].includes(item.policyVersion) && !memberships) invalid();
  return { version: readVersion(item.version), sourceId: readId(item.sourceId), topicId: readId(item.topicId),
    assignment: oneOf(item.assignment, ["provisional", "confirmed"]),
    policyVersion: oneOf(item.policyVersion, LEARNED_POLICIES), ...(memberships ? { topicIds: memberships } : {}) };
}
export function readReset(value) { const item = record(value, ["version"]); return { version: readVersion(item.version) }; }
export function freeze(value) {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
