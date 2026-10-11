import assert from "node:assert/strict";
import test from "node:test";
import { preparePrivateGeneration } from "../browser/core/private-generation-context.js";
import { readDiscovery, readPrivateResponse } from "../browser/core/community-contract.js";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";

function fixture() {
  let n = 0;
  const service = createMemoryDemoService({ nextId: prefix => `${prefix}-${++n}`, now: () => "2026-10-11T12:00:00.000Z" });
  const sourceId = "reserved-example-com", topicId = "reserved-domain-demo";
  let state = { phase: "ready", busy: false, needsFreshRead: false, sourceId, topicId, actorId: "account-owner",
    selection: "background", catalog: service.catalog(), discussion: service.discussion(topicId), related: service.related(sourceId, 20),
    resolution: { documentId: "doc", url: "https://example.com/", tabId: 1, currentWindowId: 2 } };
  let insight = { ai: { connected: true, planEnabled: true, model: "fixture", account: { clientId: "fixture", label: "test" } },
    preferences: { replyLanguage: "en" }, browserLanguageHintEnabled: true, relatedPageTextEnabled: false };
  const options = { sourceId, readState: () => state, readInsight: () => insight,
    readArticle: async () => ({ text: "Public fixture extract", url: "https://example.com/", documentId: "doc" }),
    attestArticle: async () => true, readBrowserLanguage: () => "de" };
  return { options, state: () => state, change: patch => { state = { ...state, ...patch }; },
    insight: () => insight, changeInsight: patch => { insight = { ...insight, ...patch }; } };
}
test("private preparation keeps public discussion text out and follows research/language preferences", async () => {
  const f = fixture(), value = await preparePrivateGeneration(f.options);
  assert.equal(value.articleText, "Public fixture extract"); assert.equal(value.allowWebResearch, false);
  assert.equal(value.context.coverage.discussionIncluded, false); assert.deepEqual(value.context.discussion, []);
  assert.equal(value.preferences.browserLanguage, "de"); assert.equal(value.preferences.replyLanguage, "en");
  assert.ok(!Object.hasOwn(value, "followup")); assert.ok(!Object.hasOwn(value, "operationId"));
});
test("private preparation rejects account, Source, document and model changes during reading", async () => {
  for (const change of [f => f.change({ actorId: "account-other" }), f => f.change({ sourceId: "reserved-example-org" }),
    f => f.change({ resolution: { ...f.state().resolution, documentId: "different" } }),
    f => f.changeInsight({ ai: { ...f.insight().ai, model: "other" } }),
    f => f.changeInsight({ ai: { ...f.insight().ai, account: { clientId: "other", label: "other" } } })]) {
    const f = fixture(); f.options.readArticle = async () => { change(f); return { text: "No stale send" }; };
    await assert.rejects(preparePrivateGeneration(f.options));
  }
  const f = fixture(); f.change({ actorId: "demo-alex" }); await assert.rejects(preparePrivateGeneration(f.options));
});
test("community response contracts reject unsafe destinations, secrets and oversized pages", () => {
  const page = { version: { generation: "fixture", revision: 1 }, query: "test", nextCursor: null,
    results: [{ topicId: "topic", discussionId: "discussion", title: "Test", kind: "general", snippet: "", visibleCount: 1,
      updatedAt: "2026-10-11T12:00:00.000Z", sources: [{ id: "source", title: "Safe", url: "https://example.com/" }] }] };
  assert.equal(readDiscovery(page), page);
  for (const url of ["javascript:alert(1)", "https://example.org/account", "https://example.org/?sid=secret"]) {
    assert.throws(() => readDiscovery({ ...page, results: [{ ...page.results[0], sources: [{ id: "source", title: "Unsafe", url }] }] }));
    assert.throws(() => readPrivateResponse({ conversation: { sourceUrl: url } }));
  }
  assert.throws(() => readPrivateResponse({ accessToken: "secret" }));
  assert.throws(() => readPrivateResponse({ messages: Array(31).fill({ body: "x" }) }));
});
