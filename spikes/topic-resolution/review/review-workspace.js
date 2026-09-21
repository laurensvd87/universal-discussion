import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  appendPrimaryDecision,
  createReviewLedger,
  prepareReviewTask,
  reviewCheckpoint,
  validateReviewLedger,
  validateReviewTaskEnvelope,
} from "./review-workflow.js";

const MAX_TASK_FILE_BYTES = 33_554_432;
const MAX_EVENT_FILE_BYTES = 16_384;
const EVENT_FILE = /^[0-9]{6}\.json$/;
const PENDING_FILE = /^\.pending-[0-9a-f-]{36}\.tmp$/;

export class ReviewWorkspaceError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ReviewWorkspaceError";
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new ReviewWorkspaceError(code, message, cause);
}

function resolvedWorkspace(directory) {
  if (typeof directory !== "string" || directory.trim() === "") {
    fail("INVALID_WORKSPACE", "Workspace directory must be a non-empty path");
  }
  return path.resolve(directory);
}

async function assertPlainDirectory(directory, label) {
  let stats;
  try {
    stats = await lstat(directory);
  } catch (error) {
    fail("WORKSPACE_UNREADABLE", `${label} is unavailable`, error);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    fail("UNSAFE_WORKSPACE", `${label} must be a real directory, not a link`);
  }
}

async function readBoundedRegularFile(file, maximum, label) {
  let stats;
  try {
    stats = await lstat(file);
  } catch (error) {
    fail("WORKSPACE_UNREADABLE", `${label} is unavailable`, error);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    fail("UNSAFE_WORKSPACE", `${label} must be a regular file`);
  }
  if (stats.size <= 0 || stats.size > maximum) {
    fail("WORKSPACE_CORRUPT", `${label} exceeds its file-size boundary`);
  }
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    fail("WORKSPACE_UNREADABLE", `${label} could not be read`, error);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("WORKSPACE_CORRUPT", `${label} is not valid JSON`, error);
  }
}

async function writeJsonExclusive(file, value) {
  let handle;
  try {
    handle = await open(file, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("WORKSPACE_EXISTS", "Review workspace state already exists", error);
    }
    fail("WORKSPACE_WRITE_FAILED", "Review workspace state could not be written", error);
  } finally {
    await handle?.close();
  }
}

export async function prepareReviewWorkspace(directory, intake) {
  const workspaceDirectory = resolvedWorkspace(directory);
  const taskEnvelope = prepareReviewTask(intake);
  const parent = path.dirname(workspaceDirectory);
  await mkdir(parent, { recursive: true });
  try {
    await mkdir(workspaceDirectory, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("WORKSPACE_EXISTS", "Review workspace already exists; it will not be overwritten", error);
    }
    fail("WORKSPACE_WRITE_FAILED", "Review workspace could not be created", error);
  }
  const eventsDirectory = path.join(workspaceDirectory, "events");
  try {
    await mkdir(eventsDirectory, { recursive: false });
    await writeJsonExclusive(path.join(workspaceDirectory, "task.json"), taskEnvelope);
    return {
      workspaceDirectory,
      taskEnvelope,
      ledger: createReviewLedger(taskEnvelope),
      recoveryWarnings: [],
    };
  } catch (error) {
    if (error instanceof ReviewWorkspaceError) throw error;
    fail(
      "WORKSPACE_INCOMPLETE",
      "Workspace preparation stopped before completion; inspect the new directory before retrying",
      error,
    );
  }
}

export async function loadReviewWorkspace(directory) {
  const workspaceDirectory = resolvedWorkspace(directory);
  await assertPlainDirectory(workspaceDirectory, "Review workspace");
  const rootEntries = (await readdir(workspaceDirectory)).sort();
  if (
    rootEntries.length !== 2 ||
    rootEntries[0] !== "events" ||
    rootEntries[1] !== "task.json"
  ) {
    fail("WORKSPACE_CORRUPT", "Review workspace must contain only events/ and task.json");
  }
  const eventsDirectory = path.join(workspaceDirectory, "events");
  await assertPlainDirectory(eventsDirectory, "Review event directory");
  const taskText = await readBoundedRegularFile(
    path.join(workspaceDirectory, "task.json"),
    MAX_TASK_FILE_BYTES,
    "Review task",
  );
  let taskEnvelope;
  try {
    taskEnvelope = validateReviewTaskEnvelope(parseJson(taskText, "Review task"));
  } catch (error) {
    if (error instanceof ReviewWorkspaceError) throw error;
    fail("WORKSPACE_CORRUPT", "Review task failed contract validation", error);
  }

  const directoryEntries = (await readdir(eventsDirectory)).sort();
  if (directoryEntries.length > taskEnvelope.task.pairs.length + 128) {
    fail("WORKSPACE_CORRUPT", "Review event directory exceeds its bounded entry inventory");
  }
  const pendingEntries = directoryEntries.filter((name) => PENDING_FILE.test(name));
  const eventEntries = directoryEntries.filter((name) => EVENT_FILE.test(name));
  const unknownEntries = directoryEntries.filter(
    (name) => !PENDING_FILE.test(name) && !EVENT_FILE.test(name),
  );
  if (unknownEntries.length > 0) {
    fail("WORKSPACE_CORRUPT", "Review event directory contains unexpected files");
  }
  const events = [];
  for (const [index, name] of eventEntries.entries()) {
    const expectedName = `${String(index + 1).padStart(6, "0")}.json`;
    if (name !== expectedName) {
      fail("WORKSPACE_CORRUPT", "Review event filenames must form a gap-free sequence");
    }
    const eventText = await readBoundedRegularFile(
      path.join(eventsDirectory, name),
      MAX_EVENT_FILE_BYTES,
      `Review event ${name}`,
    );
    events.push(parseJson(eventText, `Review event ${name}`));
  }
  let ledger;
  try {
    ledger = validateReviewLedger(taskEnvelope, {
      ledgerContractVersion: "story-review-ledger/1.0.0",
      taskDigest: taskEnvelope.taskDigest,
      events,
    });
  } catch (error) {
    fail("WORKSPACE_CORRUPT", "Review event history failed contract validation", error);
  }
  return {
    workspaceDirectory,
    taskEnvelope,
    ledger,
    recoveryWarnings: pendingEntries.map(() => "ignored-uncommitted-pending-event"),
  };
}

async function publishEvent(eventsDirectory, sequence, record) {
  const finalName = `${String(sequence).padStart(6, "0")}.json`;
  const finalPath = path.join(eventsDirectory, finalName);
  const pendingPath = path.join(eventsDirectory, `.pending-${randomUUID()}.tmp`);
  let handle;
  let linked = false;
  try {
    handle = await open(pendingPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(pendingPath, finalPath);
    linked = true;
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("CONCURRENT_UPDATE", "Another review session committed this sequence first", error);
    }
    fail("WORKSPACE_WRITE_FAILED", "Review decision could not be persisted", error);
  } finally {
    await handle?.close();
    try {
      await unlink(pendingPath);
    } catch (error) {
      if (error?.code !== "ENOENT" && !linked) {
        // The original write error remains authoritative; a pending file is ignored on reload.
      }
    }
  }
}

export async function appendDecisionToWorkspace(directory, decision, recordedAt) {
  const workspace = await loadReviewWorkspace(directory);
  let nextLedger;
  try {
    nextLedger = appendPrimaryDecision(
      workspace.taskEnvelope,
      workspace.ledger,
      decision,
      recordedAt,
    );
  } catch (error) {
    fail("DECISION_REJECTED", "Review decision failed contract validation", error);
  }
  const record = nextLedger.events.at(-1);
  await publishEvent(
    path.join(workspace.workspaceDirectory, "events"),
    record.event.sequence,
    record,
  );
  const reloaded = await loadReviewWorkspace(workspace.workspaceDirectory);
  return {
    ...reloaded,
    checkpoint: reviewCheckpoint(reloaded.taskEnvelope, reloaded.ledger),
  };
}

export async function reviewWorkspaceCheckpoint(directory) {
  const workspace = await loadReviewWorkspace(directory);
  return {
    checkpoint: reviewCheckpoint(workspace.taskEnvelope, workspace.ledger),
    recoveryWarnings: workspace.recoveryWarnings,
  };
}
