import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, linkSync, unlinkSync, mkdirSync, renameSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createVoiceRequestTraceLog } from "../src/ai/voice-request-trace-log.js";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";

const PREFIX = "INSIGHT_REQUEST_TRACE ";
const trace = at => ({ schema: "insight-request-trace/v1", voice: "skeptic", instructionFingerprint: "a".repeat(64), at });
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "voice-request-trust-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, sink: createVoiceRequestTraceLog({ tempDirectory: directory }) };
}
const records = file => readFileSync(file, "utf8").trimEnd().split("\n").filter(Boolean)
  .map(line => { assert.ok(line.startsWith(PREFIX)); return JSON.parse(line.slice(PREFIX.length)); });
const request = voice => ({ model: "synthetic", allowWebResearch: false, preferences: { voice },
  articleText: "PAGE_CONTENT_MUST_NEVER_BE_IN_TRACE", context: {
    schema: "insight-context/v1", topic: { id: "topic", title: "TOPIC_SECRET" },
    currentSource: { id: "source", url: "https://example.org/synthetic", title: "SOURCE_SECRET" },
    sameTopicSources: [], relatedSources: [], discussion: [],
    coverage: { sameTopicTotal: 0, relatedTotal: 0, discussionIncluded: false },
    limitations: ["grouping-provisional", "sources-unverified"],
  } });

test("Trust: composed trace records the exact failed public fetch attempt, never private work or request contents", async t => {
  const { sink } = fixture(t); let posts = 0, serialized;
  const adapter = createChatGptInsights({ now: () => 123456, getAccessToken: async () => "synthetic-token-only-for-test",
    onRequestTrace: sink.write, fetchImpl: async (url, options) => {
      if (url.endsWith("/models")) return new Response(JSON.stringify({ models: [{ slug: "synthetic", display_name: "Synthetic", visibility: "list" }] }),
        { headers: { "content-type": "application/json" } });
      posts++; serialized = options.body; throw new Error("PROVIDER_FAILURE_SECRET");
    } });
  t.after(() => adapter.dispose());
  await adapter.listModels(); assert.equal(readFileSync(sink.filePath, "utf8"), "");
  await assert.rejects(adapter.createInsight(request("sarcastic")), error => error.code === "provider-unavailable");
  const expected = { schema: "insight-request-trace/v1", voice: "sarcastic", at: 123456,
    instructionFingerprint: createHash("sha256").update(JSON.parse(serialized).instructions, "utf8").digest("hex") };
  assert.deepEqual(records(sink.filePath), [expected]);
  const before = readFileSync(sink.filePath);
  await assert.rejects(adapter.createInsight(request("funny"), { suppressDebug: true }), error => error.code === "provider-unavailable");
  assert.equal(posts, 2); assert.deepEqual(readFileSync(sink.filePath), before);
  assert.doesNotMatch(before.toString("utf8"), /SECRET|example\.org|instructions|token|PAGE_CONTENT/u);
});

test("Trust: exact trace DTO rejects behavior, inherited fields and private aliases without executing them or changing the file", t => {
  const { sink } = fixture(t); assert.equal(sink.write(trace(1)), true); const before = readFileSync(sink.filePath);
  const getter = { ...trace(2) }; Object.defineProperty(getter, "voice", { enumerable: true, get() { assert.fail("Getter executed"); } });
  const proxy = new Proxy(trace(2), { ownKeys() { assert.fail("Proxy executed"); }, getPrototypeOf() { assert.fail("Proxy executed"); } });
  const hidden = { ...trace(2) }; Object.defineProperty(hidden, "body", { value: "PRIVATE_BODY", enumerable: false });
  const inherited = Object.create(trace(2));
  for (const value of [getter, proxy, hidden, inherited, { ...trace(2), body: "PRIVATE_BODY" },
    { ...trace(2), [Symbol("secret")]: "PRIVATE_BODY" }, { ...trace(2), at: NaN },
    { ...trace(2), voice: "skeptic\nPRIVATE_BODY" }, { ...trace(2), instructionFingerprint: "a".repeat(63) },
    { ...trace(2), toJSON() { assert.fail("Serialization behavior executed"); } }]) {
    assert.equal(sink.write(value), false); assert.deepEqual(readFileSync(sink.filePath), before);
  }
});

test("Trust: newest bounded retention drops malformed, extra-field and incomplete old records", t => {
  const { sink } = fixture(t);
  const valid = Array.from({ length: 500 }, (_, index) => `${PREFIX}${JSON.stringify(trace(index))}\n`).join("");
  writeFileSync(sink.filePath, `PRIVATE_PREFIX\n${valid}${PREFIX}${JSON.stringify({ ...trace(501), body: "PRIVATE_BODY" })}\n${PREFIX}{\"body\":\"PARTIAL_SECRET`);
  assert.equal(sink.write(trace(1000)), true);
  const content = readFileSync(sink.filePath);
  assert.ok(content.length <= 65536); assert.doesNotMatch(content.toString("utf8"), /PRIVATE|PARTIAL/u);
  const kept = records(sink.filePath); assert.ok(kept.length > 100); assert.deepEqual(kept.at(-1), trace(1000));
  assert.deepEqual(kept.slice(0, -1).map(record => record.at), Array.from({ length: kept.length - 1 }, (_, index) => 501 - kept.length + index));
});

test("Trust: replacing a validated sink with a hardlink refuses writes and preserves both targets", t => {
  const { sink, directory } = fixture(t); const victim = path.join(directory, "synthetic-victim.log");
  writeFileSync(victim, "SYNTHETIC_VICTIM"); unlinkSync(sink.filePath); linkSync(victim, sink.filePath);
  assert.equal(sink.write(trace(1)), false); assert.equal(readFileSync(victim, "utf8"), "SYNTHETIC_VICTIM");
  assert.equal(readFileSync(sink.filePath, "utf8"), "SYNTHETIC_VICTIM");
});

test("Trust: a redirected directory introduced after construction cannot redirect a trace write", t => {
  const { sink, directory } = fixture(t); const logDirectory = path.dirname(sink.filePath);
  const victimDirectory = path.join(directory, "synthetic-victim"); mkdirSync(victimDirectory);
  const victim = path.join(victimDirectory, path.basename(sink.filePath)); writeFileSync(victim, "SYNTHETIC_VICTIM");
  renameSync(logDirectory, `${logDirectory}-original`);
  symlinkSync(victimDirectory, logDirectory, process.platform === "win32" ? "junction" : "dir");
  assert.equal(sink.write(trace(1)), false); assert.equal(readFileSync(victim, "utf8"), "SYNTHETIC_VICTIM");
});
