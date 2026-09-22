export const FINGERPRINTS = Object.freeze({
  ACTIVE_TAB_DEMO: `sha256:${"d".repeat(64)}`,
  ANNOUNCEMENT: `sha256:${"a".repeat(64)}`,
  DIFFERENT_STORY: `sha256:${"b".repeat(64)}`,
  SAME_TITLE_OTHER_STORY: `sha256:${"c".repeat(64)}`,
});

export const FIXED_TIME = "2026-09-19T10:15:30.000Z";

export const OBSERVATIONS = Object.freeze({
  activeTabExampleCom: Object.freeze({
    url: "https://example.com/",
    title: "Reserved-domain demonstration A",
    contentFingerprint: FINGERPRINTS.ACTIVE_TAB_DEMO,
    fingerprintEvidence: Object.freeze({
      kind: "synthetic-fixture",
      fixtureId: "active-tab-example-com",
    }),
  }),
  activeTabExampleOrg: Object.freeze({
    url: "https://example.org/",
    title: "Reserved-domain demonstration B",
    contentFingerprint: FINGERPRINTS.ACTIVE_TAB_DEMO,
    fingerprintEvidence: Object.freeze({
      kind: "synthetic-fixture",
      fixtureId: "active-tab-example-org",
    }),
  }),
  wireStory: Object.freeze({
    url: "https://news.example.com/releases/widget-2",
    title: "Acme announces Widget 2",
    contentFingerprint: FINGERPRINTS.ANNOUNCEMENT,
    fingerprintEvidence: Object.freeze({
      kind: "synthetic-fixture",
      fixtureId: "wire-story",
    }),
  }),
  companyStory: Object.freeze({
    url: "https://news.acme.example.com/widget-2?utm_source=press-list#details",
    title: "Acme announces Widget 2",
    contentFingerprint: FINGERPRINTS.ANNOUNCEMENT,
    fingerprintEvidence: Object.freeze({
      kind: "synthetic-fixture",
      fixtureId: "company-story",
    }),
  }),
  hostileTitle: Object.freeze({
    url: "https://hostile.example.com/widget-2",
    title: "<img src=x onerror=alert(1)> remains inert fixture text",
    contentFingerprint: FINGERPRINTS.ANNOUNCEMENT,
    fingerprintEvidence: Object.freeze({
      kind: "synthetic-fixture",
      fixtureId: "hostile-title",
    }),
  }),
  ambiguousTitleOne: Object.freeze({
    url: "https://one.example.com/story/shared-title",
    title: "A shared but ambiguous title",
  }),
  ambiguousTitleTwo: Object.freeze({
    url: "https://two.example.com/story/shared-title",
    title: "A shared but ambiguous title",
  }),
});
