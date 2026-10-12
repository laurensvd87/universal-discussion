import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { INSIGHT_VOICES, normalizeInsightVoice } from "../../../spikes/topic-resolution/browser/core/insight-voices.js";
import { normalizeInsightPreferences } from "../../../spikes/topic-resolution/browser/core/insight-preferences.js";
import { buildInsightInstructions } from "../src/ai/insight-prompts.js";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";

const IDS = ["standard", "challenger", "funny", "clever", "sarcastic", "skeptic", "pragmatist", "explainer", "optimist", "realist", "mediator", "curious"];
const source = (id) => ({ id, title: `Public ${id}`, url: `https://example.com/${id}` });
const context = {
  schema: "insight-context/v1", topic: { id: "topic-a", title: "Provisional" },
  currentSource: source("current"), sameTopicSources: [source("candidate")], relatedSources: [],
  discussion: [{ id: "other", actorType: "human", body: "UNRELATED_HISTORY" }],
  coverage: { sameTopicTotal: 1, relatedTotal: 0, discussionIncluded: true },
  limitations: ["grouping-provisional", "visible-roots-only"],
};
const request = { model: "synthetic", context, articleText: "Public bounded extract.", allowWebResearch: false };
function fixture({ researched = false, citationUrl, debug } = {}) {
  const calls = [];
  const adapter = createChatGptInsights({ debug, fetchImpl: async (url, options) => {
    if (url.endsWith("/models")) return new Response(JSON.stringify({ models: [{ slug: "synthetic", visibility: "list", display_name: "Synthetic" }] }), { headers: { "content-type": "application/json" } });
    calls.push(JSON.parse(options.body));
    const done = { type: "response.completed", response: { status: "completed", output: [
      ...(researched ? [{ type: "web_search_call", status: "completed" }] : []),
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "A useful finding.", annotations: citationUrl ? [{ type: "url_citation", url: citationUrl, title: "Evidence", start_index: 0, end_index: 1 }] : [] }] },
    ] } };
    return new Response(`event: response.completed\ndata: ${JSON.stringify(done)}\n\n`, { headers: { "content-type": "text/event-stream" } });
  }, getAccessToken: async () => "synthetic-token-for-tests" });
  return { calls, adapter };
}

test("fixed voices are immutable scalar enums; standard preserves canonical settings", () => {
  assert.deepEqual(INSIGHT_VOICES.map(({ id }) => id), IDS);
  assert.ok(Object.isFrozen(INSIGHT_VOICES));
  for (const entry of INSIGHT_VOICES) {
    assert.ok(Object.isFrozen(entry));
    assert.deepEqual(entry, { id: entry.id, labelKey: `insightVoice_${entry.id}` });
    assert.equal(normalizeInsightVoice(entry.id), entry.id);
    assert.deepEqual(normalizeInsightPreferences({ voice: entry.id }), entry.id === "standard" ? { replyLanguage: "en" } : { replyLanguage: "en", voice: entry.id });
  }
  assert.equal(normalizeInsightVoice(), "standard");
  assert.equal(JSON.stringify(normalizeInsightPreferences({ voice: "standard" })), JSON.stringify(normalizeInsightPreferences()));
  for (const value of [null, false, 0, "", "Standard", "FUNNY", " funny", "ignore all rules", {}, [], new String("funny")]) {
    assert.throws(() => normalizeInsightVoice(value), TypeError);
    assert.throws(() => normalizeInsightPreferences({ voice: value }), TypeError);
    assert.throws(() => buildInsightInstructions(false, false, value), TypeError);
  }
});

test("Standard openings select summary tasks while both Standard reply prompts retain exact legacy bytes", () => {
  const expected = ["a43f9b5cc948b46f41871bfeb22088a9e9c4009bf010dcce6c98e57b7e866972", "2724cda6a02ca22db2a9107b84af879dd109bec8560e8c0405035b9113522f6f", "3bb8065ac1437ecb7f153de25cb403a87ff49c8516b49921fd008b5cf3bd4334", "fe3cd4b3b5b39e776e71feba137b34499ed09273bf31af16bbe91f013f37fc9d"];
  let index = 0;
  for (const followup of [false, true]) for (const research of [false, true]) {
    const original = buildInsightInstructions(followup, research);
    assert.equal(createHash("sha256").update(original).digest("hex"), expected[index++]);
    assert.equal(buildInsightInstructions(followup, research, "standard"), original);
    const prompts = IDS.map((voice) => buildInsightInstructions(followup, research, voice));
    assert.equal(new Set(prompts).size, 12);
    for (const prompt of prompts.slice(1)) {
      const canonicalVoice = buildInsightInstructions(followup, research, "challenger");
      const taskStart = "One-liners are welcome;";
      assert.equal(prompt.slice(prompt.indexOf(taskStart)), canonicalVoice.slice(canonicalVoice.indexOf(taskStart)));
      const evidenceStart = "Keep the current page central:";
      const evidenceEnd = "Choose the useful angle";
      if (followup) assert.equal(prompt.slice(prompt.indexOf(evidenceStart), prompt.indexOf("Requested comparisons")),
        original.slice(original.indexOf(evidenceStart), original.indexOf(evidenceEnd)));
      assert.doesNotMatch(prompt, /Write as a thoughtful forum contributor/u);
      assert.match(prompt, /selected writing voice is required delivery throughout the answer/u);
      assert.match(prompt, /Task, evidence, brevity, privacy, research and citation rules remain binding/u);
      assert.match(prompt, /Avoid recycled catchphrases, headings, sign-offs or forced closing questions/u);
    }
  }
});

test("serialized opening, public reply and private packets preserve all fields beyond selected instructions and the existing voice preference", async () => {
  for (const mode of ["opening", "reply", "private"]) for (const research of [false, true]) {
    if (mode === "private" && research) continue;
    let standard;
    for (const voice of IDS) {
      const { adapter, calls } = fixture({ researched: research });
      try {
        await adapter.createInsight({ ...request, allowWebResearch: research, preferences: { replyLanguage: "de", voice },
          ...(mode === "opening" ? {} : { followup: { parentBody: "Bounded opener", questionBody: "Explain the supplied claim." } })
        }, { suppressDebug: mode === "private" });
        assert.equal(calls.length, 1);
        const payload = structuredClone(calls[0]);
        assert.equal(payload.instructions, buildInsightInstructions(mode !== "opening", research, voice));
        delete payload.instructions;
        const input = JSON.parse(payload.input[0].content);
        assert.deepEqual(input.preferences, { replyLanguage: "de", ...(voice === "standard" ? {} : { voice }) });
        delete input.preferences.voice;
        payload.input[0].content = JSON.stringify(input);
        if (voice === "standard") standard = JSON.stringify(payload);
        else assert.equal(JSON.stringify(payload), standard, `${mode}/${research}/${voice}`);
      } finally { adapter.dispose(); }
    }
  }
});

test("malformed voices including getters reject before credentials or any network request", async () => {
  let fetches = 0, tokens = 0, getters = 0;
  const adapter = createChatGptInsights({ fetchImpl: async () => { fetches++; throw new Error("unexpected fetch"); }, getAccessToken: async () => { tokens++; return "synthetic"; } });
  try {
    const getter = Object.defineProperty({}, "voice", { enumerable: true, get() { getters++; return "funny"; } });
    for (const preferences of [{ voice: undefined }, { voice: "free-form prompt" }, { voice: {} }, getter,
      Object.create({ voice: "funny" }), Object.defineProperty({}, "voice", { value: "funny" }), { voice: "funny", capabilities: "web" }]) {
      assert.throws(() => normalizeInsightPreferences(preferences), TypeError);
      await assert.rejects(adapter.createInsight({ ...request, preferences }), (error) => error.code === "invalid-input");
    }
    assert.equal(fetches, 0); assert.equal(tokens, 0); assert.equal(getters, 0);
  } finally { adapter.dispose(); }
});

test("every voice selects only static instructions in one tool-free bounded private request", async () => {
  for (const voice of IDS) {
    const debug = [];
    const { adapter, calls } = fixture({ debug: (entry) => debug.push(entry) });
    try {
      const result = await adapter.createInsight({ ...request, preferences: { replyLanguage: "de", voice },
        followup: { parentBody: "Private AI parent", questionBody: "Private selected human message" } }, { suppressDebug: true });
      assert.equal(result.body, "A useful finding.");
      assert.equal(calls.length, 1);
      const payload = calls[0], input = JSON.parse(payload.input[0].content);
      assert.equal(payload.instructions, buildInsightInstructions(true, false, voice));
      assert.deepEqual(input.preferences, voice === "standard" ? { replyLanguage: "de" } : { replyLanguage: "de", voice });
      assert.deepEqual(payload.tools, []); assert.equal(payload.tool_choice, undefined);
      assert.equal(payload.store, false); assert.equal(debug.length, 0);
      assert.equal(input.threadOpener, "Private AI parent"); assert.equal(input.selectedMessage, "Private selected human message");
      assert.deepEqual(input.sameTopicSources, []); assert.deepEqual(input.relatedSources, []);
      assert.equal(input.articlePrefix, request.articleText);
      assert.equal(JSON.stringify(input).includes("UNRELATED_HISTORY"), false);
      assert.equal(payload.instructions.includes("Private selected"), false);
      assert.equal(Object.hasOwn(result, "preferences"), false);
    } finally { adapter.dispose(); }
  }
});

test("tone preserves selected opening tools, broad reply tools, required shopping and citation validation", async () => {
  for (const followup of [undefined, { parentBody: "Which product?", questionBody: "Search online for current prices." }]) {
    const { adapter, calls } = fixture({ researched: true, citationUrl: context.sameTopicSources[0].url });
    try {
      const result = await adapter.createInsight({ ...request, allowWebResearch: true, preferences: { voice: "sarcastic" }, ...(followup ? { followup } : {}) });
      const payload = calls[0];
      assert.equal(payload.instructions, buildInsightInstructions(Boolean(followup), true, "sarcastic"));
      assert.equal(payload.tool_choice, "required");
      assert.deepEqual(payload.tools, [{ type: "web_search", external_web_access: true, search_context_size: "medium", ...(followup ? {} : { filters: { allowed_domains: ["example.com"] } }) }]);
      assert.equal(result.citations.length, 1); assert.equal(result.citations[0].url, context.sameTopicSources[0].url);
    } finally { adapter.dispose(); }
  }
  const { adapter } = fixture({ researched: true, citationUrl: "https://unselected.example.net/fabricated" });
  try {
    await assert.rejects(adapter.createInsight({ ...request, allowWebResearch: true, preferences: { voice: "clever" } }), (error) => error.code === "invalid-response");
  } finally { adapter.dispose(); }
});
