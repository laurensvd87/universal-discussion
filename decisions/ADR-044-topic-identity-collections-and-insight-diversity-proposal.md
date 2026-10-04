# ADR-044: Separate Topic identity, broader collections and Insight diversity

Date: 2026-10-04
Status: proposed architecture, not approved for activation

## Problem and evidence

The owner's goal is that every captured page can find a useful discussion as
the catalog grows, with opposing views of the *same subject* together and a
small, nonredundant source mix for Insights. One global cosine cutoff cannot
define that subject. Current `adaptive-supported-partitions/v1` uses a 0.90
all-member floor, 0.94 supported tightening and a 0.04 outside margin. Its
documented three-page, pairwise-0.92 case ends in either one or three Topics
depending on arrival order. Opposing views can be less embedding-similar than
two different developments about the same actor. Neither denser clusters nor
lowering 0.90 by itself resolves the identity question.

Read-only aggregate inspection of the owner's local catalog found 92 total
Sources/83 total Topics, including 84 learned Sources in 70 learned Topics:
57 singletons, 12 pairs and one triple. There
are 185 cross-Topic learned Source pairs with cosine >=0.90, including 25
>=0.94. These are candidate-geometry counts, **not** human same-Topic labels
or evidence that merging those pairs is correct. The owner-provided public
HLN defence-budget article has no same-Topic peer even though four vector-
related pages enter its Insight context. Separately, the local state and
ranker have hard 100-Source limits, and SQLite stores the state as one JSON
document. Thus quality and capacity both need a new architecture.

The current related ranker can fill its first five positions with redundant
pages from one publisher or syndication family. Provisional same-Topic peers
may be chosen by Source ID rather than relevance, and the Insight context
then truncates to four non-current pages. Improving grouping alone cannot
guarantee a useful four-page comparison.

## Proposed semantic contract

Keep three concepts separate:

1. **Precise Topic:** a bounded referent, factual development or discussion
   question with an explicit scope. Opposing judgments, estimates and
   languages about that same scope belong together. Different material
   decisions, product variants or event stages do not become identical merely
   because their embeddings or named entities are close. For news this extends
   ADR-004's atomic-development rule only through a later versioned label
   policy, not an implicit reinterpretation of existing labels.
2. **Collection:** a broader, possibly overlapping subject such as Russian
   defence spending and military expansion. It connects related precise
   Topics and can offer one aggregate reading/conversation entry point without
   asserting that a budget plan and a troop-strength decree are the same
   development. Collection membership is not a transitive same-Topic edge.
3. **Insight evidence set:** up to the currently approved four *other* public
   pages, selected anew for the current-page request. A candidate's existence
   or title is not proof that its text was read. Same-Topic, related and
   actually-read status remain distinct in the provider context and UI.

One Source may have one primary precise Topic and multiple related Collection
edges. The present root-Source anchor remains the authority for a post and
its entire reply subtree; collection views may project relevant roots with
clear provenance without copying posts or silently changing Topic IDs.
Manual/legacy roots, source stamps, Forget and withdrawal keep ADR-023's
invariants. Whether a collection should expose one shared reply surface is
the main owner-facing product choice below.
For a page genuinely centered on multiple precise subjects, later secondary
Topic memberships may be useful. A new root would then need one explicit
`(Source, Topic)` context, not automatic publication into every membership;
that is a versioned post-anchor/data-model extension requiring separate
approval. The present one-primary-Topic prototype is unchanged here.

## Resolution pipeline

1. **Retrieve candidates for recall, not membership.** Union bounded results
   from the existing multilingual vector, normalized title/entity/number and
   version/occurrence cues, and several Topic exemplars. No hard publisher,
   language or publication-date filter: delayed product reviews and later
   perspectives can be about the same subject. A fixed dense top-k alone can
   be flooded by majority rewrites, so retain candidate-channel provenance
   and test recall for minority viewpoints. Candidate retrieval must not
   create a Topic link.
2. **Verify identity separately.** For each plausible pair/profile, decide
   `same | related | different | uncertain` from the main referent/question,
   action or claim, scope, relevant event time/version and contradictions in
   identity. Stance, sentiment, outlet and a disputed quantity are not
   exclusion features. Missing evidence is `uncertain`, not a match. Start
   with inexpensive features computable from already retained title/URL and
   vector, but do not claim they can reliably recover all event identity.
   A second local representation, structured subject signature, trained
   verifier or AI call is a separately reviewed option, not authorized here.
3. **Assign against a Topic profile, not a chain.** A candidate must fit the
   Topic's explicit scope and at least its relevant exemplars; a bridging
   article must not fuse two incompatible events. Preserve multiple language
   and viewpoint exemplars rather than one majority centroid. If evidence is
   insufficient, give the page a valid provisional singleton and related
   edges. Corrections and supported merges/splits are versioned and atomic,
   with stronger evidence to move an existing assignment than to keep it.
   More pages alone never trigger a split; two dense groups can simply be
   opposite views.
4. **Reconcile locally.** On ingestion, evaluate only affected neighborhoods
   and periodically audit bounded nearby Topics. Keep history-independent
   candidate construction, explicit manual pins, stable IDs and atomic
   source-root/reply routing. Retain and paginate all members; the four
   Insight slots must never determine Topic identity.

## Selecting Insight sources

Rank candidate *evidence*, not merely similar websites. First require an
adequate Topic/Collection relation and safe public URL; collapse exact and
near-duplicate/syndicated representations conservatively. Then select for
current-page relevance plus incremental information, penalizing redundancy.
The selection objective is approximately:

`scope relevance + new evidence/argument coverage + source independence - repetition`

An independent account, a substantively different supported viewpoint, a
primary record or a correction are useful roles when available, not mandatory
quotas. Domain diversity is only a proxy: different sites can republish the
same agency copy, and one site can publish genuinely different arguments.
Vector distance may help detect repetition but cannot certify disagreement.
Do not create artificial balance for unsupported claims. Keep exact-Topic
Sources first when they offer new information; use related Collection Sources
as explicitly labelled context, not proof of same identity. If only one good
page is accessible, send one, not four filler pages. Existing permission is
four fetch attempts / excerpts from non-current pages, not four successes
plus unlimited retries; any change to that budget needs review.

This is a constrained diversity-reranking problem akin to [maximal marginal
relevance](https://aclanthology.org/X98-1025/), not a claim that MMR alone
understands viewpoint. [Entity-aware streaming news clustering](https://aclanthology.org/2021.eacl-main.198/)
supports testing sparse/entity and dense representations together; [time-aware
event work](https://aclanthology.org/2024.lrec-main.1416/) shows time is
context-dependent rather than a universal age cutoff. These publications do
not validate this product's labels or our current E5 scores.

## Scale and evaluation

The local PoC needs normalized, indexed SQLite Sources, Topic memberships,
relations, vectors and contributions in place of one bounded JSON state row.
Lift the 100 Source/Topic ceiling with versioned migration and paginated API
reads; do not merely increase array constants. At modest scale, benchmark
exact vector search and local neighborhood updates. Introduce an ANN index
only when measured latency requires it, retain exact reranking, and test
retrieval recall for minority perspectives. Any model-space change needs a
versioned index and migration plan; no model is downloaded by this proposal.

Offline shadow experiments should compare the current rule and proposed
stages on synthetic hard negatives: opposite views of one decision, similar
actors but different decisions, delayed product reviews, mixed languages,
bridging articles, duplicates flooding one viewpoint, changing arrival
orders, source Forget and a growing irrelevant catalog. Measure candidate
recall, false joins, same-Topic recall by language/viewpoint, abstention,
cluster stability, unnecessary comment moves, diversity/readability of the
four selected pages, actual excerpt success, p95 latency and storage growth.
Do not call synthetic outcomes real semantic accuracy. A real multi-topic,
provenance-approved review set and independent review remain a separate owner
gate; do not repeat the completed six-pair synthetic owner review.

## Boundaries and proposed sequence

- **Near-term, existing scope:** shadow-test whole-neighborhood candidates
  against the known arrival-order bug; test Insight reranking/deduplication
  using existing vectors, titles and URLs, with no new data, model or provider
  call. Preserve the four-fetch ceiling and posting invariants. These are
  experiments first, not silent regrouping of owner data.
- **Capacity:** design and test a normalized SQLite migration on synthetic
  state before any owner-data migration. Stop for data-loss/security review
  before applying a migration to retained owner data.
- **Identity quality:** choose and measure the smallest additional signal
  justified by errors. Second retained vectors, structured subject features,
  stored excerpts, a new model, provider verification, and historical
  regrouping each require an explicit data/security/owner decision. ADR-022's
  declined Qwen package remains deferred.
- **Product decision requested:** endorse precise Topics connected by broader
  Collections, rather than merging related developments into one indistinct
  Topic. Example: articles disputing the *same budget proposal* share a Topic;
  the troop-strength decree is a related Topic in a common Collection. A
  collection may display both sets of source-anchored subthreads while keeping
  their exact origins visible. No collection UI or data migration is approved
  by this proposal.
