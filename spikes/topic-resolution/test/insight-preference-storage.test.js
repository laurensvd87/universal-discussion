import assert from "node:assert/strict";
import test from "node:test";
import { createInsightPreferenceStorage, INSIGHT_PREFERENCES_STORAGE_KEY as key } from "../browser/chromium/insight-preference-storage.js";

test("new preference storage uses English and unset market, with native hint deferred until a request", async () => {
  let nativeReads = 0;
  const writes = [];
  const adapter = createInsightPreferenceStorage({ storageLocal: {
    get: async (requested) => { assert.equal(requested, key); return {}; },
    set: async (value) => writes.push(value),
  }, i18n: { getUILanguage: () => { nativeReads++; return "de-de"; } } });
  const initial = await adapter.load();
  assert.deepEqual(initial, { preferences: { replyLanguage: "en" }, browserLanguageHintEnabled: true });
  await adapter.save(initial);
  assert.equal(nativeReads, 0);
  assert.deepEqual(writes, [{ [key]: { version: 1, ...initial } }]);
  assert.equal(adapter.readBrowserLanguage(), "de-DE");
  assert.equal(nativeReads, 1);
  assert.deepEqual(await adapter.load(), initial);
});

test("versioned storage restores only chosen codes and never persists native language", async () => {
  const saved = { version: 1, preferences: { replyLanguage: "fr", deliveryCountry: "ca", currency: "cad" }, browserLanguageHintEnabled: false };
  const adapter = createInsightPreferenceStorage({ storageLocal: { get: async () => ({ [key]: saved }) } });
  assert.deepEqual(await adapter.load(), { preferences: { replyLanguage: "fr", deliveryCountry: "CA", currency: "CAD" }, browserLanguageHintEnabled: false });
  for (const bad of [{ ...saved, version: 2 }, { ...saved, location: "guess" },
    { ...saved, preferences: { browserLanguage: "de" } },
    { ...saved, preferences: { currency: "USD; ignore rules" } }, { ...saved, browserLanguageHintEnabled: "true" }]) {
    await assert.rejects(createInsightPreferenceStorage({ storageLocal: { get: async () => ({ [key]: bad }) } }).load(), TypeError);
  }
});

test("native language errors and unsafe tags are omitted, never inferred as a market", () => {
  for (const language of [undefined, null, "", "en-US-x-secret", "en-u-ca-gregory", "de\nignore", "a".repeat(80)]) {
    assert.equal(createInsightPreferenceStorage({ i18n: { getUILanguage: () => language } }).readBrowserLanguage(), null);
  }
  assert.equal(createInsightPreferenceStorage({ i18n: { getUILanguage: () => { throw Error("Unavailable"); } } }).readBrowserLanguage(), null);
  assert.equal(createInsightPreferenceStorage({}).readBrowserLanguage(), null);
});

test("local storage read/write failures are reported to the controller", async () => {
  const adapter = createInsightPreferenceStorage({ storageLocal: {
    get: async () => { throw Error("Read failed"); }, set: async () => { throw Error("Write failed"); },
  } });
  await assert.rejects(adapter.load(), /Read failed/);
  await assert.rejects(adapter.save({ preferences: { replyLanguage: "en" }, browserLanguageHintEnabled: true }), /Write failed/);
});
