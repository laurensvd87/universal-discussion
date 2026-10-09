# Frozen one-shot GlobeSumm relative coverage holdout

Research-only, offline, RAM-only under ADR-065 and ADR-069. Review and freeze this
directory and its source hashes **before** the first private run. The previously
untouched selected 293-report event-disjoint test is opened exactly once. Do not
rerun or tune against its results. No product activation follows from this run.

The exact 14,972,999-byte GlobeSumm corpus must have SHA-256
`8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`.
Reuse the existing parser and deterministic whole-event selection: 749 train,
150 already used validation, 293 selected test. The validation rows are not
embedded, calibrated, scored or otherwise used here. Reuse the packaged E5
model, title plus normalized first 384 lead characters, the existing 475-row
fit / 274-row calibration whole-event train partition, train-only duplicate
conflict filter, 40-step diagonal fit, and double-support admission rule.
Calibrate the raw normalized E5 and diagonal cutoffs separately from the same
training calibration rows. Only then embed and score the 293 test rows once.

The candidate wins this *research* comparison if neither the number of articles
in pure multi-page groups nor correct grouped pairs falls versus same-case raw
E5, and at least one rises, without increasing direct false admitted pairs,
transitive false grouped pairs, or articles exposed to mixed groups. Complete-event count is
diagnostic only. Report aggregate denominators, direct and grouped coverage,
duplicate-adjusted exact-input support, cross-language coverage, and the
criterion result. Exact-input keys do not establish independent publishers.
Publisher and viewpoint slices are unavailable in this corpus. This comparison
uses title/lead E5 as its baseline, not production body-derived E5.

No raw text, URLs, event/row labels, vectors or weights are printed or saved.
No provider/network call or service/extension/database change. The CLI requires
absolute private paths outside Git and verifies corpus and model hashes. It
prints only aggregate JSON or fixed failure codes, including hashes of every
execution source and packaged asset. The exact inventory and hashes are pinned
in `reviewed-source-sha256.json`; the runner verifies them before opening the
private file, and the dry-run verifies them without opening it. The manifest
itself is excluded from its own hash list. Never redirect output into Git.

From the repository root, before independent review:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/core.test.js
node apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/run.js --dry-run
```

Only after review and freeze, run once with the approved private local corpus:

```powershell
node apps/local-service/experiments/topic-encoder/real-diagonal-holdout-v1/run.js --private-dir C:\private\corpus --input C:\private\corpus\news_only.json
```

The path shown is a placeholder. Even a favorable result is exploratory:
GlobeSumm event labels may differ from Topic identity, cross-publisher and
viewpoint gold are absent, and rights/product-training, Trust and migration
gates remain separate.
