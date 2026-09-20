# ADR-001: Begin with an offline topic-resolution kernel

Status: Accepted for offline P1.1 only

Date: 2026-09-19

Owners: Lead/orchestrator, semantic/evaluation, trust/security

## Context

Phase 0 is not complete enough to authorize a connected browser client, production backend, semantic provider, or BYO-AI integration. The owner has nevertheless explicitly asked to start implementation. The core domain needs an executable test before selecting infrastructure.

## Decision

Implement a disposable, dependency-free, client-neutral kernel under `spikes/topic-resolution/`.

For synthetic fixture observations it performs conservative HTTP(S) URL normalization, exact normalized-URL lookup, exact fingerprint topic lookup with explicit synthetic-fixture evidence, and fail-separate provisional topic creation. A topic owns one discussion in this spike. Each source-topic link records method, confidence, resolver version, mapping-creation time, and evidence. Public human and agent counts remain separate and exclude private AI activity.

The spike performs no network requests, server-side fetches, persistence, authentication, public posting, semantic/AI calls, secret handling, or raw-body storage. A title match is never sufficient to merge topics.

## Alternatives considered

- Build the browser extension first: rejected because observation/egress permissions and the discovery metric are unresolved.
- Build an API/database skeleton first: rejected because it would encode premature storage/auth choices without testing resolution invariants.
- Start with embeddings: rejected because there is no labeled dataset or deterministic baseline against which to measure them.
- Continue documentation only: rejected because the owner authorized implementation and an offline kernel gives evidence at low risk.

## Consequences

- We gain executable domain invariants and a baseline for later semantic evaluation.
- The code is explicitly a spike and need not become the production package.
- Exact fingerprints plus their fixture-evidence records model a trusted test signal. The evidence value is only an assertion inside this synthetic boundary; a later extraction/fingerprint design must define how production trust is established.
- The spike does not validate semantic clustering or the user experience.

## Review state

The owner's instruction to start implementation authorized this isolated, reversible experiment. Independent review identified correctness and plan issues and verified their corrections. A fixture inventory records synthetic provenance, and the full suite passes under a process guard that actively denies network, DNS, HTTP, subprocess, fetch, and WebSocket capabilities. A package-local high-confidence credential scan self-tests its detectors and reports zero findings. Hostile-input and boundary tests cover every A-PARSE-01 category, while a deterministic 768-case URL matrix establishes repeatability, idempotence, and origin preservation for A-URL-02. That work exposed and fixed normalized-output byte-limit behavior; the auditable resolver marker is consequently `topic-resolution-spike/1.0.1`.

One independent read-only reviewer applied both the Trust and Quality lenses on 2026-09-20 and issued ACCEPT dispositions for P1.1 code commit `d33f010`; this was one reviewer serving two review roles, not two independent people. The durable review record is `research/P1_1_GATE_REVIEW.md`. On Node 24.19.0 all eight Increment A1 checks passed, the restricted suite passed 70/70, the ordinary suite passed 69 with the guard-only test skipped, the scanner checked 21 files with zero findings, and the pilot evaluator retained TP=4, FP=0, TN=16, FN=4. The Lead records the offline P1.1 gate complete.

Accepted residuals for this disposable offline scope are: the capability guard is process-level rather than an OS network namespace; the scanner is package-local and format-limited; synthetic fingerprint evidence is a fixture assertion rather than production attestation; hostname checks make no DNS query and are not production SSRF/rebinding protection; finite matrices cannot prove every runtime/Unicode behavior; and provenance acceptance covers only the current project-created synthetic fixtures. Any code-bearing change reopens review. A-EVAL-01, public/licensed corpus provenance, automatic semantic joins, correction execution, browser/service B controls, rendering/prompt safety, connected behavior, and real data remain outside this acceptance.

## Security/privacy/cost impact

External spend and data egress are zero. Test inputs are synthetic fixtures. Unsupported schemes, URL credentials, obvious local/special-use hosts, and literal private-network targets are rejected. DNS names are not resolved, so this is deliberately not a production SSRF or network-eligibility control. No secrets are needed.

## Validation / rollback

Run `npm test`, `npm run test:restricted`, and `npm run check:secrets` in `spikes/topic-resolution/`. Acceptance tests cover URL variants without reordering retained query data, exact-fingerprint joins across synthetic sources, fail-separate behavior, title non-merging, provenance, public count separation, exact and multibyte limits, deeply nested hostile data, mixed encodings, and invalid/local URL forms. The restricted suite combines the static capability audit with an active process guard; repeat under an OS-level network sandbox in CI when available. The local secret scanner covers only its documented high-confidence formats, so repository-host scanning remains a release control.

Rollback is deletion of the isolated spike; it has no migration or external state.
