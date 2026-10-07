// A local, pure projection for an eventual private insight preview. Nothing here
// reads a page, contacts a provider, or treats relatedness as Topic membership.
import { readId, readPostOrigin, freeze, MAX_CATALOG_ENTRIES } from "./local-service-contract.js";

const MAX_RELATED_RESULTS = 100;
const MAX_ROOTS = 1000;
// One current Source and up to five selected public related Sources.
const DISPLAY_LIMIT = 6;
const MAX_LOCAL_CHOICES = 21;
const DISCUSSION_LIMIT = 5;
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
function isSearchResult(source) {
  const url = new URL(source.url);
  const path = url.pathname.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  // A publisher may use /search or /recherche for an ordinary article. Only
  // recognizable search-engine result/redirect URLs are omitted here.
  const google = /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/u.test(hostname);
  if (google) return path === "/search" && url.searchParams.has("q") || path === "/url";
  if (/^(?:www\.)?bing\.com$/u.test(hostname)) return path === "/search" && url.searchParams.has("q");
  if (/^(?:www\.|html\.)?duckduckgo\.com$/u.test(hostname)) return url.searchParams.has("q") &&
    (path === "/" || path === "/html/");
  if (hostname === "search.yahoo.com") return path === "/search" && url.searchParams.has("p");
  if (hostname === "search.brave.com") return path === "/search" && url.searchParams.has("q");
  return false;
}
// A publisher can expose the same article under several slugs or tracking URLs.
// Only a stable ID on the same host (or the same URL) is strong enough to merge
// those candidates; similar headlines alone can describe different events.
function articleKey(source) {
  const url = new URL(source.url);
  const path = url.pathname.replace(/\/+$/u, "") || "/";
  const finalNumber = /(?:^|\/|[-_,~])(\d{5,12})(?:\.[a-z0-9]{1,6})?$/iu.exec(path)?.[1];
  const explicitNumber = /\/(?:articles?|artikel|articolo|articulo|story|news)\/(\d{5,12})(?:\/|$)/iu.exec(path)?.[1];
  if (finalNumber || explicitNumber) return `${host(source)}#${explicitNumber || finalNumber}`;
  const parameters = new URLSearchParams(url.search);
  for (const key of [...parameters.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid|referrer)$/iu.test(key)) parameters.delete(key);
  }
  parameters.sort();
  return `${host(source)}${url.port ? `:${url.port}` : ""}${path}?${parameters}`;
}
const COMMON_TITLE_WORDS = new Set([
  "about", "after", "alle", "also", "auch", "avec", "beim", "being", "bereits", "dalla", "delle",
  "diese", "diesen", "durch", "einer", "eines", "erste", "gegen", "heeft", "ihren", "ihres", "into",
  "jeder", "keine", "later", "mehr", "nicht", "nieuw", "novel", "onder", "other", "over", "seine",
  "their", "there", "these", "those", "through", "unter", "voor", "waren", "where", "which",
  "while", "with", "worden", "world", "zich", "zonder",
]);
function wordsForRanking(value) {
  const words = value.normalize("NFKD").toLocaleLowerCase("und")
    .replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(words.filter((word) => {
    if (COMMON_TITLE_WORDS.has(word)) return false;
    if (/^\d+$/u.test(word)) return word.length >= 3 && !/^(?:19|20)\d{2}$/u.test(word);
    return word.length >= 5;
  }));
}
function publisherTokens(source) {
  const labels = new URL(source.url).hostname.split(".");
  return new Set(labels.flatMap((label) => [...wordsForRanking(label)]));
}
function titleTokens(source) {
  const tokens = wordsForRanking(source.title);
  for (const token of publisherTokens(source)) tokens.delete(token);
  return tokens;
}
function pathTokens(source) {
  const path = new URL(source.url).pathname;
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* Invalid encoding cannot promote a URL. */ }
  const tokens = wordsForRanking(decoded);
  for (const token of publisherTokens(source)) tokens.delete(token);
  return tokens;
}
// Rerank when headlines or article slugs share a distinctive detail. Slug
// overlaps have less weight than headline overlaps, and a broad actor/product
// word present in every candidate adds no score. With no shared detail the
// embedding order stays intact, including across languages and viewpoints.
function eventScores(current, candidates) {
  const scores = new Map();
  const evidenceCounts = new Map();
  const specificEvidence = new Map();
  if (!current || !candidates.length) return { scores, evidenceCounts, specificEvidence };
  const currentTitle = titleTokens(current);
  const currentPath = pathTokens(current);
  const candidateTitles = candidates.map(titleTokens);
  const candidatePaths = candidates.map(pathTokens);
  const frequency = new Map();
  for (let index = 0; index < candidates.length; index++) {
    for (const token of new Set([...candidateTitles[index], ...candidatePaths[index]])) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }
  for (let index = 0; index < candidates.length; index++) {
    let score = 0;
    let evidenceCount = 0;
    let titleOverlap = 0;
    let articleSlugDetail = false;
    for (const token of new Set([...candidateTitles[index], ...candidatePaths[index]])) {
      const inTitle = candidateTitles[index].has(token);
      const inPath = candidatePaths[index].has(token);
      const weight = currentTitle.has(token) && inTitle ? 1 :
        currentTitle.has(token) && inPath || currentPath.has(token) && inTitle ? 0.45 :
          currentPath.has(token) && inPath ? 0.25 : 0;
      if (weight > 0 && frequency.get(token) < candidates.length) {
        evidenceCount++;
        if (currentTitle.has(token) && inTitle) titleOverlap++;
        if (currentPath.has(token) && !currentTitle.has(token) && inTitle && token.length >= 7) {
          articleSlugDetail = true;
        }
      }
      score += weight * Math.log2((candidates.length + 1) / (frequency.get(token) + 1)) *
        Math.min(2, token.length / 6);
    }
    scores.set(candidates[index].id, score);
    evidenceCounts.set(candidates[index].id, evidenceCount);
    specificEvidence.set(candidates[index].id, titleOverlap >= 3 || articleSlugDetail && evidenceCount >= 2);
  }
  return { scores, evidenceCounts, specificEvidence };
}
function uniqueArticles(candidates, current = null) {
  const seen = new Set(current ? [articleKey(current)] : []);
  return candidates.filter((source) => {
    const key = articleKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function diverseOrder(candidates, alreadySelected, maximum = candidates.length, relevanceScores = new Map()) {
  const remaining = [...candidates];
  const selected = [];
  const seenTitles = new Set(alreadySelected.map(normalizedTitle));
  const seenHosts = new Set(alreadySelected.map(host));
  while (remaining.length && selected.length < maximum) {
    // Compare only the next three ranked alternatives; equal scores retain rank.
    let best = 0;
    let bestPenalty = Infinity;
    let bestScore = -Infinity;
    for (let index = 0; index < Math.min(remaining.length, 4); index++) {
      const candidate = remaining[index];
      const score = relevanceScores.get(candidate.id) || 0;
      const penalty = Number(seenTitles.has(normalizedTitle(candidate))) * 2 +
        Number(seenHosts.has(host(candidate)));
      if (score > bestScore || score === bestScore && penalty < bestPenalty) {
        best = index; bestPenalty = penalty; bestScore = score;
      }
    }
    const [chosen] = remaining.splice(best, 1);
    selected.push(chosen);
    seenTitles.add(normalizedTitle(chosen));
    seenHosts.add(host(chosen));
  }
  return selected;
}

/** Build bounded, title/URL-only context from already loaded local projections. */
export function buildInsightContext({ catalog, discussion, related, sourceId, topicId,
  includeDiscussion = false, excludedRelatedSourceIds = [], allowedRelatedSourceIds = null,
  sourceLimit = DISPLAY_LIMIT }) {
  try {
    if (typeof includeDiscussion !== "boolean") invalid();
    if (!Number.isInteger(sourceLimit) || sourceLimit < 1 || sourceLimit > MAX_LOCAL_CHOICES) invalid();
    const excluded = new Set(entries(excludedRelatedSourceIds, MAX_LOCAL_CHOICES).map(readId));
    const allowed = allowedRelatedSourceIds === null ? null :
      new Set(entries(allowedRelatedSourceIds, MAX_LOCAL_CHOICES).map(readId));
    readId(topicId);
    if (sourceId !== null) readId(sourceId);

    const topics = entries(field(catalog, "topics"), MAX_CATALOG_ENTRIES);
    const selected = topics.filter((entry) => field(entry, "id") === topicId);
    if (selected.length !== 1) invalid();
    const topic = { id: topicId, title: safeText(field(selected[0], "title"), 200) };

    const sources = entries(field(catalog, "sources"), MAX_CATALOG_ENTRIES).map(sourceFromCatalog);
    const ids = new Set();
    for (const source of sources) {
      if (ids.has(source.id)) invalid();
      ids.add(source.id);
    }
    const catalogById = new Map(sources.map((source) => [source.id, source]));
    const current = sourceId === null ? null : catalogById.get(sourceId);
    if (sourceId !== null && (!current || current.unsafe || current.topicId !== topicId)) invalid();

    const peers = sources.filter((source) => !source.unsafe && !isSearchResult(source) &&
      source.topicId === topicId &&
      source.id !== sourceId && (allowed === null || allowed.has(source.id))).sort(byId);
    const peerIds = new Set(peers.map((source) => source.id));
    const rankedPeers = [];
    const rankedPeerIds = new Set();
    const relatedIds = new Set();
    const nominated = related === null && sourceId === null ? [] : entries(field(related, "results"), MAX_RELATED_RESULTS);
    for (const result of nominated) {
      const id = readId(field(result, "id"));
      const source = catalogById.get(id);
      if (!source || source.unsafe || isSearchResult(source) ||
          id === sourceId || excluded.has(id) ||
          allowed !== null && !allowed.has(id) ||
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
    const peerCandidates = [...rankedPeers, ...peers.filter((source) => !excluded.has(source.id) && !rankedPeerIds.has(source.id))];
    const relatedCandidates = [...relatedIds].map((id) => catalogById.get(id));
    const candidates = uniqueArticles([...peerCandidates, ...relatedCandidates], current);
    const { scores, evidenceCounts, specificEvidence } = eventScores(current, candidates);
    const peerCandidateIds = new Set(peerCandidates.map((source) => source.id));
    const bestEvidenceScore = Math.max(0, ...[...scores].filter(([id]) =>
      specificEvidence.get(id)).map(([, score]) => score));
    const finalSelection = allowed !== null && sourceLimit <= DISPLAY_LIMIT;
    // When a specific event has strong title/slug support, do not pad its
    // source list with unrelated zero-evidence pages merely to fill five slots.
    // With no strong support, keep vector-ranked candidates available for
    // translations or opposing views that share no literal words.
    const strongEvidence = bestEvidenceScore >= 1.5;
    const evidenceFloor = strongEvidence && finalSelection ? Math.max(1, bestEvidenceScore * 0.5) : 0;
    const ranked = candidates.map((source, index) => ({ source, index, score: scores.get(source.id) || 0 }))
      .filter((entry) => entry.score >= evidenceFloor &&
        (!strongEvidence || !finalSelection || specificEvidence.get(entry.source.id)))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const ordered = diverseOrder(ranked.map((entry) => entry.source), current ? [current] : [], sourceLimit, scores);
    const sourceSlots = sourceLimit - Number(current !== null);
    // Only strong event evidence narrows the final request. Without it, keep
    // the vector-ranked fallback so translated/opposing views remain possible.
    const chosen = ordered.slice(0, sourceSlots);
    const sameTopicSources = chosen.filter((source) => peerCandidateIds.has(source.id));
    const relatedSources = chosen.filter((source) => !peerCandidateIds.has(source.id));

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
        if (posts.length === DISCUSSION_LIMIT) break;
      }
    }

    return freeze({
      schema: "insight-context/v1",
      topic,
      currentSource: current ? sourceView(current) : null,
      sameTopicSources: sameTopicSources.map(sourceView),
      relatedSources: relatedSources.map(sourceView),
      discussion: posts,
      coverage: { sameTopicTotal: peers.length, relatedTotal: relatedCandidates.length, discussionIncluded: includeDiscussion },
      limitations: ["grouping-provisional", "related-not-same-topic", "title-url-only", "sources-unverified", "visible-roots-only"],
    });
  } catch {
    // Validation errors must not echo page URLs, titles, post text, or secrets.
    invalid();
  }
}
