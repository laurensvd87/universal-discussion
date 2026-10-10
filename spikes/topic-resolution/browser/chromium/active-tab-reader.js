const ACTIVE_CURRENT_TAB_QUERY = Object.freeze({
  active: true,
  currentWindow: true,
});

export function createActiveTabReader(tabsApi) {
  if (
    tabsApi === null ||
    typeof tabsApi !== "object" ||
    typeof tabsApi.query !== "function"
  ) {
    throw new TypeError("Active tab reader requires a query function");
  }

  async function read() {
    try {
      const tabs = await tabsApi.query(ACTIVE_CURRENT_TAB_QUERY);
      if (!Array.isArray(tabs) || tabs.length !== 1) {
        throw new TypeError("Active tab read failed");
      }
      const tab = tabs[0];
      if (tab === null || typeof tab !== "object") {
        throw new TypeError("Active tab read failed");
      }
      return Object.freeze({ tabId: tab.id, url: tab.url });
    } catch {
      throw new TypeError("Active tab read failed");
    }
  }

  return Object.freeze({ read });
}

export function createTabLifecycleObserver(tabsApi) {
  const eventNames = ["onUpdated", "onRemoved", "onReplaced"];
  if (
    tabsApi === null ||
    typeof tabsApi !== "object" ||
    eventNames.some((name) =>
      typeof tabsApi[name]?.addListener !== "function" ||
      typeof tabsApi[name]?.removeListener !== "function")
  ) {
    throw new TypeError("Tab lifecycle observer requires event adapters");
  }

  function observe(tabId, invalidate) {
    if (!Number.isSafeInteger(tabId) || tabId < 0 || typeof invalidate !== "function") {
      throw new TypeError("Tab lifecycle observation is invalid");
    }
    let disposed = false;
    const registrations = [];
    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const [event, listener] of registrations) event.removeListener(listener);
    }
    // Event payloads can include unrelated browsing data. Inspect only the ID;
    // even a non-navigation update conservatively invalidates this snapshot.
    function changed(changedTabId) {
      if (disposed || changedTabId !== tabId) return;
      dispose();
      invalidate();
    }
    function replaced(addedTabId, removedTabId) {
      changed(removedTabId);
    }
    try {
      for (const [name, listener] of [
        ["onUpdated", changed],
        ["onRemoved", changed],
        ["onReplaced", replaced],
      ]) {
        const event = tabsApi[name];
        registrations.push([event, listener]);
        event.addListener(listener);
      }
    } catch {
      dispose();
      throw new TypeError("Tab lifecycle observation failed");
    }
    return dispose;
  }

  return Object.freeze({ observe });
}

export function createWindowBoundActiveTabReader({ tabsApi, windowsApi, windowId }) {
  if (!Number.isSafeInteger(windowId) || windowId < 0 ||
      typeof tabsApi?.query !== "function" || typeof windowsApi?.get !== "function")
    throw new TypeError("Window-bound reader unavailable");
  async function read() {
    try {
      const before = await windowsApi.get(windowId);
      if (before?.id !== windowId || before.type !== "normal" || before.incognito || !before.focused)
        throw new TypeError();
      const tabs = await tabsApi.query({ active: true, windowId });
      if (!Array.isArray(tabs) || tabs.length !== 1) throw new TypeError();
      const tab = tabs[0];
      if (!Number.isSafeInteger(tab?.id) || tab.id < 0 || tab.windowId !== windowId ||
          tab.incognito || !tab.active || tab.pendingUrl || tab.status !== "complete" ||
          typeof tab.url !== "string") throw new TypeError();
      const after = await windowsApi.get(windowId);
      if (after?.id !== windowId || after.type !== "normal" || after.incognito || !after.focused)
        throw new TypeError();
      const current = await tabsApi.query({ active: true, windowId });
      if (!Array.isArray(current) || current.length !== 1 || current[0]?.id !== tab.id ||
          current[0]?.url !== tab.url || current[0]?.pendingUrl || current[0]?.status !== "complete")
        throw new TypeError();
      return Object.freeze({ tabId: tab.id, url: tab.url, windowId });
    } catch { throw new TypeError("Window-bound active tab unavailable"); }
  }
  return Object.freeze({ read });
}

export function createWindowBoundTabLifecycleObserver({ tabsApi, windowsApi, windowId }) {
  const tabNames = ["onUpdated", "onRemoved", "onReplaced", "onActivated"];
  if (!Number.isSafeInteger(windowId) || windowId < 0 ||
      tabNames.some((name) => typeof tabsApi?.[name]?.addListener !== "function" ||
        typeof tabsApi?.[name]?.removeListener !== "function") ||
      ["onFocusChanged", "onRemoved"].some((name) =>
        typeof windowsApi?.[name]?.addListener !== "function" ||
        typeof windowsApi?.[name]?.removeListener !== "function"))
    throw new TypeError("Window-bound observer unavailable");
  function subscribe(tabId, invalidate) {
    if (tabId !== null && (!Number.isSafeInteger(tabId) || tabId < 0) || typeof invalidate !== "function")
      throw new TypeError("Window-bound observation invalid");
    let disposed = false;
    const registrations = [];
    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const [event, listener] of registrations) event.removeListener(listener);
    }
    function fire() { if (!disposed) { dispose(); invalidate(); } }
    function updated(id, detail, tab) {
      const navigation = Boolean(detail && (Object.hasOwn(detail, "status") ||
        Object.hasOwn(detail, "url") || Object.hasOwn(detail, "pendingUrl")));
      if (navigation && (tabId === null ? tab?.windowId === windowId && tab.active === true : id === tabId)) fire();
    }
    function removed(id) { if (tabId !== null && id === tabId) fire(); }
    function replaced(_added, removedId) { if (tabId !== null && removedId === tabId) fire(); }
    function activated(info) { if (info?.windowId === windowId && (tabId === null || info.tabId !== tabId)) fire(); }
    function focus() { fire(); }
    function closed(id) { if (id === windowId) fire(); }
    try {
      for (const [event, listener] of [
        [tabsApi.onUpdated, updated], [tabsApi.onRemoved, removed], [tabsApi.onReplaced, replaced],
        [tabsApi.onActivated, activated], [windowsApi.onFocusChanged, focus], [windowsApi.onRemoved, closed],
      ]) { event.addListener(listener); registrations.push([event, listener]); }
    } catch { dispose(); throw new TypeError("Window-bound observation failed"); }
    return dispose;
  }
  return Object.freeze({ observe: (tabId, invalidate) => subscribe(tabId, invalidate),
    observeWindow: (invalidate) => subscribe(null, invalidate) });
}
