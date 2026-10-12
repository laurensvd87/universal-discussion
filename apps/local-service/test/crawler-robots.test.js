import assert from "node:assert/strict";
import test from "node:test";
import {
  CrawlerPolicyError,
  createTdmRepCache,
  evaluateRobots,
  isRobotsAllowed,
  matchTdmRep,
  parseRobotsTxt,
  parseTdmRepJson,
  parseTdmReservation,
  parseXRobotsDirectives,
  restoreRobotsPolicy,
  restoreTdmRepPolicy,
  serializeRobotsPolicy,
  serializeTdmRepPolicy,
  tdmRepUrlFor
} from "../src/crawler/robots.js";

test("robots selects the named product groups, merges duplicates and uses longest allow-on-tie rules", () => {
  const policy = parseRobotsTxt(`
User-agent: *
Disallow: /
Crawl-delay: 1

User-agent: MurmingleTopicCrawler
Disallow: /private
Allow: /private/public
Disallow: /same
Crawl-delay: 1.25

User-agent: murmingletopiccrawler
Allow: /same
Crawl-delay: 3
`);
  assert.equal(isRobotsAllowed(policy, "https://news.example/ordinary"), true);
  assert.equal(isRobotsAllowed(policy, "https://news.example/private/story"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/private/public/story"), true);
  const tie = evaluateRobots(policy, "https://news.example/same");
  assert.equal(tie.allowed, true);
  assert.equal(tie.matchedRule.type, "allow");
  assert.equal(tie.crawlDelayMs, 3_000);
});

test("robots falls back to wildcard and supports wildcards, terminal anchors, queries and percent normalization", () => {
  const policy = parseRobotsTxt(`
User-agent: *
Disallow: /tmp/*
Allow: /tmp/public$
Disallow: /search?private=*
Disallow: /people/~staff
Disallow: /literal-%24
Disallow: /literal-%2A
Disallow: *.gif$
`);
  assert.equal(isRobotsAllowed(policy, "/tmp/public"), true);
  assert.equal(isRobotsAllowed(policy, "/tmp/public/more"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/search?private=yes"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/people/%7estaff"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/literal-$"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/literal-%24"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/literal-*"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/literal-%2a"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/images/photo.gif"), false);
  assert.equal(isRobotsAllowed(policy, "https://news.example/images/photo.gif?size=large"), true);
  assert.equal(isRobotsAllowed(policy, "/elsewhere"), true);
  assert.equal(isRobotsAllowed(policy, "/robots.txt"), true);
});

test("optional records do not split consecutive product tokens", () => {
  const policy = parseRobotsTxt(`
User-agent: OtherCrawler
Sitemap: https://news.example/map.xml
Host: news.example
Crawl-delay: 7
User-agent: MurmingleTopicCrawler
Disallow: /combined
`);
  assert.equal(isRobotsAllowed(policy, "/combined"), false);
  assert.deepEqual(policy.groups[0].agents, ["othercrawler", "murmingletopiccrawler"]);
  assert.equal(evaluateRobots(policy, "/combined").crawlDelayMs, 7_000);
});

test("nonstandard publisher user-agent labels remain bounded and never gain wildcard semantics", () => {
  const policy = parseRobotsTxt(`
User-agent: MJ12bot
Disallow: /mj12
User-agent: Mediapartners-Google*
Disallow: /
User-agent: sitecheck.internetseer.com
Disallow: /sitecheck
User-agent: Offline Explorer
Disallow: /offline
User-agent: *
Allow: /
`);
  assert.deepEqual(policy.groups.map(group => group.agents[0]), [
    "mj12bot", "mediapartners-google*", "sitecheck.internetseer.com", "offline explorer", "*"
  ]);
  assert.equal(isRobotsAllowed(policy, "/anything"), true);
  assert.equal(evaluateRobots(policy, "/anything", { userAgent: "Mediapartners-Google" }).allowed, true);

  const restored = restoreRobotsPolicy(JSON.parse(JSON.stringify(serializeRobotsPolicy(policy))));
  assert.deepEqual(restored.groups.map(group => group.agents[0]), policy.groups.map(group => group.agents[0]));
  assert.throws(() => parseRobotsTxt("User-agent: bad\u0007label\nDisallow: /"), CrawlerPolicyError);
});

test("empty rules are inert, malformed crawl delays reject, and HTTPS sitemaps are retained", () => {
  const policy = parseRobotsTxt(`
User-agent: *
Disallow:
Allow:
Sitemap: http://news.example/insecure.xml
Sitemap: https://news.example/map.xml
`);
  assert.equal(evaluateRobots(policy, "/anything").allowed, true);
  assert.equal(evaluateRobots(policy, "/anything").crawlDelayMs, 0);
  assert.deepEqual(policy.sitemaps, ["https://news.example/map.xml"]);
  assert.throws(() => parseRobotsTxt("User-agent: *\nCrawl-delay: nonsense"),
    error => error instanceof CrawlerPolicyError && error.code === "invalid-robots");
});

test("robots parser rejects oversized, malformed and structurally explosive documents", () => {
  for (const value of [
    "x".repeat(500 * 1_024 + 1),
    "User-agent: \nDisallow: /",
    "User-agent: *\nDisallow: /bad%xx"
  ]) assert.throws(() => parseRobotsTxt(value), error => error instanceof CrawlerPolicyError && error.code === "invalid-robots");
});

test("canonical robots policy survives database JSON round-trip only through strict restore", () => {
  const parsed = parseRobotsTxt("User-agent: MurmingleTopicCrawler\nDisallow: /private\nCrawl-delay: 2");
  const plain = JSON.parse(JSON.stringify(serializeRobotsPolicy(parsed)));
  assert.throws(() => evaluateRobots(plain, "/private"), TypeError);
  const restored = restoreRobotsPolicy(plain);
  assert.equal(evaluateRobots(restored, "/private").allowed, false);
  assert.equal(evaluateRobots(restored, "/private").crawlDelayMs, 2_000);

  plain.groups[0].rules[0].specificity += 1;
  assert.throws(() => restoreRobotsPolicy(plain), error => error instanceof CrawlerPolicyError && error.code === "invalid-robots");
});

test("X-Robots-Tag parsing observes global and Murmingle-scoped negative directives", () => {
  assert.deepEqual(parseXRobotsDirectives([
    "googlebot: noindex, nofollow",
    "MurmingleTopicCrawler: noai, nofollow"
  ]), { noindex: false, nofollow: true, noai: true, blocked: true, directives: ["noai", "nofollow"] });
  assert.deepEqual(parseXRobotsDirectives("none"), {
    noindex: true, nofollow: true, noai: false, blocked: true, directives: ["none"]
  });
  assert.throws(() => parseXRobotsDirectives("noindex\r\nInjected: all"), TypeError);
});

test("TDMRep validates exact rules and applies the first matching, publisher-ordered most-specific rule", () => {
  const document = parseTdmRepJson(JSON.stringify([
    { location: "/articles/open/*", "tdm-reservation": 0 },
    { location: "/articles/*", "tdm-reservation": 1, "tdm-policy": "https://news.example/tdm-policy.json" },
    { location: "/people/~staff$", "tdm-reservation": 1 },
    { location: "/literal-%24", "tdm-reservation": 1 },
    { location: "/star-%2A", "tdm-reservation": 1 }
  ]));
  assert.deepEqual(matchTdmRep(document, "https://news.example/articles/open/one?ignored=yes"), {
    reservation: 0, policy: null, location: "/articles/open/*", index: 0
  });
  assert.deepEqual(matchTdmRep(document, "/articles/closed/one"), {
    reservation: 1, policy: "https://news.example/tdm-policy.json", location: "/articles/*", index: 1
  });
  assert.equal(matchTdmRep(document, "/people/%7Estaff").reservation, 1);
  assert.equal(matchTdmRep(document, "/literal-$").reservation, 1);
  assert.equal(matchTdmRep(document, "/literal-%24").reservation, 1);
  assert.equal(matchTdmRep(document, "/star-*").reservation, 1);
  assert.equal(matchTdmRep(document, "/star-%2a").reservation, 1);
  assert.deepEqual(matchTdmRep(document, "/unmatched"), {
    reservation: null, policy: null, location: null, index: null
  });
});

test("TDMRep rejects unknown fields, unsafe policy URLs, invalid patterns and non-binary reservation values", () => {
  const invalid = [
    [{ location: "/", "tdm-reservation": "1" }],
    [{ location: "/", "tdm-reservation": true }],
    [{ location: "/", "tdm-reservation": 1, extra: true }],
    [{ location: "relative", "tdm-reservation": 1 }],
    [{ location: "/bad?query", "tdm-reservation": 1 }],
    [{ location: "/", "tdm-reservation": 1, "tdm-policy": "http://news.example/policy" }]
  ];
  for (const value of invalid) assert.throws(() => parseTdmRepJson(JSON.stringify(value)),
    error => error instanceof CrawlerPolicyError && error.code === "invalid-tdmrep");
  assert.throws(() => parseTdmRepJson("{"), error => error.code === "invalid-tdmrep");
  assert.throws(() => parseTdmRepJson('[{"location":"/","tdm-reservation":0,"tdm-reservation":1}]'),
    error => error.code === "invalid-tdmrep");
  assert.throws(() => parseTdmRepJson(" ".repeat(256 * 1_024 + 1)), error => error.code === "invalid-tdmrep");
  assert.equal(parseTdmReservation("0"), 0);
  assert.equal(parseTdmReservation(1), 1);
  assert.equal(parseTdmReservation(" 1"), null);
  assert.equal(parseTdmReservation(2), null);
});

test("canonical TDMRep policy survives database JSON round-trip only through strict restore", () => {
  const parsed = parseTdmRepJson('[{"location":"/private/*","tdm-reservation":1}]');
  const plain = JSON.parse(JSON.stringify(serializeTdmRepPolicy(parsed)));
  assert.throws(() => matchTdmRep(plain, "/private/a"), TypeError);
  const restored = restoreTdmRepPolicy(plain);
  assert.equal(matchTdmRep(restored, "/private/a").reservation, 1);

  plain.rules[0].index = 4;
  assert.throws(() => restoreTdmRepPolicy(plain), error => error instanceof CrawlerPolicyError && error.code === "invalid-tdmrep");
});

test("TDMRep URL construction and bounded TTL/LRU cache are origin-scoped", () => {
  assert.equal(tdmRepUrlFor("https://news.example/a?q=1"), "https://news.example/.well-known/tdmrep.json");
  assert.throws(() => tdmRepUrlFor("http://news.example/"), TypeError);
  let clock = 10_000;
  const cache = createTdmRepCache({ maxEntries: 2, ttlMs: 2_000, now: () => clock });
  const first = parseTdmRepJson('[{"location":"/","tdm-reservation":0}]');
  const second = parseTdmRepJson('[{"location":"/","tdm-reservation":1}]');
  cache.set("https://one.example/a", first);
  cache.set("https://two.example/", second);
  assert.equal(cache.get("https://one.example/other"), first);
  cache.set("https://three.example/", null);
  assert.equal(cache.get("https://two.example/"), undefined);
  assert.equal(cache.get("https://three.example/"), null);
  clock += 2_001;
  assert.equal(cache.get("https://one.example/"), undefined);
  assert.equal(cache.size, 1);
});
