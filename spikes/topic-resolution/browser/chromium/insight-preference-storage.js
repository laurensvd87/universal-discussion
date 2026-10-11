import { normalizeInsightPreferences, DEFAULT_INSIGHT_PREFERENCES } from "../core/insight-preferences.js";

export const INSIGHT_PREFERENCES_STORAGE_KEY = "insightPreferencesV1";

function projectSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      !["version", "preferences", "browserLanguageHintEnabled"].every((field) => Object.hasOwn(value, field)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((field) => !Object.hasOwn(field, "value") || !field.enumerable) ||
      Reflect.ownKeys(value).some((key) => !["version", "preferences", "browserLanguageHintEnabled"].includes(key)) ||
      value.version !== 1 || typeof value.browserLanguageHintEnabled !== "boolean")
    throw new TypeError("Invalid Insight settings");
  const preferences = normalizeInsightPreferences(value.preferences);
  if (Object.hasOwn(preferences, "browserLanguage")) throw new TypeError("Invalid saved language hint");
  return { preferences, browserLanguageHintEnabled: value.browserLanguageHintEnabled };
}

// No native-language read on startup or save. The controller reads this hint
// only as part of an explicit request; it never determines a shipping country.
export function createInsightPreferenceStorage({ storageLocal, i18n } = {}) {
  return Object.freeze({
    load: async () => {
      const stored = await storageLocal.get(INSIGHT_PREFERENCES_STORAGE_KEY);
      if (!Object.hasOwn(stored, INSIGHT_PREFERENCES_STORAGE_KEY))
        return { preferences: { ...DEFAULT_INSIGHT_PREFERENCES }, browserLanguageHintEnabled: true };
      return projectSettings(stored[INSIGHT_PREFERENCES_STORAGE_KEY]);
    },
    save: async (value) => {
      const settings = projectSettings({ version: 1, ...value });
      await storageLocal.set({ [INSIGHT_PREFERENCES_STORAGE_KEY]: { version: 1, ...settings } });
    },
    readBrowserLanguage: () => {
      try {
        const language = i18n?.getUILanguage?.();
        return normalizeInsightPreferences({ replyLanguage: "en", browserLanguage: language }).browserLanguage ?? null;
      } catch { return null; }
    },
  });
}
