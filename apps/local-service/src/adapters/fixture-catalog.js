import { RELATED_SOURCE_FIXTURES } from "../../../../spikes/topic-resolution/browser/fixtures/related-source-fixtures.js";

export const SYNTHETIC_SOURCES = RELATED_SOURCE_FIXTURES;

export const SYNTHETIC_TOPIC_SEEDS = Object.freeze([
  Object.freeze({ id: "harbor-s2", title: "Harbor S2 sensor", kind: "product" }),
  Object.freeze({ id: "harbor-s3", title: "Harbor S3 sensor", kind: "product" }),
  Object.freeze({ id: "seedlings", title: "Starting community-garden seedlings", kind: "general" }),
]);

export const FIXTURE_PROVENANCE = "project-created-hand-authored-demo/1";
