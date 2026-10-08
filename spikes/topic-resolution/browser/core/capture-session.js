export const CAPTURE_SESSION_KEY = "pageMatchingCaptureSession";
export const BLOCKED_ORIGINS_KEY = "pageMatchingBlockedOrigins";
export const HTTPS_ACCESS = "https://*/*";
const validWindow = (id) => Number.isSafeInteger(id) && id >= 0;
const validRevision = (value) => typeof value === "string" && /^[a-zA-Z0-9-]{16,80}$/u.test(value);
const missingWindowError = (error, id) => error instanceof Error &&
  error.message.replace(/\.$/u, "") === `No window with id: ${id}`;

// Live authority never comes from persistent preferences or a native grant alone.
export function createCaptureSession({ storageSession, storageLocal, getWindow, hasAccess,
  readForeground, validOrigin, nonce = () => crypto.randomUUID(), onInvalidate = () => {} }) {
  let revision = nonce();
  let windowId = null;
  // Persist Stop with the lease so service-worker reconstruction cannot
  // silently resume automatic capture in the same browser session.
  let autoStart = true;
  let pendingWindowId = null;
  let blockedOrigins = [];
  const pendingBlocks = new Set();
  const closedWindows = new Set();
  let failed = false;
  let pendingConfiguration = 0;
  let closedConfigurationRevision = null;
  let writes = Promise.resolve();
  const record = () => ({ schema: "capture-session/2", revision, windowId, autoStart });
  async function checkedWindow(id) {
    try { return await getWindow(id); }
    catch (error) { if (missingWindowError(error, id)) return null; throw error; }
  }
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
        const legacy = value?.schema === "capture-session/1" && Object.keys(value).length === 3;
        const current = value?.schema === "capture-session/2" && Object.keys(value).length === 4 && typeof value.autoStart === "boolean";
        if ((!legacy && !current) || !validRevision(value.revision) ||
            !(value.windowId === null || validWindow(value.windowId)) || (current && !value.autoStart && value.windowId !== null)) throw new Error("invalid");
        if (revision !== initialRevision) return;
        revision = value.revision;
        // Legacy inactive records were deliberately stopped under the old
        // manual-start policy; a fresh browser session has no record.
        autoStart = legacy ? value.windowId !== null : value.autoStart;
        const restoringRevision = revision;
        if (value.windowId !== null) {
          const window = await checkedWindow(value.windowId);
          const access = await hasAccess();
          if (revision !== restoringRevision) return;
          if (window?.id === value.windowId && window.type === "normal" && !window.incognito && access &&
              !closedWindows.has(value.windowId)) windowId = value.windowId;
          else {
            // A window may have closed while the service worker was asleep.
            // Only a missing window preserves the owner's auto-start choice.
            if (access && (window === null || window === undefined || closedWindows.has(value.windowId))) closedWindows.add(value.windowId);
            else autoStart = false;
            fence(); await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
          }
        }
      } else await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
    } catch { failed = true; fence(); }
  })();
  async function snapshot() {
    await ready;
    if (windowId !== null && !failed) {
      const bound = windowId;
      try {
        const window = await checkedWindow(bound);
        const access = await hasAccess();
        if (window?.id !== bound || window.type !== "normal" || window.incognito || !access) {
          if (windowId === bound) {
            if (access && (window === null || window === undefined)) await closeWindow(bound);
            else await stop();
          }
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
      await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: { schema: "capture-session/2", revision: ticket, windowId: id, autoStart: true } });
      if (!await eligible()) throw new Error("changed");
      windowId = id; autoStart = true; pendingWindowId = null;
    } catch (error) {
      if (ticket === revision) { fence(); await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() }).catch(() => {}); }
      throw error;
    }
  }
  async function stop() {
    // Must happen before the first await, including while initialization is pending.
    autoStart = false; fence();
    await ready;
    autoStart = false; fence();
    await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
  }
  function closeWindow(id) {
    if (validWindow(id)) closedWindows.add(id);
    if (id !== windowId && id !== pendingWindowId) return Promise.resolve();
    const closingConfiguration = pendingConfiguration === 1 && id === pendingWindowId;
    // Fence synchronously, including while Start or reconstruction is pending.
    // A closed window cannot keep its lease; the saved auto-start choice may
    // bind a later, independently checked normal window.
    fence();
    const ticket = revision;
    if (closingConfiguration) closedConfigurationRevision = ticket;
    return (async () => {
      await ready;
      if (ticket !== revision) return;
      await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
    })();
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
    const previousAutoStart = autoStart;
    pendingConfiguration++;
    // Configuration is a fail-closed transaction: persist an inactive lease
    // first so worker reconstruction cannot lose an uncommitted site block.
    autoStart = false; fence();
    pendingWindowId = previousWindowId;
    const ticket = revision;
    const restoreAutoStartAfterClose = async () => {
      const closedRevision = closedConfigurationRevision;
      if (revision !== closedRevision || failed || pendingConfiguration !== 1) return false;
      // The site change is durable before this can re-enable future windows.
      const access = await hasAccess().catch(() => false);
      if (revision !== closedRevision || failed || pendingConfiguration !== 1) return false;
      autoStart = previousAutoStart && access;
      await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
      return true;
    };
    try {
      await ready;
      const next = blocked ? [...new Set([...blockedOrigins, origin])] : blockedOrigins.filter((value) => value !== origin);
      if (next.length > 100) {
        pendingBlocks.delete(origin);
        await stop();
        throw new Error("capacity");
      }
      blockedOrigins = next;
      await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
      await enqueue(storageLocal, { [BLOCKED_ORIGINS_KEY]: [...blockedOrigins] });
      pendingBlocks.delete(origin);
      if (revision !== ticket || failed) { await restoreAutoStartAfterClose(); return; }
      autoStart = previousAutoStart;
      const restorable = async () => {
        if (previousWindowId === null || revision !== ticket || failed || pendingConfiguration !== 1 || closedWindows.has(previousWindowId)) return false;
        const [window, access] = await Promise.all([checkedWindow(previousWindowId), hasAccess()]);
        if (revision === ticket && !failed && pendingConfiguration === 1 && access &&
            (window === null || window === undefined)) {
          // The window disappeared before onRemoved reached this worker.
          // Its lease must end, but a successful site write can preserve
          // automatic Start for a later eligible window.
          closedWindows.add(previousWindowId);
          fence();
          closedConfigurationRevision = revision;
          return false;
        }
        return revision === ticket && !failed && pendingConfiguration === 1 && !closedWindows.has(previousWindowId) &&
          window?.id === previousWindowId && window.type === "normal" && !window.incognito && access;
      };
      if (await restorable()) {
        await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: { schema: "capture-session/2", revision: ticket, windowId: previousWindowId, autoStart } });
        if (await restorable()) { windowId = previousWindowId; pendingWindowId = null; }
        else if (!await restoreAutoStartAfterClose()) {
          autoStart = false; await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
        }
      } else if (previousWindowId === null) await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
      else if (!await restoreAutoStartAfterClose()) {
        autoStart = false; await enqueue(storageSession, { [CAPTURE_SESSION_KEY]: record() });
      }
    } catch (error) { fence(); throw error; }
    finally { pendingConfiguration--; }
  }
  function mayAutoStart() { return !failed && autoStart && windowId === null && pendingWindowId === null && pendingConfiguration === 0; }
  return Object.freeze({ snapshot, start, stop, closeWindow, setBlocked, mayAutoStart });
}
