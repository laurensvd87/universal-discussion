# Offline pair verifier v1 — frozen design before private run

Status: single falsifiable local research probe, **not** a product matcher.
The owner-approved private Wikinews file (ADR-066) is used only for local
in-memory training. Fictional project-created multilingual corpus v2 is the
other training source. No JRC, GlobeSumm, user browsing data, Wiki selected
test, synthetic test or v6 data participates in gradients or selection.

The precise fixed architecture is a symmetric pair verifier. Normalize each
existing 384D packaged E5 title-plus-384-character-lead vector. For a pair,
form 33 symmetric features: cosine, 16 contiguous 24-dimension means of
absolute coordinate difference, and 16 contiguous means of coordinate
product. Compute train-only mean/standard deviation per feature and clamp
standardized values to [-4,4]. Feed them to one 8-unit tanh hidden layer and
one sigmoid output. Parameters use deterministic seed `0x5eeda11`; training
uses 80 full-batch Adam steps (learning rate 0.015, L2 weight penalty 0.0005),
with equal total weight for each of four strata. No architecture, feature,
seed, step count or optimizer grid is searched.

Training pairs: all within-event Wikinews train pairs; each Wikinews train
anchor's nearest other-event and nearest shared-category other-event negative
(deduplicated); all within-development synthetic train pairs; all adjacent-
development same-family synthetic train negatives (including non-adjacent
developments). The exact pre-existing
Wiki whole-`pageid` split and synthetic whole-family train/validation split
are reused. Hash checks happen before private JSONL parsing or synthetic
parsing. The 737 Wiki train and 207 Wiki validation articles are embedded;
Wiki test is excluded **before** embedding. Synthetic train has 120 reports
from eight families; validation has 60 reports from four other families.

One predeclared gate is selected from Wiki plus synthetic *development
validation* only: maximum different-event verifier score plus 0.002, or
abstain if above 1. This favors zero observed development false pair
admissions; it cannot guarantee future precision. Compare without tuning to
raw E5 at fixed 0.94, raw E5 at the prior published Wiki-calibrated 0.895295,
and the prior Wiki-train diagonal transform (strength 1) at its published
0.897529. These rounded prior thresholds are diagnostic references, not new
calibration. Report pair true/false admission, precision/recall,
same-category hard false joins, cross-language true pairs, and whole-event
complete-link grouping. Grouping is not an activation proposal.

The runner denies network/subprocess capabilities, checks the approved Wiki
45,258,115-byte SHA-256, and accepts only an absolute path inside an explicit
private directory outside Git. It prints fixed aggregate metrics only; no
article, URL, page ID, per-row score, vector, learned weight or group
assignment is emitted or saved. It does not download models or use Torch.
The packaged E5 assets are reused locally. No product model rights, release
or live activation follows. Wikinews translations and invented reports are
not independent publisher/opposing-view evidence. The 1,200-article Wiki
selection is a compute bound, not a fixed Topic member cap.

From the repository root, with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/offline-pair-verifier-v1/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/offline-pair-verifier-v1/core.test.js
node apps/local-service/experiments/topic-encoder/offline-pair-verifier-v1/run.js --run --private-dir <absolute-private-directory> --input <absolute-private-Wiki-JSONL>
```

Do not retune on development output or promote this probe without a new
independent holdout and the separate rights/Trust/product gates.
