import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  ACQUISITION_PLAN_CONTRACT_VERSION,
  COVERAGE_PRIORITY_METHOD,
  PROVENANCE_INVENTORY_CONTRACT_VERSION,
  REVIEW_COMPLETION_TASK_CONTRACT_VERSION,
  REVIEW_COMPLETION_TASK_LIMITS,
  ReviewCompletionTaskError,
  prepareAcquisitionPlanEnvelope,
  prepareProvenanceInventoryEnvelope,
  prepareReviewCompletionTaskEnvelope,
  validateAcquisitionPlanEnvelope,
  validateProvenanceInventoryEnvelope,
  validateReviewCompletionTaskEnvelope,
} from "../review/review-completion-task.js";
import { parseReviewIntake } from "../review/review-tsv.js";
import { prepareReviewTask } from "../review/review-workflow.js";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(packageDirectory, "review", "fixtures");
const fixtureBytes = {
  configBytes: await readFile(path.join(fixtureDirectory, "synthetic-config.tsv")),
  pairBytes: await readFile(path.join(fixtureDirectory, "synthetic-pairs.tsv")),
  sourceBytes: await readFile(path.join(fixtureDirectory, "synthetic-sources.tsv")),
};
const fixtureManifest = JSON.parse(
  await readFile(path.join(packageDirectory, "fixtures", "manifest.json"), "utf8"),
);
const fixtureManifestDigest = canonicalJsonSha256(fixtureManifest);

function completionError(code) {
  return (error) => error instanceof ReviewCompletionTaskError && error.code === code;
}

function reviewer(id) {
  return {
    id,
    identityBasis: "caller-declared",
    identityKind: "synthetic-fixture-role",
  };
}

function fixtureTask() {
  return prepareReviewTask(parseReviewIntake(fixtureBytes));
}

function buildPlanInput(task = fixtureTask()) {
  const sourceAssignments = [];
  for (const pair of task.task.pairs) {
    const positive = pair.caseType === "duplicate-positive" || pair.caseType === "syndication-positive";
    sourceAssignments.push({
      sourceId: pair.sourceAId,
      stratumId: positive ? `stratum-${pair.id}` : `stratum-${pair.id}-a`,
    });
    sourceAssignments.push({
      sourceId: pair.sourceBId,
      stratumId: positive ? `stratum-${pair.id}` : `stratum-${pair.id}-b`,
    });
  }
  return {
    coverageNonce: "fixture-coverage-nonce-2026-09-21",
    createdAt: "2026-09-21T11:00:00.000Z",
    decisionReference: "owner-p1.2b-1-acceptance/2026-09-21",
    ownerAcceptedAt: "2026-09-21T10:50:00.000Z",
    pairAssignments: task.task.pairs.map((pair) => ({
      caseType: pair.caseType,
      id: pair.id,
      positiveConstructionCandidate:
        pair.caseType === "duplicate-positive" || pair.caseType === "syndication-positive",
      sourceAId: pair.sourceAId,
      sourceBId: pair.sourceBId,
    })),
    planId: "p1.2b-generated-plan/1.0.0",
    reviewers: {
      adjudicator: reviewer(task.task.reviewers.adjudicator),
      primary: reviewer(task.task.reviewers.primary),
      provenance: reviewer(task.task.provenanceReview.reviewerId),
      secondary: reviewer(task.task.reviewers.secondary),
    },
    scopeDecisionDigest: canonicalJsonSha256({
      authorization: "generated-fixture-preflight-only",
      date: "2026-09-21",
    }),
    sourceAssignments,
    trustAcceptedAt: "2026-09-21T10:55:00.000Z",
  };
}

function buildInventoryInput(task = fixtureTask()) {
  return {
    createdAt: "2026-09-21T11:50:00.000Z",
    fixtureManifestDigest,
    fixtureManifestVersion: fixtureManifest.manifestVersion,
    inventoryId: "p1.2b-generated-provenance/1.0.0",
    sources: task.task.sources.map((source) => ({
      declarations: {
        containsCopiedArticleText: false,
        containsPersonalData: false,
        minimumDataNecessary: true,
        repositoryUseApproved: true,
      },
      disposition: "accepted",
      evidenceCapturedAt: "2026-09-21T11:30:00.000Z",
      rationale: "Project-created reserved-domain metadata for generated contract tests.",
      reviewedAt: "2026-09-21T11:45:00.000Z",
      source: structuredClone(source),
    })),
  };
}

function buildArtifacts() {
  const primaryTask = fixtureTask();
  const plan = prepareAcquisitionPlanEnvelope(buildPlanInput(primaryTask));
  const inventory = prepareProvenanceInventoryEnvelope(
    plan,
    buildInventoryInput(primaryTask),
  );
  const completionTask = prepareReviewCompletionTaskEnvelope(
    primaryTask,
    plan,
    inventory,
  );
  return { completionTask, inventory, plan, primaryTask };
}

function extraSyntheticSource(id, suffix) {
  return {
    factSummary: `Generated provenance attrition Source ${suffix}.`,
    id,
    provenance: {
      containsCopiedArticleText: false,
      containsPersonalData: false,
      kind: "project-created-synthetic",
      origin: null,
      repositoryUseApproved: true,
      rightsBasis: "project-created",
    },
    publishedAt: "2026-03-10T09:00:00.000Z",
    title: `Generated attrition story ${suffix}`,
    url: `https://attrition-${suffix}.example.com/story`,
  };
}

function buildAttritionInputs() {
  const augmentedIntake = parseReviewIntake(fixtureBytes);
  augmentedIntake.sources.push(
    extraSyntheticSource("source-013", "a"),
    extraSyntheticSource("source-014", "b"),
  );
  augmentedIntake.pairs.push({
    caseType: "unrelated-control",
    id: "review-item-007",
    sourceAId: "source-013",
    sourceBId: "source-014",
  });
  const augmentedTask = prepareReviewTask(augmentedIntake);
  const planInput = buildPlanInput(augmentedTask);
  const inventoryInput = buildInventoryInput(augmentedTask);
  inventoryInput.sources.find(({ source }) => source.id === "source-013").disposition =
    "rejected";
  inventoryInput.sources.find(({ source }) => source.id === "source-013")
    .declarations.repositoryUseApproved = false;
  inventoryInput.sources.find(({ source }) => source.id === "source-013")
    .source.provenance.repositoryUseApproved = false;
  const pending = inventoryInput.sources.find(({ source }) => source.id === "source-014");
  pending.disposition = "pending";
  pending.declarations.repositoryUseApproved = false;
  pending.source.provenance.repositoryUseApproved = false;
  pending.reviewedAt = null;
  return { augmentedTask, inventoryInput, planInput };
}

test("generated artifacts form a deterministic plan -> inventory -> task digest chain", () => {
  const { completionTask, inventory, plan, primaryTask } = buildArtifacts();

  assert.equal(
    plan.acquisitionPlan.acquisitionPlanContractVersion,
    ACQUISITION_PLAN_CONTRACT_VERSION,
  );
  assert.equal(
    inventory.provenanceInventory.inventoryContractVersion,
    PROVENANCE_INVENTORY_CONTRACT_VERSION,
  );
  assert.equal(
    completionTask.completionTask.completionTaskContractVersion,
    REVIEW_COMPLETION_TASK_CONTRACT_VERSION,
  );
  assert.equal(
    inventory.provenanceInventory.acquisitionPlanDigest,
    plan.acquisitionPlanDigest,
  );
  assert.deepEqual(completionTask.completionTask.bindings, {
    acquisitionPlanDigest: plan.acquisitionPlanDigest,
    primaryTaskDigest: primaryTask.taskDigest,
    provenanceInventoryDigest: inventory.provenanceInventoryDigest,
  });
  assert.equal(completionTask.completionTask.coveragePlan.priorityMethod, COVERAGE_PRIORITY_METHOD);
  assert.equal(completionTask.completionTask.coveragePlan.priorityPairIds.length, 6);
  assert.equal(completionTask.completionTask.coveragePlan.initialCoveragePairIds.length, 2);
  assert.equal(completionTask.completionTask.coveragePlan.reservePairIds.length, 4);
  assert.deepEqual(
    {
      completionTaskDigest: completionTask.completionTaskDigest,
      inventoryDigest: inventory.provenanceInventoryDigest,
      planDigest: plan.acquisitionPlanDigest,
      priority: completionTask.completionTask.coveragePlan.priorityPairIds,
    },
    {
      completionTaskDigest:
        "sha256:9adffa1d6d77402a7512df0555a1d8c097e078bbdef777f083a4d623f8e62977",
      inventoryDigest:
        "sha256:c8486ac3506e19271e8f311f9ea329132f73c1cbcdec043abffc084a5faba43e",
      planDigest:
        "sha256:ed1bfbc450e2680eac52e76481292fe039d48fa0f6b92b141970e2f4fcf29111",
      priority: [
        "review-item-001",
        "review-item-006",
        "review-item-002",
        "review-item-005",
        "review-item-004",
        "review-item-003",
      ],
    },
  );
  assert.deepEqual(
    new Set(completionTask.completionTask.coveragePlan.priorityPairIds),
    new Set(primaryTask.task.pairs.map(({ id }) => id)),
  );
  assert.deepEqual(completionTask.completionTask.scope, {
    adjudicationComplete: false,
    corpusMaterialized: false,
    evaluationPerformed: false,
    fixtureOnly: true,
    gateEligible: false,
    heldOut: false,
    independentHumanReviewVerified: false,
    ownerCheckpointReached: false,
    primaryReviewComplete: false,
    realMetadataAuthorized: false,
    secondaryReviewComplete: false,
    splitFrozen: false,
  });
  assert.deepEqual(validateAcquisitionPlanEnvelope(structuredClone(plan)), plan);
  assert.deepEqual(
    validateProvenanceInventoryEnvelope(structuredClone(plan), structuredClone(inventory)),
    inventory,
  );
  assert.deepEqual(
    validateReviewCompletionTaskEnvelope(
      structuredClone(completionTask),
      structuredClone(primaryTask),
      structuredClone(plan),
      structuredClone(inventory),
    ),
    completionTask,
  );
});

test("assignment input order is canonical while a committed nonce changes coverage priority", () => {
  const primaryTask = fixtureTask();
  const orderedInput = buildPlanInput(primaryTask);
  const ordered = prepareAcquisitionPlanEnvelope(orderedInput);
  const reorderedInput = structuredClone(orderedInput);
  reorderedInput.sourceAssignments.reverse();
  reorderedInput.pairAssignments.reverse();
  assert.deepEqual(prepareAcquisitionPlanEnvelope(reorderedInput), ordered);

  const inventory = prepareProvenanceInventoryEnvelope(
    ordered,
    buildInventoryInput(primaryTask),
  );
  const firstTask = prepareReviewCompletionTaskEnvelope(primaryTask, ordered, inventory);
  const changedInput = structuredClone(orderedInput);
  changedInput.coverageNonce = "fixture-coverage-nonce-replacement";
  const changedPlan = prepareAcquisitionPlanEnvelope(changedInput);
  const changedInventory = prepareProvenanceInventoryEnvelope(
    changedPlan,
    buildInventoryInput(primaryTask),
  );
  const changedTask = prepareReviewCompletionTaskEnvelope(
    primaryTask,
    changedPlan,
    changedInventory,
  );
  assert.notEqual(changedPlan.acquisitionPlanDigest, ordered.acquisitionPlanDigest);
  assert.notDeepEqual(
    changedTask.completionTask.coveragePlan.priorityPairIds,
    firstTask.completionTask.coveragePlan.priorityPairIds,
  );
  assert.throws(
    () =>
      validateReviewCompletionTaskEnvelope(
        firstTask,
        primaryTask,
        changedPlan,
        changedInventory,
      ),
    completionError("BINDING_MISMATCH"),
  );
});

test("acquisition plan derives honest targets and rejects fake independence or case planning", () => {
  const input = buildPlanInput();
  const plan = prepareAcquisitionPlanEnvelope(input);
  assert.deepEqual(plan.acquisitionPlan.targets, {
    acquisitionStrata: 10,
    caseCounts: {
      "adversarial-title": 1,
      "duplicate-positive": 1,
      "related-distinct": 1,
      "syndication-positive": 1,
      "unrelated-control": 1,
      "update-continuation-boundary": 1,
    },
    pairCandidates: 6,
    positiveConstructionPairs: 2,
    positiveConstructionStrata: 2,
    sourceCandidates: 12,
  });

  const collision = structuredClone(input);
  collision.reviewers.secondary.id = collision.reviewers.primary.id;
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(collision),
    completionError("INVALID_REVIEWERS"),
  );

  const fakeHuman = structuredClone(input);
  fakeHuman.reviewers.secondary.identityKind = "human";
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(fakeHuman),
    completionError("INVALID_REVIEWERS"),
  );

  const crossStratumPositive = structuredClone(input);
  const positive = crossStratumPositive.pairAssignments.find(
    ({ positiveConstructionCandidate }) => positiveConstructionCandidate,
  );
  crossStratumPositive.sourceAssignments.find(
    ({ sourceId }) => sourceId === positive.sourceBId,
  ).stratumId = "different-positive-stratum";
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(crossStratumPositive),
    completionError("INVALID_PAIR"),
  );

  const tamperedTargets = structuredClone(plan);
  tamperedTargets.acquisitionPlan.targets.pairCandidates = 200;
  tamperedTargets.acquisitionPlanDigest = canonicalJsonSha256(
    tamperedTargets.acquisitionPlan,
  );
  assert.throws(
    () => validateAcquisitionPlanEnvelope(tamperedTargets),
    completionError("INVALID_TARGETS"),
  );
});

test("provenance inventory is exact, reserved-domain-only, reviewed, and evidence-bound", () => {
  const primaryTask = fixtureTask();
  const plan = prepareAcquisitionPlanEnvelope(buildPlanInput(primaryTask));
  const inventory = prepareProvenanceInventoryEnvelope(
    plan,
    buildInventoryInput(primaryTask),
  );
  assert.equal(inventory.provenanceInventory.sources.length, 12);
  assert.ok(
    inventory.provenanceInventory.sources.every(
      (source) =>
        source.provenanceKind === "project-created-synthetic" &&
        source.disposition === "accepted" &&
        source.review.reviewer.identityKind === "synthetic-fixture-role",
    ),
  );

  const liveUrl = buildInventoryInput(primaryTask);
  liveUrl.sources[0].source.url = "https://example-news.invalid/story";
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, liveUrl),
    completionError("INVALID_PROVENANCE"),
  );

  const missingSource = buildInventoryInput(primaryTask);
  missingSource.sources.pop();
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, missingSource),
    completionError("BINDING_MISMATCH"),
  );

  const badChronology = buildInventoryInput(primaryTask);
  badChronology.sources[0].reviewedAt = "2026-09-21T11:00:00.000Z";
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, badChronology),
    completionError("INVALID_TIMESTAMP"),
  );

  const falseEvidence = structuredClone(inventory);
  falseEvidence.provenanceInventory.sources[0].evidence.declarationRecordDigest =
    `sha256:${"a".repeat(64)}`;
  falseEvidence.provenanceInventoryDigest = canonicalJsonSha256(
    falseEvidence.provenanceInventory,
  );
  assert.throws(
    () => validateProvenanceInventoryEnvelope(plan, falseEvidence),
    completionError("BINDING_MISMATCH"),
  );
});

test("completion task rejects cross-artifact Source, pair, reviewer, and time mismatches", () => {
  const { inventory, plan, primaryTask } = buildArtifacts();

  const alternateInventoryInput = buildInventoryInput(primaryTask);
  alternateInventoryInput.sources[0].source.url = "https://alternate.example.com/story";
  const alternateInventory = prepareProvenanceInventoryEnvelope(
    plan,
    alternateInventoryInput,
  );
  assert.throws(
    () => prepareReviewCompletionTaskEnvelope(primaryTask, plan, alternateInventory),
    completionError("BINDING_MISMATCH"),
  );

  const pairMismatchInput = buildPlanInput(primaryTask);
  pairMismatchInput.pairAssignments[0].caseType = "related-distinct";
  pairMismatchInput.pairAssignments[0].positiveConstructionCandidate = false;
  const pairMismatchPlan = prepareAcquisitionPlanEnvelope(pairMismatchInput);
  const pairMismatchInventory = prepareProvenanceInventoryEnvelope(
    pairMismatchPlan,
    buildInventoryInput(primaryTask),
  );
  assert.throws(
    () =>
      prepareReviewCompletionTaskEnvelope(
        primaryTask,
        pairMismatchPlan,
        pairMismatchInventory,
      ),
    completionError("BINDING_MISMATCH"),
  );

  const pendingIntake = parseReviewIntake(fixtureBytes);
  pendingIntake.provenanceReview = { reviewedAt: null, reviewerId: null, status: "pending" };
  const pendingTask = prepareReviewTask(pendingIntake);
  assert.throws(
    () => prepareReviewCompletionTaskEnvelope(pendingTask, plan, inventory),
    completionError("INVALID_REVIEWERS"),
  );

  const lateInventoryInput = buildInventoryInput(primaryTask);
  lateInventoryInput.createdAt = "2026-09-21T12:01:00.000Z";
  lateInventoryInput.sources = lateInventoryInput.sources.map((source) => ({
    ...source,
    reviewedAt: "2026-09-21T11:59:00.000Z",
  }));
  const lateInventory = prepareProvenanceInventoryEnvelope(plan, lateInventoryInput);
  assert.throws(
    () => prepareReviewCompletionTaskEnvelope(primaryTask, plan, lateInventory),
    completionError("INVALID_TIMESTAMP"),
  );
});

test("inventory binds every owner-visible Source field and exact safe provenance", () => {
  const { inventory, plan } = buildArtifacts();
  const mutations = [
    (intake) => {
      intake.sources[0].title = "A different but still bounded generated title";
    },
    (intake) => {
      intake.sources[0].factSummary = "A different generated fact summary.";
    },
    (intake) => {
      intake.sources[0].publishedAt = "2026-03-03T09:01:00.000Z";
    },
    (intake) => {
      intake.sources[0].provenance = {
        containsCopiedArticleText: false,
        containsPersonalData: false,
        kind: "reviewed-public-metadata",
        origin: intake.sources[0].url,
        repositoryUseApproved: true,
        rightsBasis: "generated-drift-test",
      };
    },
  ];

  for (const mutate of mutations) {
    const intake = parseReviewIntake(fixtureBytes);
    mutate(intake);
    const driftedTask = prepareReviewTask(intake);
    assert.throws(
      () => prepareReviewCompletionTaskEnvelope(driftedTask, plan, inventory),
      (error) =>
        error instanceof ReviewCompletionTaskError &&
        ["BINDING_MISMATCH", "INVALID_PROVENANCE"].includes(error.code),
    );
  }
});

test("rejected and pending inventory records remain auditable and cannot enter the task", () => {
  const primaryTask = fixtureTask();
  const { augmentedTask, inventoryInput, planInput } = buildAttritionInputs();
  const plan = prepareAcquisitionPlanEnvelope(planInput);
  const inventory = prepareProvenanceInventoryEnvelope(plan, inventoryInput);
  const completionTask = prepareReviewCompletionTaskEnvelope(
    primaryTask,
    plan,
    inventory,
  );

  assert.deepEqual(completionTask.completionTask.selection.excludedSources, [
    {
      disposition: "rejected",
      reason: "provenance-rejected",
      sourceId: "source-013",
    },
    {
      disposition: "pending",
      reason: "provenance-pending",
      sourceId: "source-014",
    },
  ]);
  assert.deepEqual(completionTask.completionTask.selection.excludedPairs, [
    { pairId: "review-item-007", reason: "endpoint-not-accepted" },
  ]);
  assert.deepEqual(
    completionTask.completionTask.selection.taskPairIds,
    primaryTask.task.pairs.map(({ id }) => id),
  );
  assert.throws(
    () => prepareReviewCompletionTaskEnvelope(augmentedTask, plan, inventory),
    completionError("BINDING_MISMATCH"),
  );

  const falseApproval = structuredClone(inventoryInput);
  falseApproval.sources.find(({ source }) => source.id === "source-014")
    .declarations.repositoryUseApproved = true;
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, falseApproval),
    completionError("INVALID_PROVENANCE"),
  );
});

test("every declared chronology edge is enforced before task binding", () => {
  const primaryTask = fixtureTask();
  const planInput = buildPlanInput(primaryTask);
  const lateDecision = structuredClone(planInput);
  lateDecision.ownerAcceptedAt = "2026-09-21T11:00:01.000Z";
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(lateDecision),
    completionError("INVALID_TIMESTAMP"),
  );

  const plan = prepareAcquisitionPlanEnvelope(planInput);
  const publishedAfterEvidence = buildInventoryInput(primaryTask);
  publishedAfterEvidence.sources[0].source.publishedAt = "2026-09-21T11:31:00.000Z";
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, publishedAfterEvidence),
    completionError("INVALID_TIMESTAMP"),
  );

  const evidenceAfterReview = buildInventoryInput(primaryTask);
  evidenceAfterReview.sources[0].evidenceCapturedAt = "2026-09-21T11:46:00.000Z";
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, evidenceAfterReview),
    completionError("INVALID_TIMESTAMP"),
  );

  const reviewAfterInventory = buildInventoryInput(primaryTask);
  reviewAfterInventory.sources[0].reviewedAt = "2026-09-21T11:51:00.000Z";
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, reviewAfterInventory),
    completionError("INVALID_TIMESTAMP"),
  );

  const afterAcceptance = buildInventoryInput(primaryTask);
  afterAcceptance.createdAt = "2026-09-21T12:00:01.000Z";
  afterAcceptance.sources = afterAcceptance.sources.map((source) => ({
    ...source,
    reviewedAt: "2026-09-21T11:59:00.000Z",
  }));
  const inventoryAfterAcceptance = prepareProvenanceInventoryEnvelope(
    plan,
    afterAcceptance,
  );
  assert.throws(
    () =>
      prepareReviewCompletionTaskEnvelope(
        primaryTask,
        plan,
        inventoryAfterAcceptance,
      ),
    completionError("INVALID_TIMESTAMP"),
  );
});

test("coverage prefix, reserve, raw digests, and maximum task IDs are exact", () => {
  const { completionTask, inventory, plan, primaryTask } = buildArtifacts();
  const priority = completionTask.completionTask.coveragePlan.priorityPairIds;
  assert.deepEqual(
    completionTask.completionTask.coveragePlan.initialCoveragePairIds,
    priority.slice(0, 2),
  );
  assert.deepEqual(
    completionTask.completionTask.coveragePlan.reservePairIds,
    priority.slice(2),
  );

  const wrongPrefix = structuredClone(completionTask);
  [
    wrongPrefix.completionTask.coveragePlan.initialCoveragePairIds[0],
    wrongPrefix.completionTask.coveragePlan.reservePairIds[0],
  ] = [
    wrongPrefix.completionTask.coveragePlan.reservePairIds[0],
    wrongPrefix.completionTask.coveragePlan.initialCoveragePairIds[0],
  ];
  wrongPrefix.completionTaskDigest = canonicalJsonSha256(wrongPrefix.completionTask);
  assert.throws(
    () =>
      validateReviewCompletionTaskEnvelope(
        wrongPrefix,
        primaryTask,
        plan,
        inventory,
      ),
    completionError("INVALID_COVERAGE_PLAN"),
  );

  const wrongDigest = structuredClone(completionTask);
  wrongDigest.completionTaskDigest = `sha256:${"f".repeat(64)}`;
  assert.throws(
    () =>
      validateReviewCompletionTaskEnvelope(
        wrongDigest,
        primaryTask,
        plan,
        inventory,
      ),
    completionError("BINDING_MISMATCH"),
  );

  const maximumIdIntake = parseReviewIntake(fixtureBytes);
  maximumIdIntake.taskId = "a".repeat(128);
  const maximumIdTask = prepareReviewTask(maximumIdIntake);
  const maximumIdPlan = prepareAcquisitionPlanEnvelope(buildPlanInput(maximumIdTask));
  const maximumIdInventory = prepareProvenanceInventoryEnvelope(
    maximumIdPlan,
    buildInventoryInput(maximumIdTask),
  );
  const maximumIdCompletion = prepareReviewCompletionTaskEnvelope(
    maximumIdTask,
    maximumIdPlan,
    maximumIdInventory,
  );
  assert.equal(maximumIdCompletion.completionTask.taskId, maximumIdTask.task.taskId);
  assert.equal(maximumIdCompletion.completionTask.taskId.length, 128);
});

test("all public boundaries reject behavioral, cyclic, unknown, and exhausting data safely", () => {
  const accessor = buildPlanInput();
  let invoked = false;
  Object.defineProperty(accessor, "planId", {
    enumerable: true,
    get() {
      invoked = true;
      return "attacker";
    },
  });
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(accessor),
    completionError("INVALID_SCHEMA"),
  );
  assert.equal(invoked, false);

  const cyclic = buildPlanInput();
  cyclic.self = cyclic;
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(cyclic),
    completionError("INVALID_SCHEMA"),
  );

  const unknown = buildPlanInput();
  unknown.expectedGoldLabel = "same-topic";
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(unknown),
    completionError("INVALID_SCHEMA"),
  );

  const nullAssignment = buildPlanInput();
  nullAssignment.sourceAssignments[0] = null;
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(nullAssignment),
    completionError("INVALID_SCHEMA"),
  );

  const oversized = buildPlanInput();
  oversized.sourceAssignments = new Array(
    REVIEW_COMPLETION_TASK_LIMITS.maximumArrayEntries + 1,
  );
  assert.throws(
    () => prepareAcquisitionPlanEnvelope(oversized),
    completionError("RESOURCE_LIMIT"),
  );

  const primaryTask = fixtureTask();
  const plan = prepareAcquisitionPlanEnvelope(buildPlanInput(primaryTask));
  const inventoryAccessor = buildInventoryInput(primaryTask);
  let inventoryGetterInvoked = false;
  Object.defineProperty(inventoryAccessor.sources[0], "rationale", {
    enumerable: true,
    get() {
      inventoryGetterInvoked = true;
      return "attacker";
    },
  });
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, inventoryAccessor),
    completionError("INVALID_SCHEMA"),
  );
  assert.equal(inventoryGetterInvoked, false);

  const inheritedInventory = Object.create(buildInventoryInput(primaryTask));
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, inheritedInventory),
    completionError("INVALID_SCHEMA"),
  );

  const nullInventoryRecord = buildInventoryInput(primaryTask);
  nullInventoryRecord.sources[0] = null;
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, nullInventoryRecord),
    completionError("INVALID_SCHEMA"),
  );

  const sparseInventory = buildInventoryInput(primaryTask);
  sparseInventory.sources = new Array(2);
  sparseInventory.sources[0] = buildInventoryInput(primaryTask).sources[0];
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, sparseInventory),
    completionError("INVALID_SCHEMA"),
  );

  const cyclicInventory = buildInventoryInput(primaryTask);
  cyclicInventory.sources[0].cycle = cyclicInventory;
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, cyclicInventory),
    completionError("INVALID_SCHEMA"),
  );

  const oversizedInventory = buildInventoryInput(primaryTask);
  oversizedInventory.sources[0].rationale = "x".repeat(
    REVIEW_COMPLETION_TASK_LIMITS.maximumStringCodeUnits + 1,
  );
  assert.throws(
    () => prepareProvenanceInventoryEnvelope(plan, oversizedInventory),
    completionError("RESOURCE_LIMIT"),
  );

  const inventory = prepareProvenanceInventoryEnvelope(
    plan,
    buildInventoryInput(primaryTask),
  );
  const completionTask = prepareReviewCompletionTaskEnvelope(
    primaryTask,
    plan,
    inventory,
  );
  const completionAccessor = structuredClone(completionTask);
  let completionGetterInvoked = false;
  Object.defineProperty(completionAccessor, "completionTaskDigest", {
    enumerable: true,
    get() {
      completionGetterInvoked = true;
      return `sha256:${"a".repeat(64)}`;
    },
  });
  assert.throws(
    () =>
      validateReviewCompletionTaskEnvelope(
        completionAccessor,
        primaryTask,
        plan,
        inventory,
      ),
    completionError("INVALID_SCHEMA"),
  );
  assert.equal(completionGetterInvoked, false);

  const cyclicCompletion = structuredClone(completionTask);
  cyclicCompletion.completionTask.self = cyclicCompletion;
  assert.throws(
    () =>
      validateReviewCompletionTaskEnvelope(
        cyclicCompletion,
        primaryTask,
        plan,
        inventory,
      ),
    completionError("INVALID_SCHEMA"),
  );
});
