import assert from "node:assert/strict";
import test from "node:test";
import { inspectPageUrl, inspectRetainedSourceDtoUrl } from "../browser/core/page-content-policy.js";
import { readCatalog, readRelated, readPostOrigin, readIngestion } from "../browser/core/local-service-contract.js";
import { buildInsightContext } from "../browser/core/insight-context.js";

const URL = "https://account.example.com/articles/public-story?id=42";
const version = { generation: "generation-test", revision: 0 };
const model = { id: null, status: "model-unavailable" };
const source = (url) => ({ id: "source-a", url, title: "Synthetic public story",
  provenance: "owner-local-page-embedding/v1", topicId: "topic-a" });
const catalog = (url) => ({ version, model, actors: [],
  topics: [{ id: "topic-a", title: "Synthetic topic", kind: "general" }], sources: [source(url)] });
const related = (url) => ({ version, model, results: [{ id: "source-a", url,
  title: "Synthetic public story", topicId: "topic-a", relationship: "same-topic", method: "confirmed-topic" }] });

test("retained account-host Sources project through authenticated catalog and related DTOs only", () => {
  assert.equal(inspectRetainedSourceDtoUrl(URL).supported, true);
  assert.equal(readCatalog(catalog(URL)).sources[0].url, URL);
  assert.equal(readRelated(related(URL), 1).results[0].url, URL);
  assert.equal(inspectPageUrl(URL).supported, false);
  assert.throws(() => readIngestion({ expected: version, operationId: "operation-a", url: URL,
    title: "Synthetic public story", embedding: { modelId: "e5-small-q8-browser-main-prefix-v1",
      values: [1, ...Array(383).fill(0)] }, extractorVersion: "main-text-prefix/v1" }));
  assert.throws(() => readPostOrigin({ sourceId: "source-a", url: URL, title: "Synthetic public story" }));
  const publicSource = { ...source("https://example.org/articles/other-story"), id: "source-b" };
  const projected = readCatalog({ ...catalog(URL), sources: [source(URL), publicSource] });
  const context = buildInsightContext({ catalog: projected, discussion: null,
    related: readRelated(related(URL), 1), sourceId: "source-b", topicId: "topic-a" });
  assert.equal(context.currentSource.url, publicSource.url);
  assert.deepEqual(context.sameTopicSources, []);
  assert.deepEqual(context.relatedSources, []);
});

test("retained DTO exception still rejects private paths, credential queries and private hosts", () => {
  for (const url of [
    "https://account.example.com/account/settings",
    "https://account.example.com/%61uth/callback",
    "https://account.example.com/articles/public-story?access_token=secret",
    "https://account.example.com/articles/public-story?code=secret&state=nonce",
    "https://account.example.com/articles/public-story?code=secret&STATE=nonce",
    "https://account.example.com/articles/public-story?code=secret&State=nonce",
    "https://user:password@account.example.com/articles/public-story",
    "https://account.internal/articles/public-story",
    "https://account.local/articles/public-story",
    "http://account.example.com/articles/public-story",
  ]) {
    assert.equal(inspectRetainedSourceDtoUrl(url).supported, false, url);
    assert.throws(() => readCatalog(catalog(url)), url);
    assert.throws(() => readRelated(related(url), 1), url);
  }
});
