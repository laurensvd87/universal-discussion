import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateLabeledCorpus } from "../evaluation/corpus-contract.js";
import {
  HTML_EXTRACTION_CONTRACT_VERSION,
  HTML_EXTRACTION_LIMITS,
  HTML_FINGERPRINT_VERSION,
  HTML_PARSER_VERSION,
  HtmlExtractionError,
  extractSyntheticHtml,
} from "../extraction/html-extraction.js";
import { createTopicResolver, RESOLUTION_METHOD } from "../src/index.js";
import { buildCorpus } from "../support/generated-corpus.js";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  packageDirectory,
  "fixtures",
  "html",
  "harbor-barrier.html",
);
const encoder = new TextEncoder();
const DEFAULT_OBSERVED_URL =
  "https://publisher.example.com/city/observed?utm_source=fixture#comments";
const MEDIA_TYPE = "text/html; charset=utf-8";

function bytes(value) {
  return encoder.encode(value);
}

function htmlDocument({ afterTitle = "", beforeTitle = "", body = "", title = "Title" } = {}) {
  return `<!doctype html><html><head>${beforeTitle}<title>${title}</title>${afterTitle}</head>${body}`;
}

function extractionInput(htmlBytes, overrides = {}) {
  return {
    fixtureId: "generated/extraction-test",
    htmlBytes,
    mediaType: MEDIA_TYPE,
    observedUrl: DEFAULT_OBSERVED_URL,
    ...overrides,
  };
}

function extractText(html, overrides = {}) {
  return extractSyntheticHtml(extractionInput(bytes(html), overrides));
}

function extractionError(code) {
  return (error) => error instanceof HtmlExtractionError && error.code === code;
}

test("reviewed HTML fixture produces a deterministic, pinned extraction receipt", async () => {
  const htmlBytes = Uint8Array.from(await readFile(fixturePath));
  const first = extractSyntheticHtml(
    extractionInput(htmlBytes, { fixtureId: "html/harbor-barrier" }),
  );
  const second = extractSyntheticHtml(
    extractionInput(Uint8Array.from(htmlBytes), {
      fixtureId: "html/harbor-barrier",
    }),
  );

  assert.deepEqual(second, first);
  assert.equal(first.report.contractVersion, HTML_EXTRACTION_CONTRACT_VERSION);
  assert.equal(first.report.parserVersion, HTML_PARSER_VERSION);
  assert.equal(first.report.fingerprintVersion, HTML_FINGERPRINT_VERSION);
  assert.equal(first.report.inputByteLength, 580);
  assert.deepEqual(first.report.sourceProjection, {
    contentFingerprint:
      "sha256:d7e467751f52579c2019088f221d3db0004d2a519daeb609e1b60091064fda9f",
    fingerprintEvidence: {
      fixtureId: "html/harbor-barrier",
      kind: "synthetic-fixture",
    },
    title: "Harbor council approves & funds flood barrier",
    url: "https://publisher.example.com/city/observed",
  });
  assert.deepEqual(first.report.metadataEvidence.canonical, {
    candidateUrl: "https://publisher.example.com/city/harbor-barrier",
    declarationCount: 1,
    status: "same-origin-hint",
  });
  assert.deepEqual(first.report.scope, {
    callerDeclaredSynthetic: true,
    canonicalMetadataAuthoritative: false,
    completeP12SourceRecord: false,
    fixtureProvenanceVerified: false,
    liveFetchPerformed: false,
    networkUsed: false,
    rawContentRetained: false,
  });
  assert.equal(first.reportDigestAlgorithm, "canonical-json-sha256/1.0.0");
  assert.match(first.reportDigest, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(first), /fictional North Harbor/);
  assert.doesNotMatch(JSON.stringify(first), /utm_source/);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.report));
  assert.ok(Object.isFrozen(first.report.sourceProjection));
});

test("resolver accepts the projection and its fields integrate into a complete corpus Source", async () => {
  const htmlBytes = Uint8Array.from(await readFile(fixturePath));
  const { report } = extractSyntheticHtml(
    extractionInput(htmlBytes, { fixtureId: "html/harbor-barrier" }),
  );
  const clock = () => new Date("2026-09-20T15:00:00.000Z");
  const resolved = createTopicResolver({ clock }).resolve(report.sourceProjection);

  assert.equal(resolved.source.canonicalUrl, report.sourceProjection.url);
  assert.equal(resolved.source.title, report.sourceProjection.title);
  assert.equal(
    resolved.source.contentFingerprint,
    report.sourceProjection.contentFingerprint,
  );
  assert.deepEqual(
    resolved.source.fingerprintEvidence,
    report.sourceProjection.fingerprintEvidence,
  );
  assert.equal(
    resolved.sourceTopicLink.resolutionMethod,
    RESOLUTION_METHOD.EXACT_CONTENT_FINGERPRINT,
  );

  const corpus = buildCorpus();
  corpus.sources[0] = {
    ...corpus.sources[0],
    ...report.sourceProjection,
  };
  const corpusReport = validateLabeledCorpus(corpus);
  assert.equal(corpusReport.sample.totalSources, corpus.sources.length);
  assert.equal(corpusReport.readiness.structurallyReadyForSplitFreeze, true);
  assert.equal(corpusReport.scope.gateEligible, false);
});

test("exact document bytes join synthetic observations; canonical hints alone do not", () => {
  const sharedBytes = bytes(
    htmlDocument({
      afterTitle: '<link rel="canonical" href="/shared-hint">',
      title: "Shared bytes",
    }),
  );
  const first = extractSyntheticHtml(
    extractionInput(Uint8Array.from(sharedBytes), {
      fixtureId: "same-bytes/a",
      observedUrl: "https://one.example.com/story-a",
    }),
  ).report;
  const second = extractSyntheticHtml(
    extractionInput(Uint8Array.from(sharedBytes), {
      fixtureId: "same-bytes/b",
      observedUrl: "https://two.example.com/story-b",
    }),
  ).report;
  assert.equal(
    first.sourceProjection.contentFingerprint,
    second.sourceProjection.contentFingerprint,
  );

  const resolver = createTopicResolver({
    clock: () => new Date("2026-09-20T15:00:00.000Z"),
  });
  const resolvedFirst = resolver.resolve(first.sourceProjection);
  const resolvedSecond = resolver.resolve(second.sourceProjection);
  assert.equal(resolvedFirst.topic.id, resolvedSecond.topic.id);
  assert.notEqual(resolvedFirst.source.id, resolvedSecond.source.id);

  const canonical = "https://publisher.example.com/shared-hint";
  const differentA = extractText(
    htmlDocument({
      afterTitle: `<link rel="canonical" href="${canonical}">`,
      title: "Document A",
    }),
    { observedUrl: "https://publisher.example.com/source-a" },
  ).report;
  const differentB = extractText(
    htmlDocument({
      afterTitle: `<link rel="canonical" href="${canonical}">`,
      title: "Document B",
    }),
    { observedUrl: "https://publisher.example.com/source-b" },
  ).report;
  assert.equal(
    differentA.metadataEvidence.canonical.candidateUrl,
    differentB.metadataEvidence.canonical.candidateUrl,
  );
  assert.notEqual(
    differentA.sourceProjection.contentFingerprint,
    differentB.sourceProjection.contentFingerprint,
  );
  const separateResolver = createTopicResolver({
    clock: () => new Date("2026-09-20T15:00:00.000Z"),
  });
  assert.notEqual(
    separateResolver.resolve(differentA.sourceProjection).topic.id,
    separateResolver.resolve(differentB.sourceProjection).topic.id,
  );
});

test("canonical metadata is bounded, non-authoritative, and fail-closed", () => {
  const canonicalFor = (hrefAttribute) =>
    extractText(
      htmlDocument({
        afterTitle: `<link rel="canonical" ${hrefAttribute}>`,
      }),
    ).report.metadataEvidence.canonical;

  assert.deepEqual(
    extractText(htmlDocument()).report.metadataEvidence.canonical,
    { declarationCount: 0, status: "absent" },
  );
  assert.deepEqual(canonicalFor('href="/article?a=1&amp;b=2#fragment"'), {
    candidateUrl: "https://publisher.example.com/article?a=1&b=2",
    declarationCount: 1,
    status: "same-origin-hint",
  });
  assert.deepEqual(canonicalFor('href="https://other.example.org/article"'), {
    declarationCount: 1,
    status: "rejected-cross-origin",
  });

  for (const hrefAttribute of [
    "",
    'href=""',
    'href="https://user:password@publisher.example.com/article"',
    'href="http://127.0.0.1/private"',
    'href="javascript:alert(1)"',
    'href="data:text/plain,private"',
    'href="/article?bad=&unsupported;"',
    'href="/article&#10;continued"',
  ]) {
    assert.deepEqual(canonicalFor(hrefAttribute), {
      declarationCount: 1,
      status: "rejected-invalid",
    });
  }

  const marker = "SECRET-CANONICAL-MARKER";
  const rejected = canonicalFor(`href="javascript:${marker}"`);
  assert.doesNotMatch(JSON.stringify(rejected), new RegExp(marker));

  const duplicate = extractText(
    htmlDocument({
      afterTitle:
        '<link rel="canonical" href="/one"><link rel="canonical" href="/two">',
    }),
  ).report.metadataEvidence.canonical;
  assert.deepEqual(duplicate, { declarationCount: 2, status: "ambiguous" });
});

test("the narrow head grammar ignores decoys and decodes extracted fields once", () => {
  const mixedCase = extractText(
    '<!DoCtYpE HTML><HTML lang="en"><HeAd><META charset="utf-8">' +
      '<TiTlE>  A&#x20;B &amp; C &amp;lt;D&#62;  </TiTlE>' +
      '<LINK REL="alternate CANONICAL" HREF="/x?a=1&amp;b=2"></HeAd>' +
      '<SCRIPT>body is opaque after the head</SCRIPT>',
  ).report;
  assert.equal(mixedCase.sourceProjection.title, "A B & C &lt;D>");
  assert.deepEqual(mixedCase.metadataEvidence.canonical, {
    candidateUrl: "https://publisher.example.com/x?a=1&b=2",
    declarationCount: 1,
    status: "same-origin-hint",
  });

  const decoys = extractText(
    htmlDocument({
      beforeTitle:
        '<!-- <link rel="canonical" href="https://other.example.org/comment"> -->' +
        '<meta property="og:url" content="https://other.example.org/social">',
      body:
        '<link rel="canonical" href="https://other.example.org/body">' +
        '<script><link rel="canonical" href="https://other.example.org/script"></script>',
    }),
  ).report;
  assert.deepEqual(decoys.metadataEvidence.canonical, {
    declarationCount: 0,
    status: "absent",
  });
});

test("malformed, active, invalid UTF-8, and data-bearing inputs reject without echoing content", () => {
  const malformedDocuments = [
    "<html><head><title>Missing doctype</title></head>",
    "<!doctype html><html><head><title>Unclosed head</title>",
    "<!doctype html><html><head>unsupported text<title>Title</title></head>",
    htmlDocument({ afterTitle: "<title>Second title</title>" }),
    htmlDocument({ title: "Nested <em>title</em>" }),
    "<!doctype html><html><head><!-- unclosed<title>Title</title></head>",
    htmlDocument({ beforeTitle: '<meta name="a" name="b">' }),
    htmlDocument({ beforeTitle: "<meta charset=utf-8>" }),
    htmlDocument({ beforeTitle: "<unknown></unknown>" }),
    htmlDocument({ beforeTitle: "<script></script>" }),
    htmlDocument({ beforeTitle: '<base href="https://other.example.org/">' }),
  ];
  for (const document of malformedDocuments) {
    assert.throws(
      () => extractText(document),
      (error) =>
        error instanceof HtmlExtractionError &&
        [
          "INVALID_HTML_PROFILE",
          "INVALID_TITLE",
          "UNSUPPORTED_HEAD_CONTENT",
        ].includes(error.code),
    );
  }

  const secretMarker = "DO-NOT-ECHO-THIS-MARKER";
  assert.throws(
    () => extractText(htmlDocument({ title: `${secretMarker}&bogus;` })),
    (error) =>
      error instanceof HtmlExtractionError &&
      error.code === "INVALID_ENTITY" &&
      !error.message.includes(secretMarker),
  );

  for (const invalidBytes of [
    Uint8Array.from([0xc3, 0x28]),
    Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes(htmlDocument())]),
    bytes(htmlDocument({ body: "\0" })),
  ]) {
    assert.throws(
      () => extractSyntheticHtml(extractionInput(invalidBytes)),
      extractionError("INVALID_UTF8"),
    );
  }
});

test("every declared extraction resource boundary accepts the limit and rejects the next unit", () => {
  const limits = HTML_EXTRACTION_LIMITS;
  const exactHtmlShell = htmlDocument();
  const exactHtml = `${exactHtmlShell}${"x".repeat(
    limits.maximumHtmlBytes - exactHtmlShell.length,
  )}`;
  assert.equal(bytes(exactHtml).byteLength, limits.maximumHtmlBytes);
  assert.doesNotThrow(() => extractText(exactHtml));
  assert.throws(
    () => extractText(`${exactHtml}x`),
    extractionError("RESOURCE_LIMIT"),
  );
  assert.throws(
    () =>
      extractSyntheticHtml(
        extractionInput(new Uint8Array(limits.maximumHtmlBytes * 16)),
      ),
    extractionError("RESOURCE_LIMIT"),
  );

  const headPrefix = "<!doctype html><html><head><title>T</title>";
  const headSuffix = "</head>";
  const exactHead = `${headPrefix}${" ".repeat(
    limits.maximumHeadBytes - headPrefix.length - headSuffix.length,
  )}${headSuffix}`;
  assert.equal(bytes(exactHead).byteLength, limits.maximumHeadBytes);
  assert.doesNotThrow(() => extractText(exactHead));
  const overHead = `${headPrefix}${" ".repeat(
    limits.maximumHeadBytes - headPrefix.length - headSuffix.length + 1,
  )}${headSuffix}`;
  assert.throws(() => extractText(overHead), extractionError("RESOURCE_LIMIT"));

  const metaTagsAtLimit = limits.maximumTags - 5;
  assert.doesNotThrow(() =>
    extractText(htmlDocument({ afterTitle: "<meta>".repeat(metaTagsAtLimit) })),
  );
  assert.throws(
    () =>
      extractText(htmlDocument({ afterTitle: "<meta>".repeat(metaTagsAtLimit + 1) })),
    extractionError("RESOURCE_LIMIT"),
  );

  const attributes = (count, prefix = "a") =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}="v"`).join(" ");
  assert.doesNotThrow(() =>
    extractText(
      htmlDocument({
        beforeTitle: `<meta ${attributes(limits.maximumAttributesPerTag)}>`,
      }),
    ),
  );
  assert.throws(
    () =>
      extractText(
        htmlDocument({
          beforeTitle: `<meta ${attributes(limits.maximumAttributesPerTag + 1)}>`,
        }),
      ),
    extractionError("RESOURCE_LIMIT"),
  );

  const fullAttributeTag = `<meta ${attributes(limits.maximumAttributesPerTag)}>`;
  assert.doesNotThrow(() =>
    extractText(
      htmlDocument({
        beforeTitle: fullAttributeTag.repeat(
          limits.maximumHeadAttributes / limits.maximumAttributesPerTag,
        ),
      }),
    ),
  );
  assert.throws(
    () =>
      extractText(
        htmlDocument({
          beforeTitle:
            fullAttributeTag.repeat(
              limits.maximumHeadAttributes / limits.maximumAttributesPerTag,
            ) + '<meta overflow="v">',
        }),
      ),
    extractionError("RESOURCE_LIMIT"),
  );

  const maximumName = `a${"n".repeat(limits.maximumNameCodeUnits - 1)}`;
  assert.doesNotThrow(() =>
    extractText(htmlDocument({ beforeTitle: `<meta ${maximumName}="v">` })),
  );
  assert.throws(
    () =>
      extractText(htmlDocument({ beforeTitle: `<meta ${maximumName}n="v">` })),
    extractionError("RESOURCE_LIMIT"),
  );

  assert.doesNotThrow(() =>
    extractText(
      htmlDocument({
        beforeTitle: `<meta content="${"v".repeat(limits.maximumValueCodeUnits)}">`,
      }),
    ),
  );
  assert.throws(
    () =>
      extractText(
        htmlDocument({
          beforeTitle: `<meta content="${"v".repeat(
            limits.maximumValueCodeUnits + 1,
          )}">`,
        }),
      ),
    extractionError("RESOURCE_LIMIT"),
  );

  const exactComment = `<!--${"c".repeat(limits.maximumValueCodeUnits - 7)}-->`;
  assert.equal(exactComment.length, limits.maximumValueCodeUnits);
  assert.doesNotThrow(() =>
    extractText(htmlDocument({ beforeTitle: exactComment })),
  );
  assert.throws(
    () => extractText(htmlDocument({ beforeTitle: `${exactComment.slice(0, -3)}c-->` })),
    extractionError("RESOURCE_LIMIT"),
  );
  assert.doesNotThrow(() =>
    extractText(
      htmlDocument({ beforeTitle: "<!---->".repeat(limits.maximumComments) }),
    ),
  );
  assert.throws(
    () =>
      extractText(
        htmlDocument({ beforeTitle: "<!---->".repeat(limits.maximumComments + 1) }),
      ),
    extractionError("RESOURCE_LIMIT"),
  );

  assert.doesNotThrow(() =>
    extractText(
      htmlDocument({ title: `T${" ".repeat(limits.maximumRawTitleCodeUnits - 1)}` }),
    ),
  );
  assert.throws(
    () =>
      extractText(
        htmlDocument({ title: `T${" ".repeat(limits.maximumRawTitleCodeUnits)}` }),
      ),
    extractionError("RESOURCE_LIMIT"),
  );
  assert.doesNotThrow(() =>
    extractText(htmlDocument({ title: "t".repeat(limits.maximumTitleCodeUnits) })),
  );
  assert.throws(
    () =>
      extractText(htmlDocument({ title: "t".repeat(limits.maximumTitleCodeUnits + 1) })),
    extractionError("INVALID_TITLE"),
  );

  const canonicalTag = '<link rel="canonical" href="/same">';
  assert.equal(
    extractText(
      htmlDocument({
        afterTitle: canonicalTag.repeat(limits.maximumCanonicalDeclarations),
      }),
    ).report.metadataEvidence.canonical.status,
    "ambiguous",
  );
  assert.throws(
    () =>
      extractText(
        htmlDocument({
          afterTitle: canonicalTag.repeat(limits.maximumCanonicalDeclarations + 1),
        }),
      ),
    extractionError("RESOURCE_LIMIT"),
  );

  const identifierAtLimit = `f${"x".repeat(127)}`;
  assert.doesNotThrow(() =>
    extractText(htmlDocument(), { fixtureId: identifierAtLimit }),
  );
  assert.throws(
    () => extractText(htmlDocument(), { fixtureId: `${identifierAtLimit}x` }),
    extractionError("INVALID_FIXTURE_ID"),
  );
});

test("input preflight rejects accessors, inheritance, symbols, and non-owned byte views", () => {
  const validBytes = bytes(htmlDocument());
  const validInput = extractionInput(validBytes);

  let getterRead = false;
  const accessorInput = { ...validInput };
  Object.defineProperty(accessorInput, "observedUrl", {
    enumerable: true,
    get() {
      getterRead = true;
      return DEFAULT_OBSERVED_URL;
    },
  });
  assert.throws(
    () => extractSyntheticHtml(accessorInput),
    extractionError("INVALID_INPUT"),
  );
  assert.equal(getterRead, false);

  let wrapperProxyTrapRead = false;
  const proxiedInput = new Proxy(validInput, {
    getPrototypeOf() {
      wrapperProxyTrapRead = true;
      throw new Error("SENSITIVE-WRAPPER-PROXY-MARKER");
    },
  });
  assert.throws(
    () => extractSyntheticHtml(proxiedInput),
    (error) =>
      error instanceof HtmlExtractionError &&
      error.code === "INVALID_INPUT" &&
      !error.message.includes("SENSITIVE-WRAPPER-PROXY-MARKER"),
  );
  assert.equal(wrapperProxyTrapRead, false);

  const inherited = Object.assign(Object.create({ hostile: true }), validInput);
  assert.throws(
    () => extractSyntheticHtml(inherited),
    extractionError("INVALID_INPUT"),
  );
  assert.throws(
    () => extractSyntheticHtml({ ...validInput, unexpected: true }),
    extractionError("INVALID_INPUT"),
  );
  assert.throws(
    () => extractSyntheticHtml({ ...validInput, [Symbol("hostile")]: true }),
    extractionError("INVALID_INPUT"),
  );
  const missingField = { ...validInput };
  delete missingField.fixtureId;
  assert.throws(
    () => extractSyntheticHtml(missingField),
    extractionError("INVALID_INPUT"),
  );
  assert.throws(
    () =>
      extractSyntheticHtml({
        ...validInput,
        mediaType: "text/html",
      }),
    extractionError("INVALID_MEDIA_TYPE"),
  );
  assert.throws(
    () =>
      extractSyntheticHtml({
        ...validInput,
        fixtureId: "Invalid Fixture",
      }),
    extractionError("INVALID_FIXTURE_ID"),
  );
  assert.throws(
    () =>
      extractSyntheticHtml({
        ...validInput,
        observedUrl: "file:///SENSITIVE-OBSERVED-URL-MARKER",
      }),
    (error) =>
      error instanceof HtmlExtractionError &&
      error.code === "INVALID_OBSERVED_URL" &&
      !error.message.includes("SENSITIVE-OBSERVED-URL-MARKER"),
  );
  assert.throws(
    () =>
      extractSyntheticHtml({
        ...validInput,
        htmlBytes: new Uint8Array(),
      }),
    extractionError("RESOURCE_LIMIT"),
  );

  let byteGetterRead = false;
  const namedBytes = Uint8Array.from(validBytes);
  Object.defineProperty(namedBytes, "trap", {
    get() {
      byteGetterRead = true;
      return "hostile";
    },
  });
  assert.throws(
    () => extractSyntheticHtml(extractionInput(namedBytes)),
    extractionError("INVALID_BYTES"),
  );
  assert.equal(byteGetterRead, false);

  let byteProxyTrapRead = false;
  const proxiedBytes = new Proxy(Uint8Array.from(validBytes), {
    getPrototypeOf() {
      byteProxyTrapRead = true;
      throw new Error("SENSITIVE-BYTE-PROXY-MARKER");
    },
  });
  assert.throws(
    () => extractSyntheticHtml(extractionInput(proxiedBytes)),
    (error) =>
      error instanceof HtmlExtractionError &&
      error.code === "INVALID_BYTES" &&
      !error.message.includes("SENSITIVE-BYTE-PROXY-MARKER"),
  );
  assert.equal(byteProxyTrapRead, false);

  let bufferGetterRead = false;
  const decoratedBufferBytes = Uint8Array.from(validBytes);
  Object.defineProperty(decoratedBufferBytes.buffer, "resizable", {
    get() {
      bufferGetterRead = true;
      throw new Error("SENSITIVE-BUFFER-MARKER");
    },
  });
  assert.throws(
    () => extractSyntheticHtml(extractionInput(decoratedBufferBytes)),
    (error) =>
      error instanceof HtmlExtractionError &&
      error.code === "INVALID_BYTES" &&
      !error.message.includes("SENSITIVE-BUFFER-MARKER"),
  );
  assert.equal(bufferGetterRead, false);

  const symbolBytes = Uint8Array.from(validBytes);
  symbolBytes[Symbol("hostile")] = true;
  assert.throws(
    () => extractSyntheticHtml(extractionInput(symbolBytes)),
    extractionError("INVALID_BYTES"),
  );

  const backing = bytes(`x${htmlDocument()}`);
  assert.throws(
    () => extractSyntheticHtml(extractionInput(backing.subarray(1))),
    extractionError("INVALID_BYTES"),
  );

  class ByteSubclass extends Uint8Array {}
  assert.throws(
    () => extractSyntheticHtml(extractionInput(ByteSubclass.from(validBytes))),
    extractionError("INVALID_BYTES"),
  );
  assert.throws(
    () =>
      extractSyntheticHtml(
        extractionInput(Object.create(Uint8Array.prototype)),
      ),
    extractionError("INVALID_BYTES"),
  );

  const shared = new Uint8Array(new SharedArrayBuffer(validBytes.length));
  shared.set(validBytes);
  assert.throws(
    () => extractSyntheticHtml(extractionInput(shared)),
    extractionError("INVALID_BYTES"),
  );

  const resizable = new Uint8Array(
    new ArrayBuffer(validBytes.length, { maxByteLength: validBytes.length + 1 }),
  );
  resizable.set(validBytes);
  assert.throws(
    () => extractSyntheticHtml(extractionInput(resizable)),
    extractionError("INVALID_BYTES"),
  );

  const nullPrototypeInput = Object.assign(Object.create(null), validInput);
  assert.doesNotThrow(() => extractSyntheticHtml(nullPrototypeInput));
});

test("fingerprints cover exact bytes, including line endings and ignored metadata", () => {
  const base = htmlDocument({
    afterTitle: '<meta name="description" content="one">',
  });
  const variants = [
    base,
    `${base} `,
    base.replaceAll("><", ">\r\n<"),
    base.replace('content="one"', 'content="two"'),
  ];
  const fingerprints = variants.map(
    (variant) => extractText(variant).report.sourceProjection.contentFingerprint,
  );
  assert.equal(new Set(fingerprints).size, variants.length);

  const mutable = bytes(base);
  const beforeMutation = extractSyntheticHtml(extractionInput(mutable));
  mutable[mutable.length - 1] ^= 1;
  assert.equal(
    beforeMutation.report.sourceProjection.contentFingerprint,
    fingerprints[0],
  );
});
