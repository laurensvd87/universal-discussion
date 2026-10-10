# Joint title evidence v1: local research protocol

Owner-authorized offline research only. No production import, browser change,
new retained field, live database write, provider call or deployment. Corpus
text, vectors, features, labels and task-head weights remain process RAM-only.
Only the official downloaded model/tokenizer live in private TEMP outside Git.

The frozen source model is
`cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`, revision
`1427fd652930e4ba29e8149678df786c240d8825`. Its official model card declares
Apache-2.0 and multilingual MS MARCO relevance training, not event identity.
The official `onnx/model_quint8_avx2.onnx` has 118,620,016 bytes and SHA-256
`6c2513767fb63d008a4377bef7a7a3555433d9436342bb53e35a3a72ffc52d4b`.
Every model/config/tokenizer/card and packaged runtime file is hash verified.
No remote model code or pickle is loaded. A bounded protobuf adapter exposes
the existing 384D CLS output; it changes no graph operation or weight, and
creates the adapted model only in RAM.

Each pair is inferred twice, A/B and B/A. Features include the averaged and
absolute-difference joint CLS coordinates (768D), averaged relevance logit,
absolute logit difference, raw body-E5 cosine and a locally fitted diagonal
body-E5 cosine. Four separately fitted ridge logistic heads isolate vector,
ranking, joint and joint-plus-vector evidence. All scores are uncalibrated
ranking values. Existing independent embeddings plus another numeric head
cannot provide the joint token attention tested here.

## Predeclared development protocol

Use the exact already-approved private GlobeSumm input, 14,972,999 bytes,
SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`.
Reconstruct the original 1,192 report selection and 475 fit/274 calibration
split. Hash-selected whole events limit fitting to at most 200 reports and
calibration to at most 100, retaining the reused 150-report validation.
Body E5 uses the normalized 4,096-character article prefix and packaged
512-token truncation; this remains a surrogate for rendered Chrome capture.
Fit E5 and the diagonal on this bounded fit slice only, rather than treating
earlier title/lead-fitted weights as if they had identical input.

Fit pairs contain each anchor's weakest and strongest positive and its three
hardest different-event negatives, favoring same-category negatives. Evaluation
and calibration use every pair whose raw or adapted cosine is at least 0.90.
Selection is label-blind there. Exceeding 12,000 candidate pairs aborts that run;
it never creates a membership cap or silently drops candidates. Retrieval
misses are disclosed. Logistic heads use fixed 120 Adam steps, rate 0.03,
ridge 0.02, train-only standardization and equal total positive/negative loss.
The head cutoff is the largest candidate negative calibration logit +0.1;
raw/adapted cosine comparators use their own largest negative +0.003. A
calibration pool without negatives abstains. Zero calibration errors are
therefore in sample by construction, never an independent precision claim.

The first development attempt completed 440 E5 embeddings but aborted before
any private joint inference because the original 0.80 radius exceeded its
5,000-pair work budget. Before any head or development quality measurement,
the lead froze the 0.90 radius (the existing live weak-cross floor) and a
12,000-pair work budget. No nearest-count pruning is used. Do not change these
from the resulting quality measurements; fresh budget exhaustion remains an
honest practical failure, never silently sampled full-cohort evidence.

Report candidate average precision, direct true/false admission, multilingual
admission, and connected-component pure/mixed reach on exactly the same cases.
Components diagnose false-bridge exposure; they are not the proposed product
graph. A fixed hash-selected 120-pair ablation compares title with title-plus-
384-character-lead relevance and applies the unchanged title head to lead
features, as transfer evidence only. Do not tune from this ablation.

## Fresh run boundary

`--fresh` reconstructs and excludes the old 1,192, preliminary 298,
title/lead-fresh 292 and body-fresh 300 report cohorts, including their whole
events and exact title/384-lead keys. The shared frozen selection chooses at
most 300 remaining reports by whole event. Run it only after freezing
the implementation/protocol and reviewing development. Do not revise the model,
head, cutoff, input or candidate rule from its results. This is new-event
evidence within the same corpus, not a new publisher corpus. GlobeSumm lacks
family, publisher-independence and viewpoint gold: event-disjoint exclusion
cannot honestly establish story-family separation or viewpoint safety.

The root's shared `topic-metric-rethink-v1/selectFreshRethink` helper supplies
the same at-most-300-report fresh cohort as the other representation comparisons.
The fresh run requires `--freeze-hash <development-freeze-hash>` and verifies
the regenerated source/parameter/calibration receipt before fresh inference.

## Commands

`node apps/local-service/experiments/topic-encoder/joint-title-evidence-v1/smoke.js --asset-dir <private-model-directory>`

`node apps/local-service/experiments/topic-encoder/joint-title-evidence-v1/run.js --private-dir <private-corpus-directory> --input <private-corpus-file> --asset-dir <private-model-directory> --development`

The corresponding command replaces the final option with
`--fresh --freeze-hash <development-freeze-hash>`. Network
and subprocess capabilities are denied by the harness before private input.
Stdout includes aggregate stage counts and final metrics only; failure output
never includes private filenames, article strings, scores or stack traces.

Primary references: [official model card](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1),
[joint versus independent encoding](https://www.sbert.net/examples/cross_encoder/applications/README.html).
