import assert from "node:assert/strict";
import test from "node:test";
import { createRelatedPageExcerptReader, extractRelatedPageText } from "../browser/core/related-page-excerpts.js";

const article = `<html><head><script>sendSecrets()</script></head><body><nav>Navigation</nav><main><h1>Article</h1><p>${"Public article text about a product and its features. ".repeat(8)}</p></main><img src="https://tracking.example.org/pixel"></body></html>`;
function response(url, body = article, options = {}) {
  const bytes = new TextEncoder().encode(body);
  const { headers = {}, ...rest } = options;
  return { ok: true, redirected: false, url, ...rest, headers: new Headers({ "content-type": "text/html", ...headers }),
    body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
}

test("anonymous bounded related fetch reads selected public pages only", async () => {
  const requests = [];
  const reader = createRelatedPageExcerptReader({ hasHostAccess: async () => true,
    fetchImpl: async (url, options) => { requests.push({ url, options }); return response(url); } });
  const context = { sameTopicSources: [{ id: "peer", url: "https://news.example.org/article" }],
    relatedSources: [{ id: "private", url: "https://mail.example.org/inbox" },
      { id: "excluded", url: "https://news.example.org/excluded" },
      { id: "other", url: "https://news.example.org/other" }] };
  const result = await reader.read(context, ["excluded"]);
  assert.deepEqual(result.map((item) => item.sourceId), ["peer", "other"]);
  assert.equal(requests.length, 2);
  for (const { options } of requests) {
    assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
  }
  assert.ok(!result[0].text.includes("sendSecrets"));
  assert.ok(!result[0].text.includes("Navigation"));
  assert.ok(result[0].text.length <= 2048);
  assert.deepEqual(await createRelatedPageExcerptReader({ hasHostAccess: async () => false,
    fetchImpl: () => assert.fail("No host permission") }).read(context), []);
});

test("redirects, wrong URLs and oversized responses never become excerpts", async () => {
  const url = "https://news.example.org/article";
  for (const candidate of [response(url, article, { redirected: true }),
    response("https://other.example.org/article"),
    response(url, article, { headers: { "content-length": "999999" } }),
    response(url, "<main>short</main>"), response(url, article, { headers: { "content-type": "application/json" } })]) {
    const reader = createRelatedPageExcerptReader({ hasHostAccess: async () => true, fetchImpl: async () => candidate });
    assert.deepEqual(await reader.read({ sameTopicSources: [{ id: "peer", url }], relatedSources: [] }), []);
  }
});

test("case varied HTML content type is accepted within byte bounds", async () => {
  const url = "https://news.example.org/article";
  const reader = createRelatedPageExcerptReader({ hasHostAccess: async () => true,
    fetchImpl: async () => response(url, article, { headers: { "content-type": "TEXT/HTML; charset=utf-8" } }) });
  assert.equal((await reader.read({ sameTopicSources: [{ id: "peer", url }], relatedSources: [] })).length, 1);
});

test("excerpt diagnostics count only bounded outcomes and contain no page material", async () => {
  const urls = ["https://news.example.org/one", "https://news.example.org/two",
    "https://news.example.org/three", "https://news.example.org/four"];
  const outcomes = [response(urls[0]), response(urls[1], article, { redirected: true }),
    response(urls[2], article, { headers: { "content-length": "999999" } }),
    response(urls[3], "<main>short</main>")];
  let diagnostic;
  const reader = createRelatedPageExcerptReader({ hasHostAccess: async () => true,
    fetchImpl: async (_url, _options) => outcomes.shift() });
  const sources = urls.map((url, index) => ({ id: `peer-${index}`, url }));
  const excerpts = await reader.read({ sameTopicSources: sources, relatedSources: [] }, [], null,
    (value) => { diagnostic = value; });
  assert.equal(excerpts.length, 1);
  assert.deepEqual(diagnostic, { eligible: 4, attempted: 4, accepted: 1,
    failures: { noHostAccess: 0, fetchHttpRedirect: 1, sizeType: 1, parseShort: 1 } });
  assert.ok(!JSON.stringify(diagnostic).includes("news.example.org"));
  assert.ok(!JSON.stringify(diagnostic).includes("Public article"));
});

test("no host access and thrown fetch produce fixed diagnostics without changing optional-read behavior", async () => {
  const url = "https://news.example.org/article";
  const context = { sameTopicSources: [{ id: "peer", url }], relatedSources: [] };
  let noAccess;
  const denied = createRelatedPageExcerptReader({ hasHostAccess: async () => false,
    fetchImpl: () => assert.fail("No fetch without access") });
  assert.deepEqual(await denied.read(context, [], null, (value) => { noAccess = value; }), []);
  assert.deepEqual(noAccess, { eligible: 1, attempted: 0, accepted: 0,
    failures: { noHostAccess: 1, fetchHttpRedirect: 0, sizeType: 0, parseShort: 0 } });
  let failed;
  const fetchFailure = createRelatedPageExcerptReader({ hasHostAccess: async () => true,
    fetchImpl: async () => { throw new Error(`Failed fetching ${url}`); } });
  assert.deepEqual(await fetchFailure.read(context, [], null, (value) => { failed = value; }), []);
  assert.equal(failed.failures.fetchHttpRedirect, 1);
  assert.ok(!JSON.stringify(failed).includes(url));
});

test("text tokenizer decodes prose without DOM execution or subresource loads", () => {
  const text = extractRelatedPageText(`<main>One &amp; two &#8212; three <script>attack()</script><style>body{}</style><p>More text.</p></main>`);
  assert.equal(text, "One & two — three More text.");
});

test("raw script, style and noscript cannot break out through synthetic markup", () => {
  const visible = "Public article text. ".repeat(8);
  for (const tag of ["script", "style", "noscript", "textarea", "title", "iframe", "xmp", "noembed", "noframes"]) {
    const html = `<main><${tag}>const x="</main><main>"; const secret="synthetic-private-${tag}";</${tag}><p>${visible}</p></main>`;
    const text = extractRelatedPageText(html);
    assert.equal(text, visible.trim(), tag);
    assert.ok(!text.includes("synthetic-private"), tag);
    assert.equal(extractRelatedPageText(`<main><${tag}>synthetic-private-${tag}<p>${visible}</p></main>`), "", `${tag}: missing closure fails closed`);
  }
});

test("malformed inert descendants cannot close an outer visible region", () => {
  assert.equal(extractRelatedPageText(`<main><template><p>hidden</p></main><main><p>synthetic-private-template</p></template><p>Public text.</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><template></main><main><p>synthetic-private-template</p></template></main>`), "");
  assert.equal(extractRelatedPageText(`<main><script/>synthetic-private-script<p>Public text.</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><plaintext>synthetic-private-plaintext<p>Public text.</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><script>const x="</script>"; synthetic-private-script</script><p>Public text.</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><script>const x="</ script>"; synthetic-private-script</main>`), "");
  assert.equal(extractRelatedPageText(`<main><style>const x="</ style>"; synthetic-private-style</main>`), "");
  assert.equal(extractRelatedPageText(`<main><script>const x="</ script>"; synthetic-private-script</script><p>Public text.</p></main>`), "Public text.");
  assert.equal(extractRelatedPageText(`<main><div hidden/>synthetic-hidden-text<p>Public text.</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><template/>synthetic-hidden-text<p>Public text.</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><div hidden>secret</div/>synthetic-hidden-text<p>Public text.</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><svg><path d="M1 2"/></svg><p>Public text.</p></main>`), "Public text.");
});

test("explicit paywall and authentication markers reject the whole related page", () => {
  const visible = "Public paragraph ".repeat(12);
  assert.equal(extractRelatedPageText(`<script type="application/ld+json">{"isAccessibleForFree":false}</script><main><p>${visible}</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main data-requires-auth="true"><p>${visible}</p></main>`), "");
  assert.equal(extractRelatedPageText(`<main><p>${visible}</p><div class="article paywall-overlay">Subscriber text</div></main>`), "");
  assert.equal(extractRelatedPageText(`<main><p>${visible}</p><section id="locked-content">Subscriber text</section></main>`), "");
  assert.equal(extractRelatedPageText(`<main><p>${visible}</p><section class=locked-content>Subscriber text</section></main>`), "");
  assert.ok(extractRelatedPageText(`<main><p>${visible}</p><aside class="subscribe-newsletter">Newsletter</aside></main>`).startsWith("Public paragraph"));
});

test("deep or token-heavy adversarial markup fails closed before quadratic traversal", () => {
  assert.equal(extractRelatedPageText(`<main>${"<div>".repeat(129)}${"Public paragraph ".repeat(12)}</main>`), "");
  assert.equal(extractRelatedPageText(`<main>${"<br>".repeat(4100)}${"Public paragraph ".repeat(12)}</main>`), "");
});

test("hidden, inert, aria-hidden and inline-style-hidden subtrees never enter the excerpt", () => {
  const text = extractRelatedPageText(`<main><p>Public opening.</p><section hidden><p>Hidden subscriber copy.</p></section><div inert><p>Inert subscriber copy.</p></div><div aria-hidden="true"><p>ARIA subscriber copy.</p></div><div style="color:red; display: none"><p>Style subscriber copy.</p></div><div style="display:none!important"><p>Important subscriber secret.</p></div><p>Public ending.</p></main>`);
  assert.equal(text, "Public opening. Public ending.");
});

test("a greater-than sign inside a quoted attribute never escapes into visible text", () => {
  assert.equal(extractRelatedPageText(`<main><p data-private="greater > synthetic-secret">Public text.</p></main>`), "Public text.");
  assert.equal(extractRelatedPageText(`<main><p data-private='greater > synthetic-secret'>Public text.</p></main>`), "Public text.");
  assert.equal(extractRelatedPageText(`<main><p data-private="unterminated > synthetic-secret>Public text.</p></main>`), "");
});

test("related fetch is HTTPS-only even when a local fixture URL passes general page policy", async () => {
  const reader = createRelatedPageExcerptReader({ hasHostAccess: async () => true,
    fetchImpl: () => assert.fail("HTTP candidate must not be fetched") });
  assert.deepEqual(await reader.read({ sameTopicSources: [{ id: "fixture", url: "http://127.0.0.1:4173/background-fixture/example" }],
    relatedSources: [] }), []);
});

test("rejected oversized response aborts its request and cancels the unread stream", async () => {
  const url = "https://news.example.org/article";
  let cancelled = false, requestSignal, diagnostic;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const reader = createRelatedPageExcerptReader({ hasHostAccess: async () => true,
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      return { ok: true, redirected: false, url,
        headers: new Headers({ "content-type": "text/html", "content-length": "999999" }), body };
    } });
  assert.deepEqual(await reader.read({ sameTopicSources: [], relatedSources: [{ id: "peer", url }] }, [], null,
    (value) => { diagnostic = value; }), []);
  assert.equal(requestSignal.aborted, true);
  assert.equal(cancelled, true);
  assert.equal(diagnostic.failures.sizeType, 1);
});

test("a stream read error counts as fetch failure without exposing its exception", async () => {
  const url = "https://news.example.org/article";
  let diagnostic;
  const body = new ReadableStream({ pull(controller) { controller.error(new Error(`Private ${url}`)); } });
  const reader = createRelatedPageExcerptReader({ hasHostAccess: async () => true,
    fetchImpl: async () => ({ ok: true, redirected: false, url,
      headers: new Headers({ "content-type": "text/html" }), body }) });
  assert.deepEqual(await reader.read({ sameTopicSources: [{ id: "peer", url }], relatedSources: [] }, [], null,
    (value) => { diagnostic = value; }), []);
  assert.equal(diagnostic.failures.fetchHttpRedirect, 1);
  assert.equal(diagnostic.failures.sizeType, 0);
  assert.ok(!JSON.stringify(diagnostic).includes(url));
});
