import assert from "node:assert/strict";
import test from "node:test";
import { BROWSER_MODEL_ID } from "../src/domain/learned-sources.js";
import { demoService } from "./helpers.js";

const CRAWLER_EXTRACTOR = "crawler-static-html-prefix/v1";

function normalizedVector(angle) {
  const values = Array(384).fill(0);
  values[0] = Math.cos(angle);
  values[1] = Math.sin(angle);
  assert.ok(Math.abs(Math.hypot(...values) - 1) < Number.EPSILON * 4);
  return values;
}

function crawlerInput(service, suffix, angle) {
  return {
    expected: service.catalog().version,
    operationId: `crawler-canonical-${suffix}`,
    url: `https://example.com/articles/crawler-canonical-${suffix}`,
    title: `Crawler canonical ${suffix}`,
    embedding: { modelId: BROWSER_MODEL_ID, values: normalizedVector(angle) },
    extractorVersion: CRAWLER_EXTRACTOR,
  };
}

test("canonical ingestion accepts crawler representations, groups them and never projects vectors", () => {
  const service = demoService();
  const first = service.ingest(crawlerInput(service, "first", 0));
  const second = service.ingest(crawlerInput(service, "second", 0.05));
  assert.equal(first.assignment, "provisional");
  assert.equal(second.assignment, "provisional");
  assert.equal(second.topicId, first.topicId);
  assert.notEqual(second.sourceId, first.sourceId);

  const catalog = service.catalog();
  const projected = catalog.sources.filter(source => [first.sourceId, second.sourceId].includes(source.id));
  assert.deepEqual(projected, [
    {
      id: first.sourceId,
      url: "https://example.com/articles/crawler-canonical-first",
      title: "Crawler canonical first",
      provenance: "owner-local-page-embedding/v1",
      topicId: first.topicId,
    },
    {
      id: second.sourceId,
      url: "https://example.com/articles/crawler-canonical-second",
      title: "Crawler canonical second",
      provenance: "owner-local-page-embedding/v1",
      topicId: first.topicId,
    },
  ]);
  for (const source of projected) {
    assert.equal(Object.hasOwn(source, "embedding"), false);
    assert.equal(Object.hasOwn(source, "extractorVersion"), false);
    assert.equal(Object.hasOwn(source, "operationId"), false);
    assert.equal(Object.hasOwn(source, "operationDigest"), false);
  }

  const related = service.related(first.sourceId, 20);
  assert.equal(related.model.id, BROWSER_MODEL_ID);
  assert.deepEqual(related.results, [{
    id: second.sourceId,
    url: "https://example.com/articles/crawler-canonical-second",
    title: "Crawler canonical second",
    topicId: first.topicId,
    relationship: "related",
    method: "vector-similarity",
  }]);
  const publicJson = JSON.stringify({ catalog, related });
  assert.equal(publicJson.includes('"embedding":'), false);
  assert.equal(publicJson.includes('"extractorVersion":'), false);
  assert.equal(publicJson.includes('"operationId":'), false);
  assert.equal(publicJson.includes(normalizedVector(0).join(",")), false);
});
