import { Worker } from "node:worker_threads";
import { ServiceError } from "../domain/errors.js";

const fixedError = code => new ServiceError(code, code === "conflict" ? "State changed" :
  code === "capacity" ? "Ingestion capacity reached" : "Ingestion unavailable");

// A single planner avoids duplicating quadratic working sets. Admission is
// bounded; jobs are never retried, including worker failure or cancellation.
export function createIngestionWorkerQueue({ databasePath, maxPending = 8, timeoutMs = 15000, incrementalMatching = false, alternateRidgeAdapter = null,
  workerFactory = () => new Worker(new URL("./ingestion-worker.js", import.meta.url), {
    workerData: { databasePath, incrementalMatching, alternateRidgeAdapter }, execArgv: process.execArgv.filter(argument => !argument.startsWith("--test")),
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
  }) }) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 32 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError("Invalid ingestion capacity");
  let worker = null, active = null, nextId = 0, closed = false, retiring = null, closing = null;
  const waiting = [];
  function settle(job, error, plan) {
    clearTimeout(job.timer); job.signal?.removeEventListener("abort", job.abort);
    if (error) job.reject(error); else job.resolve(plan);
  }
  function invalidate() {
    const previous = worker; worker = null;
    if (!previous) return retiring ?? Promise.resolve();
    previous.removeAllListeners();
    // A late worker error during asynchronous termination must still have an
    // observer; EventEmitter treats an unobserved error as a main-thread throw.
    previous.on("error", () => {});
    // Keep a replacement from allocating another planner working set until the
    // old thread has actually exited, including after repeated cancellations.
    const termination = Promise.resolve().then(() => previous.terminate()).then(() => {
      if (retiring === termination) retiring = null;
      dispatch();
    }, () => {
      // An uncertain retirement cannot authorize a second live planner.
      closed = true;
      for (const job of waiting.splice(0)) settle(job, fixedError("unavailable"));
    });
    retiring = termination;
    return termination;
  }
  function failActive(code = "unavailable") {
    const job = active; active = null; invalidate();
    if (job) settle(job, fixedError(code));
    dispatch();
  }
  function dispatch() {
    if (closed || retiring || active || !waiting.length) return;
    while (waiting.length && (waiting[0].signal?.aborted || performance.now() >= waiting[0].expiresAt))
      settle(waiting.shift(), fixedError("unavailable"));
    if (!waiting.length) return;
    active = waiting.shift();
    try {
      if (!worker) {
        worker = workerFactory();
        worker.on("message", message => {
          if (!active || message?.id !== active.id) { failActive(); return; }
          if (active.signal?.aborted || performance.now() >= active.expiresAt) { failActive(); return; }
          const job = active; active = null;
          settle(job, message.ok === true ? null : fixedError(["conflict", "capacity", "forbidden"].includes(message.code) ? message.code : "unavailable"), message.plan);
          dispatch();
        });
        worker.on("error", () => failActive());
        worker.on("exit", () => failActive());
      }
      worker.postMessage({ id: active.id, input: active.input, createdAt: active.createdAt });
    } catch { failActive(); }
  }
  return Object.freeze({
    prepare(input, { createdAt = new Date().toISOString(), signal } = {}) {
      if (closed || signal?.aborted) return Promise.reject(fixedError("unavailable"));
      if (waiting.length + Number(Boolean(active)) >= maxPending) return Promise.reject(fixedError("capacity"));
      return new Promise((resolve, reject) => {
        const job = { id: ++nextId, input, createdAt, signal, resolve, reject, expiresAt: performance.now() + timeoutMs };
        job.abort = () => {
          if (active === job) { failActive(); return; }
          const index = waiting.indexOf(job);
          if (index !== -1) { waiting.splice(index, 1); settle(job, fixedError("unavailable")); }
        };
        job.timer = setTimeout(job.abort, timeoutMs);
        signal?.addEventListener("abort", job.abort, { once: true });
        waiting.push(job); dispatch();
      });
    },
    close() {
      if (closing) return closing;
      closed = true;
      if (active) { settle(active, fixedError("unavailable")); active = null; }
      for (const job of waiting.splice(0)) settle(job, fixedError("unavailable"));
      closing = invalidate();
      return closing;
    },
  });
}
