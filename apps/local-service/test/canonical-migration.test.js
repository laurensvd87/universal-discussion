import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { createDemoState } from "../src/domain/demo-state.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { migrateCanonicalStorage } from "../src/ops/canonical-migration.js";
import { runMigrationCli } from "../src/ops/migration-cli.js";

function fixture(t) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "murmingle-migration-check-"));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const state = createDemoState({ generation: "synthetic-conversion", createdAt: "2026-10-12T00:00:00.000Z",
    sources: [], topicSeeds: [{ id: "topic-one", title: "Synthetic", kind: "general" }] });
  state.schema = "demo-state/v3";
  const filename = path.join(dataDir, "demo.sqlite"), legacy = createSqliteRepository(filename, state); legacy.close();
  const backup = { verified: true, canonicalSchema: state.schema, version: { generation: state.generation, revision: 0 },
    logicalStateDigest: createHash("sha256").update(JSON.stringify(state)).digest("hex"),
    counts: Object.fromEntries(["topics", "discussions", "sources", "sourceLinks", "contributions"].map(name => [name, state[name].length])) };
  return { dataDir, filename, state, backup };
}
test("conversion requires a verified backup of the exact latest quiesced revision", async t => {
  const { dataDir, filename, state, backup } = fixture(t);
  const before = readFileSync(filename);
  for (const altered of [{ ...backup, verified: false }, { ...backup, version: { ...backup.version, revision: 1 } },
    { ...backup, canonicalSchema: "demo-state/v2" }, { ...backup, counts: { ...backup.counts, contributions: 1 } },
    { ...backup, logicalStateDigest: "0".repeat(64) }]) {
    await assert.rejects(migrateCanonicalStorage({ dataDir, backupFilename: "synthetic", verify: async () => altered }));
    assert.deepEqual(readFileSync(filename), before);
  }
  const result = await migrateCanonicalStorage({ dataDir, backupFilename: "synthetic", verify: async () => backup });
  assert.deepEqual(result.version, backup.version); assert.deepEqual(result.counts, backup.counts);
  const repository = createNormalizedSqliteRepository(filename, null, { readOnly: true });
  assert.deepEqual(repository.load(), state); repository.close();
});
test("injected conversion failure leaves original document and schema intact", async t => {
  const { dataDir, filename, state, backup } = fixture(t);
  await assert.rejects(migrateCanonicalStorage({ dataDir, backupFilename: "synthetic", verify: async () => backup,
    beforeCommit() { throw new Error("Synthetic failure"); } }));
  const original = createSqliteRepository(filename, state);
  assert.deepEqual(original.load(), state); original.close();
});
test("dangling redirected journal sidecars are rejected before legacy SQL reads", async t => {
  const { dataDir, filename, backup } = fixture(t);
  const sidecar = `${filename}-journal`;
  try { symlinkSync(path.join(dataDir, "missing-target"), sidecar, process.platform === "win32" ? "junction" : "file"); }
  catch (error) { if (["EPERM", "EACCES", "EINVAL"].includes(error.code)) { t.skip("Link capability unavailable"); return; } throw error; }
  const before = readFileSync(filename);
  try {
    await assert.rejects(migrateCanonicalStorage({ dataDir, backupFilename: "synthetic", verify: async () => backup }));
    assert.deepEqual(readFileSync(filename), before);
  } finally { unlinkSync(sidecar); }
});
test("conversion CLI validates before claiming and releases its exclusive claim", async () => {
  const filename = "canonical-2026-10-12T12-00-00-000Z-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.murmingle-backup";
  let closed = 0, claims = 0, migrations = 0;
  const options = { dataDir: path.join(tmpdir(), "synthetic", "data"), claim: async () => { claims++; return { close: async () => { closed++; } }; },
    migrate: async () => { migrations++; throw new Error("Synthetic failure"); }, output() {} };
  await assert.rejects(runMigrationCli(["--verified-backup", "../invalid"], options));
  assert.equal(claims, 0);
  await assert.rejects(runMigrationCli(["--verified-backup", filename], options));
  assert.equal(claims, 1); assert.equal(migrations, 1); assert.equal(closed, 1);
});
