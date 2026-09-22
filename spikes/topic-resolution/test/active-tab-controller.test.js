import assert from "node:assert/strict";
import test from "node:test";

import { createActiveTabController } from "../browser/core/active-tab-controller.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

const EXAMPLE_COM = Object.freeze({ tabId: 7, url: "https://example.com/" });

function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function sequenceReader(snapshots) {
  const calls = [];
  return {
    calls,
    async read() {
      const index = calls.length;
      calls.push(index);
      const value = snapshots[index];
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function assertEmptyTerminal(state, outcome) {
  assert.equal(state.phase, "ready");
  assert.equal(state.outcome, outcome);
  assert.equal(state.activity, null);
  assert.equal(state.discussionId, null);
  assert.equal(state.mapping, null);
  assert.equal(state.source, null);
  assert.equal(state.sourceMatch, null);
  assert.equal(state.topicId, null);
  assert.ok(Object.isFrozen(state));
}

test("active controller binds a local URL lookup between two fresh tab reads", async () => {
  const reader = sequenceReader([
    { tabId: 7, url: "https://EXAMPLE.com:443/#first" },
    { tabId: 7, url: "https://example.com/#?discarded-fragment" },
  ]);
  const transitions = [];
  const lookupRequests = [];
  const controller = createActiveTabController({
    async lookupByNormalizedUrl(request) {
      lookupRequests.push(request);
      return lookupIndicatorFixtureByNormalizedUrl(request);
    },
    onStateChange(state) {
      transitions.push(state);
    },
    readActiveTab: reader.read,
  });

  const idle = controller.currentState();
  assert.equal(idle.phase, "idle");
  assert.equal(idle.source, null);
  assert.ok(Object.isFrozen(idle));

  const result = await controller.activate();
  assert.equal(result.applied, true);
  assert.equal(result.state.outcome, "resolved");
  assert.equal(result.state.scenarioId, "active-tab-example-com");
  assert.equal(result.state.source.url, "https://example.com/");
  assert.equal(result.state.sourceMatch.method, "exact-normalized-url");
  assert.equal(result.state.sourceMatch.normalizedUrl, "https://example.com/");
  assert.equal(result.state.mapping.method, "exact-content-fingerprint");
  assert.deepEqual(lookupRequests, [
    {
      normalizedUrl: "https://example.com/",
      requestToken: "activation-000001",
    },
  ]);
  assert.deepEqual(Object.keys(lookupRequests[0]).sort(), [
    "normalizedUrl",
    "requestToken",
  ]);
  assert.ok(Object.isFrozen(lookupRequests[0]));
  assert.equal(reader.calls.length, 2);
  assert.deepEqual(
    transitions.map(({ outcome, phase }) => outcome ?? phase),
    ["loading", "resolved"],
  );
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.state.sourceMatch));
});

test("unsupported initial contexts fail closed without lookup or a second read", async () => {
  const marker = "private-secret-marker";
  let lookupCalls = 0;
  let readCalls = 0;
  const controller = createActiveTabController({
    async lookupByNormalizedUrl() {
      lookupCalls += 1;
      throw new Error("must not run");
    },
    async readActiveTab() {
      readCalls += 1;
      return { tabId: 2, url: `https://example.com/?token=${marker}` };
    },
  });

  const result = await controller.activate();
  assert.equal(result.applied, true);
  assertEmptyTerminal(result.state, "unsupported");
  assert.equal(readCalls, 1);
  assert.equal(lookupCalls, 0);
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(marker, "u"));
});

test("read, lookup, response, and final-confirmation failures become generic unavailable", async () => {
  const cases = [
    {
      label: "initial read rejection",
      lookup: lookupIndicatorFixtureByNormalizedUrl,
      snapshots: [new Error("secret initial read")],
    },
    {
      label: "lookup rejection",
      lookup: async () => { throw new Error("secret lookup"); },
      snapshots: [EXAMPLE_COM],
    },
    {
      label: "malformed response",
      lookup: async () => ({ hostile: "secret response" }),
      snapshots: [EXAMPLE_COM],
    },
    {
      label: "wrong URL response binding",
      lookup: (request) => lookupIndicatorFixtureByNormalizedUrl({
        normalizedUrl: "https://example.org/",
        requestToken: request.requestToken,
      }),
      snapshots: [EXAMPLE_COM],
    },
    {
      label: "tampered lookup receipt",
      lookup: async (request) => {
        const response = structuredClone(
          await lookupIndicatorFixtureByNormalizedUrl(request),
        );
        response.result.sourceMatch.normalizedUrl = "https://example.org/";
        return response;
      },
      snapshots: [EXAMPLE_COM],
    },
    {
      label: "same URL but different tab",
      lookup: lookupIndicatorFixtureByNormalizedUrl,
      snapshots: [EXAMPLE_COM, { tabId: 8, url: EXAMPLE_COM.url }],
    },
    {
      label: "same tab but changed URL",
      lookup: lookupIndicatorFixtureByNormalizedUrl,
      snapshots: [EXAMPLE_COM, { tabId: 7, url: "https://example.org/" }],
    },
    {
      label: "final context unsupported",
      lookup: lookupIndicatorFixtureByNormalizedUrl,
      snapshots: [EXAMPLE_COM, { tabId: 7, url: "chrome://settings/" }],
    },
    {
      label: "final read permission loss",
      lookup: lookupIndicatorFixtureByNormalizedUrl,
      snapshots: [EXAMPLE_COM, new Error("secret permission error")],
    },
  ];

  for (const { label, lookup, snapshots } of cases) {
    const reader = sequenceReader(snapshots);
    const controller = createActiveTabController({
      lookupByNormalizedUrl: lookup,
      readActiveTab: reader.read,
    });
    const result = await controller.activate();
    assert.equal(result.applied, true, label);
    assertEmptyTerminal(result.state, "unavailable");
    assert.doesNotMatch(JSON.stringify(result.state), /secret/u, label);
  }
});

test("reset during the initial read prevents lookup and later publication", async () => {
  const pendingRead = deferred();
  let lookupCalls = 0;
  const transitions = [];
  const controller = createActiveTabController({
    async lookupByNormalizedUrl() {
      lookupCalls += 1;
      throw new Error("must not run");
    },
    onStateChange(state) {
      transitions.push(state);
    },
    readActiveTab: () => pendingRead.promise,
  });

  const activation = controller.activate();
  const idle = controller.reset();
  pendingRead.resolve(EXAMPLE_COM);
  const late = await activation;

  assert.equal(late.applied, false);
  assert.equal(late.state, idle);
  assert.equal(controller.currentState(), idle);
  assert.equal(lookupCalls, 0);
  assert.deepEqual(
    transitions.map(({ outcome, phase }) => outcome ?? phase),
    ["loading", "idle"],
  );
});

test("reset during lookup prevents the final read and later publication", async () => {
  const pendingLookup = deferred();
  const lookupStarted = deferred();
  let readCalls = 0;
  const controller = createActiveTabController({
    lookupByNormalizedUrl(request) {
      lookupStarted.resolve(request);
      return pendingLookup.promise;
    },
    async readActiveTab() {
      readCalls += 1;
      return EXAMPLE_COM;
    },
  });

  const activation = controller.activate();
  const request = await lookupStarted.promise;
  const idle = controller.reset();
  pendingLookup.resolve(await lookupIndicatorFixtureByNormalizedUrl(request));
  const late = await activation;

  assert.equal(late.applied, false);
  assert.equal(late.state, idle);
  assert.equal(readCalls, 1);
});

test("reset during the final read prevents a resolved view from publishing", async () => {
  const finalRead = deferred();
  const finalReadStarted = deferred();
  let readCalls = 0;
  const controller = createActiveTabController({
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    readActiveTab() {
      readCalls += 1;
      if (readCalls === 1) return Promise.resolve(EXAMPLE_COM);
      finalReadStarted.resolve();
      return finalRead.promise;
    },
  });

  const activation = controller.activate();
  await finalReadStarted.promise;
  const idle = controller.reset();
  finalRead.resolve(EXAMPLE_COM);
  const late = await activation;

  assert.equal(late.applied, false);
  assert.equal(late.state, idle);
  assert.equal(readCalls, 2);
});

test("a newer activation wins and repeated invocations use fresh reads and tokens", async () => {
  const firstRead = deferred();
  let readCalls = 0;
  const controller = createActiveTabController({
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    readActiveTab() {
      readCalls += 1;
      if (readCalls === 1) return firstRead.promise;
      return Promise.resolve({ tabId: 9, url: "https://example.org/" });
    },
  });

  const first = controller.activate();
  const second = await controller.activate();
  firstRead.resolve(EXAMPLE_COM);
  const stale = await first;

  assert.equal(second.applied, true);
  assert.equal(second.state.outcome, "resolved");
  assert.equal(second.state.source.url, "https://example.org/");
  assert.equal(second.state.requestToken, "activation-000002");
  assert.equal(stale.applied, false);
  assert.equal(stale.state, second.state);

  const third = await controller.activate();
  assert.equal(third.state.requestToken, "activation-000003");
  assert.equal(third.state.source.url, "https://example.org/");
  assert.equal(readCalls, 5);
});

test("active controller validates all adapters", () => {
  const valid = {
    lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
    readActiveTab: async () => EXAMPLE_COM,
  };
  for (const options of [
    {},
    { ...valid, lookupByNormalizedUrl: null },
    { ...valid, readActiveTab: null },
    { ...valid, onStateChange: "not-a-function" },
  ]) {
    assert.throws(
      () => createActiveTabController(options),
      (error) =>
        error instanceof TypeError &&
        error.message === "Active tab controller requires function adapters",
    );
  }
});
