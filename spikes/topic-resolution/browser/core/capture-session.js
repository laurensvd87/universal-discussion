export const CAPTURE_SESSION_KEY = "pageMatchingCaptureSession";
export const BLOCKED_ORIGINS_KEY = "pageMatchingBlockedOrigins";
export const HTTPS_ACCESS = "https://*/*";
const validWindow = (id) => Number.isSafeInteger(id) && id >= 0;
const validRevision = (value) => typeof value === "string" && /^[a-zA-Z0-9-]{16,80}$/u.test(value);

// Live authority never comes from persistent preferences or a native grant alone.
export function createCaptureSession({ storageSession, storageLocal, getWindow, hasAccess,
  readForeground, validOrigin, nonce = () => crypto.randomUUID(), onInvalidate = () => {} }) {
  let revision = nonce();
  let windowId = null;
  let pendingWindowId = null;
  let blockedOrigins = [];
  const pendingBlocks = new Set();
  const closedWindows = new Set();
  let failed = false;
  let pendingConfiguration = 0;
  let writes = Promise.resolve();
  const record = () => ({ schema: "capture-session/1", revision, windowId });
  function fence() { revision = nonce(); windowId = null; pendingWindowId = null; onInvalidate(); }
  function enqueue(area, value) {
    const work = writes.then(() => area.set(value));
    writes = work.catch(async () => {
      failed = true; fence();
      // A partial blocked-origin/control write must not leave a restorable lease.
      try { await storageSession.remove(CAPTURE_SESSION_KEY); } catch { /* Storage remains unavailable: this worker stays off. */ }
    });
    return work;
  }
  const initialRevision = revision;
  const ready = (async () => {
    try {
      await storageSession.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      await storageLocal.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      const [saved, blocked] = await Promise.all([storageSession.get(CAPTURE_SESSION_KEY), storageLocal.get(BLOCKED_ORIGINS_KEY)]);
      const value = saved[CAPTURE_SESSION_KEY];
      const list = blocked[BLOCKED_ORIGINS_KEY];
      if (list !== undefined && (!Array.isArray(list) || list.length > 100 || list.some((origin) => !validOrigin(origin)))) throw new Error("invalid");
      blockedOrigins = [...new Set(list ?? [])];
      if (new Set([...blockedOrigins, ...pendingBlocks]).size > 100) {
        // Initialization can discover saved blocks after commands reserved their
        // immediate masks. Preserve the saved list and end authority before any
        // status can expose an oversized union or restore the previous lease.
        pendingBlocks.clear();
        fence();
        await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
      }
      if (value !== undefined) {
        if (!value || Object.keys(value).length !== 3 || value.schema !== "capture-session/1" ||
            !validRevision(value.revision) || !(value.windowId === null || validWindow(value.windowId))) throw new Error("invalid");
        if (revision !== initialRevision) return;
        revision = value.revision;
        const restoringRevision = revision;
        if (value.windowId !== null) {
          const window = await getWindow(value.windowId);
          if (window?.id === value.windowId && window.type === "normal" && !window.incognito && await hasAccess()) {
            if (revision === restoringRevision && !closedWindows.has(value.windowId)) windowId = value.windowId;
            else if (revision === restoringRevision) { fence(); await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() }); }
          } else if (revision === restoringRevision) { fence(); await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() }); }
        }
      } else await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
    } catch { failed = true; fence(); }
  })();
  async function snapshot() {
    await ready;
    if (windowId !== null && !failed) {
      const bound = windowId;
      try {
        const window = await getWindow(bound);
        if (window?.id !== bound || window.type !== "normal" || window.incognito || !await hasAccess()) {
          if (windowId === bound) await stop();
        }
      } catch { if (windowId === bound) await stop(); }
    }
    return { enabled: !failed && windowId !== null, sessionWindowId: failed ? null : windowId,
      sessionRevision: revision, blockedOrigins: [...new Set([...blockedOrigins, ...pendingBlocks])] };
  }
  async function start(id, expectedRevision) {
    await ready;
    if (failed || pendingConfiguration || !validWindow(id) || expectedRevision !== revision) throw new Error("changed");
    // Reserve the ticket synchronously; a Stop/close/block wins even during checks/writes.
    fence(); pendingWindowId = id;
    const ticket = revision;
    const eligible = async () => {
      const [foreground, window, access] = await Promise.all([readForeground(), getWindow(id), hasAccess()]);
      return ticket === revision && !failed && !closedWindows.has(id) && foreground?.windowId === id && window?.id === id &&
        window.type === "normal" && !window.incognito && access;
    };
    try {
      if (!await eligible()) throw new Error("changed");
      await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: { schema: "capture-session/1", revision: ticket, windowId: id } });
      if (!await eligible()) throw new Error("changed");
      windowId = id; pendingWindowId = null;
    } catch (error) {
      if (ticket === revision) { fence(); await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() }).catch(() => {}); }
      throw error;
    }
  }
  async function stop() {
    // Must happen before the first await, including while initialization is pending.
    fence();
    await ready;
    fence();
    await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
  }
  function closeWindow(id) {
    if (validWindow(id)) closedWindows.add(id);
    if (id !== windowId && id !== pendingWindowId) return Promise.resolve();
    return stop();
  }
  async function setBlocked(origin, blocked) {
    if (!validOrigin(origin)) throw new Error("invalid");
    const reserved = new Set([...blockedOrigins, ...pendingBlocks]);
    if (blocked && !reserved.has(origin) && reserved.size >= 100) {
      // Capacity rejection must also end capture: this newly requested block
      // cannot be represented durably, and must not make status/Stop unusable.
      await stop();
      throw new Error("capacity");
    }
    if (blocked) pendingBlocks.add(origin);
    const previousWindowId = windowId;
    pendingConfiguration++;
    // Configuration is a fail-closed transaction: persist an inactive lease
    // first so worker reconstruction cannot lose an uncommitted site block.
    fence();
    pendingWindowId = previousWindowId;
    const ticket = revision;
    try {
      await ready;
      const next = blocked ? [...new Set([...blockedOrigins, origin])] : blockedOrigins.filter((value) => value !== origin);
      if (next.length > 100) {
        pendingBlocks.delete(origin);
        await stop();
        throw new Error("capacity");
      }
      blockedOrigins = next;
      await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: { schema: "capture-session/1", revision, windowId: null } });
      await enqueue(storageLocal, { [BLOCKED_ORIGINS_KEY]: [...blockedOrigins] });
      pendingBlocks.delete(origin);
      const restorable = async () => {
        if (previousWindowId === null || revision !== ticket || failed || pendingConfiguration !== 1 || closedWindows.has(previousWindowId)) return false;
        const [window, access] = await Promise.all([getWindow(previousWindowId), hasAccess()]);
        return revision === ticket && !failed && pendingConfiguration === 1 && !closedWindows.has(previousWindowId) &&
          window?.id === previousWindowId && window.type === "normal" && !window.incognito && access;
      };
      if (await restorable()) {
        await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: { schema: "capture-session/1", revision: ticket, windowId: previousWindowId } });
        if (await restorable()) { windowId = previousWindowId; pendingWindowId = null; }
        else await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: { schema: "capture-session/1", revision, windowId: null } });
      }
    } catch (error) { fence(); throw error; }
    finally { pendingConfiguration--; }
  }
  return Object.freeze({ snapshot, start, stop, closeWindow, setBlocked });
}
