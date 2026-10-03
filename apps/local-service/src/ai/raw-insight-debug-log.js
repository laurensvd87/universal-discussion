import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const MAX_BYTES = 1_048_576;
const MAX_EXCHANGES = 3;
const DIRECTORY = `universal-discussion-insight-raw-${process.getuid?.() ?? "user"}`;
const FILE = "exchanges.log";
const REQUEST_KEYS = ["model", "store", "stream", "instructions", "input", "tools"];
const FORBIDDEN_KEY = /(?:authorization|headers?|cookies?|token|pairing|callback|secret|password|api.?key)/iu;

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function safeData(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))) return true;
  if (!Array.isArray(value) && !plain(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const valid = keys.every((key) => typeof key === "string" &&
    (Array.isArray(value) ? key === "length" || /^(?:0|[1-9]\d*)$/u.test(key) : !FORBIDDEN_KEY.test(key)) &&
    Object.hasOwn(descriptors[key], "value") &&
    (key === "length" || safeData(descriptors[key].value, seen)));
  seen.delete(value);
  return valid;
}

function checkedDirectory(directory) {
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)))
    throw new Error("Raw insight debug directory unavailable");
}

function openFile(filePath) {
  let previous;
  try {
    previous = lstatSync(filePath);
    if (!previous.isFile() || previous.isSymbolicLink() || previous.nlink !== 1 ||
        (process.getuid && (previous.uid !== process.getuid() || (previous.mode & 0o077) !== 0)))
      throw new Error("Raw insight debug file unavailable");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const fd = openSync(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_APPEND |
    (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 ||
        (previous && (stat.dev !== previous.dev || stat.ino !== previous.ino)) ||
        (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)))
      throw new Error("Raw insight debug file unavailable");
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

function existingState(fd) {
  const size = fstatSync(fd).size;
  if (size > MAX_BYTES) throw new Error("Raw insight debug file full");
  const raw = readFileSync(fd, "utf8");
  if (raw && !raw.endsWith("\n")) throw new Error("Raw insight debug file incomplete");
  let requests = 0;
  let responses = 0;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const entry = JSON.parse(line);
    if (entry?.kind === "request") requests += 1;
    else if (entry?.kind === "response") responses += 1;
    else throw new Error("Raw insight debug file invalid");
    if (responses > requests || requests > MAX_EXCHANGES) throw new Error("Raw insight debug file invalid");
  }
  return { size, requests };
}

export function createRawInsightDebugLog({ enabled = false, tempDirectory = tmpdir() } = {}) {
  if (!enabled) return { enabled: false, filePath: null, captureCount: 0, captureRequest: () => false,
    captureResponse: () => false, capture: () => false };
  const filePath = path.join(tempDirectory, DIRECTORY, FILE);
  let ready = false;
  let requests = 0;
  let pending = false;
  try {
    if (!path.isAbsolute(tempDirectory)) throw new Error("Raw insight debug temp directory unavailable");
    checkedDirectory(path.dirname(filePath));
    const fd = openFile(filePath);
    try { requests = existingState(fd).requests; ready = requests < MAX_EXCHANGES; }
    finally { closeSync(fd); }
  } catch { /* Diagnostics must never change the insight outcome. */ }

  function append(kind, fields) {
    if (!ready || requests > MAX_EXCHANGES) return false;
    try {
      const line = Buffer.from(`${JSON.stringify({ kind, ...fields })}\n`, "utf8");
      if (line.length > MAX_BYTES) return false;
      checkedDirectory(path.dirname(filePath));
      const fd = openFile(filePath);
      try {
        const state = existingState(fd);
        if (state.requests !== requests || state.size + line.length > MAX_BYTES) return false;
        let offset = 0;
        while (offset < line.length) {
          const written = writeSync(fd, line, offset, line.length - offset);
          if (written <= 0) throw new Error("Raw insight debug write failed");
          offset += written;
        }
        return true;
      } finally { closeSync(fd); }
    } catch { ready = false; return false; }
  }

  function captureRequest(entry) {
    try {
      if (!ready || requests >= MAX_EXCHANGES || !plain(entry) ||
          Reflect.ownKeys(entry).length !== 2 || entry.phase !== "request" ||
          !Object.hasOwn(entry, "payload") || !plain(entry.payload) ||
          Reflect.ownKeys(entry.payload).length !== REQUEST_KEYS.length ||
          !REQUEST_KEYS.every((key) => Object.hasOwn(entry.payload, key)) ||
          !safeData(entry.payload)) return false;
      const payload = JSON.stringify(entry.payload);
      if (!append("request", { payload })) return false;
      requests += 1;
      pending = true;
      return true;
    } catch { return false; }
  }

  function captureResponse(entry) {
    try {
      if (!ready || !pending || !plain(entry) || Reflect.ownKeys(entry).length !== 4 ||
          entry.phase !== "response" || !Number.isInteger(entry.status) ||
          entry.status < 100 || entry.status > 599 ||
          !(entry.contentType === null || typeof entry.contentType === "string") ||
          typeof entry.body !== "string") return false;
      if (!append("response", { status: entry.status, contentType: entry.contentType, body: entry.body })) return false;
      pending = false;
      if (requests >= MAX_EXCHANGES) ready = false;
      return true;
    } catch { return false; }
  }

  return { enabled: ready, filePath, get captureCount() { return requests; }, captureRequest, captureResponse,
    capture(entry) {
      try {
        if (!plain(entry)) return false;
        if (entry.phase === "request") return captureRequest(entry);
        if (entry.phase === "response") return captureResponse(entry);
        return false;
      } catch { return false; }
    } };
}
