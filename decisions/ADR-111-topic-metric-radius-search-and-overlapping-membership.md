# ADR-111: Topic metric radius search and overlapping membership

Date: 2026-10-13
Status: Owner approves fixed reference and requests activation; implementation and cutover pending

## Decision and scope

The owner replaces the goal of repeatedly optimizing whole-component grouping
with a simpler rule for millions of pages: find pages whose Topic identity
similarity crosses the existing threshold, and permit a page to belong to
multiple Topics. The intended operation is a radius search, not another global
clustering pass. The owner explicitly asks for all pages within the distance
and confirms that the Topic metric, rather than raw E5 similarity, must remain.

Use the installed, pinned Ridge1 transform on the existing E5 representation.
The present Topic floor is 0.8639003810829322; do not substitute the raw-E5
related floor of 0.88, the canonical adaptive floor of 0.90, or new fitted
coefficients. Scores remain mathematical similarities, not verified semantic
identity probabilities. Existing public-page eligibility, protected/private
exclusions and manually confirmed relationships retain their separate authority.
No additional model, capture, provider request, retuning or historical-post
rewrite follows from the indexing direction.

## Exact geometric lookup

For ideal normalized Ridge1 vectors, cosine similarity `s` and Euclidean
distance `d` satisfy `d^2 = 2 - 2*s`. Consequently, `s >= threshold` can be
searched as `d <= sqrt(2 - 2*threshold)`. A distance index must use a true
metric such as Euclidean distance, not `1 - cosine` as though it obeyed the
triangle inequality. The relationship is documented in the
[Faiss metric reference](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances).

A ball or vantage-point tree can exclude entire regions using conservative
distance bounds. For a node with center `c` and covering radius `r`, discard
the node only when `distance(query,c) - r > queryRadius`. Every remaining
candidate receives the exact existing Ridge1 score and threshold check.
Floating-point norm drift and rounding require conservative bounds and
boundary differential tests; approximate pruning must never be called exact.
The [Ball Tree documentation](https://scikit-learn.org/stable/modules/neighbors.html#ball-tree)
describes this triangle-inequality pruning and its dependence on data structure.

Approximate HNSW retrieval plus exact reranking verifies returned candidates,
but does not guarantee finding every candidate above the threshold. It therefore
cannot silently replace the owner's all-results requirement. Conversely,
384-dimensional metric trees can prune poorly and approach a linear scan;
neither logarithmic worst-case queries nor million-page latency is established.
Large result sets also require at least proportional output work. Paginated
results must distinguish an exhaustive completed search from truncated or
pending work, rather than hiding a top-K membership cap. Compare prospective
indexes against exact scanning on the same fixed metric before choosing one.
See also the [Faiss exactness and index selection guidance](https://github.com/facebookresearch/faiss/wiki/guidelines-to-choose-an-index).

## Membership and discussion boundaries

A direct threshold relation is not transitive: if A matches B and B matches C,
A need not match C. Overlapping membership must not become connected-component
closure or inheritance of every Topic attached to a matching neighbor.

The owner accepts a fixed reference for each Topic. Compare an incoming page
directly with those references in the existing Ridge1 space. With no matching
reference, the page opens a new Topic and supplies its initial reference; with
one or more matching references, link the page to each matching Topic and do not
create another Topic. A timeout, incomplete search or excluded representation
is not proof that no Topic matches. Multiple memberships require new relational
constraints and client/server proofs; today's canonical Source link is unique
per Source. Topic-reference replacement or erasure must have explicit lifecycle
semantics before owner-state cutover.

The owner explicitly defines the bridge case: Topic A and Topic B begin with
one page each and do not match each other's fixed references. A third page
within both radii receives both memberships and sees both Topics' messages.
The Topics remain separate; no third Topic, transitive merge, duplicate stored
post or relocation of the original Discussion is implied. Both Topic counts
then qualify as multi-member, while the unique learned-page count is three.

## Dashboard Topic counts

The owner requests the primary Topic count to include only Topics with at least
two distinct current learned-page members. Count one-member Topics separately;
keep zero-member retained Discussion containers distinct from both. Count pages
once by Source identity, never by summing memberships. A page can contribute to
multiple Topic counts, and therefore Topic-count bounds derived from a disjoint
partition are not valid for the new model.

Use this same multi-member Topic measure for the time curve and the curve whose
x-axis is learned pages. Historical v1 `activeTopics` meant at least one member;
it cannot be relabelled as multi-member without unavailable past membership data.
Add a separately versioned aggregate history and label current canonical counts
honestly until the new matching model is activated. No private conversation,
account, text, URL or vector belongs in the growth history.

Preserve each accepted post once at its original explicit Discussion/Topic,
including its immutable lineage and historical Source witnesses. Similarity
search is discovery evidence, not automatic permission to move, duplicate,
publish, or reply to those posts. The migration package must specify membership
versioning, explicit destination selection, manual correction, deletion and
representative replacement, as well as preservation of account/private stores,
pairing and subsequent accepted writes. The existing recovery/cutover gate
remains; no owner database migration or service activation has occurred here.

## Existing blocking path and pending compatibility work

The reported busy message has a reproduced canonical ingestion failure even
with the crawler stopped. A stored-page RAM replay at revision 3065 reaches the
ten-second adaptive CPU guard; its dependency component contains 2,396 pages.
Saved Spiegel context/discussion reads are successful in 7-16 ms, and optional
enrichment in 39 ms. The unseen current browser payload is not proven identical
to the stored reproduction, and browser reader/model failures share the generic
busy presentation.

Before the owner selected this architectural change, a compatibility fix was
implemented and committed as `6e36fed`, but not activated: exact unchanged current-policy representations
renew only receipt/revision; bounded exact pair reuse removes duplicate graph
and oracle dot products. New independent Trust tests cover unchanged receipts,
pins/retention/lineage, scoped-save conflicts, policy boundaries, private cache
authority and deadline failure. Read-only owner new-page preparations complete
in 2,931 ms (optimized full oracle) and 3,517 ms (incremental), with complete
scoped plan equality; a production read-only worker prepares new/changed cases
in 6,685/4,201 ms without saving. These are current-catalog measurements, not
a million-page solution. Preserve the checked pending edits until their role in
the new architecture is resolved; do not restart and activate unfinished work.

## Implemented components and remaining activation

The new pure `topic-radius-index` uses immutable vantage-point trees in a
bounded forest, private represented-vector copies, conservative Euclidean
bounds and exact original-order Ridge1 dot checks. Insert/update/delete maintain
a current-ID inventory without copying the whole Map per observation; stale
versions compact within explicit retained and temporary limits. A successful
query returns all matching IDs with `complete: true`; admission/deadline failures
never return a partial or falsely empty result. The pure reference-membership
planner creates a singleton only after an exhaustive empty search and otherwise
returns every matching Topic without changing references. These components
are not yet canonical storage commands or browser write proofs.

Read-only owner-catalog measurement uses the installed pinned Ridge1 transform
and unchanged qualification: 2,328 eligible vectors, 544 ms transformation,
231 ms index construction. All 64 sampled queries equal exhaustive scoring;
median 2.92 ms, p95 4.14 ms. The tree still compares an average of 2,298 vectors
per query (about 99% of the eligible inventory), illustrating weak pruning in
this data. There is no measured million-page performance guarantee. The bounded
32 MiB retained / 64 MiB default temporary prototype is not a million-vector
store, and synchronous tier merges still need production-scale scheduling.

Dashboard v2 implementation counts multi-member Topics and singletons separately,
records a new `topic-growth-v2.sqlite` history, and uses multi-member counts on
both curves. Old v1 contracts/files remain intact and explicitly legacy. Normal
dashboard CLI selects v2; normal backend CLI will sample v2 only after a later
checked restart. Twenty-six restricted dashboard tests and both isolated Chrome
smokes pass, including mobile layout, exact curve values and unknown v1 counts.
The backend suite passes 1,084 tests with five platform skips (1,089 total).
All 1,537 restricted client tests pass; the secret scan finds no issues in 803 files.
The checked components are committed as `edcad40`. The normal dashboard report
was regenerated at revision 3065 with 2,428 unique learned pages, 49 canonical
multi-member Topics and 2,319 singleton Topics. A separate v2 history begins with
one aggregate point; existing canonical/private/crawler stores were not written.
These counts describe the existing canonical model, not activated overlapping
membership. The live service is unchanged; activation still needs normalized many-to-many
membership/reference storage, current proof/DTO/feed integration, reference
erasure and replacement semantics, and tested recovery/cutover. Existing owner
data, pairing and active browser profile have not been changed.
