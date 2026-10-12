import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { startCanonicalBackupRetention, BACKUP_PRUNE_INTERVAL_MS } from "../src/ops/backup-retention.js";
import { parseBackupArguments, runBackupCli } from "../src/ops/backup-cli.js";

const dataDir = path.join(tmpdir(), "synthetic-canonical-retention", "data");
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

test("retention skips absent backups, runs at startup/hourly and never creates a snapshot", async () => {
  let callback, timerCleared = false, present = false;
  const calls = [], reports = [];
  const maintenance = startCanonicalBackupRetention({ dataDir, hasBackups: () => present,
    setIntervalImpl(fn, period) { callback = fn; assert.equal(period, BACKUP_PRUNE_INTERVAL_MS); return { unref() {} }; },
    clearIntervalImpl() { timerCleared = true; },
    run: async value => { calls.push(value); return { removed: 1 }; }, onOutcome: value => reports.push(value) });
  await flush(); assert.deepEqual(calls, []);
  present = true; callback(); await flush();
  assert.deepEqual(calls, [{ dataDir, operation: "prune" }]);
  assert.deepEqual(reports, [{ outcome: "pruned", removed: 1 }]);
  await maintenance.close(); callback(); await flush();
  assert.equal(timerCleared, true); assert.equal(calls.length, 1);
});

test("retention serializes expiry work and sanitizes failures without stopping application", async () => {
  let resolve, calls = 0;
  const reports = [];
  const maintenance = startCanonicalBackupRetention({ dataDir, hasBackups: () => true,
    setIntervalImpl() { return {}; }, clearIntervalImpl() {},
    run() { calls++; return new Promise(done => { resolve = done; }); }, onOutcome: value => reports.push(value) });
  await flush(); const first = maintenance.prune(), second = maintenance.prune();
  assert.equal(first, second); assert.equal(calls, 1);
  resolve({ removed: -1 }); await first;
  assert.deepEqual(reports, [{ outcome: "failed" }]);
  const third = maintenance.prune(); await flush(); resolve({ removed: 0 }); await third;
  assert.equal(calls, 2); await maintenance.close();
});

test("backup CLI exposes fixed canonical-only create/verify/expiry actions", async () => {
  assert.deepEqual(parseBackupArguments([]), { operation: "create" });
  assert.deepEqual(parseBackupArguments(["--prune"]), { operation: "prune" });
  const filename = "canonical-2026-10-12T12-00-00-000Z-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.udlbackup";
  assert.equal(parseBackupArguments(["--verify", filename]).filename, filename);
  for (const args of [["--database", "elsewhere"], ["--restore"], ["--verify", "../demo.sqlite"], ["--verify", filename, "extra"]])
    assert.throws(() => parseBackupArguments(args));
  const calls = [], output = [];
  await runBackupCli([], { dataDir, run: async value => { calls.push(value); return { filename, expiresAt: "2026-10-19T12:00:00.000Z" }; },
    output: value => output.push(value) });
  assert.deepEqual(calls, [{ operation: "create", dataDir }]);
  assert.ok(output[0].includes("not stopped"));
});
