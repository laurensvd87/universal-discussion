// Importing this module never opens a database or binds a socket.
import { randomBytes, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteDemoService } from "./application/create-sqlite-demo-service.js";
import { createRequestHandler } from "./http/request-handler.js";
import { validateStartupConfig } from "./http/startup-config.js";
import { startLoopbackListener } from "./http/loopback-listener.js";
import { loadPairingVerifier } from "./http/pairing-store.js";
import { createChatGPTRuntime } from "./ai/chatgpt-runtime.js";
import { readDiagonalAdapter } from "./domain/diagonal-adapter.js";

export const APP_DATABASE_PATH = fileURLToPath(new URL("../data/demo.sqlite", import.meta.url));
const LOCAL_ADAPTER_PATH = fileURLToPath(new URL("../data/diagonal-adapter-v1.json", import.meta.url));

function installedAlternateAdapter() {
  try {
    const info = lstatSync(LOCAL_ADAPTER_PATH);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 16_384) return null;
    const bytes = readFileSync(LOCAL_ADAPTER_PATH);
    if (bytes.length !== info.size) return null;
    return readDiagonalAdapter(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return null; }
}

export function createProcessDependencies() {
  return Object.freeze({
    capability: randomBytes(32).toString("base64url"),
    nextId: (prefix) => `${prefix}-${randomUUID()}`,
    now: () => new Date().toISOString(),
  });
}

export function openDormantLocalApplication({ config: input, databasePath, nextId, now,
  chatgptFetchImpl, chatgptRefreshStore = null, insightTrace = null, insightDebug = null,
  ai, pairingVerifier = null, alternateAdapter = null }) {
  const config = validateStartupConfig(input);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = createSqliteDemoService({ databasePath, nextId, now, alternateAdapter });
  let runtime;
  try { runtime = ai ?? createChatGPTRuntime({ service: database.service, dataDir: path.dirname(databasePath),
    fetchImpl: chatgptFetchImpl, refreshStore: chatgptRefreshStore,
    onInsightTrace: insightTrace, onInsightDebug: insightDebug }); }
  catch (error) { database.close(); throw error; }
  return Object.freeze({
    config,
    handle: createRequestHandler({ service: database.service, config, ai: runtime, pairingVerifier }),
    restore: () => runtime?.restore?.() ?? Promise.resolve(false),
    close() { runtime?.dispose?.(); database.close(); },
  });
}

// databasePath/config are trusted composition seams for tests, never HTTP input.
// The CLI below this adapter always uses APP_DATABASE_PATH and random dependencies.
export async function startLocalApplication(options) {
  let activeVerifier = null;
  const pairingVerifier = options.pairingPath ? { verify: (token) => activeVerifier?.verify(token) ?? false } : null;
  const application = openDormantLocalApplication({ ...options, pairingVerifier,
    alternateAdapter: options.alternateAdapter === undefined ? installedAlternateAdapter() : options.alternateAdapter });
  try {
    const listener = await startLoopbackListener({ handle: application.handle });
    try {
      if (options.pairingPath) activeVerifier = loadPairingVerifier({ filePath: options.pairingPath, origin: application.config.origin });
    } catch (error) {
      await listener.close();
      throw error;
    }
    // The fixed port is owned before renewing a rotating credential, so a
    // second local process cannot race the same stored refresh token.
    await Promise.resolve().then(() => application.restore()).catch(() => false);
    let closed = false;
    return Object.freeze({
      async close() {
        if (closed) return;
        closed = true;
        try { await listener.close(); } finally { application.close(); }
      },
    });
  } catch (error) {
    application.close();
    throw error;
  }
}
