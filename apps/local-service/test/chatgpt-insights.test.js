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
function headerless(body) { return new Response(new TextEncoder().encode(body), { status: 200 }); }
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
    [completedStream([{ type: "web_search_call", status: "completed", action: { query: secret } }]), "response-no-message"],
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
