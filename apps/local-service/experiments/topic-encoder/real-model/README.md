# Real-language dual-view Topic encoder shadow

This experiment trains a rank-8 residual transform from **two views of one
page**: the already-packaged E5 body vector and E5 title-plus-lead vector.
The trainable transform has 6,144 parameters (24,576 bytes in float32) and
returns one normalized 384D vector (1,536 bytes in float32). It is a compact
project-owned metric head on the packaged E5 model, not a language model
trained from scratch. Two E5 passes per page are required by this candidate.

`train-cdec.js` reads only the `train_subtopics.txt` inventory of the pinned
CDEC-WN Wikinews archive (CC BY 4.0, Pratapa et al., 2021). It splits the 40
training storylines by whole group: 102 articles in 32 groups for training,
26 articles in 8 groups for validation. The corpus test inventory and any
forthcoming web benchmark are not used for training, model selection or
calibration. Article text is bounded to 1,024 characters for this experiment;
the archive stays ignored in `.work/`, and no article text, URL or individual
label is written into `model.generated.json` or printed by the runner.

Training minimizes a normalized cosine triplet loss. Positive articles share a
curated storyline. Negatives include the four nearest articles from other
storylines under the base title/lead E5 view, plus same-family negatives if
the supplied labels have them. Validation selects the better of body,
title/lead and equal-weight E5 starts, then selects a low-rank training epoch
only when retrieval or margin improves. The run has an explicit 20-second
training budget and a 12-epoch patience limit; this does not cap the separate
E5 inference time. The CDEC train split does not label opposing viewpoints or
same-entity/different-event families, so it cannot establish those behaviors.

Frozen CDEC train-only artifact SHA-256:
`b0b803608a21d810c9342fcf2c52893772361fb139d12679420dc4ef9c24b9e7`.
The JSON is 129,674 bytes; float32 weights would take 24,576 bytes. The
selected base mix is body E5; the learned residual additionally uses the
title/lead E5 view. On the 26-article family-disjoint CDEC validation split,
both raw title/lead E5 and the learned representation retrieve the correct
storyline first for **26/26** queries. The learned mean nearest-positive minus
nearest-negative margin improves from 0.0593 to 0.0843, but there is **no
validation top-1 gain**. Encoding two views of 128
1,024-character articles took roughly 115 seconds on the test machine;
training then took 4.9 seconds. A first 4,096-character run was stopped after
about three minutes before reaching training. This cost matters before any
browser or mobile proposal.

The pending cross-publisher web benchmark must be evaluated without changing
this frozen artifact. No cross-publisher web benchmark is available, so no
cross-publisher web score is claimed.
The result cannot authorize Topic merges, threshold
changes, owner-data migration, extra retained vectors or production activation.
`encodeRealPage(page, bodyE5, titleLeadE5, artifact)` is the inference API;
`page` is reserved for the caller's page record and the transform reads only
its two vectors.

`luna-core.js` adds a separate experiment path for the independently authored
hard synthetic articles. It checks whole-family split isolation, trains a
distinct artifact on train/validation only, and evaluates raw body E5, raw
title/lead E5, the frozen CDEC model and the new model on the test split. Every
strict pair cutoff comes from validation negatives. It also reports matched
top-1/top-3, same-family hard-pair AUC, true/false accepted pairs and no-match
singleton abstention. The corpus loader checks the author's frozen checksums.
The Luna-trained artifact is separate from the CDEC artifact.

The frozen Luna JSONL corpus has 80 train, 20 validation and 20 test articles.
Its separate SHA-pinned broad-family map supplies same-entity/different-topic
negative labels without changing the article text. The first 20-document test
contains 16 paired queries, 24 same-topic article pairs, 32 same-broad-family
hard-negative pairs and four no-match singleton queries. The Luna model artifact
is `model.luna.generated.json`, SHA-256
`2a8386063640f46895a34abdd2f218819c3c73e83e82cb94c1748a7d6aebcab0`.
It was frozen after training on the 80/20 train/validation split and was not
adjusted from test results.

All four methods retrieve the correct partner first for 16/16 matched test
queries. At each method's validation-selected zero-false-pair cutoff, raw E5
body accepts 14/24 same-topic test pairs, raw E5 title+lead **22/24**, the
CDEC-trained model 14/24 and the Luna-trained model 11/24. All make zero false
joins on this small test and abstain on four of four singleton queries. Thus
the trainable Luna model is worse than simple title+lead E5 on the available
synthetic test. A further independently authored challenge was requested after
this artifact was frozen. Two E5 views took 14.2 plus 15.4 seconds for all 120 pages; training
took 3.1 seconds.

The additional single-pass rank-8 head uses only title+lead E5. It was trained
on 102 CDEC plus 80 Luna train articles, selecting an epoch on separate
family-disjoint CDEC (26 articles) and Luna (20 articles) validation. Its
`model.single.generated.json` SHA-256 is
`b6d83f8689d7fb4bfe393008b1744d5d706c2f86b7f7b3192ccff1a35b4b02fd`.
Validation nearest-neighbor margins improved, and both raw and trained models
ranked every paired query first. At validation-selected zero-false cutoffs,
the trained head accepted fewer true pairs on both sets: CDEC **17/30** versus
raw title+lead **18/30**; Luna **19/24** versus raw **20/24**. Its predeclared
promotion gate failed, so it was **not** scored on the later challenge. The
single E5 pass took 48.4 seconds for 228 pages; training took 2.5 seconds.

After both dual-view artifacts and all validation choices were frozen, the
independent 56-article Luna challenge was scored once. Its pinned article SHA
is `3037887840d52e38c397eea20d0032d8c77343bb146a6ad65c69db890d804006`
and broad-family map SHA is
`0219fc75502c53f91b35a2d7490362b39549c05c3df4229420c9103f404deaee`.
It has 48 opposing-view matched queries, 48 same-topic pairs, 72 same-broad-
family hard-negative pairs and eight no-match singleton queries. With cutoffs
chosen **only** on the original Luna validation split:

| Vector | Matched top-1 | True pairs accepted | False pairs | Singleton abstentions |
| --- | ---: | ---: | ---: | ---: |
| Raw E5 body | 48/48 | 18/48 | 0 | 8/8 |
| Raw E5 title+lead | **48/48** | **40/48** | **0** | **8/8** |
| CDEC-trained dual view | 46/48 | 24/48 | 0 | 8/8 |
| Luna-trained dual view | 48/48 | 32/48 | **1 hard false join** | 8/8 |

The straightforward title+lead E5 view is the strongest tested representation
on this challenge. These eight unmatched pages are from separate broad
families; they do not test a new, unmatched development of an entity already
in the gallery. The Luna-trained head makes a false same-entity join and
cannot be considered safe for automatic Topic grouping. This remains a
synthetic, bounded benchmark; it does not prove real-web topic identity or
authorize production input, vector or threshold changes.

Run the train-only program and focused offline checks from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/real-model/train-cdec.js
node apps/local-service/experiments/topic-encoder/real-model/run-luna.js
node apps/local-service/experiments/topic-encoder/real-model/train-single.js
node apps/local-service/experiments/topic-encoder/real-model/run-challenge.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-model/*.test.js
```
