# ADR-066: Wikinews multilingual event corpus — proposed research gate

Status: **not approved for acquisition or use**. Date: 2026-10-08.

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

## Pending owner decision and scope

The owner approved **GlobeSumm only** for its previous local research task.
The attempted Wikinews download was rejected at the separate data/rights
acquisition gate. Do not retry it, use an indirect route, access a cached
copy, or use the dataset in training until the owner explicitly approves this
new source. A [fixture-only adapter](../apps/local-service/experiments/topic-encoder/wikinews-event-eval/README.md)
is prepared without obtaining data. Its assumed schema and safe aggregate
output are tested only with fictional rows; compatibility with the real file
has not been verified.

Requested first step: download that one approximately 45.3 MB JSONL file to
a named private Temp directory outside Git, verify its hash and schema, and
perform offline aggregate-only evaluation/training research. No article text,
URL, per-article vector, model weight or generated derivative enters Git,
logs, the local service, the extension or any AI provider. No new model asset
is downloaded. No product model trained from it is shipped. Before any
product training, retained data, model release or public use, conduct a
separate rights/attribution and Trust review plus the existing ADR-064 live
activation gate. A download for local research would not itself clear those
later gates.

If approved, evaluate event-disjoint and, where possible, family-disjoint
splits; include same-category neighboring-event hard negatives and report
cross-language pair and whole-Topic quality separately. A finite offline
compute budget must never become a fixed number of Sources per Topic. Avoid
promoting on one validation slice; keep a final holdout. Cross-publisher and
opposing-view performance still needs independent evidence.
