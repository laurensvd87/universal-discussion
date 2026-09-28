import { pathToFileURL } from "node:url";
import { APP_DATABASE_PATH, createProcessDependencies, startLocalApplication } from "./startup.js";
import { validateStartupConfig, FIXED_HOST, FIXED_PORT } from "./http/startup-config.js";

export function parseCliArguments(args) {
  if (args.length !== 2 || args[0] !== "--origin") throw new Error("Supply exactly --origin chrome-extension://<extension-id>");
  // Validate the one configuration field before any token generation or disk I/O.
  validateStartupConfig({ host: FIXED_HOST, port: FIXED_PORT, origin: args[1], capability: "validation-only-placeholder-value" });
  return args[1];
}

export async function runCli(args = process.argv.slice(2)) {
  const origin = parseCliArguments(args);
  // Pairing secrets may only be revealed in a developer's interactive terminal.
  if (!process.stdout.isTTY) throw new Error("Start the local service in an interactive terminal for manual pairing");
  const dependencies = createProcessDependencies();
  const application = await startLocalApplication({
    config: { host: FIXED_HOST, port: FIXED_PORT, origin, capability: dependencies.capability },
    databasePath: APP_DATABASE_PATH,
    nextId: dependencies.nextId,
    now: dependencies.now,
  });
  process.stdout.write(`Local synthetic demo listening at http://${FIXED_HOST}:${FIXED_PORT}\nPairing token (this process only): ${dependencies.capability}\nUse deliberate demo text only. Stop with Ctrl+C.\n`);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    try { await application.close(); } catch { process.exitCode = 1; }
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(() => {
    process.stderr.write("Local service startup failed. Check the extension Origin, interactive terminal, database and fixed port.\n");
    process.exitCode = 1;
  });
}
