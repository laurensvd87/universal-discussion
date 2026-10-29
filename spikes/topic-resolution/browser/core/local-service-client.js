import { freeze, readActorId, readCatalog, readCommand, readConfirmation, readDiscussion, readHealth,
  readId, readLimit, readOutcome, readPairingToken, readRelated, readPriorDiscussions, readReset, readVersion,
  readIngestion, readIngestionOutcome, readAlternateDiscussion, isAccountActorId,
  readEnrichmentRequest, readEnrichment, readSemanticFeedRequest, readSemanticThreadRequest, readSemanticTargetRequest,
  readSemanticFeed, readSemanticThread, readSemanticTarget, readSemanticTopicsRequest, readSemanticContextRequest,
  readSemanticTopics, readSemanticContext, readSemanticCapabilities,readAuthorContextRequest,readAuthorContext } from "./local-service-contract.js";
import { LocalServiceSessionProxyError } from "./local-service-session.js";
import { readAccountAuthError } from "./account-auth-response.js";
import { readDiscovery, readPrivateResponse, readAccountPublicChatsRequest, readAccountPublicChatsResponse } from "./community-contract.js";
import { inspectPageNavigationUrl } from "./page-content-policy.js";
import { parseTopicSpaceQueryRequest, parseTopicSpacesResponse, parseTopicSpaceOwnerResponse,
  parseTopicSpacePolicyRequest } from "./topic-space-contract.js";
import {readCanonicalHistoryRequest,readCanonicalHistoryPage} from './canonical-history-contract.js';

const BASE = "http://127.0.0.1:4174/v1";
const MAX_REQUEST_BYTES = 65_536;
const MAX_RESPONSE_BYTES = 1_048_576;
const INGESTION_TIMEOUT_MS = 30_000;
const PROJECTION_TIMEOUT_MS = 30_000;
const encoder = new TextEncoder();
const confirmedIngestionConflicts = new WeakSet();
const confirmedIngestionRejections = new WeakSet();
const confirmedCommandRejections = new WeakSet();
const missingSemanticCapabilities = new WeakSet();
// Construction/code properties cannot manufacture evidence of a received response.
export function isConfirmedIngestionConflict(error) { return confirmedIngestionConflicts.has(error); }
export function isConfirmedIngestionRejection(error) { return confirmedIngestionRejections.has(error); }
export function isConfirmedCommandRejection(error) { return confirmedCommandRejections.has(error); }
export function isMissingSemanticCapabilities(error) { return missingSemanticCapabilities.has(error); }

export class LocalServiceClientError extends Error {
  constructor(code) { super("Local service request failed"); this.name = "LocalServiceClientError"; this.code = code; }
}
function fail(code) { throw new LocalServiceClientError(code); }
function input(project) { try { return project(); } catch { fail("invalid-request"); } }

// Only this adapter performs fetch; endpoint, methods and transport policy are fixed.
export function createLocalServiceClient({ fetchImpl, getToken, getAccountToken = () => null,
  onAccountUnauthorized = async () => {}, onUnauthorized = async () => {}, timeoutMs = 5000 }) {
  if (typeof fetchImpl !== "function" || typeof getToken !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError("Invalid local service client configuration");
  }
  async function request(path, body, actorId, project, signal, suppliedToken, beforeDispatch) {
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
      timer = setTimeout(cancel, path === "/sources/ingest" ? INGESTION_TIMEOUT_MS :
        path === "/sources/enrichment" || path === "/catalog/url-selection" ? PROJECTION_TIMEOUT_MS : timeoutMs);
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
      let accountToken;
      if (isAccountActorId(actorId)) {
        accountToken = await getAccountToken(actorId);
        if (controller.signal.aborted) fail("unavailable");
        if (accountToken !== null && accountToken !== undefined && !/^[A-Za-z0-9_-]{43}$/u.test(accountToken)) fail("authentication-required");
        if (isAccountActorId(actorId) && !accountToken) fail("authentication-required");
        if (accountToken) headers["X-Account-Session"] = accountToken;
      }
      if (actorId !== undefined && !isAccountActorId(actorId)) headers["X-Demo-Actor"] = actorId;
      if (beforeDispatch && !await beforeDispatch()) fail("conflict");
      if (controller.signal.aborted) fail("unavailable");
      response = await fetchImpl(url, { method: serialized === undefined ? "GET" : "POST", headers,
        ...(serialized === undefined ? {} : { body: serialized }), redirect: "error", credentials: "omit",
        cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
      if (controller.signal.aborted) { await response.body?.cancel?.().catch(() => {}); fail("unavailable"); }
      if (!response || response.redirected || (response.url && response.url !== url)) fail("invalid-response");
      if (response.status !== 200) {
        let confirmedRejection = null;
        let commandRejection=path==='/commands'?{400:'invalid-request',401:'unauthorized',403:'forbidden',404:'not-found',409:'conflict'}[response.status]:null;
        const missingCapabilities=path==='/semantic/capabilities'&&response.status===404;
        if ((path === "/sources/ingest" && [409, 413].includes(response.status) || commandRejection || missingCapabilities) &&
            /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers?.get("content-type") ?? "") &&
            response.body && typeof response.body.getReader === "function") {
          const length = response.headers?.get("content-length");
          if (length === null || length === undefined || (/^\d+$/u.test(length) && Number(length) <= 256)) {
            const reader = response.body.getReader();
            activeReader = reader;
            const chunks = []; let bytesRead = 0; let completed = false;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (controller.signal.aborted) fail("unavailable");
                if (done) { completed = true; break; }
                if (!(value instanceof Uint8Array) || (bytesRead += value.byteLength) > 256) break;
                chunks.push(value);
              }
              if (completed && bytesRead <= 256 && (length === null || length === undefined || Number(length) === bytesRead)) {
                const bytes = new Uint8Array(bytesRead); let offset = 0;
                for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
                // Exact canonical server bytes exclude duplicate keys, extra fields,
                // truncated streams, ambiguous envelopes and arbitrary 409 responses.
                const received = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                const expected = missingCapabilities?'{"error":"not-found"}':commandRejection?JSON.stringify({error:commandRejection}):response.status === 409 ? '{"error":"conflict"}' : '{"error":"capacity"}';
                if (received === expected && !controller.signal.aborted) confirmedRejection = response.status;
                else if(commandRejection && response.status===401 && received==='{"error":"authentication-required"}' && !controller.signal.aborted){
                  commandRejection='authentication-required';confirmedRejection=response.status;
                }
              }
            } catch { /* Unproven rejection remains a terminal generic conflict. */ }
            finally { await reader.cancel().catch(() => {}); reader.releaseLock(); activeReader = undefined; }
          }
        }
        const authError = response.status === 401 && accountToken ?
          commandRejection && confirmedRejection ? commandRejection : await readAccountAuthError(response, controller.signal) : null;
        await response.body?.cancel?.().catch(() => {});
        if (response.status === 401 && accountToken && authError !== "unauthorized") {
          try { await onAccountUnauthorized(accountToken); } catch { /* rejection remains signed out */ }
          if(commandRejection && confirmedRejection && !controller.signal.aborted){const error=new LocalServiceClientError('authentication-required');confirmedCommandRejections.add(error);throw error;}
          fail("authentication-required");
        }
        if (response.status === 401 && !controller.signal.aborted && suppliedToken === undefined) {
          try { await onUnauthorized(token); } catch { /* A failed clear cannot turn rejection into success. */ }
        }
        const code = { 400: "invalid-request", 401: "unauthorized", 409: "conflict", 413: "capacity" }[response.status] ?? "unavailable";
        if (confirmedRejection && !controller.signal.aborted) {
          const error = new LocalServiceClientError(commandRejection ?? code);
          if(missingCapabilities)missingSemanticCapabilities.add(error);
          else if(commandRejection)confirmedCommandRejections.add(error);
          else {confirmedIngestionRejections.add(error);
            if (confirmedRejection === 409) confirmedIngestionConflicts.add(error);}
          throw error;
        }
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
    semanticCapabilities({ signal, beforeDispatch } = {}) {
      return request("/semantic/capabilities", {}, undefined, readSemanticCapabilities, signal, undefined, beforeDispatch);
    },
    semanticTopics(value = {}, { signal, beforeDispatch } = {}) {
      const body = input(() => readSemanticTopicsRequest(value));
      return request("/semantic/topics", body, undefined, readSemanticTopics, signal, undefined, beforeDispatch);
    },
    semanticContext(value, { signal, beforeDispatch } = {}) {
      const body = input(() => readSemanticContextRequest(value));
      return request("/semantic/context", body, undefined, value => readSemanticContext(value, body), signal, undefined, beforeDispatch);
    },
    authorContext(value,{signal,beforeDispatch}={}){
      const body=readAuthorContextRequest(value);
      return request('/semantic/editor',body,undefined,result=>readAuthorContext(result,body),signal,undefined,beforeDispatch);
    },
    semanticFeed(value, { signal, beforeDispatch } = {}) {
      const body = input(() => readSemanticFeedRequest(value));
      return request("/semantic/feed", body, undefined, value => readSemanticFeed(value, body), signal, undefined, beforeDispatch);
    },
    semanticThread(value, { signal, beforeDispatch } = {}) {
      const body = input(() => readSemanticThreadRequest(value));
      return request("/semantic/thread", body, undefined, value => readSemanticThread(value, body), signal, undefined, beforeDispatch);
    },
    semanticTarget(value, { signal, beforeDispatch } = {}) {
      const body = input(() => readSemanticTargetRequest(value));
      return request("/semantic/target", body, undefined, value => readSemanticTarget(value, body), signal, undefined, beforeDispatch);
    },
    topicSpaces(value, { signal } = {}) {
      const payload = input(() => parseTopicSpaceQueryRequest(value));
      return request("/topic-spaces/query", payload, undefined, parseTopicSpacesResponse, signal);
    },
    topicSpaceOwner(actorId, { signal, beforeDispatch } = {}) {
      if (!isAccountActorId(actorId)) fail("authentication-required");
      return request("/topic-spaces/owner", {}, actorId, parseTopicSpaceOwnerResponse, signal, undefined, beforeDispatch);
    },
    updateTopicSpacePolicy(value, actorId, { signal, beforeDispatch } = {}) {
      if (!isAccountActorId(actorId)) fail("authentication-required");
      const payload = input(() => parseTopicSpacePolicyRequest(value));
      return request("/topic-spaces/policy", payload, actorId, parseTopicSpaceOwnerResponse, signal, undefined, beforeDispatch);
    },
    discover: (value, { signal, beforeDispatch } = {}) => request("/discover/search", value, undefined, readDiscovery, signal, undefined, beforeDispatch),
    async canonicalDiscussionPage(value, {signal,beforeDispatch} = {}) {
      const body=input(()=>readCanonicalHistoryRequest(value));
      return request('/discussions/page',body,undefined,response=>readCanonicalHistoryPage(response,body),signal,undefined,beforeDispatch);
    },
    privateConversation(action, value, actorId, { signal, beforeDispatch } = {}) {
      if (!["create", "list", "read", "send", "generate", "delete"].includes(action) || !isAccountActorId(actorId)) fail("invalid-request");
      return request(`/private/${action}`, value, actorId, readPrivateResponse, signal, undefined, beforeDispatch);
    },
    accountPublicChats(action, value, actorId, { signal, beforeDispatch } = {}) {
      if (!isAccountActorId(actorId)) fail("invalid-request");
      const payload = input(() => readAccountPublicChatsRequest(action, value));
      return request(`/account/public-chats/${action}`, payload, actorId,
        response => readAccountPublicChatsResponse(action, response, payload.rootId), signal, undefined, beforeDispatch);
    },
    async health({ signal } = {}) { return request("/health", undefined, undefined, readHealth, signal); },
    async healthWithToken(token, { signal } = {}) { return request("/health", undefined, undefined, readHealth, signal, token); },
    async catalog({ signal } = {}) { return request("/catalog", undefined, undefined, readCatalog, signal); },
    async version({ signal } = {}) {
      return request("/version", undefined, undefined, (value) => {
        if (!value || Object.keys(value).length !== 1 || !Object.hasOwn(value, "version")) throw new TypeError("Invalid version response");
        return { version: readVersion(value.version) };
      }, signal);
    },
    async catalogContext(value = { sourceId: null, topicId: null }, { signal } = {}) {
      const body = input(() => {
        if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
            Reflect.ownKeys(value).length !== 2 || !Object.hasOwn(value, "sourceId") || !Object.hasOwn(value, "topicId")) throw new TypeError("Invalid context");
        const descriptors = Object.getOwnPropertyDescriptors(value);
        if (!["sourceId", "topicId"].every(key => descriptors[key].enumerable && Object.hasOwn(descriptors[key], "value"))) throw new TypeError("Invalid context");
        return { sourceId: value.sourceId === null ? null : readId(value.sourceId),
          topicId: value.topicId === null ? null : readId(value.topicId) };
      });
      return request("/catalog/context", body, undefined, (value) => {
        const catalog = readCatalog(value);
        const source = catalog.sources.find(entry => entry.id === body.sourceId);
        if ((body.sourceId !== null && !source) ||
            (body.topicId !== null && !catalog.topics.some(entry => entry.id === body.topicId)) ||
            (body.sourceId !== null && body.topicId !== null && source.topicId !== body.topicId)) throw new TypeError("Invalid context projection");
        return catalog;
      }, signal);
    },
    async selection(value, { signal } = {}) {
      const body = input(() => {
        if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
            Reflect.ownKeys(value).length !== 2 || !Object.hasOwn(value, "sourceId") || !Object.hasOwn(value, "topicId")) throw new TypeError("Invalid selection");
        const descriptors = Object.getOwnPropertyDescriptors(value);
        if (!["sourceId", "topicId"].every(key => descriptors[key].enumerable && Object.hasOwn(descriptors[key], "value"))) throw new TypeError("Invalid selection");
        return { sourceId: value.sourceId === null ? null : readId(value.sourceId), topicId: readId(value.topicId) };
      });
      return request("/catalog/selection", body, undefined, (value) => {
        if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
            Object.keys(value).sort().join() !== "catalog,discussion") throw new TypeError("Invalid selection response");
        const catalog = readCatalog(value.catalog);
        const discussion = readDiscussion(value.discussion, body.topicId);
        const source = body.sourceId === null ? null : catalog.sources.find(entry => entry.id === body.sourceId);
        if (catalog.version.generation !== discussion.version.generation ||
            catalog.version.revision !== discussion.version.revision ||
            !catalog.topics.some(entry => entry.id === body.topicId) ||
            (body.sourceId !== null && (!source || source.topicId !== body.topicId))) throw new TypeError("Invalid selection response");
        return { catalog, discussion };
      }, signal);
    },
    async urlSelection(value, { signal } = {}) {
      const body = input(() => {
        if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
            Reflect.ownKeys(value).length !== 1 || !Object.hasOwn(value, "url")) throw new TypeError("Invalid URL selection");
        const descriptor = Object.getOwnPropertyDescriptor(value, "url");
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Invalid URL selection");
        const inspected = inspectPageNavigationUrl(descriptor.value);
        if (!inspected.supported || inspected.url !== descriptor.value || inspected.documentUrl !== descriptor.value)
          throw new TypeError("Invalid URL selection");
        return { url: descriptor.value };
      });
      return request("/catalog/url-selection", body, undefined, (value) => {
        if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
            Object.keys(value).sort().join() !== "catalog,discussion") throw new TypeError("Invalid URL selection response");
        const catalog = readCatalog(value.catalog);
        const matches = catalog.sources.filter((source) => source.url === body.url &&
          source.provenance === "owner-local-page-embedding/v1");
        if (matches.length !== 1 || !matches[0].topicId) throw new TypeError("Invalid URL selection response");
        const discussion = readDiscussion(value.discussion, matches[0].topicId);
        if (catalog.version.generation !== discussion.version.generation ||
            catalog.version.revision !== discussion.version.revision ||
            !catalog.topics.some((topic) => topic.id === matches[0].topicId))
          throw new TypeError("Invalid URL selection response");
        return { catalog, discussion };
      }, signal);
    },
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
    async enrichment(value, { signal } = {}) {
      const body = input(() => readEnrichmentRequest(value));
      return request("/sources/enrichment", body, undefined, value => readEnrichment(value, body), signal);
    },
    async related(sourceId, limit = 5, { signal } = {}) {
      const body = input(() => ({ sourceId: readId(sourceId), limit: readLimit(limit) }));
      return request("/related", body, undefined, (value) => readRelated(value, body.limit), signal);
    },
    async priorDiscussions(sourceId, { signal } = {}) {
      const id = input(() => readId(sourceId));
      return request(`/sources/${encodeURIComponent(id)}/prior-discussions`, undefined, undefined,
        (value) => readPriorDiscussions(value, id), signal);
    },
    async discussion(topicId, { signal } = {}) {
      const id = input(() => readId(topicId));
      return request(`/topics/${encodeURIComponent(id)}/discussion`, undefined, undefined, (value) => readDiscussion(value, id), signal);
    },
    async alternateDiscussion(sourceId, catalog, canonicalDiscussion, { signal } = {}) {
      const id = input(() => readId(sourceId));
      return request(`/sources/${encodeURIComponent(id)}/alternate-discussion`, undefined, undefined,
        (value) => readAlternateDiscussion(value, id, catalog, canonicalDiscussion), signal);
    },
    async command(expected, command, actorId, { signal, beforeDispatch } = {}) {
      const body = input(() => ({ expected: readVersion(expected), command: readCommand(command) }));
      const actor = input(() => readActorId(actorId));
      return request("/commands", body, actor, (value) => {
        const outcome = readOutcome(value, body.command.type);
        const concurrentAppend = ["create-root", "reply", "share-insight", "share-insight-reply"]
          .includes(body.command.type);
        if (outcome.version.generation !== body.expected.generation ||
            (concurrentAppend ? outcome.version.revision <= body.expected.revision :
              outcome.version.revision !== body.expected.revision + 1)) {
          throw new TypeError("Invalid local service value");
        }
        return outcome;
      }, signal, undefined, beforeDispatch);
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
