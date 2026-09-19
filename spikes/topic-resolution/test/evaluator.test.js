import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluatePilot, PilotDatasetError } from "../evaluation/evaluator.js";

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
  assert.deepEqual(report.metrics, {
    precision: 1,
    recall: 0.5,
    specificity: 1,
    accuracy: 20 / 24,
  });
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
