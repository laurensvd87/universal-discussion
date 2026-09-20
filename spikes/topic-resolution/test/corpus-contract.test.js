import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  LABELED_CORPUS_CONTRACT_VERSION,
  LabeledCorpusError,
  createResolvedEvaluationDataset,
  validateLabeledCorpus,
} from "../evaluation/corpus-contract.js";
import {
  SPLIT_CONTRACT_VERSION,
  SplitContractError,
  validateLabeledCorpusDependencyBlockSplit,
} from "../evaluation/split-contract.js";

const PRIMARY_REVIEWED_AT = "2026-09-20T10:00:00.000Z";
const SECONDARY_REVIEWED_AT = "2026-09-20T11:00:00.000Z";
const ADJUDICATED_AT = "2026-09-20T12:00:00.000Z";
const NEGATIVE_CASE_TYPES = [
  "adversarial-title",
  "related-distinct",
  "unrelated-control",
  "update-continuation-boundary",
];

function sourceId(clusterIndex, suffix) {
  return `source-${String(clusterIndex).padStart(3, "0")}-${suffix}`;
}

function decision(label, reviewerId, reviewedAt) {
  return {
    label,
    rationale: `Generated ${label} contract-test decision.`,
    reviewedAt,
    reviewerId,
  };
}

function buildCorpus({ clusterCount = 50, pairCount = 200, reviewedPairs = 40 } = {}) {
  const sources = [];
  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
    for (const suffix of ["a", "b"]) {
      const id = sourceId(clusterIndex, suffix);
      sources.push({
        clusterId: `cluster-${String(clusterIndex).padStart(3, "0")}`,
        factSummary: `Synthetic development ${clusterIndex}, variant ${suffix}.`,
        id,
        provenance: {
          containsCopiedArticleText: false,
          containsPersonalData: false,
          kind: "project-created-synthetic",
          origin: null,
          repositoryUseApproved: true,
          rightsBasis: "project-created",
        },
        publishedAt: "2026-09-20T09:00:00.000Z",
        title: `Synthetic story ${clusterIndex} ${suffix}`,
        url: `https://publisher-${String(clusterIndex).padStart(3, "0")}.example.com/story-${suffix}`,
      });
    }
  }

  const pairSpecs = [];
  for (let clusterIndex = 0; clusterIndex < clusterCount && pairSpecs.length < pairCount; clusterIndex += 1) {
    pairSpecs.push({
      caseType: clusterIndex % 2 === 0 ? "duplicate-positive" : "syndication-positive",
      label: "same-topic",
      sourceAId: sourceId(clusterIndex, "a"),
      sourceBId: sourceId(clusterIndex, "b"),
    });
  }
  const boundary = Math.ceil(clusterCount / 2);
  const groups = [
    [0, boundary],
    [boundary, clusterCount],
  ];
  outer: for (const [start, end] of groups) {
    for (let left = start; left < end; left += 1) {
      for (let right = left + 1; right < end; right += 1) {
        if (pairSpecs.length >= pairCount) break outer;
        const negativeIndex = pairSpecs.length - Math.min(clusterCount, pairCount);
        const endpoints = [sourceId(left, "a"), sourceId(right, "a")].sort();
        pairSpecs.push({
          caseType: NEGATIVE_CASE_TYPES[negativeIndex % NEGATIVE_CASE_TYPES.length],
          label: "different-topic",
          sourceAId: endpoints[0],
          sourceBId: endpoints[1],
        });
      }
    }
  }
  if (pairSpecs.length !== pairCount) {
    throw new Error("Generated corpus parameters do not provide enough unique pairs");
  }

  const pairs = pairSpecs.map((spec, index) => ({
    adjudication: null,
    caseType: spec.caseType,
    id: `pair-${String(index).padStart(4, "0")}`,
    primaryDecision: decision(spec.label, "reviewer-primary", PRIMARY_REVIEWED_AT),
    secondaryReview:
      index < reviewedPairs
        ? {
            ...decision(spec.label, "reviewer-secondary", SECONDARY_REVIEWED_AT),
            reviewMethod: "blinded-source-metadata",
          }
        : null,
    sourceAId: spec.sourceAId,
    sourceBId: spec.sourceBId,
  }));

  return {
    corpusContractVersion: LABELED_CORPUS_CONTRACT_VERSION,
    createdAt: "2026-09-20T08:00:00.000Z",
    datasetVersion: "generated-corpus-contract-test/1.0.0",
    pairs,
    provenanceReview: {
      reviewedAt: null,
      reviewerId: null,
      status: "pending",
    },
    scope: {
      contentClass: "editorial-article",
      language: "en",
      topicDefinition: "One time-bounded independently reportable atomic factual development.",
    },
    sources,
    topicDefinitionVersion: "editorial-story-cluster/1.0.0",
  };
}

function buildSplitManifest(evaluationDataset) {
  const clusterIds = [...new Set(evaluationDataset.sources.map((source) => source.clusterId))];
  const boundary = Math.ceil(clusterIds.length / 2);
  return {
    assignmentAlgorithm: "explicit-predeclared/1.0.0",
    assignmentSeed: null,
    blocks: [
      {
        clusterIds: clusterIds.slice(0, boundary),
        id: "block-heldout",
        partitionId: "partition-heldout",
      },
      {
        clusterIds: clusterIds.slice(boundary),
        id: "block-tuning",
        partitionId: "partition-tuning",
      },
    ],
    contractVersion: SPLIT_CONTRACT_VERSION,
    datasetDigest: canonicalJsonSha256(evaluationDataset),
    datasetDigestAlgorithm: "canonical-json-sha256/1.0.0",
    datasetVersion: evaluationDataset.datasetVersion,
    demonstrationOnly: false,
    frozenAt: "2026-09-20T13:00:00.000Z",
    manifestVersion: "generated-split-contract-test/1.0.0",
    partitions: [
      { id: "partition-heldout", role: "heldout" },
      { id: "partition-tuning", role: "tuning" },
    ],
    purpose: "frozen-evaluation",
    topicDefinitionVersion: evaluationDataset.topicDefinitionVersion,
  };
}

function hasReason(report, prefix) {
  return report.readiness.reasons.some((reason) => reason.startsWith(prefix));
}

test("minimum future corpus is structurally ready but remains gate-ineligible", () => {
  const dataset = buildCorpus();
  const report = validateLabeledCorpus(dataset);
  const evaluationDataset = createResolvedEvaluationDataset(dataset);

  assert.equal(report.contractVersion, LABELED_CORPUS_CONTRACT_VERSION);
  assert.equal(report.corpusDigest, canonicalJsonSha256(dataset));
  assert.equal(report.evaluationDatasetDigest, canonicalJsonSha256(evaluationDataset));
  assert.equal(report.evaluationDatasetVersion, evaluationDataset.projectionVersion);
  assert.deepEqual(report.sample, {
    caseCounts: {
      "adversarial-title": 38,
      "duplicate-positive": 25,
      "related-distinct": 38,
      "syndication-positive": 25,
      "unrelated-control": 37,
      "update-continuation-boundary": 37,
    },
    eligibleClusters: 50,
    eligiblePairs: 200,
    eligibleSources: 100,
    excludedUnresolvedPairs: 0,
    totalPairs: 200,
    totalSources: 100,
  });
  assert.equal(report.review.independentlyReviewedEligiblePairs, 40);
  assert.equal(report.review.requiredReviews, 40);
  assert.equal(report.review.reviewCoverage, 0.2);
  assert.equal(report.readiness.structurallyReadyForSplitFreeze, true);
  assert.deepEqual(report.readiness.reasons, []);
  assert.deepEqual(report.scope, {
    gateEligible: false,
    reason:
      "Schema readiness is not held-out quality, provenance acceptance, or a frozen evaluation policy",
  });
  assert.equal(report.provenance.externalTrustReviewRequired, true);
  assert.equal(report.provenance.declaredReviewStatus, "pending");
  assert.deepEqual(report.provenance.pendingRepositoryUseApprovalSourceIds, []);
  assert.deepEqual(validateLabeledCorpus(structuredClone(dataset)), report);
});

test("collection thresholds report deterministic not-ready reasons without rejecting progress", () => {
  const tooFewPairDataset = buildCorpus({ pairCount: 199 });
  const tooFewPairs = validateLabeledCorpus(tooFewPairDataset);
  assert.equal(tooFewPairs.readiness.structurallyReadyForSplitFreeze, false);
  assert.equal(hasReason(tooFewPairs, "eligible pairs 199 < 200"), true);
  assert.throws(
    () =>
      validateLabeledCorpusDependencyBlockSplit(
        tooFewPairDataset,
        buildSplitManifest(createResolvedEvaluationDataset(tooFewPairDataset)),
      ),
    (error) => error instanceof SplitContractError && error.code === "CORPUS_NOT_READY",
  );

  const tooFewClusters = validateLabeledCorpus(buildCorpus({ clusterCount: 49 }));
  assert.equal(tooFewClusters.readiness.structurallyReadyForSplitFreeze, false);
  assert.equal(hasReason(tooFewClusters, "eligible gold clusters 49 < 50"), true);

  const tooFewReviews = validateLabeledCorpus(buildCorpus({ reviewedPairs: 39 }));
  assert.equal(tooFewReviews.readiness.structurallyReadyForSplitFreeze, false);
  assert.equal(
    hasReason(tooFewReviews, "independently reviewed eligible pairs 39 < 40"),
    true,
  );

  const missingCaseDataset = buildCorpus();
  for (const pair of missingCaseDataset.pairs) {
    if (pair.caseType === "adversarial-title") pair.caseType = "related-distinct";
  }
  const missingCase = validateLabeledCorpus(missingCaseDataset);
  assert.equal(missingCase.readiness.structurallyReadyForSplitFreeze, false);
  assert.equal(
    hasReason(missingCase, "missing eligible case types [adversarial-title]"),
    true,
  );
});

test("unresolved disagreements cannot inflate readiness and adjudication restores eligibility", () => {
  const unresolvedDataset = buildCorpus();
  const disputedPair = unresolvedDataset.pairs[0];
  disputedPair.secondaryReview.label = "different-topic";
  const unresolvedReport = validateLabeledCorpus(unresolvedDataset);
  const unresolvedEvaluation = createResolvedEvaluationDataset(unresolvedDataset);

  assert.equal(unresolvedReport.sample.eligiblePairs, 199);
  assert.equal(unresolvedReport.sample.excludedUnresolvedPairs, 1);
  assert.equal(unresolvedReport.review.independentlyReviewedEligiblePairs, 39);
  assert.deepEqual(unresolvedReport.review.unresolvedPairIds, [disputedPair.id]);
  assert.equal(unresolvedReport.readiness.structurallyReadyForSplitFreeze, false);
  assert.equal(unresolvedEvaluation.pairs.some((pair) => pair.id === disputedPair.id), false);

  disputedPair.adjudication = {
    ...decision("same-topic", "reviewer-adjudicator", ADJUDICATED_AT),
    reviewMethod: "independent-adjudication",
  };
  const adjudicatedReport = validateLabeledCorpus(unresolvedDataset);
  assert.equal(adjudicatedReport.sample.eligiblePairs, 200);
  assert.equal(adjudicatedReport.sample.excludedUnresolvedPairs, 0);
  assert.equal(adjudicatedReport.review.independentlyReviewedEligiblePairs, 40);
  assert.equal(adjudicatedReport.review.adjudicatedDisagreements, 1);
  assert.equal(adjudicatedReport.readiness.structurallyReadyForSplitFreeze, true);
  assert.deepEqual(adjudicatedReport.review.disagreements[0], {
    adjudicationLabel: "same-topic",
    pairId: disputedPair.id,
    primaryLabel: "same-topic",
    secondaryLabel: "different-topic",
  });
});

test("resolved evaluation view uses independent adjudication rather than the primary label", () => {
  const dataset = buildCorpus();
  const pair = dataset.pairs[0];
  pair.primaryDecision.label = "different-topic";
  pair.secondaryReview.label = "same-topic";
  pair.adjudication = {
    ...decision("same-topic", "reviewer-adjudicator", ADJUDICATED_AT),
    reviewMethod: "independent-adjudication",
  };

  const evaluationDataset = createResolvedEvaluationDataset(dataset);
  assert.deepEqual(evaluationDataset.pairs[0].resolvedGoldDecision, {
    label: "same-topic",
    resolutionMethod: "independent-adjudication",
  });
  assert.equal(
    validateLabeledCorpus(dataset).readiness.structurallyReadyForSplitFreeze,
    true,
  );
  const splitReport = validateLabeledCorpusDependencyBlockSplit(
    dataset,
    buildSplitManifest(evaluationDataset),
  );
  assert.equal(splitReport.corpus.evaluationDatasetDigest, canonicalJsonSha256(evaluationDataset));
  assert.equal(splitReport.split.datasetDigest, splitReport.corpus.evaluationDatasetDigest);
  assert.equal(splitReport.split.evidence.heldOut, false);

  const reviewMutation = structuredClone(dataset);
  reviewMutation.pairs[1].primaryDecision.rationale = "Changed review-history rationale.";
  const mutatedEvaluationDataset = createResolvedEvaluationDataset(reviewMutation);
  assert.notEqual(mutatedEvaluationDataset.sourceCorpusDigest, evaluationDataset.sourceCorpusDigest);
  assert.notEqual(canonicalJsonSha256(mutatedEvaluationDataset), canonicalJsonSha256(evaluationDataset));

  const reviewerCollision = buildCorpus();
  reviewerCollision.pairs[0].secondaryReview.reviewerId = "reviewer-primary";
  assert.throws(
    () => validateLabeledCorpus(reviewerCollision),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_REVIEW",
  );

  const whitespaceIdentityCollision = buildCorpus();
  whitespaceIdentityCollision.pairs[0].secondaryReview.reviewerId = "reviewer-primary ";
  assert.throws(
    () => validateLabeledCorpus(whitespaceIdentityCollision),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_REVIEW",
  );

  const adjudicatorCollision = buildCorpus();
  adjudicatorCollision.pairs[0].secondaryReview.label = "different-topic";
  adjudicatorCollision.pairs[0].adjudication = {
    ...decision("same-topic", "reviewer-primary", ADJUDICATED_AT),
    reviewMethod: "independent-adjudication",
  };
  assert.throws(
    () => validateLabeledCorpus(adjudicatorCollision),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_REVIEW",
  );

  const wrongCase = buildCorpus();
  wrongCase.pairs[0].caseType = "related-distinct";
  assert.throws(
    () => validateLabeledCorpus(wrongCase),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_CASE_LABEL",
  );

  const clusterMismatch = buildCorpus();
  clusterMismatch.pairs[0].primaryDecision.label = "different-topic";
  clusterMismatch.pairs[0].secondaryReview = null;
  assert.throws(
    () => validateLabeledCorpus(clusterMismatch),
    (error) => error instanceof LabeledCorpusError && error.code === "GOLD_CLUSTER_MISMATCH",
  );
});

test("corpus contract rejects raw fields, duplicate pairs, and malformed source metadata", () => {
  const rawField = buildCorpus();
  rawField.sources[0].rawBody = "Article bodies are outside the corpus contract.";
  assert.throws(
    () => validateLabeledCorpus(rawField),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const duplicatePair = buildCorpus();
  duplicatePair.pairs[1].sourceAId = duplicatePair.pairs[0].sourceAId;
  duplicatePair.pairs[1].sourceBId = duplicatePair.pairs[0].sourceBId;
  assert.throws(
    () => validateLabeledCorpus(duplicatePair),
    (error) => error instanceof LabeledCorpusError && error.code === "DUPLICATE_RECORD",
  );

  const trackingUrl = buildCorpus();
  trackingUrl.sources[0].url += "?utm_source=not-canonical";
  assert.throws(
    () => validateLabeledCorpus(trackingUrl),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const malformedTimestamp = buildCorpus();
  malformedTimestamp.pairs[0].primaryDecision.reviewedAt = "not-a-timestamp";
  assert.throws(
    () => validateLabeledCorpus(malformedTimestamp),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const copiedArticleText = buildCorpus();
  copiedArticleText.sources[0].provenance.containsCopiedArticleText = true;
  assert.throws(
    () => validateLabeledCorpus(copiedArticleText),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_PROVENANCE",
  );

  const badFingerprint = buildCorpus();
  badFingerprint.sources[0].contentFingerprint = "sha256:not-hex";
  badFingerprint.sources[0].fingerprintEvidence = {
    fixtureId: "fixture-1",
    kind: "synthetic-fixture",
  };
  assert.throws(
    () => validateLabeledCorpus(badFingerprint),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const duplicateId = buildCorpus();
  duplicateId.sources[1].id = duplicateId.sources[0].id;
  assert.throws(
    () => validateLabeledCorpus(duplicateId),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const unusedSource = buildCorpus();
  unusedSource.sources.push({
    ...structuredClone(unusedSource.sources.at(-1)),
    clusterId: "cluster-999",
    id: "source-999-z",
    url: "https://publisher-999.example.com/story-z",
  });
  assert.throws(
    () => validateLabeledCorpus(unusedSource),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );
});

test("provenance declarations remain visible but never self-approve the corpus gate", () => {
  const dataset = buildCorpus();
  dataset.provenanceReview = {
    reviewedAt: "2026-09-20T12:30:00.000Z",
    reviewerId: "reviewer-provenance",
    status: "accepted",
  };
  dataset.sources[0].provenance = {
    containsCopiedArticleText: false,
    containsPersonalData: true,
    kind: "reviewed-public-metadata",
    origin: dataset.sources[0].url,
    repositoryUseApproved: false,
    rightsBasis: "manual-metadata-review",
  };
  const report = validateLabeledCorpus(dataset);

  assert.equal(report.readiness.structurallyReadyForSplitFreeze, true);
  assert.equal(report.scope.gateEligible, false);
  assert.equal(report.provenance.declarationsOnly, true);
  assert.equal(report.provenance.externalTrustReviewRequired, true);
  assert.deepEqual(report.provenance.pendingRepositoryUseApprovalSourceIds, [
    dataset.sources[0].id,
  ]);
  assert.deepEqual(report.provenance.sourceIdsDeclaringPersonalData, [dataset.sources[0].id]);

  dataset.sources[0].contentFingerprint = `sha256:${"a".repeat(64)}`;
  dataset.sources[0].fingerprintEvidence = {
    fixtureId: "fixture-1",
    kind: "synthetic-fixture",
  };
  assert.throws(
    () => validateLabeledCorpus(dataset),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_PROVENANCE",
  );

  const falseSyntheticOrigin = buildCorpus();
  falseSyntheticOrigin.sources[0].provenance.origin = falseSyntheticOrigin.sources[0].url;
  assert.throws(
    () => validateLabeledCorpus(falseSyntheticOrigin),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_PROVENANCE",
  );

  const noncanonicalProvenanceReviewer = buildCorpus();
  noncanonicalProvenanceReviewer.provenanceReview = {
    reviewedAt: "2026-09-20T12:30:00.000Z",
    reviewerId: "reviewer-provenance\n",
    status: "accepted",
  };
  assert.throws(
    () => validateLabeledCorpus(noncanonicalProvenanceReviewer),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_PROVENANCE",
  );
});

test("corpus preflight rejects behavioral, sparse, cyclic, and resource-exhausting data", () => {
  const accessorDataset = buildCorpus();
  Object.defineProperty(accessorDataset.sources[0], "title", {
    enumerable: true,
    get: () => "behavioral title",
  });
  assert.throws(
    () => validateLabeledCorpus(accessorDataset),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const sparseDataset = buildCorpus();
  sparseDataset.sources = new Array(2);
  sparseDataset.sources[0] = buildCorpus().sources[0];
  assert.throws(
    () => validateLabeledCorpus(sparseDataset),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const cyclicDataset = buildCorpus();
  cyclicDataset.pairs[0].adjudication = cyclicDataset;
  assert.throws(
    () => validateLabeledCorpus(cyclicDataset),
    (error) => error instanceof LabeledCorpusError && error.code === "INVALID_SCHEMA",
  );

  const oversizedDataset = buildCorpus();
  oversizedDataset.sources[0].title = "x".repeat(2_000_001);
  assert.throws(
    () => validateLabeledCorpus(oversizedDataset),
    (error) => error instanceof LabeledCorpusError && error.code === "RESOURCE_LIMIT",
  );

  const oversizedKeyDataset = buildCorpus();
  oversizedKeyDataset["x".repeat(2_000_001)] = true;
  assert.throws(
    () => validateLabeledCorpus(oversizedKeyDataset),
    (error) => error instanceof LabeledCorpusError && error.code === "RESOURCE_LIMIT",
  );

  const boundedDiagnosticDataset = buildCorpus();
  boundedDiagnosticDataset["y".repeat(1_000)] = true;
  assert.throws(
    () => validateLabeledCorpus(boundedDiagnosticDataset),
    (error) =>
      error instanceof LabeledCorpusError &&
      error.code === "INVALID_SCHEMA" &&
      error.message.length < 300,
  );

  const oversizedArrayDataset = buildCorpus();
  oversizedArrayDataset.pairs = new Array(100_001);
  assert.throws(
    () => validateLabeledCorpus(oversizedArrayDataset),
    (error) => error instanceof LabeledCorpusError && error.code === "RESOURCE_LIMIT",
  );
});
