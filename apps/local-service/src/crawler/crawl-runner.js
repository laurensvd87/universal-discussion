import { createHash } from "node:crypto";
import { BUILT_IN_SOURCE_ID, BUILT_IN_SOURCE_MANIFEST, isBuiltInSourceUrl } from "./built-in-sources.js";
import { representationDigest, selectDiverseCandidates, simhash64 } from "./diversity.js";
import { PublicFetchError } from "./public-fetch.js";
import {
  evaluateRobots,
  matchTdmRep,
  parseRobotsTxt,
  parseTdmRepJson,
  parseTdmReservation,
  parseXRobotsDirectives,
  restoreRobotsPolicy,
  restoreTdmRepPolicy,
  serializeRobotsPolicy,
  serializeTdmRepPolicy,
  tdmRepUrlFor,
} from "./robots.js";
import { captureStaticHtml, CRAWLER_EXTRACTOR_VERSION } from "./static-capture.js";
import {
  bucketForHost,
  chooseDiverseLinks,
  crawlHost,
  normalizeCrawlUrl,
  readSeedManifest,
  stableOperationId,
} from "./url-policy.js";

const MIN_ORIGIN_DELAY_MS = 2_000;
const POLICY_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_POLICY_REDIRECTS = 3;
const MAX_PAGE_REDIRECTS = 5;
const MAX_LINKS_PER_PAGE = 64;
const APPLY_BATCH = 250;
const NOVELTY_PRIOR_LIMIT = 256;
const MODEL_ID = "e5-small-q8-browser-main-prefix-v1";

export const DEFAULT_CRAWL_LIMITS = Object.freeze({
  maxPages: 5_000,
  maxDepth: 2,
  perHost: 1_250,
  perSection: 100,
  maxDurationMs: 0,
});

export class CrawlerRunError extends Error {
  constructor(code) {
    super(code);
    this.name = "CrawlerRunError";
    this.code = code;
  }
}

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function fail(code) { throw new CrawlerRunError(code); }

function abortableDelay(milliseconds, signal) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() { signal?.removeEventListener?.("abort", abort); resolve(); }
    function abort() { clearTimeout(timer); signal?.removeEventListener?.("abort", abort); reject(new CrawlerRunError("aborted")); }
    signal?.addEventListener?.("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function plainManifest(manifest) {
  let clone;
  try { clone = JSON.parse(JSON.stringify(manifest)); }
  catch { throw new TypeError("Invalid crawler manifest"); }
  return readSeedManifest(clone);
}

function checkDependencies({ state, client, fetchPublic, embedder }) {
  const stateMethods = ["enqueue", "markExisting", "next", "claimRedirect", "stage", "terminal", "listStaged",
    "listIngestedVectors", "markIngested", "duplicateFor", "bindGeneration", "getPolicy", "setPolicy",
    "lastRequestAt", "noteRequest", "counts", "attemptedCount"];
  if (!state || stateMethods.some(name => typeof state[name] !== "function") || !client ||
      typeof client.knownSourceUrls !== "function" || typeof client.ingest !== "function" ||
      typeof fetchPublic !== "function" || !embedder || typeof embedder.embed !== "function")
    throw new TypeError("Invalid crawler dependencies");
}

function checkLimits({ maxPages, maxDepth, perHost, perSection, maxDurationMs }) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50_000 ||
      !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 8 ||
      !Number.isInteger(perHost) || perHost < 1 || perHost > 50_000 ||
      !Number.isInteger(perSection) || perSection < 1 || perSection > 10_000 ||
      !Number.isInteger(maxDurationMs) || maxDurationMs < 0 || maxDurationMs > 7 * 86_400_000)
    throw new TypeError("Invalid crawler limits");
}

function exactPolicyRedirect(raw, origin) {
  let url;
  try { url = new URL(raw); }
  catch { return null; }
  if (url.origin !== origin || url.protocol !== "https:" || (url.port && url.port !== "443") ||
      url.username || url.password || url.hash || url.search) return null;
  return url.href;
}

function pageFailure(error) {
  if (!(error instanceof PublicFetchError)) return { state: "failed", code: "fetch-failed", stopOrigin: true };
  if (error.code === "aborted") return { state: "failed", code: "operator-aborted", stopOrigin: false, aborted: true };
  if (error.code === "http-status") {
    if (error.status === 401 || error.status === 403) return { state: "blocked", code: "access-denied", stopOrigin: true };
    if (error.status === 404 || error.status === 410) return { state: "rejected", code: "not-found", stopOrigin: false };
    if (error.status === 429) return { state: "blocked", code: "rate-limited", stopOrigin: true };
    return { state: "failed", code: "upstream-unavailable", stopOrigin: error.status >= 500 };
  }
  if (["timeout", "network-failed", "dns-failed", "dns-invalid", "dns-non-public", "dns-pin", "remote-address"].includes(error.code))
    return { state: "failed", code: "fetch-unavailable", stopOrigin: true };
  return { state: "rejected", code: "unsafe-response", stopOrigin: false };
}

function safePageUrl(raw, base, bucket, builtIn) {
  const value = normalizeCrawlUrl(raw, base, bucket.allowedQueryKeys);
  try {
    if (!value || !bucket.allowedHosts.includes(crawlHost(value)) || new URL(value).origin !== new URL(base).origin ||
        builtIn && !isBuiltInSourceUrl(value)) return null;
    return value;
  } catch { return null; }
}

function summary({ apply, reason, attemptedThisRun, stagedThisRun, ingestedThisRun, state }) {
  return Object.freeze({
    campaign: BUILT_IN_SOURCE_ID,
    mode: apply ? "apply" : "preview",
    reason,
    attemptedThisRun,
    stagedThisRun,
    ingestedThisRun,
    counts: state.counts(),
  });
}

export async function runCrawler({
  state,
  client,
  fetchPublic,
  embedder,
  manifest = BUILT_IN_SOURCE_MANIFEST,
  apply = false,
  rebase = false,
  maxPages = DEFAULT_CRAWL_LIMITS.maxPages,
  maxDepth = DEFAULT_CRAWL_LIMITS.maxDepth,
  perHost = DEFAULT_CRAWL_LIMITS.perHost,
  perSection = DEFAULT_CRAWL_LIMITS.perSection,
  maxDurationMs = DEFAULT_CRAWL_LIMITS.maxDurationMs,
  clock = Date.now,
  sleep = abortableDelay,
  signal = undefined,
} = {}) {
  checkDependencies({ state, client, fetchPublic, embedder });
  checkLimits({ maxPages, maxDepth, perHost, perSection, maxDurationMs });
  if (typeof apply !== "boolean" || typeof rebase !== "boolean" || typeof clock !== "function" || typeof sleep !== "function" ||
      (signal !== undefined && (typeof signal !== "object" || typeof signal.aborted !== "boolean")))
    throw new TypeError("Invalid crawler options");
  const isBuiltIn = manifest === BUILT_IN_SOURCE_MANIFEST;
  const campaign = plainManifest(manifest);
  const buckets = new Map(campaign.buckets.map(bucket => [bucket.id, bucket]));
  const bucketLimits = new Map(campaign.buckets.map(bucket => [bucket.id, bucket.maxPages]));
  const startedAt = clock();
  const deadline = maxDurationMs === 0 ? Infinity : startedAt + maxDurationMs;
  const stoppedHosts = new Set();
  const policyMemory = new Map();
  let attemptedThisRun = 0, stagedThisRun = 0, ingestedThisRun = 0, reason = "frontier-empty";
  let canonical;

  function timeAvailable() { return clock() < deadline && !signal?.aborted; }

  async function pace(origin, delayMs = MIN_ORIGIN_DELAY_MS) {
    const required = Math.max(MIN_ORIGIN_DELAY_MS, delayMs);
    const previous = state.lastRequestAt(origin);
    const wait = previous === null ? 0 : Math.max(0, previous + required - clock());
    if (clock() + wait >= deadline) fail("time-limit");
    await sleep(wait, signal);
    if (signal?.aborted) fail("aborted");
    state.noteRequest(origin);
  }

  async function fetchPolicyResource(initialUrl, resourceKind, origin, delayMs) {
    let current = initialUrl;
    for (let redirects = 0; redirects <= MAX_POLICY_REDIRECTS; redirects += 1) {
      await pace(origin, delayMs);
      try {
        const result = await fetchPublic(current, { resourceKind, signal });
        if (result.kind === "content") {
          const text = result.text;
          result.body?.fill?.(0);
          return text;
        }
        if (result.kind !== "redirect" || redirects === MAX_POLICY_REDIRECTS) fail("policy-unavailable");
        const redirected = exactPolicyRedirect(result.redirectUrl, origin);
        if (!redirected) fail("policy-unavailable");
        current = redirected;
      } catch (error) {
        if (error instanceof PublicFetchError && error.code === "http-status" && [404, 410].includes(error.status)) return null;
        if (error instanceof CrawlerRunError) throw error;
        fail(error instanceof PublicFetchError && error.code === "aborted" ? "aborted" : "policy-unavailable");
      }
    }
    fail("policy-unavailable");
  }

  async function originPolicy(pageUrl) {
    const origin = new URL(pageUrl).origin;
    const remembered = policyMemory.get(origin);
    if (remembered && remembered.expiresAt > clock()) return remembered.value;
    policyMemory.delete(origin);
    const saved = state.getPolicy(origin);
    if (saved) {
      try {
        const restored = Object.freeze({ robots: restoreRobotsPolicy(saved.robots),
          tdm: saved.tdm === null ? null : restoreTdmRepPolicy(saved.tdm) });
        const expiresAt = Date.parse(saved.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= clock()) fail("policy-state-invalid");
        policyMemory.set(origin, Object.freeze({ value: restored, expiresAt }));
        return restored;
      } catch { fail("policy-state-invalid"); }
    }
    const robotsText = await fetchPolicyResource(`${origin}/robots.txt`, "robots", origin, MIN_ORIGIN_DELAY_MS);
    let robots;
    try { robots = parseRobotsTxt(robotsText ?? ""); }
    catch { fail("policy-unavailable"); }
    const tdmUrl = tdmRepUrlFor(pageUrl);
    const tdmRobots = evaluateRobots(robots, tdmUrl);
    if (!tdmRobots.allowed) fail("policy-unavailable");
    const tdmText = await fetchPolicyResource(tdmUrl, "tdmrep", origin, tdmRobots.crawlDelayMs);
    let tdm = null;
    try { if (tdmText !== null) tdm = parseTdmRepJson(tdmText); }
    catch { fail("policy-unavailable"); }
    state.setPolicy(origin, { robots: serializeRobotsPolicy(robots),
      tdm: tdm === null ? null : serializeTdmRepPolicy(tdm), ttlMs: POLICY_TTL_MS });
    const value = Object.freeze({ robots, tdm });
    policyMemory.set(origin, Object.freeze({ value, expiresAt: clock() + POLICY_TTL_MS }));
    return value;
  }

  function linkRecords(capture, row, bucket, baseUrl, nofollow) {
    if (nofollow || row.depth >= maxDepth) return [];
    return chooseDiverseLinks(capture.links, { baseUrl, bucket, limit: MAX_LINKS_PER_PAGE })
      .filter(url => !isBuiltIn || isBuiltInSourceUrl(url))
      .map((url, index) => ({ url, bucket: row.bucket, depth: row.depth + 1,
        priority: Math.min(1_000_000, row.priority + 1 + index), parentDigest: row.urlDigest }));
  }

  function enqueueRecords(records) {
    for (const record of records) state.enqueue(record);
  }

  async function crawlOne(firstRow) {
    let row = firstRow;
    for (let redirects = 0; redirects <= MAX_PAGE_REDIRECTS; redirects += 1) {
      const bucket = buckets.get(row.bucket);
      if (!bucket || typeof row.url !== "string") {
        state.terminal(row.urlDigest, "failed", "state-invalid");
        return;
      }
      const origin = new URL(row.url).origin;
      if (stoppedHosts.has(row.host)) {
        state.terminal(row.urlDigest, "failed", "origin-paused");
        return;
      }
      let policy;
      try { policy = await originPolicy(row.url); }
      catch (error) {
        if (error instanceof CrawlerRunError && ["aborted", "time-limit"].includes(error.code)) {
          state.terminal(row.urlDigest, "failed", error.code === "aborted" ? "operator-aborted" : "time-limit");
          throw error;
        }
        state.terminal(row.urlDigest, "failed", "policy-unavailable");
        stoppedHosts.add(row.host);
        return;
      }
      const robots = evaluateRobots(policy.robots, row.url);
      if (!robots.allowed) {
        state.terminal(row.urlDigest, "blocked", "robots-denied");
        return;
      }
      let response;
      try {
        await pace(origin, robots.crawlDelayMs);
        response = await fetchPublic(row.url, { resourceKind: "page", signal });
      } catch (error) {
        if (error instanceof CrawlerRunError && error.code === "time-limit") {
          state.terminal(row.urlDigest, "failed", "time-limit");
          throw error;
        }
        const mapped = pageFailure(error);
        state.terminal(row.urlDigest, mapped.state, mapped.code);
        if (mapped.stopOrigin) stoppedHosts.add(row.host);
        if (mapped.aborted) throw new CrawlerRunError("aborted");
        return;
      }
      if (response.kind === "redirect") {
        if (redirects === MAX_PAGE_REDIRECTS) {
          state.terminal(row.urlDigest, "rejected", "redirect-limit");
          return;
        }
        const target = safePageUrl(response.redirectUrl, row.url, bucket, isBuiltIn);
        if (!target) {
          state.terminal(row.urlDigest, "rejected", "redirect-rejected");
          return;
        }
        const finalDigest = digest(target);
        const next = state.claimRedirect({ url: target, bucket: row.bucket, depth: row.depth, priority: row.priority,
          parentDigest: row.urlDigest, maxAttempts: maxPages, bucketLimit: bucket.maxPages, perHost });
        state.terminal(row.urlDigest, "alias", "redirect-alias", { finalDigest });
        if (!next) return;
        row = next;
        attemptedThisRun += 1;
        continue;
      }
      try {
        if (!response || response.kind !== "content" || !["text/html", "application/xhtml+xml"].includes(response.mimeType)) {
          state.terminal(row.urlDigest, "rejected", "unsupported-document");
          return;
        }
        let headerRobots, capture;
        try {
          headerRobots = parseXRobotsDirectives(response.headers.xRobotsTag);
          capture = captureStaticHtml(response.text, row.url);
        } catch {
          state.terminal(row.urlDigest, "rejected", "unsafe-document");
          return;
        }
        let reservation = policy.tdm === null ? null : matchTdmRep(policy.tdm, row.url).reservation;
        if (response.headers.tdmReservation !== null) {
          const headerReservation = parseTdmReservation(response.headers.tdmReservation);
          if (headerReservation === null) {
            state.terminal(row.urlDigest, "blocked", "tdm-ambiguous");
            return;
          }
          reservation = headerReservation;
        }
        if (capture.directives.tdmReservationInvalid) {
          state.terminal(row.urlDigest, "blocked", "tdm-ambiguous");
          return;
        }
        if (capture.directives.tdmReservation !== null) reservation = capture.directives.tdmReservation;
        if (reservation === 1) {
          state.terminal(row.urlDigest, "blocked", "tdm-reserved");
          return;
        }
        if (headerRobots.blocked || capture.directives.noindex) {
          state.terminal(row.urlDigest, "blocked", "indexing-disallowed");
          return;
        }
        const links = linkRecords(capture, row, bucket, row.url,
          headerRobots.nofollow || capture.directives.nofollow);
        if (!capture.eligible || capture.contentHash === null) {
          enqueueRecords(links);
          state.terminal(row.urlDigest, "rejected", "insufficient-text");
          return;
        }
        const fingerprint = simhash64(capture.text);
        const duplicate = state.duplicateFor(capture.contentHash, fingerprint, row.urlDigest);
        if (duplicate) {
          enqueueRecords(links);
          state.terminal(row.urlDigest, "duplicate", "duplicate-content", { finalDigest: duplicate.urlDigest,
            contentDigest: capture.contentHash, simhash: fingerprint });
          return;
        }
        let embedded;
        try { embedded = await embedder.embed(capture.text); }
        catch {
          state.terminal(row.urlDigest, "failed", "embedding-failed");
          throw new CrawlerRunError("embedding-unavailable");
        }
        if (!embedded || embedded.modelId !== MODEL_ID || !Array.isArray(embedded.values)) {
          state.terminal(row.urlDigest, "failed", "embedding-invalid");
          throw new CrawlerRunError("embedding-unavailable");
        }
        const vector = [...embedded.values];
        const representation = representationDigest({ url: row.url, title: capture.title, vector,
          extractorVersion: CRAWLER_EXTRACTOR_VERSION });
        state.stage({ urlDigest: row.urlDigest, title: capture.title, vector,
          extractorVersion: CRAWLER_EXTRACTOR_VERSION, representationDigest: representation,
          contentDigest: capture.contentHash, simhash: fingerprint, links });
        stagedThisRun += 1;
        return;
      } finally {
        response.body?.fill?.(0);
      }
    }
  }

  async function applyStaged() {
    if (!apply || !timeAvailable()) return;
    const staged = state.listStaged(50_000).map(item => ({ ...item, section: `${item.bucket}/${item.section}` }));
    if (!staged.length) return;
    const prior = state.listIngestedVectors(100_000).map(item => ({ ...item, section: `${item.bucket}/${item.section}` }));
    const selected = selectDiverseCandidates(staged, { limit: Math.min(staged.length, APPLY_BATCH), bucketLimits,
      perHost, perSection, prior, noveltyPriorLimit: Math.min(prior.length, NOVELTY_PRIOR_LIMIT) });
    let expected = canonical.version;
    for (const item of selected) {
      if (!timeAvailable()) { reason = signal?.aborted ? "aborted" : "time-limit"; return; }
      const operationId = stableOperationId(item.url, item.representationDigest);
      try {
        const result = await client.ingest({ url: item.url, title: item.title,
          embedding: { modelId: MODEL_ID, values: item.vector }, extractorVersion: item.extractorVersion }, operationId, expected);
        state.markIngested(item.urlDigest, { sourceId: result.sourceId, topicId: result.topicId });
        expected = result.version;
        ingestedThisRun += 1;
      } catch { reason = "ingest-unavailable"; return; }
    }
  }

  canonical = await client.knownSourceUrls();
  state.bindGeneration(canonical.version.generation, { rebase });
  for (const rawUrl of canonical.urls) for (const bucket of campaign.buckets) {
    const url = normalizeCrawlUrl(rawUrl, undefined, bucket.allowedQueryKeys);
    if (!url || !bucketForHost(campaign, bucket.id, url) || isBuiltIn && !isBuiltInSourceUrl(url)) continue;
    state.markExisting(url, bucket.id);
    break;
  }
  for (const bucket of campaign.buckets) for (let index = 0; index < bucket.seeds.length; index += 1)
    state.enqueue({ url: bucket.seeds[index], bucket: bucket.id, depth: 0, priority: index, parentDigest: null });

  await applyStaged();
  if (reason !== "ingest-unavailable") {
    while (state.attemptedCount() < maxPages && timeAvailable()) {
      const row = state.next({ maxDepth, perHost, bucketLimits, excludedHosts: stoppedHosts });
      if (!row) { reason = "frontier-empty"; break; }
      attemptedThisRun += 1;
      try { await crawlOne(row); }
      catch (error) {
        if (error instanceof CrawlerRunError && error.code === "aborted") { reason = "aborted"; break; }
        if (error instanceof CrawlerRunError && error.code === "time-limit") { reason = "time-limit"; break; }
        if (error instanceof CrawlerRunError && error.code === "embedding-unavailable") { reason = error.code; break; }
        throw error;
      }
    }
    if (state.attemptedCount() >= maxPages) reason = "campaign-limit";
    else if (!timeAvailable()) reason = signal?.aborted ? "aborted" : "time-limit";
    await applyStaged();
  }
  return summary({ apply, reason, attemptedThisRun, stagedThisRun, ingestedThisRun, state });
}
