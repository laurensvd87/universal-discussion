import assert from "node:assert/strict";
import test from "node:test";
import { createRequestHandler } from "../src/http/request-handler.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { deterministicDependencies } from "./helpers.js";

const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`, capability: "synthetic-pairing" };
const reads = [
  ["GET", "/v1/catalog", null, "catalog"],
  ["POST", "/v1/catalog/context", { sourceId: null, topicId: null }, "catalogContext"],
  ["POST", "/v1/catalog/page", { kind: "sources", limit: 1, cursor: null }, "catalogPage"],
  ["POST", "/v1/discussions/page", {}, "discussionPage"],
  ["GET", "/v1/topics/topic-1/discussion", null, "discussion"],
  ["GET", "/v1/sources/source-1/alternate-discussion", null, "alternateDiscussion"],
  ["GET", "/v1/sources/source-1/prior-discussions", null, "priorDiscussions"],
  ["POST", "/v1/related", { sourceId: "source-1", limit: 20 }, "related"],
];
for (const [method, url, input, name] of reads) {
  for (const invalidation of ["none", "pairing", "transport", "abort"]) {
    test(`public ${name} awaits isolated read and renews delivery authority: ${invalidation}`, async () => {
      let release, paired = true, current = true, called = false;
      const controller = new AbortController();
      const handle = createRequestHandler({ config, pairingVerifier: { verify: () => paired },
        service: { readPublic(selected, value, guards) {
          assert.equal(selected, name); assert.equal(guards.signal, controller.signal);
          called = true;
          return new Promise(resolve => { release = () => resolve({ synthetic: true }); });
        } } });
      const pending = handle({ method, url, body: input === null ? null : JSON.stringify(input), headers: {
        host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`,
        ...(input === null ? {} : { "content-type": "application/json" }),
      } }, { signal: controller.signal, isCurrent: () => current });
      assert.equal(called, true);
      if (invalidation === "pairing") paired = false;
      if (invalidation === "transport") current = false;
      if (invalidation === "abort") controller.abort();
      release();
      const result = await pending;
      assert.equal(result.status, invalidation === "none" ? 200 : invalidation === "pairing" ? 401 : 503);
      if (invalidation !== "none") assert.equal(result.body.includes("synthetic"), false);
    });
  }
}

test("isolated read cannot deliver a superseded canonical revision", async () => {
  const dependencies = deterministicDependencies();
  const initial = createDemoState({ generation: "read-generation", createdAt: dependencies.now(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createMemoryRepository(initial);
  let release;
  const service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, ...dependencies,
    readExecutor: { read() { return new Promise(resolve => { release = () => resolve({ version: service.version(), roots: [] }); }); } } });
  const pending = service.readPublic("discussion", initial.topics[0].id);
  service.command(service.version(), { type: "create-root", topicId: initial.topics[0].id,
    body: "Concurrent synthetic comment" }, "demo-alex");
  release();
  await assert.rejects(pending, error => error.code === "conflict");
});
