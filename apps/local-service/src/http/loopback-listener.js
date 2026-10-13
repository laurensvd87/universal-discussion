import { createServer } from "node:http";
import { TextDecoder } from "node:util";
import { FIXED_HOST, FIXED_PORT } from "./startup-config.js";
import { MAX_BODY_BYTES } from "./request-handler.js";

export const TRANSPORT_LIMITS = Object.freeze({
  headerBytes: 16_384,
  headerCount: 32,
  headerNameBytes: 128,
  headerValueBytes: 8_192,
  urlUnits: 2_048,
  callbackUrlUnits: 8_192,
  requestMs: 5_000,
  authenticatedModelsMs: 30_000,
  authenticatedIngestionMs: 30_000,
  authenticatedProjectionMs: 30_000,
  connections: 4_096,
  bufferedBodyBytes: 8 * 1024 * 1024,
  bufferedResponseBytes: 16 * 1024 * 1024,
});

// Inspect raw headers: IncomingMessage.headers can merge/drop duplicates.
// This check precedes reading any request body or calling the application.
export function inspectRequestHead(request) {
  const { rawHeaders, method, url } = request;
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) return { status: 400 };
  if (rawHeaders.length / 2 > TRANSPORT_LIMITS.headerCount) return { status: 431 };
  const urlLimit = method === "GET" && typeof url === "string" && url.startsWith("/auth/callback?")
    ? TRANSPORT_LIMITS.callbackUrlUnits : TRANSPORT_LIMITS.urlUnits;
  if (typeof url !== "string" || url.length > urlLimit) return { status: 414 };
  if (!["GET", "POST", "OPTIONS"].includes(method)) return { status: 400 };
  const headers = Object.create(null);
  let bytes = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i];
    const value = rawHeaders[i + 1];
    if (typeof name !== "string" || typeof value !== "string") return { status: 400 };
    const lower = name.toLowerCase();
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
    if (Buffer.byteLength(name) > TRANSPORT_LIMITS.headerNameBytes ||
        Buffer.byteLength(value) > TRANSPORT_LIMITS.headerValueBytes ||
        bytes > TRANSPORT_LIMITS.headerBytes) return { status: 431 };
    if (Object.hasOwn(headers, lower)) return { status: 400 };
    headers[lower] = value;
  }
  if (Object.hasOwn(headers, "content-encoding") || Object.hasOwn(headers, "expect")) return { status: 400 };
  if (Object.hasOwn(headers, "content-length")) {
    if (!/^(0|[1-9][0-9]*)$/u.test(headers["content-length"])) return { status: 400 };
    const length = Number(headers["content-length"]);
    if (!Number.isSafeInteger(length) || length > MAX_BODY_BYTES) return { status: 413 };
    if (Object.hasOwn(headers, "transfer-encoding")) return { status: 400 };
  }
  if (Object.hasOwn(headers, "transfer-encoding") && headers["transfer-encoding"].toLowerCase() !== "chunked") return { status: 400 };
  return { headers };
}

function reject(response, status) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    connection: "close",
  });
  response.end(JSON.stringify({ error: status === 413 ? "request-too-large" : "invalid-request" }));
}

export function createTransportHandler(handle) {
  const socketDeadlines = new WeakMap();
  let bufferedBodyBytes = 0;
  let bufferedResponseBytes = 0;
  const transport = (request, response) => {
    const inspected = inspectRequestHead(request);
    if (inspected.status) {
      reject(response, inspected.status);
      request.resume();
      return;
    }
    let finished = false;
    let leased = false;
    let size = 0;
    let responseBytes = 0;
    const chunks = [];
    const controller = new AbortController();
    const startedAt = performance.now();
    const socketDeadline = socketDeadlines.get(request.socket);
    let expiresAt = Math.min(startedAt + TRANSPORT_LIMITS.requestMs, socketDeadline?.expiresAt ?? Infinity);
    let timer = setTimeout(() => stop(408), Math.max(0, expiresAt - startedAt));
    timer.unref();
    function leaseAuthenticatedResponse(duration) {
      const now = performance.now();
      if (finished || leased || response.destroyed || response.writableEnded || request.aborted || request.socket?.destroyed ||
          now >= expiresAt || (socketDeadline && !socketDeadline.leaseAuthenticatedResponse(now, duration))) return false;
      leased = true;
      // Both timers use the same absolute accept-time deadline. No extra
      // thirty seconds after collecting headers/body or proving authority.
      expiresAt = socketDeadline?.expiresAt ?? startedAt + duration;
      clearTimeout(timer);
      timer = setTimeout(() => stop(408), Math.max(0, expiresAt - now));
      timer.unref();
      return true;
    }
    const transportContext = Object.freeze({
      leaseAuthenticatedModels() { return leaseAuthenticatedResponse(TRANSPORT_LIMITS.authenticatedModelsMs); },
      leaseAuthenticatedIngestion() { return leaseAuthenticatedResponse(TRANSPORT_LIMITS.authenticatedIngestionMs); },
      leaseAuthenticatedProjection() { return leaseAuthenticatedResponse(TRANSPORT_LIMITS.authenticatedProjectionMs); },
      signal: controller.signal,
      isCurrent() {
        return !finished && !controller.signal.aborted && !response.destroyed && !response.writableEnded &&
          !request.aborted && !request.socket?.destroyed && performance.now() < expiresAt;
      },
    });
    function cleanup() {
      clearTimeout(timer);
      bufferedBodyBytes -= size;
      size = 0;
      chunks.length = 0;
      request.removeListener("data", onData);
      request.removeListener("end", onEnd);
    }
    function releaseResponse() {
      bufferedResponseBytes -= responseBytes;
      responseBytes = 0;
    }
    function stop(status) {
      if (finished) return;
      finished = true;
      controller.abort();
      cleanup();
      reject(response, status);
      request.resume();
    }
    function onData(chunk) {
      if (!Buffer.isBuffer(chunk)) { stop(400); return; }
      if (size + chunk.length > MAX_BODY_BYTES) { stop(413); return; }
      if (bufferedBodyBytes + chunk.length > TRANSPORT_LIMITS.bufferedBodyBytes) { stop(503); return; }
      size += chunk.length;
      bufferedBodyBytes += chunk.length;
      chunks.push(chunk);
    }
    async function onEnd() {
      if (finished) return;
      let body;
      try {
        body = size === 0 ? null : new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
      } catch { stop(400); return; }
      try {
        const result = await handle({ method: request.method, url: request.url, headers: inspected.headers, body }, transportContext);
        if (finished || response.destroyed) return;
        if (performance.now() >= expiresAt) { stop(408); return; }
        const bytes = Buffer.byteLength(result.body ?? "");
        if (bufferedResponseBytes + bytes > TRANSPORT_LIMITS.bufferedResponseBytes) { stop(503); return; }
        responseBytes = bytes;
        bufferedResponseBytes += bytes;
        finished = true;
        cleanup();
        response.writeHead(result.status, { ...result.headers, connection: "close" });
        response.end(result.body);
      } catch { stop(500); }
    }
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("aborted", () => { finished = true; controller.abort(); cleanup(); });
    request.once("error", () => stop(400));
    response.once("finish", releaseResponse);
    response.once("close", () => { releaseResponse(); finished = true; controller.abort(); cleanup(); });
  };
  // The listener alone supplies socket objects; no HTTP input can reach this
  // per-socket authority closure. It also bounds incomplete/trickling headers.
  transport.bindSocket = (socket) => {
    const acceptedAt = performance.now();
    let closed = false;
    let leased = false;
    const state = {
      expiresAt: acceptedAt + TRANSPORT_LIMITS.requestMs,
      leaseAuthenticatedResponse(now, duration) {
        if (closed || leased || socket.destroyed || now >= state.expiresAt) return false;
        leased = true;
        state.expiresAt = acceptedAt + duration;
        clearTimeout(deadline);
        deadline = setTimeout(() => socket.destroy(), Math.max(0, state.expiresAt - now));
        deadline.unref();
        return true;
      },
    };
    let deadline = setTimeout(() => socket.destroy(), TRANSPORT_LIMITS.requestMs);
    deadline.unref();
    socketDeadlines.set(socket, state);
    socket.once("close", () => { closed = true; clearTimeout(deadline); socketDeadlines.delete(socket); });
    socket.on("error", () => {});
  };
  return transport;
}

// Shared server construction lets synthetic load checks exercise the exact
// transport on an isolated test endpoint. This function never binds a socket.
export function createLoopbackServer({ handle }) {
  const transport = createTransportHandler(handle);
  const server = createServer({
    maxHeaderSize: TRANSPORT_LIMITS.headerBytes,
    headersTimeout: TRANSPORT_LIMITS.requestMs,
    requestTimeout: TRANSPORT_LIMITS.requestMs,
    keepAliveTimeout: 1,
    connectionsCheckingInterval: 250,
    requireHostHeader: true,
    rejectNonStandardBodyWrites: true,
  }, transport);
  // Keep rawHeaders complete within maxHeaderSize; Node's count cap truncates
  // its header projection instead of rejecting. Our inspection rejects >32.
  server.maxHeadersCount = 0;
  server.maxRequestsPerSocket = 1;
  server.maxConnections = TRANSPORT_LIMITS.connections;
  server.on("connection", transport.bindSocket);
  server.on("checkContinue", (_request, response) => reject(response, 400));
  server.on("checkExpectation", (_request, response) => reject(response, 400));
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("connect", (_request, socket) => socket.destroy());
  server.on("clientError", (error, socket) => {
    if (!socket.writable || socket.destroyed) return;
    const status = error.code === "HPE_HEADER_OVERFLOW" ? 431 : 400;
    socket.end(`HTTP/1.1 ${status} Invalid Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });
  return server;
}

// The only binding call in the app. No alternate production endpoint or import side effect.
export async function startLoopbackListener({ handle }) {
  const server = createLoopbackServer({ handle });
  try {
    await new Promise((resolve, rejectStart) => {
      const failed = (error) => { server.removeListener("listening", ready); rejectStart(error); };
      const ready = () => { server.removeListener("error", failed); resolve(); };
      server.once("error", failed);
      server.once("listening", ready);
      server.listen({ host: FIXED_HOST, port: FIXED_PORT, exclusive: true, backlog: TRANSPORT_LIMITS.connections });
    });
  } catch {
    server.closeAllConnections();
    throw new Error("Local service could not bind the approved loopback endpoint");
  }
  return Object.freeze({
    close: () => new Promise((resolve, rejectClose) => {
      server.close((error) => error ? rejectClose(new Error("Local service shutdown failed")) : resolve());
      server.closeAllConnections();
    }),
  });
}
