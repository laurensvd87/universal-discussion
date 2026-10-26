import { pathToFileURL } from "node:url";
import path from "node:path";
import { APP_DATABASE_PATH } from "../startup.js";
import { runCanonicalBackupWorker } from "./canonical-backup-worker.js";
import { isCanonicalBackupFilename } from "./canonical-backup.js";

export function parseBackupArguments(args) {
  if (!Array.isArray(args)) throw new Error("Invalid canonical backup command");
  if (args.length === 0) return { operation: "create" };
  if (args.length === 1 && args[0] === "--prune") return { operation: "prune" };
  if (args.length === 2 && args[0] === "--verify" && typeof args[1] === "string" &&
      isCanonicalBackupFilename(args[1]) && args[1].length <= 128)
    return { operation: "verify", filename: args[1] };
  throw new Error("Invalid canonical backup command");
}

export async function runBackupCli(args = process.argv.slice(2), { run = runCanonicalBackupWorker,
  dataDir = path.dirname(APP_DATABASE_PATH), output = value => process.stdout.write(value) } = {}) {
  const request = parseBackupArguments(args);
  const result = await run({ ...request, dataDir });
  if (request.operation === "prune") output(`Canonical backup expiry cleanup complete: ${result.removed} removed.\n`);
  else output(`Canonical backup ${request.operation === "create" ? "created and verified" : "verified"}: ${result.filename}\nExpires: ${result.expiresAt}\nThe local service was not stopped or reconnected.\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackupCli().catch(() => {
    process.stderr.write("Canonical encrypted backup failed. The service is unchanged; no plaintext fallback was used.\n");
    process.exitCode = 1;
  });
}
