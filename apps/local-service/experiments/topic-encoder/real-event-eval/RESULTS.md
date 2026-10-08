# GlobeSumm local-only baseline, 2026-10-08

This is aggregate, offline research under [ADR-065](../../../../../decisions/ADR-065-local-multilingual-corpus-research.md), not an activation or publication of article data. No title, text, URL, per-article vector or fitted weight is included here. The owner's private JSONL input is outside Git; SHA-256 of exact bytes is
`8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`.
The published dataset card describes its [license and event corpus](https://huggingface.co/datasets/TommyYe/GlobeSumm); underlying publisher rights still require separate review before product use.

The adapter inspected 370 events and 4,687 reports across 26 languages. It
selected whole events deterministically for a 1,200-article **evaluation work
budget**: 1,192 reports in 96 events. The remaining 3,495 reports/274 events
were unscored. This limit is not a proposed Source count per Topic. No
family or viewpoint labels were available; event-level splits are disjoint,
but adjacent-development and opposing-view performance cannot be inferred.

With the already packaged local multilingual E5 model, each report was
represented by its title and first 384 normalized lead characters (an
offline input, not the current live body input). A simple complete-link
cosine-0.94 rule gave:

| Measure | Result |
| --- | ---: |
| Same-event pairs joined | 14 / 7,049 |
| Different-event pairs joined | 1 / 702,787 |
| Predicted groups | 1,177 for 1,192 articles |
| True-partner rank 1 / top 3 / top 10 / top 25 | 1,026 / 1,141 / 1,177 / 1,189 of 1,192 |
| Cross-language-only true-partner rank 1 / top 3 | 1,152 / 1,181 of 1,192 |
| Same-event cosine median / 90th percentile | 0.86496 / 0.89711 |
| Different-event cosine median / 90th percentile | 0.77987 / 0.81242 |
| Same-category different-event cosine median / 90th percentile | 0.78920 / 0.82338 |

One exact title+lead duplicate lies across different gold events; the one
joined false pair is that duplicate. It may reflect overlapping gold labels,
but the data do not establish that it is a correct product join. Every
gold event contains at least ten reports, so no complete event was recovered.
The first true partner is very often near in vector space, but the strict
0.94 admission rule almost never accepts it. A lower cosine alone is not a
safe remedy: same- and different-event distributions overlap, and even the
same-category hard-negative maximum reaches 1. The next experiment tests
train-only event evidence and abstention on event-disjoint validation;
neighbor rank is only a retrieval diagnostic, never a fixed identity cutoff.

The first frozen [real-pair research candidate](../real-pair-research-v1/README.md)
used event-disjoint training only. Of 1,192 selected reports, 749 were in its
training split, 150 in validation and 293 in an untouched test split. On
validation it admitted 20/803 same-event pairs and 0/10,372 different-event
pairs; the 0.94 cosine baseline admitted 0/803 and 0/10,372 there. All 20
candidate true joins were cross-language, but 783 true pairs remained missed.
This is an improvement in a narrow sample, not a usable Topic model or proof
of production precision; the untouched test split was deliberately not scored.

A separately frozen [contrastive projection](../real-contrastive-v1/README.md)
used the same train/validation split and a train-only choice among four
projection strengths. It selected strength zero (the original vector space),
then admitted only 3/803 true validation pairs and 0/10,372 false pairs.
The learned directions did not pass their own train-only selection criterion;
we rejected this projection rather than activating or retuning it on
validation. Its 293 selected test articles were not used in this candidate.

An [expandable-radius neighborhood experiment](../real-neighborhood-v1/README.md)
then measured shared nearby Sources rather than limiting candidate count.
It admitted 34/803 true validation pairs and 0/10,372 false pairs at its
train-only zero-false threshold. That 4.2% pair recall improves on the
pair-only candidate but remains far too weak to create useful shared Topics.
There is no fixed number of Sources per Topic in the experiment. The result
does not warrant live activation or validation-driven threshold relaxation.

The raw corpus remains in the owner's private Temp folder for this local
research. To reproduce, provide the explicit private directory and JSONL
path to `run.js --inspect` (no model) and then `run.js` (local E5 only).
No request leaves the machine; the CLI writes aggregate counts to stdout.
