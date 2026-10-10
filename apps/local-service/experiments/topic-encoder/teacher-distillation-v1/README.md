# RAM-only linear teacher distillation v1

Offline owner-authorized prototype only; no production import, extension model,
Source recapture, retained field, database access, provider call or deployment.
Original E5 vectors remain unchanged. The teacher is used only during this
local experiment. Prose, vectors, targets, fitted means and matrices stay RAM-only.
No fresh inference mode is implemented: stop after development unless useful.

Teacher: already-downloaded official
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, revision
`e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, Apache-2.0 per the previously reviewed
official card. Model SHA-256
`783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672`.
Use its existing local 118,412,398-byte ONNX file, plain normalized body prefix,
128 tokens, mean pooling and 384 coordinates. No download or remote model code.
Student inputs are unchanged packaged E5 body-prefix query/512-token vectors.
Both see the same normalized 4,096-character report body, with distinct pinned
token policies. This tests teacher transfer AND that information-budget mismatch.

## Fixed fit

Reconstruct original whole-event selection and clean 475 fit /274 calibration
reports. Fit on the 475 paired unit vectors only; event, family, language and
viewpoint labels never enter the linear fit. Reused evaluation is original
150 validation reports, authored C108 and spent v6. Whole events are disjoint
between real fit/calibration/development; synthetic challenge families are not
fit. No spent shared296 or other fresh cohort is opened to inference.

Compute train means mx and my, mean covariance Cxx and cross-covariance Cyx.
For each predeclared lambda in {0.01, 0.1, 1}:

`ridge = lambda * trace(Cxx) /384`

`W = Cyx * inverse(Cxx + ridge*I)`

Use Cholesky plus forward/transposed-back solves, not matrix inversion. Predict
`unit(my + W*(unit(x)-mx))`. Dimension is 384→384; matrix has 147,456 parameters,
plus two means. There is no output-centering arm, nonlinear head, label fitting,
calibration ridge search or test-driven regularization change. Degenerate input,
nonfinite solve/output or zero prediction aborts the entire run.

The comparisons are raw E5; unfitted train-mean centering; existing installed
old diagonal weights (title/lead-fitted, applied unchanged to body); teacher;
and all three maps. Every representation gets its own threshold from exactly
the same 274 real calibration reports: most true all-pairs subject to at least
20 true pairs and >=98% observed pair precision, never splitting score ties.
Use the same strongest-cosine-edge complete-link construction for all cases.
No fixed nearest count, member count, competitor lead or body/title veto.

These are encoder diagnostics, not the indexed deployment policy. The old
diagonal's training/input mismatch is stated, not hidden behind its name.
Calibration precision is not a future-risk confidence bound.

## Predeclared usefulness and stop rule

A map may continue only if:

- Real development grouped false pairs and mixed pages do not exceed raw E5.
- C108 false pairs/mixed pages do not exceed the same-case old diagonal.
- Spent v6 has zero false pairs and zero mixed pages.
- Real development pure reach improves over old diagonal, and C108/v6 true
  grouped coverage does not regress from old diagonal.

Choose among passing maps by development pure reach, then correct grouped
pairs, then stronger lambda. Teacher is a ceiling/control, never eligible
for rollout selection. Report every map regardless of selection. If none is
useful, STOP with negative research evidence; no fresh test or softer gate.
This deliberately tests whether transfer gives usable cross-domain coverage,
not merely a better fit to the news training examples.

## Guard and commands

`--freeze` verifies fixed private input, already-existing teacher/E5 assets,
installed comparator and source/cohort hashes, and prints a content-free
descriptor/hash WITHOUT embedding, fitting or quality measurement. The lead
reviews it. `--measure --freeze-hash HASH` must reproduce it before any inference.
Network and subprocess capabilities are denied before private input; failures
print only a fixed code. Neither mode saves private inputs or trained artifacts.

```text
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/teacher-distillation-v1/core.test.js
node apps/local-service/experiments/topic-encoder/teacher-distillation-v1/run.js --freeze
node apps/local-service/experiments/topic-encoder/teacher-distillation-v1/run.js --measure --freeze-hash HASH
```

Report train/calibration teacher reconstruction, calibration and reused grouping,
multilingual/opposing-viewpoint coverage, same-family/gross challenge exposure,
runtime and parameter count. Low regression error does not prove grouping;
identical or information-free captures cannot be disambiguated by ANY deterministic
linear map. Corpus labels are not independently reviewed app-topic/publisher/
viewpoint gold. Results cannot establish live capture safety, model/source rights,
new retention, migration, release or distribution permission.
