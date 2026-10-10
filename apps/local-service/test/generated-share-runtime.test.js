import assert from "node:assert/strict";
import test from "node:test";
import { createChatGPTRuntime } from "../src/ai/chatgpt-runtime.js";
import { ServiceError } from "../src/domain/errors.js";
import { buildInsightContext } from "../../../spikes/topic-resolution/browser/core/insight-context.js";
import { demoService } from "./helpers.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";

function learnedInput(service, operationId, title, angle = 0) {
  const values = Array(384).fill(0);
  values[0] = Math.cos(angle); values[1] = Math.sin(angle);
  return { expected: service.catalog().version, operationId,
    url: "https://example.com/articles/insight-anchor", title,
    embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION };
}
function privateRuntime(service, account = () => ({ clientId: "synthetic", label: "One" })) {
  return createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true, account: account() }), dispose() {} },
    insightsAdapter: { createInsight: async () => ({ body: "Synthetic finding", citations: [], model: "synthetic" }),
      cancel() {}, dispose() {} } });
}
function insightInput(service, sourceId, topicId, operationId, followupQuestionId) {
  const catalog = service.catalog();
  const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
    related: service.related(sourceId, 20), sourceId, topicId });
  return { operationId, model: "synthetic", context, articleText: "Synthetic public text",
    allowWebResearch: false, expected: catalog.version,
    ...(followupQuestionId ? { followupQuestionId } : {}) };
}

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

test("changed source representation and changed account invalidate a private result", async () => {
  const service = demoService();
  const learned = service.ingest(learnedInput(service, "first-capture", "First title"));
  let account = { clientId: "synthetic", label: "One" };
  const ai = privateRuntime(service, () => account);
  const first = insightInput(service, learned.sourceId, learned.topicId, "changed-source");
  ai.create(first, "demo-alex");
  await Promise.resolve(); await Promise.resolve();
  service.ingest(learnedInput(service, "new-title", "Changed title"));
  assert.deepEqual(ai.result({ operationId: first.operationId }, "demo-alex"),
    { operationId: first.operationId, state: "failed", error: "stale-context" });
  const second = insightInput(service, learned.sourceId, learned.topicId, "changed-account");
  ai.create(second, "demo-alex");
  await Promise.resolve(); await Promise.resolve();
  account = { clientId: "other", label: "Two" };
  assert.throws(() => ai.share({ expected: service.catalog().version, command: {
    type: "share-insight", operationId: second.operationId, topicId: learned.topicId,
    originSourceId: learned.sourceId, body: "Synthetic finding" } }, "demo-alex", () => {
    throw new Error("Must not persist");
  }), (error) => error instanceof ServiceError && error.code === "conflict");
  assert.deepEqual(ai.resumable("demo-alex"), { job: null });
  ai.dispose();
});

test("changed page vector or Topic association cannot reuse a completed Insight", async () => {
  const service = demoService();
  const learned = service.ingest(learnedInput(service, "vector-start", "Stable title"));
  service.command(service.catalog().version, { type: "correct-source",
    sourceId: learned.sourceId, topicId: learned.topicId }, "demo-alex");
  const ai = privateRuntime(service);
  const vectorJob = insightInput(service, learned.sourceId, learned.topicId, "vector-job");
  ai.create(vectorJob, "demo-alex");
  await Promise.resolve(); await Promise.resolve();
  const recaptured = service.ingest(learnedInput(service, "vector-changed", "Stable title", 0.5));
  assert.equal(recaptured.topicId, learned.topicId);
  assert.deepEqual(ai.result({ operationId: vectorJob.operationId }, "demo-alex"),
    { operationId: vectorJob.operationId, state: "failed", error: "stale-context" });
  const topicJob = insightInput(service, learned.sourceId, learned.topicId, "topic-job");
  ai.create(topicJob, "demo-alex");
  await Promise.resolve(); await Promise.resolve();
  service.command(service.catalog().version, { type: "correct-source",
    sourceId: learned.sourceId, topicId: null }, "demo-alex");
  assert.deepEqual(ai.resumable("demo-alex"), { job: null });
  assert.equal(service.discussion(learned.topicId).roots.length, 0);
  ai.dispose();
});

test("follow-up target edits invalidate the generated reply while unrelated writes preserve it", async () => {
  const service = demoService();
  const topicId = "reserved-domain-demo", sourceId = "reserved-example-com";
  const rootCommand = { type: "share-insight", operationId: "seed-root", topicId,
    originSourceId: sourceId, body: "Synthetic generated opener" };
  const proof = { kind: "generated-insight", operationId: "seed-root", actorId: "demo-alex",
    topicId, originSourceId: sourceId, body: rootCommand.body,
    rootId: null, replyToId: null, discussionId: null };
  const rootId = service.command(service.catalog().version, rootCommand, "demo-alex", proof).result.contributionId;
  const discussionId = service.discussion(topicId).discussionId;
  const questionId = service.command(service.catalog().version, { type: "reply", discussionId,
    rootId, replyToId: rootId, body: "Synthetic question" }, "demo-alex").result.contributionId;
  const ai = privateRuntime(service);
  const first = insightInput(service, sourceId, topicId, "followup-change", questionId);
  ai.create(first, "demo-alex");
  await Promise.resolve(); await Promise.resolve();
  service.command(service.catalog().version, { type: "create-root", topicId, body: "Unrelated post" }, "demo-blair");
  assert.equal(ai.result({ operationId: first.operationId }, "demo-alex").state, "completed");
  service.command(service.catalog().version, { type: "edit", contributionId: questionId,
    body: "Changed question" }, "demo-alex");
  assert.deepEqual(ai.result({ operationId: first.operationId }, "demo-alex"),
    { operationId: first.operationId, state: "failed", error: "stale-context" });
  ai.dispose();
});

test("visible human roots, other-author replies and nested agent replies are exact generated targets", async () => {
  const service = demoService();
  const topicId = "reserved-domain-demo", sourceId = "reserved-example-com";
  const rootId = service.command(service.catalog().version,
    { type: "create-root", topicId, body: "Human thread opener" }, "demo-blair").result.contributionId;
  const discussionId = service.discussion(topicId).discussionId;
  const humanId = service.command(service.catalog().version,
    { type: "reply", discussionId, rootId, replyToId: rootId, body: "Blair's question" }, "demo-blair").result.contributionId;
  const agentCommand = { type: "share-insight-reply", operationId: "seed-agent", topicId,
    discussionId, rootId, replyToId: humanId, body: "Prior generated reply" };
  const agentProof = { kind: "generated-insight", operationId: "seed-agent", actorId: "demo-alex",
    topicId, discussionId, rootId, replyToId: humanId, body: agentCommand.body, originSourceId: null };
  const agentId = service.command(service.catalog().version, agentCommand, "demo-alex", agentProof).result.contributionId;
  const sent = [];
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true,
      account: { clientId: "synthetic", label: "One" } }), dispose() {} },
    insightsAdapter: { createInsight: async (value) => { sent.push(value); return {
      body: "A fresh answer", citations: [], model: "synthetic" }; }, cancel() {}, dispose() {} } });
  for (const [index, targetId] of [rootId, humanId, agentId].entries()) {
    const input = insightInput(service, sourceId, topicId, `any-target-${index}`, targetId);
    ai.create(input, "demo-alex");
    await Promise.resolve(); await Promise.resolve();
    assert.equal(ai.result({ operationId: input.operationId }, "demo-alex").state, "completed");
    const command = { type: "share-insight-reply", operationId: input.operationId,
      topicId, discussionId, rootId, replyToId: targetId,
      originSourceId: sourceId, body: "A fresh answer" };
    const outcome = ai.share({ expected: service.catalog().version, command }, "demo-alex",
      (proof) => service.command(service.catalog().version, command, "demo-alex", proof));
    assert.equal(service.discussion(topicId).roots.find((entry) => entry.id === rootId)
      .replies.find((entry) => entry.id === outcome.result.contributionId).replyToId, targetId);
    assert.throws(() => ai.share({ expected: service.catalog().version, command }, "demo-alex", () => {}),
      (error) => error instanceof ServiceError && error.code === "not-found");
  }
  assert.deepEqual(sent.map((item) => item.followup), [
    { parentBody: "Human thread opener", questionBody: "Human thread opener" },
    { parentBody: "Human thread opener", questionBody: "Blair's question" },
    { parentBody: "Human thread opener", questionBody: "Prior generated reply" },
  ]);
  ai.dispose();
});

test("long selected prose is capped for the provider and an edit beyond that cap invalidates sharing", async () => {
  const service = demoService();
  const topicId = "reserved-domain-demo", sourceId = "reserved-example-com";
  const rootId = service.command(service.catalog().version,
    { type: "create-root", topicId, body: "R".repeat(2_100) }, "demo-blair").result.contributionId;
  const discussionId = service.discussion(topicId).discussionId;
  const targetId = service.command(service.catalog().version,
    { type: "reply", discussionId, rootId, replyToId: rootId, body: "Q".repeat(2_100) }, "demo-blair").result.contributionId;
  let sent;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true,
      account: { clientId: "synthetic", label: "One" } }), dispose() {} },
    insightsAdapter: { createInsight: async (value) => { sent = value; return {
      body: "A fresh answer", citations: [], model: "synthetic" }; }, cancel() {}, dispose() {} } });
  const input = insightInput(service, sourceId, topicId, "late-tail-edit", targetId);
  ai.create(input, "demo-alex");
  await Promise.resolve(); await Promise.resolve();
  assert.equal(sent.followup.parentBody, "R".repeat(2_000));
  assert.equal(sent.followup.questionBody, "Q".repeat(2_000));
  service.command(service.catalog().version,
    { type: "edit", contributionId: targetId, body: "Q".repeat(2_099) + "X" }, "demo-blair");
  assert.deepEqual(ai.result({ operationId: input.operationId }, "demo-alex"),
    { operationId: input.operationId, state: "failed", error: "stale-context" });
  ai.dispose();
});

test("foreign and withdrawn targets cannot start or complete a generated reply", async () => {
  const service = demoService();
  const topicId = "reserved-domain-demo", sourceId = "reserved-example-com";
  const rootId = service.command(service.catalog().version,
    { type: "create-root", topicId, body: "Current thread" }, "demo-blair").result.contributionId;
  const foreignId = service.command(service.catalog().version,
    { type: "create-root", topicId: "harbor-s2", body: "Foreign thread" }, "demo-blair").result.contributionId;
  let calls = 0;
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true,
      account: { clientId: "synthetic", label: "One" } }), dispose() {} },
    insightsAdapter: { createInsight: async () => { calls += 1; return {
      body: "A fresh answer", citations: [], model: "synthetic" }; }, cancel() {}, dispose() {} } });
  assert.throws(() => ai.create(insightInput(service, sourceId, topicId, "foreign-target", foreignId), "demo-alex"),
    (error) => error instanceof ServiceError && error.code === "not-found");
  assert.equal(calls, 0);
  const input = insightInput(service, sourceId, topicId, "withdrawn-target", rootId);
  ai.create(input, "demo-alex");
  await Promise.resolve(); await Promise.resolve();
  service.command(service.catalog().version, { type: "withdraw", contributionId: rootId }, "demo-blair");
  assert.deepEqual(ai.result({ operationId: input.operationId }, "demo-alex"),
    { operationId: input.operationId, state: "failed", error: "stale-context" });
  assert.throws(() => ai.create(insightInput(service, sourceId, topicId, "already-withdrawn", rootId), "demo-alex"),
    (error) => error instanceof ServiceError && error.code === "not-found");
  assert.equal(calls, 1);
  ai.dispose();
});
