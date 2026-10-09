# Offline pair verifier v2 — frozen synthetic-only design

This is one bounded, falsifiable feature-resolution probe. It changes the
v1 pooled symmetric features to full-coordinate symmetric features while
holding the packaged E5 title-plus-384-character-lead input and existing
synthetic v2 whole-family train/validation split fixed. Only the 120
synthetic train reports enter gradients. The 60 synthetic validation reports
are development data for one predeclared cutoff. No Wiki, JRC, GlobeSumm,
user data, synthetic test or multilingual holdout is embedded or used for
training/selection. No new model asset is downloaded.

The model is regularized logistic regression over 769 features: cosine,
384 absolute coordinate differences and 384 coordinate products of two
L2-normalized 384D E5 vectors. Those features are invariant to swapping the
pair. Feature means and standard deviations are fitted on train pairs only;
standardized features are clamped to [-4,4]. Zero-initialized parameters use
100 deterministic full-batch Adam steps (learning rate 0.03, L2 weight
penalty 0.01), equal total weighting for positive and hard-negative strata.
The train pairs are all 240 same-development pairs and all 600 same-family
different-development pairs, including non-adjacent developments. There is
no hyperparameter or L2 grid and no post-result policy search.

The sole selection rule is the maximum score among *all* different-
development validation pairs plus 0.002; if above 1, abstain. This picks
a zero-observed-false-pair development gate by construction, not a reliable
precision guarantee. Compare against unchanged raw E5 at fixed 0.94 and
the prior published Wiki-selected raw cutoff 0.895295. Evaluate pair TP/FP,
precision/recall, same-family hard negatives, cross-language positives and
complete-link whole-event groups. The fixed first-fit grouping is diagnostic,
not a product rule. Since the only positive pairs in synthetic v2 span
different languages, cross-language recall equals positive-pair recall.

The runner verifies frozen file hashes and family isolation before model
loading. It emits aggregate counts only: no synthetic row, title, family
identifier, pair score, vector, learned weight or group assignment is
printed or persisted. Network and subprocess capabilities are denied.
Synthetic v2 has language/viewpoint correlations, so even a strong result
would not demonstrate opposing-viewpoint robustness. Its 180 reports are
an offline compute set, not a product Topic member cap. No live activation,
training rights or release decision follows.

From the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/offline-pair-verifier-v2/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/offline-pair-verifier-v2/core.test.js
node apps/local-service/experiments/topic-encoder/offline-pair-verifier-v2/run.js --run
```

The predeclared development usefulness screen is **at least 30/120 true
validation pair admissions, zero false pair admissions, and at least 2/12
complete developments** at the max-negative-plus-gap gate. Failing any
condition rejects this candidate without retuning. Passing is still only
exploratory, not independent evidence or activation. A new independent
holdout would require a separately frozen gate and owner review.
