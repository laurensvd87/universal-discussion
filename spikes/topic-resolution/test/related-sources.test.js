import assert from "node:assert/strict";
import test from "node:test";
import { rankRelatedSources } from "../browser/core/related-sources.js";

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

test("candidate, dimension and string bounds are enforced with generic errors", () => {
  rejects(() => rankRelatedSources(query(), Array.from({ length: 101 }, (_, i) => source(`s${i}`))));
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
