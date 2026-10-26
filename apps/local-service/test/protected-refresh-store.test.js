import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir, mkdtemp, rm, unlink, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { createProtectedRefreshStore } from "../src/ai/protected-refresh-store.js";

const synthetic = {
  clientId: "oaiapp_synthetic_only",
  subject: "synthetic-subject",
  refreshToken: "synthetic-refresh-token-do-not-use",
};
const HOST_ID = "urn:uuid:11111111-1111-4111-8111-111111111111";
const FILE_NAME = `chatgpt-refresh-${createHash("sha256").update(HOST_ID).digest("hex").slice(0, 32)}.dpapi`;
const PRE_NAME_DIRECTORY = Buffer.from("VW5pdmVyc2FsRGlzY3Vzc2lvbkxheWVy", "base64").toString("utf8");

function fakePowerShell(records, calls) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    let input = "";
    child.stdin = new Writable({
      write(chunk, encoding, done) { input += chunk.toString("utf8"); done(); },
      final(done) {
        queueMicrotask(() => {
          try {
            const request = JSON.parse(input);
            calls.push(request);
            let output = "";
            if (request.operation === "read") output = records.get(request.path) ?? "null";
            else if (request.operation === "write") records.set(request.path, request.record);
            else if (request.operation === "clear") {
              records.delete(request.path);
              records.delete(`${request.path}.tmp`);
              records.delete(`${request.path}.bak`);
            } else throw new Error("unexpected operation");
            if (output) child.stdout.write(output);
            child.stdout.end();
            child.stderr.end();
            child.emit("close", 0);
          } catch {
            child.stdout.end();
            child.stderr.end();
            child.emit("close", 1);
          }
        });
        done();
      },
    });
    return child;
  };
}

test("unsupported or unavailable protected storage fails closed", async () => {
  assert.equal(createProtectedRefreshStore({ platform: "linux", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "", systemRoot: "C:\\Windows", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "relative", systemRoot: "C:\\Windows", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "C:\\Data", systemRoot: "", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "C:\\Data", systemRoot: "C:\\Windows" }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "C:\\Data", systemRoot: "C:\\Windows", hostId: "urn:uuid:------------------------------------" }), null);
});

test("Windows DPAPI protects, replaces and deletes synthetic rotating tokens",
  { skip: process.platform !== "win32" || process.env.MURMINGLE_TEST_WINDOWS_DPAPI !== "1" }, async () => {
  const localAppData = await mkdtemp(join(tmpdir(), "murmingle-dpapi-test-"));
  const store = createProtectedRefreshStore({ localAppData, hostId: HOST_ID });
  const directory = join(localAppData, "Murmingle");
  const file = join(directory, FILE_NAME);
  assert.ok(store);
  try {
    assert.equal(await store.read(), null);
    await store.write(synthetic);
    const bytes = await readFile(file);
    assert.equal(bytes.includes(Buffer.from(synthetic.refreshToken)), false);
    assert.deepEqual(await store.read(), synthetic);
    const rotated = { ...synthetic, refreshToken: "synthetic-rotated-refresh-token" };
    await store.write(rotated);
    assert.deepEqual(await store.read(), rotated);
    await writeFile(file, Buffer.from("tampered-encrypted-blob"));
    await assert.rejects(store.read(), (error) =>
      error.message === "Protected ChatGPT credential storage unavailable" &&
      !error.message.includes(synthetic.refreshToken));
    await writeFile(`${file}.tmp`, bytes);
    await writeFile(`${file}.bak`, bytes);
    await store.clear();
    assert.equal(await store.read(), null);
    await assert.rejects(stat(`${file}.tmp`), { code: "ENOENT" });
    await assert.rejects(stat(`${file}.bak`), { code: "ENOENT" });
  } finally {
    try { await unlink(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const suffix of [".tmp", ".bak"]) {
      try { await unlink(`${file}${suffix}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    try { await rmdir(directory); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rmdir(localAppData);
  }
});

test("pre-name protected record migrates to Murmingle before its old copy is cleared", async () => {
  const root = await mkdtemp(join(tmpdir(), "murmingle-dpapi-fake-"));
  const localAppData = join(root, "app-data");
  const systemRoot = join(root, "windows");
  const executable = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const canonicalFile = join(localAppData, "Murmingle", FILE_NAME);
  const preNameFile = join(localAppData, PRE_NAME_DIRECTORY, FILE_NAME);
  const records = new Map([[preNameFile, JSON.stringify(synthetic)]]);
  const calls = [];
  await mkdir(localAppData, { recursive: true });
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(executable, "synthetic executable placeholder");
  try {
    const store = createProtectedRefreshStore({
      platform: "win32", localAppData, systemRoot, hostId: HOST_ID,
      spawnImpl: fakePowerShell(records, calls),
    });
    assert.ok(store);
    assert.deepEqual(await store.read(), synthetic);
    assert.equal(records.get(canonicalFile), JSON.stringify(synthetic));
    assert.equal(records.has(preNameFile), false);
    assert.deepEqual(calls.map(({ operation, path }) => [operation, path]), [
      ["read", canonicalFile], ["read", preNameFile], ["write", canonicalFile],
      ["read", canonicalFile], ["clear", preNameFile],
    ]);

    const rotated = { ...synthetic, refreshToken: "synthetic-rotated-refresh-token" };
    records.set(preNameFile, JSON.stringify(synthetic));
    await store.write(rotated);
    assert.equal(records.get(canonicalFile), JSON.stringify(rotated));
    assert.equal(records.has(preNameFile), false);

    records.set(preNameFile, JSON.stringify(synthetic));
    await store.clear();
    assert.equal(records.has(canonicalFile), false);
    assert.equal(records.has(preNameFile), false);
    assert.deepEqual(calls.slice(-2).map(({ operation, path }) => [operation, path]), [
      ["clear", canonicalFile], ["clear", preNameFile],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid credential shape is never handed to protected storage",
  { skip: process.platform !== "win32" || process.env.MURMINGLE_TEST_WINDOWS_DPAPI !== "1" }, async () => {
  const localAppData = await mkdtemp(join(tmpdir(), "murmingle-dpapi-invalid-"));
  const store = createProtectedRefreshStore({ localAppData, hostId: HOST_ID });
  try {
    await assert.rejects(store.write({ ...synthetic, accessToken: "synthetic-access" }));
    await assert.rejects(store.write({ ...synthetic, refreshToken: "" }));
    assert.equal(await store.read(), null);
  } finally {
    await rmdir(localAppData);
  }
});
