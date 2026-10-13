import assert from "node:assert/strict";
import test from "node:test";
import { createReadOnlyServiceRetry } from "../browser/core/read-only-service-retry.js";

test("only transient local read failures retry with a bounded delay", async () => {
  const pending = new Map();
  const delays = [];
  let next = 0, opens = 0;
  const retry = createReadOnlyServiceRetry({ open: () => { opens++; },
    schedule(callback, delay) { const key = ++next; pending.set(key, callback); delays.push(delay); return key; },
    cancelSchedule(key) { pending.delete(key); } });
  retry.observe({ phase: "disconnected", error: "unauthorized" });
  retry.observe({ phase: "error", error: "capacity" });
  assert.equal(pending.size, 0);
  retry.observe({ phase: "error", error: "unavailable" });
  retry.observe({ phase: "error", error: "unavailable" });
  assert.deepEqual(delays, [1000]);
  pending.get(1)(); pending.delete(1); await Promise.resolve();
  assert.equal(opens, 1);
  retry.observe({ phase: "error", error: "unavailable" });
  assert.deepEqual(delays, [1000, 2000]);
  retry.observe({ phase: "ready" });
  assert.equal(pending.size, 0);
  retry.observe({ phase: "error", error: "unavailable" });
  assert.deepEqual(delays, [1000, 2000, 1000]);
  retry.dispose();
  assert.equal(pending.size, 0);
});

test("only explicitly marked public capacity/conflict reads retry, with at most eight attempts per page", async () => {
  const pending = new Map(); let serial = 0, opens = 0;
  const retry = createReadOnlyServiceRetry({ open: () => { opens++; },
    schedule(callback) { pending.set(++serial, callback); return serial; }, cancelSchedule(timer) { pending.delete(timer); } });
  const resolution = { currentTabId: 7, currentWindowId: 41, currentUrl: "https://example.com/", documentId: "document-a",
    sessionRevision: "session-one", enabled: true };
  const state = { phase: "error", error: "capacity", readRetryable: true, resolution };
  retry.observe({ ...state, readRetryable: false });
  assert.equal(pending.size, 0);
  for (let attempt = 0; attempt < 8; attempt++) {
    retry.observe({ ...state, error: attempt % 2 ? "conflict" : "capacity" });
    const [key, callback] = [...pending][0]; pending.delete(key); callback(); await Promise.resolve();
    // An intermediate fast core catalog is not a successful selected-page read.
    retry.observe({ ...state, phase: "choose-topic", error: null });
  }
  retry.observe(state);
  assert.equal(opens, 8);
  assert.equal(pending.size, 0);
  retry.observe({ ...state, resolution: { ...resolution, currentTabId: 8 } });
  assert.equal(pending.size, 1);
  retry.observe({ ...state, phase: "choose-topic", error: "context-changed" });
  assert.equal(pending.size, 0);
  retry.dispose();
});
