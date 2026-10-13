import { applyCommand, createDemoState } from "../domain/demo-state.js";
import { discussionView } from "../domain/discussion-view.js";
import { priorDiscussionsView } from "../domain/prior-discussions.js";
import { fail } from "../domain/errors.js";
import { frozenClone, readExpectedVersion, readId, readRecord } from "../domain/validation.js";
import { operationDigestFor, sourceStamp } from "../domain/source-threads.js";
import { prepareRelatedSources } from "../../../../spikes/topic-resolution/browser/core/related-sources.js";
import { applyLearnedCommand, applyLearnedIngest, BROWSER_MODEL_ID, compatibleExtractor, ingestionResult, LEARNED_COMMANDS, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE, readLearnedIngest } from "../domain/learned-sources.js";
import { createOwnerTopicPlanner } from "../domain/owner-topic-planner.js";
import { createSnapshotTopicPlanner, matchingInputIdentity } from "../domain/alternate-topic-cache.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";
import { isAccountPrincipal, ACCOUNT_COMMANDS, isAccountActor } from "../accounts/account-principal.js";
import { createCanonicalPages } from "./canonical-pages.js";
import { createAccountPublicChats } from "./account-public-chats.js";

export const DEMO_ACTORS = Object.freeze([
  Object.freeze({ id: "demo-alex", displayName: "Alex · synthetic", type: "human", demo: true }),
  Object.freeze({ id: "demo-blair", displayName: "Blair · synthetic", type: "human", demo: true }),
]);
const ALTERNATE_SOURCE_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export function createDiscussionService({ repository, ranking, sources, topicSeeds, nextId, now,
  alternateAdapter = null, alternateBodyMetric = null, alternateRidgeAdapter = null,
  resolveAccountActor = null, readAccountActors = () => [], ingestionExecutor = null, readExecutor = null, projectionExecutor = null,
  incrementalMatching = false, adaptivePlanner = null }) {
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
      ridgeAdapter: alternateRidgeAdapter, incremental: incrementalMatching }); }
    catch { /* Invalid selected weights disable only the experimental read. */ }
  }
  const alternatePlan = createSnapshotTopicPlanner(state => ownerPlanner.plan(state),
    state => snapshotIdentities.get(state)?.grouping ?? matchingInputIdentity(state).grouping);
  function version(state) { return { generation: state.generation, revision: state.revision }; }
  const normalized = typeof repository.saveScoped === "function";
  const pages = createCanonicalPages(repository);
  const accountPublicChats = createAccountPublicChats({ repository, authorLabel(id) {
    try { return actorFor(id).displayName; } catch { return "Human"; }
  } });
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
  let rankingIdentity = null;
  const snapshotIdentities = new WeakMap();
  let relatedSnapshot = null;
  const relatedReads = new Map();
  const preparedRelated = new Map();
  const actorProjections = new WeakMap();
  function rankingState() {
    if (!normalized) {
      const state = repository.load(); snapshotIdentities.set(state, matchingInputIdentity(state)); return state;
    }
    const expected = repository.version();
    if (rankingSnapshot && sameVersion(rankingSnapshot, expected)) return rankingSnapshot;
    const identity = typeof repository.readMatchingIdentity === "function"
      ? repository.readMatchingIdentity({ expectedVersion: expected }) : null;
    if (rankingSnapshot && rankingSnapshot.generation === expected.generation && identity?.grouping === rankingIdentity?.grouping) {
      let metadata = {};
      // A provisional regroup does not change mathematical membership, but all
      // returned Source-to-Topic assignments must reflect the current commit.
      if (identity.routing !== rankingIdentity.routing) {
        const current = metadataScope(rankingSnapshot.sources.map(source => source.id), [], expected);
        metadata = { topics: current.topics, discussions: current.discussions, sourceLinks: current.sourceLinks };
      }
      rankingSnapshot = { ...rankingSnapshot, ...metadata, ...expected };
      rankingIdentity = identity; snapshotIdentities.set(rankingSnapshot, identity);
      return rankingSnapshot;
    }
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
    rankingIdentity = identity ?? matchingInputIdentity(state);
    snapshotIdentities.set(state, rankingIdentity);
    return state;
  }
  function relatedIdentity(state) {
    const identity = snapshotIdentities.get(state);
    return JSON.stringify([state.generation, identity.ranking,
      state.sources.some(entry => entry.provenance !== LEARNED_SOURCE_PROVENANCE) ? identity.routing : null]);
  }
  function renewRelated(state) {
    const identity = relatedIdentity(state);
    if (relatedSnapshot !== identity) { relatedReads.clear(); preparedRelated.clear(); relatedSnapshot = identity; }
  }
  function prepareLearnedRelated(state, source, linksBySource) {
    let prepared = preparedRelated.get(source.embedding.modelId);
    if (!prepared) {
      const candidates = state.sources.filter(entry => entry.provenance === LEARNED_SOURCE_PROVENANCE &&
        entry.embedding.modelId === source.embedding.modelId && compatibleExtractor(entry.extractorVersion)).map(entry => ({
          id: entry.id, url: entry.url, title: entry.title, embedding: entry.embedding,
          topicId: linksBySource.get(entry.id)?.method === "manual-confirmed" ? linksBySource.get(entry.id).topicId : null,
        }));
      prepared = { queries: new Map(candidates.map(candidate => [candidate.id, candidate])), ranker: prepareRelatedSources(candidates) };
      preparedRelated.set(source.embedding.modelId, prepared);
    }
    return prepared;
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
    // Only public HTTP reads use the isolated executor. Provider/private context
    // helpers retain their existing exact synchronous authority paths.
    readPublic(method, input, guards = {}) {
      if (!["catalog", "catalogContext", "catalogPage", "discussion", "discussionPage",
        "exactSource", "related", "priorDiscussions", "alternateDiscussion", "enrichment"].includes(method))
        fail("invalid", "Invalid public read");
      const invoke = () => method === "related" ? api.related(input.sourceId, input.limit) : api[method](input);
      const executor = ["related", "priorDiscussions", "alternateDiscussion", "enrichment"].includes(method)
        ? projectionExecutor : readExecutor;
      if (executor === null) return invoke();
      const expected = api.version();
      const isCurrent = () => !guards.signal?.aborted &&
        (typeof guards.isCurrent !== "function" || guards.isCurrent()) && sameVersion(api.version(), expected);
      if (!isCurrent()) fail("unavailable", "Read unavailable");
      return executor.read(method, input, { version: expected, signal: guards.signal }).then(value => {
        if (guards.signal?.aborted || typeof guards.isCurrent === "function" && !guards.isCurrent())
          fail("unavailable", "Read unavailable");
        if (!sameVersion(api.version(), expected)) fail("conflict", "State changed");
        // Account data never enters the worker. Public actor labels are renewed
        // at delivery using exactly the existing catalog projection rules.
        if (["catalog", "catalogContext", "catalogPage", "enrichment"].includes(method)) {
          const actors = [...DEMO_ACTORS, ...readAccountActors().filter(isAccountPrincipal)]
            .map(({ id, displayName, type }) => ({ id, displayName, type }));
          const signature = JSON.stringify(actors);
          const previous = actorProjections.get(value);
          if (previous?.signature === signature) return previous.projection;
          const projection = frozenClone(["catalogPage", "enrichment"].includes(method)
            ? { ...value, catalog: { ...value.catalog, actors } } : { ...value, actors });
          actorProjections.set(value, { signature, projection });
          return projection;
        }
        return value;
      });
    },
    actor(actorId) {
      return actorFor(actorId);
    },
    catalog() {
      const state = repository.load();
      return catalogProjection(state);
    },
    version() { return frozenClone(typeof repository.version === "function" ? repository.version() : version(repository.load())); },
    // Internal background preparation only: no account/post DTO, capture,
    // provider work or write. Request delivery still applies its own version gate.
    warmMatching() {
      const state = rankingState();
      if (ownerPlanner !== null) alternatePlan(state);
      renewRelated(state);
      const links = new Map(state.sourceLinks.map(link => [link.sourceId, link]));
      const models = new Set();
      for (const source of state.sources) if (source.provenance === LEARNED_SOURCE_PROVENANCE && !models.has(source.embedding.modelId)) {
        prepareLearnedRelated(state, source, links); models.add(source.embedding.modelId);
      }
      if (!sameVersion(api.version(), state)) fail("conflict", "State changed");
      return frozenClone(version(state));
    },
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
    enrichment(value) {
      const input = readRecord(value, ["sourceId", "topicId", "includeAlternate"]);
      const sourceId = readId(input.sourceId), topicId = readId(input.topicId);
      if (typeof input.includeAlternate !== "boolean") fail("invalid", "Invalid request");
      const base = api.catalogContext({ sourceId, topicId }), expected = base.version;
      const discussion = api.discussion(topicId);
      if (!sameVersion(discussion.version, expected)) fail("conflict", "State changed");
      const errors = { related: null, prior: null, alternate: null };
      const optional = (name, work) => {
        try {
          const result = work();
          if (!sameVersion(result.version, expected)) fail("conflict", "State changed");
          return result;
        } catch (error) {
          errors[name] = ["capacity", "conflict", "unavailable"].includes(error?.code) ? error.code : "invalid-response";
          return null;
        }
      };
      let related = optional("related", () => api.related(sourceId, 20));
      let priorDiscussions = optional("prior", () => api.priorDiscussions(sourceId));
      let alternateDiscussion = input.includeAlternate ? optional("alternate", () => api.alternateDiscussion(sourceId)) : null;
      let catalog = base;
      try {
        if (normalized) {
          const sourceIds = new Set(base.sources.map(source => source.id)), topicIds = new Set(base.topics.map(topic => topic.id));
          for (const source of related?.results ?? []) sourceIds.add(source.id);
          for (const topic of priorDiscussions?.topics ?? []) topicIds.add(topic.id);
          for (const id of alternateDiscussion?.sourceIds ?? []) sourceIds.add(id);
          for (const root of [...(alternateDiscussion?.roots ?? []), ...(alternateDiscussion?.pinnedRoots ?? [])])
            topicIds.add(root.canonicalTopicId);
          catalog = catalogProjection(metadataScope(sourceIds, topicIds, expected));
        }
      } catch (error) {
        const code = ["capacity", "conflict", "unavailable"].includes(error?.code) ? error.code : "invalid-response";
        if (related) errors.related = code;
        if (priorDiscussions) errors.prior = code;
        if (alternateDiscussion) errors.alternate = code;
        related = null; priorDiscussions = null; alternateDiscussion = null; catalog = base;
      }
      let bundle = { catalog, discussion, related, priorDiscussions, alternateDiscussion, errors };
      if (Buffer.byteLength(JSON.stringify(bundle), "utf8") > MAX_RESPONSE_BYTES - 4096) {
        if (related) errors.related = "capacity";
        if (priorDiscussions) errors.prior = "capacity";
        if (alternateDiscussion) errors.alternate = "capacity";
        bundle = { catalog: base, discussion, related: null, priorDiscussions: null, alternateDiscussion: null, errors };
      }
      if (!sameVersion(api.version(), expected)) fail("conflict", "State changed");
      if (Buffer.byteLength(JSON.stringify(bundle), "utf8") > MAX_RESPONSE_BYTES - 4096) fail("capacity", "Enrichment capacity reached");
      return frozenClone(bundle);
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
      // Cache mathematical ranking only. Fresh response versions and provisional
      // routing are projected below; manual pins are genuine ranking inputs.
      renewRelated(state);
      const cacheKey = JSON.stringify([sourceId, limit]);
      const linksBySource = new Map(state.sourceLinks.map(link => [link.sourceId, link]));
      const project = value => frozenClone({ version: version(state), model: value.model,
        results: value.results.map(result => ({ ...result, topicId: linksBySource.get(result.id)?.topicId ?? null })) });
      if (relatedReads.has(cacheKey)) return project(relatedReads.get(cacheKey));
      const remember = value => {
        if (relatedReads.size >= 32) relatedReads.delete(relatedReads.keys().next().value);
        relatedReads.set(cacheKey, value); return project(value);
      };
      if (source.provenance === LEARNED_SOURCE_PROVENANCE) {
        const prepared = prepareLearnedRelated(state, source, linksBySource);
        const results = prepared.ranker.rank(prepared.queries.get(sourceId), { limit, minSimilarity: 0.88 }).map(
          ({ id, url, title, relationship, method }) => ({ id, url, title, relationship, method }),
        );
        return remember(frozenClone({ model: { id: BROWSER_MODEL_ID, status: "experimental-local" }, results }));
      }
      const rankable = state.sources.map((entry) => ({
        id: entry.id, url: entry.url, title: entry.title,
        topicId: linksBySource.get(entry.id)?.topicId ?? null, embedding: entry.embedding,
      }));
      const rankableSource = rankable.find((entry) => entry.id === sourceId);
      const results = ranking.rank(rankableSource, rankable, limit).map(
        ({ id, url, title, relationship, method }) =>
          ({ id, url, title, relationship, method }),
      );
      return remember(frozenClone({ model: ranking.model, results }));
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
      let state = normalized ? repository.readSourceState(sourceId) : repository.load();
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
      try { plan = alternatePlan(normalized ? rankingState() : state); }
      catch (error) {
        if (error instanceof TypeError) fail("unavailable", "Alternate discussion unavailable");
        throw error;
      }
      const group = plan.partitions.find((part) => part.sourceIds.includes(sourceId));
      if (!group) fail("unavailable", "Alternate discussion unavailable");
      if (normalized) {
        const expected = version(state);
        const metadata = metadataScope(group.sourceIds, [link.topicId], expected);
        const topicIds = new Set(metadata.sourceLinks.map(value => value.topicId));
        topicIds.add(link.topicId);
        const collected = Object.fromEntries(["topics", "discussions", "sources", "sourceLinks", "contributions"]
          .map(name => [name, new Map()]));
        for (const scope of [metadata, ...[...topicIds].map(id => repository.readTopicState(id))]) {
          if (!sameVersion(scope, expected)) fail("conflict", "State changed");
          for (const [name, entries] of Object.entries(collected)) for (const value of scope[name])
            entries.set(name === "sourceLinks" ? value.sourceId : value.id, value);
        }
        state = { schema: metadata.schema, ...expected,
          ...Object.fromEntries(Object.entries(collected).map(([name, entries]) => [name, [...entries.values()]])) };
      }
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
    ingest(value, guards = {}) {
      const input = readLearnedIngest(value);
      if (ingestionExecutor !== null) {
        return ingestionExecutor.prepare(input, { createdAt: now(), signal: guards.signal }).then(plan => {
          const commit = () => {
            if (guards.signal?.aborted || typeof guards.isCurrent === "function" && !guards.isCurrent())
              fail("unavailable", "Ingestion unavailable");
            if (plan.receipt) {
              const current = repository.version();
              if (!sameVersion(current, plan.version)) fail("conflict", "State changed");
              return frozenClone({ version: current, ...plan.result });
            }
            const saved = repository.saveScoped(input.expected, plan.before, plan.after);
            return frozenClone({ version: version(saved), ...plan.result });
          };
          // Finish the bounded admitted read batch before advancing its version.
          // No lock, mutation, rebase or retry happens while this promise waits.
          return readExecutor !== null && typeof readExecutor.withCommit === "function"
            ? readExecutor.withCommit(commit, { signal: guards.signal, isCurrent: guards.isCurrent }) : commit();
        });
      }
      const state = repository.load();
      if (state.generation !== input.expected.generation) fail("conflict", "State changed");
      const operationDigest = operationDigestFor(input);
      const receipt = state.sources.find((source) => source.provenance === LEARNED_SOURCE_PROVENANCE && source.operationId === input.operationId);
      if (receipt) {
        if (receipt.url !== input.url || receipt.operationDigest !== operationDigest) fail("conflict", "Operation changed");
        return frozenClone({ version: version(state), ...ingestionResult(state, receipt) });
      }
      if (state.revision !== input.expected.revision) fail("conflict", "State changed");
      const outcome = applyLearnedIngest(state, input, operationDigest, { nextId, now, ...(adaptivePlanner === null ? {} : { adaptivePlanner }) });
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
      const outcome = learned ? applyLearnedCommand(state, command, { nextId, now, ...(adaptivePlanner === null ? {} : { adaptivePlanner }) }) : applyCommand(state, command, actor, { nextId, now, generatedProof, largeScale: normalized });
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
    accountPublicChats(actorId, input) { return accountPublicChats.list(actorId, input); },
    accountPublicChat(actorId, input) { return accountPublicChats.read(actorId, input); },
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
