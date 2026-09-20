import assert from "node:assert/strict";
import test from "node:test";

import {
  createTopicResolver,
  normalizePublicHttpUrl,
  ResolutionError,
} from "../src/index.js";

const FINGERPRINT = `sha256:${"a".repeat(64)}`;

function syntheticEvidence(fixtureId) {
  return { kind: "synthetic-fixture", fixtureId };
}

test("deep unsupported structures are rejected without traversal or state mutation", () => {
  let getterRead = false;
  const terminal = {};
  Object.defineProperty(terminal, "trap", {
    enumerable: true,
    get() {
      getterRead = true;
      throw new Error("deep input must not be evaluated");
    },
  });

  let nested = terminal;
  for (let depth = 0; depth < 512; depth += 1) {
    nested = depth % 2 === 0 ? { next: nested } : [nested];
  }
  const cyclicTail = { nested };
  cyclicTail.self = cyclicTail;

  const clock = () => new Date("2026-09-20T00:00:00.000Z");
  const resolver = createTopicResolver({ clock });
  assert.throws(
    () =>
      resolver.resolve({
        url: "https://example.com/story",
        contentFingerprint: FINGERPRINT,
        fingerprintEvidence: {
          ...syntheticEvidence("deep-hostile-input"),
          unsupported: cyclicTail,
        },
      }),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );
  assert.equal(getterRead, false);

  const validObservation = {
    url: "https://example.com/story",
    contentFingerprint: FINGERPRINT,
    fingerprintEvidence: syntheticEvidence("valid-after-deep-rejection"),
  };
  const valid = resolver.resolve(validObservation);
  const pristine = createTopicResolver({ clock }).resolve(validObservation);
  assert.deepEqual(valid, pristine);
  assert.equal(valid.source.canonicalUrl, "https://example.com/story");
  assert.equal(valid.source.contentFingerprint, FINGERPRINT);
});

test("mixed Unicode and percent representations remain deterministic and conservative", () => {
  const composedLiteral = normalizePublicHttpUrl("https://example.com/café");
  const composedEncoded = normalizePublicHttpUrl("https://example.com/caf%C3%A9");
  const decomposed = normalizePublicHttpUrl("https://example.com/cafe\u0301");

  assert.equal(composedLiteral, composedEncoded);
  assert.notEqual(decomposed, composedEncoded);

  const representations = ["%C0", "%EF%BF%BD", "%2F", "%252F"].map((value) =>
    normalizePublicHttpUrl(`https://example.com/story?q=${value}`),
  );
  assert.equal(new Set(representations).size, representations.length);

  for (const normalized of [composedLiteral, composedEncoded, decomposed, ...representations]) {
    assert.equal(normalizePublicHttpUrl(normalized), normalized);
  }
});

test("declared input limits accept the boundary and reject the next unit", () => {
  const baseUrl = "https://example.com/";
  const exactUrl = `${baseUrl}${"a".repeat(8_192 - Buffer.byteLength(baseUrl))}`;
  assert.equal(Buffer.byteLength(exactUrl), 8_192);
  assert.equal(normalizePublicHttpUrl(exactUrl), exactUrl);
  assert.throws(
    () => normalizePublicHttpUrl(`${exactUrl}a`),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );

  const multibyteOverLimit = `${baseUrl}${"é".repeat(
    Math.floor((8_192 - Buffer.byteLength(baseUrl)) / 2) + 1,
  )}`;
  assert.ok(multibyteOverLimit.length < 8_192);
  assert.ok(Buffer.byteLength(multibyteOverLimit) > 8_192);
  assert.throws(
    () => normalizePublicHttpUrl(multibyteOverLimit),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );

  const expandsDuringNormalization = `${baseUrl}${"a".repeat(
    8_192 - Buffer.byteLength(baseUrl) - 2,
  )}é`;
  assert.equal(Buffer.byteLength(expandsDuringNormalization), 8_192);
  assert.throws(
    () => normalizePublicHttpUrl(expandsDuringNormalization),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );

  const oneHundredSegments = Array.from({ length: 100 }, (_, index) => `p${index}=1`).join(
    "&",
  );
  assert.doesNotThrow(() => normalizePublicHttpUrl(`${baseUrl}?${oneHundredSegments}`));
  assert.throws(
    () => normalizePublicHttpUrl(`${baseUrl}?${oneHundredSegments}&overflow=1`),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );

  const titleBoundary = createTopicResolver().resolve({
    url: "https://example.com/title-boundary",
    title: "t".repeat(512),
  });
  assert.equal(titleBoundary.source.title.length, 512);
  assert.throws(
    () =>
      createTopicResolver().resolve({
        url: "https://example.com/title-overflow",
        title: "t".repeat(513),
      }),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );

  const evidenceBoundary = createTopicResolver().resolve({
    url: "https://example.com/evidence-boundary",
    contentFingerprint: FINGERPRINT,
    fingerprintEvidence: syntheticEvidence(`f${"x".repeat(127)}`),
  });
  assert.equal(evidenceBoundary.source.fingerprintEvidence.fixtureId.length, 128);
  assert.throws(
    () =>
      createTopicResolver().resolve({
        url: "https://example.com/evidence-overflow",
        contentFingerprint: FINGERPRINT,
        fingerprintEvidence: syntheticEvidence(`f${"x".repeat(128)}`),
      }),
    (error) =>
      error instanceof ResolutionError && error.code === "INVALID_FINGERPRINT_EVIDENCE",
  );
});

test("generated URL matrix preserves determinism, idempotence, and security origins", () => {
  const schemes = ["http", "https"];
  const hosts = [
    "example.com",
    "news.example.com",
    "xn--xample-9ua.com",
    "[2606:4700:4700::1111]",
  ];
  const portKinds = ["implicit", "explicit-default", "non-default"];
  const paths = ["/story", "/%7eauthor", "/caf%C3%A9", "/a%2fb"];
  const searches = [
    "",
    "?id=42&utm_source=test",
    "?action=preview&action=delete",
    "?q=caf%C3%A9&next=%2farchive",
  ];
  const fragments = ["", "#discussion"];
  const originByNormalizedUrl = new Map();
  let cases = 0;

  for (const scheme of schemes) {
    for (const host of hosts) {
      for (const portKind of portKinds) {
        const port =
          portKind === "implicit"
            ? ""
            : portKind === "explicit-default"
              ? `:${scheme === "https" ? "443" : "80"}`
              : `:${scheme === "https" ? "8443" : "8080"}`;

        for (const path of paths) {
          for (const search of searches) {
            for (const fragment of fragments) {
              const input = `${scheme}://${host}${port}${path}${search}${fragment}`;
              const inputOrigin = new URL(input).origin;
              const first = normalizePublicHttpUrl(input);
              const second = normalizePublicHttpUrl(input);

              assert.equal(second, first, input);
              assert.equal(normalizePublicHttpUrl(first), first, input);
              assert.equal(new URL(first).origin, inputOrigin, input);
              assert.equal(new URL(first).hash, "", input);

              const priorOrigin = originByNormalizedUrl.get(first);
              if (priorOrigin !== undefined) {
                assert.equal(priorOrigin, inputOrigin, input);
              } else {
                originByNormalizedUrl.set(first, inputOrigin);
              }
              cases += 1;
            }
          }
        }
      }
    }
  }

  assert.equal(cases, 768);
});
