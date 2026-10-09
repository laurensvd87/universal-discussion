# Wikinews to viewpoint corpus transfer diagnostic

This private offline experiment tests whether the owner-approved Wikinews
translation metric transfers to a separate 60-record, five-language synthetic
corpus with different viewpoints on 12 precise developments. It reuses the
existing in-memory diagonal trainer and the same whole-eligible-event
1,200-article Wikinews compute sample. A finite experiment sample does not
limit product Topic membership.

The runner embeds Wikinews articles with the packaged local E5, trains on its
train events, and freezes model strength and both learned and raw cutoffs using
Wikinews validation events. Only then does it open and embed the frozen
synthetic validation file. It compares fixed raw E5 0.94, raw E5 with the
Wikinews validation cutoff, and the Wikinews learned metric with its validation
cutoff. Pair admissions, complete-link Topic joins, exact gold groups and
same-family false joins are aggregate counts. It emits no article text,
individual vectors, URLs or learned weights and performs no network requests.

From the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/wikinews-transfer-v1/core.test.js
node apps/local-service/experiments/topic-encoder/multilingual-train-v2/integrity.test.js
node apps/local-service/experiments/topic-encoder/wikinews-transfer-v1/run.js --dry-run
node apps/local-service/experiments/topic-encoder/wikinews-transfer-v1/run.js --run --private-dir ABSOLUTE_PRIVATE_DIRECTORY --input ABSOLUTE_PRIVATE_JSONL_FILE
```

This is a transfer diagnostic, not product activation. The synthetic corpus is
AI-written and small, while Wikinews links editions of its own articles;
success on this test alone cannot establish real cross-publisher precision.
