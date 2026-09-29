import { classifyActiveTabSnapshot, sameActiveTabObservation } from "./active-tab-policy.js";
import { validateAndProjectActiveTabResponse } from "./indicator-contract.js";
import { localServiceSourceId } from "../fixtures/local-service-fixture-bridge.js";
import { projectPageResolution, isReadyPageResolution, samePageResolution } from "./page-resolution-contract.js";

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

// Owns transient selection/drafts only; the service owns all canonical data.
export function createLocalDiscussionController({ client, session, readActiveTab,
  observeTabLifecycle, lookupByNormalizedUrl, readPageResolution = null, pausePageMatching = null, onStateChange = () => {} }) {
  let state = { phase: "disconnected", error: null, catalog: null, discussion: null,
    related: null, sourceId: null, topicId: null, actorId: null, selection: null,
    draft: { body: "", detached: false, mode: "root", targetId: null }, busy: false, needsFreshRead: false, resolution: null };
  let epoch = 0;
  let abort = new AbortController();
  let stopObservation = () => {};
  let disposed = false;
  let mutationPending = false;
  let manualSelection = 0;
  let observationSequence = 0;
  let preparingLearned = false;
  function publish(patch = {}) {
    state = { ...state, ...patch };
    if (!disposed) onStateChange(currentState());
  }
  function currentState() { return freeze(structuredClone(state)); }
  function cancel() { epoch += 1; abort.abort(); abort = new AbortController(); }
  function detach() {
    state.draft = { ...state.draft, detached: state.draft.body.length > 0,
      mode: "root", targetId: null };
  }
  function invalidate() {
    cancel(); detach();
    publish({ discussion: null, related: null, sourceId: null, topicId: null,
      selection: null, phase: state.catalog ? "choose-topic" : "disconnected", error: "context-changed" });
    // The Chromium observer is one-shot; establish a fresh watcher after every event.
    void setupObservation();
  }
  async function failure(error, ownEpoch) {
    if (ownEpoch !== epoch || disposed) return;
    if (error?.code === "unauthorized") {
      cancel(); detach();
      publish({ phase: "disconnected", error: "unauthorized", catalog: null,
        discussion: null, related: null, sourceId: null, topicId: null, actorId: null, selection: null, resolution: null });
      try { await session.clear(); }
      catch { if (!disposed) publish({ error: "storage-unavailable" }); }
    } else if (ownEpoch === epoch && !disposed) {
      detach(); publish({ error: error?.code ?? "unavailable", phase: "error",
        discussion: null, related: null });
    }
  }
  async function loadSelection(ownEpoch) {
    const topicId = state.topicId;
    const sourceId = state.sourceId;
    if (!topicId && !sourceId) { publish({ phase: "choose-topic" }); return; }
    publish({ phase: "loading", discussion: null, related: null, error: null });
    try {
      const options = { signal: abort.signal };
      const [discussion, related] = await Promise.all([
        topicId ? client.discussion(topicId, options) : null, sourceId ? client.related(sourceId, 5, options) : null,
      ]);
      if (ownEpoch !== epoch || disposed) return;
      publish({ discussion, related, phase: topicId ? "ready" : "choose-topic" });
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
      publish({ resolution, discussion: null, related: null, ...(keepManual ? {} : { topicId: null, sourceId: null, selection: null }),
        phase: state.catalog ? "choose-topic" : "disconnected", error: "context-changed" });
    } else publish({ resolution });
    if (mutationPending || state.needsFreshRead || !state.catalog || state.selection === "manual") return;
    if (isReadyPageResolution(resolution) && !(state.selection === "background" && state.phase === "ready" && samePageResolution(previous, resolution))) {
      const ownEpoch = epoch, ownManual = manualSelection;
      try { await applyReadyResolution(resolution, ownEpoch, ownManual); }
      catch (error) { await failure(error, ownEpoch); }
    }
  }
  async function open() {
    cancel(); const ownEpoch = epoch;
    const ownManual = manualSelection;
    const snapshotPromise = setupObservation();
    if (["automatic", "background"].includes(state.selection)) {
      detach(); state = { ...state, topicId: null, sourceId: null, selection: null };
    }
    publish({ phase: "connecting", error: null, discussion: null, related: null });
    try {
      const paired = await session.isPaired();
      if (ownEpoch !== epoch || disposed) return;
      if (!paired) {
        detach(); publish({ phase: "disconnected", catalog: null, discussion: null,
          related: null, topicId: null, sourceId: null, actorId: null, selection: null });
        return;
      }
      await client.health({ signal: abort.signal });
      const catalog = await client.catalog({ signal: abort.signal });
      if (ownEpoch !== epoch || disposed) return;
      const actorId = catalog.actors.some((entry) => entry.id === state.actorId)
        ? state.actorId : catalog.actors[0]?.id ?? null;
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
      topicId: null, sourceId: null, actorId: null, selection: null, resolution: null, error: null });
    try {
      await session.setToken(token);
      if (ownEpoch !== epoch || disposed) return;
      await open();
    } catch (error) { await failure(error, ownEpoch); }
  }
  async function disconnect() {
    cancel(); observationSequence += 1; stopObservation(); detach();
    publish({ phase: "disconnected", catalog: null, discussion: null, related: null,
      topicId: null, sourceId: null, actorId: null, selection: null, resolution: null, error: null });
    try { await session.clear(); }
    catch (error) { await failure(error, epoch); }
  }
  async function selectTopic(topicId) {
    if (!state.catalog?.topics.some((entry) => entry.id === topicId)) return;
    manualSelection += 1; cancel(); detach();
    publish({ topicId, sourceId: null, selection: "manual", discussion: null, related: null });
    await loadSelection(epoch);
  }
  async function selectActor(actorId) {
    if (!state.catalog?.actors.some((entry) => entry.id === actorId)) return;
    cancel(); detach(); publish({ actorId, discussion: null, related: null });
    await loadSelection(epoch);
  }
  async function selectSource(sourceId) {
    const source = state.catalog?.sources.find((entry) => entry.id === sourceId);
    if (!source) return;
    manualSelection += 1; cancel(); detach();
    publish({ sourceId, topicId: source.topicId, selection: "manual", discussion: null, related: null });
    await loadSelection(epoch);
  }
  function setDraft(body) {
    if (mutationPending || state.phase !== "ready" || state.needsFreshRead ||
        typeof body !== "string" || body.length > 8000) return;
    publish({ draft: { ...state.draft, body } });
  }
  function reattachDraft() {
    if (state.phase !== "ready" || state.needsFreshRead || mutationPending) return;
    publish({ draft: { ...state.draft, detached: false, mode: "root", targetId: null } });
  }
  function begin(mode, targetId = null) {
    if (state.phase !== "ready" || state.needsFreshRead || mutationPending || state.draft.body) return false;
    const entries = state.discussion.roots.flatMap((root) => [root, ...root.replies]);
    const target = entries.find((entry) => entry.id === targetId);
    if (mode !== "root" && (!target || target.state !== "visible")) return false;
    if (mode === "edit" && target.authorId !== state.actorId) return false;
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
    publish({ busy: true, error: null });
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
      else publish({ draft: { body: "", detached: false, mode: "root", targetId: null } });
      if (reset) { detach(); publish({ topicId: null, sourceId: null, selection: null, catalog: null, discussion: null, related: null }); }
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
          detach(); publish({ busy: false, needsFreshRead: true, phase: "error", error: "unavailable", discussion: null, related: null });
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
    return mutate(command);
  }
  function withdraw(contributionId) {
    const target = state.discussion?.roots.flatMap((root) => [root, ...root.replies]).find((entry) => entry.id === contributionId);
    if (!target || target.state !== "visible" || target.authorId !== state.actorId) return Promise.resolve(false);
    return mutate({ type: "withdraw", contributionId });
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
      related: null, sourceId: null, topicId: null, actorId: null, selection: null, resolution: null,
      draft: { body: "", detached: false, mode: "root", targetId: null } };
  }
  return Object.freeze({ currentState, open, pair, disconnect, selectTopic, selectActor,
    selectSource, setDraft, reattachDraft, begin, discardDraft, submitDraft, withdraw, createTopic, reset,
    updatePageResolution, correctSource, forgetSource, deleteLearnedTopic, clearLearnedData, dispose });
}
