import test from "node:test";
import assert from "node:assert/strict";
import { chooseListedModel, classifyCitationUrl, classifyResponseAnnotations, extractPublicArticle, inspectArgs,
  oneResponseFetch, qualityMetrics, PCGAMES_PAGE, PUBLIC_PAGE, RELATED_TEXT_PAGE,
  publicCitationSummary, readPublicPage, readRequiredRelatedExcerpts } from "../harness/run-live-insight-qa.js";
import { inspectPageUrl } from "../../../spikes/topic-resolution/browser/core/page-content-policy.js";

test("curated current and related URLs pass the app's public URL policy", () => {
  for (const source of [PUBLIC_PAGE, ...PUBLIC_PAGE.related, RELATED_TEXT_PAGE, ...RELATED_TEXT_PAGE.related,
    PCGAMES_PAGE, ...PCGAMES_PAGE.related]) {
    assert.deepEqual(inspectPageUrl(source.url).supported, true, source.url);
  }
});

test("PCGames probe requires web search and suppresses provider result printing", () => {
  const args = ["--run-live", "--model", "auto", "--with-web-search", "--pcgames"];
  assert.equal(inspectArgs(args).pcgames, true);
  assert.equal(inspectArgs(["--run-live", "--with-web-search", "--pcgames"]).model, "auto");
  assert.throws(() => inspectArgs(["--run-live", "--model", "auto", "--pcgames"]), /Unsupported QA option/u);
  assert.throws(() => inspectArgs([...args, "--show-result"]), /Unsupported QA option/u);
  assert.throws(() => inspectArgs([...args, "--pcgames-show-public-url"]), /Unsupported QA option/u);
  assert.equal(PCGAMES_PAGE.related.length, 1);
});

test("PCGames annotation classifier reports only fixed URL categories", () => {
  const selected = PCGAMES_PAGE.related[0].url;
  const current = PCGAMES_PAGE.url;
  const urls = [selected, current,
    "https://www.gamestar.de/artikel/alternate-cover,3460312.html",
    "https://www.pcgames.de/GTA-6-Spiel-55239/News/another-slug-1555194/",
    "https://www.gamestar.de/artikel/other,3460313.html",
    "https://www.pcgames.de/News/other-story-1555195/",
    "https://example.org/news/other", "http://www.gamestar.de/artikel/other,3460312.html"];
  assert.deepEqual(urls.map((url) => classifyCitationUrl(url)), ["exactSelected", "currentPage",
    "sameHostSameArticleId", "sameHostSameArticleId", "sameSelectedHostOther",
    "sameCurrentHostOther", "foreignHost", "invalid"]);
  const annotations = urls.map((url) => ({ type: "url_citation", url, title: "Private provider title",
    start_index: 0, end_index: 3 }));
  const item = { type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "Private provider text", annotations }] };
  const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const raw = event("response.output_item.done", { output_index: 0, item }) +
    event("response.completed", { response: { status: "completed", output: [item] } });
  const summary = classifyResponseAnnotations(raw);
  assert.deepEqual(summary, { observed: true, terminalCompleted: true, total: 8,
    webRefMarkers: 0, ownerRefMarkers: 0, selectedSourceHits: 0, exactSelected: 1, currentPage: 1,
    sameHostSameArticleId: 2, sameSelectedHostOther: 1, sameCurrentHostOther: 1, foreignHost: 1, invalid: 1 });
  assert.ok(!JSON.stringify(summary).includes("Private provider"));
  assert.ok(!JSON.stringify(summary).includes("https://"));
  assert.deepEqual(classifyResponseAnnotations(event("response.output_item.done", { output_index: 0, item })),
    { ...summary, terminalCompleted: false });
  assert.equal(classifyResponseAnnotations(event("response.completed", { response: {
    status: "incomplete", output: [item] } })).terminalCompleted, false);
  const evidence = event("response.completed", { response: { status: "completed", output: [
    { type: "web_search_call", status: "completed", action: { sources: [
      { url: PCGAMES_PAGE.related[0].url }, { url: "https://www.gamestar.de/artikel/other,3460313.html" },
    ] } },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Detail[[webref:1]].",
      annotations: [] }] },
  ] } });
  assert.deepEqual(classifyResponseAnnotations(evidence), {
    observed: true, terminalCompleted: true, total: 0, webRefMarkers: 1, ownerRefMarkers: 0, selectedSourceHits: 1,
    exactSelected: 0, currentPage: 0, sameHostSameArticleId: 0, sameCurrentHostOther: 0,
    sameSelectedHostOther: 0, foreignHost: 0, invalid: 0,
  });
  const ownerStyle = evidence.replace("Detail[[webref:1]].", "Detail[ref1].");
  assert.deepEqual(classifyResponseAnnotations(ownerStyle), {
    ...classifyResponseAnnotations(evidence), webRefMarkers: 0, ownerRefMarkers: 1,
  });
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

test("one-shot QA prefers a listed GPT-6 Luna and preserves explicit model choices", () => {
  const listed = [{ slug: "first" }, { slug: "gpt-6-luna" }, { slug: "last" }];
  assert.equal(chooseListedModel(listed, "auto"), "gpt-6-luna");
  assert.equal(chooseListedModel(listed, "first"), "first");
  assert.equal(chooseListedModel([{ slug: "luna-like" }, { slug: "last" }], "auto"), "last");
  assert.equal(chooseListedModel([{ slug: "gpt-6-luna-ish" }, { slug: "last" }], "auto"), "last");
  assert.equal(chooseListedModel([{ slug: "gpt-6-luna-2026-10-06" }, { slug: "last" }], "auto"), "gpt-6-luna-2026-10-06");
  assert.equal(chooseListedModel([{ slug: "gpt-5.6-luna" }, { slug: "last" }], "auto"), "gpt-5.6-luna");
  assert.equal(chooseListedModel([{ slug: "gpt-5.6-luna" }, { slug: "gpt-6-luna" }], "auto"), "gpt-6-luna");
  assert.throws(() => chooseListedModel(listed, "missing"), /not listed/u);
  assert.throws(() => chooseListedModel([], "auto"), /not listed/u);
});

test("quality metrics contain counts without body text", () => {
  const metrics = qualityMetrics({ body: "HTTP has a concrete implication. What might change?", citations: [{ url: "https://developer.mozilla.org" }] }, "article");
  assert.equal(metrics.citationCount, 1);
  assert.equal(metrics.hasQuestion, true);
  assert.equal(metrics.bodyCharacters, 51);
  assert.ok(!JSON.stringify(metrics).includes("concrete implication"));
});
