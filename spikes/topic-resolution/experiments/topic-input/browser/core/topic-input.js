import { PAGE_CONTENT_LIMITS, pageContentInputGroup } from "./page-content-policy.js";

// A semantic-input policy, not an instruction to E5 or a stance/event extractor.
export function buildTopicInput({ title, text, extractorVersion }) {
  const group = pageContentInputGroup(extractorVersion);
  if (!group || typeof title !== "string" || title.length > PAGE_CONTENT_LIMITS.title ||
      typeof text !== "string" || !text.trim() || text.length > PAGE_CONTENT_LIMITS.text) {
    throw new TypeError("Invalid topic input");
  }
  if (group === "legacy-prefix/v1") return text;
  const heading = title.replace(/\s+/gu, " ").trim();
  let lead = text.replace(/\s+/gu, " ").trim();
  // Readers often include the exact heading at the start of article text.
  // Remove only that exact duplicate at a whitespace/end boundary; preserve
  // negation, stance and all other wording unchanged.
  if (heading && lead.startsWith(heading) &&
      (lead.length === heading.length || lead[heading.length] === " ")) {
    lead = lead.slice(heading.length).trimStart();
  }
  return (heading ? heading + (lead ? "\n" + lead : "") : lead).slice(0, PAGE_CONTENT_LIMITS.text);
}
