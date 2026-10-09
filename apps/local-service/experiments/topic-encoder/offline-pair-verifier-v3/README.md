# Offline pair verifier v3 — frozen synthetic development probe

This offline synthetic-only adapter reuses the **unchanged v2 full-coordinate
769-feature logistic verifier** and packaged E5 title-plus-384-character-lead
input. It is for the new multilingual-balanced-v1 corpus. No Wiki, JRC,
GlobeSumm, user data, test JSONL, fresh holdout, provider or downloaded model
is used. Train has 160 fictional reports from 16 developments in eight whole
families; validation has 40 reports from four developments in two separate
whole families. The corpus has language-independent gold event IDs and
localized event prose; both were checked before this run. Only the
independently checked
train/validation exact-byte SHA-256 digests are pinned: train
`6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632`,
validation
`734E23078B989DAEDC037E0C3B0416EF835877FD42C4678CF410C54FCA440AD5`.
The runner has not been executed on these records and awaits lead review.
It never opens `test.jsonl`.

The inherited verifier architecture/optimizer and train-only normalization
are exactly v2. Expected training strata: all 720 within-development
positive pairs and all 800 same-family different-development hard negatives.
One predeclared admission gate is the maximum validation different-
development score plus 0.002, or abstention if above 1. Compare unchanged
raw E5 at fixed 0.94 and at prior Wiki-selected 0.895295. No grid,
validation-driven architecture change or post-result threshold search.

The **primary usefulness screen** applies only to the unchanged v2 first-fit
complete-link grouping: on validation it must admit >=60/180 true pairs,
0/600 false pairs including 0/200 same-family hard negatives, recover >=1/4
complete developments, and recall >=25% of 160 cross-language true pairs.
Failure of any condition rejects the candidate. Passing would still be
development evidence only, not an independent precision estimate or live
activation.

Separately, a frozen label-blind agglomerative complete-link diagnostic
starts with singleton groups and repeatedly merges the pair of groups with
the highest minimum cross-member score above the *same* threshold. Ties
follow stable input order. It has no fixed Topic member cap, but small-split
all-pairs scoring is not proof of catalog-scale performance. The
agglomerative result cannot rescue a failed primary screen post hoc; its
behavior remains exploratory until independent evaluation.

Only fixed aggregate pair, cross-language, hard-negative and whole-group
counts are printed. No row text, family label, individual score, vector,
weight or group assignment is saved or emitted. The runner denies network
and subprocess capabilities. The corpus is invented and structurally
balanced, but still needs independent linguistic/factual review and cannot
establish real cross-publisher viewpoint matching or input parity with the
live body-derived retained E5 vector.

From the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/offline-pair-verifier-v3/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/offline-pair-verifier-v3/core.test.js
```

Do not run `--run` until the lead reviews this frozen adapter and authorizes
the one development run. Do not use this package to open the sealed test file.
