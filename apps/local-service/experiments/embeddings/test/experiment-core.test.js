import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EXPECTED_CORPUS_DIGEST, assertFrozenCorpus, validateDescriptor, validateTokenIds, meanPoolHidden, buildE5ModelId, compareVectors, summarizeTimings } from "../src/experiment-core.js";

test("frozen corpus assertion rejects changed text and relevance before inference", () => {
  const corpus = JSON.parse(readFileSync(new URL("../fixtures/corpus.json", import.meta.url), "utf8"));
  assert.equal(EXPECTED_CORPUS_DIGEST, "4a75170ae6e0b4db993f1d0f17b79f57519a2da4ba306c10304fb21c60cb19a9");
  assert.ok(Object.isFrozen(assertFrozenCorpus(corpus).descriptors[0]));
  const text = structuredClone(corpus);
  text.descriptors[0].text += " Changed.";
  assert.throws(() => assertFrozenCorpus(text), /freeze mismatch/u);
  const labels = structuredClone(corpus);
  labels.queries[0].expectedIds.reverse();
  assert.throws(() => assertFrozenCorpus(labels), /freeze mismatch/u);
});

test("descriptor bounds reject excess, blanks and unsafe control text without truncation", () => {
  assert.equal(validateDescriptor("a".repeat(4096)).length, 4096);
  assert.equal(validateDescriptor("架空の短い説明"), "架空の短い説明");
  for (const value of ["", "  ", "a".repeat(4097), "hidden\u0000text", "a\u202eb", null]) assert.throws(() => validateDescriptor(value), TypeError);
});

test("token bounds require complete dense integer arrays including special tokens", () => {
  const ids = Array(512).fill(9);
  assert.ok(Object.isFrozen(validateTokenIds(ids, { rows: 10 })));
  assert.deepEqual(validateTokenIds([0, 9], { rows: 10, maxTokens: 2 }), [0, 9]);
  for (const value of [[], Array(513).fill(1), [10], [-1], [1.5], [NaN], [Infinity], [1n], new Uint32Array([1]), [, 1]]) assert.throws(() => validateTokenIds(value, { rows: 10 }), TypeError);
  assert.throws(() => validateTokenIds([1], { rows: 10, maxTokens: 513 }), TypeError);
  assert.throws(() => validateTokenIds([1], { rows: 0 }), TypeError);
  assert.throws(() => validateTokenIds([1]), TypeError);
  const accessor = [1];
  Object.defineProperty(accessor, "0", { enumerable: true, get() { throw new Error("Executed accessor"); } });
  assert.throws(() => validateTokenIds(accessor, { rows: 10 }), TypeError);
});

function hidden(tokens = 3) { return { data: new Float32Array(tokens * 384), dims: [1, tokens, 384] }; }
test("masked mean includes attended special tokens, omits padding and normalizes the entire vector", () => {
  const states = hidden();
  states.data[0] = 2;
  states.data[384 + 1] = 2;
  states.data[768 + 2] = 999;
  const result = meanPoolHidden(states, new BigInt64Array([1n, 1n, 0n]));
  assert.equal(result.length, 384);
  assert.ok(Object.isFrozen(result));
  assert.ok(Math.abs(result[0] - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(result[1] - Math.SQRT1_2) < 1e-12);
  assert.equal(result[2], 0);
  assert.ok(Math.abs(Math.hypot(...result) - 1) < 1e-12);
  assert.deepEqual(result, meanPoolHidden(states, [1, 1, 0]));
});

test("pooling rejects already pooled/wrong shapes, invalid masks, nonfinite and zero outputs", () => {
  const changes = [
    (value) => { value.dims = [1, 384]; },
    (value) => { value.dims = [2, 3, 384]; },
    (value) => { value.dims = [1, 3, 383]; },
    (value) => { value.dims = [1, 513, 384]; },
    (value) => { value.data = new Float32Array(1); },
    (value) => { value.data[800] = Infinity; },
    (value) => { value.data[800] = NaN; },
  ];
  for (const change of changes) { const value = hidden(); value.data[0] = 1; change(value); assert.throws(() => meanPoolHidden(value, [1, 1, 0]), TypeError); }
  const value = hidden(); value.data[0] = 1;
  for (const mask of [[1], [0, 0, 0], [1, 2, 0], [1, NaN, 0], [1, , 0]]) assert.throws(() => meanPoolHidden(value, mask), TypeError);
  assert.throws(() => meanPoolHidden(hidden(), [1, 1, 0]), TypeError);
  value.data[384] = -1;
  assert.throws(() => meanPoolHidden(value, [1, 1, 0]), TypeError);
});

test("pooling handles finite extreme and subnormal values without false overflow or zero", () => {
  for (const magnitude of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    const value = { data: Array(768).fill(0), dims: [1, 2, 384] };
    value.data[0] = magnitude;
    value.data[384] = magnitude;
    assert.equal(meanPoolHidden(value, [1, 1])[0], 1);
  }
});

function identity() { return { sourceSha256: "1".repeat(64), tokenizerSha256: "2".repeat(64), configSha256: "3".repeat(64), tokenizerConfigSha256: "4".repeat(64), specialTokensSha256: "5".repeat(64), revision: "6".repeat(40) }; }
test("bounded E5 identity changes for every asset/revision and advertises uncertified JS CPU q8", () => {
  const modelId = buildE5ModelId(identity());
  assert.match(modelId, /^e5-q8-js-cpu-uncertified\/v1:[a-f0-9]{64}$/u);
  assert.ok(modelId.length <= 128);
  assert.equal(modelId, buildE5ModelId(Object.fromEntries(Object.entries(identity()).reverse())));
  for (const key of Object.keys(identity())) { const value = identity(); value[key] = "a".repeat(key === "revision" ? 40 : 64); assert.notEqual(buildE5ModelId(value), modelId); }
  for (const bad of ["", "g".repeat(64), "A".repeat(64), "1".repeat(63)]) { const value = identity(); value.sourceSha256 = bad; assert.throws(() => buildE5ModelId(value), TypeError); }
  const value = identity(); delete value.specialTokensSha256;
  assert.throws(() => buildE5ModelId(value), TypeError);
});

function collection(modelId = "test-space/v1") { return { modelId, dimensions: 2, vectors: [{ id: "b", modelId, values: [1, 0] }, { id: "a", modelId, values: [0, 1] }] }; }
test("vector comparisons match by ID, quantify cosine drift and require explicit variant comparison", () => {
  const candidate = collection();
  candidate.vectors.reverse();
  candidate.vectors.find((vector) => vector.id === "b").values = [0, 1];
  const result = compareVectors(collection(), candidate);
  assert.equal(result.meanDrift, 0.5);
  assert.equal(result.maxDrift, 1);
  assert.deepEqual(result.perId.map((row) => row.id), ["a", "b"]);
  assert.ok(Object.isFrozen(result.perId[0]));
  assert.throws(() => compareVectors(collection(), collection("test-int8/v1")), TypeError);
  const controls = compareVectors(collection(), collection("test-int8/v1"), { allowRelatedVariantComparison: true });
  assert.equal(controls.meanDrift, 0);
  assert.equal(controls.relatedVariantComparison, true);
});

test("comparison rejects mismatched dimensions/IDs, duplicates, zero and nonfinite vectors", () => {
  const changes = [
    (value) => { value.dimensions = 3; },
    (value) => { value.vectors[0].id = "missing"; },
    (value) => { value.vectors[0].id = "a"; },
    (value) => { value.vectors.pop(); },
    (value) => { value.vectors[0].values = [0, 0]; },
    (value) => { value.vectors[0].values = [Infinity, 0]; },
    (value) => { value.vectors[0].values = [1, ,]; },
    (value) => { value.vectors[0].modelId = "wrong/v1"; },
  ];
  for (const change of changes) { const value = collection(); change(value); assert.throws(() => compareVectors(collection(), value, { allowRelatedVariantComparison: true }), TypeError); }
  const options = { get allowRelatedVariantComparison() { throw new Error("Executed accessor"); } };
  assert.throws(() => compareVectors(collection(), collection(), options), TypeError);
});

test("timings use deterministic midpoint median and nearest-rank p95 without mutating input", () => {
  const samples = [4, 1, 3, 2];
  assert.deepEqual(summarizeTimings(samples), { count: 4, min: 1, median: 2.5, p95: 4, max: 4 });
  assert.deepEqual(samples, [4, 1, 3, 2]);
  assert.equal(summarizeTimings(Array.from({ length: 20 }, (_, index) => index + 1)).p95, 19);
  assert.equal(summarizeTimings([1, 2, 3]).median, 2);
  assert.deepEqual(summarizeTimings([0]), { count: 1, min: 0, median: 0, p95: 0, max: 0 });
  for (const value of [[], [-1], [NaN], [Infinity], [1, , 2]]) assert.throws(() => summarizeTimings(value), TypeError);
});
