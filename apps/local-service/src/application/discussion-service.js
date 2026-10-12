import { applyCommand, createDemoState } from "../domain/demo-state.js";
import { discussionView } from "../domain/discussion-view.js";
import { priorDiscussionsView } from "../domain/prior-discussions.js";
import { fail } from "../domain/errors.js";
import { frozenClone, readExpectedVersion, readId, readRecord } from "../domain/validation.js";
import { operationDigestFor, sourceStamp } from "../domain/source-threads.js";
import { rankRelatedSources } from "../../../../spikes/topic-resolution/browser/core/related-sources.js";
import { applyLearnedCommand, applyLearnedIngest, BROWSER_MODEL_ID, compatibleExtractor, ingestionResult, LEARNED_COMMANDS, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE, readLearnedIngest } from "../domain/learned-sources.js";
import { createOwnerTopicPlanner } from "../domain/owner-topic-planner.js";
import { createSnapshotTopicPlanner } from "../domain/alternate-topic-cache.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";
import { isAccountPrincipal, ACCOUNT_COMMANDS, isAccountActor } from "../accounts/account-principal.js";
import { createCanonicalPages } from "./canonical-pages.js";

export const DEMO_ACTORS = Object.freeze([
  Object.freeze({ id: "demo-alex", displayName: "Alex · synthetic", type: "human", demo: true }),
  Object.freeze({ id: "demo-blair", displayName: "Blair · synthetic", type: "human", demo: true }),
]);
const ALTERNATE_SOURCE_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export function createDiscussionService({ repository, ranking, sources, topicSeeds, nextId, now,
  alternateAdapter = null, alternateBodyMetric = null, alternateRidgeAdapter = null,
  resolveAccountActor = null, readAccountActors = () => [] }) {
  const actors = new Map(DEMO_ACTORS.map((actor) => [actor.id, actor]));
  function actorFor(actorId) {
    const actor = isAccountActor(actorId) && typeof resolveAccountActor === "function"
      ? resolveAccountActor(actorId.slice("account-".length)) : actors.get(actorId);
    if (!actor || (isAccountActor(actorId) && (!isAccountPrincipal(actor) || actor.id !== actorId)))
      fail("forbidden", "Actor unavailable");
    return actor;
  }
  let ownerPlanner = null;
  if (alternateAdapter !== null || alternateBodyMetric !== null || alternateRidgeAdapter !== null) {
    try { ownerPlanner = createOwnerTopicPlanner({ diagonalAdapter: alternateAdapter, bodyMetric: alternateBodyMetric,
      ridgeAdapter: alternateRidgeAdapter }); }
    catch { /* Invalid selected weights disable only the experimental read. */ }
  }
  const alternatePlan = createSnapshotTopicPlanner(state => ownerPlanner.plan(state));
  function version(state) { return { generation: state.generation, revision: state.revision }; }
  const normalized = typeof repository.saveScoped === "function";
  const pages = createCanonicalPages(repository);
  function catalogProjection(state) {
    const links = new Map(state.sourceLinks.map(link => [link.sourceId, link.topicId]));
    return frozenClone({ version: version(state), model: ranking.model,
      actors: [...DEMO_ACTORS, ...readAccountActors().filter(isAccountPrincipal)]
        .map(({ id, displayName, type }) => ({ id, displayName, type })),
      topics: state.topics.map(({ id, title, kind, provenance }) => ({
        id, title, kind, ...(provenance === LEARNED_TOPIC_PROVENANCE ? { learned: true } : {}),
      })),
      sources: state.sources.map(({ id, url, title, provenance }) => ({
        id, url, title, provenance, topicId: links.get(id) ?? null,
      })),
    });
  }
  function topicState(topicId) {
    return normalized ? repository.readTopicState(topicId) : repository.load();
  }
  function metadataScope(sourceIds, topicIds, expected) {
    const sources = [...sourceIds], topics = [...topicIds];
    const collected = { topics: new Map(), discussions: new Map(), sources: new Map(), sourceLinks: new Map() };
    let state;
    for (let offset = 0; offset < Math.max(sources.length, topics.length, 1); offset += 500) {
      state = repository.readMetadataScope({ sourceIds: sources.slice(offset, offset + 500),
        topicIds: topics.slice(offset, offset + 500), expectedVersion: expected });
      for (const [name, values] of Object.entries(collected))
        for (const entry of state[name]) values.set(name === "sourceLinks" ? entry.sourceId : entry.id, entry);
    }
    return { schema: state.schema, ...expected, ...Object.fromEntries(Object.entries(collected)
      .map(([name, entries]) => [name, [...entries.values()]])), contributions: [] };
  }
  // Exact vector retrieval is deliberately retained for the current matching
  // algorithm. It scans vectors, never all contribution bodies/revisions.
  let rankingSnapshot = null;
  function rankingState() {
    if (!normalized) return repository.load();
    const expected = repository.version();
    if (rankingSnapshot && sameVersion(rankingSnapshot, expected)) return rankingSnapshot;
    const state = { schema: "demo-state/v2", ...expected, topics: [], discussions: [],
      sources: [], sourceLinks: [], contributions: [] };
    const topics = new Map(), discussions = new Map();
    let after = null;
    do {
      const page = repository.readCatalogPage({ kind: "sources", after, limit: 500, expectedVersion: expected });
      const metadata = repository.readMetadataScope({ sourceIds: page.items.map(source => source.id), expectedVersion: expected });
      state.sources.push(...page.items); state.sourceLinks.push(...metadata.sourceLinks);
      for (const topic of metadata.topics) topics.set(topic.id, topic);
      for (const discussion of metadata.discussions) discussions.set(discussion.id, discussion);
      after = page.nextCursor;
    } while (after !== null);
    state.topics = [...topics.values()]; state.discussions = [...discussions.values()];
    rankingSnapshot = state;
    return state;
  }
  function scopeForCommand(command, type) {
    const field = key => {
      const descriptor = Object.getOwnPropertyDescriptor(command, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail("invalid", "Invalid request");
      return readId(descriptor.value);
    };
    if (type === "create-topic") return repository.readMetadataScope({});
    if (["create-root", "share-insight"].includes(type)) return repository.readTopicState(field("topicId"));
    if (["reply", "share-insight-reply", "edit", "withdraw"].includes(type)) {
      const scope = repository.readContributionState(field(["reply", "share-insight-reply"].includes(type) ? "rootId" : "contributionId"));
      const target = scope.contributions.find(entry => entry.id === field(["reply", "share-insight-reply"].includes(type) ? "rootId" : "contributionId"));
      if (!target) fail("not-found", "Object unavailable");
      const topicId = scope.discussions.find(entry => entry.id === target.discussionId)?.topicId;
      return repository.readTopicState(topicId);
    }
    return repository.load();
  }

  const api = Object.freeze({
    actor(actorId) {
      return actorFor(actorId);
    },
    catalog() {
      const state = repository.load();
      return catalogProjection(state);
    },
    version() { return frozenClone(typeof repository.version === "function" ? repository.version() : version(repository.load())); },
    exactSource(sourceId) {
      sourceId = readId(sourceId);
      const state = normalized ? repository.readMetadataScope({ sourceIds: [sourceId] }) : repository.load();
      const source = catalogProjection(state).sources.find(entry => entry.id === sourceId);
      if (!source) fail("not-found", "Object unavailable");
      return frozenClone(source);
    },
    catalogContext(value) {
      const input = readRecord(value, ["sourceId", "topicId"]);
      let sourceId = input.sourceId === null ? null : readId(input.sourceId);
      let topicId = input.topicId === null ? null : readId(input.topicId);
      if (!normalized) {
        const state = repository.load();
        if (sourceId !== null && !state.sources.some(source => source.id === sourceId) ||
            topicId !== null && !state.topics.some(topic => topic.id === topicId)) fail("not-found", "Object unavailable");
        if (sourceId !== null && topicId !== null && topicIdFor(state, sourceId) !== topicId) fail("conflict", "State changed");
        return catalogProjection(state);
      }
      const expected = repository.version();
      const sourceIds = new Set(), topicIds = new Set();
      if (sourceId !== null) {
        const current = repository.readMetadataScope({ sourceIds: [sourceId], expectedVersion: expected });
        if (!current.sources.some(source => source.id === sourceId)) fail("not-found", "Object unavailable");
        const linkedTopic = topicIdFor(current, sourceId);
        if (topicId !== null && linkedTopic !== topicId) fail("conflict", "State changed");
        topicId ??= linkedTopic; sourceIds.add(sourceId);
        for (const result of api.related(sourceId, 20).results) sourceIds.add(result.id);
        const prior = api.priorDiscussions(sourceId);
        if (!sameVersion(prior.version, expected)) fail("conflict", "State changed");
        for (const topic of prior.topics) topicIds.add(topic.id);
        // The client validates every alternate group member and canonical root
        // destination. Include their exact metadata, not just nearest neighbours,
        // so a bounded initial catalog cannot disable a valid Ridge projection.
        const source = current.sources.find(entry => entry.id === sourceId);
        if (ownerPlanner && source.provenance === LEARNED_SOURCE_PROVENANCE &&
            current.sourceLinks.find(link => link.sourceId === sourceId)?.method === "learned-provisional") {
          let group;
          try { group = alternatePlan(rankingState()).partitions.find(part => part.sourceIds.includes(sourceId)); }
          catch { /* An unavailable alternate view never changes canonical scope. */ }
          for (const id of group?.sourceIds ?? []) sourceIds.add(id);
        }
      }
      if (topicId !== null) {
        topicIds.add(topicId);
        for (const source of repository.readTopicSources(topicId, { limit: 100, expectedVersion: expected }).items) sourceIds.add(source.id);
      } else if (sourceId === null) {
        for (const topic of repository.readCatalogPage({ kind: "topics", limit: 100, expectedVersion: expected }).items) topicIds.add(topic.id);
        for (const source of repository.readCatalogPage({ kind: "sources", limit: 100, expectedVersion: expected }).items) sourceIds.add(source.id);
      }
      const catalog = catalogProjection(metadataScope(sourceIds, topicIds, expected));
      if (Buffer.byteLength(JSON.stringify(catalog), "utf8") > MAX_RESPONSE_BYTES - 4096) fail("capacity", "Catalog context capacity reached");
      return catalog;
    },
    catalogPage(value) {
      if (!normalized) fail("unavailable", "Paged catalog requires normalized storage");
      const input = readRecord(value, ["kind", "limit", "cursor"]);
      if (!["topics", "sources"].includes(input.kind) || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) fail("invalid", "Invalid request");
      const expected = repository.version();
      const after = readCatalogCursor(input.cursor, input.kind, input.limit, expected);
      const page = repository.readCatalogPage({ kind: input.kind, limit: input.limit, after, expectedVersion: expected });
      const scope = repository.readMetadataScope({ [input.kind === "topics" ? "topicIds" : "sourceIds"]: page.items.map(item => item.id), expectedVersion: expected });
      let included = page.items.length;
      let result;
      do {
        const ids = new Set(page.items.slice(0, included).map(item => item.id));
        const sources = input.kind === "sources" ? scope.sources.filter(source => ids.has(source.id)) : [];
        const sourceIds = new Set(sources.map(source => source.id));
        const links = scope.sourceLinks.filter(link => sourceIds.has(link.sourceId));
        const topics = input.kind === "topics" ? ids : new Set(links.map(link => link.topicId));
        result = { catalog: catalogProjection({ ...scope, sources, sourceLinks: links,
          topics: scope.topics.filter(topic => topics.has(topic.id)) }),
          nextCursor: included < page.items.length || page.nextCursor !== null ?
            Buffer.from(JSON.stringify({ schema: "catalog-page/v1", kind: input.kind, limit: input.limit,
              version: expected, after: page.items[included - 1]?.id })).toString("base64url") : null };
        if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_RESPONSE_BYTES - 4096) return frozenClone(result);
        included--;
      } while (included > 0);
      fail("capacity", "Catalog page capacity reached");
    },
    // A private Insight can outlive unrelated catalog writes, but remains bound
    // to the exact captured Source representation and its current Topic.
    insightAnchor(topicId, sourceId) {
      topicId = readId(topicId);
      sourceId = readId(sourceId);
      const state = normalized ? repository.readMetadataScope({ topicIds: [topicId], sourceIds: [sourceId] }) : repository.load();
      const topic = state.topics.find((entry) => entry.id === topicId);
      const source = state.sources.find((entry) => entry.id === sourceId);
      if (!topic || !source || topicIdFor(state, sourceId) !== topicId) fail("conflict", "State changed");
      return frozenClone({ version: version(state), topicId, sourceId,
        topicTitle: topic.title, topicKind: topic.kind, sourceTitle: source.title,
        sourceProvenance: source.provenance, sourceStamp: sourceStamp(source) });
    },
    related(sourceId, limit = 5) {
      sourceId = readId(sourceId);
      if (!Number.isInteger(limit) || limit < 0 || limit > 100) fail("invalid", "Invalid request");
      const state = rankingState();
      const source = state.sources.find((entry) => entry.id === sourceId);
      if (!source) fail("not-found", "Object unavailable");
      const linksBySource = new Map(state.sourceLinks.map(link => [link.sourceId, link]));
      if (source.provenance === LEARNED_SOURCE_PROVENANCE) {
        const candidates = state.sources.filter((entry) => entry.provenance === LEARNED_SOURCE_PROVENANCE && entry.embedding.modelId === source.embedding.modelId && compatibleExtractor(entry.extractorVersion)).map((entry) => ({
          id: entry.id, url: entry.url, title: entry.title, embedding: entry.embedding,
          topicId: linksBySource.get(entry.id)?.method === "manual-confirmed" ? linksBySource.get(entry.id).topicId : null,
        }));
        const results = rankRelatedSources(candidates.find((entry) => entry.id === sourceId), candidates, { limit, minSimilarity: 0.88 }).map(
          ({ id, url, title, relationship, method }) => ({ id, url, title, topicId: linksBySource.get(id)?.topicId ?? null, relationship, method }),
        );
        return frozenClone({ version: version(state), model: { id: BROWSER_MODEL_ID, status: "experimental-local" }, results });
      }
      const rankable = state.sources.map((entry) => ({
        id: entry.id, url: entry.url, title: entry.title,
        topicId: linksBySource.get(entry.id)?.topicId ?? null, embedding: entry.embedding,
      }));
      const rankableSource = rankable.find((entry) => entry.id === sourceId);
      const results = ranking.rank(rankableSource, rankable, limit).map(
        ({ id, url, title, topicId, relationship, method }) =>
          ({ id, url, title, topicId, relationship, method }),
      );
      return frozenClone({ version: version(state), model: ranking.model, results });
    },
    discussion(topicId) {
      topicId = readId(topicId);
      const state = topicState(topicId);
      const view = discussionView(state, topicId);
      if (normalized && Buffer.byteLength(JSON.stringify(view), "utf8") > MAX_RESPONSE_BYTES) fail("capacity", "Use paged discussion reads");
      return frozenClone(view);
    },
    discussionPage(input) { return pages.contributions(input); },
    // Provider context is not a full HTTP discussion projection. Selected-only
    // requests need a versioned header, never unrelated contribution bodies.
    insightDiscussion(topicId, includeDiscussion) {
      topicId = readId(topicId);
      if (typeof includeDiscussion !== "boolean") fail("invalid", "Invalid request");
      if (!normalized) return api.discussion(topicId);
      const state = includeDiscussion ? repository.readTopicState(topicId)
        : repository.readMetadataScope({ topicIds: [topicId] });
      return frozenClone(discussionView(state, topicId));
    },
    // Full canonical target bodies are independent of presentation pagination.
    discussionForContribution(topicId, contributionId) {
      topicId = readId(topicId); contributionId = readId(contributionId);
      if (!normalized) return api.discussion(topicId);
      const state = repository.readContributionState(contributionId);
      const target = state.contributions.find(entry => entry.id === contributionId);
      if (!target || state.discussions.find(entry => entry.id === target.discussionId)?.topicId !== topicId) fail("not-found", "Object unavailable");
      return frozenClone(discussionView(state, topicId));
    },
    alternateDiscussion(sourceId) {
      sourceId = readId(sourceId);
      if (!ALTERNATE_SOURCE_ID.test(sourceId)) fail("invalid", "Invalid request");
      if (ownerPlanner === null) fail("unavailable", "Alternate discussion unavailable");
      const state = repository.load();
      const source = state.sources.find((entry) => entry.id === sourceId);
      const link = state.sourceLinks.find((entry) => entry.sourceId === sourceId);
      if (!source || source.provenance !== LEARNED_SOURCE_PROVENANCE || !link) fail("not-found", "Object unavailable");
      const current = discussionView(state, link.topicId);
      const canonical = { topic: current.topic, discussionId: current.discussionId };
      const base = { policyVersion: ownerPlanner.policyVersion, representation: ownerPlanner.representation,
        version: version(state), sourceId, canonical };
      if (link.method === "manual-confirmed") {
        return boundedAlternateView({ ...base, mode: "canonical-pinned", sourceIds: [sourceId],
          roots: current.roots.map((root) => ({ ...root, canonicalTopicId: link.topicId,
            canonicalDiscussionId: current.discussionId })), pinnedRoots: [] });
      }
      if (link.method !== "learned-provisional") fail("unavailable", "Alternate discussion unavailable");
      let plan;
      try { plan = alternatePlan(state); }
      catch (error) {
        if (error instanceof TypeError) fail("unavailable", "Alternate discussion unavailable");
        throw error;
      }
      const group = plan.partitions.find((part) => part.sourceIds.includes(sourceId));
      if (!group) fail("unavailable", "Alternate discussion unavailable");
      const members = new Set(group.sourceIds);
      const sourceById = new Map(state.sources.map((entry) => [entry.id, entry]));
      const linkById = new Map(state.sourceLinks.map((entry) => [entry.sourceId, entry]));
      const discussionByTopic = new Map(state.discussions.map((entry) => [entry.topicId, entry.id]));
      const renderedByTopic = new Map();
      function renderedRoot(root, topicId) {
        if (!renderedByTopic.has(topicId)) renderedByTopic.set(topicId,
          new Map(discussionView(state, topicId).roots.map((entry) => [entry.id, entry])));
        const rendered = renderedByTopic.get(topicId).get(root.id);
        return rendered ? { ...rendered, canonicalTopicId: topicId,
          canonicalDiscussionId: discussionByTopic.get(topicId) } : null;
      }
      const roots = [];
      for (const root of state.contributions) {
        if (root.rootId !== null || root.anchor.kind !== "source" || !members.has(root.anchor.sourceId)) continue;
        const origin = sourceById.get(root.anchor.sourceId);
        const rootLink = linkById.get(root.anchor.sourceId);
        if (!origin || origin.provenance !== LEARNED_SOURCE_PROVENANCE || rootLink?.method !== "learned-provisional") continue;
        const topicId = state.discussions.find((entry) => entry.id === root.discussionId)?.topicId;
        if (!topicId) continue;
        const rendered = renderedRoot(root, topicId);
        if (rendered) roots.push(rendered);
      }
      roots.sort(newestRootFirst);
      const projected = new Set(roots.map((root) => root.id));
      // A different provisional Source in the current canonical Topic may
      // belong to another candidate group. Its root remains stored and can
      // still be read through that Source or the canonical Topic endpoint.
      // Only canonical topic/legacy/manual roots stay as local pinned context.
      const pinnedRoots = state.contributions.filter((root) => root.rootId === null &&
        root.discussionId === current.discussionId && !projected.has(root.id) &&
        (root.anchor.kind !== "source" || linkById.get(root.anchor.sourceId)?.method === "manual-confirmed"))
        .map((root) => renderedRoot(root, link.topicId)).filter(Boolean).sort(newestRootFirst);
      return boundedAlternateView({ ...base, mode: "alternate-provisional", sourceIds: group.sourceIds,
        roots, pinnedRoots });
    },
    priorDiscussions(sourceId) {
      return frozenClone(priorDiscussionsView(normalized ? repository.readPriorSourceState(readId(sourceId)) : repository.load(), sourceId));
    },
    ingest(value) {
      const input = readLearnedIngest(value);
      const state = repository.load();
      if (state.generation !== input.expected.generation) fail("conflict", "State changed");
      const operationDigest = operationDigestFor(input);
      const receipt = state.sources.find((source) => source.provenance === LEARNED_SOURCE_PROVENANCE && source.operationId === input.operationId);
      if (receipt) {
        if (receipt.url !== input.url || receipt.operationDigest !== operationDigest) fail("conflict", "Operation changed");
        return frozenClone({ version: version(state), ...ingestionResult(state, receipt) });
      }
      if (state.revision !== input.expected.revision) fail("conflict", "State changed");
      const outcome = applyLearnedIngest(state, input, operationDigest, { nextId, now });
      const saved = repository.save(input.expected, outcome.state);
      return frozenClone({ version: version(saved), ...outcome.result });
    },
    command(expectedValue, command, actorId, generatedProof = null) {
      const expected = readExpectedVersion(expectedValue);
      const actor = actorFor(actorId);
      const type = command && Object.getOwnPropertyDescriptor(command, "type");
      if (isAccountPrincipal(actor) && (!type || !Object.hasOwn(type, "value") || !ACCOUNT_COMMANDS.has(type.value)))
        fail("forbidden", "Action unavailable");
      const learned = type && type.enumerable && Object.hasOwn(type, "value") && LEARNED_COMMANDS.has(type.value);
      const scoped = normalized && !learned && type?.enumerable && Object.hasOwn(type, "value") &&
        ["create-topic", "create-root", "share-insight", "reply", "share-insight-reply", "edit", "withdraw"].includes(type.value);
      const state = scoped ? scopeForCommand(command, type.value) : repository.load();
      if (state.generation !== expected.generation || state.revision !== expected.revision) fail("conflict", "State changed");
      const outcome = learned ? applyLearnedCommand(state, command, { nextId, now }) : applyCommand(state, command, actor, { nextId, now, generatedProof, largeScale: normalized });
      const saved = scoped ? repository.saveScoped(expected, state, outcome.state) : repository.save(expected, outcome.state);
      return frozenClone({ version: version(saved), result: outcome.result });
    },
    // Private lifecycle operations are invoked only by the authenticated account
    // adapter. They intentionally do not expose the full browsing catalog.
    accountContributions(actorId) {
      if (!isAccountActor(actorId)) fail("forbidden", "Actor unavailable");
      const entries = normalized ? repository.accountContributions(actorId) : repository.load().contributions;
      return frozenClone(entries.filter(entry => !entry.withdrawn &&
        (entry.actorType === "human" ? entry.authorId === actorId : entry.insight?.operatorId === actorId)));
    },
    withdrawAccountContributions(actorId) {
      if (!isAccountActor(actorId)) fail("forbidden", "Actor unavailable");
      let current = repository.load();
      const entries = current.contributions.filter(entry => !entry.withdrawn &&
        (entry.actorType === "human" ? entry.authorId === actorId : entry.insight?.operatorId === actorId));
      // One successor transaction purges every owned revision. It retains deleted
      // ancestors for other people's replies, never the erased author or text.
      if (!entries.length) return { withdrawn: 0 };
      const lifecycleActor = { id: actorId, accountId: actorId.slice(8), type: "human", demo: false, displayName: "Deleted_user" };
      let next = current;
      for (const entry of entries) next = applyCommand(next, { type: "withdraw", contributionId: entry.id },
        lifecycleActor, { nextId, now, largeScale: normalized }).state;
      next.revision = current.revision + 1;
      repository.save(version(current), next);
      return { withdrawn: entries.length };
    },
    reset(expectedValue, confirmation) {
      const expected = readExpectedVersion(expectedValue);
      if (confirmation !== "RESET DEMO STATE") fail("invalid", "Invalid request");
      const current = repository.load();
      if (current.generation !== expected.generation || current.revision !== expected.revision) fail("conflict", "State changed");
      const next = createDemoState({ generation: nextId("generation"), createdAt: now(), sources, topicSeeds });
      return frozenClone(version(repository.replace(expected, next)));
    },
  });
  return api;
}

function sameVersion(left, right) { return left.generation === right.generation && left.revision === right.revision; }
function readCatalogCursor(value, kind, limit, expected) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(value)) fail("invalid", "Invalid request");
  let cursor;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) fail("invalid", "Invalid request");
    cursor = readRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), ["schema", "kind", "limit", "version", "after"]);
  }
  catch { fail("invalid", "Invalid request"); }
  if (cursor.schema !== "catalog-page/v1" || cursor.kind !== kind || cursor.limit !== limit) fail("invalid", "Invalid request");
  const bound = readExpectedVersion(cursor.version);
  if (!sameVersion(bound, expected)) fail("conflict", "State changed");
  return readId(cursor.after);
}

function topicIdFor(state, sourceId) {
  return state.sourceLinks.find((link) => link.sourceId === sourceId)?.topicId ?? null;
}

function newestRootFirst(left, right) {
  return right.createdAt < left.createdAt ? -1 : right.createdAt > left.createdAt ? 1 :
    right.id < left.id ? -1 : right.id > left.id ? 1 : 0;
}

function boundedAlternateView(value) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RESPONSE_BYTES) {
    fail("capacity", "Discussion capacity reached");
  }
  return frozenClone(value);
}
