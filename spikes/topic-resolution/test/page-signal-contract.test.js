import assert from "node:assert/strict";
import test from "node:test";

import {
  PAGE_SIGNAL_CONTRACT_LIMITS,
  PAGE_SIGNAL_ENVELOPE_CONTRACT_VERSION,
  PageSignalContractError,
  validateAndProjectPageMetadata,
  validatePageDocumentAttestation,
} from "../browser/core/page-signal-contract.js";
import { classifyPageSignalSnapshot } from "../browser/core/page-signal-policy.js";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const LOCAL_URL = "http://127.0.0.1:4173/p1-5c.html";
const observation = classifyPageSignalSnapshot(
  { tabId: 7, url: LOCAL_URL },
  NOW,
);

function candidate(source, value) {
  return { source, value };
}

function metadataResult(overrides = {}) {
  return {
    candidates: {
      canonical: [candidate("link-rel-canonical", "/p1-5c.html#canonical")],
      description: [
        candidate("meta-property-og-description", " Primary   description "),
        candidate("meta-name-description", "Fallback description"),
        candidate("meta-name-twitter-description", "Social description"),
      ],
      publishedAtHint: [
        candidate(
          "meta-property-article-published-time",
          "2026-01-15T10:30:00Z",
        ),
      ],
      robots: [candidate("meta-name-robots", "index, follow")],
      tdmReservation: [candidate("meta-name-tdm-reservation", "0")],
      title: [
        candidate("meta-property-og-title", " Primary\n title "),
        candidate("meta-name-twitter-title", "Social title"),
        candidate("title-element", "Element title"),
      ],
      ...overrides.candidates,
    },
    contractVersion: "page-metadata-candidates/1.0.0",
    documentUrl: `${LOCAL_URL}#document-fragment`,
    isTopLevel: true,
    status: "collected",
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "candidates"),
    ),
  };
}

function expectContractError(code, operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof PageSignalContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("strict candidates project to a bounded immutable envelope with precedence", () => {
  const envelope = validateAndProjectPageMetadata(metadataResult(), observation);
  assert.deepEqual(envelope, {
    canonicalHint: LOCAL_URL,
    context: {
      contextId: "p1-5c-controlled-fixture",
      observedUrl: LOCAL_URL,
      policyReviewExpiresAt: null,
      rightsBasis: "project-created-synthetic",
    },
    contractVersion: PAGE_SIGNAL_ENVELOPE_CONTRACT_VERSION,
    description: "Primary description",
    provenance: {
      canonicalHint: "link-rel-canonical",
      description: "meta-property-og-description",
      publishedAtHint: "meta-property-article-published-time",
      title: "meta-property-og-title",
    },
    publishedAtHint: "2026-01-15T10:30:00Z",
    scope: {
      matchingUse: "none",
      noAutomaticSemanticJoin: true,
      publicationTimeUse: "context-only",
      rawRetained: false,
      topLevelOnly: true,
    },
    title: "Primary title",
  });
  assert.ok(Object.isFrozen(envelope));
  assert.ok(Object.isFrozen(envelope.context));
  assert.ok(Object.isFrozen(envelope.provenance));
  assert.ok(Object.isFrozen(envelope.scope));
});

test("missing optional fields stay absent while title remains required", () => {
  const envelope = validateAndProjectPageMetadata(
    metadataResult({
      candidates: {
        canonical: [],
        description: [],
        publishedAtHint: [],
        robots: [],
        tdmReservation: [],
        title: [candidate("title-element", "Fallback title")],
      },
    }),
    observation,
  );
  assert.equal(envelope.canonicalHint, null);
  assert.equal(envelope.description, null);
  assert.equal(envelope.publishedAtHint, null);
  assert.equal(envelope.provenance.canonicalHint, null);
  assert.equal(envelope.title, "Fallback title");

  expectContractError("MISSING_METADATA", () =>
    validateAndProjectPageMetadata(
      metadataResult({ candidates: { title: [] } }),
      observation,
    ),
  );
});

test("same-precedence duplicates must agree and invalid higher precedence never falls back", () => {
  const duplicate = metadataResult({
    candidates: {
      title: [
        candidate("meta-property-og-title", "Same title"),
        candidate("meta-property-og-title", "Same   title"),
        candidate("title-element", "Fallback"),
      ],
    },
  });
  assert.equal(
    validateAndProjectPageMetadata(duplicate, observation).title,
    "Same title",
  );

  expectContractError("AMBIGUOUS_METADATA", () =>
    validateAndProjectPageMetadata(
      metadataResult({
        candidates: {
          title: [
            candidate("meta-property-og-title", "First"),
            candidate("meta-property-og-title", "Second"),
            candidate("title-element", "Fallback"),
          ],
        },
      }),
      observation,
    ),
  );
  expectContractError("INVALID_CANDIDATE", () =>
    validateAndProjectPageMetadata(
      metadataResult({
        candidates: {
          title: [
            candidate(
              "meta-property-og-title",
              "x".repeat(PAGE_SIGNAL_CONTRACT_LIMITS.maximumTitleCodeUnits + 1),
            ),
            candidate("title-element", "Fallback"),
          ],
        },
      }),
      observation,
    ),
  );
  expectContractError("INVALID_CANDIDATE", () =>
    validateAndProjectPageMetadata(
      metadataResult({
        candidates: {
          title: [
            candidate("meta-property-og-title", ""),
            candidate("title-element", "Fallback"),
          ],
        },
      }),
      observation,
    ),
  );
});

test("canonical hints are unique, queryless, same-origin, and resolved without a page base", () => {
  assert.equal(
    validateAndProjectPageMetadata(metadataResult(), observation).canonicalHint,
    LOCAL_URL,
  );
  for (const canonical of [
    "https://example.com/p1-5c.html",
    "/p1-5c.html?tracking=1",
    "https://user@127.0.0.1:4173/p1-5c.html",
    "javascript:alert(1)",
    "",
  ]) {
    expectContractError(
      canonical === "" ? "AMBIGUOUS_METADATA" : "INVALID_CANDIDATE",
      () =>
        validateAndProjectPageMetadata(
          metadataResult({
            candidates: {
              canonical: [candidate("link-rel-canonical", canonical)],
            },
          }),
          observation,
        ),
    );
  }
  expectContractError("AMBIGUOUS_METADATA", () =>
    validateAndProjectPageMetadata(
      metadataResult({
        candidates: {
          canonical: [
            candidate("link-rel-canonical", LOCAL_URL),
            candidate("link-rel-canonical", LOCAL_URL),
          ],
        },
      }),
      observation,
    ),
  );
});

test("in-head robots and TDM controls fail closed without claiming complete policy detection", () => {
  for (const robots of [
    "noindex",
    "index, nosnippet",
    "unknown-directive",
    "",
  ]) {
    expectContractError("POLICY_SIGNAL_DENIED", () =>
      validateAndProjectPageMetadata(
        metadataResult({
          candidates: {
            robots: [candidate("meta-name-robots", robots)],
          },
        }),
        observation,
      ),
    );
  }
  for (const reservation of ["1", "unknown", ""]) {
    expectContractError("POLICY_SIGNAL_DENIED", () =>
      validateAndProjectPageMetadata(
        metadataResult({
          candidates: {
            tdmReservation: [
              candidate("meta-name-tdm-reservation", reservation),
            ],
          },
        }),
        observation,
      ),
    );
  }
  expectContractError("POLICY_SIGNAL_DENIED", () =>
    validateAndProjectPageMetadata(
      metadataResult({
        candidates: {
          tdmReservation: [
            candidate("meta-name-tdm-reservation", "0"),
            candidate("meta-name-tdm-reservation", "1"),
          ],
        },
      }),
      observation,
    ),
  );
});

test("publication hints require bounded timezone-qualified timestamps", () => {
  for (const value of [
    "2026-01-15",
    "2026-01-15T10:30:00",
    "not-a-date",
    "2026-01-15T10:30:00.1234Z",
    "2026-02-30T10:30:00Z",
    "2026-01-15T10:30:00+14:01",
  ]) {
    expectContractError("INVALID_CANDIDATE", () =>
      validateAndProjectPageMetadata(
        metadataResult({
          candidates: {
            publishedAtHint: [
              candidate("meta-property-article-published-time", value),
            ],
          },
        }),
        observation,
      ),
    );
  }
});

test("valid publication-time changes or absence have no semantic or matching capability", () => {
  const first = validateAndProjectPageMetadata(metadataResult(), observation);
  const later = validateAndProjectPageMetadata(
    metadataResult({
      candidates: {
        publishedAtHint: [
          candidate(
            "meta-property-article-published-time",
            "2026-09-20T23:59:59+02:00",
          ),
        ],
      },
    }),
    observation,
  );
  const absent = validateAndProjectPageMetadata(
    metadataResult({ candidates: { publishedAtHint: [] } }),
    observation,
  );
  const withoutTemporalFields = (value) => {
    const clone = structuredClone(value);
    clone.publishedAtHint = null;
    clone.provenance.publishedAtHint = null;
    return clone;
  };
  assert.deepEqual(withoutTemporalFields(first), withoutTemporalFields(later));
  assert.deepEqual(withoutTemporalFields(first), withoutTemporalFields(absent));
  for (const envelope of [first, later, absent]) {
    assert.equal(envelope.scope.matchingUse, "none");
    assert.equal(envelope.scope.publicationTimeUse, "context-only");
    assert.doesNotMatch(
      JSON.stringify(envelope),
      /topicId|discussionId|fingerprint|embedding|rank|split|joinDecision/iu,
    );
  }
});

test("document URL, collected shape, source enums, arrays, and accessors are strict", () => {
  for (const result of [
    metadataResult({ documentUrl: "https://example.com/" }),
    metadataResult({ documentUrl: `${LOCAL_URL}?secret=1` }),
    metadataResult({ isTopLevel: false }),
    metadataResult({ contractVersion: "future" }),
    metadataResult({ status: "other" }),
    { contractVersion: "page-metadata-candidates/1.0.0", status: "rejected" },
  ]) {
    expectContractError(
      result.status === "rejected"
        ? "COLLECTION_REJECTED"
        : result.documentUrl?.startsWith("http") &&
            result.documentUrl !== `${LOCAL_URL}#document-fragment`
          ? "DOCUMENT_MISMATCH"
          : "INVALID_SCHEMA",
      () => validateAndProjectPageMetadata(result, observation),
    );
  }

  const wrongSource = metadataResult();
  wrongSource.candidates.title[0].source = "attacker-selector";
  expectContractError("INVALID_CANDIDATE", () =>
    validateAndProjectPageMetadata(wrongSource, observation),
  );

  const directionControl = metadataResult();
  directionControl.candidates.title[0].value = "safe\u202ehostile";
  expectContractError("INVALID_CANDIDATE", () =>
    validateAndProjectPageMetadata(directionControl, observation),
  );

  const extraArrayField = metadataResult();
  extraArrayField.candidates.title.extra = true;
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectPageMetadata(extraArrayField, observation),
  );

  let invoked = false;
  const accessor = metadataResult();
  Object.defineProperty(accessor, "status", {
    enumerable: true,
    get() {
      invoked = true;
      return "collected";
    },
  });
  expectContractError("INVALID_SCHEMA", () =>
    validateAndProjectPageMetadata(accessor, observation),
  );
  assert.equal(invoked, false);
});

test("document attestation requires the exact top-level observation", () => {
  const valid = {
    contractVersion: "page-document-attestation/1.0.0",
    documentUrl: `${LOCAL_URL}#after`,
    isTopLevel: true,
    status: "attested",
  };
  assert.equal(validatePageDocumentAttestation(valid, observation), true);
  for (const mutation of [
    { ...valid, contractVersion: "future" },
    { ...valid, documentUrl: "https://example.com/" },
    { ...valid, isTopLevel: false },
    { ...valid, status: "rejected" },
    { ...valid, extra: true },
  ]) {
    assert.throws(() => validatePageDocumentAttestation(mutation, observation));
  }
});
