import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createCrawlState } from "../src/crawler/crawl-state.js";
import { representationDigest } from "../src/crawler/diversity.js";
import {
  CrawlerRunError,
  DEFAULT_CRAWL_LIMITS,
  runCrawler,
} from "../src/crawler/crawl-runner.js";
import { PublicFetchError } from "../src/crawler/public-fetch.js";
import { CRAWLER_EXTRACTOR_VERSION } from "../src/crawler/static-capture.js";

const VERSION = Object.freeze({ generation: "canonical-crawler-generation", revision: 40 });
const MODEL_ID = "e5-small-q8-browser-main-prefix-v1";
const sha = value => createHash("sha256").update(value).digest("hex");

function vector(axis = 0) {
  const value = Array(384).fill(0);
  value[axis] = 1;
  return value;
}

function clockFixture() {
  let value = Date.parse("2026-10-12T12:00:00.000Z");
  const sleeps = [];
  return {
    clock: () => value,
    now: () => new Date(value),
    sleep: async milliseconds => { sleeps.push(milliseconds); value += milliseconds; },
    advance: milliseconds => { value += milliseconds; },
    sleeps,
    get value() { return value; },
  };
}

function stateFixture(t, clock) {
  const inner = createCrawlState({ filename: ":memory:", now: clock.now });
  t.after(() => inner.close());
  const terminal = [];
  const names = ["enqueue", "markExisting", "next", "claimRedirect", "stage", "listStaged", "listIngestedVectors",
    "markIngested", "duplicateFor", "bindGeneration", "getPolicy", "setPolicy", "lastRequestAt", "noteRequest",
    "counts", "attemptedCount"];
  const state = Object.fromEntries(names.map(name => [name, (...args) => inner[name](...args)]));
  state.terminal = (...args) => { terminal.push(args); return inner.terminal(...args); };
  return { inner, state: Object.freeze(state), terminal };
}

function manifest(seeds, { bucketMax = 100, allowedHosts = null } = {}) {
  const hosts = allowedHosts ?? [...new Set(seeds.map(seed => new URL(seed).hostname))];
  return {
    schema: "murmingle-crawl-manifest/v1",
    rightsAcknowledged: true,
    buckets: [{
      id: "fixture-bucket",
      rightsBasis: "Synthetic public publisher permission for an offline runner fixture.",
      maxPages: bucketMax,
      allowedHosts: hosts,
      allowedQueryKeys: [],
      seeds,
    }],
  };
}

function clientFixture({ urls = [], ingest = null, token = "SYNTHETIC_TOKEN_MUST_NOT_LEAK" } = {}) {
  const calls = { known: 0, ingest: [] };
  return {
    token,
    calls,
    client: Object.freeze({
      async knownSourceUrls() { calls.known += 1; return { version: VERSION, urls: [...urls] }; },
      async ingest(representation, operationId, expected) {
        calls.ingest.push({ representation: structuredClone(representation), operationId, expected: { ...expected } });
        if (ingest) return ingest(representation, operationId, expected, calls.ingest.length);
        return { sourceId: "source-runner", topicId: "topic-runner", version: { ...VERSION, revision: VERSION.revision + calls.ingest.length } };
      },
    }),
  };
}

function embedderFixture() {
  const texts = [];
  return {
    texts,
    embedder: Object.freeze({ async embed(text) { texts.push(text); return { modelId: MODEL_ID, values: vector(texts.length - 1) }; } }),
  };
}

function fetchFixture(handler, clock) {
  const calls = [];
  return {
    calls,
    fetchPublic: async (url, options) => {
      calls.push({ url, resourceKind: options.resourceKind, signal: options.signal, at: clock.value });
      return handler(url, options, calls);
    },
  };
}

function content(text, url, headers = {}) {
  const body = Buffer.from(text, "utf8");
  return {
    body,
    result: {
      kind: "content",
      status: 200,
      url,
      mimeType: "text/html",
      text,
      headers: { xRobotsTag: [], tdmReservation: null, ...headers },
      body,
    },
  };
}

function article(title = "Synthetic runner title", extra = "") {
  const prose = Array.from({ length: 30 }, (_, index) => `Public article sentence ${index} covers a distinct bounded fact.`).join(" ");
  return `<html><head><title>${title}</title>${extra}</head><body><article>${prose}</article></body></html>`;
}

function standardFetch(clock, { page, robots = "", tdm = null } = {}) {
  return fetchFixture(async (url, options) => {
    if (options.resourceKind === "robots") return { kind: "content", text: robots };
    if (options.resourceKind === "tdmrep") {
      if (tdm === null) throw new PublicFetchError("http-status", { status: 404 });
      return { kind: "content", text: tdm };
    }
    return typeof page === "function" ? page(url, options) : page;
  }, clock);
}

function options({ state, client, fetchPublic, embedder, campaign, clock, ...rest }) {
  return { state, client, fetchPublic, embedder, manifest: campaign, clock: clock.clock, sleep: clock.sleep, ...rest };
}

test("default preview stages a bounded representation but never calls canonical ingestion", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const client = clientFixture();
  const embedder = embedderFixture();
  const seed = "https://news.alpha.org/articles/summary-secret-url";
  const page = content(article("SUMMARY_SECRET_TITLE"), seed);
  const fetch = standardFetch(clock, { page: page.result });
  const result = await runCrawler(options({ state: state.state, client: client.client, fetchPublic: fetch.fetchPublic,
    embedder: embedder.embedder, campaign: manifest([seed]), clock }));

  assert.deepEqual(result, {
    campaign: "wikimedia-balanced-v1",
    mode: "preview",
    reason: "frontier-empty",
    attemptedThisRun: 1,
    stagedThisRun: 1,
    ingestedThisRun: 0,
    counts: { staged: 1 },
  });
  assert.equal(client.calls.ingest.length, 0);
  assert.equal(embedder.texts.length, 1);
  assert.deepEqual(fetch.calls.map(call => call.resourceKind), ["robots", "tdmrep", "page"]);
  assert.equal(page.body.every(byte => byte === 0), true);
  const serialized = JSON.stringify(result);
  for (const secret of [seed, "news.alpha.org", "SUMMARY_SECRET_TITLE", client.token]) assert.equal(serialized.includes(secret), false);
  assert.deepEqual(Object.keys(result).sort(), ["attemptedThisRun", "campaign", "counts", "ingestedThisRun", "mode", "reason", "stagedThisRun"]);
});

test("apply resumes an already staged representation without refetching it", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const seed = "https://news.alpha.org/articles/resume-staged";
  state.inner.enqueue({ url: seed, bucket: "fixture-bucket", depth: 0, priority: 0, parentDigest: null });
  const row = state.inner.next({ maxDepth: 2, perHost: 100, bucketLimits: new Map([["fixture-bucket", 100]]) });
  const values = vector(7);
  const title = "Durable staged title";
  const representation = representationDigest({ url: seed, title, vector: values, extractorVersion: CRAWLER_EXTRACTOR_VERSION });
  state.inner.stage({ urlDigest: row.urlDigest, title, vector: values, extractorVersion: CRAWLER_EXTRACTOR_VERSION,
    representationDigest: representation, contentDigest: sha("staged-content"), simhash: "0123456789abcdef", links: [] });
  const client = clientFixture();
  const embedder = embedderFixture();
  const fetch = fetchFixture(() => { throw new Error("staged work must not be fetched"); }, clock);

  const result = await runCrawler(options({ state: state.state, client: client.client, fetchPublic: fetch.fetchPublic,
    embedder: embedder.embedder, campaign: manifest([seed]), clock, apply: true }));
  assert.equal(result.mode, "apply");
  assert.equal(result.attemptedThisRun, 0);
  assert.equal(result.stagedThisRun, 0);
  assert.equal(result.ingestedThisRun, 1);
  assert.deepEqual(result.counts, { ingested: 1 });
  assert.equal(fetch.calls.length, 0);
  assert.equal(embedder.texts.length, 0);
  assert.equal(client.calls.ingest.length, 1);
  assert.deepEqual(client.calls.ingest[0].representation, {
    url: seed,
    title,
    embedding: { modelId: MODEL_ID, values },
    extractorVersion: CRAWLER_EXTRACTOR_VERSION,
  });
  assert.match(client.calls.ingest[0].operationId, /^crawl-[a-f0-9]{64}$/u);
  assert.deepEqual(client.calls.ingest[0].expected, VERSION);
  assert.equal(state.inner.getByDigest(row.urlDigest).state, "ingested");
  assert.equal(state.inner.getByDigest(row.urlDigest).url, null);
});

test("already canonical URLs are sealed as existing and are never fetched or embedded", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const seed = "https://news.alpha.org/articles/already-canonical";
  const client = clientFixture({ urls: [seed] });
  const embedder = embedderFixture();
  const fetch = fetchFixture(() => { throw new Error("canonical Source must not be fetched"); }, clock);
  const result = await runCrawler(options({ state: state.state, client: client.client, fetchPublic: fetch.fetchPublic,
    embedder: embedder.embedder, campaign: manifest([seed]), clock, apply: true }));
  assert.equal(result.attemptedThisRun, 0);
  assert.equal(result.stagedThisRun, 0);
  assert.equal(result.ingestedThisRun, 0);
  assert.deepEqual(result.counts, { existing: 1 });
  assert.equal(fetch.calls.length, 0);
  assert.equal(embedder.texts.length, 0);
  assert.equal(client.calls.ingest.length, 0);
});

test("policy and page redirects stay on the exact origin and fail closed otherwise", async (t) => {
  await t.test("off-origin policy redirect pauses the origin", async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const seed = "https://news.alpha.org/articles/policy-redirect";
    const fetch = fetchFixture(async () => ({ kind: "redirect", redirectUrl: "https://other.beta.net/robots.txt" }), clock);
    const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
      embedder: embedderFixture().embedder, campaign: manifest([seed], { allowedHosts: ["news.alpha.org", "other.beta.net"] }), clock }));
    assert.deepEqual(result.counts, { failed: 1 });
    assert.equal(fetch.calls.length, 1);
    assert.equal(state.terminal.at(-1)[2], "policy-unavailable");
  });

  await t.test("off-origin page redirect is rejected without fetching its target", async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const seed = "https://news.alpha.org/articles/page-redirect";
    const fetch = standardFetch(clock, { page: { kind: "redirect", redirectUrl: "https://other.beta.net/articles/target" } });
    const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
      embedder: embedderFixture().embedder, campaign: manifest([seed], { allowedHosts: ["news.alpha.org", "other.beta.net"] }), clock }));
    assert.deepEqual(result.counts, { rejected: 1 });
    assert.equal(fetch.calls.filter(call => call.resourceKind === "page").length, 1);
    assert.equal(state.terminal.at(-1)[2], "redirect-rejected");
  });

  await t.test("an exact-origin query-free policy redirect remains usable", async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const seed = "https://news.alpha.org/articles/policy-redirect-ok";
    let robotsCalls = 0;
    const page = content(article(), seed);
    const fetch = fetchFixture(async (url, request) => {
      if (request.resourceKind === "robots" && robotsCalls++ === 0)
        return { kind: "redirect", redirectUrl: "https://news.alpha.org/robots-current.txt" };
      if (request.resourceKind === "robots") return { kind: "content", text: "" };
      if (request.resourceKind === "tdmrep") throw new PublicFetchError("http-status", { status: 404 });
      return page.result;
    }, clock);
    const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
      embedder: embedderFixture().embedder, campaign: manifest([seed]), clock }));
    assert.deepEqual(result.counts, { staged: 1 });
    assert.deepEqual(fetch.calls.map(call => call.resourceKind), ["robots", "robots", "tdmrep", "page"]);
  });
});

test("robots, TDM and noindex signals block before embedding or ingestion", async (t) => {
  const cases = [
    {
      name: "robots disallow",
      robots: "User-agent: *\nDisallow: /articles/policy-block",
      terminal: "robots-denied",
    },
    {
      name: "TDMRep reservation",
      tdm: '[{"location":"/","tdm-reservation":1}]',
      terminal: "tdm-reserved",
    },
    {
      name: "TDM header reservation",
      headers: { tdmReservation: "1" },
      terminal: "tdm-reserved",
    },
    {
      name: "ambiguous TDM header",
      headers: { tdmReservation: "unknown" },
      terminal: "tdm-ambiguous",
    },
    {
      name: "X-Robots noindex",
      headers: { xRobotsTag: "noindex" },
      terminal: "indexing-disallowed",
    },
    {
      name: "HTML noindex",
      extra: '<meta name="robots" content="noindex">',
      terminal: "indexing-disallowed",
    },
    {
      name: "HTML notrain",
      extra: '<meta name="robots" content="notrain">',
      terminal: "indexing-disallowed",
    },
    {
      name: "crawler-specific HTML noindex",
      extra: '<meta name="MurmingleTopicCrawler" content="noindex">',
      terminal: "indexing-disallowed",
    },
    {
      name: "malformed HTML TDM reservation",
      extra: '<meta name="tdm-reservation" content="unknown">',
      terminal: "tdm-ambiguous",
    },
    {
      name: "contradictory repeated HTML TDM reservations",
      extra: '<meta name="tdm-reservation" content="0"><meta name="tdm-reservation" content="1">',
      terminal: "tdm-ambiguous",
    },
  ];
  for (const value of cases) await t.test(value.name, async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const seed = "https://news.alpha.org/articles/policy-block";
    const page = content(article("Policy fixture", value.extra ?? ""), seed, value.headers);
    const fetch = standardFetch(clock, { page: page.result, robots: value.robots ?? "", tdm: value.tdm ?? null });
    const client = clientFixture();
    const embedder = embedderFixture();
    const result = await runCrawler(options({ state: state.state, client: client.client, fetchPublic: fetch.fetchPublic,
      embedder: embedder.embedder, campaign: manifest([seed]), clock, apply: true }));
    assert.deepEqual(result.counts, { blocked: 1 });
    assert.equal(state.terminal.at(-1)[2], value.terminal);
    assert.equal(embedder.texts.length, 0);
    assert.equal(client.calls.ingest.length, 0);
  });
});

test("an unsafe static document is rejected without terminating later crawl work", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const seeds = ["https://news.alpha.org/articles/unsafe-first", "https://news.alpha.org/articles/safe-second"];
  const excessiveAttributes = Array.from({ length: 129 }, (_, index) => `data-${index}="safe"`).join(" ");
  const unsafe = content(`<html><head><meta ${excessiveAttributes} name="robots" content="noindex"></head>
    <body><article>${article()}</article></body></html>`, seeds[0]);
  const safe = content(article("Safe continuation"), seeds[1]);
  const fetch = standardFetch(clock, { page: url => url === seeds[0] ? unsafe.result : safe.result });
  const embedder = embedderFixture();

  const result = await runCrawler(options({ state: state.state, client: clientFixture().client,
    fetchPublic: fetch.fetchPublic, embedder: embedder.embedder, campaign: manifest(seeds), clock }));
  assert.equal(result.attemptedThisRun, 2);
  assert.deepEqual(result.counts, { rejected: 1, staged: 1 });
  assert.deepEqual(state.terminal.map(args => args[2]), ["unsafe-document"]);
  assert.equal(embedder.texts.length, 1);
  assert.equal(fetch.calls.filter(call => call.resourceKind === "page").length, 2);
  assert.equal(unsafe.body.every(byte => byte === 0), true);
  assert.equal(safe.body.every(byte => byte === 0), true);
});

test("429 pauses an origin and later queued pages on it make no network request", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const seeds = ["https://news.alpha.org/articles/rate-one", "https://news.alpha.org/articles/rate-two"];
  const fetch = standardFetch(clock, { page: async () => { throw new PublicFetchError("http-status", { status: 429 }); } });
  const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
    embedder: embedderFixture().embedder, campaign: manifest(seeds), clock }));
  assert.deepEqual(result.counts, { blocked: 1, queued: 1 });
  assert.equal(result.attemptedThisRun, 1);
  assert.equal(fetch.calls.filter(call => call.resourceKind === "page").length, 1);
  assert.deepEqual(state.terminal.map(args => args[2]), ["rate-limited"]);
});

test("durable origin pacing honors crawl-delay without real waiting", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const seed = "https://news.alpha.org/articles/paced";
  const page = content(article(), seed);
  const fetch = standardFetch(clock, { page: page.result, robots: "User-agent: *\nCrawl-delay: 5" });
  await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
    embedder: embedderFixture().embedder, campaign: manifest([seed]), clock }));
  assert.deepEqual(clock.sleeps, [0, 5_000, 5_000]);
  assert.deepEqual(fetch.calls.map(call => call.at), [
    Date.parse("2026-10-12T12:00:00.000Z"),
    Date.parse("2026-10-12T12:00:05.000Z"),
    Date.parse("2026-10-12T12:00:10.000Z"),
  ]);
  assert.equal(state.inner.lastRequestAt("https://news.alpha.org"), Date.parse("2026-10-12T12:00:10.000Z"));
});

test("in-run origin policy memory expires after twenty-four hours and is refetched", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const seeds = ["https://news.alpha.org/articles/policy-first", "https://news.alpha.org/articles/policy-second"];
  let pages = 0;
  const fetch = fetchFixture(async (url, request) => {
    if (request.resourceKind === "robots") return { kind: "content", text: "" };
    if (request.resourceKind === "tdmrep") throw new PublicFetchError("http-status", { status: 404 });
    pages += 1;
    const result = content(article().replaceAll("distinct bounded fact", `page ${pages} bounded fact`), url).result;
    if (pages === 1) clock.advance(24 * 60 * 60 * 1_000 + 1);
    return result;
  }, clock);

  const result = await runCrawler(options({ state: state.state, client: clientFixture().client,
    fetchPublic: fetch.fetchPublic, embedder: embedderFixture().embedder, campaign: manifest(seeds), clock }));
  assert.equal(result.attemptedThisRun, 2);
  assert.equal(pages, 2);
  assert.deepEqual(fetch.calls.map(call => call.resourceKind), [
    "robots", "tdmrep", "page", "robots", "tdmrep", "page",
  ]);
});

test("overall, bucket, host and duration campaign caps stop before extra fetches", async (t) => {
  assert.deepEqual(DEFAULT_CRAWL_LIMITS, { maxPages: 5_000, maxDepth: 2, perHost: 1_250, perSection: 100, maxDurationMs: 0 });
  const seeds = ["https://news.alpha.org/articles/cap-one", "https://news.alpha.org/articles/cap-two"];

  await t.test("overall attempt cap", async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const pages = [];
    const fetch = standardFetch(clock, { page: url => { pages.push(url); return content(article(), url).result; } });
    const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
      embedder: embedderFixture().embedder, campaign: manifest(seeds), clock, maxPages: 1 }));
    assert.equal(result.reason, "campaign-limit");
    assert.equal(result.attemptedThisRun, 1);
    assert.deepEqual(result.counts, { queued: 1, staged: 1 });
    assert.equal(pages.length, 1);
  });

  await t.test("bucket attempt cap", async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const pages = [];
    const fetch = standardFetch(clock, { page: url => { pages.push(url); return content(article(), url).result; } });
    const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
      embedder: embedderFixture().embedder, campaign: manifest(seeds, { bucketMax: 1 }), clock, maxPages: 10 }));
    assert.equal(result.reason, "frontier-empty");
    assert.equal(result.attemptedThisRun, 1);
    assert.deepEqual(result.counts, { queued: 1, staged: 1 });
    assert.equal(pages.length, 1);
  });

  await t.test("host attempt cap", async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const pages = [];
    const fetch = standardFetch(clock, { page: url => { pages.push(url); return content(article(), url).result; } });
    const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
      embedder: embedderFixture().embedder, campaign: manifest(seeds), clock, maxPages: 10, perHost: 1 }));
    assert.equal(result.attemptedThisRun, 1);
    assert.deepEqual(result.counts, { queued: 1, staged: 1 });
    assert.equal(pages.length, 1);
  });

  await t.test("duration cap before required policy pacing", async t => {
    const clock = clockFixture();
    const state = stateFixture(t, clock);
    const page = content(article(), seeds[0]);
    const fetch = standardFetch(clock, { page: page.result, robots: "User-agent: *\nCrawl-delay: 5" });
    const result = await runCrawler(options({ state: state.state, client: clientFixture().client, fetchPublic: fetch.fetchPublic,
      embedder: embedderFixture().embedder, campaign: manifest([seeds[0]]), clock, maxDurationMs: 5_000 }));
    assert.equal(result.reason, "time-limit");
    assert.deepEqual(result.counts, { failed: 1 });
    assert.deepEqual(fetch.calls.map(call => call.resourceKind), ["robots"]);
    assert.equal(state.terminal.at(-1)[2], "time-limit");
  });

  const invalidClock = clockFixture();
  const invalidState = stateFixture(t, invalidClock);
  await assert.rejects(runCrawler(options({ state: invalidState.state, client: clientFixture().client,
    fetchPublic: async () => { throw new Error("must not fetch"); }, embedder: embedderFixture().embedder,
    campaign: manifest([seeds[0]]), clock: invalidClock, maxPages: 50_001 })), /Invalid crawler limits/u);
});

test("operator abort and fixed runner errors contain no page data", async (t) => {
  const clock = clockFixture();
  const state = stateFixture(t, clock);
  const client = clientFixture();
  const embedder = embedderFixture();
  const controller = new AbortController();
  controller.abort();
  const result = await runCrawler(options({ state: state.state, client: client.client,
    fetchPublic: async () => { throw new Error("must not fetch"); }, embedder: embedder.embedder,
    campaign: manifest(["https://news.alpha.org/articles/abort-secret"]), clock, signal: controller.signal }));
  assert.equal(result.reason, "aborted");
  assert.equal(result.attemptedThisRun, 0);
  assert.equal(JSON.stringify(result).includes("abort-secret"), false);
  const error = new CrawlerRunError("policy-unavailable");
  assert.equal(error.message, "policy-unavailable");
  assert.equal(error.code, "policy-unavailable");
});

function incrementalFixture({ pages = 60, backlog = 0, failIngestAt = 0, preview = false, onProgress } = {}) {
  const clock = clockFixture();
  const staged = [], prior = [], calls = [], progress = [];
  let fetched = 0, attempted = 0;
  function candidate(index) {
    const url = `https://news.alpha.org/articles/incremental-${index}`;
    return { url, urlDigest: sha(url), bucket: "fixture-bucket", host: "news.alpha.org", section: "articles",
      title: "PRIVATE_FIXTURE_TITLE", vector: vector(index % 384), extractorVersion: CRAWLER_EXTRACTOR_VERSION,
      representationDigest: sha(`representation-${index}`) };
  }
  for (let index = 0; index < backlog; index++) staged.push(candidate(index + 10_000));
  const state = {
    enqueue() {}, markExisting() {}, claimRedirect() {}, terminal() {}, bindGeneration() {},
    getPolicy() { return null; }, setPolicy() {}, lastRequestAt() { return null; }, noteRequest() {},
    attemptedCount() { return attempted; }, duplicateFor() { return null; },
    next() { if (attempted >= pages) return null; return { ...candidate(attempted++), depth: 0, priority: 0 }; },
    stage(item) { staged.push({ ...candidate(attempted - 1), ...item }); },
    listStaged() { return [...staged]; }, listIngestedVectors() { return [...prior]; },
    markIngested(urlDigest) { const index = staged.findIndex(item => item.urlDigest === urlDigest); prior.push(...staged.splice(index, 1)); },
    counts() { return { staged: staged.length, ingested: prior.length }; },
  };
  const client = clientFixture({ ingest(_representation, operationId, expected, index) {
    calls.push({ fetched, operationId, expected });
    if (index === failIngestAt) throw new Error("PRIVATE_FIXTURE_PROVIDER_ERROR");
    return { sourceId: "source", topicId: "topic", version: { ...VERSION, revision: VERSION.revision + index } };
  } });
  const fetch = standardFetch(clock, { page: url => { fetched++; return content(article(), url).result; } });
  const run = extra => runCrawler(options({ state, client: client.client, fetchPublic: fetch.fetchPublic,
    embedder: { async embed() { return { modelId: MODEL_ID, values: vector(fetched % 384) }; } },
    campaign: manifest([candidate(0).url], { bucketMax: 1_000 }), clock, maxPages: 1_000,
    perHost: 1_000, perSection: 1_000, apply: !preview,
    onProgress(value) { progress.push(value); return onProgress?.(value); }, ...extra }));
  return { run, calls, progress, staged, get fetched() { return fetched; }, clock };
}

test("incremental apply publishes before frontier completion and chains accepted revisions across passes", async () => {
  const fixture = incrementalFixture();
  const result = await fixture.run();
  assert.equal(result.ingestedThisRun, 60);
  assert.equal(fixture.calls[0].fetched, 25);
  assert.equal(fixture.calls[25].fetched, 50);
  assert.equal(fixture.calls[50].fetched, 60);
  fixture.calls.forEach((call, index) => assert.deepEqual(call.expected, { ...VERSION, revision: VERSION.revision + index }));
  assert.equal(new Set(fixture.calls.map(call => call.operationId)).size, 60);
});

test("initial backlog import stays at250 and total500 ends apply without further crawling", async () => {
  const fixture = incrementalFixture({ backlog: 475, pages: 300 });
  const result = await fixture.run();
  assert.equal(result.reason, "apply-limit");
  assert.equal(result.ingestedThisRun, 500);
  assert.equal(fixture.fetched, 250);
  assert.equal(fixture.calls.filter(call => call.fetched === 0).length, 250);
  assert.equal(fixture.staged.length, 225);
});

test("final flush consumes only the remaining run budget and checkpoints retain prior section quotas", async () => {
  const budget = incrementalFixture({ backlog: 475, pages: 249 });
  const result = await budget.run();
  assert.equal(result.reason, "apply-limit");
  assert.equal(result.ingestedThisRun, 500);
  assert.equal(budget.calls.filter(call => call.fetched === 249).length, 25);
  assert.equal(budget.staged.length, 224);
  const quota = incrementalFixture();
  const limited = await quota.run({ perSection: 30 });
  assert.equal(limited.ingestedThisRun, 30);
  assert.equal(quota.calls.length, 30);
  assert.equal(quota.staged.length, 30);
});

test("checkpoint failure stops fetch and retry immediately, preserving staged rows and fixed counters", async () => {
  const fixture = incrementalFixture({ failIngestAt: 3 });
  const result = await fixture.run();
  assert.equal(result.reason, "ingest-unavailable");
  assert.equal(result.ingestedThisRun, 2);
  assert.equal(fixture.fetched, 25);
  assert.equal(fixture.calls.length, 3);
  assert.equal(fixture.staged.length, 23);
  const serialized = JSON.stringify(fixture.progress);
  for (const secret of ["https:", "PRIVATE_FIXTURE", "representation", "source", "token", "vector"]) assert.equal(serialized.includes(secret), false);
  fixture.progress.forEach(value => {
    const keys = ["attemptedThisRun", "event", "ingestedThisRun", "phase", "stagedThisRun"];
    if (value.event === "ingest-failed") {
      keys.push("ingestError");
      assert.equal(value.ingestError, "unknown");
    }
    assert.deepEqual(Object.keys(value).sort(), keys.sort());
  });
});

test("checkpoint failure stays authoritative when campaign cap is reached", async () => {
  const fixture = incrementalFixture({ failIngestAt: 1, pages: 25 });
  const result = await fixture.run({ maxPages: 25 });
  assert.equal(result.reason, "ingest-unavailable");
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.staged.length, 25);
});

test("preview checkpoints remain write free and throwing or rejected progress observers do not stop apply", async () => {
  const preview = incrementalFixture({ preview: true });
  assert.equal((await preview.run()).ingestedThisRun, 0);
  assert.equal(preview.calls.length, 0);
  const throwing = incrementalFixture({ onProgress() { throw new Error("observer failed"); } });
  assert.equal((await throwing.run()).ingestedThisRun, 60);
  const rejecting = incrementalFixture({ onProgress() { return Promise.reject(new Error("observer rejected")); } });
  assert.equal((await rejecting.run()).ingestedThisRun, 60);
});

test("checkpoint abort and deadline stop before dispatching a canonical write", async () => {
  for (const mode of ["abort", "deadline"]) {
    const controller = new AbortController();
    let fixture;
    fixture = incrementalFixture({ onProgress(value) {
      if (value.event === "page" && value.stagedThisRun === 25) {
        if (mode === "abort") controller.abort();
        else fixture.clock.advance(10_000);
      }
    } });
    const result = await fixture.run({ signal: controller.signal, maxDurationMs: mode === "deadline" ? 10_000 : 0 });
    assert.equal(result.reason, mode === "abort" ? "aborted" : "time-limit");
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.staged.length, 25);
  }
});
