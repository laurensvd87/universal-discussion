import assert from "node:assert/strict";
import test from "node:test";
import { rankRelatedSources } from "../../../../spikes/topic-resolution/browser/core/related-sources.js";
import { proposeRelatedCandidates } from "./related-retrieval.js";

function source(id, angle, title = id, topicId = null, host = "example.test") {
  return { id, url: `https://${host}/${id}`, title, topicId,
    embedding: { modelId: "synthetic-one-vector", values: [Math.cos(angle), Math.sin(angle)] } };
}

test("near-copy flood cannot consume every related nomination", () => {
  const query = source("query", 0, "Question under discussion");
  const copies = Array.from({ length: 25 }, (_, index) => source(`copy-${String(index).padStart(2, "0")}`, 0.04,
    "Syndicated account", null, `publisher-${index}.test`));
  const alternate = source("alternate", 0.2, "Opposing position on question", null, "other.test");
  const records = [query, ...copies, alternate];
  assert.ok(!rankRelatedSources(query, records, { limit: 20, minSimilarity: 0.85 }).some(row => row.id === alternate.id));
  const proposal = proposeRelatedCandidates(query, records);
  assert.deepEqual(proposal.map(row => row.id), ["copy-00", "alternate"]);
  assert.equal(proposal[1].relationship, "related");
});

test("existing same-Topic peers retain precedence and distinct equal titles survive", () => {
  const query = source("query", 0, "Overview", "topic-a");
  const peer = source("peer", 1, "Overview", "topic-a");
  const a = source("a", 0.1, "Live updates", "topic-b", "a.test");
  const b = source("b", 0.5, "Live updates", "topic-c", "b.test");
  const rows = proposeRelatedCandidates(query, [a, query, b, peer]);
  assert.equal(rows[0].id, "peer");
  assert.equal(rows[0].relationship, "same-topic");
  assert.deepEqual(rows.slice(1).map(row => row.id), ["a", "b"]);
});

test("proposal is deterministic, read-only and leaves incompatible vectors excluded", () => {
  const query = source("query", 0);
  const a = source("a", 0.03, "Repeat");
  const b = source("b", 0.04, "Repeat");
  const c = source("c", 0.2, "Different angle");
  const incompatible = { ...source("wrong", 0.01), embedding: { modelId: "other-space", values: [1, 0] } };
  const records = [query, a, b, c, incompatible];
  const before = structuredClone(records);
  const first = proposeRelatedCandidates(query, records);
  const second = proposeRelatedCandidates(query, [...records].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(records, before);
  assert.ok(first.every(row => !Object.hasOwn(row, "embedding")));
  assert.ok(!first.some(row => row.id === "wrong"));
});

test("duplicate IDs with conflicting vectors fail closed in either input order", () => {
  const query = source("query", 0);
  const first = source("copy", 0.02, "Repeated title");
  const conflicting = source("copy", 0.7, "Repeated title", null, "elsewhere.test");
  const alternate = source("alternate", 0.2, "Another angle");
  for (const copies of [[first, conflicting], [conflicting, first]]) {
    assert.throws(() => proposeRelatedCandidates(query, [query, ...copies, alternate]),
      { name: "TypeError", message: "Duplicate proposal Source ID" });
  }
  assert.throws(() => proposeRelatedCandidates(query, [query, { ...query, url: "https://elsewhere.test/query" }, alternate]),
    { name: "TypeError", message: "Duplicate proposal Source ID" });
});
