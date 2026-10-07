import assert from "node:assert/strict";
import test from "node:test";
import { appendInsightCitationNodes, formatInsightCitations } from "../browser/core/insight-citations.js";

function element(tag) {
  return { tag, children: [], textContent: "", attributes: {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    set href(value) { this.linkHref = value; },
    set innerHTML(_) { assert.fail("HTML parser must not be used"); } };
}
const document = { createElement: element };

test("provider annotations become inline source markers at their exact spans", () => {
  const body = "A helpful finding citeturn0search0 and another view.";
  const startIndex = body.indexOf("cite");
  const draft = formatInsightCitations(body, [{ startIndex, endIndex: startIndex + "citeturn0search0".length,
    url: "https://example.org/article", title: "Source" }]);
  assert.equal(draft, "A helpful finding [↗](https://example.org/article) and another view.");
  const container = element("p");
  appendInsightCitationNodes(document, container, draft, "Quellenlink öffnen");
  assert.deepEqual(container.children.map((item) => item.tag), ["span", "sup", "span"]);
  assert.equal(container.children[0].textContent, "A helpful finding ");
  const link = container.children[1].children[0];
  assert.equal(link.textContent, "1");
  assert.equal(link.linkHref, "https://example.org/article");
  assert.equal(link.target, "_blank");
  assert.equal(link.rel, "noopener noreferrer");
  assert.equal(link.referrerPolicy, "no-referrer");
  assert.equal(link.attributes["aria-label"], "Quellenlink öffnen 1");
  assert.equal(link.title, "Quellenlink öffnen 1");
  assert.equal(container.children[2].textContent, " and another view.");
});

test("uncited prose stays plain; cited prose retains its words and receives an icon", () => {
  assert.equal(formatInsightCitations("Plain answer", []), "Plain answer");
  const container = element("p");
  appendInsightCitationNodes(document, container, "Plain answer");
  assert.equal(container.textContent, "Plain answer");
  const body = "Different perspective on a claim.";
  assert.equal(formatInsightCitations(body, [{ startIndex: 0, endIndex: 21,
    url: "https://example.org/article" }]),
  "Different perspective [↗](https://example.org/article) on a claim.");
});

test("citation token offsets after emoji work with both Unicode counting conventions", () => {
  const marker = "citeid";
  const body = `🌍 Context ${marker} remains useful.`;
  const utf16 = body.indexOf(marker);
  const codepoint = Array.from(body.slice(0, utf16)).length;
  for (const startIndex of [utf16, codepoint]) {
    const draft = formatInsightCitations(body, [{ startIndex, endIndex: startIndex + marker.length,
      url: "https://example.org/article" }]);
    assert.equal(draft, "🌍 Context [↗](https://example.org/article) remains useful.");
  }
});

test("annotated related references become canonical markers; forged references stay plain", () => {
  const marker = "[[ref:1]]";
  const body = `🌍 Finding ${marker} and forged [[ref:2]].`;
  const utf16 = body.indexOf(marker);
  const codepoint = Array.from(body.slice(0, utf16)).length;
  for (const startIndex of [utf16, codepoint]) {
    const draft = formatInsightCitations(body, [{ startIndex, endIndex: startIndex + marker.length,
      url: "https://example.org/related", title: "Related source" }]);
    assert.equal(draft, "🌍 Finding [↗](https://example.org/related) and forged [[ref:2]].");
    const container = element("p");
    appendInsightCitationNodes(document, container, draft);
    assert.equal(container.children.filter((item) => item.tag === "sup").length, 1);
    assert.equal(container.children.at(-1).textContent, " and forged [[ref:2]].");
  }
  assert.equal(formatInsightCitations("Unsupported [[ref:9]]", []), "Unsupported [[ref:9]]");
  assert.throws(() => formatInsightCitations("[[ref:0]]", [{
    startIndex: 0, endIndex: 9, url: "https://example.org/related" }]));
  assert.throws(() => formatInsightCitations("[[ref:1]]", [{
    startIndex: 0, endIndex: 8, url: "https://example.org/related" }]));
  assert.throws(() => formatInsightCitations("[[ref:9]]", [{
    startIndex: 0, endIndex: 9, url: "https://example.org/related" }]));
});

test("numbers follow first URL occurrence and repeat links remain keyboard accessible", () => {
  const container = element("p");
  appendInsightCitationNodes(document, container,
    "A[↗](https://example.org/a) B[↗](https://example.org/b) C[↗](https://example.org/a)");
  const links = container.children.filter((item) => item.tag === "sup").map((item) => item.children[0]);
  assert.deepEqual(links.map((link) => link.textContent), ["1", "2", "1"]);
  assert.deepEqual(links.map((link) => link.attributes["aria-label"]),
    ["Open source link 1", "Open source link 2", "Open source link 1"]);
  assert.ok(links.every((link) => link.tag === "a" && link.target === "_blank" &&
    link.rel === "noopener noreferrer" && link.referrerPolicy === "no-referrer"));
});

test("model-written citation syntax and raw URLs never become attested source icons", () => {
  const body = "Question: [↗](https://attacker.org/page) and https://example.org/more, please compare.";
  const draft = formatInsightCitations(body, []);
  assert.equal(draft, "Question: [↗]([link omitted]) and [link omitted], please compare.");
  const container = element("p");
  appendInsightCitationNodes(document, container, draft);
  assert.equal(container.children.some((item) => item.tag === "sup"), false);
  assert.equal(container.textContent, draft);
});

test("mixed forged links and real provider annotations render only the annotated source", () => {
  const marker = "citeturn0search0";
  const body = `A fake [↗](https://attacker.org/page) precedes evidence ${marker} and https://example.org/unverified.`;
  const startIndex = body.indexOf(marker);
  const draft = formatInsightCitations(body, [{ startIndex, endIndex: startIndex + marker.length,
    url: "https://example.org/article", title: "Real source" }]);
  assert.equal(draft, "A fake [↗]([link omitted]) precedes evidence [↗](https://example.org/article) and [link omitted].");
  const container = element("p");
  appendInsightCitationNodes(document, container, draft);
  const links = container.children.filter((item) => item.tag === "sup").map((item) => item.children[0]);
  assert.equal(links.length, 1);
  assert.equal(links[0].linkHref, "https://example.org/article");
  assert.equal(links[0].attributes["aria-label"], "Open source link 1");
});

test("malformed, unsafe, overlapping and over-budget annotations cannot silently lose provenance", () => {
  const body = "A citeid B";
  const first = { startIndex: 2, endIndex: 13, url: "https://example.org/a" };
  assert.throws(() => formatInsightCitations(body, [{ ...first, url: "javascript:alert(1)" }]));
  assert.throws(() => formatInsightCitations(body, [{ ...first, endIndex: 999 }]));
  assert.throws(() => formatInsightCitations(body, [first, { ...first, startIndex: 3 }]));
  assert.throws(() => formatInsightCitations(body, [first], 10));
  assert.throws(() => formatInsightCitations(body, []));
  const container = element("p");
  appendInsightCitationNodes(document, container,
    "Read [↗](javascript:alert(1)) and <img src=x> [↗](https://example.org/article)");
  assert.equal(container.children.filter((item) => item.tag === "sup").length, 1);
  assert.equal(container.children[0].textContent.includes("javascript:alert(1)"), true);
  assert.equal(container.children[0].textContent.includes("<img src=x>"), true);
});
