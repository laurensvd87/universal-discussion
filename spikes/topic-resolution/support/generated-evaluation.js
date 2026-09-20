import {
  BLOCK_BOOTSTRAP_VERSION,
} from "../evaluation/block-bootstrap.js";
import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "../evaluation/canonical-json.js";
import {
  createResolvedEvaluationDataset,
  validateLabeledCorpus,
} from "../evaluation/corpus-contract.js";
import {
  ARTIFACT_DIGEST_ALGORITHM,
  DECISION_POLICY_VERSION,
  EVALUATION_POLICY_CONTRACT_VERSION,
  NORMATIVE_AUTOMATIC_JOIN_GATE,
  SCOPE_POLICY_VERSION,
  validateEvaluationPolicy,
} from "../evaluation/evaluation-policy.js";
import { PREDICTION_BUNDLE_CONTRACT_VERSION } from "../evaluation/prediction-contract.js";
import { buildCorpus, buildSplitManifest } from "./generated-corpus.js";

export function acceptDeclaredProvenance(dataset) {
  dataset.provenanceReview = {
    reviewedAt: "2026-09-20T12:30:00.000Z",
    reviewerId: "reviewer-provenance",
    status: "accepted",
  };
}

export function buildEvaluationScenario({
  feasibleHeldout = true,
  provenanceAccepted = true,
  sourceMode = "project-created-synthetic",
} = {}) {
  const dataset = feasibleHeldout
    ? buildCorpus({
        pairCount: 300,
        positivePairCount: 150,
        reviewedPairs: 60,
        sourcesPerCluster: 4,
      })
    : buildCorpus();
  if (sourceMode === "reviewed-public-metadata") {
    for (const source of dataset.sources) {
      source.provenance = {
        ...source.provenance,
        kind: "reviewed-public-metadata",
        origin: source.url,
        rightsBasis: "reviewed-public-metadata-test-fixture",
      };
    }
  } else if (sourceMode !== "project-created-synthetic") {
    throw new Error("Unsupported generated evaluation source mode");
  }
  if (provenanceAccepted) acceptDeclaredProvenance(dataset);

  const corpusReport = validateLabeledCorpus(dataset);
  const evaluationDataset = createResolvedEvaluationDataset(dataset);
  const manifest = buildSplitManifest(evaluationDataset);
  const policy = {
    bindings: {
      corpus: {
        contractVersion: corpusReport.contractVersion,
        datasetVersion: corpusReport.datasetVersion,
        digest: corpusReport.corpusDigest,
        digestAlgorithm: corpusReport.corpusDigestAlgorithm,
      },
      evaluationDataset: {
        digest: corpusReport.evaluationDatasetDigest,
        digestAlgorithm: corpusReport.evaluationDatasetDigestAlgorithm,
        projectionVersion: corpusReport.evaluationDatasetVersion,
      },
      splitManifest: {
        contractVersion: manifest.contractVersion,
        digest: canonicalJsonSha256(manifest),
        digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
        heldoutPartitionId: "partition-heldout",
        manifestVersion: manifest.manifestVersion,
        tuningPartitionId: "partition-tuning",
      },
    },
    bootstrapPolicy: {
      methodVersion: BLOCK_BOOTSTRAP_VERSION,
      replicates: 10_000,
      seed: "heldout-bootstrap-v1",
    },
    contractVersion: EVALUATION_POLICY_CONTRACT_VERSION,
    decisionPolicy: {
      automaticJoinThresholdMicros: 920_000,
      belowThreshold: "abstain",
      invalidScore: "error",
      missingCandidate: "abstain",
      scoreScale: 1_000_000,
      thresholdComparator: "greater-than-or-equal",
      thresholdSelectionPartitionId: "partition-tuning",
      version: DECISION_POLICY_VERSION,
    },
    frozenAt: "2026-09-20T14:00:00.000Z",
    gatePolicy: { ...NORMATIVE_AUTOMATIC_JOIN_GATE },
    policyVersion: "generated-heldout-policy-test/1.0.0",
    purpose: "freeze-before-heldout-evaluation",
    scope: {
      candidateIndex: "heldout-partition-only",
      contentClass: "editorial-article",
      evaluationPartitionRole: "heldout",
      executionMode: "offline-local",
      language: "en",
      networkAllowed: false,
      providerCallsAllowed: false,
      topicDefinitionVersion: dataset.topicDefinitionVersion,
      version: SCOPE_POLICY_VERSION,
    },
    systemUnderTest: {
      artifactDigest: `sha256:${"b".repeat(64)}`,
      artifactDigestAlgorithm: ARTIFACT_DIGEST_ALGORITHM,
      candidateVersion: "local-candidate/1.0.0",
      resolverVersion: "candidate-resolver/1.0.0",
    },
  };

  return { dataset, evaluationDataset, manifest, policy };
}

export function generatedHeldoutPairIds({ evaluationDataset, manifest, policy }) {
  const heldoutPartitionId = policy.bindings.splitManifest.heldoutPartitionId;
  const partitionByCluster = new Map();
  for (const block of manifest.blocks) {
    for (const clusterId of block.clusterIds) {
      partitionByCluster.set(clusterId, block.partitionId);
    }
  }
  const sourcesById = new Map(
    evaluationDataset.sources.map((source) => [source.id, source]),
  );
  return evaluationDataset.pairs
    .filter(
      (pair) =>
        partitionByCluster.get(sourcesById.get(pair.sourceAId).clusterId) ===
        heldoutPartitionId,
    )
    .map((pair) => pair.id)
    .sort();
}

export function buildPredictionBundle(
  scenario,
  {
    recordForPair = (pairId, index) =>
      index % 5 === 0
        ? { pairId, retrievalStatus: "no-candidate", scoreMicros: null }
        : {
            pairId,
            retrievalStatus: "candidate-retrieved",
            scoreMicros: 700_000 + (index % 3) * 100_000,
          },
  } = {},
) {
  const { dataset, evaluationDataset, manifest, policy } = scenario;
  const policyReport = validateEvaluationPolicy(dataset, manifest, policy);
  const pairIds = generatedHeldoutPairIds({ evaluationDataset, manifest, policy });
  return {
    bindings: {
      evaluationDataset: {
        digest: policy.bindings.evaluationDataset.digest,
        digestAlgorithm: policy.bindings.evaluationDataset.digestAlgorithm,
        projectionVersion: policy.bindings.evaluationDataset.projectionVersion,
      },
      evaluationPolicy: {
        contractVersion: policy.contractVersion,
        digest: policyReport.policyDigest,
        digestAlgorithm: policyReport.policyDigestAlgorithm,
        policyVersion: policy.policyVersion,
      },
      splitManifest: {
        digest: policy.bindings.splitManifest.digest,
        digestAlgorithm: policy.bindings.splitManifest.digestAlgorithm,
        heldoutPartitionId: policy.bindings.splitManifest.heldoutPartitionId,
        manifestVersion: policy.bindings.splitManifest.manifestVersion,
      },
      systemUnderTest: { ...policy.systemUnderTest },
    },
    bundleVersion: "generated-heldout-predictions-test/1.0.0",
    contractVersion: PREDICTION_BUNDLE_CONTRACT_VERSION,
    createdAt: "2026-09-20T15:00:00.000Z",
    purpose: "unevaluated-heldout-candidate-output",
    records: pairIds.map(recordForPair),
  };
}
