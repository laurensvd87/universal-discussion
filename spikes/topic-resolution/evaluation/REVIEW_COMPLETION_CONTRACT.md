# Generated Review-Completion Preflight Contract

Versioned implementation boundary:

- `story-acquisition-plan/1.0.0`
- `story-source-provenance-inventory/1.0.0`
- `story-review-completion-task/1.0.0`
- `story-review-completion-ledger/1.0.0`
- `story-review-completion-event/1.0.0`
- `story-review-completion-state/1.0.0`
- `story-review-resolution-journal/1.0.0`
- `story-review-resolution-event/1.0.0`
- `story-review-resolution-action/1.0.0`
- `story-review-resolution-state/1.0.0`
- `story-generated-review-presentation/1.0.0`

Status: the immutable pre-review artifact chain is implemented for generated
fixtures only. A pure bridge from a completed v1 primary ledger can record the
first synthetic secondary pass over the task-precommitted initial coverage set.
A pure successor journal can now resolve generated primary or secondary
uncertainty through one provenance-reviewed synthetic supplement and same-role
rereview, derive unresolved exclusions, and finish the initial secondary queue.
It stops at adjudication or initial-resolution completion. Adjudication,
reserve activation, cluster projection, corpus materialization, completion
receipts, and downstream receipt-bound wrappers remain unimplemented.

Owner authorization: P1.2b-1 generated-fixture preflight only. Real/public
metadata acquisition and real review activity remain unauthorized.

## Purpose

The accepted v1 owner workflow proves primary-review mechanics but contains
only declaration-level provenance and an exact 20% preselection. It must not be
repurposed as a real benchmark by supplying more rows. This preflight adds a
strict immutable chain before any later completion logic:

```text
generated acquisition-plan envelope
        -> generated provenance-inventory envelope
        -> accepted v1 primary-task envelope
        -> generated completion-task envelope
        -> completed v1 primary ledger
        -> generated completion-ledger envelope
        -> generated resolution-journal envelope
```

Every arrow is checked by exact canonical SHA-256 bindings. The implementation
is a pure in-memory contract with no filesystem, process, network, DNS,
browser, provider, credential, or AI capability.

## Acquisition plan

The acquisition-plan envelope is:

```text
{ digestAlgorithm, acquisitionPlanDigest, acquisitionPlan }
```

The plan records:

- the generated-only decision reference, scope-decision digest, and explicit
  caller-declared owner/Trust actors and acceptance times;
- four distinct caller-declared `synthetic-fixture-role` identities for
  primary, secondary, adjudication, and provenance;
- exactly one opaque acquisition stratum per candidate Source;
- exact pair endpoints, hidden case quota, and positive-construction flag;
- derived Source, pair, stratum, positive, and per-case counts; and
- a committed coverage nonce plus fixed 30% initial and 20% eligible coverage
  fractions.

Assignments are sorted before hashing. All six case-count fields are present,
including zeroes. Positive-construction flags are permitted only for duplicate
and syndication cases, and their endpoints must share a planning stratum.
Strata are collection-planning inputs, not gold clusters or relationship
labels.

This contract derives and verifies counts; it does not claim that a small
generated fixture meets the later 250-pair/60-stratum preparation target.

## Provenance inventory

The provenance-inventory envelope is:

```text
{ digestAlgorithm, provenanceInventoryDigest, provenanceInventory }
```

It binds the acquisition-plan digest and contains exactly one record for every
planned Source, including `accepted`, `rejected`, and `pending` dispositions.
This implementation permits only project-created metadata on normalized,
query-free reserved example domains. Each record fixes:

- the exact owner-visible Source projection—ID, URL, title, fact summary,
  publication time, and provenance—and its canonical digest;
- `project-created` rights and a null external origin/evidence URL;
- the exact retained metadata field allowlist;
- no copied article text, no personal data, repository approval, and
  minimum-data necessity declarations;
- a deterministic digest of the declaration record and exact Source
  projection;
- a caller-declared binding to the checked fixture-manifest version/digest,
  explicitly without runtime file verification;
- capture/review chronology; and
- the committed synthetic provenance reviewer and bounded rationale.

The declaration-record assurance is
`caller-declared-project-created-not-externally-verified`; it is not provenance
proof. Public availability, a URL, a self-hash, or a global `accepted` string
cannot satisfy a real inventory. Supporting real metadata requires a
separately approved successor contract and exact rights/privacy evidence; it is
intentionally rejected here.

## Completion task

The completion-task envelope is:

```text
{ digestAlgorithm, completionTaskDigest, completionTask }
```

It embeds and revalidates the unchanged `story-review-task/1.0.0` envelope,
then binds:

- the acquisition-plan digest;
- the provenance-inventory digest; and
- the primary-task digest.

Every accepted owner-visible Source field, pair ID/endpoint/case type, the
three v1 reviewer IDs, and the accepted provenance reviewer must agree across
the artifacts. Rejected and pending Sources and their affected pairs remain in
an auditable selection/exclusion projection and cannot enter the task. The
required chronology is publication <= evidence capture <= record review <=
inventory creation <= global provenance acceptance <= task preparation. Every
Source must still have safe project-created synthetic provenance.

The full secondary coverage priority is derived by domain-separated canonical
hash ranking over the plan digest, committed nonce, and pair ID. The first
`ceil(pairCount * 300000 / 1000000)` IDs form the initial coverage set; every
remaining ID is retained in rank order as the reserve. This supersedes neither
the v1 file nor its local owner interface. Later activation must be recorded by
the not-yet-implemented completion journal.

The completion-task scope explicitly reports all of the following as false:

- independent human review verified;
- owner checkpoint reached;
- primary, secondary, or adjudication completion;
- corpus materialization;
- held-out or split-frozen state;
- evaluation or gate eligibility; and
- real-metadata authorization.

## Completed-primary bridge and initial secondary pass

`story-review-completion-ledger/1.0.0` is a separate pure contract; it does not
change the accepted v1 workflow, files, workspace, or CLI. Creating it requires
the exact v1 primary queue to be complete, including any `uncertain` answers.
The ledger binds the completion-task digest and a recomputed primary-ledger
session digest, event count, last event digest, and completion time. It also
records the task-derived initial-coverage IDs exactly and in order. Their
logical activation time is the completion-task creation time, explicitly as a
derived precommitment rather than an externally witnessed timestamp.

This increment accepts only a first-pass `secondary-decision` event for the
next initial-coverage ID. Each event:

- follows an already completed binary primary event for that exact pair;
- binds the exact primary event, primary session, completion task, predecessor,
  generated secondary role, and unattested local timestamp;
- accepts `same-topic`, `different-topic`, or `uncertain` with a generated
  rationale; and
- is appended only when the command's expected digest matches the supplied
  completion-ledger envelope, rejecting a mismatched stale command.

That last check is command/envelope consistency, not concurrency control. The
contract is pure and stateless: two callers can append different answers to
the same valid predecessor and create two valid forks. A later persistence
adapter must serialize and atomically publish one successor. No such adapter
or external latest-ledger anchor exists in this increment.

The secondary view exposes only URL, title, fact summary, publication time,
the topic definition, and the three choices. It withholds the primary answer
and rationale, case type, provenance internals, coverage basis/rank, expected
answer, and reviewer identifiers. A primary `uncertain` blocks secondary
presentation in this increment rather than being skipped or coerced.

The generated completion state retains primary and secondary uncertainties
and binary disagreements as pending obligations. Synthetic binary answers
remain explicitly separate from eligible independent-human-review decisions,
whose count is always zero. Initial-pass completion cannot set secondary
completion, adjudication, corpus, checkpoint, split, evaluation, or gate
claims. Reserve IDs are reported, but no API can activate them.

As with the v1 local ledger, unkeyed digest chaining detects inconsistent or
partially recomputed mutation, gaps, and reordering. It is not a signature and
does not authenticate the reviewer or history. A local actor can construct a
fully recomputed alternative fork, rewrite, or suffix truncation that validates
without an independently retained latest digest. The state reports absent
concurrency control, unkeyed-digest authenticity, and unanchored history
directly. No external anchor is created by this increment.

## Generated resolution journal

`story-review-resolution-journal/1.0.0` freezes the exact completion-ledger
prefix and continues its sequence and predecessor digest through one logical
head. It binds the acquisition plan, provenance inventory, primary task and
session, completion task, initial activation snapshot, and base ledger. Base
events are neither copied nor reopened.

The deterministic next-action projector permits only this order:

1. resolve every primary `uncertain` answer in primary-task order, including
   reserve pairs;
2. finish the missing initial secondary decisions in activation order,
   skipping only a pair with a causally derived primary exclusion;
3. resolve secondary `uncertain` answers in activation order;
4. return the first binary disagreement as `adjudication-required`; or
5. return `initial-resolution-complete`.

An uncertainty receives exactly one bounded evidence supplement and one
same-role rereview. The supplement carries two Source-keyed, project-created
synthetic addenda; explicit no-copied-text/no-personal-data declarations; the
committed synthetic provenance role; and capture/review chronology. It cannot
replace a Source, URL, task field, label, or earlier event. The rereview accepts
the same three relationship choices. A second `uncertain` answer is preserved
and deterministically projects a role-specific exclusion; a reviewer cannot
choose exclusion directly.

Every command binds the expected journal digest and exact next-action digest.
Each event binds that action, the immutable journal inputs, global sequence,
predecessor, actor, item, and unattested local time. This is invocation
consistency, not atomic persistence: two valid successors can still fork, and
a fully recomputed alternative history or suffix truncation can validate.

Only the nested `reviewView` is reviewer-safe. It contains the topic definition,
three choices, pair ID, and each Source's URL, title, fact summary, publication
time, and ordered synthetic evidence addenda. The coordinator action around it
also contains internal causal digests and coverage position and must not be
rendered as a reviewer view. No earlier label, rationale, role identity, case
type, provenance internals, or expected answer enters `reviewView`.

The generated state always credits zero eligible independent-human decisions
and keeps every real-metadata, checkpoint, secondary-completion, adjudication,
corpus, split, evaluation, automatic-join, and gate claim false. This contract
has no persistence adapter, authentication, signature, external latest-head
anchor, CLI, real reviewer, or real data capability.

## Solo-builder and identity boundary

The owner currently develops the project alone. Different strings used by one
person are not independent reviewers. Therefore this increment requires every
exercised role to identify itself as a synthetic fixture role and reports
`independentHumanReviewVerified: false`.

These identities validate schema and separation mechanics only. They are not
human labels, AI labels, Trust approval, adjudication, or evidence that the
future 20% independent-review requirement has been met. Human and AI roles in
any successor must remain explicitly typed and provenance-distinct.

## Safety and validation

All contracts reject unknown fields, inherited or accessor-bearing data,
sparse arrays, cycles, unsupported values, oversized structures, malformed
identifiers/digests/timestamps, duplicate IDs/pairs, unsafe URLs, reviewer
collisions, false target counts, digest rebinding, and cross-artifact drift.

Run the focused checks with:

```powershell
node --test --test-isolation=none test/boundary.test.js test/review-completion-task.test.js test/review-completion-ledger.test.js test/review-resolution-journal.test.js
```

The full ordinary and restricted suites plus the local secret scanner remain
required before this increment can pass its technical gate.

## Still open

This increment does not provide a CLI or write any artifact. It does not add:

- adjudication or its blinded presentation;
- reserve coverage activation;
- fixed-point reserve activation;
- provenance/graph-derived exclusions beyond the implemented unresolved-role
  cases, gold-cluster consistency, or corpus projection;
- a review archive or completion receipt; or
- receipt-bound split or evaluation-policy successor wrappers.

Those are subsequent generated-only P1.2b-1 increments. Real collection and
review remain separately gated by the accepted plan.
