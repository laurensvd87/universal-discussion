import assert from "node:assert/strict";
import test from "node:test";
import { collectPageContent, attestContentDocument, createPageContentReader } from "../browser/chromium/page-content-reader.js";

const URL = "http://127.0.0.1:4173/background-fixture/article-a.html?product=2";
function text(value) { return { nodeType: 3, substringData(start, length) { return value.slice(start, start + length); },
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
function dom(main, { head = [], url = URL, clock } = {}) {
  const title = element("TITLE", {}, [text("Synthetic public sensor article")]);
  const headNode = element("HEAD", {}, [title, ...head]);
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
  assert.equal(collect(element("MAIN", {}, Array.from({ length: 1600 }, () => element("P", {}, [text("one")])))).reason, "capture-budget");
  assert.equal(collect(element("MAIN", {}, [text("Public sample")]), {
    head: Array.from({ length: 256 }, () => element("META", { name: "robots", content: "noai" })),
  }).reason, "capture-budget");
  let clock = 0;
  assert.equal(collect(element("MAIN", {}, [text("Public sample")]), { clock: () => clock += 50 }).reason, "capture-budget");
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
