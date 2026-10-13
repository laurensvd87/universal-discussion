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
import { readInstalledOwnerTopicConfiguration } from "./application/owner-topic-configuration.js";
import { AccountRepository } from "./accounts/account-repository.js";
import { AccountService } from "./accounts/account-service.js";
import { createAccountLifecycle } from "./accounts/account-lifecycle.js";
import { loadProtectedAccountKey } from "./accounts/protected-account-key.js";
import { createPrivateDiscussionService } from "./private/private-service.js";
import { startCanonicalBackupRetention } from "./ops/backup-retention.js";
import { startCatalogGrowthSampler, startCatalogGrowthSamplerV2 } from "./metrics/catalog-growth.js";

export const APP_DATABASE_PATH = fileURLToPath(new URL("../data/demo.sqlite", import.meta.url));

export function createProcessDependencies() {
  return Object.freeze({
    capability: randomBytes(32).toString("base64url"),
    nextId: (prefix) => `${prefix}-${randomUUID()}`,
    now: () => new Date().toISOString(),
  });
}

export function openDormantLocalApplication({ config: input, databasePath, nextId, now,
  chatgptFetchImpl, chatgptRefreshStore = null, insightTrace = null, insightDebug = null, insightRequestTrace = null,
  ai, pairingVerifier = null, alternateAdapter = null, alternateBodyMetric = null, alternateRidgeAdapter = null,
  accountsEnabled = false, accountHmacKey = null, accountDatabasePath = null, canonicalStorageMode = "auto",
  asyncIngest = false, ingestionWorkerOptions, asyncReads = asyncIngest, readWorkerOptions, projectionWorkerOptions,
  incrementalMatching = false }) {
  const config = validateStartupConfig(input);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  let accounts = null, accountRepository = null, privateDiscussions = null;
  const database = createSqliteDemoService({ databasePath, nextId, now, alternateAdapter, alternateBodyMetric, storageMode: canonicalStorageMode,
    alternateRidgeAdapter, asyncIngest, ingestionWorkerOptions, asyncReads, readWorkerOptions, projectionWorkerOptions, incrementalMatching,
    ...(accountsEnabled ? { resolveAccountActor: id => accounts.principalForAccountId(id),
      readAccountActors: () => accounts?.publicActors() ?? [] } : {}) });
  let runtime;
  let accountLifecycle = null;
  try { runtime = ai ?? createChatGPTRuntime({ service: database.service, dataDir: path.dirname(databasePath),
    fetchImpl: chatgptFetchImpl, refreshStore: chatgptRefreshStore,
    onInsightTrace: insightTrace, onInsightDebug: insightDebug, onInsightRequestTrace: insightRequestTrace }); }
  catch (error) { database.close(); throw error; }
  try {
    if (accountsEnabled) {
      if (!(accountHmacKey instanceof Uint8Array) || accountHmacKey.length !== 32) throw new Error("Account key required");
      accountRepository = new AccountRepository({ filename: accountDatabasePath ?? path.join(path.dirname(databasePath), "accounts.sqlite") });
      accounts = new AccountService({ repository: accountRepository, hmacKey: accountHmacKey,
        fixtureOnly: false, mailSink: null, chatgptIdentity: () => runtime?.accountIdentity?.() ?? null });
      accounts.cleanupExpired();
      privateDiscussions = createPrivateDiscussionService({
        databasePath: path.join(path.dirname(databasePath), "private-conversations.sqlite"),
        ai: runtime, publicService: database.service, nextId, now,
        canGenerate: actorId => accounts.matchesChatGPTIdentity(actorId.slice("account-".length)),
      });
      accountLifecycle = createAccountLifecycle({ accounts, service: database.service, ai: runtime, privateDiscussions });
      accountLifecycle.resume();
    }
  } catch (error) { privateDiscussions?.close(); runtime?.dispose?.(); accountRepository?.close(); database.close(); throw error; }
  return Object.freeze({
    config,
    handle: createRequestHandler({ service: database.service, config, ai: runtime, pairingVerifier,
      accounts, accountWrites: accountsEnabled, accountLifecycle, privateDiscussions }),
    restore: () => runtime?.restore?.() ?? Promise.resolve(false),
    close() { privateDiscussions?.close(); runtime?.dispose?.(); accountRepository?.close(); return database.close(); },
  });
}

// databasePath/config are trusted composition seams for tests, never HTTP input.
// The CLI below this adapter always uses APP_DATABASE_PATH and random dependencies.
export async function startLocalApplication(options) {
  if (options.catalogGrowthVersion !== undefined && ![1, 2].includes(options.catalogGrowthVersion))
    throw new TypeError("Invalid catalog growth version");
  let activeVerifier = null;
  const pairingVerifier = options.pairingPath ? { verify: (token) => activeVerifier?.verify(token) ?? false } : null;
  // Explicit test composition opts out of installed artifacts entirely.
  const installed = options.alternateAdapter === undefined && options.alternateBodyMetric === undefined &&
    options.alternateRidgeAdapter === undefined
    ? readInstalledOwnerTopicConfiguration() : {};
  let accountHmacKey = options.accountHmacKey;
  if (options.accountsEnabled && !accountHmacKey) {
    const dataDir = path.dirname(options.databasePath);
    mkdirSync(dataDir, { recursive: true });
    accountHmacKey = await loadProtectedAccountKey({ dataDir });
  }
  const application = openDormantLocalApplication({ ...options, ...installed, accountHmacKey, pairingVerifier });
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
    const backupRetention = startCanonicalBackupRetention({ dataDir: path.dirname(options.databasePath),
      onOutcome: value => {
        if (value.outcome === "failed") process.stderr.write("Canonical backup expiry cleanup unavailable; service remains connected.\n");
      } });
    const startGrowth = options.catalogGrowthVersion === 2 ? startCatalogGrowthSamplerV2 : startCatalogGrowthSampler;
    const catalogGrowth = startGrowth({ databasePath: options.databasePath,
      onOutcome: value => {
        if (value.outcome === "failed") process.stderr.write("Local catalog growth sampling unavailable; service remains connected.\n");
      } });
    let closed = false;
    return Object.freeze({
      async close() {
        if (closed) return;
        closed = true;
        try { await catalogGrowth.close(); await backupRetention.close(); await listener.close(); } finally { await application.close(); }
      },
    });
  } catch (error) {
    application.close();
    throw error;
  }
}
