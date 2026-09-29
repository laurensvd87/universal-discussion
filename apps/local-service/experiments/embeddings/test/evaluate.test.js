import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCorpus, corpusDigest, createLexicalVectors, evaluateVectors } from "../src/evaluate.js";

const corpus = JSON.parse(readFileSync(new URL("../fixtures/corpus.json", import.meta.url), "utf8"));
const DIGEST = "4a75170ae6e0b4db993f1d0f17b79f57519a2da4ba306c10304fb21c60cb19a9";
const clone = (value) => structuredClone(value);
function semanticFixture() {
  const groups = [...new Set(corpus.queries.map((query) => [query.id, ...query.expectedIds].sort()[0]))].sort();
  return {
    modelId: "synthetic-test-space/v1", dimensions: groups.length,
    vectors: corpus.queries.map((query) => {
      const values = Array(groups.length).fill(0);
      values[groups.indexOf([query.id, ...query.expectedIds].sort()[0])] = 1;
      return { id: query.id, modelId: "synthetic-test-space/v1", values };
    }),
  };
}

test("frozen corpus has exact approved counts, synthetic provenance and explicit expectations", () => {
  const result = validateCorpus(corpus);
  assert.equal(corpusDigest(corpus), DIGEST);
  assert.equal(result.descriptors.length, 64);
  assert.equal(result.catalogIds.length, 60);
  assert.deepEqual(Object.fromEntries(["en", "de", "nl", "es", "fr", "ar", "hi", "zh", "ja"].map((language) => [language, result.descriptors.filter((descriptor) => descriptor.language === language).length])), { en: 32, de: 4, nl: 4, es: 4, fr: 4, ar: 4, hi: 4, zh: 4, ja: 4 });
  assert.ok(result.descriptors.every((descriptor) => descriptor.provenance === "project-created-synthetic" && descriptor.text.length <= 4096));
  const noMatch = result.queries.filter((query) => !query.expectedIds.length);
  assert.deepEqual(noMatch.map((query) => query.id), ["en-29", "en-30", "en-31", "en-32"]);
  assert.ok(noMatch.every((query) => !result.catalogIds.includes(query.id)));
  assert.ok(Object.isFrozen(result.descriptors[0]));
  assert.throws(() => { result.descriptors[0].text = "changed"; }, TypeError);
});

test("canonical digest ignores object key ordering but includes expectations and text", () => {
  const reordered = Object.fromEntries(Object.entries(corpus).reverse());
  assert.equal(corpusDigest(reordered), DIGEST);
  const changed = clone(corpus);
  changed.descriptors[0].text += " Extra synthetic detail.";
  assert.notEqual(corpusDigest(changed), DIGEST);
});

test("corpus rejects duplicates, self relevance, missing IDs, conflicts and invalid language counts", () => {
  const changes = [
    (value) => { value.descriptors[1].id = value.descriptors[0].id; },
    (value) => { value.queries[0].expectedIds.push(value.queries[0].id); },
    (value) => { value.queries[0].expectedIds.push("missing"); },
    (value) => { value.queries[0].hardNegativeIds.push(value.queries[0].expectedIds[0]); },
    (value) => { value.queries[0].expectedIds.push(value.queries[0].expectedIds[0]); },
    (value) => { value.queries[1].id = value.queries[0].id; },
    (value) => { value.descriptors[0].language = "de"; },
    (value) => { value.descriptors[0].text = "a".repeat(4097); },
    (value) => { value.catalogIds[0] = "en-29"; },
    (value) => { value.descriptors[0].topicId = "confirmed-topic"; },
    (value) => { value.descriptors[0].provenance = "real-user"; },
  ];
  for (const change of changes) { const value = clone(corpus); change(value); assert.throws(() => validateCorpus(value), TypeError); }
});

test("synthetic vectors demonstrate any-hit versus recall, separated language pools and full retrieval", () => {
  const result = evaluateVectors(corpus, semanticFixture());
  assert.equal(result.metrics.overall.queryCount, 60);
  assert.equal(result.metrics.english.queryCount, 28);
  assert.equal(result.metrics.overall.hitAt3, 1);
  assert.equal(result.metrics.overall.hitAt5, 1);
  const anchor = result.queries.find((query) => query.id === "en-01");
  assert.equal(anchor.expectedIds.length, 9);
  assert.equal(anchor.metrics.hitAt3, 1);
  assert.equal(anchor.metrics.recallAt3, 3 / 9);
  assert.equal(anchor.metrics.recallAt5, 5 / 9);
  assert.equal(anchor.ranking.length, 59);
  assert.ok(anchor.ranking.every((candidate) => candidate.id !== anchor.id && candidate.relationship === "related" && candidate.topicId === null));
  assert.equal(result.metrics.sameLanguage.queryCount, 28);
  assert.equal(result.metrics.crossLanguage.queryCount, 40);
  assert.equal(result.metrics.crossLanguageByQueryLanguage.en.queryCount, 8);
  assert.equal(result.metrics.byLanguage.ja.queryCount, 4);
  assert.equal(result.hardNegatives.strictWins, result.hardNegatives.pairCount);
  assert.equal(result.hardNegatives.ties, 0);
  assert.equal(result.hardNegatives.failures, 0);
  assert.equal(result.noMatch.length, 4);
  assert.ok(result.noMatch.every((query) => query.maxSimilarity === 0 && !Object.hasOwn(query, "accepted")));
});

test("negative scores remain in full rankings; no demo 0.65 cutoff or confirmed-topic shortcut", () => {
  const vectors = semanticFixture();
  vectors.vectors.find((vector) => vector.id === "en-01").values = vectors.vectors.find((vector) => vector.id === "en-02").values.map((value) => -value);
  const result = evaluateVectors(corpus, vectors);
  const query = result.queries.find((row) => row.id === "en-01");
  assert.equal(query.ranking.length, 59);
  assert.equal(query.ranking.find((row) => row.id === "en-02").similarity, -1);
  assert.equal(query.metrics.hitAt3, 0);
  assert.ok(result.hardNegatives.failures > 0);
});

test("ties are explicit score ties and ID tiebreaks never turn them into strict hard-negative wins", () => {
  const vectors = semanticFixture();
  vectors.dimensions = 1;
  vectors.vectors.forEach((vector) => { vector.values = [1]; });
  const result = evaluateVectors(corpus, vectors);
  assert.equal(result.hardNegatives.ties, result.hardNegatives.pairCount);
  assert.equal(result.hardNegatives.strictWins, 0);
  assert.equal(result.hardNegatives.failures, 0);
  const anchor = result.queries.find((query) => query.id === "en-01");
  assert.deepEqual(anchor.ranking.slice(0, 3).map((candidate) => candidate.id), ["ar-01", "ar-02", "ar-03"]);
  assert.equal(result.noMatch[0].maxSimilarity, 1);
});

test("lexical baseline is deterministic, bounded, immutable and order-blind for reversed acquirers", () => {
  const first = createLexicalVectors(corpus);
  assert.deepEqual(first, createLexicalVectors(corpus));
  assert.ok(first.dimensions <= 1536);
  assert.ok(Object.isFrozen(first.vectors[0].values));
  assert.deepEqual(first.vectors.find((vector) => vector.id === "en-05").values, first.vectors.find((vector) => vector.id === "en-13").values);
  const result = evaluateVectors(corpus, first);
  assert.deepEqual(result, evaluateVectors(corpus, first));
  assert.ok(result.hardNegatives.ties > 0);
  assert.ok(result.hardNegatives.failures > 0);
  assert.ok(result.metrics.byLanguage.hi.hitAt3 < result.metrics.english.hitAt3);
  assert.equal(result.corpusDigest, DIGEST);
});

test("vector collection rejects mixed spaces, dimensions, duplicate/missing IDs and malformed values", () => {
  const changes = [
    (value) => { value.vectors[0].modelId = "unrelated-space/v1"; },
    (value) => { value.modelId = ""; },
    (value) => { value.dimensions = 1537; },
    (value) => { value.vectors[0].values.pop(); },
    (value) => { value.vectors[0].id = value.vectors[1].id; },
    (value) => { value.vectors.pop(); },
    (value) => { value.vectors[0].id = "missing"; },
    (value) => { value.vectors[0].values[0] = Infinity; },
    (value) => { value.vectors[0].values[0] = NaN; },
    (value) => { value.vectors[0].values.fill(0); },
    (value) => { delete value.vectors[0].values[0]; },
    (value) => { Object.defineProperty(value.vectors[0], "values", { get() { throw new Error("Accessor ran"); }, enumerable: true }); },
  ];
  for (const change of changes) { const value = semanticFixture(); change(value); assert.throws(() => evaluateVectors(corpus, value), TypeError); }
});

test("finite extreme vectors normalize safely and outputs do not retain mutable caller arrays", () => {
  const vectors = semanticFixture();
  vectors.vectors.forEach((vector) => { vector.values = vector.values.map((value) => value * Number.MAX_VALUE); });
  const result = evaluateVectors(corpus, vectors);
  assert.equal(result.metrics.overall.hitAt3, 1);
  assert.ok(Object.isFrozen(result.queries[0].ranking));
  vectors.vectors[0].values.fill(0);
  assert.equal(result.metrics.overall.hitAt3, 1);
});

test("lexical vocabulary growth fails explicitly instead of changing the ranker dimension boundary", () => {
  const changed = clone(corpus);
  for (let index = 0; index < 64; index += 1) changed.descriptors[index].text = Array.from({ length: 30 }, (_, token) => `word${index}token${token}`).join(" ");
  assert.throws(() => createLexicalVectors(changed), TypeError);
});
