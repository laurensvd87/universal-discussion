import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_DATABASE_PATH } from "../startup.js";
import { startLoopbackListener } from "../http/loopback-listener.js";
import { parseBackupArguments } from "./backup-cli.js";
import { migrateCanonicalStorage } from "./canonical-migration.js";

export async function runMigrationCli(args = process.argv.slice(2), { dataDir = path.dirname(APP_DATABASE_PATH),
  claim = startLoopbackListener, migrate = migrateCanonicalStorage,
  output = value => process.stdout.write(value) } = {}) {
  if (args.length !== 2 || args[0] !== "--verified-backup") throw new Error("Invalid canonical conversion command");
  const { filename } = parseBackupArguments(["--verify", args[1]]);
  // Same fixed port as pairing administration: the old service/other operator
  // must be absent. No alternative bind or public access is introduced.
  const exclusive = await claim({ handle: async () => ({ status: 503,
    headers: { "cache-control": "no-store" }, body: "" }) });
  try {
    const result = await migrate({ dataDir, backupFilename: filename });
    output("Canonical conversion verified. IDs, generation/revision and all retained canonical records are unchanged. Restart the normal service with the same extension Origin.\n");
    return result;
  } finally { await exclusive.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrationCli().catch(() => {
    process.stderr.write("Canonical conversion unavailable. Keep writes stopped; do not reset data or use an old binary on normalized storage. Check the verified backup and exclusive service stop.\n");
    process.exitCode = 1;
  });
}
