import http from "node:http";

const HOST = "127.0.0.1";
const PORT = 4174;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/u;
const MAX_RESPONSE = 1_048_576;
const MAX_CATALOG_PAGES = 1_000;
const MAX_CATALOG_SOURCES = 100_000;

export class CrawlerApiError extends Error {
  constructor(code) { super(code); this.name = "CrawlerApiError"; this.code = code; }
}

export function createLocalIngestClient({ token, timeoutMs = 10_000, requestImpl = http.request } = {}) {
  if (typeof token !== "string" || !TOKEN.test(token) || !Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000 ||
      typeof requestImpl !== "function") throw new TypeError("Invalid local crawler authentication");

  function request(method, apiPath, value) {
    const body = value === undefined ? null : Buffer.from(JSON.stringify(value), "utf8");
    if (body && body.length > 65_536) { body.fill(0); throw new CrawlerApiError("request-capacity"); }
    return new Promise((resolve, reject) => {
      let settled = false, timer, response;
      const chunks = [];
      const fail = code => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        for (const chunk of chunks) chunk.fill(0);
        body?.fill(0);
        try { response?.destroy(); } catch {}
        reject(new CrawlerApiError(code));
      };
      let outgoing;
      try {
        outgoing = requestImpl({ protocol: "http:", hostname: HOST, port: PORT, path: apiPath, method, agent: false,
          headers: { authorization: `Bearer ${token}`, accept: "application/json",
            ...(body ? { "content-type": "application/json", "content-length": String(body.length) } : {}) } }, incoming => {
          response = incoming;
          const contentType = incoming.headers["content-type"] ?? "";
          const length = incoming.headers["content-length"];
          if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType) ||
              length !== undefined && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE)) { fail("invalid-response"); return; }
          let size = 0;
          incoming.on("data", chunk => {
            if (settled || !Buffer.isBuffer(chunk)) { fail("invalid-response"); return; }
            size += chunk.length;
            if (size > MAX_RESPONSE) { fail("invalid-response"); return; }
            chunks.push(Buffer.from(chunk));
          });
          incoming.once("error", () => fail("ambiguous"));
          incoming.once("end", () => {
            if (settled) return;
            let parsed;
            const bytes = Buffer.concat(chunks);
            try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
            catch { bytes.fill(0); fail("invalid-response"); return; }
            bytes.fill(0); for (const chunk of chunks) chunk.fill(0); body?.fill(0); clearTimeout(timer); settled = true;
            if (incoming.statusCode !== 200) {
              const mapped = { 400: "invalid-request", 401: "unauthorized", 403: "forbidden", 409: "conflict", 413: "capacity" }[incoming.statusCode] ?? "unavailable";
              reject(new CrawlerApiError(mapped)); return;
            }
            resolve(parsed);
          });
        });
        outgoing.once("error", () => fail("ambiguous"));
        timer = setTimeout(() => { try { outgoing.destroy(); } catch {} fail("ambiguous"); }, timeoutMs);
        if (body) outgoing.end(body); else outgoing.end();
      } catch { fail("ambiguous"); }
    });
  }

  async function version() {
    const value = await request("GET", "/v1/version");
    if (!plain(value, ["version"]) || !isVersion(value.version)) throw new CrawlerApiError("invalid-response");
    return value.version;
  }

  async function knownSourceUrls() {
    const urls = [];
    const seenCursors = new Set();
    let cursor = null, expected = null, pages = 0;
    do {
      const value = await request("POST", "/v1/catalog/page", { kind: "sources", limit: 100, cursor });
      if (!plain(value, ["catalog", "nextCursor"]) || !value.catalog || !isVersion(value.catalog.version) || !Array.isArray(value.catalog.sources) ||
          value.catalog.sources.length > 100 || typeof value.nextCursor !== "string" && value.nextCursor !== null ||
          typeof value.nextCursor === "string" && (!CURSOR.test(value.nextCursor) || seenCursors.has(value.nextCursor)) ||
          ++pages > MAX_CATALOG_PAGES) throw new CrawlerApiError("invalid-response");
      expected ??= value.catalog.version;
      if (expected.generation !== value.catalog.version.generation || expected.revision !== value.catalog.version.revision)
        throw new CrawlerApiError("conflict");
      for (const source of value.catalog.sources) {
        if (!source || typeof source.url !== "string" || source.url.length > 2_048) throw new CrawlerApiError("invalid-response");
        urls.push(source.url);
        if (urls.length > MAX_CATALOG_SOURCES) throw new CrawlerApiError("capacity");
      }
      if (value.nextCursor !== null) seenCursors.add(value.nextCursor);
      cursor = value.nextCursor;
    } while (cursor !== null);
    return { version: expected ?? await version(), urls };
  }

  async function ingest(representation, operationId, initialVersion) {
    if (!validRepresentation(representation) || !ID.test(operationId) || !isVersion(initialVersion))
      throw new TypeError("Invalid crawler ingestion");
    const generation = initialVersion.generation;
    let expected = initialVersion, ambiguous = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const value = await request("POST", "/v1/sources/ingest", { ...representation, expected, operationId });
        if (!plain(value, ["assignment", "policyVersion", "sourceId", "topicId", "version"]) || !isVersion(value.version) ||
            !ID.test(value.sourceId) || !ID.test(value.topicId) || !["provisional", "confirmed"].includes(value.assignment) ||
            typeof value.policyVersion !== "string" || value.version.generation !== expected.generation || value.version.revision < expected.revision)
          throw new CrawlerApiError("invalid-response");
        return value;
      } catch (error) {
        if (!(error instanceof CrawlerApiError)) throw error;
        if (error.code === "ambiguous" && !ambiguous) { ambiguous = true; continue; }
        if (!["ambiguous", "conflict"].includes(error.code)) throw error;
        expected = await version();
        if (expected.generation !== generation) throw new CrawlerApiError("conflict");
        ambiguous = false;
      }
    }
    throw new CrawlerApiError("conflict");
  }

  return Object.freeze({ version, knownSourceUrls, ingest });
}

function plain(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isVersion(value) {
  return plain(value, ["generation", "revision"]) && ID.test(value.generation) && Number.isSafeInteger(value.revision) && value.revision >= 0;
}

function validRepresentation(value) {
  if (!plain(value, ["url", "title", "embedding", "extractorVersion"]) || typeof value.url !== "string" ||
      value.url.length < 1 || value.url.length > 2_048 || typeof value.title !== "string" || value.title.length < 1 ||
      value.title.length > 200 || value.extractorVersion !== "crawler-static-html-prefix/v1" ||
      !plain(value.embedding, ["modelId", "values"]) || value.embedding.modelId !== "e5-small-q8-browser-main-prefix-v1") return false;
  const vector = value.embedding.values;
  return Array.isArray(vector) && Object.getPrototypeOf(vector) === Array.prototype && vector.length === 384 &&
    Reflect.ownKeys(vector).length === 385 && vector.every(Number.isFinite) && Math.abs(Math.hypot(...vector) - 1) <= 1e-5;
}
