import assert from "node:assert/strict";
import test from "node:test";
import {
  CRAWLER_EXTRACTOR_VERSION,
  captureStaticHtml,
  parseXRobotsTag,
} from "../src/crawler/static-capture.js";

const PAGE = "https://news.alpha.org/world/story";
const prose = (label, repetitions = 24) => Array.from({ length: repetitions }, (_, index) => `${label} sentence ${index}.`).join(" ");

test("static capture prefers substantial article text and ignores executable, hidden, framed and form content", () => {
  const visible = prose("Visible article", 30);
  const html = `<!doctype html>
    <html><head><title>Research &amp; &#x41; &#65;</title>
      <style>secret style words</style><script>secret script words</script>
    </head><body>
      <header>${prose("Header chrome")}</header>
      <nav><a href="https://news.alpha.org/navigation">navigation</a></nav>
      <main><article>${visible}
        <a href="/world/visible?edition=one">Visible reference</a>
      </article></main>
      <section hidden>${prose("Hidden attribute")}<a href="https://evil.invalid/hidden">hidden</a></section>
      <section aria-hidden="TRUE">${prose("Aria hidden")}<a href="https://evil.invalid/aria">hidden</a></section>
      <section style="display: none !important;">${prose("CSS hidden")}<a href="https://evil.invalid/css">hidden</a></section>
      <noscript>${prose("Noscript")}<a href="https://evil.invalid/noscript">hidden</a></noscript>
      <template>${prose("Template")}<a href="https://evil.invalid/template">hidden</a></template>
      <svg><text>${prose("SVG")}</text><a href="https://evil.invalid/svg">hidden</a></svg>
      <canvas>${prose("Canvas")}</canvas>
      <object>${prose("Object")}<a href="https://evil.invalid/object">hidden</a></object>
      <embed>${prose("Embed")}</embed>
      <script><a href="https://evil.invalid/script">script pseudo-link</a></script>
      <iframe><a href="https://evil.invalid/frame">frame pseudo-link</a></iframe>
      <form><a href="https://evil.invalid/form">form action link</a>${prose("Form")}</form>
      <footer>${prose("Footer chrome")}</footer>
    </body></html>`;
  const captured = captureStaticHtml(html, PAGE);
  assert.equal(captured.title, "Research & A A");
  assert.ok(captured.text.startsWith("Visible article sentence 0."));
  assert.ok(captured.text.includes("Visible reference"));
  for (const excluded of ["Header chrome", "navigation", "Hidden attribute", "Noscript", "Template", "SVG", "Canvas", "Object", "Form", "Footer chrome", "secret script"]) {
    assert.equal(captured.text.includes(excluded), false, excluded);
  }
  assert.deepEqual(captured.links, [{ href: "/world/visible?edition=one", text: "Visible reference" }]);
  assert.equal(captured.eligible, true);
  assert.match(captured.contentHash, /^[a-f0-9]{64}$/u);
  assert.equal(captured.extractorVersion, CRAWLER_EXTRACTOR_VERSION);
});

test("short preferred regions fall back to bounded body prose and entity decoding is deterministic", () => {
  const fallback = `${prose("Fallback body", 30)} Fullwidth: ＡＢＣ. Entities: &lt;safe&gt; &quot;yes&quot; &apos;ok&apos; &nbsp; &#0; &#x110000; &unknown;.`;
  const captured = captureStaticHtml(`<title>  Compact\n title </title><main>too short</main><div>${fallback}</div>`, PAGE);
  assert.ok(captured.text.includes("too short"));
  assert.ok(captured.text.includes("Fallback body sentence 0."));
  assert.ok(captured.text.includes("Fullwidth: ABC."));
  assert.ok(captured.text.includes(`<safe> "yes" 'ok'`));
  assert.equal(captured.text.includes("&unknown;"), false);
  assert.equal(captured.title, "Compact title");
  assert.equal(captured.eligible, true);
});

test("capture caps title, text and discovered links without retaining overflow", () => {
  const title = "T".repeat(250);
  const text = "word ".repeat(4_000);
  const anchors = Array.from({ length: 4_005 }, (_, index) => `<a href="/link/${index}">link ${index}</a>`).join("");
  const captured = captureStaticHtml(`<title>${title}</title><article>${text}${anchors}</article>`, PAGE);
  assert.equal(captured.title.length, 200);
  assert.equal(captured.text.length, 4_096);
  assert.equal(captured.links.length, 4_000);
  assert.deepEqual(captured.links[0], { href: "/link/0", text: "link 0" });
  assert.deepEqual(captured.links.at(-1), { href: "/link/3999", text: "link 3999" });
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.links), true);
});

test("robots, TDM and canonical metadata are reported but remain inert during static extraction", () => {
  const body = prose("Indexable representation", 30);
  const captured = captureStaticHtml(`<html><head>
      <meta name="robots" content="noindex, nofollow">
      <meta http-equiv="X-Robots-Tag" content="noai">
      <meta name="tdm-reservation" content="0">
      <link rel="canonical alternate" href="https://other.gamma.org/replacement">
      <link rel="sitemap" href="/sitemap.xml">
    </head><body><article>${body}<a href="/still-collected">linked page</a></article></body></html>`, PAGE);
  assert.deepEqual(captured.directives, {
    noindex: true,
    nofollow: true,
    tdmReservation: 0,
    tdmReservationInvalid: false,
  });
  assert.equal(captured.canonical, "https://other.gamma.org/replacement");
  assert.equal(captured.title, "news.alpha.org");
  assert.equal(captured.eligible, true);
  assert.ok(captured.text.startsWith("Indexable representation sentence 0."));
  assert.deepEqual(captured.links, [
    { href: "https://other.gamma.org/replacement", text: "alternate" },
    { href: "/sitemap.xml", text: "alternate" },
    { href: "/still-collected", text: "linked page" },
  ]);
  assert.deepEqual(parseXRobotsTag("murmingleTopicCrawler: index, NOINDEX; nofollow"), {
    noindex: true,
    nofollow: true,
    product: "murmingletopiccrawler",
  });
  assert.deepEqual(parseXRobotsTag("all", "custom-agent"), { noindex: false, nofollow: false, product: "custom-agent" });
});

test("quoted greater-than signs cannot terminate metadata before crawler directives", () => {
  const captured = captureStaticHtml(`<html><head>
      <meta data-description="harmless > quoted text" name="robots" content="notrain">
      <meta data-description='another > quoted value' name='tdm-reservation' content='1'>
    </head><body><article>${prose("Directive-safe representation", 30)}</article></body></html>`, PAGE);
  assert.deepEqual(captured.directives, {
    noindex: true,
    nofollow: false,
    tdmReservation: 1,
    tdmReservationInvalid: false,
  });
});

test("malformed and contradictory TDM metadata are marked ambiguous", () => {
  for (const metadata of [
    '<meta name="tdm-reservation" content="unknown">',
    '<meta name="tdm-reservation" content="0"><meta name="tdm-reservation" content="1">',
  ]) {
    const captured = captureStaticHtml(`<html><head>${metadata}</head><body><article>${prose("Ambiguous reservation", 30)}</article></body></html>`, PAGE);
    assert.equal(captured.directives.tdmReservationInvalid, true);
  }
});

test("crawler-specific robots metadata is honored case-insensitively", () => {
  const captured = captureStaticHtml(`<html><head>
      <meta name="MurmingleTopicCrawler" content="noindex">
    </head><body><article>${prose("Product directive", 30)}</article></body></html>`, PAGE);
  assert.equal(captured.directives.noindex, true);
});

test("oversized attribute surfaces fail closed before a late policy directive", () => {
  const tooMany = Array.from({ length: 129 }, (_, index) => `data-${index}="safe"`).join(" ");
  const tooLong = `content="${"x".repeat(16_385)}"`;
  for (const attributes of [tooMany, tooLong]) {
    assert.throws(() => captureStaticHtml(`<html><head>
        <meta ${attributes} name="robots" content="noindex">
      </head><body><article>${prose("Hidden late directive", 30)}</article></body></html>`, PAGE),
    /Invalid crawler document/u);
  }
});

test("large unused metadata is skipped in place without hiding later policy attributes", () => {
  const padding = "metadata &amp; > ".repeat(3_000);
  for (const directive of ["noindex", "noai", "notrain", "none"]) {
    const captured = captureStaticHtml(`<meta DATA-mw="${padding}" name="robots" content="${directive}">
      <meta data-resources='${padding}' http-equiv='tdm-reservation' content='1'>
      <article>${prose("Visible late policy", 30)}</article>`, PAGE);
    assert.equal(captured.directives.noindex, true);
    assert.equal(captured.directives.tdmReservation, 1);
    assert.equal(captured.eligible, true);
    assert.equal(captured.text.includes("metadata"), false);
  }
  const unquoted = captureStaticHtml(`<meta data-long=${"x".repeat(20_000)} name=robots content=nofollow>
    <article>${prose("Unquoted metadata", 30)}</article>`, PAGE);
  assert.equal(unquoted.directives.nofollow, true);
});

test("fake tags and policy inside quoted metadata stay inert while real links remain visible", () => {
  const fake = `${"x".repeat(20_000)}<meta name='robots' content='none'><meta name='tdm-reservation' content='1'>
    <link rel='canonical' href='https://evil.invalid/fake'><a href='https://evil.invalid/fake'>fake words</a>`;
  const captured = captureStaticHtml(`<article data-state="${fake}" data-another='${"&quot;&gt;".repeat(3_000)}'>
    ${prose("Visible real article", 30)}<a data-context="${fake}" href="/real">Real reference</a></article>`, PAGE);
  assert.deepEqual(captured.directives, { noindex: false, nofollow: false, tdmReservation: null, tdmReservationInvalid: false });
  assert.equal(captured.canonical, null);
  assert.deepEqual(captured.links, [{ href: "/real", text: "Real reference" }]);
  assert.equal(captured.text.includes("fake words"), false);
  assert.equal(captured.text.includes("xxxx"), false);
});

test("late hidden, aria and style attributes after large metadata still suppress content and links", () => {
  const padding = "ignored > metadata ".repeat(2_000);
  const hidden = ["hidden", 'aria-hidden="true"', 'style="visibility: hidden !important;"', 'style="display:none"'];
  const captured = captureStaticHtml(`<article>${prose("Visible outside", 30)}
    ${hidden.map(attr => `<section data-long="${padding}" ${attr}>${prose("Must stay hidden")}<a href="/hidden">secret link</a></section>`).join("")}
    </article>`, PAGE);
  assert.equal(captured.text.includes("Must stay hidden"), false);
  assert.equal(captured.text.includes("secret link"), false);
  assert.deepEqual(captured.links, []);
});

test("metadata still counts towards the attribute cap and interpreted surfaces remain aggregate bounded", () => {
  const padding = `data-long="${"x".repeat(20_000)}"`;
  const attrs = Array.from({ length: 127 }, (_, i) => `data-${i}=safe`).join(" ");
  assert.equal(captureStaticHtml(`<article ${padding} ${attrs}>${prose("Exactly counted", 30)}</article>`, PAGE).eligible, true);
  assert.throws(() => captureStaticHtml(`<article ${padding} ${attrs} hidden>${prose("Over count", 30)}</article>`, PAGE), /Invalid crawler document/u);
  assert.throws(() => captureStaticHtml(`<meta ${padding} name="robots" content="${"x".repeat(16_385)}">`, PAGE), /Invalid crawler document/u);
  assert.throws(() => captureStaticHtml(`<article ${padding} class="${"x".repeat(9_000)}" style="${"x".repeat(9_000)}">${prose("Over budget", 30)}</article>`, PAGE), /Invalid crawler document/u);
  assert.throws(() => captureStaticHtml(`<article data-long="${"x".repeat(20_000)}><meta name='robots' content='none'>`, PAGE), /Invalid crawler document/u);
});

test("XML feed loc elements become bounded discovery links", () => {
  const captured = captureStaticHtml(`<?xml version="1.0"?><urlset>
    <url><loc>https://news.alpha.org/world/one</loc></url>
    <url><loc> https://news.alpha.org/science/two?edition=full&amp;page=2 </loc></url>
  </urlset>`, "https://news.alpha.org/sitemap.xml");
  assert.deepEqual(captured.links, [
    { href: "https://news.alpha.org/world/one", text: "sitemap" },
    { href: "https://news.alpha.org/science/two?edition=full&page=2", text: "sitemap" },
  ]);
  assert.equal(captured.eligible, false);
  assert.match(captured.contentHash, /^[a-f0-9]{64}$/u);
});

test("malformed documents fail closed at byte, token and nesting limits", () => {
  assert.throws(() => captureStaticHtml("x".repeat(2 * 1024 * 1024 + 1), PAGE), /Invalid crawler document/u);
  assert.throws(() => captureStaticHtml("<br>".repeat(100_001), PAGE), /Invalid crawler document/u);
  assert.throws(() => captureStaticHtml(`${"<div>".repeat(257)}text${"</div>".repeat(257)}`, PAGE), /Invalid crawler document/u);
  assert.throws(() => captureStaticHtml("", PAGE), /Invalid crawler document/u);
  assert.throws(() => captureStaticHtml("valid", 123), /Invalid crawler document/u);

  const recovered = captureStaticHtml(`<div><article>${prose("Recoverable malformed", 30)}</div></article>`, PAGE);
  assert.equal(recovered.eligible, true);
  assert.ok(recovered.text.startsWith("Recoverable malformed sentence 0."));
});
