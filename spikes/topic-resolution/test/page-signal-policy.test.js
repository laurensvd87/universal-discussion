import assert from "node:assert/strict";
import test from "node:test";

import {
  PAGE_SIGNAL_OBSERVATION_CONTRACT_VERSION,
  PAGE_SIGNAL_POLICY_LIMITS,
  PAGE_SIGNAL_ROUTES,
  PageSignalPolicyError,
  classifyPageSignalSnapshot,
  samePageSignalObservation,
  validatePageSignalObservation,
} from "../browser/core/page-signal-policy.js";

const APPROVED_NOW = Date.parse("2026-09-22T12:00:00.000Z");
const LOCAL_URL = "http://127.0.0.1:4173/p1-5c.html";
const MDN_URL =
  "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta";

function expectPolicyError(code, operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof PageSignalPolicyError);
    assert.equal(error.code, code);
    return true;
  });
}

test("only the exact controlled and reviewed routes classify", () => {
  assert.ok(Object.isFrozen(PAGE_SIGNAL_ROUTES));
  assert.deepEqual(
    PAGE_SIGNAL_ROUTES.map(({ normalizedUrl }) => normalizedUrl),
    [LOCAL_URL, MDN_URL],
  );
  const local = classifyPageSignalSnapshot(
    { tabId: 7, url: `${LOCAL_URL}#fixture-fragment` },
    APPROVED_NOW,
  );
  assert.deepEqual(local, {
    contextId: "p1-5c-controlled-fixture",
    contractVersion: PAGE_SIGNAL_OBSERVATION_CONTRACT_VERSION,
    normalizedUrl: LOCAL_URL,
    policyReviewExpiresAt: null,
    rightsBasis: "project-created-synthetic",
    tabId: 7,
  });
  const mdn = classifyPageSignalSnapshot(
    { tabId: 8, url: `${MDN_URL}#usage-notes` },
    APPROVED_NOW,
  );
  assert.equal(mdn.contextId, "p1-5c-mdn-meta-reference");
  assert.equal(mdn.normalizedUrl, MDN_URL);
  assert.equal(mdn.policyReviewExpiresAt, "2026-10-23T00:00:00.000Z");
  assert.equal(mdn.rightsBasis, "mdn-open-license-review-2026-09-22");
  assert.ok(Object.isFrozen(local));
  assert.ok(Object.isFrozen(mdn));
});

test("nearby local, public, query, credential, and privileged routes fail closed", () => {
  for (const url of [
    "http://localhost:4173/p1-5c.html",
    "http://127.0.0.1/p1-5c.html",
    "http://127.0.0.1:4174/p1-5c.html",
    "http://127.0.0.1:4173/P1-5c.html",
    "http://127.0.0.1:4173/p1-5c.html?probe=1",
    "http://127.0.0.2:4173/p1-5c.html",
    `${MDN_URL}/`,
    `${MDN_URL}?utm_source=test`,
    "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/title",
    "https://user@developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta",
    "chrome://extensions/",
    "file:///tmp/p1-5c.html",
    "not a URL",
    "",
  ]) {
    expectPolicyError("UNSUPPORTED_CONTEXT", () =>
      classifyPageSignalSnapshot({ tabId: 1, url }, APPROVED_NOW),
    );
  }
});

test("a question mark inside a fragment is not treated as a query", () => {
  const observation = classifyPageSignalSnapshot(
    { tabId: 1, url: `${MDN_URL}#local?fragment` },
    APPROVED_NOW,
  );
  assert.equal(observation.normalizedUrl, MDN_URL);
});

test("the public-page rights record expires before injection while the project fixture does not", () => {
  const justBeforeExpiry = Date.parse("2026-10-22T23:59:59.999Z");
  assert.equal(
    classifyPageSignalSnapshot(
      { tabId: 1, url: MDN_URL },
      justBeforeExpiry,
    ).normalizedUrl,
    MDN_URL,
  );
  expectPolicyError("POLICY_REVIEW_EXPIRED", () =>
    classifyPageSignalSnapshot(
      { tabId: 1, url: MDN_URL },
      Date.parse("2026-10-23T00:00:00.000Z"),
    ),
  );
  assert.equal(
    classifyPageSignalSnapshot(
      { tabId: 1, url: LOCAL_URL },
      Date.parse("2099-01-01T00:00:00.000Z"),
    ).normalizedUrl,
    LOCAL_URL,
  );
});

test("snapshot schema, clock, tab identifier, and URL resource bounds are strict", () => {
  for (const snapshot of [
    null,
    [],
    { tabId: 1 },
    { url: LOCAL_URL },
    { tabId: 1, url: LOCAL_URL, title: "not allowed" },
    Object.assign(Object.create({ inherited: true }), {
      tabId: 1,
      url: LOCAL_URL,
    }),
  ]) {
    expectPolicyError("INVALID_SCHEMA", () =>
      classifyPageSignalSnapshot(snapshot, APPROVED_NOW),
    );
  }
  for (const clock of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "0", null]) {
    expectPolicyError("INVALID_CLOCK", () =>
      classifyPageSignalSnapshot({ tabId: 1, url: LOCAL_URL }, clock),
    );
  }
  for (const tabId of [-1, 1.5, "1", null]) {
    expectPolicyError("UNSUPPORTED_CONTEXT", () =>
      classifyPageSignalSnapshot({ tabId, url: LOCAL_URL }, APPROVED_NOW),
    );
  }
  expectPolicyError("UNSUPPORTED_CONTEXT", () =>
    classifyPageSignalSnapshot(
      {
        tabId: 1,
        url: `${LOCAL_URL}#${"x".repeat(PAGE_SIGNAL_POLICY_LIMITS.maximumUrlCodeUnits)}`,
      },
      APPROVED_NOW,
    ),
  );
});

test("snapshot accessors and hidden or symbolic fields are rejected without invocation", () => {
  let invoked = false;
  const accessor = { tabId: 1 };
  Object.defineProperty(accessor, "url", {
    enumerable: true,
    get() {
      invoked = true;
      return LOCAL_URL;
    },
  });
  expectPolicyError("INVALID_SCHEMA", () =>
    classifyPageSignalSnapshot(accessor, APPROVED_NOW),
  );
  assert.equal(invoked, false);

  const hidden = { tabId: 1, url: LOCAL_URL };
  Object.defineProperty(hidden, "secret", { value: true });
  expectPolicyError("INVALID_SCHEMA", () =>
    classifyPageSignalSnapshot(hidden, APPROVED_NOW),
  );
  const symbolic = { tabId: 1, url: LOCAL_URL };
  symbolic[Symbol("secret")] = true;
  expectPolicyError("INVALID_SCHEMA", () =>
    classifyPageSignalSnapshot(symbolic, APPROVED_NOW),
  );
});

test("observation validation and comparison bind route policy and tab identity", () => {
  const first = classifyPageSignalSnapshot(
    { tabId: 4, url: `${LOCAL_URL}#first` },
    APPROVED_NOW,
  );
  const same = classifyPageSignalSnapshot(
    { tabId: 4, url: `${LOCAL_URL}#second` },
    APPROVED_NOW,
  );
  const changedTab = classifyPageSignalSnapshot(
    { tabId: 5, url: LOCAL_URL },
    APPROVED_NOW,
  );
  assert.equal(validatePageSignalObservation(first), first);
  assert.equal(samePageSignalObservation(first, same), true);
  assert.equal(samePageSignalObservation(first, changedTab), false);

  for (const mutate of [
    (value) => { value.contextId = "other"; },
    (value) => { value.contractVersion = "future"; },
    (value) => { value.normalizedUrl = MDN_URL; },
    (value) => { value.policyReviewExpiresAt = "2099-01-01T00:00:00.000Z"; },
    (value) => { value.rightsBasis = "unreviewed"; },
    (value) => { value.tabId = -1; },
  ]) {
    const candidate = { ...first };
    mutate(candidate);
    expectPolicyError("INVALID_OBSERVATION", () =>
      validatePageSignalObservation(candidate),
    );
  }
});
