import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PAIRING_FILE_NAME = "pairing.json";
const MAX_RECORD_BYTES = 1_024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/u;
const DOMAIN = "universal-discussion-layer/pairing/v1\0";

function unavailable() { return new Error("Pairing unavailable; initialize or rotate pairing with the local service stopped"); }

function checkOrigin(origin) {
  if (typeof origin !== "string" || !ORIGIN_PATTERN.test(origin)) throw unavailable();
}

function digest(origin, token) {
  return createHash("sha256").update(DOMAIN).update(origin).update("\0").update(token).digest();
}

function validRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (record.version !== 1 || !ORIGIN_PATTERN.test(record.origin ?? "")) return false;
  if (record.state === "active") {
    return Object.keys(record).sort().join(",") === "origin,state,verifier,version" &&
      typeof record.verifier === "string" && DIGEST_PATTERN.test(record.verifier);
  }
  return record.state === "revoked" && Object.keys(record).sort().join(",") === "origin,state,version";
}

function pathExists(filePath) {
  try { lstatSync(filePath); return true; }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    throw unavailable();
  }
}

function readRecord(filePath) {
  let descriptor;
  try {
    const info = lstatSync(filePath);
    if (!info.isFile() || info.size < 1 || info.size > MAX_RECORD_BYTES) throw unavailable();
    descriptor = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size !== info.size) throw unavailable();
    const content = Buffer.alloc(opened.size + 1);
    const bytes = readSync(descriptor, content, 0, content.length, 0);
    if (bytes !== opened.size) throw unavailable();
    closeSync(descriptor);
    descriptor = undefined;
    const record = JSON.parse(content.subarray(0, bytes).toString("utf8"));
    if (!validRecord(record)) throw unavailable();
    return record;
  } catch { throw unavailable(); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function writeRecord(filePath, record) {
  if (!validRecord(record)) throw unavailable();
  const content = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  if (content.length > MAX_RECORD_BYTES) throw unavailable();
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temp = path.join(directory, `.${PAIRING_FILE_NAME}.${randomBytes(12).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temp, filePath);
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    if (pathExists(temp)) unlinkSync(temp);
    throw unavailable();
  }
}

// Administration is allowed only while the caller exclusively owns the fixed
// loopback port. The CLI acquires that claim before calling this function.
export function changePairing({ filePath, origin, action }) {
  checkOrigin(origin);
  if (!["init", "rotate", "revoke"].includes(action)) throw unavailable();
  if (action === "init" && pathExists(filePath)) throw unavailable();
  if (action === "revoke") {
    const current = readRecord(filePath);
    if (current.origin !== origin) throw unavailable();
    writeRecord(filePath, { version: 1, origin, state: "revoked" });
    return null;
  }
  const token = randomBytes(32).toString("base64url");
  writeRecord(filePath, { version: 1, origin, state: "active", verifier: digest(origin, token).toString("hex") });
  return token;
}

export function loadPairingVerifier({ filePath, origin }) {
  checkOrigin(origin);
  const record = readRecord(filePath);
  if (record.origin !== origin || record.state !== "active") throw unavailable();
  const expected = Buffer.from(record.verifier, "hex");
  return Object.freeze({
    verify(token) {
      if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return false;
      return timingSafeEqual(digest(origin, token), expected);
    },
  });
}
