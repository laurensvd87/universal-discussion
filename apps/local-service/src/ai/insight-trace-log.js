import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DIRECTORY = "universal-discussion-insight-trace";
const FILE = "insight-trace.log";
const MAX_BYTES = 65_536;
const EVENTS = ["response.created", "response.in_progress", "response.output_item.added",
  "response.output_item.done", "response.output_text.delta", "response.output_text.done",
  "response.content_part.added", "response.content_part.done", "response.web_search_call.in_progress",
  "response.web_search_call.searching", "response.web_search_call.completed",
  "response.refusal.delta", "response.refusal.done", "response.completed",
  "response.failed", "response.incomplete", "error"];
const EVENT_SET = new Set([...EVENTS, "other"]);
const TYPES = new Set(["message", "web_search_call", "reasoning", "other"]);
const STATUSES = new Set(["in_progress", "completed", "incomplete", "failed", "other"]);
const PREFIX_BRANCHES = new Set(["length", "candidate-repeated", "later-observed", "prior-id", "prior-shape"]);
const DETAILS = new Set(["response-redirect", "response-content-type", "response-content-json", "response-content-html",
  "response-content-text", "response-content-missing", "response-content-other", "response-stream", "response-too-large",
  "response-encoding", "response-event", "response-no-final", "response-empty-output", "response-no-message",
  "response-message-unfinished", "response-refusal", "response-no-text", "response-blank-text",
  "response-output-empty", "response-search-only", "response-reasoning-only", "response-final-item-missing",
  "response-item-identity", "response-item-conflict", "response-item-prefix", "response-item-text",
  "response-stream-text-unfinalized", "response-unsafe-text", "response-output-too-large", "response-excerpt-citation",
  "response-incomplete", "response-failed", "response-http-400"]);

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 101; }
function index(value) { return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 100); }
function detail(value) { return value === null || DETAILS.has(value); }
function item(value) {
  return exactKeys(value, ["phase", "index", "type", "status"]) &&
    ["added", "done", "final"].includes(value.phase) && index(value.index) &&
    TYPES.has(value.type) && STATUSES.has(value.status);
}
function validTrace(value) {
  if (!exactKeys(value, ["schema", "outcome", "detail", "events", "createdCount", "createdFinalMatch",
    "finalStatus", "observedItems", "finalOutput", "finalOutputCount", "candidateCount",
    "candidateIndex", "textDoneCount", "contentDoneCount", "fallbackFailure", "fallbackBranch"]) ||
    value.schema !== "insight-response-trace/v1" || !["success", "failure"].includes(value.outcome) ||
    !detail(value.detail) || !detail(value.fallbackFailure) ||
    !(value.fallbackBranch === null || PREFIX_BRANCHES.has(value.fallbackBranch)) ||
    !exactKeys(value.events, ["sequence", "counts", "otherCount"]) ||
    !Array.isArray(value.events.sequence) || value.events.sequence.length > 24 ||
    !value.events.sequence.every((entry) => EVENT_SET.has(entry)) ||
    !exactKeys(value.events.counts, EVENTS) || !EVENTS.every((event) => count(value.events.counts[event])) ||
    !count(value.events.otherCount) || !count(value.createdCount) ||
    typeof value.createdFinalMatch !== "boolean" || !STATUSES.has(value.finalStatus) ||
    !Array.isArray(value.observedItems) || value.observedItems.length > 16 ||
    !value.observedItems.every(item) || !Array.isArray(value.finalOutput) ||
    value.finalOutput.length > 16 || !value.finalOutput.every(item) ||
    !count(value.finalOutputCount) || !count(value.candidateCount) ||
    !index(value.candidateIndex) || !count(value.textDoneCount) || !count(value.contentDoneCount)) return false;
  return true;
}

function ensureDirectory(directory) {
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)))
    throw new Error("Insight trace directory unavailable");
}

function openTraceFile(filePath) {
  let previous;
  try {
    previous = lstatSync(filePath);
    if (!previous.isFile() || previous.isSymbolicLink() || previous.nlink !== 1 ||
        (process.getuid && (previous.uid !== process.getuid() || (previous.mode & 0o077) !== 0)))
      throw new Error("Insight trace file unavailable");
  }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const fd = openSync(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_APPEND |
    (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 ||
        (previous && (stat.dev !== previous.dev || stat.ino !== previous.ino)) ||
        (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)))
      throw new Error("Insight trace file unavailable");
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

export function createInsightTraceLog({ tempDirectory = tmpdir() } = {}) {
  if (!path.isAbsolute(tempDirectory)) throw new Error("Insight trace temp directory unavailable");
  const directory = path.join(tempDirectory, DIRECTORY);
  ensureDirectory(directory);
  const filePath = path.join(directory, FILE);
  // Open once at startup so a hostile pre-existing path fails before announcing it.
  closeSync(openTraceFile(filePath));
  return {
    filePath,
    write(trace) {
      if (!validTrace(trace)) return false;
      const line = `INSIGHT_TRACE ${JSON.stringify(trace)}\n`;
      const bytes = Buffer.from(line, "utf8");
      if (bytes.length > MAX_BYTES) return false;
      let fd = openTraceFile(filePath);
      try {
        if (fstatSync(fd).size + bytes.length > MAX_BYTES) {
          closeSync(fd);
          fd = null;
          // Replace this fixed, validated log only. Exclusive creation avoids
          // following a path substituted after removal on Windows.
          if (!lstatSync(filePath).isFile()) throw new Error("Insight trace file unavailable");
          unlinkSync(filePath);
          fd = openSync(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL |
            constants.O_APPEND | (constants.O_NOFOLLOW ?? 0), 0o600);
        }
        let offset = 0;
        while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      } finally { if (fd !== null) closeSync(fd); }
      return true;
    },
  };
}
