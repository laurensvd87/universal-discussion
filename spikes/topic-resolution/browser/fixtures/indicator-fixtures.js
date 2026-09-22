import { INDICATOR_LOOKUP_CONTRACT_VERSION } from "../core/indicator-contract.js";
import { ACTIVE_TAB_ROUTES } from "../core/active-tab-policy.js";

const GENERATED_AT = "2026-09-21T15:00:00.000Z";
const AUDITED_AT = "2026-09-19T10:15:30.000Z";
const SHARED_TOPIC_ID = "topic_91f792a4341063f25757f6bd";
const SHARED_DISCUSSION_ID = "discussion_7ecab0277967a7c79689cde5";
const ACTIVE_TAB_TOPIC_ID = "topic_d5d91cb67852edba65a9e2d0";
const ACTIVE_TAB_DISCUSSION_ID = "discussion_786f004f0db183c413448b09";
const SCOPE = Object.freeze({
  fixtureOnly: true,
  noAutomaticSemanticJoin: true,
  readOnly: true,
});
const REQUEST_TOKEN = /^activation-[0-9]{6}$/;
const ACTIVE_SCENARIO_BY_URL = new Map(
  ACTIVE_TAB_ROUTES.map(({ normalizedUrl, scenarioId }) => [
    normalizedUrl,
    scenarioId,
  ]),
);
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function activity(topicId, humanContributions, agentContributions) {
  return {
    agentContributions,
    asOf: GENERATED_AT,
    humanContributions,
    scope: "topic",
    topicId,
  };
}

function mapping(fixtureId, id, sourceId, topicId) {
  return {
    auditedAt: AUDITED_AT,
    confidence: 1,
    evidence: {
      fixtureId,
      kind: "exact-content-fingerprint",
      provenance: "project-created-synthetic",
    },
    id,
    method: "exact-content-fingerprint",
    resolverVersion: "topic-resolution-spike/1.0.1",
    sourceId,
    topicId,
  };
}

function resolved({
  agentContributions,
  discussionId,
  fixtureId,
  humanContributions,
  mappingId,
  source,
  sourceMatchMethod,
  sourceMatchNormalizedUrl,
  topicId,
}) {
  return {
    activity: activity(topicId, humanContributions, agentContributions),
    discussion: {
      id: discussionId,
      topicId,
    },
    mapping: mapping(fixtureId, mappingId, source.id, topicId),
    source,
    sourceMatch: {
      method: sourceMatchMethod,
      normalizedUrl: sourceMatchNormalizedUrl,
      sourceId: source.id,
    },
    topicId,
  };
}

const RESULTS = deepFreeze({
  "active-tab-example-com": resolved({
    agentContributions: 1,
    discussionId: ACTIVE_TAB_DISCUSSION_ID,
    fixtureId: "active-tab-example-com",
    humanContributions: 1,
    mappingId: "source_topic_link_fce9f35024377a07bf05fab2",
    source: {
      id: "source_0f115db062b7c0dd030b1687",
      title: "Reserved-domain demonstration A",
      url: "https://example.com/",
    },
    sourceMatchMethod: "exact-normalized-url",
    sourceMatchNormalizedUrl: "https://example.com/",
    topicId: ACTIVE_TAB_TOPIC_ID,
  }),
  "active-tab-example-org": resolved({
    agentContributions: 1,
    discussionId: ACTIVE_TAB_DISCUSSION_ID,
    fixtureId: "active-tab-example-org",
    humanContributions: 1,
    mappingId: "source_topic_link_f729c7c0bcd995b12ce16cf0",
    source: {
      id: "source_8198d1bac40a1033653a78e4",
      title: "Reserved-domain demonstration B",
      url: "https://example.org/",
    },
    sourceMatchMethod: "exact-normalized-url",
    sourceMatchNormalizedUrl: "https://example.org/",
    topicId: ACTIVE_TAB_TOPIC_ID,
  }),
  "company-story": resolved({
    agentContributions: 1,
    discussionId: SHARED_DISCUSSION_ID,
    fixtureId: "company-story",
    humanContributions: 2,
    mappingId: "source_topic_link_6dc01c0ff8d67b42f7ce9a1b",
    source: {
      id: "source_646b7822bb9c17214a290f95",
      title: "Acme announces Widget 2",
      url: "https://news.acme.example.com/widget-2",
    },
    sourceMatchMethod: "bundled-scenario",
    sourceMatchNormalizedUrl: null,
    topicId: SHARED_TOPIC_ID,
  }),
  "hostile-title": resolved({
    agentContributions: 1,
    discussionId: SHARED_DISCUSSION_ID,
    fixtureId: "hostile-title",
    humanContributions: 2,
    mappingId: "source_topic_link_acb177478b2756125b00bab1",
    source: {
      id: "source_f16cb2478f7a7cceca1af71f",
      title: "<img src=x onerror=alert(1)> remains inert fixture text",
      url: "https://hostile.example.com/widget-2",
    },
    sourceMatchMethod: "bundled-scenario",
    sourceMatchNormalizedUrl: null,
    topicId: SHARED_TOPIC_ID,
  }),
  "wire-story": resolved({
    agentContributions: 1,
    discussionId: SHARED_DISCUSSION_ID,
    fixtureId: "wire-story",
    humanContributions: 2,
    mappingId: "source_topic_link_c6f706cd6aaeafdbe141e18d",
    source: {
      id: "source_f6eaedcc244bf5d2c228bca0",
      title: "Acme announces Widget 2",
      url: "https://news.example.com/releases/widget-2",
    },
    sourceMatchMethod: "bundled-scenario",
    sourceMatchNormalizedUrl: null,
    topicId: SHARED_TOPIC_ID,
  }),
});

export const INDICATOR_SCENARIOS = deepFreeze([
  {
    description: "First Source resolved by an exact synthetic fingerprint.",
    id: "wire-story",
    label: "Wire story · resolved",
  },
  {
    description: "A second Source reaches the same Topic and Discussion.",
    id: "company-story",
    label: "Company story · same discussion",
  },
  {
    description: "Markup-like title text must render only as text.",
    id: "hostile-title",
    label: "Hostile title · inert text",
  },
  {
    description: "Ambiguous metadata abstains instead of guessing a Topic.",
    id: "ambiguous-unmapped",
    label: "Ambiguous story · unmapped",
  },
  {
    description: "A deliberately excluded context fails closed.",
    id: "unsupported-context",
    label: "Excluded context · unsupported",
  },
  {
    description: "A malformed local response becomes unavailable.",
    id: "malformed-response",
    label: "Malformed fixture · unavailable",
  },
]);

function responseFor(request, status, result = null) {
  const reasonCode = {
    resolved: null,
    unavailable: "local-lookup-unavailable",
    unmapped: "no-deterministic-mapping",
    unsupported: "local-context-unsupported",
  }[status];
  return deepFreeze({
    contractVersion: INDICATOR_LOOKUP_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    reasonCode,
    requestToken: request.requestToken,
    result,
    scenarioId: request.scenarioId,
    scope: SCOPE,
    status,
  });
}

export async function lookupIndicatorFixture(request) {
  await Promise.resolve();
  if (Object.hasOwn(RESULTS, request.scenarioId)) {
    return responseFor(request, "resolved", RESULTS[request.scenarioId]);
  }
  if (request.scenarioId === "ambiguous-unmapped") {
    return responseFor(request, "unmapped");
  }
  if (request.scenarioId === "unsupported-context") {
    return responseFor(request, "unsupported");
  }
  if (request.scenarioId === "malformed-response") {
    return deepFreeze({
      ...responseFor(request, "resolved", RESULTS["wire-story"]),
      clientSuppliedHumanCount: 999_999,
    });
  }
  return responseFor(request, "unavailable");
}

function validateNormalizedUrlLookupRequest(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Normalized URL lookup request is invalid");
  }
  const prototype = Object.getPrototypeOf(request);
  const descriptors = Object.getOwnPropertyDescriptors(request);
  const keys = Reflect.ownKeys(descriptors);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.length !== 2 ||
    !Object.hasOwn(descriptors, "normalizedUrl") ||
    !Object.hasOwn(descriptors, "requestToken") ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !["normalizedUrl", "requestToken"].includes(key) ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    ) ||
    typeof request.normalizedUrl !== "string" ||
    typeof request.requestToken !== "string" ||
    !REQUEST_TOKEN.test(request.requestToken)
  ) {
    throw new TypeError("Normalized URL lookup request is invalid");
  }
}

export async function lookupIndicatorFixtureByNormalizedUrl(request) {
  await Promise.resolve();
  validateNormalizedUrlLookupRequest(request);
  const scenarioId = ACTIVE_SCENARIO_BY_URL.get(request.normalizedUrl);
  if (scenarioId === undefined || !Object.hasOwn(RESULTS, scenarioId)) {
    throw new TypeError("Normalized URL lookup request is unsupported");
  }
  const routedRequest = Object.freeze({
    requestToken: request.requestToken,
    scenarioId,
  });
  return responseFor(routedRequest, "resolved", RESULTS[scenarioId]);
}
