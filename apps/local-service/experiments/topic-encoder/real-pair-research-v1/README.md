# Private same-event pair research v1

Offline research only under ADR-065. This is a pair admission experiment, not Topic clustering, a production model, or rights clearance. No fitted weights are written or printed. The method uses the existing private-path loader, whole-event selection and packaged local E5 title-plus-384-character-lead vectors. It never embeds or scores the selected test split on this first run. No network, service, database, extension, model download or provider call is involved.

Train pairs use only train events. Features available from two Source candidates are focus-vector cosine, Unicode title/lead token overlap, and number/proper-name agreement. Gold event and category labels are used only for train targets and hard-negative selection; language is used only for reporting. A balanced, regularized six-feature logistic head trains in memory. The admission threshold is the greater of 0.95 probability and the highest train negative probability plus 0.02. This deliberately allows zero admissions. It is a train-set safety rule, not calibrated real-world precision.

Validation reports candidate and simple cosine-0.94 baseline pair TP/FP/FN/TN, same-category false pairs, and cross-language true-pair admission. Pair counts do not imply valid whole-Topic partitions. One corpus has no explicit adjacent-event or viewpoint labels; same-category is only a rough hard-negative stratum. Event-disjoint fallback is not family-disjoint if family gold is absent. No threshold adjustments should follow validation results for this frozen v1.

From repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/real-pair-research-v1/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-pair-research-v1/core.test.js
node apps/local-service/experiments/topic-encoder/real-pair-research-v1/run.js --private-dir C:\private\corpus --input C:\private\corpus\events.json
```

The private directory and input must be explicit absolute paths outside Git; the input must be a regular file underneath that directory. Output contains only aggregate metrics and input/model hashes. Keep even aggregate output private unless reviewed. Fixed failure codes contain no path or corpus content. Never commit text, labels, URLs, vectors, or fitted weights from a real run.
