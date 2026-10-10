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
const REQUEST = { model: "synthetic-model", context: CONTEXT, articleText: "A public article prefix.", allowWebResearch: false };
function models() { return new Response(JSON.stringify({ models: [
  { slug: "synthetic-model", display_name: "Synthetic model", visibility: "list" },
  { slug: "hidden-model", display_name: "Hidden", visibility: "hide" },
] }), { headers: { "content-type": "application/json" } }); }
function event(type, response) { return `event: ${type}\ndata: ${JSON.stringify({ type, response })}\n\n`; }
function streamEvent(type, fields) { return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`; }
function complete(text = "A bounded finding [1].", annotations = [], searched = annotations.length > 0) {
  return event("response.completed", { status: "completed", output: [
    ...(searched ? [{ type: "web_search_call", status: "completed" }] : []),
    { type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text, annotations }] }] });
}
function stream(body) { return new Response(body, { headers: { "content-type": "text/event-stream" } }); }
function headerless(body) { return new Response(new TextEncoder().encode(body), { status: 200 }); }
function errorCode(code) { return (error) => error instanceof ChatGptInsightError && error.code === code &&
  error.message === "ChatGPT insight request unavailable"; }

test("constructor is inert; listed model and exact public Responses envelope", async () => {
  const calls = [];
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    calls.push({ url, options }); return url.endsWith("/models") ? models() : stream(complete(
      "A bounded finding [1].", [{ type: "url_citation", url: CONTEXT.sameTopicSources[0].url,
        title: "Selected page", start_index: 0, end_index: 1 }]));
  }, getAccessToken: async () => ACCESS, now: () => 1_000 });
  assert.equal(calls.length, 0);
  assert.deepEqual(await adapter.listModels(), [{ slug: "synthetic-model", displayName: "Synthetic model" }]);
  const insight = await adapter.createInsight({ ...REQUEST, allowWebResearch: true });
  assert.deepEqual(insight, { body: "A bounded finding [1].", citations: [{
    url: CONTEXT.sameTopicSources[0].url, title: "Selected page", startIndex: 0, endIndex: 1,
  }], model: "synthetic-model" });
  assert.deepEqual(calls.map((item) => item.url), ["https://api.openai.com/v1/models", "https://api.openai.com/v1/responses"]);
  const sent = JSON.parse(calls[1].options.body);
  assert.deepEqual(Object.keys(sent), ["model", "store", "stream", "instructions", "input", "tools", "tool_choice"]);
  assert.equal(sent.store, false); assert.equal(sent.stream, true);
  assert.equal(sent.input.length, 1); assert.equal(sent.input[0].role, "user");
  assert.match(sent.instructions, /one useful opening post about currentSource/u);
  assert.match(sent.instructions, /2-3 natural sentences of about 40-85 words/u);
  assert.match(sent.instructions, /never over 120/u);
  assert.match(sent.instructions, /Do not repeat the headline, open with stock phrasing/u);
  assert.match(sent.instructions, /tack on a broad rhetorical question/u);
  assert.match(sent.instructions, /current page central/u);
  assert.match(sent.instructions, /inspect only the exact URLs in missingRelatedCandidateUrls/u);
  assert.match(sent.instructions, /Use only these selected reference IDs in the written post/u);
  assert.match(sent.instructions, /never imply that its full text was read from a snippet/u);
  assert.deepEqual(JSON.parse(sent.input[0].content).missingRelatedCandidateUrls,
    [CONTEXT.sameTopicSources[0].url, CONTEXT.relatedSources[0].url]);
  assert.deepEqual(JSON.parse(sent.input[0].content).selectedWebReferences, [
    { id: "ref1", url: CONTEXT.sameTopicSources[0].url, title: CONTEXT.sameTopicSources[0].title },
    { id: "ref2", url: CONTEXT.relatedSources[0].url, title: CONTEXT.relatedSources[0].title },
  ]);
  assert.equal(Object.hasOwn(sent, "include"), false);
  assert.deepEqual(sent.tools, [{ type: "web_search", external_web_access: true, search_context_size: "medium",
    filters: { allowed_domains: ["news.example.org", "research.example.net"] } }]);
  assert.equal(sent.tool_choice, "required");
  assert.ok(!JSON.stringify(sent).includes("synthetic-oauth-token"));
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, `Bearer ${ACCESS}`);
    assert.equal(call.options.redirect, "error"); assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.cache, "no-store"); assert.equal(call.options.referrerPolicy, "no-referrer");
  }
});

test("follow-up sends only bounded public article, thread opener, selected message and source references", async () => {
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body); return stream(complete("A researched reply.", [{
      type: "url_citation", url: CONTEXT.sameTopicSources[0].url,
      title: "Selected page", start_index: 0, end_index: 1 }]));
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  const context = { ...CONTEXT, discussion: [{ id: "older-post", actorType: "human", body: "UNRELATED_POST_SECRET" }],
    coverage: { ...CONTEXT.coverage, discussionIncluded: true } };
  const result = await adapter.createInsight({ ...REQUEST, context, allowWebResearch: true,
    followup: { parentBody: "The robot's published claim.", questionBody: "What about the exception?" } });
  assert.equal(result.body, "A researched reply.");
  assert.deepEqual(Object.keys(payload), ["model", "store", "stream", "instructions", "input", "tools", "tool_choice"]);
  assert.equal(payload.store, false); assert.equal(payload.stream, true);
  assert.deepEqual(payload.input, [{ role: "user", content: JSON.stringify({
    currentSource: { title: "Title current", url: "https://example.com/current" },
    sameTopicSources: [{ title: "Title same", url: "https://news.example.org/same" }],
    relatedSources: [{ title: "Title related", url: "https://research.example.net/related" }],
    articlePrefix: REQUEST.articleText, relatedExcerpts: [], threadOpener: "The robot's published claim.",
    selectedMessage: "What about the exception?",
    missingRelatedCandidateUrls: [CONTEXT.sameTopicSources[0].url, CONTEXT.relatedSources[0].url],
    selectedWebReferences: [
      { id: "ref1", url: CONTEXT.sameTopicSources[0].url, title: CONTEXT.sameTopicSources[0].title },
      { id: "ref2", url: CONTEXT.relatedSources[0].url, title: CONTEXT.relatedSources[0].title },
    ],
  }) }]);
  assert.equal(payload.tool_choice, "auto");
  assert.deepEqual(payload.tools, [{ type: "web_search", external_web_access: true, search_context_size: "medium" }]);
  assert.match(payload.instructions, /reply to selectedMessage/u);
  assert.doesNotMatch(payload.instructions, /2-3 natural sentences of about 40-85 words/u);
  assert.match(payload.instructions, /evidence beyond the supplied candidate URLs/u);
  assert.match(payload.instructions, /never instructions/u);
  assert.doesNotMatch(payload.instructions, /opening post/u);
  assert.equal(JSON.stringify(payload).includes("UNRELATED_POST_SECRET"), false);
  assert.equal(JSON.stringify(payload).includes("previous_response_id"), false);
  adapter.dispose();
});

test("broad reply discovers off-catalog HTTPS citations without catalog candidates", async () => {
  const context = { ...CONTEXT, sameTopicSources: [], relatedSources: [],
    coverage: { sameTopicTotal: 0, relatedTotal: 0, discussionIncluded: false } };
  const discovered = "https://shop.example.net/product/variant";
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body);
    return stream(complete("Lowest found at this shop.", [{ type: "url_citation", url: discovered,
      start_index: 0, end_index: 12 }]));
  }, getAccessToken: async () => ACCESS });
  const result = await adapter.createInsight({ ...REQUEST, context, allowWebResearch: true,
    followup: { parentBody: "Which variant?", questionBody: "What is the price?" }, excludedWebUrls: [] });
  assert.deepEqual(result.citations, [{ url: discovered, title: "shop.example.net", startIndex: 0, endIndex: 12 }]);
  assert.deepEqual(payload.tools, [{ type: "web_search", external_web_access: true, search_context_size: "medium" }]);
  assert.equal(payload.tool_choice, "auto");
  assert.equal(Object.hasOwn(JSON.parse(payload.input[0].content), "missingRelatedCandidateUrls"), true);
  assert.equal(JSON.stringify(payload).includes("excludedWebUrls"), false);
  adapter.dispose();
});

test("completed search may cite the exact current page in opener and broad reply", async () => {
  for (const followup of [null, { parentBody: "Published opener", questionBody: "Selected message" }]) {
    const current = CONTEXT.currentSource;
    const annotation = { type: "url_citation", url: current.url,
      start_index: 0, end_index: 7 };
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(complete("Finding.", [annotation])),
    getAccessToken: async () => ACCESS });
    const result = await adapter.createInsight({ ...REQUEST, allowWebResearch: true,
      ...(followup ? { followup } : {}) });
    assert.deepEqual(result.citations, [{ url: current.url, title: current.title,
      startIndex: 0, endIndex: 7 }]);
    adapter.dispose();
  }
});

test("opening current-page citation rejects observed response and search identity contradictions", async () => {
  const message = { type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Finding.", annotations: [{ type: "url_citation",
      url: CONTEXT.currentSource.url, start_index: 0, end_index: 7 }] }] };
  const terminal = { id: "resp_final", status: "completed", output: [
    { id: "search_final", type: "web_search_call", status: "completed" }, message] };
  for (const raw of [
    event("response.created", { id: "resp_other", status: "in_progress" }) +
      event("response.completed", terminal),
    event("response.created", { id: "resp_final", status: "in_progress" }) +
      streamEvent("response.output_item.added", { output_index: 0, item: {
        id: "search_other", type: "web_search_call", status: "in_progress" } }) +
      event("response.completed", terminal),
  ]) {
    const adapter = createChatGptInsights({ fetchImpl: async (endpoint) =>
      endpoint.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true }),
      errorCode("invalid-response"));
    adapter.dispose();
  }
});

test("current-page citation requires exact URL, valid span, enabled tool and completed search", async () => {
  const current = CONTEXT.currentSource.url;
  for (const [url, endIndex, allowWebResearch, searched] of [
    [current, 7, true, false], [current, 7, false, true],
    [`${current}?source=search`, 7, true, true], [`${current}/`, 7, true, true],
    ["http://example.com/current", 7, true, true], [current, 99, true, true],
  ]) {
    const annotation = { type: "url_citation", url, start_index: 0, end_index: endIndex };
    const adapter = createChatGptInsights({ fetchImpl: async (endpoint) =>
      endpoint.endsWith("/models") ? models() : stream(complete("Finding.", [annotation], searched)),
    getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch }), errorCode("invalid-response"));
    adapter.dispose();
  }
  const annotation = { type: "url_citation", url: current, start_index: 0, end_index: 7 };
  const adapter = createChatGptInsights({ fetchImpl: async (endpoint) =>
    endpoint.endsWith("/models") ? models() : stream(complete("Finding.", [annotation], false)),
  getAccessToken: async () => ACCESS });
  await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true,
    followup: { parentBody: "Published opener", questionBody: "Selected message" } }),
  errorCode("invalid-response"));
  adapter.dispose();
});

test("current page and discovered URLs count together toward five unique destinations", async () => {
  const links = [CONTEXT.currentSource.url,
    ...Array.from({ length: 5 }, (_, index) => `https://shop${index}.example.net/offer`)];
  for (const count of [5, 6]) {
    const annotations = links.slice(0, count).map((url, index) => ({ type: "url_citation",
      url, start_index: index, end_index: index + 1 }));
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(complete("A".repeat(count), annotations)),
    getAccessToken: async () => ACCESS });
    const request = { ...REQUEST, allowWebResearch: true,
      followup: { parentBody: "Published opener", questionBody: "Selected message" } };
    if (count === 5) assert.equal((await adapter.createInsight(request)).citations.length, 5);
    else await assert.rejects(adapter.createInsight(request), errorCode("invalid-response"));
    adapter.dispose();
  }
});

test("broad reply accepts context-only output without search but rejects selected ref without search", async () => {
  for (const body of ["A reply from the supplied context.", "A cited reply [ref1]."]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(complete(body, [], false)),
    getAccessToken: async () => ACCESS });
    const request = { ...REQUEST, allowWebResearch: true,
      followup: { parentBody: "Published opener", questionBody: "Selected message" } };
    if (body.includes("[ref1]")) await assert.rejects(adapter.createInsight(request),
      (error) => error.detail === "response-web-evidence");
    else assert.equal((await adapter.createInsight(request)).body, body);
    adapter.dispose();
  }
});

test("broad reply limits unique destinations, rejects excluded and malformed links", async () => {
  const base = { ...REQUEST, allowWebResearch: true,
    followup: { parentBody: "Published opener", questionBody: "Selected message" } };
  const urls = Array.from({ length: 6 }, (_, index) => `https://shop${index}.example.net/offer`);
  for (const [citations, request, accepted] of [
    [urls.slice(0, 5), base, true], [urls, base, false],
    [[urls[0], urls[0], urls[0]], base, true],
    [[urls[0]], { ...base, excludedWebUrls: [urls[0]] }, false],
    [["http://shop.example.net/offer"], base, false],
  ]) {
    const body = "A".repeat(citations.length);
    const annotations = citations.map((url, index) => ({ type: "url_citation", url,
      start_index: index, end_index: index + 1 }));
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(complete(body, annotations)),
    getAccessToken: async () => ACCESS });
    if (accepted) assert.equal((await adapter.createInsight(request)).citations.length, citations.length);
    else await assert.rejects(adapter.createInsight(request), errorCode("invalid-response"));
    adapter.dispose();
  }
});

test("broad reply rejects uncited raw URLs and invalid provider spans", async () => {
  const request = { ...REQUEST, allowWebResearch: true,
    followup: { parentBody: "Published opener", questionBody: "Selected message" } };
  for (const [body, annotations, detail] of [
    ["See https://shop.example.net/offer", [], "response-unsafe-url"],
    ["Offer.", [{ type: "url_citation", url: "https://shop.example.net/offer",
      start_index: 0, end_index: 99 }], "response-web-citation"],
  ]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(complete(body, annotations)),
    getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight(request), (error) => error.detail === detail);
    adapter.dispose();
  }
});

test("broad reply accepts an off-catalog citation through the strict finalized-item fallback", async () => {
  const discovered = "https://shop.example.net/offer";
  const item = { id: "msg_reply", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Offer.", annotations: [{ type: "url_citation",
      url: discovered, start_index: 0, end_index: 6 }] }] };
  const raw = event("response.created", { id: "resp_reply", status: "in_progress" }) +
    streamEvent("response.output_item.added", { output_index: 0, item: {
      id: "search_reply", type: "web_search_call", status: "in_progress" } }) +
    streamEvent("response.output_item.done", { output_index: 0, item: {
      id: "search_reply", type: "web_search_call", status: "completed" } }) +
    streamEvent("response.output_item.added", { output_index: 1, item: {
      id: item.id, type: "message", role: "assistant", status: "in_progress", content: [] } }) +
    streamEvent("response.output_item.done", { output_index: 1, item }) +
    event("response.completed", { id: "resp_reply", status: "completed", output: [] });
  const adapter = createChatGptInsights({ fetchImpl: async (url) =>
    url.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
  const result = await adapter.createInsight({ ...REQUEST, allowWebResearch: true,
    followup: { parentBody: "Published opener", questionBody: "Selected message" } });
  assert.deepEqual(result.citations, [{ url: discovered, title: "shop.example.net",
    startIndex: 0, endIndex: 6 }]);
  adapter.dispose();
});

test("strict finalized-item fallback accepts an exact current-page citation after completed search", async () => {
  const current = CONTEXT.currentSource;
  const item = { id: "msg_current", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Finding.", annotations: [{ type: "url_citation",
      url: current.url, start_index: 0, end_index: 7 }] }] };
  const raw = event("response.created", { id: "resp_current", status: "in_progress" }) +
    streamEvent("response.output_item.added", { output_index: 0, item: {
      id: "search_current", type: "web_search_call", status: "in_progress" } }) +
    streamEvent("response.output_item.done", { output_index: 0, item: {
      id: "search_current", type: "web_search_call", status: "completed" } }) +
    streamEvent("response.output_item.added", { output_index: 1, item: {
      id: item.id, type: "message", role: "assistant", status: "in_progress", content: [] } }) +
    streamEvent("response.output_item.done", { output_index: 1, item }) +
    event("response.completed", { id: "resp_current", status: "completed", output: [] });
  const adapter = createChatGptInsights({ fetchImpl: async (url) =>
    url.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
  assert.deepEqual((await adapter.createInsight({ ...REQUEST, allowWebResearch: true,
    followup: { parentBody: "Published opener", questionBody: "Selected message" } })).citations,
  [{ url: current.url, title: current.title, startIndex: 0, endIndex: 7 }]);
  adapter.dispose();
});

test("normal broad result rejects a stream search absent or contradicted in terminal output", async () => {
  const discovered = "https://shop.example.net/offer";
  const message = { id: "msg_reply", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Offer.", annotations: [{ type: "url_citation",
      url: discovered, start_index: 0, end_index: 6 }] }] };
  const prefix = event("response.created", { id: "resp_reply", status: "in_progress" }) +
    streamEvent("response.output_item.added", { output_index: 0, item: {
      id: "search_reply", type: "web_search_call", status: "in_progress" } }) +
    streamEvent("response.output_item.done", { output_index: 0, item: {
      id: "search_reply", type: "web_search_call", status: "completed" } });
  for (const output of [[message], [{ id: "other_search", type: "web_search_call",
    status: "completed" }, message], [{ type: "web_search_call", status: "completed" }, message],
  [{ id: "search_reply", type: "web_search_call",
    status: "in_progress" }, message]]) {
    const raw = prefix + event("response.completed", { id: "resp_reply", status: "completed", output });
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true,
      followup: { parentBody: "Published opener", questionBody: "Selected message" } }),
    errorCode("invalid-response"));
    adapter.dispose();
  }
});

test("broad citations reject created-response and added-only search identity mismatches", async () => {
  const message = { type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Offer.", annotations: [{ type: "url_citation",
      url: "https://shop.example.net/offer", start_index: 0, end_index: 6 }] }] };
  const terminal = { id: "resp_final", status: "completed", output: [
    { id: "search_final", type: "web_search_call", status: "completed" }, message] };
  for (const raw of [
    event("response.created", { id: "resp_other", status: "in_progress" }) +
      event("response.completed", terminal),
    event("response.created", { id: "resp_final", status: "in_progress" }) +
      streamEvent("response.output_item.added", { output_index: 0, item: {
        id: "search_other", type: "web_search_call", status: "in_progress" } }) +
      event("response.completed", terminal),
  ]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true,
      followup: { parentBody: "Published opener", questionBody: "Selected message" } }),
    errorCode("invalid-response"));
    adapter.dispose();
  }
  const contextOnly = { ...terminal, output: [terminal.output[0], {
    ...message, content: [{ type: "output_text", text: "Offer.", annotations: [] }] }] };
  const raw = event("response.created", { id: "resp_other", status: "in_progress" }) +
    event("response.completed", contextOnly);
  const adapter = createChatGptInsights({ fetchImpl: async (url) =>
    url.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
  await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true,
    followup: { parentBody: "Published opener", questionBody: "Selected message" } }),
  errorCode("invalid-response"));
  adapter.dispose();
});

test("broad cited result rejects failed search and terminal error signals", async () => {
  const message = { type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Offer.", annotations: [{ type: "url_citation",
      url: "https://shop.example.net/offer", start_index: 0, end_index: 6 }] }] };
  const search = { type: "web_search_call", status: "completed" };
  for (const raw of [
    event("response.created", { id: "resp_reply", status: "in_progress" }) +
      streamEvent("response.output_item.done", { output_index: 0,
        item: { id: "search_reply", type: "web_search_call", status: "failed" } }) +
      event("response.completed", { id: "resp_reply", status: "completed", output: [search, message] }),
    event("response.completed", { status: "completed", error: { code: "failure" }, output: [search, message] }),
    event("response.completed", { status: "completed", incomplete_details: { reason: "limit" },
      output: [search, message] }),
  ]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true,
      followup: { parentBody: "Published opener", questionBody: "Selected message" } }),
    errorCode("invalid-response"));
    adapter.dispose();
  }
});

test("tool-free follow-up preserves legacy false flag and does not imply linked pages were checked", async () => {
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body); return stream(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  await adapter.createInsight({ ...REQUEST, allowWebResearch: false,
    followup: { parentBody: "A published robot answer.", questionBody: "Why?" } });
  assert.deepEqual(payload.tools, []);
  const sent = JSON.parse(payload.input[0].content);
  assert.deepEqual(sent.sameTopicSources, []);
  assert.deepEqual(sent.relatedSources, []);
  assert.equal(JSON.stringify(sent).includes(CONTEXT.sameTopicSources[0].url), false);
  assert.equal(JSON.stringify(sent).includes(CONTEXT.relatedSources[0].url), false);
  assert.equal(Object.hasOwn(payload, "tool_choice"), false);
  assert.match(payload.instructions, /Do not use external research/u);
  assert.match(payload.instructions, /do not imply that linked pages were checked/u);
  assert.doesNotMatch(payload.instructions, /Research relevant claims on the allowed domains/u);
  adapter.dispose();
});

test("disabled related research sends no candidate URLs in an opening post", async () => {
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body); return stream(complete("Current page insight."));
  }, getAccessToken: async () => ACCESS });
  await adapter.createInsight(REQUEST);
  const input = JSON.parse(payload.input[0].content);
  assert.deepEqual(input.context.sameTopicSources, []);
  assert.deepEqual(input.context.relatedSources, []);
  assert.equal(JSON.stringify(payload).includes(CONTEXT.sameTopicSources[0].url), false);
  assert.equal(JSON.stringify(payload).includes(CONTEXT.relatedSources[0].url), false);
  assert.deepEqual(payload.tools, []);
  adapter.dispose();
});

test("legacy adapter excerpt fixtures do not change the provider-only instructions", async () => {
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body); return stream(complete("A qualified comparison."));
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  const relatedExcerpts = [{ sourceId: "same", url: CONTEXT.sameTopicSources[0].url,
    text: "A second public article reports a different estimate." },
  { sourceId: "related", url: CONTEXT.relatedSources[0].url,
    text: "The related page discusses a possible consequence." }];
  await adapter.createInsight({ ...REQUEST, relatedExcerpts, allowWebResearch: true });
  const input = JSON.parse(payload.input[0].content);
  assert.deepEqual(input.relatedExcerpts, relatedExcerpts);
  assert.equal(input.articlePrefix, REQUEST.articleText);
  assert.deepEqual(payload.tools, []);
  assert.equal(Object.hasOwn(payload, "tool_choice"), false);
  assert.doesNotMatch(payload.instructions, /Use web research selectively|web tool|web-search queries|Search with/u);
  assert.doesNotMatch(payload.instructions, /relatedExcerpts are short, unverified extracts/u);
  assert.match(payload.instructions, /current page central/u);
  assert.match(payload.instructions, /Use only the supplied articlePrefix for page facts/u);
  assert.match(payload.instructions, /make that comparison the post's main point/u);
  assert.match(payload.instructions, /Attribute the detail naturally/u);
  assert.match(payload.instructions, /not a definitive omission from the full article/u);
  assert.match(payload.instructions, /a different emphasis or viewpoint is not a factual contradiction/u);
  assert.match(payload.instructions, /If no selected page supplies a useful supported difference/u);
  adapter.dispose();
});

test("web search selects five eligible URLs after excluding supplied and duplicate URLs", async () => {
  const payloads = [];
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payloads.push(JSON.parse(options.body)); return stream(complete("A researched point.", [{
      type: "url_citation", url: "https://news.example.org/one", title: "Selected page",
      start_index: 0, end_index: 1 }]));
  }, getAccessToken: async () => ACCESS });
  const context = { ...CONTEXT,
    sameTopicSources: [source("supplied", "https://news.example.org/supplied"),
      source("duplicate-current", CONTEXT.currentSource.url),
      source("one", "https://news.example.org/one"),
      source("two", "https://news.example.org/two"),
      source("three", "https://research.example.net/three")],
    relatedSources: [source("four", "https://four.example.edu/four"),
      source("fifth", "https://fifth.example.edu/fifth")],
    coverage: { ...CONTEXT.coverage, sameTopicTotal: 5, relatedTotal: 2 } };
  await adapter.createInsight({ ...REQUEST, context, allowWebResearch: true, relatedExcerpts: [
    { sourceId: "supplied", url: context.sameTopicSources[0].url, text: "Supplied excerpt." }] });
  assert.deepEqual(JSON.parse(payloads[0].input[0].content).missingRelatedCandidateUrls,
    ["https://news.example.org/one", "https://news.example.org/two", "https://research.example.net/three",
      "https://four.example.edu/four", "https://fifth.example.edu/fifth"]);
  assert.deepEqual(payloads[0].tools[0].filters.allowed_domains,
    ["news.example.org", "research.example.net", "four.example.edu", "fifth.example.edu"]);
  assert.equal(payloads[0].tool_choice, "required");
  const firstFour = { ...context, sameTopicSources: context.sameTopicSources.slice(2),
    relatedSources: context.relatedSources, coverage: { ...context.coverage, sameTopicTotal: 3 } };
  await adapter.createInsight({ ...REQUEST, context: firstFour, allowWebResearch: true });
  assert.deepEqual(JSON.parse(payloads[1].input[0].content).missingRelatedCandidateUrls,
    ["https://news.example.org/one", "https://news.example.org/two",
      "https://research.example.net/three", "https://four.example.edu/four", "https://fifth.example.edu/fifth"]);
  assert.deepEqual(payloads[1].tools[0].filters.allowed_domains,
    ["news.example.org", "research.example.net", "four.example.edu", "fifth.example.edu"]);
});

test("one cited candidate suffices when four of five searched pages are unavailable", async () => {
  const selected = Array.from({ length: 5 }, (_, index) => source(`candidate-${index + 1}`,
    `https://public-${index + 1}.example.org/story`));
  const context = { ...CONTEXT, sameTopicSources: selected, relatedSources: [],
    coverage: { ...CONTEXT.coverage, sameTopicTotal: 5, relatedTotal: 0 } };
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body);
    return stream(complete("One sourced finding.", [{ type: "url_citation", url: selected[3].url,
      title: "Accessible article", start_index: 0, end_index: 3 }]));
  }, getAccessToken: async () => ACCESS });
  const result = await adapter.createInsight({ ...REQUEST, context, allowWebResearch: true });
  assert.deepEqual(JSON.parse(payload.input[0].content).missingRelatedCandidateUrls,
    selected.map((entry) => entry.url));
  assert.deepEqual(JSON.parse(payload.input[0].content).selectedWebReferences,
    selected.map((entry, index) => ({ id: `ref${index + 1}`, url: entry.url, title: entry.title })));
  assert.deepEqual(result.citations, [{ url: selected[3].url, title: "Accessible article",
    startIndex: 0, endIndex: 3 }]);
  assert.equal(result.body, "One sourced finding.");
  adapter.dispose();
});

test("completed search with no accessible candidate yields a private current-page draft", async () => {
  const selected = Array.from({ length: 5 }, (_, index) => source(`unavailable-${index + 1}`,
    `https://unavailable-${index + 1}.example.org/story`));
  const context = { ...CONTEXT, sameTopicSources: selected, relatedSources: [],
    coverage: { ...CONTEXT.coverage, sameTopicTotal: 5, relatedTotal: 0 } };
  let responseCalls = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) return models();
    responseCalls += 1;
    return stream(complete("A grounded point from the current article.", [], true));
  }, getAccessToken: async () => ACCESS });
  assert.deepEqual(await adapter.createInsight({ ...REQUEST, context, allowWebResearch: true }), {
    body: "A grounded point from the current article.", citations: [], model: "synthetic-model",
  });
  assert.equal(responseCalls, 1);
  adapter.dispose();
});

test("true flag with every selected page supplied keeps the offline request envelope", async () => {
  let payload;
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return models();
    payload = JSON.parse(options.body); return stream(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.createInsight({ ...REQUEST, allowWebResearch: true, relatedExcerpts: [
    { sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "First supplied excerpt." },
    { sourceId: "related", url: CONTEXT.relatedSources[0].url, text: "Second supplied excerpt." }] });
  assert.deepEqual(payload.tools, []);
  assert.equal(Object.hasOwn(payload, "tool_choice"), false);
  assert.equal(Object.hasOwn(JSON.parse(payload.input[0].content), "missingRelatedCandidateUrls"), false);
  assert.match(payload.instructions, /Do not use external research/u);
});

test("only exact markers for validated excerpts become citations beside web annotations", async () => {
  const relatedExcerpts = [
    { sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "The same event had a second estimate." },
    { sourceId: "related", url: CONTEXT.relatedSources[0].url, text: "A different event." },
  ];
  const body = "Current point. The second estimate differs[[ref:1]]. It used another method[[ref:1]]. A second source adds context[[ref:2]].";
  const webUrl = "https://research.example.net/check";
  const context = { ...CONTEXT, relatedSources: [...CONTEXT.relatedSources, source("web", webUrl)],
    coverage: { ...CONTEXT.coverage, relatedTotal: 2 } };
  const web = { type: "url_citation", url: webUrl, title: "Web check",
    start_index: 0, end_index: 7 };
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(complete(body, [web])), getAccessToken: async () => ACCESS });
  await adapter.listModels();
  const marker = body.indexOf("[[ref:1]]");
  const secondMarker = body.indexOf("[[ref:1]]", marker + 1);
  const otherMarker = body.indexOf("[[ref:2]]");
  assert.deepEqual(await adapter.createInsight({ ...REQUEST, context, relatedExcerpts, allowWebResearch: true }), {
    body, model: "synthetic-model", citations: [
      { url: web.url, title: web.title, startIndex: 0, endIndex: 7 },
      { url: relatedExcerpts[0].url, title: CONTEXT.sameTopicSources[0].title,
        startIndex: marker, endIndex: marker + "[[ref:1]]".length },
      { url: relatedExcerpts[0].url, title: CONTEXT.sameTopicSources[0].title,
        startIndex: secondMarker, endIndex: secondMarker + "[[ref:1]]".length },
      { url: relatedExcerpts[1].url, title: CONTEXT.relatedSources[0].title,
        startIndex: otherMarker, endIndex: otherMarker + "[[ref:2]]".length },
    ],
  });
  adapter.dispose();
});

test("provider citations reject every URL outside the exact request-scoped web candidates", async () => {
  const supplied = { sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "Supplied excerpt." };
  for (const [label, url, request] of [
    ["same host, different path", "https://research.example.net/other", { ...REQUEST, allowWebResearch: true, relatedExcerpts: [supplied] }],
    ["other host", "https://else.example.net/related", { ...REQUEST, allowWebResearch: true, relatedExcerpts: [supplied] }],
    ["supplied excerpt", supplied.url, { ...REQUEST, allowWebResearch: true, relatedExcerpts: [supplied] }],
    ["tool disabled", CONTEXT.relatedSources[0].url, { ...REQUEST }],
    ["invalid scheme", "javascript:alert(1)", { ...REQUEST, allowWebResearch: true, relatedExcerpts: [supplied] }],
  ]) {
    const citation = { type: "url_citation", url, title: "Provider citation", start_index: 0, end_index: 7 };
    const adapter = createChatGptInsights({ fetchImpl: async (endpoint) => endpoint.endsWith("/models") ? models() :
      stream(complete("Finding[[ref:1]]", [citation])), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight(request), (error) => {
      assert.equal(error.code, "invalid-response", label);
      assert.equal(error.detail, "response-web-citation", label);
      assert.equal(JSON.stringify(error).includes(url), false, label);
      return true;
    });
  }
});

test("exact provider citation uses the selected title when display metadata is unusable", async () => {
  const selected = CONTEXT.sameTopicSources[0];
  for (const title of [undefined, "", "x".repeat(513), "unsafe\nmetadata"]) {
    const annotation = { type: "url_citation", url: selected.url,
      start_index: 0, end_index: 7, ...(title === undefined ? {} : { title }) };
    const adapter = createChatGptInsights({ fetchImpl: async (endpoint) =>
      endpoint.endsWith("/models") ? models() : stream(complete("Finding.", [annotation])),
    getAccessToken: async () => ACCESS });
    const result = await adapter.createInsight({ ...REQUEST, allowWebResearch: true });
    assert.deepEqual(result.citations, [{ url: selected.url, title: selected.title,
      startIndex: 0, endIndex: 7 }]);
    adapter.dispose();
  }
});

test("web citation rejection trace contains only a fixed reason", async () => {
  const secret = "SECRET_CITATION_MATERIAL";
  const selectedUrl = CONTEXT.sameTopicSources[0].url;
  for (const [url, start_index, end_index, expected, searched] of [
    ["https://research.example.net/other", 0, 7, "unselected-url"],
    [CONTEXT.currentSource.url, 0, 7, "current-source-url", false],
    [`javascript:${secret}`, 0, 7, "invalid-url"],
    [selectedUrl, 0, 99, "invalid-span"],
  ]) {
    const traces = [];
    const annotation = { type: "url_citation", url, title: secret, start_index, end_index };
    const adapter = createChatGptInsights({ fetchImpl: async (endpoint) =>
      endpoint.endsWith("/models") ? models() : stream(complete("Finding.", [annotation], searched)),
    getAccessToken: async () => ACCESS, onTrace: (trace) => traces.push(trace) });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true }),
      (error) => error.detail === "response-web-citation");
    assert.equal(traces.length, 1);
    assert.equal(traces[0].schema, "insight-response-trace/v2");
    assert.equal(traces[0].citationFailure, expected);
    assert.equal(JSON.stringify(traces).includes(secret), false);
    assert.equal(JSON.stringify(traces).includes(url), false);
    adapter.dispose();
  }
});

test("required web search without a completed tool call cannot create a private draft", async () => {
  const supplied = { sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "Supplied excerpt." };
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(complete("A supplied detail[[ref:1]] but no verified web evidence.")), getAccessToken: async () => ACCESS });
  await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true,
    relatedExcerpts: [supplied] }), (error) => error.code === "invalid-response" &&
      error.detail === "response-web-evidence");
});

test("completed-stream fallback applies the same exact web citation allowlist", async () => {
  const body = "Verified finding.";
  for (const [url, accepted] of [[CONTEXT.sameTopicSources[0].url, true],
    ["https://news.example.org/other", false]]) {
    const item = { id: "msg_allowed", type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: body, annotations: [{ type: "url_citation", url,
        title: "Provider citation", start_index: 0, end_index: 8 }] }] };
    const raw = streamEvent("response.created", { response: { id: "resp_allowed", status: "in_progress" } }) +
      streamEvent("response.output_item.added", { output_index: 0, item: {
        id: "call_allowed", type: "web_search_call", status: "in_progress" } }) +
      streamEvent("response.output_item.done", { output_index: 0, item: {
        id: "call_allowed", type: "web_search_call", status: "completed" } }) +
      streamEvent("response.output_item.added", { output_index: 1, item: {
        id: item.id, type: "message", role: "assistant", status: "in_progress", content: [] } }) +
      streamEvent("response.output_item.done", { output_index: 1, item }) +
      streamEvent("response.completed", { response: { id: "resp_allowed", status: "completed", output: [] } });
    const adapter = createChatGptInsights({ fetchImpl: async (endpoint) =>
      endpoint.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
    if (accepted) {
      const result = await adapter.createInsight({ ...REQUEST, allowWebResearch: true });
      assert.equal(result.citations[0].url, url);
    } else {
      await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true }),
        (error) => error.code === "invalid-response" && error.detail === "response-web-citation");
    }
  }
});

test("provider Markdown links and raw URLs cannot enter a private draft", async () => {
  const citation = { type: "url_citation", url: CONTEXT.sameTopicSources[0].url,
    title: "Selected page", start_index: 0, end_index: 7 };
  for (const body of ["Finding [source](https://attacker.example/page)",
    "Finding https://attacker.example/page", "Finding [source](javascript:alert)"]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
      stream(complete(body, [citation])), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true }), (error) =>
      error.code === "invalid-response" && error.detail === "response-unsafe-url");
  }
});

test("real-style annotated Markdown link is allowed only inside its exact provider citation span", async () => {
  const pageUrl = "https://peps.python.org/pep-0257/";
  const context = { ...CONTEXT, sameTopicSources: [source("pep", pageUrl)] };
  const cited = "Claim ([peps.python.org](https://peps.python.org/pep-0257/)).";
  const citation = { type: "url_citation", url: pageUrl, title: "PEP 257",
    start_index: cited.indexOf("("), end_index: cited.lastIndexOf(")") + 1 };
  for (const [body, accepted] of [[cited, true], [
    `${cited} Other: https://attacker.example/claim`, false]]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
      stream(complete(body, [citation])), getAccessToken: async () => ACCESS });
    if (accepted) {
      const result = await adapter.createInsight({ ...REQUEST, context, allowWebResearch: true });
      assert.equal(result.citations[0].url, pageUrl);
      assert.equal(result.body, cited);
    } else {
      await assert.rejects(adapter.createInsight({ ...REQUEST, context, allowWebResearch: true }),
        (error) => error.code === "invalid-response" && error.detail === "response-unsafe-url");
    }
  }
});

test("exact provider URL annotation without a completed web search call is insufficient", async () => {
  const annotation = { type: "url_citation", url: CONTEXT.sameTopicSources[0].url,
    title: "Selected page", start_index: 0, end_index: 7 };
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(complete("Finding.", [annotation], false)), getAccessToken: async () => ACCESS });
  await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true }),
    (error) => error.code === "invalid-response" && error.detail === "response-web-evidence");
});

test("[refN] maps to the selected exact URL after a completed search", async () => {
  const body = "One researched detail[ref2].";
  const selected = CONTEXT.relatedSources[0];
  const response = event("response.completed", { status: "completed", output: [
    { type: "web_search_call", status: "completed", action: { type: "search", sources: [
      { type: "url", url: selected.url }, { type: "url", url: "https://research.example.net/other" },
    ] } },
    { type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: body, annotations: [] }] },
  ] });
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(response), getAccessToken: async () => ACCESS });
  assert.deepEqual(await adapter.createInsight({ ...REQUEST, allowWebResearch: true }), {
    body, model: REQUEST.model, citations: [{ startIndex: body.indexOf("[ref2]"),
      endIndex: body.indexOf("[ref2]") + "[ref2]".length,
      url: selected.url, title: selected.title }],
  });
});

test("model-only [refN] links remain bounded to selected IDs despite empty or foreign search sources", async () => {
  const selected = CONTEXT.sameTopicSources[0].url;
  for (const sources of [[], [{ url: "https://news.example.org/other" }]]) {
    const body = "Model hint[ref1]";
    const raw = event("response.completed", { status: "completed", output: [
      { type: "web_search_call", status: "completed", action: { type: "search", sources } },
      { type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: body, annotations: [] }] },
    ] });
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
      stream(raw), getAccessToken: async () => ACCESS });
    assert.deepEqual(await adapter.createInsight({ ...REQUEST, allowWebResearch: true }), {
      body, model: REQUEST.model, citations: [{ startIndex: body.indexOf("[ref1]"),
        endIndex: body.indexOf("[ref1]") + "[ref1]".length,
        url: selected, title: CONTEXT.sameTopicSources[0].title }],
    });
  }
});

test("legacy [[webref:n]] and preferred [refN] keep distinct selected links", async () => {
  const body = "Older[[webref:1]] and newer[ref2].";
  const raw = event("response.completed", { status: "completed", output: [
    { type: "web_search_call", status: "completed" },
    { type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: body, annotations: [] }] },
  ] });
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(raw), getAccessToken: async () => ACCESS });
  const result = await adapter.createInsight({ ...REQUEST, allowWebResearch: true });
  assert.deepEqual(result.citations, [
    { startIndex: body.indexOf("[[webref:1]]"), endIndex: body.indexOf("[[webref:1]]") + 12,
      url: CONTEXT.sameTopicSources[0].url, title: CONTEXT.sameTopicSources[0].title },
    { startIndex: body.indexOf("[ref2]"), endIndex: body.indexOf("[ref2]") + 6,
      url: CONTEXT.relatedSources[0].url, title: CONTEXT.relatedSources[0].title },
  ]);
});

test("selected references reject unknown and malformed IDs and foreign provider citations", async () => {
  const selected = CONTEXT.sameTopicSources[0].url;
  for (const [body, sources, annotations, detail] of [
    ["Unknown[[webref:3]]", [{ url: selected }], [], "response-web-citation"],
    ["Malformed[[webref:01]]", [{ url: selected }], [], "response-web-citation"],
    ["Zero[[webref:0]]", [], [], "response-web-citation"],
    ["Broken[[webref:1]", [], [], "response-web-citation"],
    ["Foreign case[[WEBREF:1]]", [], [], "response-web-citation"],
    ["Unknown[ref3]", [], [], "response-web-citation"],
    ["Malformed[ref01]", [], [], "response-web-citation"],
    ["Zero[ref0]", [], [], "response-web-citation"],
    ["Broken[ref1", [], [], "response-web-citation"],
    ["Foreign case[REF1]", [], [], "response-web-citation"],
    ["Old excerpt shape[ref:1]", [], [], "response-web-citation"],
    ["Double bracket[[ref1]]", [], [], "response-web-citation"],
    ["Foreign annotation[[webref:1]]", [{ url: selected }], [{ type: "url_citation",
      url: "https://news.example.org/other", start_index: 0, end_index: 7 }], "response-web-citation"],
    ["Foreign annotation[ref1]", [], [{ type: "url_citation",
      url: "https://news.example.org/other", start_index: 0, end_index: 7 }], "response-web-citation"],
  ]) {
    const raw = event("response.completed", { status: "completed", output: [
      { type: "web_search_call", status: "completed", action: { type: "search", sources } },
      { type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: body, annotations }] },
    ] });
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
      stream(raw), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true }),
      (error) => error.code === "invalid-response" && error.detail === detail);
  }
});

test("model-only selected references still require a completed search", async () => {
  for (const marker of ["[ref1]", "[[webref:1]]"]) for (const searched of [false, true]) {
    const raw = event("response.completed", { status: "completed", output: [
      ...(searched ? [{ type: "web_search_call", status: "in_progress" }] : []),
      { type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: `Claim${marker}`, annotations: [] }] },
    ] });
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
      stream(raw), getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight({ ...REQUEST, allowWebResearch: true }),
      (error) => error.code === "invalid-response" && error.detail === "response-web-evidence");
  }
});

test("unknown and malformed excerpt markers reject completed output without source leakage", async () => {
  const relatedExcerpts = [{ sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "Same event." }];
  for (const body of ["Unknown[[ref:2]]",
    "Zero[[ref:0]]", "Leading zero[[ref:01]]", "Forged[[REF:1]]", "Broken[[ref:1]",
    "Raw URL[[ref:https://attacker.example]]", "Too many" + "[[ref:1]]".repeat(9)]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
      stream(complete(body)), getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight({ ...REQUEST, relatedExcerpts }), (error) => {
      assert.equal(errorCode("invalid-response")(error), true);
      assert.equal(error.detail, "response-excerpt-citation");
      assert.equal(JSON.stringify(error).includes(body), false);
      return true;
    });
    adapter.dispose();
  }
});

test("web and excerpt citations share the paired client's 50-annotation limit", async () => {
  const relatedExcerpts = [{ sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "Same event." }];
  const body = `${"x".repeat(50)}[[ref:1]]`;
  const context = { ...CONTEXT, relatedSources: [source("web", "https://research.example.net/check")],
    coverage: { ...CONTEXT.coverage, relatedTotal: 1 } };
  const web = Array.from({ length: 51 }, (_, index) => ({ type: "url_citation",
    url: "https://research.example.net/check", title: `Web check ${index}`,
    start_index: index, end_index: index + 1 }));
  for (const count of [49, 50, 51]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
      stream(complete(body, web.slice(0, count))), getAccessToken: async () => ACCESS });
    await adapter.listModels();
    if (count === 49) {
      const result = await adapter.createInsight({ ...REQUEST, context, relatedExcerpts, allowWebResearch: true });
      assert.equal(result.citations.length, 50);
    } else {
      await assert.rejects(adapter.createInsight({ ...REQUEST, context, relatedExcerpts, allowWebResearch: true }), (error) =>
        errorCode("invalid-response")(error) && error.detail === "response-output-too-large");
    }
    adapter.dispose();
  }
});

test("forged, duplicated and oversized related excerpts cannot reach the provider", async () => {
  let posts = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) return models();
    posts += 1; return stream(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  const valid = { sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "Public excerpt." };
  for (const relatedExcerpts of [null, {}, [valid, valid],
    [{ ...valid, sourceId: "current", url: CONTEXT.currentSource.url }],
    [{ ...valid, sourceId: "forged" }], [{ ...valid, url: CONTEXT.relatedSources[0].url }],
    [{ ...valid, text: "x".repeat(2_049) }], [{ ...valid, text: "bad\u202e text" }],
    [{ ...valid, extra: "private" }], Array(5).fill(valid),
    [Object.defineProperty({ sourceId: valid.sourceId, url: valid.url }, "text", {
      enumerable: true, get() { throw new Error("getter should not execute"); },
    })]]) {
    await assert.rejects(adapter.createInsight({ ...REQUEST, relatedExcerpts }), errorCode("invalid-input"));
  }
  assert.equal(posts, 0);
  adapter.dispose();
});

test("invalid follow-up shapes and unsafe or oversized text cannot dispatch", async () => {
  let posts = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) return models();
    posts += 1; return stream(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  const valid = { parentBody: "A published robot answer.", questionBody: "A published human question?" };
  for (const followup of [null, {}, { ...valid, extra: "private" },
    { ...valid, parentBody: " " }, { ...valid, questionBody: " " },
    { ...valid, parentBody: "x".repeat(2_001) }, { ...valid, questionBody: "x".repeat(2_001) },
    { ...valid, parentBody: "bad\u202e text" }, { ...valid, questionBody: "bad\u0000 text" },
    Object.defineProperty({ parentBody: valid.parentBody }, "questionBody", { enumerable: true,
      get() { throw new Error("getter should not execute"); } })]) {
    await assert.rejects(adapter.createInsight({ ...REQUEST, followup }), errorCode("invalid-input"));
  }
  assert.equal(posts, 0);
  adapter.dispose();
});

test("explicit raw-debug callback receives only the sent insight envelope and bounded response body", async () => {
  const captured = [];
  const raw = complete("Synthetic answer.");
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : stream(raw),
    getAccessToken: async () => ACCESS, onDebug: (entry) => {
      captured.push(entry);
      throw new Error("synthetic debug sink failure");
    } });
  await adapter.listModels();
  assert.equal(captured.length, 0);
  assert.equal((await adapter.createInsight(REQUEST)).body, "Synthetic answer.");
  assert.deepEqual(captured.map((entry) => entry.phase), ["request", "response"]);
  assert.equal(JSON.parse(captured[0].payload.input[0].content).articlePrefix, REQUEST.articleText);
  assert.equal(captured[1].body, raw);
  assert.equal(captured[1].status, 200);
  assert.equal(captured[1].contentType, "text/event-stream");
  assert.equal(JSON.stringify(captured).includes(ACCESS), false);
  adapter.dispose();
});

test("model catalog uses a 25-second deadline while research keeps 90 seconds", async () => {
  const delays = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    delays.push(delay);
    return originalSetTimeout(callback, delay, ...args);
  };
  try {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : stream(complete()),
      getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await adapter.createInsight(REQUEST);
    assert.deepEqual(delays.filter((delay) => delay === 25_000 || delay === 90_000), [25_000, 90_000]);
    adapter.dispose();
  } finally { globalThis.setTimeout = originalSetTimeout; }
});

test("model catalog deadline aborts one request without retry", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  let requests = 0;
  globalThis.setTimeout = (callback, delay, ...args) =>
    originalSetTimeout(callback, delay === 25_000 ? 0 : delay, ...args);
  try {
    const adapter = createChatGptInsights({ fetchImpl: async () => { requests += 1; return new Promise(() => {}); },
      getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.listModels(), errorCode("timeout"));
    assert.equal(requests, 1);
    adapter.dispose();
  } finally { globalThis.setTimeout = originalSetTimeout; }
});

test("malformed provider model catalog is reduced to a fixed invalid-response error", async () => {
  const providerSecret = "SECRET_PROVIDER_MODEL_BODY_REQUEST_ID";
  let requests = 0;
  const adapter = createChatGptInsights({ fetchImpl: async () => {
    requests += 1;
    return new Response(JSON.stringify({ models: providerSecret, request_id: providerSecret }),
      { headers: { "content-type": "application/json" } });
  }, getAccessToken: async () => ACCESS });
  await assert.rejects(adapter.listModels(), (error) => {
    assert.equal(error instanceof ChatGptInsightError, true);
    assert.equal(error.code, "invalid-response");
    assert.equal(error.detail, "catalog-shape");
    assert.equal(JSON.stringify(error).includes(providerSecret), false);
    assert.equal(error.message.includes(providerSecret), false);
    return true;
  });
  assert.equal(requests, 1);
  adapter.dispose();
});

test("model catalog failures expose only fixed validation substages", async () => {
  const secret = "SECRET_PROVIDER_CATALOG_DATA";
  assert.equal(new ChatGptInsightError("invalid-response", secret).detail, undefined);
  const redirect = models();
  Object.defineProperty(redirect, "redirected", { value: true });
  const cases = [
    [redirect, "catalog-redirect"],
    [new Response(secret, { headers: { "content-type": "text/plain" } }), "catalog-content-type"],
    [new Response(secret, { headers: { "content-type": "application/json" } }), "catalog-json"],
    [new Response(JSON.stringify({ models: [{ slug: "bad slug", display_name: secret, visibility: "list" }] }),
      { headers: { "content-type": "application/json" } }), "catalog-entry"],
    [new Response("x".repeat(2_097_153), { headers: { "content-type": "application/json" } }), "catalog-too-large"],
    [new Response(null, { headers: { "content-type": "application/json" } }), "catalog-stream"],
    [new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }), "catalog-encoding"],
  ];
  for (const [response, detail] of cases) {
    const adapter = createChatGptInsights({ fetchImpl: async () => response, getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.listModels(), (error) => {
      assert.equal(errorCode("invalid-response")(error), true);
      assert.equal(error.detail, detail);
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    });
    adapter.dispose();
  }
});

test("model catalog accepts bounded responses larger than the inference stream budget", async () => {
  const response = new Response(JSON.stringify({ models: [{ slug: "synthetic-model", display_name: "Synthetic model", visibility: "list" }],
    ignored: "x".repeat(300_000) }), { headers: { "content-type": "application/json" } });
  const adapter = createChatGptInsights({ fetchImpl: async () => response, getAccessToken: async () => ACCESS });
  assert.deepEqual(await adapter.listModels(), [{ slug: "synthetic-model", displayName: "Synthetic model" }]);
  adapter.dispose();
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
  assert.match(payload.instructions, /one useful opening post/u);
  assert.doesNotMatch(payload.instructions, /Use web research selectively/u);
});

test("clearing account models invalidates old selection without resetting the call quota", async () => {
  let dispatched = 0;
  let catalogs = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) { catalogs += 1; return models(); }
    dispatched += 1;
    return stream(complete());
  }, getAccessToken: async () => ACCESS, now: () => 1_000 });
  await adapter.listModels();
  await adapter.createInsight(REQUEST);
  adapter.clearModels();
  for (let i = 0; i < 4; i++) await adapter.createInsight(REQUEST);
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("rate-limit"));
  assert.equal(dispatched, 5);
  assert.equal(catalogs, 2);
});

test("cold catalog time is excluded from the rolling quota timestamp", async () => {
  const hour = 3_600_000;
  let clock = 0;
  let catalogs = 0;
  let responses = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) { catalogs += 1; clock = hour - 1_000; return models(); }
    responses += 1; return stream(complete());
  }, getAccessToken: async () => ACCESS, now: () => clock });
  await adapter.createInsight(REQUEST);
  clock = hour + 1_000;
  for (let i = 0; i < 4; i++) await adapter.createInsight(REQUEST);
  await assert.rejects(adapter.createInsight(REQUEST), errorCode("rate-limit"));
  assert.equal(catalogs, 1);
  assert.equal(responses, 5);
  adapter.dispose();
});

test("explicit Insight restores an empty model catalog once without sending page content in the catalog request", async () => {
  const calls = [];
  const adapter = createChatGptInsights({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/models") ? models() : stream(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.createInsight(REQUEST);
  await adapter.createInsight(REQUEST);
  assert.deepEqual(calls.map(({ url }) => url.split("/").at(-1)), ["models", "responses", "responses"]);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${ACCESS}`);
  adapter.dispose();
});

test("empty-catalog recovery validates input and the current account list before inference", async () => {
  for (const [request, catalog, expected, requests] of [
    [{ ...REQUEST, articleText: "x".repeat(4_097) }, models(), "invalid-input", []],
    [{ ...REQUEST, model: "other-model" }, models(), "model-unavailable", ["models"]],
    [REQUEST, new Response("unavailable", { status: 503 }), "provider-unavailable", ["models"]],
  ]) {
    const calls = [];
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      calls.push(url.split("/").at(-1));
      return url.endsWith("/models") ? catalog : stream(complete());
    }, getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight(request), errorCode(expected));
    assert.deepEqual(calls, requests);
    adapter.dispose();
  }
});

test("empty-catalog recovery keeps the 25-second catalog deadline without retrying inference", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  let catalogs = 0;
  let responses = 0;
  globalThis.setTimeout = (callback, delay, ...args) =>
    originalSetTimeout(callback, delay === 25_000 ? 0 : delay, ...args);
  try {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) { catalogs += 1; return new Promise(() => {}); }
      responses += 1; return stream(complete());
    }, getAccessToken: async () => ACCESS });
    await assert.rejects(adapter.createInsight(REQUEST), errorCode("timeout"));
    assert.equal(catalogs, 1);
    assert.equal(responses, 0);
    adapter.dispose();
  } finally { globalThis.setTimeout = originalSetTimeout; }
});

test("clearing models during empty-catalog recovery fences a late catalog and inference", async () => {
  let release;
  const calls = [];
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    calls.push(url.split("/").at(-1));
    if (!url.endsWith("/models")) return stream(complete());
    return calls.length === 1 ? new Promise((resolve) => { release = resolve; }) : models();
  }, getAccessToken: async () => ACCESS });
  const pending = adapter.createInsight(REQUEST);
  for (let i = 0; i < 8 && !release; i++) await Promise.resolve();
  assert.equal(typeof release, "function");
  adapter.clearModels();
  await assert.rejects(pending, errorCode("cancelled"));
  release(models());
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, ["models"]);
  await assert.rejects(adapter.createInsight({ ...REQUEST, model: "missing-model" }), errorCode("model-unavailable"));
  assert.deepEqual(calls, ["models", "models"]);
  adapter.dispose();
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
  const citation = { type: "url_citation", url: CONTEXT.relatedSources[0].url, title: "Checked page", start_index: 2, end_index: 8 };
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(`event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n${complete("Evidence [1].", [citation,
      { type: "other_annotation", url: "javascript:alert(1)" }])}`), getAccessToken: async () => ACCESS });
  await adapter.listModels();
  assert.deepEqual(await adapter.createInsight({ ...REQUEST, allowWebResearch: true }), { body: "Evidence [1].", model: "synthetic-model",
    citations: [{ url: citation.url, title: citation.title, startIndex: 2, endIndex: 8 }] });
});

test("account catalog preserves display order while bounding the selector", async () => {
  const catalog = Array.from({ length: 120 }, (_, index) => ({ slug: `model-${index}`, display_name: `Model ${index}`, visibility: "list" }));
  let posts = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) return new Response(JSON.stringify({ models: catalog }), { headers: { "content-type": "application/json" } });
    posts += 1; return stream(complete());
  }, getAccessToken: async () => ACCESS });
  const listed = await adapter.listModels();
  assert.equal(listed.length, 100);
  assert.deepEqual(listed[0], { slug: "model-0", displayName: "Model 0" });
  assert.deepEqual(listed.at(-1), { slug: "model-99", displayName: "Model 99" });
  await assert.rejects(adapter.createInsight({ ...REQUEST, model: "model-100" }), errorCode("model-unavailable"));
  assert.equal(posts, 0);
});

test("completed response may name a resolved alias while result keeps selected catalog slug", async () => {
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    stream(event("response.completed", { status: "completed", model: "synthetic-model-2026-09-30", output: [
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Checked finding." }] },
    ] })), getAccessToken: async () => ACCESS });
  await adapter.listModels();
  assert.deepEqual(await adapter.createInsight(REQUEST), { body: "Checked finding.", citations: [], model: "synthetic-model" });
});

test("unsupported web capability and streamed quota failures stop without retry", async () => {
  for (const [response, code] of [
    [new Response(JSON.stringify({ error: { code: "subscription_sharing_unsupported_capability", param: "tools" } }),
      { status: 400, headers: { "content-type": "application/json" } }), "unsupported-capability"],
    [stream(event("response.failed", { status: "failed", error: { code: "subscription_sharing_usage_limit_exceeded" } })), "rate-limit"],
  ]) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1; return response;
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), errorCode(code));
    assert.equal(posts, 1);
  }
});

test("failure, incomplete, partial-only, oversized and provider errors never become drafts", async () => {
  for (const [body, code] of [
    [event("response.failed", { status: "failed", error: { message: "sensitive" } }), "provider-unavailable"],
    [event("response.incomplete", { status: "incomplete" }), "provider-unavailable"],
    ["event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n", "invalid-response"],
    [complete("x".repeat(8_001)), "invalid-response"],
    ["x".repeat(262_145), "invalid-response"],
    [complete() + event("response.output_text.delta", { delta: "late" }), "invalid-response"],
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

test("research failures expose only fixed substages without provider text or retries", async () => {
  const secret = "SECRET_PROVIDER_RESEARCH_BODY_REQUEST_ID";
  assert.equal(new ChatGptInsightError("invalid-response", secret).detail, undefined);
  assert.equal(new ChatGptInsightError("provider-unavailable", secret).detail, undefined);
  const cases = [
    [new Response(JSON.stringify({ error: { code: "unknown", message: secret } }),
      { status: 400, headers: { "content-type": "application/json" } }), "provider-unavailable", "response-http-400"],
    [new Response(secret, { headers: { "content-type": "text/plain" } }), "invalid-response", "response-content-text"],
    [stream("x".repeat(262_145)), "invalid-response", "response-too-large"],
    [stream("event: response.completed\ndata: {invalid}\n\n"), "invalid-response", "response-event"],
    [stream("event: response.output_text.delta\ndata: {}\n\n"), "invalid-response", "response-no-final"],
    [stream(complete("  ")), "invalid-response", "response-blank-text"],
    [stream(complete("x".repeat(8_001))), "invalid-response", "response-output-too-large"],
    [stream(event("response.incomplete", { status: "incomplete", incomplete_details: { reason: secret } })),
      "provider-unavailable", "response-incomplete"],
  ];
  for (const [response, code, detail] of cases) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1;
      return response;
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(errorCode(code)(error), true);
      assert.equal(error.detail, detail);
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    });
    assert.equal(posts, 1);
    adapter.dispose();
  }
});

test("completed research without final usable text reports only a fixed structural category", async () => {
  const secret = "SECRET_UNTRUSTED_PROVIDER_MATERIAL";
  const message = (status, content) => ({ type: "message", role: "assistant", status, content });
  const completedStream = (output) => stream(event("response.completed", { status: "completed", output }));
  const cases = [
    [completedStream([]), "response-output-empty"],
    [completedStream([{ type: "web_search_call", status: "completed", action: { query: secret } }]), "response-search-only"],
    [completedStream([{ type: "web_search_call", status: "completed" }, { type: "reasoning" }]), "response-search-only"],
    [completedStream([{ type: "reasoning", summary: [{ text: secret }] }]), "response-reasoning-only"],
    [completedStream([{ type: "web_search_call", status: "completed" }, { type: "other", content: secret }]), "response-no-message"],
    [completedStream([{ type: "other", content: secret }]), "response-no-message"],
    [stream(`event: response.output_text.done\ndata: ${JSON.stringify({ type: "response.output_text.done", text: secret })}\n\n` +
      event("response.completed", { status: "completed", output: [] })), "response-stream-text-unfinalized"],
    [stream(`event: response.output_item.done\ndata: ${JSON.stringify({ type: "response.output_item.done",
      item: message("completed", [{ type: "output_text", text: secret }]) })}\n\n` +
      event("response.completed", { status: "completed", output: [] })), "response-item-conflict"],
    [completedStream([message("in_progress", [{ type: "output_text", text: secret }])]), "response-message-unfinished"],
    [completedStream([message("completed", [{ type: "refusal", refusal: secret }])]), "response-refusal"],
    [completedStream([message("completed", [{ type: "other", text: secret }])]), "response-no-text"],
    [completedStream([message("completed", [{ type: "output_text", text: "  " }])]), "response-blank-text"],
    [completedStream([message("completed", [{ type: "output_text", text: `${secret}\u202e` }])]), "response-unsafe-text"],
  ];
  for (const [reply, detail] of cases) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1;
      return reply;
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(errorCode("invalid-response")(error), true);
      assert.equal(error.detail, detail);
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    });
    assert.equal(posts, 1);
    adapter.dispose();
  }
});

test("one identity-matched finalized assistant item can become a private result after terminal completion", async () => {
  const responseId = "resp_synthetic_one";
  const itemId = "msg_synthetic_one";
  const body = "A bounded synthetic insight[[ref:1]].";
  const relatedExcerpts = [{ sourceId: "same", url: CONTEXT.sameTopicSources[0].url, text: "Same event." }];
  const item = { id: itemId, type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: body, annotations: [] }] };
  const textFinalized = streamEvent("response.output_text.done", { item_id: itemId, output_index: 7, content_index: 0, text: body });
  const prefix = Array.from({ length: 7 }, (_, index) => {
    const type = index % 2 === 0 ? "reasoning" : "web_search_call";
    const id = `${type}_${index}`;
    return streamEvent("response.output_item.added", { output_index: index,
      item: { id, type, ...(type === "reasoning" ? {} : { status: "in_progress" }) } }) +
      streamEvent("response.output_item.done", { output_index: index,
        item: { id, type, ...(type === "reasoning" ? {} : { status: "completed" }) } });
  }).join("");
  const raw = streamEvent("response.created", { response: { id: responseId, status: "in_progress", output: [] } }) +
    prefix + streamEvent("response.output_item.added", { output_index: 7,
      item: { id: itemId, type: "message", role: "assistant", status: "in_progress", content: [] } }) +
    textFinalized +
    streamEvent("response.content_part.done", { item_id: itemId, output_index: 7, content_index: 0,
      part: { type: "output_text", text: body } }) +
    streamEvent("response.output_item.done", { output_index: 7, item }) +
    streamEvent("response.completed", { response: { id: responseId, status: "completed",
      output: [] } });
  for (const reply of [stream(raw), headerless(raw), stream(raw.replace(textFinalized, ""))]) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1;
      return reply;
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    assert.deepEqual(await adapter.createInsight({ ...REQUEST, relatedExcerpts }), { body, citations: [{
      startIndex: body.indexOf("[[ref:1]]"), endIndex: body.indexOf("[[ref:1]]") + 9,
      url: relatedExcerpts[0].url, title: CONTEXT.sameTopicSources[0].title,
    }], model: "synthetic-model" });
    assert.equal(posts, 1);
    adapter.dispose();
  }
});

test("previous matching terminal-prefix fallback remains available", async () => {
  const responseId = "resp_legacy_prefix";
  const prior = { id: "call_prior", type: "web_search_call", status: "completed" };
  const answer = { id: "msg_legacy", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Legacy private answer." }] };
  const created = streamEvent("response.created", { response: { id: responseId } });
  const done = streamEvent("response.output_item.done", { output_index: 1, item: answer });
  const final = (output) => streamEvent("response.completed", { response: {
    id: responseId, status: "completed", output } });
  for (const [raw, expected] of [
    [created + done + final([prior]), "Legacy private answer."],
    [created + done + final([{ ...prior, id: "other" }]), "Legacy private answer."],
    [created + streamEvent("response.output_item.done", { output_index: 0, item: prior }) +
      done + final([{ ...prior, id: "other" }]), null],
    [created + done + final([{ ...prior, status: "failed" }]), null],
    [created + done + final([prior]).slice(0, -1), null],
  ]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) =>
      url.endsWith("/models") ? models() : stream(raw), getAccessToken: async () => ACCESS });
    await adapter.listModels();
    if (expected) assert.equal((await adapter.createInsight(REQUEST)).body, expected);
    else await assert.rejects(adapter.createInsight(REQUEST), errorCode("invalid-response"));
    adapter.dispose();
  }
});

test("empty-output recovery requires a complete matched prefix and rejects contradictory evidence", async () => {
  const responseId = "resp_strict_prefix", body = "Synthetic private answer.";
  const prior = { id: "reasoning_prior", type: "reasoning" };
  const answer = { id: "msg_answer", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: body }] };
  const created = streamEvent("response.created", { response: { id: responseId } });
  const added = (index, item) => streamEvent("response.output_item.added", { output_index: index,
    item: { ...item, ...(item.type === "reasoning" ? {} : { status: "in_progress" }),
      ...(item.type === "message" ? { content: [] } : {}) } });
  const done = (index, item) => streamEvent("response.output_item.done", { output_index: index, item });
  const final = (output = [], extra = {}) => streamEvent("response.completed", { response: {
    id: responseId, status: "completed", output, ...extra } });
  const prefix = added(0, prior) + done(0, prior) + added(1, answer) + done(1, answer);
  const cases = [
    { raw: created + prefix + final(), detail: null },
    { raw: created + added(0, { ...prior, encrypted_content: "opaque_added" }) +
      done(0, { ...prior, encrypted_content: "opaque_done" }) +
      added(1, answer) + done(1, answer) + final(), detail: null },
    { raw: created + added(0, prior) + added(1, answer) + done(1, answer) + final(), detail: "response-item-prefix" },
    { raw: created + done(0, prior) + added(0, prior) + added(1, answer) + done(1, answer) + final(), detail: "response-item-conflict" },
    { raw: created + added(0, prior) + done(0, { ...prior, id: "different_prior" }) +
      added(1, answer) + done(1, answer) + final(), detail: "response-item-conflict" },
    { raw: created + added(0, prior) + done(0, { ...prior, type: "web_search_call" }) +
      added(1, answer) + done(1, answer) + final(), detail: "response-item-conflict" },
    { raw: created + added(0, prior) + done(0, { ...prior, status: "incomplete" }) +
      added(1, answer) + done(1, answer) + final(), detail: "response-item-conflict" },
    { raw: created + added(0, { ...prior, type: "web_search_call" }) +
      done(0, { ...prior, type: "web_search_call" }) + added(1, answer) + done(1, answer) + final(),
      detail: "response-item-identity" },
    { raw: created + added(0, { ...prior, status: "in_progress" }) +
      done(0, { ...prior, status: "completed" }) + added(1, answer) + done(1, answer) + final(),
      detail: "response-item-identity" },
    { raw: created + streamEvent("response.output_item.added", { output_index: 0,
      item: { id: prior.id, type: "web_search_call" } }) +
      done(0, { ...prior, type: "web_search_call", status: "completed" }) +
      added(1, answer) + done(1, answer) + final(), detail: "response-item-identity" },
    { raw: created + added(0, prior) + done(0, prior) +
      added(1, { ...answer, status: undefined }) + done(1, { ...answer, status: undefined }) + final(),
      detail: "response-output-empty" },
    { raw: created + added(0, prior) + done(0, prior) +
      streamEvent("response.output_item.added", { output_index: 1,
        item: { ...answer, status: "in_progress", content: [{ type: "output_text", text: "Earlier answer A." }] } }) +
      done(1, answer) + final(), detail: "response-item-text" },
    { raw: created + streamEvent("response.output_item.added", { output_index: 0,
      item: { ...prior, summary: [{ type: "summary_text", text: "Earlier reasoning A." }] } }) +
      done(0, { ...prior, summary: [{ type: "summary_text", text: "Different reasoning B." }] }) +
      added(1, answer) + done(1, answer) + final(), detail: "response-item-conflict" },
    { raw: created + streamEvent("response.output_item.added", { output_index: 0,
      item: { id: prior.id, type: "web_search_call", status: "in_progress", action: { query: "A" } } }) +
      done(0, { id: prior.id, type: "web_search_call", status: "completed", action: { query: "B" } }) +
      added(1, answer) + done(1, answer) + final(), detail: "response-item-conflict" },
    { raw: created + prefix + final([prior]), detail: null },
    { raw: created + prefix + final([], { error: { code: "failure" } }), detail: "response-item-conflict" },
    { raw: created + prefix + streamEvent("response.refusal.done", { item_id: answer.id }) + final(), detail: "response-item-conflict" },
    { raw: created + prefix + streamEvent("response.output_text.done", { item_id: answer.id,
      output_index: 1, content_index: 0, text: "different" }) + final(), detail: "response-item-text" },
    { raw: created + prefix + streamEvent("response.content_part.done", { item_id: answer.id,
      output_index: 1, content_index: 0, part: { type: "output_text", text: "different" } }) + final(), detail: "response-item-text" },
    { raw: created + added(0, prior) + done(0, prior) +
      streamEvent("response.output_text.delta", { item_id: answer.id, output_index: 1, content_index: 0,
        delta: body }) + final(), detail: "response-output-empty" },
    { raw: created + prefix + final().slice(0, -1), detail: "response-event" },
  ];
  for (const [index, { raw, detail }] of cases.entries()) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1;
      return stream(raw);
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    if (detail === null) assert.equal((await adapter.createInsight(REQUEST)).body, body);
    else await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(error.detail, detail, `case ${index}`);
      assert.equal(JSON.stringify(error).includes("Earlier answer A."), false);
      assert.equal(JSON.stringify(error).includes("Earlier reasoning A."), false);
      return true;
    });
    assert.equal(posts, 1);
    adapter.dispose();
  }
});

test("finalized-item fallback rejects missing identity, conflict, refusal and incomplete streams", async () => {
  const responseId = "resp_synthetic_two", itemId = "msg_synthetic_two";
  const body = "SECRET_SYNTHETIC_FINAL_ITEM";
  const item = { id: itemId, type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: body, annotations: [] }] };
  const created = streamEvent("response.created", { response: { id: responseId } });
  const doneText = streamEvent("response.output_text.done", { item_id: itemId, output_index: 0, content_index: 0, text: body });
  const doneItem = streamEvent("response.output_item.done", { output_index: 0, item });
  const terminal = streamEvent("response.completed", { response: { id: responseId, status: "completed", output: [] } });
  const cases = [
    doneText + doneItem + terminal,
    created + doneText + doneItem + streamEvent("response.completed", { response: { id: "resp_other", status: "completed", output: [] } }),
    created + streamEvent("response.output_text.done", { item_id: itemId, output_index: 0, content_index: 0, text: "different" }) + doneItem + terminal,
    created + doneText + doneItem + doneItem + terminal,
    created + streamEvent("response.output_text.done", { item_id: itemId, output_index: 1, content_index: 0, text: body }) +
      streamEvent("response.output_item.done", { output_index: 1, item }) + terminal,
    created + doneText + doneItem + streamEvent("response.output_text.done", { item_id: itemId,
      output_index: 0, content_index: 0, text: null }) + terminal,
    created + doneText + doneItem + streamEvent("response.completed", { response: { id: responseId, status: "completed",
      output: [{ id: "call_conflict", type: "web_search_call" }] } }),
    created + streamEvent("response.output_item.done", { output_index: 0,
      item: { id: "call_observed", type: "web_search_call", status: "completed" } }) +
      streamEvent("response.output_text.done", { item_id: itemId, output_index: 1, content_index: 0, text: body }) +
      streamEvent("response.output_item.done", { output_index: 1, item }) +
      streamEvent("response.completed", { response: { id: responseId, status: "completed",
        output: [{ id: "call_other", type: "web_search_call", status: "completed" }] } }),
    created + streamEvent("response.output_item.done", { output_index: 0,
      item: { id: "call_same", type: "reasoning", status: "completed" } }) +
      streamEvent("response.output_item.done", { output_index: 1, item }) +
      streamEvent("response.completed", { response: { id: responseId, status: "completed",
        output: [{ id: "call_same", type: "web_search_call", status: "completed" }] } }),
    created + streamEvent("response.output_item.done", { output_index: 0,
      item: { id: "call_same", type: "web_search_call", status: "completed" } }) +
      streamEvent("response.output_item.done", { output_index: 1, item }) +
      streamEvent("response.completed", { response: { id: responseId, status: "completed",
        output: [{ id: "call_same", type: "web_search_call", status: "in_progress" }] } }),
    created + streamEvent("response.output_text.done", { item_id: itemId, output_index: 1, content_index: 0, text: body }) +
      streamEvent("response.output_item.done", { output_index: 1, item }) +
      streamEvent("response.completed", { response: { id: responseId, status: "completed",
        output: [{ id: "call_failed", type: "web_search_call", status: "failed" }] } }),
    created + streamEvent("response.output_text.done", { item_id: itemId, output_index: 1, content_index: 0, text: body }) +
      streamEvent("response.output_item.done", { output_index: 1, item }) +
      streamEvent("response.completed", { response: { id: responseId, status: "completed",
        output: [{ id: "msg_other", type: "message", role: "user", status: "completed", content: [] }] } }),
    created + doneText + streamEvent("response.output_item.done", { output_index: 0,
      item: { ...item, content: [{ type: "refusal", refusal: body }, ...item.content] } }) + terminal,
    created + doneText + doneItem + streamEvent("response.incomplete", { response: { status: "incomplete" } }) + terminal,
    created + doneText + doneItem + streamEvent("response.output_item.done", { output_index: 1,
      item: { id: "msg_incomplete", type: "message", role: "assistant", status: "incomplete", content: [] } }) + terminal,
    created + doneText + doneItem + streamEvent("response.output_item.done", { output_index: 1,
      item: { id: "call_failed", type: "web_search_call", status: "failed" } }) + terminal,
    created + doneText + doneItem + streamEvent("response.content_part.done", { item_id: itemId,
      output_index: 0, content_index: 0, part: { type: "output_text", text: "different" } }) + terminal,
    created + streamEvent("response.output_item.added", { output_index: 0,
      item: { id: "msg_other", type: "message", role: "assistant", status: "in_progress" } }) +
      doneText + doneItem + terminal,
    created + doneText + doneItem,
  ];
  for (const raw of cases) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1;
      return stream(raw);
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.ok(error instanceof ChatGptInsightError);
      assert.equal(JSON.stringify(error).includes(body), false);
      return true;
    });
    assert.equal(posts, 1);
    adapter.dispose();
  }
});

test("finalized-item diagnostics disclose only a fixed rejection boundary", async () => {
  const body = "SECRET_SYNTHETIC_DIAGNOSTIC";
  const item = { id: "msg_synthetic_diag", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: body }] };
  const created = streamEvent("response.created", { response: { id: "resp_synthetic_diag" } });
  const added = streamEvent("response.output_item.added", { output_index: 0,
    item: { id: item.id, type: "message", role: "assistant", status: "in_progress" } });
  const done = streamEvent("response.output_item.done", { output_index: 0, item });
  const final = (output = []) => streamEvent("response.completed", { response: {
    id: "resp_synthetic_diag", status: "completed", output } });
  for (const [raw, detail] of [
    [done + final(), "response-item-identity"],
    [created + added + done + streamEvent("response.output_item.done", { output_index: 0, item }) + final(), "response-item-conflict"],
    [created + streamEvent("response.output_item.done", { output_index: 1, item }) + final(), "response-item-prefix"],
    [created + added + streamEvent("response.output_text.done", { item_id: item.id, output_index: 0,
      content_index: 0, text: "contradictory" }) + done + final(), "response-item-text"],
  ]) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : stream(raw),
      getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(error.detail, detail);
      assert.equal(JSON.stringify(error).includes(body), false);
      return true;
    });
    adapter.dispose();
  }
});

test("research response trace identifies a missing finalized item without provider data", async () => {
  const secret = "SECRET_BODY_URL_ACCOUNT_TOKEN";
  const responseId = `resp_${secret}`;
  const itemId = `msg_${secret}`;
  const item = { id: itemId, type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: secret }] };
  const raw = streamEvent("response.created", { response: { id: responseId, account: secret } }) +
    streamEvent("response.output_item.done", { output_index: 2, item, metadata: { secret } }) +
    streamEvent("response.output_text.done", { item_id: itemId, output_index: 2, content_index: 0, text: secret }) +
    streamEvent("response.web_search_call.searching", { query: secret }) +
    streamEvent("response.unknown-secret-event", { secret }) +
    streamEvent("response.completed", { response: { id: responseId, status: "completed",
      output: [{ id: `call_${secret}`, type: "web_search_call", status: "completed", action: { query: secret } }],
      model: `model_${secret}`, usage: { secret } } });
  const traces = [];
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : stream(raw),
    getAccessToken: async () => ACCESS, onTrace: (trace) => traces.push(trace) });
  await adapter.listModels();
  await assert.rejects(adapter.createInsight(REQUEST), (error) => {
    assert.equal(error.detail, "response-item-prefix");
    return true;
  });
  assert.equal(traces.length, 1);
  assert.equal(traces[0].schema, "insight-response-trace/v2");
  assert.equal(traces[0].citationFailure, null);
  assert.equal(traces[0].outcome, "failure");
  assert.equal(traces[0].detail, "response-item-prefix");
  assert.equal(traces[0].fallbackFailure, "response-item-prefix");
  assert.equal(traces[0].fallbackBranch, "length");
  assert.equal(traces[0].createdFinalMatch, true);
  assert.equal(traces[0].candidateCount, 1);
  assert.equal(traces[0].candidateIndex, 2);
  assert.deepEqual(traces[0].observedItems, [{ phase: "done", index: 2, type: "message", status: "completed" }]);
  assert.deepEqual(traces[0].finalOutput, [{ phase: "final", index: 0, type: "web_search_call", status: "completed" }]);
  assert.deepEqual(traces[0].events.sequence,
    ["response.created", "response.output_item.done", "response.output_text.done",
      "response.web_search_call.searching", "other", "response.completed"]);
  assert.equal(JSON.stringify(traces).includes(secret), false);
  assert.equal(JSON.stringify(traces).includes(ACCESS), false);
  adapter.dispose();
});

test("trace distinguishes a missing prefix without logging item identities", async () => {
  const secret = "SECRET_PREFIX_ID";
  const candidate = { id: `msg_${secret}`, type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "A bounded finding [1]." }] };
  const created = streamEvent("response.created", { response: { id: "resp_prefix" } });
  const added = streamEvent("response.output_item.added", { output_index: 1,
    item: { id: candidate.id, type: "message", role: "assistant", status: "in_progress" } });
  const done = streamEvent("response.output_item.done", { output_index: 1, item: candidate });
  const final = (output) => streamEvent("response.completed", { response: {
    id: "resp_prefix", status: "completed", output } });
  const cases = [{ branch: "length", raw: created + added + done + final([]) }];
  for (const { branch, raw } of cases) {
    const traces = [];
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : stream(raw),
      getAccessToken: async () => ACCESS, onTrace: (trace) => traces.push(trace) });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => error.detail === "response-item-prefix");
    assert.equal(traces.length, 1);
    assert.equal(traces[0].fallbackBranch, branch);
    assert.equal(JSON.stringify(traces).includes(secret), false);
    adapter.dispose();
  }
});

test("research trace is emitted once on success and callback exceptions do not change the result", async () => {
  let traces = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : stream(complete()),
    getAccessToken: async () => ACCESS, onTrace: (trace) => {
      traces += 1;
      assert.equal(trace.outcome, "success");
      assert.equal(trace.detail, null);
      assert.equal(trace.finalOutput[0].type, "message");
      throw new Error("synthetic logger failure");
    } });
  await adapter.listModels();
  assert.equal((await adapter.createInsight(REQUEST)).body, "A bounded finding [1].");
  assert.equal(traces, 1);
  adapter.dispose();
});

test("non-SSE success responses report only a fixed MIME category and never import their body", async () => {
  const secret = "SECRET_PROVIDER_RESPONSE_BODY_URL_ACCOUNT";
  const cases = [
    [new Response(JSON.stringify({ output_text: secret }), { headers: { "content-type": "application/json; charset=utf-8" } }), "response-content-json"],
    [new Response(`<html>${secret}</html>`, { headers: { "content-type": "TEXT/HTML" } }), "response-content-html"],
    [new Response(secret, { headers: { "content-type": "text/plain ; charset=utf-8" } }), "response-content-text"],
    [new Response(new TextEncoder().encode(secret)), "response-content-missing"],
    [new Response(secret, { headers: { "content-type": `application/x-${secret}` } }), "response-content-other"],
    [new Response(secret, { headers: { "content-type": "application/jsonish" } }), "response-content-other"],
    [new Response(secret, { headers: { "content-type": "text/event-streamish" } }), "response-content-other"],
  ];
  for (const [response, detail] of cases) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1;
      return response;
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(errorCode("invalid-response")(error), true);
      assert.equal(error.detail, detail);
      assert.equal(JSON.stringify(error).includes(secret), false);
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(posts, 1);
    adapter.dispose();
  }
});

test("SSE media type accepts optional whitespace before parameters", async () => {
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    new Response(complete(), { headers: { "content-type": "Text/Event-Stream ; charset=utf-8" } }),
    getAccessToken: async () => ACCESS });
  await adapter.listModels();
  assert.equal((await adapter.createInsight(REQUEST)).body, "A bounded finding [1].");
  adapter.dispose();
});

test("headerless HTTP 200 accepts one complete bounded Responses SSE stream", async () => {
  let posts = 0;
  const adapter = createChatGptInsights({ fetchImpl: async (url) => {
    if (url.endsWith("/models")) return models();
    posts += 1;
    return headerless(complete());
  }, getAccessToken: async () => ACCESS });
  await adapter.listModels();
  assert.deepEqual(await adapter.createInsight(REQUEST), { body: "A bounded finding [1].", citations: [], model: "synthetic-model" });
  assert.equal(posts, 1);
  adapter.dispose();
});

test("headerless terminal failure maps only fixed codes from a complete matching stream", async () => {
  const id = "resp_synthetic";
  const secret = "SECRET_PROVIDER_FAILURE_MESSAGE";
  const prefix = event("response.created", { id, status: "in_progress" }) +
    event("response.in_progress", { id, status: "in_progress" });
  const failed = (code, responseId = id) => event("response.failed", {
    id: responseId, status: "failed", error: { code, message: secret }, output: [],
  });
  const error = streamEvent("error", { error: { code: "subscription_sharing_usage_limit_exceeded", message: secret } });
  const cases = [
    [prefix + error + failed("subscription_sharing_usage_limit_exceeded"), "rate-limit"],
    [prefix + failed("subscription_sharing_unsupported_capability"), "unsupported-capability"],
  ];
  for (const [body, code] of cases) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1; return headerless(body);
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(errorCode(code)(error), true);
      assert.equal(error.detail, undefined);
      assert.equal(JSON.stringify(error).includes(secret), false);
      assert.equal(JSON.stringify(error).includes(id), false);
      return true;
    });
    assert.equal(posts, 1);
    adapter.dispose();
  }
});

test("headerless failure rejects mismatched, incomplete, malformed and nonterminal streams", async () => {
  const id = "resp_synthetic";
  const created = event("response.created", { id, status: "in_progress" });
  const failed = event("response.failed", { id, status: "failed",
    error: { code: "subscription_sharing_usage_limit_exceeded" }, output: [] });
  const cases = [
    created + failed.slice(0, -1),
    created + event("response.failed", { id: "resp_other", status: "failed",
      error: { code: "subscription_sharing_usage_limit_exceeded" } }),
    created + failed + event("response.in_progress", { id }),
    created + failed.replace("event: response.failed", "event: response.completed"),
    created + streamEvent("response.output_text.delta", { delta: "untrusted" }) + failed,
    created + failed.replace("\n\n", "\ndata: {}\n\n"),
    created + event("response.failed", { id, status: "failed", error: { code: "unknown_failure" } }),
  ];
  for (const body of cases) {
    const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() : headerless(body),
      getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(errorCode("invalid-response")(error), true);
      assert.equal(error.detail, "response-content-missing");
      return true;
    });
    adapter.dispose();
  }
});

test("empty format header uses the same strict completed-stream fallback", async () => {
  const adapter = createChatGptInsights({ fetchImpl: async (url) => url.endsWith("/models") ? models() :
    new Response(complete(), { status: 200, headers: { "content-type": " " } }),
  getAccessToken: async () => ACCESS });
  await adapter.listModels();
  assert.equal((await adapter.createInsight(REQUEST)).body, "A bounded finding [1].");
  adapter.dispose();
});

test("headerless success rejects JSON, HTML, partial, malformed, oversized and non-200 bodies without retry", async () => {
  const secret = "SECRET_PROVIDER_UNLABELLED_BODY";
  const cases = [
    headerless(JSON.stringify({ output_text: secret })),
    headerless(`<html>${secret}</html>`),
    headerless(`event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"${secret}"}\n\n`),
    headerless(complete().slice(0, -1)),
    headerless(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}\n\ngarbage\n\n`),
    headerless("x".repeat(262_145)),
    new Response(null, { status: 204 }),
  ];
  for (const response of cases) {
    let posts = 0;
    const adapter = createChatGptInsights({ fetchImpl: async (url) => {
      if (url.endsWith("/models")) return models();
      posts += 1;
      return response;
    }, getAccessToken: async () => ACCESS });
    await adapter.listModels();
    await assert.rejects(adapter.createInsight(REQUEST), (error) => {
      assert.equal(errorCode("invalid-response")(error), true);
      assert.equal(error.detail, response === cases[5] ? "response-too-large" : "response-content-missing");
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    });
    assert.equal(posts, 1);
    adapter.dispose();
  }
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
