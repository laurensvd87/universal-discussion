import { normalizePublicHttpUrl } from "../src/index.js";
import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "./canonical-json.js";
import { prepareLabeledCorpusEvaluation } from "./corpus-contract.js";
import { evaluatePilot } from "./evaluator.js";

export const SPLIT_CONTRACT_VERSION = "story-dependency-block-split/1.0.0";

const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const PARTITION_ROLES = new Set(["dry-run", "heldout", "tuning"]);
const LABELS = new Set(["different-topic", "same-topic"]);

export class SplitContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SplitContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SplitContractError(code, message);
}

function assertPlainObject(value, label, code = "INVALID_MANIFEST") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code, `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, `${label} must not inherit data or behavior`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) {
    fail(code, `${label} must contain data fields only`);
  }
}

function assertExactFields(value, fields, label) {
  assertPlainObject(value, label);
  const keys = Reflect.ownKeys(value);
  const unknown = keys.filter((key) => typeof key !== "string" || !fields.includes(key));
  const missing = fields.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      "INVALID_MANIFEST",
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${unknown.map(String).join(",")}]`,
    );
  }
}

function assertIdentifier(value, label, code = "INVALID_MANIFEST") {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail(code, `${label} must be a bounded lowercase identifier`);
  }
}

function assertCanonicalTimestamp(value, label) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("INVALID_MANIFEST", `${label} must be a canonical ISO timestamp`);
  }
}

function assertArray(value, label, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail("INVALID_MANIFEST", `${label} must contain at least ${minimum} entries`);
  }
}

function assertSortedUnique(values, label) {
  assertArray(values, label);
  const sorted = [...values].sort();
  if (
    values.some((value) => typeof value !== "string") ||
    new Set(values).size !== values.length ||
    values.some((value, index) => value !== sorted[index])
  ) {
    fail("INVALID_MANIFEST", `${label} must contain sorted unique strings`);
  }
}

function validateManifestShape(manifest) {
  const manifestFields = [
    "assignmentAlgorithm",
    "assignmentSeed",
    "blocks",
    "contractVersion",
    "datasetDigest",
    "datasetDigestAlgorithm",
    "datasetVersion",
    "demonstrationOnly",
    "frozenAt",
    "manifestVersion",
    "partitions",
    "purpose",
    "topicDefinitionVersion",
  ];
  assertExactFields(manifest, manifestFields, "split manifest");
  if (manifest.contractVersion !== SPLIT_CONTRACT_VERSION) {
    fail("VERSION_MISMATCH", `Unsupported split contract ${manifest.contractVersion}`);
  }
  if (manifest.datasetDigestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM) {
    fail("VERSION_MISMATCH", `Unsupported dataset digest ${manifest.datasetDigestAlgorithm}`);
  }
  if (manifest.assignmentAlgorithm !== "explicit-predeclared/1.0.0") {
    fail("VERSION_MISMATCH", `Unsupported assignment algorithm ${manifest.assignmentAlgorithm}`);
  }
  if (manifest.assignmentSeed !== null) {
    fail("INVALID_MANIFEST", "Explicit predeclared assignments must use a null seed");
  }
  assertIdentifier(manifest.manifestVersion, "manifestVersion");
  assertIdentifier(manifest.datasetVersion, "datasetVersion");
  assertIdentifier(manifest.topicDefinitionVersion, "topicDefinitionVersion");
  assertCanonicalTimestamp(manifest.frozenAt, "frozenAt");
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.datasetDigest)) {
    fail("INVALID_MANIFEST", "datasetDigest must be a lowercase SHA-256 digest");
  }
  if (typeof manifest.demonstrationOnly !== "boolean") {
    fail("INVALID_MANIFEST", "demonstrationOnly must be boolean");
  }
  const expectedPurpose = manifest.demonstrationOnly
    ? "structural-validation-only"
    : "frozen-evaluation";
  if (manifest.purpose !== expectedPurpose) {
    fail("INVALID_MANIFEST", `purpose must be ${expectedPurpose}`);
  }

  assertArray(manifest.partitions, "partitions", 2);
  if (manifest.partitions.length !== 2) {
    fail("INVALID_MANIFEST", "Exactly two partitions are required");
  }
  const partitionIds = new Set();
  const partitionRoles = [];
  let previousPartitionId = "";
  for (const [index, partition] of manifest.partitions.entries()) {
    const label = `partitions[${index}]`;
    assertExactFields(partition, ["id", "role"], label);
    assertIdentifier(partition.id, `${label}.id`);
    if (
      partitionIds.has(partition.id) ||
      (previousPartitionId !== "" && partition.id <= previousPartitionId)
    ) {
      fail("INVALID_MANIFEST", "Partition ids must be sorted and unique");
    }
    if (!PARTITION_ROLES.has(partition.role)) {
      fail("INVALID_MANIFEST", `${label}.role is invalid`);
    }
    partitionIds.add(partition.id);
    partitionRoles.push(partition.role);
    previousPartitionId = partition.id;
  }
  if (manifest.demonstrationOnly) {
    if (partitionRoles.some((role) => role !== "dry-run")) {
      fail("INVALID_MANIFEST", "Demonstration partitions must all use the dry-run role");
    }
  } else if ([...partitionRoles].sort().join(",") !== "heldout,tuning") {
    fail("INVALID_MANIFEST", "A frozen evaluation requires one tuning and one heldout partition");
  }

  assertArray(manifest.blocks, "blocks", 2);
  const blockIds = new Set();
  let previousBlockId = "";
  for (const [index, block] of manifest.blocks.entries()) {
    const label = `blocks[${index}]`;
    assertExactFields(block, ["clusterIds", "id", "partitionId"], label);
    assertIdentifier(block.id, `${label}.id`);
    if (blockIds.has(block.id) || (previousBlockId !== "" && block.id <= previousBlockId)) {
      fail("INVALID_MANIFEST", "Block ids must be sorted and unique");
    }
    if (!partitionIds.has(block.partitionId)) {
      fail("INVALID_MANIFEST", `${label} references unknown partition ${block.partitionId}`);
    }
    assertSortedUnique(block.clusterIds, `${label}.clusterIds`);
    for (const clusterId of block.clusterIds) {
      assertIdentifier(clusterId, `${label}.clusterIds entry`);
    }
    blockIds.add(block.id);
    previousBlockId = block.id;
  }

  return { partitionIds };
}

function validateDataset(dataset) {
  assertPlainObject(dataset, "dataset", "INVALID_DATASET");
  for (const field of ["datasetVersion", "topicDefinitionVersion", "sources", "pairs"]) {
    if (!Object.hasOwn(dataset, field)) {
      fail("INVALID_DATASET", `dataset.${field} is required`);
    }
  }
  assertIdentifier(dataset.datasetVersion, "dataset.datasetVersion", "INVALID_DATASET");
  assertIdentifier(
    dataset.topicDefinitionVersion,
    "dataset.topicDefinitionVersion",
    "INVALID_DATASET",
  );
  if (!Array.isArray(dataset.sources) || !Array.isArray(dataset.pairs)) {
    fail("INVALID_DATASET", "dataset.sources and dataset.pairs must be arrays");
  }

  const sourceById = new Map();
  const clusterIds = new Set();
  for (const [index, source] of dataset.sources.entries()) {
    const label = `sources[${index}]`;
    assertPlainObject(source, label, "INVALID_DATASET");
    for (const field of ["clusterId", "id", "url"]) {
      if (!Object.hasOwn(source, field)) {
        fail("INVALID_DATASET", `${label}.${field} is required`);
      }
    }
    assertIdentifier(source.id, `${label}.id`, "INVALID_DATASET");
    assertIdentifier(source.clusterId, `${label}.clusterId`, "INVALID_DATASET");
    if (sourceById.has(source.id)) {
      fail("INVALID_DATASET", `Duplicate source id ${source.id}`);
    }
    let normalizedUrl;
    try {
      normalizedUrl = normalizePublicHttpUrl(source.url);
    } catch (error) {
      fail("INVALID_DATASET", `${label}.url is invalid: ${error.message}`);
    }
    if (
      Object.hasOwn(source, "contentFingerprint") &&
      !/^sha256:[a-f0-9]{64}$/.test(source.contentFingerprint)
    ) {
      fail("INVALID_DATASET", `${label}.contentFingerprint is invalid`);
    }
    sourceById.set(source.id, {
      clusterId: source.clusterId,
      contentFingerprint: source.contentFingerprint ?? null,
      normalizedUrl,
    });
    clusterIds.add(source.clusterId);
  }

  const pairs = [];
  const pairIds = new Set();
  const unorderedPairs = new Set();
  const usedSourceIds = new Set();
  for (const [index, pair] of dataset.pairs.entries()) {
    const label = `pairs[${index}]`;
    assertPlainObject(pair, label, "INVALID_DATASET");
    for (const field of ["caseType", "id", "sourceAId", "sourceBId"]) {
      if (!Object.hasOwn(pair, field)) {
        fail("INVALID_DATASET", `${label}.${field} is required`);
      }
    }
    assertIdentifier(pair.id, `${label}.id`, "INVALID_DATASET");
    assertIdentifier(pair.caseType, `${label}.caseType`, "INVALID_DATASET");
    if (pairIds.has(pair.id)) {
      fail("INVALID_DATASET", `Duplicate pair id ${pair.id}`);
    }
    const sourceA = sourceById.get(pair.sourceAId);
    const sourceB = sourceById.get(pair.sourceBId);
    if (!sourceA || !sourceB || pair.sourceAId === pair.sourceBId) {
      fail("INVALID_DATASET", `${label} must reference two distinct known sources`);
    }
    const pairKey = [pair.sourceAId, pair.sourceBId].sort().join("\n");
    if (unorderedPairs.has(pairKey)) {
      fail("INVALID_DATASET", `${label} duplicates an unordered source pair`);
    }
    const hasPrimaryDecision = Object.hasOwn(pair, "primaryDecision");
    const hasResolvedGoldDecision = Object.hasOwn(pair, "resolvedGoldDecision");
    if (hasPrimaryDecision === hasResolvedGoldDecision) {
      fail(
        "INVALID_DATASET",
        `${label} must contain exactly one primaryDecision or resolvedGoldDecision`,
      );
    }
    const goldDecision = hasResolvedGoldDecision
      ? pair.resolvedGoldDecision
      : pair.primaryDecision;
    assertPlainObject(
      goldDecision,
      `${label}.${hasResolvedGoldDecision ? "resolvedGoldDecision" : "primaryDecision"}`,
      "INVALID_DATASET",
    );
    if (!LABELS.has(goldDecision.label)) {
      fail("INVALID_DATASET", `${label} gold decision label is invalid`);
    }
    const sameCluster = sourceA.clusterId === sourceB.clusterId;
    if ((goldDecision.label === "same-topic") !== sameCluster) {
      fail("INVALID_DATASET", `${label} label contradicts its gold clusters`);
    }
    pairIds.add(pair.id);
    unorderedPairs.add(pairKey);
    usedSourceIds.add(pair.sourceAId);
    usedSourceIds.add(pair.sourceBId);
    pairs.push({
      caseType: pair.caseType,
      id: pair.id,
      label: goldDecision.label,
      sourceA,
      sourceB,
    });
  }
  if (usedSourceIds.size !== sourceById.size) {
    const unused = [...sourceById.keys()].filter((id) => !usedSourceIds.has(id)).sort();
    fail("INVALID_DATASET", `Every source must appear in a pair; unused=[${unused.join(",")}]`);
  }

  return { clusterIds, pairs, sourceById };
}

function increment(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedRecord(entries) {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

export function validateDependencyBlockSplit(dataset, manifest) {
  let datasetDigest;
  let manifestDigest;
  try {
    datasetDigest = canonicalJsonSha256(dataset);
  } catch (error) {
    fail("INVALID_DATASET", `Dataset is not canonical JSON data: ${error.message}`);
  }
  try {
    manifestDigest = canonicalJsonSha256(manifest);
  } catch (error) {
    fail("INVALID_MANIFEST", `Manifest is not canonical JSON data: ${error.message}`);
  }
  validateManifestShape(manifest);
  const { clusterIds, pairs, sourceById } = validateDataset(dataset);
  if (manifest.datasetDigest !== datasetDigest) {
    fail(
      "DATASET_DIGEST_MISMATCH",
      `Manifest binds ${manifest.datasetDigest}, evaluated dataset is ${datasetDigest}`,
    );
  }
  if (
    manifest.datasetVersion !== dataset.datasetVersion ||
    manifest.topicDefinitionVersion !== dataset.topicDefinitionVersion
  ) {
    fail("VERSION_MISMATCH", "Manifest dataset/topic versions do not match the dataset");
  }

  const clusterAssignment = new Map();
  const blockById = new Map();
  for (const block of manifest.blocks) {
    const blockSummary = {
      caseCounts: new Map(),
      clusters: block.clusterIds.length,
      connectedComponents: new Set(),
      id: block.id,
      labelCounts: { "different-topic": 0, "same-topic": 0 },
      pairs: 0,
      partitionId: block.partitionId,
      sources: 0,
    };
    blockById.set(block.id, blockSummary);
    for (const clusterId of block.clusterIds) {
      if (!clusterIds.has(clusterId)) {
        fail("CLUSTER_COVERAGE", `Manifest assigns unknown cluster ${clusterId}`);
      }
      if (clusterAssignment.has(clusterId)) {
        fail("CLUSTER_COVERAGE", `Cluster ${clusterId} appears in more than one block`);
      }
      clusterAssignment.set(clusterId, {
        blockId: block.id,
        partitionId: block.partitionId,
      });
    }
  }
  const missingClusters = [...clusterIds].filter((id) => !clusterAssignment.has(id)).sort();
  if (missingClusters.length > 0) {
    fail("CLUSTER_COVERAGE", `Manifest omits clusters [${missingClusters.join(",")}]`);
  }

  const parent = new Map([...clusterIds].map((clusterId) => [clusterId, clusterId]));
  const find = (clusterId) => {
    let root = clusterId;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(clusterId) !== clusterId) {
      const next = parent.get(clusterId);
      parent.set(clusterId, root);
      clusterId = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (const pair of pairs) {
    const assignmentA = clusterAssignment.get(pair.sourceA.clusterId);
    const assignmentB = clusterAssignment.get(pair.sourceB.clusterId);
    if (assignmentA.blockId !== assignmentB.blockId) {
      fail(
        "CROSS_BLOCK_PAIR",
        `${pair.id} crosses ${assignmentA.blockId} and ${assignmentB.blockId}`,
      );
    }
    union(pair.sourceA.clusterId, pair.sourceB.clusterId);
    const block = blockById.get(assignmentA.blockId);
    block.pairs += 1;
    increment(block.caseCounts, pair.caseType);
    block.labelCounts[pair.label] += 1;
  }

  for (const source of sourceById.values()) {
    blockById.get(clusterAssignment.get(source.clusterId).blockId).sources += 1;
  }
  for (const clusterId of clusterIds) {
    blockById.get(clusterAssignment.get(clusterId).blockId).connectedComponents.add(find(clusterId));
  }
  for (const block of blockById.values()) {
    if (block.pairs === 0) {
      fail("INVALID_MANIFEST", `Block ${block.id} has no evaluated pairs`);
    }
  }

  const signalOwners = new Map();
  for (const [sourceId, source] of sourceById) {
    const assignment = clusterAssignment.get(source.clusterId);
    const signals = [`url:${source.normalizedUrl}`];
    if (source.contentFingerprint) signals.push(`fingerprint:${source.contentFingerprint}`);
    for (const signal of signals) {
      const previous = signalOwners.get(signal);
      if (previous && previous.clusterId !== source.clusterId) {
        const code =
          previous.partitionId === assignment.partitionId
            ? "CONTRADICTORY_EXACT_SIGNAL"
            : "CROSS_PARTITION_SIGNAL";
        fail(code, `Exact signal shared by ${previous.sourceId} and ${sourceId}`);
      }
      signalOwners.set(signal, {
        clusterId: source.clusterId,
        partitionId: assignment.partitionId,
        sourceId,
      });
    }
  }

  const partitionById = new Map(
    manifest.partitions.map((partition) => [
      partition.id,
      {
        blocks: 0,
        caseCounts: new Map(),
        clusters: 0,
        id: partition.id,
        labelCounts: { "different-topic": 0, "same-topic": 0 },
        pairs: 0,
        role: partition.role,
        sources: 0,
      },
    ]),
  );
  for (const block of blockById.values()) {
    const partition = partitionById.get(block.partitionId);
    partition.blocks += 1;
    partition.clusters += block.clusters;
    partition.pairs += block.pairs;
    partition.sources += block.sources;
    for (const [caseType, count] of block.caseCounts) {
      partition.caseCounts.set(caseType, (partition.caseCounts.get(caseType) ?? 0) + count);
    }
    for (const [label, count] of Object.entries(block.labelCounts)) {
      partition.labelCounts[label] += count;
    }
  }
  for (const partition of partitionById.values()) {
    if (partition.blocks === 0 || partition.pairs === 0) {
      fail("EMPTY_PARTITION", `Partition ${partition.id} has no blocks or evaluated pairs`);
    }
  }

  return {
    contractVersion: SPLIT_CONTRACT_VERSION,
    datasetDigest,
    datasetDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    datasetVersion: dataset.datasetVersion,
    demonstrationOnly: manifest.demonstrationOnly,
    evidence: {
      heldOut: false,
      reasons: manifest.demonstrationOnly
        ? ["manifest is marked demonstrationOnly", "no partition has the heldout role"]
        : [
            "a partition role does not prove heldout chronology",
            "structural split validation alone does not establish quality evidence",
          ],
      sufficientForGate: false,
    },
    manifestDigest,
    manifestDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    manifestVersion: manifest.manifestVersion,
    blocks: [...blockById.values()].map((block) => ({
      caseCounts: sortedRecord(block.caseCounts.entries()),
      clusters: block.clusters,
      connectedComponents: block.connectedComponents.size,
      id: block.id,
      labelCounts: block.labelCounts,
      pairs: block.pairs,
      partitionId: block.partitionId,
      sources: block.sources,
    })),
    partitions: [...partitionById.values()].map((partition) => ({
      ...partition,
      caseCounts: sortedRecord(partition.caseCounts.entries()),
    })),
    topicDefinitionVersion: dataset.topicDefinitionVersion,
  };
}

export function validatePilotDependencyBlockSplit(dataset, manifest) {
  evaluatePilot(dataset);
  return validateDependencyBlockSplit(dataset, manifest);
}

export function validateLabeledCorpusDependencyBlockSplit(dataset, manifest) {
  const { evaluationDataset, report: corpusReport } = prepareLabeledCorpusEvaluation(dataset);
  if (!corpusReport.readiness.structurallyReadyForSplitFreeze) {
    fail(
      "CORPUS_NOT_READY",
      `Corpus is not ready for split freeze: ${corpusReport.readiness.reasons.join("; ")}`,
    );
  }
  const splitReport = validateDependencyBlockSplit(evaluationDataset, manifest);
  return {
    corpus: {
      contractVersion: corpusReport.contractVersion,
      corpusDigest: corpusReport.corpusDigest,
      corpusDigestAlgorithm: corpusReport.corpusDigestAlgorithm,
      evaluationDatasetDigest: corpusReport.evaluationDatasetDigest,
      evaluationDatasetDigestAlgorithm: corpusReport.evaluationDatasetDigestAlgorithm,
      evaluationDatasetVersion: corpusReport.evaluationDatasetVersion,
      structurallyReadyForSplitFreeze: true,
    },
    split: splitReport,
  };
}
