# Pooled root-rank DEVELOPMENT diagnostic

Default inert. After explicit code/Trust review, the fixed launch is:

```powershell
node --max-old-space-size=256 apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/run.mjs --development-screen
```

No launch, vector scoring or cohort fitting is part of implementation verification.
The pure tests use authored score arrays only.

The PRIMARY method reuses the immutable ADR138/v3 affine 16-root model (three
positive training groups per root). Only its unique-winner raw score and
winner-minus-runner-up gap receive a pooled two-dimensional rule. Fit on the
already consumed real CAL48: at least20 independent accepted groups, zero CAL
errors, maximum accepted count, then higher gap, then higher score. Score ties
are processed inclusively; rank ties always abstain. All candidate cutpoints
are observed CAL values (plus zero gap). No acceptable cut disables the rule.

The consumed real32 is DEVELOPMENT diagnostics, never a new holdout. On those
same32 inputs only, report immutable C root-head raw top1 and immutable ADR139
real-root local best-positive raw top1. Neither comparator is calibrated or
changed. C still scores its complete63-head artifact before selecting root
scores; no altered arithmetic/submodel is substituted. The saved TRAIN48
contributes through the frozen primary model and frozen local exemplar artifact;
there is no retraining or additional TRAIN scoring. All three methods receive
the same saved current-static body/title pair and frozen .75/.25 paired adapter.

The runner verifies exact artifact pins and the entire72-source ADR139 descriptor,
including its original immutable ADR139 document. It parses initial hashed bytes,
checks fresh source/input hashes before final publication, and writes an exclusive
new descriptor/marker/policy/results directory. Existing output prohibits replay.
README is an input hash; append later results to ADR140, not this file. These checks
are not adversarial filesystem-ABA or loaded-module attestation proofs.

Budgets: rank/cut-fit/diagnostic comparison work preflight<=1million; coordinate
products separately bounded<=5million and honestly counted from frozen scorers.
Local scoring retains its own4million-unit per-query bound. Fusion rows and scope
are reported separately, not hidden in rank work. The fixed256MiB heap plus
cooperative90s/RSS384MiB/physical1GiB/C768MiB/D512MiB guards are not an external
hard-termination supervisor. CPU between guard checkpoints remains bounded by the
strict scorer and row capacities.

This tests whether sparse *per-node* calibration caused additional abstention,
not whether raw E5 ranking has adequate real-web quality. Global pooling does
not guarantee precision for any individual root/language, and zero optimization
errors are not independent precision evidence. No probabilities, fresh quality
claim, production promotion, new encoder, network, provider, owner data,
canonical write, crawler change or runtime activation.
