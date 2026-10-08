# ADR-063: Topic-focused embedding shadow, not automatic Topic identity

Date: 2026-10-08. Status: owner-directed offline experiment; no production activation.

## Decision

The owner asked for Topic matching that stays close across opposing viewpoints,
and a project-owned embedding model that starts with English but can later be
trained across languages. This authorizes the local synthetic experiment here;
it does not waive the existing security, owner-data, provider, deployment or
publication gates. Training and evaluation do not depend on another person's
ratings. Synthetic labels remain synthetic evidence, not real-world gold.

Keep the current extension/service Topic routing, source vectors, stored data,
model assets and discussions unchanged while testing. The experimental model
uses the already-packaged, hash-verified multilingual E5 as its base. The first
project-owned head is a 384-dimensional residual rank-12 transform (4,608
parameters / 18 KiB in float32). It can map each page independently but cannot
recover subject distinctions absent from the base vector. It is not a new
language encoder trained from scratch. A separate locally computed sparse/dense
fused-vector variant was also evaluated; it likewise adds no production asset
or retained vector.

The training objective pulls opposite views of the **same precise subject**
together and pushes same-entity/different-development hard negatives apart.
Product version, event stage, referent and scope can distinguish subjects;
publication time is not a universal cutoff. Broader topical relevance remains
graded and is not an equivalence relation. A score is never itself a discussion
identity or permission to merge existing threads.

## Evaluation boundary

The 240-document / 60-topic English synthetic training corpus is split by
whole family into 192 training and 48 validation documents. All input is
invented. The frozen independent 80-document / 40-topic English holdout was
created without inspecting training data or model outputs. A further
independently authored 104-document / 52-topic English stress holdout was
frozen before the fused-vector comparison. Freeze all corpus digests
before inference. Select any cutoff only from validation; report unseen
same-Topic retrieval, opposite-view recall, same-entity hard false joins,
no-match abstention and insertion-order effects. Do not tune on holdout and
then call a rerun independent.

The offline runner denies network and subprocess capabilities, verifies all
packaged encoder assets by digest, keeps synthetic text/vectors in memory and
never opens the owner's database. Do not commit ignored local R5/owner data or
raw page text. The source files in the experiment's `data/` directory are
explicitly project-created synthetic assets; Git's broad local-service
`data/` ignore remains in force for all other data.

## First independent finding

On the 80-document holdout, plain E5 put the same-subject partner first for
48/80 queries; the learned residual head did so for 40/80. A fixed, English-
first text-cue hybrid reached 61/80 but requires both page bodies at pair
comparison time, which the live service deliberately does not retain. Its
result is an upper-bound experiment, not a deployable server algorithm.
Validation-selected zero-false-pair thresholds accepted **zero** positive
holdout pairs for all three approaches. No automatic same-Topic join rule was
established. The head's lower validation loss did not translate into better
held-out retrieval. On the later 104-document set, raw E5 put the right partner
first for 76/104 queries, versus 63/104 for the head and 46/104 for the fused
encoder. At validation-selected cutoffs, raw E5 accepted five correct pairs
and three false pairs; the head accepted three correct and two false; the
fused encoder accepted none. The V2 hybrid gain did not transfer: its
full-text version ranked 43/104 correct partners first on V3. V3 uses some
deliberately generic second headlines and is not a real-web distribution.
Both custom representations are negative results, not activation candidates.
An aggregate-only check against the previously approved six-public-Source R5
pilot found same-development nearest neighbors for two of six queries under
raw E5 and one of six under the head. Its 15 pair labels came from exploratory
assistant review, not independent human gold; it is corroborating failure-
mode evidence, not calibration.

## Follow-on disposition: supervised projection still inactive

After the owner asked for an autonomous, longer model-building attempt, a
second experimental 384D encoder was genuinely trained: it combines the
existing packaged E5 body vector with bounded, local title/lead hashed
features, fitting 768 diagonal weights by opposing-viewpoint positives and
same-entity/different-development triplets. The output is one 384D unit
vector per page, and the artifact is 15,667 bytes JSON / 3,072 bytes of
float32 weights. It is a project-trained projection, **not** a base language
encoder trained from scratch. The existing E5 asset is still required. A
simple heuristic 768D fusion and raw E5 body/title+lead inputs were fixed
comparators. All code is isolated under `experiments/topic-encoder/next-*`.

Training used 242 invented English documents; family-disjoint validation used
68. A 30-document sealed synthetic set tied raw E5 at 24/24 rank-1 matched
queries, and strict validation-zero-false cutoffs accepted no true pair for
either. A later independently authored 95-document / 19-family synthetic
challenge tied at 76/76 rank-1. A separate reciprocal-nearest-margin rule,
fixed before the second challenge, recovered many positive pairs but made
one or two false joins depending on the vector, so it is not safe to activate.
The first holdout is not independent evidence for that later-devised margin
rule; only the second is. Exact digests and metrics are in
[the report](../apps/local-service/experiments/topic-encoder/next-eval/RESULTS.md).

For a rights-clearer reality check, the fixed synthetic-trained model was
tested read-only on the [CDEC-WN Wikinews corpus](https://github.com/adithya7/cdec-wikinews),
released under CC BY 4.0 and described by
[Pratapa et al.](https://aclanthology.org/2021.conll-1.39/). Its 176 articles
represent 55 curated disaster/accident storylines. In the full gallery,
same-storyline rank-1 was raw E5 body 168/176, raw E5 title+lead 169/176,
and the new projection **165/176**. The original curated 48-document test
subset was tied at 48/48. This is a *proxy* for Topic retrieval, not an
atomic-topic, cross-publisher viewpoint, no-match or join-safety benchmark.
The downloaded archive is hash-pinned in Git-ignored `.work/`; the runner
reads it directly in memory, logs aggregates only, and does not persist or
ship its text/vectors. No CDEC text or annotations are committed, and no
real dataset served as training input.

Therefore **do not activate this projection, the heuristic fusion or the
margin rule**. Equal dimensions do not imply compatibility with stored E5
vectors or the existing `.90/.94` routing. Any future attempt needs a
cross-publisher, viewpoint-diverse, provenance-cleared, genuinely held-out
real-page benchmark aligned to the app's precise Topic policy. Dataset
permissions, app privacy and release/store review remain separate; the
owner's tooling latitude did not authorize a live vector migration or
collection-scope change.

## Activation boundary

### Further frozen-model disposition, 2026-10-08

An additional rank-8, 6,144-weight dual-view head trained on CDEC-WN
storylines and a separate head trained on 80 Luna-authored synthetic articles
both failed to outperform a single unchanged E5 pass over title + lead.
On an independently authored 56-article synthetic challenge, title/lead E5
ranked the correct precise development first for 48/48 paired queries and
accepted 40/48 same-Topic pairs at its validation-only cutoff, with no hard
false pair among 72 same-entity/different-development pairs. The Luna head
accepted 32/48 and made one hard false join; the CDEC head accepted 24/48.
All eight unmatched queries abstained, but they are separate-family
singletons, not unmatched developments of represented entities. A combined
single-pass learned head lost one accepted true pair on each validation
corpus and was not promoted to the independent challenge. An independent
read-only audit reproduced the aggregate results and checked split/cutoff
isolation. Exact artifacts, corpus digests and commands are in the
[experiment record](../apps/local-service/experiments/topic-encoder/real-model/README.md).

The disposition remains **shadow only**. In particular, title/lead E5 is
an input *candidate*, not a production change: it changes vector meanings
for retained Sources even though dimensions stay at 384, so mixed old/new
matching and discussion routing need a migration/rollback design and a
separate owner/Trust decision. This synthetic result cannot establish
real-page viewpoint recall or safe joins. A full E5 LoRA fine-tune is
technically feasible but would replace the roughly 118 MB packaged model,
need full-precision weights, and currently lacks an adequate labeled
real-page benchmark; no dependency or model download was made. No new
cross-publisher web claim follows.

A read-only check of the owner's newly selected Guardian/Fox contrasting-view
pair found a current body-E5 cosine of 0.90963. They cover the same 2 April
2025 tariff announcement but remain separate provisional Topics: the current
0.04 global competing-neighbor margin is defeated by another page scoring
0.91400 against one member. This is a grouping-rule miss as well as an
imperfect vector; dropping the floor alone is not an adequate correction.
No owner Source, Topic or discussion was moved. A later candidate should
separate high-recall event neighborhoods from conservative shared-discussion
attachment, and test adjacent but distinct developments plus search-page
contamination on frozen multi-page groups.

Before changing production: demonstrate an improvement over raw E5 and a
text-available baseline on provenance-approved, independent real-page evidence,
including viewpoint, same-actor/different-event, no-match and multilingual
slices. Separately review the chosen model's license, package size, browser/
mobile CPU and memory, one-vector or two-vector storage contract, compatibility
with existing 384D Sources, migration/rollback and discussion stability. Any
additional retained representation or owner-data recomputation requires an
explicit owner and Trust decision. The earlier owner-only pilot and assistant
judgments are useful exploratory checks but not independent human gold.

Research rationale: [entity-aware event clustering](https://aclanthology.org/2021.eacl-main.198/)
tests dense and sparse evidence together, while [topic-aware/stance work](https://aclanthology.org/2023.emnlp-main.694/)
illustrates why the subject and position should be distinguished. Neither
paper validates this model or the app's legal/store posture.
