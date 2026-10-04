import test from "node:test";
import assert from "node:assert/strict";
import { extractPublicArticle, oneResponseFetch, qualityMetrics, PUBLIC_PAGE, RELATED_TEXT_PAGE,
  publicCitationSummary, readPublicPage, readRequiredRelatedExcerpts } from "../harness/run-live-insight-qa.js";
import { inspectPageUrl } from "../../../spikes/topic-resolution/browser/core/page-content-policy.js";

test("curated current and related URLs pass the app's public URL policy", () => {
  for (const source of [PUBLIC_PAGE, ...PUBLIC_PAGE.related, RELATED_TEXT_PAGE, ...RELATED_TEXT_PAGE.related]) {
    assert.deepEqual(inspectPageUrl(source.url).supported, true, source.url);
  }
});

test("PEP current page uses the fixed URL and anonymous bounded fetch", async () => {
  const calls = [];
  const paragraph = "Python code formatting makes shared projects easier to read and review. ".repeat(4);
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, redirected: false, url, headers: new Headers({ "content-type": "text/html" }),
      body: new Response(`<main><p>${paragraph}</p></main>`).body };
  };
  const article = await readPublicPage(fetchImpl, RELATED_TEXT_PAGE);
  assert.match(article, /Python code formatting/u);
  assert.equal(calls[0].url, RELATED_TEXT_PAGE.url);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.referrerPolicy, "no-referrer");
});

test("related-text mode requires a bounded excerpt before a Responses request", async () => {
  const context = { sameTopicSources: RELATED_TEXT_PAGE.related.map((source, index) =>
    ({ id: `qa-pep-related-${index + 1}`, ...source })), relatedSources: [] };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, redirected: false, url, headers: new Headers({ "content-type": "text/html" }),
      body: new Response(`<main><article><p>${"Public Python style text explains conventions and tradeoffs for maintainers. ".repeat(4)}</p></article></main>`).body };
  };
  const excerpts = await readRequiredRelatedExcerpts(context, fetchImpl);
  assert.equal(excerpts.length, 3);
  assert.deepEqual(excerpts.map(({ url }) => url), RELATED_TEXT_PAGE.related.map(({ url }) => url));
  assert.ok(excerpts.every(({ text }) => text.length >= 80 && text.length <= 2_048));
  assert.ok(excerpts.reduce((total, { text }) => total + text.length, 0) <= 8_192);
  assert.ok(calls.every(({ options }) => options.credentials === "omit" && options.redirect === "error" &&
    options.referrerPolicy === "no-referrer"));
  const metrics = qualityMetrics({ body: "PEP 8 offers a starting point. What convention matters most?", citations: [] },
    "current article", excerpts);
  assert.equal(metrics.relatedExcerptCount, 3);
  assert.equal(metrics.relatedExcerptCharacters, excerpts.reduce((total, { text }) => total + text.length, 0));
  assert.ok(!JSON.stringify(metrics).includes("Public Python style text"));

  await assert.rejects(readRequiredRelatedExcerpts(context, async (url) => ({ ok: false, url,
    headers: new Headers(), body: null })), /Related public excerpts unavailable/u);
});

test("PEP citation summary accepts only clean PEP URLs and titles", () => {
  const citations = [
    { url: RELATED_TEXT_PAGE.url, title: "PEP 8" },
    { url: "https://peps.python.org/pep-0257/", title: "PEP 257" },
    { url: "https://peps.python.org/other/", title: "Other" },
    { url: "https://peps.python.org/pep-0020/?x=1", title: "Query" },
    { url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview", title: "MDN" },
    { url: "https://peps.python.org/pep-0007/", title: "Unsafe\nTitle" },
  ];
  assert.deepEqual(publicCitationSummary(citations, RELATED_TEXT_PAGE), citations.slice(0, 2));
  assert.deepEqual(publicCitationSummary(citations, PUBLIC_PAGE), [citations[4]]);
});

test("public article extraction is bounded to the main prose", () => {
  const paragraph = "HTTP messages carry a request or response and provide headers for related metadata. ";
  const html = `<html><nav>Never include this navigation</nav><main><script>Never include this script</script>
    <p>${paragraph.repeat(4)}</p><form><p>Never include this form text.</p></form>
    <p>Connection behavior differs by protocol version. ${paragraph.repeat(3)}</p></main></html>`;
  const text = extractPublicArticle(html);
  assert.match(text, /HTTP messages carry/u);
  assert.match(text, /Connection behavior differs/u);
  assert.doesNotMatch(text, /Never include/u);
  assert.ok(text.length <= 4_096);
  assert.throws(() => extractPublicArticle("<html><body>no article</body></html>"), /region unavailable/u);
});

test("provider wrapper caps Responses at one dispatch", async () => {
  const calls = [];
  const guarded = oneResponseFetch(async (url) => { calls.push(url); return { ok: true }; });
  await guarded.fetch("https://api.openai.com/v1/responses", { method: "POST" });
  assert.equal(guarded.responsesSent(), 1);
  assert.throws(() => guarded.fetch("https://api.openai.com/v1/responses", { method: "POST" }), /One Responses/u);
  assert.throws(() => guarded.fetch("https://example.com/v1/responses", { method: "POST" }), /Unexpected provider/u);
  assert.throws(() => guarded.fetch("https://api.openai.com:444/v1/responses", { method: "POST" }), /Unexpected provider/u);
  assert.deepEqual(calls, ["https://api.openai.com/v1/responses"]);
});

test("quality metrics contain counts without body text", () => {
  const metrics = qualityMetrics({ body: "HTTP has a concrete implication. What might change?", citations: [{ url: "https://developer.mozilla.org" }] }, "article");
  assert.equal(metrics.citationCount, 1);
  assert.equal(metrics.hasQuestion, true);
  assert.equal(metrics.bodyCharacters, 51);
  assert.ok(!JSON.stringify(metrics).includes("concrete implication"));
});
