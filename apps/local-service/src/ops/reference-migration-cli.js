import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_DATABASE_PATH } from "../startup.js";
import { startLoopbackListener } from "../http/loopback-listener.js";
import { parseBackupArguments } from "./backup-cli.js";
import { migrateReferenceStorage } from "./reference-migration.js";

export async function runReferenceMigrationCli(args = process.argv.slice(2), { dataDir = path.dirname(APP_DATABASE_PATH),
  claim = startLoopbackListener, migrate = migrateReferenceStorage, output = value => process.stdout.write(value) } = {}) {
  if (args.length !== 2 || args[0] !== "--verified-backup") throw new Error("Invalid reference conversion command");
  const { filename } = parseBackupArguments(["--verify", args[1]]);
  const exclusive = await claim({ handle: async () => ({ status: 503, headers: { "cache-control": "no-store" }, body: "" }) });
  try {
    const result = await migrate({ dataDir, backupFilename: filename });
    output("Reference Topic conversion verified. Existing IDs, assignments and messages are preserved; revision advances once. Restart the normal service with the same extension Origin.\n");
    return result;
  } finally { await exclusive.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReferenceMigrationCli().catch(() => {
    process.stderr.write("Reference Topic conversion unavailable. Keep writes stopped; do not reset data, restore an old image automatically or open this store with an old binary.\n");
    process.exitCode = 1;
  });
}
