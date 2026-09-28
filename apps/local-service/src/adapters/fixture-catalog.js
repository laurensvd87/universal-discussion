import { RELATED_SOURCE_FIXTURES } from "../../../../spikes/topic-resolution/browser/fixtures/related-source-fixtures.js";

export const FIXTURE_PROVENANCE = "project-created-hand-authored-demo/1";

export const BRIDGE_PROVENANCE = "project-created-reserved-domain-bridge/1";

export const SYNTHETIC_SOURCES = Object.freeze([
  ...RELATED_SOURCE_FIXTURES.map((source) => Object.freeze({
    ...source,
    provenance: FIXTURE_PROVENANCE,
  })),
  Object.freeze({
    id: "reserved-example-com", url: "https://example.com/",
    title: "Reserved-domain demonstration A", topicId: "reserved-domain-demo",
    embedding: null, provenance: BRIDGE_PROVENANCE,
  }),
  Object.freeze({
    id: "reserved-example-org", url: "https://example.org/",
    title: "Reserved-domain demonstration B", topicId: "reserved-domain-demo",
    embedding: null, provenance: BRIDGE_PROVENANCE,
  }),
]);

export const SYNTHETIC_TOPIC_SEEDS = Object.freeze([
  Object.freeze({ id: "harbor-s2", title: "Harbor S2 sensor", kind: "product" }),
  Object.freeze({ id: "harbor-s3", title: "Harbor S3 sensor", kind: "product" }),
  Object.freeze({ id: "seedlings", title: "Starting community-garden seedlings", kind: "general" }),
  Object.freeze({ id: "reserved-domain-demo", title: "Reserved-domain demonstration", kind: "general" }),
]);
