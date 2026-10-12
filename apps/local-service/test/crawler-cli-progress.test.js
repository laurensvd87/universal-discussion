import assert from "node:assert/strict";
import test from "node:test";
import { argumentsFrom, createProgressReporter } from "../src/ops/crawl-cli.js";

test("CLI defaults continue without automatic campaign, host, section, depth or time caps", () => {
  assert.deepEqual(argumentsFrom(["--token-stdin", "--apply"]), {
    apply: true, rebase: false, tokenStdin: true, maxPages: 0, maxDepth: -1,
    perHost: 0, perSection: 0, maxDurationMs: 0,
  });
  const capped = argumentsFrom(["--token-stdin", "--max-pages", "700", "--max-depth", "0", "--per-host", "300", "--per-section", "50"]);
  assert.equal(capped.maxPages, 700);
  assert.equal(capped.maxDepth, 0);
  assert.equal(capped.perHost, 300);
  assert.equal(capped.perSection, 50);
  assert.throws(() => argumentsFrom(["--token-stdin", "--max-pages", "-1"]), /invalid-arguments/u);
  assert.throws(() => argumentsFrom(["--token-stdin", "--max-depth", "-2"]), /invalid-arguments/u);
});

test("CLI progress reports bounded fixed codes and numeric aggregates, cleans up heartbeat", () => {
  const lines = [];
  let heartbeat, canceled = 0;
  const reporter = createProgressReporter({ write: value => lines.push(value),
    schedule(callback, delay) { heartbeat = callback; assert.equal(delay, 15_000); return 7; },
    cancel(timer) { assert.equal(timer, 7); canceled++; } });
  const event = { event: "phase", phase: "connecting", attemptedThisRun: 0, stagedThisRun: 0, ingestedThisRun: 0 };
  reporter.onProgress({ ...event, url: "SECRET_URL", title: "SECRET_TITLE", token: "SECRET_TOKEN" });
  for (let index = 1; index < 25; index++) reporter.onProgress({ ...event, event: "page", phase: "crawling", attemptedThisRun: index });
  assert.equal(lines.length, 1);
  heartbeat();
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^Crawler crawling: attempted=24 staged=0 ingested=0\n$/u);
  reporter.onProgress({ ...event, phase: "SECRET_PHASE" });
  reporter.onProgress({ ...event, attemptedThisRun: "SECRET_COUNT" });
  reporter.onProgress({ ...event, event: "SECRET_EVENT" });
  heartbeat();
  assert.equal(lines.join("").includes("SECRET"), false);
  reporter.close(); reporter.close(); heartbeat(); reporter.onProgress(event);
  assert.equal(canceled, 1);
  assert.equal(lines.length, 3);
});

test("CLI progress output failure does not throw or keep a closed timer active", () => {
  let heartbeat;
  const reporter = createProgressReporter({ write() { throw new Error("stdout closed"); },
    schedule(callback) { heartbeat = callback; return 1; }, cancel() {} });
  assert.doesNotThrow(() => reporter.onProgress({ event: "checkpoint", phase: "applying",
    attemptedThisRun: 25, stagedThisRun: 25, ingestedThisRun: 0 }));
  assert.doesNotThrow(() => heartbeat());
  reporter.close();
});
