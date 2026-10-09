# Topic boundary: evolving story versus factual event (research note)

Date: 2026-10-09. Status: **research only; overlap work deferred by owner**.
The owner clarified after this analysis that both overlap-compatible and
separate-primary-Topic UX are acceptable and asked us not to work toward
overlap now. ADR-064's narrower principal-event target remains the PoC
working definition; this note preserves the tradeoff, not an active blocker
or mandate for a new architecture. No matcher or product change follows.
Evidence here is limited to the authored A/B [fact-sheet READMEs](../apps/local-service/experiments/topic-encoder/multilingual-authored-v2/chunk-a/README.md) and [B README](../apps/local-service/experiments/topic-encoder/multilingual-authored-v2/chunk-b/README.md), not their article records or model scores. The original chunk C failed language-content QA and is excluded. No corpus training or holdout evaluation was performed for this note.

## Why the current labels are unsafe

The user's stated goal includes the same Topic across viewpoints **and follow-up stages**. Yet `eventKey` in A/B identifies a factual stage, not necessarily the desired discussion Topic. B01's ferry pilot approval, delayed launch and permanent-service decision are three `eventKey`s in one evolving pilot story. B02's gallery design award, construction and reopening; B03's equipment purchase, installation and first-season result; and B04–B06's comparable sequences have the same issue. Each B family contains three six-report stages. If all three are one story, the existing `eventKey !=` rule mislabels **108 cross-stage report pairs per B family, 648 across B**, as same-family hard negatives.

A has mixed boundaries: A01's night-crossing launch and storm suspension/return concern the North Quay crossing, while its West Inlet stop concerns another route. A04's evening desk, mobile blood-pressure visits and vaccine refrigerator alarm are distinct clinic actions. A02's library opening versus collection expansion, A05's repair room versus school-uniform agreement, and A06's boardwalk hours versus nesting closure need explicit adjudication. Shared organization, venue, asset or chronology alone must not decide sameness.

The repaired A01 relation ledger adds a sharper warning: E1/E2 and E1/E3 are
marked as one evolving story, while E2/E3 are distinct adjacent incidents.
Those pair judgments are **not transitive**. A single-valued `storyKey`,
union-find, or connected-component merge would force E2 and E3 together.
Before using these labels for training, audit whether E1 really has two
overlapping story memberships, whether one of the pair judgments is too
broad, or whether all three belong only in Related discussions. A model
cannot resolve an inconsistent equivalence relation by changing its cosine
threshold. This is a product/data-model question, not merely a metric issue.

The frozen `event-token-pool-v3` miner always chooses a different-`eventKey` same-family negative per anchor, and its calibration treats every different event as negative. Running it on A+B could therefore teach precisely the wrong boundary and set an over-conservative cutoff. **Do not run that protocol on A+B.** [ADR-064](../decisions/ADR-064-event-evidence-topic-graph.md) currently frames news identity as the same principal event/announcement, so broadening to a continuing story is an architectural choice for the owner, not a silent relabel.

## Proposed two-level gold labels

Keep `eventKey` for a specific reported development. A provisional `storyKey`
may describe one coherent initiative, incident or process, but **one
single-valued key is valid only for an adjudicated transitive subset**. For
overlapping cases, record explicit pair relations or a set of story
memberships instead. `family` remains a broad entity/actor bucket, not a
Topic label. Annotators derive relation judgments from fact sheets and then
check each report's *main referent*; they do not derive them from model
similarity. A report substantially covering two stories or only mentioning a
prior stage as background is marked ambiguous/multi-referent and withheld
from single-primary training until adjudicated.

| Pair relation | Example from fact sheets | Training and evaluation treatment |
| --- | --- | --- |
| **Positive**: same `storyKey` | B01 approval → launch delay → permanent decision; reports of one stage from different viewpoints | Include same-event and cross-stage positives as separate strata; measure cross-language and cross-stage recall. |
| **Hard negative**: explicitly different `storyKey`, often same `family` | A04 evening nurse desk versus vaccine refrigerator alarm; A01 North Quay crossing versus West Inlet stop, if owner agrees | Mine as competing Topics; count false joins. Different families provide easier negatives only after confirming no cross-entity story. |
| **Neutral / unresolved**: related, but sameness not adjudicated | A02 collection expansion versus library opening; A06 two boardwalk access changes | Exclude from positive/negative mining, cutoff maxima and binary accuracy denominators; report neutral-pair coverage separately. Do not force into a Topic by threshold. |

An explicit `related-but-distinct` relation can later be a negative once the owner settles the Topic boundary; it is **not** automatically a positive merely because a report cites an earlier stage. Label both `storyKey` and `eventKey`, and retain a reason code such as `stage_of_same_initiative`, `different_action_same_entity`, or `uncertain_main_referent` for audit. These codes are offline gold metadata, not new app-retained fields or inference inputs.

## Research protocol if the owner chooses story-level Topics

1. Draft an `eventKey → storyKey` mapping for A/B and replacement C1/C2/C3 from fact sheets, then audit report-level titles/leads in their actual languages against the mapping. Use two independent AI-only assessments for disputed A cases before any model results are seen; surface material unresolved Topic-boundary cases to the owner rather than silently forcing a label. Add clear same-entity **different-story** examples to every split; B alone supplies no such within-family negatives if each B sequence is one story. Require whole-family and whole-story disjoint fit/calibration/development splits and enough explicit hard negatives in each.
2. For training, sample/weight within-event positives and independently
   adjudicated cross-stage positives separately so large evolving stories do
   not swamp smaller stories. Mine same-family negatives **only** where the
   pair is explicitly different, not merely because one provisional key is
   missing; mine outside-family negatives only if explicitly unrelated.
   Ignore neutrals in gradients. Anchors with no admissible same-family
   negative use a documented fallback/skip rule, not a mislabeled stage
   pair. Dynamic mining may use current vector scores only within these
   allowed strata. A non-transitive positive graph cannot be scored as a
   single gold partition.
3. Fit attention on fit families only. Calibrate a fixed precision-first gate on explicitly different-`storyKey` pairs in separate calibration families; do not use `eventKey !=` as the negative condition. Report calibration coverage and abstain if too few competing stories exist. Development can inspect retrieval and threshold edges separately from triangle-component grouping. Freeze the rule and threshold before any genuinely untouched test.
4. Primary evaluation uses story-level pair TP/FP/FN/TN, cross-language and **cross-stage** true-pair recall, same-family different-story false joins, mixed-story components, complete stories and abstentions. Also report event-level diagnostic fragmentation, neutral-pair coverage, per-language recall and runtime. A zero-false result on a small authored set is insufficient for deployment; independent-publisher evidence and input-parity/privacy review remain required.

The current v3 trainer's **optimizer, attention vector and token extraction can be reused as components**, but its mandatory per-anchor family negative, `eventKey`-based calibration and evaluation cannot. Changing those alters the frozen research hypothesis. Version and review a new story-aware protocol before first data run; do not present an altered v3 result as the preregistered event-level experiment. No new holdout should be opened until the story labels and protocol are frozen.

## Owner choice and product routing

- **Story-level primary Topic** (closest to the stated follow-up goal): reports of one initiative's approval, delay, rollout and outcome may share a discussion route. Each post still keeps its own clickable Source-page provenance. A separate action by the same entity needs its own Topic; mere entity or asset overlap is insufficient.
- **Event-level primary Topic** (closer to current ADR-064 wording): each factual development has its own route; adjacent stages appear under **Related discussions** but do not share the primary thread. This does not satisfy the stronger "same Topic across follow-up stages" goal without changing the product requirement.
- **Unresolved boundary**: keep separate primary Topics and offer a related-navigation cue rather than silently merging. Related discussions is navigation, not evidence that posts may be rerouted. Existing discussion roots/subthreads must not be migrated on a research label change without a separately reviewed provenance and migration decision.

If story-level routing becomes a future requirement, the owner would need to
specify which follow-up stages belong to one primary Topic, especially
expansions, repairs, results and reversals, and whether a report may have
more than one primary story. That would require an ADR update, audited labels
and a new offline experiment. For the current event-level PoC this question
is deferred. This note authorizes no live grouping, new retained field,
historical migration, provider/data egress or holdout run.

## Minimal overlap-compatible alternative for later review

Preserve a precise `eventKey`/Source anchor for each root post. Store
candidate **page-to-page relation edges** with a score, evidence version and
relation type (`same_primary`, `related`, `unknown`), rather than using
transitive closure as Topic identity. A viewing page can then retrieve
source-anchored root threads directly from strongly supported neighboring
pages. E1 may surface E2 and E3 roots without E2 automatically surfacing
E3 roots. Replies remain attached to their root, and each post keeps its
own source link. A Topic view could be an overlapping, computed view over
these roots rather than an exclusive persisted partition. This would require
explicit owner/Trust review of routing, pagination, moderation, deletion,
counting, historical migration and stale-edge behavior before code changes;
it is not an instruction to change the current local service now.

The present local service is an **exclusive partition**: its adaptive planner
rejects duplicate Source links and builds disjoint `sourceIds` partitions
([current planner](../apps/local-service/src/domain/adaptive-topics.js));
the discussion view finds one Discussion by `topicId` and roots by its
`discussionId` ([current projection](../apps/local-service/src/domain/discussion-view.js)).
Therefore overlap is not a threshold-only patch. A safe proof-of-concept
could first compute a read-only, source-anchored *related thread projection*
without changing stored `sourceLinks`, root ownership or migrations. It must
deduplicate root posts, preserve deletion/moderation behavior and label
cross-Topic results as related rather than quietly claiming one Topic.
