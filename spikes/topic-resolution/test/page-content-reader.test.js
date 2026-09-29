import assert from "node:assert/strict";
import test from "node:test";
import { collectPageContent, attestContentDocument, createPageContentReader } from "../browser/chromium/page-content-reader.js";

const URL = "http://127.0.0.1:4173/background-fixture/article-a.html?product=2";
function text(value) { return { nodeType: 3, get length() { return value.length; }, substringData(start, length) { return value.slice(start, start + length); },
  get data() { throw new Error("Unbounded text read prohibited"); } }; }
function element(tag, attributes = {}, children = [], style = {}) {
  const node = { nodeType: 1, tagName: tag, hidden: false, inert: false, isContentEditable: false,
    attributes, style: { display: "block", visibility: "visible", opacity: "1", ...style }, getAttribute(name) { return attributes[name] ?? null; } };
  const elems = children.filter((child) => child.nodeType === 1);
  node.firstChild = children[0] ?? null; node.firstElementChild = elems[0] ?? null;
  children.forEach((child, index) => { child.nextSibling = children[index + 1] ?? null; });
  elems.forEach((child, index) => { child.nextElementSibling = elems[index + 1] ?? null; });
  return node;
}
function dom(main, { head = [], url = URL, clock, title = "Synthetic public sensor article" } = {}) {
  const titleNode = title === null ? null : element("TITLE", {}, [text(title)]);
  const headNode = element("HEAD", {}, [...(titleNode ? [titleNode] : []), ...head]);
  const body = element("BODY", {}, Array.isArray(main) ? main : [main]);
  const html = element("HTML", {}, [headNode, body]);
  const previous = new Map();
  for (const [key, value] of Object.entries({ document: { head: headNode, documentElement: html }, location: { href: url },
    top: globalThis, getComputedStyle: (node) => node.style, ...(clock ? { performance: { now: clock } } : {}) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  return { restore() { for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } } };
}
function collect(main, options) {
  const setup = dom(main, options); try { return collectPageContent(URL); } finally { setup.restore(); }
}
function proseParagraph(character = "a", length = 200) { return element("P", {}, [text(character.repeat(length))]); }
function genericArticle(children = [proseParagraph("a"), proseParagraph("b")], attributes = { class: "article-content" }, tag = "DIV") {
  return element(tag, attributes, children);
}

test("generic fallback combines two bounded marker tokens with substantial visible paragraph evidence", () => {
  for (const tag of ["DIV", "SECTION"]) {
    for (const attributes of [{ class: "article-content" }, { id: "STORY_BODY" }, { class: "entry-text" }, { id: "post", class: "content" }]) {
      const result = collect(genericArticle(undefined, attributes, tag), { clock: () => 0 });
      assert.equal(result.status, "collected"); assert.equal(result.text, "a".repeat(200) + " " + "b".repeat(200));
      assert.equal(result.extractorVersion, "article-container-prefix/v1");
    }
  }
});

test("class-name-only, body/html, wrong-token and insufficient-paragraph candidates abstain", () => {
  for (const node of [genericArticle(undefined, { class: "article" }), genericArticle(undefined, { class: "content" }),
    genericArticle(undefined, { class: "articlebody" }), genericArticle(undefined, { class: "articles-content" }),
    genericArticle(undefined, { class: "article-content" }, "BODY"), genericArticle(undefined, { class: "article-content" }, "HTML"),
    genericArticle([proseParagraph("a", 500)]), genericArticle([proseParagraph("a", 200), proseParagraph("b", 79)]),
    genericArticle([proseParagraph("a", 100), proseParagraph("b", 100)])]) {
    assert.equal(collect(node, { clock: () => 0 }).reason, "missing-region");
  }
});

test("malformed nested paragraphs cannot multiply one paragraph into two substantial paragraphs", () => {
  const nested = element("P", {}, [element("P", {}, [proseParagraph("a", 400)])]);
  assert.equal(collect(genericArticle([nested]), { clock: () => 0 }).reason, "missing-region");
});

test("the first existing semantic region wins over earlier plausible generic fallback containers", () => {
  for (const region of [element("MAIN", {}, [text("Legacy sample")]), element("ARTICLE", {}, [text("Legacy sample")]),
    element("DIV", { role: "main" }, [text("Legacy sample")])]) {
    const result = collect([genericArticle(), region], { clock: () => 0 });
    assert.equal(result.text, "Legacy sample"); assert.equal(result.extractorVersion, "main-text-prefix/v1");
  }
  assert.equal(collect([element("MAIN", {}, []), genericArticle()], { clock: () => 0 }).reason, "missing-region");
});

test("legacy semantic samples retain fallback-only presentation subtrees", () => {
  const result = collect(element("MAIN", {}, [element("DIV", { class: "related teaser" }, [text("Legacy included prose")])]), { clock: () => 0 });
  assert.equal(result.text, "Legacy included prose"); assert.equal(result.extractorVersion, "main-text-prefix/v1");
  const withinPresentation = collect(element("DIV", { class: "recommended" }, [element("MAIN", {}, [text("Legacy inside wrapper")])]), { clock: () => 0 });
  assert.equal(withinPresentation.text, "Legacy inside wrapper");
});

test("fallback rejects disjoint plausible article containers and significant separate outer prose", () => {
  assert.equal(collect([genericArticle(), genericArticle(undefined, { class: "story-text" })], { clock: () => 0 }).reason, "missing-region");
  const child = genericArticle();
  assert.equal(collect(genericArticle([child, proseParagraph("c", 45)]), { clock: () => 0 }).reason, "missing-region");
  assert.equal(collect(genericArticle([genericArticle(), genericArticle()]), { clock: () => 0 }).reason, "missing-region");
});

test("nested generic wrappers collapse only to an innermost root retaining at least 90 percent of paragraph evidence", () => {
  const same = collect(genericArticle([genericArticle()]), { clock: () => 0 });
  assert.equal(same.text, "a".repeat(200) + " " + "b".repeat(200));
  const almostSame = collect(genericArticle([text("Outer nonparagraph label"), genericArticle(), proseParagraph("c", 44)]), { clock: () => 0 });
  assert.equal(almostSame.text, "a".repeat(200) + " " + "b".repeat(200));
});

test("paragraph and link density gates reject broad chrome/link-heavy wrappers with exact boundary acceptance", () => {
  const linked = (linkLength) => genericArticle([
    element("P", {}, [element("A", {}, [text("l".repeat(linkLength))]), text("a".repeat(200 - linkLength))]), proseParagraph("b"),
  ]);
  assert.equal(collect(linked(100), { clock: () => 0 }).status, "collected");
  assert.equal(collect(linked(101), { clock: () => 0 }).reason, "missing-region");
  const broad = (chromeLength) => genericArticle([text("c".repeat(chromeLength)), proseParagraph("a", 150), proseParagraph("b", 150)]);
  assert.equal(collect(broad(200), { clock: () => 0 }).status, "collected");
  assert.equal(collect(broad(201), { clock: () => 0 }).reason, "missing-region");
});

test("fallback-only related/recommended/teaser/card/list/grid/promo contexts never provide evidence or sampled prose", () => {
  for (const token of ["related", "recommended", "teaser", "card", "list", "grid", "promo"]) {
    assert.equal(collect(genericArticle(undefined, { class: `article-content ${token}` }), { clock: () => 0 }).reason, "missing-region");
    assert.equal(collect(element("DIV", { class: token }, [genericArticle()]), { clock: () => 0 }).reason, "missing-region");
    const result = collect(genericArticle([genericArticle(undefined, { class: `entry-text ${token}` }), proseParagraph("a"), proseParagraph("b")]), { clock: () => 0 });
    assert.equal(result.text, "a".repeat(200) + " " + "b".repeat(200));
  }
});

test("existing excluded ancestors and descendants cannot supply fallback evidence", () => {
  for (const attributes of [{ class: "comments" }, { id: "paywall" }, { role: "dialog" }, { "aria-hidden": "true" }]) {
    assert.equal(collect(element("DIV", attributes, [genericArticle()]), { clock: () => 0 }).reason, "missing-region");
    assert.equal(collect(genericArticle([element("DIV", attributes, [proseParagraph("s"), proseParagraph("s")])]), { clock: () => 0 }).reason, "missing-region");
  }
  for (const tag of ["FORM", "NAV", "ASIDE", "HEADER", "FOOTER", "IFRAME", "SCRIPT"]) {
    assert.equal(collect(genericArticle([element(tag, {}, [proseParagraph("s"), proseParagraph("s")])]), { clock: () => 0 }).reason, "missing-region");
  }
  const hidden = genericArticle(); hidden.hidden = true;
  const editable = genericArticle(); editable.isContentEditable = true;
  assert.equal(collect([hidden, editable], { clock: () => 0 }).reason, "missing-region");
  const result = collect(genericArticle([element("FORM", {}, [text("Excluded confidential sample")]), proseParagraph("a"), proseParagraph("b")]), { clock: () => 0 });
  assert.equal(result.text, "a".repeat(200) + " " + "b".repeat(200));
});

test("fallback discovery uses lengths only and waits for complete ambiguity evidence before any raw body read", () => {
  let lengths = 0; let reads = 0;
  const observedText = (character) => {
    const node = text(character.repeat(200));
    Object.defineProperty(node, "length", { get() { lengths++; return 200; } });
    const sample = node.substringData;
    node.substringData = (start, limit) => { assert.equal(lengths, 3); reads++; return sample(start, limit); };
    return node;
  };
  const first = observedText("a"); const second = observedText("b"); const outside = observedText("c");
  const result = collect([genericArticle([element("P", {}, [first]), element("P", {}, [second])]), outside], { clock: () => 0 });
  assert.equal(result.status, "collected"); assert.equal(reads, 2);
  const ambiguous = [genericArticle(), genericArticle()];
  for (const candidate of ambiguous) for (let p = candidate.firstChild; p; p = p.nextSibling) p.firstChild.substringData = () => assert.fail("Ambiguous fallback read raw prose");
  assert.equal(collect(ambiguous, { clock: () => 0 }).reason, "missing-region");
});

test("selected fallback sample rejects whitespace/deceptive paragraphs and chrome-dominated prefixes", () => {
  assert.equal(collect(genericArticle([proseParagraph(" "), proseParagraph(" "), text("Tiny chrome")]), { clock: () => 0 }).reason, "missing-region");
  assert.equal(collect(genericArticle([proseParagraph(" ", 1500), proseParagraph(" ", 1500), text("c".repeat(300))]), { clock: () => 0 }).reason, "missing-region");
  // Overall paragraph evidence passes, but its bounded prefix is page chrome.
  assert.equal(collect(genericArticle([text("c".repeat(4096)), proseParagraph("a", 4000), proseParagraph("b", 4000)]), { clock: () => 0 }).reason, "missing-region");
});

test("fallback reads at most 4096 raw characters and retains exact bounded normalized prefix", () => {
  let reads = 0;
  const node = text("a".repeat(4096)); const sample = node.substringData;
  node.substringData = (start, limit) => { reads += limit; return sample(start, limit); };
  const result = collect(genericArticle([element("P", {}, [node]), proseParagraph("b", 200)]), { clock: () => 0 });
  assert.equal(result.status, "collected"); assert.equal(result.text, "a".repeat(4096)); assert.equal(reads, 4096);
  const spaces = text(" ".repeat(4096)); spaces.substringData = (start, limit) => " ".repeat(limit);
  const later = text("b".repeat(4096)); later.substringData = () => assert.fail("Raw fallback budget already spent");
  assert.equal(collect(genericArticle([element("P", {}, [spaces]), element("P", {}, [later])]), { clock: () => 0 }).reason, "missing-region");
  const limits = [];
  const bounded = (value) => {
    const node = text(value); const sample = node.substringData;
    node.substringData = (start, limit) => { limits.push(limit); return sample(start, limit); };
    return element("P", {}, [node]);
  };
  const acrossNodes = collect(genericArticle([bounded(" ".repeat(1500)), bounded(" ".repeat(1500)), bounded("b".repeat(1500))]), { clock: () => 0 });
  assert.equal(acrossNodes.text, "b".repeat(1096)); assert.deepEqual(limits, [4096, 2596, 1096]);
  // Returned raw characters, not requested maxima for shorter native nodes,
  // consume the cap: 1500 + 1500 + 1096 = 4096.
});

test("fallback scans and final sampling preserve shared work/time/attribute bounds", () => {
  assert.equal(collect([genericArticle(), ...Array.from({ length: 10001 }, () => ({ nodeType: 8 }))], { clock: () => 0 }).reason, "capture-node-budget");
  assert.equal(collect(genericArticle(undefined, { class: "article-content", id: "x".repeat(1025) }), { clock: () => 0 }).reason, "capture-attribute-budget");
  let clock = 0;
  const slow = genericArticle(); const read = slow.firstChild.firstChild.substringData;
  slow.firstChild.firstChild.substringData = (start, length) => { clock = 41; return read(start, length); };
  assert.equal(collect(slow, { clock: () => clock }).reason, "capture-time-budget");
  const highBranching = genericArticle([proseParagraph("a"), proseParagraph("b"), ...Array.from({ length: 6000 }, () => element("SPAN"))]);
  assert.equal(collect(highBranching, { clock: () => 0 }).reason, "capture-node-budget");
});

test("early bounded title avoids scanning hundreds of irrelevant later head tags", () => {
  const result = collect(element("MAIN", {}, [text("Owned public sample")]), {
    head: Array.from({ length: 300 }, () => element("META", { content: "irrelevant" })), clock: () => 0,
  });
  assert.equal(result.status, "collected"); assert.equal(result.title, "Synthetic public sensor article");
  assert.equal(result.text, "Owned public sample");
});

test("first full bounded paragraph avoids enumerating thousands of later siblings", () => {
  const result = collect(element("MAIN", {}, [element("P", {}, [text("x".repeat(4096))]),
    ...Array.from({ length: 10001 }, () => element("P", {}, [text("Later article prose")]))]), { clock: () => 0 });
  assert.equal(result.status, "collected"); assert.equal(result.text, "x".repeat(4096));
});

test("title keeps first nonempty bounded ordering including empty and whitespace-only TITLE nodes", () => {
  const head = [element("TITLE", {}, [text(" \n\t ")]), element("TITLE", {}, [text("  First  valid \n title  ")]),
    element("TITLE", {}, [text("Later title must not replace it")])];
  const result = collect(element("MAIN", {}, [text("Owned sample")]), { title: "", head, clock: () => 0 });
  assert.equal(result.title, "First valid title");
  const setup = dom(element("MAIN", {}, [text("Owned sample")]), { clock: () => 0 });
  try {
    const title = globalThis.document.head.firstElementChild;
    Object.defineProperty(title, "nextElementSibling", { get() { assert.fail("Head scan advanced after a nonempty title"); } });
    assert.equal(collectPageContent(URL).title, "Synthetic public sensor article");
  } finally { setup.restore(); }
  assert.equal(collect(element("MAIN", {}, [text("Owned sample")]), { title: " ".repeat(200) + "outside prefix",
    head: [element("TITLE", {}, [text("Bounded fallback")])], clock: () => 0 }).title, "Bounded fallback");
});

test("lazy traversal retains first eligible region and exact nested text/whitespace order", () => {
  const first = element("MAIN", {}, [text("  Leading \n prose "), element("DIV", {}, [text("  middle\twords "),
    element("ARTICLE", {}, [text(" nested article ")])]), text(" trailing prose ")]);
  const result = collect([first, element("ARTICLE", {}, [text("Later article")])], { clock: () => 0 });
  assert.equal(result.text, "Leading prose middle words nested article trailing prose");
  assert.equal(collect([element("MAIN", {}, []), element("ARTICLE", {}, [text("Later nonempty article")])], { clock: () => 0 }).reason, "missing-region");
  assert.equal(collect(element("MAIN", {}, [text("x".repeat(4095)), text("b")]), { clock: () => 0 }).text, "x".repeat(4095));
  assert.equal(collect(element("MAIN", {}, [text("x".repeat(4094)), text("bc")]), { clock: () => 0 }).text, "x".repeat(4094) + " b");
});

test("region discovery retains eligible HEAD descendants rather than silently skipping HEAD", () => {
  const result = collect(element("MAIN", {}, [text("Body sample")]), {
    head: [element("ARTICLE", {}, [text("First eligible head sample")])], clock: () => 0,
  });
  assert.equal(result.text, "First eligible head sample");
});

test("head limit still rejects genuine scans past 256 elements when no bounded title is available", () => {
  for (const title of [null, " "]) {
    assert.equal(collect(element("MAIN", {}, [text("Owned sample")]), { title,
      head: Array.from({ length: 257 }, () => element("META")), clock: () => 0 }).reason, "capture-head-budget");
  }
  assert.equal(collect(element("MAIN", {}, [text("Owned sample")]), { title: null,
    head: [...Array.from({ length: 255 }, () => element("META")), element("TITLE", {}, [text("Last allowed title")])],
    clock: () => 0 }).title, "Last allowed title");
});

test("traversed ignored siblings and deep ancestry still exhaust the approved shared node budget", () => {
  for (const nodeType of [8, 3]) {
    const ignored = Array.from({ length: 10001 }, () => nodeType === 3 ? text("   ") : { nodeType });
    assert.equal(collect(element("MAIN", {}, [...ignored, text("Late sample")]), { clock: () => 0 }).reason, "capture-node-budget");
  }
  const nested = (depth) => { let node = element("P", {}, [text("Deep sample")]);
    for (let index = 0; index < depth; index++) node = element("DIV", {}, [node]); return node; };
  assert.equal(collect(element("MAIN", {}, [nested(500)]), { clock: () => 0 }).text, "Deep sample");
  assert.equal(collect(element("MAIN", {}, [nested(6000)]), { clock: () => 0 }).reason, "capture-node-budget");
});

test("excluded ancestor/subtree checks remain intact and never descend into excluded content", () => {
  for (const node of [element("FORM"), element("DIV", { class: "comments" }), element("DIV", { id: "login" }),
    element("DIV", { role: "dialog" }), element("DIV", { "aria-hidden": "true" }), element("DIV", {}, [], { contentVisibility: "hidden" })]) {
    Object.defineProperty(node, "firstChild", { get() { assert.fail("Excluded subtree was traversed"); } });
    assert.equal(collect(element("MAIN", {}, [node, text("Public sample")]), { clock: () => 0 }).text, "Public sample");
  }
});

test("oversized attributes fail closed instead of truncating possible exclusion context", () => {
  for (const name of ["id", "class", "role", "aria-hidden"]) {
    const result = collect(element("MAIN", { [name]: "x".repeat(1025) }, [text("Public sample")]), { clock: () => 0 });
    assert.deepEqual(result, { contractVersion: "page-content/1", status: "unsupported", reason: "capture-attribute-budget" });
    assert.equal(collect(element("MAIN", { [name]: "x".repeat(1024) }, [text("Public sample")]), { clock: () => 0 }).status, "collected");
  }
});

test("slow final text operations cannot publish collected output beyond 40ms", () => {
  for (const elapsed of [40, 41]) {
    let clock = 0;
    const slow = text("x".repeat(4096)); const read = slow.substringData;
    slow.substringData = (start, length) => { clock = elapsed; return read(start, length); };
    const result = collect(element("MAIN", {}, [slow]), { clock: () => clock });
    assert.equal(result.status, elapsed === 40 ? "collected" : "unsupported");
    if (elapsed === 41) assert.deepEqual(result, { contractVersion: "page-content/1", status: "unsupported", reason: "capture-time-budget" });
  }
});

test("unexpected native exceptions return a fixed reason without error messages or raw content", () => {
  const node = element("MAIN", {}, [text("Public sample")]);
  node.getAttribute = () => { throw { reason: "capture-node-budget", get message() { assert.fail("Raw exception message inspected"); } }; };
  assert.deepEqual(collect(node, { clock: () => 0 }), { contractVersion: "page-content/1", status: "unsupported", reason: "capture-failed" });
  assert.deepEqual(collect(element("MAIN", {}, [text("Public sample")]), { clock: () => { throw new Error("Native clock detail"); } }),
    { contractVersion: "page-content/1", status: "unsupported", reason: "capture-failed" });
});

test("bounded rendered main collection excludes navigation/forms/editables/comments/hidden/frame text", () => {
  const editable = element("DIV", {}, [text("Editable secret")]); editable.isContentEditable = true;
  const main = element("MAIN", {}, [text("Public article"), element("P", {}, [text("<img src=x onerror=alert(1)> inert hostile prose")]),
    element("FORM", {}, [text("Form secret")]), editable, element("NAV", {}, [text("Navigation secret")]),
    element("DIV", { id: "comments" }, [text("Comment secret")]), element("SPAN", { "aria-hidden": "true" }, [text("Hidden secret")]),
    element("IFRAME", {}, [text("Frame secret")]), element("SCRIPT", {}, [text("Script secret")]),
    element("P", {}, [text("CSS hidden secret")], { display: "none" }), element("P", {}, [text("Transparent secret")], { opacity: "0" })]);
  const result = collect(main); assert.equal(result.status, "collected");
  assert.equal(result.text, "Public article <img src=x onerror=alert(1)> inert hostile prose");
  assert.equal(result.title, "Synthetic public sensor article"); assert.equal(result.url, URL);
  assert.equal(result.extractorVersion, "main-text-prefix/v1");
});

test("article and main role supported, whole-body fallback forbidden, hidden ancestor skipped", () => {
  for (const region of [element("ARTICLE", {}, [text("Public sample")]), element("DIV", { role: "main" }, [text("Public sample")])]) {
    assert.equal(collect(region).status, "collected");
  }
  assert.equal(collect(element("DIV", {}, [text("Body-only text must not be captured")])).reason, "missing-region");
  assert.equal(collect(element("DIV", { "aria-hidden": "true" }, [element("ARTICLE", {}, [text("Hidden article")])])).reason, "missing-region");
  assert.equal(collect(element("MAIN", { class: "paywall" }, [text("Restricted article")])).status, "unsupported");
});

test("head metadata alone never vetoes otherwise eligible owned public main text", () => {
  const values = ["all, index, follow", "max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    "noindex, nofollow, nosnippet, noarchive", "noai, noimageai", "0", "1", "unknown-directive",
    "", " , ; ", "max-snippet:invalid", "noai\u0000malformed", "x".repeat(2048)];
  for (const name of ["robots", "googlebot", "tdm-reservation", " ROBOTS ", "unrecognized-policy"]) {
    for (const content of values) {
      const result = collect(element("MAIN", {}, [text("Owned public sample")]), { head: [element("META", { name, content })] });
      assert.deepEqual(result, { contractVersion: "page-content/1", status: "collected", url: URL,
        title: "Synthetic public sensor article", text: "Owned public sample", extractorVersion: "main-text-prefix/v1" });
      assert.deepEqual(Object.keys(result).sort(), ["contractVersion", "extractorVersion", "status", "text", "title", "url"]);
    }
  }
  const metadata = [{ name: "robots", content: "all, follow" }, { name: "googlebot", content: "noai, nosnippet" },
    { name: "tdm-reservation", content: "1" }, { name: "robots" }, { content: "unknown" }].map((attributes) => element("META", attributes));
  for (const node of metadata) {
    const getAttribute = node.getAttribute;
    node.getAttribute = (name) => {
      if (["name", "content"].includes(name)) throw new Error("Head metadata must not be read");
      return getAttribute(name);
    };
  }
  assert.equal(collect(element("MAIN", {}, [text("Owned public sample")]), { head: metadata }).status, "collected");
});

test("mismatched navigation, subframes and malformed controls fail closed", () => {
  assert.equal(collect(element("MAIN", {}, [text("Public sample")]), { url: URL + "&changed=1" }).reason, "document-mismatch");
  assert.equal(collect(element("MAIN", {}, [text("Bad\u0000control")])).reason, "invalid-content");
  const setup = dom(element("MAIN", {}, [text("Public sample")]));
  try {
    Object.defineProperty(globalThis, "top", { value: {}, configurable: true });
    assert.equal(collectPageContent(URL).reason, "document-mismatch");
  } finally { setup.restore(); }
});

test("text/title sample, DOM node and elapsed-time budgets remain bounded", () => {
  const result = collect(element("MAIN", {}, [text("x".repeat(1_000_000))]));
  assert.equal(result.text.length, 4096);
  assert.equal(collect(element("MAIN", {}, Array.from({ length: 6000 }, () => element("P", {}, []))), { clock: () => 0 }).reason, "capture-node-budget");
  assert.equal(collect(element("MAIN", {}, [text("Public sample")]), {
    head: Array.from({ length: 257 }, () => element("META", { name: "robots", content: "noai" })), title: null, clock: () => 0,
  }).reason, "capture-head-budget");
  let clock = 0;
  assert.equal(collect(element("MAIN", {}, [text("Public sample")]), { clock: () => clock += 50 }).reason, "capture-time-budget");
  const setup = dom(element("MAIN", {}, [text("Public sample")]));
  try {
    const title = globalThis.document.head.firstElementChild;
    title.firstChild = text("t".repeat(10000));
    assert.equal(collectPageContent(URL).title.length, 200);
  } finally { setup.restore(); }
});

test("collector serializes without closure bindings and attests normalized functional query identity", () => {
  const setup = dom(element("MAIN", {}, [text("Owned public sample")]), { url: URL + "#fragment" });
  try {
    const serialized = (0, eval)(`(${collectPageContent.toString()})`);
    assert.equal(serialized(URL).status, "collected");
    assert.equal(attestContentDocument(URL).status, "attested");
    assert.equal(attestContentDocument(URL.replace("product=2", "product=3")).status, "unsupported");
  } finally { setup.restore(); }
});

test("generic fallback collector serializes independently of module closure bindings", () => {
  const setup = dom(genericArticle(), { clock: () => 0 });
  try {
    const serialized = (0, eval)(`(${collectPageContent.toString()})`);
    assert.equal(serialized(URL).extractorVersion, "article-container-prefix/v1");
  } finally { setup.restore(); }
});

test("reader binds top-frame Chromium identity and attests exact documentId without trusting DOM IDs", async () => {
  const calls = [];
  const scripting = { async executeScript(call) {
    calls.push(call);
    return [{ documentId: "doc-1", frameId: 0, result: call.func === collectPageContent ? {
      contractVersion: "page-content/1", status: "collected", url: URL, title: "Synthetic title", text: "Synthetic content", extractorVersion: "main-text-prefix/v1",
    } : { contractVersion: "page-content-attestation/1", status: "attested", url: URL } }];
  } };
  const reader = createPageContentReader(scripting); const observed = await reader.read(7, URL);
  assert.equal(observed.documentId, "doc-1"); assert.ok(Object.isFrozen(observed.result));
  await reader.attest(7, observed.documentId, URL);
  assert.deepEqual(calls[0].target, { tabId: 7, frameIds: [0] }); assert.equal(calls[0].world, "ISOLATED");
  assert.deepEqual(calls[1].target, { tabId: 7, documentIds: ["doc-1"] });
});

test("reader rejects injected malformed/projection extras, wrong frame/document, oversized and hostile DTOs", async () => {
  const good = { contractVersion: "page-content/1", status: "collected", url: URL, title: "Title", text: "Public sample", extractorVersion: "main-text-prefix/v1" };
  for (const entry of [{ documentId: "doc-1", frameId: 1, result: good }, { documentId: "", frameId: 0, result: good },
    { documentId: "doc-1", frameId: 0, result: { ...good, documentId: "page-claimed" } },
    { documentId: "doc-1", frameId: 0, result: { ...good, metadata: { robots: "noai" } } },
    { documentId: "doc-1", frameId: 0, result: { ...good, text: "x".repeat(4097) } },
    { documentId: "doc-1", frameId: 0, result: { ...good, url: URL + "&changed=1" } },
    { documentId: "doc-1", frameId: 0, result: { ...good, get title() { throw new Error("Page-defined getter"); } } }]) {
    const reader = createPageContentReader({ executeScript: async () => [entry] });
    await assert.rejects(reader.read(7, URL), /Page content unavailable/);
  }
  const reader = createPageContentReader({ executeScript: async () => [{ documentId: "other-doc", frameId: 0, result: { contractVersion: "page-content-attestation/1", status: "attested", url: URL } }] });
  await assert.rejects(reader.attest(7, "doc-1", URL), /Page content unavailable/);
  await assert.rejects(reader.read(7, "https://private.invalid/"), /Page content unavailable/);
});

test("reader retains the legacy rights-restricted unsupported projection", async () => {
  const legacy = { contractVersion: "page-content/1", status: "unsupported", reason: "rights-restricted" };
  const reader = createPageContentReader({ executeScript: async () => [{ documentId: "doc-1", frameId: 0, result: legacy }] });
  const observed = await reader.read(7, URL);
  assert.deepEqual(observed.result, legacy);
  assert.ok(Object.isFrozen(observed.result));
});

test("reader projects fixed resource reasons plus legacy capture-budget without extra diagnostic data", async () => {
  for (const reason of ["capture-budget", "capture-time-budget", "capture-node-budget", "capture-head-budget", "capture-attribute-budget", "capture-failed"]) {
    const result = { contractVersion: "page-content/1", status: "unsupported", reason };
    const reader = createPageContentReader({ executeScript: async () => [{ documentId: "doc-1", frameId: 0, result }] });
    const observed = await reader.read(7, URL); assert.deepEqual(observed.result, result); assert.ok(Object.isFrozen(observed.result));
    const withRawDiagnostic = createPageContentReader({ executeScript: async () => [{ documentId: "doc-1", frameId: 0,
      result: { ...result, details: "Page body or native error detail" } }] });
    await assert.rejects(withRawDiagnostic.read(7, URL), /Page content unavailable/);
  }
  const reader = createPageContentReader({ executeScript: async () => [{ documentId: "doc-1", frameId: 0,
    result: { contractVersion: "page-content/1", status: "unsupported", reason: "capture-unknown-detail" } }] });
  await assert.rejects(reader.read(7, URL), /Page content unavailable/);
});

test("reader accepts only the two explicit extractor versions and never exposes evidence DTO fields", async () => {
  const result = { contractVersion: "page-content/1", status: "collected", url: URL, title: "Synthetic title",
    text: "a".repeat(300), extractorVersion: "article-container-prefix/v1" };
  const project = (value) => createPageContentReader({ executeScript: async () => [{ documentId: "doc-1", frameId: 0, result: value }] }).read(7, URL);
  assert.equal((await project(result)).result.extractorVersion, "article-container-prefix/v1");
  assert.equal((await project({ ...result, extractorVersion: "main-text-prefix/v1" })).result.extractorVersion, "main-text-prefix/v1");
  for (const value of [{ ...result, extractorVersion: "article-container-prefix/v2" }, { ...result, extractorVersion: "main-text-prefix/v2" },
    { ...result, paragraphCount: 2 }, { ...result, linkDensity: 0.1 }]) {
    await assert.rejects(project(value), /Page content unavailable/);
  }
});
