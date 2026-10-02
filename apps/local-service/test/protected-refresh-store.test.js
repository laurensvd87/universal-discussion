import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, unlink, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProtectedRefreshStore } from "../src/ai/protected-refresh-store.js";

const synthetic = {
  clientId: "oaiapp_synthetic_only",
  subject: "synthetic-subject",
  refreshToken: "synthetic-refresh-token-do-not-use",
};
const HOST_ID = "urn:uuid:11111111-1111-4111-8111-111111111111";
const FILE_NAME = `chatgpt-refresh-${createHash("sha256").update(HOST_ID).digest("hex").slice(0, 32)}.dpapi`;

test("unsupported or unavailable protected storage fails closed", async () => {
  assert.equal(createProtectedRefreshStore({ platform: "linux", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "", systemRoot: "C:\\Windows", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "relative", systemRoot: "C:\\Windows", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "C:\\Data", systemRoot: "", hostId: HOST_ID }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "C:\\Data", systemRoot: "C:\\Windows" }), null);
  assert.equal(createProtectedRefreshStore({ platform: "win32", localAppData: "C:\\Data", systemRoot: "C:\\Windows", hostId: "urn:uuid:------------------------------------" }), null);
});

test("Windows DPAPI protects, replaces and deletes synthetic rotating tokens",
  { skip: process.platform !== "win32" || process.env.UDL_TEST_WINDOWS_DPAPI !== "1" }, async () => {
  const localAppData = await mkdtemp(join(tmpdir(), "udl-dpapi-test-"));
  const store = createProtectedRefreshStore({ localAppData, hostId: HOST_ID });
  const directory = join(localAppData, "UniversalDiscussionLayer");
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

test("invalid credential shape is never handed to protected storage",
  { skip: process.platform !== "win32" || process.env.UDL_TEST_WINDOWS_DPAPI !== "1" }, async () => {
  const localAppData = await mkdtemp(join(tmpdir(), "udl-dpapi-invalid-"));
  const store = createProtectedRefreshStore({ localAppData, hostId: HOST_ID });
  try {
    await assert.rejects(store.write({ ...synthetic, accessToken: "synthetic-access" }));
    await assert.rejects(store.write({ ...synthetic, refreshToken: "" }));
    assert.equal(await store.read(), null);
  } finally {
    await rmdir(localAppData);
  }
});
