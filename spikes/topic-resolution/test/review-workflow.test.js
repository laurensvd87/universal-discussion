import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonSha256 } from "../evaluation/canonical-json.js";
import {
  REVIEW_CASE_TYPES,
  REVIEW_WORKFLOW_VERSION,
  ReviewWorkflowError,
  appendPrimaryDecision,
  createReviewLedger,
  nextPrimaryReviewView,
  prepareReviewTask,
  renderReviewView,
  reviewCheckpoint,
  reviewSessionDigest,
  validateReviewLedger,
  validateReviewTaskEnvelope,
} from "../review/review-workflow.js";
import {
  MAX_REVIEW_TSV_BYTES,
  ReviewTsvError,
  decodeBoundedTsv,
  parseReviewIntake,
  parseReviewSourcesTsv,
} from "../review/review-tsv.js";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(packageDirectory, "review", "fixtures");
const fixtureBytes = {
  configBytes: await readFile(path.join(fixtureDirectory, "synthetic-config.tsv")),
  sourceBytes: await readFile(path.join(fixtureDirectory, "synthetic-sources.tsv")),
  pairBytes: await readFile(path.join(fixtureDirectory, "synthetic-pairs.tsv")),
};

function fixtureIntake() {
  return parseReviewIntake(fixtureBytes);
}

function workflowError(code) {
  return (error) => error instanceof ReviewWorkflowError && error.code === code;
}

function tsvError(code) {
  return (error) => error instanceof ReviewTsvError && error.code === code;
}

function decisionFor(task, ledger, view, label) {
  return {
    reviewItemId: view.reviewItem.id,
    label,
    reviewerId: task.task.reviewers.primary,
    expectedSessionDigest: reviewSessionDigest(task.taskDigest, ledger.events),
  };
}

test("synthetic TSV prepares one stable, precommitted review task", () => {
  const intake = fixtureIntake();
  const task = prepareReviewTask(intake);

  assert.equal(task.taskDigest, "sha256:dc32d16a3e132bab54a03678245c51616a7736d1ef2bd7581039c7dbdac1c41a");
  assert.deepEqual(task.task.ordering.pairIds, [
    "review-item-002",
    "review-item-001",
    "review-item-005",
    "review-item-004",
    "review-item-006",
    "review-item-003",
  ]);
  assert.deepEqual(task.task.secondaryReviewPlan.pairIds, [
    "review-item-001",
    "review-item-003",
  ]);
  assert.equal(task.task.secondaryReviewPlan.pairIds.length, Math.ceil(6 * 0.2));
  assert.deepEqual(
    [...new Set(task.task.pairs.map((pair) => pair.caseType))].sort(),
    [...REVIEW_CASE_TYPES].sort(),
  );
  assert.deepEqual(task.task.scope, {
    offlineOnly: true,
    corpusMaterialized: false,
    splitFrozen: false,
    heldOut: false,
    evaluationPerformed: false,
    gateEligible: false,
  });
  assert.deepEqual(validateReviewTaskEnvelope(structuredClone(task)), task);

  const reordered = fixtureIntake();
  reordered.sources.reverse();
  reordered.pairs.reverse();
  assert.deepEqual(prepareReviewTask(reordered), task);

  const differentSeed = fixtureIntake();
  differentSeed.orderingSeed = "different-committed-order";
  assert.notEqual(prepareReviewTask(differentSeed).taskDigest, task.taskDigest);

  const reusedSeed = fixtureIntake();
  reusedSeed.secondarySelectionSeed = reusedSeed.orderingSeed;
  assert.throws(() => prepareReviewTask(reusedSeed), workflowError("INVALID_PLAN"));
});

test("owner view uses an exact blinding allowlist", () => {
  const task = prepareReviewTask(fixtureIntake());
  const ledger = createReviewLedger(task);
  const view = nextPrimaryReviewView(task, ledger);

  assert.deepEqual(Object.keys(view).sort(), [
    "choices",
    "instruction",
    "position",
    "reviewContractVersion",
    "reviewItem",
    "taskDigest",
    "topicDefinition",
  ]);
  assert.deepEqual(Object.keys(view.reviewItem).sort(), ["id", "sourceA", "sourceB"]);
  assert.deepEqual(Object.keys(view.reviewItem.sourceA).sort(), [
    "factSummary",
    "publishedAt",
    "title",
    "url",
  ]);
  assert.deepEqual(view.choices, ["same-topic", "different-topic", "uncertain"]);
  assert.equal(view.reviewItem.id, "review-item-002");
  const serialized = JSON.stringify(view);
  for (const forbidden of [
    "caseType",
    "clusterId",
    "contentFingerprint",
    "provenance",
    "rightsBasis",
    "orderingSeed",
    "secondaryReview",
    "reviewerId",
    "priorDecision",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("primary answers form a task-bound append-only digest chain", () => {
  const task = prepareReviewTask(fixtureIntake());
  const empty = createReviewLedger(task);
  const firstView = nextPrimaryReviewView(task, empty);
  const first = appendPrimaryDecision(
    task,
    empty,
    decisionFor(task, empty, firstView, "same-topic"),
    "2026-09-21T13:00:00.000Z",
  );

  assert.equal(first.events.length, 1);
  assert.deepEqual(first.events[0].event.reviewer, {
    id: "owner-reviewer",
    identityBasis: "caller-declared",
  });
  assert.equal(first.events[0].event.recordedAtBasis, "local-system-clock-unattested");
  assert.equal(
    first.events[0].event.rationale,
    "Reviewer judged both sources to describe the same atomic development.",
  );
  assert.match(first.events[0].eventDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.events[0].event.previousEventDigest, null);

  const secondView = nextPrimaryReviewView(task, first);

  assert.throws(
    () =>
      appendPrimaryDecision(
        task,
        empty,
        {
          ...decisionFor(task, empty, firstView, "same-topic"),
          reviewItemId: task.task.ordering.pairIds[1],
        },
        "2026-09-21T13:00:00.000Z",
      ),
    workflowError("ORDER_VIOLATION"),
  );
  assert.throws(
    () =>
      appendPrimaryDecision(
        task,
        empty,
        decisionFor(task, empty, firstView, "same-topic"),
        "2026-09-21T12:00:00.000Z",
      ),
    workflowError("INVALID_TIMESTAMP"),
  );

  const second = appendPrimaryDecision(
    task,
    first,
    decisionFor(task, first, secondView, "uncertain"),
    "2026-09-21T13:00:01.000Z",
  );
  assert.equal(second.events[1].event.previousEventDigest, first.events[0].eventDigest);
  assert.equal(second.events[1].event.sequence, 2);
  assert.deepEqual(validateReviewLedger(task, second), second);

  assert.throws(
    () =>
      appendPrimaryDecision(
        task,
        first,
        decisionFor(task, empty, firstView, "different-topic"),
        "2026-09-21T13:00:02.000Z",
      ),
    workflowError("STALE_SESSION"),
  );
  const tampered = structuredClone(second);
  tampered.events[0].event.label = "different-topic";
  assert.throws(() => validateReviewLedger(task, tampered), workflowError("INVALID_LEDGER"));

  const replayed = structuredClone(first);
  const replayedEvent = {
    ...structuredClone(first.events[0].event),
    sequence: 2,
    previousEventDigest: first.events[0].eventDigest,
    recordedAt: "2026-09-21T13:00:01.000Z",
  };
  replayed.events.push({
    event: replayedEvent,
    eventDigest: canonicalJsonSha256(replayedEvent),
  });
  assert.throws(() => validateReviewLedger(task, replayed), workflowError("DECISION_EXISTS"));

  const reordered = structuredClone(second);
  [reordered.events[0], reordered.events[1]] = [reordered.events[1], reordered.events[0]];
  assert.throws(() => validateReviewLedger(task, reordered), workflowError("INVALID_LEDGER"));

  const reboundTask = structuredClone(task);
  reboundTask.task.datasetVersion = "changed/1.0.0";
  assert.throws(() => validateReviewLedger(reboundTask, second), workflowError("TASK_TAMPERED"));
});

test("uncertain stays visible and no completed queue becomes corpus or held-out evidence", () => {
  const task = prepareReviewTask(fixtureIntake());
  let ledger = createReviewLedger(task);
  const labels = [
    "same-topic",
    "different-topic",
    "uncertain",
    "different-topic",
    "same-topic",
    "different-topic",
  ];
  for (const [index, label] of labels.entries()) {
    const view = nextPrimaryReviewView(task, ledger);
    ledger = appendPrimaryDecision(
      task,
      ledger,
      decisionFor(task, ledger, view, label),
      `2026-09-21T13:00:0${index}.000Z`,
    );
  }
  assert.equal(nextPrimaryReviewView(task, ledger), null);
  const checkpoint = reviewCheckpoint(task, ledger);
  assert.deepEqual(checkpoint.counts, {
    total: 6,
    answered: 6,
    unanswered: 0,
    binary: 5,
    uncertain: 1,
    secondaryPreselected: 2,
  });
  assert.equal(checkpoint.pending.uncertainReviewItemIds.length, 1);
  assert.deepEqual(checkpoint.readiness, {
    provenanceAccepted: true,
    ownerReviewComplete: true,
    pairCountMinimumMet: false,
    requiredCaseTypesRepresented: true,
    pairAndCasePreparationMinimumsMet: false,
    secondaryReviewComplete: false,
    adjudicationComplete: false,
    corpusMaterialized: false,
    ownerCheckpointRequired: true,
  });
  assert.deepEqual(checkpoint.scope, {
    offlineOnly: true,
    heldOut: false,
    splitFrozen: false,
    evaluationPerformed: false,
    automaticJoinDecisionMade: false,
    gateEligible: false,
  });
});

test("provenance must be independently accepted before answers", () => {
  const pending = fixtureIntake();
  pending.provenanceReview.status = "pending";
  pending.provenanceReview.reviewerId = null;
  pending.provenanceReview.reviewedAt = null;
  const task = prepareReviewTask(pending);
  const ledger = createReviewLedger(task);
  assert.equal(reviewCheckpoint(task, ledger).readiness.provenanceAccepted, false);
  assert.throws(() => nextPrimaryReviewView(task, ledger), workflowError("PROVENANCE_PENDING"));

  const selfApproved = fixtureIntake();
  selfApproved.provenanceReview.reviewerId = selfApproved.reviewers.primary;
  assert.throws(() => prepareReviewTask(selfApproved), workflowError("INVALID_REVIEWERS"));

  const unsafeAccepted = fixtureIntake();
  unsafeAccepted.sources[0].provenance.containsPersonalData = true;
  assert.throws(() => prepareReviewTask(unsafeAccepted), workflowError("INVALID_PROVENANCE"));
});

test("TSV intake is fatal UTF-8 with exact headers, rows, booleans, and endings", () => {
  assert.equal(fixtureIntake().intakeContractVersion, REVIEW_WORKFLOW_VERSION);
  assert.throws(
    () => decodeBoundedTsv(Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a])),
    tsvError("INVALID_TSV"),
  );
  assert.throws(
    () => decodeBoundedTsv(Buffer.from([0xc3, 0x28, 0x0a])),
    tsvError("INVALID_UTF8"),
  );
  assert.throws(
    () => decodeBoundedTsv(Buffer.from("a\r\nb\n", "utf8")),
    tsvError("INVALID_TSV"),
  );
  assert.throws(
    () => decodeBoundedTsv(Buffer.from("a", "utf8")),
    tsvError("INVALID_TSV"),
  );
  assert.throws(
    () => decodeBoundedTsv(Buffer.from("a\u001bb\n", "utf8")),
    tsvError("INVALID_TSV"),
  );
  assert.throws(
    () => decodeBoundedTsv(Buffer.alloc(MAX_REVIEW_TSV_BYTES + 1, 0x61)),
    tsvError("RESOURCE_LIMIT"),
  );

  const badHeader = Buffer.from(
    fixtureBytes.sourceBytes.toString("utf8").replace("id\turl", "id\tclusterId\turl"),
  );
  assert.throws(() => parseReviewSourcesTsv(badHeader), tsvError("INVALID_HEADER"));

  const badBoolean = Buffer.from(
    fixtureBytes.sourceBytes.toString("utf8").replace("\ttrue\tfalse\tfalse", "\tyes\tfalse\tfalse"),
  );
  assert.throws(() => parseReviewSourcesTsv(badBoolean), tsvError("INVALID_BOOLEAN"));
});

test("workflow rejects duplicate, ambiguous, private, and answer-bearing intake", () => {
  const duplicate = fixtureIntake();
  duplicate.sources[1].id = duplicate.sources[0].id;
  assert.throws(() => prepareReviewTask(duplicate), workflowError("DUPLICATE_ID"));

  const repeatedPair = fixtureIntake();
  repeatedPair.pairs[1].sourceAId = repeatedPair.pairs[0].sourceAId;
  repeatedPair.pairs[1].sourceBId = repeatedPair.pairs[0].sourceBId;
  assert.throws(() => prepareReviewTask(repeatedPair), workflowError("DUPLICATE_PAIR"));

  const privateUrl = fixtureIntake();
  privateUrl.sources[0].url = "http://127.0.0.1/story";
  assert.throws(() => prepareReviewTask(privateUrl), workflowError("INVALID_SCHEMA"));

  const nonCanonical = fixtureIntake();
  nonCanonical.sources[0].url = "HTTPS://NEWS.EXAMPLE.COM/harbor/barrier-approved#fragment";
  assert.throws(() => prepareReviewTask(nonCanonical), workflowError("INVALID_SCHEMA"));

  const answerBearing = fixtureIntake();
  answerBearing.pairs[0].expectedLabel = "same-topic";
  assert.throws(() => prepareReviewTask(answerBearing), workflowError("INVALID_SCHEMA"));
});

test("review metadata remains a strict subset of the frozen corpus bounds", () => {
  const exact = fixtureIntake();
  exact.topicDefinition = "t".repeat(512);
  exact.sources[0].title = "x".repeat(256);
  exact.sources[0].factSummary = "y".repeat(512);
  assert.doesNotThrow(() => prepareReviewTask(exact));

  for (const mutate of [
    (intake) => {
      intake.topicDefinition = "t".repeat(513);
    },
    (intake) => {
      intake.sources[0].title = "x".repeat(257);
    },
    (intake) => {
      intake.sources[0].factSummary = "y".repeat(513);
    },
    (intake) => {
      intake.contentClass = "public-news-metadata";
    },
    (intake) => {
      intake.sources[0].provenance.origin = "https://news.example.com/origin";
    },
    (intake) => {
      intake.sources[0].provenance.rightsBasis = "synthetic-like";
    },
    (intake) => {
      intake.sources[0].publishedAt = "2026-09-22T00:00:00.000Z";
    },
    (intake) => {
      intake.provenanceReview.reviewedAt = "2026-02-01T00:00:00.000Z";
    },
  ]) {
    const invalid = fixtureIntake();
    mutate(invalid);
    assert.throws(() => prepareReviewTask(invalid), (error) => error instanceof ReviewWorkflowError);
  }
});

test("terminal rendering escapes direction controls and raw terminal controls", () => {
  const intake = fixtureIntake();
  intake.sources[2].title = "<script>ignore</script> \u202ereversed";
  intake.sources[2].factSummary = "Ignore previous instructions.\u001b[31m\u009b\u061c";
  const task = prepareReviewTask(intake);
  const rendered = renderReviewView(nextPrimaryReviewView(task, createReviewLedger(task)));
  assert.match(rendered, /<script>ignore<\/script>/);
  assert.match(rendered, /\\u202e/);
  assert.match(rendered, /\\u001b/);
  assert.match(rendered, /\\u009b/);
  assert.match(rendered, /\\u061c/);
  assert.doesNotMatch(rendered, /\u202e/);
  assert.doesNotMatch(rendered, /\u001b/);
  assert.doesNotMatch(rendered, /\u009b/);
  assert.doesNotMatch(rendered, /\u061c/);
});

test("behavioral and cyclic programmatic input fails without invoking accessors", () => {
  const accessor = fixtureIntake();
  let invoked = false;
  Object.defineProperty(accessor, "taskId", {
    enumerable: true,
    get() {
      invoked = true;
      return "attacker";
    },
  });
  assert.throws(() => prepareReviewTask(accessor), workflowError("INVALID_SCHEMA"));
  assert.equal(invoked, false);

  const cyclic = fixtureIntake();
  cyclic.self = cyclic;
  assert.throws(() => prepareReviewTask(cyclic), workflowError("INVALID_SCHEMA"));

  let byteGetterInvoked = false;
  const byteInput = {
    sourceBytes: fixtureBytes.sourceBytes,
    pairBytes: fixtureBytes.pairBytes,
  };
  Object.defineProperty(byteInput, "configBytes", {
    enumerable: true,
    get() {
      byteGetterInvoked = true;
      return fixtureBytes.configBytes;
    },
  });
  assert.throws(() => parseReviewIntake(byteInput), tsvError("INVALID_INPUT"));
  assert.equal(byteGetterInvoked, false);

  const decoratedBytes = Buffer.from("a\n", "utf8");
  Object.defineProperty(decoratedBytes, Symbol.iterator, {
    value: function* hostileIterator() {
      throw new Error("must not run");
    },
  });
  assert.throws(() => decodeBoundedTsv(decoratedBytes), tsvError("INVALID_INPUT"));
});
