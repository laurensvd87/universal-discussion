# ADR-008: Use one versioned journal for generated review resolution

Status: Accepted for generated-only P1.2b-1 implementation; real/public
acquisition, human review, and corpus completion remain unauthorized

Date: 2026-09-21

Owners: Semantic Resolution, Trust, Quality, Lead / Product Orchestrator

Owner disposition: the owner's 2026-09-21 direction authorizes continuation of
the generated-only P1.2b-1 workflow and requires a stop before the future
provenance-approved 200-to-250-pair task. It does not authorize real/public
metadata use, real reviewer activity, deployment, spending, or publication.

## Context

The first generated completion bridge binds a finished synthetic primary
ledger and records the ordered initial secondary pass. The remaining generated
preflight must preserve primary or secondary uncertainty, permit bounded
evidence supplements and same-role rereview, stop for adjudication, and later
activate reserve coverage without allowing any of those transitions to rewrite
earlier history.

Separate mutable ledgers for rereview, adjudication, and reserve activation
would make their causal order ambiguous. An exclusion changes the provisional
eligibility denominator; that denominator determines the independent-review
requirement; and reserve activation creates a new secondary-review obligation.
Those transitions therefore need one ordered head even when their schemas are
introduced in small reviewed increments.

The completed six-pair owner exercise is not reopened. It had six binary
answers and no uncertainty, so this decision concerns generated successor
contracts and adversarial fixtures only.

## Decision

Use one append-only, canonically digested review-resolution journal after the
frozen completion-ledger prefix. The journal binds every upstream artifact and
session digest, the initial activation snapshot, the base prefix event count
and last event digest, and the next initial-coverage position. Its first event
continues the global sequence and predecessor chain rather than copying or
reopening a base event.

Implement the journal as versioned segments so each increment can stay small.
A successor segment must bind the predecessor contract version, journal digest,
event count, and last event digest. It retains prior bytes, digests, sequence,
and semantics unchanged and continues the single global head. Parallel mutable
heads are not part of the contract.

Version 1 permits only these generated-fixture transitions:

1. append exactly one pair- and role-bound evidence supplement for an existing
   `uncertain` decision;
2. let that same committed synthetic role append exactly one rereview decision
   of `same-topic`, `different-topic`, or `uncertain` against the resulting
   presentation digest; and
3. append the remaining initial secondary decisions in their precommitted
   activation order after all primary uncertainty is terminal.

Reviewers never choose an exclusion. A second `uncertain` result deterministically
projects an exclusion with either
`primary-remained-unresolved-after-supplement` or
`secondary-remained-unresolved-after-supplement`. The original uncertainty,
supplement, and rereview remain in the journal. A binary rereview becomes the
effective decision for that role; it does not mutate the earlier event.

Each supplement contains only bounded, project-created synthetic addenda keyed
to the two existing Source IDs. It cannot add or replace a Source, URL, body,
label, case type, or hidden task field. It records a synthetic provenance-review
declaration, and its digest combines with the unchanged safe base presentation
to form the presentation digest to which the rereview binds.

A deterministic projector exposes the only valid next action. Version 1 uses
this order:

1. resolve primary uncertainty in primary-task order, including reserve IDs;
2. continue the frozen initial-secondary prefix in activation order, skipping
   a pair only after a causally derived primary exclusion;
3. resolve secondary uncertainty in activation order;
4. stop at the first binary disagreement with `adjudication-required`; or
5. otherwise report `initial-resolution-complete`.

Every append command binds both the expected journal digest and the exact next
action digest. This prevents applying a command to a different view in one
pure invocation, but it is not persistence-level compare-and-swap.

A later version may add independent adjudication, but only from a version 1
terminal action. Its view must hide both role answers, rationales, identities,
case data, and coverage rank, and its result must preserve all prior events.
Before reserve activation, implement a separate read-only eligibility projector
that derives all statuses, exclusions, numerator, denominator, required count,
and next reserve ID from bound artifacts. Only a subsequent version may append
the exact next-ranked activation, followed by its secondary obligation, and
repeat that fixed-point calculation. Primary rereview and adjudication never
count as independent coverage.

## Alternatives considered

- Implement uncertainty, adjudication, and reserve activation in one large
  change: rejected because the combined state machine is harder to review and
  rollback safely.
- Give each stage its own mutable ledger/head: rejected because competing heads
  can obscure causal order and denominator-changing transitions.
- Let a reviewer directly choose `exclude`: rejected because it creates
  discretionary attrition. Exclusion must be a deterministic projection of
  preserved evidence and terminal workflow states.
- Activate reserve items before an executable eligibility projection exists:
  rejected because callers could supply convenient counts or IDs after seeing
  outcomes.
- Change the accepted v1 owner workflow or base completion ledger: rejected.
  The successor binds them as immutable inputs.

## Consequences

- Uncertainty, supplements, rereview, later adjudication, and later activation
  can be reconstructed in one causal order.
- Source projections remain immutable while a narrowly versioned presentation
  can carry additional synthetic evidence.
- The v1 increment deliberately stops before adjudication or reserve activation
  and cannot complete a corpus.
- A pure function can still produce two individually valid successor forks from
  the same expected digest. A durable single-writer adapter, authentication,
  authorization, signatures, and an independently retained latest-head anchor
  remain future requirements.
- Unkeyed digests expose inconsistent edits but do not prove authorship and do
  not prevent a fully recomputed alternative history or suffix truncation.

## Security/privacy/cost impact

The generated contract is dependency-free and pure. Its scope accepts only
project-created synthetic metadata on reserved domains and provides no file,
network, DNS, browser, subprocess, provider, secret, account, deployment, or
payment capability. Reviewer and provenance-review identities and timestamps
remain caller-declared and unattested.

Safe reviewer views use exact field allowlists and recursively reject unknown
or hidden data. Source text and synthetic addenda remain untrusted strings.
This interface blinding is not secrecy from a caller that already possesses the
underlying local artifacts.

The state must always report zero verified independent-human reviews and false
for real acquisition, corpus, split, evaluation, automatic-join, and gate
evidence. No generated role alias may be represented as a second person.

## Validation / rollback

Version 1 requires tests for empty, partial, and complete frozen prefixes;
primary and secondary uncertainty; one pair-bound provenance-reviewed
supplement; Source immutability; same-role enforcement; deterministic exclusion;
continued-secondary order; disagreement stops; recursive blinding; chronology;
digest, replay, fork, rewrite, and truncation residuals; invalid transitions;
resource bounds; capability denial; and every non-claim above.

Each code-bearing segment requires focused and full restricted verification,
secret scanning, and an independent read-only Trust/Quality engineering review.
That review is not human corpus labeling or a substitute for the future
independent reviewer. Rollback removes only the new successor module, tests,
and generated contract records; it does not change the completed synthetic
owner ledger or any earlier artifact.

## Implementation evidence recorded 2026-09-21

Version 1 is implemented at commit `f71b7e2`. It freezes empty, partial, and
complete base-secondary prefixes; preserves one global sequence/head; resolves
generated primary and secondary uncertainty through one bounded
provenance-reviewed supplement and same-role rereview; derives terminal
unresolved exclusions; continues the remaining initial-secondary queue; and
stops at adjudication or initial-resolution completion.

Verification passed 39/39 focused checks, the full ordinary suite at 181
passes plus one expected restricted-harness skip, the restricted suite at
182/182, and the secret scanner across 67 files with zero findings after six
self-tests. A separate read-only AI reviewer issued Trust/Quality ACCEPT with
no critical, high, or medium finding. The accepted low residual is superlinear
prefix replay, bounded to 1,000 entries for this generated target and requiring
a benchmark/refactor before materially larger use. The durable review record is
`research/P1_2B1C_ENGINEERING_REVIEW.md`.

This implementation and review grant no real-data authority and no independent
human, corpus, split, evaluation, semantic-quality, automatic-join, deployment,
spending, or publication evidence.
