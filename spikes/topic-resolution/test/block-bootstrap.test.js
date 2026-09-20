import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_BOOTSTRAP_VERSION,
  BlockBootstrapError,
  bootstrapDependencyBlocks,
} from "../evaluation/block-bootstrap.js";
import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";

const heterogeneousBlocks = [
  {
    id: "block-a",
    goldClusterIds: ["cluster-a1", "cluster-a2"],
    confusionMatrix: {
      falseNegative: 0,
      falsePositive: 0,
      trueNegative: 6,
      truePositive: 4,
    },
  },
  {
    id: "block-b",
    goldClusterIds: ["cluster-b1"],
    confusionMatrix: {
      falseNegative: 2,
      falsePositive: 1,
      trueNegative: 3,
      truePositive: 1,
    },
  },
  {
    id: "block-c",
    goldClusterIds: ["cluster-c1", "cluster-c2", "cluster-c3"],
    confusionMatrix: {
      falseNegative: 4,
      falsePositive: 2,
      trueNegative: 2,
      truePositive: 0,
    },
  },
];

function freshBlocks() {
  return structuredClone(heterogeneousBlocks);
}

test("dependency-block bootstrap is deterministic and reports all sensitivity metrics", () => {
  const options = { replicates: 1_000, seed: "bootstrap-test-v1" };
  const report = bootstrapDependencyBlocks(freshBlocks(), options);

  assert.equal(report.methodVersion, BLOCK_BOOTSTRAP_VERSION);
  assert.equal(report.blocks, 3);
  assert.equal(report.goldClusters, 6);
  assert.equal(report.inputDigest, canonicalJsonSha256(heterogeneousBlocks));
  assert.equal(report.replicates, 1_000);
  assert.equal(report.minimumValidReplicatesForInterval, 1_000);
  assert.deepEqual(report.scope, {
    gateEligible: false,
    reason:
      "Dependency-block bootstrap is a correlation sensitivity analysis; gate evidence requires a separately frozen held-out evaluation and Wilson bound",
    sensitivityOnly: true,
  });
  assert.deepEqual(report.pointConfusionMatrix, {
    falseNegative: 6,
    falsePositive: 3,
    trueNegative: 11,
    truePositive: 5,
  });
  assert.equal(report.metrics.precision.pointEstimate, 5 / 8);
  assert.equal(report.metrics.recall.pointEstimate, 5 / 11);
  assert.equal(report.metrics.falseMergeRate.pointEstimate, 3 / 8);
  assert.equal(report.metrics.falseSplitRate.pointEstimate, 6 / 11);
  assert.equal(report.metrics.specificity.pointEstimate, 11 / 14);
  assert.equal(report.metrics.accuracy.pointEstimate, 16 / 25);
  for (const metric of Object.values(report.metrics)) {
    assert.equal(metric.validReplicates + metric.undefinedReplicates, 1_000);
  }
  assert.deepEqual(report.metrics.precision.percentileInterval95, { lower: 0, upper: 1 });
  assert.deepEqual(report.selection.distinctBlocksPerReplicate, {
    maximum: 3,
    mean: 2.101,
    minimum: 1,
  });
  assert.deepEqual(report.selection.distinctGoldClustersPerReplicate, {
    maximum: 6,
    mean: 4.209,
    minimum: 1,
  });
  assert.equal(
    report.selection.sha256,
    "sha256:753de1f377aa5354751dde8777a73d815acee0c7f15cddac1a20089c630024f8",
  );
  assert.deepEqual(bootstrapDependencyBlocks(freshBlocks(), options), report);

  const otherSeed = bootstrapDependencyBlocks(freshBlocks(), {
    ...options,
    seed: "bootstrap-test-v2",
  });
  assert.notEqual(otherSeed.selection.sha256, report.selection.sha256);
});

test("identical block contributions remain fixed under whole-block resampling", () => {
  const blocks = ["a", "b"].map((suffix) => ({
    id: `block-${suffix}`,
    goldClusterIds: [`cluster-${suffix}`],
    confusionMatrix: {
      falseNegative: 1,
      falsePositive: 0,
      trueNegative: 2,
      truePositive: 1,
    },
  }));
  const report = bootstrapDependencyBlocks(blocks, {
    replicates: 1_000,
    seed: "identical-blocks-v1",
  });

  assert.deepEqual(report.metrics.precision.percentileInterval95, { lower: 1, upper: 1 });
  assert.deepEqual(report.metrics.recall.percentileInterval95, { lower: 0.5, upper: 0.5 });
  assert.equal(report.metrics.precision.undefinedReplicates, 0);
});

test("zero-denominator replicates remain undefined instead of becoming perfect", () => {
  const blocks = [
    {
      id: "block-a",
      goldClusterIds: ["cluster-a"],
      confusionMatrix: {
        falseNegative: 1,
        falsePositive: 0,
        trueNegative: 2,
        truePositive: 0,
      },
    },
    {
      id: "block-b",
      goldClusterIds: ["cluster-b"],
      confusionMatrix: {
        falseNegative: 2,
        falsePositive: 0,
        trueNegative: 1,
        truePositive: 0,
      },
    },
  ];
  const report = bootstrapDependencyBlocks(blocks, {
    replicates: 1_000,
    seed: "undefined-precision-v1",
  });

  assert.equal(report.metrics.precision.pointEstimate, null);
  assert.equal(report.metrics.precision.percentileInterval95, null);
  assert.equal(report.metrics.precision.validReplicates, 0);
  assert.equal(report.metrics.precision.undefinedReplicates, 1_000);
  assert.equal(report.metrics.precision.conditionalOnDefinedReplicates, true);
  assert.equal(report.metrics.precision.intervalSufficient, false);
  assert.deepEqual(report.metrics.recall.percentileInterval95, { lower: 0, upper: 0 });
});

test("partially undefined intervals are explicitly conditional on defined replicates", () => {
  const blocks = [
    {
      id: "block-a",
      goldClusterIds: ["cluster-a"],
      confusionMatrix: {
        falseNegative: 1,
        falsePositive: 0,
        trueNegative: 1,
        truePositive: 0,
      },
    },
    {
      id: "block-b",
      goldClusterIds: ["cluster-b"],
      confusionMatrix: {
        falseNegative: 0,
        falsePositive: 0,
        trueNegative: 1,
        truePositive: 1,
      },
    },
  ];
  const report = bootstrapDependencyBlocks(blocks, {
    replicates: 2_000,
    seed: "partial-precision-v1",
  });
  const precision = report.metrics.precision;

  assert.ok(precision.undefinedReplicates > 0);
  assert.ok(precision.validReplicates >= report.minimumValidReplicatesForInterval);
  assert.equal(precision.conditionalOnDefinedReplicates, true);
  assert.equal(precision.intervalSufficient, true);
  assert.deepEqual(precision.percentileInterval95, { lower: 1, upper: 1 });
});

test("bootstrap rejects overlapping clusters, malformed counts, and excessive work", () => {
  const overlapping = freshBlocks();
  overlapping[1].goldClusterIds = ["cluster-a1"];
  assert.throws(
    () => bootstrapDependencyBlocks(overlapping, { replicates: 1_000, seed: "invalid-v1" }),
    (error) => error instanceof BlockBootstrapError && error.code === "OVERLAPPING_BLOCKS",
  );

  const negativeCount = freshBlocks();
  negativeCount[0].confusionMatrix.falsePositive = -1;
  assert.throws(
    () => bootstrapDependencyBlocks(negativeCount, { replicates: 1_000, seed: "invalid-v1" }),
    (error) => error instanceof BlockBootstrapError && error.code === "INVALID_INPUT",
  );

  const manyBlocks = Array.from({ length: 101 }, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    return {
      id: `block-${suffix}`,
      goldClusterIds: [`cluster-${suffix}`],
      confusionMatrix: {
        falseNegative: 0,
        falsePositive: 0,
        trueNegative: 1,
        truePositive: 0,
      },
    };
  });
  assert.throws(
    () =>
      bootstrapDependencyBlocks(manyBlocks, {
        replicates: 100_000,
        seed: "too-many-draws-v1",
      }),
    (error) => error instanceof BlockBootstrapError && error.code === "RESOURCE_LIMIT",
  );

  assert.throws(
    () => bootstrapDependencyBlocks(freshBlocks(), { replicates: 999, seed: "too-few-v1" }),
    (error) => error instanceof BlockBootstrapError && error.code === "INVALID_OPTIONS",
  );

  const nonStringIdentifier = freshBlocks();
  nonStringIdentifier[0].goldClusterIds = [{ toString: 1 }];
  assert.throws(
    () =>
      bootstrapDependencyBlocks(nonStringIdentifier, {
        replicates: 1_000,
        seed: "invalid-identifier-v1",
      }),
    (error) => error instanceof BlockBootstrapError && error.code === "INVALID_INPUT",
  );

  const oversizedIdentifier = freshBlocks();
  oversizedIdentifier[0].id = "a".repeat(1_000_000);
  assert.throws(
    () =>
      bootstrapDependencyBlocks(oversizedIdentifier, {
        replicates: 1_000,
        seed: "oversized-identifier-v1",
      }),
    (error) => error instanceof BlockBootstrapError && error.code === "INVALID_INPUT",
  );
});
