// A local, pure projection for an eventual private insight preview. Nothing here
// reads a page, contacts a provider, or treats relatedness as Topic membership.
import { readId, readPostOrigin, freeze } from "./local-service-contract.js";

const MAX_SOURCES = 100;
const MAX_ROOTS = 1000;
const DISPLAY_LIMIT = 5;
const BODY_LIMIT = 800;
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function invalid() { throw new TypeError("Invalid insight context"); }
function field(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) invalid();
  return descriptor.value;
}
function entries(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) invalid();
    return descriptor.value;
  });
}
function safeText(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || UNSAFE.test(value)) invalid();
  return value;
}
function sourceFromCatalog(value) {
  const id = readId(field(value, "id"));
  const topicId = field(value, "topicId");
  if (topicId !== null) readId(topicId);
  // This is the established URL and title safety gate. An unsafe catalog entry
  // is omitted, including if a local projection was constructed outside the client.
  try {
    const origin = readPostOrigin({ sourceId: id, url: field(value, "url"), title: field(value, "title") });
    return { id, url: origin.url, title: origin.title, topicId };
  } catch {
    return { id, topicId, unsafe: true };
  }
}
function sourceView(source) { return { id: source.id, url: source.url, title: source.title }; }
function byId(left, right) { return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }
function normalizedTitle(source) { return source.title.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim(); }
function host(source) { return new URL(source.url).hostname.replace(/^www\./u, ""); }
function diverseOrder(candidates, alreadySelected) {
  const remaining = [...candidates];
  const selected = [];
  const seenTitles = new Set(alreadySelected.map(normalizedTitle));
  const seenHosts = new Set(alreadySelected.map(host));
  while (remaining.length) {
    // Compare only the next three ranked alternatives; equal scores retain rank.
    let best = 0;
    let bestPenalty = Infinity;
    for (let index = 0; index < Math.min(remaining.length, 4); index++) {
      const candidate = remaining[index];
      const penalty = Number(seenTitles.has(normalizedTitle(candidate))) * 2 +
        Number(seenHosts.has(host(candidate)));
      if (penalty < bestPenalty) { best = index; bestPenalty = penalty; }
    }
    const [chosen] = remaining.splice(best, 1);
    selected.push(chosen);
    seenTitles.add(normalizedTitle(chosen));
    seenHosts.add(host(chosen));
  }
  return selected;
}

/** Build bounded, title/URL-only context from already loaded local projections. */
export function buildInsightContext({ catalog, discussion, related, sourceId, topicId, includeDiscussion = false }) {
  try {
    if (typeof includeDiscussion !== "boolean") invalid();
    readId(topicId);
    if (sourceId !== null) readId(sourceId);

    const topics = entries(field(catalog, "topics"), MAX_SOURCES);
    const selected = topics.filter((entry) => field(entry, "id") === topicId);
    if (selected.length !== 1) invalid();
    const topic = { id: topicId, title: safeText(field(selected[0], "title"), 200) };

    const sources = entries(field(catalog, "sources"), MAX_SOURCES).map(sourceFromCatalog);
    const ids = new Set();
    for (const source of sources) {
      if (ids.has(source.id)) invalid();
      ids.add(source.id);
    }
    const catalogById = new Map(sources.map((source) => [source.id, source]));
    const current = sourceId === null ? null : catalogById.get(sourceId);
    if (sourceId !== null && (!current || current.unsafe || current.topicId !== topicId)) invalid();

    const peers = sources.filter((source) => !source.unsafe && source.topicId === topicId && source.id !== sourceId).sort(byId);
    const peerIds = new Set(peers.map((source) => source.id));
    const rankedPeers = [];
    const rankedPeerIds = new Set();
    const relatedIds = new Set();
    const nominated = related === null && sourceId === null ? [] : entries(field(related, "results"), MAX_SOURCES);
    for (const result of nominated) {
      const id = readId(field(result, "id"));
      const source = catalogById.get(id);
      if (!source || source.unsafe || id === sourceId ||
          field(result, "topicId") !== source.topicId ||
          field(result, "url") !== source.url || field(result, "title") !== source.title) continue;
      const relationship = field(result, "relationship");
      if (peerIds.has(id) && (relationship === "same-topic" || relationship === "related") && !rankedPeerIds.has(id)) {
        rankedPeers.push(source);
        rankedPeerIds.add(id);
      } else if (!peerIds.has(id) && relationship === "related") {
        relatedIds.add(id);
      }
    }
    const sameTopicSources = diverseOrder([...rankedPeers, ...peers.filter((source) => !rankedPeerIds.has(source.id))], current ? [current] : []);
    const relatedSources = diverseOrder([...relatedIds].map((id) => catalogById.get(id)),
      current ? [current, ...sameTopicSources.slice(0, DISPLAY_LIMIT - 1)] : sameTopicSources.slice(0, DISPLAY_LIMIT));
    const sourceSlots = DISPLAY_LIMIT - Number(current !== null);

    const posts = [];
    if (includeDiscussion) {
      if (field(field(discussion, "topic"), "id") !== topicId) invalid();
      for (const root of entries(field(discussion, "roots"), MAX_ROOTS)) {
        if (field(root, "state") !== "visible") continue;
        if (field(root, "rootId") !== null || field(root, "replyToId") !== null) invalid();
        // A future projection with visibility metadata must opt in explicitly.
        if (Object.hasOwn(root, "visibility") && field(root, "visibility") !== "public") continue;
        const id = readId(field(root, "id"));
        const actorType = field(root, "actorType");
        if (actorType !== "human") continue;
        const body = field(root, "body");
        if (typeof body !== "string" || !body.trim() || body.length > 8000 ||
            UNSAFE.test(body.replace(/[\r\n\t]/gu, ""))) invalid();
        posts.push({ id, actorType, body: body.slice(0, BODY_LIMIT) });
        if (posts.length === DISPLAY_LIMIT) break;
      }
    }

    return freeze({
      schema: "insight-context/v1",
      topic,
      currentSource: current ? sourceView(current) : null,
      sameTopicSources: sameTopicSources.slice(0, sourceSlots).map(sourceView),
      relatedSources: relatedSources.slice(0, Math.max(0, sourceSlots - sameTopicSources.length)).map(sourceView),
      discussion: posts,
      coverage: { sameTopicTotal: peers.length, relatedTotal: relatedSources.length, discussionIncluded: includeDiscussion },
      limitations: ["grouping-provisional", "related-not-same-topic", "title-url-only", "sources-unverified", "visible-roots-only"],
    });
  } catch {
    // Validation errors must not echo page URLs, titles, post text, or secrets.
    invalid();
  }
}
