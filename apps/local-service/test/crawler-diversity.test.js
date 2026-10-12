import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  representationDigest,
  selectDiverseCandidates,
  simhash64,
} from "../src/crawler/diversity.js";

function unit(axis = 0, sign = 1) {
  const value = Array(384).fill(0);
  value[axis] = sign;
  return value;
}

function candidate(id, { bucket = "news", host = `${id}.alpha.org`, section = `${id}.alpha.org/root`, vector = unit() } = {}) {
  return { urlDigest: createHash("sha256").update(id).digest("hex"), bucket, host, section, vector };
}

test("simhash is deterministic across compatible normalization, case and token order", () => {
  const first = simhash64("Café climate 2026 climate policy");
  const equivalent = simhash64("POLICY climate 2026 CAFE\u0301 climate");
  assert.match(first, /^[a-f0-9]{16}$/u);
  assert.equal(equivalent, first);
  assert.equal(simhash64("Café climate 2026 climate policy"), first);
  assert.notEqual(simhash64("Orbital mechanics telescope spectroscopy"), first);
  assert.throws(() => simhash64(""), /Invalid fingerprint text/u);
  assert.throws(() => simhash64(null), /Invalid fingerprint text/u);
});

test("representation digests bind URL, title, extractor and every finite vector value", () => {
  const input = {
    url: "https://news.alpha.org/world/article",
    title: "A bounded public article",
    vector: unit(5),
    extractorVersion: "crawler-static-html-prefix/v1",
  };
  const digest = representationDigest(input);
  assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.equal(representationDigest(structuredClone(input)), digest);
  for (const changed of [
    { ...input, url: `${input.url}/other` },
    { ...input, title: `${input.title} changed` },
    { ...input, extractorVersion: "crawler-static-html-prefix/v2" },
    { ...input, vector: unit(6) },
  ]) assert.notEqual(representationDigest(changed), digest);

  const sparse = unit();
  delete sparse[10];
  for (const malformed of [
    { ...input, vector: [1] },
    { ...input, vector: [...unit().slice(0, 383), Number.NaN] },
    { ...input, vector: [...unit().slice(0, 383), Number.POSITIVE_INFINITY] },
    { ...input, vector: sparse },
  ]) assert.throws(() => representationDigest(malformed), /Invalid crawler representation/u);
});

test("diversity selection is deterministic under input order and enforces bucket, host and section quotas", () => {
  const values = [
    candidate("news-one", { bucket: "news", host: "one.alpha.org", section: "one.alpha.org/world", vector: unit(0) }),
    candidate("news-two", { bucket: "news", host: "two.alpha.org", section: "two.alpha.org/science", vector: unit(1) }),
    candidate("news-three", { bucket: "news", host: "three.alpha.org", section: "three.alpha.org/culture", vector: unit(2) }),
    candidate("research-one", { bucket: "research", host: "research.beta.net", section: "research.beta.net/biology", vector: unit(3) }),
    candidate("research-same-host", { bucket: "research", host: "research.beta.net", section: "research.beta.net/space", vector: unit(4) }),
    candidate("research-same-section", { bucket: "research", host: "other.beta.net", section: "research.beta.net/biology", vector: unit(5) }),
  ];
  const options = { limit: 10, bucketLimits: new Map([["news", 2], ["research", 1]]), perHost: 1, perSection: 1 };
  const first = selectDiverseCandidates(values, options);
  const reversed = selectDiverseCandidates([...values].reverse(), options);
  assert.deepEqual(reversed.map(item => item.urlDigest), first.map(item => item.urlDigest));
  assert.equal(first.length, 3);
  assert.equal(first.filter(item => item.bucket === "news").length, 2);
  assert.equal(first.filter(item => item.bucket === "research").length, 1);
  assert.equal(new Set(first.map(item => item.host)).size, first.length);
  assert.equal(new Set(first.map(item => item.section)).size, first.length);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(selectDiverseCandidates(values, { ...options, limit: 0 }), []);
});

test("MMR favors a representation unlike prior and newly selected vectors", () => {
  const similar = candidate("similar", { host: "similar.alpha.org", section: "similar.alpha.org/a", vector: unit(0) });
  const novel = candidate("novel", { host: "novel.alpha.org", section: "novel.alpha.org/b", vector: unit(1) });
  const opposite = candidate("opposite", { host: "opposite.alpha.org", section: "opposite.alpha.org/c", vector: unit(0, -1) });
  const prior = [candidate("prior", { host: "prior.alpha.org", section: "prior.alpha.org/root", vector: unit(0) })];
  const selected = selectDiverseCandidates([similar, novel, opposite], {
    limit: 3,
    bucketLimits: new Map([["news", 4]]),
    perHost: 1,
    perSection: 1,
    prior,
  });
  assert.equal(selected[0].urlDigest, opposite.urlDigest);
  assert.equal(selected.at(-1).urlDigest, similar.urlDigest);
  assert.deepEqual(prior[0].vector, unit(0));
});

test("selection validates quotas and dense finite candidate/prior representations", () => {
  const valid = candidate("valid");
  const options = { limit: 1, bucketLimits: new Map([["news", 1]]), perHost: 1, perSection: 1 };
  const nonFinite = candidate("non-finite", { vector: unit() });
  nonFinite.vector[2] = Number.NaN;
  const sparse = candidate("sparse", { vector: unit() });
  delete sparse.vector[12];
  for (const candidates of [[nonFinite], [sparse], [{ ...valid, urlDigest: "" }], [{ ...valid, bucket: "" }]]) {
    assert.throws(() => selectDiverseCandidates(candidates, options), /Invalid diversity candidate/u);
  }
  assert.throws(() => selectDiverseCandidates([valid], { ...options, prior: [nonFinite] }), /Invalid diversity candidate/u);
  assert.throws(() => selectDiverseCandidates([valid], { ...options, bucketLimits: new Map([["news", -1]]) }), /Invalid diversity selection/u);
  assert.throws(() => selectDiverseCandidates([valid], { ...options, bucketLimits: new Map([["news", 1.5]]) }), /Invalid diversity selection/u);
  assert.throws(() => selectDiverseCandidates([valid], { ...options, bucketLimits: new Map([["", 1]]) }), /Invalid diversity selection/u);
});
