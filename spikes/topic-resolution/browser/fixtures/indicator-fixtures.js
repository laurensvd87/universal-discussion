import { INDICATOR_LOOKUP_CONTRACT_VERSION } from "../core/indicator-contract.js";

const GENERATED_AT = "2026-09-21T15:00:00.000Z";
const AUDITED_AT = "2026-09-19T10:15:30.000Z";
const SHARED_TOPIC_ID = "topic_91f792a4341063f25757f6bd";
const SHARED_DISCUSSION_ID = "discussion_7ecab0277967a7c79689cde5";
const SCOPE = Object.freeze({
  fixtureOnly: true,
  noAutomaticSemanticJoin: true,
  readOnly: true,
});
const ACTIVITY = Object.freeze({
  agentContributions: 1,
  asOf: GENERATED_AT,
  humanContributions: 2,
  scope: "topic",
  topicId: SHARED_TOPIC_ID,
});
const DISCUSSION = Object.freeze({
  id: SHARED_DISCUSSION_ID,
  topicId: SHARED_TOPIC_ID,
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function mapping(fixtureId, id, sourceId) {
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
    topicId: SHARED_TOPIC_ID,
  };
}

function resolved(source, fixtureId, mappingId) {
  return {
    activity: ACTIVITY,
    discussion: DISCUSSION,
    mapping: mapping(fixtureId, mappingId, source.id),
    source,
    topicId: SHARED_TOPIC_ID,
  };
}

const RESULTS = deepFreeze({
  "company-story": resolved(
    {
      id: "source_646b7822bb9c17214a290f95",
      title: "Acme announces Widget 2",
      url: "https://news.acme.example.com/widget-2",
    },
    "company-story",
    "source_topic_link_6dc01c0ff8d67b42f7ce9a1b",
  ),
  "hostile-title": resolved(
    {
      id: "source_f16cb2478f7a7cceca1af71f",
      title: "<img src=x onerror=alert(1)> remains inert fixture text",
      url: "https://hostile.example.com/widget-2",
    },
    "hostile-title",
    "source_topic_link_acb177478b2756125b00bab1",
  ),
  "wire-story": resolved(
    {
      id: "source_f6eaedcc244bf5d2c228bca0",
      title: "Acme announces Widget 2",
      url: "https://news.example.com/releases/widget-2",
    },
    "wire-story",
    "source_topic_link_c6f706cd6aaeafdbe141e18d",
  ),
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
    unavailable: "fixture-lookup-unavailable",
    unmapped: "no-deterministic-mapping",
    unsupported: "fixture-context-unsupported",
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
