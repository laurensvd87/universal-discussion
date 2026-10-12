import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILT_IN_SOURCE_ID,
  BUILT_IN_SOURCE_MANIFEST,
  isBuiltInSourceUrl,
} from "../src/crawler/built-in-sources.js";
import { bucketForHost, crawlHost } from "../src/crawler/url-policy.js";

const EXPECTED_BUCKETS = [
  "science", "technology", "mathematics", "health", "nature", "history", "geography", "society",
  "politics", "economics", "culture", "art", "literature", "music", "philosophy", "sport",
];
const EXPECTED_HOSTS = ["en.wikipedia.org", "de.wikipedia.org", "fr.wikipedia.org", "es.wikipedia.org"];

test("the built-in catalogue is an explicit immutable rights-acknowledged manifest", () => {
  assert.equal(BUILT_IN_SOURCE_ID, "wikimedia-balanced-v1");
  assert.equal(BUILT_IN_SOURCE_MANIFEST.schema, "murmingle-crawl-manifest/v1");
  assert.equal(BUILT_IN_SOURCE_MANIFEST.rightsAcknowledged, true);
  assert.equal(Object.isFrozen(BUILT_IN_SOURCE_MANIFEST), true);
  assert.equal(Object.isFrozen(BUILT_IN_SOURCE_MANIFEST.buckets), true);
  assert.deepEqual(BUILT_IN_SOURCE_MANIFEST.buckets.map(bucket => bucket.id), EXPECTED_BUCKETS);

  for (const bucket of BUILT_IN_SOURCE_MANIFEST.buckets) {
    assert.equal(Object.isFrozen(bucket), true);
    assert.equal(bucket.maxPages, 1_000);
    assert.match(bucket.rightsBasis, /^Wikimedia public pages;/u);
    assert.match(bucket.rightsBasis, /Terms: https:\/\/foundation\.wikimedia\.org\/wiki\/Policy:Terms_of_Use$/u);
    assert.deepEqual(bucket.allowedHosts, EXPECTED_HOSTS);
    assert.deepEqual(bucket.allowedQueryKeys, []);
    assert.equal(Object.isFrozen(bucket.allowedHosts), true);
    assert.equal(Object.isFrozen(bucket.allowedQueryKeys), true);
    assert.equal(Object.isFrozen(bucket.seeds), true);
  }
});

test("every subject starts once on each exact language origin without query, fragment or duplicate", () => {
  const allSeeds = [];
  for (const bucket of BUILT_IN_SOURCE_MANIFEST.buckets) {
    assert.equal(bucket.seeds.length, EXPECTED_HOSTS.length);
    assert.deepEqual(bucket.seeds.map(crawlHost), EXPECTED_HOSTS);
    for (const [index, seed] of bucket.seeds.entries()) {
      const parsed = new URL(seed);
      assert.equal(parsed.protocol, "https:");
      assert.equal(parsed.origin, `https://${EXPECTED_HOSTS[index]}`);
      assert.match(parsed.pathname, /^\/wiki\/[A-Za-z0-9_()%.-]+$/u);
      assert.equal(parsed.search, "");
      assert.equal(parsed.hash, "");
      assert.equal(bucketForHost(BUILT_IN_SOURCE_MANIFEST, bucket.id, seed), bucket);
      allSeeds.push(seed);
    }
  }
  assert.equal(allSeeds.length, EXPECTED_BUCKETS.length * EXPECTED_HOSTS.length);
  assert.equal(new Set(allSeeds).size, allSeeds.length);
  assert.equal(BUILT_IN_SOURCE_MANIFEST.buckets.reduce((sum, bucket) => sum + bucket.maxPages, 0), 16_000);
});

test("built-in buckets provide broad subject representation without granting other origins", () => {
  assert.ok(EXPECTED_BUCKETS.includes("science"));
  assert.ok(EXPECTED_BUCKETS.includes("health"));
  assert.ok(EXPECTED_BUCKETS.includes("politics"));
  assert.ok(EXPECTED_BUCKETS.includes("economics"));
  assert.ok(EXPECTED_BUCKETS.includes("art"));
  assert.ok(EXPECTED_BUCKETS.includes("sport"));
  for (const bucket of BUILT_IN_SOURCE_MANIFEST.buckets) {
    assert.equal(bucketForHost(BUILT_IN_SOURCE_MANIFEST, bucket.id, "https://commons.wikimedia.org/wiki/Main_Page"), null);
    assert.equal(bucketForHost(BUILT_IN_SOURCE_MANIFEST, bucket.id, "https://www.wikidata.org/wiki/Wikidata:Main_Page"), null);
  }
});

test("built-in namespace filter accepts article paths only and rejects metadata or Wikimedia side channels", () => {
  for (const url of [
    "https://en.wikipedia.org/wiki/Science",
    "https://de.wikipedia.org/wiki/Gesellschaft_%28Soziologie%29",
    "https://fr.wikipedia.org/wiki/Soci%C3%A9t%C3%A9",
  ]) assert.equal(isBuiltInSourceUrl(url), true, url);
  for (const url of [
    "http://en.wikipedia.org/wiki/Science",
    "https://user:pass@en.wikipedia.org/wiki/Science",
    "https://en.wikipedia.org:444/wiki/Science",
    "https://commons.wikimedia.org/wiki/Science",
    "https://en.wikipedia.org/w/index.php?title=Science",
    "https://en.wikipedia.org/wiki/",
    "https://en.wikipedia.org/wiki/Special:Random",
    "https://en.wikipedia.org/wiki/Category%3AScience",
    "https://en.wikipedia.org/wiki/Science?oldid=1",
    "https://en.wikipedia.org/wiki/Science#History",
    "https://en.wikipedia.org/wiki/%E0%A4%A",
    "https://en.wikipedia.org/wiki/Science%0AInjected",
  ]) assert.equal(isBuiltInSourceUrl(url), false, url);
});
