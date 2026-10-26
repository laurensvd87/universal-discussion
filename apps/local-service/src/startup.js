// Importing this module never opens a database or binds a socket.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteDemoService } from "./application/create-sqlite-demo-service.js";
import { createRequestHandler } from "./http/request-handler.js";
import { validateStartupConfig } from "./http/startup-config.js";
import { startLoopbackListener } from "./http/loopback-listener.js";
import { loadPairingVerifier, loadReadOnlyCompatiblePairingVerifier } from "./http/pairing-store.js";
import { createChatGPTRuntime } from "./ai/chatgpt-runtime.js";
import { readInstalledOwnerTopicConfiguration } from "./application/owner-topic-configuration.js";
import { AccountRepository } from "./accounts/account-repository.js";
import { AccountService } from "./accounts/account-service.js";
import { createAccountLifecycle } from "./accounts/account-lifecycle.js";
import { loadProtectedAccountKey } from "./accounts/protected-account-key.js";
import { createPrivateDiscussionService } from "./private/private-service.js";
import { startCanonicalBackupRetention } from "./ops/backup-retention.js";
import { startCatalogGrowthSampler, startCatalogGrowthSamplerV2 } from "./metrics/catalog-growth.js";
import { createCanonicalV4ReadFacade } from "../portable/canonical-v4/read-facade.js";
import { createCanonicalV4RuntimeRepository } from "../portable/canonical-v4/runtime-repository.js";
import { createCanonicalV4IngestionRepository } from "../portable/canonical-v4/ingestion-repository.js";
import { createCanonicalV4LifecycleRepository } from "../portable/canonical-v4/lifecycle-repository.js";
import { createPostgresCanonicalService } from "./application/create-postgres-canonical-service.js";
import { createPostgresInteractiveIngestion } from "./application/postgres-interactive-ingestion.js";
import { startPostgresIngestionWorkerLoop } from "./application/postgres-ingestion-worker-loop.js";
import { createTopicSpaceDiscovery } from "./application/topic-space-discovery.js";
import { createFileTopicSpacePolicyStore } from "./application/topic-space-policy.js";
import { createInstalledFixedReferenceMatcher } from "./domain/fixed-reference-topic-integration.js";
import { LEARNED_COMMANDS } from "./domain/learned-sources.js";

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

// Trusted composition seam for the PostgreSQL cutover. Database objects are
// injected only by the local operator after DPAPI credential recovery; neither
// HTTP nor environment input can select a connection string or database role.
export async function openDormantPostgresApplication({ config: input, databasePath, nextId, now,
  canonicalDatabase, canonicalDatabaseOwned = false, ingestion = null, lifecycle = null,
  urlSelectionDatabase = null, urlSelectionDatabaseOwned = false,
  ingestionWorkerDatabase = null, ingestionWorkerDatabaseOwned = false,
  ingestionWorkerRepository = null, referenceMatcher = null, alternateRidgeAdapter = null,
  workerOptions = {}, chatgptFetchImpl, chatgptRefreshStore = null, insightTrace = null,
  insightDebug = null, insightRequestTrace = null, ai, pairingVerifier = null,
  accountsEnabled = false, accountHmacKey = null, accountDatabasePath = null } = {}) {
  const config = validateStartupConfig(input);
  if (!canonicalDatabase || typeof canonicalDatabase.query !== "function" ||
      typeof canonicalDatabase.transaction !== "function" || typeof nextId !== "function" || typeof now !== "function" ||
      typeof canonicalDatabaseOwned !== "boolean" || typeof urlSelectionDatabaseOwned !== "boolean" ||
      typeof ingestionWorkerDatabaseOwned !== "boolean")
    throw new TypeError("Invalid PostgreSQL application dependencies");
  if (urlSelectionDatabase !== null && (typeof urlSelectionDatabase.query !== "function" ||
      typeof urlSelectionDatabase.transaction !== "function" || urlSelectionDatabase === canonicalDatabase ||
      urlSelectionDatabase === ingestionWorkerDatabase) ||
      urlSelectionDatabase === null && urlSelectionDatabaseOwned)
    throw new TypeError("A separate URL-selection database pool is required");
  if (ingestionWorkerDatabase !== null && (typeof ingestionWorkerDatabase.query !== "function" ||
      ingestionWorkerDatabase === canonicalDatabase) || ingestionWorkerRepository !== null &&
      (!ingestionWorkerDatabase || ingestionWorkerDatabase === canonicalDatabase))
    throw new TypeError("A separate ingestion worker database role is required");
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const reads = createCanonicalV4ReadFacade({ database: canonicalDatabase });
  const urlSelectionReads = urlSelectionDatabase === null ? reads :
    createCanonicalV4ReadFacade({ database: urlSelectionDatabase });
  const commands = createCanonicalV4RuntimeRepository({ database: canonicalDatabase, nextId, now });
  await commands.health();
  const contributionLifecycle = createCanonicalV4LifecycleRepository({ database: canonicalDatabase, nextId, now });
  await contributionLifecycle.health();
  const appIngestionRepository = ingestion?.enqueueInteractive ? ingestion :
    createCanonicalV4IngestionRepository({ database: canonicalDatabase, nextId, now });
  const interactiveIngestion = ingestion?.ingest ? ingestion :
    createPostgresInteractiveIngestion({ repository: appIngestionRepository });
  const lifecycleBoundary = lifecycle ?? Object.freeze({
    command(expected, command, actor, generatedProof) {
      return LEARNED_COMMANDS.has(command?.type)
        ? appIngestionRepository.lifecycle(expected, command)
        : contributionLifecycle.command(expected, command, actor, generatedProof);
    },
    withdrawAccountContributions: (actorId) => contributionLifecycle.withdrawAccountContributions(actorId),
  });
  if (ingestionWorkerDatabase !== null && ingestionWorkerRepository === null)
    ingestionWorkerRepository = createCanonicalV4IngestionRepository({ database: ingestionWorkerDatabase, nextId, now });
  if (ingestionWorkerRepository !== null) await ingestionWorkerRepository.health();
  let accounts = null, accountRepository = null, privateDiscussions = null, accountLifecycle = null, runtime = null, worker = null,
    topicSpaces = null;
  const service = createPostgresCanonicalService({ reads, urlSelectionReads, runtime: commands,
    ingestion: interactiveIngestion, lifecycle: lifecycleBoundary,
    resolveAccountActor: id => accounts?.principalForAccountId(id) ?? null,
    readAccountActors: () => accounts?.publicActors() ?? [] });
  try {
    if (alternateRidgeAdapter !== null) {
      topicSpaces = createTopicSpaceDiscovery({ reads, topicAdapter: alternateRidgeAdapter,
        policyStore: createFileTopicSpacePolicyStore({
          filename: path.join(path.dirname(databasePath), "topic-space-policy.json"),
        }) });
      // The optional derived index builds in its own worker using the same
      // installed pinned Ridge artifact. Missing artifacts leave these routes
      // absent; canonical startup never falls back to raw E5 grouping.
      Promise.resolve(topicSpaces.start()).catch(() => {});
    }
    runtime = ai ?? createChatGPTRuntime({ service, dataDir: path.dirname(databasePath),
      fetchImpl: chatgptFetchImpl, refreshStore: chatgptRefreshStore,
      onInsightTrace: insightTrace, onInsightDebug: insightDebug, onInsightRequestTrace: insightRequestTrace });
    if (accountsEnabled) {
      if (!(accountHmacKey instanceof Uint8Array) || accountHmacKey.length !== 32) throw new Error("Account key required");
      accountRepository = new AccountRepository({ filename: accountDatabasePath ?? path.join(path.dirname(databasePath), "accounts.sqlite") });
      accounts = new AccountService({ repository: accountRepository, hmacKey: accountHmacKey,
        fixtureOnly: false, mailSink: null, chatgptIdentity: () => runtime?.accountIdentity?.() ?? null });
      accounts.cleanupExpired();
      privateDiscussions = createPrivateDiscussionService({
        databasePath: path.join(path.dirname(databasePath), "private-conversations.sqlite"),
        ai: runtime, publicService: service, nextId, now,
        canGenerate: actorId => accounts.matchesChatGPTIdentity(actorId.slice("account-".length)),
      });
      accountLifecycle = createAccountLifecycle({ accounts, service, ai: runtime, privateDiscussions });
      await accountLifecycle.resume();
    }
    if (ingestionWorkerRepository !== null) {
      referenceMatcher ??= alternateRidgeAdapter === null ? null : createInstalledFixedReferenceMatcher(alternateRidgeAdapter);
      worker = startPostgresIngestionWorkerLoop({ ...workerOptions,
        repository: ingestionWorkerRepository, referenceMatcher });
    }
  } catch (error) {
    try { await topicSpaces?.close(); } catch {}
    await worker?.close().catch(() => {}); privateDiscussions?.close(); runtime?.dispose?.(); accountRepository?.close();
    if (ingestionWorkerDatabaseOwned) await ingestionWorkerDatabase?.close?.().catch(() => {});
    if (urlSelectionDatabaseOwned) await urlSelectionDatabase?.close?.().catch(() => {});
    if (canonicalDatabaseOwned) await canonicalDatabase.close?.().catch(() => {});
    throw error;
  }
  let closed = false;
  return Object.freeze({ config, service, topicSpaces,
    handle: createRequestHandler({ service, config, ai: runtime, pairingVerifier,
      accounts, accountWrites: accountsEnabled, accountLifecycle, privateDiscussions, topicSpaces }),
    restore: () => runtime?.restore?.() ?? Promise.resolve(false),
    async close() {
      if (closed) return;
      closed = true;
      try {
        try { await topicSpaces?.close(); }
        finally { await worker?.close(); privateDiscussions?.close(); runtime?.dispose?.(); accountRepository?.close(); }
      } finally {
        try {
          if (ingestionWorkerDatabaseOwned) await ingestionWorkerDatabase?.close?.();
        } finally {
          try {
            if (urlSelectionDatabaseOwned) await urlSelectionDatabase?.close?.();
          } finally {
            if (canonicalDatabaseOwned) await canonicalDatabase.close?.();
          }
        }
      }
    },
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
  const postgres = options.canonicalDatabase !== undefined;
  const application = postgres
    ? await openDormantPostgresApplication({ ...options, ...installed, accountHmacKey, pairingVerifier })
    : openDormantLocalApplication({ ...options, ...installed, accountHmacKey, pairingVerifier });
  try {
    const listener = await startLoopbackListener({ handle: application.handle });
    try {
      if (options.pairingPath) activeVerifier = (options.readOnlyPairingCompatibility === true
        ? loadReadOnlyCompatiblePairingVerifier : loadPairingVerifier)({ filePath: options.pairingPath, origin: application.config.origin });
    } catch (error) {
      await listener.close();
      throw error;
    }
    // The fixed port is owned before renewing a rotating credential, so a
    // second local process cannot race the same stored refresh token.
    await Promise.resolve().then(() => application.restore()).catch(() => false);
    const backupRetention = postgres ? null : startCanonicalBackupRetention({ dataDir: path.dirname(options.databasePath),
      onOutcome: value => {
        if (value.outcome === "failed") process.stderr.write("Canonical backup expiry cleanup unavailable; service remains connected.\n");
      } });
    const startGrowth = options.catalogGrowthVersion === 2 ? startCatalogGrowthSamplerV2 : startCatalogGrowthSampler;
    const catalogGrowth = postgres ? null : startGrowth({ databasePath: options.databasePath,
      onOutcome: value => {
        if (value.outcome === "failed") process.stderr.write("Local catalog growth sampling unavailable; service remains connected.\n");
      } });
    let closed = false;
    return Object.freeze({
      async close() {
        if (closed) return;
        closed = true;
        try { await catalogGrowth?.close(); await backupRetention?.close(); await listener.close(); } finally { await application.close(); }
      },
    });
  } catch (error) {
    await application.close();
    throw error;
  }
}
