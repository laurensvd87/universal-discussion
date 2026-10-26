import { randomUUID } from "node:crypto";
import { ServiceError, fail } from "../domain/errors.js";
import { readLearnedIngest } from "../domain/learned-sources.js";
import { operationDigestFor } from "../domain/source-threads.js";

const LIVE = new Set(["pending", "leased"]);

function delay(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, milliseconds);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(timer); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Browser submissions use only the app role's interactive admission function.
 * The worker role owns claim/apply separately; this adapter merely keeps the
 * request's revocable authority alive until an exact durable receipt exists.
 */
export function createPostgresInteractiveIngestion({ repository,
  timeoutMs = 29_000, pollIntervalMs = 25, authoritySeconds = 30,
  now = Date.now, sleep = delay, nextAuthorityToken = randomUUID } = {}) {
  if (!repository || typeof repository.enqueueInteractive !== "function" ||
      typeof repository.status !== "function" || typeof repository.receipt !== "function" ||
      typeof repository.renewAuthority !== "function" || typeof repository.revokeAuthority !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 29_000 ||
      !Number.isInteger(pollIntervalMs) || pollIntervalMs < 5 || pollIntervalMs > 1_000 ||
      !Number.isInteger(authoritySeconds) || authoritySeconds < 1 || authoritySeconds > 30 ||
      typeof now !== "function" || typeof sleep !== "function" || typeof nextAuthorityToken !== "function")
    throw new TypeError("Invalid PostgreSQL interactive ingestion dependencies");

  function current(guards) {
    if (guards.signal?.aborted) fail("unavailable", "Ingestion unavailable");
    if (typeof guards.isCurrent === "function") {
      let valid = false;
      try { valid = guards.isCurrent() === true; } catch { /* fixed denial below */ }
      if (!valid) fail("unavailable", "Ingestion unavailable");
    }
  }

  async function terminal(repositoryStatus, operationId, operationDigest) {
    if (repositoryStatus.state === "complete")
      return repository.receipt({ operationId, operationDigest });
    if (repositoryStatus.state === "failed") {
      if (repositoryStatus.terminalCode === "source-changed") fail("conflict", "State changed");
      fail("unavailable", "Ingestion unavailable");
    }
    if (repositoryStatus.state === "cancelled") fail("unavailable", "Ingestion unavailable");
    return null;
  }

  return Object.freeze({
    async ingest(value, guards = {}) {
      // Keep a private copy of the pre-normalized representation. The adapter
      // validates and hashes a normalized view, while the repository must
      // normalize the original coordinates once for the same durable digest.
      // Passing `input` here would normalize near-unit binary64 values twice.
      let submitted;
      try { submitted = structuredClone(value); }
      catch { fail("invalid", "Invalid ingestion request"); }
      const input = readLearnedIngest(submitted);
      if (guards === null || typeof guards !== "object" || Array.isArray(guards) ||
          guards.signal !== undefined && !(guards.signal instanceof AbortSignal) ||
          guards.isCurrent !== undefined && typeof guards.isCurrent !== "function")
        throw new TypeError("Invalid PostgreSQL ingestion guards");
      current(guards);
      const operationId = input.operationId, operationDigest = operationDigestFor(input);
      const authorityToken = nextAuthorityToken();
      if (typeof authorityToken !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(authorityToken))
        throw new TypeError("Invalid PostgreSQL ingestion authority");
      let admitted = false, completed = false;
      try {
        let state = null, ambiguous = null;
        for (let attempt = 0; attempt < 2 && state === null; attempt += 1) {
          current(guards);
          try {
            const result = await repository.enqueueInteractive(submitted, { authorityToken, authoritySeconds });
            admitted = true; state = result.state;
          } catch (error) {
            if (!(error instanceof ServiceError) || error.code !== "storage-failure") throw error;
            ambiguous = error;
            try {
              const observed = await repository.status({ operationId, operationDigest });
              admitted = true; state = observed.state;
              const resolved = await terminal(observed, operationId, operationDigest);
              if (resolved !== null) { completed = true; return resolved; }
            } catch (statusError) {
              if (!(statusError instanceof ServiceError) || statusError.code !== "not-found") throw statusError;
              if (attempt === 1) throw ambiguous;
            }
          }
        }
        if (state === null) throw ambiguous ?? new ServiceError("unavailable", "Ingestion unavailable");
        if (!LIVE.has(state)) {
          const observed = await repository.status({ operationId, operationDigest });
          const resolved = await terminal(observed, operationId, operationDigest);
          if (resolved !== null) { completed = true; return resolved; }
          fail("unavailable", "Ingestion unavailable");
        }

        const started = now();
        if (!Number.isSafeInteger(started) || started < 0) throw new TypeError("Invalid PostgreSQL ingestion clock");
        const deadline = started + timeoutMs;
        let renewAt = started + Math.max(1_000, Math.floor(authoritySeconds * 500));
        for (;;) {
          current(guards);
          let observed;
          try { observed = await repository.status({ operationId, operationDigest }); }
          catch (error) {
            if (!(error instanceof ServiceError) || error.code !== "storage-failure") throw error;
          }
          if (observed) {
            const resolved = await terminal(observed, operationId, operationDigest);
            if (resolved !== null) { completed = true; return resolved; }
          }
          const timestamp = now();
          if (!Number.isSafeInteger(timestamp) || timestamp < started) throw new TypeError("Invalid PostgreSQL ingestion clock");
          if (timestamp >= deadline) fail("unavailable", "Ingestion unavailable");
          if (timestamp >= renewAt) {
            let renewed = false;
            try { renewed = await repository.renewAuthority({ operationId, operationDigest,
              authorityToken, authoritySeconds }); }
            catch (error) {
              if (!(error instanceof ServiceError) || error.code !== "storage-failure") throw error;
            }
            if (renewed) renewAt = timestamp + Math.max(1_000, Math.floor(authoritySeconds * 500));
          }
          await sleep(Math.min(pollIntervalMs, deadline - timestamp), guards.signal);
        }
      } finally {
        if (admitted && !completed) {
          try { await repository.revokeAuthority({ operationId, operationDigest, authorityToken }); }
          catch { /* Expiry or durable completion remains authoritative. */ }
        }
      }
    },
  });
}
