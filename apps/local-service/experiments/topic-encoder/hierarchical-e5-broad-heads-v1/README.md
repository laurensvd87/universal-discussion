# Frozen broad paired E5 head screen C

Completed offline2026-10-19; NOT activated. [ADR134](../../../../../decisions/ADR-134-broad-paired-heads-and-owner-depth-projection.md).
This cohort and selected model/policy are now CLOSED: no retuning or final-test
replay. Freeze `7bf0ee5450ed3cf9768f08c678589767fa7277542a88aa8652f7bd6324ab91fb`
binds23source files and the exact authored corpus/protocol/taxonomy/encoder inputs.

## Method and actual locked result

Use the existing E5 body and title encoder separately, then an explicitly hashed
weighted normalized representation. Train63compact ancestor-inclusive affine
Ridge heads; select only on development loss, calibrate separately, then evaluate
the one chosen model/policy on an untouched split. No UMAP, HDBSCAN or NLI runtime.

An independently authored457literal-pair corpus replaced an overlarge1038-row
request to avoid artificial scenario multiplication:130training/67development/
193calibration/67lockedtest, five balanced languages,63nodes/16roots. Titles and
bodies are unique; scenario independence is author-declared, NOT independent web
publishers. The full corpus is imported/hashed and all fields encoded before
selection; final rows are not used for fitting, selection or calibration. Receipts
therefore say `finalTestEvaluated:false`, not the literally inaccurate “unopened.”

Nine combinations of body weights .75/.5/.25 and lambdas .01/.1/1 were compared on
development only. The selected configuration was .75body/.25title, lambda .01.
Calibration used at least3accepted groups and empirical precision1; these tiny
supports are NOT guarantees or probabilities.

Locked67:55assigned,54safe (98.18% observed accepted precision),29safe broader
fallbacks,12unresolved. There was one wrong root; no wrong sibling or over-specific
same-branch outcome. All20assigned non-root nodes were safe, including14internal
nodes and6leaves. Six leaves were correct, but none of the10depth3gold examples
reached their exact deepest node. Overall deepest outcome29/67 includes four
correct outside rejections. This is useful broad matching, not sufficient specific
coverage or real-web release evidence.

Classifier median .1679ms/p95 .3934ms/max1.1123ms covers these63nodes including
validation/path logic, excluding compile, embedding, queue and database. The914
body/title encodes took a supervised38.062s, peak sampled RSS1,171,427,328 and
privatecommit1,190,674,432bytes. All nine fits together took less than one second
under supervision and used73,138,248counted training units, below128million.
Calibration .468s and final phase .359s are whole supervised phase timings, not
browser or hosted throughput. Crawler/API/worker/dashboard were left running.

Production flags remain false. Specific coverage, sample support, uncertainty and
broad error gates fail; even perfect67outcomes could not satisfy the retained
large-sample gates. Do not turn six correct leaves into a98%population claim.

## Reproducible stored evidence, no replay

The selected model/policy and paired vector packet stay ignored in `output/`.
`measured-results.json` contains synthetic-only aggregate/outcome evidence.
Final result SHA256:
`321a1b7be3dff3d8a4c6d82d75b11eba4082f2c25432df40d755449dd7901547`.

```powershell
node .\verify.js --verify
node .\verify.js --verify-local
```

These verify23stored source hashes, file linkage and outcome arithmetic only.
They do not encode, fit, classify, access owner data or repeat final testing.
All five phases have exclusive markers, output hash receipts and own-child
Windows memory/time supervision. Never modify an applied database migration,
activate the dirty worktree or change the crawler to replay this experiment.

## Next bounded method

The compact head model is a promising feature classifier, but its rare-node scores
may fall below the fixed global calibration grid's -.25floor. That is a hypothesis,
not a demonstrated cause of every broad fallback. A separately versioned observed-
cutpoint calibrator is being implemented on NEW independent calibration/test
scenarios, reusing only this frozen trained model. It must not recalibrate on this
closed cohort or evaluate changed rules on its67test cases.

A separate same120DEVcatalog transfer check completed without tuning:32/72clear
cases assigned,25rootcompatible and7disagree;40unresolved. Four ambiguous and five
insufficient assignments remain unscored. The78.125%assigned-clear compatibility
is partial-title-root evidence, not full-body or representative web accuracy.
ResultSHA256:1c35956b38b2c6dbbff82180bfe2f15ed69d103e951b8afa76394c05c68454c4.
Independent stored-byte arithmetic/sourcehash review passed; no rollout follows.
Another reviewer
curated32fresh Wikipedia articles blind to model outputs; their actual captured
features and evaluation partition are not yet frozen. Only three currently have
exact URL metadata matches in the local catalog, so the availability check alone
is not an external embedding-quality test.
