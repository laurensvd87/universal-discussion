import assert from "node:assert/strict";
import test from "node:test";
import { buildTopicInput } from "../browser/core/topic-input.js";
import { pageContentInputGroup } from "../browser/core/page-content-policy.js";

test("legacy and title-lead policies form separate explicit compatibility groups", () => {
  for (const tag of ["main-text-prefix/v1", "article-container-prefix/v1"]) {
    assert.equal(pageContentInputGroup(tag), "legacy-prefix/v1");
    assert.equal(buildTopicInput({ title: "Heading", text: " Raw\n prefix ", extractorVersion: tag }), " Raw\n prefix ");
  }
  for (const tag of ["article-title-lead/v1", "container-title-lead/v1"]) {
    assert.equal(pageContentInputGroup(tag), "title-lead/v1");
    assert.equal(buildTopicInput({ title: "Heading", text: " Lead\n text ", extractorVersion: tag }), "Heading\nLead text");
  }
  assert.equal(pageContentInputGroup("article-title-lead/v2"), null);
});

test("title occurs once while exact duplicate removal preserves stance and word boundaries", () => {
  const input = (title, text) => buildTopicInput({ title, text, extractorVersion: "article-title-lead/v1" });
  assert.equal(input("  No ban\n now ", "No ban now No ban now is disputed"), "No ban now\nNo ban now is disputed");
  assert.equal(input("Ban", "Banana is not prohibited"), "Ban\nBanana is not prohibited");
  assert.equal(input("Disputed claim", "Disputed claim"), "Disputed claim");
  assert.equal(input("", "No evidence supports it"), "No evidence supports it");
});

test("combined input preserves one 4096 character budget and bounded title", () => {
  const result = buildTopicInput({ title: "t".repeat(200), text: "p".repeat(4096), extractorVersion: "container-title-lead/v1" });
  assert.equal(result.length, 4096); assert.equal(result, "t".repeat(200) + "\n" + "p".repeat(3895));
  for (const patch of [{ title: "t".repeat(201) }, { text: "x".repeat(4097) }, { text: " " },
    { text: null }, { extractorVersion: "future" }]) {
    assert.throws(() => buildTopicInput({ title: "Title", text: "Lead", extractorVersion: "article-title-lead/v1", ...patch }));
  }
});
