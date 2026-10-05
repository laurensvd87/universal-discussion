# ADR-044: Continuous Topic cloud, stable discussions and diverse Insights

Date: 2026-10-05
Status: revised proposal after owner clarification; bounded Insight ordering only activated; no cloud/grouping/migration activation

## Owner direction and problem

The Russia/Ukraine pages were only a test. The product should cover arbitrary
online subjects. Its primary discovery model is a continuously growing,
overlapping **cloud of pages**: closer pages are more topically related, not
necessarily members of one fixed category tree. Opposing positions on the
same subject should remain very close in topical relevance. A page may be
near several subjects at once. A visual 2-D cloud is optional; screen distance
must not masquerade as a precise semantic metric. "Cloud" does **not** mean
remote hosting or a new data recipient.

The current PoC cannot meet the scale requirement. Read-only inspection found
92 total Sources/83 total Topics, near its hard 100-Source/100-Topic limits;
SQLite holds the full state in one JSON row. Among 84 learned Sources, 57
are singletons. There are 185 cross-Topic vector pairs at cosine >=0.90,
including 25 >=0.94. These are *unlabeled candidates*, not proof of false
splits. The current 0.90 complete-link/0.04 margin rule has a reproducible
three-page .92-similarity arrival-order inconsistency. Lowering a threshold
or increasing array constants does not fix identity or scale.

The first ADR-044 proposal made precise Topic -> broader Collection a required
product hierarchy. The owner clarified that this is too restrictive. Such
groups may later be useful **views of the cloud**, not the universal storage
ontology or a prerequisite for every subject.

## Three separate relationships

1. **Topical affinity:** how much two pages concern the same referent,
   question, product or development, irrespective of whether they agree.
   It is graded and can overlap. Publication date, version and scope matter
   when they change the actual subject, not as universal hard filters.
2. **Argument/evidence difference:** what claims, judgments, conditions or
   evidence differ *within* a shared subject. An opposing answer may be highly
   topically close but valuable precisely because it differs on this axis.
   Vector distance, publisher and sentiment alone cannot certify opposition.
3. **Discussion identity:** the stable destination and provenance of a root
   post and all its replies. A changed neighbor ranking must not republish,
   duplicate or move a conversation. Explicit source/Topic corrections remain
   separate versioned actions under ADR-023.

The cloud is a graph of versioned Source nodes and bounded, scored candidate
edges. Edge score and provenance say *why a page was retrieved*, not that
the pages have a transitive identical-Topic relationship. A near B and B near
C does not prove A near C. Evaluate every expansion against the original
page or chosen discussion focus. A broad page can have several overlapping
neighborhoods; `relevance(candidate, currentPage, optionalFocus)` may be
directed even when raw pair affinity is symmetric. No connected-component
merge of all reachable pages.

## Retrieval and semantic quality

For each newly embedded page, unite candidates from the existing multilingual
vector, available title/lexical/referent/number cues and several representative
neighborhood points. Use these for recall, never as automatic proof of one
discussion. A dense top-k alone can be flooded by copied majority articles and
hide an uncommon opposing view. Deduplicate syndicated/near-identical items
and test minority-view, multilingual and multi-subject recall. No publisher,
language or fixed publication-time exclusion.

Rerank candidates for *subject affinity*, leaving stance separate. Where the
evidence supports it, a bounded verifier may distinguish `same subject`,
`related subject`, `different` and `uncertain`, with explicit version/scope.
Unknown evidence is not a same-subject assertion. Do not remove negations,
numbers or conditions naively: they can be essential to the subject as well
as to the disputed answer. The current single E5 vector cannot reliably
recover this distinction, and no .90/.94 threshold is a calibrated confidence
percentage. An extra subject-focused representation, title/lead treatment or
pairwise reranker is an experiment requiring evidence; second retained
vectors, structured facts or another model are **not approved** here.

At the current scale an exact candidate scan is acceptable if measured fast.
At larger scale, use indexed retrieval with exact reranking and measured
recall. [HNSW](https://arxiv.org/abs/1603.09320) is an index candidate, not
a chosen dependency or a semantic verifier. Research on [entity-aware news
clustering](https://aclanthology.org/2021.eacl-main.198/) motivates testing
dense plus sparse/referent evidence; the paper's English-news result does not
validate our multilingual, general-web cloud. [Target/stance work](https://aclanthology.org/2023.acl-long.560/)
and [counterargument retrieval](https://aclanthology.org/2020.acl-main.633/)
likewise distinguish what is being discussed from the position or argument.

## Discussion behavior in overlapping neighborhoods

A page may be relevant to several discussion focuses. Preserve stable
Discussion, root and reply IDs. A new root is published once in an explicit
Source/focus context; replies inherit that root's destination. Different
read views may reference the same root by ID, with source and relation shown,
without copying it or implying publication into a second discussion.
When the page is genuinely multi-subject, the UI can offer more than one
relevant discussion while choosing a sensible default; it must not require a
manual Topic form on every visit. Existing one-primary-Topic association can
remain a compatibility posting anchor until a separately reviewed migration.

ADR-023's source-anchored invariants remain: a whole reply tree follows its
root, reply origin provides only its own link, manual/legacy roots stay pinned,
changed representation stamps conservatively pin old threads, Forget and
withdrawal clear provenance as specified, and stale drafts are not silently
retargeted. Multi-focus posting or a new graph projection needs explicit
data/lifecycle review before touching retained owner discussions.

## Four useful Insight pages, not four nearest copies

From a larger relevant neighborhood, select within the currently approved
budget of **four non-current page fetch attempts/excerpts**. Maximize
current-page relevance and additional argument/evidence coverage while
penalizing duplication and dependent reporting. The current page already
occupies one perspective. Strong disagreement *on the same subject* may be
valuable, but there is no forced pro/con quota or artificial balance; for a
product, tutorial or scientific result, useful variety may mean different
constraints, independent testing, corrections or primary evidence instead.
Domain diversity is a weak proxy for independence, not proof. Near-duplicate
embeddings can flag repetition, not prove shared opinion.

Keep status distinct: suggested URL/title, successfully fetched bounded text,
and externally verified evidence. A title or failed anonymous fetch is not a
read source. If only one useful, accessible page exists, send one rather than
four filler pages. The current Insight ranker can fill its top positions with
one domain; provisional same-Topic peers can fall back to ID order before the
four slots are truncated. Diversity reranking, in the spirit of [MMR](https://aclanthology.org/X98-1025/),
is a bounded next experiment, not a claim that MMR understands viewpoints.
Increasing fetch/provider scope or retaining page text requires a new gate.

## No fixed 100-page ceiling

There should be no small hard-coded product limit on total captured pages.
Normal finite disk, compute and operational quotas still exist. Replace the
single bounded JSON state with normalized, indexed SQLite Source, vector,
edge, discussion and contribution tables; version and test migration before
applying it to owner data. Paginate API responses instead of loading the full
catalog into the popup. Materialize only a bounded number of useful edges per
node, while retaining all Source nodes and allowing on-demand neighbor search.
Update affected neighborhoods incrementally; no global all-pairs regroup on
each visit. The number of stored pages may grow without every query growing
linearly, but approximate indexes and bounded work can miss candidates, so
measure recall under duplicate floods and rare viewpoints.

## Evaluation and approval sequence

- First, a **synthetic shadow** graph/retrieval/diversity experiment with the
  existing vector and retained metadata; do not regroup the owner database.
  Cover opposing views on one subject, same actor/different development,
  products months apart, multi-subject pages, cross-language pairs, bridge
  pages, duplicate-majority floods, arrival order and growing unrelated data.
- Evaluate graded neighbor quality separately from discussion membership:
  recall/NDCG across human relevance grades, opposing-view and language
  slices, false joins, abstention, topic stability, selected-source diversity,
  actually accepted excerpt count, p95 query cost and disk growth. Synthetic
  examples prove mechanics only. A provenance-approved real review set and
  independent review retain their separate owner gate; do not repeat the
  completed six-pair synthetic owner review.
- Design normalized SQLite migration and test synthetic copies, rollback and
  capacity. Stop for explicit owner-data/security approval before migrating
  or recomputing retained real Sources or discussions.
- If the existing one-vector signal cannot meet the graded and stance-
  invariant objective, present a measured *specific* second representation,
  subject signal or verifier with package size, latency, retained fields and
  security/provider boundaries for approval. ADR-022's declined Qwen package
  stays deferred. No new model, provider request, background fetch, text cache,
  external service or publication follows from this architecture proposal.

The owner's cloud-first direction supersedes the earlier requested choice of
a mandatory precise-Topic/Collection hierarchy. No further product taxonomy
decision is needed to begin the synthetic shadow work. How multi-focus
discussions appear and whether ranking alone may surface adjacent threads
will be decided with an actual UX/data-flow proposal, not by silent rollout.

## Initial synthetic shadow evidence (2026-10-05)

The isolated [Topic-cloud experiment](../apps/local-service/experiments/topic-cloud/README.md)
tests the proposed overlapping-neighbor and diverse-selection mechanics, not
production E5 quality. Nine socket-denied tests pass, including a 140-node
synthetic catalog, opposing-view proximity, multi-subject overlap, duplicate
flooding and input-order invariance. Fixture coordinates are invented. One
fixture-labeled irrelevant false friend ranks above a relevant counterview
and consumes an Insight slot. Thus the architecture can preserve graded
relationships without merging conversations, but the present experiment
cannot justify activation, remove the live 100-Source cap or establish
stance-independent semantic matching.

The separate [normalized SQLite dry run](../apps/local-service/experiments/topic-cloud/sqlite/README.md)
persists 140 invented Sources and vectors, supplies bounded indexed neighbor
and paginated Source reads, and keeps discussion/root/reply IDs fixed when
edges change. Four socket-denied tests cover reopen and transactional failure.
It does not migrate the owner's JSON-row state or implement ADR-023's full
source-anchor, Forget, withdrawal and legacy-pin lifecycle. It cannot by
itself authorize a production schema change or prove large-scale retrieval
quality.

The follow-up [synthetic-only migration/recovery plan](../apps/local-service/experiments/topic-cloud/sqlite/MIGRATION_RECOVERY_PLAN.md)
maps the retained JSON state and shows that the dry-run schema cannot be
promoted unchanged. It proposes fault-injected synthetic round trips and
lists separate owner decisions for recovery copies, revision semantics and
cutover. No retained owner database has been opened or copied.

The first [synthetic v2 rehearsal](../apps/local-service/experiments/topic-cloud/sqlite/rehearsal/README.md)
round-trips representative old IDs, origins, anchors and revisions and proves
pre-commit rollback under injected failures. Its independent Trust review
identified missing `/v1`, learned/agent, lifecycle and post-commit recovery
coverage, so it remains an incomplete migration checkpoint, not approval
to open or convert retained owner data.

## Bounded Insight selection and subject probe (2026-10-05)

Extension 0.13.2 applies only a reversible, read-time selection improvement:
the popup and service request 20 existing local nominations, validate against
catalog records, retain the backend order for provisional Topic peers, then
use a three-alternative lookahead for host and exact-title variety within
same-Topic and related buckets. At most four non-current pages are selected
and at most four anonymous fetches attempted. Catalog Topic membership alone
determines the same-Topic bucket; related nominations cannot promote a Source
or reroute a post. No retained field, permission, provider call or Topic
assignment changes. Host/title variety does not establish independent
reporting or differing positions.

An isolated [32-document synthetic E5 probe](../apps/local-service/experiments/topic-cloud/subject-rerank/RESULTS.md)
suggests that small title cues can rank an opposing-view partner above some
same-family different-subject pages. The strongest variant still placed a
hard negative first for 3 of 12 held-out query directions. A negation fix
followed the first measurement, so the amended result is exploratory. It
does not justify deploying title scoring, changing the 0.90/0.94 grouping
rule or describing Topics as reliably stance-independent. Production
discussion identity and the 100-Source/Topic ceiling remain unchanged.
