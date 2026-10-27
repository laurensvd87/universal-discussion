import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const MAXIMUM_DURATION_MS = 86_400_000;

function wait(delayMs, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, delayMs);
    timer.unref?.();
    function done() { signal.removeEventListener("abort", done); clearTimeout(timer); resolve(); }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * One bounded trusted PostgreSQL ingestion worker. Database leases provide the
 * cross-process singleton; this loop owns no canonical table privileges.
 */
export function startPostgresIngestionWorkerLoop({ repository, referenceMatcher,
  prepareClaim = null,
  workerId = `local-worker-${randomUUID()}`, leaseSeconds = 30, idleDelayMs = 25,
  nextLeaseToken = () => `lease-${randomUUID()}`, onOutcome = () => {}, onProgress = () => {},
  monotonicNow = () => performance.now() } = {}) {
  if (!repository || typeof repository.claim !== "function" || typeof repository.apply !== "function" ||
      typeof repository.failClaim !== "function" || !referenceMatcher || typeof referenceMatcher.represent !== "function" ||
      typeof workerId !== "string" || !workerId || !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 30 ||
      !Number.isInteger(idleDelayMs) || idleDelayMs < 5 || idleDelayMs > 1000 || typeof nextLeaseToken !== "function" ||
      typeof onOutcome !== "function" || typeof onProgress !== "function" || typeof monotonicNow !== "function" ||
      prepareClaim !== null && typeof prepareClaim !== "function")
    throw new TypeError("Invalid PostgreSQL ingestion worker dependencies");
  const controller = new AbortController();
  let closed = false;
  let closing = null;
  let idle = false;
  const idleWaiters = new Set();

  function clock() {
    try { const value = monotonicNow(); return Number.isFinite(value) && value >= 0 ? value : null; }
    catch { return null; }
  }
  // Diagnostic durations describe awaited worker work, not SQL terminal_at
  // (which historical apply records stamp before their expensive matching).
  // Idle polls emit nothing. No operation/account/source/error data is exposed,
  // and a failing clock or observer cannot change queue/lease/write behavior.
  function progress(outcome, started, claimed, prepared = claimed, applied = prepared, finished = applied) {
    const stamps = [started, claimed, prepared, applied, finished];
    if (stamps.some((value, index) => value === null || index > 0 && value < stamps[index - 1])) return;
    let capped = 0;
    const duration = (begin, end) => {
      const milliseconds = Math.round(end - begin);
      if (milliseconds > MAXIMUM_DURATION_MS) capped = 1;
      return Math.min(MAXIMUM_DURATION_MS, milliseconds);
    };
    const values = { outcome, claimMs: duration(started, claimed), prepareMs: duration(claimed, prepared),
      applyMs: duration(prepared, applied), totalMs: duration(started, finished) };
    try { Promise.resolve(onProgress(Object.freeze({ ...values, capped }))).catch(() => {}); }
    catch { /* Optional diagnostics must never stop ingestion. */ }
  }

  function markBusy() { idle = false; }
  function markIdle() {
    idle = true;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }

  const running = (async () => {
    while (!controller.signal.aborted) {
      const started = clock();
      let claim;
      try {
        claim = await repository.claim({ workerId, leaseToken: nextLeaseToken(), leaseSeconds });
      } catch (error) {
        if (controller.signal.aborted) break;
        progress("claim-failed", started, clock());
        onOutcome(Object.freeze({ outcome: "claim-failed" }));
        await wait(idleDelayMs, controller.signal);
        continue;
      }
      const claimed = clock();
      if (claim === null) {
        markIdle();
        await wait(idleDelayMs, controller.signal);
        continue;
      }
      markBusy();
      let representedValues, preparation, prepared;
      try {
        // Installed encoders must be initialized before claiming. Await bounded
        // per-claim preparation, then retain the same abort/SQL lease fences.
        representedValues = await referenceMatcher.represent(claim.input);
        if (!controller.signal.aborted && prepareClaim !== null) preparation = await prepareClaim(claim);
        prepared = clock();
      } catch (error) {
        prepared = clock();
        // A deterministic pinned-transform rejection cannot become valid on a
        // later lease. Everything after this boundary may be an ambiguous
        // storage result and must remain reclaimable.
        if (!controller.signal.aborted && error instanceof TypeError) {
          let terminal = false;
          try { terminal = await repository.failClaim(claim, { code: "representation-failed" }) === true; }
          catch { /* The lease or failure write may already be uncertain. */ }
          progress(terminal ? "representation-failed" : "representation-uncertain", started, claimed, prepared, prepared, clock());
          onOutcome(Object.freeze({ outcome: terminal ? "representation-failed" : "representation-uncertain",
            operationId: claim.operationId }));
        } else {
          progress("representation-uncertain", started, claimed, prepared);
          onOutcome(Object.freeze({ outcome: "representation-uncertain", operationId: claim.operationId }));
        }
        if (!controller.signal.aborted) await wait(idleDelayMs, controller.signal);
        continue;
      }
      if (controller.signal.aborted) { progress("aborted", started, claimed, prepared); break; }
      try {
        const result = await repository.apply(claim, { representedValues,
          ...(prepareClaim === null ? {} : { preparation }) });
        progress("completed", started, claimed, prepared, clock());
        onOutcome(Object.freeze({ outcome: "completed", operationId: claim.operationId, version: result.version }));
      } catch (error) {
        // apply may have committed before the transport failed. Never convert
        // an uncertain result into a terminal failure; receipt replay or lease
        // expiry resolves it without losing accepted work.
        progress("apply-uncertain", started, claimed, prepared, clock());
        onOutcome(Object.freeze({ outcome: "apply-uncertain", operationId: claim.operationId }));
        if (!controller.signal.aborted) await wait(idleDelayMs, controller.signal);
      }
    }
    markIdle();
  })();

  return Object.freeze({
    async close() {
      if (closing === null) {
        closed = true; controller.abort(); closing = running;
      }
      await closing;
    },
    whenIdle() {
      if (idle || closed) return Promise.resolve();
      return new Promise(resolve => idleWaiters.add(resolve));
    },
  });
}
