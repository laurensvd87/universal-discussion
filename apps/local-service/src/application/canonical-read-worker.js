import { parentPort, workerData } from "node:worker_threads";
import { createNormalizedSqliteRepository } from "../adapters/normalized-sqlite-repository.js";
import { createDiscussionService } from "./discussion-service.js";
import { createFixtureRankingAdapter } from "../adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../adapters/fixture-catalog.js";
import { CANONICAL_READ_METHODS, canonicalReadInput } from "./canonical-read-queue.js";

let repository, service;
parentPort.on("message", ({ id, input }) => {
  try {
    const task = canonicalReadInput(input.method, input.input, input.version);
    if (!CANONICAL_READ_METHODS.includes(task.method) || workerData.allowedMethods && !workerData.allowedMethods.includes(task.method))
      throw new TypeError("Invalid public read");
    if (!repository) {
      repository = createNormalizedSqliteRepository(workerData.databasePath, null, { readOnly: true });
      service = createDiscussionService({ repository, ranking: createFixtureRankingAdapter(),
        sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS,
        nextId() { throw new Error("Read-only worker"); }, now: () => "read-only",
        alternateAdapter: workerData.alternateAdapter ?? null,
        alternateBodyMetric: workerData.alternateBodyMetric ?? null,
        alternateRidgeAdapter: workerData.alternateRidgeAdapter ?? null,
      });
    }
    const before = repository.version();
    if (before.generation !== task.version.generation || before.revision !== task.version.revision) {
      parentPort.postMessage({ id, ok: true, plan: { error: "conflict" } }); return;
    }
    // Repository reads each own short snapshot transaction. Never retain a
    // rollback-journal read lock through CPU planning: that would stall writers.
    const value = task.method === "catalog" ? service.catalog() :
      task.method === "related" ? service.related(task.input.sourceId, task.input.limit) : service[task.method](task.input);
    const current = repository.version();
    if (current.generation !== task.version.generation || current.revision !== task.version.revision) {
      parentPort.postMessage({ id, ok: true, plan: { error: "conflict" } }); return;
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 1_048_576) {
      parentPort.postMessage({ id, ok: true, plan: { error: "capacity" } }); return;
    }
    parentPort.postMessage({ id, ok: true, plan: { version: current, value } });
  } catch (error) {
    parentPort.postMessage({ id, ok: true, plan: { error: ["conflict", "capacity", "not-found", "invalid", "forbidden"]
      .includes(error?.code) ? error.code : "unavailable" } });
  }
});
