# Project Status

## Current phase

Phase 0 foundation in progress; P0.1 complete and Phase 1.1 offline spike under review.

## Current objective

Close the remaining offline P1.1 threat evidence and P0.2 decisions—especially architecture, browser egress/retention, and merge/split semantics—before connected implementation.

## Completed on 2026-09-19

- Read and reconciled every bootstrap document.
- Defined the five-role lean team and single-writer/review handoffs in `agents/TEAM.md`.
- Challenged the core assumptions, separated the discovery/resolution/AI hypotheses, proposed measurable gates, and recorded a cost envelope in `plans/PHASE_0_FOUNDATION.md`.
- Recorded dated market, browser-policy, privacy, semantic, and hosting evidence in `research/PHASE_0_EVIDENCE.md`.
- Added a threat model for the offline resolver and a future read-only indicator in `docs/PHASE_1_THREAT_MODEL.md`.
- Added a provider-neutral BYO-AI threat model; its proposed pre-provider boundary permits only a deterministic fake adapter until the full credential, privacy, authorization, and provider gate passes.
- Turned Phase 1 into ordered tasks with owners, dependencies, acceptance criteria, and stop/go gates in `plans/ROADMAP.md`.
- Implemented `spikes/topic-resolution/`: conservative URL normalization, exact-fingerprint topic resolution, fail-separate provisional topics, audit metadata, and separate public human/agent activity counts.
- Reconciled later phases with explicit AUTO/ASSISTED/NO-AUTO and human-only/AI-enabled branches, correction and data-lifecycle dependencies, owners, evidence, and stop/go gates.
- Final restricted verification passed 62 tests with 0 failures on Node 24.19.0; the ordinary suite passed 61 with only the restricted-harness self-test skipped. JavaScript syntax and whitespace checks also passed.
- An independent final consistency/code review reproduced the suite and found no remaining concrete blocker after its reported edge cases were corrected.
- The owner accepted a time-bounded atomic-development Topic definition in ADR-004. The P0.1 pilot now contains 24 project-created synthetic pair decisions across 20 clusters with the required 8/8/4/4 case mix.
- An independent reviewer labeled six blinded pilot pairs (25% coverage) with no disagreements. `npm run evaluate:pilot` validates the schema and reproduces TP=4, FP=0, TN=16, FN=4 without using review-only titles or summaries.
- The owner accepted ADR-002's user-invoked `activeTab` direction, with passive discovery and all connected data use still outside the accepted boundary.
- Added a checked fixture-provenance inventory and a process-level restricted harness that actively denies socket, DNS, HTTP, subprocess, fetch, and WebSocket access while running the full suite.

## Active decisions

- `ADR-001-offline-resolution-spike.md`: **Proposed; experiment authorized**. The isolated code exists under the owner's instruction, but final Trust/Quality evidence is still open.
- `ADR-002-browser-observation-privacy.md`: **Accepted direction; connected-use gate open**. It approves user-invoked `activeTab`, not data egress or real-user collection.
- `ADR-003-alpha-architecture.md`: **Proposed**; blocks production-stack commitment.
- `ADR-004-initial-topic-granularity.md`: **Accepted** for the initial English editorial corpus.

## Blockers

- Passive discovery remains an untested, separately gated hypothesis; the accepted user-invoked design can measure panel utility but cannot produce a pre-click activity indicator.
- Exact egress fields, account linkage, sensitive-site exclusions, log/backup retention, deletion, and telemetry are undecided.
- The auth/object-authorization/data-lifecycle threat model and identity/provenance/moderation state decisions required by P1.6 have not been produced or approved.
- The alpha architecture and host/auth/provider choices are not accepted.
- BYO AI remains blocked on provider terms, credential handling, content disclosure, retention, and explicit publication design.
- P1.1's remaining threat checklist (formal Trust acceptance of fixture provenance, a dedicated secret-scanner run, and remaining adversarial parsing/fuzz coverage) must be closed before calling its gate complete. Static capability, fixture inventory, bounded query-idempotence, independent re-review, and process-level network/DNS/subprocess denial checks now pass.

## Current gate

**GO:** local fixture-only resolver/evaluator work, closure of P1.1 evidence, and planning the larger license-safe labeled set under ADR-004.

**STOP:** real browsing capture/egress, live URL fetches, hosted embeddings, auth/public writes, AI credentials/inference, deployment, spending, announcements, recruitment, and store submission.

## Next owner approval required

Review ADR-003's modular-monolith direction, decide Topic/Discussion merge-split history semantics, and approve or revise the remaining bottom-up cost and browser-egress/retention assumptions. No connected implementation starts from the approvals recorded so far.
