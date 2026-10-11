import { createPageContentReader } from "./page-content-reader.js";
import { isReadyPageResolution } from "../core/page-resolution-contract.js";
import { inspectPageUrl, inspectPageNavigationUrl } from "../core/page-content-policy.js";

// Popup-only adapter. The background session must already own this exact page.
export function createInsightPageReader({ scriptingApi, readActiveTab }) {
  const reader = createPageContentReader(scriptingApi);
  // Only the current capture keeps its original navigation witness in RAM.
  // The controller may project article objects down to URL/documentId.
  let captured = null;
  if (typeof readActiveTab !== "function") throw new TypeError("Active tab reader required");
  async function match(state) {
    const resolution = state?.resolution;
    const source = state?.catalog?.sources.find((item) => item.id === state.sourceId && item.topicId === state.topicId);
    if (!source || !["automatic", "background", "manual"].includes(state.selection)) throw new TypeError("Current public page required");
    const tab = await readActiveTab();
    const inspected = inspectPageNavigationUrl(tab?.url);
    const sourceUrl = inspectPageUrl(source.url);
    if (!Number.isSafeInteger(tab?.tabId) || !sourceUrl.supported || sourceUrl.url !== source.url ||
        !inspected.supported || inspected.url !== source.url) throw new TypeError("Current page changed");
    if (state.selection === "background" && (!isReadyPageResolution(resolution) ||
        tab.windowId !== undefined && tab.windowId !== resolution.currentWindowId ||
        state.sourceId !== resolution.sourceId ||
        state.topicId !== resolution.topicId || tab.tabId !== resolution.tabId || inspected.documentUrl !== resolution.url)) {
      throw new TypeError("Current page changed");
    }
    return { tabId: tab.tabId, url: source.url, documentUrl: inspected.documentUrl,
      documentId: state.selection === "background" ? resolution.documentId : null };
  }
  function sameDocument(left, right) {
    return left.tabId === right.tabId && left.url === right.url && left.documentUrl === right.documentUrl &&
      left.documentId === right.documentId;
  }
  async function read(state) {
    captured = null;
    const resolution = await match(state);
    const content = await reader.read(resolution.tabId, resolution.url, resolution.documentUrl);
    if (resolution.documentId && content.documentId !== resolution.documentId || content.result.status !== "collected") throw new TypeError("Current page changed");
    if (!sameDocument(resolution, await match(state))) throw new TypeError("Current page changed");
    captured = { ...resolution, capturedDocumentId: content.documentId };
    return Object.freeze({ text: content.result.text, url: resolution.url, documentId: content.documentId });
  }
  async function attest(state, article) {
    try {
      const resolution = await match(state);
      if (!captured || !sameDocument(captured, resolution) || article?.url !== resolution.url ||
          article.documentId !== captured.capturedDocumentId || !article.documentId ||
          resolution.documentId && article.documentId !== resolution.documentId) throw new TypeError("Current page changed");
      const result = await reader.attest(resolution.tabId, article.documentId, resolution.url, resolution.documentUrl);
      if (result.status !== "attested") throw new TypeError("Current page changed");
      if (!sameDocument(resolution, await match(state))) throw new TypeError("Current page changed");
      return true;
    } catch (error) { captured = null; throw error; }
  }
  return Object.freeze({ read, attest });
}
