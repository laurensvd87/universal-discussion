# ADR-007: Use a digest-bound local ledger for owner labeling

Status: Accepted for the offline workflow and generated-only P1.2b-1 preflight;
real/public acquisition and real review completion remain unauthorized

Date: 2026-09-21

Owners: Semantic Resolution, Trust, Quality, Lead / Product Orchestrator

Owner disposition: ACCEPT on 2026-09-21. The owner authorized generated-fixture
P1.2b-1 implementation only and disclosed that the project currently has one
human builder. Synthetic tests may use clearly declared fixture identities,
but one person changing role names is not independent review. No real/public
metadata acquisition, real secondary review, adjudication, corpus
materialization, split freeze, or evaluation is authorized by this decision.

## Context

P1.2 needs at least 200 pair decisions across at least 50 story clusters, with
independent review, adjudication, provenance, and later cluster-separated
evaluation. The frozen corpus contract can validate that final state, but
asking the owner to construct its nested JSON would mix collection mechanics,
hidden case metadata, and relationship judgment. A mutable spreadsheet or one
session JSON file would also make order, secondary-review sampling, restarts,
and overwritten answers difficult to audit.

The roadmap now requires a prepared task in which the owner only decides
`same-topic`, `different-topic`, or `uncertain`, and requires work to stop at an
owner checkpoint before any held-out split or automatic-join decision.

## Decision

Use a separate, versioned offline review workflow before materializing
`labeled-story-corpus/1.0.0`. Keep the corpus contract unchanged.

Ingest exact, bounded UTF-8 TSV configuration, Source metadata, and opaque pair
inventories. Restrict metadata to a corpus-compatible English editorial subset
with reviewed provenance. Prepare an immutable canonical task digest,
deterministically order opaque review items, and select at least 20% of pair
IDs for future secondary review before any label exists.

Present the owner only the topic definition, opaque review-item ID, and each
Source's normalized public URL, title, fact summary, and publication time.
Withhold case types, cluster/fingerprint/provenance internals, secondary-sample
membership, previous decisions, and expected labels.

Record each primary answer immediately as a task-bound, digest-chained,
append-only event. Generate its bounded rationale, caller-declared reviewer,
and local unattested timestamp in the workflow so the owner supplies only the
relationship. Treat `uncertain` as unresolved history, never as a guessed
binary label.

For this first increment, implement only `prepare`, `owner`, and `status`.
Always report corpus, split, held-out, evaluation, automatic-join, and gate
state as false. Do not add secondary review, adjudication, finalization, corpus
export, split freeze, or evaluation until the prepared real task reaches the
recorded owner checkpoint and the next increment is separately reviewed.

Generated-fixture design and pure preflight tests for those later stages may be
prepared before a real task exists. Actual secondary decisions, adjudication,
or corpus materialization cannot be claimed before the primary task is
presented and its ledger exists. The real task also needs a precommitted ranked
secondary coverage reserve plus accepted acquisition-plan and
provenance-inventory digests; v1's exact 20% sample and declarations alone are
intentionally insufficient for attrition-prone collection.

## Alternatives considered

- Ask the owner to edit corpus JSON: rejected because it exposes implementation
  structure, invites malformed or overwritten state, and violates the revised
  owner-only relationship task.
- Store current answers in one mutable JSON document: rejected because a crash,
  stale process, or edit can replace history and obscure review chronology.
- Use a spreadsheet as the authoritative ledger: rejected for this increment
  because formulas, hidden columns, sorting, concurrent edits, and platform
  metadata complicate deterministic blinding and append-only evidence. TSV is
  accepted only as strict inert intake, not authoritative decision state.
- Use a hosted form/database: deferred because accounts, access control,
  retention, egress, operations, and spending are not approved and are
  unnecessary for the local owner task.
- Show case type or reject an answer immediately when it conflicts with hidden
  gold structure: rejected because that leaks the expected relationship and
  biases primary review. Later independent review/adjudication must retain the
  original answer.

## Consequences

- The task digest and pre-label selection make queue order and planned review
  coverage reproducible.
- The owner can resume after every answer without editing JSON or supplying
  identity, time, or rationale fields.
- Original `uncertain` answers and reviewer disagreements can be preserved for
  later adjudication rather than silently coerced.
- The task file necessarily retains hidden internals. Interface blinding is not
  secrecy from someone who opens local state or repository fixtures.
- The six-pair project-created task proves mechanics only. It does not satisfy
  collection size, cluster count, independent review, provenance, held-out, or
  quality gates and must not trigger the roadmap checkpoint.
- A later materializer must derive/validate clusters and reconcile case types,
  binary decisions, secondary reviews, and adjudications without changing
  Source metadata or deleting ledger events.

## Security/privacy/cost impact

The pure task and ledger contracts have no filesystem, process, network, DNS,
browser, secret, or provider capability. The local adapter reads only explicit
bounded TSV/state paths and writes an exclusive workspace. Events are written
and synchronized before an exclusive same-volume hard link publishes a fixed
sequence filename. Task/event mutation, replay, gaps, and stale concurrency
fail validation.

Terminal rendering escapes control and bidirectional formatting characters,
and reviewer-facing objects use an exact field allowlist. Page titles and fact
summaries remain untrusted data. No raw article text, personal data, private
URL, credential, prompt execution, telemetry, or remote call belongs in this
increment.

Reviewer IDs and timestamps are declarations, not authentication or external
attestation. Unkeyed hashes prove internal consistency, not authorship. The
workflow rejects inconsistent edits and gaps, but a local administrator can
replace the workspace with a fully recomputed alternative history or valid
suffix truncation. Such replacement can re-present a previously answered item
unless the result is compared with an independently retained digest. The
workflow creates no automatic/general anchor and is not a hardened audit
service. There is no cash spend or provider account.

## Validation / rollback

Required evidence includes deterministic task/order/digest and pre-label 20%
selection; strict UTF-8/TSV and corpus-compatible metadata bounds; exact
reviewer-view allowlisting and inert rendering; pending-provenance denial;
append-only digest-chain, replay/tamper/backdate/order tests; atomic restart and
concurrent-session checks; truthful checkpoint non-claims; static capability
separation; the full restricted suite; fixture inventory; and TSV secret
scanning.

The checked-in TSV task is synthetic and reserved-domain only. Rollback is
removal of the isolated review modules, scripts, fixtures, tests, contract, and
ignored local workspaces. The frozen corpus/split/evaluator contracts require
no migration because this increment writes none of their artifacts.

## Implementation evidence recorded 2026-09-21

The owner completed the checked-in synthetic dry run once. Local `status`
validation reports 6/6 answers, six binary decisions, zero uncertainty, task
digest
`sha256:b734d983f3fcc9fece8ef6235ee7cac896e2dc7ab049313da637a72c157cb9ad`,
and final session digest
`sha256:d8ad7c504df9a52af041d676ef2368cc036a3ba4ac865e682fa30b1557af9698`.
The fixture task and provenance-review dates are 2026-09-20 so the unattested
2026-09-21 local event times do not predate the task. The ignored local ledger
is not committed and no repeated owner run is required. Recording the final
session digest in this version-controlled decision provides a manual anchor
for this one run; it does not add automatic anchoring to the workflow.

The generated-only successor preflight also includes a separate pure bridge
that can bind a completed v1 primary ledger and exercise an ordered first
synthetic secondary pass over the precommitted initial coverage set. This is
schema and state-machine evidence only. It records zero eligible independent
human decisions and does not expand this ADR's authorization to real metadata,
real secondary review, reserve activation, rereview, adjudication, corpus
materialization, split, evaluation, or a quality claim.
