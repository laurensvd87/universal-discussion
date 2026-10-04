import { freeze, readActorId, readCatalog, readCommand, readConfirmation, readDiscussion, readHealth,
  readId, readLimit, readOutcome, readPairingToken, readRelated, readReset, readVersion,
  readIngestion, readIngestionOutcome } from "./local-service-contract.js";
import { LocalServiceSessionProxyError } from "./local-service-session.js";

const BASE = "http://127.0.0.1:4174/v1";
const MAX_REQUEST_BYTES = 65_536;
const MAX_RESPONSE_BYTES = 1_048_576;
const encoder = new TextEncoder();

export class LocalServiceClientError extends Error {
  constructor(code) { super("Local service request failed"); this.name = "LocalServiceClientError"; this.code = code; }
}
function fail(code) { throw new LocalServiceClientError(code); }
function input(project) { try { return project(); } catch { fail("invalid-request"); } }

// Only this adapter performs fetch; endpoint, methods and transport policy are fixed.
export function createLocalServiceClient({ fetchImpl, getToken, onUnauthorized = async () => {}, timeoutMs = 5000 }) {
  if (typeof fetchImpl !== "function" || typeof getToken !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError("Invalid local service client configuration");
  }
  async function request(path, body, actorId, project, signal, suppliedToken) {
    const url = BASE + path;
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized !== undefined && encoder.encode(serialized).byteLength > MAX_REQUEST_BYTES) fail("invalid-request");
    const controller = new AbortController();
    let timer;
    let cancel;
    let activeReader;
    const interrupted = new Promise((_, reject) => {
      cancel = () => {
        controller.abort();
        activeReader?.cancel().catch(() => {});
        reject(new LocalServiceClientError("unavailable"));
      };
      timer = setTimeout(cancel, timeoutMs);
    });
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    let response;
    const operation = (async () => {
      let token;
      try { token = readPairingToken(suppliedToken ?? await getToken()); }
      catch (error) {
        if (error instanceof LocalServiceSessionProxyError) throw error;
        fail("unauthorized");
      }
      if (controller.signal.aborted) fail("unavailable");
      const headers = { Authorization: `Bearer ${token}` };
      if (serialized !== undefined) headers["Content-Type"] = "application/json";
      if (actorId !== undefined) headers["X-Demo-Actor"] = actorId;
      response = await fetchImpl(url, { method: serialized === undefined ? "GET" : "POST", headers,
        ...(serialized === undefined ? {} : { body: serialized }), redirect: "error", credentials: "omit",
        cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
      if (controller.signal.aborted) { await response.body?.cancel?.().catch(() => {}); fail("unavailable"); }
      if (!response || response.redirected || (response.url && response.url !== url)) fail("invalid-response");
      if (response.status !== 200) {
        await response.body?.cancel?.().catch(() => {});
        if (response.status === 401 && !controller.signal.aborted && suppliedToken === undefined) {
          try { await onUnauthorized(token); } catch { /* A failed clear cannot turn rejection into success. */ }
        }
        const code = { 400: "invalid-request", 401: "unauthorized", 409: "conflict", 413: "capacity" }[response.status] ?? "unavailable";
        fail(code);
      }
      const contentType = response.headers?.get("content-type") ?? "";
      const contentLength = response.headers?.get("content-length");
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType) ||
          (contentLength !== null && contentLength !== undefined && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES))) fail("invalid-response");
      if (!response.body || typeof response.body.getReader !== "function") fail("invalid-response");
      const reader = response.body.getReader();
      activeReader = reader;
      const chunks = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) fail("unavailable");
          if (done) break;
          if (!(value instanceof Uint8Array)) fail("invalid-response");
          length += value.byteLength;
          if (length > MAX_RESPONSE_BYTES) fail("invalid-response");
          chunks.push(value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); activeReader = undefined; }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { return freeze(project(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))); }
      catch { fail("invalid-response"); }
    })();
    try { return await Promise.race([operation, interrupted]); }
    catch (error) {
      controller.abort();
      if (error instanceof LocalServiceClientError || error instanceof LocalServiceSessionProxyError) throw error;
      fail("unavailable");
    }
    finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (controller.signal.aborted) response?.body?.cancel?.().catch(() => {});
    }
  }
  return Object.freeze({
    async health({ signal } = {}) { return request("/health", undefined, undefined, readHealth, signal); },
    async healthWithToken(token, { signal } = {}) { return request("/health", undefined, undefined, readHealth, signal, token); },
    async catalog({ signal } = {}) { return request("/catalog", undefined, undefined, readCatalog, signal); },
    async ingest(payload, { signal } = {}) {
      const body = input(() => readIngestion(payload));
      return request("/sources/ingest", body, undefined, (value) => {
        const outcome = readIngestionOutcome(value);
        if (outcome.version.generation !== body.expected.generation || outcome.version.revision < body.expected.revision) {
          throw new TypeError("Invalid local service value");
        }
        return outcome;
      }, signal);
    },
    async related(sourceId, limit = 5, { signal } = {}) {
      const body = input(() => ({ sourceId: readId(sourceId), limit: readLimit(limit) }));
      return request("/related", body, undefined, (value) => readRelated(value, body.limit), signal);
    },
    async discussion(topicId, { signal } = {}) {
      const id = input(() => readId(topicId));
      return request(`/topics/${encodeURIComponent(id)}/discussion`, undefined, undefined, (value) => readDiscussion(value, id), signal);
    },
    async command(expected, command, actorId, { signal } = {}) {
      const body = input(() => ({ expected: readVersion(expected), command: readCommand(command) }));
      const actor = input(() => readActorId(actorId));
      return request("/commands", body, actor, (value) => {
        const outcome = readOutcome(value, body.command.type);
        if (outcome.version.generation !== body.expected.generation || outcome.version.revision !== body.expected.revision + 1) {
          throw new TypeError("Invalid local service value");
        }
        return outcome;
      }, signal);
    },
    async reset(expected, confirmation, { signal } = {}) {
      const body = input(() => ({ expected: readVersion(expected), confirmation: readConfirmation(confirmation) }));
      return request("/demo/reset", body, undefined, (value) => {
        const outcome = readReset(value);
        if (outcome.version.generation === body.expected.generation || outcome.version.revision !== 0) {
          throw new TypeError("Invalid local service value");
        }
        return outcome;
      }, signal);
    },
  });
}
