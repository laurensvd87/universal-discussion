# ADR-047: Metadata-only LLM triage for the R5 pilot

Date: 2026-10-06
Status: owner-directed exploratory triage; no automatic or human-gold labels

## Decision and scope

The owner rated the frozen task's `review-item-001` as `different-topic` and
objected to being asked an obvious case: the assistant can judge such examples
too. Interpret this as permission to use the present coding assistant to
**suggest** labels for the remaining six-source pilot pairs from their approved
public titles and dates. Do not require the owner to answer obvious pairs one
by one. This does not authorize a new app/provider integration, automatic
extension egress, raw article text in model context, or AI-generated human
review events.

The owner answer is recorded as `owner` and the assistant's suggestions as
`llm-title-triage` in separate Git-ignored local files, both bound to the
frozen task digest. For the 14 unreviewed pairs, the title-only triage proposed
eight `different-topic`, two `same-topic`, and four `uncertain`. These are
not gold labels, an independent second review, or a completed R5 corpus.
The model had seen some pilot cosine values in earlier work, so the triage
cannot be called blind. No page body was sent to the model for this step.

## Use and limits

Use obvious suggestions only to speed local PoC inspection. Leave ambiguous
pairs uncertain unless the owner supplies a product-granularity decision or
later evidence resolves them. Do not fold LLM suggestions into owner answers,
claim threshold accuracy, change live Topic routing, or activate AUTO from
this exercise. Human feedback from actual browsing and discussions remains
the practical next quality signal. The full 200–250-pair scale-up and all
provider/privacy/security/store gates remain separate.
