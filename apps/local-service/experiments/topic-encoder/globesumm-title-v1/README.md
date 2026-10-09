# GlobeSumm title-only comparison v1

This owner-local, offline ADR-065 experiment compares one packaged-E5 vector from the normalized title alone with one packaged-E5 vector from the normalized title plus 384-character lead. It uses the same deterministic selected GlobeSumm train and validation splits as prior local research, with no selected test or unselected report embedded or scored. The private corpus is hash-pinned to ADR-065's 14,972,999-byte file (SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`). The runner accepts only an explicit absolute private input outside Git and train or validation. It denies network and subprocess capabilities and prints only aggregate metrics.

The rule set was predeclared: complete-link cosine 0.94, frozen strict triangle (minimum 0.86, cover 0.88, mean 0.92, strongPair 0.94), and frozen triangle-nearest veto (minimum 0.86, cover 0.88, mean 0.88, strongPair 0.94). There is no validation tuning. For title-only inference, the existing E5 `body` mode receives the normalized title as its entire input; no new model or asset is loaded. Each representation is measured separately for same/different-event joins, same-category false joins, mixed groups, complete gold events, retrieval rank, and time.

From the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/globesumm-title-v1/run.js --dry-run
node apps/local-service/experiments/topic-encoder/globesumm-title-v1/run.js --private-dir <absolute-private-directory> --input <absolute-private-file> --split train
```

This comparison authorizes no second retained vector or upload. Extra inference latency and any privacy, retention, storage, migration, or provider boundary would need a separate owner and Trust review. Source article rights are not cleared for product training or shipment. GlobeSumm lacks viewpoint labels and reliable family/publisher-diversity labels; event-disjoint evaluation is not proof of robustness to adjacent developments or independent publishers. The global nearest-veto rule also fails ADR-064's live scale requirement. No product matcher or discussion route changes here.

The train-only [aggregate result](RESULTS.md) is negative for title-only and triggered the predeclared early stop. Validation and selected test remain unscored for this comparison.
