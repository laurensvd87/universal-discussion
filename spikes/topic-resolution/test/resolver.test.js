import assert from "node:assert/strict";
import test from "node:test";

import {
  createTopicResolver,
  RESOLUTION_METHOD,
  RESOLVER_VERSION,
  ResolutionError,
} from "../src/index.js";
import { FINGERPRINTS, FIXED_TIME, OBSERVATIONS } from "../fixtures/observations.js";

function fixedClock() {
  return new Date(FIXED_TIME);
}

function fingerprintEvidence(fixtureId) {
  return { kind: "synthetic-fixture", fixtureId };
}

test("URL variants resolve to one Source and retain no tracking URL", () => {
  const resolver = createTopicResolver({ clock: fixedClock });
  const first = resolver.resolve({
    url: "https://example.com/story?id=42&utm_campaign=launch#discussion",
    title: "Story",
  });
  const second = resolver.resolve({
    url: "HTTPS://EXAMPLE.COM:443/story?fbclid=tracking&id=42",
    title: "Story",
  });

  assert.equal(first.source.id, second.source.id);
  assert.equal(first.source.canonicalUrl, "https://example.com/story?id=42");
  assert.equal(first.topic.id, second.topic.id);
  assert.equal(first.sourceTopicLink.id, second.sourceTopicLink.id);
  assert.doesNotMatch(JSON.stringify(first), /launch|tracking|utm_campaign|fbclid|#discussion/);
});

test("different Sources with an exact fingerprint share one Topic and Discussion", () => {
  const resolver = createTopicResolver({ clock: fixedClock });
  const wire = resolver.resolve(OBSERVATIONS.wireStory);
  const company = resolver.resolve(OBSERVATIONS.companyStory);

  assert.notEqual(wire.source.id, company.source.id);
  assert.equal(wire.topic.id, company.topic.id);
  assert.equal(wire.discussion.id, company.discussion.id);
  assert.equal(wire.discussion.topicId, wire.topic.id);
  assert.equal(company.discussion.topicId, company.topic.id);
  assert.notEqual(wire.sourceTopicLink.id, company.sourceTopicLink.id);
  assert.equal(wire.sourceTopicLink.resolutionMethod, RESOLUTION_METHOD.EXACT_CONTENT_FINGERPRINT);
  assert.equal(wire.sourceTopicLink.confidence, 1);
  assert.equal(wire.sourceTopicLink.resolverVersion, RESOLVER_VERSION);
  assert.equal(wire.sourceTopicLink.auditedAt, FIXED_TIME);
  assert.equal(wire.topic.status, "active");
});

test("a repeated observation may omit a previously recorded fingerprint", () => {
  const resolver = createTopicResolver({ clock: fixedClock });
  const first = resolver.resolve(OBSERVATIONS.wireStory);
  const repeated = resolver.resolve({
    url: OBSERVATIONS.wireStory.url,
    title: OBSERVATIONS.wireStory.title,
  });

  assert.equal(repeated.source.id, first.source.id);
  assert.equal(repeated.topic.id, first.topic.id);
  assert.equal(repeated.source.contentFingerprint, FINGERPRINTS.ANNOUNCEMENT);
});

test("a conflicting source fingerprint fails without mutating prior resolution state", () => {
  const resolver = createTopicResolver({ clock: fixedClock });
  const first = resolver.resolve(OBSERVATIONS.wireStory);

  assert.throws(
    () =>
      resolver.resolve({
        ...OBSERVATIONS.wireStory,
        contentFingerprint: FINGERPRINTS.DIFFERENT_STORY,
        fingerprintEvidence: fingerprintEvidence("conflicting-wire-story"),
      }),
    (error) =>
      error instanceof ResolutionError && error.code === "SOURCE_FINGERPRINT_CONFLICT",
  );

  const afterConflict = resolver.resolve(OBSERVATIONS.wireStory);
  assert.deepEqual(afterConflict, first);
});

test("ambiguous equal titles do not merge and use provisional fallback", () => {
  const resolver = createTopicResolver({ clock: fixedClock });
  const first = resolver.resolve(OBSERVATIONS.ambiguousTitleOne);
  const second = resolver.resolve(OBSERVATIONS.ambiguousTitleTwo);

  assert.notEqual(first.source.id, second.source.id);
  assert.notEqual(first.topic.id, second.topic.id);
  assert.notEqual(first.discussion.id, second.discussion.id);
  assert.equal(first.topic.status, "provisional");
  assert.equal(
    first.sourceTopicLink.resolutionMethod,
    RESOLUTION_METHOD.PROVISIONAL_URL_FALLBACK,
  );
  assert.equal(first.sourceTopicLink.confidence, 0);
});

test("equal titles with different exact fingerprints do not merge", () => {
  const resolver = createTopicResolver({ clock: fixedClock });
  const first = resolver.resolve({
    url: "https://one.example.com/current",
    title: "Breaking news",
    contentFingerprint: FINGERPRINTS.DIFFERENT_STORY,
    fingerprintEvidence: fingerprintEvidence("different-story"),
  });
  const second = resolver.resolve({
    url: "https://two.example.com/current",
    title: "Breaking news",
    contentFingerprint: FINGERPRINTS.SAME_TITLE_OTHER_STORY,
    fingerprintEvidence: fingerprintEvidence("same-title-other-story"),
  });

  assert.notEqual(first.topic.id, second.topic.id);
  assert.notEqual(first.discussion.id, second.discussion.id);
});

test("public counts separate humans and AI and exclude private or removed AI", () => {
  const selector = { contentFingerprint: FINGERPRINTS.ANNOUNCEMENT };
  const resolver = createTopicResolver({
    clock: fixedClock,
    activityRecords: [
      { ...selector, authorType: "human", visibility: "public", moderationState: "visible" },
      { ...selector, authorType: "human", visibility: "public", moderationState: "visible" },
      { ...selector, authorType: "agent", visibility: "public", moderationState: "visible" },
      { ...selector, authorType: "agent", visibility: "private", moderationState: "visible" },
      { ...selector, authorType: "agent", visibility: "public", moderationState: "removed" },
      { ...selector, authorType: "human", visibility: "private", moderationState: "visible" },
    ],
  });

  const result = resolver.resolve(OBSERVATIONS.wireStory);
  assert.deepEqual(result.publicActivity, {
    humanContributions: 2,
    aiContributions: 1,
    totalContributions: 3,
  });
});

test("observation and activity contracts reject raw content fields instead of storing them", () => {
  const resolver = createTopicResolver({ clock: fixedClock });

  assert.throws(
    () => resolver.resolve({ ...OBSERVATIONS.wireStory, rawBody: "private page contents" }),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );
  assert.throws(
    () =>
      createTopicResolver({
        activityRecords: [
          {
            contentFingerprint: FINGERPRINTS.ANNOUNCEMENT,
            authorType: "agent",
            visibility: "private",
            moderationState: "visible",
            output: "private AI output",
          },
        ],
      }),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );
});

test("resolution entities and provenance are immutable", () => {
  const result = createTopicResolver({ clock: fixedClock }).resolve(OBSERVATIONS.wireStory);

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.source));
  assert.ok(Object.isFrozen(result.topic));
  assert.ok(Object.isFrozen(result.discussion));
  assert.ok(Object.isFrozen(result.sourceTopicLink));
  assert.equal(result.source.createdAt, FIXED_TIME);
  assert.equal(result.topic.createdAt, FIXED_TIME);
  assert.equal(result.discussion.createdAt, FIXED_TIME);
  assert.deepEqual(result.sourceTopicLink.evidence, {
    fingerprintAlgorithm: "sha256",
    fingerprintEvidence: fingerprintEvidence("wire-story"),
    kind: "exact-content-fingerprint",
  });
});

test("exact fingerprints require explicit synthetic fixture evidence", () => {
  const resolver = createTopicResolver({ clock: fixedClock });

  assert.throws(
    () =>
      resolver.resolve({
        url: "https://example.com/story",
        contentFingerprint: FINGERPRINTS.ANNOUNCEMENT,
      }),
    (error) => error instanceof ResolutionError && error.code === "MISSING_FINGERPRINT_EVIDENCE",
  );
  assert.throws(
    () =>
      resolver.resolve({
        url: "https://example.com/story",
        contentFingerprint: FINGERPRINTS.ANNOUNCEMENT,
        fingerprintEvidence: { kind: "client-assertion", fixtureId: "story" },
      }),
    (error) =>
      error instanceof ResolutionError && error.code === "INVALID_FINGERPRINT_EVIDENCE",
  );
});

test("strict inputs reject inherited, hidden, accessor, and symbol fields", () => {
  const resolver = createTopicResolver({ clock: fixedClock });
  const inherited = Object.create({
    url: "https://example.com/story",
    rawBody: "must not be inherited",
  });
  assert.throws(
    () => resolver.resolve(inherited),
    (error) => error instanceof ResolutionError && error.code === "INVALID_INPUT",
  );

  const hidden = { url: "https://example.com/story" };
  Object.defineProperty(hidden, "rawBody", { value: "must not be hidden" });
  assert.throws(
    () => resolver.resolve(hidden),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );

  const accessor = {};
  Object.defineProperty(accessor, "url", { enumerable: true, get: () => "https://example.com" });
  assert.throws(
    () => resolver.resolve(accessor),
    (error) => error instanceof ResolutionError && error.code === "INVALID_INPUT",
  );

  assert.throws(
    () => resolver.resolve({ url: "https://example.com/story", [Symbol("rawBody")]: "hidden" }),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );
});

test("bounds fixture activity records", () => {
  const record = {
    url: "https://example.com/story",
    authorType: "human",
    visibility: "public",
    moderationState: "visible",
  };

  assert.throws(
    () => createTopicResolver({ activityRecords: Array.from({ length: 1_001 }, () => record) }),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );
});

test("rejects URL-scoped activity that could detach from a fingerprint topic", () => {
  assert.throws(
    () =>
      createTopicResolver({
        activityRecords: [
          {
            url: "https://example.com/story",
            authorType: "human",
            visibility: "public",
            moderationState: "visible",
          },
        ],
      }),
    (error) => error instanceof ResolutionError && error.code === "UNSUPPORTED_FIELD",
  );
});

test("rejects oversized raw titles before whitespace normalization", () => {
  const resolver = createTopicResolver({ clock: fixedClock });

  assert.throws(
    () =>
      resolver.resolve({
        url: "https://example.com/story",
        title: " ".repeat(513),
      }),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );
});

test("rejects oversized fingerprints before case normalization", () => {
  const resolver = createTopicResolver({ clock: fixedClock });

  assert.throws(
    () =>
      resolver.resolve({
        url: "https://example.com/story",
        contentFingerprint: `sha256:${"a".repeat(10_000)}`,
        fingerprintEvidence: fingerprintEvidence("oversized-fingerprint"),
      }),
    (error) => error instanceof ResolutionError && error.code === "INVALID_FINGERPRINT",
  );
});
