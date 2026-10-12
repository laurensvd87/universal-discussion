import { constants, closeSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { types } from "node:util";

const MAX_BYTES = 65_536;
const PREFIX = "INSIGHT_REQUEST_TRACE ";
const KEYS = ["schema", "voice", "instructionFingerprint", "at"];
const VOICES = new Set(["standard", "challenger", "funny", "clever", "sarcastic", "skeptic",
  "pragmatist", "explainer", "optimist", "realist", "mediator", "curious"]);

function normalizeTrace(value) {
  if (!value || typeof value !== "object" || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== KEYS.length || !KEYS.every((key) => keys.includes(key) &&
      descriptors[key].enumerable && Object.hasOwn(descriptors[key], "value"))) return null;
  const schema = descriptors.schema.value;
  const voice = descriptors.voice.value;
  const instructionFingerprint = descriptors.instructionFingerprint.value;
  const at = descriptors.at.value;
  if (schema !== "insight-request-trace/v1" || !VOICES.has(voice) ||
      typeof instructionFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(instructionFingerprint) ||
      !Number.isSafeInteger(at) || at < 0) return null;
  return { schema, voice, instructionFingerprint, at };
}

function checkAncestors(directory) {
  let current = path.resolve(directory);
  for (;;) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unavailable");
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function ownFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    (!process.getuid || (stat.uid === process.getuid() && (stat.mode & 0o077) === 0));
}

function openFile(directory, filePath) {
  checkAncestors(directory);
  const directoryStat = lstatSync(directory);
  if (process.getuid && (directoryStat.uid !== process.getuid() || (directoryStat.mode & 0o077) !== 0))
    throw new Error("unavailable");
  let previous;
  try { previous = lstatSync(filePath); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (previous && !ownFile(previous)) throw new Error("unavailable");
  const fd = openSync(filePath, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0) |
    (previous ? 0 : constants.O_CREAT | constants.O_EXCL), 0o600);
  try {
    const stat = fstatSync(fd);
    const current = lstatSync(filePath);
    const currentDirectory = lstatSync(directory);
    if (!ownFile(stat) || !ownFile(current) || stat.dev !== current.dev || stat.ino !== current.ino ||
        (previous && (stat.dev !== previous.dev || stat.ino !== previous.ino)) ||
        !currentDirectory.isDirectory() || currentDirectory.isSymbolicLink() ||
        currentDirectory.dev !== directoryStat.dev || currentDirectory.ino !== directoryStat.ino)
      throw new Error("unavailable");
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

function retainedLines(fd, remaining) {
  const size = fstatSync(fd).size;
  const length = Math.min(size, MAX_BYTES);
  const start = size - length;
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const count = readSync(fd, bytes, offset, length - offset, start + offset);
    if (!count) break;
    offset += count;
  }
  const lines = bytes.subarray(0, offset).toString("utf8").split("\n");
  if (start > 0) lines.shift(); // Never retain a potentially partial oldest line.
  lines.pop(); // A partial final write is not a complete record.
  const retained = [];
  let total = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith(PREFIX)) continue;
    let trace;
    try { trace = normalizeTrace(JSON.parse(lines[index].slice(PREFIX.length))); }
    catch { continue; }
    if (!trace) continue;
    const line = Buffer.from(`${PREFIX}${JSON.stringify(trace)}\n`, "utf8");
    if (total + line.length > remaining) break;
    retained.unshift(line);
    total += line.length;
  }
  return retained;
}

export function createVoiceRequestTraceLog({ tempDirectory = tmpdir() } = {}) {
  let directory;
  let filePath;
  try {
    if (typeof tempDirectory !== "string" || !path.isAbsolute(tempDirectory)) throw new Error("unavailable");
    directory = path.join(tempDirectory, "universal-discussion-insight-trace");
    filePath = path.join(directory, "voice-request-trace.log");
    checkAncestors(tempDirectory);
    try { mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    closeSync(openFile(directory, filePath));
  } catch { throw new Error("Voice request trace log unavailable"); }
  return Object.freeze({
    filePath,
    write(value) {
      let fd;
      try {
        const trace = normalizeTrace(value);
        if (!trace) return false;
        const line = Buffer.from(`${PREFIX}${JSON.stringify(trace)}\n`, "utf8");
        fd = openFile(directory, filePath);
        const bytes = Buffer.concat([...retainedLines(fd, MAX_BYTES - line.length), line]);
        // Recheck after the bounded read, immediately before changing the file.
        checkAncestors(directory);
        const current = lstatSync(filePath);
        const stat = fstatSync(fd);
        if (!ownFile(current) || !ownFile(stat) || current.dev !== stat.dev || current.ino !== stat.ino)
          return false;
        // Rewrite through the validated descriptor: no unlink/reopen rotation race.
        ftruncateSync(fd, 0);
        let offset = 0;
        while (offset < bytes.length) {
          const written = writeSync(fd, bytes, offset, bytes.length - offset, offset);
          if (!written) return false;
          offset += written;
        }
        return true;
      } catch { return false; }
      finally { if (fd !== undefined) { try { closeSync(fd); } catch { /* Diagnostic only. */ } } }
    },
  });
}
