import { createHash } from "node:crypto";
import { rankRelatedSources } from "../../../../../spikes/topic-resolution/browser/core/related-sources.js";

const LANGUAGES = ["en", "de", "nl", "es", "fr", "ar", "hi", "zh", "ja"];
const PROVENANCE = "project-created-synthetic";
const TIE_TOLERANCE = 1e-12;

function invalid() { throw new TypeError("Invalid embedding experiment input"); }
function record(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) invalid();
  if (keys.some((key) => !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) invalid();
}
function array(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index += 1) {
    const item = descriptors[index];
    if (!item || !Object.hasOwn(item, "value") || !item.enumerable) invalid();
  }
}
function text(value, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)) invalid();
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function uniqueIds(ids, available) {
  array(ids, 64);
  if (new Set(ids).size !== ids.length || ids.some((id) => !available.has(id))) invalid();
}

/** Validate the frozen engineering corpus; expectations are retrieval labels, never Topic links. */
export function validateCorpus(corpus) {
  record(corpus, ["schema", "provenance", "description", "descriptors", "catalogIds", "queries"]);
  if (corpus.schema !== "synthetic-embedding-corpus/v1" || corpus.provenance !== PROVENANCE) invalid();
  text(corpus.description, 4096);
  array(corpus.descriptors, 64);
  array(corpus.queries, 64);
  if (corpus.descriptors.length !== 64 || corpus.queries.length !== 64) invalid();
  const ids = new Set();
  const counts = Object.fromEntries(LANGUAGES.map((language) => [language, 0]));
  for (const descriptor of corpus.descriptors) {
    record(descriptor, ["id", "language", "text", "provenance"]);
    text(descriptor.id, 128);
    text(descriptor.text, 4096);
    if (ids.has(descriptor.id) || !LANGUAGES.includes(descriptor.language) || descriptor.provenance !== PROVENANCE) invalid();
    ids.add(descriptor.id);
    counts[descriptor.language] += 1;
  }
  if (LANGUAGES.some((language) => counts[language] !== (language === "en" ? 32 : 4))) invalid();
  uniqueIds(corpus.catalogIds, ids);
  if (corpus.catalogIds.length !== 60) invalid();
  const catalog = new Set(corpus.catalogIds);
  const queryIds = new Set();
  for (const query of corpus.queries) {
    record(query, ["id", "expectedIds", "hardNegativeIds"]);
    if (!ids.has(query.id) || queryIds.has(query.id)) invalid();
    queryIds.add(query.id);
    uniqueIds(query.expectedIds, catalog);
    uniqueIds(query.hardNegativeIds, catalog);
    if (query.expectedIds.includes(query.id) || query.hardNegativeIds.includes(query.id) || query.hardNegativeIds.some((id) => query.expectedIds.includes(id))) invalid();
    if (catalog.has(query.id) !== (query.expectedIds.length > 0)) invalid();
    if (!catalog.has(query.id) && query.hardNegativeIds.length) invalid();
  }
  return freeze(structuredClone(corpus));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

/** Sorted object keys, preserved array order, UTF-8 JSON without whitespace or trailing newline. */
export function corpusDigest(corpus) {
  return createHash("sha256").update(JSON.stringify(canonical(validateCorpus(corpus)))).digest("hex");
}

/** Deterministic Unicode word counts. No translation/stemming: cross-script overlap is largely absent. */
export function createLexicalVectors(input) {
  const corpus = validateCorpus(input);
  const tokenize = (textValue) => textValue.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = corpus.descriptors.map((descriptor) => tokenize(descriptor.text));
  const vocabulary = [...new Set(tokens.flat())].sort();
  // Reserve one coordinate for empty-token text so vectors never silently become zero.
  if (vocabulary.length + 1 > 1536) invalid();
  const positions = new Map(vocabulary.map((token, index) => [token, index]));
  const modelId = `lexical-nfkc-unicode-word-count/v1:${corpusDigest(corpus).slice(0, 32)}`;
  return freeze({
    modelId,
    dimensions: vocabulary.length + 1,
    vectors: corpus.descriptors.map((descriptor, index) => {
      const values = Array(vocabulary.length + 1).fill(0);
      for (const token of tokens[index]) values[positions.get(token)] += 1;
      if (!tokens[index].length) values[vocabulary.length] = 1;
      return { id: descriptor.id, modelId, values };
    }),
  });
}

function validateVectors(corpus, collection) {
  record(collection, ["modelId", "dimensions", "vectors"]);
  text(collection.modelId, 128);
  if (!Number.isInteger(collection.dimensions) || collection.dimensions < 1 || collection.dimensions > 1536) invalid();
  array(collection.vectors, 64);
  if (collection.vectors.length !== 64) invalid();
  const ids = new Set(corpus.descriptors.map((descriptor) => descriptor.id));
  const seen = new Set();
  const result = new Map();
  for (const vector of collection.vectors) {
    record(vector, ["id", "modelId", "values"]);
    if (!ids.has(vector.id) || seen.has(vector.id) || vector.modelId !== collection.modelId) invalid();
    array(vector.values, 1536);
    if (vector.values.length !== collection.dimensions || vector.values.some((value) => !Number.isFinite(value)) || vector.values.every((value) => value === 0)) invalid();
    seen.add(vector.id);
    result.set(vector.id, { modelId: collection.modelId, values: [...vector.values] });
  }
  return result;
}

function retrieval(ranking, expectedIds) {
  const result = {};
  for (const k of [3, 5]) {
    const found = ranking.slice(0, k).filter((candidate) => expectedIds.includes(candidate.id)).length;
    result[`hitAt${k}`] = Number(found > 0);
    result[`recallAt${k}`] = found / expectedIds.length;
  }
  return result;
}
function aggregate(rows) {
  return {
    queryCount: rows.length,
    ...Object.fromEntries(["hitAt3", "hitAt5", "recallAt3", "recallAt5"].map((metric) => [metric, rows.length ? rows.reduce((sum, row) => sum + row[metric], 0) / rows.length : null])),
  };
}

/** Full bounded existing-ranker retrieval, without confirmed links or a learned acceptance cutoff. */
export function evaluateVectors(input, collection) {
  const corpus = validateCorpus(input);
  const vectors = validateVectors(corpus, collection);
  const descriptors = new Map(corpus.descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const source = (id) => ({
    id,
    url: `https://example.org/synthetic-embedding/${encodeURIComponent(id)}`,
    title: `Synthetic descriptor ${id}`,
    topicId: null,
    embedding: vectors.get(id),
  });
  const candidates = corpus.catalogIds.map(source);
  const rows = [];
  const noMatch = [];
  const pairs = [];
  for (const query of corpus.queries) {
    const language = descriptors.get(query.id).language;
    const ranking = rankRelatedSources(source(query.id), candidates, { limit: 100, minSimilarity: -1 });
    if (ranking.length !== candidates.length - Number(corpus.catalogIds.includes(query.id))) invalid();
    if (!query.expectedIds.length) {
      noMatch.push({ id: query.id, language, maxSimilarity: ranking[0]?.similarity ?? null, topCandidateId: ranking[0]?.id ?? null });
      continue;
    }
    const partitions = {};
    for (const [name, matches] of [["sameLanguage", true], ["crossLanguage", false]]) {
      const belongs = (id) => (descriptors.get(id).language === language) === matches;
      const expected = query.expectedIds.filter(belongs);
      partitions[name] = expected.length ? retrieval(ranking.filter((candidate) => belongs(candidate.id)), expected) : null;
    }
    rows.push({ id: query.id, language, expectedIds: [...query.expectedIds], ranking, metrics: retrieval(ranking, query.expectedIds), ...partitions });
    const scores = new Map(ranking.map((candidate) => [candidate.id, candidate.similarity]));
    for (const expectedId of query.expectedIds) for (const negativeId of query.hardNegativeIds) {
      const margin = scores.get(expectedId) - scores.get(negativeId);
      pairs.push({ queryId: query.id, language, expectedId, negativeId, margin, outcome: Math.abs(margin) <= TIE_TOLERANCE ? "tie" : margin > 0 ? "strict-win" : "failure" });
    }
  }
  const hardNegativeSummary = (selected) => ({ pairCount: selected.length, strictWins: selected.filter((pair) => pair.outcome === "strict-win").length, ties: selected.filter((pair) => pair.outcome === "tie").length, failures: selected.filter((pair) => pair.outcome === "failure").length });
  const byLanguage = Object.fromEntries(LANGUAGES.map((language) => [language, aggregate(rows.filter((row) => row.language === language).map((row) => row.metrics))]));
  return freeze({
    corpusDigest: corpusDigest(corpus), modelId: collection.modelId, dimensions: collection.dimensions,
    interpretation: "Synthetic retrieval smoke test, not Topic identity or calibrated confidence. No-match scores are diagnostics only. Cross-language retrieval uses candidates whose language differs from the query.",
    tieTolerance: TIE_TOLERANCE,
    metrics: {
      overall: aggregate(rows.map((row) => row.metrics)), english: byLanguage.en, byLanguage,
      sameLanguage: aggregate(rows.flatMap((row) => row.sameLanguage ? [row.sameLanguage] : [])),
      crossLanguage: aggregate(rows.flatMap((row) => row.crossLanguage ? [row.crossLanguage] : [])),
      crossLanguageByQueryLanguage: Object.fromEntries(LANGUAGES.map((language) => [language, aggregate(rows.filter((row) => row.language === language && row.crossLanguage).map((row) => row.crossLanguage))])),
    },
    hardNegatives: { ...hardNegativeSummary(pairs), byLanguage: Object.fromEntries(LANGUAGES.map((language) => [language, hardNegativeSummary(pairs.filter((pair) => pair.language === language))])), pairs },
    noMatch, queries: rows,
  });
}
