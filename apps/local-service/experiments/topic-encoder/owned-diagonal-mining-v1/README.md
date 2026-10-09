# Owned diagonal mining v1

Bounded offline development probe for the 384-coordinate E5 diagonal adapter.
The previous owned-only fit used one difficult cross-language positive and one
negative per anchor. This probe uses two difficult cross-language positives,
two difficult different-event negatives within the same fictional family, and
one outside-family negative. Their six triplets per anchor are re-mined every
five of 40 training steps. Only project-authored chunk A fits the 384 RAM-only
parameters. B calibrates the existing `double-support` graph independently for
raw E5, the previous static fit, and this fit. C1+C2+C3 compare the methods.

All 324 inputs use the same packaged E5 with title plus a 384-character body
lead. The C cases are **development cases already used by other experiments**.
No v5 or private real corpus is opened. The training choice that separate
stages of one fictional family are negatives follows the provisional principal
event target in ADR-064, not a general rule for related real stories.

From repository root:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/owned-diagonal-mining-v1/core.test.js
node apps/local-service/experiments/topic-encoder/owned-diagonal-mining-v1/run.js
```

The runner denies external capabilities and prints only aggregate measures.
No vectors, weights, page text, row-level predictions, or model files are
persisted. A gain on C would be a development signal only. B's calibration
selects a maximum observed negative contrast and cannot establish independent
precision. The synthetic material may carry authoring shortcuts; independent
publisher and viewpoint transfer, live body input, root routing, and model
distribution are outside this prototype.
