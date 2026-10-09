# ADR-066: Wikinews multilingual event corpus — local research gate

Status: **owner-approved for private local research only** on 2026-10-09;
product training/release rights and live activation remain unapproved.

## Why this source

The [Wikinews-multilingual dataset card](https://huggingface.co/datasets/Fumika/Wikinews-multilingual/blob/main/README.md)
describes 15,200 article records in 33 languages, with a common `pageid`
linking different-language accounts of one news event. Its repository lists
one approximately 45.3 MB JSONL file and labels the dataset CC BY 2.5.
The [Wikinews copyright page](https://en.wikinews.org/wiki/Wikinews:Copyright)
describes CC BY licensing for its text, with date-dependent versions.
These are source claims, not a legal opinion or assurance that every excerpt,
image, import or output artifact has one uniform license.

The links offer a better cross-language *same-event* training signal than our
invented examples. They do **not** establish that opposing viewpoints from
independent publishers will match, nor that different developments about the
same broad subject should share a Topic. A page-id translation pair can be
much easier than the app's actual cross-publisher task. The card's examples
include older events, so a fresh-news domain shift also needs measurement.
GlobeSumm remains a
private, local-only evaluation corpus under [ADR-065](ADR-065-local-multilingual-corpus-research.md),
not product training material.

## Owner decision and scope

The first acquisition attempt was rejected because the previous approval
covered only GlobeSumm. The owner then explicitly approved this Wikinews
file for private local download, event-matching evaluation and model-training
research on 2026-10-09. The 45,258,115-byte JSONL file now resides in a
private Temp directory outside Git; exact-byte SHA-256 is
`b03da8d71ada96779e860e29a523a7e9f8bf5de3b595b45fd3c12d53b81958fa`.
The [offline adapter](../apps/local-service/experiments/topic-encoder/wikinews-event-eval/README.md)
was prepared with fictional rows. Its first real `--inspect` stopped at a
nullable/blank-date schema assumption; only a fixed error code was emitted.
The bounded adapter was corrected and `--inspect` then passed: 15,200
articles, 5,240 page-ID event groups across 33 languages, group sizes 2–22,
127 empty text fields and 3,549 empty dates. Five fictional tests pass.
No real article content was printed or sent to a provider; no model was loaded.

The subsequent [offline E5 baseline](../apps/local-service/experiments/topic-encoder/wikinews-benchmark-v1/RESULTS.md)
sampled 1,200 articles from 392 intact event groups across 32 languages,
with event-disjoint partitions. On the test partition, the frozen 0.94
complete-link rule joined only 9/534 true pairs (0/32,106 false); pooled
results had 3 false joins. A true-event partner nevertheless ranked in the
top three for 245/254 eligible test articles. This distinguishes good
candidate retrieval from poor safe admission and does not establish
cross-publisher viewpoint performance. No new product model is activated.

Approved research: verify this one file's hash and schema and perform offline,
aggregate-only evaluation/training research. No article text,
URL, per-article vector, model weight or generated derivative enters Git,
logs, the local service, the extension or any AI provider. No new model asset
is downloaded. No product model trained from it is shipped. Before any
product training, retained data, model release or public use, conduct a
separate rights/attribution and Trust review plus the existing ADR-064 live
activation gate. This local research approval does not clear those
later gates.

Evaluate event-disjoint and, where possible, family-disjoint
splits; include same-category neighboring-event hard negatives and report
cross-language pair and whole-Topic quality separately. A finite offline
compute budget must never become a fixed number of Sources per Topic. Avoid
promoting on one validation slice; keep a final holdout. Cross-publisher and
opposing-view performance still needs independent evidence.
