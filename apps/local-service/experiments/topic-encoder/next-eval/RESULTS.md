# Frozen English synthetic topic-projection result

Candidate weights: `f5f046c6f447dc2d3ebd680bd9131fa421d03a5338698ca4a0e43dbfb3857b5d` SHA-256 of
`next-model/model.generated.json`; sealed 30-document holdout:
`0b12b1cd12a1c691796d6a3870fc8829f300998aeb3fd901ce8d229815a93336`
SHA-256 of its JSON documents. The 30 documents represent six wholly unseen
families, 12 opposite-view same-development pairs, 48 same-family hard-negative
pairs and six singleton no-match queries. The 68-document validation gallery
is disjoint by family. No model or cutoff was refit after holdout inference.

| One-page vector | Validation matched top-1 | Sealed matched top-1 | Sealed hard-pair AUC | Sealed true pairs accepted at validation-zero-false cutoff | Sealed false pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raw E5, body | 50/64 | 24/24 | 1.000 | 0/12 | 0 |
| Raw E5, title + lead | 53/64 | 24/24 | 1.000 | 1/12 | 0 |
| Fixed lexical/E5 fusion | 50/64 | 22/24 | 0.995 | 0/12 | 0 |
| Trained diagonal fusion | 55/64 | 24/24 | 1.000 | 0/12 | 0 |

All methods abstained on six of six singleton no-match queries at their very
strict cutoffs. That is not evidence of a useful join policy when those
cutoffs accept almost no positive pair. The learned projection's apparent
validation gain did **not** become a held-out retrieval gain; the holdout is
also too easy for raw E5 to discriminate stronger candidates. Do not replace
the production E5 vector, reuse its `.90/.94` scores with a new representation,
recompute retained Sources, or move existing discussions based on this test.

After this first holdout was inspected, a reciprocal-nearest-neighbor margin
rule was designed. On the already-exposed set it accepted 12/12 E5-body and
12/12 learned-model positive pairs with no false pair, using cutoffs chosen
from validation. **This is development-only evidence, not a fresh held-out
result**. Its behavior is gallery-dependent and must be checked on a newly
frozen independent challenge and realistic catalog sizes before even
considering a production design. It cannot resolve multiple overlapping
Topics or safely move rooted conversations by itself.

## Second sealed synthetic challenge: neighbor margin fails safely only by abstaining

An independent agent, given no model code, prior corpus or outcome, froze 95
new invented English documents across 19 families before inference. SHA-256:
`b120406f1405b0f2ed5e70ce667d733ce384206df51d9fb2cc49e89a825314e9`.
There are 38 cross-view same-development pairs, 152 same-family hard-negative
pairs and 19 singleton no-match articles. The same frozen artifact and the
previously fixed validation thresholds were used once.

| Method | Same-development rank 1 | Hard-pair AUC | Strict cosine true/false pairs | Reciprocal-margin true/false pairs |
| --- | ---: | ---: | ---: | ---: |
| Raw E5, body | 76/76 | 0.999 | 0 true, 0 false | 38 true, **2 false** |
| Raw E5, title + lead | 76/76 | 1.000 | 1 true, 0 false | 38 true, **1 false** |
| Fixed lexical/E5 fusion | 76/76 | 0.986 | 0 true, 0 false | 4 true, 0 false |
| Trained diagonal fusion | 76/76 | 0.999 | 0 true, 0 false | 37 true, **2 false** |

The strict cosine rule abstained on all 19 no-match cases but accepted almost
no real pairs. The reciprocal-margin rule recovered many pairs but made false
joins despite zero such errors on validation. It therefore **fails the
automatic-Topic safety criterion**. All four rank-1 results tied, so this
challenge again fails to establish a new vector advantage. The test is
synthetic and partly formulaic; even perfect rank-1 would not prove real-web
quality.

## Licensed real-language cross-check: CDEC-WN

The [CDEC-WN dataset](https://github.com/adithya7/cdec-wikinews) from
[Pratapa et al.](https://aclanthology.org/2021.conll-1.39/) is released under
CC BY 4.0. Attribution: CDEC-WN, Pratapa et al., 2021. Its English Wikinews
disaster/accident articles and curated subtopic groups were downloaded to the
Git-ignored `.work/` directory **only**; the 573,230-byte archive SHA-256 is
`7d5b1790145fc0603913aa24b60ce1bd8104196191289363fb6e2eb73c8d346d`.
The runner reads members directly from that verified archive in memory; it
does not trust a separately extracted copy.
No raw text, URL, annotation, vector or model output is committed, sent to a
provider, sent to the local service, or printed by the runner. The frozen
synthetic-trained model was not refit to this dataset.

| Method | Curated test subtopics: same-storyline rank 1 | Full 55-subtopic gallery: rank 1 |
| --- | ---: | ---: |
| Raw E5, body | 48/48 | 168/176 |
| Raw E5, title + lead | 48/48 | **169/176** |
| Fixed lexical/E5 fusion | 44/48 | 125/176 |
| Trained diagonal fusion | 48/48 | 165/176 |

This is a useful real-language regression check, but its label is an
*individual storyline*, not a verified atomic discussion Topic; all articles
come from one publisher and one news category, and the dataset does not label
opposing viewpoints. It has no singleton no-match query. Its pair AUC compares
same-storyline pairs to *all other disaster storylines*, not specifically
same-actor/different-event hard negatives. The trained model is three rank-1 queries **worse** than
raw body E5 on the full gallery, and four worse than title+lead E5. Do not
promote it. The full-gallery comparison was run after the 48-document check
and is an exploratory stress result, not an untouched blind benchmark.

Overall: we produced an actual supervised, compact per-page embedding
projection and repeatable comparisons, but **not a better general Topic
encoder**. The most useful next evidence is rights-cleared, cross-publisher
same-development and hard-negative pairs with stable labels. More model
training on invented data alone is not justified by these outcomes.
