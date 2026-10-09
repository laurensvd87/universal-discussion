# GlobeSumm graph validation v1

Owner-local, offline research under ADR-065. This experiment compares the already frozen strict complete-link cosine-0.94 baseline, strict adaptive triangle rule, and triangle plus nearest-neighbor veto rule on the existing event-disjoint GlobeSumm train, validation, and once-only test splits. It does not fit or revise a rule. Each invocation embeds and scores only the requested split. The packaged local E5 model receives only title and a normalized 384-character lead. The runner accepts an explicit private file path outside Git, verifies its exact byte count and SHA-256 against ADR-065 before parsing, and emits only aggregate counts and timing. It denies network and subprocess capabilities. No corpus text, URL, title, label, vector, or per-article result is stored here.

Frozen input SHA-256: `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d` (14,972,999 bytes). The source is the owner-approved private local copy of `news_only.json`, not a repository artifact.

From the repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/globesumm-graph-v1/run.js --dry-run
node apps/local-service/experiments/topic-encoder/globesumm-graph-v1/run.js --private-dir <absolute-private-directory> --input <absolute-private-file> --split train
```

The source dataset card labels GlobeSumm CC BY-SA 4.0, but underlying publisher-article rights have not been cleared for product training or shipment. This is one corpus without reliable publisher-diversity or adjacent-development family labels; its event granularity may differ from the app's Topic definition. Same-category different-event pairs are only a weak hard-negative proxy. All rules remain offline. No live grouping, retention, model, discussion routing, or release change follows from a favorable result.

The pre-test code and rule hashes are in [FREEZE.md](FREEZE.md). Aggregate train, validation, and once-only test scores are in [RESULTS.md](RESULTS.md). The nearest-neighbor veto scans the whole evaluated catalog and does not meet ADR-064's live scale requirement. No viewpoint labels are available, and this title-plus-lead input differs from the live body-E5 representation.
