import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  nextPrimaryReviewView,
  renderReviewView,
  reviewCheckpoint,
  reviewSessionDigest,
} from "./review-workflow.js";
import { MAX_REVIEW_TSV_BYTES, parseReviewIntake } from "./review-tsv.js";
import {
  appendDecisionToWorkspace,
  loadReviewWorkspace,
  prepareReviewWorkspace,
  reviewWorkspaceCheckpoint,
} from "./review-workspace.js";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultFixtureDirectory = path.join(packageDirectory, "review", "fixtures");
const defaults = Object.freeze({
  workspace: path.join(packageDirectory, "review", "work", "synthetic-owner-review"),
  config: path.join(defaultFixtureDirectory, "synthetic-config.tsv"),
  sources: path.join(defaultFixtureDirectory, "synthetic-sources.tsv"),
  pairs: path.join(defaultFixtureDirectory, "synthetic-pairs.tsv"),
});
const COMMAND_FLAGS = Object.freeze({
  prepare: new Set(["workspace", "config", "sources", "pairs"]),
  owner: new Set(["workspace", "label"]),
  status: new Set(["workspace"]),
});
const CHOICE_MAP = Object.freeze({
  s: "same-topic",
  same: "same-topic",
  "same-topic": "same-topic",
  d: "different-topic",
  different: "different-topic",
  "different-topic": "different-topic",
  u: "uncertain",
  uncertain: "uncertain",
});

export class ReviewCliError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ReviewCliError";
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new ReviewCliError(code, message, cause);
}

function writeJson(stream, value) {
  stream.write(`${renderReviewView(value)}\n`);
}

function usage() {
  return [
    "Offline owner-review workflow",
    "",
    "Commands:",
    "  review prepare [--config PATH --sources PATH --pairs PATH --workspace PATH]",
    "  review owner [--workspace PATH] [--label same-topic|different-topic|uncertain]",
    "  review status [--workspace PATH]",
    "",
    "There is intentionally no finalize, corpus-export, split, or evaluation command.",
  ].join("\n");
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) {
    fail("INVALID_ARGUMENTS", "CLI arguments must be strings");
  }
  const command = argv[0];
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", values: { ...defaults } };
  }
  if (!Object.hasOwn(COMMAND_FLAGS, command)) {
    fail("UNKNOWN_COMMAND", "Unknown review command");
  }
  const values = { ...defaults };
  const seen = new Set();
  for (let index = 1; index < argv.length; index += 2) {
    const token = argv[index];
    if (!/^--[a-z]+$/u.test(token)) {
      fail("INVALID_ARGUMENTS", "Review options must use --name VALUE pairs");
    }
    const name = token.slice(2);
    if (!COMMAND_FLAGS[command].has(name)) {
      fail("UNKNOWN_OPTION", "Option is not supported for this review command");
    }
    if (seen.has(name)) {
      fail("DUPLICATE_OPTION", "Each review option may be supplied only once");
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--")) {
      fail("INVALID_ARGUMENTS", "Every review option requires a value");
    }
    seen.add(name);
    values[name] = value;
  }
  return { command, values };
}

async function readBoundedTsvFile(file, label) {
  const resolved = path.resolve(file);
  let stats;
  try {
    stats = await lstat(resolved);
  } catch (error) {
    fail("INTAKE_UNREADABLE", `${label} is unavailable`, error);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    fail("UNSAFE_INTAKE", `${label} must be a regular file, not a link`);
  }
  if (stats.size <= 0 || stats.size > MAX_REVIEW_TSV_BYTES) {
    fail("INTAKE_TOO_LARGE", `${label} exceeds the bounded TSV size`);
  }
  try {
    return await readFile(resolved);
  } catch (error) {
    fail("INTAKE_UNREADABLE", `${label} could not be read`, error);
  }
}

function safePreparationSummary(workspace) {
  const pairCount = workspace.taskEnvelope.task.pairs.length;
  const representedCaseTypes = new Set(
    workspace.taskEnvelope.task.pairs.map((pair) => pair.caseType),
  );
  return {
    command: "prepare",
    workspace: workspace.workspaceDirectory,
    taskDigest: workspace.taskEnvelope.taskDigest,
    pairCount,
    secondaryReviewItemsPreselected:
      workspace.taskEnvelope.task.secondaryReviewPlan.pairIds.length,
    provenanceStatus: workspace.taskEnvelope.task.provenanceReview.status,
    syntheticFixtureOnly: workspace.taskEnvelope.task.sources.every(
      (source) => source.provenance.kind === "project-created-synthetic",
    ),
    belowPairAndCasePreparationMinimums:
      pairCount < 200 ||
      ![
        "adversarial-title",
        "duplicate-positive",
        "related-distinct",
        "syndication-positive",
        "unrelated-control",
        "update-continuation-boundary",
      ].every((caseType) => representedCaseTypes.has(caseType)),
    ownerReviewStarted: false,
    corpusMaterialized: false,
    splitFrozen: false,
    evaluationPerformed: false,
    nextAction:
      "Inspect this prepared local task, then invoke owner review explicitly; this command never starts labeling.",
  };
}

async function prepareCommand(values, output) {
  const [configBytes, sourceBytes, pairBytes] = await Promise.all([
    readBoundedTsvFile(values.config, "Review config TSV"),
    readBoundedTsvFile(values.sources, "Review Sources TSV"),
    readBoundedTsvFile(values.pairs, "Review pairs TSV"),
  ]);
  const intake = parseReviewIntake({ configBytes, sourceBytes, pairBytes });
  const workspace = await prepareReviewWorkspace(values.workspace, intake);
  writeJson(output, safePreparationSummary(workspace));
}

async function statusCommand(values, output) {
  const status = await reviewWorkspaceCheckpoint(values.workspace);
  writeJson(output, {
    command: "status",
    ...status,
  });
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

function canonicalNow(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    fail("INVALID_CLOCK", "Local review clock did not produce a valid timestamp");
  }
  return date.toISOString();
}

async function persistOneAnswer(values, workspace, view, label, output, now) {
  const updated = await appendDecisionToWorkspace(
    values.workspace,
    decisionFor(workspace, view, label),
    canonicalNow(now),
  );
  writeJson(output, {
    command: "owner",
    persisted: true,
    reviewItemId: view.reviewItem.id,
    checkpoint: updated.checkpoint,
  });
  return updated;
}

async function ownerCommand(values, io) {
  let workspace = await loadReviewWorkspace(values.workspace);
  let view = nextPrimaryReviewView(workspace.taskEnvelope, workspace.ledger);
  if (view === null) {
    writeJson(io.output, {
      command: "owner",
      complete: true,
      checkpoint: reviewCheckpoint(workspace.taskEnvelope, workspace.ledger),
    });
    return;
  }
  writeJson(io.output, view);

  if (values.label !== undefined) {
    const label = CHOICE_MAP[values.label];
    if (label === undefined || label !== values.label) {
      fail(
        "INVALID_LABEL",
        "--label must be same-topic, different-topic, or uncertain",
      );
    }
    await persistOneAnswer(values, workspace, view, label, io.output, io.now);
    return;
  }

  if (!io.isTTY) {
    writeJson(io.output, {
      command: "owner",
      persisted: false,
      instruction:
        "No answer was recorded because input is non-interactive; rerun in a terminal or provide one explicit --label.",
    });
    return;
  }

  const prompt = io.createPrompt({ input: io.input, output: io.output, terminal: true });
  try {
    while (view !== null) {
      const rawChoice = (await prompt.question("Relationship [s]ame/[d]ifferent/[u]ncertain/[q]uit: "))
        .trim()
        .toLowerCase();
      if (rawChoice === "q" || rawChoice === "quit") return;
      const label = CHOICE_MAP[rawChoice];
      if (label === undefined) {
        io.output.write("Invalid choice. Enter s, d, u, or q.\n");
        continue;
      }
      await persistOneAnswer(values, workspace, view, label, io.output, io.now);
      workspace = await loadReviewWorkspace(values.workspace);
      view = nextPrimaryReviewView(workspace.taskEnvelope, workspace.ledger);
      if (view !== null) writeJson(io.output, view);
    }
    writeJson(io.output, {
      command: "owner",
      complete: true,
      checkpoint: reviewCheckpoint(workspace.taskEnvelope, workspace.ledger),
    });
  } finally {
    prompt.close();
  }
}

export async function runReviewCli({
  argv,
  input = process.stdin,
  output = process.stdout,
  error = process.stderr,
  now = () => new Date(),
  isTTY = input.isTTY === true && output.isTTY === true,
  createPrompt = createInterface,
} = {}) {
  try {
    const parsed = parseArguments(argv ?? []);
    if (parsed.command === "help") {
      output.write(`${usage()}\n`);
      return 0;
    }
    if (parsed.command === "prepare") {
      await prepareCommand(parsed.values, output);
    } else if (parsed.command === "status") {
      await statusCommand(parsed.values, output);
    } else {
      await ownerCommand(parsed.values, {
        input,
        output,
        error,
        now,
        isTTY,
        createPrompt,
      });
    }
    return 0;
  } catch (caught) {
    const code = typeof caught?.code === "string" ? caught.code : "REVIEW_COMMAND_FAILED";
    writeJson(error, {
      command: "error",
      code,
      message: "The offline review command failed closed; no automatic follow-up was run.",
    });
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = await runReviewCli({ argv: process.argv.slice(2) });
}
