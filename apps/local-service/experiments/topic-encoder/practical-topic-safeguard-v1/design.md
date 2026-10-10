# Practical Topic safeguard v1: bounded design, not activation

Owner-local proposal, 2026-10-10. No model, threshold, production file, stored
Source, comment, title, vector or weight is changed by this document. It contains
no retained page prose, real private titles, Source IDs or credentials.

## Product target and failure being addressed

The installed BODY metric retrieves useful multilingual article neighborhoods,
but its current indexed policy also groups captured search, navigation, utility
and template pages. Favorable translated-news counts do not compensate for
these gross catalog mistakes. A vector transform cannot recover article
identity from a capture that contains no article-specific content.

The owner permits either grouped discussion or related coverage for cohesive
successive developments in one story. This is broader than the old synthetic
principal-development target, but is not permission to group an arbitrary
organization, category, equipment catalog or application shell. Report atomic
event correctness, same-family different-event exposure and gross/unrelated
exposure separately. Do not relabel all same-family negatives as positives to
make a result pass. A benchmark family is only an adjacent-story proxy.

First deliverable: a reversible experimental read view with a few useful,
conservative groups. Keep Current as fallback and preserve canonical writes,
post provenance, manual pins and legacy roots. Do not add a Related API/UI,
entity extractor, model, second vector or retained metadata field in this slice.

## One exact executable graph rule

Use the existing indexed BODY partition ONLY as a coarse candidate blocking
stage. Refine EACH block independently with strongest-edge, complete-link
dual evidence. Every resulting group is a subset of one coarse block (a fully
admissible block may remain unchanged).
Never expose an unrefined BODY block as a discussion identity or silently
return it when refinement fails.

For provisional Sources a and b, an admissible edge requires all of:

1. Neither Source is negatively qualified as a non-single-content context.
2. BODY cosine >= B, using the installed, validated transform.
3. Original retained raw-E5 cosine >= R, using all 384 unchanged coordinates.

No title overlap, lexical anchor, equal language, matching publisher, fixed
competitor lead, top-k pruning or maximum Topic membership is required.
Titles and URLs provide negative capture-role evidence only in this version.
They never prove article identity. This avoids inventing multilingual entity
keys or recreating the already-rejected blanket title-similarity floor.

The exact policy is **coarse indexed BODY + negative qualification + block-local
dual complete-link**. Global complete-link results do not measure this policy:
the coarse stage can omit pairs that global refinement would consider.

### Deterministic refinement

- Validate the snapshot, provenance, compatible extractor/model, unique IDs,
  Source links, 384 finite coordinates and existing unit-norm tolerance before
  planning. Preserve original raw vectors; transform to separate normalized
  BODY arrays once. Artifact validation/copying stays outside repeated pairs.
- Run the current indexed BODY policy with its fixed coarse admission
  `0.3622392629925627`, not a newly selected grid value. Hold its complete
  partitions in memory as candidate blocks only.
- Every negatively qualified Source becomes its own singleton. All remaining
  Sources in a block start as singleton groups.
- Enumerate unordered pairs inside that block. Compute full raw and BODY dot
  products. Retain only pairs satisfying the selected B and R for edge ordering.
  Sort by descending full-precision BODY cosine, then descending original
  cosine, then ascending canonical Source-ID pair. This matches the lead's
  pre-quality rule and the frozen dual-development implementation. Do not
  quantize sorting scores to Float32 or lossy bins.
- Process that immutable edge order. For different current groups, merge only
  if EVERY cross-group pair is admissible. One raw/BODY failure vetoes the merge.
  A union-find or member-index structure may maintain group membership; do not
  change scores after merges or replace all-pair checks with a centroid mean.
- Return every eligible provisional Source exactly once, including unqualified
  and unjoined singletons. Manual-confirmed Sources, canonical Source/Topic IDs,
  manual/legacy roots and all write targets retain their existing invariants.

Important implementation trap: the current indexed planner combines exact
vector duplicates before admission. Its output blocks must be expanded to
the original Source IDs before this refinement. Do not reuse that duplicate
expansion as an automatic final join: distinct captured shells can have the
same vector. Qualification and every-pair checks must still apply to every
Source. Raw/BODY vector equality is not independent identity evidence.

### Work and memory boundaries

Coarse indexing reduces the pair universe, but refinement is O(sum block-size
squared) in the worst case. Call it bounded, not universally scalable.

- One whole-plan monotonic deadline covers validation, transformation, coarse
  planning, qualification, enumeration, sorting and all cross-pair checks.
- Debit pair scoring, cross-pair checks and other bounded work from the SAME
  whole-plan work budget. Do not reset a ten-second allowance per block/stage.
- Keep pair caching bounded and optional; eviction may recompute, never remove
  an eligible edge. Reserve an explicit byte budget for the edge-order buffer,
  with fixed-width packed entries or conservatively charged JS storage. A
  Float64 score plus integer endpoint/order buffers gives explicit byte costs.
- Before allocation/push, check buffer bytes and remaining work/time. Account
  for sort scratch space; debit comparisons and check the deadline during the
  comparator as well as before/after sorting. Throwing aborts the entire plan,
  not merely the current sort. A pair count derived from a memory allocation
  limit is a work guard, not permission
  to keep only that many nearest pairs or members.
- Process blocks sequentially and release each edge buffer. Output-size limits
  remain distinct from membership semantics.
- Any budget, validation or completeness failure returns NO candidate partition,
  including already-completed earlier blocks. Use the existing Current fallback.
  Never publish a partial refinement, skipped block, top-count subset or coarse
  result. Cache only a complete revision-bound plan under its policy version.

This is the smallest practical delta. An exact primary dual-metric radius index
with geometric certification can follow if measured large-block workloads
require it; it is not needed to claim the first bounded implementation.

## Conservative non-single-content qualification

Use only retained bounded URL/title and existing provenance. Return a negative
reason or unknown; UNKNOWN REMAINS ELIGIBLE for dual evidence. A missing title,
unrecognized language, unknown host or unfamiliar URL is not a negative.

Freeze an explicit small syntactic rule table before evaluating the next cohort:

- A normalized root/landing path, without a content-specific path, is a hub
  rather than evidence for a cross-Source article identity. Leave it singleton.
  Explicit content-item query routes are an exception (not a positive identity
  rule); include a root-path article-ID URL as a false-rejection control.
  This sacrifices some substantive landing pages without deleting them.
- Exact search-result route components and search endpoint/query combinations
  are non-single-content contexts. Match component boundaries, not a substring
  such as a word about searching inside an article slug. Generic q/query/search
  parameters alone on a substantive article URL are insufficient; pair them
  with a root/search endpoint or a known search-service route.
- Existing sensitive URL-policy rejections, authentication routes and obvious
  app onboarding/installed/what-is-new/update endpoints are negative contexts.
  Use route structure and known route semantics, not a publisher/brand blacklist.
- A small fully anchored set of unmistakable full-page challenge/loading UI
  titles may be negative. Empty/generic titles qualify only together with a
  known app/landing/navigation context. Do not strip arbitrary publisher suffixes
  or reject titles for punctuation, length, unfamiliar script or generic words
  occurring inside a legitimate article heading.
- Known metadata-only media-client or interactive-tool routes can be an OPTIONAL
  negative rule, defined by exact configured host/path role rather than a title
  brand token. Keep this flag/version explicit and freeze it in the experiment.
  A video, product or tool is not intrinsically unrelated; the reason is that its
  captured text is not reliable single-item semantic evidence. Unknown media/tool
  routes remain eligible. Do not infer transcript availability from a title.

Rules affect experimental automatic grouping only. Each quarantined Source
retains its ID, vector, canonical comments and manual-link eligibility. No
deletion, guessed historical migration, capture refetch or provider request.
Diagnostics print reason counts only, never page metadata or private examples.

Do not add a mandatory title/slug anchor or product-code entity rule in v1.
Such clues can be useful negative evidence later, but incomplete multilingual
titles and model/version names can also legitimately differ within one story.
The dual raw check is the concrete cheap second signal being tested here.

## Future-capture repair, separate from old-Source guard

The current reader selects its first eligible MAIN/ARTICLE immediately. Only
fallback containers must satisfy paragraph, link-density and prose evidence.
Thus a semantically tagged application shell can pass where an equally weak
unmarked container would fail. This is a concrete qualification asymmetry.

A separately tested reader guard should apply bounded structural prose evidence
to the selected semantic region before inference, using the already-permitted
DOM traversal/text prefix and existing collection budgets. It should abstain
on link/menu/card-dominated or empty shells instead of embedding them. Do not
read the full body, collect more metadata, upload text, save structural facts
or silently reorder/rewrite accepted page input. Include brief legitimate
articles, non-Latin scripts, accessible MAIN/ARTICLE layouts and substantive
product/how-to pages as false-rejection controls. Existing fallback numerical
rules are a starting comparator, not proven universal article criteria.

This cannot retrospectively attest retained captures. Missing historical
structural evidence stays unknown. Review any changed extractor/compatibility
contract explicitly; do not relabel old Sources as newly prose-qualified.

## One bounded development experiment and fresh boundary

The coding lead owns implementation; a separate author owns fresh fixtures.
The first experiment measures the EXACT deployable composition above, not
global dual complete-link alone. No new model, fitting or retained field.

### Development only

Reused development: original 150 article validation, authored C108, spent v6,
and the owner catalog as an explicitly exploratory title/URL audit. Keep all
already-used fresh-news sets, including shared296, SPENT: do not select any
threshold, qualifier or ordering from their quality counts.

Evaluate the predeclared grid:

- B in {0.3622392629925627, 0.50, 0.65, 0.80}.
- R in {0.80, 0.85, 0.90, 0.94}.

Coarse indexed admission remains fixed for all 16 arms. Qualification logic,
block-local BODY edge ordering, Source-ID ties and budgets are identical.
Reconstruct corpus sources with truthful metadata availability: invented URLs
may exercise the pure parser, but are NOT evidence about actual publisher URLs
or Chrome captures. Missing metadata must use the same unknown-eligible rule.

Use the lead's already-declared selection screen: authored C108 false grouped
pairs <=19 and mixed pages <=23, v6 false grouped pairs =0; then maximize reused
development pure multi-page reach. Freeze deterministic ties (correct grouped
pairs, fewer false exposure, then stricter B/R). Do not relax this screen because
an arm loses. Also report broad-family and viewpoint denominators separately.
The known catalog checks can veto an obviously broken candidate, but cannot
establish its precision. Every arm must retain all expected IDs exactly once.

A fast global complete-link grid is a DEVELOPMENT screen only. Remeasure the
coarse-indexed composition before selecting/freezing a deployable candidate.
If none passes or the exact composition remains grossly wrong, keep Current;
do not substitute the favorable global/news-only result.

### Freeze before new evidence

Freeze the chosen B/R, qualifier table/optional flags, exact graph and complete
source hashes, artifact manifests, budgets, metadata availability, baselines,
selection criterion and all holdout hashes. Also freeze no-retuning/abort rules.
Do not invoke fresh body/title inference until the receipt is reviewed.

Fresh evidence has TWO required strata in the ONE experiment:

1. Next hash-selected whole-event news cohort, at most 300 articles, excluding
   every previously exposed event/exact-input key including shared296. Extend
   the shared selector with that additional exposed cohort; do not reuse its
   old 296 members under a new label. Report available events/selection counts
   before inference. This stratum checks multilingual retained-vector transfer,
   not capture qualification, publisher independence or viewpoint safety.
2. Separately authored, matcher-blind compact capture/context challenge: real
   collected fixture DOM outputs, multilingual/opposing-viewpoint article
   positives, owner-acceptable cohesive successive-story cases, unrelated
   shared-actor/category cases, search results, root hubs, challenge/navigation
   shells and metadata-only contexts. Include identical/near-identical shell
   vectors with different headings and legitimate short/non-Latin content.
   Labels distinguish atomic same event, acceptable related family, and gross
   unrelated/capture-invalid. Freeze fixture bytes and labels before measurement;
   authors do not inspect selected scores or fresh outputs.

All prose/vectors stay RAM-only or in the already-approved private research
scope; repository evidence is hashes, fictional authoring code if permitted,
and aggregates. No real title/catalog partition is saved. Authored perspectives
are not independent publishers or fluent-human validation; say so.

### Reports and activation gate

Compare Current/raw, fixed indexed BODY and the ONE frozen guarded composition
on the same cases. Count retained IDs, qualified/quarantined reason counts,
retrieval omissions, true event/acceptable related/gross unrelated exposure,
pure/mixed pages under BOTH strict and broad labels, cross-language and opposing
viewpoint reach, exact-vector collision exposure, false rejections, work/cache
bytes, total/per-stage runtime and whole-plan failure behavior.

Preserve the lead's relative no-worse false-exposure criterion. A news win
cannot cancel gross context-challenge failures. Require the context stratum to
prevent shell cross-content joins and still retain independently defined useful
multilingual matches. Report all results, including failures, once. No fresh
threshold or rule selection, hidden membership truncation or post-hoc relabeling.

Only after exact-policy evidence and trust/contract tests should the lead
consider a reversible explicit New read view. BODY loading remains explicitly
disabled by default meanwhile. Activation is a separate reviewed change with
canonical-write/Source-anchor/manual/legacy/revision and switch-back tests;
no rights, release, migration or deployment conclusion follows.
