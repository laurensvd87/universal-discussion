# JRC story benchmark protocol (2026-10-09)

Status: pre-registered research protocol for the owner-approved, private local,
aggregate-only evaluation in [ADR-068](../decisions/ADR-068-jrc-cross-publisher-local-benchmark.md).
This file defines measurements and data-risk checks; it reports no benchmark
result and does not authorize product training, activation, migration, broader
retention, publication, or data egress.

## Dataset facts and limits

The official [EU dataset entry](https://data.europa.eu/data/datasets/fc214973-ce7f-401f-ad6d-2a08fa97cd1d?locale=en)
describes 4,251 June 2024 news titles in 110 manually curated story clusters.
Analysts removed irrelevant records, merged and split thematic groups, and
wrote short cluster descriptions. The [portal metadata API](https://data.europa.eu/api/hub/search/datasets/fc214973-ce7f-401f-ad6d-2a08fa97cd1d)
lists the distribution metadata and license. Neither the catalog license nor
the labels establish rights in each publisher title, fitness as product
ground truth, or permission for training/release.

The approved local inspection found 39 language values, 1,514 URL hosts, group
sizes from 2 to 423, and no article bodies in the dataset schema. A host is a
URL grouping, not a verified publisher identity. The corpus is limited to one
Ukraine/Russia news domain and one month; results must not be generalized to
other subjects, content types, languages, or live Topics. The largest
423-record label is a specific granularity risk: a curated developing-story
cluster can be broader than the app's intended atomic discussion Topic.
Aggregate case-insensitive raw-title inspection also found 893 surplus rows across 442
repeated-title groups, all within a label. Report de-duplicated and
non-duplicate slices; an easy syndicated headline must not be counted as
independent cross-viewpoint evidence.

No JRC aggregate result report is committed as of this protocol date; the
repository status describes the evaluation as in progress. Freeze this
protocol before examining any metric output. Do not open or export the private
CSV for this protocol, and do not log or commit row-level titles, URLs, labels,
descriptions, vectors, predictions, or derived row-level data.

The initial 1,200-title, whole-label **train-only** E5/Jaccard run is an
exploratory baseline, not the complete protocol below. It does not audit
cross-label event leakage, score cross-language or whole-Topic quality, or
establish an independent test result. The selected 423-row label sits in
train for that baseline; its processing is an engineering stress check, not
held-out proof. Do not call this pilot a research pass.

## Freeze and split discipline

1. Freeze the parser, candidate representation, matcher, threshold(s),
   retrieval settings, exclusions, metric implementation, and this protocol
   before computing or inspecting test metrics. Record code/config hashes and
   the input file hash in the private run manifest; publish only hashes and
   aggregate values.
2. Use a deterministic, label-disjoint train/validation/test split. Assign
   whole labels, never article pairs or individual records, to a split. Use a
   fixed seed and target approximately 60/20/20 percent of records, balancing
   label count, record count, and language/host coverage as far as possible.
   Keep every label wholly within one split.
3. Check for broader event leakage across labels before accepting the split.
   In the private environment, group labels that clearly refer to the same
   event using label descriptions and time/entity metadata; keep each such
   event group in one split. Also audit train/validation/test for normalized
   exact-title duplicates, near-duplicate titles, and syndicated URL/title
   copies. If an overlap is found, move the complete connected event/duplicate
   group together and regenerate the split before fitting or threshold choice.
   Report only counts by split and overlap category. Label disjointness alone
   is not proof of event disjointness.
4. Use train only for candidate development and threshold selection; use
   validation for the single planned selection step; open test metrics once
   after all choices are frozen. Do not use test errors to revise the matcher
   and then report the same test as independent evidence. Any revised
   candidate needs a newly reserved holdout or must be labeled exploratory.

If the 110 labels cannot be divided into defensible event-disjoint splits,
stop and report that limitation. Do not silently fall back to random-row or
random-pair splitting.

## Pre-registered metrics

Report denominators and numerators beside every rate. Compute confidence
intervals by resampling whole labels/event groups, not individual pairs, so a
large cluster cannot create falsely narrow uncertainty. Provide micro and
macro-by-label summaries; neither replaces the slices below.

### Candidate retrieval

- For each query record, rank eligible records from other URL hosts. Measure
  same-label Recall@1, @5, and @10, MRR, and the fraction of queries with at
  least one relevant candidate. This is retrieval only: a retrieved neighbor
  is not an admitted Topic match.
- Repeat on cross-language same-label pairs, separately reporting each
  supported language-pair direction and an aggregate cross-language result.
  Report support counts; mark sparse language pairs as descriptive, not as
  evidence of reliable performance.
- Also report within-host retrieval as a diagnostic, not as a substitute for
  cross-host performance. URL host is an imperfect proxy for publisher, so
  describe this slice as cross-host rather than cross-publisher ground truth.

### Hard match and false-join behavior

- At the frozen admission threshold, report pairwise precision, recall,
  F1, false-positive rate, abstention/no-match rate, and confusion counts.
  Distinguish a missed true pair from a false join. A retrieval hit counts as
  correct retrieval even when the admission rule abstains; it does not count
  as a Topic join.
- Report false joins by distinct gold label pair, not just raw pair count, and
  list aggregate error categories (for example, broad thematic overlap,
  adjacent developments, duplicate/syndicated coverage, and entity-only
  similarity). Keep examples and identifiers private.
- Report cross-host and cross-language admission precision/recall separately.
  Also report precision on different-label pairs sharing common entities or
  closely timed coverage where a safe, private metadata-only slice can be
  formed. Do not infer viewpoint agreement: the corpus has titles and labels,
  not verified stance annotations.

### Topic recovery and label granularity

- Build predicted Topics from the frozen admission procedure and report
  pairwise cluster precision/recall, B-cubed precision/recall, and complete
  gold-label recovery (a label is complete only when all its records land in
  one predicted Topic and no out-of-label record joins it). Report exact
  recovery counts and macro-by-label completeness; do not substitute nearest
  neighbor Recall@k for Topic recovery.
- Stratify every recovery and false-join metric by gold label size: 2–5,
  6–20, 21–100, and over 100 records. Report the 423-record label separately
  as a stress cohort, including its admitted Topic count, completeness,
  purity, and largest false-joined cohort. This is a benchmark stress test,
  not a reason to cap product Topic size or to treat a broad label as one
  indivisible discussion.
- If the 423-record group or other large labels appear too broad for one
  atomic discussion Topic, report that as a gold-granularity failure mode.
  Do not split or relabel it after seeing candidate predictions and then call
  the modified label an untouched test target.

## Dataset-risk and integrity checks

Before interpreting scores, emit aggregate-only counts for:

- rows, nonempty labels, label-size distribution, language distribution,
  host distribution, missing metadata, and records excluded by predeclared
  parser rules;
- exact normalized-title duplicates, near-duplicate-title groups, repeated
  URLs, and any overlap crossing proposed splits;
- per-split label, row, language, host, and event-group coverage;
- cross-host and cross-language eligible query/pair denominators, with sparse
  slices explicitly flagged;
- the count of labels with broad or ambiguous descriptions, especially the
  423-record label, as a qualitative granularity limitation. Do not print the
  description text or label values.

Run a private annotation-risk review of aggregate label-size tails and
description ambiguity before interpreting full-label recovery. Keep any
human-reviewed titles, descriptions, URLs, or judgments outside Git and
provider requests. If such review is not conducted, state that label
granularity remains unverified rather than implying that the curated labels
are atomic app Topics.

The implementation must process the full 423-record group. Do not impose a
fixed cohort/page-count cap merely to improve benchmark scores. Record runtime,
peak memory, candidate-pair count, and completion status for that group as
engineering diagnostics; they are not semantic quality metrics.

## Research-only decision rule

For this frozen candidate, define a **research pass** only if the untouched
test split meets all of the following: (a) hard-match pair precision is at
least 99.5%, with the cluster-bootstrap 95% lower confidence bound at least
99.0%; (b) no observed false joins occur in the cross-host or cross-language
test slices; (c) cross-host and cross-language Recall@10 are each at least
80% on adequately supported slices; and (d) complete gold-label recovery is
at least 50% overall, with results for the over-100-record and 423-record
cohorts disclosed separately. Inadequate slice support, failed event-disjoint
checks, incomplete full-group execution, or an unreported denominator is a
fail/inconclusive result, not a pass.

These thresholds are pre-registered research criteria chosen to emphasize
precision while requiring meaningful candidate coverage and whole-Topic
recovery. They are not calibrated safety guarantees, legal findings, an
automatic model-selection rule, or authorization to activate a matcher. A
research pass still leaves publisher-rights review, Trust review, ADR-064/067
owner approval, and any retained-representation or live regrouping gate
separate and unmet unless explicitly completed.
