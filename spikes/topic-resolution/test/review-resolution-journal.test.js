import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  GENERATED_REVIEW_PRESENTATION_CONTRACT_VERSION,
  GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION,
  GENERATED_REVIEW_RESOLUTION_EVENT_CONTRACT_VERSION,
  GENERATED_REVIEW_RESOLUTION_JOURNAL_CONTRACT_VERSION,
  GENERATED_REVIEW_RESOLUTION_LIMITS,
  GENERATED_REVIEW_RESOLUTION_STATE_CONTRACT_VERSION,
  GeneratedReviewResolutionError,
  appendGeneratedContinuedSecondaryDecision,
  appendGeneratedEvidenceSupplement,
  appendGeneratedRoleRereviewDecision,
  generatedResolutionState,
  nextGeneratedReviewAction,
  prepareGeneratedResolutionJournalEnvelope,
  validateGeneratedResolutionJournalEnvelope,
} from "../review/review-resolution-journal.js";
import {
  appendSyntheticSecondaryDecision,
  nextSyntheticSecondaryReviewView,
  prepareReviewCompletionLedgerEnvelope,
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

function resolutionError(error) {
  return error instanceof GeneratedReviewResolutionError;
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
  // Keep generated successor events after the accepted generated precommit.
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

function buildUpstream(primaryLabels = { "review-item-001": "same-topic" }) {
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
  return {
    acquisitionPlanEnvelope,
    completionTaskEnvelope,
    primaryLedger: completePrimaryLedger(primaryTask, primaryLabels),
    provenanceInventoryEnvelope,
  };
}

function prepareBase(upstream) {
  return prepareReviewCompletionLedgerEnvelope(upstream, "2026-09-21T13:30:00.000Z");
}

function appendBaseDecision(upstream, envelope, label, recordedAt) {
  const view = nextSyntheticSecondaryReviewView(upstream, envelope);
  return appendSyntheticSecondaryDecision(
    upstream,
    envelope,
    {
      expectedCompletionLedgerDigest: view.completionLedgerDigest,
      label,
      reviewItemId: view.reviewItem.id,
      reviewerId: upstream.completionTaskEnvelope.completionTask.reviewers.secondary.id,
    },
    recordedAt,
  );
}

function buildJournalContext(
  primaryLabels = { "review-item-001": "same-topic" },
  baseLabels = [],
) {
  const upstream = buildUpstream(primaryLabels);
  let baseCompletionLedgerEnvelope = prepareBase(upstream);
  let timestamp = Date.parse("2026-09-21T13:31:00.000Z");
  for (const label of baseLabels) {
    baseCompletionLedgerEnvelope = appendBaseDecision(
      upstream,
      baseCompletionLedgerEnvelope,
      label,
      new Date(timestamp).toISOString(),
    );
    timestamp += 60_000;
  }
  return {
    ...upstream,
    baseCompletionLedgerEnvelope,
  };
}

function prepareJournal(context, createdAt = "2026-09-21T14:00:00.000Z") {
  return prepareGeneratedResolutionJournalEnvelope(context, createdAt);
}

function actionFor(context, envelope) {
  return nextGeneratedReviewAction(context, envelope);
}

function pairFor(context, pairId) {
  return context.completionTaskEnvelope.completionTask.primaryTaskEnvelope.task.pairs.find(
    ({ id }) => id === pairId,
  );
}

function supplementCommand(context, envelope, actionResult, times = {}) {
  const pair = pairFor(context, actionResult.action.reviewItemId);
  return {
    actionDigest: actionResult.actionDigest,
    declarations: {
      containsCopiedArticleText: false,
      containsPersonalData: false,
      projectCreatedSynthetic: true,
      repositoryUseApproved: true,
    },
    evidenceCapturedAt: times.evidenceCapturedAt ?? "2026-09-21T14:01:00.000Z",
    expectedResolutionJournalDigest: envelope.resolutionJournalDigest,
    provenanceReviewedAt: times.provenanceReviewedAt ?? "2026-09-21T14:02:00.000Z",
    reviewItemId: actionResult.action.reviewItemId,
    reviewerId: context.completionTaskEnvelope.completionTask.reviewers.provenance.id,
    sourceAddenda: [
      { sourceId: pair.sourceAId, text: "Synthetic follow-up fact for Source A." },
      { sourceId: pair.sourceBId, text: "Synthetic follow-up fact for Source B." },
    ],
  };
}

function rereviewCommand(context, envelope, actionResult, label) {
  return {
    actionDigest: actionResult.actionDigest,
    expectedResolutionJournalDigest: envelope.resolutionJournalDigest,
    label,
    reviewItemId: actionResult.action.reviewItemId,
    reviewerId:
      context.completionTaskEnvelope.completionTask.reviewers[actionResult.action.targetRole].id,
  };
}

function continuedCommand(context, envelope, actionResult, label) {
  return {
    actionDigest: actionResult.actionDigest,
    expectedResolutionJournalDigest: envelope.resolutionJournalDigest,
    label,
    reviewItemId: actionResult.action.reviewItemId,
    reviewerId: context.completionTaskEnvelope.completionTask.reviewers.secondary.id,
  };
}

function appendSupplement(
  context,
  envelope,
  recordedAt = "2026-09-21T14:03:00.000Z",
  times,
) {
  const actionResult = actionFor(context, envelope);
  return appendGeneratedEvidenceSupplement(
    context,
    envelope,
    supplementCommand(context, envelope, actionResult, times),
    recordedAt,
  );
}

function appendRereview(context, envelope, label, recordedAt = "2026-09-21T14:04:00.000Z") {
  const actionResult = actionFor(context, envelope);
  return appendGeneratedRoleRereviewDecision(
    context,
    envelope,
    rereviewCommand(context, envelope, actionResult, label),
    recordedAt,
  );
}

function appendContinued(
  context,
  envelope,
  label,
  recordedAt = "2026-09-21T14:01:00.000Z",
) {
  const actionResult = actionFor(context, envelope);
  return appendGeneratedContinuedSecondaryDecision(
    context,
    envelope,
    continuedCommand(context, envelope, actionResult, label),
    recordedAt,
  );
}

function actionType(context, envelope) {
  return actionFor(context, envelope).action.actionType;
}

function rehash(envelope) {
  envelope.resolutionJournalDigest = canonicalJsonSha256(envelope.resolutionJournal);
  return envelope;
}

test("empty, partial, and complete frozen prefixes select the deterministic next action", () => {
  const emptyContext = buildJournalContext();
  const empty = prepareJournal(emptyContext);
  const emptyAction = actionFor(emptyContext, empty);

  assert.equal(
    empty.resolutionJournal.resolutionJournalContractVersion,
    GENERATED_REVIEW_RESOLUTION_JOURNAL_CONTRACT_VERSION,
  );
  assert.equal(empty.resolutionJournal.baseSecondaryPrefix.eventCount, 0);
  assert.equal(empty.resolutionJournal.baseSecondaryPrefix.lastEventDigest, null);
  assert.equal(emptyAction.action.actionContractVersion, GENERATED_REVIEW_RESOLUTION_ACTION_CONTRACT_VERSION);
  assert.equal(emptyAction.action.actionType, "continued-initial-secondary-required");
  assert.equal(emptyAction.action.reviewItemId, "review-item-001");
  assert.deepEqual(validateGeneratedResolutionJournalEnvelope(emptyContext, empty), empty);

  const partialContext = buildJournalContext(undefined, ["same-topic"]);
  const partial = prepareJournal(partialContext);
  assert.equal(partial.resolutionJournal.baseSecondaryPrefix.eventCount, 1);
  assert.equal(
    partial.resolutionJournal.baseSecondaryPrefix.lastEventDigest,
    partialContext.baseCompletionLedgerEnvelope.completionLedger.events[0].eventDigest,
  );
  assert.equal(actionType(partialContext, partial), "continued-initial-secondary-required");
  assert.equal(actionFor(partialContext, partial).action.reviewItemId, "review-item-006");

  const completeContext = buildJournalContext(undefined, ["same-topic", "different-topic"]);
  const complete = prepareJournal(completeContext);
  assert.equal(complete.resolutionJournal.baseSecondaryPrefix.eventCount, 2);
  assert.equal(actionType(completeContext, complete), "initial-resolution-complete");
});

test("primary uncertainty requires one provenance-reviewed supplement and same-role rereview", () => {
  const context = buildJournalContext({ "review-item-001": "uncertain" });
  let envelope = prepareJournal(context);
  let actionResult = actionFor(context, envelope);

  assert.equal(actionResult.action.actionType, "evidence-supplement-required");
  assert.equal(actionResult.action.reviewItemId, "review-item-001");
  assert.equal(actionResult.action.targetRole, "primary");

  envelope = appendSupplement(context, envelope);
  assert.equal(
    envelope.resolutionJournal.events[0].event.eventContractVersion,
    GENERATED_REVIEW_RESOLUTION_EVENT_CONTRACT_VERSION,
  );
  assert.equal(envelope.resolutionJournal.events[0].event.eventType, "evidence-supplement");
  assert.equal(envelope.resolutionJournal.events[0].event.sequence, 1);

  actionResult = actionFor(context, envelope);
  assert.equal(actionResult.action.actionType, "role-rereview-required");
  assert.equal(actionResult.action.targetRole, "primary");
  envelope = appendRereview(context, envelope, "same-topic");

  assert.equal(actionType(context, envelope), "continued-initial-secondary-required");
  assert.equal(actionFor(context, envelope).action.reviewItemId, "review-item-001");
  assert.deepEqual(validateGeneratedResolutionJournalEnvelope(context, envelope), envelope);
});

test("primary uncertainty in the reserve is resolved before initial secondary work", () => {
  const baseline = buildJournalContext();
  const reserveId =
    baseline.completionTaskEnvelope.completionTask.coveragePlan.reservePairIds[0];
  const context = buildJournalContext({
    "review-item-001": "same-topic",
    [reserveId]: "uncertain",
  });
  let envelope = prepareJournal(context);

  assert.equal(actionType(context, envelope), "evidence-supplement-required");
  assert.equal(actionFor(context, envelope).action.reviewItemId, reserveId);
  assert.equal(actionFor(context, envelope).action.targetRole, "primary");

  envelope = appendSupplement(context, envelope);
  envelope = appendRereview(context, envelope, "different-topic");
  assert.equal(actionType(context, envelope), "continued-initial-secondary-required");
  assert.equal(actionFor(context, envelope).action.reviewItemId, "review-item-001");
});

test("a second uncertainty derives exclusion and skips only that initial pair", () => {
  const context = buildJournalContext({ "review-item-001": "uncertain" });
  let envelope = prepareJournal(context);
  envelope = appendSupplement(context, envelope);
  envelope = appendRereview(context, envelope, "uncertain");

  assert.equal(actionType(context, envelope), "continued-initial-secondary-required");
  assert.equal(actionFor(context, envelope).action.reviewItemId, "review-item-006");
  assert.match(
    JSON.stringify(generatedResolutionState(context, envelope)),
    /primary-remained-unresolved-after-supplement/,
  );

  envelope = appendContinued(
    context,
    envelope,
    "different-topic",
    "2026-09-21T14:05:00.000Z",
  );
  assert.equal(actionType(context, envelope), "initial-resolution-complete");
});

test("initial secondary continuation precedes secondary uncertainty resolution", () => {
  const context = buildJournalContext(undefined, ["uncertain"]);
  let envelope = prepareJournal(context);

  assert.equal(actionType(context, envelope), "continued-initial-secondary-required");
  assert.equal(actionFor(context, envelope).action.reviewItemId, "review-item-006");
  envelope = appendContinued(context, envelope, "different-topic");

  assert.equal(actionType(context, envelope), "evidence-supplement-required");
  assert.equal(actionFor(context, envelope).action.reviewItemId, "review-item-001");
  assert.equal(actionFor(context, envelope).action.targetRole, "secondary");
  envelope = appendSupplement(
    context,
    envelope,
    "2026-09-21T14:04:00.000Z",
    {
      evidenceCapturedAt: "2026-09-21T14:02:00.000Z",
      provenanceReviewedAt: "2026-09-21T14:03:00.000Z",
    },
  );
  envelope = appendRereview(
    context,
    envelope,
    "same-topic",
    "2026-09-21T14:05:00.000Z",
  );
  assert.equal(actionType(context, envelope), "initial-resolution-complete");
});

test("a terminal secondary uncertainty derives exclusion without becoming a new obligation", () => {
  const context = buildJournalContext(undefined, ["uncertain", "different-topic"]);
  let envelope = prepareJournal(context);

  assert.equal(actionType(context, envelope), "evidence-supplement-required");
  assert.equal(actionFor(context, envelope).action.targetRole, "secondary");
  envelope = appendSupplement(context, envelope);
  const rereviewView = actionFor(context, envelope).action.reviewView;
  assert.deepEqual(rereviewView.reviewItem.sourceA.evidenceAddenda, [
    "Synthetic follow-up fact for Source A.",
  ]);
  assert.deepEqual(rereviewView.reviewItem.sourceB.evidenceAddenda, [
    "Synthetic follow-up fact for Source B.",
  ]);
  envelope = appendRereview(context, envelope, "uncertain");

  assert.equal(actionType(context, envelope), "initial-resolution-complete");
  const state = generatedResolutionState(context, envelope);
  assert.deepEqual(state.exclusions, [
    {
      reason: "secondary-remained-unresolved-after-supplement",
      reviewItemId: "review-item-001",
    },
  ]);
  assert.deepEqual(state.pending.secondaryRereviewPairIds, []);
});

test("binary disagreement is a terminal adjudication handoff for this version", () => {
  const context = buildJournalContext(undefined, ["different-topic", "different-topic"]);
  const envelope = prepareJournal(context);
  const actionResult = actionFor(context, envelope);

  assert.equal(actionResult.action.actionType, "adjudication-required");
  assert.equal(actionResult.action.reviewItemId, "review-item-001");
  assert.throws(
    () =>
      appendGeneratedContinuedSecondaryDecision(
        context,
        envelope,
        continuedCommand(context, envelope, actionResult, "same-topic"),
        "2026-09-21T14:01:00.000Z",
      ),
    resolutionError,
  );
});

test("review presentations recursively expose only the blinded metadata allowlist", () => {
  const context = buildJournalContext();
  const envelope = prepareJournal(context);
  const { action } = actionFor(context, envelope);
  const presentation = action.reviewView;

  assert.equal(
    presentation.reviewContractVersion,
    GENERATED_REVIEW_PRESENTATION_CONTRACT_VERSION,
  );
  assert.deepEqual(Object.keys(presentation.reviewItem).sort(), ["id", "sourceA", "sourceB"]);
  assert.deepEqual(Object.keys(presentation.reviewItem.sourceA).sort(), [
    "evidenceAddenda",
    "factSummary",
    "publishedAt",
    "title",
    "url",
  ]);
  const serialized = JSON.stringify(presentation);
  for (const forbidden of [
    "caseType",
    "coverageBasis",
    "coverageIndex",
    "expectedAnswer",
    "primaryLabel",
    "projectedPrimaryEventDigest",
    "provenance",
    "rationale",
    "reviewerId",
    "secondaryLabel",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("commands reject stale heads, wrong actors, wrong actions, and invalid chronology", () => {
  const context = buildJournalContext();
  const envelope = prepareJournal(context);
  const actionResult = actionFor(context, envelope);
  const valid = continuedCommand(context, envelope, actionResult, "same-topic");

  assert.throws(
    () =>
      appendGeneratedContinuedSecondaryDecision(
        context,
        envelope,
        {
          ...valid,
          expectedResolutionJournalDigest: canonicalJsonSha256({ stale: true }),
        },
        "2026-09-21T14:01:00.000Z",
      ),
    resolutionError,
  );
  assert.throws(
    () =>
      appendGeneratedContinuedSecondaryDecision(
        context,
        envelope,
        {
          ...valid,
          reviewerId: context.completionTaskEnvelope.completionTask.reviewers.primary.id,
        },
        "2026-09-21T14:01:00.000Z",
      ),
    resolutionError,
  );
  assert.throws(
    () =>
      appendGeneratedContinuedSecondaryDecision(
        context,
        envelope,
        { ...valid, actionDigest: canonicalJsonSha256({ wrong: "action" }) },
        "2026-09-21T14:01:00.000Z",
      ),
    resolutionError,
  );
  assert.throws(
    () =>
      appendGeneratedContinuedSecondaryDecision(
        context,
        envelope,
        valid,
        "2026-09-21T13:59:59.999Z",
      ),
    resolutionError,
  );
});

test("supplements reject wrong Source bindings, actors, and chronology", () => {
  const context = buildJournalContext({ "review-item-001": "uncertain" });
  const envelope = prepareJournal(context);
  const actionResult = actionFor(context, envelope);
  const valid = supplementCommand(context, envelope, actionResult);

  assert.throws(
    () =>
      appendGeneratedEvidenceSupplement(
        context,
        envelope,
        {
          ...valid,
          reviewerId: context.completionTaskEnvelope.completionTask.reviewers.primary.id,
        },
        "2026-09-21T14:03:00.000Z",
      ),
    resolutionError,
  );
  assert.throws(
    () =>
      appendGeneratedEvidenceSupplement(
        context,
        envelope,
        {
          ...valid,
          sourceAddenda: [valid.sourceAddenda[0], valid.sourceAddenda[0]],
        },
        "2026-09-21T14:03:00.000Z",
      ),
    resolutionError,
  );
  assert.throws(
    () =>
      appendGeneratedEvidenceSupplement(
        context,
        envelope,
        {
          ...valid,
          provenanceReviewedAt: "2026-09-21T14:00:30.000Z",
        },
        "2026-09-21T14:03:00.000Z",
      ),
    resolutionError,
  );
});

test("same-role rereview and journal event bounds fail closed", () => {
  const context = buildJournalContext({ "review-item-001": "uncertain" });
  let envelope = prepareJournal(context);
  envelope = appendSupplement(context, envelope);
  const actionResult = actionFor(context, envelope);
  const wrongRole = rereviewCommand(context, envelope, actionResult, "same-topic");
  wrongRole.reviewerId =
    context.completionTaskEnvelope.completionTask.reviewers.secondary.id;
  assert.throws(
    () =>
      appendGeneratedRoleRereviewDecision(
        context,
        envelope,
        wrongRole,
        "2026-09-21T14:04:00.000Z",
      ),
    resolutionError,
  );

  const oversized = structuredClone(envelope);
  oversized.resolutionJournal.events = new Array(
    GENERATED_REVIEW_RESOLUTION_LIMITS.maximumArrayEntries + 1,
  ).fill(null);
  rehash(oversized);
  assert.throws(
    () => validateGeneratedResolutionJournalEnvelope(context, oversized),
    resolutionError,
  );
});

test("base rebinding and journal/event tampering fail closed", () => {
  const context = buildJournalContext();
  let envelope = prepareJournal(context);
  envelope = appendContinued(context, envelope, "same-topic");

  const changedBaseContext = structuredClone(context);
  changedBaseContext.baseCompletionLedgerEnvelope = appendBaseDecision(
    buildUpstream(),
    prepareBase(buildUpstream()),
    "different-topic",
    "2026-09-21T13:31:00.000Z",
  );
  assert.throws(
    () => validateGeneratedResolutionJournalEnvelope(changedBaseContext, envelope),
    resolutionError,
  );

  const eventTamper = structuredClone(envelope);
  eventTamper.resolutionJournal.events[0].event.payload.label = "different-topic";
  rehash(eventTamper);
  assert.throws(
    () => validateGeneratedResolutionJournalEnvelope(context, eventTamper),
    resolutionError,
  );

  const outerTamper = structuredClone(envelope);
  outerTamper.resolutionJournalDigest = canonicalJsonSha256({ not: "the journal" });
  assert.throws(
    () => validateGeneratedResolutionJournalEnvelope(context, outerTamper),
    resolutionError,
  );
});

test("pure successors can fork and a fully rehashed suffix truncation remains valid", () => {
  const context = buildJournalContext();
  const predecessor = prepareJournal(context);
  const forkA = appendContinued(context, predecessor, "same-topic");
  const forkB = appendContinued(context, predecessor, "different-topic");

  assert.notEqual(forkA.resolutionJournalDigest, forkB.resolutionJournalDigest);
  assert.deepEqual(validateGeneratedResolutionJournalEnvelope(context, forkA), forkA);
  assert.deepEqual(validateGeneratedResolutionJournalEnvelope(context, forkB), forkB);

  const completed = appendContinued(
    context,
    forkA,
    "different-topic",
    "2026-09-21T14:02:00.000Z",
  );
  const truncated = structuredClone(completed);
  truncated.resolutionJournal.events.pop();
  rehash(truncated);

  assert.deepEqual(validateGeneratedResolutionJournalEnvelope(context, truncated), truncated);
  assert.equal(actionType(context, truncated), "continued-initial-secondary-required");
  assert.equal(actionFor(context, truncated).action.reviewItemId, "review-item-006");
  const state = generatedResolutionState(context, truncated);
  assert.equal(state.assurance.concurrencyControl, "none-pure-contract-can-fork");
  assert.equal(state.assurance.historyAuthenticity, "unkeyed-digests-not-signatures");
  assert.equal(state.assurance.latestJournalExternallyAnchored, false);
});

test("public boundaries reject behavioral, unknown, oversized, and invalid timestamp data", () => {
  const context = buildJournalContext();
  const envelope = prepareJournal(context);
  const actionResult = actionFor(context, envelope);
  let invoked = false;
  const accessorCommand = {
    get actionDigest() {
      invoked = true;
      return actionResult.actionDigest;
    },
    expectedResolutionJournalDigest: envelope.resolutionJournalDigest,
    label: "same-topic",
    reviewItemId: actionResult.action.reviewItemId,
    reviewerId: context.completionTaskEnvelope.completionTask.reviewers.secondary.id,
  };
  assert.throws(
    () =>
      appendGeneratedContinuedSecondaryDecision(
        context,
        envelope,
        accessorCommand,
        "2026-09-21T14:01:00.000Z",
      ),
    resolutionError,
  );
  assert.equal(invoked, false);

  const unknown = structuredClone(envelope);
  unknown.claimedIndependentReview = true;
  assert.throws(
    () => validateGeneratedResolutionJournalEnvelope(context, unknown),
    resolutionError,
  );

  const oversizedTimestamp = "2".repeat(
    GENERATED_REVIEW_RESOLUTION_LIMITS.maximumTimestampCodeUnits + 1,
  );
  assert.throws(() => prepareGeneratedResolutionJournalEnvelope(context, oversizedTimestamp), resolutionError);

  const uncertainContext = buildJournalContext({ "review-item-001": "uncertain" });
  const uncertainEnvelope = prepareJournal(uncertainContext);
  const uncertainAction = actionFor(uncertainContext, uncertainEnvelope);
  const oversized = supplementCommand(uncertainContext, uncertainEnvelope, uncertainAction);
  oversized.sourceAddenda[0].text = "x".repeat(
    GENERATED_REVIEW_RESOLUTION_LIMITS.maximumStringCodeUnits + 1,
  );
  assert.throws(
    () =>
      appendGeneratedEvidenceSupplement(
        uncertainContext,
        uncertainEnvelope,
        oversized,
        "2026-09-21T14:03:00.000Z",
      ),
    resolutionError,
  );
});

test("generated state preserves every real-review, corpus, split, evaluation, and gate non-claim", () => {
  const context = buildJournalContext();
  const envelope = prepareJournal(context);
  const state = generatedResolutionState(context, envelope);

  assert.equal(
    state.resolutionStateContractVersion,
    GENERATED_REVIEW_RESOLUTION_STATE_CONTRACT_VERSION,
  );
  assert.equal(state.claims.eligibleIndependentHumanReviewDecisions, 0);
  for (const field of [
    "adjudicationComplete",
    "automaticJoinDecisionMade",
    "corpusMaterialized",
    "evaluationPerformed",
    "gateEligible",
    "heldOut",
    "independentHumanReviewVerified",
    "ownerCheckpointReached",
    "realMetadataAuthorized",
    "secondaryReviewComplete",
    "splitFrozen",
  ]) {
    assert.equal(state.claims[field], false, field);
  }
});
