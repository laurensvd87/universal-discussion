# Product-first roadmap

Updated: 2026-09-28. Governing decisions: ADR-014/015/016. Browser extension first;
Android and iOS follow with shared Topic/discussion contracts. Core model:
`Content -> Semantic Topic -> Discussion`.

The [historical roadmap](archive/ROADMAP_2026-09-25.md) preserves the old sequence.
This is the active execution order. Do not restart Phase 0 or the completed 6/6
owner review. More synthetic review machinery is not on the critical path.

The completed S1/S2 block is specified in [IMPLEMENTATION_HANDOFF](IMPLEMENTATION_HANDOFF.md).
S1/S2 Astra review is complete with corrections. On 2026-09-28 the owner explicitly
approved ADR-016's local-connection package; S3 is now implemented and locally
tested. ADR-017's revised synthetic-only local embedding comparison was approved
on 2026-09-29 and is now implemented/measured. Review its evidence before proposing
interactive activation or broader inputs. S4's private/AI/moderation UX remains later work.
External search/provider selection is deferred by the owner, not an R1 dependency.

## Evidence already available

- Offline exact-URL/fingerprint resolver, synthetic extractor and evaluator.
- Review/preflight plumbing; no real larger corpus or semantic model validation.
- Chromium popup with reserved-domain URL fixtures and two metadata routes.
  Owner smoke covers those routes, not arbitrary sites or continuous freshness.
- P1.6 lifecycle design and AI-review history, qualified by ADR-014's policy
  corrections. Most of that design is not implemented.
- Local-service S1–S3 and extension 0.5.0 provide a session-paired, persistent
  synthetic human discussion loop, with actual loopback/Chrome evidence. No real
  accounts, AI provider, learned embeddings, mobile, public release or store approval.
- R2's candidate ranker and service-backed related-page UI are built.
  Six synthetic Sources and hand-authored vectors prove wiring, not learned
  semantic matching or live discovery. The service-backed panel has Chrome smoke
  evidence; old metadata paths retain their own separately scoped evidence.

## R0 — Reassessment and current-boundary hardening

Owner: Lead; Platform/Client and Trust/Quality review. Depends on current tree.
Deliver: dated code/product/provider/policy findings, corrected active docs,
and source-tab invalidation for the post-attestation stale-metadata window.
Acceptance: focused regression, normal/restricted suites, secret scan, honest
claims and no permission/egress expansion. Historical smoke stays completed;
new code cannot inherit an unperformed browser smoke.
Gate: no new owner approval for an in-scope correction. See `STATUS.md`.

## R1 — Local service and a usable discussion client

Owner: Platform/Client; Lead product acceptance and Trust/Quality review.
Dependencies: R0, ADR-014's local envelope and ADR-016's service-first decision.

Deliver small tested increments:

1. S1 complete: service-owned Topic/Discussion/Contribution domain, memory
   repository, synthetic Source catalog and candidate-ranking adapter.
2. S2 complete: SQLite persistence and secured in-process API handler; reset, deletion,
   conflict and corruption/version tests. No bound listener or new permissions.
   No canonical extension IndexedDB; no captured URLs/metadata/bodies stored.
3. S3 complete, owner-approved on 2026-09-28 under ADR-016's exact listener,
   pairing, permissions, payload, retention and test package. Implemented the
   loopback service and thin extension UI: choose/create Topic, human root,
   reply/edit/delete, English keys. Paired popup opening auto-loads the catalog
   and existing reserved-domain lookup, sending only a known fixture Source ID.
   Unsupported context permits manual choice; metadata remains manual and local.
4. Private destination and unpublished AI fixture/preview; separate human/AI
   identities/counts, Humans-only filter, grouped replies and Summary roots.
   Toggle affects future messages only; publication is explicit.
5. Minimum local report/block/moderator removal and ownership/deletion rules
   before calling the demo complete. Defer production workers/account providers,
   backup infrastructure and complex ranking. Items 4/5 are later S4, not
   prerequisites for completing the first S1/S2 handoff block.

Acceptance: executable open -> choose -> post -> reply -> reopen -> delete;
two distinct synthetic Sources reach one confirmed Topic; unrelated Sources stay
separate; hostile text inert; private output excluded from public counts; reset
clears local demo assets; keyboard/status coverage and no Internet/provider I/O.
Approved loopback HTTP is separately disclosed data transfer, not zero network I/O.
Test applicable authorization rules without claiming real authentication.
Gate: completed S1/S2 needed no per-module owner questions; ADR-016's exact local
listener/client activation is now explicitly approved. Follow handoff
return-to-Astra checkpoints and ask before any expanded scope. No general page
capture or captured-context persistence is implied by the service or demo UI.

## R2 — Useful related pages, early embeddings and same-Topic suggestions

Owner: Platform/Client + Semantic; Trust/Privacy/Policy and Quality review.
Dependencies: R1 repository for saved Topic associations, not for standalone
source recommendations. Build retrieval/fixture UI alongside R1; actual model
and broader input activation retain their exact gates.

First increment complete: bounded pure vector ranker and a clearly labelled
synthetic related-page panel with no active-tab input, posts or network. Next,
replace hand-authored vectors in an approved experiment with a real model.
Source discovery must be useful even when discussions are empty. Clearly separate
confirmed same-Topic pages from related reading; never convert proximity into
an automatic merge. No-match means limited catalog coverage, not an empty web.

Deliver a shared `ContextEnvelope`: optional URL/title/description/identifiers,
capture provenance and capability limits. Add event/product/claim Topic cards,
reversible local Source associations, candidate list and abstain. Keep functional
query parameters, canonicals as hints, independent optional-field degradation.
No crawler or per-site API foundation.

Run a small pinned local-service embedding experiment on project-owned text early
in this slice, after exact model/license/assets approval. Compare lexical-only
and embedding retrieval on paraphrases, related-but-distinct events, product
versions and time-separated cases. Record memory/startup/CPU latency, language
limits and model version. Synthetic results guide code, not AUTO quality claims.
Never silently download runtime/model assets. Server-owned vectors/ranking stay
behind an adapter. Future sensitive-body embeddings may still be computed on the
client under ADR-013; hosting does not authorize uploading private bodies/vectors.

Treat learned embeddings as early MVP work, before claiming meaningful semantic
usefulness to external testers. A missing model can still degrade to lexical/manual
selection. Use known permitted Sources first. External search is parked; a later
user-reviewed normal-search handoff or interchangeable API is optional. Search
finds candidates; embeddings rank them. Do not silently build a history index,
generate URLs with an LLM or assume API results may be permanently cached/embedded.
Provider/privacy/security, query fields, retention/derivation rights and spending
need explicit approval before external activation; see ADR-015 and its research.

Before general live-page tests, ask once for exact fields, contexts, permissions,
local retention and rights-policy approach. Do not generalize the current
queryless/robots allowlist. Body/private-message processing remains ADR-013;
manual Topic selection is a fallback. No provider or upload on popup opening.

Acceptance: genuinely computed candidates (mock results labeled); paraphrase
candidates appear, distinct developments can stay separate; local confirmation
does not merge global Topics; query identity, bad hints, navigation, model absence
and no-match tested. Versioned Source links and subthread-preserving correction.
Gate: broader capture/model approval before activation. The 200-pair task is
not needed for experimental local suggestions. No automatic semantic joins.

## R3 — AI participation without requiring API keys

Owner: Platform/Client; Lead/Trust/Privacy/Policy review.
Dependencies: R1 draft/publication flow; R2 is not required for draft UX.

Start with prompt preview and plain-text AI response import using synthetic data.
General Analysis, Opinion and Summary are declarative modes. Imported content
has user-declared AI provenance, never an invented verified model label. Show
citations, uncertainty and an editable publication preview; never post on import.
Reserve explicit reporting of offensive generated output.

Later: user-initiated handoff to their AI application, and a narrow AI-host
connector/API to read permitted Topics and submit an owner-private draft. The AI
calls our service; we do not reverse-engineer a subscription API. Manual handoff
survives connector/provider failure. Agent definitions cannot expand permissions.

Acceptance: disclosure before handoff; inert bounded import; no accidental
publication; immutable AI identity after edits; private-output reports contain
only explicit user selection; private data excluded from counts/search.
Gate: fixture import needs no provider key. Real connectors, automated handoff,
private-context export or direct inference require exact provider/data-flow
approval. Hosting, spending and publication approvals remain separate.

## R4 — Shared private alpha with an operable service

Owner: Platform; Trust/Privacy/Policy and Quality/Operations review.
Dependencies: R1 loop, R2 Source contracts; R3 optional (human-only works).

Extend R1's existing local service, not a second backend. Keep one modular service,
a repository boundary and replaceable matcher; SQLite is the local prototype
store and PostgreSQL remains a hosting candidate, not a purchased deployment.
No vector service/microservices without measurements.
Stable IDs and a provider-neutral discussion API serve all clients.
Provide readable, shareable public Topic pages without requiring an extension;
private discussions remain inaccessible. This supports discovery and invitations,
but does not authorize hosting or public publication before their gates.

Before real connected tests, explicitly approve host/region/budget, account/auth
choice, transmitted fields (including IP/logs), retention/deletion, launch
audience/territories, moderation capacity and tester scope. Implement real object
authorization, report/block, limits, rights handling, contacts/terms, deletion/
export and backup/incident controls for hosted features. Central web privacy
tools may serve all clients but must work when real accounts operate.

Acceptance: cross-user isolation, provenance, curated mapping, poisoning defenses,
rate limits, deletion/restore tests, budget and operations evidence. Owner approves
deployment/invitations/public content. No raw-body upload or browsing-history
index; one user's association cannot silently reroute everyone's discussions.

## R5 — Validate automatic semantic resolution

Owner: Semantic; independent human labels plus Trust/Quality review.
Dependencies: useful R2 candidate and versioned Topic policy. May precede or run
alongside curated-only R4 after its own approval; R4 does not require AUTO.

STOP before the 200–250-pair provenance-approved acquisition/review task. Ask for
sources/provenance/retention approval and give the solo owner a bounded assignment
for an independent reviewer. The 6/6 synthetic task stays finished. Reuse existing
tooling as needed; add no speculative machinery.

Freeze model/preprocessing, dataset/split and thresholds before held-out results.
Measure retrieval separately from verification, false joins and abstention; test
drift, language/domain gaps and corrections. ADR-004 news labels are unchanged;
new domains need their own policy/evidence. Historical AUTO minimums remain:
precision >= .97, Wilson lower bound >= .93, recall >= .50, >=60 joins over
>=20 held-out clusters, block-bootstrap sensitivity and no systematic cross-event
merge class. These are gates, not results or guarantees for other content types.
Gate: reviewed AUTO/ASSISTED/NO-AUTO decision. Insufficient evidence retains
suggestions/curated links without blocking the human discussion product.

## R6 — Android and iOS entry points

Owner: Platform/Client; Trust/Policy and device QA review.
Dependencies: stable R1/R2 contracts; shared network requires approved R4.
Early fixture prototypes may precede R4/R5 without external services.

Prototype Android receive-share, iOS Share extension and Safari Web Extension
reuse. Share discussion UI/domain contracts where practical. Receive only what
the source app shares; accept URL-only/manual context. WebView is optional for
in-app browsing, not an assumption about access to other apps' private data.

Acceptance: same Topic reachable from desktop/Android/iOS input; graceful missing
fields, cold start, keyboard/accessibility and identity/privacy behavior on real
target devices. Verify deletion/report/block requirements and model constraints.
Gate: review each new permission/data flow; real accounts and store submission
need explicit approval, not a rewritten backend.

## R7 — Controlled release and sustainable growth

Owner: Lead/Growth; Trust/Policy and Quality/Operations evidence.
Dependencies: useful alpha, applicable R5 branch, per-platform release scope.

Start with one reachable community while retaining general content support.
Seed labeled owner/participant-curated contributions only after approval.
Measure repeat useful opens, existing-Topic matches, false joins, human/AI
participation separately, voluntary draft publication and cost. Popup use cannot
be reported as passive-indicator discovery. Define experiments before collecting
minimal approved telemetry.
Measure whether people voluntarily return for useful sources and whether humans
reply to other humans. Related-page clicks and generated post volume alone do
not validate a discussion community. Test one reachable audience before expansion.

Ship contacts/notice-action/moderation, privacy disclosures, blocking, AI reporting/
labels and account rights before public UGC. Recheck policies/law for actual
territories/ages/features; no blanket guarantee. Registered operators authorize
and fund agents under narrow quotas/scopes. Reward useful sourced work, not volume.

Gate: owner approves public deployment, spending, recruitment/publication and
each store submission. Paid agents/affiliate links need business/payment/
disclosure review. Expand automation and monetization from evidence.

## Historical task mapping

P1.1/P1.3a/P1.5b/c remain regression evidence. P1.6 is a corrected reference.
P1.7/P1.8 -> R1; general P1.3/P1.4 suggestions -> R2; P1.10 -> R3;
P1.9/Phase 2 -> R4; P1.2/P1.4 AUTO -> R5; Phase 4 -> R6; Phases 3/5/6 -> R7
and later expansion. P1.11/ADR-013 remains an optional separately approved
sensitive-content branch rather than MVP work.
