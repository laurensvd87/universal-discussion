import { createHash } from "node:crypto";
import { inspectPageNavigationUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

const NON_DOCUMENT_EXTENSION = /\.(?:7z|avi|avif|bin|bmp|bz2|css|csv|docx?|eot|epub|exe|flac|gif|gz|ico|jpe?g|js|json|m4[av]|mkv|mov|mp3|mp4|mpeg|ogg|ogv|otf|pdf|png|pptx?|rar|rss|svg|tar|tiff?|tsv|ttf|txt|wav|web[mp]|woff2?|xlsx?|xml|xz|zip)$/iu;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const BUCKET = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;

export function normalizeCrawlUrl(raw, base = undefined, allowedQueryKeys = []) {
  if (typeof raw !== "string" || /[\p{Cc}\p{Cf};|`<>]|\$\(/u.test(raw) ||
      /%(?:3b|3c|3e|60|7c)|%24(?:%28|\()/iu.test(raw) || !Array.isArray(allowedQueryKeys) ||
      allowedQueryKeys.some(key => typeof key !== "string" || !key || key.length > 64 || /[\p{Cc}\p{Cf}]/u.test(key))) return null;
  let resolved;
  try { resolved = base === undefined ? new URL(raw) : new URL(raw, base); }
  catch { return null; }
  const inspected = inspectPageNavigationUrl(resolved.href);
  if (!inspected.supported) return null;
  const parsed = new URL(inspected.url);
  if (parsed.protocol !== "https:" || parsed.port && parsed.port !== "443" || NON_DOCUMENT_EXTENSION.test(parsed.pathname) ||
      /%25(?:2e|2f|5c)/iu.test(parsed.pathname) || [...parsed.searchParams.keys()].some(key => !allowedQueryKeys.includes(key))) return null;
  parsed.username = ""; parsed.password = ""; parsed.hash = "";
  return parsed.href;
}

export function crawlHost(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (!HOST.test(host)) throw new TypeError("Invalid crawl host");
  return host;
}

export function crawlSection(url) {
  const parsed = new URL(url);
  let first = "root";
  try { first = decodeURIComponent(parsed.pathname).split("/").filter(Boolean)[0] ?? "root"; }
  catch { /* Retain the fixed fallback for malformed escapes. */ }
  const normalized = first.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 80);
  return `${parsed.hostname.toLowerCase()}/${normalized || "root"}`;
}

export function stableOperationId(url, representationDigest) {
  if (typeof representationDigest !== "string" || !/^[a-f0-9]{64}$/u.test(representationDigest))
    throw new TypeError("Invalid crawler representation");
  return `crawl-${createHash("sha256").update(url).update("\0").update(representationDigest).digest("hex")}`;
}

export function readSeedManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join(",") !== "buckets,rightsAcknowledged,schema" ||
      value.schema !== "murmingle-crawl-manifest/v1" || value.rightsAcknowledged !== true ||
      !Array.isArray(value.buckets) || value.buckets.length < 1 || value.buckets.length > 64) {
    throw new TypeError("Invalid crawler manifest");
  }
  const bucketIds = new Set();
  const buckets = value.buckets.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.getPrototypeOf(entry) !== Object.prototype ||
        Object.keys(entry).sort().join(",") !== "allowedHosts,allowedQueryKeys,id,maxPages,rightsBasis,seeds" ||
        typeof entry.id !== "string" || !BUCKET.test(entry.id) || bucketIds.has(entry.id) ||
        typeof entry.rightsBasis !== "string" || !entry.rightsBasis.trim() || entry.rightsBasis.length > 500 ||
        !Number.isInteger(entry.maxPages) || entry.maxPages < 1 || entry.maxPages > 10_000 ||
        !Array.isArray(entry.allowedHosts) || entry.allowedHosts.length < 1 || entry.allowedHosts.length > 64 ||
        !Array.isArray(entry.allowedQueryKeys) || entry.allowedQueryKeys.length > 32 ||
        !Array.isArray(entry.seeds) || entry.seeds.length < 1 || entry.seeds.length > 128) {
      throw new TypeError("Invalid crawler manifest");
    }
    bucketIds.add(entry.id);
    const hosts = entry.allowedHosts.map(host => {
      if (typeof host !== "string" || host !== host.toLowerCase() || !HOST.test(host)) throw new TypeError("Invalid crawler manifest");
      return host;
    });
    if (new Set(hosts).size !== hosts.length) throw new TypeError("Invalid crawler manifest");
    const allowedQueryKeys = entry.allowedQueryKeys.map(key => {
      if (typeof key !== "string" || !key || key.length > 64 || /[\p{Cc}\p{Cf}]/u.test(key)) throw new TypeError("Invalid crawler manifest");
      return key;
    });
    if (new Set(allowedQueryKeys).size !== allowedQueryKeys.length) throw new TypeError("Invalid crawler manifest");
    const allowed = new Set(hosts);
    const seeds = entry.seeds.map(seed => {
      const url = normalizeCrawlUrl(seed, undefined, allowedQueryKeys);
      if (!url || !allowed.has(crawlHost(url))) throw new TypeError("Invalid crawler manifest");
      return url;
    });
    if (new Set(seeds).size !== seeds.length) throw new TypeError("Invalid crawler manifest");
    return Object.freeze({ id: entry.id, rightsBasis: entry.rightsBasis.trim(), maxPages: entry.maxPages,
      allowedHosts: Object.freeze(hosts), allowedQueryKeys: Object.freeze(allowedQueryKeys), seeds: Object.freeze(seeds) });
  });
  return Object.freeze({ schema: value.schema, rightsAcknowledged: true, buckets: Object.freeze(buckets) });
}

export function bucketForHost(manifest, bucketId, url) {
  const bucket = manifest.buckets.find(entry => entry.id === bucketId);
  try { return bucket && bucket.allowedHosts.includes(crawlHost(url)) ? bucket : null; }
  catch { return null; }
}

export function chooseDiverseLinks(links, { baseUrl, bucket, limit = 100 }) {
  if (!Array.isArray(links) || !bucket || !Number.isInteger(limit) || limit < 0 || limit > 500) throw new TypeError("Invalid link selection");
  const baseOrigin = new URL(baseUrl).origin;
  const unique = new Map();
  for (const link of links.slice(0, 4_000)) {
    const url = normalizeCrawlUrl(link?.href, baseUrl, bucket.allowedQueryKeys);
    if (!url || new URL(url).origin !== baseOrigin || !bucket.allowedHosts.includes(crawlHost(url)) || unique.has(url)) continue;
    unique.set(url, { url, section: crawlSection(url), hash: createHash("sha256").update(url).digest("hex") });
  }
  const groups = new Map();
  for (const item of unique.values()) {
    if (!groups.has(item.section)) groups.set(item.section, []);
    groups.get(item.section).push(item);
  }
  for (const group of groups.values()) group.sort((a, b) => a.hash.localeCompare(b.hash));
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entries]) => entries);
  const selected = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const group of orderedGroups) if (group[round] && selected.length < limit) {
      selected.push(group[round].url); added = true;
    }
    if (!added) break;
  }
  return selected;
}
