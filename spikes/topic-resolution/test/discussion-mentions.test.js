import test from "node:test";
import assert from "node:assert/strict";
import { hasAiMention } from "../browser/core/discussion-mentions.js";

test("standalone case-insensitive AI handles invoke once on a submitted message", () => {
  for (const body of ["@AI, what is the biggest drawback?", "@ai: compare these", "Hello @Ai help", "@ai", "@AI.\nPlease help", "@AI @ai", "I don't understand @AI, what's wrong?"]) {
    assert.equal(hasAiMention(body), true, body);
  }
});
test("human/future bot handles, quotes, code, emails, URLs and escaped examples stay inert", () => {
  for (const body of ["@Alex hello", "@ai_shopper find me a deal", "@ai2 hello", "mail@ai.com", "@ai.com",
    "https://example.org/@ai", "\\@AI help", "> @AI, example", "`@AI, example`", "```\n@AI help\n```",
    "~~~\n@AI help\n~~~", '"@AI, example"', '"Example @AI help"',
    'Please read: "Hey @AI help"', "'Hello @AI help'", "“An @AI example”", "‘An @AI example’",
    '"Example\n@AI help\nquoted"', "'Example\n@AI help\nquoted'",
    "``some @AI help``", "[Example @AI help](https://example.com/)", null]) assert.equal(hasAiMention(body), false, body);
  assert.equal(hasAiMention("> quoted example\n@AI help"), true);
});
