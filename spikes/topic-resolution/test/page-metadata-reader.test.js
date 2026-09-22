import assert from "node:assert/strict";
import test from "node:test";

import {
  attestPageDocument,
  collectPageMetadata,
  createPageMetadataReader,
} from "../browser/chromium/page-metadata-reader.js";

const LOCAL_URL = "http://127.0.0.1:4173/p1-5c.html";

function element(tagName, attributes = {}, textContent = "") {
  return {
    getAttribute(name) {
      return Object.hasOwn(attributes, name) ? attributes[name] : null;
    },
    tagName,
    textContent,
  };
}

function headWith(children) {
  return {
    children: {
      item(index) {
        return children[index] ?? null;
      },
      length: children.length,
    },
  };
}

async function withPageGlobals({ document, top = globalThis, url }, operation) {
  const saved = new Map(
    ["document", "location", "top"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: document },
    location: { configurable: true, value: { href: url } },
    top: { configurable: true, value: top },
  });
  try {
    return await operation();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }
}

function completeHead() {
  return headWith([
    element("META", { property: "og:title", content: "Primary title" }),
    element("META", { name: "twitter:title", content: "Social title" }),
    element("TITLE", {}, "Element title"),
    element("META", {
      property: "og:description",
      content: "Primary description",
    }),
    element("META", { name: "description", content: "Fallback description" }),
    element("META", {
      name: "twitter:description",
      content: "Social description",
    }),
    element("META", {
      property: "article:published_time",
      content: "2026-01-15T10:30:00Z",
    }),
    element("META", { name: "robots", content: "index, follow" }),
    element("META", { name: "tdm-reservation", content: "0" }),
    element("LINK", { rel: "alternate CANONICAL", href: LOCAL_URL }),
    element("SCRIPT", { type: "application/ld+json" }, "hostile JSON-LD"),
  ]);
}

test("collector reads only the bounded direct-head allowlist and preserves candidate provenance", async () => {
  const document = {};
  Object.defineProperty(document, "head", { value: completeHead() });
  for (const forbidden of [
    "body",
    "cookie",
    "forms",
    "images",
    "referrer",
    "scripts",
  ]) {
    Object.defineProperty(document, forbidden, {
      get() {
        throw new Error(`forbidden ${forbidden} access`);
      },
    });
  }

  const result = await withPageGlobals(
    { document, url: `${LOCAL_URL}#fragment` },
    () => collectPageMetadata(LOCAL_URL),
  );
  assert.equal(result.status, "collected");
  assert.equal(result.documentUrl, `${LOCAL_URL}#fragment`);
  assert.deepEqual(result.candidates.title, [
    { source: "meta-property-og-title", value: "Primary title" },
    { source: "meta-name-twitter-title", value: "Social title" },
    { source: "title-element", value: "Element title" },
  ]);
  assert.deepEqual(result.candidates.description, [
    {
      source: "meta-property-og-description",
      value: "Primary description",
    },
    { source: "meta-name-description", value: "Fallback description" },
    {
      source: "meta-name-twitter-description",
      value: "Social description",
    },
  ]);
  assert.deepEqual(result.candidates.canonical, [
    { source: "link-rel-canonical", value: LOCAL_URL },
  ]);
  assert.deepEqual(result.candidates.publishedAtHint, [
    {
      source: "meta-property-article-published-time",
      value: "2026-01-15T10:30:00Z",
    },
  ]);
  assert.deepEqual(result.candidates.robots, [
    { source: "meta-name-robots", value: "index, follow" },
  ]);
  assert.deepEqual(result.candidates.tdmReservation, [
    { source: "meta-name-tdm-reservation", value: "0" },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /hostile JSON-LD/u);
});

test("collector verifies document identity before touching head metadata", async () => {
  let headReads = 0;
  const document = {};
  Object.defineProperty(document, "head", {
    get() {
      headReads += 1;
      throw new Error("must not read head");
    },
  });
  const result = await withPageGlobals(
    { document, url: "https://example.com/" },
    () => collectPageMetadata(LOCAL_URL),
  );
  assert.deepEqual(result, {
    contractVersion: "page-metadata-candidates/1.0.0",
    status: "rejected",
  });
  assert.equal(headReads, 0);
});

test("collector fails closed for frames, queries, malformed head collections, and bounds", async () => {
  const cases = [
    {
      document: { head: completeHead() },
      top: {},
      url: LOCAL_URL,
    },
    {
      document: { head: completeHead() },
      url: `${LOCAL_URL}?token=secret`,
    },
    {
      document: { head: { children: { item() {}, length: 257 } } },
      url: LOCAL_URL,
    },
    {
      document: {
        head: headWith([
          element("META", {
            property: "og:title",
            content: "x".repeat(257),
          }),
        ]),
      },
      url: LOCAL_URL,
    },
    {
      document: {
        head: headWith([
          element("META", { name: "x".repeat(129), content: "ignored" }),
        ]),
      },
      url: LOCAL_URL,
    },
  ];
  for (const page of cases) {
    const result = await withPageGlobals(page, () =>
      collectPageMetadata(LOCAL_URL),
    );
    assert.equal(result.status, "rejected");
    assert.deepEqual(Object.keys(result).sort(), ["contractVersion", "status"]);
    assert.doesNotMatch(JSON.stringify(result), /secret/u);
  }
});

test("collector caps aggregate relevant candidates", async () => {
  const children = Array.from({ length: 33 }, (_, index) =>
    element("TITLE", {}, `title-${index}`),
  );
  const result = await withPageGlobals(
    { document: { head: headWith(children) }, url: LOCAL_URL },
    () => collectPageMetadata(LOCAL_URL),
  );
  assert.equal(result.status, "rejected");
});

test("document attestation is URL-bound and returns no page metadata", async () => {
  const accepted = await withPageGlobals(
    { document: {}, url: `${LOCAL_URL}#after` },
    () => attestPageDocument(LOCAL_URL),
  );
  assert.deepEqual(accepted, {
    contractVersion: "page-document-attestation/1.0.0",
    documentUrl: `${LOCAL_URL}#after`,
    isTopLevel: true,
    status: "attested",
  });
  const rejected = await withPageGlobals(
    { document: {}, url: "https://example.com/" },
    () => attestPageDocument(LOCAL_URL),
  );
  assert.deepEqual(rejected, {
    contractVersion: "page-document-attestation/1.0.0",
    status: "rejected",
  });
});

test("reader uses exact isolated top-frame collection and same-document attestation calls", async () => {
  const calls = [];
  const scriptingApi = {
    async executeScript(details) {
      calls.push(details);
      if (calls.length === 1) {
        return [{ documentId: "document-123", frameId: 0, result: { ok: true } }];
      }
      return [{
        documentId: "document-123",
        frameId: 0,
        result: { attested: true },
      }];
    },
  };
  const reader = createPageMetadataReader(scriptingApi);
  const receipt = await reader.read(9, LOCAL_URL);
  assert.deepEqual(receipt, {
    documentId: "document-123",
    result: { ok: true },
  });
  assert.ok(Object.isFrozen(receipt));
  assert.deepEqual(calls[0], {
    args: [LOCAL_URL],
    func: collectPageMetadata,
    target: { frameIds: [0], tabId: 9 },
    world: "ISOLATED",
  });
  assert.deepEqual(
    await reader.attest(9, "document-123", LOCAL_URL),
    { attested: true },
  );
  assert.deepEqual(calls[1], {
    args: [LOCAL_URL],
    func: attestPageDocument,
    target: { documentIds: ["document-123"], tabId: 9 },
    world: "ISOLATED",
  });
});

test("reader hides API details and rejects malformed results and identifiers", async () => {
  assert.throws(
    () => createPageMetadataReader(null),
    /requires an executeScript function/u,
  );
  assert.throws(
    () => createPageMetadataReader({}),
    /requires an executeScript function/u,
  );

  const cases = [
    [],
    [{ documentId: "document-1", frameId: 1, result: {} }],
    [{ documentId: "", frameId: 0, result: {} }],
    [{ frameId: 0, result: {} }],
    [
      { documentId: "document-1", frameId: 0, result: {} },
      { documentId: "document-2", frameId: 0, result: {} },
    ],
  ];
  for (const result of cases) {
    const reader = createPageMetadataReader({
      async executeScript() {
        return result;
      },
    });
    await assert.rejects(
      reader.read(1, LOCAL_URL),
      (error) =>
        error instanceof TypeError && error.message === "Page metadata read failed",
    );
  }

  const throwing = createPageMetadataReader({
    async executeScript() {
      throw new Error("secret browser detail");
    },
  });
  await assert.rejects(
    throwing.read(1, LOCAL_URL),
    (error) =>
      error instanceof TypeError &&
      error.message === "Page metadata read failed" &&
      !error.message.includes("secret"),
  );
  await assert.rejects(throwing.read(-1, LOCAL_URL), /Page metadata read failed/u);
  await assert.rejects(
    throwing.attest(1, "bad document id", LOCAL_URL),
    /Page document attestation failed/u,
  );
});

test("reader rejects an attestation from a different frame or document", async () => {
  for (const result of [
    [{ documentId: "document-1", frameId: 1, result: {} }],
    [{ documentId: "document-2", frameId: 0, result: {} }],
    [],
  ]) {
    const reader = createPageMetadataReader({
      async executeScript() {
        return result;
      },
    });
    await assert.rejects(
      reader.attest(1, "document-1", LOCAL_URL),
      (error) =>
        error instanceof TypeError &&
        error.message === "Page document attestation failed",
    );
  }
});
