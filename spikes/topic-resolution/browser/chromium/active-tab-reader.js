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
