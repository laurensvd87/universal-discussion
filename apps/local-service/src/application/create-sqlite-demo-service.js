import { createDiscussionService } from "./discussion-service.js";
import { createDemoState } from "../domain/demo-state.js";
import { createSqliteRepository } from "../adapters/sqlite-repository.js";
import { createNormalizedSqliteRepository } from "../adapters/normalized-sqlite-repository.js";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { createFixtureRankingAdapter } from "../adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../adapters/fixture-catalog.js";
import { createPublicDiscoveryIndex } from "../discovery/public-index.js";
import { createIngestionWorkerQueue } from "./ingestion-worker-queue.js";
import { createCanonicalReadQueue } from "./canonical-read-queue.js";

export function createSqliteDemoService({ databasePath, nextId, now, repositoryOptions, storageMode = "auto",
  alternateAdapter = null, alternateBodyMetric = null, alternateRidgeAdapter = null,
  resolveAccountActor = null, readAccountActors = () => [],
  asyncIngest = false, ingestionWorkerOptions = {}, asyncReads = asyncIngest, readWorkerOptions = {}, projectionWorkerOptions = {},
  discoveryDatabasePath = databasePath === ":memory:" ? ":memory:" : `${databasePath}.discovery.sqlite` }) {
  const initialState = createDemoState({ generation: nextId("generation"), createdAt: now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  if (!["auto", "legacy", "normalized"].includes(storageMode)) throw new TypeError("Invalid canonical storage mode");
  // Existing owner databases never migrate as a side effect of startup. Auto
  // dispatch only opens an already-committed format; explicit conversion is a
  // separate reviewed/offline operation. New legacy fixtures remain compatible.
  let normalized = storageMode === "normalized";
  if (storageMode === "auto" && databasePath !== ":memory:" && existsSync(databasePath)) {
    const inspection = new DatabaseSync(databasePath, { readOnly: true });
    try { normalized = Boolean(inspection.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='canonical_meta'").get()); }
    finally { inspection.close(); }
  }
  const repository = normalized ? createNormalizedSqliteRepository(databasePath, initialState, repositoryOptions)
    : createSqliteRepository(databasePath, initialState, repositoryOptions);
  let discover, ingestionExecutor, readExecutor, projectionExecutor;
  try {
    // Legacy and RAM fixture stores retain their synchronous compatibility path.
    // Worker isolation never migrates a store or writes an owner database itself.
    if (asyncIngest && normalized && databasePath !== ":memory:") {
      ingestionExecutor = createIngestionWorkerQueue({ ...ingestionWorkerOptions, databasePath });
    }
    if (asyncReads && normalized && databasePath !== ":memory:") {
      readExecutor = createCanonicalReadQueue({ ...readWorkerOptions, databasePath,
        allowedMethods: ["catalog", "catalogContext", "catalogPage", "discussion", "discussionPage", "exactSource"],
        alternateAdapter: null, alternateBodyMetric: null, alternateRidgeAdapter: null });
      projectionExecutor = createCanonicalReadQueue({ maxTasks: 8, timeoutMs: 30000, ...projectionWorkerOptions, databasePath,
        allowedMethods: ["enrichment", "related", "priorDiscussions", "alternateDiscussion"],
        alternateAdapter, alternateBodyMetric, alternateRidgeAdapter });
      // Initialize the fast read-only connection in
      // parallel with normal startup, not inside the first five-second browser
      // read. Empty public context needs no page selection or provider call.
      // This disposable preparation never blocks startup or writes canonical data.
      void readExecutor.read("catalogContext", { sourceId: null, topicId: null },
        { version: repository.version() }).catch(() => {});
    }
    const service = createDiscussionService({
      repository, ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES,
      topicSeeds: SYNTHETIC_TOPIC_SEEDS, nextId, now, alternateAdapter, alternateBodyMetric, alternateRidgeAdapter,
      resolveAccountActor, readAccountActors, ingestionExecutor, readExecutor, projectionExecutor,
    });
    discover = createPublicDiscoveryIndex({ databasePath: discoveryDatabasePath, repository });
    return Object.freeze({ service: Object.freeze({ ...service, discover }), close() {
      const stopping = Promise.all([ingestionExecutor?.close(), readExecutor?.close(), projectionExecutor?.close()]);
      discover.close(); repository.close(); return stopping;
    } });
  } catch (error) {
    discover?.close();
    ingestionExecutor?.close();
    readExecutor?.close();
    projectionExecutor?.close();
    repository.close();
    throw error;
  }
}
