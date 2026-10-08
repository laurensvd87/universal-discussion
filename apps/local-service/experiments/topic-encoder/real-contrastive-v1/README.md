# Private contrastive event metric v1

This is offline ADR-065 research, not a live matcher or product model. The CLI requires explicit absolute paths to a private corpus directory and a regular input file beneath it, outside the repository. It uses the existing bounded parser, whole-event selection and packaged, hash-checked local E5 title-plus-lead encoder. Network and subprocess capabilities are denied. It does not save article content, labels, URLs, vectors or fitted axes; stdout contains only aggregate metrics and hashes. Do not commit or publish output from a real run without review.

Each train article with a same-event partner contributes one triplet: its least similar same-event partner and most similar high-cosine or same-category different-event neighbor. A regularized, identity-anchored rank-at-most-eight residual amplifies positive directions of hard-negative difference covariance minus within-event difference covariance. Inference takes vectors alone; event/category labels are used only to form train examples and score aggregate evaluation. A fixed train-only strength grid (0, 0.25, 0.5, 1) chooses the most train true-pair admissions at a cutoff above every train negative by 0.005. Ties choose the weaker projection. This strict cutoff may abstain entirely. It is not a statistical precision guarantee.

Only train and validation documents are embedded. The selected test split stays untouched. Validation prints pair TP/FP/FN/TN, same-category false admissions and cross-language true-pair admissions, alongside raw E5 cosine-0.94 baseline counts. These are pair decisions, not whole Topic partitions. Category is a rough negative stratum; absent `family_id`, splits are event-disjoint but not proven family-disjoint. No validation retuning is part of v1.

From repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/real-contrastive-v1/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-contrastive-v1/core.test.js
node apps/local-service/experiments/topic-encoder/real-contrastive-v1/run.js --private-dir C:\private\corpus --input C:\private\corpus\events.json
```

Failures print one fixed error code without corpus values, file paths or stack traces.
