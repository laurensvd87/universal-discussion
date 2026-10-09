# Private GlobeSumm diagonal adapter v1 — frozen protocol

Research-only, offline experiment under ADR-065. The private GlobeSumm JSONL stays outside Git; no private text, URL, event label, vector, model weight, or content digest is printed or saved. The selected test split is never embedded. The already examined validation split is exploratory and cannot establish independent precision. No product matcher, storage or permissions change.

## Fixed experiment

Input is the existing exact 14,972,999-byte GlobeSumm file with SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`. The existing parser and whole-event selection must yield 1,192 selected reports: 749 train, 150 validation, 293 test. The adapter embeds only train and validation, using the packaged E5 with normalized title plus the first 384 normalized article characters. The packaged model must match SHA-256 `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.

For each selected train event, the first 32 bits of SHA-256 of its event key modulo three selects calibration when zero, fitting otherwise. This is a deterministic whole-event split inside existing train. Exact title-and-384-character-lead copies with contradictory gold event labels **within the selected train split** are excluded from the fit triplets, using only in-memory parser digests. The calibration records remain unchanged. The report separates the aggregate count of affected train rows from those actually removed from fit. A contradictory copy across train and validation cannot be identified without consulting validation labels and remains an evaluation caveat.

The representation is `z=normalize(exp(s)·E5)` with 384 trainable diagonal log scales and each `s` clamped to [-0.5, 0.5]. At `s=0`, this is normalized raw E5. Fit one static hardest cross-language same-event positive for each eligible anchor, with three in four anchors using the hardest different-event same-category negative and one in four using the hardest outside-category negative. Anchors without both candidates are skipped. Forty full-batch Adam steps use learning rate 0.01, margin 0.05, softplus scale 8, L2 coefficient 0.001, gradient norm clipping at 1, Adam betas 0.9/0.999 and epsilon 1e-8. All fitting is deterministic and RAM-only. No checkpoint is saved.

The existing `local-contrast-gate-v1` double-support rule is the only admission rule. Its negative-candidate maximum contrast cutoff is calibrated separately for transformed and normalized raw E5 using only calibration events. Validation is scored once for both methods. This is a controlled input and rule comparison, not a new rule search. Before private execution, this README, code, and tests must be reviewed and frozen. Do not tune the variant, split, steps, margin, cutoff or screen after seeing validation results.

The predeclared exploratory continuation screen for the adapter is: at least 145/150 rank-one same-event retrievals, at least 50/803 correct admitted pairs, zero/10,372 false admitted pairs, zero mixed groups, at least one of 13 events complete, and strictly more correct admissions than separately calibrated raw E5 without more false admissions or mixed groups. Passing this screen would justify a new independent rights-cleared evaluation, not activation. Failing means stop this candidate. The 293 selected test records remain unopened.

The CLI requires absolute private directory and input paths outside the repository, verifies exact bytes and path scope before model loading, denies external capabilities, and emits only aggregate JSON or fixed failure codes. Its report includes SHA-256 of execution source files and the packaged asset manifest, plus packaged model/tokenizer hashes. No extra model download, provider call, database write, or network request is part of this protocol.

From the repository root:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/core.test.js
node apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/run.js --dry-run
# Only after review/freeze, for the approved private local corpus:
node apps/local-service/experiments/topic-encoder/real-diagonal-adapter-v1/run.js --private-dir C:\private\corpus --input C:\private\corpus\news_only.json
```

The private file location in the example is a placeholder. Never redirect output into the repository. No selected test row may be embedded or scored in this experiment.
