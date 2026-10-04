import test from "node:test";
import assert from "node:assert/strict";
import { extractPublicArticle, oneResponseFetch, qualityMetrics, PUBLIC_PAGE } from "../harness/run-live-insight-qa.js";
import { inspectPageUrl } from "../../../spikes/topic-resolution/browser/core/page-content-policy.js";

test("curated current and related URLs pass the app's public URL policy", () => {
  for (const source of [PUBLIC_PAGE, ...PUBLIC_PAGE.related]) {
    assert.deepEqual(inspectPageUrl(source.url).supported, true, source.url);
  }
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
