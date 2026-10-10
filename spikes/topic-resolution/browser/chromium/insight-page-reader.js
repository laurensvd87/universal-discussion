import { createPageContentReader } from "./page-content-reader.js";
import { isReadyPageResolution } from "../core/page-resolution-contract.js";
import { inspectPageUrl } from "../core/page-content-policy.js";

// Popup-only adapter. The background session must already own this exact page.
export function createInsightPageReader({ scriptingApi, readActiveTab }) {
  const reader = createPageContentReader(scriptingApi);
  if (typeof readActiveTab !== "function") throw new TypeError("Active tab reader required");
  async function match(state) {
    const resolution = state?.resolution;
    const source = state?.catalog?.sources.find((item) => item.id === state.sourceId && item.topicId === state.topicId);
    if (!source || !["automatic", "background", "manual"].includes(state.selection)) throw new TypeError("Current public page required");
    const tab = await readActiveTab();
    if (!Number.isSafeInteger(tab?.tabId) || !inspectPageUrl(tab.url).supported ||
        inspectPageUrl(tab.url).url !== source.url) throw new TypeError("Current page changed");
    if (state.selection === "background" && (!isReadyPageResolution(resolution) ||
        tab.windowId !== undefined && tab.windowId !== resolution.currentWindowId ||
        state.sourceId !== resolution.sourceId ||
        state.topicId !== resolution.topicId || tab.tabId !== resolution.tabId || source.url !== resolution.url)) {
      throw new TypeError("Current page changed");
    }
    return { tabId: tab.tabId, url: source.url, documentId: state.selection === "background" ? resolution.documentId : null };
  }
  async function read(state) {
    const resolution = await match(state);
    const content = await reader.read(resolution.tabId, resolution.url);
    if (resolution.documentId && content.documentId !== resolution.documentId || content.result.status !== "collected") throw new TypeError("Current page changed");
    await match(state);
    return Object.freeze({ text: content.result.text, url: resolution.url, documentId: content.documentId });
  }
  async function attest(state, article) {
    const resolution = await match(state);
    if (article?.url !== resolution.url || !article.documentId ||
        resolution.documentId && article.documentId !== resolution.documentId) throw new TypeError("Current page changed");
    const result = await reader.attest(resolution.tabId, article.documentId, resolution.url);
    if (result.status !== "attested") throw new TypeError("Current page changed");
    await match(state);
    return true;
  }
  return Object.freeze({ read, attest });
}
