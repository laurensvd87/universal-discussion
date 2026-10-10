import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRawInsightDebugLog } from "../src/ai/raw-insight-debug-log.js";

function withTemp(run) {
  const tempDirectory = mkdtempSync(path.join(tmpdir(), "insight-raw-test-"));
  try { return run(tempDirectory); }
  finally { rmSync(tempDirectory, { recursive: true, force: true }); }
}

function request(article = "Actual page text") {
  return { phase: "request", payload: { model: "test", store: false, stream: true,
    instructions: "Research", input: [{ role: "user", content: article }], tools: [] } };
}
function response(body = "data: final answer") {
  return { phase: "response", status: 200, contentType: "text/event-stream", body };
}

test("disabled by default and captures the exact request payload and raw response", () => withTemp((tempDirectory) => {
  const disabled = createRawInsightDebugLog({ tempDirectory });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.filePath, null);
  assert.equal(disabled.capture(request()), false);
  const log = createRawInsightDebugLog({ enabled: true, tempDirectory });
  assert.equal(log.enabled, true);
  assert.equal(log.capture(request("Visible article prefix")), true);
  assert.equal(log.capture(response("data: {\"type\":\"response.completed\"}\n\n")), true);
  const lines = readFileSync(log.filePath, "utf8").trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(lines, [
    { kind: "request", payload: JSON.stringify(request("Visible article prefix").payload) },
    { kind: "response", status: 200, contentType: "text/event-stream",
      body: "data: {\"type\":\"response.completed\"}\n\n" },
  ]);
  assert.ok(!readFileSync(log.filePath, "utf8").includes("Authorization"));
  if (process.getuid) assert.equal(statSync(log.filePath).mode & 0o077, 0);
}));

test("rejects auth and arbitrary header fields without writing them", () => withTemp((tempDirectory) => {
  const log = createRawInsightDebugLog({ enabled: true, tempDirectory });
  assert.equal(log.captureRequest({ ...request(), Authorization: "Bearer secret" }), false);
  assert.equal(log.captureRequest({ ...request(), payload: { ...request().payload,
    input: [{ role: "user", content: "page", refresh_token: "secret" }] } }), false);
  assert.equal(log.captureResponse({ ...response(), headers: { Cookie: "secret" } }), false);
  assert.equal(readFileSync(log.filePath, "utf8"), "");
}));

test("explicit debug accepts only the two supported tool choices without credentials", () => withTemp((tempDirectory) => {
  const log = createRawInsightDebugLog({ enabled: true, tempDirectory });
  for (const tool_choice of ["auto", "required"]) {
    const payload = { ...request("Public reply context").payload,
      tools: [{ type: "web_search", external_web_access: true, search_context_size: "medium" }],
      tool_choice };
    assert.equal(log.captureRequest({ phase: "request", payload }), true);
    assert.equal(log.captureResponse(response()), true);
  }
  assert.equal(log.captureRequest({ phase: "request", payload: {
    ...request().payload, tool_choice: "none" } }), false);
  assert.equal(log.captureRequest({ phase: "request", payload: {
    ...request().payload, tool_choice: "auto", Authorization: "Bearer secret" } }), false);
  const contents = readFileSync(log.filePath, "utf8");
  assert.equal(contents.includes("Bearer secret"), false);
  assert.equal(contents.split("\n").filter(Boolean).length, 4);
}));

test("keeps at most three requests across restarts and one MiB total", () => withTemp((tempDirectory) => {
  let log = createRawInsightDebugLog({ enabled: true, tempDirectory });
  for (let i = 0; i < 2; i += 1) {
    assert.equal(log.capture(request()), true);
    assert.equal(log.capture(response()), true);
  }
  log = createRawInsightDebugLog({ enabled: true, tempDirectory });
  assert.equal(log.capture(request()), true);
  assert.equal(log.capture(response("x".repeat(1_048_576))), false);
  assert.equal(log.capture(response()), true);
  assert.equal(log.capture(request()), false);
  assert.ok(statSync(log.filePath).size < 1_048_576);
  assert.equal(createRawInsightDebugLog({ enabled: true, tempDirectory }).enabled, false);
}));

test("rejects symlinked file and leaves target untouched", { skip: process.platform === "win32" }, () => withTemp((tempDirectory) => {
  const log = createRawInsightDebugLog({ enabled: true, tempDirectory });
  const target = path.join(tempDirectory, "target.txt");
  writeFileSync(target, "untouched");
  rmSync(log.filePath);
  symlinkSync(target, log.filePath);
  assert.equal(log.capture(request()), false);
  assert.equal(readFileSync(target, "utf8"), "untouched");
}));
