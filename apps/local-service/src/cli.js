import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { APP_DATABASE_PATH, startLocalApplication } from "./startup.js";
import { createProtectedRefreshStore } from "./ai/protected-refresh-store.js";
import { createInsightTraceLog } from "./ai/insight-trace-log.js";
import { createRawInsightDebugLog } from "./ai/raw-insight-debug-log.js";
import { createVoiceRequestTraceLog } from "./ai/voice-request-trace-log.js";
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
  if (args.length === 3 && args[2] === "--debug-insight-raw")
    return { origin: parseCliArguments(args.slice(0, 2)), action: "start", rawDebug: true };
  if (args.length !== 3 || !["--pairing-init", "--pairing-rotate", "--pairing-revoke"].includes(args[2])) {
    throw new Error("Supply --origin chrome-extension://<extension-id> and one pairing action");
  }
  return { origin: parseCliArguments(args.slice(0, 2)), action: args[2].slice("--pairing-".length) };
}

export async function runCli(args = process.argv.slice(2)) {
  const { origin, action, rawDebug = false } = parsePairingCliArguments(args);
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
  const traceLog = rawDebug ? createInsightTraceLog() : null;
  let voiceRequestTraceLog = null;
  try { voiceRequestTraceLog = createVoiceRequestTraceLog(); }
  catch { /* Diagnostics availability never prevents service startup. */ }
  const rawDebugLog = createRawInsightDebugLog({ enabled: rawDebug });
  if (rawDebug && !rawDebugLog.enabled) throw new Error("Raw insight debug log unavailable");
  const application = await startLocalApplication({
    config: { host: FIXED_HOST, port: FIXED_PORT, origin, capability: "durable-pairing-verifier-only-placeholder" },
    databasePath: APP_DATABASE_PATH,
    asyncIngest: true,
    incrementalMatching: true,
    // New multi-page Topic statistics use a separate aggregate history. Never
    // reinterpret the old >=1-member curve as the new >=2-member measure.
    catalogGrowthVersion: 2,
    pairingPath,
    nextId: (prefix) => `${prefix}-${randomUUID()}`,
    now: () => new Date().toISOString(),
    // ADR-091: approved owner-local accounts, no real mail transport. App
    // credentials remain Chrome-session RAM; provider credentials stay separate.
    accountsEnabled: true,
    // Explicit runtime composition: after the fixed loopback port binds,
    // a stored user-approved refresh token may renew sign-in; inference still
    // requires deliberate generation or an accepted own-AI private reply.
    // No import-time provider I/O or automatic retry.
    chatgptFetchImpl: globalThis.fetch.bind(globalThis),
    chatgptRefreshStore: createProtectedRefreshStore,
    // The sink independently validates the structural DTO before persistence.
    insightTrace: (trace) => {
      try {
        if (!traceLog || traceLog.write(trace)) process.stdout.write(`INSIGHT_TRACE ${JSON.stringify(trace)}\n`);
      }
      catch { /* Diagnostics never change a research result. */ }
    },
    insightDebug: rawDebug ? (entry) => rawDebugLog.capture(entry) : null,
    insightRequestTrace: voiceRequestTraceLog ? (trace) => voiceRequestTraceLog.write(trace) : null,
  });
  process.stdout.write(`Local discussion service listening at http://${FIXED_HOST}:${FIXED_PORT}\n${voiceRequestTraceLog ? `Voice request trace log: ${voiceRequestTraceLog.filePath}\n` : "Voice request trace log unavailable.\n"}${rawDebug ? `Insight trace log: ${traceLog.filePath}\nRaw insight debug log: ${rawDebugLog.filePath}\n` : ""}Persistent pairing active. Local accounts enabled; email disabled. Stop with Ctrl+C.\n`);
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
