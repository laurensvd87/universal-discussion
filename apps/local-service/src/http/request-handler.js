import { timingSafeEqual } from "node:crypto";
import { ServiceError, fail } from "../domain/errors.js";
import { readRecord } from "../domain/validation.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";

export const MAX_BODY_BYTES = 65_536;
const ALLOWED_PREFLIGHT_HEADERS = new Set(["authorization", "content-type", "x-demo-actor"]);

export function createRequestHandler({ service, config }) {
  return async function handle(request) {
    let corsOrigin = null;
    try {
      const normalized = normalizeRequest(request);
      requireHost(normalized.headers, config.hostHeader);
      if (normalized.method === "OPTIONS") return preflight(normalized, config);
      corsOrigin = requireOrigin(normalized.headers, config.origin);
      requireCapability(normalized.headers.authorization, config.capability);
      const response = route(normalized, service);
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
  if (typeof record.url !== "string" || !record.url.startsWith("/") || record.url.startsWith("//") || record.url.length > 2_048) fail("invalid", "Invalid request");
  let url;
  try { url = new URL(record.url, "http://local.invalid"); } catch { fail("invalid", "Invalid request"); }
  if (url.origin !== "http://local.invalid" || url.username || url.password || url.hash || url.search) fail("invalid", "Invalid request");
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

function requireCapability(authorization, expected) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) fail("unauthorized", "Authentication required");
  const supplied = Buffer.from(authorization.slice(7));
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) fail("unauthorized", "Authentication required");
}

function preflight(request, config) {
  if (request.headers.origin !== config.origin) fail("origin", "Request unavailable");
  const method = request.headers["access-control-request-method"];
  if (!method || !["GET", "POST"].includes(method)) fail("origin", "Request unavailable");
  const requested = (request.headers["access-control-request-headers"] ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (requested.some((header) => !ALLOWED_PREFLIGHT_HEADERS.has(header))) fail("origin", "Request unavailable");
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

function route(request, service) {
  const path = request.url.pathname;
  if (request.method === "GET" && request.body !== null && request.body !== "") fail("invalid", "Invalid request");
  if (request.method === "GET" && path === "/v1/health") return { status: 200, value: { protocol: "local-service/v1", capability: "paired-demo" } };
  if (request.method === "GET" && path === "/v1/catalog") return { status: 200, value: service.catalog() };
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
      const actorId = request.headers["x-demo-actor"];
      if (!actorId) fail("forbidden", "Actor unavailable");
      const outcome = service.command(body.expected, body.command, actorId);
      return { status: 200, value: {
        version: outcome.version,
        result: outcome.result,
      } };
    }
    if (path === "/v1/demo/reset") {
      const body = readRecord(input, ["expected", "confirmation"]);
      const state = service.reset(body.expected, body.confirmation);
      return { status: 200, value: { version: { generation: state.generation, revision: state.revision } } };
    }
  }
  fail("not-found", "Object unavailable");
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
  if (!(error instanceof ServiceError)) return { status: 500, label: "internal" };
  const mapping = {
    invalid: [400, "invalid-request"], method: [400, "invalid-request"],
    unauthorized: [401, "unauthorized"], origin: [403, "forbidden"], host: [403, "forbidden"], forbidden: [403, "forbidden"],
    "not-found": [404, "not-found"], conflict: [409, "conflict"], capacity: [413, "capacity"], oversize: [413, "request-too-large"],
  };
  const [status, label] = mapping[error.code] ?? [500, "internal"];
  return { status, label };
}
