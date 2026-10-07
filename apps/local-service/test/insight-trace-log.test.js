import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createInsightTraceLog } from "../src/ai/insight-trace-log.js";

const EVENTS = ["response.created", "response.in_progress", "response.output_item.added",
  "response.output_item.done", "response.output_text.delta", "response.output_text.done",
  "response.content_part.added", "response.content_part.done", "response.web_search_call.in_progress",
  "response.web_search_call.searching", "response.web_search_call.completed",
  "response.refusal.delta", "response.refusal.done", "response.completed",
  "response.failed", "response.incomplete", "error"];
function trace() {
  return { schema: "insight-response-trace/v1", outcome: "failure", detail: "response-item-prefix",
    events: { sequence: ["response.created", "response.completed"],
      counts: Object.fromEntries(EVENTS.map((event) => [event, event === "response.completed" ? 1 : 0])),
      otherCount: 0 }, createdCount: 1, createdFinalMatch: true, finalStatus: "completed",
    observedItems: [{ phase: "done", index: 0, type: "message", status: "completed" }],
    finalOutput: [], finalOutputCount: 0, candidateCount: 1, candidateIndex: 0,
    textDoneCount: 0, contentDoneCount: 0, fallbackFailure: "response-item-prefix", fallbackBranch: "length" };
}
function withTemp(run) {
  const tempDirectory = mkdtempSync(path.join(tmpdir(), "insight-log-test-"));
  try { return run(tempDirectory); }
  finally { rmSync(tempDirectory, { recursive: true, force: true }); }
}

test("fixed temp path stores only a validated structural line", () => withTemp((tempDirectory) => {
  const log = createInsightTraceLog({ tempDirectory });
  assert.equal(log.filePath, path.join(tempDirectory, "universal-discussion-insight-trace", "insight-trace.log"));
  assert.equal(log.write(trace()), true);
  const raw = readFileSync(log.filePath, "utf8");
  assert.equal(raw, `INSIGHT_TRACE ${JSON.stringify(trace())}\n`);
  assert.equal(statSync(log.filePath).isFile(), true);
}));

test("accepts only fixed web research rejection details", () => withTemp((tempDirectory) => {
  const log = createInsightTraceLog({ tempDirectory });
  for (const detail of ["response-web-citation", "response-web-evidence", "response-unsafe-url"]) {
    assert.equal(log.write({ ...trace(), detail, fallbackFailure: detail }), true);
  }
  const raw = readFileSync(log.filePath, "utf8");
  assert.equal(raw.split("\n").filter(Boolean).length, 3);
  assert.equal(raw.includes("https://"), false);
}));

test("rejects unknown fields and free strings before writing", () => withTemp((tempDirectory) => {
  const log = createInsightTraceLog({ tempDirectory });
  const secret = "SECRET_PAGE_TEXT_TOKEN_ID_URL";
  for (const changed of [
    { ...trace(), pageText: secret },
    { ...trace(), detail: secret },
    { ...trace(), events: { ...trace().events, sequence: [secret] } },
    { ...trace(), observedItems: [{ ...trace().observedItems[0], id: secret }] },
    { ...trace(), observedItems: [{ ...trace().observedItems[0], type: secret }] },
  ]) assert.equal(log.write(changed), false);
  assert.equal(readFileSync(log.filePath, "utf8"), "");
}));

test("keeps one fixed file below the size cap", () => withTemp((tempDirectory) => {
  const log = createInsightTraceLog({ tempDirectory });
  for (let i = 0; i < 100; i += 1) assert.equal(log.write(trace()), true);
  const raw = readFileSync(log.filePath, "utf8");
  assert.ok(Buffer.byteLength(raw) <= 65_536);
  assert.ok(raw.startsWith("INSIGHT_TRACE "));
  assert.ok(raw.endsWith("\n"));
  for (const line of raw.trimEnd().split("\n")) assert.equal(JSON.parse(line.slice("INSIGHT_TRACE ".length)).schema,
    "insight-response-trace/v1");
}));

test("rejects a linked log file without touching its target", { skip: process.platform === "win32" }, () => withTemp((tempDirectory) => {
  const log = createInsightTraceLog({ tempDirectory });
  const target = path.join(tempDirectory, "target.txt");
  writeFileSync(target, "untouched");
  rmSync(log.filePath);
  symlinkSync(target, log.filePath);
  assert.throws(() => log.write(trace()));
  assert.equal(readFileSync(target, "utf8"), "untouched");
}));
