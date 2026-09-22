import assert from "node:assert/strict";
import test from "node:test";

import {
  createIndicatorController,
} from "../browser/core/indicator-controller.js";
import {
  IndicatorContractError,
} from "../browser/core/indicator-contract.js";
import {
  lookupIndicatorFixture,
} from "../browser/fixtures/indicator-fixtures.js";

function deferredLookup() {
  const pending = [];
  return {
    lookup(request) {
      return new Promise((resolve, reject) => {
        pending.push({ reject, request, resolve });
      });
    },
    pending,
  };
}

test("controller publishes frozen idle, loading, and resolved states", async () => {
  const transitions = [];
  let receivedRequest;
  const controller = createIndicatorController({
    async lookup(request) {
      receivedRequest = request;
      return lookupIndicatorFixture(request);
    },
    onStateChange(state) {
      transitions.push(state);
    },
  });

  const idle = controller.currentState();
  assert.equal(idle.phase, "idle");
  assert.equal(idle.outcome, null);
  assert.equal(idle.scenarioId, null);
  assert.ok(Object.isFrozen(idle));

  const result = await controller.activate("wire-story");
  assert.equal(result.applied, true);
  assert.equal(result.state.phase, "ready");
  assert.equal(result.state.outcome, "resolved");
  assert.equal(result.state.scenarioId, "wire-story");
  assert.equal(controller.currentState(), result.state);
  assert.deepEqual(
    transitions.map(({ outcome, phase }) => outcome ?? phase),
    ["loading", "resolved"],
  );
  assert.deepEqual(receivedRequest, {
    requestToken: "activation-000001",
    scenarioId: "wire-story",
  });
  assert.ok(Object.isFrozen(receivedRequest));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.state.activity));
});

test("malformed, rejected, and unknown fixture lookups fail closed as unavailable", async () => {
  for (const [scenarioId, lookup] of [
    ["malformed-response", lookupIndicatorFixture],
    ["unknown-fixture", lookupIndicatorFixture],
    ["wire-story", async () => { throw new Error("local adapter failed"); }],
  ]) {
    const controller = createIndicatorController({ lookup });
    const result = await controller.activate(scenarioId);
    assert.equal(result.applied, true, scenarioId);
    assert.equal(result.state.phase, "ready", scenarioId);
    assert.equal(result.state.outcome, "unavailable", scenarioId);
    assert.equal(result.state.activity, null, scenarioId);
    assert.equal(result.state.discussionId, null, scenarioId);
    assert.equal(result.state.topicId, null, scenarioId);
    assert.equal(result.state.reasonCode, "local-lookup-unavailable", scenarioId);
  }
});

test("a late lookup completion cannot replace the latest activation", async () => {
  const adapter = deferredLookup();
  const transitions = [];
  const controller = createIndicatorController({
    lookup: adapter.lookup,
    onStateChange(state) {
      transitions.push(`${state.outcome ?? state.phase}:${state.scenarioId}`);
    },
  });

  const firstPromise = controller.activate("wire-story");
  const secondPromise = controller.activate("company-story");
  assert.equal(adapter.pending.length, 2);

  const second = adapter.pending[1];
  second.resolve(await lookupIndicatorFixture(second.request));
  const secondResult = await secondPromise;
  assert.equal(secondResult.applied, true);
  assert.equal(secondResult.state.scenarioId, "company-story");

  const first = adapter.pending[0];
  first.resolve(await lookupIndicatorFixture(first.request));
  const firstResult = await firstPromise;
  assert.equal(firstResult.applied, false);
  assert.equal(firstResult.state, secondResult.state);
  assert.equal(controller.currentState().scenarioId, "company-story");
  assert.deepEqual(transitions, [
    "loading:wire-story",
    "loading:company-story",
    "resolved:company-story",
  ]);
});

test("reset invalidates an in-flight lookup and restores an empty idle state", async () => {
  const adapter = deferredLookup();
  const controller = createIndicatorController({ lookup: adapter.lookup });
  const pendingActivation = controller.activate("wire-story");
  const idle = controller.reset();

  assert.equal(idle.phase, "idle");
  assert.equal(idle.outcome, null);
  assert.equal(idle.requestToken, null);
  assert.equal(idle.scenarioId, null);
  assert.equal(idle.activity, null);

  adapter.pending[0].resolve(
    await lookupIndicatorFixture(adapter.pending[0].request),
  );
  const lateResult = await pendingActivation;
  assert.equal(lateResult.applied, false);
  assert.equal(lateResult.state, idle);
  assert.equal(controller.currentState(), idle);
});

test("an invalid newer activation clears the view and supersedes an in-flight lookup", async () => {
  const adapter = deferredLookup();
  const transitions = [];
  const controller = createIndicatorController({
    lookup: adapter.lookup,
    onStateChange(state) {
      transitions.push(state);
    },
  });
  const pendingActivation = controller.activate("wire-story");

  await assert.rejects(
    controller.activate("../invalid"),
    (error) =>
      error instanceof IndicatorContractError && error.code === "INVALID_IDENTIFIER",
  );
  const cleared = controller.currentState();
  assert.equal(cleared.phase, "idle");
  assert.equal(cleared.outcome, null);
  assert.equal(cleared.scenarioId, null);
  assert.equal(cleared.activity, null);

  adapter.pending[0].resolve(
    await lookupIndicatorFixture(adapter.pending[0].request),
  );
  const late = await pendingActivation;
  assert.equal(late.applied, false);
  assert.equal(late.state, cleared);
  assert.deepEqual(
    transitions.map(({ outcome, phase }) => outcome ?? phase),
    ["loading", "idle"],
  );
});

test("controller rejects invalid adapters and scenario identifiers", async () => {
  for (const options of [
    {},
    { lookup: "not-a-function" },
    { lookup: lookupIndicatorFixture, onStateChange: "not-a-function" },
  ]) {
    assert.throws(
      () => createIndicatorController(options),
      (error) =>
        error instanceof IndicatorContractError && error.code === "INVALID_ADAPTER",
    );
  }

  const controller = createIndicatorController({ lookup: lookupIndicatorFixture });
  for (const scenarioId of [
    "",
    "Uppercase",
    "space separated",
    "a/b",
    "../escape",
    "x".repeat(129),
  ]) {
    await assert.rejects(
      controller.activate(scenarioId),
      (error) =>
        error instanceof IndicatorContractError && error.code === "INVALID_IDENTIFIER",
    );
  }
  assert.equal(controller.currentState().phase, "idle");
  assert.equal(controller.currentState().outcome, null);
});
