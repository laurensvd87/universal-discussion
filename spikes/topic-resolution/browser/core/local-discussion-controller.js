import { classifyActiveTabSnapshot, sameActiveTabObservation } from "./active-tab-policy.js";
import { validateAndProjectActiveTabResponse } from "./indicator-contract.js";
import { localServiceSourceId } from "../fixtures/local-service-fixture-bridge.js";
import { readPostOrigin, isAccountActorId } from "./local-service-contract.js";
import { isRidgeTopicView, requiresReferenceTopicView } from "./topic-view-mode.js";
import { resolveDiscussionTarget } from "./discussion-target.js";
import { projectPageResolution, isReadyPageResolution, samePageResolution } from "./page-resolution-contract.js";
import { inspectPageNavigationUrl } from "./page-content-policy.js";

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
export function selectedPostingSource(state) {
  const source = state.catalog?.sources.find((entry) => entry.id === state.sourceId);
  if (state.phase !== "ready" || source?.topicId !== state.topicId ||
      !["automatic", "background", "manual"].includes(state.selection)) return null;
  try {
    // Historical catalog rows may remain readable after capture eligibility
    // tightens. Never stamp a new root/reply with an origin that the strict
    // discussion projection will reject on its next read.
    readPostOrigin({ sourceId: source.id, url: source.url, title: source.title });
    return source;
  } catch { return null; }
}
export function ownsContribution(entry, actorId) {
  return entry?.state === "visible" && (entry.actorType === "agent"
    ? ["manual-import", "generated"].includes(entry.insight?.kind) && entry.insight.operatorId === actorId
    : entry.authorId === actorId);
}
// Local text staging conveys no posting or provider authority. A retained saved
// snapshot may accept a root draft while its current-page matcher is still busy;
// all delivery paths continue to require Ready and their fresh authority checks.
export function canStageRootDraft(state) {
  if (state.phase !== "loading" || state.busy || state.needsFreshRead ||
      state.draft.mode !== "root" || state.draft.detached ||
      !state.catalog?.sources.some(source => source.id === state.sourceId && source.topicId === state.topicId)) return false;
  return !state.discussion || state.selection === "background" &&
    state.discussion.topic?.id === state.topicId && state.resolution?.enabled === true &&
    ["checking", "processing", "error"].includes(state.resolution.phase);
}

// Owns transient selection/drafts only; the service owns all canonical data.
export function createLocalDiscussionController({ client, session, readActiveTab,
  observeTabLifecycle, lookupByNormalizedUrl, readPageResolution = null, pausePageMatching = null,
  validatePairing = async () => {}, attestActiveContext = null, onStateChange = () => {},
  readPostingActor = () => undefined, requestSignIn = () => {}, schedule = setTimeout, cancelSchedule = clearTimeout }) {
  let state = { phase: "disconnected", error: null, catalog: null, discussion: null,
    topicViewMode: "experimental", alternateDiscussion: null, alternateError: null,
    related: null, relatedDiscussions: [], priorDiscussions: null, priorDiscussionsError: null,
    earlierDiscussions: [], viewingPriorDiscussion: false,
    sourceId: null, topicId: null, actorId: null, selection: null,
    draft: { body: "", detached: false, mode: "root", targetId: null }, busy: false, needsFreshRead: false, resolution: null,
    createdPost: null, serviceConnection: "unverified", readRetryable: false,
    enrichmentPending: false, relatedError: null };
  let epoch = 0;
  let abort = new AbortController();
  let stopObservation = () => {};
  let disposed = false;
  let mutationPending = false;
  let manualSelection = 0;
  let observationSequence = 0;
  let preparingLearned = false;
  // A transient rematch clears its worker result before a replacement
  // documentId exists. Retain only the last verified document witness so a
  // same-URL reload cannot inherit the old discussion when matching returns.
  let retainedBackgroundDocumentId = null;
  let alternateRequest = 0;
  let activeContext = null;
  let selectionFlight = null, resolutionFlight = null, enrichmentFlight = null;
  let enrichmentTimer = null, enrichmentAttempts = 0;
  const optionalError = error => ["unavailable", "capacity", "conflict", "invalid-response", "not-found"].includes(error?.code)
    ? error.code : "unavailable";
  async function readCatalogContext(sourceId, topicId, options) {
    const catalog = await (typeof client.catalogContext === "function"
      ? client.catalogContext({ sourceId, topicId }, options) : client.catalog(options));
    const previous = state.catalog?.version;
    if (previous && catalog.version.generation === previous.generation && catalog.version.revision < previous.revision) {
      throw Object.assign(new Error("Stale catalog context"), { code: "conflict" });
    }
    return catalog;
  }
  function postingActor(catalog) {
    const selected = readPostingActor();
    if (selected !== undefined) return catalog.actors.some(actor => actor.id === selected) ? selected : null;
    return catalog.actors.some(actor => actor.id === state.actorId) ? state.actorId : catalog.actors[0]?.id ?? null;
  }
  function publish(patch = {}, coherentOptional = false) {
    const contextChanged = !coherentOptional && (patch.discussion === null || patch.related === null || patch.catalog === null ||
      patch.sourceId === null || patch.topicId === null ||
      (Object.hasOwn(patch, "sourceId") && patch.sourceId !== state.sourceId) ||
      (Object.hasOwn(patch, "topicId") && patch.topicId !== state.topicId));
    state = { ...state, ...patch, ...(contextChanged ? { relatedDiscussions: [], earlierDiscussions: [],
      alternateDiscussion: null, alternateError: null, createdPost: null } : {}) };
    if (!disposed) onStateChange(currentState());
  }
  function currentState() { return freeze(structuredClone(state)); }
  function cancel() {
    epoch += 1; alternateRequest += 1; abort.abort(); abort = new AbortController();
    selectionFlight = resolutionFlight = enrichmentFlight = null;
    if (enrichmentTimer !== null) cancelSchedule(enrichmentTimer);
    enrichmentTimer = null; enrichmentAttempts = 0;
    state = { ...state, enrichmentPending: false, readRetryable: false };
  }
  function detach() {
    state.draft = { ...state.draft, detached: state.draft.body.length > 0,
      mode: "root", targetId: null };
  }
  function editTargetMatches(draft, discussion = state.discussion) {
    const binding = draft.editBinding;
    const target = discussion?.roots.flatMap(root => [root, ...root.replies]).find(entry => entry.id === draft.targetId);
    return draft.mode === "edit" && !draft.detached && binding?.targetId === draft.targetId &&
      binding.actorId === state.actorId && binding.topicId === state.topicId &&
      binding.discussionId === discussion?.discussionId && target?.state === "visible" &&
      target.actorType === "human" && ownsContribution(target, state.actorId) && target.body === binding.targetBody;
  }
  function invalidateContext() {
    cancel(); observationSequence += 1; stopObservation(); stopObservation = () => {};
    activeContext = null; detach();
    publish({ discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null,
      viewingPriorDiscussion: false, sourceId: null, topicId: null,
      selection: null, resolution: null, busy: false,
      phase: state.catalog ? "choose-topic" : "disconnected", error: "context-changed" });
  }
  function invalidate() {
    invalidateContext();
    // The one-shot legacy tab observer follows the new tab after navigation.
    void setupObservation();
  }
  async function failure(error, ownEpoch, publicRead = false) {
    if (ownEpoch !== epoch || disposed) return;
    if (error?.code === "unauthorized") {
      cancel(); detach();
      publish({ phase: "disconnected", error: "unauthorized", catalog: null,
        discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
        sourceId: null, topicId: null, actorId: null, selection: null, resolution: null,
        serviceConnection: "disconnected", readRetryable: false, enrichmentPending: false });
    } else if (ownEpoch === epoch && !disposed) {
      detach(); publish({ error: error?.code ?? "unavailable", phase: "error", readRetryable: publicRead,
        discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null, enrichmentPending: false });
    }
  }
  function sameVersion(left, right) {
    return left?.generation === right?.generation && left?.revision === right?.revision;
  }
  function sameGenerationAtOrAfter(expected, observed) {
    return expected?.generation === observed?.generation &&
      Number.isSafeInteger(expected?.revision) && Number.isSafeInteger(observed?.revision) &&
      observed.revision >= expected.revision;
  }
  async function loadAlternateView(ownEpoch) {
    const sourceId = state.sourceId, catalog = state.catalog, discussion = state.discussion;
    const requestNumber = ++alternateRequest;
    const source = catalog?.sources.find((entry) => entry.id === sourceId);
    const required = requiresReferenceTopicView(catalog, sourceId);
    if (!required && state.topicViewMode !== "experimental" || state.phase !== "ready" || !sourceId ||
        source?.provenance !== "owner-local-page-embedding/v1" || !discussion ||
        !sameVersion(catalog.version, discussion.version)) {
      publish({ alternateDiscussion: null, alternateError: state.topicViewMode === "experimental" ? "unavailable" : null });
      return;
    }
    publish({ alternateDiscussion: null, alternateError: null });
    try {
      if (typeof client.alternateDiscussion !== "function") throw { code: "unavailable" };
      const view = await client.alternateDiscussion(sourceId, catalog, discussion, { signal: abort.signal });
      if (!isRidgeTopicView(view)) throw { code: "unavailable" };
      if (ownEpoch !== epoch || requestNumber !== alternateRequest || disposed || !required && state.topicViewMode !== "experimental" ||
          state.sourceId !== sourceId || state.phase !== "ready" || state.needsFreshRead ||
          !sameVersion(state.catalog?.version, catalog.version) ||
          !sameVersion(state.discussion?.version, discussion.version)) return;
      publish({ alternateDiscussion: view, alternateError: null });
    } catch (error) {
      if (ownEpoch !== epoch || requestNumber !== alternateRequest || disposed || !required && state.topicViewMode !== "experimental") return;
      if (error?.code === "unauthorized") { await failure(error, ownEpoch); return; }
      // The combined enrichment request remains the authoritative fallback.
      // A fast scoped projection losing a global-revision race must not flash an
      // error while that coherent request is still in flight.
      if (typeof client.enrichment === "function") return;
      publish({ alternateDiscussion: null, alternateError: error?.code ?? "unavailable" });
    }
  }
  async function setTopicViewMode(mode) {
    if (mode !== "classic" && mode !== "experimental") return false;
    alternateRequest += 1;
    publish({ topicViewMode: mode, alternateDiscussion: null, alternateError: null });
    if (typeof client.enrichment === "function") {
      const fast = mode === "experimental" || requiresReferenceTopicView(state.catalog, state.sourceId)
        ? loadAlternateView(epoch) : Promise.resolve();
      await Promise.all([fast, loadEnrichment(epoch)]);
    }
    else if (mode === "experimental" || requiresReferenceTopicView(state.catalog, state.sourceId)) await loadAlternateView(epoch);
    return true;
  }
  async function loadRelatedDiscussions(ownEpoch, catalog, discussion, related, sourceId, topicId, options) {
    if (!sourceId || !topicId || !discussion || !related ||
        !sameVersion(catalog?.version, discussion.version) || !sameVersion(catalog.version, related.version) ||
        catalog.sources.find((source) => source.id === sourceId)?.topicId !== topicId) return;
    const ids = [];
    for (const result of related.results) {
      const source = catalog.sources.find((entry) => entry.id === result.id);
      if (!source || source.topicId !== result.topicId || source.url !== result.url ||
          source.title !== result.title || !source.topicId || source.topicId === topicId ||
          !catalog.topics.some((topic) => topic.id === source.topicId) || ids.includes(source.topicId)) continue;
      ids.push(source.topicId);
    }
    if (!ids.length) return;
    function stillCurrent() {
      return ownEpoch === epoch && !disposed && state.phase === "ready" && !state.needsFreshRead &&
          state.sourceId === sourceId && state.topicId === topicId &&
          sameVersion(state.catalog?.version, catalog.version) &&
          sameVersion(state.discussion?.version, discussion.version) &&
          sameVersion(state.related?.version, related.version);
    }
    const relatedDiscussions = [];
    for (let offset = 0; offset < ids.length && relatedDiscussions.length < 4; offset += 4) {
      if (!stillCurrent()) return;
      const batch = ids.slice(offset, offset + 4);
      const outcomes = await Promise.allSettled(batch.map((id) => client.discussion(id, options)));
      if (!stillCurrent()) return;
      const unauthorized = outcomes.find((outcome) => outcome.status === "rejected" &&
        outcome.reason?.code === "unauthorized");
      if (unauthorized) {
        await failure(unauthorized.reason, ownEpoch);
        return;
      }
      for (let index = 0; index < outcomes.length; index += 1) {
        const outcome = outcomes[index];
        if (outcome.status === "rejected") {
          // A single unavailable related Topic does not hide later candidates.
          continue;
        }
        const view = outcome.value;
        if (!sameGenerationAtOrAfter(catalog.version, view?.version) ||
            view?.topic?.id !== batch[index] || !catalog.topics.some((topic) =>
              topic.id === view.topic.id && topic.title === view.topic.title && topic.kind === view.topic.kind)) return;
        if (!Array.isArray(view.roots) || view.roots.some((entry) => !entry ||
          typeof entry !== "object" || (entry.state === "visible" &&
          (!Array.isArray(entry.replies) || entry.replies.some((reply) =>
            !reply || typeof reply !== "object"))))) return;
        const visible = view.roots.filter((entry) => entry.state === "visible");
        if (!visible.length) continue;
        const roots = visible.slice(0, 3).map((entry) => ({
          id: entry.id, body: entry.body, authorId: entry.authorId, actorType: entry.actorType,
          insight: entry.insight ?? null, createdAt: entry.createdAt, origin: entry.origin ?? null,
          replyCount: entry.replies.filter((reply) => reply.state === "visible").length,
        }));
        relatedDiscussions.push({ topicId: view.topic.id, title: view.topic.title,
          rootCount: visible.length, roots });
        if (relatedDiscussions.length === 4) break;
      }
    }
    if (relatedDiscussions.length && stillCurrent()) publish({ relatedDiscussions });
  }
  async function loadEarlierDiscussions(ownEpoch, catalog, discussion, prior, sourceId, topicId, options) {
    if (!sourceId || !topicId || !discussion || !prior?.topics?.length ||
        !sameVersion(catalog?.version, discussion.version) ||
        !sameVersion(catalog.version, prior.version) ||
        catalog.sources.find((source) => source.id === sourceId)?.topicId !== topicId ||
        prior.sourceId !== sourceId || prior.currentTopicId !== topicId) return;
    const entries = [...new Map(prior.topics.map((entry) => [entry.id, entry])).values()];
    function stillCurrent() {
      return ownEpoch === epoch && !disposed && state.phase === "ready" && !state.needsFreshRead &&
        state.sourceId === sourceId && state.topicId === topicId &&
        state.priorDiscussions === prior &&
        sameVersion(state.catalog?.version, catalog.version) &&
        sameVersion(state.discussion?.version, discussion.version);
    }
    const earlierDiscussions = [];
    for (let offset = 0; offset < entries.length; offset += 4) {
      if (!stillCurrent()) return;
      const batch = entries.slice(offset, offset + 4);
      const outcomes = await Promise.allSettled(batch.map((entry) => client.discussion(entry.id, options)));
      if (!stillCurrent()) return;
      const unauthorized = outcomes.find((outcome) => outcome.status === "rejected" &&
        outcome.reason?.code === "unauthorized");
      if (unauthorized) { await failure(unauthorized.reason, ownEpoch); return; }
      for (let index = 0; index < outcomes.length; index += 1) {
        if (outcomes[index].status !== "fulfilled") continue;
        const view = outcomes[index].value, entry = batch[index];
        if (!sameGenerationAtOrAfter(catalog.version, view?.version) ||
            view?.topic?.id !== entry.id || view.topic.title !== entry.title ||
            view.topic.kind !== entry.kind || typeof view.discussionId !== "string" ||
            !catalog.topics.some((topic) => topic.id === entry.id &&
              topic.title === entry.title && topic.kind === entry.kind) ||
            !Array.isArray(view.roots)) continue;
        // Root origin owns the thread's Source. A reply's own origin only
        // describes that reply and must not move the root into this feed.
        const roots = view.roots.filter((root) => root && typeof root === "object" &&
          root.origin?.sourceId === sourceId && Array.isArray(root.replies));
        if (roots.length) earlierDiscussions.push({ topicId: entry.id,
          discussionId: view.discussionId, title: entry.title, version: view.version, roots });
      }
      if (stillCurrent()) publish({ earlierDiscussions: [...earlierDiscussions] });
    }
  }
  function loadSelection(ownEpoch, refreshCatalog = false) {
    const sourceId = state.sourceId, topicId = state.topicId;
    if (selectionFlight?.epoch === ownEpoch && selectionFlight.sourceId === sourceId && selectionFlight.topicId === topicId)
      return selectionFlight.promise;
    const flight = { epoch: ownEpoch, sourceId, topicId };
    flight.promise = typeof client.enrichment === "function"
      ? loadCanonicalSelection(ownEpoch, refreshCatalog) : loadLegacySelection(ownEpoch, refreshCatalog);
    selectionFlight = flight;
    void flight.promise.finally(() => { if (selectionFlight === flight) selectionFlight = null; }).catch(() => {});
    return flight.promise;
  }
  async function loadCanonicalSelection(ownEpoch, refreshCatalog) {
    const sourceId = state.sourceId, topicId = state.topicId;
    if (!topicId) { publish({ phase: "choose-topic", readRetryable: false }); return; }
    publish({ phase: "loading", error: null, discussion: null, related: null, priorDiscussions: null,
      relatedError: null, priorDiscussionsError: null, readRetryable: false });
    try {
      const options = { signal: abort.signal };
      let catalog = state.catalog, discussion;
      if (typeof client.selection === "function") {
        const selected = await client.selection({ sourceId, topicId }, options);
        catalog = selected.catalog; discussion = selected.discussion;
      } else {
        if (refreshCatalog) catalog = await readCatalogContext(sourceId, topicId, options);
        discussion = await client.discussion(topicId, options);
      }
      if (disposed || ownEpoch !== epoch || state.sourceId !== sourceId || state.topicId !== topicId) return;
      if (!sameVersion(catalog.version, discussion.version)) {
        catalog = await readCatalogContext(sourceId, topicId, options);
        if (disposed || ownEpoch !== epoch || !sameVersion(catalog.version, discussion.version))
          throw Object.assign(new Error("Incoherent public read"), { code: "conflict" });
      }
      if (!catalog.topics.some(topic => topic.id === topicId) || sourceId &&
          catalog.sources.find(source => source.id === sourceId)?.topicId !== topicId)
        throw Object.assign(new Error("Selection changed"), { code: "conflict" });
      publish({ catalog, discussion, actorId: postingActor(catalog), phase: "ready", error: null, readRetryable: false });
      if (sourceId) {
        if (state.topicViewMode === "experimental" || requiresReferenceTopicView(catalog, sourceId))
          void loadAlternateView(ownEpoch);
        void loadEnrichment(ownEpoch);
      }
    } catch (error) { await failure(error, ownEpoch, true); }
  }
  async function enrichmentAuthority(ownEpoch, sourceId, topicId, resolution, context, actorId) {
    const currentActor = readPostingActor();
    if (disposed || ownEpoch !== epoch || mutationPending || state.busy || state.needsFreshRead ||
        state.phase !== "ready" || state.sourceId !== sourceId || state.topicId !== topicId || state.actorId !== actorId ||
        currentActor !== undefined && currentActor !== actorId) return false;
    if (context) {
      const current = await readActiveTab().catch(() => null);
      if (!current || current.tabId !== context.tabId || current.url !== context.url ||
          context.windowId !== undefined && current.windowId !== context.windowId) return false;
      if (attestActiveContext && !await attestActiveContext(context).catch(() => false)) return false;
    }
    if (state.selection === "background") {
      const current = await freshResolution();
      if (!isReadyPageResolution(current) || !samePageResolution(resolution, current) ||
          !samePageResolution(state.resolution, current)) return false;
    }
    const finalActor = readPostingActor();
    return !disposed && ownEpoch === epoch && !mutationPending && !state.busy && !state.needsFreshRead &&
      state.sourceId === sourceId && state.topicId === topicId && state.actorId === actorId &&
      (finalActor === undefined || finalActor === actorId);
  }
  function loadEnrichment(ownEpoch) {
    const sourceId = state.sourceId, topicId = state.topicId,
      includeAlternate = state.topicViewMode === "experimental" || requiresReferenceTopicView(state.catalog, state.sourceId);
    if (!sourceId || !topicId || state.phase !== "ready" || typeof client.enrichment !== "function" || disposed || ownEpoch !== epoch)
      return Promise.resolve();
    if (enrichmentFlight?.epoch === ownEpoch && enrichmentFlight.sourceId === sourceId && enrichmentFlight.topicId === topicId &&
        enrichmentFlight.includeAlternate === includeAlternate) return enrichmentFlight.promise;
    if (enrichmentFlight?.epoch === ownEpoch && enrichmentFlight.sourceId === sourceId && enrichmentFlight.topicId === topicId)
      return enrichmentFlight.promise.then(() => loadEnrichment(ownEpoch));
    if (enrichmentTimer !== null) { cancelSchedule(enrichmentTimer); enrichmentTimer = null; }
    const flight = { epoch: ownEpoch, sourceId, topicId, includeAlternate };
    const resolution = state.resolution, context = activeContext, actorId = state.actorId, selection = state.selection;
    const options = { signal: abort.signal };
    publish({ enrichmentPending: true });
    flight.promise = (async () => {
      try {
        if (!await enrichmentAuthority(ownEpoch, sourceId, topicId, resolution, context, actorId)) return;
        const bundle = await client.enrichment({ sourceId, topicId, includeAlternate }, options);
        if (!await enrichmentAuthority(ownEpoch, sourceId, topicId, resolution, context, actorId) ||
            state.selection !== selection || (state.topicViewMode === "experimental" || requiresReferenceTopicView(state.catalog, sourceId)) !== includeAlternate) return;
        const previous = state.catalog?.version, next = bundle.catalog?.version;
        const previousSource = state.catalog?.sources.find(source => source.id === sourceId);
        const incomingSource = bundle.catalog?.sources.find(source => source.id === sourceId);
        if (!previous || !next || next.generation !== previous.generation || next.revision < previous.revision ||
            !sameVersion(next, bundle.discussion?.version) ||
            incomingSource?.topicId !== topicId || incomingSource.url !== previousSource?.url ||
            incomingSource.provenance !== previousSource?.provenance || bundle.discussion?.topic?.id !== topicId)
          throw Object.assign(new Error("Invalid enrichment selection"), { code: "conflict" });
        if (bundle.related && !sameVersion(bundle.related.version, next) || bundle.priorDiscussions &&
            (!sameVersion(bundle.priorDiscussions.version, next) || bundle.priorDiscussions.sourceId !== sourceId ||
              bundle.priorDiscussions.currentTopicId !== topicId) || bundle.alternateDiscussion &&
            (!sameVersion(bundle.alternateDiscussion.version, next) || bundle.alternateDiscussion.sourceId !== sourceId ||
              !isRidgeTopicView(bundle.alternateDiscussion)))
          throw Object.assign(new Error("Incoherent enrichment"), { code: "invalid-response" });
        const revisionChanged = !sameVersion(previous, next);
        if (state.draft.mode === "edit" && !state.draft.detached && !editTargetMatches(state.draft, bundle.discussion))
          state.draft = { ...state.draft, detached: true };
        publish({ catalog: bundle.catalog, discussion: bundle.discussion, related: bundle.related,
          priorDiscussions: bundle.priorDiscussions, alternateDiscussion: includeAlternate ? bundle.alternateDiscussion : null,
          relatedError: bundle.errors.related, priorDiscussionsError: bundle.errors.prior, alternateError: includeAlternate ? bundle.errors.alternate : null,
          enrichmentPending: false, ...(revisionChanged ? { relatedDiscussions: [], earlierDiscussions: [] } : {}) }, true);
        void loadRelatedDiscussions(ownEpoch, bundle.catalog, bundle.discussion, bundle.related, sourceId, topicId, options);
        void loadEarlierDiscussions(ownEpoch, bundle.catalog, bundle.discussion, bundle.priorDiscussions, sourceId, topicId, options);
        if ([bundle.errors.related, bundle.errors.prior, includeAlternate ? bundle.errors.alternate : null]
          .some(code => ["unavailable", "capacity", "conflict"].includes(code)))
          retryEnrichment();
        else enrichmentAttempts = 0;
      } catch (error) {
        if (disposed || ownEpoch !== epoch || state.sourceId !== sourceId || state.topicId !== topicId) return;
        if (error?.code === "unauthorized") { await failure(error, ownEpoch); return; }
        const code = optionalError(error);
        publish({ enrichmentPending: false, relatedError: code, priorDiscussionsError: code,
          alternateError: includeAlternate ? code : null });
        if (["unavailable", "capacity", "conflict"].includes(code)) retryEnrichment();
      } finally {
        if (enrichmentFlight === flight) {
          enrichmentFlight = null;
          if (!disposed && ownEpoch === epoch && state.enrichmentPending) publish({ enrichmentPending: false });
        }
      }
      function retryEnrichment() {
        if (enrichmentAttempts < 4 && enrichmentTimer === null) {
          const delay = [1000, 2000, 4000, 5000][enrichmentAttempts++];
          enrichmentTimer = schedule(() => {
            enrichmentTimer = null;
            if (ownEpoch === epoch && state.sourceId === sourceId && state.topicId === topicId) void loadEnrichment(ownEpoch);
          }, delay);
        }
      }
    })();
    enrichmentFlight = flight;
    return flight.promise;
  }
  async function loadLegacySelection(ownEpoch, refreshCatalog = false) {
    const topicId = state.topicId;
    const sourceId = state.sourceId;
    if (!topicId && !sourceId) { publish({ phase: "choose-topic" }); return; }
    publish({ phase: "loading", discussion: null, related: null, priorDiscussions: null,
      priorDiscussionsError: null, error: null });
    try {
      const options = { signal: abort.signal };
      async function readPrior() {
        try { return { value: await client.priorDiscussions(sourceId, options), error: null }; }
        catch (error) {
          if (error?.code === "unauthorized") throw error;
          return { value: null, error: error?.code ?? "unavailable" };
        }
      }
      let catalog = state.catalog;
      if (refreshCatalog && typeof client.catalogContext === "function") {
        catalog = await readCatalogContext(sourceId, topicId, options);
        if (ownEpoch !== epoch || disposed) return;
        const source = catalog.sources.find(entry => entry.id === sourceId);
        if ((sourceId && (!source || source.topicId !== topicId)) ||
            (topicId && !catalog.topics.some(entry => entry.id === topicId))) {
          detach();
          publish({ catalog, actorId: postingActor(catalog), sourceId: null, topicId: null,
            phase: "choose-topic", error: "context-unverified" });
          return;
        }
        publish({ catalog, actorId: postingActor(catalog) });
      }
      let discussion = topicId ? await client.discussion(topicId, options) : null;
      if (ownEpoch !== epoch || disposed) return;
      if (discussion && !sameVersion(catalog.version, discussion.version)) {
        catalog = await readCatalogContext(sourceId, topicId, options);
        if (ownEpoch !== epoch || disposed) return;
        if (!sameVersion(catalog.version, discussion.version))
          throw Object.assign(new Error("Incoherent canonical read"), { code: "conflict" });
      }
      publish({ catalog, discussion, actorId: postingActor(catalog), phase: topicId ? "ready" : "choose-topic", readRetryable: false });
      let [related, prior] = await Promise.all([
        sourceId ? client.related(sourceId, 20, options) : null,
        sourceId ? readPrior() : null,
      ]);
      if (ownEpoch !== epoch || disposed) return;
      function priorMatchesSelection(value, currentDiscussion, currentCatalog) {
        return value?.sourceId === sourceId && value.currentTopicId === topicId &&
          (!currentDiscussion || (value.version.generation === currentDiscussion.version.generation &&
            value.version.revision === currentDiscussion.version.revision)) &&
          currentCatalog?.sources.find((source) => source.id === sourceId)?.topicId === topicId &&
          value.topics.every((entry) => entry.id !== topicId &&
            currentCatalog?.topics.some((topic) => topic.id === entry.id && topic.title === entry.title && topic.kind === entry.kind));
      }
      if (prior?.value && !priorMatchesSelection(prior.value, discussion, catalog)) {
        // Separate GETs may straddle a service revision. Retry once; a second
        // mismatch stays unavailable instead of presenting mismatched Topics.
        try {
          const [freshCatalog, freshDiscussion, freshRelated, freshPrior] = await Promise.all([
            readCatalogContext(sourceId, topicId, options), topicId ? client.discussion(topicId, options) : null,
            client.related(sourceId, 20, options), readPrior(),
          ]);
          if (ownEpoch !== epoch || disposed) return;
          if (freshPrior.value && priorMatchesSelection(freshPrior.value, freshDiscussion, freshCatalog)) {
            catalog = freshCatalog; discussion = freshDiscussion; related = freshRelated; prior = freshPrior;
          } else prior = { value: null, error: freshPrior.error ?? "stale-prior-discussions" };
        } catch (error) {
          if (ownEpoch !== epoch || disposed) return;
          if (error?.code === "unauthorized") throw error;
          prior = { value: null, error: error?.code ?? "unavailable" };
        }
      }
      publish({ catalog, discussion, related, relatedDiscussions: [], priorDiscussions: prior?.value ?? null,
        priorDiscussionsError: prior?.error ?? null, phase: topicId ? "ready" : "choose-topic" });
      if (state.topicViewMode === "experimental") void loadAlternateView(ownEpoch);
      void loadRelatedDiscussions(ownEpoch, catalog, discussion, related, sourceId, topicId, options);
      const earlierLoad = loadEarlierDiscussions(ownEpoch, catalog, discussion, prior?.value, sourceId, topicId, options);
      if (mutationPending) await earlierLoad;
      else void earlierLoad;
    } catch (error) {
      if (ownEpoch === epoch && state.phase === "ready" && error?.code !== "unauthorized")
        publish({ relatedError: optionalError(error), enrichmentPending: false });
      else await failure(error, ownEpoch, true);
    }
  }
  function setupObservation(expectedResolution = null) {
    const ownObservation = ++observationSequence;
    stopObservation(); stopObservation = () => {};
    activeContext = null;
    return Promise.resolve().then(readActiveTab).then((snapshot) => {
      if (disposed || ownObservation !== observationSequence) return null;
      if (expectedResolution) {
        let observedUrl = null;
        try { observedUrl = new URL(snapshot.url).toString().split("#")[0]; }
        catch { return null; }
        if (snapshot.tabId !== expectedResolution.currentTabId ||
            observedUrl !== expectedResolution.currentUrl ||
            (snapshot.windowId !== undefined && snapshot.windowId !== expectedResolution.currentWindowId) ||
            (attestActiveContext && snapshot.windowId !== expectedResolution.currentWindowId)) return null;
      }
      if (Number.isSafeInteger(snapshot?.tabId) && snapshot.tabId >= 0) {
        activeContext = Object.freeze({ tabId: snapshot.tabId, url: snapshot.url,
          ...(Number.isSafeInteger(snapshot.windowId) ? { windowId: snapshot.windowId } : {}) });
        stopObservation = observeTabLifecycle(snapshot.tabId, invalidate);
      }
      return snapshot;
    }).catch(() => null);
  }
  async function observeContext(ownEpoch, ownManual, snapshotPromise) {
    try {
      const snapshot = await snapshotPromise;
      if (ownEpoch !== epoch || disposed) return;
      const observation = classifyActiveTabSnapshot({ tabId: snapshot.tabId, url: snapshot.url });
      const requestToken = `activation-${String((ownEpoch % 999999) + 1).padStart(6, "0")}`;
      const response = await lookupByNormalizedUrl({ normalizedUrl: observation.normalizedUrl, requestToken });
      if (ownEpoch !== epoch || disposed || ownManual !== manualSelection) return;
      const view = validateAndProjectActiveTabResponse(response, {
        normalizedUrl: observation.normalizedUrl, requestToken, scenarioId: observation.scenarioId,
      });
      const finalSnapshot = await readActiveTab();
      const final = classifyActiveTabSnapshot({ tabId: finalSnapshot.tabId, url: finalSnapshot.url });
      if (ownEpoch !== epoch || disposed || ownManual !== manualSelection) return;
      if (!sameActiveTabObservation(observation, final)) { invalidate(); return; }
      const sourceId = localServiceSourceId(view);
      const catalog = typeof client.catalogContext === "function"
        ? await readCatalogContext(sourceId, null, { signal: abort.signal }) : state.catalog;
      if (ownEpoch !== epoch || disposed || ownManual !== manualSelection) return;
      const source = catalog?.sources.find((entry) => entry.id === sourceId);
      if (!source?.topicId) return;
      publish({ catalog, actorId: postingActor(catalog), sourceId, topicId: source.topicId, selection: "automatic" });
      await loadSelection(ownEpoch);
    } catch { /* Unsupported contexts offer manual selection; no observed data leaves this module. */ }
  }
  async function freshResolution() {
    if (!readPageResolution) return null;
    const result = await readPageResolution();
    return result === null ? null : projectPageResolution(result);
  }
  function readOnlyPageWitness(resolution, snapshot) {
    if (!resolution?.enabled || resolution.contextReason !== null || resolution.currentTabId === null ||
        resolution.currentUrl === null || resolution.currentOrigin === null || resolution.currentWindowId === null ||
        resolution.sessionWindowId !== resolution.currentWindowId || resolution.hostAccess !== true ||
        resolution.blockedOrigins.includes(resolution.currentOrigin) ||
        snapshot?.tabId !== resolution.currentTabId ||
        (snapshot.windowId !== undefined && snapshot.windowId !== resolution.currentWindowId)) return null;
    const inspected = inspectPageNavigationUrl(snapshot.url);
    if (!inspected.supported || inspected.documentUrl !== resolution.currentUrl ||
        inspected.origin !== resolution.currentOrigin) return null;
    return {
      tabId: resolution.currentTabId, windowId: resolution.currentWindowId,
      documentUrl: inspected.documentUrl, sourceUrl: inspected.url, origin: inspected.origin,
      sessionRevision: resolution.sessionRevision,
      blockedOrigins: [...resolution.blockedOrigins],
    };
  }
  function sameReadOnlyPageWitness(left, right) {
    return left && right && left.tabId === right.tabId && left.windowId === right.windowId &&
      left.documentUrl === right.documentUrl && left.sourceUrl === right.sourceUrl &&
      left.origin === right.origin && left.sessionRevision === right.sessionRevision &&
      left.blockedOrigins.length === right.blockedOrigins.length &&
      left.blockedOrigins.every((origin, index) => origin === right.blockedOrigins[index]);
  }
  async function applyStoredUrlSelection(resolution, ownEpoch, ownManual, snapshotPromise) {
    if (typeof client.urlSelection !== "function" || isReadyPageResolution(resolution) ||
        ownEpoch !== epoch || disposed || ownManual !== manualSelection || state.selection === "manual") return;
    const snapshot = await snapshotPromise;
    const witness = readOnlyPageWitness(resolution, snapshot);
    if (!witness || ownEpoch !== epoch || disposed || ownManual !== manualSelection || state.selection === "manual") return;
    const ownObservation = observationSequence;
    let selected;
    try { selected = await client.urlSelection({ url: witness.sourceUrl }, { signal: abort.signal }); }
    catch (error) {
      if (error?.code === "unauthorized") throw error;
      return;
    }
    if (ownEpoch !== epoch || disposed || ownManual !== manualSelection ||
        ownObservation !== observationSequence || state.selection === "manual") return;
    const current = await freshResolution();
    const finalSnapshot = await readActiveTab().catch(() => null);
    const finalWitness = readOnlyPageWitness(current, finalSnapshot);
    if (ownEpoch !== epoch || disposed || ownManual !== manualSelection ||
        ownObservation !== observationSequence || state.selection === "manual" ||
        !sameReadOnlyPageWitness(witness, finalWitness)) return;
    if (isReadyPageResolution(current)) {
      await applyReadyResolution(current, ownEpoch, ownManual);
      return;
    }
    const source = selected.catalog.sources.find((entry) => entry.url === witness.sourceUrl &&
      entry.provenance === "owner-local-page-embedding/v1");
    if (!source?.topicId || selected.discussion.topic.id !== source.topicId ||
        !sameVersion(selected.catalog.version, selected.discussion.version)) return;
    retainedBackgroundDocumentId = null;
    publish({ catalog: selected.catalog, discussion: selected.discussion,
      actorId: postingActor(selected.catalog), resolution: current,
      sourceId: source.id, topicId: source.topicId, selection: "background",
      phase: "loading", error: null, readRetryable: false, enrichmentPending: false,
      needsFreshRead: false });
  }
  function applyReadyResolution(resolution, ownEpoch, ownManual) {
    if (resolutionFlight?.epoch === ownEpoch && resolutionFlight.manual === ownManual &&
        samePageResolution(resolutionFlight.resolution, resolution)) return resolutionFlight.promise;
    const flight = { epoch: ownEpoch, manual: ownManual, resolution };
    flight.promise = applyReadyResolutionCore(resolution, ownEpoch, ownManual);
    resolutionFlight = flight;
    void flight.promise.finally(() => { if (resolutionFlight === flight) resolutionFlight = null; }).catch(() => {});
    return flight.promise;
  }
  async function applyReadyResolutionCore(resolution, ownEpoch, ownManual) {
    if (!isReadyPageResolution(resolution) || ownEpoch !== epoch || disposed || ownManual !== manualSelection || state.selection === "manual") return;
    const catalog = await readCatalogContext(resolution.sourceId, resolution.topicId, { signal: abort.signal });
    if (ownEpoch !== epoch || disposed || ownManual !== manualSelection || state.selection === "manual") return;
    const current = await freshResolution();
    if (ownEpoch !== epoch || disposed || !samePageResolution(resolution, current) || !isReadyPageResolution(current)) return;
    const source = catalog.sources.find((entry) => entry.id === resolution.sourceId);
    if (!source || source.topicId !== resolution.topicId || source.provenance !== "owner-local-page-embedding/v1" ||
        source.url !== inspectPageNavigationUrl(resolution.url).url) return;
    // Initial active-tab access can fail before a first-use HTTPS grant. A
    // later ready resolution needs its own matching tab witness before Ready.
    const snapshot = await setupObservation(resolution);
    if (!snapshot || ownEpoch !== epoch || disposed || ownManual !== manualSelection || state.selection === "manual") return;
    const ownObservation = observationSequence;
    const verified = await freshResolution();
    if (ownObservation !== observationSequence) return;
    if (ownEpoch !== epoch || disposed || ownManual !== manualSelection ||
        !samePageResolution(resolution, verified) || !isReadyPageResolution(verified)) {
      observationSequence += 1; stopObservation(); stopObservation = () => {}; activeContext = null;
      return;
    }
    const actorId = postingActor(catalog);
    publish({ catalog, actorId, resolution, sourceId: resolution.sourceId, topicId: resolution.topicId, selection: "background" });
    await loadSelection(ownEpoch);
  }
  function sameProjectedResolution(left, right) {
    if (left === null || right === null) return left === right;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => key === "blockedOrigins"
      ? left.blockedOrigins.length === right.blockedOrigins.length &&
        left.blockedOrigins.every((origin, index) => origin === right.blockedOrigins[index])
      : left[key] === right[key]);
  }
  async function updatePageResolution(input) {
    if (disposed || preparingLearned) return;
    if (state.selection !== "background" || !state.discussion) retainedBackgroundDocumentId = null;
    let resolution;
    try { resolution = input === null ? null : projectPageResolution(input); }
    catch { resolution = null; }
    const previous = state.resolution;
    if (resolution?.reason === "unauthorized") { await failure({ code: "unauthorized" }, epoch); return; }
    const foregroundChanged = previous && (!resolution || previous.currentTabId !== resolution.currentTabId || previous.currentUrl !== resolution.currentUrl ||
      (previous.documentId && resolution.documentId && previous.documentId !== resolution.documentId));
    const actualWitnessChanged = previous && resolution && (previous.currentTabId !== resolution.currentTabId ||
      previous.currentUrl !== resolution.currentUrl || previous.currentWindowId !== resolution.currentWindowId ||
      previous.sessionWindowId !== resolution.sessionWindowId || previous.sessionRevision !== resolution.sessionRevision ||
      previous.hostAccess !== resolution.hostAccess || previous.enabled !== resolution.enabled ||
      previous.blockedOrigins.length !== resolution.blockedOrigins.length || previous.blockedOrigins.some((value, index) => value !== resolution.blockedOrigins[index]) ||
      previous.documentId && resolution.documentId && previous.documentId !== resolution.documentId ||
      retainedBackgroundDocumentId && resolution.documentId && retainedBackgroundDocumentId !== resolution.documentId);
    const backgroundChanged = state.selection === "background" && !samePageResolution(previous, resolution);
    const savedBackgroundSelection = state.selection === "background" && Boolean(state.catalog && state.discussion &&
      state.sourceId && state.topicId) && !foregroundChanged && !actualWitnessChanged;
    const transientSamePageMatch = savedBackgroundSelection &&
      ["checking", "processing", "error"].includes(resolution?.phase);
    const recoveredSamePageMatch = savedBackgroundSelection && isReadyPageResolution(resolution) &&
      resolution.sourceId === state.sourceId && resolution.topicId === state.topicId;
    if (backgroundChanged && transientSamePageMatch) {
      retainedBackgroundDocumentId ??= previous?.documentId ?? null;
      // Keep the accepted snapshot for reading, but move out of Ready so every
      // existing composer, reply, mutation and Insight gate stays closed.
      publish({ resolution, phase: "loading", error: null });
    } else if (backgroundChanged && recoveredSamePageMatch) {
      retainedBackgroundDocumentId = null;
      publish({ resolution });
    } else if (foregroundChanged || backgroundChanged || (state.selection === "automatic" && resolution?.enabled)) {
      retainedBackgroundDocumentId = null;
      cancel(); detach();
      const keepManual = state.selection === "manual" && !foregroundChanged;
      publish({ resolution, discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null,
        ...(keepManual ? {} : { topicId: null, sourceId: null, selection: null, viewingPriorDiscussion: false }),
        phase: state.catalog ? "choose-topic" : "disconnected", error: actualWitnessChanged ? "context-changed" : "context-unverified" });
    } else if (!sameProjectedResolution(previous, resolution)) publish({ resolution });
    if (mutationPending || state.needsFreshRead || !state.catalog || state.selection === "manual") return;
    // Status polling observes authority; only the bounded public-read recovery
    // path reopens a failed unchanged selection in the production adapter.
    if (typeof client.enrichment === "function" && state.phase === "error" && state.readRetryable &&
        samePageResolution(previous, resolution)) return;
    if (isReadyPageResolution(resolution) && !(state.selection === "background" && state.phase === "ready" && samePageResolution(previous, resolution))) {
      const ownEpoch = epoch, ownManual = manualSelection;
      try { await applyReadyResolution(resolution, ownEpoch, ownManual); }
      catch (error) { await failure(error, ownEpoch, true); }
    }
  }
  async function open() {
    cancel(); const ownEpoch = epoch;
    if (state.viewingPriorDiscussion) {
      manualSelection += 1; detach();
      state = { ...state, topicId: null, sourceId: null, selection: null, viewingPriorDiscussion: false };
    }
    const ownManual = manualSelection;
    const snapshotPromise = setupObservation();
    if (["automatic", "background"].includes(state.selection)) {
      detach(); state = { ...state, topicId: null, sourceId: null, selection: null };
    }
    publish({ phase: "connecting", error: null, discussion: null, related: null,
      priorDiscussions: null, priorDiscussionsError: null, readRetryable: false });
    let healthVerified = false;
    try {
      const paired = await session.isPaired();
      if (ownEpoch !== epoch || disposed) return;
      if (!paired) {
        detach(); publish({ phase: "disconnected", catalog: null, discussion: null,
          related: null, priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
          topicId: null, sourceId: null, actorId: null, selection: null, serviceConnection: "disconnected" });
        return;
      }
      await client.health({ signal: abort.signal });
      if (ownEpoch !== epoch || disposed) return;
      healthVerified = true;
      publish({ serviceConnection: "connected" });
      // Resolve the exact foreground page before the bounded chooser catalog.
      // A large null/null projection is optional presentation and must not
      // prevent a known page's saved discussion from loading.
      let resolution = null, pageAttempted = false, resolutionRead = false;
      if (state.selection !== "manual") {
        resolution = await freshResolution();
        resolutionRead = true;
        if (ownEpoch !== epoch || disposed) return;
        publish({ resolution });
        if (resolution?.enabled) {
          pageAttempted = true;
          if (isReadyPageResolution(resolution)) await applyReadyResolution(resolution, ownEpoch, ownManual);
          else await applyStoredUrlSelection(resolution, ownEpoch, ownManual, snapshotPromise);
          if (ownEpoch !== epoch || disposed) return;
          if (state.selection === "background" && state.catalog && state.discussion &&
              state.sourceId && state.topicId && ["ready", "loading"].includes(state.phase)) {
            if (!mutationPending && state.phase === "ready") publish({ needsFreshRead: false });
            return;
          }
          // A Ready matcher already supplied the exact IDs and the scoped read
          // owns its retry/error state. Falling through to the broad chooser
          // would erase that bounded-recovery fence and trigger poll retries.
          if (isReadyPageResolution(resolution) && state.selection === "background" &&
              state.sourceId && state.topicId) return;
        }
      }
      const catalog = await readCatalogContext(state.sourceId, state.topicId, { signal: abort.signal });
      if (ownEpoch !== epoch || disposed) return;
      const actorId = postingActor(catalog);
      if (state.selection === "manual" && state.sourceId) {
        const refreshedSource = catalog.sources.find((entry) => entry.id === state.sourceId);
        if (!refreshedSource || refreshedSource.topicId !== state.topicId) {
          detach();
          publish({ sourceId: refreshedSource?.id ?? null, topicId: refreshedSource?.topicId ?? null });
        }
      }
      publish({ catalog, actorId, phase: "choose-topic" });
      if ((state.selection === "manual" && state.topicId && catalog.topics.some((entry) => entry.id === state.topicId)) ||
          (state.selection === "manual" && state.sourceId && catalog.sources.some((entry) => entry.id === state.sourceId))) {
        await loadSelection(ownEpoch);
      } else {
        publish({ topicId: null, sourceId: null });
        if (!resolutionRead) {
          resolution = await freshResolution();
          resolutionRead = true;
          if (ownEpoch !== epoch || disposed) return;
          publish({ resolution });
        }
        if (resolution?.enabled) {
          if (!pageAttempted) {
            if (isReadyPageResolution(resolution)) await applyReadyResolution(resolution, ownEpoch, ownManual);
            else await applyStoredUrlSelection(resolution, ownEpoch, ownManual, snapshotPromise);
          }
        } else await observeContext(ownEpoch, ownManual, snapshotPromise);
      }
      if (ownEpoch === epoch && !disposed && !mutationPending &&
          ["ready", "choose-topic"].includes(state.phase)) publish({ needsFreshRead: false });
    } catch (error) {
      if (ownEpoch === epoch && !healthVerified) publish({ serviceConnection: "unavailable" });
      await failure(error, ownEpoch, true);
    }
  }
  async function pair(token) {
    cancel(); const ownEpoch = epoch;
    detach();
    publish({ phase: "connecting", catalog: null, discussion: null, related: null,
      priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
      topicId: null, sourceId: null, actorId: null, selection: null, resolution: null, error: null });
    try {
      await validatePairing(token);
      if (ownEpoch !== epoch || disposed) return;
      await session.setToken(token);
      if (ownEpoch !== epoch || disposed) return;
      await open();
    } catch (error) { await failure(error, ownEpoch); }
  }
  async function disconnect() {
    cancel(); observationSequence += 1; stopObservation(); activeContext = null; detach();
    publish({ phase: "disconnected", catalog: null, discussion: null, related: null,
      priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
      topicId: null, sourceId: null, actorId: null, selection: null, resolution: null, error: null, serviceConnection: "disconnected" });
    try { await session.clear(); }
    catch (error) { await failure(error, epoch); }
  }
  async function selectTopic(topicId) {
    if (!state.catalog?.topics.some((entry) => entry.id === topicId)) return;
    const viewingPriorDiscussion = state.priorDiscussions?.topics.some((entry) => entry.id === topicId) === true;
    manualSelection += 1; cancel(); detach();
    publish({ topicId, sourceId: null, selection: "manual", viewingPriorDiscussion,
      discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null });
    await loadSelection(epoch, true);
  }
  async function selectActor(actorId) {
    if (readPostingActor() !== undefined) return;
    if (!state.catalog?.actors.some((entry) => entry.id === actorId)) return;
    cancel(); detach(); publish({ actorId, discussion: null, related: null,
      priorDiscussions: null, priorDiscussionsError: null });
    await loadSelection(epoch);
  }
  async function selectSource(sourceId) {
    const source = state.catalog?.sources.find((entry) => entry.id === sourceId);
    if (!source) return;
    manualSelection += 1; cancel(); detach();
    publish({ sourceId, topicId: source.topicId, selection: "manual", viewingPriorDiscussion: false,
      discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null });
    await loadSelection(epoch, true);
  }
  function setDraft(body) {
    if (mutationPending || !(state.phase === "ready" || canStageRootDraft(state)) || state.needsFreshRead ||
        typeof body !== "string" || body.length > 8000) return;
    publish({ draft: { ...state.draft, body } });
  }
  function reattachDraft() {
    if (state.phase !== "ready" || state.needsFreshRead || mutationPending) return;
    publish({ draft: { ...state.draft, detached: false, mode: "root", targetId: null } });
  }
  function canReplyToAlternate(root) {
    return state.phase === "ready" && !state.needsFreshRead && !state.busy &&
      root?.state === "visible" && root.canonicalTopicId === state.topicId &&
      root.canonicalDiscussionId === state.discussion?.discussionId &&
      state.discussion.roots.some((entry) => entry.id === root.id && entry.state === "visible");
  }
  function begin(mode, targetId = null, destination = null) {
    if (state.phase !== "ready" || state.needsFreshRead || mutationPending || state.draft.body) return false;
    const entries = state.discussion.roots.flatMap((root) => [root, ...root.replies]);
    const target = mode === "reply" ? resolveDiscussionTarget(state, targetId, destination)?.target :
      entries.find((entry) => entry.id === targetId);
    if (mode !== "root" && (!target || target.state !== "visible")) return false;
    if (mode === "edit" && (!ownsContribution(target, state.actorId) || target.actorType === "agent")) return false;
    const binding = mode === "reply" ? resolveDiscussionTarget(state, targetId, destination) : null;
    const root = binding?.root;
    if (mode === "reply" && root?.state !== "visible") return false;
    publish({ draft: { body: mode === "edit" ? target.body : "", detached: false, mode, targetId,
      ...(mode === "edit" ? { editBinding: { targetId, targetBody: target.body, actorId: state.actorId,
        topicId: state.topicId, discussionId: state.discussion.discussionId } } : {}),
      ...(binding ? { targetBinding: { topicId: binding.topicId, discussionId: binding.discussionId,
        rootId: binding.root.id, rootBody: binding.root.body, targetBody: binding.target.body } } : {}) } });
    return true;
  }
  function discardDraft() { if (!mutationPending) publish({ draft: { body: "", detached: false, mode: "root", targetId: null } }); }
  async function mutate(command, { reset = false, learned = false } = {}) {
    if (!state.actorId && readPostingActor() !== undefined && !disposed) { requestSignIn(); return false; }
    if (mutationPending || state.needsFreshRead || !state.catalog || !state.actorId || disposed) return false;
    if (!["ready", "choose-topic"].includes(state.phase)) return false;
    if (!reset && !learned && command.type !== "create-topic" && state.phase !== "ready") return false;
    const attestedEpoch = epoch;
    if (attestActiveContext) {
      let trusted = false;
      try { trusted = Boolean(activeContext && await attestActiveContext(activeContext)); }
      catch { /* A missing or changed owning tab cannot authorize a write. */ }
      if (attestedEpoch !== epoch || disposed) return false;
      if (!trusted) { invalidateContext(); return false; }
    }
    mutationPending = true; const ownEpoch = epoch;
    let confirmed = false;
    let contextInvalidated = false;
    let expected = state.discussion?.version ?? state.catalog.version;
    alternateRequest += 1;
    publish({ busy: true, error: null, alternateDiscussion: null, alternateError: null });
    try {
      if (learned) {
        if (!pausePageMatching) return false;
        preparingLearned = true;
        await pausePageMatching();
        const catalog = await readCatalogContext(state.sourceId, state.topicId, { signal: abort.signal });
        if (ownEpoch !== epoch || disposed) return false;
        expected = catalog.version;
      } else if (state.selection === "background") {
        const current = await freshResolution();
        if (ownEpoch !== epoch || disposed) return false;
        if (!isReadyPageResolution(current) || !samePageResolution(state.resolution, current)) {
          invalidate(); return false;
        }
        const snapshot = await readActiveTab();
        const normalizedUrl = typeof snapshot.url === "string" ? new URL(snapshot.url).toString().split("#")[0] : null;
        if (ownEpoch !== epoch || disposed) return false;
        if (snapshot.tabId !== current.tabId || normalizedUrl !== current.url) { invalidate(); return false; }
      }
      if (attestActiveContext) {
        let trusted = false;
        try { trusted = Boolean(activeContext && await attestActiveContext(activeContext)); }
        catch { /* Fail closed before the service write. */ }
        if (ownEpoch !== epoch || disposed) return false;
        if (!trusted) { contextInvalidated = true; invalidateContext(); return false; }
      }
      const acceptedContext = { topicId: state.topicId, sourceId: state.sourceId,
        actorId: state.actorId, discussionId: state.discussion?.discussionId,
        activeContext: activeContext ? { ...activeContext } : null };
      if (command.type === "reply" || command.type === "share-insight-reply") {
        const binding = resolveDiscussionTarget(state, command.replyToId, {
          topicId: command.destinationTopicId ?? command.topicId ?? state.topicId,
          discussionId: command.discussionId, rootId: command.rootId,
          ...(command.targetBinding ?? {}) });
        if (!binding || binding.root.id !== command.rootId) return false;
      }
      if (command.type === "edit" && !editTargetMatches({ ...state.draft, editBinding: command.editBinding })) {
        state.draft = { ...state.draft, detached: true }; publish({ draft: state.draft }); return false;
      }
      const outcome = reset ? await client.reset(expected, "RESET DEMO STATE", { signal: abort.signal })
        : await client.command(expected, (() => { const { destinationTopicId, targetBinding, editBinding, ...wire } = command; return wire; })(),
          state.actorId, { signal: abort.signal });
      if (ownEpoch !== epoch || disposed) return false;
      confirmed = true;
      if (command.type === "create-topic" || learned) detach();
      else if (command.type !== "share-insight" && command.type !== "share-insight-reply")
        publish({ draft: { body: "", detached: false, mode: "root", targetId: null } });
      if (reset) { detach(); publish({ topicId: null, sourceId: null, selection: null, catalog: null, discussion: null,
        related: null, priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false }); }
      if (command.type === "create-topic") {
        manualSelection += 1;
        publish({ topicId: outcome.result.topicId, sourceId: null, selection: "manual" });
      }
      if (learned) {
        manualSelection += 1;
        publish({ topicId: command.type === "correct-source" ? outcome.result.topicId : null,
          sourceId: command.type === "correct-source" ? command.sourceId : null,
          selection: command.type === "correct-source" ? "manual" : null, resolution: null });
      }
      const createdId = ["create-root", "reply", "share-insight", "share-insight-reply"].includes(command.type)
        && typeof outcome?.result?.contributionId === "string" ? outcome.result.contributionId : null;
      await open();
      const destination = command.destinationTopicId ?? command.topicId ?? acceptedContext.topicId;
      const createdView = destination === state.topicId ? state.discussion :
        state.earlierDiscussions.find((view) => view.topicId === destination && view.discussionId === command.discussionId);
      if (createdId && state.phase === "ready" && !state.needsFreshRead &&
          state.topicId === acceptedContext.topicId && state.sourceId === acceptedContext.sourceId &&
          state.actorId === acceptedContext.actorId &&
          state.discussion?.discussionId === acceptedContext.discussionId &&
          JSON.stringify(activeContext) === JSON.stringify(acceptedContext.activeContext) &&
          createdView?.roots.some((root) => root.state === "visible" &&
            (root.id === createdId || root.replies?.some((reply) => reply.id === createdId &&
              reply.state === "visible")))) {
        // The accepted command result identifies the post. This is a UI cue only;
        // it never participates in a later write or survives context invalidation.
        publish({ createdPost: { id: createdId, topicId: destination,
          ...(destination !== state.topicId ? { currentTopicId: state.topicId, rootId: command.rootId } : {}),
          sourceId: state.sourceId, actorId: state.actorId,
          discussionId: createdView.discussionId } });
      }
      return true;
    } catch (error) {
      if (!disposed) publish({ needsFreshRead: true });
      await failure(error, ownEpoch); return false;
    }
    finally {
      mutationPending = false;
      preparingLearned = false;
      if (!disposed) {
        // Cancellation cannot prove a write failed. Require a fresh service read
        // after it finishes, even if another selection loaded while it was pending.
        if (!confirmed && !contextInvalidated && ownEpoch !== epoch && state.phase !== "disconnected" && state.error !== "unauthorized") {
          detach(); publish({ busy: false, needsFreshRead: true, phase: "error", error: "unavailable",
            discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null });
        } else publish({ busy: false });
      }
    }
  }
  async function attestPrivateStart(snapshot) {
    const ownEpoch = epoch;
    const binding = value => JSON.stringify([value?.sourceId, value?.topicId, value?.actorId,
      value?.selection, value?.resolution, value?.draft]);
    const same = () => !disposed && epoch === ownEpoch && binding(snapshot) === binding(state) &&
      state.phase === "ready" && !state.busy && !state.needsFreshRead &&
      state.draft.mode === "root" && !state.draft.detached && selectedPostingSource(state) &&
      isAccountActorId(state.actorId) && readPostingActor() === state.actorId;
    if (!same()) return false;
    try {
      if (attestActiveContext && (!activeContext || !await attestActiveContext(activeContext))) return false;
      if (state.selection === "background") {
        const current = await freshResolution();
        if (!same() || !isReadyPageResolution(current) || !samePageResolution(snapshot.resolution, current)) return false;
        const tab = await readActiveTab();
        if (tab.tabId !== current.tabId || new URL(tab.url).toString().split("#")[0] !== current.url ||
            tab.windowId !== undefined && tab.windowId !== current.currentWindowId) return false;
      } else {
        const tab = await readActiveTab(), source = selectedPostingSource(state);
        if (inspectPageNavigationUrl(tab.url)?.url !== source?.url) return false;
      }
      if (attestActiveContext && (!activeContext || !await attestActiveContext(activeContext))) return false;
      return Boolean(same());
    } catch { return false; }
  }
  function submitDraft() {
    const draft = state.draft;
    if (draft.detached || !draft.body.trim() || state.phase !== "ready") return Promise.resolve(false);
    let command;
    if (draft.mode === "edit") {
      if (!editTargetMatches(draft)) {
        state.draft = { ...draft, detached: true }; publish({ draft: state.draft }); return Promise.resolve(false);
      }
      command = { type: "edit", contributionId: draft.targetId, body: draft.body, editBinding: draft.editBinding };
    }
    else if (draft.mode === "reply") {
      const binding = resolveDiscussionTarget(state, draft.targetId, draft.targetBinding);
      if (!binding) return Promise.resolve(false);
      command = { type: "reply", discussionId: binding.discussionId,
        rootId: binding.root.id, replyToId: binding.target.id, body: draft.body,
        destinationTopicId: binding.topicId, targetBinding: draft.targetBinding };
    } else command = { type: "create-root", topicId: state.topicId, body: draft.body };
    if (["create-root", "reply"].includes(command.type)) {
      command.originSourceId = selectedPostingSource(state)?.id ?? null;
    }
    return mutate(command);
  }
  function withdraw(contributionId) {
    const target = state.discussion?.roots.flatMap((root) => [root, ...root.replies]).find((entry) => entry.id === contributionId);
    if (!ownsContribution(target, state.actorId)) return Promise.resolve(false);
    return mutate({ type: "withdraw", contributionId });
  }
  function shareInsight(review) {
    const version = state.discussion?.version;
    if (!review || state.phase !== "ready" || state.busy || state.needsFreshRead ||
        review.topicId !== state.topicId || review.actorId !== state.actorId ||
        review.sourceId !== (selectedPostingSource(state)?.id ?? null) ||
        !sameGenerationAtOrAfter(review.expected, version) ||
        typeof review.body !== "string" || !review.body.trim() || review.body.length > 8_000 ||
        typeof review.operationId !== "string") return Promise.resolve(false);
    if (review.replyToId) {
      const target = resolveDiscussionTarget(state, review.replyToId, {
        topicId: review.followupTopicId ?? state.topicId,
        discussionId: review.discussionId, rootId: review.rootId });
      if (!target || Boolean(review.followupTopicId) !== target.earlier) return Promise.resolve(false);
      return mutate({ type: "share-insight-reply", topicId: target.topicId,
        discussionId: review.discussionId, rootId: target.root.id, replyToId: target.target.id,
        destinationTopicId: target.topicId,
        targetBinding: { rootBody: target.root.body, targetBody: target.target.body },
        body: review.body, originSourceId: review.sourceId, operationId: review.operationId });
    }
    return mutate({ type: "share-insight", topicId: state.topicId, body: review.body,
      originSourceId: review.sourceId, operationId: review.operationId });
  }
  function createTopic(title, kind) { return mutate({ type: "create-topic", title, kind }); }
  function reset(confirmation) {
    if (confirmation !== "RESET DEMO STATE") return Promise.resolve(false);
    // A bounded catalog cannot prove the absence of learned Sources elsewhere.
    return mutate({}, { reset: true, learned: typeof client.catalogContext === "function" ||
      state.catalog?.sources.some((source) => source.provenance === "owner-local-page-embedding/v1") === true });
  }
  function learnedSource() { return state.catalog?.sources.find((entry) => entry.id === state.sourceId && entry.provenance === "owner-local-page-embedding/v1"); }
  function correctSource(topicId, confirmation) {
    if (!learnedSource() || confirmation !== "CONFIRM SOURCE TOPIC" ||
        (topicId !== null && !state.catalog.topics.some((entry) => entry.id === topicId))) return Promise.resolve(false);
    return mutate({ type: "correct-source", sourceId: state.sourceId, topicId }, { learned: true });
  }
  function forgetSource() {
    if (!learnedSource()) return Promise.resolve(false);
    return mutate({ type: "forget-source", sourceId: state.sourceId }, { learned: true });
  }
  function deleteLearnedTopic(confirmation) {
    if (confirmation !== "DELETE TOPIC AND DISCUSSION" ||
        !state.catalog?.topics.some((topic) => topic.id === state.topicId && topic.learned === true)) return Promise.resolve(false);
    return mutate({ type: "delete-learned-topic", topicId: state.topicId, confirmation }, { learned: true });
  }
  function clearLearnedData(confirmation) {
    if (confirmation !== "CLEAR LEARNED DATA") return Promise.resolve(false);
    return mutate({ type: "clear-learned-data", confirmation }, { learned: true });
  }
  function dispose() {
    disposed = true; cancel(); observationSequence += 1; stopObservation(); activeContext = null;
    state = { ...state, phase: "disconnected", catalog: null, discussion: null,
      related: null, relatedDiscussions: [], priorDiscussions: null, priorDiscussionsError: null,
      earlierDiscussions: [], viewingPriorDiscussion: false,
      sourceId: null, topicId: null, actorId: null, selection: null, resolution: null,
      draft: { body: "", detached: false, mode: "root", targetId: null }, serviceConnection: "disconnected" };
  }
  function accountChanged() {
    cancel(); detach(); publish({ actorId: null, createdPost: null, busy: false });
    void open();
  }
  return Object.freeze({ currentState, open, pair, disconnect, selectTopic, selectActor,
    selectSource, setTopicViewMode, canReplyToAlternate, setDraft, reattachDraft, begin, discardDraft, submitDraft, attestPrivateStart, shareInsight, withdraw, createTopic, reset,
    updatePageResolution, invalidateContext, accountChanged, correctSource, forgetSource, deleteLearnedTopic, clearLearnedData, dispose });
}
