import { classifyActiveTabSnapshot, sameActiveTabObservation } from "./active-tab-policy.js";
import { validateAndProjectActiveTabResponse } from "./indicator-contract.js";
import { localServiceSourceId } from "../fixtures/local-service-fixture-bridge.js";
import { readPostOrigin } from "./local-service-contract.js";
import { projectPageResolution, isReadyPageResolution, samePageResolution } from "./page-resolution-contract.js";

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

// Owns transient selection/drafts only; the service owns all canonical data.
export function createLocalDiscussionController({ client, session, readActiveTab,
  observeTabLifecycle, lookupByNormalizedUrl, readPageResolution = null, pausePageMatching = null,
  validatePairing = async () => {}, onStateChange = () => {} }) {
  let state = { phase: "disconnected", error: null, catalog: null, discussion: null,
    topicViewMode: "classic", alternateDiscussion: null, alternateError: null,
    related: null, relatedDiscussions: [], priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
    sourceId: null, topicId: null, actorId: null, selection: null,
    draft: { body: "", detached: false, mode: "root", targetId: null }, busy: false, needsFreshRead: false, resolution: null };
  let epoch = 0;
  let abort = new AbortController();
  let stopObservation = () => {};
  let disposed = false;
  let mutationPending = false;
  let manualSelection = 0;
  let observationSequence = 0;
  let preparingLearned = false;
  let alternateRequest = 0;
  function publish(patch = {}) {
    const contextChanged = patch.discussion === null || patch.related === null || patch.catalog === null ||
      patch.sourceId === null || patch.topicId === null ||
      (Object.hasOwn(patch, "sourceId") && patch.sourceId !== state.sourceId) ||
      (Object.hasOwn(patch, "topicId") && patch.topicId !== state.topicId);
    state = { ...state, ...patch, ...(contextChanged ? { relatedDiscussions: [],
      alternateDiscussion: null, alternateError: null } : {}) };
    if (!disposed) onStateChange(currentState());
  }
  function currentState() { return freeze(structuredClone(state)); }
  function cancel() { epoch += 1; alternateRequest += 1; abort.abort(); abort = new AbortController(); }
  function detach() {
    state.draft = { ...state.draft, detached: state.draft.body.length > 0,
      mode: "root", targetId: null };
  }
  function invalidate() {
    cancel(); detach();
    publish({ discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null,
      viewingPriorDiscussion: false, sourceId: null, topicId: null,
      selection: null, phase: state.catalog ? "choose-topic" : "disconnected", error: "context-changed" });
    // The Chromium observer is one-shot; establish a fresh watcher after every event.
    void setupObservation();
  }
  async function failure(error, ownEpoch) {
    if (ownEpoch !== epoch || disposed) return;
    if (error?.code === "unauthorized") {
      cancel(); detach();
      publish({ phase: "disconnected", error: "unauthorized", catalog: null,
        discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
        sourceId: null, topicId: null, actorId: null, selection: null, resolution: null });
    } else if (ownEpoch === epoch && !disposed) {
      detach(); publish({ error: error?.code ?? "unavailable", phase: "error",
        discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null });
    }
  }
  function sameVersion(left, right) {
    return left?.generation === right?.generation && left?.revision === right?.revision;
  }
  async function loadAlternateView(ownEpoch) {
    const sourceId = state.sourceId, catalog = state.catalog, discussion = state.discussion;
    const requestNumber = ++alternateRequest;
    const source = catalog?.sources.find((entry) => entry.id === sourceId);
    if (state.topicViewMode !== "experimental" || state.phase !== "ready" || !sourceId ||
        source?.provenance !== "owner-local-page-embedding/v1" || !discussion ||
        !sameVersion(catalog.version, discussion.version)) {
      publish({ alternateDiscussion: null, alternateError: state.topicViewMode === "experimental" ? "unavailable" : null });
      return;
    }
    publish({ alternateDiscussion: null, alternateError: null });
    try {
      if (typeof client.alternateDiscussion !== "function") throw { code: "unavailable" };
      const view = await client.alternateDiscussion(sourceId, catalog, discussion, { signal: abort.signal });
      if (ownEpoch !== epoch || requestNumber !== alternateRequest || disposed || state.topicViewMode !== "experimental" ||
          state.sourceId !== sourceId || state.phase !== "ready" || state.needsFreshRead ||
          !sameVersion(state.catalog?.version, catalog.version) ||
          !sameVersion(state.discussion?.version, discussion.version)) return;
      publish({ alternateDiscussion: view, alternateError: null });
    } catch (error) {
      if (ownEpoch !== epoch || requestNumber !== alternateRequest || disposed || state.topicViewMode !== "experimental") return;
      if (error?.code === "unauthorized") { await failure(error, ownEpoch); return; }
      publish({ alternateDiscussion: null, alternateError: error?.code ?? "unavailable" });
    }
  }
  async function setTopicViewMode(mode) {
    if (mode !== "classic" && mode !== "experimental") return false;
    alternateRequest += 1;
    publish({ topicViewMode: mode, alternateDiscussion: null, alternateError: null });
    if (mode === "experimental") await loadAlternateView(epoch);
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
        if (!sameVersion(catalog.version, view?.version) ||
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
  async function loadSelection(ownEpoch) {
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
      let [discussion, related, prior] = await Promise.all([
        topicId ? client.discussion(topicId, options) : null, sourceId ? client.related(sourceId, 20, options) : null,
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
            client.catalog(options), topicId ? client.discussion(topicId, options) : null,
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
    } catch (error) { await failure(error, ownEpoch); }
  }
  function setupObservation() {
    const ownObservation = ++observationSequence;
    stopObservation(); stopObservation = () => {};
    return Promise.resolve().then(readActiveTab).then((snapshot) => {
      if (disposed || ownObservation !== observationSequence) return null;
      if (Number.isSafeInteger(snapshot.tabId) && snapshot.tabId >= 0) {
        stopObservation = observeTabLifecycle(snapshot.tabId, invalidate);
      }
      return snapshot;
    }).catch(() => null);
  }
  async function observeContext(ownEpoch, ownManual, snapshotPromise) {
    try {
      const snapshot = await snapshotPromise;
      if (ownEpoch !== epoch || disposed) return;
      const observation = classifyActiveTabSnapshot(snapshot);
      const requestToken = `activation-${String((ownEpoch % 999999) + 1).padStart(6, "0")}`;
      const response = await lookupByNormalizedUrl({ normalizedUrl: observation.normalizedUrl, requestToken });
      if (ownEpoch !== epoch || disposed || ownManual !== manualSelection) return;
      const view = validateAndProjectActiveTabResponse(response, {
        normalizedUrl: observation.normalizedUrl, requestToken, scenarioId: observation.scenarioId,
      });
      const final = classifyActiveTabSnapshot(await readActiveTab());
      if (ownEpoch !== epoch || disposed || ownManual !== manualSelection) return;
      if (!sameActiveTabObservation(observation, final)) { invalidate(); return; }
      const sourceId = localServiceSourceId(view);
      const source = state.catalog?.sources.find((entry) => entry.id === sourceId);
      if (!source?.topicId) return;
      publish({ sourceId, topicId: source.topicId, selection: "automatic" });
      await loadSelection(ownEpoch);
    } catch { /* Unsupported contexts offer manual selection; no observed data leaves this module. */ }
  }
  async function freshResolution() {
    if (!readPageResolution) return null;
    const result = await readPageResolution();
    return result === null ? null : projectPageResolution(result);
  }
  async function applyReadyResolution(resolution, ownEpoch, ownManual) {
    if (!isReadyPageResolution(resolution) || ownEpoch !== epoch || disposed || ownManual !== manualSelection || state.selection === "manual") return;
    const catalog = await client.catalog({ signal: abort.signal });
    if (ownEpoch !== epoch || disposed || ownManual !== manualSelection || state.selection === "manual") return;
    const current = await freshResolution();
    if (ownEpoch !== epoch || disposed || !samePageResolution(resolution, current) || !isReadyPageResolution(current)) return;
    const source = catalog.sources.find((entry) => entry.id === resolution.sourceId);
    if (!source || source.topicId !== resolution.topicId || source.provenance !== "owner-local-page-embedding/v1") return;
    const actorId = catalog.actors.some((entry) => entry.id === state.actorId) ? state.actorId : catalog.actors[0]?.id ?? null;
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
    let resolution;
    try { resolution = input === null ? null : projectPageResolution(input); }
    catch { resolution = null; }
    const previous = state.resolution;
    if (resolution?.reason === "unauthorized") { await failure({ code: "unauthorized" }, epoch); return; }
    const foregroundChanged = previous && (!resolution || previous.currentTabId !== resolution.currentTabId || previous.currentUrl !== resolution.currentUrl ||
      (previous.documentId && resolution.documentId && previous.documentId !== resolution.documentId));
    const backgroundChanged = state.selection === "background" && !samePageResolution(previous, resolution);
    if (foregroundChanged || backgroundChanged || (state.selection === "automatic" && resolution?.enabled)) {
      cancel(); detach();
      const keepManual = state.selection === "manual" && !foregroundChanged;
      publish({ resolution, discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null,
        ...(keepManual ? {} : { topicId: null, sourceId: null, selection: null, viewingPriorDiscussion: false }),
        phase: state.catalog ? "choose-topic" : "disconnected", error: "context-changed" });
    } else if (!sameProjectedResolution(previous, resolution)) publish({ resolution });
    if (mutationPending || state.needsFreshRead || !state.catalog || state.selection === "manual") return;
    if (isReadyPageResolution(resolution) && !(state.selection === "background" && state.phase === "ready" && samePageResolution(previous, resolution))) {
      const ownEpoch = epoch, ownManual = manualSelection;
      try { await applyReadyResolution(resolution, ownEpoch, ownManual); }
      catch (error) { await failure(error, ownEpoch); }
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
      priorDiscussions: null, priorDiscussionsError: null });
    try {
      const paired = await session.isPaired();
      if (ownEpoch !== epoch || disposed) return;
      if (!paired) {
        detach(); publish({ phase: "disconnected", catalog: null, discussion: null,
          related: null, priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
          topicId: null, sourceId: null, actorId: null, selection: null });
        return;
      }
      await client.health({ signal: abort.signal });
      const catalog = await client.catalog({ signal: abort.signal });
      if (ownEpoch !== epoch || disposed) return;
      const actorId = catalog.actors.some((entry) => entry.id === state.actorId)
        ? state.actorId : catalog.actors[0]?.id ?? null;
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
        const resolution = await freshResolution();
        if (ownEpoch !== epoch || disposed) return;
        publish({ resolution });
        if (resolution?.enabled) await applyReadyResolution(resolution, ownEpoch, ownManual);
        else await observeContext(ownEpoch, ownManual, snapshotPromise);
      }
      if (ownEpoch === epoch && !disposed && !mutationPending &&
          ["ready", "choose-topic"].includes(state.phase)) publish({ needsFreshRead: false });
    } catch (error) { await failure(error, ownEpoch); }
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
    cancel(); observationSequence += 1; stopObservation(); detach();
    publish({ phase: "disconnected", catalog: null, discussion: null, related: null,
      priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
      topicId: null, sourceId: null, actorId: null, selection: null, resolution: null, error: null });
    try { await session.clear(); }
    catch (error) { await failure(error, epoch); }
  }
  async function selectTopic(topicId) {
    if (!state.catalog?.topics.some((entry) => entry.id === topicId)) return;
    const viewingPriorDiscussion = state.priorDiscussions?.topics.some((entry) => entry.id === topicId) === true;
    manualSelection += 1; cancel(); detach();
    publish({ topicId, sourceId: null, selection: "manual", viewingPriorDiscussion,
      discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null });
    await loadSelection(epoch);
  }
  async function selectActor(actorId) {
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
    await loadSelection(epoch);
  }
  function setDraft(body) {
    const selectedDiscussionLoading = state.phase === "loading" && state.catalog?.sources.some((source) =>
      source.id === state.sourceId && source.topicId === state.topicId) &&
      state.draft.mode === "root" && !state.draft.detached;
    if (mutationPending || !(state.phase === "ready" || selectedDiscussionLoading) || state.needsFreshRead ||
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
  function begin(mode, targetId = null) {
    if (state.phase !== "ready" || state.needsFreshRead || mutationPending || state.draft.body) return false;
    const entries = state.discussion.roots.flatMap((root) => [root, ...root.replies]);
    const target = entries.find((entry) => entry.id === targetId);
    if (mode !== "root" && (!target || target.state !== "visible")) return false;
    if (mode === "edit" && (!ownsContribution(target, state.actorId) || target.actorType === "agent")) return false;
    const root = mode === "reply" ? state.discussion.roots.find((entry) => entry.id === (target.rootId ?? target.id)) : null;
    if (mode === "reply" && root?.state !== "visible") return false;
    publish({ draft: { body: mode === "edit" ? target.body : "", detached: false, mode, targetId } });
    return true;
  }
  function discardDraft() { if (!mutationPending) publish({ draft: { body: "", detached: false, mode: "root", targetId: null } }); }
  async function mutate(command, { reset = false, learned = false } = {}) {
    if (mutationPending || state.needsFreshRead || !state.catalog || !state.actorId || disposed) return false;
    if (!["ready", "choose-topic"].includes(state.phase)) return false;
    if (!reset && !learned && command.type !== "create-topic" && state.phase !== "ready") return false;
    mutationPending = true; const ownEpoch = epoch;
    let confirmed = false;
    let expected = state.discussion?.version ?? state.catalog.version;
    alternateRequest += 1;
    publish({ busy: true, error: null, alternateDiscussion: null, alternateError: null });
    try {
      if (learned) {
        if (!pausePageMatching) return false;
        preparingLearned = true;
        await pausePageMatching();
        const catalog = await client.catalog({ signal: abort.signal });
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
      const outcome = reset ? await client.reset(expected, "RESET DEMO STATE", { signal: abort.signal })
        : await client.command(expected, command, state.actorId, { signal: abort.signal });
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
      await open(); return true;
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
        if (!confirmed && ownEpoch !== epoch && state.phase !== "disconnected" && state.error !== "unauthorized") {
          detach(); publish({ busy: false, needsFreshRead: true, phase: "error", error: "unavailable",
            discussion: null, related: null, priorDiscussions: null, priorDiscussionsError: null });
        } else publish({ busy: false });
      }
    }
  }
  function submitDraft() {
    const draft = state.draft;
    if (draft.detached || !draft.body.trim() || state.phase !== "ready") return Promise.resolve(false);
    let command;
    if (draft.mode === "edit") command = { type: "edit", contributionId: draft.targetId, body: draft.body };
    else if (draft.mode === "reply") {
      const target = state.discussion.roots.flatMap((root) => [root, ...root.replies]).find((entry) => entry.id === draft.targetId);
      if (!target) return Promise.resolve(false);
      command = { type: "reply", discussionId: state.discussion.discussionId,
        rootId: target.rootId ?? target.id, replyToId: target.id, body: draft.body };
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
        review.expected?.generation !== version?.generation || review.expected?.revision !== version?.revision ||
        typeof review.body !== "string" || !review.body.trim() || review.body.length > 8_000 ||
        typeof review.operationId !== "string") return Promise.resolve(false);
    if (review.replyToId) {
      const root = state.discussion.roots.find((entry) => entry.id === review.rootId);
      const question = root?.replies.find((entry) => entry.id === review.replyToId);
      if (!root || root.state !== "visible" || root.insight?.kind !== "generated" ||
          !question || question.state !== "visible" || question.actorType !== "human" ||
          question.authorId !== state.actorId || question.replyToId !== root.id ||
          review.discussionId !== state.discussion.discussionId) return Promise.resolve(false);
      return mutate({ type: "share-insight-reply", topicId: state.topicId,
        discussionId: review.discussionId, rootId: root.id, replyToId: question.id,
        body: review.body, originSourceId: review.sourceId, operationId: review.operationId });
    }
    return mutate({ type: "share-insight", topicId: state.topicId, body: review.body,
      originSourceId: review.sourceId, operationId: review.operationId });
  }
  function createTopic(title, kind) { return mutate({ type: "create-topic", title, kind }); }
  function reset(confirmation) {
    if (confirmation !== "RESET DEMO STATE") return Promise.resolve(false);
    return mutate({}, { reset: true, learned: state.catalog?.sources.some((source) => source.provenance === "owner-local-page-embedding/v1") === true });
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
    disposed = true; cancel(); observationSequence += 1; stopObservation();
    state = { ...state, phase: "disconnected", catalog: null, discussion: null,
      related: null, relatedDiscussions: [], priorDiscussions: null, priorDiscussionsError: null, viewingPriorDiscussion: false,
      sourceId: null, topicId: null, actorId: null, selection: null, resolution: null,
      draft: { body: "", detached: false, mode: "root", targetId: null } };
  }
  return Object.freeze({ currentState, open, pair, disconnect, selectTopic, selectActor,
    selectSource, setTopicViewMode, canReplyToAlternate, setDraft, reattachDraft, begin, discardDraft, submitDraft, shareInsight, withdraw, createTopic, reset,
    updatePageResolution, correctSource, forgetSource, deleteLearnedTopic, clearLearnedData, dispose });
}
