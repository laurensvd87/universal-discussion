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

## Activation boundary

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
