import { readCatalog } from "./local-service-contract.js";

export const TOOLBAR_TAB_KEY = "pageMatchingToolbarTabId";
const LEARNED = "owner-local-page-embedding/v1";
const tabId = (value) => Number.isSafeInteger(value) && value >= 0;

// Catalog links, not similarity suggestions, establish this presentational fact.
export function hasSharedLearnedTopic(state, value) {
  try {
    if (state?.phase !== "ready" || !tabId(state.tabId) || typeof state.url !== "string" ||
        typeof state.sourceId !== "string" || typeof state.topicId !== "string" ||
        !Number.isSafeInteger(state.sequence) || typeof state.documentId !== "string") return false;
    const catalog = readCatalog(value);
    const source = catalog.sources.find((item) => item.id === state.sourceId);
    return source?.provenance === LEARNED && source.url === state.url && source.topicId === state.topicId &&
      catalog.sources.some((peer) => peer.provenance === LEARNED && peer.id !== source.id &&
        peer.url !== source.url && peer.topicId === source.topicId);
  } catch { return false; }
}

// Only one inert tab integer survives worker suspension, so reconstruction can
// remove Chrome's surviving override without enumerating tabs or retaining URLs.
export function createTopicToolbarController({ catalog, paint, readMarker, writeMarker, removeMarker }) {
  let epoch = 0;
  let abort = new AbortController();
  let pending = Promise.resolve();
  let marked = null;
  let candidate = null;
  let initialized = false;
  let initializationFailed = false;
  const removed = new Set();
  function serial(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }
  async function neutralize() {
    if (marked === null) return;
    if (!removed.has(marked)) {
      try { await paint(marked, false); }
      catch (error) {
        // Chrome may discard a tab while the worker is suspended. Only its
        // exact missing-tab error proves that this override no longer exists.
        if (error?.message !== `No tab with id: ${marked}.`) throw error;
      }
    }
    await removeMarker();
    removed.delete(marked);
    marked = null;
  }
  const initialization = serial(async () => {
    try {
      const previous = await readMarker();
      if (previous !== undefined && previous !== null && !tabId(previous)) throw new Error("invalid-marker");
      marked = previous ?? null;
      await neutralize();
      await paint(null, false);
      initialized = true;
    } catch {
      initializationFailed = true;
      // Even when storage or a surviving tab override fails, set a safe default.
      try { await paint(null, false); } catch { /* Chrome may be unavailable. */ }
    }
  });
  function update(state) {
    const own = ++epoch;
    abort.abort(); abort = new AbortController();
    const signal = abort.signal;
    const snapshot = { ...state };
    candidate = snapshot.phase === "ready" && tabId(snapshot.tabId) ? snapshot.tabId : null;
    const clearing = serial(async () => { if (initialized) await neutralize(); });
    // All phases clear immediately; only a ready observation gets one read.
    if (snapshot.phase !== "ready") return clearing.catch(() => {});
    return (async () => {
      try {
        await clearing;
        if (!initialized || initializationFailed || epoch !== own) return;
        const value = await catalog({ signal });
        if (epoch !== own || !hasSharedLearnedTopic(snapshot, value)) return;
        await serial(async () => {
          if (epoch !== own || removed.has(snapshot.tabId)) return;
          // Persist before painting: an interrupted worker can always clean up.
          await writeMarker(snapshot.tabId);
          marked = snapshot.tabId;
          if (epoch !== own) { await neutralize(); return; }
          await paint(snapshot.tabId, true, () => epoch === own);
          if (epoch !== own) await neutralize();
        });
      } catch {
        // Added read failures never clear pairing: its credential may be newer.
        if (epoch === own) await serial(neutralize).catch(() => {});
      }
    })();
  }
  function tabRemoved(id) {
    // A removed tab has no surviving icon; do not treat other Chrome failures as
    // proof of removal. Keep at most the one recorded/current tab identifier.
    if (id !== marked && id !== candidate) return;
    if (id === candidate) { epoch++; abort.abort(); candidate = null; }
    removed.add(id);
    return serial(async () => { await neutralize(); removed.delete(id); }).catch(() => {});
  }
  return Object.freeze({ update, tabRemoved, initialized: () => initialization, settled: () => pending });
}
