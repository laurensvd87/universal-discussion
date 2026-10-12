import { existsSync } from "node:fs";
import path from "node:path";
import { runCanonicalBackupWorker } from "./canonical-backup-worker.js";

export const BACKUP_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

// Expiry maintenance never creates a backup, changes canonical state, owns the
// listener, reads provider credentials or dispatches an inference request.
export function startCanonicalBackupRetention({ dataDir, run = runCanonicalBackupWorker,
  hasBackups = () => existsSync(path.join(dataDir, "canonical-migration-backups")),
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval,
  onOutcome = () => {} } = {}) {
  if (typeof dataDir !== "string" || !path.isAbsolute(dataDir) ||
      typeof run !== "function" || typeof hasBackups !== "function") throw new TypeError("Invalid backup maintenance");
  let closed = false, pending = null;
  function report(value) { try { onOutcome(value); } catch { /* Maintenance cannot affect serving. */ } }
  function prune() {
    if (closed) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      if (closed || !hasBackups()) return;
      const result = await run({ dataDir, operation: "prune" });
      if (!result || !Number.isSafeInteger(result.removed) || result.removed < 0) throw new Error("Invalid backup maintenance outcome");
      if (result.removed) report({ outcome: "pruned", removed: result.removed });
    }).catch(() => report({ outcome: "failed" })).finally(() => { pending = null; });
    return pending;
  }
  const timer = setIntervalImpl(() => { void prune(); }, BACKUP_PRUNE_INTERVAL_MS);
  timer?.unref?.();
  void prune();
  return Object.freeze({ prune,
    async close() { if (closed) return; closed = true; clearIntervalImpl(timer); await pending; },
  });
}
