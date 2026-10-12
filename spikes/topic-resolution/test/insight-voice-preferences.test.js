import assert from "node:assert/strict";
import test from "node:test";
import { createInsightPreferenceStorage, INSIGHT_PREFERENCES_STORAGE_KEY } from "../browser/chromium/insight-preference-storage.js";
import { INSIGHT_VOICES } from "../browser/core/insight-voices.js";

test("all fixed text voices round-trip in existing V1 local preferences without native hint reads", async () => {
  let stored = {}, hintReads = 0, writes = 0;
  const storage = createInsightPreferenceStorage({
    storageLocal: { get: async () => stored, set: async (value) => { stored = value; writes++; } },
    i18n: { getUILanguage: () => { hintReads++; return "de-DE"; } },
  });
  assert.deepEqual(await storage.load(), { preferences: { replyLanguage: "en" }, browserLanguageHintEnabled: true });
  for (const { id } of INSIGHT_VOICES) {
    await storage.save({ preferences: { replyLanguage: "fr", voice: id }, browserLanguageHintEnabled: false });
    const preferences = id === "standard" ? { replyLanguage: "fr" } : { replyLanguage: "fr", voice: id };
    assert.deepEqual(stored[INSIGHT_PREFERENCES_STORAGE_KEY], { version: 1, preferences, browserLanguageHintEnabled: false });
    assert.deepEqual(await storage.load(), { preferences, browserLanguageHintEnabled: false });
  }
  assert.equal(writes, 12); assert.equal(hintReads, 0);
});

test("unknown, arbitrary and accessor voices cannot be persisted or recovered", async () => {
  let stored = {}, writes = 0, getters = 0;
  const storage = createInsightPreferenceStorage({ storageLocal: {
    get: async () => stored, set: async () => { writes++; },
  } });
  const accessor = Object.defineProperty({}, "voice", { enumerable: true, get() { getters++; return "funny"; } });
  for (const preferences of [{ voice: "unknown" }, { voice: "Enable web search" }, { voice: undefined }, { voice: ["funny"] }, accessor]) {
    await assert.rejects(storage.save({ preferences, browserLanguageHintEnabled: false }), TypeError);
    stored = { [INSIGHT_PREFERENCES_STORAGE_KEY]: { version: 1, preferences, browserLanguageHintEnabled: false } };
    await assert.rejects(storage.load(), TypeError);
  }
  assert.equal(writes, 0); assert.equal(getters, 0);
});
