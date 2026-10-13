import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createDemoState } from "../src/domain/demo-state.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { migrateReferenceStorage } from "../src/ops/reference-migration.js";
import { runReferenceMigrationCli } from "../src/ops/reference-migration-cli.js";
import { captureCanonicalImage, validateCanonicalImage } from "../src/ops/backup-image.js";

function fixture(t) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "reference-migration-check-"));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const state = createDemoState({ generation: "generation-conversion", createdAt: "2026-10-13T00:00:00.000Z", sources: [],
    topicSeeds: [{ id: "topic-old", title: "Preserved Topic", kind: "general" }] });
  state.schema = "demo-state/v3";
  const filename = path.join(dataDir, "demo.sqlite");
  const repository = createNormalizedSqliteRepository(filename, state);
  const canonical = repository.load(); repository.close();
  const backup = { verified: true, canonicalSchema: state.schema, version: { generation: state.generation, revision: state.revision },
    logicalStateDigest: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
    counts: Object.fromEntries(["topics", "discussions", "sources", "sourceLinks", "contributions"].map(name => [name, state[name].length])) };
  return { dataDir, filename, state, backup };
}

test("v4 operator conversion requires a verified exact current recovery record and preserves old routes", async t => {
  const { dataDir, filename, state, backup } = fixture(t), original = readFileSync(filename);
  for (const altered of [{ ...backup, verified: false }, { ...backup, version: { ...backup.version, revision: 1 } },
    { ...backup, canonicalSchema: "demo-state/v2" }, { ...backup, logicalStateDigest: "0".repeat(64) },
    { ...backup, counts: { ...backup.counts, sources: 1 } }]) {
    await assert.rejects(migrateReferenceStorage({ dataDir, backupFilename: "fixture", verify: async () => altered, represent: () => null }));
    assert.deepEqual(readFileSync(filename), original);
  }
  const result = await migrateReferenceStorage({ dataDir, backupFilename: "fixture", verify: async () => backup, represent: () => null });
  assert.deepEqual(result.version, { ...backup.version, revision: backup.version.revision + 1 });
  const repository = createNormalizedSqliteRepository(filename, null, { readOnly: true });
  try {
    const converted = repository.load();
    assert.equal(converted.schema, "demo-state/v4"); assert.deepEqual(converted.topics, state.topics);
    assert.deepEqual(converted.discussions, state.discussions); assert.deepEqual(converted.contributions, state.contributions);
  } finally { repository.close(); }
  if (typeof (await import("node:sqlite")).DatabaseSync.prototype.serialize === "function") {
    const bytes = captureCanonicalImage(filename);
    try { assert.equal(validateCanonicalImage(bytes).canonicalSchema, "demo-state/v4"); } finally { bytes.fill(0); }
  }
});

test("failure before v4 commit rolls back new tables, schema, revision and state", async t => {
  const { dataDir, filename, state, backup } = fixture(t);
  await assert.rejects(migrateReferenceStorage({ dataDir, backupFilename: "fixture", verify: async () => backup, represent: () => null,
    beforeCommit() { throw new Error("Synthetic interrupted conversion"); } }));
  const repository = createNormalizedSqliteRepository(filename, null, { readOnly: true });
  try { assert.deepEqual(repository.load(), state); assert.equal(repository.storageFormat(), "canonical-relational/v1"); }
  finally { repository.close(); }
});

test("v4 CLI claims only the fixed listener and always releases it; malformed backup names claim nothing", async () => {
  let claims = 0, closed = 0, migrations = 0;
  const options = { dataDir: path.resolve("synthetic"), output() {},
    claim: async () => { claims++; return { close: async () => { closed++; } }; },
    migrate: async () => { migrations++; throw new Error("Synthetic rejection"); } };
  for (const args of [[], ["--auto"], ["--verified-backup", "../unsafe"]]) await assert.rejects(runReferenceMigrationCli(args, options));
  assert.equal(claims, 0);
  await assert.rejects(runReferenceMigrationCli(["--verified-backup", "canonical-2026-10-13T12-00-00-000Z-11111111-1111-4111-8111-111111111111.udlbackup"], options));
  assert.equal(claims, 1); assert.equal(migrations, 1); assert.equal(closed, 1);
});
