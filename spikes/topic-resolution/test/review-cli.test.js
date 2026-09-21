import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runReviewCli } from "../review/run-review.js";
import { loadReviewWorkspace } from "../review/review-workspace.js";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(packageDirectory, "review", "fixtures");

function sink(isTTY = false) {
  return {
    isTTY,
    text: "",
    write(chunk) {
      this.text += String(chunk);
      return true;
    },
  };
}

async function temporaryWorkspace(t) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "udl-review-cli-"));
  t.after(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  return path.join(temporaryRoot, "workspace");
}

function prepareArguments(workspace) {
  return [
    "prepare",
    "--workspace",
    workspace,
    "--config",
    path.join(fixtureDirectory, "synthetic-config.tsv"),
    "--sources",
    path.join(fixtureDirectory, "synthetic-sources.tsv"),
    "--pairs",
    path.join(fixtureDirectory, "synthetic-pairs.tsv"),
  ];
}

async function prepareWithCli(t) {
  const workspace = await temporaryWorkspace(t);
  const output = sink();
  const error = sink();
  const exitCode = await runReviewCli({
    argv: prepareArguments(workspace),
    output,
    error,
  });
  assert.equal(exitCode, 0, error.text);
  return { workspace, output, error };
}

test("prepare stops after creating a digest-bound synthetic demo", async (t) => {
  const { workspace, output, error } = await prepareWithCli(t);
  assert.equal(error.text, "");
  assert.match(output.text, /"ownerReviewStarted": false/);
  assert.match(output.text, /"syntheticFixtureOnly": true/);
  assert.match(output.text, /"belowPairAndCasePreparationMinimums": true/);
  assert.match(output.text, /"corpusMaterialized": false/);
  assert.match(output.text, /"splitFrozen": false/);
  assert.match(output.text, /"evaluationPerformed": false/);
  assert.deepEqual(await readdir(path.join(workspace, "events")), []);
});

test("non-interactive owner display never hangs or writes without a label", async (t) => {
  const { workspace } = await prepareWithCli(t);
  const output = sink();
  const error = sink();
  const exitCode = await runReviewCli({
    argv: ["owner", "--workspace", workspace],
    output,
    error,
    isTTY: false,
  });
  assert.equal(exitCode, 0, error.text);
  assert.match(output.text, /"persisted": false/);
  assert.match(output.text, /"reviewItem"/);
  for (const hidden of [
    "duplicate-positive",
    "syndication-positive",
    "related-distinct",
    "unrelated-control",
    "adversarial-title",
    "update-continuation-boundary",
    "provenanceOrigin",
    "rightsBasis",
  ]) {
    assert.equal(output.text.includes(hidden), false, hidden);
  }
  assert.deepEqual((await loadReviewWorkspace(workspace)).ledger.events, []);
});

test("one explicit relationship is persisted and status reveals counts only", async (t) => {
  const { workspace } = await prepareWithCli(t);
  const answerOutput = sink();
  const answerError = sink();
  const answerCode = await runReviewCli({
    argv: ["owner", "--workspace", workspace, "--label", "same-topic"],
    output: answerOutput,
    error: answerError,
    now: () => new Date("2026-09-21T13:00:00.000Z"),
  });
  assert.equal(answerCode, 0, answerError.text);
  assert.match(answerOutput.text, /"persisted": true/);
  assert.match(answerOutput.text, /"answered": 1/);
  const loaded = await loadReviewWorkspace(workspace);
  assert.equal(loaded.ledger.events.length, 1);
  assert.equal(loaded.ledger.events[0].event.label, "same-topic");

  const statusOutput = sink();
  const statusError = sink();
  const statusCode = await runReviewCli({
    argv: ["status", "--workspace", workspace],
    output: statusOutput,
    error: statusError,
  });
  assert.equal(statusCode, 0, statusError.text);
  assert.match(statusOutput.text, /"answered": 1/);
  assert.match(statusOutput.text, /"heldOut": false/);
  assert.doesNotMatch(statusOutput.text, /https:\/\//);
  assert.doesNotMatch(statusOutput.text, /factSummary|title|rationale/);
});

test("interactive quit and invalid choice write no event", async (t) => {
  const { workspace } = await prepareWithCli(t);
  const output = sink(true);
  const error = sink(true);
  const choices = ["not-a-choice", "q"];
  let closed = false;
  const exitCode = await runReviewCli({
    argv: ["owner", "--workspace", workspace],
    input: { isTTY: true },
    output,
    error,
    isTTY: true,
    createPrompt: () => ({
      question: async () => choices.shift(),
      close: () => {
        closed = true;
      },
    }),
  });
  assert.equal(exitCode, 0, error.text);
  assert.equal(closed, true);
  assert.match(output.text, /Invalid choice/);
  assert.deepEqual((await loadReviewWorkspace(workspace)).ledger.events, []);
});

test("unknown options and invalid clocks fail closed without echoing supplied values", async (t) => {
  const { workspace } = await prepareWithCli(t);
  const optionOutput = sink();
  const optionError = sink();
  const privateValue = "do-not-echo-reviewer-value";
  const optionCode = await runReviewCli({
    argv: ["owner", "--workspace", workspace, "--reviewer", privateValue],
    output: optionOutput,
    error: optionError,
  });
  assert.equal(optionCode, 1);
  assert.equal(optionError.text.includes(privateValue), false);
  assert.match(optionError.text, /"code": "UNKNOWN_OPTION"/);

  const clockOutput = sink();
  const clockError = sink();
  const clockCode = await runReviewCli({
    argv: ["owner", "--workspace", workspace, "--label", "uncertain"],
    output: clockOutput,
    error: clockError,
    now: () => "not-a-time",
  });
  assert.equal(clockCode, 1);
  assert.match(clockError.text, /"code": "INVALID_CLOCK"/);
  assert.deepEqual((await loadReviewWorkspace(workspace)).ledger.events, []);
});

test("help exposes only prepare, owner, and status workflow commands", async () => {
  const output = sink();
  const error = sink();
  assert.equal(await runReviewCli({ argv: ["--help"], output, error }), 0);
  assert.equal(error.text, "");
  assert.match(output.text, /review prepare/);
  assert.match(output.text, /review owner/);
  assert.match(output.text, /review status/);
  assert.match(output.text, /intentionally no finalize, corpus-export, split, or evaluation command/);
});
