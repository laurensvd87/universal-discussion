# Project Status

## Current phase

Phase 0 foundation in progress; P0.1 and the frozen offline P1.1 kernel
complete, with P1.2 evaluator work started.

## Current objective

Close the remaining P0.2 decisions—especially architecture, browser
egress/retention, and proposed merge/split semantics—before connected
implementation, while building the license-safe P1.2 corpus and evaluator.

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
- Initial restricted verification passed 62 tests with 0 failures on Node 24.19.0; the ordinary suite passed 61 with only the restricted-harness self-test skipped. JavaScript syntax and whitespace checks also passed.
- An independent final consistency/code review reproduced the suite and found no remaining concrete blocker after its reported edge cases were corrected.
- The owner accepted a time-bounded atomic-development Topic definition in ADR-004. The P0.1 pilot now contains 24 project-created synthetic pair decisions across 20 clusters with the required 8/8/4/4 case mix.
- An independent reviewer labeled six blinded pilot pairs (25% coverage) with no disagreements. `npm run evaluate:pilot` validates the schema and reproduces TP=4, FP=0, TN=16, FN=4 without using review-only titles or summaries.
- The owner accepted ADR-002's user-invoked `activeTab` direction, with passive discovery and all connected data use still outside the accepted boundary.
- Added a checked fixture-provenance inventory and a process-level restricted harness that actively denies socket, DNS, HTTP, subprocess, fetch, and WebSocket access while running the full suite.

## Completed on 2026-09-20

- Added focused hostile-input checks for empty values, Unicode-confusable origins, HTML/instruction-like titles that cannot affect resolution, unsupported nested evidence, cyclic observations, and overlong evidence identifiers. Downstream rendering and prompt safety remain separate controls.
- Added a dependency-free package scanner for a versioned set of high-confidence credential formats. It self-tests every detector using in-memory synthetic samples, reports no matched values, and `npm run check:secrets` scanned 21 JavaScript, JSON, and Markdown files with zero findings; this is package evidence, not a replacement for repository/host secret scanning.
- Closed the two technical partials from the P1.1 gate audit: deep/mixed-representation parser boundaries now pass, and a deterministic 768-case URL matrix preserves repeatability, idempotence, and security origins. The matrix exposed an over-limit normalized-output edge, which is fixed and versioned as resolver 1.0.1.
- The frozen P1.1 gate verification passed all 70 tests under the restricted process guard; the ordinary suite passed 69 with only the guard self-test skipped. One independent read-only audit issued both Trust and Quality ACCEPT dispositions for code commit `d33f010` at 8 PASS / 0 PARTIAL / 0 FAIL, and the Lead marked that offline gate complete. Review provenance and residuals are in `research/P1_1_GATE_REVIEW.md`.
- Proposed append-only Topic/Discussion correction semantics in ADR-005: corrections never copy or reauthor Contributions, every active Topic has one writable Discussion, and legacy Discussions can appear only as provenance-preserving read-only projections.
- Added `research/ALPHA_COST_MODEL.md`, a current bottom-up managed/self-hosted paper comparison with explicit workload, currency, service-level, and operational omissions. It does not replace P1.9 load/restore evidence or authorize a purchase.
- Began P1.2 evaluator hardening without changing the exact-signal baseline:
  the deterministic report now includes tested two-sided 95% Wilson intervals,
  coverage/abstentions, automatic-join evidence sufficiency, and zero external
  cash cost/provider calls. The CLI separately records scoped runtime metadata.
  The report explicitly rejects gate sufficiency because this pilot is not held
  out and has only 4 predicted joins across 4 gold clusters; the larger corpus,
  cluster split, and bootstrap remain open.
- Added a canonical-digest-bound dependency-block split contract and executable
  dry run. It validates complete/exclusive cluster assignment, keeps every
  negative pair in one block, rejects cross-partition exact URL/fingerprint
  signals, and reports four connected pilot blocks. Both partitions and the
  output are explicitly marked as non-held-out, gate-ineligible evidence.
- Added a deterministic, bounded whole-dependency-block bootstrap engine for a
  future frozen held-out run. Synthetic matrix tests cover seeded selection,
  full-block resampling, six metrics, percentile intervals, input/selection
  digests, overlapping-cluster rejection, bounded inputs/work, minimum valid
  replicates, and explicitly conditional undefined-denominator handling. Every
  result is sensitivity-only and gate-ineligible, and the engine is
  intentionally not applied to the retrospective pilot.
- Added the strict future P1.2 corpus contract without adding corpus data.
  Generated boundary tests cover the 200 eligible-pair/50-cluster/six-case/20%
  review minimums, primary/secondary/adjudication history, unresolved-label
  exclusion, reviewer independence, provenance inventory, bounded hostile
  inputs, canonical corpus/evaluation digests, and a resolved-label wrapper for
  dependency-block splitting. Structural readiness remains gate-ineligible and
  requires external Trust review. An independent read-only implementation
  review found and verified fixes for full-corpus digest binding, truthful
  adjudicated-label naming, canonical reviewer identity, and bounded preflight
  diagnostics; its final disposition was PASS with no remaining blocker.
- Added the strict pre-result evaluation-policy contract without creating a
  receipt or evaluating predictions. It binds corpus/projection/split and
  candidate-artifact digests; freezes integer join/abstention, normative gate,
  true-positive cluster-evidence, seeded bootstrap, and offline-only scope
  semantics; checks held-out feasibility separately from quality; and always
  denies held-out/gate evidence pending external chronology and review. An
  independent read-only review reproduced all 11 focused policy/bootstrap
  tests in both normal and restricted modes and reported PASS with no
  commit-blocking findings.
- Current verification passes all 103 tests under the restricted process
  guard; the ordinary suite passes 102 with only the guard self-test skipped.
  The pilot evaluator runs successfully, and the local secret scanner still
  finds zero matches across 37 package files after all six detector self-tests
  pass.

## Active decisions

- `ADR-001-offline-resolution-spike.md`: **Accepted for offline P1.1 only** at code commit `d33f010`. It authorizes no connected behavior, real data, or semantic-quality claim.
- `ADR-002-browser-observation-privacy.md`: **Accepted direction; connected-use gate open**. It approves user-invoked `activeTab`, not data egress or real-user collection.
- `ADR-003-alpha-architecture.md`: **Proposed**; its paper cost comparison exists, but measured load, recovery, security, and operations evidence still block a production-stack commitment.
- `ADR-004-initial-topic-granularity.md`: **Accepted** for the initial English editorial corpus.
- `ADR-005-topic-discussion-correction-history.md`: **Proposed**; owner, Trust, and Quality review are required before correction implementation.

## Blockers

- Passive discovery remains an untested, separately gated hypothesis; the accepted user-invoked design can measure panel utility but cannot produce a pre-click activity indicator.
- Exact egress fields, account linkage, sensitive-site exclusions, log/backup retention, deletion, and telemetry are undecided.
- The auth/object-authorization/data-lifecycle threat model and identity/provenance/moderation state decisions required by P1.6 have not been produced or approved.
- The alpha architecture and host/auth/provider choices are not accepted.
- BYO AI remains blocked on provider terms, credential handling, content disclosure, retention, and explicit publication design.
- P1.1 is complete only for its frozen offline code at `d33f010`; a code-bearing change reopens review. The acceptance does not authorize connected or real-data behavior, automatic semantic joins, or browser/service controls.
- P1.2 remains incomplete: the pilot is not a cluster-separated held-out set,
  its precision Wilson lower bound is about 0.51, and it has 4 automatic-join
  decisions across 4 clusters versus the predeclared 60/20 minimum. The
  200-pair/50-cluster corpus, held-out block-bootstrap sensitivity report,
  actual expanded cases, pre-result tuning/held-out policy freeze, provenance
  review, and independent reproducibility review are still needed. The strict
  schema, policy contract, and retrospective dependency-block dry run validate
  tooling only and cannot close any of these evidence gaps. No external policy
  receipt has been frozen.
- ADR-005's correction semantics and ADR-003's architecture remain proposed; the cost worksheet is not measured capacity or recovery evidence.

## Current gate

**GO:** local fixture-only resolver/evaluator work and planning the larger license-safe labeled set under ADR-004.

**STOP:** real browsing capture/egress, live URL fetches, hosted embeddings, auth/public writes, AI credentials/inference, deployment, spending, announcements, recruitment, and store submission.

## Next owner approval required

Approve or revise ADR-003's modular-monolith direction and ADR-005's append-only merge/split history semantics, then decide the browser-egress/retention assumptions and acceptable operational cost shape. No connected implementation starts from the approvals recorded so far.
