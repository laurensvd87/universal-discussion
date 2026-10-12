// Owner-data-free Windows verification. No provider, account, pairing or listener
// mutation. Optional health probes read only the already-running loopback service.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import { createDemoState } from "../src/domain/demo-state.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { runCanonicalBackupWorker } from "../src/ops/canonical-backup-worker.js";

if (process.platform !== "win32") throw new Error("This synthetic check requires Windows DPAPI");
if (process.argv.slice(2).some(value => value !== "--check-live-service")) throw new Error("Invalid synthetic check argument");
const probe = process.argv.includes("--check-live-service");
function health() {
  return new Promise((resolve, reject) => {
    const request = http.request("http://127.0.0.1:4174/v1/health", { timeout: 2000 }, response => {
      response.resume(); response.once("end", () => resolve(response.statusCode));
    });
    request.on("timeout", () => request.destroy()); request.on("error", reject); request.end();
  });
}
const root = mkdtempSync(path.join(tmpdir(), "udl-online-backup-check-"));
const dataDir = path.join(root, "data"); mkdirSync(dataDir);
let monitor, checks = 0, failures = 0;
try {
  const date = "2026-10-12T00:00:00.000Z";
  const state = createDemoState({ generation: "synthetic-online-check", createdAt: date, sources: [],
    topicSeeds: [{ id: "synthetic-topic", title: "SYNTHETIC_BACKUP_SECRET_SENTINEL", kind: "general" }] });
  const source = path.join(dataDir, "demo.sqlite");
  const repository = createSqliteRepository(source, state); repository.close();
  const before = readFileSync(source);
  if (probe) {
    assert.ok([200, 401].includes(await health()));
    monitor = setInterval(() => { void health().then(status => { checks++; if (![200, 401].includes(status)) failures++; }).catch(() => { failures++; }); }, 100);
  }
  const result = await runCanonicalBackupWorker({ dataDir, operation: "create" });
  assert.equal(result.verified, true);
  assert.deepEqual(result.version, { generation: state.generation, revision: 0 });
  const verified = await runCanonicalBackupWorker({ dataDir, operation: "verify", filename: result.filename });
  assert.deepEqual(verified, result);
  assert.deepEqual(readFileSync(source), before);
  const folder = path.join(dataDir, "canonical-migration-backups");
  assert.deepEqual(readdirSync(folder), [result.filename]);
  assert.equal(readFileSync(path.join(folder, result.filename)).includes(Buffer.from("SYNTHETIC_BACKUP_SECRET_SENTINEL")), false);
  assert.deepEqual(await runCanonicalBackupWorker({ dataDir, operation: "prune", now: result.expiresAt }), { removed: 1 });
  assert.deepEqual(readdirSync(folder), []);
  if (probe) { assert.ok([200, 401].includes(await health())); assert.ok(checks > 0); assert.equal(failures, 0); }
  process.stdout.write(JSON.stringify({ syntheticWindowsBackup: "passed", verifiedInMemory: true, plaintextFiles: 0,
    ...(probe ? { serviceHealthChecks: checks, serviceHealthFailures: failures } : {}) }) + "\n");
} finally {
  clearInterval(monitor);
  assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
  assert.ok(path.basename(root).startsWith("udl-online-backup-check-"));
  rmSync(root, { recursive: true, force: true });
}
