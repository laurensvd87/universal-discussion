import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";
import { INSIGHT_VOICES } from "../../../spikes/topic-resolution/browser/core/insight-voices.js";

const source = (id) => ({ id, title: `Public ${id}`, url: `https://example.com/${id}` });
const context = {
  schema: "insight-context/v1", topic: { id: "topic-a", title: "Provisional" },
  currentSource: source("current"), sameTopicSources: [source("candidate")], relatedSources: [],
  discussion: [{ id: "other", actorType: "human", body: "UNRELATED_HISTORY_SECRET" }],
  coverage: { sameTopicTotal: 1, relatedTotal: 0, discussionIncluded: true },
  limitations: ["grouping-provisional", "visible-roots-only"],
};
const request = { model: "synthetic", context, articleText: "PAGE_CONTENT_SECRET", allowWebResearch: false };
const models = () => new Response(JSON.stringify({ models: [{ slug: "synthetic", visibility: "list", display_name: "Synthetic" }] }),
  { headers: { "content-type": "application/json" } });
function result(research) {
  const response = { type: "response.completed", response: { status: "completed", output: [
    ...(research ? [{ type: "web_search_call", status: "completed" }] : []),
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Useful finding.", annotations: [] }] },
  ] } };
  return new Response(`event: response.completed\ndata: ${JSON.stringify(response)}\n\n`, { headers: { "content-type": "text/event-stream" } });
}
function fixture({ onRequestTrace, onDebug, now = () => 1234, getAccessToken = async () => "synthetic-token-for-tests", catalog = models } = {}) {
  const posts = [], events = [];
  const adapter = createChatGptInsights({ onRequestTrace, onDebug, now, getAccessToken,
    fetchImpl: async (url, options) => {
      events.push(url.endsWith("/models") ? "models" : "post");
      if (url.endsWith("/models")) return catalog();
      posts.push(options.body);
      return result(JSON.parse(options.body).tools.length > 0);
    } });
  return { adapter, posts, events };
}
const fingerprint = (body) => createHash("sha256").update(JSON.parse(body).instructions, "utf8").digest("hex");

test("all twelve clicked voices in four modes trace exact POST instructions without changing packet bytes", async () => {
  for (const { id: voice } of INSIGHT_VOICES) for (const followup of [false, true]) for (const research of [false, true]) {
    const traces = [], order = [];
    const selected = { ...request, allowWebResearch: research, preferences: { voice },
      ...(followup ? { followup: { parentBody: "OPENER_SECRET", questionBody: "SELECTED_SECRET" } } : {}) };
    const traced = fixture({ onRequestTrace: (entry) => { traces.push(entry); order.push("trace"); },
      onDebug: (entry) => { if (entry.phase === "request") order.push("debug"); } });
    const original = fixture();
    try {
      await traced.adapter.createInsight(selected);
      await original.adapter.createInsight(selected);
      assert.deepEqual(traced.posts, original.posts);
      assert.deepEqual(traced.events, ["models", "post"]);
      assert.deepEqual(order, ["debug", "trace"]);
      assert.equal(traces.length, 1);
      assert.ok(Object.isFrozen(traces[0]));
      assert.deepEqual(traces[0], { schema: "insight-request-trace/v1", voice,
        instructionFingerprint: fingerprint(traced.posts[0]), at: 1234 });
      assert.match(traces[0].instructionFingerprint, /^[0-9a-f]{64}$/u);
      const encoded = JSON.stringify(traces[0]);
      for (const hidden of ["SECRET", "example.com", "synthetic", "Bearer", "instructions", "Useful finding"])
        assert.equal(encoded.includes(hidden), false);
    } finally { traced.adapter.dispose(); original.adapter.dispose(); }
  }
});

test("omitted voice defaults to standard and timestamp uses actual dispatch after catalog/token work", async () => {
  let time = 10;
  const traces = [];
  const { adapter, posts } = fixture({ now: () => time, catalog: () => { time = 20; return models(); },
    getAccessToken: async () => { time += 3; return "synthetic-token-for-tests"; }, onRequestTrace: (entry) => traces.push(entry) });
  try {
    await adapter.createInsight(request);
    assert.deepEqual(traces, [{ schema: "insight-request-trace/v1", voice: "standard", instructionFingerprint: fingerprint(posts[0]), at: 23 }]);
  } finally { adapter.dispose(); }
});

test("trace hashes the serialized body after existing debug changes and cannot mutate POST instructions", async () => {
  const traces = [];
  const { adapter, posts } = fixture({ onDebug: (entry) => {
    if (entry.phase === "request") entry.payload.instructions += " Synthetic debug edit.";
  }, onRequestTrace: (entry) => { traces.push(entry); assert.throws(() => { entry.voice = "clever"; }, TypeError); } });
  try {
    await adapter.createInsight(request);
    assert.equal(traces[0].instructionFingerprint, fingerprint(posts[0]));
    assert.ok(JSON.parse(posts[0]).instructions.endsWith(" Synthetic debug edit."));
  } finally { adapter.dispose(); }
});

test("private suppression blocks every voice trace and both raw debug phases", async () => {
  for (const { id: voice } of INSIGHT_VOICES) {
    let traces = 0, debug = 0;
    const { adapter, posts } = fixture({ onRequestTrace: () => traces++, onDebug: () => debug++ });
    try {
      await adapter.createInsight({ ...request, preferences: { voice },
        followup: { parentBody: "Private parent", questionBody: "Private selected message" } }, { suppressDebug: true });
      assert.equal(posts.length, 1); assert.equal(traces, 0); assert.equal(debug, 0);
    } finally { adapter.dispose(); }
  }
});

test("invalid callback configuration rejects before any credentials or fetch", () => {
  for (const onRequestTrace of [null, false, {}, [], "callback"]) {
    assert.throws(() => createChatGptInsights({ fetchImpl: () => assert.fail(), getAccessToken: () => assert.fail(), onRequestTrace }),
      (error) => error.code === "invalid-input");
  }
});

test("throwing sinks, rejected promises and hostile then getters do not change request/result", async () => {
  for (const onRequestTrace of [() => { throw new Error("sink failed"); }, () => Promise.reject(new Error("sink failed")),
    () => Object.defineProperty({}, "then", { get() { throw new Error("getter failed"); } })]) {
    const { adapter, posts } = fixture({ onRequestTrace });
    try {
      assert.equal((await adapter.createInsight(request)).body, "Useful finding.");
      assert.equal(posts.length, 1);
      await new Promise((resolve) => setImmediate(resolve));
    } finally { adapter.dispose(); }
  }
});

test("malformed input, invalid clocks, unavailable models and failed catalogs never emit", async () => {
  const cases = [
    { selected: { ...request, preferences: { voice: "not-a-voice" } }, code: "invalid-input", events: [] },
    { selected: { ...request, articleText: "x".repeat(4097) }, code: "invalid-input", events: [] },
    { selected: { ...request, model: "missing" }, code: "model-unavailable", events: ["models"] },
    { catalog: () => new Response("failure", { status: 503 }), code: "provider-unavailable", events: ["models"] },
    { now: () => -1, code: "invalid-input", events: [] },
    { catalog: () => { time = NaN; return models(); }, now: () => time, code: "invalid-input", events: ["models"] },
  ];
  let time = 1234;
  for (const row of cases) {
    time = 1234;
    let traces = 0;
    const { adapter, posts, events } = fixture({ ...row, onRequestTrace: () => traces++ });
    try {
      await assert.rejects(adapter.createInsight(row.selected ?? request), (error) => error.code === row.code);
      assert.equal(traces, 0); assert.equal(posts.length, 0); assert.deepEqual(events, row.events);
    } finally { adapter.dispose(); }
  }
});

test("model listing, pre-aborted input and cancelled token preflight never trace", async () => {
  let traces = 0, release;
  const { adapter, posts } = fixture({ onRequestTrace: () => traces++,
    getAccessToken: async () => { if (release === undefined) return "synthetic-token-for-tests"; return new Promise((resolve) => { release = resolve; }); } });
  try {
    await adapter.listModels();
    assert.equal(traces, 0);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(adapter.createInsight(request, { signal: abort.signal }), (error) => error.code === "cancelled");
    release = null;
    const pending = adapter.createInsight(request);
    adapter.cancel();
    await assert.rejects(pending, (error) => error.code === "cancelled");
    release("synthetic-token-for-tests");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(traces, 0); assert.equal(posts.length, 0);
  } finally { adapter.dispose(); }
});

test("cancelled by the raw request debug callback emits no request trace or POST", async () => {
  let traces = 0;
  const { adapter, posts } = fixture({ onRequestTrace: () => traces++, onDebug: (entry) => { if (entry.phase === "request") adapter.cancel(); } });
  try {
    await assert.rejects(adapter.createInsight(request), (error) => error.code === "cancelled");
    assert.equal(traces, 0); assert.equal(posts.length, 0);
  } finally { adapter.dispose(); }
});

test("local hourly quota emits exactly five traces and no trace for denied sixth request", async () => {
  const traces = [];
  const { adapter, posts } = fixture({ onRequestTrace: (entry) => traces.push(entry) });
  try {
    for (let index = 0; index < 5; index++) await adapter.createInsight(request);
    await assert.rejects(adapter.createInsight(request), (error) => error.code === "rate-limit");
    assert.equal(traces.length, 5); assert.equal(posts.length, 5);
  } finally { adapter.dispose(); }
});

test("busy preflight rejects without adding a trace while the existing token lookup is pending", async () => {
  let traces = 0, release;
  const pendingFixture = fixture({ onRequestTrace: () => traces++,
    getAccessToken: () => new Promise((resolve) => { release = resolve; }) });
  try {
    const pending = pendingFixture.adapter.createInsight(request);
    await assert.rejects(pendingFixture.adapter.createInsight(request), (error) => error.code === "busy");
    assert.equal(traces, 0); assert.equal(pendingFixture.posts.length, 0);
    pendingFixture.adapter.cancel();
    await assert.rejects(pending, (error) => error.code === "cancelled");
    release("synthetic-token-for-tests");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(traces, 0); assert.equal(pendingFixture.posts.length, 0);
  } finally { pendingFixture.adapter.dispose(); }
});
