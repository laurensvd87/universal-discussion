import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createCrawlState } from "../src/crawler/crawl-state.js";

const extractorVersion = "crawler-static-html-prefix/v1";
const vector = (axis = 0) => Object.assign(Array(384).fill(0), { [axis]: 1 });
const sha = value => createHash("sha256").update(value).digest("hex");

function diskFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "murmingle-crawl-state-"));
  const filename = path.join(directory, "crawl.sqlite");
  return { filename, cleanup() {
    assert.ok(directory.startsWith(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  } };
}

function enqueue(state, url, overrides = {}) {
  return state.enqueue({ url, bucket: "news", depth: 0, priority: 10, ...overrides });
}

function stageNext(state, url, overrides = {}) {
  assert.equal(enqueue(state, url, overrides.frontier), true);
  const claimed = state.next({ maxDepth: 16, perHost: 1_000 });
  assert.equal(claimed.url, url);
  const contentDigest = overrides.contentDigest ?? sha(`content:${url}`);
  const simhash = overrides.simhash ?? "0123456789abcdef";
  state.stage({
    urlDigest: claimed.urlDigest,
    title: overrides.title ?? `Title for ${new URL(url).pathname}`,
    vector: overrides.vector ?? vector(),
    extractorVersion,
    representationDigest: overrides.representationDigest ?? sha(`representation:${url}`),
    contentDigest,
    simhash,
    links: overrides.links ?? [],
  });
  return { ...claimed, contentDigest, simhash };
}

test("terminal URL digests provide exact no-revisit semantics and minimize raw URLs", (t) => {
  const { filename, cleanup } = diskFixture();
  const state = createCrawlState({ filename });
  t.after(() => state.close());
  t.after(cleanup);
  const url = "https://news.alpha.org/world/exact";
  assert.equal(enqueue(state, url), true);
  assert.equal(enqueue(state, url, { depth: 0, priority: 1 }), false);
  const claimed = state.next({ maxDepth: 2, perHost: 5 });
  assert.equal(claimed.url, url);
  assert.equal(claimed.state, "attempted");
  assert.equal(state.terminal(claimed.urlDigest, "blocked", "robots-denied"), true);
  assert.deepEqual(state.getByDigest(claimed.urlDigest), {
    url: null,
    urlDigest: claimed.urlDigest,
    bucket: "news",
    host: "news.alpha.org",
    section: "news.alpha.org/world",
    depth: 0,
    priority: 1,
    parentDigest: null,
    state: "blocked",
    title: null,
    extractorVersion: null,
    representationDigest: null,
    contentDigest: null,
    simhash: null,
    sourceId: null,
    topicId: null,
  });
  assert.equal(enqueue(state, url), false);
  assert.equal(state.terminal(claimed.urlDigest, "failed", "second-terminal"), false);
  assert.equal(state.next({ maxDepth: 16, perHost: 5 }), null);

  const existing = "https://science.beta.net/research/already-canonical";
  assert.equal(state.markExisting(existing), true);
  assert.equal(state.markExisting(existing), false);
  assert.equal(enqueue(state, existing), false);
  assert.equal(state.getByDigest(sha(existing)).url, null);
  assert.deepEqual(state.counts(), { blocked: 1, existing: 1 });
});

test("an interrupted attempted URL is sealed as uncertain on reopen and cannot be revisited", (t) => {
  const { filename, cleanup } = diskFixture();
  t.after(cleanup);
  const url = "https://news.alpha.org/world/interrupted";
  let state = createCrawlState({ filename, now: () => new Date("2026-10-12T10:00:00.000Z") });
  enqueue(state, url);
  const claimed = state.next({ maxDepth: 1, perHost: 5 });
  state.close();

  state = createCrawlState({ filename, now: () => new Date("2026-10-12T10:01:00.000Z") });
  assert.equal(state.getByDigest(claimed.urlDigest).state, "failed");
  assert.equal(state.getByDigest(claimed.urlDigest).url, null);
  assert.equal(enqueue(state, url), false);
  assert.equal(state.next({ maxDepth: 1, perHost: 5 }), null);
  state.close();

  const db = new DatabaseSync(filename, { readOnly: true });
  const row = db.prepare("SELECT state,status_code,attempted_at,completed_at,url,title,vector_json FROM crawl_urls WHERE url_digest=?").get(claimed.urlDigest);
  db.close();
  assert.deepEqual({ ...row }, {
    state: "failed",
    status_code: "interrupted-uncertain",
    attempted_at: "2026-10-12T10:00:00.000Z",
    completed_at: "2026-10-12T10:01:00.000Z",
    url: null,
    title: null,
    vector_json: null,
  });
});

test("staged vectors and linked frontier resume exactly across reopen and ingestion", (t) => {
  const { filename, cleanup } = diskFixture();
  t.after(cleanup);
  const url = "https://news.alpha.org/science/staged";
  const linked = "https://science.beta.net/research/linked";
  let state = createCrawlState({ filename });
  const staged = stageNext(state, url, {
    vector: vector(7),
    title: "Durable staged representation",
    links: [{ url: linked, bucket: "science", depth: 1, priority: 20, parentDigest: sha(url) }],
  });
  assert.deepEqual(state.counts(), { queued: 1, staged: 1 });
  state.close();

  state = createCrawlState({ filename });
  const resumed = state.listStaged();
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].url, url);
  assert.equal(resumed[0].title, "Durable staged representation");
  assert.deepEqual(resumed[0].vector, vector(7));
  assert.equal(state.getByDigest(sha(linked)).parentDigest, sha(url));
  state.markIngested(staged.urlDigest, { sourceId: "source-staged", topicId: "topic-staged" });
  assert.deepEqual(state.listStaged(), []);
  const ingested = state.listIngestedVectors();
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0].url, null);
  assert.equal(ingested[0].title, null);
  assert.equal(ingested[0].sourceId, "source-staged");
  assert.equal(ingested[0].topicId, "topic-staged");
  assert.deepEqual(ingested[0].vector, vector(7));
  state.close();

  state = createCrawlState({ filename });
  assert.deepEqual(state.listIngestedVectors()[0].vector, vector(7));
  assert.equal(enqueue(state, url), false);
  state.close();
});

test("exact and near duplicate fingerprints resolve deterministically", (t) => {
  const state = createCrawlState({ filename: ":memory:" });
  t.after(() => state.close());
  const first = stageNext(state, "https://news.alpha.org/world/original", {
    contentDigest: "a".repeat(64),
    simhash: "0000000000000000",
  });
  const secondUrl = "https://science.beta.net/research/copy";
  assert.deepEqual(state.duplicateFor("a".repeat(64), "ffffffffffffffff", sha(secondUrl)), {
    kind: "exact",
    urlDigest: first.urlDigest,
  });
  assert.deepEqual(state.duplicateFor("b".repeat(64), "0000000000000001", sha(secondUrl)), {
    kind: "near",
    urlDigest: first.urlDigest,
  });
  assert.equal(state.duplicateFor("b".repeat(64), "000000000000000f", sha(secondUrl)), null);

  const second = stageNext(state, secondUrl, { contentDigest: "a".repeat(64), simhash: "0000000000000001" });
  assert.equal(state.terminal(second.urlDigest, "duplicate", "duplicate-content", {
    finalDigest: first.urlDigest,
    contentDigest: second.contentDigest,
    simhash: second.simhash,
  }), true);
  assert.equal(state.getByDigest(second.urlDigest).url, null);
  assert.deepEqual(state.counts(), { duplicate: 1, staged: 1 });
});

test("generation binding fails closed and rebase abandons unfinished work without retained URLs", (t) => {
  const state = createCrawlState({ filename: ":memory:" });
  t.after(() => state.close());
  state.bindGeneration("canonical-one");
  state.bindGeneration("canonical-one");
  assert.throws(() => state.bindGeneration("canonical-two"), /another canonical generation/u);

  const queuedUrl = "https://news.alpha.org/world/queued";
  const attemptedUrl = "https://news.alpha.org/world/attempted";
  const stagedUrl = "https://science.beta.net/research/staged";
  stageNext(state, stagedUrl, { frontier: { priority: 0 }, vector: vector(3) });
  enqueue(state, attemptedUrl, { priority: 20 });
  const attempted = state.next({ maxDepth: 16, perHost: 10 });
  assert.equal(attempted.url, attemptedUrl);
  enqueue(state, queuedUrl, { priority: 30 });

  state.bindGeneration("canonical-two", { rebase: true });
  assert.equal(state.getByDigest(sha(queuedUrl)), null);
  for (const digest of [sha(attemptedUrl), sha(stagedUrl)]) {
    const row = state.getByDigest(digest);
    assert.equal(row.state, "abandoned");
    assert.equal(row.url, null);
    assert.equal(row.title, null);
  }
  assert.deepEqual(state.listStaged(), []);
  assert.equal(state.next({ maxDepth: 16, perHost: 10 }), null);
});

test("frontier priority, depth and fair host limits are deterministic", (t) => {
  const state = createCrawlState({ filename: ":memory:" });
  t.after(() => state.close());
  const urgent = "https://one.alpha.org/a";
  const later = "https://two.beta.org/b";
  enqueue(state, urgent, { bucket: "urgent", priority: 0 });
  enqueue(state, later, { bucket: "later", priority: 100 });
  const first = state.next({ maxDepth: 16, perHost: 1 });
  assert.equal(first.url, urgent);
  state.terminal(first.urlDigest, "blocked", "fixture-complete");

  const sameHost = "https://one.alpha.org/c";
  enqueue(state, sameHost, { bucket: "urgent", priority: 0 });
  const second = state.next({ maxDepth: 16, perHost: 1 });
  assert.equal(second.url, later);
  state.terminal(second.urlDigest, "blocked", "fixture-complete");
  assert.equal(state.next({ maxDepth: 16, perHost: 1 }), null);
  assert.equal(state.terminal(sha(sameHost), "rejected", "host-limit"), true);

  const shallow = "https://three.gamma.org/shallow";
  const deep = "https://four.delta.org/deep";
  enqueue(state, deep, { bucket: "depth", depth: 2, priority: 0 });
  enqueue(state, shallow, { bucket: "depth", depth: 1, priority: 100 });
  assert.equal(state.next({ maxDepth: 1, perHost: 5 }).url, shallow);
});

test("a capped host cannot hide eligible work beyond one thousand queued URLs", (t) => {
  const state = createCrawlState({ filename: ":memory:" });
  t.after(() => state.close());
  const cappedHost = "https://capped.alpha.org";
  enqueue(state, `${cappedHost}/attempted`, { priority: 0 });
  const attempted = state.next({ maxDepth: 16, perHost: 1 });
  assert.equal(attempted.url, `${cappedHost}/attempted`);
  state.terminal(attempted.urlDigest, "blocked", "fixture-complete");

  for (let index = 0; index < 1_001; index += 1) {
    enqueue(state, `${cappedHost}/queued/${index}`, { priority: 0 });
  }
  const eligible = "https://eligible.beta.org/after-capped-frontier";
  enqueue(state, eligible, { priority: 100 });

  assert.equal(state.next({ maxDepth: 16, perHost: 1 }).url, eligible);
});

test("only one crawl-state owner can open a file at a time", (t) => {
  const { filename, cleanup } = diskFixture();
  t.after(cleanup);
  const first = createCrawlState({ filename });
  assert.throws(() => createCrawlState({ filename }));
  first.close();
  const reopened = createCrawlState({ filename });
  reopened.close();
});

test("unlimited frontier and redirect claims retain deep queued work beyond explicit historical quotas", t => {
  const state = createCrawlState({ filename: ":memory:" });
  t.after(() => state.close());
  for (let index = 0; index < 101; index++) {
    enqueue(state, `https://one.alpha.org/wiki/old-${index}`);
    const row = state.next({ maxDepth: -1, perHost: 0, bucketLimits: new Map([["news", 0]]) });
    state.terminal(row.urlDigest, "rejected", "fixture-complete");
  }
  const deep = "https://one.alpha.org/wiki/deep";
  enqueue(state, deep, { depth: 30 });
  assert.equal(state.next({ maxDepth: 2, perHost: 0 }), null);
  assert.equal(state.next({ maxDepth: -1, perHost: 100 }), null);
  assert.equal(state.next({ maxDepth: -1, perHost: 0, bucketLimits: new Map([["news", 100]]) }), null);
  const row = state.next({ maxDepth: -1, perHost: 0, bucketLimits: new Map([["news", 0]]) });
  assert.equal(row.url, deep);
  assert.equal(state.claimRedirect({ url: "https://one.alpha.org/wiki/redirect", bucket: "news", depth: 30,
    priority: 0, parentDigest: row.urlDigest }).depth, 30);
});

test("bounded staged windows skip capped sections and rotate across buckets with full SQL counts", t => {
  const state = createCrawlState({ filename: ":memory:" });
  t.after(() => state.close());
  const ingested = stageNext(state, "https://one.alpha.org/full/old");
  state.markIngested(ingested.urlDigest, { sourceId: "source-old", topicId: "topic-old" });
  for (let index = 0; index < 20; index++) stageNext(state, `https://one.alpha.org/full/staged-${index}`);
  const eligible = stageNext(state, "https://one.alpha.org/new/eligible");
  const other = stageNext(state, "https://other.beta.org/new/eligible", { frontier: { bucket: "other" } });
  const counts = state.selectionCounts();
  assert.equal(counts.bucket.get("news"), 1);
  assert.equal(counts.host.get("one.alpha.org"), 1);
  const limits = new Map([["news", 0], ["other", 0]]);
  const window = state.listStaged(2, { bucketLimits: limits, perSection: 1 });
  assert.deepEqual(new Set(window.map(item => item.urlDigest)), new Set([eligible.urlDigest, other.urlDigest]));
  assert.equal(state.listStaged(2, { bucketLimits: new Map([["news", 1], ["other", 0]]) })[0].urlDigest, other.urlDigest);
  assert.equal(state.listStaged(2, { bucketLimits: limits, perHost: 1 })[0].urlDigest, other.urlDigest);
  assert.equal(state.listStaged(2).length, 2);
});
