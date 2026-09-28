# Product specification

Updated: 2026-09-28. Direction: ADR-014/015/016; implemented state is in
`plans/STATUS.md`. This document defines intended product behavior.

## Vision and core abstraction

Discuss as much online content as possible across websites and platforms.
Content resolves to a semantic Topic with a shared Discussion; a URL is one
Source, not the organizing principle. Related sources retain their provenance
and may carry source-specific subthreads.

Different descriptions of the same announcement can share a Topic. Reports of
a later reversal are related, but not automatically the same Topic. Reviews of
the same product generation can stay relevant months apart. A new model/version
or specific recall may need a separate Topic. Time is contextual evidence,
not a universal 72-hour rule. ADR-004 remains the historical news benchmark.

Topic cards describe kind, subject/entities and defining event/question/version,
with an optional temporal scope. Stable opaque Topic IDs do not change with
the embedding model. Users can distinguish same-topic and related-topic links.

## Platforms and initial interaction

First: Chromium desktop extension. Later: Android and iOS, plus other browsers
when justified. Reuse the domain/API and suitable UI components, not identical
capture mechanisms.

The implemented local service owns Sources, fixture embedding records/ranking,
Topic links and discussions. Under ADR-016's explicit approval, extension 0.5.0
is now a session-paired thin client of the fixed loopback listener. This local
developer demo uses synthetic IDs and deliberate demo contributions only.
Hosting later needs real auth/TLS/privacy/operations approval, not merely a URL change.
External web search is deferred, not required for the first implementation block.

Opening the extension is the initial explicit gesture: load the approved
current context and relevant local discussion without another button. No
background history scan, AI invocation, silent publication or unapproved data egress.
A future connected lookup requires its own disclosed/approved boundary.

On mobile, prefer share-target/Share extension and Safari integration prototypes.
Inputs may contain only a URL, title or selected text. An in-app WebView is
optional and sees only its own pages, not arbitrary other applications.
If capture is unavailable, let the user search/select/create a Topic manually.
For the later shared service, public Topic pages should be readable and shareable
without installing the extension. Private discussions are excluded; hosting and
publication remain separately approved.

## Minimum useful loop

1. Open and inspect current context.
2. Reuse a confirmed association or inspect suggested Topics; choose an existing
   Topic or create one. Explain ambiguity and allow no match. Show useful related
   pages even if there are no contributions; distinguish same-Topic Sources from
   related reading without merging their discussions.
3. Read/write a root and grouped replies. Roots may sort by relevant public
   signals; replies remain primarily chronological. A Summary is a root.
4. Optionally prepare/import an AI draft, edit it and separately choose whether
   to publish. Opening a discussion never publishes or invokes AI automatically.
5. Return to the discussion from another confirmed Source.

A private discussion switch affects future messages only. Existing private
history never becomes public by toggling it. Edits retain immutable human/AI
provenance; deletion can leave a non-linkable Deleted placeholder for replies.

English is the first UI language. All user-facing product text uses message
keys and replaceable language packs. User content is not automatically translated.

## AI utility and cold start

Related-source discovery is standalone first-user value, not an engagement count.
Begin with permitted known Sources; optionally fill gaps through explicit search.
Embeddings cannot find URLs absent from the candidate catalog. A small catalog's
empty state must state the coverage limitation, not imply no related page exists.
Do not use generic AI posts to disguise an empty forum. Personal usefulness and
human participation are separate hypotheses that both need real-world evidence.

General Analysis, Opinion and Summary are initial declarative modes. Custom
definitions can extend the selector without executable code or permission
expansion. Useful browser-buddy outputs include source-grounded context,
counterarguments, comparisons and unanswered questions. Unverified prices or
bias judgments must not be presented as established facts.

An API key is not a prerequisite for the eventual contribution experience.
Start with explicit draft handoff/import; later investigate supported AI-host
connectors and optional direct/local inference. The exact provider/data flow
must be approved before use. Consumer subscription tokens are not general API
credentials. See `docs/AI_AGENTS_AND_ECONOMICS.md`.

Private AI output stays unpublished until the user reviews the exact payload
and chooses publication. Imported provenance is explicitly user-declared where
not verified. Human edits never relabel an AI contribution as human.

Keep human and agent counts separate and provide All/Humans-only/AI filtering.
Followed agents and paid catalogs are later. Reward useful sourced contributions
and curation, not generated volume. Do not manufacture a human community.

## Resolution without a whole-web crawler

Use a layered, versioned pipeline:

1. Reuse eligible confirmed Source-to-Topic links.
2. Build permitted descriptors from invoked/shared context; retain functional
   URL query parameters, treat canonical URLs as untrusted hints.
3. Retrieve candidates using identifiers/entities/lexical signals and early
   local-service embeddings. Lexical/manual fallback remains when a model is absent.
   Exact vector search is sufficient until scale measurements say otherwise.
4. Check Topic/event/version compatibility and present suggestions with abstention.
5. Save an explicit reversible association in the approved scope. A single user's
   local confirmation is not permission for a global merge.
6. Enable automatic semantic joins only after the applicable evidence gate;
   preserve traceable correction and whole-subthread history.

Hash identity is a duplicate baseline, not semantic matching. Embedding distance
is not equality. Do not chain similar pairs into drifting clusters. Optional
metadata failures should degrade gracefully; authorization failures still deny.
Unseen pages with no adequate permitted signal may stay unmatched.

Body-derived/private-context matching is an optional separately approved branch
(ADR-013). Local transforms are not automatically anonymous or rights-cleared.
No raw-body crawler, search-provider dependency or per-site API is required.
That later private-input branch can still compute on the end-user device. Local
development-server placement never implies permission for cloud body/vector upload.
External search is an optional candidate source, not the semantic authority.
Approve exact query disclosure, result retention/derivation rights and budget
before integration; a paid search result is not automatically a reusable index.

## Trust and release requirements

Report content and users; personal user blocking is separate from moderator
suspension/ban/removal. Private content is not normally moderator-visible;
reporting offensive generated output submits only the user's explicit selection.
The public product needs operable moderation/contact/notice handling and account
rights, not merely UI buttons. See current policy research and lifecycle design.

Disclosure, minimization, retention, publication choice and access control apply
to URLs, descriptors and embeddings as well as raw content. Store publication
and legal readiness require review against the actual release features and
territories; no universal permission follows from metadata or local processing.

## Learning and scope

Initial success: one person can get useful context and a coherent conversation
even before the network is dense. After approved recruitment, measure repeated
useful opens, confirmed matching/corrections, human contributions, voluntary
private-to-public AI sharing, abuse, retention and operating cost.

Popup utility and semantic quality are separate hypotheses. A popup-only client
cannot measure passive-indicator discovery; add no background observation just
to preserve an old metric. Define approved telemetry before collecting it.

Do not front-load a social feed, marketplace, autonomous posting, advertising,
a vector-service cluster or native mobile complexity. Build general contracts
but launch to a manageable community. Platform inference, if any, is budgeted;
users/operators supplying inference do not remove hosting/moderation costs.
