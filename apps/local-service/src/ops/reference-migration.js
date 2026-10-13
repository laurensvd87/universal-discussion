import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createNormalizedSqliteRepository, migrateNormalizedReferenceStorage } from "../adapters/normalized-sqlite-repository.js";
import { canonicalPath } from "./canonical-migration.js";
import { runCanonicalBackupWorker } from "./canonical-backup-worker.js";
import { readInstalledOwnerTopicConfiguration } from "../application/owner-topic-configuration.js";
import { createInstalledFixedReferenceMatcher } from "../domain/fixed-reference-topic-integration.js";

const failure = () => new Error("Reference Topic conversion failed; keep writes stopped and preserve the verified recovery record");

// Explicit, exclusively offline operator command. The verified encrypted image
// must represent this exact current state, including all later accepted writes.
// No automatic backup restore, historical rematch or other-store access.
export async function migrateReferenceStorage({ dataDir, backupFilename, verify = runCanonicalBackupWorker,
  represent = null, beforeCommit } = {}) {
  try {
    const backup = await verify({ dataDir, operation: "verify", filename: backupFilename });
    if (backup?.verified !== true) throw failure();
    const filename = canonicalPath(dataDir);
    const repository = createNormalizedSqliteRepository(filename, null, { readOnly: true });
    let before;
    try { before = repository.load(); } finally { repository.close(); }
    if (!["demo-state/v2", "demo-state/v3"].includes(before.schema) || backup.canonicalSchema !== before.schema ||
        !isDeepStrictEqual(backup.version, { generation: before.generation, revision: before.revision }) ||
        backup.logicalStateDigest !== createHash("sha256").update(JSON.stringify(before)).digest("hex")) throw failure();
    const counts = Object.fromEntries(["topics", "discussions", "sources", "sourceLinks", "contributions"].map(name => [name, before[name].length]));
    if (!isDeepStrictEqual(backup.counts, counts)) throw failure();
    if (represent === null) {
      const artifact = readInstalledOwnerTopicConfiguration().alternateRidgeAdapter;
      if (artifact === null) throw failure();
      represent = createInstalledFixedReferenceMatcher(artifact).represent;
    }
    canonicalPath(dataDir);
    const after = migrateNormalizedReferenceStorage(filename, backup.version, { represent, beforeCommit });
    const stripped = structuredClone(after);
    stripped.schema = before.schema; stripped.revision = before.revision;
    for (const source of stripped.sources) delete source.topicIds;
    for (const topic of stripped.topics) delete topic.reference;
    if (!isDeepStrictEqual(stripped, before)) throw failure();
    return Object.freeze({ converted: true, canonicalSchema: after.schema,
      version: { generation: after.generation, revision: after.revision }, counts, backupFilename });
  } catch { throw failure(); }
}
