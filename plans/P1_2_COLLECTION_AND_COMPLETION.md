# P1.2 Collection and Review-Completion Plan

Status: Accepted for generated-fixture-only P1.2b-1 implementation; no
real/public metadata collection is authorized or present.

Date: 2026-09-21

Owners: Semantic Resolution, Trust, Quality, and Lead / Product Orchestrator

Owner disposition: ACCEPT on 2026-09-21 for P1.2b-1 only. The owner is
currently the project's sole human builder. Generated fixtures may exercise
distinct declared test identities, but they are not real reviewers and cannot
establish independent corpus review. Real acquisition and P1.2b-2 through
P1.2b-4 remain blocked on their separate gates.

Dependencies: accepted topic definition in ADR-004; owner disposition of
ADR-007; explicit acquisition authorization; Trust approval of the exact
acquisition plan and provenance inventory; named independent reviewers.

## Decision summary

Do not prepare the real owner queue from the current
`story-review-workflow/1.0.0` contract yet. Its six-pair task proves local
primary-review mechanics, but a real task needs three additions before it is
credible:

1. reviewed acquisition-plan and provenance-inventory digests rather than
   declarations alone;
2. collection and review headroom above the bare 200-pair, 50-cluster, and 20%
   independent-review minima; and
3. a completion archive/receipt that preserves `uncertain` and disagreement
   history while projecting only resolved binary decisions into the unchanged
   `labeled-story-corpus/1.0.0` schema.

This document designs those additions. It collects no data, starts no review,
materializes no corpus, and performs no split or evaluation.

## Why the minimum is not the collection target

The corpus gate requires at least 200 eligible binary pairs, 50 eligible gold
clusters, all six case types, and independent review of at least 20% of eligible
pairs. A task containing exactly 200 pairs can fall below the gate as soon as
one pair remains uncertain, has an unresolved disagreement, fails provenance,
or contradicts its final cluster graph. Selecting exactly 20% before review can
also fall below 20% of the final eligible set when selected pairs are excluded.

The proposed preparation targets are therefore:

| Measure | Contract minimum | Preparation target | Purpose |
| --- | ---: | ---: | --- |
| Pair candidates | 200 eligible | 250 prepared | 25% count headroom; reaches the minimum at exactly 20% attrition, with no margin beyond it |
| Candidate acquisition strata | 50 eligible gold clusters | at least 60 | planning breadth; not a gold-cluster claim |
| Precommitted coverage review | 20% of eligible | first 30% plus ranked reserve | deterministic coverage headroom after attrition |
| Positive-construction candidates | later held-out feasibility requires 60 eligible positives across 20 gold clusters | 90 prepared across at least 30 acquisition strata | planning input only; no split or gate guarantee |
| Required case types | six | all six with explicit quotas | prevents late coverage gaps |

Proposed pair quotas total 250:

| Hidden case type | Target | Expected relationship for construction checks |
| --- | ---: | --- |
| `duplicate-positive` | 45 | same topic |
| `syndication-positive` | 45 | same topic |
| `update-continuation-boundary` | 50 | different topics |
| `related-distinct` | 50 | different topics |
| `unrelated-control` | 35 | different topics |
| `adversarial-title` | 25 | determined from the eventual gold graph |

These are acquisition quotas, not labels shown to a reviewer. A separate,
canonically digested acquisition-plan receipt must bind every candidate Source
and pair to one of at least 60 opaque acquisition strata, the intended case
quota, and the 30-stratum positive-construction target. A stratum records how
collection breadth was planned; it is not a reviewer-visible expected label,
an eligible gold cluster, or evidence that two Sources are the same topic.

Meeting these planning targets does not prove realism, licensing, cluster
count, split feasibility, or semantic quality. In particular, 90 intended
positives can resolve differently, be excluded, or be impossible to place into
a dependency-block split with 60 eligible held-out positives across 20 gold
clusters. The later split-policy validator must perform that exact structural
check, and even a passing structure does not predict 60 candidate joins or a
quality-gate pass. Trust and Quality may revise the preparation quotas after a
small provenance-reviewed sampling pilot. Repetitive generated templates must
not be counted as real benchmark breadth.

The 250-pair value is provisional. The acquisition pilot must estimate
attrition before scale-up and raise the preparation target if 20% attrition is
plausible; the real task must not intentionally land on the 200-pair boundary.

## Required authority before acquisition

The owner must record all of the following before any real/public metadata is
accessed for dataset construction, recorded, transformed, retained,
downloaded, copied into TSV, or committed:

- ACCEPT or REVISE for ADR-007 and this completion design;
- the exact permitted source classes, origins/domains, date range, languages,
  fields, acquisition method, storage location, repository use, retention, and
  deletion behavior;
- whether exact titles may be retained or must be separately licensed;
- a prohibition on raw article bodies, authenticated/private pages, personal
  profiles, credentials, query-bearing private URLs, browser-history capture,
  and provider/API secrets;
- Trust's license/privacy evidence requirements and approval role; and
- distinct named primary, secondary, adjudication, and provenance reviewers.

Ordinary developer web research is not authorization to create a repository
dataset. Indexing or public availability alone does not establish copyright,
license, privacy, or repository-reuse permission.

## Acquisition-plan receipt

Before collecting at scale, a separate immutable
`story-acquisition-plan/1.0.0` receipt should contain:

- the owner-approved acquisition-scope digest and decision reference;
- every proposed Source ID mapped to exactly one opaque acquisition stratum;
- every proposed pair ID mapped to its endpoint stratum IDs and intended case
  quota;
- the exact pair, stratum, case, and positive-construction target counts;
- a secondary-priority nonce committed before any relationship label exists;
- owner and Trust reviewer IDs/times, with the caller-declared/unattested
  caveat; and
- a canonical receipt digest that the provenance inventory and review task
  both bind.

The receipt makes the preparation counts reproducible without treating a
collection stratum or intended case as gold. Those fields remain hidden from
all relationship-review presentations. Any scope, membership, quota, or nonce
change creates a new receipt and requires recorded owner/Trust disposition.

## Provenance inventory

Before task preparation, a separate immutable
`story-source-provenance-inventory/1.0.0` artifact should contain one record per
Source. It is more detailed than the corpus projection and should include:

- opaque Source ID and normalized public Source URL;
- provenance kind and metadata-origin URL;
- rights basis, license/public-domain identifier, and authoritative evidence
  URL;
- evidence capture time and a digest of the minimal evidence record, not a
  copied license page;
- exact fields retained and the transformation used for the project-created
  fact summary;
- declarations for copied article text, personal data, repository use, and
  minimum-data necessity;
- reviewer ID/time with the same caller-declared/unattested caveat as the local
  workflow; and
- per-record `accepted`, `rejected`, or `pending` disposition plus bounded
  rationale.

The inventory must bind the accepted acquisition-plan receipt and be
canonically digested. A revised review-task contract must bind both digests and
include only accepted Source projections. A global `accepted` string in config
is not evidence by itself.

Synthetic adversarial cases may remain project-created on reserved example
domains, but their counts must stay distinguishable from externally sourced
metadata. A fully synthetic set can validate plumbing; it cannot establish
real-world resolver quality.

## Proposed artifact chain

The completion path should be one-way and digest-bound:

```text
approved acquisition-plan receipt + provenance inventory
        -> prepared review task + full precommitted secondary priority
        -> primary ledger
        -> coverage-activation + blinded secondary/re-review ledgers
        -> independent adjudication ledger
        -> review archive + completion receipt
        -> labeled-story-corpus/1.0.0
        -> OWNER/QUALITY/TRUST STOP
        -> only later: split/policy/evaluation
```

| Artifact | Contains | Must not contain/do |
| --- | --- | --- |
| Acquisition-plan receipt | Opaque collection strata, quotas, Source/pair membership, committed selection nonce | Gold clusters, reviewer-visible labels, quality claims |
| Provenance inventory | Rights/privacy/repository evidence and dispositions | Labels, clusters, raw bodies |
| Review task vNext | Accepted Source projections, opaque pairs, derived review priority, acquisition-plan and inventory digests | Expected labels in reviewer views |
| Primary ledger | Every owner relationship, including `uncertain` | Corpus projection or expected-answer feedback |
| Coverage-activation ledger | Initial IDs plus append-only deterministic reserve activations | Labels, reviewer answers, retroactive activation |
| Secondary ledger | Blinded independent coverage choices and any later role-appropriate secondary re-review | Primary choices before secondary response |
| Adjudication ledger | Independent resolution of binary disagreements with evidence version | Substitution for a missing binary role decision or silent overwrite |
| Review archive | All events, exclusions, disagreements, uncertainty, provenance links | Held-out or quality claims |
| Completion receipt | Digests of task, all ledgers/archive, cluster projection, and corpus | Split assignment or evaluation result |
| Corpus v1 | Only resolved binary decisions in its existing exact schema | `uncertain` coercion or lost receipt binding |

The corpus contract remains unchanged. The completion receipt binds the corpus
digest to the full archive; the archive retains states that corpus v1 cannot
encode. The current split/policy contracts do not bind that receipt. Their
successor versions must add an exact `completionReceiptDigest` binding before
Checkpoint B can authorize the later split/policy-freeze sequence; procedural
"external evidence" alone is not the one-way digest chain shown above.

## Precommitted secondary coverage review

The next task version should commit a deterministic permutation of every pair
using a nonce committed in the accepted acquisition-plan receipt and a
domain-separated derivation distinct from primary ordering. The nonce cannot be
regenerated after task preparation; a replacement creates a new task and
requires recorded owner/Trust disposition. This prevents discretionary
post-label choice, but does not make the sample statistically unbiased or prove
that a caller did not shop a nonce before commitment. It should declare:

- `coverageTargetFractionMicros: 300000` for the initial blinded coverage set;
- `minimumEligibleFractionMicros: 200000` for corpus readiness;
- the initial coverage IDs (the first
  `ceil(preparedPairCount * 300000 / 1000000)` IDs in the permutation);
- the complete remaining reserve order; and
- a monotonic activation rule that can choose only the next reserve ID, never a
  case selected after inspecting its relationship or error class.

Permutation membership is not coverage activation. Every pair has a rank, but
only the initial IDs have `coverageActivated` at task creation. An append-only,
task-bound activation event marks each reserve ID immediately before its
secondary presentation when the fixed-point loop reaches that rank. A
secondary event without an earlier activation event is invalid and cannot be
retrofitted into coverage; this vNext workflow does not use outcome-conditioned
secondary review outside the activated set.

There are two separately reported paths:

1. **Precommitted coverage:** initial 30% plus ranked reserve activated until at
   least 20% of final eligible pairs have an independent binary review.
2. **Resolution obligations:** a role that records `uncertain` must re-review to
   binary or the pair is excluded; a later binary disagreement requires
   adjudication. Primary re-review and adjudication never count as independent
   coverage; only a valid binary secondary event following
   `coverageActivated` does.

The secondary reviewer sees the same Source allowlist as primary review and no
primary choice, rationale, case type, cluster, provenance internals, coverage
status, or expected answer. Reviewer independence is checked by canonical ID,
but IDs remain declarations rather than authentication.

Reserve activation uses a fixed-point loop. First process the initial set and
all resulting resolution obligations. Then compute the provisional eligible
set under every completed rule except the coverage fraction, calculate
`required = ceil(provisionalEligiblePairs * 200000 / 1000000)`, and count only
eligible precommitted-coverage pairs with a binary secondary event. If the count
is too low, activate exactly the next unactivated reserve ID, finish any
uncertainty/disagreement work it creates, and recompute. Rank activation is
monotonic and stops only when the fraction passes or the reserve is exhausted.
The completion receipt reports initial-set and reserve agreement/exclusion
results separately because outcome-dependent attrition can still change sample
composition. It must not lower the denominator, redefine eligibility, or choose
convenient cases.

## Uncertain and adjudication semantics

`uncertain` is a valid review event and an invalid gold label. It is never
translated automatically to `different-topic`.

- A primary `uncertain` enters the resolution track and is preserved. The
  primary role must append its digest-bound binary re-review, or the pair must
  be excluded, before any secondary presentation used for corpus projection.
- A secondary `uncertain` is also preserved and requires a digest-bound
  secondary re-review to a binary decision, then adjudication if that decision
  disagrees with the binary primary decision, or exclusion.
- A binary primary/secondary disagreement requires an adjudicator distinct
  from both reviewers.
- Adjudication may return a binary relationship or `unresolved`; it may not
  rewrite prior events.
- Evidence enrichment creates a versioned presentation supplement bound to the
  original task; it never mutates Source metadata behind an existing digest.
- Corpus v1 eligibility requires a binary primary event and, when the pair is
  independently reviewed, a binary secondary event. An adjudicator cannot be
  misrepresented as the missing primary or secondary reviewer.
- The completion receipt's projected primary event must logically precede the
  projected secondary event and have a `reviewedAt` no later than the
  secondary's, as corpus v1 requires. Any secondary event recorded before the
  projected binary primary event is archive-only and requires a fresh blinded
  secondary decision after that primary event; under vNext, creating the early
  secondary event is itself a workflow validation failure.
- If either role first records `uncertain`, that exact event remains immutable.
  The same role may receive a digest-bound evidence supplement and append a new
  binary decision; the completion receipt identifies the later event used for
  corpus projection and retains the earlier uncertainty. Without that new
  role-appropriate binary event, the pair is excluded even if an adjudicator
  has an opinion.
- Every unresolved, provenance-rejected, contradictory, or incompletely
  reviewed pair stays in the archive with an exclusion reason and stays out of
  corpus v1.

The completion receipt reports counts for every transition so exclusions cannot
silently improve metrics or review coverage.

## Gold-cluster construction and consistency

Gold cluster IDs are post-review artifacts and must never enter primary or
secondary presentations. Completion should:

1. build connected components from final resolved `same-topic` edges;
2. assign deterministic cluster IDs from the sorted Source-ID membership;
3. require every resolved `different-topic` edge to cross components;
4. reject any pair whose final label contradicts its hidden case-type rule;
5. retain all contradiction evidence for adjudication rather than changing a
   label or cluster silently;
6. count at least 50 eligible components and all six eligible case types; and
7. prove every eligible Source/pair maps exactly once into corpus v1.

Absence of a reviewed edge does not establish either equality or difference.
Component construction is limited to explicit final same-topic relationships.
The later dependency-block split must operate only after this graph and receipt
are frozen and accepted.

## Owner and reviewer checkpoints

There are two explicit stops inside P1.2:

### Checkpoint A — prepared primary task

After the exact acquisition-plan receipt, provenance inventory, and task are
accepted, print only their digests, safe counts/readiness, reviewer
declarations, and owner instructions. Then stop. The owner should only need to
run the relationship UI and choose `same-topic`, `different-topic`, or
`uncertain` for each item. Do not start a split, policy freeze, candidate run,
or evaluation.

Design and generated-fixture testing for later stages may happen before this
checkpoint. Actual secondary decisions, adjudication, or corpus materialization
must not be represented as completed before the primary ledger exists and the
owner explicitly continues the review workflow.

### Checkpoint B — completed review package

After primary, secondary, adjudication, provenance reconciliation, cluster
checks, and corpus projection, present the completion receipt, exclusion and
coverage counts, reviewer independence checks, and residuals to Owner, Trust,
and Quality. Stop again. Only their recorded disposition can authorize the
separate pre-result split/policy-freeze sequence, and only after successor
split/policy contracts bind `completionReceiptDigest`. Acceptance never
predates or includes held-out results.

## Implementation sequence and gates

### P1.2b-0 — decisions (partially complete)

- **Complete:** owner accepted ADR-007 and this plan for generated-only P1.2b-1.
- **Open:** authorize an exact acquisition/provenance scope.
- **Open:** name distinct real primary, secondary, adjudication, and provenance
  reviewers; the current solo-builder arrangement does not satisfy
  independence.

Gate for P1.2b-1: satisfied. Gate for acquisition or real review: still blocked;
silence and synthetic role identities are not approval or staffing.

### P1.2b-1 — generated completion preflight (locally allowed after plan review)

- Define pure vNext acquisition-plan, task-priority, secondary, adjudication,
  archive, completion-receipt, and cluster-projection contracts using generated
  data only.
- Define generated-only successor split/policy bindings for
  `completionReceiptDigest`; do not freeze a split or policy receipt.
- Do not change the accepted v1 workflow in place; a code-bearing change to it
  reopens its review.
- Test attrition, reserve activation, reviewer independence, uncertainty,
  disagreement, evidence supplements, graph contradictions, digest rebinding,
  and the exact 200/50/20% boundaries.

Gate: focused and restricted suites plus independent Trust/Quality review.

### P1.2b-2 — acquisition pilot (separately authorized)

- Collect only a small approved metadata sample under the exact provenance
  protocol.
- Trust reviews the source class and every pilot record before repository use.
- Use the pilot to revise effort, attrition, privacy, and case-coverage estimates;
  do not label it held out or evaluate a model.

Gate: Trust ACCEPT/REVISE and owner approval to scale collection.

### P1.2b-3 — prepare the real task and stop

- Assemble the approved acquisition-plan receipt and headroom inventory, then
  prepare their immutable task.
- Reproduce digests/checks from a clean checkout.
- Present Checkpoint A to the owner and stop.

### P1.2b-4 — complete review and stop again

- Record primary, independent secondary, and adjudication events.
- Materialize the archive, clusters, receipt, and corpus only when all checks
  pass.
- Present Checkpoint B and stop before any split or evaluation.

## Stop conditions

Stop and return to the owner if any of the following occurs:

- a source class lacks explicit repository-reuse/privacy approval;
- the workflow would need raw article text, authenticated content, credentials,
  a live browser capture, or a paid/provider call;
- role independence cannot be staffed;
- the task would use bare-minimum counts with no attrition/review reserve;
- any UI reveals hidden case, cluster, prior-decision, selection, or expected
  answer data;
- uncertainty or disagreement would be dropped or coerced;
- a corpus cannot be bound to the complete review archive;
- cluster contradictions cannot be independently adjudicated;
- an implementation attempts to freeze a split, inspect held-out results, or
  choose an automatic-join branch before Checkpoint B disposition; or
- repetitive synthetic construction would be presented as real-world semantic
  quality evidence.
