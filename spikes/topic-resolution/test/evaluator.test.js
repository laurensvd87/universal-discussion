import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluatePilot,
  PILOT_REPORT_VERSION,
  PilotDatasetError,
  wilsonScoreInterval,
} from "../evaluation/evaluator.js";
import { createExecutionMetadata } from "../evaluation/execution-metadata.js";

const datasetUrl = new URL("../evaluation/pilot-pairs.json", import.meta.url);
const sourceDataset = JSON.parse(await readFile(datasetUrl, "utf8"));

function freshDataset() {
  return structuredClone(sourceDataset);
}

test("pilot corpus validates and reproduces its deterministic baseline", () => {
  const report = evaluatePilot(freshDataset());

  assert.equal(report.sample.pairs, 24);
  assert.equal(report.sample.clusters, 20);
  assert.deepEqual(report.sample.caseCounts, {
    "duplicate-syndication-positive": 8,
    "same-entity-title-hard-negative": 8,
    "update-continuation-boundary": 4,
    "unrelated-control": 4,
  });
  assert.deepEqual(report.confusionMatrix, {
    truePositive: 4,
    falsePositive: 0,
    trueNegative: 16,
    falseNegative: 4,
  });
  assert.deepEqual(
    {
      precision: report.metrics.precision,
      recall: report.metrics.recall,
      specificity: report.metrics.specificity,
      accuracy: report.metrics.accuracy,
    },
    {
      precision: 1,
      recall: 0.5,
      specificity: 1,
      accuracy: 20 / 24,
    },
  );
  assert.equal(report.reportVersion, PILOT_REPORT_VERSION);
});

test("pilot reports uncertainty, coverage, gate insufficiency, and resource use", () => {
  const report = evaluatePilot(freshDataset());
  const precisionInterval = report.metrics.confidenceIntervals95.precision;
  const recallInterval = report.metrics.confidenceIntervals95.recall;

  assert.equal(precisionInterval.successes, 4);
  assert.equal(precisionInterval.total, 4);
  assert.ok(Math.abs(precisionInterval.lower - 0.5101091635454027) < 1e-15);
  assert.equal(precisionInterval.upper, 1);
  assert.equal(recallInterval.successes, 4);
  assert.equal(recallInterval.total, 8);
  assert.ok(Math.abs(recallInterval.lower - 0.21521606221387757) < 1e-15);
  assert.ok(Math.abs(recallInterval.upper - 0.7847839377861224) < 1e-15);

  assert.deepEqual(report.classification, {
    abstentions: 0,
    coverage: 1,
    evaluatedPairs: 24,
  });
  assert.deepEqual(report.automaticJoinEvidence, {
    decisions: 4,
    goldClustersTouched: 4,
    heldOut: false,
    minimumDecisions: 60,
    minimumGoldClusters: 20,
    sufficientForGate: false,
    reasons: [
      "pilot is not a cluster-separated held-out evaluation",
      "automatic-join decisions 4 < 60",
      "gold clusters touched 4 < 20",
    ],
  });
  assert.deepEqual(report.resourceAccounting, {
    externalCashCost: { amount: 0, currency: "USD" },
    providerCalls: 0,
    scope: "offline-local-evaluator",
  });
});

test("Wilson intervals reject invalid counts and distinguish no evidence", () => {
  assert.equal(wilsonScoreInterval(0, 0), null);
  assert.throws(() => wilsonScoreInterval(-1, 1), TypeError);
  assert.throws(() => wilsonScoreInterval(2, 1), TypeError);
  assert.throws(() => wilsonScoreInterval(0.5, 1), TypeError);
});

test("execution metadata reports scoped nonnegative timing and runtime identity", () => {
  const metadata = createExecutionMetadata({
    architecture: "test-architecture",
    elapsedNanoseconds: 24_000_000n,
    pairCount: 24,
    platform: "test-platform",
    runtimeVersion: "v-test",
  });

  assert.deepEqual(metadata, {
    architecture: "test-architecture",
    elapsedMilliseconds: 24,
    measuredScope: "in-process evaluatePilot; excludes file read and JSON parse",
    millisecondsPerPair: 1,
    platform: "test-platform",
    runtime: "node",
    runtimeVersion: "v-test",
  });
  assert.throws(
    () => createExecutionMetadata({ ...metadata, elapsedNanoseconds: -1n, pairCount: 24 }),
    TypeError,
  );
  assert.throws(
    () => createExecutionMetadata({ ...metadata, elapsedNanoseconds: 0n, pairCount: 0 }),
    TypeError,
  );
});

test("pilot exceeds independent-review coverage and retains disagreement reporting", () => {
  const report = evaluatePilot(freshDataset());

  assert.equal(report.sample.reviewedPairs, 6);
  assert.equal(report.sample.requiredReviews, 5);
  assert.equal(report.sample.reviewCoverage, 0.25);
  assert.deepEqual(report.sample.disagreements, []);
});

test("baseline uses only exact URL/fingerprint signals and fails separate otherwise", () => {
  const report = evaluatePilot(freshDataset());
  const methodCounts = Object.create(null);
  for (const decision of report.decisions) {
    methodCounts[decision.method] = (methodCounts[decision.method] ?? 0) + 1;
  }

  assert.deepEqual({ ...methodCounts }, {
    "exact-content-fingerprint": 3,
    "exact-normalized-url": 1,
    "fail-separate": 20,
  });
  assert.equal(
    report.decisions.find((decision) => decision.pairId === "pair-dup-transit-rewrite")
      .predictedLabel,
    "different-topic",
  );
});

test("review-only titles and summaries cannot leak into baseline predictions", () => {
  const original = evaluatePilot(freshDataset());
  const alteredDataset = freshDataset();
  for (const source of alteredDataset.sources) {
    source.title = "Identical synthetic review title";
    source.factSummary = "Identical synthetic review summary.";
  }
  const altered = evaluatePilot(alteredDataset);

  assert.deepEqual(altered.confusionMatrix, original.confusionMatrix);
  assert.deepEqual(
    altered.decisions.map(({ pairId, predictedLabel, method }) => ({
      pairId,
      predictedLabel,
      method,
    })),
    original.decisions.map(({ pairId, predictedLabel, method }) => ({
      pairId,
      predictedLabel,
      method,
    })),
  );
});

test("pilot rejects insufficient independent review", () => {
  const dataset = freshDataset();
  for (const pair of dataset.pairs) {
    pair.secondaryReview = null;
  }

  assert.throws(
    () => evaluatePilot(dataset),
    (error) => error instanceof PilotDatasetError && error.code === "INSUFFICIENT_REVIEW",
  );
});

test("pilot rejects unknown fields and malformed timestamps deterministically", () => {
  const unknownFieldDataset = freshDataset();
  unknownFieldDataset.sources[0].rawBody = "not permitted";
  assert.throws(
    () => evaluatePilot(unknownFieldDataset),
    (error) => error instanceof PilotDatasetError && error.code === "INVALID_SCHEMA",
  );

  const malformedDateDataset = freshDataset();
  malformedDateDataset.sources[0].publishedAt = "not-a-date";
  assert.throws(
    () => evaluatePilot(malformedDateDataset),
    (error) => error instanceof PilotDatasetError && error.code === "INVALID_SCHEMA",
  );
});
