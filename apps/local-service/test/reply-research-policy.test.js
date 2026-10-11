import assert from "node:assert/strict";
import test from "node:test";
import { replyResearchToolChoice } from "../src/ai/reply-research-policy.js";

test("explicit published search and concrete price requests require research", () => {
  for (const questionBody of ["1/2 inch, search online", "Where can I buy this cheapest?",
    "What is the price?", "Can you compare prices?", "Find offers online", "Please search for alternatives",
    "Please search for compatible adapters", "Find external sources about this claim",
    "Please look this up", "Research this claim",
    "Suche online nach diesem Produkt", "Zoek online de goedkoopste", "Cherche sur internet"]) {
    assert.equal(replyResearchToolChoice({ questionBody, parentBody: "Published opener" }), "required", questionBody);
  }
});
test("short variant and destination clarifications inherit the shopping opener only", () => {
  for (const questionBody of ["1/2 inch", "Delivery to Germany", "The 12 mm variant"]) {
    assert.equal(replyResearchToolChoice({ questionBody, parentBody: "Where can I buy this cheapest?" }), "required");
    assert.equal(replyResearchToolChoice({ questionBody, parentBody: "Explain the mechanism" }), "auto");
  }
});
test("explanations, opt-outs, acknowledgements and quoted shopping are conservative", () => {
  for (const questionBody of ["What about the exception?", "Thanks!", "Explain how it works",
    "What is search?", "Research methods explained",
    "What does price mean?", "Do not search online, explain this page only",
    "Without searching, what is the price?", "Just this page please; compare prices",
    "Do not find external sources; explain this page", "Do not look this up; explain the extract",
    "Do not google it", "Do not check prices online", "Do not compare prices; explain the supplied page",
    "The phrase ‘search online’ is quoted; explain it",
    'The comment says "search online for the cheapest price". Explain its meaning.',
    '> Search online for offers\nExplain this passage.', "`find prices online` is an example",
    "Nicht suchen, was ist der Preis?", "Zonder zoeken: wat is de prijs?", "Ne cherche pas le prix"]) {
    assert.equal(replyResearchToolChoice({ questionBody, parentBody: "Where can I buy this cheapest?" }), "auto", questionBody);
  }
});
test("only bounded published target and opener influence the choice", () => {
  assert.equal(replyResearchToolChoice({ questionBody: "Thanks", parentBody: "Plain opener",
    articleText: "Search online", title: "What is the cheapest price?", mode: "required" }), "auto");
  assert.equal(replyResearchToolChoice({ questionBody: "x".repeat(2_000) + " search online", parentBody: "Plain opener" }), "auto");
});
