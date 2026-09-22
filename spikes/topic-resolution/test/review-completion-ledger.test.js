import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  REVIEW_COMPLETION_EVENT_CONTRACT_VERSION,
  REVIEW_COMPLETION_LEDGER_CONTRACT_VERSION,
  REVIEW_COMPLETION_LEDGER_LIMITS,
  REVIEW_COMPLETION_STATE_CONTRACT_VERSION,
  SYNTHETIC_SECONDARY_REVIEW_CONTRACT_VERSION,
  ReviewCompletionLedgerError,
  appendSyntheticSecondaryDecision,
  nextSyntheticSecondaryReviewView,
  prepareReviewCompletionLedgerEnvelope,
  reviewCompletionState,
  validateReviewCompletionLedgerEnvelope,
} from "../review/review-completion-ledger.js";
import {
  prepareAcquisitionPlanEnvelope,
  prepareProvenanceInventoryEnvelope,
  prepareReviewCompletionTaskEnvelope,
} from "../review/review-completion-task.js";
import { parseReviewIntake } from "../review/review-tsv.js";
import {
  appendPrimaryDecision,
  createReviewLedger,
  prepareReviewTask,
  reviewSessionDigest,
} from "../review/review-workflow.js";

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

function ledgerError(code) {
  return (error) => error instanceof ReviewCompletionLedgerError && error.code === code;
}

function reviewer(id) {
  return {
    id,
    identityBasis: "caller-declared",
    identityKind: "synthetic-fixture-role",
  };
}

function fixtureTask() {
  const intake = parseReviewIntake(fixtureBytes);
  // Keep generated P1.2b event tests on their accepted precommit chronology;
  // the local owner task is dated Sep 20 and its completed ledger events Sep 21.
  intake.createdAt = "2026-09-21T12:30:00.000Z";
  intake.provenanceReview.reviewedAt = "2026-09-21T12:00:00.000Z";
  return prepareReviewTask(intake);
}

function planInput(primaryTask) {
  const sourceAssignments = [];
  for (const pair of primaryTask.task.pairs) {
    const positive =
      pair.caseType === "duplicate-positive" || pair.caseType === "syndication-positive";
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
    pairAssignments: primaryTask.task.pairs.map((pair) => ({
      caseType: pair.caseType,
      id: pair.id,
      positiveConstructionCandidate:
        pair.caseType === "duplicate-positive" || pair.caseType === "syndication-positive",
      sourceAId: pair.sourceAId,
      sourceBId: pair.sourceBId,
    })),
    planId: "p1.2b-generated-plan/1.0.0",
    reviewers: {
      adjudicator: reviewer(primaryTask.task.reviewers.adjudicator),
      primary: reviewer(primaryTask.task.reviewers.primary),
      provenance: reviewer(primaryTask.task.provenanceReview.reviewerId),
      secondary: reviewer(primaryTask.task.reviewers.secondary),
    },
    scopeDecisionDigest: canonicalJsonSha256({
      authorization: "generated-fixture-preflight-only",
      date: "2026-09-21",
    }),
    sourceAssignments,
    trustAcceptedAt: "2026-09-21T10:55:00.000Z",
  };
}

function inventoryInput(primaryTask) {
  return {
    createdAt: "2026-09-21T11:50:00.000Z",
    fixtureManifestDigest,
    fixtureManifestVersion: fixtureManifest.manifestVersion,
    inventoryId: "p1.2b-generated-provenance/1.0.0",
    sources: primaryTask.task.sources.map((source) => ({
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

function completePrimaryLedger(primaryTask, labels = {}) {
  let ledger = createReviewLedger(primaryTask);
  let timestamp = Date.parse("2026-09-21T12:31:00.000Z");
  for (const pairId of primaryTask.task.ordering.pairIds) {
    ledger = appendPrimaryDecision(
      primaryTask,
      ledger,
      {
        expectedSessionDigest: reviewSessionDigest(primaryTask.taskDigest, ledger.events),
        label: labels[pairId] ?? "different-topic",
        reviewItemId: pairId,
        reviewerId: primaryTask.task.reviewers.primary,
      },
      new Date(timestamp).toISOString(),
    );
    timestamp += 60_000;
  }
  return ledger;
}

function buildContext(primaryLabels = { "review-item-001": "same-topic" }) {
  const primaryTask = fixtureTask();
  const acquisitionPlanEnvelope = prepareAcquisitionPlanEnvelope(planInput(primaryTask));
  const provenanceInventoryEnvelope = prepareProvenanceInventoryEnvelope(
    acquisitionPlanEnvelope,
    inventoryInput(primaryTask),
  );
  const completionTaskEnvelope = prepareReviewCompletionTaskEnvelope(
    primaryTask,
    acquisitionPlanEnvelope,
    provenanceInventoryEnvelope,
  );
  const primaryLedger = completePrimaryLedger(primaryTask, primaryLabels);
  return {
    artifacts: { primaryTask },
    context: {
      acquisitionPlanEnvelope,
      completionTaskEnvelope,
      primaryLedger,
      provenanceInventoryEnvelope,
    },
  };
}

function emptyLedger(context) {
  return prepareReviewCompletionLedgerEnvelope(context, "2026-09-21T13:30:00.000Z");
}

function decisionFor(context, envelope, label = "same-topic") {
  const view = nextSyntheticSecondaryReviewView(context, envelope);
  return {
    expectedCompletionLedgerDigest: view.completionLedgerDigest,
    label,
    reviewItemId: view.reviewItem.id,
    reviewerId:
      context.completionTaskEnvelope.completionTask.reviewers.secondary.id,
  };
}

function appendDecision(context, envelope, label, recordedAt) {
  return appendSyntheticSecondaryDecision(
    context,
    envelope,
    decisionFor(context, envelope, label),
    recordedAt,
  );
}

function rehash(envelope) {
  envelope.completionLedgerDigest = canonicalJsonSha256(envelope.completionLedger);
  return envelope;
}

test("completed primary review deterministically creates the bounded bridge", () => {
  const { context } = buildContext();
  const ledger = emptyLedger(context);
  const state = reviewCompletionState(context, ledger);

  assert.equal(
    ledger.completionLedger.completionLedgerContractVersion,
    REVIEW_COMPLETION_LEDGER_CONTRACT_VERSION,
  );
  assert.deepEqual(ledger.completionLedger.initialCoverageActivation, {
    basis: "derived-from-completion-task-initial-precommit",
    effectiveAt: context.completionTaskEnvelope.completionTask.createdAt,
    pairIds: ["review-item-001", "review-item-006"],
  });
  assert.equal(
    ledger.completionLedger.primaryLedgerBinding.sessionDigest,
    reviewSessionDigest(
      context.completionTaskEnvelope.completionTask.primaryTaskEnvelope.taskDigest,
      context.primaryLedger.events,
    ),
  );
  assert.equal(ledger.completionLedger.primaryLedgerBinding.eventCount, 6);
  assert.equal(
    ledger.completionLedgerDigest,
    "sha256:bbefee28b199233d07e03b7b164e932ed5133403eb8a36d5b76782ddf5acb9fa",
  );
  assert.equal(state.completionStateContractVersion, REVIEW_COMPLETION_STATE_CONTRACT_VERSION);
  assert.deepEqual(state.counts, {
    initialCoveragePairs: 2,
    initialSecondaryDecisions: 0,
    primaryBinary: 6,
    primaryUncertain: 0,
    syntheticBinaryAgreements: 0,
    syntheticBinaryDisagreements: 0,
    syntheticSecondaryBinary: 0,
    syntheticSecondaryUncertain: 0,
  });
  assert.equal(state.pending.nextInitialSecondaryPairId, "review-item-001");
  assert.equal(state.claims.eligibleIndependentHumanReviewDecisions, 0);
  assert.equal(state.claims.independentHumanReviewVerified, false);
  assert.equal(state.claims.secondaryReviewComplete, false);
  assert.equal(state.workflow.reserveActivationImplemented, false);
  assert.deepEqual(validateReviewCompletionLedgerEnvelope(context, ledger), ledger);
  assert.deepEqual(emptyLedger(context), ledger);
});

test("the bridge rejects incomplete, truncated, tampered, or rebound primary input", () => {
  const { context } = buildContext();
  const incomplete = structuredClone(context);
  incomplete.primaryLedger.events.pop();
  assert.throws(
    () => emptyLedger(incomplete),
    ledgerError("PRIMARY_LEDGER_INCOMPLETE"),
  );

  const tampered = structuredClone(context);
  tampered.primaryLedger.events[0].event.label = "same-topic";
  assert.throws(() => emptyLedger(tampered), ledgerError("INVALID_CONTEXT"));

  const rebound = structuredClone(context);
  rebound.primaryLedger.taskDigest = canonicalJsonSha256({ different: "task" });
  assert.throws(() => emptyLedger(rebound), ledgerError("INVALID_CONTEXT"));
});

test("secondary view exposes only the blinded Source allowlist", () => {
  const { context } = buildContext();
  const ledger = emptyLedger(context);
  const view = nextSyntheticSecondaryReviewView(context, ledger);

  assert.equal(view.reviewContractVersion, SYNTHETIC_SECONDARY_REVIEW_CONTRACT_VERSION);
  assert.deepEqual(Object.keys(view).sort(), [
    "choices",
    "completionLedgerDigest",
    "completionTaskDigest",
    "instruction",
    "position",
    "reviewContractVersion",
    "reviewItem",
    "topicDefinition",
  ]);
  assert.deepEqual(Object.keys(view.reviewItem).sort(), ["id", "sourceA", "sourceB"]);
  assert.deepEqual(Object.keys(view.reviewItem.sourceA).sort(), [
    "factSummary",
    "publishedAt",
    "title",
    "url",
  ]);
  for (const forbidden of [
    "caseType",
    "coverageBasis",
    "expectedAnswer",
    "primaryLabel",
    "projectedPrimaryEventDigest",
    "provenance",
    "reviewerId",
  ]) {
    assert.equal(Object.hasOwn(view, forbidden), false);
    assert.equal(Object.hasOwn(view.reviewItem, forbidden), false);
    assert.equal(Object.hasOwn(view.reviewItem.sourceA, forbidden), false);
  }
});

test("ordered first-pass decisions bind exact primary events and remain synthetic", () => {
  const { context } = buildContext();
  let ledger = emptyLedger(context);
  ledger = appendDecision(
    context,
    ledger,
    "same-topic",
    "2026-09-21T13:31:00.000Z",
  );
  assert.equal(ledger.completionLedger.events[0].event.eventContractVersion, REVIEW_COMPLETION_EVENT_CONTRACT_VERSION);
  assert.equal(
    ledger.completionLedger.events[0].event.projectedPrimaryEventDigest,
    context.primaryLedger.events.find(
      ({ event }) => event.reviewItemId === "review-item-001",
    ).eventDigest,
  );
  assert.equal(
    nextSyntheticSecondaryReviewView(context, ledger).reviewItem.id,
    "review-item-006",
  );
  ledger = appendDecision(
    context,
    ledger,
    "different-topic",
    "2026-09-21T13:32:00.000Z",
  );
  assert.equal(nextSyntheticSecondaryReviewView(context, ledger), null);
  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        {
          expectedCompletionLedgerDigest: ledger.completionLedgerDigest,
          label: "same-topic",
          reviewItemId: "review-item-001",
          reviewerId: context.completionTaskEnvelope.completionTask.reviewers.secondary.id,
        },
        "2026-09-21T13:33:00.000Z",
      ),
    ledgerError("INITIAL_PASS_COMPLETE"),
  );
  const state = reviewCompletionState(context, ledger);
  assert.equal(state.workflow.initialSecondaryPassComplete, true);
  assert.equal(state.counts.syntheticSecondaryBinary, 2);
  assert.equal(state.counts.syntheticBinaryAgreements, 2);
  assert.equal(state.claims.eligibleIndependentHumanReviewDecisions, 0);
  assert.equal(state.claims.gateEligible, false);
});

test("append rejects stale, wrong-role, non-next, reserve, and early commands", () => {
  const { context } = buildContext();
  const ledger = emptyLedger(context);
  const valid = decisionFor(context, ledger);

  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        { ...valid, expectedCompletionLedgerDigest: canonicalJsonSha256({ stale: true }) },
        "2026-09-21T13:31:00.000Z",
      ),
    ledgerError("STALE_SESSION"),
  );
  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        { ...valid, reviewerId: context.completionTaskEnvelope.completionTask.reviewers.primary.id },
        "2026-09-21T13:31:00.000Z",
      ),
    ledgerError("INVALID_REVIEWER"),
  );
  for (const reviewItemId of [
    "review-item-006",
    context.completionTaskEnvelope.completionTask.coveragePlan.reservePairIds[0],
  ]) {
    assert.throws(
      () =>
        appendSyntheticSecondaryDecision(
          context,
          ledger,
          { ...valid, reviewItemId },
          "2026-09-21T13:31:00.000Z",
        ),
      ledgerError("ORDER_VIOLATION"),
    );
  }
  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        valid,
        "2026-09-21T13:29:59.999Z",
      ),
    ledgerError("INVALID_TIMESTAMP"),
  );
});

test("primary uncertainty is retained and blocks early secondary presentation", () => {
  const { context } = buildContext({ "review-item-001": "uncertain" });
  const ledger = emptyLedger(context);
  const state = reviewCompletionState(context, ledger);

  assert.deepEqual(state.pending.primaryRereviewPairIds, ["review-item-001"]);
  assert.equal(state.counts.primaryUncertain, 1);
  assert.throws(
    () => nextSyntheticSecondaryReviewView(context, ledger),
    ledgerError("PRIMARY_BINARY_REQUIRED"),
  );
  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        {
          expectedCompletionLedgerDigest: ledger.completionLedgerDigest,
          label: "different-topic",
          reviewItemId: "review-item-001",
          reviewerId: context.completionTaskEnvelope.completionTask.reviewers.secondary.id,
        },
        "2026-09-21T13:31:00.000Z",
      ),
    ledgerError("PRIMARY_BINARY_REQUIRED"),
  );
});

test("secondary uncertainty and disagreement stay pending instead of becoming gold", () => {
  const { context } = buildContext();
  let ledger = emptyLedger(context);
  ledger = appendDecision(
    context,
    ledger,
    "different-topic",
    "2026-09-21T13:31:00.000Z",
  );
  ledger = appendDecision(
    context,
    ledger,
    "uncertain",
    "2026-09-21T13:32:00.000Z",
  );
  const state = reviewCompletionState(context, ledger);

  assert.deepEqual(state.pending.adjudicationPairIds, ["review-item-001"]);
  assert.deepEqual(state.pending.secondaryRereviewPairIds, ["review-item-006"]);
  assert.equal(state.counts.syntheticBinaryDisagreements, 1);
  assert.equal(state.counts.syntheticSecondaryUncertain, 1);
  assert.equal(state.claims.adjudicationComplete, false);
  assert.equal(state.claims.corpusMaterialized, false);
  assert.equal(state.claims.secondaryReviewComplete, false);
  assert.equal(state.claims.independentHumanReviewVerified, false);
});

test("inconsistent event, activation, sequence, ordering, and outer digests fail closed", () => {
  const { context } = buildContext();
  let ledger = emptyLedger(context);
  ledger = appendDecision(
    context,
    ledger,
    "same-topic",
    "2026-09-21T13:31:00.000Z",
  );
  ledger = appendDecision(
    context,
    ledger,
    "different-topic",
    "2026-09-21T13:32:00.000Z",
  );

  const activation = structuredClone(ledger);
  activation.completionLedger.initialCoverageActivation.pairIds.reverse();
  rehash(activation);
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, activation),
    ledgerError("BINDING_MISMATCH"),
  );

  const eventTamper = structuredClone(ledger);
  eventTamper.completionLedger.events[0].event.label = "different-topic";
  rehash(eventTamper);
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, eventTamper),
    ledgerError("INVALID_LABEL"),
  );

  const reorder = structuredClone(ledger);
  reorder.completionLedger.events.reverse();
  rehash(reorder);
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, reorder),
    ledgerError("INVALID_LEDGER"),
  );

  const gap = structuredClone(ledger);
  gap.completionLedger.events[0].event.sequence = 2;
  gap.completionLedger.events[0].eventDigest = canonicalJsonSha256(
    gap.completionLedger.events[0].event,
  );
  rehash(gap);
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, gap),
    ledgerError("INVALID_LEDGER"),
  );

  const outer = structuredClone(ledger);
  outer.completionLedgerDigest = canonicalJsonSha256({ not: "the ledger" });
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, outer),
    ledgerError("LEDGER_TAMPERED"),
  );
});

test("all public boundaries reject behavioral, cyclic, sparse, unknown, and oversized data", () => {
  const { context } = buildContext();
  const ledger = emptyLedger(context);
  let invoked = false;
  const accessorDecision = {
    get expectedCompletionLedgerDigest() {
      invoked = true;
      return ledger.completionLedgerDigest;
    },
    label: "same-topic",
    reviewItemId: "review-item-001",
    reviewerId: context.completionTaskEnvelope.completionTask.reviewers.secondary.id,
  };
  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        accessorDecision,
        "2026-09-21T13:31:00.000Z",
      ),
    ledgerError("INVALID_SCHEMA"),
  );
  assert.equal(invoked, false);

  const inheritedContext = Object.create(context);
  for (const operation of [
    () => emptyLedger(inheritedContext),
    () => validateReviewCompletionLedgerEnvelope(inheritedContext, ledger),
    () => nextSyntheticSecondaryReviewView(inheritedContext, ledger),
    () => reviewCompletionState(inheritedContext, ledger),
  ]) {
    assert.throws(operation, ledgerError("INVALID_SCHEMA"));
  }

  const cyclic = structuredClone(ledger);
  cyclic.loop = cyclic;
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, cyclic),
    ledgerError("INVALID_SCHEMA"),
  );

  const sparse = structuredClone(ledger);
  sparse.completionLedger.events = new Array(1);
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, sparse),
    ledgerError("INVALID_SCHEMA"),
  );

  const unknown = structuredClone(ledger);
  unknown.claimedIndependentReview = true;
  assert.throws(
    () => validateReviewCompletionLedgerEnvelope(context, unknown),
    ledgerError("INVALID_SCHEMA"),
  );

  const oversized = decisionFor(context, ledger);
  oversized.label = "x".repeat(
    REVIEW_COMPLETION_LEDGER_LIMITS.maximumStringCodeUnits + 1,
  );
  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        oversized,
        "2026-09-21T13:31:00.000Z",
      ),
    ledgerError("RESOURCE_LIMIT"),
  );

  const oversizedTimestamp = "2".repeat(
    REVIEW_COMPLETION_LEDGER_LIMITS.maximumTimestampCodeUnits + 1,
  );
  assert.throws(
    () => prepareReviewCompletionLedgerEnvelope(context, oversizedTimestamp),
    ledgerError("RESOURCE_LIMIT"),
  );
  assert.throws(
    () =>
      appendSyntheticSecondaryDecision(
        context,
        ledger,
        decisionFor(context, ledger),
        oversizedTimestamp,
      ),
    ledgerError("RESOURCE_LIMIT"),
  );
});

test("valid forks and a rehashed suffix truncation remain explicit unanchored residuals", () => {
  const { context } = buildContext();
  const predecessor = emptyLedger(context);
  const forkA = appendDecision(
    context,
    predecessor,
    "same-topic",
    "2026-09-21T13:31:00.000Z",
  );
  const forkB = appendDecision(
    context,
    predecessor,
    "different-topic",
    "2026-09-21T13:31:00.000Z",
  );
  assert.notEqual(forkA.completionLedgerDigest, forkB.completionLedgerDigest);
  assert.deepEqual(validateReviewCompletionLedgerEnvelope(context, forkA), forkA);
  assert.deepEqual(validateReviewCompletionLedgerEnvelope(context, forkB), forkB);

  const completed = appendDecision(
    context,
    forkA,
    "different-topic",
    "2026-09-21T13:32:00.000Z",
  );
  const truncated = structuredClone(completed);
  truncated.completionLedger.events.pop();
  rehash(truncated);

  assert.deepEqual(validateReviewCompletionLedgerEnvelope(context, truncated), truncated);
  const state = reviewCompletionState(context, truncated);
  assert.equal(state.workflow.initialSecondaryPassComplete, false);
  assert.equal(state.assurance.concurrencyControl, "none-pure-contract-can-fork");
  assert.equal(state.assurance.historyAuthenticity, "unkeyed-digests-not-signatures");
  assert.equal(state.assurance.latestLedgerExternallyAnchored, false);
  assert.equal(state.pending.nextInitialSecondaryPairId, "review-item-006");
});
