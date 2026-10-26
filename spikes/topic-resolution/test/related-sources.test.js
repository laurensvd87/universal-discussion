import assert from "node:assert/strict";
import test from "node:test";
import { rankRelatedSources, prepareRelatedSources, prepareRelatedSource, createRelatedSourcesPreparation, parseRelatedEmbeddingJson } from "../browser/core/related-sources.js";

const embedding = (values, modelId = "hand-authored-test-vectors/v1") => ({ modelId, values });
const source = (id, overrides = {}) => ({
  id,
  url: `https://example.com/${id}`,
  title: `Synthetic source ${id}`,
  topicId: null,
  embedding: embedding([1, 0]),
  ...overrides,
});
const query = () => source("query");
const rejects = (operation) => assert.throws(operation, {
  name: "TypeError",
  message: "Invalid related-source input",
});

test("optional fallback returns just the best 0.80+ candidate only when ordinary results are empty", () => {
  const options = { limit: 20, minSimilarity: 0.88, fallbackMinSimilarity: 0.8 };
  const scored = (id, score) => source(id, { embedding: embedding([score, Math.sqrt(1 - score * score)]) });
  const cases = [
    [[scored("below", 0.799999)], []],
    [[source("boundary", { embedding: embedding([0.8, 0.6]) })], ["boundary"]],
    [[scored("a", 0.81), scored("best", 0.87), scored("c", 0.85)], ["best"]],
    [[scored("weak", 0.87), scored("strong", 0.9), scored("stronger", 0.95)], ["stronger", "strong"]],
    [[source("query"), source("same-url", { url: query().url }), scored("best", 0.85)], ["best"]],
    [[scored("b", 0.85), scored("a", 0.85), scored("a", 0.85)], ["a"]],
    [[scored("weak", 0.85), source("incompatible", { embedding: embedding([1, 0], "another-model") })], ["weak"]],
    [[source("missing", { embedding: null }), source("dimension", { embedding: embedding([1, 0, 0]) })], []],
  ];
  for (const [candidates, expected] of cases) {
    const before = structuredClone(candidates);
    const result = rankRelatedSources(query(), candidates, options);
    assert.deepEqual(result.map(item => item.id), expected);
    assert.deepEqual(prepareRelatedSources(candidates).rank(query(), options), result);
    const tokenPreparation = createRelatedSourcesPreparation();
    tokenPreparation.appendPrepared(candidates.map(prepareRelatedSource));
    assert.deepEqual(tokenPreparation.finish().rankPrepared(prepareRelatedSource(query()), options), result);
    assert.deepEqual(rankRelatedSources(query(), candidates.toReversed(), options), result);
    assert.deepEqual(rankRelatedSources(query(), candidates, { ...options, limit: 0 }), []);
    assert.deepEqual(candidates, before);
    assert.ok(result.every(item => item.relationship === "related" && item.method === "vector-similarity" &&
      !Object.hasOwn(item, "fallback")));
  }
  assert.deepEqual(rankRelatedSources(source("query", { topicId: "pinned" }), [
    scored("weaker", 0.85), source("confirmed", { topicId: "pinned", embedding: null }),
  ], options).map(item => item.id), ["confirmed"]);
});

test("fallback settings and every candidate stay fully validated", () => {
  for (const fallbackMinSimilarity of [NaN, Infinity, -1.01, 0.89, "0.8", null, undefined]) {
    rejects(() => rankRelatedSources(query(), [], { minSimilarity: 0.88, fallbackMinSimilarity }));
  }
  const options = { limit: 0, minSimilarity: 0.88, fallbackMinSimilarity: 0.8 };
  const bad = source("malformed-late", { embedding: embedding([NaN, 0]) });
  rejects(() => rankRelatedSources(query(), [source("strong"), bad], options));
  rejects(() => prepareRelatedSources([source("strong"), bad]));
  const withGetter = { minSimilarity: 0.88, get fallbackMinSimilarity() { assert.fail("accessor executed"); } };
  rejects(() => rankRelatedSources(query(), [], withGetter));
});

test("compatible hand-authored vectors retrieve related sources without assigning a Topic", () => {
  const candidates = [
    source("near", { topicId: "another-topic", embedding: embedding([0.8, 0.6]) }),
    source("opposite", { embedding: embedding([-1, 0]) }),
    source("orthogonal", { embedding: embedding([0, 1]) }),
    source("identical-vector"),
  ];
  const results = rankRelatedSources(query(), candidates);
  assert.deepEqual(results.map(({ id }) => id), ["identical-vector", "near"]);
  assert.deepEqual(results[1], {
    id: "near", url: "https://example.com/near", title: "Synthetic source near",
    topicId: "another-topic", relationship: "related", method: "vector-similarity",
    similarity: 0.8,
  });
  assert.equal(results[0].topicId, null);
  assert.equal(results[0].relationship, "related");
});

test("only existing equal nonnull Topic associations yield same-topic and take precedence", () => {
  const results = rankRelatedSources(source("query", { topicId: "confirmed" }), [
    source("perfect-vector"),
    source("confirmed-no-vector", { topicId: "confirmed", embedding: null }),
    source("confirmed-other-model", {
      topicId: "confirmed", embedding: embedding([-1], "another-model"),
    }),
  ]);
  assert.deepEqual(results.map(({ id }) => id), [
    "confirmed-no-vector", "confirmed-other-model", "perfect-vector",
  ]);
  for (const result of results.slice(0, 2)) {
    assert.equal(result.relationship, "same-topic");
    assert.equal(result.method, "confirmed-topic");
    assert.equal(result.similarity, null);
  }
  assert.deepEqual(rankRelatedSources(source("query", { embedding: null }), [
    source("null-topic", { embedding: null }),
  ]), []);
});

test("missing vectors or model/dimension mismatches abstain without rejecting valid candidates", () => {
  const results = rankRelatedSources(query(), [
    source("missing", { embedding: null }),
    source("dimension", { embedding: embedding([1, 0, 0]) }),
    source("model", { embedding: embedding([1, 0], "different") }),
    source("valid"),
  ]);
  assert.deepEqual(results.map(({ id }) => id), ["valid"]);
});

test("scores are cosine similarities with inclusive threshold and bounded result count", () => {
  const candidates = [source("b", { embedding: embedding([8, 6]) }), source("a")];
  assert.equal(rankRelatedSources(query(), candidates, { minSimilarity: 0.8 }).length, 2);
  assert.equal(rankRelatedSources(query(), candidates, { minSimilarity: 0.81 }).length, 1);
  assert.equal(rankRelatedSources(query(), candidates, { limit: 1 }).length, 1);
  assert.deepEqual(rankRelatedSources(query(), candidates, { limit: 0 }), []);
  assert.equal(rankRelatedSources(query(), [
    source("opposite", { embedding: embedding([-1, 0]) }),
  ], { minSimilarity: -1 })[0].similarity, -1);
  assert.equal(rankRelatedSources(query(), Array.from({ length: 8 }, (_, i) => source(`s${i}`))).length, 5);
});

test("more than 100 candidates rank in order while results remain capped at 100", () => {
  const candidates = Array.from({ length: 120 }, (_, index) => source(`s${String(index).padStart(3, "0")}`, {
    embedding: embedding([index === 119 ? 1 : 0.9, index === 119 ? 0 : Math.sqrt(0.19)]),
  }));
  const results = rankRelatedSources(query(), candidates, { limit: 100 });
  assert.equal(results.length, 100);
  assert.equal(results[0].id, "s119");
  assert.deepEqual(results.slice(1).map(({ id }) => id),
    Array.from({ length: 99 }, (_, index) => `s${String(index).padStart(3, "0")}`));
  assert.deepEqual(rankRelatedSources(query(), candidates.toReversed(), { limit: 2 }).map(({ id }) => id),
    ["s119", "s000"]);
});

test("finite extreme and subnormal coordinates produce finite bounded scores", () => {
  for (const value of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    const result = rankRelatedSources(
      source("query", { embedding: embedding([value, value]) }),
      [source("candidate", { embedding: embedding([value, value]) })],
    )[0];
    assert.ok(result.similarity > 0.999999999999);
    assert.ok(result.similarity <= 1);
  }
});

test("same source IDs and equivalent fragment URLs are excluded; all query arguments survive", () => {
  const results = rankRelatedSources(source("query", {
    url: "https://EXAMPLE.com:443/watch?v=1#first",
  }), [
    source("query", { url: "https://example.org/another" }),
    source("same-page", { url: "https://example.com/watch?v=1#second" }),
    source("different-id", { url: "https://example.com/watch?v=2#fragment" }),
    source("extra-query", { url: "https://example.com/watch?v=1&lang=en" }),
    source("queryless", { url: "https://example.com/watch" }),
  ]);
  assert.deepEqual(results.map(({ url }) => url), [
    "https://example.com/watch?v=2", "https://example.com/watch?v=1&lang=en",
    "https://example.com/watch",
  ]);
});

test("ranking, ties and ID/URL deduplication are deterministic independent of input order", () => {
  const candidates = [
    source("b", { url: "https://example.org/shared#one" }),
    source("a", { url: "https://example.org/shared#two" }),
    source("c", { embedding: embedding([0.8, 0.6]) }),
    source("c", { url: "https://example.org/better", embedding: embedding([1, 0]) }),
    source("d"),
  ];
  const expected = rankRelatedSources(query(), candidates);
  assert.deepEqual(rankRelatedSources(query(), candidates.toReversed()), expected);
  assert.deepEqual(expected.map(({ id }) => id), ["a", "c", "d"]);
  assert.equal(expected[1].url, "https://example.org/better");
});

test("caller data is unchanged and result projections are frozen and contain no vectors", () => {
  const current = query();
  const candidates = [source("candidate")];
  const before = structuredClone({ current, candidates });
  const result = rankRelatedSources(current, candidates);
  assert.deepEqual({ current, candidates }, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result[0]));
  assert.equal(Object.hasOwn(result[0], "embedding"), false);
  assert.equal(Object.hasOwn(result[0], "values"), false);
  assert.throws(() => { result[0].title = "changed"; }, TypeError);
  candidates[0].title = "changed caller";
  assert.equal(result[0].title, "Synthetic source candidate");
});

test("zero, empty, nonnumeric and nonfinite vectors reject even on excluded or confirmed sources", () => {
  for (const values of [[], [0, -0], [NaN, 1], [Infinity, 1], ["1", 0], [null, 0]]) {
    rejects(() => rankRelatedSources(query(), [source("query", { embedding: embedding(values) })]));
    rejects(() => rankRelatedSources(source("query", { topicId: "t" }), [
      source("candidate", { topicId: "t", embedding: embedding(values) }),
    ]));
  }
});

test("exact source/embedding/options shapes and plain prototypes are enforced", () => {
  const missing = source("candidate");
  delete missing.title;
  for (const candidate of [
    missing, { ...source("candidate"), extra: true },
    Object.assign(Object.create({ inherited: true }), source("candidate")),
    source("candidate", { embedding: { ...embedding([1, 0]), extra: true } }),
    source("candidate", { embedding: new Float32Array([1, 0]) }),
    source("candidate", { topicId: undefined }),
  ]) rejects(() => rankRelatedSources(query(), [candidate]));
  const plain = Object.assign(Object.create(null), source("candidate"));
  assert.equal(rankRelatedSources(query(), [plain]).length, 1);
  for (const options of [null, [], { extra: true }, { limit: undefined },
    { limit: -1 }, { limit: 101 }, { limit: 1.5 }, { minSimilarity: NaN },
    { minSimilarity: -1.01 }, { minSimilarity: 1.01 }, { minSimilarity: "0.5" }]) {
    rejects(() => rankRelatedSources(query(), [], options));
  }
});

test("accessors are rejected without invocation on sources, vectors, options and array entries", () => {
  let calls = 0;
  const getter = { enumerable: true, get() { calls += 1; return 1; } };
  const candidate = source("candidate");
  Object.defineProperty(candidate, "title", getter);
  rejects(() => rankRelatedSources(query(), [candidate]));
  const vector = embedding([1, 0]);
  Object.defineProperty(vector, "modelId", getter);
  rejects(() => rankRelatedSources(query(), [source("candidate", { embedding: vector })]));
  const options = {};
  Object.defineProperty(options, "limit", getter);
  rejects(() => rankRelatedSources(query(), [], options));
  const array = [source("candidate")];
  Object.defineProperty(array, "0", getter);
  rejects(() => rankRelatedSources(query(), array));
  const coordinates = [1, 0];
  Object.defineProperty(coordinates, "0", getter);
  rejects(() => rankRelatedSources(query(), [source("candidate", { embedding: embedding(coordinates) })]));
  assert.equal(calls, 0);
});

test("sparse, decorated, subclassed arrays and symbolic/nonenumerable fields reject", () => {
  class OtherArray extends Array {}
  const decorated = [source("candidate")];
  decorated.extra = true;
  const symbolic = source("candidate");
  symbolic[Symbol("hidden")] = true;
  const hidden = source("candidate");
  Object.defineProperty(hidden, "title", { value: hidden.title, enumerable: false });
  for (const candidates of [new Array(1), decorated, new OtherArray(source("candidate")), [symbolic], [hidden]]) {
    rejects(() => rankRelatedSources(query(), candidates));
  }
});

test("dimension and string bounds are enforced with generic errors", () => {
  rejects(() => rankRelatedSources(query(), [source("candidate", { embedding: embedding(Array(1_537).fill(1)) })]));
  for (const overrides of [
    { id: "a".repeat(129) }, { title: "a".repeat(513) }, { topicId: "a".repeat(129) },
    { title: "" }, { id: " " }, { title: "hidden\u202esecret" },
    { url: `https://example.com/${"a".repeat(8_192)}` },
    { embedding: embedding([1], "a".repeat(129)) },
  ]) rejects(() => rankRelatedSources(query(), [source("candidate", overrides)]));
  const maximum = source("candidate", { embedding: embedding(Array(1_536).fill(1)) });
  assert.equal(rankRelatedSources(source("query", { embedding: embedding(Array(1_536).fill(1)) }), [maximum]).length, 1);
});

test("prepared relational catalogs have a finite 16 Mi-unit budget; direct input stays at 8", () => {
  const url = `https://example.org/${'x'.repeat(8100)}`;
  const candidate = source('large', { url, embedding: embedding([1]) });
  const underPreparedBudget = Array(1100).fill(candidate);
  rejects(() => rankRelatedSources(query(), underPreparedBudget, { limit: 0 }));
  const prepared = prepareRelatedSources(underPreparedBudget);
  assert.deepEqual(prepared.rank(query(), { limit: 0 }), []);
  // Exhaustive validation still happens after crossing the legacy document cap.
  rejects(() => prepareRelatedSources([...underPreparedBudget, { ...candidate, title: '' }]));
  rejects(() => prepareRelatedSources(Array(2200).fill(candidate)));
});

test("oversized candidate and vector arrays reject before descriptor enumeration", () => {
  let getterCalls = 0;
  let descriptorEnumerations = 0;
  const oversized = () => {
    const values = new Array(1_000_000);
    Object.defineProperty(values, "0", {
      enumerable: true,
      get() { getterCalls += 1; return 1; },
    });
    // This instrumented proxy observes enumeration order only; JavaScript
    // proxies are not generally safe inputs and their reflection traps can run.
    return new Proxy(values, {
      ownKeys() { descriptorEnumerations += 1; throw new Error("unexpected enumeration"); },
    });
  };
  rejects(() => rankRelatedSources(query(), oversized()));
  rejects(() => rankRelatedSources(query(), [
    source("candidate", { embedding: embedding(oversized()) }),
  ]));
  assert.equal(descriptorEnumerations, 0);
  assert.equal(getterCalls, 0);
});

test("invalid/credentialed/non-web URL values reject without exposing input in errors", () => {
  for (const url of [
    "invalid-private-secret", "javascript:alert(1)", "file:///secret", "/relative",
    "https://user:private-secret@example.com/", " https://example.com/",
    "https://example.com/line\nbreak", "https:\\example.com/private-secret",
  ]) rejects(() => rankRelatedSources(query(), [source("candidate", { url })]));
});

test('opaque prepared Sources preserve exact scores, own their copies and cannot be forged', () => {
  const options = { limit: 100, minSimilarity: 0.88, fallbackMinSimilarity: 0.8 };
  for (const values of [[0.88, Math.sqrt(1-0.88**2), -0], [Number.MIN_VALUE, 0, -0], [1e300, 1e299, -0]]) {
    const input = source('candidate', { embedding: embedding(values) });
    const current = source('query', { embedding: embedding([1,0,-0]) });
    const expected = rankRelatedSources(current, [input], options);
    const token = prepareRelatedSource(input), queryToken = prepareRelatedSource(current);
    assert.deepEqual(Object.keys(token), []);
    assert.ok(Object.isFrozen(token));
    input.title = 'later changed'; input.embedding.values.fill(-1); current.embedding.values.fill(-1);
    const p = createRelatedSourcesPreparation(); p.appendPrepared([token]);
    assert.deepEqual(p.finish().rankPrepared(queryToken, options), expected);
    rejects(() => prepareRelatedSources([token]));
  }
  const p = createRelatedSourcesPreparation(); p.appendPrepared([prepareRelatedSource(source('ok'))]);
  rejects(() => p.appendPrepared([Object.freeze({})]));
  rejects(() => p.finish());
  const ready = prepareRelatedSources([source('candidate')]);
  rejects(() => ready.rankPrepared(Object.freeze({})));
  rejects(() => ready.rankPrepared(source('query')));
  let getters = 0;
  const values = [1,0]; Object.defineProperty(values,'0',{enumerable:true,get(){getters++;return 1;}});
  rejects(() => prepareRelatedSource(source('bad', {embedding:embedding(values)})));
  assert.equal(getters,0);
});

test('parser-owned and untrusted inputs mint the same exact prepared ranking without repeat reads', () => {
  const current = source('query'), plain = source('candidate', { embedding:embedding([.88,Math.sqrt(1-.88**2)]) });
  const owned = {...plain,embedding:parseRelatedEmbeddingJson(JSON.stringify(plain.embedding))};
  const options = {limit:20,minSimilarity:.88,fallbackMinSimilarity:.8};
  const expected = rankRelatedSources(current,[plain],options), queryToken=prepareRelatedSource(current);
  for(const input of [plain,owned]) {
    const p=createRelatedSourcesPreparation();p.appendPrepared([prepareRelatedSource(input)]);
    assert.deepEqual(p.finish().rankPrepared(queryToken,options),expected);
  }
  const token=prepareRelatedSource(source('large',{url:`https://example.org/${'x'.repeat(8100)}`,embedding:embedding([1])}));
  const p=createRelatedSourcesPreparation();
  p.appendPrepared(Array(1100).fill(token));
  rejects(()=>p.appendPrepared(Array(1100).fill(token)));
  rejects(()=>p.finish());
});
