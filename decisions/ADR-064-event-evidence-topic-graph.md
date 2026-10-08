# ADR-064: Event-evidence Topic graph (offline candidate)

Status: proposed offline research; no live matcher, storage or discussion routing change.
Date: 2026-10-08.

## Problem and decision target

The current catalog-wide 0.04 competing-neighbor margin prevents a genuine
same-event join when *any* other page is nearby. It becomes more restrictive
as the catalog grows. Removing it alone also joins a different, slightly
closer event in the frozen three-page counterexample. A cosine threshold is
useful for finding candidates, but cannot by itself define one discussion.

For news, the target is the same principal event or announcement across
reporting and opinion, not every later consequence of the same policy. For
products, the target is the same model/variant or enduring issue; publication
time is not a universal cutoff. A page covering multiple matters can have
one primary discussion destination and several related destinations. Existing
root posts remain anchored to their Source, not to a reply's origin.

## Proposed method

1. Retrieve neighbors from the existing 384D vector plus Unicode-normalized
   title/URL token postings; rerank with exact cosine. Expand the inspected
   neighborhood when its boundary still contains plausible event evidence,
   rather than deciding from a fixed number of nearest pages. An exhausted
   work budget yields an unresolved result, never an automatic join. A larger
   catalog must not silently make an early neighbor cutoff the Topic boundary.
   Search pages, home pages and near-duplicate copies cannot supply independent
   evidence. The catalog-wide margin is removed from this candidate. The
   bounded search is an implementation work budget, not a global page-count
   ceiling or a promise to ignore later Sources.
2. Score *direct* Source pairs as same-event, related or unresolved. Same-event
   needs both semantic compatibility and specific event evidence: a shared
   named event, action/object, product identity, model/version or other
   discriminative title/URL cue, with no explicit conflicting identifier.
   Generic actor and broad subject overlap alone are insufficient. Dates are
   evidence for event news only, not a blanket rule for products.
3. Make groups from direct evidence, not transitive cosine chains. A seed
   needs independent corroboration of a specific event cue; expansion checks
   multiple independent group exemplars and incompatible members. The exemplar
   cover must expand when language, framing or event details add a genuinely
   new region; it is not a fixed-size proxy for all Topic members. A Topic may
   contain hundreds or more Sources. Do not require every new Source to clear
   a complete-link comparison against every old member, and do not let a
   fixed top-three/top-K neighbor rank decide identity. Repeated
   URLs/syndication do not create extra support. Co-occurring phrases can
   form a *group-local* bridge, never a manually maintained global alias
   table or a per-website integration. An ambiguous page remains provisional.
   Adapt the evidence demand to *competing event hypotheses in that local
   neighborhood*, not the total count of similar pages: more independent
   reports about the same event add support; a distinct nearby development
   adds a conflict to resolve. Density alone never forces a join or a split.
   If two plausible events remain indistinguishable, keep separate primary
   Topics and show them as related. A crowd of compatible pages does not veto
   its own match, and a fixed global cosine/margin cannot override event
   evidence.
4. Keep one primary Topic for current discussion/root routing, with separate
   bounded related links that can expose useful nearby discussions without
   falsely merging them. Manual pins and protected legacy roots are never
   silently reassigned. Reconciliation must remain transactional and stable
   across insertion order, deletion and service restart.

This separates the empty-forum objective from the high-confidence join rule:
when the first page has no defensible same-event Topic mate, relevant nearby
Sources and their existing discussions can still be shown below the primary
discussion as *related*, with honest labeling. Related visibility must not
silently route a new root post into a different Topic.

This deliberately permits abstention. With only the currently retained
URL/title/body-E5 vector, implicit or translated headlines may lack enough
event evidence. The Guardian/Fox tariff-announcement pair may initially be
*related* until independent pages bridge their different wording. A third
page merely mentioning both events as cause and consequence is not proof;
group-local corroboration must distinguish it. Product and multilingual
cases need their own held-out slices. Human correction remains a separate
explicit signal, not a covert training label.

The owner clarified on 2026-10-08 that missed automatic joins are preferable
to incorrect joins. Consequently, validation must optimize *precision first*:
uncertain pairs stay separate with a related link, while only high-evidence
same-event pairs may share the discussion route. A zero-false synthetic split
is necessary but not sufficient for activation; real cross-publisher and
multilingual evidence is still required. There is no promise of 100% recall.

## Scale and data boundary

The eventual service must update a bounded affected neighborhood rather than
replan every pair in the entire catalog. Candidate retrieval can be exact for
small local catalogs; a larger service needs an indexed top-K vector search
and title postings with exact reranking, versioned rebuilds and a recall
audit. Here top-K means one *retrieval batch*, not a fixed candidate or Topic
membership ceiling: expand batches while plausible event evidence remains at
the search boundary. If a work budget prevents that check, mark the result
unresolved rather than asserting a singleton or merging by guess. Previously
supported Source membership must not disappear solely because more reports
enter the same neighborhood. No approximate index is introduced by this
offline candidate. The current SQLite JSON snapshot, response sizes and
10-second planner budget
are separate scaling limits; changing only the join rule does not solve them.

The first candidate uses only already retained URL, short title and vector.
No raw page content, second vector, sparse content fingerprint, publication
date or new provider call is authorized. A later on-device event signature
from title/lead/body might improve implicit and cross-language matching, but
it would be a new retained representation. That requires a distinct owner
and Trust decision, a privacy/retention analysis, model/license/size review,
and a recapture/migration plan that preserves old root provenance.

## Evidence and activation gate

The offline [grouping shadow](../apps/local-service/experiments/topic-encoder/grouping-shadow/README.md)
proves the current margin's scaling failure and the false-join risk of simple
deletion; it does not validate this proposal. A pure candidate and an
independent partition benchmark are implemented. The first title-cue
candidate joined 0/24 same-Topic validation pairs with no false joins; a
more permissive candidate joined 15/24 but made four false joins. Neither
qualifies for activation. A third, retained-data precision-first candidate
joined 6/48 same-event opposing-view pairs and zero false pairs on a frozen
English synthetic challenge. An ephemeral title/lead-E5 plus local lexical
facet candidate joined 33/48 with zero false pairs there, but both joined
0/24 true pairs on an independent multilingual synthetic challenge. Those
scored sets are no longer tuning data for either candidate. This evidence
supports separating broad candidate retrieval from cautious same-event
admission; it does not certify real-world false-join risk or justify extra
retention. [The frozen report](../apps/local-service/experiments/topic-encoder/topic-benchmark/RESULTS.md)
has the exact counts and limits. A later dynamic-local focus graph joined
44/48 true English synthetic challenge pairs with zero false joins and
33/54 same-storyline pairs with zero cross-storyline joins in a limited,
single-publisher CDEC-WN proxy. Yet it joined **0/72** true pairs on a
fresh independent multilingual challenge. Focus E5 still placed a correct
partner in the top three for 46/48 multilingual articles; ranking is
promising but is not evidence of Topic identity. The graph's check against
every outside page is also a disguised global veto and **fails this ADR's
scale objective**. It remains an offline negative result, not the decided
implementation. A future candidate must compare supported *competing event
hypotheses*, not arbitrary outside Sources. Freeze labels before tuning;
measure same-event opposing-view recall, adjacent-development false joins,
unmatched abstention, cross-language and product cases, complete partition
quality, arrival-order stability, duplicate resistance, root-route churn and
latency as catalog size grows. Preserve an untouched real cross-publisher
set; synthetic and CDEC-WN storyline proxies alone cannot authorize live
Topic changes. Report uncertainty and compare against unchanged body-E5 and
title/lead-E5 baselines. Do not tune on a challenge after its results are seen.

Two further offline checkpoints test the no-fixed-count requirement without
changing the live matcher. [V5](../apps/local-service/experiments/topic-encoder/topic-event-v5/README.md)
used a small train-fitted pair reranker, but reciprocal top-three seeds and
complete-link split a varied 20-page event into ten groups. On its five-language
family-disjoint development validation, it joined 21/80 true pairs with zero
false pairs. [V6](../apps/local-service/experiments/topic-encoder/topic-event-v6/README.md)
added an unbounded exemplar cover and group-local expansion. A synthetic
100-report event stayed together beside three adjacent-event reports, but two
weaker true outliers remained a separate group. Multilingual validation stayed
at 21/80 true pairs and zero false; no gold multilingual Topic was wholly
recovered. V6 still depends on V5 seeds and materializes all catalog pairs,
so it is not a scalable or multilingual activation candidate. These are
development results, not independent real-page validation. The next candidate
must overcome singleton seed abstention without making an actor/theme-only
join, and its eventual service implementation must work on indexed affected
neighborhoods. The separately frozen multilingual v3 holdout remains sealed.

V7 removed the V5 seed dependency and let a 102-report synthetic cohort
grow without an adjacent-event join, but its language-dependent lexical
event cue admitted **0/80** true pairs in five-language validation. A relaxed
shared-anchor bridge introduced false joins and was removed. A train-fitted
384-weight diagonal E5 metric left validation rank and high-precision
admission unchanged (38/40 nearest true partners; 1/80 true pair admissions,
zero false). Both are frozen negative results, not reasons to relax the
precision-first gate. [V7 report](../apps/local-service/experiments/topic-encoder/topic-event-v7/README.md),
[metric report](../apps/local-service/experiments/topic-encoder/multilingual-metric-v1/README.md).
A rank-eight [low-rank residual projection](../apps/local-service/experiments/topic-encoder/multilingual-projection-v2/README.md)
then increased multilingual development-validation admissions to 31/80 true
pairs at a train-zero-false cutoff, but also admitted six adjacent-event false
pairs. It is a frozen negative result under the owner's precision-first rule;
the 64,944-byte weight artifact is research-only and not shipped.
With a separately frozen 180-article five-language corpus, a new
[hard-negative projection](../apps/local-service/experiments/topic-encoder/multilingual-projection-v3/README.md)
avoided false joins on its 60 fresh validation pages but recovered zero of
12 complete events (0/120 true pair joins). A different
[two-view pair classifier](../apps/local-service/experiments/topic-encoder/multilingual-pair-v4/README.md)
joined 2/120 true pairs and zero false, still 0/12 complete events. These
train-frozen one-shot checks show that a small synthetic-only metric/head is
not enough; more threshold tweaks would not make a credible multilingual
Topic model. The independent v3 holdout remains unscored.

An [exact expandable retrieval prototype](../apps/local-service/experiments/topic-encoder/expandable-retrieval/README.md)
proves that fixed retrieval batches need not impose a Source count: a
resumable cursor returns exact ranked prefixes and reports `unresolved` on
work-budget exhaustion. It retrieved a 137-report synthetic cohort beside
adjacent/noise items without an arbitrary top-K cutoff. Its favorable timings
use two-active-coordinate vectors, not realistic E5 geometry, and building
the static index remains expensive. It neither establishes event identity
nor meets the future incremental-service design by itself.

For independent real multilingual evaluation, the published
[GlobeSumm dataset card](https://huggingface.co/datasets/TommyYe/GlobeSumm)
describes 370 event groups and 4,687 reports across 26 languages, labeled
CC BY-SA 4.0. Its underlying publisher-article rights and suitability for
product model training need separate review. The owner approved a private
local download and offline research only in [ADR-065](ADR-065-local-multilingual-corpus-research.md).
The first 1,192-article sample made 14/7,049 same-event joins and one
different-event join under the strict focus-E5 baseline; the decision is
not product clearance. The [OG2021 repository record](https://www.clarin.si/repository/xmlui/handle/11356/1921)
is explicitly academic-use/noncommercial, so it is not silently adopted as
a product training corpus. Synthetic validation remains insufficient.

Before live activation, review the exact policy version, affected retained
Sources/Topics, migration and rollback, manual pins, whole-subthread moves,
security/privacy and actual Chrome behavior. Ask the owner explicitly at that
gate. Research on event-driven news clustering supports combining dense and
sparse/entity/time evidence, but does not validate this app's rule:
[Saravanakumar et al., EACL 2021](https://aclanthology.org/2021.eacl-main.198/).
