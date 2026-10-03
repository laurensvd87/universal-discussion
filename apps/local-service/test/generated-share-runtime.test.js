import assert from "node:assert/strict";
import test from "node:test";
import { createChatGPTRuntime } from "../src/ai/chatgpt-runtime.js";
import { ServiceError } from "../src/domain/errors.js";
import { buildInsightContext } from "../../../spikes/topic-resolution/browser/core/insight-context.js";
import { demoService } from "./helpers.js";

test("failed publication retains the completed receipt; successful share consumes it once", async () => {
  const service = demoService();
  const catalog = service.catalog();
  const sourceId = "reserved-example-com";
  const topicId = "reserved-domain-demo";
  const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
    related: service.related(sourceId, 5), sourceId, topicId });
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, pending: false }), dispose() {} },
    insightsAdapter: { createInsight: async () => ({ body: "A generated opening.", citations: [], model: "synthetic" }),
      cancel() {}, dispose() {} } });
  const actorId = "demo-alex";
  const operationId = "one-use-share";
  ai.create({ operationId, model: "synthetic", context, articleText: "Public synthetic text.",
    allowWebResearch: false, expected: catalog.version }, actorId);
  await Promise.resolve(); await Promise.resolve();
  const command = { type: "share-insight", operationId, topicId, body: "A generated opening.",
    originSourceId: sourceId };
  const value = { expected: catalog.version, command };
  assert.throws(() => ai.share(value, actorId, () => { throw new ServiceError("conflict", "Synthetic CAS failure"); }),
    (error) => error instanceof ServiceError && error.code === "conflict");
  assert.equal(ai.result({ operationId }, actorId).state, "completed");
  const outcome = ai.share(value, actorId, (proof) => service.command(value.expected, command, actorId, proof));
  assert.ok(outcome.result.contributionId);
  assert.throws(() => ai.share(value, actorId, (proof) => service.command(value.expected, command, actorId, proof)),
    (error) => error instanceof ServiceError && error.code === "not-found");
  ai.dispose();
});
