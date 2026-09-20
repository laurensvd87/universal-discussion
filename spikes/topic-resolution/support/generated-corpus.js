import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import { LABELED_CORPUS_CONTRACT_VERSION } from "../evaluation/corpus-contract.js";
import { SPLIT_CONTRACT_VERSION } from "../evaluation/split-contract.js";

export const PRIMARY_REVIEWED_AT = "2026-09-20T10:00:00.000Z";
export const SECONDARY_REVIEWED_AT = "2026-09-20T11:00:00.000Z";
export const ADJUDICATED_AT = "2026-09-20T12:00:00.000Z";

const NEGATIVE_CASE_TYPES = [
  "adversarial-title",
  "related-distinct",
  "unrelated-control",
  "update-continuation-boundary",
];
const SOURCE_SUFFIXES = ["a", "b", "c", "d"];
const DEPENDENCY_GROUPS = 4;

function dependencyGroups(clusterCount) {
  return Array.from({ length: DEPENDENCY_GROUPS }, (_, index) => [
    Math.floor((index * clusterCount) / DEPENDENCY_GROUPS),
    Math.floor(((index + 1) * clusterCount) / DEPENDENCY_GROUPS),
  ]);
}

function sourceId(clusterIndex, suffix) {
  return `source-${String(clusterIndex).padStart(3, "0")}-${suffix}`;
}

export function decision(label, reviewerId, reviewedAt) {
  return {
    label,
    rationale: `Generated ${label} contract-test decision.`,
    reviewedAt,
    reviewerId,
  };
}

export function buildCorpus({
  clusterCount = 50,
  pairCount = 200,
  positivePairCount = clusterCount,
  reviewedPairs = 40,
  sourcesPerCluster = 2,
} = {}) {
  if (!Number.isInteger(sourcesPerCluster) || sourcesPerCluster < 2 || sourcesPerCluster > 4) {
    throw new Error("Generated corpus supports two to four Sources per cluster");
  }
  if (positivePairCount > pairCount) {
    throw new Error("Generated positive-pair count cannot exceed total pairs");
  }
  const suffixes = SOURCE_SUFFIXES.slice(0, sourcesPerCluster);
  const sources = [];
  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
    for (const suffix of suffixes) {
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

  const withinClusterPairs = Array.from({ length: clusterCount }, (_, clusterIndex) => {
    const pairs = [];
    for (let left = 0; left < suffixes.length; left += 1) {
      for (let right = left + 1; right < suffixes.length; right += 1) {
        pairs.push({
          sourceAId: sourceId(clusterIndex, suffixes[left]),
          sourceBId: sourceId(clusterIndex, suffixes[right]),
        });
      }
    }
    return pairs;
  });
  const maximumPositivePairs = withinClusterPairs.reduce(
    (count, pairs) => count + pairs.length,
    0,
  );
  if (positivePairCount > maximumPositivePairs) {
    throw new Error("Generated corpus parameters do not provide enough positive pairs");
  }

  const pairSpecs = [];
  for (let round = 0; pairSpecs.length < positivePairCount; round += 1) {
    for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
      if (pairSpecs.length >= positivePairCount) break;
      const endpoints = withinClusterPairs[clusterIndex][round];
      if (!endpoints) continue;
      pairSpecs.push({
        caseType:
          pairSpecs.length % 2 === 0 ? "duplicate-positive" : "syndication-positive",
        label: "same-topic",
        ...endpoints,
      });
    }
  }

  const groups = dependencyGroups(clusterCount);
  const negativePairsByGroup = groups.map(([start, end]) => {
    const pairs = [];
    for (let left = start; left < end; left += 1) {
      for (let right = left + 1; right < end; right += 1) {
        pairs.push([sourceId(left, "a"), sourceId(right, "a")].sort());
      }
    }
    return pairs;
  });
  for (let round = 0; pairSpecs.length < pairCount; round += 1) {
    let added = false;
    for (const [groupIndex, groupPairs] of negativePairsByGroup.entries()) {
      if (pairSpecs.length >= pairCount) break;
      const endpoints = groupPairs[round];
      if (!endpoints) continue;
      pairSpecs.push({
        caseType:
          NEGATIVE_CASE_TYPES[(round + groupIndex) % NEGATIVE_CASE_TYPES.length],
        label: "different-topic",
        sourceAId: endpoints[0],
        sourceBId: endpoints[1],
      });
      added = true;
    }
    if (!added) break;
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

export function buildSplitManifest(evaluationDataset) {
  const clusterIds = [...new Set(evaluationDataset.sources.map((source) => source.clusterId))];
  const groups = dependencyGroups(clusterIds.length);
  return {
    assignmentAlgorithm: "explicit-predeclared/1.0.0",
    assignmentSeed: null,
    blocks: groups.map(([start, end], index) => ({
      clusterIds: clusterIds.slice(start, end),
      id: `block-${String(index).padStart(2, "0")}`,
      partitionId: index % 2 === 0 ? "partition-heldout" : "partition-tuning",
    })),
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
