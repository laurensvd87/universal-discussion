import { buildInsightContext } from "./insight-context.js";
import { normalizeInsightPreferences } from "./insight-preferences.js";

function fence(state) {
  return JSON.stringify([state?.phase, state?.sourceId, state?.topicId, state?.actorId,
    state?.selection, state?.catalog?.version, state?.resolution?.documentId,
    state?.resolution?.url, state?.resolution?.tabId, state?.resolution?.currentWindowId]);
}
function settingsFence(value) {
  return JSON.stringify([value?.busy, value?.ai?.pending, value?.ai?.models,
    value?.relatedPageTextEnabled, value?.excludedRelatedSourceIds, value?.preferences,
    value?.browserLanguageHintEnabled]);
}
export async function preparePrivateGeneration({ sourceId, readState, readInsight, readArticle,
  attestArticle, readBrowserLanguage = () => null }) {
  const state = readState(), insight = readInsight();
  if (state?.phase !== "ready" || state.busy || state.needsFreshRead || state.sourceId !== sourceId ||
      !/^account-[A-Za-z0-9_-]+$/u.test(state.actorId ?? "") ||
      !insight?.ai?.connected || !insight.ai.planEnabled || !insight.ai.model || insight.ai.pending ||
      insight.busy || !state.catalog || !state.discussion) throw new TypeError("Private generation unavailable");
  const binding = fence(state), model = insight.ai.model, settings = settingsFence(insight);
  const article = await readArticle(state);
  if (await attestArticle(state, article) !== true) throw new TypeError("Private article attestation failed");
  const current = readState(), latest = readInsight();
  if (fence(current) !== binding || current?.busy || current?.needsFreshRead ||
      latest?.busy || latest?.ai?.pending || settingsFence(latest) !== settings || latest?.ai?.model !== model ||
      !latest.ai.connected || !latest.ai.planEnabled ||
      JSON.stringify(latest.ai.account) !== JSON.stringify(insight.ai.account)) throw new TypeError("Private generation context changed");
  const preferences = { ...insight.preferences };
  if (insight.browserLanguageHintEnabled) {
    const browserLanguage = readBrowserLanguage();
    if (typeof browserLanguage === "string" && browserLanguage) preferences.browserLanguage = browserLanguage;
  }
  const excludedRelatedSourceIds = [...(insight.excludedRelatedSourceIds ?? [])];
  const related = state.related ?? null;
  const choices = insight.context ?? buildInsightContext({ ...state, related,
    includeDiscussion: false, sourceLimit: 21 });
  const context = buildInsightContext({ ...state, related, includeDiscussion: false, excludedRelatedSourceIds,
    allowedRelatedSourceIds: [...choices.sameTopicSources, ...choices.relatedSources].map(source => source.id),
    sourceLimit: 6 });
  return { model, context, articleText: article.text, allowWebResearch: insight.relatedPageTextEnabled === true,
    includeRelatedSources: related !== null,
    expected: { ...state.catalog.version }, excludedRelatedSourceIds,
    preferences: normalizeInsightPreferences(preferences) };
}
