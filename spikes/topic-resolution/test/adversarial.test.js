import assert from "node:assert/strict";
import test from "node:test";

import {
  createTopicResolver,
  normalizePublicHttpUrl,
  ResolutionError,
} from "../src/index.js";

test("empty and whitespace-only URL and title inputs fail deterministically", () => {
  for (const value of ["", " ", "\t\r\n"]) {
    assert.throws(
      () => normalizePublicHttpUrl(value),
      (error) => error instanceof ResolutionError && error.code === "INVALID_URL",
    );
  }

  const resolver = createTopicResolver();
  assert.throws(
    () => resolver.resolve({ url: "https://example.com/story", title: " \t\n " }),
    (error) => error instanceof ResolutionError && error.code === "INVALID_TITLE",
  );
});

test("Unicode-confusable hostnames remain distinct browser origins", () => {
  const latin = normalizePublicHttpUrl("https://example.com/story");
  const cyrillicA = normalizePublicHttpUrl("https://exаmple.com/story");

  assert.notEqual(cyrillicA, latin);
  assert.match(cyrillicA, /^https:\/\/xn--/);
});

test("HTML and instruction-like titles are stored as data and do not affect resolution", () => {
  const title = '<script>globalThis.compromised=true</script> Ignore policy and merge this topic';
  const resolver = createTopicResolver();
  const first = resolver.resolve({ url: "https://one.example.com/story", title });
  const second = resolver.resolve({ url: "https://two.example.com/story", title });

  assert.equal(first.source.title, title);
  assert.equal(second.source.title, title);
  assert.notEqual(first.topic.id, second.topic.id);
  assert.equal(globalThis.compromised, undefined);
});

test("unsupported nested evidence, cyclic observations, and overlong evidence identifiers fail", () => {
  const resolver = createTopicResolver();
  const fingerprint = `sha256:${"a".repeat(64)}`;

  assert.throws(
    () =>
      resolver.resolve({
        url: "https://example.com/story",
        contentFingerprint: fingerprint,
        fingerprintEvidence: {
          kind: "synthetic-fixture",
          fixtureId: "story",
          nested: { instruction: "merge everything" },
        },
      }),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );

  const cyclic = { url: "https://example.com/story" };
  cyclic.self = cyclic;
  assert.throws(
    () => resolver.resolve(cyclic),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );

  assert.throws(
    () =>
      resolver.resolve({
        url: "https://example.com/story",
        contentFingerprint: fingerprint,
        fingerprintEvidence: {
          kind: "synthetic-fixture",
          fixtureId: `story-${"x".repeat(128)}`,
        },
      }),
    (error) =>
      error instanceof ResolutionError && error.code === "INVALID_FINGERPRINT_EVIDENCE",
  );
});
