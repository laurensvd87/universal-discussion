import { readCatalog, readDiscussion } from "./local-service-contract.js";

export const TOOLBAR_TAB_KEY = "pageMatchingToolbarTabId";
export const TOOLBAR_STATES = Object.freeze(["disconnected", "connected", "off", "topic", "shared", "posts"]);
const LEARNED = "owner-local-page-embedding/v1";
const tabId = (value) => Number.isSafeInteger(value) && value >= 0;
function hasCurrentTopic(state, value) {
  if (state?.phase !== "ready" || !tabId(state.tabId) || typeof state.url !== "string" ||
      typeof state.sourceId !== "string" || typeof state.topicId !== "string" ||
      !Number.isSafeInteger(state.sequence) || typeof state.documentId !== "string") return false;
  const source = value.sources.find((item) => item.id === state.sourceId);
  return source?.provenance === LEARNED && source.url === state.url && source.topicId === state.topicId;
}
export function hasSharedLearnedTopic(state, value) {
  try {
    const catalog = readCatalog(value);
    return hasCurrentTopic(state, catalog) && catalog.sources.some((peer) =>
      peer.provenance === LEARNED && peer.id !== state.sourceId && peer.url !== state.url && peer.topicId === state.topicId);
  } catch { return false; }
}
export function hasPublishedPosts(value, topicId) {
  const projection = readDiscussion(value, topicId);
  return projection.roots.some((root) => root.state === "visible" || root.replies.some((reply) => reply.state === "visible"));
}

// One inert tab integer survives worker suspension, allowing reconstruction to
// clear Chrome's override. Connection means a last verified read, never a token.
export function createTopicToolbarController({ catalog, discussion, paint, readMarker, writeMarker, removeMarker }) {
  let epoch = 0;
  let abort = new AbortController();
  let pending = Promise.resolve();
  let marked = null;
  let candidate = null;
  let connected = false;
  let matchingOff = false;
  let initialized = false;
  let initializationFailed = false;
  const removed = new Set();
  const base = () => connected ? (matchingOff ? "off" : "connected") : "disconnected";
  function serial(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }
  async function neutralize() {
    if (marked === null) return;
    if (!removed.has(marked)) {
      try { await paint(marked, base()); }
      catch (error) {
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
      await paint(null, base());
      initialized = true;
    } catch {
      initializationFailed = true;
      try { await paint(null, "disconnected"); } catch { /* Chrome may be unavailable. */ }
    }
  });
  function update(state, { verify = false, pairingChanged = false } = {}) {
    const own = ++epoch;
    abort.abort(); abort = new AbortController();
    const signal = abort.signal;
    const snapshot = { ...state };
    const presentationTabId = tabId(snapshot.presentationTabId) ? snapshot.presentationTabId : null;
    if (pairingChanged || ["unpaired", "error"].includes(snapshot.phase)) connected = false;
    matchingOff = snapshot.phase === "off";
    candidate = presentationTabId ?? (snapshot.phase === "ready" && tabId(snapshot.tabId) ? snapshot.tabId : null);
    async function paintBase() {
      await paint(null, base());
      if (epoch !== own || presentationTabId === null || removed.has(presentationTabId)) return;
      await writeMarker(presentationTabId);
      marked = presentationTabId;
      if (epoch !== own) { await neutralize(); return; }
      await paint(presentationTabId, base(), () => epoch === own);
      if (epoch !== own) await neutralize();
    }
    const clearing = serial(async () => {
      if (initialized) { await neutralize(); if (epoch === own) await paintBase(); }
    });
    if (snapshot.phase !== "ready" && !verify) return clearing.catch(() => {});
    return (async () => {
      try {
        await clearing;
        if (!initialized || initializationFailed || epoch !== own) return;
        let value = readCatalog(await catalog({ signal }));
        if (epoch !== own) return;
        connected = true;
        await serial(async () => { if (epoch === own) await paintBase(); });
        if (presentationTabId !== null && presentationTabId !== snapshot.tabId) return;
        if (epoch !== own || !hasCurrentTopic(snapshot, value)) return;
        // Read only the current page's Topic. One bounded reconciliation read
        // handles a mutation between catalog and discussion without a retry loop.
        const projection = readDiscussion(await discussion(snapshot.topicId, { signal }), snapshot.topicId);
        if (epoch !== own) return;
        if (projection.version.generation !== value.version.generation || projection.version.revision !== value.version.revision) {
          value = readCatalog(await catalog({ signal }));
          if (epoch !== own) return;
          if (projection.version.generation !== value.version.generation || projection.version.revision !== value.version.revision) throw new Error("incoherent-read");
          if (!hasCurrentTopic(snapshot, value)) return;
        }
        const shared = hasSharedLearnedTopic(snapshot, value);
        const color = shared ? (hasPublishedPosts(projection, snapshot.topicId) ? "posts" : "shared") : "topic";
        await serial(async () => {
          if (epoch !== own || removed.has(snapshot.tabId)) return;
          await writeMarker(snapshot.tabId);
          marked = snapshot.tabId;
          if (epoch !== own) { await neutralize(); return; }
          await paint(snapshot.tabId, color, () => epoch === own);
          if (epoch !== own) await neutralize();
        });
      } catch {
        // A failed old credential must never clear a newer pairing.
        if (epoch === own) {
          connected = false;
          await serial(async () => { await neutralize(); if (epoch === own) await paintBase(); }).catch(() => {});
        }
      }
    })();
  }
  function tabRemoved(id) {
    if (id !== marked && id !== candidate) return;
    if (id === candidate) { epoch++; abort.abort(); candidate = null; }
    removed.add(id);
    return serial(async () => { await neutralize(); removed.delete(id); }).catch(() => {});
  }
  return Object.freeze({ update, tabRemoved, initialized: () => initialization, settled: () => pending });
}
