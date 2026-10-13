import { DatabaseSync } from "node:sqlite";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { createNormalizedSqliteRepository } from "../adapters/normalized-sqlite-repository.js";
import { assertValidPersistedState } from "../domain/persisted-state.js";
import { MAX_DOCUMENT_BYTES } from "../domain/repository-contract.js";
import { runCanonicalBackupWorker } from "./canonical-backup-worker.js";

function failure() { return new Error("Canonical conversion failed; keep service writes stopped and use the verified recovery record"); }
export function canonicalPath(dataDir) {
  if (typeof dataDir !== "string" || !path.isAbsolute(dataDir) || path.resolve(dataDir) !== dataDir) throw failure();
  const filename = path.join(dataDir, "demo.sqlite");
  for (let current = filename; ; current = path.dirname(current)) {
    if (lstatSync(current).isSymbolicLink() || realpathSync.native(current).toLowerCase() !== current.toLowerCase()) throw failure();
    if (current === path.dirname(current)) break;
  }
  if (!lstatSync(filename).isFile()) throw failure();
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const sidecar = `${filename}${suffix}`;
    let info;
    try { info = lstatSync(sidecar); } catch (error) { if (error.code === "ENOENT") continue; throw failure(); }
    if (info.isSymbolicLink() || !info.isFile() ||
        realpathSync.native(sidecar).toLowerCase() !== sidecar.toLowerCase()) throw failure();
  }
  return filename;
}
function readLegacy(filename) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const objects = database.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
    if (objects.length !== 1 || objects[0].name !== "demo_state" || objects[0].type !== "table") throw failure();
    const rows = database.prepare("SELECT * FROM demo_state").all();
    const row = rows[0];
    if (rows.length !== 1 || row.singleton !== 1 || !["demo-state/v2", "demo-state/v3"].includes(row.schema) ||
        typeof row.document !== "string" || Buffer.byteLength(row.document) > MAX_DOCUMENT_BYTES) throw failure();
    const state = JSON.parse(row.document); assertValidPersistedState(state);
    if (state.schema !== row.schema || state.generation !== row.generation || state.revision !== row.revision) throw failure();
    return state;
  } finally { database.close(); }
}

// Called only under the operator's exclusive fixed-port claim, with all service
// writers stopped. It never stops/restarts a listener, restores data or touches
// accounts/private stores/credentials. A stale online backup cannot authorize
// conversion after later accepted writes.
export async function migrateCanonicalStorage({ dataDir, backupFilename,
  verify = runCanonicalBackupWorker, beforeCommit } = {}) {
  let repository;
  try {
    const backup = await verify({ dataDir, operation: "verify", filename: backupFilename });
    if (backup?.verified !== true) throw failure();
    const filename = canonicalPath(dataDir);
    const before = readLegacy(filename);
    if (backup.canonicalSchema !== before.schema || !isDeepStrictEqual(backup.version,
      { generation: before.generation, revision: before.revision })) throw failure();
    if (backup.logicalStateDigest !== createHash("sha256").update(JSON.stringify(before)).digest("hex")) throw failure();
    const counts = Object.fromEntries(["topics", "discussions", "sources", "sourceLinks", "contributions"]
      .map(name => [name, before[name].length]));
    if (!isDeepStrictEqual(backup.counts, counts)) throw failure();
    canonicalPath(dataDir);
    repository = createNormalizedSqliteRepository(filename, null, { allowLegacyMigration: true,
      expectedLegacyState: before, beforeCommit });
    const after = repository.load();
    if (!isDeepStrictEqual(after, before)) throw failure();
    return Object.freeze({ converted: true, canonicalSchema: after.schema,
      version: repository.version(), counts, backupFilename });
  } catch { throw failure(); }
  finally { repository?.close(); }
}
