import { createHash } from "node:crypto";

import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "./canonical-json.js";

export const BLOCK_BOOTSTRAP_VERSION = "dependency-block-percentile-bootstrap/1.0.0";

const COUNT_FIELDS = ["falseNegative", "falsePositive", "trueNegative", "truePositive"];
const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const MASK_64 = (1n << 64n) - 1n;
const MAX_BLOCKS = 10_000;
const MAX_CLUSTERS_PER_BLOCK = 10_000;
const MAX_COUNT_PER_BLOCK = 1_000_000;
const MAX_DRAWS = 10_000_000;
const MAX_TOTAL_GOLD_CLUSTERS = 100_000;
const MAX_TOTAL_IDENTIFIER_CODE_UNITS = 2_000_000;
const MIN_REPLICATES = 1_000;
const MIN_VALID_REPLICATES_FOR_INTERVAL = 1_000;
const MAX_REPLICATES = 100_000;

export const BLOCK_BOOTSTRAP_LIMITS = Object.freeze({
  maximumDraws: MAX_DRAWS,
  maximumReplicates: MAX_REPLICATES,
  minimumReplicates: MIN_REPLICATES,
  minimumValidReplicatesForInterval: MIN_VALID_REPLICATES_FOR_INTERVAL,
});

const METRICS = Object.freeze({
  accuracy: ({ falseNegative, falsePositive, trueNegative, truePositive }) => [
    truePositive + trueNegative,
    truePositive + trueNegative + falsePositive + falseNegative,
  ],
  falseMergeRate: ({ falsePositive, truePositive }) => [
    falsePositive,
    truePositive + falsePositive,
  ],
  falseSplitRate: ({ falseNegative, truePositive }) => [
    falseNegative,
    truePositive + falseNegative,
  ],
  precision: ({ falsePositive, truePositive }) => [
    truePositive,
    truePositive + falsePositive,
  ],
  recall: ({ falseNegative, truePositive }) => [
    truePositive,
    truePositive + falseNegative,
  ],
  specificity: ({ falsePositive, trueNegative }) => [
    trueNegative,
    trueNegative + falsePositive,
  ],
});

export class BlockBootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BlockBootstrapError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BlockBootstrapError(code, message);
}

function assertExactFields(value, fields, label, code = "INVALID_INPUT") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code, `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, `${label} must not inherit data or behavior`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const unknown = keys.filter((key) => typeof key !== "string" || !fields.includes(key));
  const missing = fields.filter((key) => !Object.hasOwn(value, key));
  const behavioral = Object.values(descriptors).some(
    (descriptor) => descriptor.get || descriptor.set || !descriptor.enumerable,
  );
  if (unknown.length > 0 || missing.length > 0 || behavioral) {
    fail(
      code,
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${unknown.map(String).join(",")}]`,
    );
  }
}

function denseDataArray(value, label, minimum, maximum) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < minimum ||
    value.length > maximum
  ) {
    fail("INVALID_INPUT", `${label} must contain between ${minimum} and ${maximum} entries`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entryKeys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
  if (
    entryKeys.length !== expectedKeys.length ||
    entryKeys.some(
      (key, index) =>
        key !== expectedKeys[index] ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    )
  ) {
    fail("INVALID_INPUT", `${label} must be a dense enumerable data array`);
  }
  return expectedKeys.map((key) => descriptors[key].value);
}

function sortedUniqueIdentifiers(value, label, maximum) {
  const values = denseDataArray(value, label, 1, maximum);
  if (
    values.some(
      (entry) =>
        typeof entry !== "string" || entry.length > 128 || !IDENTIFIER.test(entry),
    ) ||
    new Set(values).size !== values.length
  ) {
    fail("INVALID_INPUT", `${label} must contain unique bounded identifiers`);
  }
  const sorted = [...values].sort();
  if (values.some((entry, index) => entry !== sorted[index])) {
    fail("INVALID_INPUT", `${label} must be sorted`);
  }
  return values;
}

function validateBlocks(blocks) {
  const blockEntries = denseDataArray(blocks, "blocks", 2, MAX_BLOCKS);
  const seenBlockIds = new Set();
  const seenClusterIds = new Set();
  let identifierCodeUnits = 0;
  let previousBlockId = "";
  for (const [index, block] of blockEntries.entries()) {
    const label = `blocks[${index}]`;
    assertExactFields(block, ["confusionMatrix", "goldClusterIds", "id"], label);
    if (
      typeof block.id !== "string" ||
      block.id.length > 128 ||
      !IDENTIFIER.test(block.id) ||
      seenBlockIds.has(block.id) ||
      (previousBlockId !== "" && block.id <= previousBlockId)
    ) {
      fail("INVALID_INPUT", "Block ids must be sorted unique bounded identifiers");
    }
    identifierCodeUnits += block.id.length;
    const goldClusterIds = sortedUniqueIdentifiers(
      block.goldClusterIds,
      `${label}.goldClusterIds`,
      MAX_CLUSTERS_PER_BLOCK,
    );
    for (const clusterId of goldClusterIds) {
      if (seenClusterIds.has(clusterId)) {
        fail("OVERLAPPING_BLOCKS", `Gold cluster ${clusterId} appears in multiple blocks`);
      }
      seenClusterIds.add(clusterId);
      identifierCodeUnits += clusterId.length;
      if (
        seenClusterIds.size > MAX_TOTAL_GOLD_CLUSTERS ||
        identifierCodeUnits > MAX_TOTAL_IDENTIFIER_CODE_UNITS
      ) {
        fail("RESOURCE_LIMIT", "Bootstrap identifiers exceed the bounded input budget");
      }
    }

    assertExactFields(block.confusionMatrix, COUNT_FIELDS, `${label}.confusionMatrix`);
    let pairCount = 0;
    for (const field of COUNT_FIELDS) {
      const count = block.confusionMatrix[field];
      if (
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > MAX_COUNT_PER_BLOCK
      ) {
        fail(
          "INVALID_INPUT",
          `${label}.confusionMatrix.${field} must be an integer from 0 to ${MAX_COUNT_PER_BLOCK}`,
        );
      }
      pairCount += count;
    }
    if (pairCount === 0) {
      fail("INVALID_INPUT", `${label} must contribute at least one evaluated pair`);
    }
    seenBlockIds.add(block.id);
    previousBlockId = block.id;
  }
  return {
    blockEntries,
    goldClusters: seenClusterIds.size,
    inputDigest: canonicalJsonSha256(blocks),
  };
}

function validateOptions(options, blockCount) {
  assertExactFields(options, ["replicates", "seed"], "options", "INVALID_OPTIONS");
  if (
    !Number.isSafeInteger(options.replicates) ||
    options.replicates < MIN_REPLICATES ||
    options.replicates > MAX_REPLICATES
  ) {
    fail(
      "INVALID_OPTIONS",
      `replicates must be an integer from ${MIN_REPLICATES} to ${MAX_REPLICATES}`,
    );
  }
  if (
    typeof options.seed !== "string" ||
    options.seed.length > 128 ||
    !IDENTIFIER.test(options.seed)
  ) {
    fail("INVALID_OPTIONS", "seed must be a bounded lowercase identifier");
  }
  if (options.replicates * blockCount > MAX_DRAWS) {
    fail("RESOURCE_LIMIT", `Bootstrap selection exceeds the ${MAX_DRAWS}-draw limit`);
  }
}

function createSplitMix64(seed) {
  const seedDigest = createHash("sha256")
    .update(`${BLOCK_BOOTSTRAP_VERSION}\0${seed}`, "utf8")
    .digest();
  let state = seedDigest.readBigUInt64BE(0);
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK_64;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    return (value ^ (value >> 31n)) & MASK_64;
  };
}

function drawIndex(nextUint64, itemCount) {
  const range = 1n << 64n;
  const count = BigInt(itemCount);
  const limit = range - (range % count);
  let value;
  do {
    value = nextUint64();
  } while (value >= limit);
  return Number(value % count);
}

function emptyMatrix() {
  return {
    falseNegative: 0,
    falsePositive: 0,
    trueNegative: 0,
    truePositive: 0,
  };
}

function addMatrix(target, contribution) {
  for (const field of COUNT_FIELDS) target[field] += contribution[field];
}

function calculateMetrics(confusionMatrix) {
  return Object.fromEntries(
    Object.entries(METRICS).map(([name, numeratorAndDenominator]) => {
      const [numerator, denominator] = numeratorAndDenominator(confusionMatrix);
      return [name, denominator === 0 ? null : numerator / denominator];
    }),
  );
}

function percentileR7(sortedValues, probability) {
  if (sortedValues.length === 0) return null;
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const fraction = position - lowerIndex;
  return (
    sortedValues[lowerIndex] +
    fraction * (sortedValues[upperIndex] - sortedValues[lowerIndex])
  );
}

function summarizeRange(values) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    sum += value;
  }
  return {
    maximum,
    mean: sum / values.length,
    minimum,
  };
}

export function bootstrapDependencyBlocks(blocks, options) {
  const { blockEntries, goldClusters, inputDigest } = validateBlocks(blocks);
  validateOptions(options, blockEntries.length);

  const pointConfusionMatrix = emptyMatrix();
  for (const block of blockEntries) addMatrix(pointConfusionMatrix, block.confusionMatrix);
  const pointMetrics = calculateMetrics(pointConfusionMatrix);
  const valuesByMetric = new Map(Object.keys(METRICS).map((name) => [name, []]));
  const undefinedByMetric = new Map(Object.keys(METRICS).map((name) => [name, 0]));
  const distinctBlocks = [];
  const distinctGoldClusters = [];
  const selectionHash = createHash("sha256");
  const nextUint64 = createSplitMix64(options.seed);

  for (let replicate = 0; replicate < options.replicates; replicate += 1) {
    const replicateMatrix = emptyMatrix();
    const selectedBlockIndexes = new Set();
    for (let draw = 0; draw < blockEntries.length; draw += 1) {
      const blockIndex = drawIndex(nextUint64, blockEntries.length);
      const block = blockEntries[blockIndex];
      selectedBlockIndexes.add(blockIndex);
      addMatrix(replicateMatrix, block.confusionMatrix);
      selectionHash.update(`${replicate}:${draw}:${block.id}\n`, "utf8");
    }
    distinctBlocks.push(selectedBlockIndexes.size);
    distinctGoldClusters.push(
      [...selectedBlockIndexes].reduce(
        (count, blockIndex) => count + blockEntries[blockIndex].goldClusterIds.length,
        0,
      ),
    );
    const replicateMetrics = calculateMetrics(replicateMatrix);
    for (const [name, value] of Object.entries(replicateMetrics)) {
      if (value === null) {
        undefinedByMetric.set(name, undefinedByMetric.get(name) + 1);
      } else {
        valuesByMetric.get(name).push(value);
      }
    }
  }

  const metricReports = {};
  for (const name of Object.keys(METRICS)) {
    const values = valuesByMetric.get(name).sort((left, right) => left - right);
    const undefinedReplicates = undefinedByMetric.get(name);
    metricReports[name] = {
      percentileInterval95:
        values.length < MIN_VALID_REPLICATES_FOR_INTERVAL
          ? null
          : {
              lower: percentileR7(values, 0.025),
              upper: percentileR7(values, 0.975),
            },
      pointEstimate: pointMetrics[name],
      conditionalOnDefinedReplicates: undefinedReplicates > 0,
      intervalSufficient: values.length >= MIN_VALID_REPLICATES_FOR_INTERVAL,
      undefinedReplicates,
      validReplicates: values.length,
    };
  }

  return {
    blocks: blockEntries.length,
    confidenceLevel: 0.95,
    goldClusters,
    inputDigest,
    inputDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    methodVersion: BLOCK_BOOTSTRAP_VERSION,
    minimumValidReplicatesForInterval: MIN_VALID_REPLICATES_FOR_INTERVAL,
    metrics: metricReports,
    percentileMethod: "linear-r7",
    pointConfusionMatrix,
    replicates: options.replicates,
    scope: {
      gateEligible: false,
      reason:
        "Dependency-block bootstrap is a correlation sensitivity analysis; gate evidence requires a separately frozen held-out evaluation and Wilson bound",
      sensitivityOnly: true,
    },
    seed: options.seed,
    selection: {
      distinctBlocksPerReplicate: summarizeRange(distinctBlocks),
      distinctGoldClustersPerReplicate: summarizeRange(distinctGoldClusters),
      draws: options.replicates * blockEntries.length,
      sha256: `sha256:${selectionHash.digest("hex")}`,
    },
    undefinedReplicatePolicy: "exclude-and-count; require minimum valid replicates for interval",
  };
}
