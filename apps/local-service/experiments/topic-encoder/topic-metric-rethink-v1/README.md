# Pooled E5 metric rethink v1

Isolated offline research, using the packaged E5 ONNX/WASM encoder. No LLM,
network call, production edit, persistent article/vector/weight artifact or
database access. The explicitly permitted private GlobeSumm file is opened
only after its exact hash and size pass. All output is aggregate.

The previously used 475 title/lead fit and 274 body calibration reports are
reconstructed. The current diagonal adapter is reproduced from the unchanged
title/lead fit. New metrics use body E5 from the **same 475 fitting reports**,
so training and retained production input have the same representation.
Train-only variants are mean centering, global covariance whitening with
50%/90% spherical shrinkage, and within-event covariance whitening with
50%/90% spherical shrinkage. Within-event covariance weights events equally;
it suppresses variation among multilingual reports of the same event.
The shared E5 mean is subtracted, then the Cholesky inverse and unit norm
produce one 384-dimensional vector. Runtime needs only a vector and local
metric parameters. No second vector, text features, language label or LLM
enters admission. Covariance estimates are regularized, rather than fitted
to the small development set.

Every method uses exactly the existing double-support mutual-top-five graph,
and its contrast gate is separately calibrated on the same 274 body reports.
The main 150-report validation is explicitly **reused development**. Among
the fixed five new metrics, choose greatest pure multi-page reach, then
correct grouped-pair reach, then fewer false grouped pairs, then name, with
at most five false grouped pairs, six mixed-group pages, and 2% observed
false grouped pairs. This is an exploratory practical budget, not a
confidence bound or proof of production precision. Also report the raw E5
and current diagonal adapter under exactly that grouping/calibration rule.

`--development` embeds/scans only fitting, calibration and the reused 150
development reports. Freeze its selected name, calibration thresholds and
source hashes before `--test`. `--test --selected NAME --freeze-hash HASH`
must reproduce the exact development-selection hash before embedding test.
Fresh test selection uses whole events, excludes original 1,192 and
preliminary 298 selections, title/lead-fresh 292 and body-fresh 300 cohorts,
plus every exact normalized title/lead key overlapping those cohorts.
SHA-256(`topic-metric-rethink-v1\0` + event key) orders remaining events;
greedily select up to 300 reports, requiring at least 250. This is a fresh
slice of the **same corpus**, without independent publisher or viewpoint
gold; prior broad corpus parsing and possible shared story templates remain
limitations. No tuning follows test, and a test failure cannot be rescued by
another candidate. Body-prefix input is a corpus surrogate, not actual Chrome
article extraction. Title/lead versus body transfer is reported separately.

An optional `--synthetic` diagnostic adds previously used A/B/C authored
multilingual corpora and spent v6. Those reports do not select/calibrate the
metric and are explicitly reused stress tests for multilingual/viewpoint
transfer. They never become an independent quality gate.

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-metric-rethink-v1/core.test.js
node apps/local-service/experiments/topic-encoder/topic-metric-rethink-v1/run.js --development
node apps/local-service/experiments/topic-encoder/topic-metric-rethink-v1/run.js --test --selected NAME --freeze-hash HASH --synthetic
```

The runner saves nothing, including fitted weights. Review aggregate output
before committing it. A positive result is a research candidate for an
owner-local implementation review, not release or model-rights clearance.
