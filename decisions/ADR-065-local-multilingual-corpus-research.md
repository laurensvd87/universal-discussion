# ADR-065: Local-only real multilingual corpus research

Status: owner-approved for local research only; not a product data or model-use clearance.
Date: 2026-10-08.

## Decision and boundary

The owner explicitly approved downloading the published GlobeSumm event corpus
solely for local, offline research. Do not commit or publish article text,
send it to an AI provider, embed it into the extension/service, or ship a
model trained from it. A separate rights review is required before any
product training or release. The dataset card labels the corpus CC BY-SA 4.0,
but that label alone does not establish rights over each underlying publisher
article: [GlobeSumm dataset card](https://huggingface.co/datasets/TommyYe/GlobeSumm).

The downloaded `news_only.json` is outside the repository in a named private
temporary directory on the owner's PC. Its exact 14,972,999 bytes have
SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`.
It is a JSONL file of 370 events and 4,687 articles in 26 languages.
Raw article text, titles, URLs, labels and per-article vectors must stay out
of Git, test logs and aggregate reports. The local evaluation adapter imports
only a bounded title/lead prefix into the already packaged E5 model and
outputs content-free counts. No provider calls or service/database changes
are authorized by this research approval. The file remains locally retained
for this research; it is not a user-browsing-data retention policy.

## First evidence and limitations

The [offline adapter](../apps/local-service/experiments/topic-encoder/real-event-eval/README.md)
selected whole events deterministically under a 1,200-article *compute*
budget: 1,192 articles from 96 events were scored; 3,495 articles/274 events
were explicitly unscored. This is not a Topic membership limit. With the
packaged E5 model given an offline title+lead input and a simple complete-link
cosine-0.94 baseline, only 14/7,049 same-event pairs joined and one
different-event pair joined; 1,177 predicted groups resulted. No event was
fully recovered. One identical title/lead copy has conflicting gold event
labels, so the observed false join may reflect a labeling overlap; do not
treat that as proof of zero or one genuine product errors. GlobeSumm has no
explicit viewpoint/family labels here, so neither opposing-view performance
nor hard adjacent-event identity is established. Event granularity may differ
from the app's desired Topic boundary. Splits keep gold events apart, but
without a reliable family key, closely related developments or publisher
templates may still occur on both sides. A favorable validation score would
therefore still need an independently sourced holdout before activation.

Candidate retrieval found a same-event partner in the first three neighbors
for 1,141/1,192 scored reports (cross-language-only: 1,181/1,192).
These ranks are diagnostic: no fixed top-three identity gate or maximum
number of Sources per Topic follows. The admission threshold, not just
candidate search, is the immediate bottleneck. Aggregate measurements and
distribution overlap are recorded in the adapter's [RESULTS.md](../apps/local-service/experiments/topic-encoder/real-event-eval/RESULTS.md).

This real corpus strongly rejects the strict synthetic-only baseline as a
useful multilingual grouping rule; it does **not** validate a replacement.
The first frozen train-only [pair-admission experiment](../apps/local-service/experiments/topic-encoder/real-pair-research-v1/README.md)
made 20/803 true joins and 0/10,372 false joins on an event-disjoint
150-article validation split; 293 selected test articles remain untouched.
That 2.5% pair recall is too low for useful shared Topics. Zero observed
false joins on this slice is not a general precision guarantee; no live
activation follows.
An independent [low-rank contrastive experiment](../apps/local-service/experiments/topic-encoder/real-contrastive-v1/README.md)
selected projection strength zero on train; validation admitted only
3/803 true pairs and no false pairs. It does not justify a replacement.
An [expandable-radius neighborhood experiment](../apps/local-service/experiments/topic-encoder/real-neighborhood-v1/README.md)
used shared-neighbor evidence without a fixed Source count. It admitted
34/803 true and 0/10,372 false validation pairs at a train-only cutoff.
This is better than the pair-only candidate but 4.2% pair recall is still
too sparse for a useful shared-Topic product. No live activation follows.
The [long-body two-input experiment](../apps/local-service/experiments/topic-encoder/real-input-v2/README.md)
completed after sanitizing one contract-forbidden control-character input.
On the same event-disjoint validation it admitted only 5/803 true and no
false pairs; the long E5 pass cost about 497 seconds versus 102 seconds for
the short pass. It is rejected. The preliminary 298-article sample's 45/331
true-pair result did not generalize to the larger event selection. Longer
input and small train-only score adjustments have not solved the admission
problem. Production activation still requires the
ADR-064 owner/Trust gate, representative cross-publisher error review,
retention/model-rights decision, migration/rollback and actual app QA.
