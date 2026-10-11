import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createChatGPTRuntime } from "../src/ai/chatgpt-runtime.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";
import { buildInsightContext } from "../../../spikes/topic-resolution/browser/core/insight-context.js";
import { deterministicDependencies } from "./helpers.js";

const actor = "demo-alex";
const code = (name) => (error) => error.code === name;
function command(service, value) { return service.command(service.catalog().version, value, actor).result; }
function capture(service, receipt, angle = 0) {
  const values = Array(384).fill(0);
  values[0] = Math.cos(angle); values[1] = Math.sin(angle);
  return service.ingest({ expected: service.catalog().version, operationId: receipt,
    url: "https://example.com/articles/trust-inline", title: "Public test page",
    embedding: { modelId: BROWSER_MODEL_ID, values }, extractorVersion: EXTRACTOR_VERSION });
}
function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "udl-inline-trust-"));
  const databasePath = path.join(directory, "state.sqlite");
  const dependencies = deterministicDependencies();
  const app = createSqliteDemoService({ databasePath, ...dependencies });
  const opened = [app];
  t.after(() => {
    for (const instance of opened) instance.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const service = app.service;
  const first = capture(service, "trust-first");
  const oldTopicId = first.topicId;
  const rootId = command(service, { type: "create-root", topicId: oldTopicId,
    originSourceId: first.sourceId, body: "Original root" }).contributionId;
  const discussionId = service.discussion(oldTopicId).discussionId;
  const targetId = command(service, { type: "reply", discussionId, rootId,
    replyToId: rootId, body: "Original nested target" }).contributionId;
  const otherRootId = command(service, { type: "create-root", topicId: oldTopicId,
    body: "Unrelated root" }).contributionId;
  const replyOnlyId = command(service, { type: "reply", discussionId, rootId: otherRootId,
    replyToId: otherRootId, originSourceId: first.sourceId,
    body: "Only this reply has the page origin" }).contributionId;
  capture(service, "trust-revisit", 0.5);
  const currentTopicId = command(service, { type: "correct-source", sourceId: first.sourceId,
    topicId: "harbor-s2" }).topicId;
  assert.notEqual(currentTopicId, oldTopicId);
  return { app, opened, service, databasePath, sourceId: first.sourceId, oldTopicId,
    currentTopicId, discussionId, rootId, targetId, otherRootId, replyOnlyId };
}
function runtime(service, account = () => ({ clientId: "trust-account", label: "Synthetic" })) {
  const dispatches = [];
  const ai = createChatGPTRuntime({ service,
    connectionAdapter: { status: () => ({ connected: true, planEnabled: true,
      account: account() }), dispose() {} },
    insightsAdapter: { createInsight: async (value) => {
      dispatches.push(value);
      return { body: "Verified synthetic body", citations: [], model: "synthetic" };
    }, cancel() {}, dispose() {} } });
  return { ai, dispatches };
}
function request(service, fixtureState, operationId, targetId) {
  const { sourceId, currentTopicId, oldTopicId } = fixtureState;
  const catalog = service.catalog();
  return { operationId, model: "synthetic", articleText: "Current public page text",
    allowWebResearch: false, expected: catalog.version,
    context: buildInsightContext({ catalog, discussion: service.discussion(currentTopicId),
      related: service.related(sourceId, 20), sourceId, topicId: currentTopicId }),
    followupQuestionId: targetId, followupTopicId: oldTopicId };
}

test("SQLite historical human and generated replies preserve their original route and page link", async (t) => {
  const h = fixture(t);
  const { service } = h;
  const humanId = command(service, { type: "reply", discussionId: h.discussionId,
    rootId: h.rootId, replyToId: h.targetId, originSourceId: h.sourceId,
    body: "Human reply from current page" }).contributionId;
  const { ai, dispatches } = runtime(service);
  t.after(() => ai.dispose());
  const input = request(service, h, "trust-generated", h.targetId);
  ai.create(input, actor);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].context.topic.id, h.currentTopicId);
  assert.equal(dispatches[0].context.currentSource.id, h.sourceId);
  assert.deepEqual(dispatches[0].followup, {
    parentBody: "Original root", questionBody: "Original nested target" });
  const share = { type: "share-insight-reply", operationId: input.operationId,
    topicId: h.oldTopicId, discussionId: h.discussionId, rootId: h.rootId,
    replyToId: h.targetId, originSourceId: h.sourceId, body: "Verified synthetic body" };
  let writes = 0;
  const persist = (proof) => { writes++; return service.command(service.catalog().version, share, actor, proof); };
  for (const forgery of [
    { ...share, topicId: h.currentTopicId },
    { ...share, discussionId: service.discussion(h.currentTopicId).discussionId },
    { ...share, rootId: h.otherRootId },
    { ...share, replyToId: h.replyOnlyId },
    { ...share, body: "Changed body" },
  ]) assert.throws(() => ai.share({ expected: service.catalog().version,
    command: forgery }, actor, () => { writes++; }), (error) => Boolean(error.code));
  assert.equal(writes, 0);
  const outcome = ai.share({ expected: service.catalog().version, command: share }, actor, persist);
  const generatedId = outcome.result.contributionId;
  assert.equal(writes, 1);
  assert.throws(() => ai.share({ expected: service.catalog().version, command: share }, actor, persist), code("not-found"));
  assert.equal(service.catalog().sources.find((source) => source.id === h.sourceId).topicId, h.currentTopicId);
  const reopenedDeps = deterministicDependencies();
  h.app.close();
  h.opened.shift();
  const reopened = createSqliteDemoService({ databasePath: h.databasePath,
    now: reopenedDeps.now, nextId: (prefix) => `trust-reopen-${reopenedDeps.nextId(prefix)}` });
  h.opened.push(reopened);
  const old = reopened.service.discussion(h.oldTopicId);
  const root = old.roots.find((entry) => entry.id === h.rootId);
  for (const id of [humanId, generatedId]) {
    const reply = root.replies.find((entry) => entry.id === id);
    assert.equal(reply.origin.sourceId, h.sourceId);
    assert.equal(reply.origin.url, "https://example.com/articles/trust-inline");
  }
  assert.equal(reopened.service.discussion(h.currentTopicId).roots.some((entry) =>
    entry.id === h.rootId), false);
});

test("forged historical targets and withdrawn opener never dispatch or gain human origin", (t) => {
  const h = fixture(t);
  const { service } = h;
  const { ai, dispatches } = runtime(service);
  t.after(() => ai.dispose());
  for (const targetId of [h.replyOnlyId, h.otherRootId]) {
    assert.throws(() => ai.create(request(service, h, `trust-bad-${targetId}`, targetId), actor),
      (error) => Boolean(error.code));
    assert.throws(() => command(service, { type: "reply", discussionId: h.discussionId,
      rootId: h.otherRootId, replyToId: targetId, originSourceId: h.sourceId,
      body: "Wrong opener" }), code("invalid"));
  }
  assert.equal(dispatches.length, 0);
  command(service, { type: "withdraw", contributionId: h.rootId });
  assert.throws(() => ai.create(request(service, h, "trust-withdrawn", h.targetId), actor),
    (error) => Boolean(error.code));
  assert.equal(dispatches.length, 0);
});

test("historical result loses sharing authority after late opener, account or generation changes", async (t) => {
  for (const mutation of ["opener-tail", "account", "generation-reset"]) {
    await t.test(mutation, async (caseContext) => {
      const h = fixture(caseContext);
      const { service } = h;
      if (mutation === "opener-tail") command(service, { type: "edit",
        contributionId: h.rootId, body: "Q".repeat(2_099) });
      let account = { clientId: "trust-account", label: "Synthetic" };
      const { ai, dispatches } = runtime(service, () => account);
      caseContext.after(() => ai.dispose());
      const input = request(service, h, `trust-stale-${mutation}`, h.targetId);
      ai.create(input, actor);
      await Promise.resolve(); await Promise.resolve();
      assert.equal(dispatches.length, 1);
      if (mutation === "opener-tail") {
        assert.equal(dispatches[0].followup.parentBody.length, 2_000);
        command(service, { type: "edit", contributionId: h.rootId,
          body: "Q".repeat(2_099) + "X" });
      } else if (mutation === "account") {
        account = { clientId: "different-account", label: "Synthetic" };
      } else service.reset(service.catalog().version, "RESET DEMO STATE");
      assert.deepEqual(ai.result({ operationId: input.operationId }, actor),
        { operationId: input.operationId, state: "failed", error: "stale-context" });
      assert.equal(ai.resumable(actor).job, null);
    });
  }
});
