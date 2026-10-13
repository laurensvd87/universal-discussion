import { Worker } from "node:worker_threads";
import { types } from "node:util";
import { createIngestionWorkerQueue } from "./ingestion-worker-queue.js";
import { ServiceError, fail } from "../domain/errors.js";
import { frozenClone, readExpectedVersion, readId, readRecord } from "../domain/validation.js";

export const CANONICAL_READ_METHODS = Object.freeze(["catalogContext", "alternateDiscussion", "priorDiscussions", "related",
  "catalog", "catalogPage", "discussion", "discussionPage", "exactSource", "enrichment"]);
const fixedError = code => new ServiceError(code, code === "conflict" ? "State changed" : "Public read unavailable");

export function canonicalReadInput(method, input, version) {
  if (!CANONICAL_READ_METHODS.includes(method)) fail("invalid", "Invalid request");
  const expected = readExpectedVersion(version);
  let visited = 0;
  function plain(value, depth = 0) {
    if (++visited > 8192 || depth > 16) fail("invalid", "Invalid request");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") { if (value.length > 65536) fail("invalid", "Invalid request"); return value; }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object" || types.isProxy(value) ||
        ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value)))
      fail("invalid", "Invalid request");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Reflect.ownKeys(descriptors);
    if (names.some(name => typeof name !== "string" || (name !== "length" || !Array.isArray(value)) &&
        (!descriptors[name].enumerable || !Object.hasOwn(descriptors[name], "value")))) fail("invalid", "Invalid request");
    if (Array.isArray(value)) {
      if (names.length !== value.length + 1) fail("invalid", "Invalid request");
      return Array.from({ length: value.length }, (_, index) => {
        if (!Object.hasOwn(descriptors, index)) fail("invalid", "Invalid request");
        return plain(descriptors[index].value, depth + 1);
      });
    }
    return Object.fromEntries(names.sort().map(name => [name, plain(descriptors[name].value, depth + 1)]));
  }
  let value = plain(input);
  if (method === "catalog") { if (value !== null) fail("invalid", "Invalid request"); }
  else if (["alternateDiscussion", "priorDiscussions", "discussion", "exactSource"].includes(method)) value = readId(value);
  else if (method === "enrichment") {
    const record = readRecord(value, ["sourceId", "topicId", "includeAlternate"]);
    if (typeof record.includeAlternate !== "boolean") fail("invalid", "Invalid request");
    value = { sourceId: readId(record.sourceId), topicId: readId(record.topicId), includeAlternate: record.includeAlternate };
  } else if (method === "catalogContext") {
    const record = readRecord(value, ["sourceId", "topicId"]);
    value = { sourceId: record.sourceId === null ? null : readId(record.sourceId), topicId: record.topicId === null ? null : readId(record.topicId) };
  } else if (method === "related") {
    const record = readRecord(value, ["sourceId", "limit"]);
    if (!Number.isInteger(record.limit) || record.limit < 0 || record.limit > 100) fail("invalid", "Invalid request");
    value = { sourceId: readId(record.sourceId), limit: record.limit };
  }
  const task = { method, input: value, version: expected };
  if (Buffer.byteLength(JSON.stringify(task), "utf8") > 65536) fail("capacity", "Public read capacity reached");
  return task;
}

export function createCanonicalReadQueue({ databasePath, alternateAdapter = null, alternateBodyMetric = null,
  alternateRidgeAdapter = null, maxTasks = 32, maxWaiters = 4096, maxInputBytes = 8 * 1024 * 1024,
  timeoutMs = 15000, maxCommits = 8, allowedMethods = CANONICAL_READ_METHODS,
  workerFactory = () => new Worker(new URL("./canonical-read-worker.js", import.meta.url), {
    workerData: { databasePath, alternateAdapter, alternateBodyMetric, alternateRidgeAdapter, allowedMethods },
    execArgv: process.execArgv.filter(argument => !argument.startsWith("--test")),
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
  }) } = {}) {
  if (!Array.isArray(allowedMethods) || !allowedMethods.length || new Set(allowedMethods).size !== allowedMethods.length ||
      allowedMethods.some(method => !CANONICAL_READ_METHODS.includes(method))) throw new TypeError("Invalid public read methods");
  const permittedMethods = Object.freeze([...allowedMethods]);
  if (!Number.isSafeInteger(maxWaiters) || maxWaiters < 1 || maxWaiters > 4096 ||
      !Number.isSafeInteger(maxInputBytes) || maxInputBytes < 65536 || maxInputBytes > 8 * 1024 * 1024 ||
      !Number.isSafeInteger(maxCommits) || maxCommits < 1 || maxCommits > 8)
    throw new TypeError("Invalid public read capacity");
  const retiringWorkers = new Set();
  let retirementFailed = false;
  const executor = createIngestionWorkerQueue({ databasePath, maxPending: maxTasks, timeoutMs, workerFactory() {
    const worker = workerFactory(), terminate = worker.terminate.bind(worker);
    worker.terminate = () => {
      const retirement = Promise.resolve().then(terminate);
      retiringWorkers.add(retirement);
      retirement.then(() => retiringWorkers.delete(retirement), () => { retirementFailed = true; retiringWorkers.delete(retirement); });
      return retirement;
    };
    return worker;
  } });
  const jobs = new Map();
  const commits = [];
  let waiterCount = 0, inputBytes = 0, closed = false, closing;
  let activeCommit = null, paused = false, pumping = false, yieldingAdmissions = false;
  function settleCommit(job, error, value) {
    if (job.settled) return;
    job.settled = true; clearTimeout(job.timer); job.signal?.removeEventListener("abort", job.abort);
    if (activeCommit === job) {
      activeCommit = null; paused = false;
      // A new revision's read admissions get an event-loop turn between commits.
      yieldingAdmissions = true;
      setImmediate(() => { yieldingAdmissions = false; startCommit(); });
    } else {
      const index = commits.indexOf(job); if (index !== -1) commits.splice(index, 1);
    }
    if (error) job.reject(error); else job.resolve(value);
  }
  function startCommit() {
    if (closed || activeCommit || yieldingAdmissions || !commits.length) return;
    activeCommit = commits.shift(); paused = true; pumpCommit();
  }
  function pumpCommit() {
    if (closed || pumping || !activeCommit || jobs.size) return;
    const job = activeCommit;
    pumping = true;
    void (async () => {
      try {
        // Cancellation schedules executor retirement in a Promise continuation.
        // Observe that retirement before deciding the drained batch is gone.
        await Promise.resolve();
        await Promise.all([...retiringWorkers]);
        // Resolving read waiters starts several Promise continuations through
        // service, HTTP authority checks and encoding. Let all those complete.
        await new Promise(resolve => setImmediate(resolve));
        if (closed || activeCommit !== job || jobs.size) return;
        if (retirementFailed) { settleCommit(job, fixedError("unavailable")); return; }
        if (job.signal?.aborted || performance.now() >= job.expiresAt) { settleCommit(job, fixedError("unavailable")); return; }
        if (job.isCurrent && !job.isCurrent()) { settleCommit(job, fixedError("unavailable")); return; }
        if (activeCommit !== job || closed || job.signal?.aborted || performance.now() >= job.expiresAt) {
          settleCommit(job, fixedError("unavailable")); return;
        }
        // Trusted caller supplies synchronous, already planned repository work.
        // There is no database transaction, rebase or retry during the wait.
        settleCommit(job, null, job.work());
      } catch (error) { if (activeCommit === job) settleCommit(job, retirementFailed ? fixedError("unavailable") : error); }
      finally { pumping = false; pumpCommit(); }
    })();
  }
  function finish(job, error, result) {
    if (jobs.get(job.key) === job) { jobs.delete(job.key); inputBytes -= job.bytes; }
    for (const waiter of [...job.waiters]) {
      let current = true;
      try { current = !waiter.isCurrent || waiter.isCurrent(); } catch { current = false; }
      if (!error && (waiter.signal?.aborted || performance.now() >= waiter.expiresAt || !current))
        waiter.finish(fixedError("conflict"));
      else waiter.finish(error, result);
    }
    pumpCommit();
  }
  return Object.freeze({
    read(method, input, { version, signal, isCurrent } = {}) {
      let task;
      try { task = canonicalReadInput(method, input, version); } catch (error) { return Promise.reject(error); }
      if (!permittedMethods.includes(method)) return Promise.reject(fixedError("invalid"));
      if (closed || retirementFailed || signal?.aborted) return Promise.reject(fixedError("unavailable"));
      if (waiterCount >= maxWaiters) return Promise.reject(fixedError("capacity"));
      const key = JSON.stringify(task), bytes = Buffer.byteLength(key, "utf8");
      let job = jobs.get(key);
      if (!job) {
        if (paused) return Promise.reject(fixedError("capacity"));
        if (jobs.size >= maxTasks || inputBytes + bytes > maxInputBytes) return Promise.reject(fixedError("capacity"));
        job = { key, bytes, controller: new AbortController(), waiters: new Set() };
        jobs.set(key, job); inputBytes += bytes;
        executor.prepare(task, { signal: job.controller.signal }).then(result => {
          if (result?.error) { finish(job, fixedError(["conflict", "capacity", "not-found", "invalid", "forbidden"]
            .includes(result.error) ? result.error : "unavailable")); return; }
          if (!result || result.version?.generation !== task.version.generation || result.version?.revision !== task.version.revision) {
            finish(job, fixedError("unavailable")); return;
          }
          // Coalesced waiters share one immutable public DTO, never a mutable
          // object one caller could change before another caller serializes it.
          try {
            if (!result.value || typeof result.value !== "object" || Buffer.byteLength(JSON.stringify(result.value), "utf8") > 1_048_576)
              throw new Error("Invalid public read result");
            finish(job, null, frozenClone(result.value));
          } catch { finish(job, fixedError("unavailable")); }
        }, error => finish(job, fixedError(error?.code ?? "unavailable")));
      }
      return new Promise((resolve, reject) => {
        const waiter = { signal, isCurrent, expiresAt: performance.now() + timeoutMs };
        waiter.finish = (error, result) => {
          if (!job.waiters.delete(waiter)) return;
          waiterCount--; clearTimeout(waiter.timer); signal?.removeEventListener("abort", waiter.abort);
          if (error) reject(error); else resolve(result);
          if (!job.waiters.size) {
            if (jobs.get(job.key) === job) { jobs.delete(job.key); inputBytes -= job.bytes; }
            job.controller.abort();
            pumpCommit();
          }
        };
        waiter.abort = () => waiter.finish(fixedError("unavailable"));
        waiter.timer = setTimeout(waiter.abort, timeoutMs);
        signal?.addEventListener("abort", waiter.abort, { once: true });
        job.waiters.add(waiter); waiterCount++;
      });
    },
    withCommit(work, { signal, isCurrent } = {}) {
      if (typeof work !== "function") return Promise.reject(fixedError("invalid"));
      if (closed || retirementFailed || signal?.aborted) return Promise.reject(fixedError("unavailable"));
      if (commits.length + Number(Boolean(activeCommit)) >= maxCommits) return Promise.reject(fixedError("capacity"));
      return new Promise((resolve, reject) => {
        const budgetMs = Math.min(timeoutMs, 15000);
        const job = { work, signal, isCurrent, resolve, reject, expiresAt: performance.now() + budgetMs, settled: false };
        job.abort = () => settleCommit(job, fixedError("unavailable"));
        job.timer = setTimeout(job.abort, budgetMs);
        signal?.addEventListener("abort", job.abort, { once: true });
        commits.push(job); startCommit();
      });
    },
    close() {
      if (closing) return closing;
      closed = true;
      for (const job of [activeCommit, ...commits].filter(Boolean)) settleCommit(job, fixedError("unavailable"));
      for (const job of [...jobs.values()]) finish(job, fixedError("unavailable"));
      closing = executor.close(); return closing;
    },
  });
}
