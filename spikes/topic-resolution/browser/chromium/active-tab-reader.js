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
