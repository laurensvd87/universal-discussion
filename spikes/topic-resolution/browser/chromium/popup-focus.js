const PORT_NAME = "page-matching-popup-focus/1";
const POPUP_PATH = "chromium/popup.html";
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

// A live packaged popup may own OS focus while its containing browser window
// reports focused=false. This witness is challenged afresh, never leased/cached.
export function createPopupFocusWitness({ runtime, onChange = () => {}, schedule = setTimeout,
  cancelSchedule = clearTimeout, timeoutMs = 500, now = () => performance.now() }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000) throw new TypeError("Invalid focus timeout");
  const popupUrl = runtime.getURL(POPUP_PATH);
  let active = null, activeCleanup = null, generation = 0, sequence = 0, pending = null, disposed = false;
  const current = (port, own) => !disposed && active === port && generation === own;
  function invalidate() { generation++; pending?.finish(null); onChange(); }
  async function live(port) {
    const documentId = port.sender.documentId;
    const contexts = await runtime.getContexts({ contextTypes: ["POPUP"], documentUrls: [popupUrl],
      ...(documentId === undefined ? {} : { documentIds: [documentId] }) });
    const eligible = (context) => context.contextType === "POPUP" && context.documentUrl === popupUrl &&
      context.tabId === -1 && context.incognito === false;
    // Chrome may omit sender.documentId for an action popup. Then this is only
    // lifecycle corroboration, not a document-ID join. The authenticated tabless
    // exact-URL port and trusted packaged responder provide the fresh witness.
    // This assumes action is the only tabless host for this packaged popup URL;
    // introducing another host requires a trust review before reusing this path.
    return documentId === undefined ? contexts.some(eligible) :
      contexts.length === 1 && eligible(contexts[0]) && contexts[0].documentId === documentId;
  }
  function connect(port) {
    if (port.name !== PORT_NAME) return;
    const sender = port.sender;
    if (disposed || sender?.id !== runtime.id || sender.tab || sender.url !== popupUrl ||
        (sender.documentId !== undefined && (typeof sender.documentId !== "string" || !sender.documentId))) { port.disconnect(); return; }
    const previous = active;
    activeCleanup?.(); activeCleanup = null;
    active = port; invalidate();
    previous?.disconnect();
    const receive = (message) => {
      if (active !== port || disposed) return;
      if (exactKeys(message, ["type"]) && message.type === "focus-change") { invalidate(); return; }
      if (!exactKeys(message, ["type", "sequence", "focused", "windowId"]) || message.type !== "focus-response" ||
          !Number.isSafeInteger(message.sequence) || typeof message.focused !== "boolean" ||
          !(message.windowId === null || Number.isSafeInteger(message.windowId))) { invalidate(); return; }
      pending?.answer(port, message);
    };
    const disconnected = () => { if (active === port) { activeCleanup?.(); activeCleanup = null; active = null; invalidate(); } };
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(disconnected);
    activeCleanup = () => { port.onMessage.removeListener(receive); port.onDisconnect.removeListener(disconnected); };
    function reject() { if (active !== port) return; activeCleanup?.(); activeCleanup = null; active = null; invalidate(); port.disconnect(); }
    const own = generation;
    void live(port).then((valid) => {
      if (!current(port, own)) return;
      if (valid) onChange(); else reject();
    }).catch(() => { if (current(port, own)) reject(); });
  }
  runtime.onConnect.addListener(connect);
  function check(windowId) {
    if (!active || disposed || !Number.isSafeInteger(windowId)) return Promise.resolve(null);
    if (pending) return pending.windowId === windowId ? pending.promise : Promise.resolve(null);
    if (sequence === Number.MAX_SAFE_INTEGER) return Promise.resolve(null);
    const port = active, own = generation, nonce = ++sequence, deadline = now() + timeoutMs;
    let resolve, timer, settled = false;
    const promise = new Promise((done) => { resolve = done; });
    function finish(value) {
      if (settled) return; settled = true; cancelSchedule(timer);
      if (pending?.promise === promise) pending = null;
      resolve(value);
    }
    const fresh = () => current(port, own) && now() < deadline;
    const valid = () => !settled && fresh();
    pending = { windowId, promise, finish, answer(from, message) {
      if (!valid() || from !== port || message.sequence !== nonce) return;
      if (!message.focused || message.windowId !== windowId) { finish(null); return; }
      void live(port).then((exists) => {
        if (valid()) finish(exists ? Object.freeze({ isCurrent: fresh }) : null);
      }).catch(() => finish(null));
    } };
    timer = schedule(() => finish(null), timeoutMs);
    void live(port).then((exists) => {
      if (!valid()) return;
      if (!exists) { finish(null); return; }
      port.postMessage({ type: "focus-challenge", sequence: nonce });
    }).catch(() => finish(null));
    return promise;
  }
  function dispose() {
    disposed = true; pending?.finish(null); generation++;
    runtime.onConnect.removeListener(connect); const port = active; active = null; port?.disconnect();
    activeCleanup?.(); activeCleanup = null;
  }
  return Object.freeze({ check, dispose });
}

export function connectPopupFocusResponder({ runtime, windows, document, window }) {
  let disposed = false, generation = 0;
  const port = runtime.connect({ name: PORT_NAME });
  const focused = () => !disposed && document.hasFocus() && document.visibilityState === "visible";
  function changed() {
    generation++;
    if (!disposed) { try { port.postMessage({ type: "focus-change" }); } catch { dispose(); } }
  }
  function dispose() {
    if (disposed) return; disposed = true; generation++;
    for (const [target, type, handler] of events) target.removeEventListener(type, handler);
    port.onMessage.removeListener(receive);
    port.onDisconnect.removeListener(dispose);
    try { port.disconnect(); } catch { /* Already disconnected. */ }
  }
  const hidden = () => { changed(); dispose(); };
  const events = [[window, "focus", changed], [window, "blur", changed], [window, "pagehide", hidden], [document, "visibilitychange", changed]];
  for (const [target, type, handler] of events) target.addEventListener(type, handler);
  port.onDisconnect.addListener(dispose);
  function receive(message) {
    if (!exactKeys(message, ["type", "sequence"]) || message.type !== "focus-challenge" ||
        !Number.isSafeInteger(message.sequence) || disposed) return;
    const own = generation;
    void (async () => {
      let browserWindow = null;
      if (focused()) { try { browserWindow = await windows.getCurrent({ populate: false }); } catch { /* Fail closed. */ } }
      if (disposed) return;
      const eligible = own === generation && focused() && browserWindow?.type === "normal" &&
        browserWindow.incognito === false && Number.isSafeInteger(browserWindow.id);
      try { port.postMessage({ type: "focus-response", sequence: message.sequence,
        focused: Boolean(eligible), windowId: eligible ? browserWindow.id : null }); } catch { dispose(); }
    })();
  }
  port.onMessage.addListener(receive);
  return Object.freeze({ dispose });
}
