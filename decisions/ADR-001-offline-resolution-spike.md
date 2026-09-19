# ADR-001: Begin with an offline topic-resolution kernel

Status: Proposed; implementation experiment authorized, review gate open

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

The owner's instruction to start implementation authorized this isolated, reversible experiment. It did not waive the repository rule that an ADR is accepted only after required reviewer sign-off. Trust review supports the offline boundary in principle. Independent review identified correctness and plan issues; after correction, a final consistency/code re-review found no remaining concrete blocker. A fixture inventory now records synthetic provenance, and the full suite passes under a process guard that actively denies network, DNS, HTTP, subprocess, fetch, and WebSocket capabilities. Formal Trust acceptance, a dedicated secret-scanner run, broader adversarial parsing/fuzz coverage, and final gate acceptance remain open, so this ADR and P1.1 remain proposed/in progress.

## Security/privacy/cost impact

External spend and data egress are zero. Test inputs are synthetic fixtures. Unsupported schemes, URL credentials, obvious local/special-use hosts, and literal private-network targets are rejected. DNS names are not resolved, so this is deliberately not a production SSRF or network-eligibility control. No secrets are needed.

## Validation / rollback

Run `npm test` and `npm run test:restricted` in `spikes/topic-resolution/`. Acceptance tests cover URL variants without reordering retained query data, exact-fingerprint joins across synthetic sources, fail-separate behavior, title non-merging, provenance, public count separation, input bounds, and invalid/local URL forms. The restricted suite combines the static capability audit with an active process guard; repeat under an OS-level network sandbox in CI when available.

Rollback is deletion of the isolated spike; it has no migration or external state.
