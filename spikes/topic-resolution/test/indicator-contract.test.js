import assert from "node:assert/strict";
import test from "node:test";

import {
  INDICATOR_CONTRACT_LIMITS,
  INDICATOR_LOOKUP_CONTRACT_VERSION,
  INDICATOR_VIEW_CONTRACT_VERSION,
  IndicatorContractError,
  unavailableIndicatorView,
  validateAndProjectActiveTabResponse,
  validateAndProjectIndicatorResponse,
} from "../browser/core/indicator-contract.js";
import {
  INDICATOR_SCENARIOS,
  lookupIndicatorFixture,
  lookupIndicatorFixtureByNormalizedUrl,
} from "../browser/fixtures/indicator-fixtures.js";
import {
  FINGERPRINTS,
  FIXED_TIME,
  OBSERVATIONS,
} from "../fixtures/observations.js";
import { createTopicResolver } from "../src/resolver.js";

const REQUEST = Object.freeze({
  requestToken: "activation-000001",
  scenarioId: "wire-story",
});

function validResolvedResponse(overrides = {}) {
  const response = {
    contractVersion: INDICATOR_LOOKUP_CONTRACT_VERSION,
    generatedAt: "2026-09-21T15:00:00.000Z",
    reasonCode: null,
    requestToken: REQUEST.requestToken,
    result: {
      activity: {
        agentContributions: 1,
        asOf: "2026-09-21T15:00:00.000Z",
        humanContributions: 2,
        scope: "topic",
        topicId: "topic_91f792a4341063f25757f6bd",
      },
      discussion: {
        id: "discussion_7ecab0277967a7c79689cde5",
        topicId: "topic_91f792a4341063f25757f6bd",
      },
      mapping: {
        auditedAt: "2026-09-19T10:15:30.000Z",
        confidence: 1,
        evidence: {
          fixtureId: "wire-story",
          kind: "exact-content-fingerprint",
          provenance: "project-created-synthetic",
        },
        id: "source_topic_link_c6f706cd6aaeafdbe141e18d",
        method: "exact-content-fingerprint",
        resolverVersion: "topic-resolution-spike/1.0.1",
        sourceId: "source_f6eaedcc244bf5d2c228bca0",
        topicId: "topic_91f792a4341063f25757f6bd",
      },
      source: {
        id: "source_f6eaedcc244bf5d2c228bca0",
        title: "Acme announces Widget 2",
        url: "https://news.example.com/releases/widget-2",
      },
      sourceMatch: {
        method: "bundled-scenario",
        normalizedUrl: null,
        sourceId: "source_f6eaedcc244bf5d2c228bca0",
      },
      topicId: "topic_91f792a4341063f25757f6bd",
    },
    scenarioId: REQUEST.scenarioId,
    scope: {
      fixtureOnly: true,
      noAutomaticSemanticJoin: true,
      readOnly: true,
    },
    status: "resolved",
  };
  return Object.assign(response, overrides);
}

function expectContractError(code, operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof IndicatorContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("resolved fixture response projects an immutable, independently cloned view", () => {
  const response = validResolvedResponse();
  const view = validateAndProjectIndicatorResponse(response, REQUEST);

  assert.deepEqual(Object.keys(view).sort(), [
    "activity",
    "asOf",
    "discussionId",
    "mapping",
    "message",
    "outcome",
    "phase",
    "reasonCode",
    "requestToken",
    "scenarioId",
    "scope",
    "source",
    "sourceMatch",
    "topicId",
    "viewContractVersion",
  ]);
  assert.equal(view.viewContractVersion, INDICATOR_VIEW_CONTRACT_VERSION);
  assert.equal(view.phase, "ready");
  assert.equal(view.outcome, "resolved");
  assert.equal(view.activity.humanContributions, 2);
  assert.equal(view.activity.agentContributions, 1);
  assert.equal(view.mapping.evidence.provenance, "project-created-synthetic");
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.activity));
  assert.ok(Object.isFrozen(view.mapping.evidence));
  assert.notEqual(view.source, response.result.source);

  response.result.source.title = "changed after validation";
  assert.equal(view.source.title, "Acme announces Widget 2");
  assert.throws(() => {
    view.activity.humanContributions = 500;
  }, TypeError);
});

test("bundled Sources resolve to the same Topic and Discussion with separate identity counts", async () => {
  const requestFor = (scenarioId, sequence) => ({
    requestToken: `activation-${String(sequence).padStart(6, "0")}`,
    scenarioId,
  });
  const wireRequest = requestFor("wire-story", 1);
  const companyRequest = requestFor("company-story", 2);
  const wire = validateAndProjectIndicatorResponse(
    await lookupIndicatorFixture(wireRequest),
    wireRequest,
  );
  const company = validateAndProjectIndicatorResponse(
    await lookupIndicatorFixture(companyRequest),
    companyRequest,
  );

  assert.notEqual(wire.source.id, company.source.id);
  assert.equal(wire.topicId, company.topicId);
  assert.equal(wire.discussionId, company.discussionId);
  assert.deepEqual(wire.activity, {
    agentContributions: 1,
    asOf: "2026-09-21T15:00:00.000Z",
    humanContributions: 2,
    scope: "topic",
    topicId: wire.topicId,
  });
  assert.deepEqual(company.activity, wire.activity);
});

test("browser fixtures remain pinned to resolver-derived identities and mappings", async () => {
  const selector = { contentFingerprint: FINGERPRINTS.ANNOUNCEMENT };
  const activeSelector = { contentFingerprint: FINGERPRINTS.ACTIVE_TAB_DEMO };
  const resolver = createTopicResolver({
    clock: () => new Date(FIXED_TIME),
    activityRecords: [
      { ...selector, authorType: "human", visibility: "public", moderationState: "visible" },
      { ...selector, authorType: "human", visibility: "public", moderationState: "visible" },
      { ...selector, authorType: "agent", visibility: "public", moderationState: "visible" },
      { ...activeSelector, authorType: "human", visibility: "public", moderationState: "visible" },
      { ...activeSelector, authorType: "agent", visibility: "public", moderationState: "visible" },
    ],
  });
  const cases = [
    ["wire-story", OBSERVATIONS.wireStory],
    ["company-story", OBSERVATIONS.companyStory],
    ["hostile-title", OBSERVATIONS.hostileTitle],
    ["active-tab-example-com", OBSERVATIONS.activeTabExampleCom],
    ["active-tab-example-org", OBSERVATIONS.activeTabExampleOrg],
  ];

  let sequence = 20;
  for (const [scenarioId, observation] of cases) {
    sequence += 1;
    const resolved = resolver.resolve(observation);
    const request = {
      requestToken: `activation-${String(sequence).padStart(6, "0")}`,
      scenarioId,
    };
    const view = validateAndProjectIndicatorResponse(
      await lookupIndicatorFixture(request),
      request,
    );

    assert.deepEqual(view.source, {
      id: resolved.source.id,
      title: resolved.source.title,
      url: resolved.source.canonicalUrl,
    }, scenarioId);
    assert.equal(view.topicId, resolved.topic.id, scenarioId);
    assert.equal(view.discussionId, resolved.discussion.id, scenarioId);
    assert.equal(view.mapping.id, resolved.sourceTopicLink.id, scenarioId);
    assert.equal(view.mapping.sourceId, resolved.sourceTopicLink.sourceId, scenarioId);
    assert.equal(view.mapping.topicId, resolved.sourceTopicLink.topicId, scenarioId);
    assert.equal(view.mapping.method, resolved.sourceTopicLink.resolutionMethod, scenarioId);
    assert.equal(view.mapping.confidence, resolved.sourceTopicLink.confidence, scenarioId);
    assert.equal(view.mapping.resolverVersion, resolved.sourceTopicLink.resolverVersion, scenarioId);
    assert.equal(view.mapping.auditedAt, resolved.sourceTopicLink.auditedAt, scenarioId);
    assert.equal(
      view.mapping.evidence.fixtureId,
      resolved.source.fingerprintEvidence.fixtureId,
      scenarioId,
    );
    assert.equal(
      view.activity.humanContributions,
      resolved.publicActivity.humanContributions,
      scenarioId,
    );
    assert.equal(
      view.activity.agentContributions,
      resolved.publicActivity.aiContributions,
      scenarioId,
    );
    assert.equal(view.activity.topicId, resolved.topic.id, scenarioId);
    assert.equal(view.activity.scope, "topic", scenarioId);
    assert.equal(
      view.sourceMatch.method,
      scenarioId.startsWith("active-tab-")
        ? "exact-normalized-url"
        : "bundled-scenario",
      scenarioId,
    );
  }
});

test("exact URL lookup receipt is separately bound from Source-to-Topic mapping", async () => {
  const cases = [
    ["https://example.com/", "active-tab-example-com"],
    ["https://example.org/", "active-tab-example-org"],
  ];
  const views = [];

  let sequence = 40;
  for (const [normalizedUrl, scenarioId] of cases) {
    sequence += 1;
    const request = {
      normalizedUrl,
      requestToken: `activation-${String(sequence).padStart(6, "0")}`,
    };
    const response = await lookupIndicatorFixtureByNormalizedUrl(request);
    const view = validateAndProjectActiveTabResponse(response, {
      normalizedUrl,
      requestToken: request.requestToken,
      scenarioId,
    });
    views.push(view);
    assert.deepEqual(view.sourceMatch, {
      method: "exact-normalized-url",
      normalizedUrl,
      sourceId: view.source.id,
    });
    assert.equal(view.mapping.method, "exact-content-fingerprint");
    assert.equal(view.mapping.evidence.fixtureId, scenarioId);
    assert.equal(view.activity.humanContributions, 1);
    assert.equal(view.activity.agentContributions, 1);
  }

  assert.notEqual(views[0].source.id, views[1].source.id);
  assert.equal(views[0].topicId, views[1].topicId);
  assert.equal(views[0].discussionId, views[1].discussionId);
});

test("exact URL fixture lookup accepts only its two-field plain request", async () => {
  const marker = "private-lookup-marker";
  const invalidRequests = [
    null,
    [],
    { normalizedUrl: "https://example.com/" },
    {
      normalizedUrl: "https://example.com/",
      requestToken: "invalid-token",
    },
    {
      extra: true,
      normalizedUrl: "https://example.com/",
      requestToken: "activation-000050",
    },
    {
      normalizedUrl: `https://unsupported.example/${marker}`,
      requestToken: "activation-000050",
    },
    Object.assign(Object.create({ inherited: true }), {
      normalizedUrl: "https://example.com/",
      requestToken: "activation-000050",
    }),
  ];

  let getterInvoked = false;
  const accessor = { requestToken: "activation-000050" };
  Object.defineProperty(accessor, "normalizedUrl", {
    enumerable: true,
    get() {
      getterInvoked = true;
      return "https://example.com/";
    },
  });
  invalidRequests.push(accessor);

  for (const request of invalidRequests) {
    await assert.rejects(
      lookupIndicatorFixtureByNormalizedUrl(request),
      (error) =>
        error instanceof TypeError &&
        !error.message.includes(marker),
    );
  }
  assert.equal(getterInvoked, false);
});

test("all bundled scenarios are unique, frozen, and exercise the declared state", async () => {
  assert.equal(new Set(INDICATOR_SCENARIOS.map(({ id }) => id)).size, 6);
  assert.ok(Object.isFrozen(INDICATOR_SCENARIOS));
  const expectedStates = new Map([
    ["wire-story", "resolved"],
    ["company-story", "resolved"],
    ["hostile-title", "resolved"],
    ["ambiguous-unmapped", "unmapped"],
    ["unsupported-context", "unsupported"],
  ]);

  let sequence = 0;
  for (const [scenarioId, expectedState] of expectedStates) {
    sequence += 1;
    const request = {
      requestToken: `activation-${String(sequence).padStart(6, "0")}`,
      scenarioId,
    };
    const view = validateAndProjectIndicatorResponse(
      await lookupIndicatorFixture(request),
      request,
    );
    assert.equal(view.phase, "ready", scenarioId);
    assert.equal(view.outcome, expectedState, scenarioId);
    if (expectedState !== "resolved") {
      assert.equal(view.activity, null, scenarioId);
      assert.equal(view.discussionId, null, scenarioId);
      assert.equal(view.topicId, null, scenarioId);
    }
  }

  const hostileRequest = {
    requestToken: "activation-000006",
    scenarioId: "hostile-title",
  };
  const hostile = validateAndProjectIndicatorResponse(
    await lookupIndicatorFixture(hostileRequest),
    hostileRequest,
  );
  assert.equal(
    hostile.source.title,
    "<img src=x onerror=alert(1)> remains inert fixture text",
  );
});

test("unavailable view carries no result or misleading zero activity", () => {
  const view = unavailableIndicatorView(REQUEST);
  assert.equal(view.phase, "ready");
  assert.equal(view.outcome, "unavailable");
  assert.equal(view.activity, null);
  assert.equal(view.discussionId, null);
  assert.equal(view.topicId, null);
  assert.equal(view.asOf, null);
  assert.equal(view.sourceMatch, null);
  assert.equal(view.reasonCode, "local-lookup-unavailable");
  assert.ok(Object.isFrozen(view));
  assert.deepEqual(view.scope, {
    fixtureOnly: true,
    noAutomaticSemanticJoin: true,
    readOnly: true,
  });
});

test("strict schema rejects unknown, missing, accessor, prototype, and cyclic data", () => {
  const unknown = validResolvedResponse({ extra: true });
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectIndicatorResponse(unknown, REQUEST),
  );

  const missing = validResolvedResponse();
  delete missing.generatedAt;
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectIndicatorResponse(missing, REQUEST),
  );

  let accessorInvoked = false;
  const accessor = validResolvedResponse();
  Object.defineProperty(accessor, "extra", {
    enumerable: true,
    get() {
      accessorInvoked = true;
      return "must not run";
    },
  });
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectIndicatorResponse(accessor, REQUEST),
  );
  assert.equal(accessorInvoked, false);

  const prototype = Object.assign(Object.create({ inherited: true }), validResolvedResponse());
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectIndicatorResponse(prototype, REQUEST),
  );

  const cyclic = validResolvedResponse();
  cyclic.result.mapping.evidence.loop = cyclic;
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectIndicatorResponse(cyclic, REQUEST),
  );
});

test("every nested allowlist and plain-data boundary rejects unsupported structure", () => {
  const nestedMutations = [
    (value) => { value.scope.extra = true; },
    (value) => { value.result.extra = true; },
    (value) => { value.result.activity.extra = true; },
    (value) => { value.result.discussion.extra = true; },
    (value) => { value.result.source.extra = true; },
    (value) => { value.result.sourceMatch.extra = true; },
    (value) => { value.result.mapping.extra = true; },
    (value) => { value.result.mapping.evidence.extra = true; },
  ];
  for (const mutate of nestedMutations) {
    const response = validResolvedResponse();
    mutate(response);
    expectContractError("INVALID_SCHEMA", () =>
      validateAndProjectIndicatorResponse(response, REQUEST),
    );
  }

  const symbol = validResolvedResponse();
  symbol[Symbol("hidden")] = true;
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectIndicatorResponse(symbol, REQUEST),
  );

  const nonEnumerable = validResolvedResponse();
  Object.defineProperty(nonEnumerable.result, "hidden", {
    enumerable: false,
    value: true,
  });
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectIndicatorResponse(nonEnumerable, REQUEST),
  );

  for (const unsupported of [undefined, 1n, () => true, []]) {
    const response = validResolvedResponse();
    response.result.source = unsupported;
    expectContractError("INVALID_SCHEMA", () =>
      validateAndProjectIndicatorResponse(response, REQUEST),
    );
  }
});

test("binding, version, status, reason, and scope are fail-closed", () => {
  const wrongVersion = validResolvedResponse({ contractVersion: "lookup/future" });
  expectContractError("UNSUPPORTED_VERSION", () =>
    validateAndProjectIndicatorResponse(wrongVersion, REQUEST),
  );

  const wrongBinding = validResolvedResponse({ scenarioId: "company-story" });
  expectContractError("BINDING_MISMATCH", () =>
    validateAndProjectIndicatorResponse(wrongBinding, REQUEST),
  );

  const wrongStatus = validResolvedResponse({ status: "guessed" });
  expectContractError("INVALID_STATUS", () =>
    validateAndProjectIndicatorResponse(wrongStatus, REQUEST),
  );

  const wrongReason = validResolvedResponse({ reasonCode: "looks-close" });
  expectContractError("INVALID_STATUS", () =>
    validateAndProjectIndicatorResponse(wrongReason, REQUEST),
  );

  const wrongScope = validResolvedResponse();
  wrongScope.scope.noAutomaticSemanticJoin = false;
  expectContractError("INVALID_SCOPE", () =>
    validateAndProjectIndicatorResponse(wrongScope, REQUEST),
  );

  const resultOnAbstention = validResolvedResponse({
    reasonCode: "no-deterministic-mapping",
    status: "unmapped",
  });
  expectContractError("INVALID_STATUS", () =>
    validateAndProjectIndicatorResponse(resultOnAbstention, REQUEST),
  );
});

test("resolved identities, timestamps, source fields, mapping evidence, and counts are bounded", () => {
  const cases = [
    ["INVALID_IDENTIFIER", (value) => { value.result.topicId = "topic_not-a-digest"; }],
    ["INVALID_IDENTIFIER", (value) => { value.result.mapping.id = value.result.source.id; }],
    ["INVALID_TIMESTAMP", (value) => { value.generatedAt = "2026-09-21"; }],
    ["INVALID_TIMESTAMP", (value) => { value.result.mapping.auditedAt = "2027-01-01T00:00:00.000Z"; }],
    ["INVALID_TIMESTAMP", (value) => { value.result.activity.asOf = "2027-01-01T00:00:00.000Z"; }],
    ["INVALID_SOURCE", (value) => { value.result.source.url = "https://example.com/story?tracking=1"; }],
    ["INVALID_SOURCE", (value) => { value.result.source.title = "   "; }],
    ["INVALID_SOURCE", (value) => { value.result.source.title = "hidden\u202etext"; }],
    ["INVALID_MAPPING", (value) => { value.result.mapping.method = "semantic-similarity"; }],
    ["INVALID_MAPPING", (value) => { value.result.mapping.confidence = 0.99; }],
    ["INVALID_MAPPING", (value) => { value.result.mapping.evidence.provenance = "unknown"; }],
    ["INVALID_COUNT", (value) => { value.result.activity.humanContributions = -1; }],
    ["INVALID_COUNT", (value) => { value.result.activity.agentContributions = 1.5; }],
    ["INVALID_COUNT", (value) => {
      value.result.activity.humanContributions = INDICATOR_CONTRACT_LIMITS.maximumCount + 1;
    }],
  ];

  for (const [code, mutate] of cases) {
    const response = validResolvedResponse();
    mutate(response);
    expectContractError(code, () =>
      validateAndProjectIndicatorResponse(response, REQUEST),
    );
  }
});

test("resolved mapping, Discussion, activity, and evidence must cross-bind to the Source and Topic", () => {
  const otherSource = "source_aaaaaaaaaaaaaaaaaaaaaaaa";
  const otherTopic = "topic_bbbbbbbbbbbbbbbbbbbbbbbb";
  const cases = [
    (value) => { value.result.mapping.sourceId = otherSource; },
    (value) => { value.result.sourceMatch.sourceId = otherSource; },
    (value) => { value.result.mapping.topicId = otherTopic; },
    (value) => { value.result.discussion.topicId = otherTopic; },
    (value) => { value.result.activity.topicId = otherTopic; },
    (value) => { value.result.activity.scope = "source"; },
  ];

  for (const mutate of cases) {
    const response = validResolvedResponse();
    mutate(response);
    expectContractError("BINDING_MISMATCH", () =>
      validateAndProjectIndicatorResponse(response, REQUEST),
    );
  }

  const wrongEvidence = validResolvedResponse();
  wrongEvidence.result.mapping.evidence.fixtureId = "company-story";
  expectContractError("INVALID_MAPPING", () =>
    validateAndProjectIndicatorResponse(wrongEvidence, REQUEST),
  );
});

test("Source lookup provenance and active URL bindings fail closed", async () => {
  const bundledWithUrl = validResolvedResponse();
  bundledWithUrl.result.sourceMatch.normalizedUrl = bundledWithUrl.result.source.url;
  expectContractError("BINDING_MISMATCH", () =>
    validateAndProjectIndicatorResponse(bundledWithUrl, REQUEST),
  );

  const exactWithoutUrl = validResolvedResponse();
  exactWithoutUrl.result.sourceMatch.method = "exact-normalized-url";
  expectContractError("BINDING_MISMATCH", () =>
    validateAndProjectIndicatorResponse(exactWithoutUrl, REQUEST),
  );

  const lookupRequest = {
    normalizedUrl: "https://example.com/",
    requestToken: "activation-000090",
  };
  const response = await lookupIndicatorFixtureByNormalizedUrl(lookupRequest);
  const expected = {
    ...lookupRequest,
    scenarioId: "active-tab-example-com",
  };
  const view = validateAndProjectActiveTabResponse(response, expected);
  assert.equal(view.source.url, expected.normalizedUrl);

  for (const mutateExpected of [
    (value) => { value.normalizedUrl = "https://example.org/"; },
    (value) => { value.scenarioId = "active-tab-example-org"; },
    (value) => { value.requestToken = "activation-000091"; },
  ]) {
    const changed = { ...expected };
    mutateExpected(changed);
    expectContractError("BINDING_MISMATCH", () =>
      validateAndProjectActiveTabResponse(response, changed),
    );
  }

  const tamperedReceipt = structuredClone(response);
  tamperedReceipt.result.sourceMatch.normalizedUrl = "https://example.org/";
  expectContractError("BINDING_MISMATCH", () =>
    validateAndProjectActiveTabResponse(tamperedReceipt, expected),
  );

  const bundledMethod = structuredClone(response);
  bundledMethod.result.sourceMatch.method = "bundled-scenario";
  bundledMethod.result.sourceMatch.normalizedUrl = null;
  expectContractError("BINDING_MISMATCH", () =>
    validateAndProjectActiveTabResponse(bundledMethod, expected),
  );
});

test("preflight enforces depth, node, string, title, and timestamp budgets", () => {
  const tooDeep = validResolvedResponse();
  let cursor = {};
  tooDeep.extra = cursor;
  for (let index = 0; index <= INDICATOR_CONTRACT_LIMITS.maximumDepth; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  expectContractError("RESOURCE_LIMIT", () =>
    validateAndProjectIndicatorResponse(tooDeep, REQUEST),
  );

  const tooManyNodes = validResolvedResponse();
  tooManyNodes.extra = Object.fromEntries(
    Array.from(
      { length: INDICATOR_CONTRACT_LIMITS.maximumNodes },
      (_, index) => [`x${index}`, index],
    ),
  );
  expectContractError("RESOURCE_LIMIT", () =>
    validateAndProjectIndicatorResponse(tooManyNodes, REQUEST),
  );

  const tooMuchText = validResolvedResponse();
  tooMuchText.extra = "x".repeat(INDICATOR_CONTRACT_LIMITS.maximumStringCodeUnits + 1);
  expectContractError("RESOURCE_LIMIT", () =>
    validateAndProjectIndicatorResponse(tooMuchText, REQUEST),
  );

  const longTitle = validResolvedResponse();
  longTitle.result.source.title = "x".repeat(
    INDICATOR_CONTRACT_LIMITS.maximumTitleCodeUnits + 1,
  );
  expectContractError("INVALID_SOURCE", () =>
    validateAndProjectIndicatorResponse(longTitle, REQUEST),
  );

  const longTimestamp = validResolvedResponse();
  longTimestamp.generatedAt = "x".repeat(
    INDICATOR_CONTRACT_LIMITS.maximumTimestampCodeUnits + 1,
  );
  expectContractError("RESOURCE_LIMIT", () =>
    validateAndProjectIndicatorResponse(longTimestamp, REQUEST),
  );
});
