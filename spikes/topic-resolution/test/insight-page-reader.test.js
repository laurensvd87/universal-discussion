import assert from "node:assert/strict";
import test from "node:test";
import { createInsightPageReader } from "../browser/chromium/insight-page-reader.js";

const url = "https://example.com/article";
function state(sourceUrl = url, selection = "automatic") {
  return { sourceId: "source-a", topicId: "topic-a", selection,
    catalog: { sources: [{ id: "source-a", topicId: "topic-a", url: sourceUrl }] }, resolution: null };
}
function harness(tabUrl = url) {
  const executions = [];
  const scriptingApi = { async executeScript(options) {
    executions.push(options);
    return [{ frameId: 0, documentId: "document-a", result: options.target.documentIds
      ? { contractVersion: "page-content-attestation/1", status: "attested", url }
      : { contractVersion: "page-content/1", status: "collected", url, title: "Article",
        text: "Visible public article text", extractorVersion: "main-text-prefix/v1" } }];
  } };
  const reader = createInsightPageReader({ scriptingApi, readActiveTab: async () => ({ tabId: 7, url: tabUrl }) });
  return { reader, executions };
}

test("current selected page reads with bounded packaged reader and attests the same document", async () => {
  const { reader, executions } = harness(`${url}#section`);
  const article = await reader.read(state());
  assert.equal(article.text, "Visible public article text");
  assert.equal(await reader.attest(state(), article), true);
  assert.equal(executions.length, 2);
  assert.deepEqual(executions[1].target, { tabId: 7, documentIds: ["document-a"] });
});

test("different selected URL, private URL and changed active tab never read", async () => {
  for (const [selectedUrl, activeUrl] of [["https://example.org/other", url],
    ["https://mail.example.org/inbox", "https://mail.example.org/inbox"],
    [url, "https://example.org/other"]]) {
    const { reader, executions } = harness(activeUrl);
    await assert.rejects(reader.read(state(selectedUrl, "manual")), TypeError);
    assert.equal(executions.length, 0);
  }
});

test("changed document fails attestation", async () => {
  const { reader } = harness();
  const article = await reader.read(state());
  await assert.rejects(reader.attest(state(), { ...article, documentId: "different-document" }), TypeError);
});
