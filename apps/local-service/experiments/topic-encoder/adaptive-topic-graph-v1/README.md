# Adaptive Topic graph v1 (offline research)

This experiment tests whether a Topic can grow from multiple mutually supporting
Sources without imposing a maximum number of Sources per Topic. It changes no
production matcher, persisted Topic, extension behavior, or model asset.

Run from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/adaptive-topic-graph-v1/core.test.js
node apps/local-service/experiments/topic-encoder/adaptive-topic-graph-v1/run.js
node apps/local-service/experiments/topic-encoder/adaptive-topic-graph-v1/evaluate-v5.js
```

The runner verifies exact SHA-256 bytes of synthetic multilingual v1 and v2
train/validation files and embeds their 300 articles with the already packaged,
hash-pinned E5 model. The input is NFKC title plus 384 characters of article
lead. Labels enter only evaluation and development selection, never the
grouping function. Results contain aggregate counts; no text, URL, ID, vector,
or learned weight is written. External capabilities are denied. A run took
about 45 seconds on the research machine, including about 19 seconds for E5.
This is an offline development benchmark, not a service latency estimate.

Two bounded designs were tried. `supported` greedily merges groups if all
cross pairs clear a minimum, their mean clears another threshold, and every
member has a covering edge into the other group. `triangle` requires three
mutually supported singleton Sources to seed a group at the lower threshold;
very strong pairs can seed directly. It then uses the same supported merge.
The one additional evidence veto, `triangle-nearest`, requires each group's
nearest catalog neighbor to be inside that group. All rules use deterministic
ties and have no fixed maximum group or retrieval count. The triangle search
and group scans can become expensive as the catalog grows; this is not a
production-ready indexing design.

The predeclared development grid covers 27 supported and 9 triangle settings.
The selection rule requires zero false joins on both the known train and
validation slices, then maximizes validation true joins. The selected setting
was `triangle` with minimum 0.86, cover 0.88, mean 0.92 and strong-pair 0.94.
It joined zero true validation pairs; therefore it is **not a viable
improvement**. See [RESULTS.md](RESULTS.md) for the exploratory tradeoff.

The comparator called `currentSnapshotValidation` invokes the actual local
`planAdaptiveTopics` on the synthetic validation Sources with no prior links
or historical partitions. It is faithful to that empty-state snapshot, but
does not simulate real Source history, manual pins, Topic IDs or migrations.
The fixed 0.94 complete-link baseline is a separate research comparator.

The known v1/v2 validation splits were already used by prior research and
cannot be called independent tests. The independent v5 holdout was opened
once after the code and rules were frozen; `evaluate-v5.js` checks its exact
hash and applies only those frozen rules. No automatic activation follows
from its score; false mixed Topics can misplace discussions and need separate
product, security, and owner review.
