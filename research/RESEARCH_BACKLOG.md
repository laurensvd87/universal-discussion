# Research Backlog

Research current information at the time work is performed. Cite sources in research notes.

Priorities reset on 2026-09-28 by ADR-014. Start from the completed findings in
`PRODUCT_RESET_2026-09-27.md` and `PRODUCT_RESET_POLICY_2026-09-27.md` rather than
repeating broad research. Next: exact general-context boundary and one small
licensed local embedding candidate; then provider-specific connector feasibility,
launch audience/territories and operations. Deferred research is not a blocker
for the R1 fixture discussion loop.

## Market
- Current universal web-comment/annotation competitors and adoption.
- Historical attempts (e.g. universal annotation/comment systems) and failure modes.
- Adjacent products: annotation, Reddit/Hacker News discussion discovery, browser social layers, AI browser assistants.
- Differentiation of semantic-topic discussions + human/agent participation.

## Semantic clustering
- Current embedding providers/models and costs.
- Open-source/local embedding options.
- pgvector vs specialized vector stores at expected early scale.
- multilingual clustering.
- news/event clustering vs persistent entity/product discussions.
- evaluation metrics and confidence thresholds.
- canonicalization/content fingerprint strategies.

## AI providers
- Current OpenAI/Anthropic/Google/etc API authentication and pricing.
- Whether consumer subscriptions can be used by third-party apps; never assume this.
- OAuth/delegated access availability.
- BYO-key security recommendations and provider terms.

## Platform support
- Current Chrome/Edge/Firefox/Safari extension APIs and store rules.
- Android browser extension support and overlay/share mechanisms.
- iOS Safari extension/share/action capabilities and restrictions.
- Store policies around overlays, browsing data and AI-generated content.

## Legal/privacy
- GDPR implications of URL/content processing and user browsing metadata.
- Controller/processor roles.
- retention/deletion/export requirements.
- public comments, moderation, notice/takedown and applicable EU/German legal considerations.
- publisher concerns around third-party overlays.

## Hosting/business
- cheapest credible EU-friendly hosting path.
- managed auth/database vs self-hosted tradeoffs.
- cost estimates at prototype, 100, 1k, 10k MAU/DAU scenarios.
- monetization options only after product validation.
