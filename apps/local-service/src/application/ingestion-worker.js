import { parentPort, workerData } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { createNormalizedSqliteRepository } from "../adapters/normalized-sqlite-repository.js";
import { readLearnedIngest } from "../domain/learned-sources.js";
import { prepareIngestion } from "./ingestion-plan.js";
import { createIncrementalAdaptiveTopicPlanner } from "../domain/incremental-adaptive-topics.js";
import { createInstalledFixedReferenceMatcher } from "../domain/fixed-reference-topic-integration.js";

// This worker has no write connection. Losing or terminating it cannot commit
// ingestion; only the request thread may approve the exact prepared mutation.
let repository;
const adaptivePlanner = workerData.incrementalMatching === true ? createIncrementalAdaptiveTopicPlanner() : null;
let referenceMatcher = null;
if (workerData.alternateRidgeAdapter != null) {
  try { referenceMatcher = createInstalledFixedReferenceMatcher(workerData.alternateRidgeAdapter); }
  catch { /* A v4 ingest fails closed; no raw E5 or old grouping fallback. */ }
}
parentPort.on("message", ({ id, input, createdAt }) => {
  try {
    repository ??= createNormalizedSqliteRepository(workerData.databasePath, null, { readOnly: true });
    // Validate the structured message without renormalizing the already accepted
    // representation a second time: its exact floats determine receipt digests.
    readLearnedIngest(input);
    const plan = prepareIngestion(repository.load(), input, {
      nextId: kind => `${kind}-${randomUUID()}`, now: () => createdAt,
      ...(adaptivePlanner === null ? {} : { adaptivePlanner }),
      ...(referenceMatcher === null ? {} : { referenceMatcher }),
    });
    parentPort.postMessage({ id, ok: true, plan });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, code: ["conflict", "capacity", "forbidden"].includes(error?.code) ? error.code : "unavailable" });
  }
});
