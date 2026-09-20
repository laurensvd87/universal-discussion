import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_BOOTSTRAP_LIMITS,
} from "../evaluation/block-bootstrap.js";
import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  EVALUATION_POLICY_CONTRACT_VERSION,
  EvaluationPolicyError,
  validateEvaluationPolicy,
} from "../evaluation/evaluation-policy.js";
import { buildEvaluationScenario } from "../support/generated-evaluation.js";

const buildInputs = buildEvaluationScenario;

function policyError(code) {
  return (error) => error instanceof EvaluationPolicyError && error.code === code;
}

test("valid policy binds every artifact but never claims heldout evidence", () => {
  const { dataset, manifest, policy } = buildInputs();
  const report = validateEvaluationPolicy(dataset, manifest, policy);

  assert.equal(report.contractVersion, EVALUATION_POLICY_CONTRACT_VERSION);
  assert.equal(report.policyDigest, canonicalJsonSha256(policy));
  assert.equal(report.readiness.structurallyReadyForExternalFreezeReceipt, true);
  assert.deepEqual(report.readiness.reasons, []);
  assert.equal(report.feasibility.heldoutBlocks, 2);
  assert.equal(report.feasibility.eligibleSameTopicPairs, 72);
  assert.equal(report.feasibility.eligibleSameTopicGoldClusters, 24);
  assert.deepEqual(report.feasibility.missingCaseTypes, []);
  assert.ok(Object.values(report.feasibility.caseCounts).every((count) => count > 0));
  assert.deepEqual(
    {
      gateEligible: report.scope.gateEligible,
      heldOutEvidence: report.scope.heldOutEvidence,
      resultsEvaluated: report.scope.resultsEvaluated,
    },
    { gateEligible: false, heldOutEvidence: false, resultsEvaluated: false },
  );
  assert.equal(report.scope.externalRequirements.length, 5);
  assert.deepEqual(validateEvaluationPolicy(structuredClone(dataset), structuredClone(manifest), structuredClone(policy)), report);
});

test("policy bindings detect corpus review history and split-manifest changes", () => {
  const corpusMutation = buildInputs();
  corpusMutation.dataset.pairs[0].primaryDecision.rationale = "Review history changed.";
  assert.throws(
    () =>
      validateEvaluationPolicy(
        corpusMutation.dataset,
        corpusMutation.manifest,
        corpusMutation.policy,
      ),
    policyError("BINDING_MISMATCH"),
  );

  const splitMutation = buildInputs();
  splitMutation.manifest.manifestVersion = "generated-split-contract-test/1.0.1";
  assert.throws(
    () =>
      validateEvaluationPolicy(
        splitMutation.dataset,
        splitMutation.manifest,
        splitMutation.policy,
      ),
    policyError("BINDING_MISMATCH"),
  );

  const artifactMutation = buildInputs();
  const original = validateEvaluationPolicy(
    artifactMutation.dataset,
    artifactMutation.manifest,
    artifactMutation.policy,
  );
  artifactMutation.policy.systemUnderTest.artifactDigest = `sha256:${"c".repeat(64)}`;
  const changed = validateEvaluationPolicy(
    artifactMutation.dataset,
    artifactMutation.manifest,
    artifactMutation.policy,
  );
  assert.notEqual(changed.policyDigest, original.policyDigest);
});

test("normative gate, decision, bootstrap, and offline scope semantics cannot be weakened", () => {
  const weakenedGate = buildInputs();
  weakenedGate.policy.gatePolicy.minimumPrecisionMicros -= 1;
  assert.throws(
    () =>
      validateEvaluationPolicy(
        weakenedGate.dataset,
        weakenedGate.manifest,
        weakenedGate.policy,
      ),
    policyError("POLICY_SEMANTICS_MISMATCH"),
  );

  const heldoutTuning = buildInputs();
  heldoutTuning.policy.decisionPolicy.thresholdSelectionPartitionId =
    "partition-heldout";
  assert.throws(
    () =>
      validateEvaluationPolicy(
        heldoutTuning.dataset,
        heldoutTuning.manifest,
        heldoutTuning.policy,
      ),
    policyError("BINDING_MISMATCH"),
  );

  const fractionalThreshold = buildInputs();
  fractionalThreshold.policy.decisionPolicy.automaticJoinThresholdMicros = 920_000.5;
  assert.throws(
    () =>
      validateEvaluationPolicy(
        fractionalThreshold.dataset,
        fractionalThreshold.manifest,
        fractionalThreshold.policy,
      ),
    policyError("INVALID_POLICY"),
  );

  const weakBootstrap = buildInputs();
  weakBootstrap.policy.bootstrapPolicy.replicates =
    BLOCK_BOOTSTRAP_LIMITS.minimumReplicates - 1;
  assert.throws(
    () =>
      validateEvaluationPolicy(
        weakBootstrap.dataset,
        weakBootstrap.manifest,
        weakBootstrap.policy,
      ),
    policyError("INVALID_POLICY"),
  );

  const networkEnabled = buildInputs();
  networkEnabled.policy.scope.networkAllowed = true;
  assert.throws(
    () =>
      validateEvaluationPolicy(
        networkEnabled.dataset,
        networkEnabled.manifest,
        networkEnabled.policy,
      ),
    policyError("POLICY_SEMANTICS_MISMATCH"),
  );
});

test("policy declarations cannot manufacture freeze chronology or heldout roles", () => {
  const earlyFreeze = buildInputs();
  earlyFreeze.policy.frozenAt = "2026-09-20T12:00:00.000Z";
  assert.throws(
    () =>
      validateEvaluationPolicy(
        earlyFreeze.dataset,
        earlyFreeze.manifest,
        earlyFreeze.policy,
      ),
    policyError("INVALID_CHRONOLOGY"),
  );

  const demonstration = buildInputs();
  demonstration.manifest.demonstrationOnly = true;
  demonstration.manifest.purpose = "structural-validation-only";
  for (const partition of demonstration.manifest.partitions) partition.role = "dry-run";
  demonstration.manifest.datasetDigest = canonicalJsonSha256(demonstration.evaluationDataset);
  assert.throws(
    () =>
      validateEvaluationPolicy(
        demonstration.dataset,
        demonstration.manifest,
        demonstration.policy,
      ),
    policyError("SPLIT_NOT_FROZEN"),
  );
});

test("valid but incomplete inputs report freeze-readiness shortfalls without quality claims", () => {
  const insufficientEvidence = buildInputs({ feasibleHeldout: false });
  const evidenceReport = validateEvaluationPolicy(
    insufficientEvidence.dataset,
    insufficientEvidence.manifest,
    insufficientEvidence.policy,
  );
  assert.equal(evidenceReport.readiness.structurallyReadyForExternalFreezeReceipt, false);
  assert.ok(
    evidenceReport.readiness.reasons.some((reason) =>
      reason.startsWith("heldout eligible same-topic pairs 24 < 60"),
    ),
  );
  assert.equal(evidenceReport.scope.gateEligible, false);

  const pendingProvenance = buildInputs({ provenanceAccepted: false });
  const provenanceReport = validateEvaluationPolicy(
    pendingProvenance.dataset,
    pendingProvenance.manifest,
    pendingProvenance.policy,
  );
  assert.equal(provenanceReport.readiness.structurallyReadyForExternalFreezeReceipt, false);
  assert.ok(
    provenanceReport.readiness.reasons.includes(
      "corpus provenance review declaration is not accepted",
    ),
  );
  assert.equal(provenanceReport.scope.heldOutEvidence, false);
});

test("policy boundary rejects result fields, behavioral data, and malformed identifiers", () => {
  const resultField = buildInputs();
  resultField.policy.confusionMatrix = { truePositive: 60 };
  assert.throws(
    () =>
      validateEvaluationPolicy(
        resultField.dataset,
        resultField.manifest,
        resultField.policy,
      ),
    policyError("INVALID_POLICY"),
  );

  const accessor = buildInputs();
  Object.defineProperty(accessor.policy.systemUnderTest, "candidateVersion", {
    enumerable: true,
    get: () => "behavioral-candidate/1.0.0",
  });
  assert.throws(
    () => validateEvaluationPolicy(accessor.dataset, accessor.manifest, accessor.policy),
    policyError("INVALID_POLICY"),
  );

  const noncanonicalIdentifier = buildInputs();
  noncanonicalIdentifier.policy.systemUnderTest.resolverVersion = "resolver with spaces";
  assert.throws(
    () =>
      validateEvaluationPolicy(
        noncanonicalIdentifier.dataset,
        noncanonicalIdentifier.manifest,
        noncanonicalIdentifier.policy,
      ),
    policyError("INVALID_POLICY"),
  );

  const oversizedKey = buildInputs();
  oversizedKey.policy["x".repeat(129)] = true;
  assert.throws(
    () =>
      validateEvaluationPolicy(
        oversizedKey.dataset,
        oversizedKey.manifest,
        oversizedKey.policy,
      ),
    policyError("INVALID_POLICY"),
  );
});
