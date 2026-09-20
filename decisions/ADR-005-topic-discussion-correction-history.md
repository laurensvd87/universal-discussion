# ADR-005: Append-only Topic and Discussion correction history

Status: Proposed; owner, Trust, and Quality review required

Date: 2026-09-20

Owners: Product owner, Lead/orchestrator, Semantic Resolution, Trust, Quality

## Context

ADR-004 defines a labelable Topic boundary, but even a conservative resolver or
human curator will sometimes join distinct developments or split syndicated
coverage. Correction cannot silently rewrite the context in which people or
agents contributed. Destructive moves also risk duplicating counts, breaking
reply trees, changing AI provenance, exposing private material, or making an
earlier state impossible to reconstruct.

The product still needs a simple current invariant: each active Topic exposes
one place for new discussion. That current view must coexist with honest
history when predecessor Topics and Discussions are merged or split.

## Decision

Model merge, split, and reversal as authorized append-only `TopicCorrection`
events. A correction has a stable operation/idempotency key, input and output
Topic IDs, expected input versions, actor identity and type, authority, reason,
evidence, policy version, resolver/model suggestion metadata when applicable,
timestamp, and optional `reversal_of` reference. Execute the state transition
atomically with optimistic version checks and an idempotent outbox.

For the initial editorial scope:

- every Source has exactly one current Topic membership;
- `SourceTopicLink` records are effective-dated and supersede rather than
  overwrite earlier links;
- every active Topic has exactly one writable primary Discussion;
- retired Topic and Discussion IDs remain resolvable with correction context;
- Contributions retain their stable ID, original Discussion and
  topic-at-publication context, author/agent provenance, timestamps, reply
  relationships, votes, reports, moderation state, and publication state; and
- a correction never copies, reauthors, publishes, restores, or deletes a
  Contribution. Moderation and privacy deletion are separate authorized
  lifecycle operations, not clustering corrections.

### Merge behavior

Retire the input Topics and create one neutral active output Topic by default.
The old Topic identifiers resolve to that successor. The output receives one
writable Discussion. Predecessor Discussions become read-only and may be shown
inside the output as provenance-labeled projections referencing the original
Contribution IDs. New Contributions are written only to the output Discussion.

Using an existing input Topic as the survivor is allowed only if a later
implementation demonstrates that neutral output IDs create unacceptable
operational cost and records an explicit reason; it must not change the other
history and provenance rules.

### Split behavior

Retire the input Topic, create active child Topics, and explicitly partition
its current Sources. The retired Topic resolves to a disambiguation/tombstone
that lists the children; it must not guess one redirect target. Each child gets
one writable Discussion.

Project a legacy root thread into one child only when its source context maps
unambiguously to that child or an authorized moderator records an adjudication.
Keep an entire reply tree together. Unscoped, multi-source, or mixed-context
threads remain available only on the read-only legacy Discussion rather than
being guessed, copied, or projected into every child.

### Views, replies, counts, and reversal

A projection is a reference, not a second Contribution row. A reply from a
current Discussion to a projected legacy Contribution belongs to the current
Discussion and records the cross-lineage reference with visible context.

Counts deduplicate by stable Contribution ID, include only currently public and
visible Contributions, keep human and agent totals separate, and declare the
Topic scope, correction revision, and as-of time. Private AI output and removed
content never become visible or countable through lineage.

“Read-only” prohibits new Contributions, edits, votes, and reactions in a
retired Discussion. It does not block reports, moderation, lawful erasure,
account deletion, or other authorized lifecycle controls. A current deletion,
privacy-redaction, or moderation tombstone overrides every projection,
historical/as-of topology view, cache, export, and count; history must never be
used as a bypass to recover content that is no longer authorized for display.

Resolver or model output may recommend a correction but cannot execute it in
the initial product. Reversal is a new compensating correction event; it never
erases the original event or rewrites Contributions created in the interim.
Ambiguous interim threads remain provenance-labeled legacy context.

## Open acceptance questions

- Does a compensating reversal reactivate predecessor Topic and Discussion IDs
  with a new version, or always create new output IDs? Reactivation minimizes ID
  churn, while new outputs make intervening history clearer. This must be fixed
  before schema or API implementation and tested for corrections that overlap
  or receive new Contributions in the interim.
- Which audit fields may be retained after actor/account deletion, and which
  must be redacted or pseudonymized while preserving the non-personal topology
  history? P1.6 must answer this before ADR acceptance.

## Alternatives considered

- Destructively choose a survivor and move Sources and Contributions: simpler
  current queries, but it rewrites publication context and makes safe reversal,
  counts, redirects, and audit reconstruction unreliable.
- Copy Contributions into the surviving or child Discussions: rejected because
  it duplicates identity, votes, reports, counts, and human/agent provenance.
- Never correct Topics: operationally simple but incompatible with a semantic
  resolver that can make trust-damaging mistakes.
- Project every predecessor thread into every output: rejected because a split
  would present ambiguous conversation as if it belonged to each child.

## Consequences

- The current product keeps one writable Discussion per active Topic while
  accurately presenting historical context.
- Current membership and counts become derived, revision-aware projections;
  caching and indexing must carry correction revision and be invalidated from
  the transactional outbox.
- Split review requires explicit Source partitions and sometimes thread-level
  adjudication. Ambiguity remains visible instead of being automatically hidden.
- Stable legacy routes and as-of queries are required. A redirect alone is not
  enough for split history.
- The data model is more complex than destructive foreign-key updates, but its
  failure modes are testable and reversible.

## Security/privacy/cost impact

Only authorized operator roles may execute corrections initially. Suggestions
from a resolver, agent, page, comment, or model are untrusted input. The command
must enforce object authorization, reason/evidence bounds, idempotency,
expected versions, and complete input/output partitions before mutation.

Correction history can itself contain actor and source metadata. Data
minimization, operator access, retention, export/deletion interaction, and audit
redaction must be defined in the P1.6 lifecycle threat model. Append-only here
means that a clustering correction never erases history; it does not override
lawful privacy deletion or moderation policy.

Projection and as-of queries add database/index work. P1.9 must benchmark
lineage depth, deduplication, cache invalidation, and worst-case merge/split
fan-out. No infrastructure purchase follows from this proposal.

## Validation / rollback

Before acceptance for implementation, executable contract tests must show:

- a merge leaves one active output and one current Source link per Source while
  old links and IDs remain queryable as-of;
- a split forms a complete, non-overlapping Source partition, returns child
  choices from the parent, and never breaks a reply tree;
- Contribution rows, authorship, AI provenance, original context, votes,
  reports, visibility, and moderation state do not change during correction;
- projections and multiple lineage paths never double-count, and human, agent,
  private, and removed states remain distinct;
- unauthorized, incomplete, stale-version, and conflicting operations fail
  with zero mutation;
- replaying an idempotency key returns the original result, transaction failure
  leaves no half-retired state, and outbox replay is idempotent; and
- a compensating event restores the intended current mapping without deleting
  either history or Contributions created between corrections.

Until those tests and the P1.6 authorization/lifecycle design pass, this ADR is
a decision proposal only. Rollback of a completed correction is another audited
correction; rollback of this unimplemented proposal is removal or revision of
the ADR with no external state.
