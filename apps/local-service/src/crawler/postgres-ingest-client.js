import { randomUUID } from "node:crypto";
import { readLearnedIngest } from "../domain/learned-sources.js";
import { operationDigestFor } from "../domain/source-threads.js";
import { readIngestionOutcome } from "../../../../spikes/topic-resolution/browser/core/local-service-contract.js";
import { CrawlerApiError } from "./local-ingest-client.js";

const TERMINAL = new Set(["complete", "failed", "cancelled"]);
const LIVE = new Set(["pending", "leased"]);
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const TERMINAL_CODE = /^[a-z0-9-]{1,64}$/u;
const READ_RETRYABLE = new Set(["conflict", "capacity", "unavailable", "ambiguous",
  "response-timeout", "service-error", "service-unavailable"]);
const READ_RETRY_DELAYS_MS = Object.freeze([2_000, 4_000, 8_000, 16_000]);

function abortableDelay(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(new CrawlerApiError("aborted"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(done, milliseconds);
    function done() {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new CrawlerApiError("aborted"));
    }
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function fixedError(error) {
  if (error instanceof CrawlerApiError) return error;
  const code = error && typeof error === "object" ? error.code : null;
  return new CrawlerApiError({
    aborted: "aborted",
    invalid: "invalid-request",
    "invalid-request": "invalid-request",
    "invalid-response": "invalid-response",
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    conflict: "conflict",
    capacity: "capacity",
    unavailable: "unavailable",
    "not-found": "unavailable",
    "storage-corrupt": "service-error",
    "storage-failure": "service-unavailable",
  }[code] ?? "service-unavailable");
}

function terminalError(status) {
  const codes = new Set(["authority-expired", "authority-revoked", "lease-exhausted", "source-changed",
    "representation-failed", "worker-failed", "lifecycle-forgotten", "lifecycle-changed"]);
  return new CrawlerApiError(status.state === "failed" ? "service-error" : "unavailable",
    `status-${status.state}:${codes.has(status.terminalCode) ? status.terminalCode : "unknown"}`);
}

function preparedInput(representation, operationId, expected) {
  try {
    const submitted = structuredClone({ ...representation, operationId, expected });
    const norm = Math.hypot(...(submitted?.embedding?.values ?? []));
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) throw new TypeError();
    // Preserve the accepted browser coordinates for the repository. Both sides
    // independently normalize this same immutable snapshot exactly once: using
    // the normalized result as the submission would rewrite binary64 values and
    // therefore change the operation digest at the durable boundary.
    return { input: readLearnedIngest(submitted), submitted };
  } catch { throw new TypeError("Invalid crawler ingestion"); }
}

function exactRecord(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      ![...LIVE, ...TERMINAL].includes(value.state)) throw new CrawlerApiError("invalid-response");
  const keys = LIVE.has(value.state) ? ["state"] : value.state === "complete" ? ["state", "result"] : ["state", "terminalCode"];
  if (!exactRecord(value, keys) || !LIVE.has(value.state) && value.state !== "complete" && !TERMINAL_CODE.test(value.terminalCode))
    throw new CrawlerApiError("invalid-response");
  return value;
}

function validEnqueue(value, operationId, operationDigest, authorityToken) {
  const keys = ["operationId", "operationDigest", "jobClass", "state", "ordinal", "attempts", "replayed", "sourceId", "authorityToken"];
  if (!exactRecord(value, keys) || value.operationId !== operationId || value.operationDigest !== operationDigest ||
      !DIGEST.test(value.operationDigest) || value.jobClass !== "crawler" || ![...LIVE, ...TERMINAL].includes(value.state) ||
      value.ordinal !== null && (!Number.isSafeInteger(value.ordinal) || value.ordinal < 0) ||
      !Number.isSafeInteger(value.attempts) || value.attempts < 0 || typeof value.replayed !== "boolean" ||
      value.sourceId !== null && (typeof value.sourceId !== "string" || !ID.test(value.sourceId)) ||
      (LIVE.has(value.state) ? value.authorityToken !== authorityToken : value.authorityToken !== null))
    throw new CrawlerApiError("invalid-response");
  return value;
}

function completed(status, expected) {
  let result;
  try { result = readIngestionOutcome(status.result); }
  catch { throw new CrawlerApiError("invalid-response"); }
  if (result.version.generation !== expected.generation || result.version.revision < expected.revision)
    throw new CrawlerApiError("invalid-response");
  return result;
}

// Canonical catalogue reads remain on the paired loopback API. Canonical writes
// use only the separately credentialed crawler-submitter database role, so a
// crawler cannot consume the interactive admission reserve or perform table DML.
export function createPostgresCrawlerClient({ readClient, ingestionRepository,
  timeoutMs = 30_000, pollIntervalMs = 100, authoritySeconds = 30,
  now = Date.now, sleep = abortableDelay, nextAuthorityToken = randomUUID } = {}) {
  if (!readClient || typeof readClient.version !== "function" || typeof readClient.knownSourceUrls !== "function" ||
      !ingestionRepository || typeof ingestionRepository.enqueueCrawler !== "function" ||
      typeof ingestionRepository.status !== "function" || typeof ingestionRepository.renewAuthority !== "function" ||
      typeof ingestionRepository.revokeAuthority !== "function" || !Number.isInteger(timeoutMs) ||
      timeoutMs < 1_000 || timeoutMs > 60_000 || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 10 ||
      pollIntervalMs > 5_000 || !Number.isInteger(authoritySeconds) || authoritySeconds < 1 || authoritySeconds > 30 ||
      typeof now !== "function" || typeof sleep !== "function" || typeof nextAuthorityToken !== "function")
    throw new TypeError("Invalid PostgreSQL crawler dependencies");

  async function resilientRead(read, options) {
    const signal = options?.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("Invalid crawler cancellation");
    let retry = 0;
    for (;;) {
      if (signal?.aborted) throw new CrawlerApiError("aborted");
      try { return await read(options); }
      catch (error) {
        if (signal?.aborted || error?.code === "aborted") throw new CrawlerApiError("aborted");
        const fixed = fixedError(error);
        if (!READ_RETRYABLE.has(fixed.code)) throw fixed;
        const delay = READ_RETRY_DELAYS_MS[Math.min(retry, READ_RETRY_DELAYS_MS.length - 1)];
        retry += 1;
        try { Promise.resolve(options?.onProgress?.(Object.freeze({ event: "read-retry",
          code: fixed.code, retry, delayMs: delay }))).catch(() => {}); } catch {}
        try { await sleep(delay, signal); }
        catch (sleepError) {
          if (signal?.aborted || sleepError?.code === "aborted") throw new CrawlerApiError("aborted");
          throw fixedError(sleepError);
        }
      }
    }
  }

  const version = (options = {}) => resilientRead(value => readClient.version(value), options);

  const knownSourceUrls = (options = {}) => resilientRead(value => readClient.knownSourceUrls(value), options);

  async function statusFor(operationId, operationDigest) {
    try { return validStatus(await ingestionRepository.status({ operationId, operationDigest })); }
    catch (error) { if (error?.code === "not-found") throw new CrawlerApiError("unavailable", "status-missing");
      throw new CrawlerApiError(fixedError(error).code, "status-read-failed"); }
  }

  async function revoke(operationId, operationDigest, authorityToken) {
    try { return { revoked: await ingestionRepository.revokeAuthority({ operationId, operationDigest, authorityToken }), uncertain: false }; }
    catch { return { revoked: null, uncertain: true }; /* The durable receipt remains authoritative. */ }
  }

  async function ingest(representation, operationId, initialVersion, { signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("Invalid crawler cancellation");
    if (signal?.aborted) throw new CrawlerApiError("aborted");
    let prepared = preparedInput(representation, operationId, initialVersion);
    const stableRepresentation = prepared.submitted;
    const generation = prepared.input.expected.generation;
    const operationDigest = operationDigestFor(prepared.input);
    const authorityToken = nextAuthorityToken();
    if (typeof authorityToken !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(authorityToken))
      throw new TypeError("Invalid PostgreSQL crawler authority");
    let authorityAttempted = false;
    let uncertainRenewalFailure = null;
    // A worker can complete between the live-status read and renewal. Resolve
    // that exact durable operation once; never reenqueue or revive its lease.
    async function completionAfterRenewalFailure(failure) {
      if (signal?.aborted) throw new CrawlerApiError("aborted");
      let status;
      try { status = await statusFor(operationId, operationDigest); }
      catch {
        if (signal?.aborted) throw new CrawlerApiError("aborted");
        throw failure;
      }
      if (signal?.aborted) throw new CrawlerApiError("aborted");
      if (status.state === "complete") return completed(status, prepared.input.expected);
      if (status.state === "failed" || status.state === "cancelled") throw terminalError(status);
      throw failure;
    }
    try {
      let enqueue, ambiguousRetry = false;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (signal?.aborted) throw new CrawlerApiError("aborted");
        try {
          authorityAttempted = true;
          enqueue = validEnqueue(await ingestionRepository.enqueueCrawler(prepared.submitted,
            { authorityToken, authoritySeconds }),
            operationId, operationDigest, authorityToken);
          break;
        } catch (error) {
          if (signal?.aborted) throw new CrawlerApiError("aborted");
          if (error?.code === "storage-failure" && !ambiguousRetry) {
            ambiguousRetry = true;
            try {
              const existing = validStatus(await ingestionRepository.status({ operationId, operationDigest }));
              if (signal?.aborted) throw new CrawlerApiError("aborted");
              if (existing.state === "complete") return completed(existing, prepared.input.expected);
              if (LIVE.has(existing.state)) { enqueue = { state: existing.state }; break; }
              throw terminalError(existing);
            } catch (statusError) {
              if (statusError?.code !== "not-found") throw fixedError(statusError);
              continue;
            }
          }
          if (error?.code !== "conflict") throw fixedError(error);
          const next = await version({ signal });
          if (next.generation !== generation) throw new CrawlerApiError("conflict");
          prepared = preparedInput(stableRepresentation, operationId, next);
          ambiguousRetry = false;
        }
      }
      if (!enqueue) throw new CrawlerApiError("conflict");
      if (!LIVE.has(enqueue.state) && enqueue.state !== "complete")
        throw new CrawlerApiError(enqueue.state === "cancelled" ? "unavailable" : "service-error", `enqueue-${enqueue.state}`);

      const started = now();
      if (!Number.isSafeInteger(started) || started < 0) throw new TypeError("Invalid PostgreSQL crawler clock");
      const deadline = started + timeoutMs;
      let renewAt = started + Math.max(1_000, Math.floor(authoritySeconds * 500));
      for (;;) {
        if (signal?.aborted) throw new CrawlerApiError("aborted");
        const status = await statusFor(operationId, operationDigest);
        if (signal?.aborted) throw new CrawlerApiError("aborted");
        if (status.state === "complete") return completed(status, prepared.input.expected);
        if (status.state === "failed" || status.state === "cancelled") throw terminalError(status);
        const current = now();
        if (!Number.isSafeInteger(current) || current < started) throw new TypeError("Invalid PostgreSQL crawler clock");
        if (current >= deadline) throw new CrawlerApiError("response-timeout", `timeout-${status.state}`);
        if (current >= renewAt) {
          let renewed;
          try { renewed = await ingestionRepository.renewAuthority({ operationId, operationDigest,
            authorityToken, authoritySeconds }); }
          catch (error) {
            const failure = new CrawlerApiError(fixedError(error).code, "renewal-error");
            if (error?.code === "storage-failure") {
              uncertainRenewalFailure = failure;
              return await completionAfterRenewalFailure(failure);
            }
            throw failure;
          }
          if (renewed !== true) return await completionAfterRenewalFailure(new CrawlerApiError("unavailable", "renewal-rejected"));
          renewAt = current + Math.max(1_000, Math.floor(authoritySeconds * 500));
        }
        await sleep(Math.min(pollIntervalMs, deadline - current), signal);
      }
    } catch (error) {
      const revocation = authorityAttempted ? await revoke(operationId, operationDigest, authorityToken) : null;
      if (signal?.aborted) throw new CrawlerApiError("aborted");
      // A locked apply may commit after the first recovery read, while revoke
      // waits. Resolve only that privately branded ambiguous renewal failure.
      // A definite successful revoke cannot coexist with a later completion.
      if (uncertainRenewalFailure !== null && error === uncertainRenewalFailure &&
          (revocation?.revoked === false || revocation?.uncertain === true)) {
        try {
          const status = await statusFor(operationId, operationDigest);
          if (signal?.aborted) throw new CrawlerApiError("aborted");
          if (status.state === "complete") return completed(status, prepared.input.expected);
        } catch { /* Preserve the original failure unless an exact receipt proves completion. */ }
      }
      if (signal?.aborted) throw new CrawlerApiError("aborted");
      throw fixedError(error);
    }
  }

  return Object.freeze({ version, knownSourceUrls, ingest });
}
