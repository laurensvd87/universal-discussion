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
  connections: 16,
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
  return (request, response) => {
    const inspected = inspectRequestHead(request);
    if (inspected.status) {
      reject(response, inspected.status);
      request.resume();
      return;
    }
    let finished = false;
    let size = 0;
    const chunks = [];
    const timer = setTimeout(() => stop(408), TRANSPORT_LIMITS.requestMs);
    timer.unref();
    function cleanup() {
      clearTimeout(timer);
      chunks.length = 0;
      request.removeListener("data", onData);
      request.removeListener("end", onEnd);
    }
    function stop(status) {
      if (finished) return;
      finished = true;
      cleanup();
      reject(response, status);
      request.resume();
    }
    function onData(chunk) {
      if (!Buffer.isBuffer(chunk)) { stop(400); return; }
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { stop(413); return; }
      chunks.push(chunk);
    }
    async function onEnd() {
      if (finished) return;
      let body;
      try {
        body = size === 0 ? null : new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
      } catch { stop(400); return; }
      try {
        const result = await handle({ method: request.method, url: request.url, headers: inspected.headers, body });
        if (finished || response.destroyed) return;
        finished = true;
        cleanup();
        response.writeHead(result.status, { ...result.headers, connection: "close" });
        response.end(result.body);
      } catch { stop(500); }
    }
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("aborted", () => { finished = true; cleanup(); });
    request.once("error", () => stop(400));
    response.once("close", () => { finished = true; cleanup(); });
  };
}

// The only binding call in the app. No alternate host/port or import side effect.
export async function startLoopbackListener({ handle }) {
  const server = createServer({
    maxHeaderSize: TRANSPORT_LIMITS.headerBytes,
    headersTimeout: TRANSPORT_LIMITS.requestMs,
    requestTimeout: TRANSPORT_LIMITS.requestMs,
    keepAliveTimeout: 1,
    connectionsCheckingInterval: 250,
    requireHostHeader: true,
    rejectNonStandardBodyWrites: true,
  }, createTransportHandler(handle));
  // Keep rawHeaders complete within maxHeaderSize; Node's count cap truncates
  // its header projection instead of rejecting. Our inspection rejects >32.
  server.maxHeadersCount = 0;
  server.maxRequestsPerSocket = 1;
  server.maxConnections = TRANSPORT_LIMITS.connections;
  server.on("connection", (socket) => {
    // An absolute lifetime also bounds incomplete headers and trickle/pipelined input.
    const deadline = setTimeout(() => socket.destroy(), TRANSPORT_LIMITS.requestMs);
    deadline.unref();
    socket.once("close", () => clearTimeout(deadline));
    socket.on("error", () => {});
  });
  server.on("checkContinue", (_request, response) => reject(response, 400));
  server.on("checkExpectation", (_request, response) => reject(response, 400));
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("connect", (_request, socket) => socket.destroy());
  server.on("clientError", (error, socket) => {
    if (!socket.writable || socket.destroyed) return;
    const status = error.code === "HPE_HEADER_OVERFLOW" ? 431 : 400;
    socket.end(`HTTP/1.1 ${status} Invalid Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });
  try {
    await new Promise((resolve, rejectStart) => {
      const failed = (error) => { server.removeListener("listening", ready); rejectStart(error); };
      const ready = () => { server.removeListener("error", failed); resolve(); };
      server.once("error", failed);
      server.once("listening", ready);
      server.listen({ host: FIXED_HOST, port: FIXED_PORT, exclusive: true });
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
