import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  nextPrimaryReviewView,
  reviewSessionDigest,
} from "../review/review-workflow.js";
import { parseReviewIntake } from "../review/review-tsv.js";
import {
  ReviewWorkspaceError,
  appendDecisionToWorkspace,
  loadReviewWorkspace,
  prepareReviewWorkspace,
  reviewWorkspaceCheckpoint,
} from "../review/review-workspace.js";

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

function workspaceError(code) {
  return (error) => error instanceof ReviewWorkspaceError && error.code === code;
}

async function temporaryWorkspace(t) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "udl-review-"));
  t.after(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  return path.join(temporaryRoot, "workspace");
}

function decisionFor(workspace, view, label) {
  return {
    reviewItemId: view.reviewItem.id,
    label,
    reviewerId: workspace.taskEnvelope.task.reviewers.primary,
    expectedSessionDigest: reviewSessionDigest(
      workspace.taskEnvelope.taskDigest,
      workspace.ledger.events,
    ),
  };
}

test("workspace preparation is exclusive and reloads the immutable task", async (t) => {
  const directory = await temporaryWorkspace(t);
  const prepared = await prepareReviewWorkspace(directory, fixtureIntake());
  const taskText = await readFile(path.join(directory, "task.json"), "utf8");
  const loaded = await loadReviewWorkspace(directory);

  assert.equal(loaded.workspaceDirectory, path.resolve(directory));
  assert.equal(loaded.taskEnvelope.taskDigest, prepared.taskEnvelope.taskDigest);
  assert.deepEqual(loaded.ledger.events, []);
  assert.deepEqual(loaded.recoveryWarnings, []);
  assert.deepEqual(await readdir(path.join(directory, "events")), []);
  assert.equal((await readFile(path.join(directory, "task.json"), "utf8")), taskText);

  await assert.rejects(
    () => prepareReviewWorkspace(directory, fixtureIntake()),
    workspaceError("WORKSPACE_EXISTS"),
  );
});

test("each owner answer is durably appended before the next item", async (t) => {
  const directory = await temporaryWorkspace(t);
  let workspace = await prepareReviewWorkspace(directory, fixtureIntake());
  const originalTask = await readFile(path.join(directory, "task.json"), "utf8");
  const firstView = nextPrimaryReviewView(workspace.taskEnvelope, workspace.ledger);

  const updated = await appendDecisionToWorkspace(
    directory,
    decisionFor(workspace, firstView, "same-topic"),
    "2026-09-21T13:00:00.000Z",
  );
  assert.equal(updated.ledger.events.length, 1);
  assert.equal(updated.checkpoint.counts.answered, 1);
  assert.equal(updated.checkpoint.pending.nextReviewItemId, "review-item-001");
  assert.deepEqual(await readdir(path.join(directory, "events")), ["000001.json"]);
  assert.equal((await readFile(path.join(directory, "task.json"), "utf8")), originalTask);

  workspace = await loadReviewWorkspace(directory);
  const secondView = nextPrimaryReviewView(workspace.taskEnvelope, workspace.ledger);
  await appendDecisionToWorkspace(
    directory,
    decisionFor(workspace, secondView, "uncertain"),
    "2026-09-21T13:00:01.000Z",
  );
  const status = await reviewWorkspaceCheckpoint(directory);
  assert.equal(status.checkpoint.counts.answered, 2);
  assert.equal(status.checkpoint.counts.binary, 1);
  assert.equal(status.checkpoint.counts.uncertain, 1);
  assert.deepEqual(await readdir(path.join(directory, "events")), [
    "000001.json",
    "000002.json",
  ]);
});

test("concurrent sessions cannot overwrite the same event sequence", async (t) => {
  const directory = await temporaryWorkspace(t);
  const workspace = await prepareReviewWorkspace(directory, fixtureIntake());
  const view = nextPrimaryReviewView(workspace.taskEnvelope, workspace.ledger);
  const decision = decisionFor(workspace, view, "different-topic");

  const results = await Promise.allSettled([
    appendDecisionToWorkspace(directory, decision, "2026-09-21T13:00:00.000Z"),
    appendDecisionToWorkspace(directory, decision, "2026-09-21T13:00:00.000Z"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected").reason;
  assert.ok(
    rejected instanceof ReviewWorkspaceError &&
      (rejected.code === "CONCURRENT_UPDATE" || rejected.code === "DECISION_REJECTED"),
  );
  const reloaded = await loadReviewWorkspace(directory);
  assert.equal(reloaded.ledger.events.length, 1);
  assert.deepEqual(await readdir(path.join(directory, "events")), ["000001.json"]);
});

test("tampering, truncation, gaps, and unexpected files fail closed", async (t) => {
  const directory = await temporaryWorkspace(t);
  const workspace = await prepareReviewWorkspace(directory, fixtureIntake());
  const view = nextPrimaryReviewView(workspace.taskEnvelope, workspace.ledger);
  await appendDecisionToWorkspace(
    directory,
    decisionFor(workspace, view, "same-topic"),
    "2026-09-21T13:00:00.000Z",
  );
  const eventPath = path.join(directory, "events", "000001.json");
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  event.event.label = "different-topic";
  await writeFile(eventPath, `${JSON.stringify(event)}\n`, "utf8");
  await assert.rejects(() => loadReviewWorkspace(directory), workspaceError("WORKSPACE_CORRUPT"));

  const secondDirectory = `${directory}-truncated`;
  await prepareReviewWorkspace(secondDirectory, fixtureIntake());
  await writeFile(path.join(secondDirectory, "events", "000002.json"), "{", "utf8");
  await assert.rejects(
    () => loadReviewWorkspace(secondDirectory),
    workspaceError("WORKSPACE_CORRUPT"),
  );

  const thirdDirectory = `${directory}-unexpected`;
  await prepareReviewWorkspace(thirdDirectory, fixtureIntake());
  await writeFile(path.join(thirdDirectory, "events", "notes.txt"), "not state", "utf8");
  await assert.rejects(
    () => loadReviewWorkspace(thirdDirectory),
    workspaceError("WORKSPACE_CORRUPT"),
  );
});

test("an interrupted uncommitted temp file is ignored but reported", async (t) => {
  const directory = await temporaryWorkspace(t);
  await prepareReviewWorkspace(directory, fixtureIntake());
  await writeFile(
    path.join(directory, "events", ".pending-00000000-0000-4000-8000-000000000000.tmp"),
    "partial",
    "utf8",
  );
  const loaded = await loadReviewWorkspace(directory);
  assert.deepEqual(loaded.ledger.events, []);
  assert.deepEqual(loaded.recoveryWarnings, ["ignored-uncommitted-pending-event"]);
});
