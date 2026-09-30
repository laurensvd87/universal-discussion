import assert from "node:assert/strict";
import test from "node:test";
import { ChatGptInsightError, createChatGptInsights } from "../src/ai/chatgpt-insights.js";

const ACCESS = "synthetic-oauth-token-for-tests";
const source = (id, url = `https://example.com/${id}`) => ({ id, url, title: `Title ${id}` });
const CONTEXT = {
  schema: "insight-context/v1", topic: { id: "topic-a", title: "A provisional Topic" },
  currentSource: source("current"), sameTopicSources: [source("same", "https://news.example.org/same")],
  relatedSources: [source("related", "https://research.example.net/related")], discussion: [],
  coverage: { sameTopicTotal: 1, relatedTotal: 1, discussionIncluded: false },
  limitations: ["grouping-provisional", "related-not-same-topic", "title-url-only", "sources-unverified", "visible-roots-only"],
};
const REQUEST = { model: "synthetic-model", context: CONTEXT, articleText: "A public article prefix.", allowWebResearch: true };
function models() { return new Response(JSON.stringify({ models: [
  { slug: "synthetic-model", display_name: "Synthetic model", visibility: "list" },
  { slug: "hidden-model", display_name: "Hidden", visibility: "hide" },
] }), { headers: { "content-type": "application/json" } }); }
function event(type, response) { return `event: ${type}\ndata: ${JSON.stringify({ type, response })}\n\n`; }
function complete(text = "A bounded finding [1].", annotations = []) {
  return event("response.completed", { status: "completed", output: [{ type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text, annotations }] }] });
}
function stream(body) { return new Response(body, { headers: { "content-type": "text/event-stream" } }); }
function errorCode(code) { return (error) => error instanceof ChatGptInsightError && error.code === code &&
  error.message === "ChatGPT insight request unavailable"; }

test("constructor is inert; listed model and exact public Responses envelope", async () => {
  const calls = [];
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    calls.push({ url, options }); return url.endsWith("/models") ? models() : stream(complete());
  }, getAccessToken: async () => ACCESS, now: () => 1_000 });
  assert.equal(calls.length, 0);
  assert.deepEqual(await adapter.listModels(), [{ slug: "synthetic-model", displayName: "Synthetic model" }]);
  const insight = await adapter.createInsight(REQUEST);
  assert.deepEqual(insight, { body: "A bounded finding [1].", citations: [], model: "synthetic-model" });
  assert.deepEqual(calls.map((item) => item.url), ["https://api.openai.com/v1/models", "https://api.openai.com/v1/responses"]);
  const sent = JSON.parse(calls[1].options.body);
  assert.deepEqual(Object.keys(sent), ["model", "store", "stream", "instructions", "input", "tools"]);
  assert.equal(sent.store, false); assert.equal(sent.stream, true);
  assert.equal(sent.input.length, 1); assert.equal(sent.input[0].role, "user");
  assert.deepEqual(sent.tools, [{ type: "web_search", search_context_size: "low",
    filters: { allowed_domains: ["example.com", "news.example.org", "research.example.net"] } }]);
  assert.ok(!JSON.stringify(sent).includes("synthetic-oauth-token"));
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, `Bearer ${ACCESS}`);
    assert.equal(call.options.redirect, "error"); assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.cache, "no-store"); assert.equal(call.options.referrerPolicy, "no-referrer");
  }
});

test("strict context rebuild blocks hidden data, unsafe URLs and unauthorized model without inference", async () => {
  let posts = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) return models(); posts += 1; return stream(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  for (const changed of [
    { ...REQUEST, model: "hidden-model" },
    { ...REQUEST, context: { ...CONTEXT, token: "secret" } },
    { ...REQUEST, context: { ...CONTEXT, currentSource: source("current", "https://example.com/account") } },
    { ...REQUEST, context: { ...CONTEXT, relatedSources: [source("related", "javascript:alert(1)")] } },
    { ...REQUEST, context: { ...CONTEXT, discussion: [{ id: "post", actorType: "agent", body: "Private" }] } },
    { ...REQUEST, articleText: "x".repeat(4_097) },
    { ...REQUEST, allowWebResearch: "false" },
  ]) await assert.rejects(adapter.createInsight(changed), (error) => errorCode(changed.model === "hidden-model" ? "model-unavailable" : "invalid-input")(error));
  assert.equal(posts, 0);
});

test("explicit tool-free mode omits web search and preserves the requested model", async () => {
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body);
    return stream(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  await adapter.createInsight({ ...REQUEST, allowWebResearch: false });
  assert.deepEqual(payload.tools, []);
  assert.match(payload.instructions, /Do not use external research/u);
});

test("clearing account models invalidates old selection without resetting the call quota", async () => {
  let dispatched = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) return models();
    dispatched += 1;
    return stream(complete());
  }, getAccessToken: async () => ACCESS, now: () => 1_000 });
  await adapter.listModels();
  await adapter.createInsight(REQUEST);
  adapter.clearModels();
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("model-unavailable"));
  await adapter.listModels();
  for (let i = 0; i < 4; i++) await adapter.createInsight(REQUEST);
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("rate-limit"));
  assert.equal(dispatched, 5);
});

test("cancellation while access token is pending prevents a later request", async () => {
  let release;
  let dispatches = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    dispatches += 1;
    return url.endsWith("/models") ? models() : stream(complete());
  }, getAccessToken: async () => new Promise((resolve) => { release = resolve; }) });
  const pending = adapter.listModels();
  adapter.cancel();
  await assert.rejects(pending, errorCode("cancelled"));
  release(ACCESS);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(dispatches, 0);
});

test("completed event alone yields bounded text and safe citation offsets", async () => {
  const citation = { type: "url_citation", url: "https://research.example.net/check", title: "Checked page", start_index: 2, end_index: 8 };
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(`event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n${complete("Evidence [1].", [citation,
      { ...citation, url: "javascript:alert(1)" }, { ...citation, end_index: 100 }])}`), getAccessToken: async () => ACCESS });
  await adapter.listModels();
  assert.deepEqual(await adapter.createInsight(REQUEST), { body: "Evidence [1].", model: "synthetic-model",
    citations: [{ url: citation.url, title: citation.title, startIndex: 2, endIndex: 8 }] });
});

test("failure, incomplete, partial-only, oversized and provider errors never become drafts", async () => {
  for (const [body, code] of [
    [event("response.failed", { status: "failed", error: { message: "sensitive" } }), "provider-unavailable"],
    [event("response.incomplete", { status: "incomplete" }), "provider-unavailable"],
    ["event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n", "invalid-response"],
    [complete("x".repeat(8_001)), "invalid-response"],
    ["x".repeat(262_145), "invalid-response"],
  ]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : stream(body),
      getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), errorCode(code));
  }
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    new Response("private provider response", { status: 403 }), getAccessToken: async () => ACCESS });
  await adapter.listModels();
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("unauthorized"));
});

test("one active request, cancellation, disposal and five calls per rolling hour", async () => {
  let clock = 10_000;
  let parked;
  let requestCount = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    requestCount += 1;
    if (requestCount === 1) return new Promise((_, reject) => {
      parked = options.signal;
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    return stream(complete());
  }, getAccessToken: async () => ACCESS, now: () => clock });
  await adapter.listModels();
  const first = adapter.createInsight(REQUEST);
  await Promise.resolve(); await Promise.resolve();
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("busy"));
  adapter.cancel();
  await assert.rejects(first, errorCode("cancelled"));
  assert.equal(parked.aborted, true);
  for (let i = 0; i < 4; i++) await adapter.createInsight(REQUEST);
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("rate-limit"));
  clock += 3_600_001;
  await adapter.createInsight(REQUEST);
  adapter.dispose();
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("cancelled"));
});

test("cancel settles even when an injected transport ignores abort", async () => {
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    new Promise(() => {}), getAccessToken: async () => ACCESS });
  await adapter.listModels();
  const pending = adapter.createInsight(REQUEST);
  await Promise.resolve(); await Promise.resolve();
  adapter.cancel();
  await assert.rejects(pending, errorCode("cancelled"));
});
