import { timingSafeEqual } from "node:crypto";
import { ServiceError, fail } from "../domain/errors.js";
import { readRecord } from "../domain/validation.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";
import { mapAccountError, routeAccountRequest } from "../accounts/account-routes.js";
import { isAccountActor } from "../accounts/account-principal.js";

export const MAX_BODY_BYTES = 65_536;
const ALLOWED_PREFLIGHT_HEADERS = new Set(["authorization", "content-type", "x-demo-actor"]);

export function createRequestHandler({ service, config, ai = null, pairingVerifier = null, accounts = null,
  accountWrites = false, accountLifecycle = null, privateDiscussions = null }) {
  return async function handle(request) {
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
      if (accounts !== null && normalized.url.pathname.startsWith("/v1/account/")) {
        // Account credential handling requires the configured browser Origin;
        // privileged browser GET omissions use strict POST read equivalents.
        if (normalized.headers.origin !== config.origin) fail("origin", "Request unavailable");
        const response = accountLifecycle && ["/v1/account/data", "/v1/account/delete", "/v1/account/private-data"].includes(normalized.url.pathname)
          ? accountLifecycle.route(normalized) : routeAccountRequest(normalized, accounts);
        return jsonResponse(response.status, response.value, corsOrigin);
      }
      if (normalized.url.pathname.startsWith("/v1/private/")) {
        if (!accountWrites || !accounts || !privateDiscussions) fail("not-found", "Object unavailable");
        if (normalized.headers.origin !== config.origin || Object.hasOwn(normalized.headers, "x-demo-actor")) fail("origin", "Request unavailable");
        if (normalized.method !== "POST") fail("method", "Method unavailable");
        const principal = accounts.resolvePrincipal(normalized.headers["x-account-session"]);
        const input = parseJsonBody(normalized);
        const action = normalized.url.pathname.slice("/v1/private/".length);
        const methods = { create: "create", list: "list", read: "read", send: "send", generate: "generate", delete: "remove" };
        if (!Object.hasOwn(methods, action)) fail("not-found", "Object unavailable");
        // Generation is separately provider-bound inside the service at dispatch
        // and completion. An unavailable grant must not discard an accepted reply.
        const value = privateDiscussions[methods[action]](principal, input);
        return jsonResponse(200, value, corsOrigin);
      }
      const response = await route(normalized, service, ai, pairingVerifier !== null, accountWrites ? accounts : null, config.origin);
      return jsonResponse(response.status, response.value, corsOrigin);
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

async function route(request, service, ai, durablePairing, accounts = null, origin = null) {
  const path = request.url.pathname;
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
      return { status: 200, value: ai.resumable(actorId) };
    }
    if (request.method === "GET" && path === "/v1/ai/diagnostics") return { status: 200, value: ai.diagnostics() };
    if (request.method === "GET" && path === "/v1/ai/models") {
      if (accounts && Object.hasOwn(request.headers, "x-account-session")) postingActor({ provider: true });
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
        return { status: 200, value: ai.resumable(actorId) };
      }
      if (path === "/v1/ai/insights") {
        try { return { status: 200, value: ai.create(input, actorId) }; }
        catch (error) { if (accounts && error instanceof ServiceError && error.code === "unauthorized") fail("forbidden", "Provider account unavailable"); throw error; }
      }
      if (path === "/v1/ai/insights/result") return { status: 200, value: ai.result(input, actorId) };
      if (path === "/v1/ai/insights/cancel") return { status: 200, value: ai.cancel(input, actorId) };
    }
  }
  if (request.method === "GET" && path === "/v1/health") return { status: 200, value: {
    protocol: "local-service/v1", capability: durablePairing ? "paired-durable-v1" : "paired-demo",
  } };
  if (request.method === "GET" && path === "/v1/catalog") return { status: 200, value: service.catalog() };
  if (request.method === "GET" && path === "/v1/version") return { status: 200, value: { version: service.version() } };
  if (request.method === "POST" && path === "/v1/catalog/context") return { status: 200, value: service.catalogContext(parseJsonBody(request)) };
  if (request.method === "POST" && path === "/v1/catalog/page") return { status: 200, value: service.catalogPage(parseJsonBody(request)) };
  if (request.method === "POST" && path === "/v1/discussions/page") return { status: 200, value: service.discussionPage(parseJsonBody(request)) };
  if (request.method === "POST" && path === "/v1/discover/search" && service.discover) {
    return { status: 200, value: service.discover.search(parseJsonBody(request)) };
  }
  const alternateMatch = /^\/v1\/sources\/([^/]+)\/alternate-discussion$/u.exec(path);
  if (request.method === "GET" && alternateMatch) {
    let sourceId;
    try { sourceId = decodeURIComponent(alternateMatch[1]); } catch { fail("invalid", "Invalid request"); }
    return { status: 200, value: service.alternateDiscussion(sourceId) };
  }
  const priorMatch = /^\/v1\/sources\/([^/]+)\/prior-discussions$/u.exec(path);
  if (request.method === "GET" && priorMatch) {
    let sourceId;
    try { sourceId = decodeURIComponent(priorMatch[1]); } catch { fail("invalid", "Invalid request"); }
    return { status: 200, value: service.priorDiscussions(sourceId) };
  }
  const discussionMatch = /^\/v1\/topics\/([^/]+)\/discussion$/u.exec(path);
  if (request.method === "GET" && discussionMatch) {
    let topicId;
    try { topicId = decodeURIComponent(discussionMatch[1]); } catch { fail("invalid", "Invalid request"); }
    return { status: 200, value: service.discussion(topicId) };
  }
  if (request.method === "POST") {
    const input = parseJsonBody(request);
    if (path === "/v1/sources/ingest") return { status: 200, value: service.ingest(input) };
    if (path === "/v1/related") {
      const body = readRecord(input, ["sourceId", "limit"]);
      return { status: 200, value: service.related(body.sourceId, body.limit) };
    }
    if (path === "/v1/commands") {
      const body = readRecord(input, ["expected", "command"]);
      const actorId = postingActor({ provider: ["share-insight", "share-insight-reply"].includes(body.command?.type) });
      const persist = (proof) => service.command(body.expected, body.command, actorId, proof);
      const outcome = ["share-insight", "share-insight-reply"].includes(body.command?.type)
        ? (ai ? ai.share(body, actorId, persist) : fail("forbidden", "Action unavailable"))
        : persist(null);
      return { status: 200, value: {
        version: outcome.version,
        result: outcome.result,
      } };
    }
    if (path === "/v1/demo/reset") {
      if (accounts) fail("forbidden", "Operator action unavailable");
      const body = readRecord(input, ["expected", "confirmation"]);
      const state = service.reset(body.expected, body.confirmation);
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

function jsonResponse(status, value, origin = null) {
  const body = status === 204 ? "" : JSON.stringify(value);
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
