import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  bucketForHost,
  chooseDiverseLinks,
  crawlHost,
  crawlSection,
  normalizeCrawlUrl,
  readSeedManifest,
  stableOperationId,
} from "../src/crawler/url-policy.js";

function manifest(overrides = {}) {
  return {
    schema: "murmingle-crawl-manifest/v1",
    rightsAcknowledged: true,
    buckets: [{
      id: "public-interest",
      rightsBasis: "  Synthetic publisher permission recorded for this fixture.  ",
      maxPages: 25,
      allowedHosts: ["news.alpha.org", "science.beta.net"],
      allowedQueryKeys: ["edition", "page"],
      seeds: [
        "https://news.alpha.org/world/start?edition=morning&utm_source=fixture&sessionid=discard#lead",
        "https://science.beta.net/research?page=2",
      ],
      ...overrides,
    }],
  };
}

test("seed manifests require the exact schema, rights declaration and bucket fields", () => {
  const parsed = readSeedManifest(manifest());
  assert.deepEqual(parsed, {
    schema: "murmingle-crawl-manifest/v1",
    rightsAcknowledged: true,
    buckets: [{
      id: "public-interest",
      rightsBasis: "Synthetic publisher permission recorded for this fixture.",
      maxPages: 25,
      allowedHosts: ["news.alpha.org", "science.beta.net"],
      allowedQueryKeys: ["edition", "page"],
      seeds: [
        "https://news.alpha.org/world/start?edition=morning",
        "https://science.beta.net/research?page=2",
      ],
    }],
  });
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.buckets));
  assert.ok(Object.isFrozen(parsed.buckets[0]));
  assert.ok(Object.isFrozen(parsed.buckets[0].allowedHosts));
  assert.equal(bucketForHost(parsed, "public-interest", "https://news.alpha.org/other"), parsed.buckets[0]);
  assert.equal(bucketForHost(parsed, "public-interest", "https://other.gamma.org/"), null);

  const invalid = [
    { ...manifest(), extra: true },
    { ...manifest(), schema: "murmingle-crawl-manifest/v2" },
    { ...manifest(), rightsAcknowledged: false },
    { ...manifest(), buckets: [] },
    manifest({ extra: true }),
    manifest({ id: "UPPERCASE" }),
    manifest({ rightsBasis: "   " }),
    manifest({ maxPages: 0 }),
    manifest({ maxPages: 10_001 }),
    manifest({ allowedHosts: ["News.alpha.org"] }),
    manifest({ allowedHosts: ["news.alpha.org", "news.alpha.org"] }),
    manifest({ allowedQueryKeys: ["edition", "edition"] }),
    manifest({ allowedQueryKeys: ["edi\u202etion"] }),
    manifest({ seeds: ["https://other.gamma.org/article"] }),
    manifest({ seeds: ["https://news.alpha.org/article?unreviewed=1"] }),
    manifest({ seeds: ["https://news.alpha.org/article", "https://news.alpha.org/article#duplicate"] }),
  ];
  for (const value of invalid) assert.throws(() => readSeedManifest(value), /Invalid crawler manifest/u);
});

test("crawl URL normalization minimizes navigation metadata while retaining only allowlisted functional queries", () => {
  assert.equal(normalizeCrawlUrl(
    "https://news.alpha.org/a%20story?edition=late%20edition&page=2&utm_campaign=x&gclid=y&sid=z#fragment",
    undefined,
    ["edition", "page"],
  ), "https://news.alpha.org/a%20story?edition=late%20edition&page=2");
  assert.equal(normalizeCrawlUrl("../science?page=1&utm_medium=fixture", "https://news.alpha.org/world/start", ["page"]),
    "https://news.alpha.org/science?page=1");
  assert.equal(normalizeCrawlUrl("https://news.alpha.org/article?edition=a&edition=b", undefined, ["edition"]),
    "https://news.alpha.org/article?edition=a&edition=b");
  assert.equal(crawlHost("https://NEWS.alpha.org/article"), "news.alpha.org");
  assert.equal(crawlSection("https://news.alpha.org/World%20News/story"), "news.alpha.org/world-news");
});

test("crawl URL policy rejects private, ambiguous, binary and command-shaped destinations", () => {
  const rejected = [
    "http://news.alpha.org/article",
    "https://user:password@news.alpha.org/article",
    "https://127.0.0.1/article",
    "https://[::1]/article",
    "https://localhost/article",
    "https://news.alpha.org/account/article",
    "https://news.alpha.org/a%252faccount",
    "https://news.alpha.org/a%252e%252e%252fprivate",
    "https://news.alpha.org/article.pdf",
    "https://news.alpha.org/article?token=secret",
    "https://news.alpha.org/article?code=secret&state=nonce",
    "https://news.alpha.org/article?edition=ok;token=secret",
    "https://news.alpha.org/article\u0000tail",
    "https://news.alpha.org/article\u202etail",
    "https://news.alpha.org/article;Remove-Item",
    "https://news.alpha.org/article|whoami",
    "https://news.alpha.org/$(whoami)",
    "https://news.alpha.org/article`whoami",
    "https://news.alpha.org/article>output",
  ];
  for (const url of rejected) assert.equal(normalizeCrawlUrl(url, undefined, ["edition", "code", "state", "token"]), null, url);
  assert.equal(normalizeCrawlUrl("https://news.alpha.org/article?edition=1", undefined, []), null);
  assert.equal(normalizeCrawlUrl("https://news.alpha.org/article", undefined, ["bad\u202ekey"]), null);
});

test("link selection is deterministic, deduplicated and round-robins host sections", () => {
  const parsed = readSeedManifest(manifest());
  const bucket = parsed.buckets[0];
  const links = [
    { href: "/world/z?edition=one&utm_source=x" },
    { href: "/world/a?edition=two" },
    { href: "/science/z" },
    { href: "/science/a#fragment" },
    { href: "https://science.beta.net/research/z?page=1" },
    { href: "https://science.beta.net/research/a?page=2" },
    { href: "/world/z?edition=one" },
    { href: "https://other.gamma.org/off-scope" },
    { href: "/asset.json" },
    { href: "/world/no?unreviewed=1" },
  ];
  const first = chooseDiverseLinks(links, { baseUrl: bucket.seeds[0], bucket, limit: 6 });
  const second = chooseDiverseLinks([...links].reverse(), { baseUrl: bucket.seeds[0], bucket, limit: 6 });
  assert.deepEqual(second, first);
  assert.equal(new Set(first).size, first.length);
  assert.deepEqual(first.map(crawlSection), [
    "news.alpha.org/science",
    "news.alpha.org/world",
    "news.alpha.org/science",
    "news.alpha.org/world",
  ]);
  assert.equal(first.some(url => crawlHost(url) === "science.beta.net"), false);
  assert.ok(first.every(url => bucket.allowedHosts.includes(crawlHost(url))));
  assert.ok(first.every(url => !/[#]|utm_/u.test(url)));
  assert.deepEqual(chooseDiverseLinks(links, { baseUrl: bucket.seeds[0], bucket, limit: 0 }), []);
});

test("crawler operation identifiers bind the minimized URL and exact representation", () => {
  const representation = "a".repeat(64);
  const url = "https://news.alpha.org/article";
  const expected = `crawl-${createHash("sha256").update(url).update("\0").update(representation).digest("hex")}`;
  assert.equal(stableOperationId(url, representation), expected);
  assert.equal(stableOperationId(url, representation), stableOperationId(url, representation));
  assert.notEqual(stableOperationId(`${url}/other`, representation), expected);
  assert.notEqual(stableOperationId(url, "b".repeat(64)), expected);
  assert.throws(() => stableOperationId(url, "not-a-digest"), /Invalid crawler representation/u);
});
