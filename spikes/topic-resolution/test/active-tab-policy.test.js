import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_TAB_OBSERVATION_CONTRACT_VERSION,
  ACTIVE_TAB_POLICY_LIMITS,
  ACTIVE_TAB_ROUTES,
  ActiveTabPolicyError,
  classifyActiveTabSnapshot,
  sameActiveTabObservation,
  validateActiveTabObservation,
} from "../browser/core/active-tab-policy.js";

function expectPolicyError(code, operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof ActiveTabPolicyError);
    assert.equal(error.code, code);
    return true;
  });
}

test("the exact approved routes classify to immutable, allowlisted observations", () => {
  const cases = [
    ["https://example.com/", "active-tab-example-com", 7],
    ["https://example.org/", "active-tab-example-org", 8],
  ];

  assert.ok(Object.isFrozen(ACTIVE_TAB_ROUTES));
  assert.equal(new Set(ACTIVE_TAB_ROUTES.map(({ normalizedUrl }) => normalizedUrl)).size, 2);

  for (const [url, scenarioId, tabId] of cases) {
    const observation = classifyActiveTabSnapshot({ tabId, url });
    assert.deepEqual(observation, {
      contractVersion: ACTIVE_TAB_OBSERVATION_CONTRACT_VERSION,
      normalizedUrl: url,
      scenarioId,
      tabId,
    });
    assert.ok(Object.isFrozen(observation));
  }
});

test("normalization strips fragments and canonicalizes only to an exact approved route", () => {
  const observation = classifyActiveTabSnapshot({
    tabId: 12,
    url: "HTTPS://EXAMPLE.COM:443/#local-fragment",
  });

  assert.equal(observation.normalizedUrl, "https://example.com/");
  assert.equal(observation.scenarioId, "active-tab-example-com");

  const fragmentContainingQuestionMark = classifyActiveTabSnapshot({
    tabId: 13,
    url: "https://example.org/#local?not-a-query",
  });
  assert.equal(fragmentContainingQuestionMark.normalizedUrl, "https://example.org/");
});

test("a query before the fragment is rejected instead of being discarded", () => {
  for (const url of [
    "https://example.com/?tracking=1",
    "https://example.com/?tracking=1#fragment",
    "https://example.org/?",
  ]) {
    expectPolicyError("UNSUPPORTED_CONTEXT", () =>
      classifyActiveTabSnapshot({ tabId: 1, url }),
    );
  }
});

test("nearby, privileged, credentialed, and non-HTTPS URLs fail closed", () => {
  for (const url of [
    "http://example.com/",
    "https://user@example.com/",
    "https://user:password@example.com/",
    "https://www.example.com/",
    "https://example.com:444/",
    "https://example.com/story",
    "https://example.com//",
    "about:blank",
    "chrome://settings/",
    "not a URL",
    "",
  ]) {
    expectPolicyError("UNSUPPORTED_CONTEXT", () =>
      classifyActiveTabSnapshot({ tabId: 1, url }),
    );
  }
});

test("snapshot schema is exact plain enumerable data and never invokes accessors", () => {
  const invalidValues = [
    null,
    [],
    { tabId: 1 },
    { url: "https://example.com/" },
    { tabId: 1, url: "https://example.com/", title: "not allowed" },
    Object.assign(Object.create({ inherited: true }), {
      tabId: 1,
      url: "https://example.com/",
    }),
  ];

  for (const value of invalidValues) {
    expectPolicyError("INVALID_SCHEMA", () => classifyActiveTabSnapshot(value));
  }

  let getterInvoked = false;
  const accessor = { tabId: 1 };
  Object.defineProperty(accessor, "url", {
    enumerable: true,
    get() {
      getterInvoked = true;
      return "https://example.com/";
    },
  });
  expectPolicyError("INVALID_SCHEMA", () => classifyActiveTabSnapshot(accessor));
  assert.equal(getterInvoked, false);

  const symbolField = { tabId: 1, url: "https://example.com/" };
  symbolField[Symbol("hidden")] = true;
  expectPolicyError("INVALID_SCHEMA", () => classifyActiveTabSnapshot(symbolField));

  const nonEnumerable = { tabId: 1, url: "https://example.com/" };
  Object.defineProperty(nonEnumerable, "hidden", { value: true });
  expectPolicyError("INVALID_SCHEMA", () => classifyActiveTabSnapshot(nonEnumerable));
});

test("tab identifiers and URL resource bounds are enforced as unsupported context", () => {
  for (const tabId of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
    expectPolicyError("UNSUPPORTED_CONTEXT", () =>
      classifyActiveTabSnapshot({ tabId, url: "https://example.com/" }),
    );
  }

  expectPolicyError("UNSUPPORTED_CONTEXT", () =>
    classifyActiveTabSnapshot({
      tabId: 1,
      url: `https://example.com/#${"x".repeat(ACTIVE_TAB_POLICY_LIMITS.maximumUrlCodeUnits)}`,
    }),
  );
});

test("validated observations require exact schema, version, route binding, and identifier", () => {
  const valid = classifyActiveTabSnapshot({ tabId: 21, url: "https://example.com/" });
  assert.equal(validateActiveTabObservation(valid), valid);

  const mutations = [
    (value) => { value.contractVersion = "active-tab-observation/future"; },
    (value) => { value.normalizedUrl = "https://example.org/"; },
    (value) => { value.scenarioId = "active-tab-example-org"; },
    (value) => { value.tabId = -1; },
    (value) => { value.extra = true; },
    (value) => { delete value.scenarioId; },
  ];

  for (const mutate of mutations) {
    const candidate = { ...valid };
    mutate(candidate);
    const expectedCode =
      Object.keys(candidate).length === 4 ? "INVALID_OBSERVATION" : "INVALID_SCHEMA";
    expectPolicyError(expectedCode, () => validateActiveTabObservation(candidate));
  }
});

test("same-active-tab comparison binds tab identity, normalized URL, and route", () => {
  const first = classifyActiveTabSnapshot({
    tabId: 31,
    url: "https://example.com/#before",
  });
  const same = classifyActiveTabSnapshot({
    tabId: 31,
    url: "https://example.com/#after",
  });
  const changedTab = classifyActiveTabSnapshot({
    tabId: 32,
    url: "https://example.com/",
  });
  const changedRoute = classifyActiveTabSnapshot({
    tabId: 31,
    url: "https://example.org/",
  });

  assert.equal(sameActiveTabObservation(first, same), true);
  assert.equal(sameActiveTabObservation(first, changedTab), false);
  assert.equal(sameActiveTabObservation(first, changedRoute), false);
});
