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
  let activeUrl = tabUrl;
  let nextUrl = null;
  const scriptingApi = { async executeScript(options) {
    executions.push(options);
    if (nextUrl !== null) { activeUrl = nextUrl; nextUrl = null; }
    return [{ frameId: 0, documentId: "document-a", result: options.target.documentIds
      ? { contractVersion: "page-content-attestation/1", status: "attested", url }
      : { contractVersion: "page-content/1", status: "collected", url, title: "Article",
        text: "Visible public article text", extractorVersion: "main-text-prefix/v1" } }];
  } };
  const reader = createInsightPageReader({ scriptingApi, readActiveTab: async () => ({ tabId: 7, url: activeUrl }) });
  return { reader, executions, setUrl(value) { activeUrl = value; }, navigateDuringScript(value) { nextUrl = value; } };
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

test("sid and tracking navigation reads and attests canonical Source without exposing raw URL", async () => {
  const documentUrl = url + "?sid=synthetic-session&utm_source=fixture";
  for (const selection of ["automatic", "manual", "background"]) {
    const { reader, executions } = harness(documentUrl + "#section");
    const selected = state(url, selection);
    if (selection === "background") selected.resolution = { enabled: true, phase: "ready", tabId: 7,
      documentId: "document-a", sourceId: "source-a", topicId: "topic-a", currentTabId: 7,
      url: documentUrl, currentUrl: documentUrl, hostAccess: true, sessionWindowId: 1,
      currentWindowId: 1, blockedOrigins: [], currentOrigin: "https://example.com" };
    const article = await reader.read(selected);
    assert.deepEqual(article, { text: "Visible public article text", url, documentId: "document-a" });
    assert.equal(JSON.stringify(article).includes("synthetic-session"), false);
    assert.equal(await reader.attest(selected, { url: article.url, documentId: article.documentId }), true);
    assert.deepEqual(executions.map((call) => call.args), [[url, documentUrl], [url, documentUrl]]);
  }
});

test("manual same-Source query changes invalidate reads and attestation before and after script awaits", async () => {
  const first = url + "?sid=synthetic-first&utm_source=fixture";
  const changed = url + "?sid=synthetic-second&utm_source=fixture";
  const selected = state(url, "manual");
  const duringRead = harness(first);
  duringRead.navigateDuringScript(changed);
  await assert.rejects(duringRead.reader.read(selected), /Current page changed/);

  const beforeAttest = harness(first);
  const article = await beforeAttest.reader.read(selected);
  beforeAttest.setUrl(changed);
  await assert.rejects(beforeAttest.reader.attest(selected, article), /Current page changed/);
  assert.equal(beforeAttest.executions.length, 1);
  beforeAttest.setUrl(first);
  await assert.rejects(beforeAttest.reader.attest(selected, article), /Current page changed/);

  const duringAttest = harness(first);
  const current = await duringAttest.reader.read(selected);
  duringAttest.navigateDuringScript(changed);
  await assert.rejects(duringAttest.reader.attest(selected, current), /Current page changed/);
  duringAttest.setUrl(first);
  await assert.rejects(duringAttest.reader.attest(selected, current), /Current page changed/);
});

test("background matching requires original navigation witness even for the same clean Source", async () => {
  const first = url + "?sid=synthetic-first";
  const { reader, executions } = harness(url + "?sid=synthetic-second");
  const selected = state(url, "background");
  selected.resolution = { enabled: true, phase: "ready", tabId: 7, documentId: "document-a",
    sourceId: "source-a", topicId: "topic-a", currentTabId: 7, url: first, currentUrl: first,
    hostAccess: true, sessionWindowId: 1, currentWindowId: 1, blockedOrigins: [], currentOrigin: "https://example.com" };
  await assert.rejects(reader.read(selected), /Current page changed/);
  assert.equal(executions.length, 0);
});

test("a failed new read removes previous article provenance", async () => {
  const { reader, setUrl } = harness();
  const article = await reader.read(state());
  setUrl("https://example.org/other");
  await assert.rejects(reader.read(state()), /Current page changed/);
  setUrl(url);
  await assert.rejects(reader.attest(state(), article), /Current page changed/);
});
