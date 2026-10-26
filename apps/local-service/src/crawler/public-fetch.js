import { lookup as nodeLookup } from "node:dns/promises";
import { request as nodeRequest } from "node:https";
import { isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

export const CRAWLER_USER_AGENT = "MurmingleTopicCrawler/1.0";

export const PUBLIC_FETCH_POLICY = Object.freeze({
  timeoutMs: 15_000,
  maxUrlBytes: 4_096,
  maxDnsRecords: 32,
  maxHeaderBytes: 16 * 1_024,
  maxHeaders: 64,
  maxCompressedBytes: 2 * 1_024 * 1_024,
  maxDecompressedBytes: 2 * 1_024 * 1_024,
  maxCompressionRatio: 64
});

const RESOURCE_KINDS = Object.freeze({
  page: Object.freeze({
    mimeTypes: new Set(["text/html", "application/xhtml+xml"]),
    maxCompressedBytes: PUBLIC_FETCH_POLICY.maxCompressedBytes,
    maxDecompressedBytes: PUBLIC_FETCH_POLICY.maxDecompressedBytes,
    accept: "text/html, application/xhtml+xml"
  }),
  robots: Object.freeze({
    mimeTypes: new Set(["text/plain"]),
    maxCompressedBytes: 500 * 1_024,
    maxDecompressedBytes: 500 * 1_024,
    accept: "text/plain"
  }),
  tdmrep: Object.freeze({
    mimeTypes: new Set(["application/json"]),
    maxCompressedBytes: 256 * 1_024,
    maxDecompressedBytes: 256 * 1_024,
    accept: "application/json"
  })
});
const ALLOWED_ENCODINGS = new Set(["identity", "gzip", "br", "deflate"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const LIMIT_KEYS = new Set(Object.keys(PUBLIC_FETCH_POLICY));

export class PublicFetchError extends Error {
  constructor(code, details = undefined) {
    super("Public crawler request failed");
    this.name = "PublicFetchError";
    this.code = code;
    if (Number.isInteger(details?.status)) this.status = details.status;
    if (details?.cause !== undefined) this.cause = details.cause;
  }
}

function failure(code, details) {
  return new PublicFetchError(code, details);
}

function ipv4Bytes(address) {
  if (isIP(address) !== 4) return null;
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map(part => Number(part));
  return bytes.every((part, index) => Number.isInteger(part) && part >= 0 && part <= 255 && String(part) === parts[index])
    ? Uint8Array.from(bytes) : null;
}

function ipv6Bytes(address) {
  if (typeof address !== "string" || address.includes("%") || isIP(address) !== 6) return null;
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const read = (part) => {
    if (!part) return [];
    const values = part.split(":");
    const result = [];
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (value.includes(".")) {
        if (index !== values.length - 1) return null;
        const v4 = ipv4Bytes(value);
        if (!v4) return null;
        result.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/u.test(value)) return null;
        result.push(Number.parseInt(value, 16));
      }
    }
    return result;
  };
  const left = read(halves[0]);
  const right = read(halves[1] ?? "");
  if (!left || !right) return null;
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return null;
  const words = [...left, ...Array.from({ length: omitted }, () => 0), ...right];
  if (words.length !== 8) return null;
  const bytes = new Uint8Array(16);
  words.forEach((word, index) => {
    bytes[index * 2] = word >>> 8;
    bytes[index * 2 + 1] = word & 0xff;
  });
  return bytes;
}

function prefix(bytes, expected, bits) {
  const whole = Math.floor(bits / 8);
  const remainder = bits % 8;
  for (let index = 0; index < whole; index += 1) if (bytes[index] !== expected[index]) return false;
  if (!remainder) return true;
  const mask = 0xff << (8 - remainder) & 0xff;
  return (bytes[whole] & mask) === (expected[whole] & mask);
}

function v4Prefix(bytes, first, second = 0, bits = 8) {
  return prefix(bytes, Uint8Array.from([first, second, 0, 0]), bits);
}

function v6Prefix(bytes, address, bits) {
  return prefix(bytes, ipv6Bytes(address), bits);
}

/** True only for an address outside the special-use ranges a public crawler must never dial. */
export function isGlobalPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const bytes = ipv4Bytes(address);
    if (!bytes) return false;
    return !(v4Prefix(bytes, 0) || v4Prefix(bytes, 10) || v4Prefix(bytes, 100, 64, 10) ||
      v4Prefix(bytes, 127) || v4Prefix(bytes, 169, 254, 16) || v4Prefix(bytes, 172, 16, 12) ||
      v4Prefix(bytes, 192, 0, 24) || v4Prefix(bytes, 192, 168, 16) ||
      (bytes[0] === 192 && bytes[1] === 0 && bytes[2] === 2) ||
      (bytes[0] === 192 && bytes[1] === 88 && bytes[2] === 99) ||
      v4Prefix(bytes, 198, 18, 15) ||
      (bytes[0] === 198 && bytes[1] === 51 && bytes[2] === 100) ||
      (bytes[0] === 203 && bytes[1] === 0 && bytes[2] === 113) ||
      (bytes[0] === 168 && bytes[1] === 63 && bytes[2] === 129 && bytes[3] === 16) ||
      bytes[0] >= 224);
  }
  if (family !== 6) return false;
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  const zero96 = bytes.slice(0, 12).every(value => value === 0);
  const mapped = bytes.slice(0, 10).every(value => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const isatap = (bytes[8] === 0 || bytes[8] === 2) && bytes[9] === 0 && bytes[10] === 0x5e && bytes[11] === 0xfe;
  return v6Prefix(bytes, "2000::", 3) &&
    !(zero96 || mapped || isatap || v6Prefix(bytes, "64:ff9b::", 96) || v6Prefix(bytes, "64:ff9b:1::", 48) ||
    v6Prefix(bytes, "100::", 64) || v6Prefix(bytes, "2001::", 23) || v6Prefix(bytes, "2001:2::", 48) ||
    v6Prefix(bytes, "2001:10::", 28) || v6Prefix(bytes, "2001:20::", 28) ||
    v6Prefix(bytes, "2001:30::", 28) || v6Prefix(bytes, "2001:db8::", 32) ||
    v6Prefix(bytes, "2002::", 16) || v6Prefix(bytes, "3ffe::", 16) || v6Prefix(bytes, "3fff::", 20) || v6Prefix(bytes, "5f00::", 16) ||
    v6Prefix(bytes, "fc00::", 7) || v6Prefix(bytes, "fe80::", 10) || v6Prefix(bytes, "fec0::", 10) ||
    v6Prefix(bytes, "ff00::", 8));
}

function addressKey(address) {
  const bytes = isIP(address) === 4 ? ipv4Bytes(address) : ipv6Bytes(address);
  return bytes ? `${bytes.length}:${Buffer.from(bytes).toString("hex")}` : null;
}

function validDnsName(hostname) {
  if (typeof hostname !== "string" || hostname.length < 1 || hostname.length > 253 || isIP(hostname) || hostname.endsWith(".")) return false;
  return hostname.split(".").every(label => label.length >= 1 && label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label));
}

export async function resolvePublicAddresses(hostname, { dnsLookup = nodeLookup, maxRecords = PUBLIC_FETCH_POLICY.maxDnsRecords } = {}) {
  if (!validDnsName(hostname) || typeof dnsLookup !== "function" || !Number.isInteger(maxRecords) ||
      maxRecords < 1 || maxRecords > PUBLIC_FETCH_POLICY.maxDnsRecords) throw failure("invalid-host");
  let records;
  try {
    records = await dnsLookup(hostname, { all: true, verbatim: true, family: 0, hints: 0 });
  } catch (cause) {
    throw failure("dns-failed", { cause });
  }
  if (!Array.isArray(records) || records.length < 1 || records.length > maxRecords) throw failure("dns-invalid");
  const unique = new Map();
  for (const record of records) {
    if (!record || typeof record !== "object" || (record.family !== 4 && record.family !== 6) ||
        typeof record.address !== "string" || isIP(record.address) !== record.family || !isGlobalPublicAddress(record.address)) {
      throw failure("dns-non-public");
    }
    const key = addressKey(record.address);
    if (!key) throw failure("dns-invalid");
    if (!unique.has(key)) unique.set(key, Object.freeze({ address: record.address, family: record.family }));
  }
  return Object.freeze([...unique.values()]);
}

function publicUrl(rawUrl, policy) {
  if (typeof rawUrl !== "string" || Buffer.byteLength(rawUrl) > policy.maxUrlBytes) throw failure("invalid-url");
  let url;
  try { url = new URL(rawUrl); }
  catch { throw failure("invalid-url"); }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password ||
      !validDnsName(url.hostname)) throw failure("invalid-url");
  url.hash = "";
  return url;
}

function requestPolicy(overrides = undefined) {
  if (overrides === undefined) return PUBLIC_FETCH_POLICY;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides) || Object.getPrototypeOf(overrides) !== Object.prototype)
    throw new TypeError("Invalid public fetch limits");
  const policy = { ...PUBLIC_FETCH_POLICY };
  for (const [key, value] of Object.entries(overrides)) {
    if (!LIMIT_KEYS.has(key) || !Number.isInteger(value) || value < 1 || value > PUBLIC_FETCH_POLICY[key])
      throw new TypeError("Invalid public fetch limits");
    policy[key] = value;
  }
  if (policy.maxCompressedBytes > policy.maxDecompressedBytes) throw new TypeError("Invalid public fetch limits");
  return Object.freeze(policy);
}

function rawHeaderValues(response, name) {
  const lower = name.toLowerCase();
  const distinct = response.headersDistinct?.[lower];
  if (distinct !== undefined) return Array.isArray(distinct) ? distinct : [distinct];
  const value = response.headers?.[lower];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function singletonHeader(response, name, maximum = 4_096) {
  const values = rawHeaderValues(response, name);
  if (values.length === 0) return null;
  if (values.length !== 1 || typeof values[0] !== "string" || Buffer.byteLength(values[0]) > maximum || /[\r\n\0]/u.test(values[0]))
    throw failure("invalid-headers");
  return values[0];
}

function validateHeaders(response, policy) {
  const raw = Array.isArray(response.rawHeaders) ? response.rawHeaders : [];
  let count = 0, bytes = 0;
  if (raw.length) {
    if (raw.length % 2) throw failure("invalid-headers");
    count = raw.length / 2;
    for (let index = 0; index < raw.length; index += 2) {
      if (typeof raw[index] !== "string" || typeof raw[index + 1] !== "string" ||
          !/^[!#$%&'*+.^_`|~0-9a-z-]+$/iu.test(raw[index]) || /[\u0000-\u0008\u000a-\u001f\u007f]/u.test(raw[index + 1]))
        throw failure("invalid-headers");
      bytes += Buffer.byteLength(raw[index]) + Buffer.byteLength(raw[index + 1]) + 4;
    }
  } else {
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      const values = Array.isArray(value) ? value : [value];
      count += values.length;
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/iu.test(name)) throw failure("invalid-headers");
      for (const item of values) {
        if (typeof item !== "string" || /[\u0000-\u0008\u000a-\u001f\u007f]/u.test(item)) throw failure("invalid-headers");
        bytes += Buffer.byteLength(name) + Buffer.byteLength(item) + 4;
      }
    }
  }
  if (count > policy.maxHeaders || bytes > policy.maxHeaderBytes) throw failure("headers-too-large");
}

function parseMime(response, resource) {
  const value = singletonHeader(response, "content-type", 512);
  if (!value) throw failure("content-type");
  const parts = value.split(";");
  const match = /^\s*([!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+)\s*$/iu.exec(parts.shift() ?? "");
  const mimeType = match?.[1].toLowerCase();
  if (!mimeType || !resource.mimeTypes.has(mimeType)) throw failure("content-type");
  const parameters = new Map();
  for (const raw of parts) {
    const parameter = /^\s*([!#$%&'*+.^_`|~0-9a-z-]+)\s*=\s*([!#$%&'*+.^_`|~0-9a-z-]+|"(?:[^"\\\r\n]|\\[\t\x20-\x7e])*")\s*$/iu.exec(raw);
    if (!parameter) throw failure("content-type");
    const name = parameter[1].toLowerCase();
    if (parameters.has(name)) throw failure("content-type");
    const encoded = parameter[2];
    const decoded = encoded.startsWith("\"")
      ? encoded.slice(1, -1).replace(/\\([\t\x20-\x7e])/gu, "$1") : encoded;
    parameters.set(name, decoded);
  }
  const declaredCharset = parameters.get("charset");
  if (declaredCharset !== undefined && !/^(?:utf-8|utf8)$/iu.test(declaredCharset)) throw failure("character-encoding");
  return Object.freeze({ mimeType, charset: declaredCharset === undefined ? null : "utf-8" });
}

function parseEncoding(response) {
  const value = singletonHeader(response, "content-encoding", 64);
  if (value === null || value.trim() === "") return "identity";
  const encoding = value.trim().toLowerCase();
  if (!ALLOWED_ENCODINGS.has(encoding) || value.includes(",")) throw failure("content-encoding");
  return encoding;
}

function declaredLength(response, policy) {
  const value = singletonHeader(response, "content-length", 32);
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw failure("content-length");
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > policy.maxCompressedBytes) throw failure("body-too-large");
  return length;
}

function decodeBody(compressed, encoding, policy) {
  let body;
  try {
    const options = { maxOutputLength: policy.maxDecompressedBytes + 1 };
    if (encoding === "gzip") body = gunzipSync(compressed, options);
    else if (encoding === "br") body = brotliDecompressSync(compressed, options);
    else if (encoding === "deflate") body = inflateSync(compressed, options);
    else body = compressed;
  } catch (cause) {
    throw failure("content-encoding", { cause });
  }
  if (body.length > policy.maxDecompressedBytes) throw failure("body-too-large");
  if (encoding !== "identity" && body.length > Math.max(1, compressed.length) * policy.maxCompressionRatio)
    throw failure("compression-ratio");
  return body;
}

function boundedHeaderList(response, name, maximum = 4_096) {
  const values = rawHeaderValues(response, name);
  let bytes = 0;
  for (const value of values) {
    if (typeof value !== "string" || /[\r\n\0]/u.test(value) || (bytes += Buffer.byteLength(value)) > maximum)
      throw failure("invalid-headers");
  }
  return Object.freeze([...values]);
}

function pinnedLookup(hostname, selected) {
  return (requested, options, callback) => {
    const done = typeof options === "function" ? options : callback;
    const settings = typeof options === "object" && options !== null ? options : {};
    queueMicrotask(() => {
      if (typeof done !== "function" || typeof requested !== "string" || requested.toLowerCase() !== hostname.toLowerCase()) {
        if (typeof done === "function") done(failure("dns-pin"));
        return;
      }
      if (settings.all) done(null, [selected]);
      else done(null, selected.address, selected.family);
    });
  };
}

function sameRemoteAddress(actual, selected) {
  return typeof actual === "string" && addressKey(actual) === addressKey(selected.address) && isIP(actual) === selected.family;
}

function stopResponse(response, error = undefined) {
  response?.once?.("error", () => {});
  response?.destroy?.(error);
}

function performRequest({ requestImpl, url, addresses, selected, resourceKind, resource, policy, abortState }) {
  return new Promise((resolve, reject) => {
    let request, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      abortState.detachRequest(request);
      if (error) reject(error); else resolve(value);
    };
    const rejectWith = error => {
      const safe = error instanceof PublicFetchError ? error : failure("network-failed", { cause: error });
      request?.destroy?.(safe);
      finish(safe);
    };
    const onResponse = response => {
      try {
        validateHeaders(response, policy);
        if (!sameRemoteAddress(response.socket?.remoteAddress, selected)) throw failure("remote-address");
        const status = response.statusCode;
        if (!Number.isInteger(status) || status < 100 || status > 599) throw failure("http-status");
        if (status >= 300 && status <= 399) {
          if (!REDIRECT_STATUSES.has(status)) throw failure("http-status", { status });
          const location = singletonHeader(response, "location", policy.maxUrlBytes);
          if (!location) throw failure("redirect-location", { status });
          let redirectUrl;
          try {
            const target = new URL(location, url);
            publicUrl(target.href, policy);
            redirectUrl = target.href;
          }
          catch { throw failure("redirect-location", { status }); }
          const network = Object.freeze({ dnsAddresses: addresses, selectedAddress: selected.address,
            selectedFamily: selected.family, remoteAddress: response.socket.remoteAddress });
          stopResponse(response);
          request?.destroy?.();
          finish(null, Object.freeze({ kind: "redirect", resourceKind, status, url: url.href, redirectUrl, network }));
          return;
        }
        if (status !== 200) throw failure("http-status", { status });
        const { mimeType, charset } = parseMime(response, resource);
        const contentEncoding = parseEncoding(response);
        const expectedLength = declaredLength(response, policy);
        const chunks = [];
        let compressedBytes = 0;
        response.on("data", chunk => {
          if (settled) return;
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          compressedBytes += value.length;
          if (compressedBytes > policy.maxCompressedBytes) {
            const error = failure("body-too-large");
            stopResponse(response, error);
            rejectWith(error);
            return;
          }
          chunks.push(value);
        });
        response.once("error", rejectWith);
        response.once("aborted", () => rejectWith(failure("response-aborted")));
        response.once("end", () => {
          if (settled) return;
          try {
            if (expectedLength !== null && expectedLength !== compressedBytes) throw failure("content-length");
            const compressed = Buffer.concat(chunks, compressedBytes);
            const body = decodeBody(compressed, contentEncoding, policy);
            let text;
            try { text = new TextDecoder("utf-8", { fatal: true }).decode(body); }
            catch (cause) { throw failure("character-encoding", { cause }); }
            const headers = Object.freeze({
              etag: singletonHeader(response, "etag", 1_024),
              lastModified: singletonHeader(response, "last-modified", 1_024),
              cacheControl: boundedHeaderList(response, "cache-control", 2_048),
              expires: singletonHeader(response, "expires", 1_024),
              xRobotsTag: boundedHeaderList(response, "x-robots-tag", 4_096),
              tdmReservation: singletonHeader(response, "tdm-reservation", 32),
              tdmPolicy: singletonHeader(response, "tdm-policy", 2_048)
            });
            const network = Object.freeze({ dnsAddresses: addresses, selectedAddress: selected.address,
              selectedFamily: selected.family, remoteAddress: response.socket.remoteAddress });
            finish(null, Object.freeze({ kind: "content", resourceKind, status, url: url.href, finalUrl: url.href,
              mimeType, charset, contentEncoding, compressedBytes, body, text, headers, network }));
          } catch (error) { rejectWith(error); }
        });
      } catch (error) {
        stopResponse(response, error);
        rejectWith(error);
      }
    };
    try {
      request = requestImpl({
        protocol: "https:", hostname: url.hostname, port: 443, path: `${url.pathname}${url.search}`,
        method: "GET", agent: false, servername: url.hostname, rejectUnauthorized: true,
        family: selected.family, lookup: pinnedLookup(url.hostname, selected),
        maxHeaderSize: policy.maxHeaderBytes, insecureHTTPParser: false, joinDuplicateHeaders: false,
        headers: Object.freeze({
          "user-agent": CRAWLER_USER_AGENT,
          accept: resource.accept,
          "accept-encoding": "gzip, br, deflate",
          connection: "close"
        })
      }, onResponse);
    } catch (cause) {
      finish(failure("network-failed", { cause }));
      return;
    }
    abortState.attachRequest(request, rejectWith);
    request.maxHeadersCount = policy.maxHeaders;
    request.once?.("error", rejectWith);
    request.once?.("socket", socket => {
      const verify = () => {
        if (socket.remoteAddress && !sameRemoteAddress(socket.remoteAddress, selected)) rejectWith(failure("remote-address"));
      };
      if (socket.connecting) socket.once?.("connect", verify);
      else queueMicrotask(verify);
    });
    request.setTimeout?.(policy.timeoutMs, () => rejectWith(failure("timeout")));
    request.end?.();
  });
}

function createAbortState(signal, timeoutMs) {
  let activeRequest = null, rejectRequest = null, rejectAbort;
  const abortPromise = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = code => {
    const error = failure(code);
    activeRequest?.destroy?.(error);
    rejectRequest?.(error);
    rejectAbort(error);
  };
  const timer = setTimeout(() => abort("timeout"), timeoutMs);
  timer.unref?.();
  const onAbort = () => abort("aborted");
  signal?.addEventListener?.("abort", onAbort, { once: true });
  return {
    abortPromise,
    attachRequest(request, rejecter) { activeRequest = request; rejectRequest = rejecter; },
    detachRequest(request) { if (activeRequest === request) { activeRequest = null; rejectRequest = null; } },
    close() { clearTimeout(timer); signal?.removeEventListener?.("abort", onAbort); }
  };
}

export function createPublicFetcher({ dnsLookup = nodeLookup, requestImpl = nodeRequest, limits = undefined } = {}) {
  if (typeof dnsLookup !== "function" || typeof requestImpl !== "function") throw new TypeError("Invalid public fetch dependency");
  const policy = requestPolicy(limits);
  return async function fetchPublicResource(rawUrl, { signal = undefined, timeoutMs = policy.timeoutMs, resourceKind = "page" } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > policy.timeoutMs ||
        !Object.hasOwn(RESOURCE_KINDS, resourceKind) ||
        (signal !== undefined && (typeof signal !== "object" || typeof signal.aborted !== "boolean")))
      throw new TypeError("Invalid public fetch options");
    if (signal?.aborted) throw failure("aborted");
    const url = publicUrl(rawUrl, policy);
    const abortState = createAbortState(signal, timeoutMs);
    try {
      const addresses = await Promise.race([
        resolvePublicAddresses(url.hostname, { dnsLookup, maxRecords: policy.maxDnsRecords }),
        abortState.abortPromise
      ]);
      const selected = addresses[0];
      const resource = RESOURCE_KINDS[resourceKind];
      const effectivePolicy = Object.freeze({ ...policy, timeoutMs,
        maxCompressedBytes: Math.min(policy.maxCompressedBytes, resource.maxCompressedBytes),
        maxDecompressedBytes: Math.min(policy.maxDecompressedBytes, resource.maxDecompressedBytes) });
      return await Promise.race([
        performRequest({ requestImpl, url, addresses, selected, resourceKind, resource, policy: effectivePolicy, abortState }),
        abortState.abortPromise
      ]);
    } finally {
      abortState.close();
    }
  };
}

export const fetchPublicResource = createPublicFetcher();
