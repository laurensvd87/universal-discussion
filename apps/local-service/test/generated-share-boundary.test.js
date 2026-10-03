import assert from "node:assert/strict";
import test from "node:test";
import { createRequestHandler } from "../src/http/request-handler.js";
import { demoService } from "./helpers.js";

const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`,
  capability: "synthetic-pairing-capability" };
function request(expected, command, actorId = "demo-alex") {
  return { method: "POST", url: "/v1/commands", headers: {
    host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`,
    "x-demo-actor": actorId, "content-type": "application/json",
  }, body: JSON.stringify({ expected, command }) };
}

test("HTTP command boundary accepts only an internally attested generated share", async () => {
  const service = demoService();
  const expected = service.catalog().version;
  const command = { type: "share-insight", topicId: "harbor-s2", body: "A generated observation.",
    originSourceId: "harbor-overview", operationId: "generated-one" };
  const proof = { kind: "generated-insight", actorId: "demo-alex", topicId: command.topicId,
    body: command.body, originSourceId: command.originSourceId, operationId: command.operationId,
    rootId: null, replyToId: null, discussionId: null };
  const withoutAi = createRequestHandler({ service, config });
  assert.equal((await withoutAi(request(expected, command))).status, 403);
  const handle = createRequestHandler({ service, config, ai: {
    share: (_input, _actorId, persist) => persist(proof),
  } });
  for (const variant of [
    [command, "demo-blair"],
    [{ ...command, body: "Substituted text" }, "demo-alex"],
    [{ ...command, operationId: "other-operation" }, "demo-alex"],
    [{ ...command, originSourceId: "harbor-six-months" }, "demo-alex"],
  ]) {
    assert.equal((await handle(request(expected, variant[0], variant[1]))).status, 403);
    assert.deepEqual(service.catalog().version, expected);
  }
  const accepted = await handle(request(expected, command));
  assert.equal(accepted.status, 200);
  const root = service.discussion("harbor-s2").roots[0];
  assert.equal(root.body, command.body);
  assert.deepEqual(root.insight, { kind: "generated", operatorId: "demo-alex" });
});

test("HTTP follow-up share stays in the same thread and requires its own proof", async () => {
  const service = demoService();
  const root = { type: "share-insight", topicId: "harbor-s2", body: "Generated opener.",
    operationId: "root-operation" };
  const rootProof = { kind: "generated-insight", actorId: "demo-alex", topicId: root.topicId,
    body: root.body, originSourceId: null, operationId: root.operationId,
    rootId: null, replyToId: null, discussionId: null };
  const rootId = service.command(service.catalog().version, root, "demo-alex", rootProof).result.contributionId;
  const discussionId = service.discussion("harbor-s2").discussionId;
  const questionId = service.command(service.catalog().version, { type: "reply", discussionId, rootId,
    replyToId: rootId, body: "Could you expand?" }, "demo-blair").result.contributionId;
  const command = { type: "share-insight-reply", topicId: "harbor-s2", discussionId, rootId,
    replyToId: questionId, body: "A short follow-up.", originSourceId: null,
    operationId: "reply-operation" };
  const proof = { kind: "generated-insight", actorId: "demo-blair", topicId: command.topicId,
    body: command.body, originSourceId: null, operationId: command.operationId,
    rootId, replyToId: questionId, discussionId };
  const expected = service.catalog().version;
  assert.equal((await createRequestHandler({ service, config })(request(expected, command, "demo-blair"))).status, 403);
  const handle = createRequestHandler({ service, config, ai: {
    share: (_input, _actorId, persist) => persist(proof),
  } });
  assert.equal((await handle(request(expected, { ...command, body: "Changed" }, "demo-blair"))).status, 403);
  assert.deepEqual(service.catalog().version, expected);
  assert.equal((await handle(request(expected, command, "demo-blair"))).status, 200);
  const answer = service.discussion("harbor-s2").roots[0].replies.find((item) => item.actorType === "agent");
  assert.equal(answer.replyToId, questionId);
  assert.deepEqual(answer.insight, { kind: "generated", operatorId: "demo-blair" });
});
