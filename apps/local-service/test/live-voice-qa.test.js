import assert from "node:assert/strict";
import test from "node:test";
import { boundedVoiceFetch, runLiveVoiceQa, voiceQaContext, VOICE_QA_TEXT } from "../harness/run-live-voice-qa.js";

test("synthetic voice QA requires an explicit invocation before any I/O", async () => {
  for (const args of [[], ["--run-live", "--show-result"], ["--run-live", "--with-web-search"]]) {
    await assert.rejects(runLiveVoiceQa(args), /Explicit --run-live/);
  }
  assert.ok(VOICE_QA_TEXT.includes("Invented product"));
  assert.deepEqual(voiceQaContext().relatedSources, []);
  assert.deepEqual(voiceQaContext().sameTopicSources, []);
});
test("synthetic voice QA caps attempts at two and forbids tools/endpoints", async () => {
  let sent = 0;
  const guarded = boundedVoiceFetch(async () => { sent++; return {}; });
  const packet = { method: "POST", body: JSON.stringify({ tools: [], tool_choice: "none" }) };
  assert.throws(() => guarded.fetch("https://api.openai.com/v1/responses", { ...packet,
    body: JSON.stringify({ tools: [{ type: "web_search" }] }) }), /Research forbidden/);
  assert.throws(() => guarded.fetch("https://unknown.public.org/v1/responses", packet), /Unexpected/);
  assert.throws(() => guarded.fetch("https://api.openai.com/v1/responses?debug=yes", packet), /Unexpected/);
  await guarded.fetch("https://api.openai.com/v1/responses", packet);
  await guarded.fetch("https://api.openai.com/v1/responses", packet);
  assert.throws(() => guarded.fetch("https://api.openai.com/v1/responses", packet), /Two response/);
  assert.equal(guarded.responsesSent(), 2); assert.equal(sent, 2);
});
