import assert from "node:assert/strict";
import test from "node:test";
import { createBackgroundMatcher } from "../browser/core/background-matcher.js";
import { createInferenceHost } from "../browser/chromium/inference-host.js";

const url = "https://example.com/article";
const origin = "https://example.com";
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((done) => setImmediate(done));
function fixture(overrides = {}) {
  const calls = [];
  const state = { enabled: true, sessionWindowId: 1, blockedOrigins: [], tab: { tabId: 1, windowId: 1, url }, paired: true, permitted: true };
  const capture = { documentId: "document-a", result: { status: "collected", url, title: "Synthetic article",
    text: "Project-created bounded article text.", extractorVersion: "main-text-prefix/v1" } };
  const result = { sourceId: "source-a", topicId: "topic-a", assignment: "provisional" };
  const dependencies = {
    getPreferences: async () => ({ enabled: state.enabled, sessionWindowId: state.sessionWindowId, blockedOrigins: [...state.blockedOrigins] }),
    readForeground: async () => state.tab, hasPermission: async () => state.permitted,
    isPaired: async () => state.paired,
    reader: { read: async () => { calls.push("read"); return capture; }, attest: async () => ({ status: "attested", url }) },
    embed: async () => { calls.push("embed"); return { modelId: "browser", values: [1] }; },
    client: { catalog: async () => ({ version: { generation: "g", revision: 4 } }),
      ingest: async (payload) => { calls.push(payload); return result; } },
    nextOperationId: () => "operation-a", ...overrides,
  };
  const matcher = createBackgroundMatcher(dependencies);
  return { matcher, state, calls, dependencies };
}
test("background matching sends only explicit fields and resolves delayed Topic", async () => {
  const { matcher, calls } = fixture();
  await matcher.refresh();
  assert.equal(matcher.currentState().phase, "ready");
  assert.equal(matcher.currentState().topicId, "topic-a");
  const payload = calls[2];
  assert.deepEqual(Object.keys(payload).sort(), ["embedding", "expected", "extractorVersion", "operationId", "title", "url"]);
  assert.deepEqual(payload.expected, { generation: "g", revision: 4 });
  assert.ok(!JSON.stringify(matcher.currentState()).includes("bounded article text"));
  assert.ok(!JSON.stringify(payload).includes("bounded article text"));
});
test("fallback capture provenance reaches ingestion but raw sample never does", async () => {
  const base = fixture();
  const original = base.dependencies.reader.read;
  base.dependencies.reader.read = async () => {
    const capture = await original();
    capture.result.extractorVersion = "article-container-prefix/v1";
    return capture;
  };
  await base.matcher.refresh();
  const payload = base.calls[2];
  assert.equal(payload.extractorVersion, "article-container-prefix/v1");
  assert.deepEqual(Object.keys(payload).sort(), ["embedding", "expected", "extractorVersion", "operationId", "title", "url"]);
  assert.equal(base.matcher.currentState().phase, "ready");
});

for (const [label, setup, phase] of [
  ["off", s => { s.enabled = false; }, "off"],
  ["site blocked", s => { s.blockedOrigins = [origin]; }, "not-enabled"],
  ["different window", s => { s.tab.windowId = 2; }, "not-enabled"],
  ["no lease", s => { s.sessionWindowId = null; }, "not-enabled"],
  ["permission removed", s => { s.permitted = false; }, "not-enabled"],
  ["unpaired", s => { s.paired = false; }, "unpaired"],
  ["no focused page", s => { s.tab = null; }, "unsupported"],
  ["sensitive query", s => { s.tab.url += "?token=private"; }, "unsupported"],
]) test(`no extraction while ${label}`, async () => {
  const { matcher, state, calls } = fixture(); setup(state); await matcher.refresh();
  assert.equal(matcher.currentState().phase, phase); assert.deepEqual(calls, []);
});
for (const label of ["navigate", "pause", "permission", "close", "invalidate", "other-window", "block"]) {
  test(`${label} during inference never ingests or renders stale output`, async () => {
    const pending = deferred();
    const { matcher, state, calls } = fixture({ embed: () => pending.promise });
    const work = matcher.refresh(); await tick();
    assert.equal(matcher.currentState().phase, "processing");
    if (label === "navigate") state.tab = { tabId: 1, url: "https://example.org/other" };
    if (label === "pause") state.enabled = false;
    if (label === "permission") state.permitted = false;
    if (label === "close") state.tab = null;
    if (label === "invalidate") matcher.invalidate();
    if (label === "other-window") state.tab = { ...state.tab, windowId: 2 };
    if (label === "block") state.blockedOrigins = [origin];
    pending.resolve({ modelId: "browser", values: [1] }); await work;
    assert.deepEqual(calls, ["read"]); assert.notEqual(matcher.currentState().phase, "ready");
  });
}
test("document attestation rejects same-URL replacement before ingestion", async () => {
  const base = fixture();
  base.dependencies.reader.attest = async () => ({ status: "unsupported", reason: "document-mismatch" });
  await base.matcher.refresh();
  assert.equal(base.matcher.currentState().phase, "unsupported");
  assert.deepEqual(base.calls, ["read", "embed"]);
});

test("failed post-read foreground check leaves a bounded unavailable state without rereading", async () => {
  const h = fixture();
  h.dependencies.reader.read = async () => {
    h.calls.push("read"); h.state.tab = null;
    return { documentId: "document-a", result: { status: "collected", title: "Synthetic", text: "Synthetic bounded text", extractorVersion: "main-text-prefix/v1" } };
  };
  await h.matcher.refresh();
  assert.equal(h.matcher.currentState().phase, "not-enabled");
  assert.deepEqual(h.calls, ["read"]);
});

test("missing foreground has a precise reason before any page read", async () => {
  const { matcher, state, calls } = fixture();
  state.tab = null;
  await matcher.refresh();
  assert.equal(matcher.currentState().phase, "unsupported");
  assert.equal(matcher.currentState().reason, "no-focused-page");
  assert.equal(matcher.currentState().tabId, null);
  assert.equal(matcher.currentState().url, null);
  assert.deepEqual(calls, []);
});
test("stale backend response cannot appear after invalidation", async () => {
  const pending = deferred(); const base = fixture();
  base.dependencies.client.ingest = () => pending.promise;
  const work = base.matcher.refresh(); await tick(); base.matcher.invalidate();
  pending.resolve({ sourceId: "late-source", topicId: "late-topic", assignment: "provisional" }); await work;
  assert.equal(base.matcher.currentState().topicId, null);
});
test("a conflicting ingestion is not retried or reported as a match", async () => {
  let count = 0; const base = fixture();
  base.dependencies.client.ingest = async () => { count++; throw { code: "conflict" }; };
  await base.matcher.refresh();
  assert.equal(count, 1); assert.equal(base.matcher.currentState().reason, "conflict");
  assert.equal(base.matcher.currentState().topicId, null);
});
test("offscreen host reuses packaged document and closes it on abort", async () => {
  let exists = false; let closed = 0; const message = deferred();
  const host = createInferenceHost({ runtime: { getURL: x => `chrome-extension://test/${x}`,
    getContexts: async () => exists ? [{}] : [], sendMessage: () => message.promise },
    offscreen: { createDocument: async ({ url, reasons }) => { assert.equal(url, "embedding/offscreen.html"); assert.deepEqual(reasons, ["WORKERS"]); exists = true; },
      closeDocument: async () => { closed++; exists = false; } } });
  const controller = new AbortController();
  const work = host.embed("Synthetic local sample", { signal: controller.signal });
  await tick(); controller.abort();
  await assert.rejects(work, /cancelled/u);
  await tick();
  assert.equal(closed, 1); assert.equal(exists, false);
});
test("offscreen creation cannot retain a queue of raw text and abort covers initialization", async () => {
  const creation = deferred(); let created = false; let closes = 0;
  const host = createInferenceHost({ runtime: { getURL: x => `chrome-extension://test/${x}`,
    getContexts: async () => created ? [{}] : [], sendMessage: async () => { throw new Error("must not run"); } },
    offscreen: { createDocument: async () => { await creation.promise; created = true; },
      closeDocument: async () => { created = false; closes++; } } });
  const controller = new AbortController(); const work = host.embed("First synthetic sample", { signal: controller.signal });
  await tick();
  await assert.rejects(host.embed("Second synthetic sample"), /cancelled/u);
  controller.abort(); await assert.rejects(work, /cancelled/u);
  creation.resolve(); await tick(); assert.equal(closes, 1);
});
test("rejected backend pairing invokes session cleanup before more capture", async () => {
  let cleared = 0; const base = fixture({ onUnauthorized: async () => { cleared++; } });
  base.dependencies.client.catalog = async () => { throw { code: "unauthorized" }; };
  await base.matcher.refresh(); assert.equal(cleared, 1); assert.deepEqual(base.calls, []);
});
