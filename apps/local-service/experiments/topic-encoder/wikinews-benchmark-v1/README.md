# Local Wikinews E5 baseline

This bounded offline benchmark uses the owner-approved private Wikinews corpus
solely for research. The JSONL file must be outside the repository. It is not a
product dataset or training license. The runtime denies external capabilities,
prints aggregates only, and does not persist corpus rows or vectors.

`--inspect` validates the input, excludes articles with empty body text, and
selects complete **eligible** event groups by stable event-key hash within a 1,200-article
compute budget. The selection does **not** impose a product Topic member cap.
Events are assigned to train, validation, or test by a separate stable hash;
no event can cross partitions. The available gold is Wikinews interlanguage
linkage by `pageid`: positives are translations or reports of the linked
Wikinews story, not independently written publisher viewpoints. It cannot
prove cross-publisher viewpoint robustness.

`--score` embeds title plus the first 384 normalized body characters with the
already-packaged E5 model. It measures all-pair retrieval ranks and a frozen
complete-link 0.94 cosine grouping baseline. Category-overlap negatives are
reported separately. Neither the baseline nor its threshold is proposed for
activation. `eventDisjoint` evaluates each split using only candidates from
that split. `pooledExploratory` additionally measures the fixed complete
sample; its candidate pool crosses train/validation/test and must not be used
as a future learned-model holdout result. Retrieval rank alone is not safe
evidence for automatic Topic joins.

```powershell
node apps/local-service/experiments/topic-encoder/wikinews-benchmark-v1/run.js --dry-run
node apps/local-service/experiments/topic-encoder/wikinews-benchmark-v1/run.js --inspect --private-dir 'C:\private\wikinews' --input 'C:\private\wikinews\corpus.jsonl'
node apps/local-service/experiments/topic-encoder/wikinews-benchmark-v1/run.js --score --private-dir 'C:\private\wikinews' --input 'C:\private\wikinews\corpus.jsonl'
node --test apps/local-service/experiments/topic-encoder/wikinews-benchmark-v1/core.test.js
```
