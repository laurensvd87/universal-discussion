# Wikinews in-memory topic metric experiment

This is private offline research under [ADR-066](../../../../../decisions/ADR-066-wikinews-multilingual-research-gate.md), not an app model. It uses the same deterministic 1,200-article, whole-eligible-event compute sample and event-disjoint split as the [Wikinews baseline](../wikinews-benchmark-v1/RESULTS.md). Records with empty text are excluded first, so a sampled event may omit those records. The article limit is only an offline compute budget; there is no product Topic membership limit.

The packaged local E5 model turns each title and 384-character article lead into one 384-dimensional vector. For each **training** article, the trainer selects its least similar same-`pageid` translation and a nearby different-`pageid` article, favoring a shared-category neighbor when nearly as close. It learns a regularized 384-dimensional diagonal metric from those triplets. This tiny adapter transforms E5 vectors entirely in memory; it is not a new standalone text encoder.

On the separate **validation** events, four predeclared strengths (including identity) each get a cosine cutoff above their highest false-pair score by 0.002. The strength admitting most true pairs wins, with a tie favoring identity. If that cutoff would exceed 1, that candidate abstains. Only after selection does the runner score the **test** events. It reports both pair admissions and complete-link Topic joins, plus fixed 0.94 and validation-calibrated raw E5 baselines on the same test pool. The test labels do not select model strength or cutoff.

Run fictional checks and a content-free preflight:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/wikinews-train-v1/core.test.js
node apps/local-service/experiments/topic-encoder/wikinews-train-v1/run.js --dry-run
```

With the owner-approved corpus in a private directory outside Git, use `--inspect` or `--run` followed by `--private-dir ABSOLUTE_DIRECTORY --input ABSOLUTE_JSONL_FILE`. The runner denies external capabilities, validates the dataset, and emits aggregate counts and hashes only. It never writes article text, URLs, individual vectors or learned weights. See [RESULTS.md](RESULTS.md) for the local run.

Wikinews page IDs label cross-language editions. This dataset cannot establish cross-publisher viewpoint matching or product rights. Product training, distribution and live activation retain their separate gates.
