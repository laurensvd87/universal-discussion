# Product-first roadmap

Updated: 2026-09-28. Governing decision: ADR-014. Browser extension first;
Android and iOS follow with shared Topic/discussion contracts. Core model:
`Content -> Semantic Topic -> Discussion`.

The [historical roadmap](archive/ROADMAP_2026-09-25.md) preserves the old sequence.
This is the active execution order. Do not restart Phase 0 or the completed 6/6
owner review. More synthetic review machinery is not on the critical path.

## Evidence already available

- Offline exact-URL/fingerprint resolver, synthetic extractor and evaluator.
- Review/preflight plumbing; no real larger corpus or semantic model validation.
- Chromium popup with reserved-domain URL fixtures and two metadata routes.
  Owner smoke covers those routes, not arbitrary sites or continuous freshness.
- P1.6 lifecycle design and AI-review history, qualified by ADR-014's policy
  corrections. Most of that design is not implemented.
- No backend, real accounts, discussion posting, AI provider, embeddings,
  mobile app, public release or store approval.

## R0 — Reassessment and current-boundary hardening

Owner: Lead; Platform/Client and Trust/Quality review. Depends on current tree.
Deliver: dated code/product/provider/policy findings, corrected active docs,
and source-tab invalidation for the post-attestation stale-metadata window.
Acceptance: focused regression, normal/restricted suites, secret scan, honest
claims and no permission/egress expansion. Historical smoke stays completed;
new code cannot inherit an unperformed browser smoke.
Gate: no new owner approval for an in-scope correction. See `STATUS.md`.

## R1 — A usable local discussion

Owner: Platform/Client; Lead product acceptance and Trust/Quality review.
Dependencies: R0 and ADR-014's local envelope.

Deliver small tested increments:

1. Browser-neutral Topic/Discussion/Contribution repository and demo UI: choose
   or create a Topic, write a root, reply, edit and delete. English message keys.
2. Persist synthetic/demo state with a replaceable IndexedDB adapter; reset,
   deletion and corruption/version handling. Label synthetic identity as testing.
   Save no automatically observed URLs/metadata/bodies.
3. Popup opening automatically loads the existing approved context observation,
   then local discussion. Offer manual Topic search when capture is unavailable.
   Preserve the narrow experiment tests; no second check button required.
4. Private destination and unpublished AI fixture/preview; separate human/AI
   identities/counts, Humans-only filter, grouped replies and Summary roots.
   Toggle affects future messages only; publication is explicit.
5. Minimum local report/block/moderator removal and ownership/deletion rules
   before calling the demo complete. Defer production workers/account providers,
   backup infrastructure and complex ranking.

Acceptance: executable open -> choose -> post -> reply -> reopen -> delete;
two distinct synthetic Sources reach one confirmed Topic; unrelated Sources stay
separate; hostile text inert; private output excluded from public counts; reset
clears local demo assets; keyboard/status coverage and zero external I/O.
Test applicable authorization rules without claiming real authentication.
Gate: implement within ADR-014 without per-module questions. No general page
capture or captured-context persistence is implied by the demo UI.

## R2 — General context and useful same-Topic suggestions

Owner: Platform/Client + Semantic; Trust/Privacy/Policy and Quality review.
Dependencies: R1 repository/UI. Contract/fixture work may run alongside R1.

Deliver a shared `ContextEnvelope`: optional URL/title/description/identifiers,
capture provenance and capability limits. Add event/product/claim Topic cards,
reversible local Source associations, candidate list and abstain. Keep functional
query parameters, canonicals as hints, independent optional-field degradation.
No crawler or per-site API foundation.

Run a small pinned on-device embedding experiment on project-owned text early
in this slice, after exact model/license/assets approval. Compare lexical-only
and embedding retrieval on paraphrases, related-but-distinct events, product
versions and time-separated cases. Record memory/startup/CPU latency, language
limits and model version. Synthetic results guide code, not AUTO quality claims.
Never silently download runtime/model assets.

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

Build local service contracts with fake identities first. Propose one modular
service, a relational store and replaceable matcher; PostgreSQL is a candidate,
not a purchased deployment. No vector service/microservices without measurements.
Stable IDs and a provider-neutral discussion API serve all clients.

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
