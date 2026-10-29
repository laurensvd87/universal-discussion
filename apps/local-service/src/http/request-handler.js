import { timingSafeEqual } from "node:crypto";
import { ServiceError, fail } from "../domain/errors.js";
import { readRecord, readId } from "../domain/validation.js";
import { readLearnedIngest } from "../domain/learned-sources.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";
import { mapAccountError, routeAccountRequest } from "../accounts/account-routes.js";
import { isAccountActor } from "../accounts/account-principal.js";
import { inspectPageNavigationUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

export const MAX_BODY_BYTES = 65_536;
const ALLOWED_PREFLIGHT_HEADERS = new Set(["authorization", "content-type", "x-demo-actor"]);
const ACCOUNT_SESSION_READS = new Set(["/v1/account/me", "/v1/account/data", "/v1/account/private-data",
  "/v1/account/public-chats/list", "/v1/account/public-chats/read"]);

export function createRequestHandler({ service, config, ai = null, pairingVerifier = null, accounts = null,
  accountWrites = false, accountLifecycle = null, privateDiscussions = null, topicSpaces = null }) {
  // Coalesced immutable public reads share their encoding too. This weak identity
  // map cannot look up a request/version, retain a historical response on its own,
  // skip current authority fences, or cache private/provider/account DTOs.
  const publicReadEncodings = new WeakMap();
  return async function handle(request, transportContext = null) {
    let corsOrigin = null;
    try {
      const normalized = normalizeRequest(request);
      requireHost(normalized.headers, config.hostHeader);
      if (normalized.url.pathname === "/auth/callback" && ai) {
        if (normalized.method !== "GET" || normalized.body !== null || Object.hasOwn(normalized.headers, "origin") ||
            normalized.url.hash || normalized.url.search.length > 8_192) fail("invalid", "Invalid request");
        ai.callback(`http://${config.hostHeader}${normalized.url.pathname}${normalized.url.search}`);
        return callbackResponse(normalized.url.searchParams.has("error") && !normalized.url.searchParams.has("code"));
      }
      if (normalized.method === "OPTIONS") return preflight(normalized, config, accounts !== null, accountWrites);
      corsOrigin = requireOrigin(normalized.headers, config.origin);
      requireCapability(normalized.headers.authorization, config.capability, pairingVerifier);
      function requireDeliveryAuthority() {
        if (transportContext?.signal?.aborted || transportContext?.isCurrent && !transportContext.isCurrent() ||
            transportContext?.signal?.aborted) fail("unavailable", "Request unavailable");
        requireCapability(normalized.headers.authorization, config.capability, pairingVerifier);
        if (transportContext?.signal?.aborted) fail("unavailable", "Request unavailable");
      }
      if (accounts !== null && normalized.url.pathname.startsWith("/v1/account/")) {
        // Account credential handling requires the configured browser Origin;
        // privileged browser GET omissions use strict POST read equivalents.
        if (normalized.headers.origin !== config.origin) fail("origin", "Request unavailable");
        requireDeliveryAuthority();
        const currentAccountId = () => {
          const accountId = accounts.me(normalized.headers["x-account-session"])?.id;
          if (typeof accountId !== "string" || !accountId.length) fail("forbidden", "Account unavailable");
          return accountId;
        };
        // Account reads also work before username selection. Do not replace
        // this with named-posting principal authority or block renewal/logout.
        const expectedAccountId = ACCOUNT_SESSION_READS.has(normalized.url.pathname) ? currentAccountId() : null;
        const response = await (accountLifecycle && ["/v1/account/data", "/v1/account/delete", "/v1/account/private-data",
          "/v1/account/public-chats/list", "/v1/account/public-chats/read"].includes(normalized.url.pathname)
          ? accountLifecycle.route(normalized) : routeAccountRequest(normalized, accounts));
        requireDeliveryAuthority();
        if (expectedAccountId !== null && currentAccountId() !== expectedAccountId) fail("forbidden", "Account unavailable");
        return jsonResponse(response.status, response.value, corsOrigin);
      }
      if (normalized.url.pathname.startsWith("/v1/private/")) {
        if (!accountWrites || !accounts || !privateDiscussions) fail("not-found", "Object unavailable");
        if (normalized.headers.origin !== config.origin || Object.hasOwn(normalized.headers, "x-demo-actor")) fail("origin", "Request unavailable");
        if (normalized.method !== "POST") fail("method", "Method unavailable");
        requireDeliveryAuthority();
        const principal = accounts.resolvePrincipal(normalized.headers["x-account-session"]);
        const input = parseJsonBody(normalized);
        const action = normalized.url.pathname.slice("/v1/private/".length);
        const methods = { create: "create", list: "list", read: "read", send: "send", generate: "generate", delete: "remove" };
        if (!Object.hasOwn(methods, action)) fail("not-found", "Object unavailable");
        // Generation is separately provider-bound inside the service at dispatch
        // and completion. An unavailable grant must not discard an accepted reply.
        const value = await privateDiscussions[methods[action]](principal, input);
        // Delivery revocation does not undo an already accepted mutation.
        requireDeliveryAuthority();
        if (accounts.resolvePrincipal(normalized.headers["x-account-session"]).id !== principal.id)
          fail("forbidden", "Account unavailable");
        return jsonResponse(200, value, corsOrigin);
      }
      const response = await route(normalized, service, ai, pairingVerifier !== null, accountWrites ? accounts : null,
        config.origin, transportContext, () => requireCapability(normalized.headers.authorization, config.capability, pairingVerifier), topicSpaces);
      let encoded;
      if (typeof response.isCurrent === "function" && !response.isCurrent()) fail("unavailable", "Read unavailable");
      if (response.publicRead === true && Object.isFrozen(response.value)) {
        encoded = publicReadEncodings.get(response.value);
        if (encoded === undefined) {
          encoded = JSON.stringify(response.value);
          if (Buffer.byteLength(encoded, "utf8") <= MAX_RESPONSE_BYTES) publicReadEncodings.set(response.value, encoded);
        }
      }
      return jsonResponse(response.status, response.value, corsOrigin, encoded);
    } catch (error) {
      const mapped = mapError(error);
      return jsonResponse(mapped.status, { error: mapped.label }, corsOrigin);
    }
  };
}

function normalizeRequest(request) {
  const record = readRecord(request, ["method", "url", "headers", "body"]);
  if (typeof record.method !== "string" || !["GET", "POST", "OPTIONS"].includes(record.method)) fail("method", "Method unavailable");
  if (typeof record.url !== "string" || !record.url.startsWith("/") || record.url.startsWith("//") ||
      record.url.length > (record.method === "GET" && record.url.startsWith("/auth/callback?") ? 8_192 : 2_048)) fail("invalid", "Invalid request");
  let url;
  try { url = new URL(record.url, "http://local.invalid"); } catch { fail("invalid", "Invalid request"); }
  if (url.origin !== "http://local.invalid" || url.username || url.password || url.hash ||
      (url.search && url.pathname !== "/auth/callback")) fail("invalid", "Invalid request");
  if (record.body !== null && typeof record.body !== "string") fail("invalid", "Invalid request");
  if (Buffer.byteLength(record.body ?? "", "utf8") > MAX_BODY_BYTES) fail("oversize", "Request too large");
  return { method: record.method, url, headers: normalizeHeaders(record.headers), body: record.body };
}

function normalizeHeaders(headers) {
  if (headers === null || typeof headers !== "object" || Array.isArray(headers)) fail("invalid", "Invalid request");
  const prototype = Object.getPrototypeOf(headers);
  if (prototype !== Object.prototype && prototype !== null) fail("invalid", "Invalid request");
  const descriptors = Object.getOwnPropertyDescriptors(headers);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 32) fail("oversize", "Request too large");
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") fail("invalid", "Invalid request");
    const normalized = key.toLowerCase();
    if (normalized.length > 128 || descriptor.value.length > 8_192 || Object.hasOwn(result, normalized)) fail("oversize", "Request too large");
    result[normalized] = descriptor.value;
  }
  return result;
}

function requireHost(headers, expected) {
  if (headers.host !== expected) fail("host", "Request unavailable");
}

function requireOrigin(headers, expected) {
  if (!Object.hasOwn(headers, "origin")) return null;
  if (headers.origin !== expected) fail("origin", "Request unavailable");
  return expected;
}

function requireCapability(authorization, expected, pairingVerifier) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) fail("unauthorized", "Authentication required");
  if (pairingVerifier !== null) {
    if (!pairingVerifier.verify(authorization.slice(7))) fail("unauthorized", "Authentication required");
    return;
  }
  const supplied = Buffer.from(authorization.slice(7));
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) fail("unauthorized", "Authentication required");
}

function preflight(request, config, accountsEnabled = false, accountWrites = false) {
  if (request.headers.origin !== config.origin) fail("origin", "Request unavailable");
  const method = request.headers["access-control-request-method"];
  if (!method || !["GET", "POST"].includes(method)) fail("origin", "Request unavailable");
  const requested = (request.headers["access-control-request-headers"] ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (requested.some((header) => !ALLOWED_PREFLIGHT_HEADERS.has(header) &&
      !(accountsEnabled && header === "x-account-session" && (accountWrites || request.url.pathname.startsWith("/v1/account/"))))) fail("origin", "Request unavailable");
  return {
    status: 204,
    headers: {
      "access-control-allow-origin": config.origin,
      "access-control-allow-methods": method,
      "access-control-allow-headers": requested.join(", "),
      "access-control-max-age": "600",
      "vary": "Origin",
    },
    body: "",
  };
}

async function route(request, service, ai, durablePairing, accounts = null, origin = null, transportContext = null, revalidateCapability = () => {}, topicSpaces = null) {
  const path = request.url.pathname;
  function publicReadCurrent() {
    if (transportContext?.signal?.aborted || transportContext?.isCurrent && !transportContext.isCurrent()) return false;
    revalidateCapability();
    if (accounts && Object.hasOwn(request.headers, "x-account-session")) accounts.me(request.headers["x-account-session"]);
    return true;
  }
  async function publicRead(method, input = null) {
    // PostgreSQL read facades own one repeatable-read snapshot (and any
    // cross-call version agreement) internally. Sampling the global revision
    // around them would reject a coherent page whenever the crawler commits.
    const expected = service.coherentSnapshotReads === true ? null :
      typeof service.version === "function" ? await service.version() : null;
    const isCurrent = publicReadCurrent;
    if (!isCurrent()) fail("unavailable", "Read unavailable");
    if (expected !== null) {
      const current = await service.version();
      if (current.generation !== expected.generation || current.revision !== expected.revision) fail("conflict", "State changed");
    }
    const value = typeof service.readPublic === "function" && method !== "discover"
      ? await service.readPublic(method, input, { signal: transportContext?.signal, isCurrent })
      : await (method === "related" ? service.related(input.sourceId, input.limit) :
        method === "discover" ? service.discover.search(input) : service[method](input));
    if (!isCurrent()) fail("unavailable", "Read unavailable");
    if (expected !== null) {
      const current = await service.version();
      if (current.generation !== expected.generation || current.revision !== expected.revision) fail("conflict", "State changed");
    }
    return { status: 200, value, publicRead: true, isCurrent };
  }
  function postingActor({ provider = false } = {}) {
    if (!accounts) {
      const actorId = request.headers["x-demo-actor"];
      if (!actorId || isAccountActor(actorId)) fail("forbidden", "Actor unavailable");
      return actorId;
    }
    if (request.headers.origin !== origin || Object.hasOwn(request.headers, "x-demo-actor")) fail("forbidden", "Actor unavailable");
    const actor = accounts.resolvePrincipal(request.headers["x-account-session"]);
    if (provider && !accounts.matchesChatGPTIdentity(actor.accountId)) fail("forbidden", "Provider account unavailable");
    return actor.id;
  }
  function requestCurrent(actorId, { provider = false } = {}) {
    try {
      if (transportContext?.signal?.aborted ||
          transportContext?.isCurrent && !transportContext.isCurrent()) return false;
      revalidateCapability();
      if (!accounts) return true;
      const actor = accounts.resolvePrincipal(request.headers["x-account-session"]);
      return actor.id === actorId && (!provider || accounts.matchesChatGPTIdentity(actor.accountId));
    } catch { return false; }
  }
  // Optional session headers on reads are validated without exposing identity
  // namespaces. Guests need device pairing, not an application account.
  if (accounts && Object.hasOwn(request.headers, "x-account-session")) {
    if (request.headers.origin !== origin || Object.hasOwn(request.headers, "x-demo-actor")) fail("forbidden", "Actor unavailable");
    accounts.me(request.headers["x-account-session"]);
  }
  if (request.method === "GET" && request.body !== null && request.body !== "") fail("invalid", "Invalid request");
  if (ai && path.startsWith("/v1/ai/")) {
    if (request.method === "GET" && path === "/v1/ai/status") return { status: 200, value: ai.status() };
    if (request.method === "GET" && path === "/v1/ai/insights/resumable") {
      const actorId = postingActor();
      return { status: 200, value: await ai.resumable(actorId,
        { isCurrent: () => requestCurrent(actorId) }) };
    }
    if (request.method === "GET" && path === "/v1/ai/diagnostics") return { status: 200, value: ai.diagnostics() };
    if (request.method === "GET" && path === "/v1/ai/models") {
      if (accounts && Object.hasOwn(request.headers, "x-account-session")) postingActor({ provider: true });
      // Only the internal transport context can lease response time, after the
      // normalized empty GET and all Host/Origin/pairing/account checks pass.
      // Native privileged GETs retain requireOrigin's existing omission rule.
      if (transportContext?.leaseAuthenticatedModels && !transportContext.leaseAuthenticatedModels()) {
        fail("unavailable", "Request unavailable");
      }
      return { status: 200, value: await ai.models() };
    }
    if (request.method === "POST") {
      const input = parseJsonBody(request);
      if (path === "/v1/ai/connect" || path === "/v1/ai/disconnect") {
        if (accounts && Object.hasOwn(request.headers, "x-account-session")) postingActor({ provider: true });
        return { status: 200, value: await (path.endsWith("/connect") ? ai.connect(input) : ai.disconnect(input)) };
      }
      const actorId = postingActor({ provider: path === "/v1/ai/insights" });
      if (path === "/v1/ai/insights/resumable") {
        readRecord(input, []);
        return { status: 200, value: await ai.resumable(actorId,
          { isCurrent: () => requestCurrent(actorId) }) };
      }
      if (path === "/v1/ai/insights") {
        // Exact paired provider work may include a snapshot-coherent PostgreSQL
        // context rebuild before the asynchronous provider job can be accepted.
        // Reuse the one-shot provider/model lease; its deadline remains absolute
        // from socket acceptance and cannot be renewed by this route.
        if (transportContext?.leaseAuthenticatedModels && !transportContext.leaseAuthenticatedModels())
          fail("unavailable", "Request unavailable");
        const isCurrent = () => requestCurrent(actorId, { provider: true });
        if (!isCurrent()) fail("unavailable", "Request unavailable");
        try { return { status: 200, value: await ai.create(input, actorId,
          { signal: transportContext?.signal, isCurrent }) }; }
        catch (error) { if (accounts && error instanceof ServiceError && error.code === "unauthorized") fail("forbidden", "Provider account unavailable"); throw error; }
      }
      if (path === "/v1/ai/insights/result") return { status: 200, value: await ai.result(input, actorId,
        { isCurrent: () => requestCurrent(actorId) }) };
      if (path === "/v1/ai/insights/cancel") return { status: 200, value: await ai.cancel(input, actorId) };
    }
  }
  if (request.method === "GET" && path === "/v1/health") return { status: 200, value: {
    protocol: "local-service/v1", capability: durablePairing ? "paired-durable-v1" : "paired-demo",
  } };
  if (request.method === "GET" && path === "/v1/catalog") return publicRead("catalog");
  if (request.method === "GET" && path === "/v1/version") return { status: 200, value: { version: await service.version() } };
  if (request.method === "POST" && path === "/v1/catalog/context") return publicRead("catalogContext", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/catalog/selection") return publicRead("selection", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/catalog/url-selection") {
    if (request.headers.origin !== origin) fail("forbidden", "Origin unavailable");
    const input = readRecord(parseJsonBody(request), ["url"]);
    const inspected = inspectPageNavigationUrl(input.url);
    if (!inspected.supported || inspected.url !== input.url || inspected.documentUrl !== input.url)
      fail("invalid", "Invalid request");
    // The exact saved-discussion projection can queue behind concurrent public
    // reads. Lease only after Host/Origin/pairing and the complete fixed-point
    // persistence URL have passed; the deadline remains absolute from accept.
    if (transportContext?.leaseAuthenticatedProjection && !transportContext.leaseAuthenticatedProjection())
      fail("unavailable", "Request unavailable");
    return publicRead("urlSelection", input);
  }
  if (request.method === "POST" && path === "/v1/sources/enrichment") {
    if (request.headers.origin !== origin) fail("forbidden", "Origin unavailable");
    const input = readRecord(parseJsonBody(request), ["sourceId", "topicId", "includeAlternate"]);
    readId(input.sourceId); readId(input.topicId);
    if (typeof input.includeAlternate !== "boolean") fail("invalid", "Invalid request");
    // Only exact paired, validated public projection routes get the lease.
    // Raw ingress and canonical context/discussion/health still have five seconds.
    if (transportContext?.leaseAuthenticatedProjection && !transportContext.leaseAuthenticatedProjection())
      fail("unavailable", "Request unavailable");
    return publicRead("enrichment", input);
  }
  if (request.method === "POST" && path === "/v1/catalog/page") return publicRead("catalogPage", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/catalog/source-urls" && typeof service.sourceUrlPage === "function")
    return publicRead("sourceUrlPage", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/discussions/page") return publicRead("discussionPage", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/semantic/feed" && typeof service.semanticFeed === "function")
    return publicRead("semanticFeed", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/semantic/capabilities" && typeof service.semanticTopics === "function") {
    // A display capability only: no database, current model or posting grant.
    readRecord(parseJsonBody(request), []);
    if (!publicReadCurrent()) fail("unavailable", "Read unavailable");
    return { status: 200, value: { protocol: "semantic-topics/v1",...(typeof service.authorContext==='function'?{authorContext:'authored-topics/v1'}:{}),...(typeof service.semanticSearch==='function'?{topicSearch:'named-topics/v1'}:{}) }, isCurrent: publicReadCurrent };
  }
  if (request.method === "POST" && path === "/v1/semantic/thread" && typeof service.semanticThread === "function")
    return publicRead("semanticThread", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/semantic/target" && typeof service.semanticTarget === "function")
    return publicRead("semanticTarget", parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/semantic/topics" && typeof service.semanticTopics === "function")
    return publicRead("semanticTopics", parseJsonBody(request));
  if(request.method==='POST'&&path==='/v1/semantic/search'&&typeof service.semanticSearch==='function')
    return publicRead('semanticSearch',parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/semantic/context" && typeof service.semanticContext === "function")
    return publicRead("semanticContext", parseJsonBody(request));
  if(request.method==='POST'&&path==='/v1/semantic/editor'&&typeof service.authorContext==='function')
    return publicRead('authorContext',parseJsonBody(request));
  if (request.method === "POST" && path === "/v1/discover/search" && service.discover) {
    return publicRead("discover", parseJsonBody(request));
  }
  if (topicSpaces !== null && request.method === "POST" && path.startsWith("/v1/topic-spaces/")) {
    if (request.headers.origin !== origin) fail("forbidden", "Origin unavailable");
    const input = parseJsonBody(request);
    if (path === "/v1/topic-spaces/query" || path === "/v1/topic-spaces/owner") {
      const isCurrent = () => {
        if (transportContext?.signal?.aborted || transportContext?.isCurrent && !transportContext.isCurrent()) return false;
        revalidateCapability();
        if (accounts && Object.hasOwn(request.headers, "x-account-session")) accounts.me(request.headers["x-account-session"]);
        return true;
      };
      if (!isCurrent()) fail("unavailable", "Read unavailable");
      let value;
      if (path.endsWith("/query")) {
        value = await topicSpaces.query(input, { signal: transportContext?.signal, isCurrent });
      } else {
        readRecord(input, []);
        const actorId = accounts && Object.hasOwn(request.headers, "x-account-session") ? postingActor() : null;
        value = await topicSpaces.owner(actorId);
      }
      if (!isCurrent()) fail("unavailable", "Read unavailable");
      return { status: 200, value, isCurrent, ...(path.endsWith("/query") ? { publicRead: true } : {}) };
    }
    if (path === "/v1/topic-spaces/policy") {
      // Device pairing and demo actor headers never grant owner policy writes.
      if (!accounts || !Object.hasOwn(request.headers, "x-account-session")) fail("forbidden", "Actor unavailable");
      const actorId = postingActor();
      if (!isAccountActor(actorId)) fail("forbidden", "Actor unavailable");
      const isCurrent = () => requestCurrent(actorId);
      if (!isCurrent()) fail("unavailable", "Request unavailable");
      const value = await topicSpaces.updatePolicy(input, actorId, { isCurrent });
      if (!isCurrent()) fail("unavailable", "Request unavailable");
      return { status: 200, value, isCurrent };
    }
  }
  const alternateMatch = /^\/v1\/sources\/([^/]+)\/alternate-discussion$/u.exec(path);
  if (request.method === "GET" && alternateMatch) {
    let sourceId;
    try { sourceId = decodeURIComponent(alternateMatch[1]); } catch { fail("invalid", "Invalid request"); }
    return publicRead("alternateDiscussion", sourceId);
  }
  const priorMatch = /^\/v1\/sources\/([^/]+)\/prior-discussions$/u.exec(path);
  if (request.method === "GET" && priorMatch) {
    let sourceId;
    try { sourceId = decodeURIComponent(priorMatch[1]); } catch { fail("invalid", "Invalid request"); }
    return publicRead("priorDiscussions", sourceId);
  }
  const discussionMatch = /^\/v1\/topics\/([^/]+)\/discussion$/u.exec(path);
  if (request.method === "GET" && discussionMatch) {
    let topicId;
    try { topicId = decodeURIComponent(discussionMatch[1]); } catch { fail("invalid", "Invalid request"); }
    return publicRead("discussion", topicId);
  }
  if (request.method === "POST") {
    const input = parseJsonBody(request);
    if (path === "/v1/sources/ingest") {
      // Grant only after the complete representation and existing optional
      // account proof pass. Preserve the original service input/digest semantics;
      // the service remains authoritative for version, replay and capacity.
      readLearnedIngest(input);
      if (transportContext?.leaseAuthenticatedIngestion && !transportContext.leaseAuthenticatedIngestion()) {
        fail("unavailable", "Request unavailable");
      }
      const isCurrent = () => {
        if (transportContext?.isCurrent && !transportContext.isCurrent()) return false;
        // Queued worker preparation cannot outlive pairing or an optional app
        // session. The trusted service calls this immediately before committing.
        try {
          revalidateCapability();
          if (accounts && Object.hasOwn(request.headers, "x-account-session")) accounts.me(request.headers["x-account-session"]);
          return true;
        } catch { return false; }
      };
      return { status: 200, value: await service.ingest(input, { signal: transportContext?.signal, isCurrent }) };
    }
    if (path === "/v1/related") {
      const body = readRecord(input, ["sourceId", "limit"]);
      return publicRead("related", body);
    }
    if (path === "/v1/commands") {
      const body = readRecord(input, ["expected", "command"]);
      const actorId = postingActor({ provider: ["share-insight", "share-insight-reply"].includes(body.command?.type) });
      // Generated publication is revalidated by the AI runtime immediately before
      // this call. It may safely advance the stale global catalog CAS to that exact
      // authoritative snapshot; ordinary commands remain bound to the wire value.
      const persist = (proof, expected = body.expected) => service.command(expected, body.command, actorId, proof);
      const outcome = await (["share-insight", "share-insight-reply"].includes(body.command?.type)
        ? (ai ? ai.share(body, actorId, persist,
          { isCurrent: () => requestCurrent(actorId, { provider: true }) }) : fail("forbidden", "Action unavailable"))
        : persist(null));
      return { status: 200, value: {
        version: outcome.version,
        result: outcome.result,
      } };
    }
    if (path === "/v1/demo/reset") {
      if (accounts) fail("forbidden", "Operator action unavailable");
      const body = readRecord(input, ["expected", "confirmation"]);
      const state = await service.reset(body.expected, body.confirmation);
      ai?.reset?.();
      return { status: 200, value: { version: { generation: state.generation, revision: state.revision } } };
    }
  }
  fail("not-found", "Object unavailable");
}

function callbackResponse(cancelled = false) {
  return { status: 200, headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
  }, body: cancelled
    ? "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Sign-in cancelled</title><body><p>Sign-in was cancelled or declined. No account was connected. Return to the extension to try again.</p></body></html>"
    : "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Sign-in response received</title><body><p>Sign-in response received; verification is not yet complete. Return to extension and check status.</p></body></html>" };
}

function parseJsonBody(request) {
  if ((request.headers["content-type"] ?? "").toLowerCase() !== "application/json") fail("invalid", "Invalid request");
  if (request.body === null || request.body === "") fail("invalid", "Invalid request");
  try { return JSON.parse(request.body); } catch { fail("invalid", "Invalid request"); }
}

function jsonResponse(status, value, origin = null, encoded = undefined) {
  const body = status === 204 ? "" : encoded ?? JSON.stringify(value);
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    return { status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: '{"error":"internal"}' };
  }
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (origin) { headers["access-control-allow-origin"] = origin; headers.vary = "Origin"; }
  return { status, headers, body };
}

function mapError(error) {
  const accountError = mapAccountError(error);
  if (accountError) return accountError;
  if (!(error instanceof ServiceError)) return { status: 500, label: "internal" };
  const mapping = {
    invalid: [400, "invalid-request"], method: [400, "invalid-request"],
    unauthorized: [401, "unauthorized"], origin: [403, "forbidden"], host: [403, "forbidden"], forbidden: [403, "forbidden"],
    "not-found": [404, "not-found"], conflict: [409, "conflict"], capacity: [413, "capacity"], oversize: [413, "request-too-large"],
    unavailable: [503, "alternate-unavailable"],
  };
  const [status, label] = mapping[error.code] ?? [500, "internal"];
  return { status, label };
}
