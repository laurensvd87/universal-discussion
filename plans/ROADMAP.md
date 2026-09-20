# Development / Testing / Rollout Roadmap

This roadmap was last refined on 2026-09-20. Do not skip gates. `plans/PHASE_0_FOUNDATION.md` contains the assumptions, metrics, cost envelope, and current limited-go decision.

## Phase 0 — Product and feasibility

Owner: Lead / Product Orchestrator, with Platform, Semantic, Trust, and Quality review.

Deliverables:

- lean agent structure and handoff rules;
- challenged product and technical assumptions;
- current competitor, browser-policy, semantic, privacy, and cost evidence;
- architecture and browser-data-flow options;
- measurable resolver and discovery experiments;
- threat models and ADRs for consequential choices; and
- a small corpus/evaluator pilot proving that the planned evaluation can run.

### P0.1 Topic definition and corpus pilot

Owner: Semantic Resolution, with Lead adjudication and Trust/Quality review.

Status: **Complete on 2026-09-19.** The owner accepted ADR-004's time-bounded atomic-development rule.

Evidence: `spikes/topic-resolution/evaluation/` contains the schema, 24 synthetic pair decisions across 20 clusters, six independently reviewed pairs (25%), evaluator tests, and a reproducible TP=4/FP=0/TN=16/FN=4 baseline report. No disagreements occurred; the schema/report retain the field and count.

### P0.2 Decision review

Owner: Lead / Product Orchestrator.

Status: **In progress.** The owner accepted ADR-002's user-invoked direction and ADR-004's topic definition. ADR-003, merge/split semantics, exact browser egress/retention, and bottom-up architecture costs remain open.

Acceptance: record owner disposition for every remaining item. An undecided or rejected proposal stays a visible blocker; silence is not approval.

Phase 0 gate: **limited go only** until P0.2 passes. P0.1 is complete and ADR-001/P1.1 are accepted strictly for the frozen offline fixture-only kernel, but that accepts no connected architecture or broader product behavior. Phase 0 completes only when the remaining decisions are recorded.

Stop conditions: no coherent topic boundary can be labeled; no privacy-safe discovery experiment can be designed; the cost envelope cannot be bounded; or owner/reviewer decisions invalidate the proposed sequence.

## Phase 1 — Technical spikes

Build disposable or isolated prototypes in this dependency order. Completing a local spike never authorizes external data collection, a provider call, deployment, spending, recruitment, or publication.

### P1.1 Offline resolution kernel

Owner: Semantic Resolution, reviewed by Trust and Quality.

Dependencies: ADR-001 scope; synthetic fixtures only.

Deliverable: `spikes/topic-resolution/`.

Status: **Complete at code commit `d33f010`.** One independent read-only audit
issued both Trust and Quality ACCEPT dispositions for the offline
synthetic-fixture scope, with all eight Increment A1 checks passing. The review
provenance, accepted residuals, and explicit exclusions are recorded in
`research/P1_1_GATE_REVIEW.md` and ADR-001; any code-bearing change reopens this
review.

Acceptance:

- conservative URL normalization and deterministic invalid/private-target rejection;
- exact URL and exact trusted-fixture-fingerprint resolution;
- ambiguous/title-only observations create separate provisional topics;
- one auditable source-topic link per resolution with method, confidence, version, time, and evidence;
- human/agent public counts remain separate and private invocations are excluded;
- no network, persistence, secret, raw-body, browser, or provider dependency; and
- all Increment A1 checks in `docs/PHASE_1_THREAT_MODEL.md` pass on the documented Node version.

Gate: focused tests, a static capability audit, a network/DNS-denied execution, fixture provenance review, and independent Trust/Quality review pass. Ordinary unit-test success alone does not close this gate.

### P1.2 Labeled clustering corpus and evaluator

Owner: Semantic Resolution, with Trust provenance/licensing review and Quality reproducibility review.

Dependencies: P0.1 and P1.1 domain vocabulary.

Deliverable: versioned, license-safe labels for at least 200 source-pair decisions across at least 50 story clusters, plus an evaluator that reports confusion matrix, precision, coverage/recall, Wilson interval, story-cluster bootstrap sensitivity, abstentions, latency, and cost.

Acceptance: duplicate, syndicated, updated, related-but-distinct, unrelated, and adversarial-title cases are represented; tuning and held-out splits are made by story cluster; a second reviewer checks at least 20% of labels; disagreements and provenance are retained; evaluator correctness has deterministic tests.

Gate: provenance is accepted, leakage checks pass, and another role can reproduce the deterministic baseline.

### P1.3 Extraction and fingerprint spike

Owner: Platform and Client, with Semantic input and Trust/Quality review.

Dependencies: P0.1 corpus schema and an approved public/synthetic HTML fixture corpus.

Deliverable: local extraction of reviewed fixtures, canonical-metadata candidates, versioned content fingerprints, size/type limits, and adversarial cases.

Acceptance: no live fetch; canonical metadata is evidence rather than authority; raw fixtures never enter logs; malformed, encoded, deceptive, and oversized inputs fail safely; extraction/fingerprint outputs are reproducible and conform to the P1.2 evaluator schema.

Gate: fixture provenance, parsing tests, resource limits, and Trust/Quality review pass. Any live-fetch or client-egress proposal requires a separate threat model and owner approval.

### P1.4 Semantic candidate and verification benchmark

Owner: Semantic Resolution, with Lead threshold approval and Trust/Quality review.

Dependencies: P1.2 and P1.3.

Deliverable: compare the deterministic baseline with at least one local English candidate; compare a multilingual candidate only if it addresses an observed scope risk; test a hosted candidate only after explicit egress/provider approval. Exact search precedes ANN, and candidate retrieval is measured separately from merge verification.

Acceptance: every run pins dataset/split, model/resolver version, frozen threshold, and hardware; reports the Phase 0 quality metrics, wall time, and projected cash cost at 100/1,000/10,000 MAU; and preserves source-topic evidence and reversible correction semantics.

Gate branches:

- **AUTO:** held-out automatic joins have precision at least 0.97, Wilson 95% lower bound at least 0.93, recall at least 0.50, at least 60 join decisions across at least 20 held-out clusters, and no systematic cross-event merge class.
- **ASSISTED:** the safety evidence threshold passes but held-out recall is below 0.50; results may be reviewer suggestions or curated mappings, but no automatic semantic-resolution claim is allowed.
- **NO AUTO:** safety fails or the minimum safety evidence is insufficient; semantic auto-joins remain disabled. Deterministic or curated mappings may continue only with audit and correction controls.

### P1.5 Read-only browser flow

Owner: Platform and Client, reviewed by Trust and Quality.

Dependencies: ADR-002 direction or an explicitly local-only exception; P1.1 contract; P1.3 fixture output; seeded local/mock data. Acceptance of ADR-002 does not authorize network egress.

Deliverable: one Chromium prototype against bundled fixtures or a local mock, with a browser-neutral core, exact manifest/permission inventory, and documented Firefox adapter gap.

Acceptance: minimum permissions, supported/excluded contexts, no remote requests, separate human/agent counts, navigation-race and fail-closed behavior, accessibility smoke test, and no posting, auth, AI, or telemetry. Manifest, data-flow, and egress-test artifacts feed the separate remote-lookup gate.

Gate: the applicable local manifest, eligibility, injection, rendering, navigation, and count checks in `docs/PHASE_1_THREAT_MODEL.md` pass. Owner and Trust must separately approve any connected follow-up. This slice tests user-invoked panel behavior, not passive discovery.

### P1.6 Auth, identity, moderation, and data-lifecycle design

Owner: Trust, Security, Privacy, and Policy, with Platform, Lead, and Quality review.

Dependencies: the charter invariants, `docs/DOMAIN_MODEL.md`, and the proposed local architecture boundary. No real accounts or external identity provider are used.

Deliverable: `docs/PHASE_1_AUTH_AND_DATA_LIFECYCLE_THREAT_MODEL.md` plus an ADR-ready identity/provenance and moderation-state model. Cover authentication, tenant/object authorization, human/agent actor separation, private-to-public transitions, reports/blocks, operator access, audit, account lifecycle, retention, deletion, export, backups, and incident cases.

Acceptance: a deny-by-default authorization matrix and state-transition diagrams enumerate owner/non-owner, human/agent, public/private/removed, stale/replayed, moderator, deletion/export, and backup-expiry cases; each control maps to a test owner; unresolved legal/policy issues and residual risks are explicit.

Gate: Trust and Quality approve the local test boundary and the Lead/owner records disposition of consequential identity, publication, retention, and moderation choices. This design does not authorize real identity or user data.

### P1.7 Local auth and discussion contract

Owner: Platform and Client, reviewed by Trust and Quality.

Dependencies: P1.6 and owner authorization for a disposable local architecture experiment.

Deliverable: local-only API skeleton that supplies evidence for ADR-003 and covers reading, human contribution, private agent output, and explicit publication transition.

Acceptance: deny-by-default authorization matrix; private material cannot be read or published cross-user; an agent cannot impersonate a human; separate human/agent rate classes; report/block/audit hooks; safe rendering and link-scheme tests; tested deletion/export/retention transitions; no external identity provider or network exposure.

Gate: Trust review, negative authorization tests, and integration tests pass. The evidence informs ADR-003 acceptance; neither this experiment nor ADR acceptance authorizes network exposure or real account data.

### P1.8 Local end-to-end integration

Owner: Platform and Client, with Semantic, Trust, and Quality review.

Dependencies: P1.3, P1.5, P1.7, a recorded P1.4 gate branch, and an accepted ADR-005 correction contract (or an explicitly narrower local slice with no correction claim).

Deliverable: a fully local, fixture-driven path from page observation to extraction/fingerprint, topic resolution, discussion lookup, and separate human/agent activity display. Use automatic semantic joins only in the AUTO branch; otherwise use deterministic or explicitly curated mappings.

Acceptance: happy, abstain/unmapped, malformed, ambiguous, unauthorized, private-output, removed-content, and stale-navigation cases have end-to-end tests; every mapping is traceable; corrections are reversible; and the entire slice runs with network/DNS denied.

Gate: another role reproduces the flow from a clean checkout and verifies that no unsupported quality, browser, privacy, or AI claim is presented.

### P1.9 Alpha architecture decision package

Owner: Platform and Client, with Semantic, Trust, Quality, and Lead review.

Dependencies: P1.2, P1.4, P1.7, P1.8, and approved local tooling. No external service, deployment, or purchase is implied.

Deliverable: the evidence package required by ADR-003: a measured runtime/language comparison using the local slices; exact PostgreSQL/pgvector search benchmark on the approved labeled set; managed-versus-self-hosted security/operations comparison; bottom-up low/base/high cost line items; backup/restore and deletion test plan; and reconciled auth/data-flow review.

Acceptance: commands, hardware, versions, dataset, workload assumptions, latency/resource results, costs, operational ownership, portability, failure/rollback behavior, and unresolved risks are reproducible and explicit. Hosted candidates remain paper comparisons unless separately approved.

Gate: update ADR-003 with reviewer evidence and record ACCEPT, REVISE, or REJECT. Only ACCEPT satisfies the Phase 2 architecture dependency; it still does not authorize deployment, spending, or real data.

### P1.10 BYO-AI proof of concept (optional)

Owner: Platform and Client, with Trust and Quality review.

Fake-adapter dependencies: `docs/BYO_AI_THREAT_MODEL.md`, P1.6, P1.7's local publication workflow, and explicit owner approval for the optional spike. Provider terms, credentials, and egress approval are not required because this increment has no provider, secret, or network.

Real-adapter dependencies: a passed fake-adapter gate; current provider terms/auth/data-handling research; accepted credential architecture and content-egress ADR; and separate owner approval for a real call.

Deliverable: first validate the private-to-public state machine with a deterministic fake local adapter. A real provider adapter is a separate gated increment.

Acceptance: the fake path has a provider-neutral contract, deterministic labeled output, private-by-default state, explicit preview/confirm publication with agent provenance, deny-by-default object authorization, bounded input/output/retry behavior, and prompt-injection/malicious-response tests. It makes no provider-feasibility claim.

Gate: the fake adapter may pass only the applicable local controls in `docs/BYO_AI_THREAT_MODEL.md`. The complete minimum verification must pass before any real credential/provider call. If secure handling is not credible, defer this task without blocking a human-only MVP.

Phase 1 gate: P1.8 demonstrates a reproducible local `page fixture -> observation/extraction -> topic -> discussion/counts` flow, and P1.9 records the architecture decision. The resolver branch controls product claims: AUTO enables automatic semantic joins in the approved scope; ASSISTED permits reviewer/curated mappings; NO AUTO permits deterministic/curated mappings only. A human-only path remains valid if P1.10 is deferred.

Stop conditions: no safe deterministic/curated path can test the product; a systematic false-merge class or irreversible correction remains; private/public or human/agent boundaries cannot be enforced; a credible privacy-safe discovery experiment cannot be designed; or projected cost exceeds the approved cap without repeated-use evidence.

## Phase 2 — Private alpha MVP

Objective: test the narrow product with 10–50 invited testers while preserving a human-only and curated-resolution fallback.

Owners: Lead coordinates; Platform implements; Semantic owns resolution policy; Trust owns pre-release risk review; Quality owns reproducibility and operations evidence.

Dependencies: Phase 1 gate; accepted ADR-002 connected-use gate and ADR-003 architecture; accepted exact egress, retention, logging, deletion, authentication, and moderation decisions; tested account deletion/export/retention design; a bottom-up cost model; and explicit owner approval before deployment, recruitment, real-user data collection, telemetry, or spending.

Deliverables:

- accounts and deny-by-default authorization;
- source, topic, discussion, comments/replies, reports, blocks, and audit records;
- one approved browser client;
- reversible operator-only source-link correction and topic merge/split tools before tester access;
- human/agent provenance and separate counts/rate classes;
- privacy controls, account/data export and deletion workflow, retention jobs, logs, monitoring, backup/restore, and CI;
- privacy-reviewed minimal experiment instrumentation; and
- human-only alpha by default. Enable user-invoked AI only if the applicable P1.10 real-adapter gate passes; otherwise make no AI-product claim.

Acceptance: authorization and tenant/object-isolation matrices deny all negative cases; merge/split/source-link correction preserves an audit trail and discussion integrity; account export/deletion and retention/backup expiry are exercised; restore, incident-response, and rollback drills pass; supported load stays inside an owner-accepted cash cap; and no unresolved critical/high release risk remains. Run the 14-day discovery protocol and seeding rules in `plans/PHASE_0_FOUNDATION.md` only if a separately approved observation design can produce legitimate eligible views and indicator impressions. With a user-invoked `activeTab` design, pre-register panel-utility/read/contribution measures instead and record the passive discovery hypothesis as untested.

Gate: Trust and Quality sign off, the owner accepts residual risks, and experiment evidence meets the applicable pre-registered usefulness criterion without material privacy complaints or confirmed automatic false merges above the stated limit. The discovery criterion applies only to an approved impression-capable design; panel-utility evidence must not be relabeled as discovery evidence. A result may be GO, REWORK, or STOP; tester count alone is not success.

Stop conditions: cross-user/private-data exposure; irreversible discussion corruption; uncontrolled browsing collection; unsafe moderation load; unbounded spend; failed backup/restore or deletion; or lack of repeated usefulness after an adequately exposed test.

## Phase 3 — Closed beta

Objective: test operation with hundreds of invited users, not merely add features.

Owners: Lead and Platform, with Semantic, Trust, and Quality release review.

Dependencies: Phase 2 gate; explicit owner approval for the beta cohort; account export/deletion operating successfully; and an accepted pre-beta trust/moderation plan defining reports, automated spam/abuse detection, separate human/agent rate limits, reputation consequences, appeals, block/mute, legal/takedown handling, moderator access, transparent action logs, and incident escalation.

Deliverables: onboarding; correction/merge/split workflow; moderation and appeals operations; measured ranking/reputation experiment; bounded cost controls; justified cross-browser expansion; early-community program; landing/docs; and support/incident process.

Acceptance: before recruitment, pre-register numerical retention/usefulness, abuse-queue, response-time, false-merge, reliability, and cost thresholds. During beta, measure them at participant/account level where repeated observations are correlated; audit moderator and automated actions; test abuse, appeal, takedown, rollback, deletion, and recovery scenarios; keep AI disabled or explicitly scoped to a previously passed gate.

Gate: evidence meets the pre-registered usefulness and operating thresholds, moderation and support remain manageable, resolver behavior matches its approved branch, and Trust/Quality/owner approve expansion.

Stop conditions: abuse or appeal queues exceed the operating limit; moderation cannot be explained/audited; data rights or incidents miss the approved service level; false merges exceed the approved threshold; retention is absent; or the hard cost cap is exceeded.

## Phase 4 — Mobile validation

Objective: validate whether Android and iOS can offer a useful, policy-compatible entry mechanism while reusing the same topic graph and service contracts; identical UX is not required.

Owners: Platform and Client, with Product experiment design, Trust policy/privacy review, and Quality device evidence.

Dependencies: Phase 3 evidence justifies mobile work; current official platform-policy/capability research; accepted mobile permission/data-flow ADR; and owner approval before external distribution or store submission.

Deliverables: compared entry mechanisms for each platform, minimal local or invited-test prototype for the best feasible option, accessibility and compatibility matrix, and measured discovery friction.

Acceptance: exact permissions and data egress are documented and tested; supported OS/device claims have device evidence; the prototype preserves topic/discussion, provenance, privacy, and correction semantics; and the experiment compares discovery/open/engagement friction with desktop using pre-registered definitions.

Gate: choose GO for a platform only if usefulness and policy/permission burden fit the approved envelope. A platform-specific NO-GO is an acceptable result and must not weaken the shared model.

Stop conditions: required permissions or store policy are incompatible with the privacy posture; background observation is required without approval; accessibility or reliability is inadequate; or measured value does not justify platform cost.

## Phase 5 — Public launch

Objective: perform a reversible, progressively exposed release after private evidence—not a one-step unrestricted launch.

Owners: Lead owns the decision package; Platform and Quality own release/operations; Trust owns security/privacy/moderation readiness; owner gives the final launch authorization.

Dependencies: applicable Phase 3/4 gates; current security and dependency review; privacy notice/terms and qualified legal review where needed; moderation/takedown and support staffing; store-policy review; production observability; tested backups/restores and incident response; abuse defenses; cost alarms; capacity evidence; and rollout/rollback plan.

Acceptance: release candidate is reproducible; migration, backup restore, deletion/export, security incident, moderation escalation, and rollback drills pass; dashboards and hard cost/rate limits are exercised; public claims match measured platform/resolver/AI capabilities; staged cohorts have explicit pause/rollback thresholds. Unrestricted third-party agent posting is off.

Gate: Trust and Quality provide evidence, the Lead reconciles residual risks, and the owner explicitly approves each production deployment, store submission, public announcement, and paid commitment.

Stop conditions: unresolved critical/high security or privacy risk; untested recovery; unclear takedown/incident ownership; insufficient moderation/support capacity; cost cap breach; misleading capability claims; or rollback cannot protect data integrity.

## Phase 6 — Platform and agent ecosystem

Objective: expose bounded third-party capabilities only after the core human product has durable usefulness and operational evidence.

Owners: Platform/API with Trust, Quality, Semantic, and Lead review.

Dependencies: stable post-launch operations; accepted agent identity/permission/monetization ADRs and threat model; developer abuse and support model; owner approval for any marketplace, billing, or external developer program.

Deliverables: versioned SDK/API; agent registration and narrow scopes; operator/agent provenance; quotas, budgets, revocation, reputation, moderation, and audit; sandbox/test environment; developer documentation; and measured multi-provider adapters only where justified.

Acceptance: contract and compatibility tests pass; agents cannot impersonate humans, access private material, silently publish, recursively invoke, or evade rate/cost controls; compromised agents can be disabled without corrupting discussions; marketplace/billing and provider claims have current policy, security, and operations evidence.

Gate: staged developer access begins only after adversarial review, incident/kill-switch drills, support readiness, and explicit owner approval. Expand scopes individually from evidence.

Stop conditions: identity/provenance ambiguity; uncontrolled autonomous posting or spend; inadequate revocation/moderation; ecosystem abuse harms the human product; or operating/legal burden exceeds the accepted envelope.
