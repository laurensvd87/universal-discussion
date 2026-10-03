// Importing this module never opens a database or binds a socket.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteDemoService } from "./application/create-sqlite-demo-service.js";
import { createRequestHandler } from "./http/request-handler.js";
import { validateStartupConfig } from "./http/startup-config.js";
import { startLoopbackListener } from "./http/loopback-listener.js";
import { loadPairingVerifier } from "./http/pairing-store.js";
import { createChatGPTRuntime } from "./ai/chatgpt-runtime.js";

export const APP_DATABASE_PATH = fileURLToPath(new URL("../data/demo.sqlite", import.meta.url));

export function createProcessDependencies() {
  return Object.freeze({
    capability: randomBytes(32).toString("base64url"),
    nextId: (prefix) => `${prefix}-${randomUUID()}`,
    now: () => new Date().toISOString(),
  });
}

export function openDormantLocalApplication({ config: input, databasePath, nextId, now,
  chatgptFetchImpl, chatgptRefreshStore = null, insightTrace = null, insightDebug = null,
  ai, pairingVerifier = null }) {
  const config = validateStartupConfig(input);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = createSqliteDemoService({ databasePath, nextId, now });
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
  const application = openDormantLocalApplication({ ...options, pairingVerifier });
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
