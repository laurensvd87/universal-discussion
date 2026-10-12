import { inspectPageUrl, inspectPageNavigationUrl } from "./page-content-policy.js";

// Presentation work budgets, not canonical storage or ingestion limits.
const CATALOG_BUDGET = 512;
const RELATED_BUDGET = 100;
const PAGE_LIMIT = 20;
const unsafeText = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const validId = value => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
const sameVersion = (left, right) => left && right && validId(left.generation) &&
  Number.isSafeInteger(left.revision) && left.revision >= 0 &&
  left.generation === right.generation && left.revision === right.revision;
const output = (contextKey, pages = [], loading = false) =>
  Object.freeze({ contextKey, pages: Object.freeze(pages), loading });

function safeUrl(value) {
  const inspected = inspectPageUrl(value);
  return inspected.supported && inspected.url === value ? value : null;
}

/** Read-only suggestions from the already captured current catalog/related DTOs. */
export function projectRelatedPages(state) {
  try {
    const resolution = state?.resolution;
    const loading = ["connecting", "loading"].includes(state?.phase) ||
      ["checking", "processing"].includes(resolution?.phase);
    if (state?.phase !== "ready" || state.error || state.needsFreshRead ||
        state.connected === false || !validId(state.sourceId) || !validId(state.topicId) ||
        !Array.isArray(state.catalog?.sources)) return output(null, [], loading);
    const sources = state.catalog.sources.slice(0, CATALOG_BUDGET);
    const current = sources.find(source => source?.id === state.sourceId);
    if (!current || current.topicId !== state.topicId || !safeUrl(current.url)) return output(null);

    let currentUrl = current.url;
    if (resolution) {
      // Navigation URLs may contain tracking/session fields stripped from the
      // canonical Source. Preserve the exact witness in the context key only.
      const navigation = inspectPageNavigationUrl(resolution.currentUrl);
      if (resolution.phase !== "ready" || resolution.contextReason ||
          resolution.sourceId !== state.sourceId || resolution.topicId !== state.topicId ||
          resolution.currentUrl !== resolution.url || !navigation.supported ||
          navigation.url !== current.url ||
          (resolution.currentTabId !== undefined && resolution.tabId !== resolution.currentTabId) ||
          (resolution.sessionWindowId !== undefined && resolution.currentWindowId !== resolution.sessionWindowId) ||
          resolution.enabled === false || resolution.hostAccess === false ||
          (Array.isArray(resolution.blockedOrigins) && resolution.blockedOrigins.includes(navigation.origin))) {
        return output(null, [], loading);
      }
      currentUrl = resolution.currentUrl;
    }
    if (state.currentUrl !== undefined && state.currentUrl !== currentUrl) return output(null);
    const contextKey = JSON.stringify([state.sourceId, state.topicId, currentUrl]);
    const related = state.related;
    if (related && ((related.sourceId !== undefined && related.sourceId !== state.sourceId) ||
        (related.version !== undefined && !sameVersion(related.version, state.catalog.version)))) {
      return output(null);
    }
    const pages = [], ids = new Set([current.id]), urls = new Set([current.url]);
    function append(source, relationship) {
      if (pages.length >= PAGE_LIMIT || !validId(source?.id) || ids.has(source.id) ||
          !safeUrl(source.url) || urls.has(source.url)) return;
      const hostname = new URL(source.url).hostname;
      const title = typeof source.title === "string"
        ? source.title.replace(unsafeText, "").trim().slice(0, 200).trim() : "";
      pages.push(Object.freeze({ id: source.id, url: source.url,
        title: title || hostname, hostname, relationship }));
      ids.add(source.id); urls.add(source.url);
    }
    // Confirmed membership comes from catalog metadata, never similarity.
    for (const source of sources) {
      if (source?.topicId === state.topicId) append(source, "same-topic");
    }
    // Keep the backend's ordering among related suggestions.
    for (const candidate of (Array.isArray(related?.results) ? related.results : []).slice(0, RELATED_BUDGET)) {
      const source = sources.find(entry => entry?.id === candidate?.id);
      if (!source || source.url !== candidate.url || source.title !== candidate.title ||
          (candidate.topicId !== undefined && source.topicId !== candidate.topicId) ||
          !["same-topic", "related"].includes(candidate.relationship) ||
          (candidate.relationship === "same-topic" && source.topicId !== state.topicId)) continue;
      append(source, source.topicId === state.topicId ? "same-topic" : "related");
    }
    return output(contextKey, pages);
  } catch {
    return output(null);
  }
}
