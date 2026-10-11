import assert from "node:assert/strict";
import test from "node:test";
import { createInsightController } from "../browser/core/insight-controller.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { createInsightPreferenceStorage, INSIGHT_PREFERENCES_STORAGE_KEY } from "../browser/chromium/insight-preference-storage.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function harness(options = {}) {
  let sequence = 0;
  const service = createMemoryDemoService({ nextId: (kind) => `${kind}-${++sequence}`, now: () => "2026-10-11T12:00:00.000Z" });
  let insight;
  const requests = [];
  const discussion = createLocalDiscussionController({
    client: { health: async () => ({}), catalog: async () => service.catalog(), discussion: async (id) => service.discussion(id),
      related: async (id, limit) => service.related(id, limit), priorDiscussions: async (id) => service.priorDiscussions(id) },
    session: { isPaired: async () => true }, readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
    observeTabLifecycle: () => () => {},
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl, onStateChange: (state) => insight?.observe(state),
  });
  insight = createInsightController({ shareInsight: async () => false,
    aiClient: { status: async () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "synthetic", label: "Synthetic" } }),
      models: async () => [{ slug: "synthetic" }], start: async (request) => { requests.push(request); return { state: "running" }; },
      result: async (operationId) => ({ operationId, state: "completed", result: { body: "Synthetic result", model: "synthetic", citations: [] } }),
      cancel: async () => true },
    readArticle: async () => ({ url: "https://example.com/", documentId: "synthetic-doc", text: "Synthetic public text" }),
    attestArticle: async () => true, randomId: () => "synthetic-trust-op", ...options });
  await discussion.open(); await insight.checkConnection(); await insight.loadModels();
  return { insight, requests, discussion };
}

test("independent trust: settings and state reads never read native hint or invoke inference", async () => {
  let hints = 0;
  const app = await harness({ readBrowserLanguage: () => { hints++; return "de-DE"; } });
  app.insight.setInsightPreferences({ replyLanguage: "fr", deliveryCountry: "NL", currency: "USD" });
  app.insight.currentState(); app.insight.prepare(); await flush();
  assert.equal(hints, 0); assert.equal(app.requests.length, 0); app.insight.dispose();
});

test("independent trust: corrupt persisted browser hint cannot survive explicit opt-out", async () => {
  const app = await harness({ loadInsightPreferences: async () => ({ preferences: { replyLanguage: "en", browserLanguage: "de-DE" }, browserLanguageHintEnabled: false }),
    readBrowserLanguage: () => null });
  await flush();
  assert.equal(app.insight.currentState().preferencesStatus, "loadFailed");
  assert.deepEqual(app.insight.currentState().preferences, { replyLanguage: "en" });
  app.insight.setInsightPreferences({ replyLanguage: "en" }, false);
  assert.equal(await app.insight.createInsights({ automatic: true }), true);
  assert.deepEqual(app.requests[0].preferences, { replyLanguage: "en" }); app.insight.dispose();
});

test("independent trust: late load cannot overwrite edit and consecutive saves retain order", async () => {
  const load = deferred(), firstSave = deferred(), writes = [];
  const app = await harness({ loadInsightPreferences: () => load.promise,
    saveInsightPreferences: async (value) => { writes.push(value); if (writes.length === 1) await firstSave.promise; } });
  assert.equal(app.insight.setInsightPreferences({ replyLanguage: "fr" }, false), true);
  assert.equal(app.insight.setInsightPreferences({ replyLanguage: "nl", deliveryCountry: "NL" }, true), true);
  load.resolve({ preferences: { replyLanguage: "de", deliveryCountry: "DE" }, browserLanguageHintEnabled: false });
  await flush(); assert.equal(writes.length, 1);
  assert.deepEqual(app.insight.currentState().preferences, { replyLanguage: "nl", deliveryCountry: "NL" });
  firstSave.resolve(); await flush();
  assert.equal(writes.length, 2); assert.equal(writes[0].preferences.replyLanguage, "fr");
  assert.equal(writes[1].preferences.replyLanguage, "nl");
  assert.equal(app.insight.currentState().preferencesStatus, "saved"); app.insight.dispose();
});

test("independent trust: request freezes clicked settings through async article read and research-off", async () => {
  const read = deferred(), entered = deferred(); let hints = 0;
  const app = await harness({ readArticle: async () => { entered.resolve(); return read.promise; },
    readBrowserLanguage: () => { hints++; return "de-DE"; } });
  app.insight.setInsightPreferences({ replyLanguage: "fr", deliveryCountry: "NL", currency: "USD" }, true);
  app.insight.setRelatedPageTextEnabled(false);
  const created = app.insight.createInsights({ automatic: true }); await entered.promise;
  app.insight.setInsightPreferences({ replyLanguage: "es", deliveryCountry: "ES", currency: "EUR" }, false);
  read.resolve({ url: "https://example.com/", documentId: "synthetic-doc", text: "Synthetic public text" });
  assert.equal(await created, true); assert.equal(hints, 1);
  assert.deepEqual(app.requests[0].preferences, { replyLanguage: "fr", browserLanguage: "de-DE", deliveryCountry: "NL", currency: "USD" });
  assert.equal(app.requests[0].allowWebResearch, false); app.insight.dispose();
});

test("independent trust: storage never persists native hint or reads it during load/save", async () => {
  let hints = 0, saved;
  const storage = createInsightPreferenceStorage({ storageLocal: { get: async () => ({}), set: async (value) => { saved = value; } },
    i18n: { getUILanguage: () => { hints++; return "de-DE"; } } });
  assert.deepEqual(await storage.load(), { preferences: { replyLanguage: "en" }, browserLanguageHintEnabled: true });
  await storage.save({ preferences: { replyLanguage: "fr", deliveryCountry: "NL" }, browserLanguageHintEnabled: false });
  assert.equal(hints, 0);
  assert.deepEqual(saved[INSIGHT_PREFERENCES_STORAGE_KEY], { version: 1, preferences: { replyLanguage: "fr", deliveryCountry: "NL" }, browserLanguageHintEnabled: false });
  await assert.rejects(storage.save({ preferences: { browserLanguage: "de-DE" }, browserLanguageHintEnabled: false }));
  assert.equal(storage.readBrowserLanguage(), "de-DE"); assert.equal(hints, 1);
});

test("independent trust: simultaneous deliberate clicks waiting on load issue one request and hint read", async () => {
  const load = deferred(), read = deferred(), entered = deferred(); let hints = 0;
  const app = await harness({ loadInsightPreferences: () => load.promise,
    readArticle: async () => { entered.resolve(); return read.promise; },
    readBrowserLanguage: () => { hints++; return "de-DE"; } });
  const first = app.insight.createInsights({ automatic: true });
  const second = app.insight.createInsights({ automatic: true });
  assert.equal(hints, 0);
  load.resolve({ preferences: { replyLanguage: "fr" }, browserLanguageHintEnabled: true });
  await entered.promise; assert.equal(await second, false); assert.equal(hints, 1);
  read.resolve({ url: "https://example.com/", documentId: "synthetic-doc", text: "Synthetic public text" });
  assert.equal(await first, true); assert.equal(app.requests.length, 1);
  assert.deepEqual(app.requests[0].preferences, { replyLanguage: "fr", browserLanguage: "de-DE" }); app.insight.dispose();
});

test("independent trust: context detachment while preference load waits cancels request before metadata read", async () => {
  const load = deferred(); let hints = 0;
  const app = await harness({ loadInsightPreferences: () => load.promise,
    readBrowserLanguage: () => { hints++; return "de-DE"; } });
  const created = app.insight.createInsights({ automatic: true });
  app.insight.observe({ phase: "disconnected", error: "context-changed" });
  load.resolve({ preferences: { replyLanguage: "fr" }, browserLanguageHintEnabled: true });
  assert.equal(await created, false); assert.equal(hints, 0); assert.equal(app.requests.length, 0); app.insight.dispose();
});
