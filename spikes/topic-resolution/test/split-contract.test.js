import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import { PilotDatasetError } from "../evaluation/evaluator.js";
import {
  SplitContractError,
  validateDependencyBlockSplit,
  validatePilotDependencyBlockSplit,
} from "../evaluation/split-contract.js";

const datasetUrl = new URL("../evaluation/pilot-pairs.json", import.meta.url);
const manifestUrl = new URL("../evaluation/pilot-split-dry-run.json", import.meta.url);
const sourceDataset = JSON.parse(await readFile(datasetUrl, "utf8"));
const sourceManifest = JSON.parse(await readFile(manifestUrl, "utf8"));

function freshInputs() {
  return {
    dataset: structuredClone(sourceDataset),
    manifest: structuredClone(sourceManifest),
  };
}

test("canonical dataset digests ignore object key order and reject behavioral data", () => {
  const left = { z: [true, null], a: { second: 2, first: 1 } };
  const right = { a: { first: 1, second: 2 }, z: [true, null] };
  assert.equal(canonicalJson(left), '{"a":{"first":1,"second":2},"z":[true,null]}');
  assert.equal(canonicalJsonSha256(left), canonicalJsonSha256(right));

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), TypeError);
  assert.throws(() => canonicalJson(new Array(1)), TypeError);
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => "not data" });
  assert.throws(() => canonicalJson(accessor), TypeError);
});

test("pilot dry-run split binds the corpus and isolates four dependency blocks", () => {
  const { dataset, manifest } = freshInputs();
  const report = validatePilotDependencyBlockSplit(dataset, manifest);

  assert.equal(report.datasetDigest, manifest.datasetDigest);
  assert.equal(report.manifestDigest, canonicalJsonSha256(manifest));
  assert.equal(report.topicDefinitionVersion, dataset.topicDefinitionVersion);
  assert.equal(report.demonstrationOnly, true);
  assert.deepEqual(report.evidence, {
    heldOut: false,
    reasons: ["manifest is marked demonstrationOnly", "no partition has the heldout role"],
    sufficientForGate: false,
  });
  assert.deepEqual(
    report.blocks.map(({ clusters, connectedComponents, pairs, sources }) => ({
      clusters,
      connectedComponents,
      pairs,
      sources,
    })),
    Array.from({ length: 4 }, () => ({
      clusters: 5,
      connectedComponents: 1,
      pairs: 6,
      sources: 7,
    })),
  );
  assert.deepEqual(
    report.partitions.map(
      ({ blocks, caseCounts, clusters, labelCounts, pairs, role, sources }) => ({
        blocks,
        caseCounts,
        clusters,
        labelCounts,
        pairs,
        role,
        sources,
      }),
    ),
    Array.from({ length: 2 }, () => ({
      blocks: 2,
      caseCounts: {
        "duplicate-syndication-positive": 4,
        "same-entity-title-hard-negative": 4,
        "unrelated-control": 2,
        "update-continuation-boundary": 2,
      },
      clusters: 10,
      labelCounts: { "different-topic": 8, "same-topic": 4 },
      pairs: 12,
      role: "dry-run",
      sources: 14,
    })),
  );
  assert.deepEqual(
    validatePilotDependencyBlockSplit(dataset, manifest),
    report,
    "structural reports must be deterministic",
  );
});

test("pilot split runner rejects unknown and privacy-sensitive corpus fields", () => {
  const mutations = [
    (dataset) => {
      dataset.unknownRoot = true;
    },
    (dataset) => {
      dataset.sources[0].rawBody = "must not enter evaluator fixtures";
    },
    (dataset) => {
      dataset.pairs[0].primaryDecision.secret = "must not be retained";
    },
  ];

  for (const mutate of mutations) {
    const { dataset, manifest } = freshInputs();
    mutate(dataset);
    assert.throws(
      () => validatePilotDependencyBlockSplit(dataset, manifest),
      (error) => error instanceof PilotDatasetError && error.code === "INVALID_SCHEMA",
    );
  }
});

test("data-controlled case types cannot collide with object prototype keys", () => {
  const { dataset, manifest } = freshInputs();
  dataset.pairs[0].caseType = "constructor";
  manifest.datasetDigest = canonicalJsonSha256(dataset);

  const report = validateDependencyBlockSplit(dataset, manifest);
  const affectedBlock = report.blocks.find((block) => block.id === "block-bridge-hospital");
  assert.equal(affectedBlock.caseCounts.constructor, 1);
  assert.equal(typeof affectedBlock.caseCounts.constructor, "number");
});

test("manifest digest pins exact dependency-block assignments", () => {
  const { dataset, manifest } = freshInputs();
  const original = validateDependencyBlockSplit(dataset, manifest);
  manifest.blocks.find((block) => block.id === "block-archive-transit").partitionId = "dry-run-b";
  manifest.blocks.find((block) => block.id === "block-battery-lunar").partitionId = "dry-run-a";

  const reassigned = validateDependencyBlockSplit(dataset, manifest);
  assert.notEqual(reassigned.manifestDigest, original.manifestDigest);
  assert.equal(reassigned.manifestDigest, canonicalJsonSha256(manifest));
});

test("split manifest digest detects any corpus change", () => {
  const { dataset, manifest } = freshInputs();
  dataset.sources[0].title = "Changed after split freeze";

  assert.throws(
    () => validateDependencyBlockSplit(dataset, manifest),
    (error) => error instanceof SplitContractError && error.code === "DATASET_DIGEST_MISMATCH",
  );
});

test("split manifest requires complete exclusive cluster coverage", () => {
  const { dataset, manifest } = freshInputs();
  manifest.blocks[0].clusterIds.shift();

  assert.throws(
    () => validateDependencyBlockSplit(dataset, manifest),
    (error) => error instanceof SplitContractError && error.code === "CLUSTER_COVERAGE",
  );
});

test("cross-block negative pairs fail instead of leaking between partitions", () => {
  const { dataset, manifest } = freshInputs();
  const bridgeBlock = manifest.blocks.find((block) => block.id === "block-bridge-hospital");
  const solarBlock = manifest.blocks.find((block) => block.id === "block-solar-river");
  bridgeBlock.clusterIds = bridgeBlock.clusterIds
    .filter((id) => id !== "cluster-bridge-opening")
    .concat("cluster-solar-operations")
    .sort();
  solarBlock.clusterIds = solarBlock.clusterIds
    .filter((id) => id !== "cluster-solar-operations")
    .concat("cluster-bridge-opening")
    .sort();

  assert.throws(
    () => validateDependencyBlockSplit(dataset, manifest),
    (error) => error instanceof SplitContractError && error.code === "CROSS_BLOCK_PAIR",
  );
});

test("exact fingerprints cannot cross structural partitions", () => {
  const { dataset, manifest } = freshInputs();
  const bridge = dataset.sources.find((source) => source.id === "bridge-wire");
  const battery = dataset.sources.find((source) => source.id === "battery-publisher");
  battery.contentFingerprint = bridge.contentFingerprint;
  manifest.datasetDigest = canonicalJsonSha256(dataset);

  assert.throws(
    () => validateDependencyBlockSplit(dataset, manifest),
    (error) => error instanceof SplitContractError && error.code === "CROSS_PARTITION_SIGNAL",
  );
});

test("normalized URL variants cannot leak across structural partitions", () => {
  const { dataset, manifest } = freshInputs();
  const bridge = dataset.sources.find((source) => source.id === "bridge-wire");
  const battery = dataset.sources.find((source) => source.id === "battery-publisher");
  battery.url = `${bridge.url}?utm_source=split-test#ignored`;
  manifest.datasetDigest = canonicalJsonSha256(dataset);

  assert.throws(
    () => validateDependencyBlockSplit(dataset, manifest),
    (error) => error instanceof SplitContractError && error.code === "CROSS_PARTITION_SIGNAL",
  );
});

test("a dry-run manifest cannot claim tuning or heldout roles", () => {
  const { dataset, manifest } = freshInputs();
  manifest.partitions[1].role = "heldout";

  assert.throws(
    () => validateDependencyBlockSplit(dataset, manifest),
    (error) => error instanceof SplitContractError && error.code === "INVALID_MANIFEST",
  );
});

test("a frozen role alone still cannot claim heldout evidence", () => {
  const { dataset, manifest } = freshInputs();
  manifest.demonstrationOnly = false;
  manifest.purpose = "frozen-evaluation";
  manifest.partitions[0].role = "tuning";
  manifest.partitions[1].role = "heldout";

  const report = validateDependencyBlockSplit(dataset, manifest);
  assert.deepEqual(report.evidence, {
    heldOut: false,
    reasons: [
      "a partition role does not prove heldout chronology",
      "structural split validation alone does not establish quality evidence",
    ],
    sufficientForGate: false,
  });
});
