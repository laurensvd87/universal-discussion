# ADR-015: Related pages as first-user utility, early embeddings

Status: Adopted for product sequencing and offline implementation under the
owner's 2026-09-28 direction. No search provider, model download or broader
real-page processing is activated by this decision.

Date: 2026-09-28

Continuation: ADR-016 moves future catalog/embedding/matching state into a local
service and keeps the existing offline demo as historical evidence. The owner
has deferred external web search; no provider selection is needed for this block.

Owners: Lead/Product, Semantic, Platform/Client, Trust/Quality

## Context

The owner accepted the viability assessment: prove personal usefulness before
depending on an active community, use real embeddings early, and launch to a
reachable community while retaining general content support. They propose
showing related pages even when a Topic has no contributions. A small useful
source list is a better initial hypothesis than filling empty discussions with
generic AI posts. This is a hypothesis, not evidence of adoption.

## Decision

1. Add related-source discovery alongside R1, as the first R2 increment. Do not
   wait for community activity or an AI provider to make source discovery useful.
   Actual embedding retrieval belongs in the first meaningful matching MVP, not
   distant polish. Manual/lexical fallback still works when a model is unavailable.
2. Separate **Same topic**, based on an eligible confirmed association, from
   **Related reading**, a similarity suggestion that does not join discussions.
   Topic identifiers stay independent of embedding/model versions. A product's
   successor can be related without sharing the original model's discussion.
3. Use a provider-independent candidate pipeline: permitted known Sources first;
   optional user-initiated discovery for missing coverage later. Embeddings rank
   supplied candidates; they do not discover unseen URLs by themselves. A small
   catalog has its own cold-start problem. Do not invent sources with an LLM.
4. Do not crawl the web or require a separate website API for the core product.
   A reviewed normal-search handoff can be a cheap first discovery route. An API
   can later keep results inside the app. Neither route is implemented here.
   Before egress, show the destination and approved query; never silently send
   private titles, URLs, page text or vectors to a search provider.
5. Do not assume standard API search rights permit a permanent shared index,
   embedding of snippets or long-lived result caching. Approve the exact provider,
   fields, storage/derivation rights, retention, geography and spend cap first.
   Independently permitted contributions are a separate acquisition path, not a
   way to launder restricted search results. No provider is selected yet.
6. Keep AI drafts useful and visibly attributed; do not simulate a busy forum.
   For later approved shared service work, include readable, shareable public
   Topic pages that do not require the extension. Private Topics remain private.
   Hosted publication remains separately gated. Measure voluntary return use,
   useful source discovery and human-to-human replies, not generated post volume.

## Implemented boundary: extension 0.4.0

- Pure, browser-neutral ranker over up to 100 caller-supplied Sources and
  model-labelled vectors. Compatible cosine similarity is computed, but no
  trained model runs. Deterministic deduplication retains functional URL queries.
- Six bundled project-created pages with hand-authored three-dimensional test
  vectors. The separate panel auto-renders on opening and uses a local selector;
  active-tab observations never enter it. These are not real recommendations.
- English message pack, status/keyboard bindings, text-only URLs without links,
  explicit demo/no-posts/limited-coverage labels. No storage, network, logging,
  model assets, permissions or capture expansion. No ranking score is shown as
  confidence that two pages belong to one Topic.
- Existing exact URL and metadata experiments retain their own boundaries.

## Trust and acceptance

Caller-supplied Topic IDs are not proof of authorization. A future service must
validate association provenance and visibility before ranking, including whether
even revealing a private Source's existence is permitted. The pure ranker's
HTTP(S) validation is not a network eligibility or SSRF control. A real adapter
needs approved public/private boundaries, poisoning/quality controls and bounded
inputs before calling it. Untrusted executable objects are not a supported IPC
format; validation does not make arbitrary JavaScript proxies safe.

Focused tests cover model/dimension mismatch, invalid/extreme vectors, bounds,
query identity, duplicate sources, same-versus-related separation, no-match,
inert rendering, dictionary fallback and cleanup. Package tests prohibit new
egress/storage/capabilities. Separate AI Trust/Quality review and full suites
are engineering evidence, not independent labels or store/legal approval.
Real-browser smoke and learned-embedding usefulness remain unverified.

## Next boundary and preserved gates

Continue R1 local discussion and prepare a pinned on-device model experiment.
Ask explicitly before model acquisition/activation and expanded real-page input;
use one concrete approval package instead of another design questionnaire.
ADR-014's provider, security/privacy, real-account, spending, hosting/publication,
store and 200–250-pair review gates remain. The completed 6/6 owner review is
unchanged and must not be repeated.

Research: [Related-page discovery](../research/RELATED_PAGE_DISCOVERY_2026-09-28.md).

2026-09-29 research follow-up:
[Independent discussion sources](../research/DISCUSSION_SOURCE_FEASIBILITY_2026-09-29.md)
investigates the common-format hypothesis through documentation and a subsequently
approved transient three-feed probe. Concrete feed
advertisements do not establish useful coverage, independent ownership or reuse
rights. The owner subsequently approved its small transient live format/linkage
probe, not product ingestion. This does not select an adapter or amend the adopted
ranking/data contract; ongoing collection and app integration remain gated.
The probe parsed public metadata but did not establish article relevance or broad
coverage. Ambiguous comment/host measurements were excluded, not used as evidence
for adopting an acquisition strategy. No raw post corpus was retained.
The owner's latest clarification requires comments readable inside the extension
and rejects many specialist-source integrations as the core answer. This records
the UX requirement, not approval to retrieve/cache/mirror external comments or
select a provider. Outbound-link discovery alone is not sufficient acceptance.
