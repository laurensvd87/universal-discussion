# Product-first reassessment

Date: 2026-09-27; reconciled 2026-09-28. Scope: repository/code audit, current primary-source research,
and an implementation recommendation. This is not store approval, legal advice,
an external-user study, or evidence of semantic model quality.

## Assessment of completed work

The core `Content -> Semantic Topic -> Discussion` product remains sensible.
Execution has drifted toward proving the test/review machinery before giving
the owner a discussion product to use. Approximately 5,300 nonblank JavaScript
lines implement review tooling and 3,423 implement evaluation, against about
584 in the frozen resolver/URL kernel (read-only audit; rough scope comparison,
not a code-quality metric). More review-workflow features are not the next task.

| Existing work | What its evidence establishes | What remains absent |
| --- | --- | --- |
| P0.1/P1.1 fixtures and resolver | Deterministic URL/exact-byte-fingerprint behavior and adversarial-input handling | Semantic similarity or realistic matching accuracy |
| P1.2 review/evaluation tooling | Schema, review-ledger, split and metric mechanics | Provenance-approved real corpus, independent real labels, held-out model results |
| Owner's synthetic 6/6 exercise | Finished interaction/persistence smoke test; do not repeat | Semantic-quality evidence; it was never a substitute for that |
| P1.3a extractor | Bounded synthetic HTML parsing | General lawful/robust extraction |
| P1.5b/c Chromium popup | Two reserved-domain URL mappings and two metadata routes; least privilege and no egress/storage | General sites, automatic popup load, actual discussion, persistence, AI, embeddings |
| P1.6 lifecycle design | Detailed proposed behavior and AI review history | Implemented authorization, real accounts, operational/legal/store readiness |

Pre-change audit reproduced `npm test` (264 pass, one expected skip),
`npm run test:restricted` (265 pass), and `npm run indicator:test` (83 pass).
These overlap; do not add them into a claim of unique tests. No owner review
command was run. Post-change verification belongs in `plans/STATUS.md`.

The audit found a same-URL reload window after document attestation and before
the last tab lookup completes. A mocked-adapter reproduction rendered the old
title. Existing smoke/tests did not cover that interval. Correct the controller
with source-tab lifecycle invalidation and regression tests; browser events are
asynchronous, so no sequence of reads proves an atomic, continuously fresh DOM.

Keep the frozen experiments as regression baselines. Queryless-only URLs,
all-or-nothing optional metadata, the narrow robots-token allowlist, the MDN
expiry (2026-10-23), and exact hashes are experiment restrictions, not a reusable
universal matching architecture. Queryless URLs can still contain private data.

## Recommended useful loop

Open extension -> see current context and suggested Topics -> choose/create a
Topic -> read/write/reply -> optionally prepare/import an AI draft -> inspect
and explicitly publish it. The UI is English with message-key language packs.
Human and AI identities/counts stay separate. Opening alone never invokes AI.

Start with local demo data and a real interactive discussion UI, then general
metadata and semantic suggestions. Keep all remote operations disabled until
the appropriate explicit boundary approval. Reversible local implementation
choices do not need thirteen separate owner decisions.

## Same Topic, related Topic, and time

An embedding is a similarity signal, not an equality test. Propose a Topic card
with `kind`, subject/entities, defining event or question, optional version/time
scope, a short description, and evidence. Give each card a stable opaque ID;
never derive its identity directly from a changing vector or title.

- Two reports of the same announced event: one Topic; a subsequent reversal is
  a related Topic. Time is supporting evidence rather than a universal cutoff.
- Two reviews of the same device generation months apart can share a product
  Topic. A particular safety recall or a different hardware generation should
  not be silently pooled into it. Price/region/availability remain explicit
  context in comparison roots.
- A paper and a video explaining that paper may discuss the same claim/work.
  Author names or broad subject overlap alone are insufficient.
- Two similar private phishing messages are a later high-risk use case. Even
  confirming that a private matching Topic exists can leak sensitive facts.
  Do not feed private contexts into a public discovery index by default.

ADR-004 and its labels remain the original editorial benchmark, not a universal
time policy. New domains need versioned policies and examples without silently
reinterpreting the old gold labels.

## Matching many sites without crawling them

This is a proposed architecture, not benchmark evidence:

1. Reuse a versioned confirmed Source-to-Topic link when available. Record who
   confirmed it and when; a mutable URL does not prove unchanged content forever.
2. For an unknown source, build the minimum permitted descriptor from the
   invoked page/share payload: title, bounded description, available identifiers,
   language and optional temporal hints. Manual topic text remains a fallback.
3. Retrieve candidates using lexical/entity/identifier signals and, after a
   pinned-model experiment, embeddings. Compare to bounded Topic cards and
   representative sources; exact search is adequate initially. A vector database
   and ANN are not prerequisites.
4. Verify event/subject/version compatibility and present a short ranked list
   plus `Create a new topic`. No LLM call per page is required. Missing context
   means abstain, not a guessed confident match.
5. A user's choice initially creates a reversible local association, not a
   global merge. Later shared associations require moderation, provenance,
   dispute/correction and poisoning defenses. One visitor cannot reroute everyone.
6. After a separate service/egress approval, shared confirmed associations make
   later visits cheap. Growth comes from explicitly contributed source links,
   not harvesting every page or uploading everyone's browsing history.

Do not implement single-link chaining (`A ~ B`, `B ~ C` therefore one cluster):
it can combine different events. Check membership against the Topic definition
and representative evidence. Model versions, preprocessing and vector dimensions
must match; changing a model requires rebuilding compatible representatives.
User-selected aliases and Topic corrections preserve roots/replies and are undoable.

Retain content-identity query parameters (`?v=`, `?id=`, product variants), and
preserve unknown parameters in local identity unless there is reviewed evidence
to remove them. Public export is a separate decision: credentials/private paths
and parameter values must not be disclosed merely because normalization succeeds.
Canonicals/robots directives are untrusted hints, not authorization or identity
proof. Unusable optional fields should degrade independently of valid inputs.

A local model is technically plausible: Transformers.js supports browser
inference and feature extraction. Benchmark startup, download size, memory,
latency, language quality and CPU fallback on target devices before choosing it.
[Official runtime documentation](https://huggingface.co/docs/transformers.js/en/index).
Its defaults can download hosted models/WASM; package or pin reviewed artifacts
and configure remote loading explicitly. No model has been downloaded or selected
by this audit. [Asset-loading controls](https://huggingface.co/docs/transformers.js/custom_usage).

The limit is fundamental: unseen pages with no adequate permitted descriptor
cannot be reliably classified from an opaque URL. URL/manual-topic fallback,
optional user-selected excerpts under an approved boundary, and later permitted
local body processing are honest alternatives. No search-provider dependency or
site-by-site API implementation is required for the core flow.

## Existing AI subscriptions without an API key

Prefer an AI-host-to-our-platform direction over making our extension impersonate
an AI client. Three incremental routes:

1. **Manual draft handoff:** show a user-editable prompt/context preview; the
   user copies it into their chosen AI application and pastes the response back.
   Import as `AI-assisted; provenance declared by user`, never verified model
   output. Review, edit, cite and publish separately. No scraping chat history,
   hidden clipboard monitoring, cookies or provider credentials. Copying chosen
   material is still a disclosure to the provider; warn before that action.
2. **Supported connector:** the user asks their AI application to read an allowed
   public Topic and submit a private draft through our authenticated API/MCP
   interface. Our service supplies tools, not inference. A draft cannot publish
   itself. Start with narrow read and draft scopes and exact owner binding.
3. **Optional direct/local inference:** only when a provider contract or a
   reviewed on-device model supplies a supported mechanism. It must justify its
   additional credential, device, data and cost burden. Human-only use survives
   provider failure.

OpenAI documents MCP tools for ChatGPT/Codex plugins and a separate server
authorization boundary. That supports exploring route 2; it does not grant an
arbitrary subscription-backed inference endpoint to our extension.
[MCP server tools](https://developers.openai.com/plugins/build/mcp-server),
[OAuth authorization](https://developers.openai.com/plugins/build/auth).
Codex distinguishes ChatGPT subscription sign-in from metered API-key usage;
its own supported client login is not a transferable platform credential.
[Authentication](https://learn.chatgpt.com/docs/auth).

Claude documents custom remote MCP connectors, including their cloud-originating
connections. This entails a reachable service and cannot secretly be treated as
an offline integration. Availability, plan limits, directory review and terms
must be rechecked for the exact launch.
[Custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
Anthropic prohibits developers intermediating consumer tokens as their own
application's login/inference route. Its documented exception for users signing
into an unmodified Claude Code binary has specific commercial conditions; it is
not a reason to ship a token proxy or bundle a developer CLI into this mobile app.
[Credential and product conditions](https://code.claude.com/docs/en/legal-and-compliance).

No official source here establishes universal subscription coverage, unlimited
compute, or guaranteed connector publication. Do not promise those features.

## Cold start, incentives and economics

The first useful output is a source-grounded insight for its requesting user,
not a manufactured busy forum. Use General Analysis, Opinion and Summary as
declarative modes; show uncertainty and cited evidence. Do not present an AI
judgment of bias as an objective verdict, or invent current prices.

Make `Share useful insight` easy after editing: show precisely what becomes
public and credit the human curator plus the AI identity. Rank helpful sourced
roots and replies; collapse duplicate/generic AI posts; retain Humans-only.
Measure useful reads, repeat use and accepted contributions, not generated volume.
Useful-vote reputation and visible curator credit are candidate incentives;
avoid pay-per-post, unrestricted bot voting or rewards for exporting private data.

Begin with a small, clearly labeled collection of owner-curated public Topics
after publication approval. General content support does not require launching
to every community at once. An initial technology/product community is a testable
recruitment hypothesis, not a permanent product restriction or a decision made
on the owner's behalf. No recruitment is performed by this audit.

Agent operators can supply inference and useful specialist reports. Require a
responsible operator, narrow privileges, quotas, idempotency, takedown and a kill
switch. An AI cannot be assumed to choose participation, pay operating costs,
or take responsibility autonomously. Open public APIs/MCP can make participation
easy later, but do not seed content using invented humans or unbounded agents.

BYO compute removes some inference cost, not hosting, moderation, abuse handling,
embedding distribution or support cost. Defer sponsored agents, affiliate
commerce and paid subscriptions until usefulness is observed and their actual
store/payment/conflict-of-interest requirements are reviewed. Policy details and
mobile alternatives are in `PRODUCT_RESET_POLICY_2026-09-27.md`.

## Handoff

Apply ADR-014 and the rebaselined roadmap. Keep completed evidence and the 6/6
task closed. Build the local discussion loop next; stop at actual new data,
provider, publication, deployment or spending boundaries. The 200–250-pair task
stays an explicit later acquisition/review approval, not a local UI prerequisite.
