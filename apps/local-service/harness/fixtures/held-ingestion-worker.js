// Synthetic load fixture: hold the REAL prepared plan off the HTTP thread.
import { parentPort, workerData } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { createNormalizedSqliteRepository } from "../../src/adapters/normalized-sqlite-repository.js";
import { prepareIngestion } from "../../src/application/ingestion-plan.js";

const repository = createNormalizedSqliteRepository(workerData.databasePath, null, { readOnly: true });
parentPort.on("message", ({ id, input, createdAt }) => {
  try {
    const plan = prepareIngestion(repository.load(), input, { nextId: kind => `${kind}-${randomUUID()}`, now: () => createdAt });
    parentPort.postMessage({ started: true });
    Atomics.wait(new Int32Array(workerData.gate), 0, 0, 12000);
    parentPort.postMessage({ id, ok: true, plan });
  } catch {
    parentPort.postMessage({ id, ok: false, code: "unavailable" });
  }
});
