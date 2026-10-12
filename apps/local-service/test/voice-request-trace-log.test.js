import assert from "node:assert/strict";
import { linkSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createVoiceRequestTraceLog } from "../src/ai/voice-request-trace-log.js";

const PREFIX = "INSIGHT_REQUEST_TRACE ";
function trace(at = 0) {
  return { schema: "insight-request-trace/v1", voice: "funny", instructionFingerprint: "a".repeat(64), at };
}
function withTemp(run) {
  const tempDirectory = mkdtempSync(path.join(tmpdir(), "voice-request-log-test-"));
  try { return run(tempDirectory); }
  finally { rmSync(tempDirectory, { recursive: true, force: true }); }
}

test("fixed path records only normalized diagnostic metadata for all fixed voices", () => withTemp((tempDirectory) => {
  const log = createVoiceRequestTraceLog({ tempDirectory });
  assert.equal(log.filePath, path.join(tempDirectory, "universal-discussion-insight-trace", "voice-request-trace.log"));
  for (const voice of ["standard", "challenger", "funny", "clever", "sarcastic", "skeptic",
    "pragmatist", "explainer", "optimist", "realist", "mediator", "curious"]) {
    assert.equal(log.write(Object.freeze({ ...trace(Number.MAX_SAFE_INTEGER), voice })), true);
  }
  const lines = readFileSync(log.filePath, "utf8").trimEnd().split("\n");
  assert.equal(lines.length, 12);
  for (const line of lines) {
    assert.ok(line.startsWith(PREFIX));
    assert.deepEqual(Object.keys(JSON.parse(line.slice(PREFIX.length))),
      ["schema", "voice", "instructionFingerprint", "at"]);
  }
}));

test("rejects noncanonical fields and values without writing content", () => withTemp((tempDirectory) => {
  const log = createVoiceRequestTraceLog({ tempDirectory });
  const secret = "SECRET_PAGE_COMMENT_URL_ACCOUNT_TOKEN";
  const symbolRecord = { ...trace(), [Symbol("secret")]: secret };
  for (const value of [null, [], secret, new Date(), Object.create(trace()), symbolRecord,
    { ...trace(), toJSON: () => secret }, { ...trace(), input: secret },
    ...[secret, "Funny", undefined, {}, 12].map((voice) => ({ ...trace(), voice })),
    ...[secret, "A".repeat(64), "a".repeat(63), "a".repeat(65), {}, null].map((instructionFingerprint) =>
      ({ ...trace(), instructionFingerprint })),
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null].map((at) => ({ ...trace(), at })),
    { ...trace(), schema: "wrong" }, Object.defineProperty(trace(), "at", { enumerable: false, value: 1 })]) {
    assert.equal(log.write(value), false);
  }
  assert.equal(readFileSync(log.filePath, "utf8"), "");
}));

test("never invokes poisoned accessors, prototypes, or proxy traps", () => withTemp((tempDirectory) => {
  const log = createVoiceRequestTraceLog({ tempDirectory });
  let invoked = 0;
  const poisoned = trace();
  Object.defineProperty(poisoned, "voice", { enumerable: true, get() { invoked += 1; throw new Error("secret"); } });
  const inherited = Object.create({ get voice() { invoked += 1; throw new Error("secret"); } });
  const proxy = new Proxy(trace(), { getPrototypeOf() { invoked += 1; throw new Error("secret"); } });
  assert.equal(log.write(poisoned), false);
  assert.equal(log.write(inherited), false);
  assert.equal(log.write(proxy), false);
  assert.equal(invoked, 0);
  assert.equal(readFileSync(log.filePath, "utf8"), "");
}));

test("bounds retention to newest whole valid lines and removes poisoned prior records", () => withTemp((tempDirectory) => {
  const log = createVoiceRequestTraceLog({ tempDirectory });
  // Old arbitrarily large content is only read through a bounded tail.
  writeFileSync(log.filePath, "SECRET_PAGE_TEXT\n".repeat(20_000), { mode: 0o600 });
  assert.equal(log.write(trace(0)), true);
  for (let at = 1; at <= 500; at += 1) assert.equal(log.write(trace(at)), true);
  const bytes = readFileSync(log.filePath);
  assert.ok(bytes.length <= 65_536);
  const raw = bytes.toString("utf8");
  assert.ok(raw.endsWith("\n"));
  assert.equal(raw.includes("SECRET_PAGE_TEXT"), false);
  const records = raw.trimEnd().split("\n").map((line) => JSON.parse(line.slice(PREFIX.length)));
  assert.equal(records.at(-1).at, 500);
  assert.ok(records[0].at > 0);
  records.forEach((record, index) => { if (index) assert.equal(record.at, records[index - 1].at + 1); });
  writeFileSync(log.filePath, `${PREFIX}${JSON.stringify({ ...trace(), token: "SECRET" })}\n${PREFIX}${JSON.stringify(trace(501))}\npartial`, { mode: 0o600 });
  assert.equal(log.write(trace(502)), true);
  assert.equal(readFileSync(log.filePath, "utf8"), `${PREFIX}${JSON.stringify(trace(501))}\n${PREFIX}${JSON.stringify(trace(502))}\n`);
}));

test("hardlinked log fails harmlessly without altering either link", () => withTemp((tempDirectory) => {
  const log = createVoiceRequestTraceLog({ tempDirectory });
  const target = path.join(tempDirectory, "target.txt");
  writeFileSync(target, "untouched", { mode: 0o600 });
  rmSync(log.filePath);
  linkSync(target, log.filePath);
  assert.equal(log.write(trace()), false);
  assert.throws(() => createVoiceRequestTraceLog({ tempDirectory }), /^Error: Voice request trace log unavailable$/);
  assert.equal(readFileSync(target, "utf8"), "untouched");
}));

test("directory junction and file symlink targets remain untouched", () => withTemp((tempDirectory) => {
  const log = createVoiceRequestTraceLog({ tempDirectory });
  const target = path.join(tempDirectory, "target.txt");
  writeFileSync(target, "untouched", { mode: 0o600 });
  rmSync(log.filePath);
  try { symlinkSync(target, log.filePath); }
  catch (error) {
    if (process.platform !== "win32" || error.code !== "EPERM") throw error;
    // Windows does not grant ordinary users file-symlink creation. A directory
    // junction exercises its supported reparse-point path rejection instead.
    symlinkSync(tempDirectory, log.filePath, "junction");
  }
  assert.equal(log.write(trace()), false);
  assert.equal(readFileSync(target, "utf8"), "untouched");
}));

test("unavailable constructor paths expose only a fixed message and writes never throw", () => withTemp((tempDirectory) => {
  const secretPath = path.join(tempDirectory, "SECRET_PATH");
  assert.throws(() => createVoiceRequestTraceLog({ tempDirectory: secretPath }),
    (error) => error.message === "Voice request trace log unavailable" && !error.message.includes("SECRET"));
  assert.throws(() => createVoiceRequestTraceLog({ tempDirectory: "relative" }),
    /^Error: Voice request trace log unavailable$/);
  const log = createVoiceRequestTraceLog({ tempDirectory });
  rmSync(path.dirname(log.filePath), { recursive: true });
  assert.equal(log.write(trace()), false);
  assert.equal(statSync(tempDirectory).isDirectory(), true);
}));
