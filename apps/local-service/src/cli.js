import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { APP_DATABASE_PATH, startLocalApplication } from "./startup.js";
import { createProtectedRefreshStore } from "./ai/protected-refresh-store.js";
import { validateStartupConfig, FIXED_HOST, FIXED_PORT } from "./http/startup-config.js";
import { startLoopbackListener } from "./http/loopback-listener.js";
import { changePairing, PAIRING_FILE_NAME } from "./http/pairing-store.js";
import path from "node:path";

export function parseCliArguments(args) {
  if (args.length !== 2 || args[0] !== "--origin") throw new Error("Supply exactly --origin chrome-extension://<extension-id>");
  // Validate the one configuration field before any token generation or disk I/O.
  validateStartupConfig({ host: FIXED_HOST, port: FIXED_PORT, origin: args[1], capability: "validation-only-placeholder-value" });
  return args[1];
}

export function parsePairingCliArguments(args) {
  if (args.length === 2) return { origin: parseCliArguments(args), action: "start" };
  if (args.length !== 3 || !["--pairing-init", "--pairing-rotate", "--pairing-revoke"].includes(args[2])) {
    throw new Error("Supply --origin chrome-extension://<extension-id> and one pairing action");
  }
  return { origin: parseCliArguments(args.slice(0, 2)), action: args[2].slice("--pairing-".length) };
}

export async function runCli(args = process.argv.slice(2)) {
  const { origin, action } = parsePairingCliArguments(args);
  // Pairing secrets may only be revealed in a developer's interactive terminal.
  if (!process.stdout.isTTY) throw new Error("Start the local service in an interactive terminal for manual pairing");
  const pairingPath = path.join(path.dirname(APP_DATABASE_PATH), PAIRING_FILE_NAME);
  if (action !== "start") {
    // The same exclusive fixed-port claim excludes the service and competing
    // administrators before any verifier read or write.
    const claim = await startLoopbackListener({ handle: async () => ({ status: 503,
      headers: { "cache-control": "no-store" }, body: "" }) });
    let token;
    try { token = changePairing({ filePath: pairingPath, origin, action }); }
    finally { await claim.close(); }
    if (token) process.stdout.write(`Pairing ${action} complete. Copy this token now; it will not be shown again:\n${token}\n`);
    else process.stdout.write("Pairing revoked. Existing tokens are invalid.\n");
    return;
  }
  const application = await startLocalApplication({
    config: { host: FIXED_HOST, port: FIXED_PORT, origin, capability: "durable-pairing-verifier-only-placeholder" },
    databasePath: APP_DATABASE_PATH,
    pairingPath,
    nextId: (prefix) => `${prefix}-${randomUUID()}`,
    now: () => new Date().toISOString(),
    // Explicit runtime composition: after the fixed loopback port binds,
    // a stored user-approved refresh token may renew sign-in; inference still
    // requires the paired owner's Create click. No import-time provider I/O.
    chatgptFetchImpl: globalThis.fetch.bind(globalThis),
    chatgptRefreshStore: createProtectedRefreshStore,
  });
  process.stdout.write(`Local synthetic demo listening at http://${FIXED_HOST}:${FIXED_PORT}\nPersistent pairing active. Use deliberate demo text only. Stop with Ctrl+C.\n`);
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
    process.stderr.write("Local service startup failed. Check the extension Origin, interactive terminal, database, fixed port and pairing. Initialize or rotate pairing with the service stopped if needed.\n");
    process.exitCode = 1;
  });
}
