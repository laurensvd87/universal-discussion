import assert from "node:assert/strict";
import test from "node:test";
import { inspectPageNavigationUrl, inspectPageUrl } from "../browser/core/page-content-policy.js";
import { createPageContentReader } from "../browser/chromium/page-content-reader.js";
import { createInsightPageReader } from "../browser/chromium/insight-page-reader.js";

const publicUrl = "https://public.example.org/article";

test("Trust: session navigation never makes the canonical URL inspector permissive", () => {
  for (const key of ["sid", "session", "session_id", "s.e.s.s.i.o.n.i.d"]) {
    const raw = `${publicUrl}?${key}=synthetic-only&utm_medium=fixture&id=17&id=18#section`;
    const observed = inspectPageNavigationUrl(raw);
    assert.equal(observed.supported, true);
    assert.equal(observed.url, `${publicUrl}?id=17&id=18`);
    assert.equal(observed.documentUrl, raw.split("#")[0]);
    assert.equal(inspectPageUrl(raw).supported, false);
    assert.equal(inspectPageUrl(observed.url).supported, true);
  }
});

test("Trust: stripping cannot rescue structural or non-session credential failures", () => {
  const jwt = "eyJhbGciOiJub25lIn0.eyJmaXh0dXJlIjp0cnVlfQ.synthetic";
  for (const raw of [
    `${publicUrl}?sid=fixture&token=synthetic`,
    `${publicUrl}?sid=fixture&code=synthetic&state=fixture`,
    `${publicUrl}?sid=fixture&utm_source=${jwt}`,
    `${publicUrl}?sid=fixture&signature=synthetic`,
    `${publicUrl}?sid=fixture&key=synthetic-long-key-value`,
    "https://public.example.org/account?sid=fixture",
    "https://public.example.org/checkout?sid=fixture",
    "https://login.example.org/article?sid=fixture",
    "https://user:fixture@public.example.org/article?sid=fixture",
    "http://public.example.org/article?sid=fixture",
    "https://public.example.org:9443/article?sid=fixture",
    `${publicUrl}?${Array.from({ length: 65 }, (_, i) => `sid=${i}`).join("&")}`,
    `${publicUrl}?sid=${"x".repeat(2048)}`,
    `${publicUrl}?sid=fixture\n`,
  ]) assert.equal(inspectPageNavigationUrl(raw).supported, false);
});

test("Trust: functional query encoding and duplicates survive minimization", () => {
  const functional = "id=1&id=2&lang=de&selection=a%20b&literal=a+b&empty=&blob=a%26sid%3Dfixture";
  const observed = inspectPageNavigationUrl(`${publicUrl}?${functional}&SID=fixture&gclid=tracking`);
  assert.equal(observed.url, `${publicUrl}?${functional}`);
});

test("Trust: ambiguous semicolon session and credential fields fail closed", () => {
  for (const key of ["sid", "%73id", "session_id", "access_token", "signature", "code", "state"]) {
    const raw = `https://www.booking.com/hotel/de/synthetic.en-gb.html?aid=17;label=fixture;${key}=synthetic-only`;
    assert.deepEqual(inspectPageNavigationUrl(raw), { supported: false, reason: "credential-query" });
  }
  const functional = `${publicUrl}?blob=a%3Bsid%3Dsynthetic-only&sid=removed`;
  assert.equal(inspectPageNavigationUrl(functional).url, `${publicUrl}?blob=a%3Bsid%3Dsynthetic-only`);
});

test("Trust: reader refuses a canonical Source paired with a foreign document witness before executing", async () => {
  let executions = 0;
  const reader = createPageContentReader({ executeScript: async () => { executions++; } });
  await assert.rejects(reader.read(3, publicUrl, "https://other.example.org/article?sid=fixture"));
  await assert.rejects(reader.attest(3, "document-fixture", publicUrl, `${publicUrl}?id=other&sid=fixture`));
  await assert.rejects(reader.read(3, `${publicUrl}?sid=fixture`, `${publicUrl}?sid=fixture`));
  assert.equal(executions, 0);
});

test("Trust: manual Insight cannot attest the captured article in another tab with identical URL", async () => {
  let tabId = 3;
  let executions = 0;
  const documentUrl = `${publicUrl}?sid=fixture`;
  const selected = { sourceId: "source-fixture", topicId: "topic-fixture", selection: "manual",
    catalog: { sources: [{ id: "source-fixture", topicId: "topic-fixture", url: publicUrl }] } };
  const reader = createInsightPageReader({ readActiveTab: async () => ({ tabId, url: documentUrl }),
    scriptingApi: { executeScript: async () => {
      executions++;
      return [{ frameId: 0, documentId: "document-fixture", result: { contractVersion: "page-content/1",
        status: "collected", url: publicUrl, title: "Fixture", text: "Owned synthetic fixture text",
        extractorVersion: "main-text-prefix/v1" } }];
    } } });
  const article = await reader.read(selected);
  tabId = 4;
  await assert.rejects(reader.attest(selected, article));
  assert.equal(executions, 1);
  tabId = 3;
  await assert.rejects(reader.attest(selected, article));
  assert.equal(executions, 1);
});
