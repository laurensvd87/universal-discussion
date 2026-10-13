import test from "node:test";
import assert from "node:assert/strict";
import { createTopicRadiusIndex } from "../src/domain/topic-radius-index.js";
import { planReferenceTopicMembership } from "../src/domain/reference-topic-membership.js";

function vector(angle) {
  const result = Array(384).fill(0);
  result[0] = Math.cos(angle); result[1] = Math.sin(angle);
  return result;
}

test("two separate references both match a middle page without a third Topic or transitive merge", () => {
  const index = createTopicRadiusIndex();
  index.insert({ id: "topic-a", values: vector(-0.4) });
  index.insert({ id: "topic-b", values: vector(0.4) });
  assert.deepEqual(index.query(vector(-0.4)).ids, ["topic-a"]);
  assert.deepEqual(index.query(vector(0.4)).ids, ["topic-b"]);
  const before = index.diagnostics();
  const middle = planReferenceTopicMembership({ sourceId: "source-middle", representedValues: vector(0) },
    { index, nextTopicId() { assert.fail("a matching page must not create another Topic"); } });
  assert.deepEqual(middle.topicIds, ["topic-a", "topic-b"]);
  assert.equal(middle.newReference, null);
  assert.deepEqual(index.diagnostics(), before, "planning cannot mutate fixed references");
  // The future feed reads both original destinations. It must not merge the
  // Topics, rewrite their accepted messages or create a second stored copy.
  const discussions = new Map([
    ["topic-a", [{ id: "message-a", canonicalTopicId: "topic-a", body: "Message from A" }]],
    ["topic-b", [{ id: "message-b", canonicalTopicId: "topic-b", body: "Message from B" }]],
  ]);
  const visible = middle.topicIds.flatMap(id => discussions.get(id));
  assert.deepEqual(visible.map(message => message.id), ["message-a", "message-b"]);
  assert.deepEqual(visible.map(message => message.canonicalTopicId), ["topic-a", "topic-b"]);
  const members = new Map([["topic-a", new Set(["source-a", middle.sourceId])],
    ["topic-b", new Set(["source-b", middle.sourceId])]]);
  assert.equal([...members.values()].filter(ids => ids.size >= 2).length, 2);
  assert.equal(new Set([...members.values()].flatMap(ids => [...ids])).size, 3);
});

test("exhaustive no-match plans one singleton reference which only becomes searchable after acceptance", () => {
  const index = createTopicRadiusIndex();
  const values = vector(1.2);
  let created = 0;
  const plan = planReferenceTopicMembership({ sourceId: "source-new", representedValues: values },
    { index, nextTopicId: () => { created++; return "topic-new"; } });
  assert.equal(created, 1); assert.deepEqual(plan.topicIds, ["topic-new"]);
  assert.equal(index.diagnostics().liveEntries, 0);
  values[0] = 123;
  assert.ok(plan.newReference.representedValues[0] < 1);
  assert.ok(Object.isFrozen(plan.newReference.representedValues));
  index.insert({ id: plan.newReference.topicId, values: plan.newReference.representedValues });
  const repeat = planReferenceTopicMembership({ sourceId: "source-other", representedValues: vector(1.2) },
    { index, nextTopicId() { assert.fail("the accepted reference should match"); } });
  assert.equal(repeat.newReference, null); assert.deepEqual(repeat.topicIds, ["topic-new"]);
});

test("incomplete, failed and malformed searches cannot create or publish a new Topic", () => {
  let created = 0;
  const input = { sourceId: "source-page", representedValues: vector(0) };
  const options = query => ({ index: { query }, nextTopicId: () => { created++; return "topic-unsafe"; } });
  assert.throws(() => planReferenceTopicMembership(input, options(() => ({ complete: false, ids: [] }))),
    error => error.code === "unavailable");
  assert.throws(() => planReferenceTopicMembership(input, options(() => { throw new Error("search failed"); })));
  assert.throws(() => planReferenceTopicMembership(input, options(() => ({ complete: true, ids: ["topic-a", "topic-a"] }))));
  const sparse = Array(1);
  assert.throws(() => planReferenceTopicMembership(input, options(() => ({ complete: true, ids: sparse }))));
  assert.equal(created, 0);
  let invoked = false;
  const accessor = { sourceId: "source-page" };
  Object.defineProperty(accessor, "representedValues", { enumerable: true, get() { invoked = true; return vector(0); } });
  assert.throws(() => planReferenceTopicMembership(accessor, options(() => ({ complete: true, ids: [] }))));
  assert.equal(invoked, false); assert.equal(created, 0);
});
