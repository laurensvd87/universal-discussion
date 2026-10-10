# Compact multilingual paraphrase encoder probe

Research only, offline inference, no provider. Compare packaged E5 q8 with
the official `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
q8 encoder pinned to revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`.
The latter uses mean pooling, 384 coordinates, no query prefix and its
published 128-token limit. It supports 50+ languages; quality for each
language is not assumed. The model card labels it Apache-2.0.
Model card: https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2

`download.js` retrieves five pinned, hash-checked model/tokenizer/config
assets into the named OS temporary research folder, outside Git. It does
not run remote code. The quantized model is 118,412,398 bytes; model plus
tokenizer is roughly the current E5 footprint, not an additional production
dependency. No asset is installed into the extension or running service.
Inference denies network/subprocess capabilities and keeps article text and
vectors in memory. Source/article text never goes to a model provider.

`run.js` compares normalized 4,096-character body prefixes of the reused
216 calibration, 108 development and 60 spent synthetic holdout reports.
E5-512 and E5-128 control isolate the token-budget effect. Calibration
selects the floor with most true pairs subject to at least twenty positives
and 98% observed pair precision, without splitting identical-score buckets.
Strongest-edge complete-link requires all cross-group pairs above the floor;
there is no fixed top-k neighbor/member count or competitor lead.

`real-transfer.js` compares E5-512 and MiniLM-128 on the same privately
approved GlobeSumm file. Each gets its own cutoff from the same 274 reports.
The old 150-report validation is development, already exposed. Before fresh
test, freeze source hashes and cutoffs from the development run. A second
run must reproduce that hash before opening the shared metric-rethink-v1
whole-event test cohort, excluding all four earlier exposed selections and
their duplicate title/lead keys. No retuning or alternative candidate rescue
is allowed after this new slice. Only reviewed aggregate results may enter
Git. No weights, article text or vectors are saved by either runner.

This complete-link policy is deliberately a separate encoder diagnostic,
not a production membership rule or an apples-to-apples comparison with the
metric agent's mutual-neighbor support graph. Pair calibration precision is
not a confidence bound on future mixed-group exposure. GlobeSumm lacks
independent publisher/viewpoint gold; a fresh slice of the same corpus
cannot prove robustness on opposing opinions. A different model cannot
transform stored E5 vectors into its own coordinates: rollout would require
versioned recapture, rather than overwriting or mixing vector spaces.

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/compact-paraphrase-probe-v1/core.test.js
node apps/local-service/experiments/topic-encoder/compact-paraphrase-probe-v1/run.js
node apps/local-service/experiments/topic-encoder/compact-paraphrase-probe-v1/real-transfer.js
node apps/local-service/experiments/topic-encoder/compact-paraphrase-probe-v1/real-transfer.js --fresh --freeze-hash HASH
```
