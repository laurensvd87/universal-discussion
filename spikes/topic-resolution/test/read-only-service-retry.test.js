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
