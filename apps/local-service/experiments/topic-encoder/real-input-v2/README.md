# Private two-length E5 input comparison v2

Offline ADR-065 research only. This compares the existing title-plus-first-384-normalized-article-character E5 input with title-plus-up-to-4096-character input. The packaged encoder still truncates its combined input to 4096 characters and its model accepts at most 512 tokens. The longer text is transient in process memory only. The real-event-eval parser's default remains 384 characters; only this CLI explicitly requests 4096. Duplicate identity and event splits remain based on the original 384-character prefix.

Train labels select one frozen convex blend of the two cosine views (short weight 0, 0.25, 0.5, 0.75 or 1). Its admission cutoff exceeds every train negative score by 0.003; ties prefer the established short view. Validation is scored once against that train-selected rule and separate 0.94 cosine baselines for both inputs. Output contains aggregate pair TP/FP/FN/TN, same-category false admissions and cross-language true-pair admissions. The selected test split is neither embedded nor paired. This is pair evidence, not Topic grouping, a calibrated precision guarantee or a live change.

The CLI requires an explicit absolute private directory and regular input file beneath it, outside Git. It reuses the bounded parser, whole-event selection and packaged hash-checked E5. Network and subprocess capabilities are denied. No content, labels, vectors, fitted policy or per-document data are printed or saved. Real-run aggregate output should remain private pending review.

The long E5 view is embedded in sequential chunks of at most 80 articles. Each chunk uses the same packaged inference function and input order; its temporary session is released before the next chunk. Vectors are combined in memory in original order, with asset identity checked across chunks. This bounds each inference session's work and does not limit Source or Topic membership.

From repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/real-input-v2/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-input-v2/core.test.js apps/local-service/experiments/topic-encoder/real-input-v2/chunks.test.js apps/local-service/experiments/topic-encoder/real-input-v2/preflight.test.js apps/local-service/experiments/topic-encoder/real-event-eval/core.test.js
node apps/local-service/experiments/topic-encoder/real-input-v2/run.js --private-dir C:\private\corpus --input C:\private\corpus\events.json
node apps/local-service/experiments/topic-encoder/real-input-v2/run.js --private-dir C:\private\corpus --input C:\private\corpus\events.json --max-scored 300
node apps/local-service/experiments/topic-encoder/real-input-v2/run.js --private-dir C:\private\corpus --input C:\private\corpus\events.json --preflight-long
```

`--max-scored 300` is an optional research compute budget; the default is 1200. Whole events are selected, so the actual scored count may be lower. This is not a Source or Topic membership cap. Reports include selected and unscored counts. All failures print fixed stage and error codes without private paths, values or stack traces. Stages distinguish `input`, `parse`, `selection`, `short-embed`, `long-embed`, `training` and `validation`. Do not tune this v2 rule on validation.

`--preflight-long` uses the same explicit private-path and whole-event selection rules. It checks the selected train and validation title-plus-long-body inputs with the packaged hash-checked tokenizer and model configuration, including the 250,037-ID vocabulary bound. It runs no ONNX inference and reports only aggregate tokenization failures, sampled-input count and selection totals. It can be combined with the exact 300-article work budget. Inference failures now use fixed `TOKENIZE`, `SESSION_RUN`, `POOL` or `CLEANUP` codes when their stage is known.

The approved private GlobeSumm run initially found one forbidden-control
input among 899 selected train/validation articles. The research parser now
replaces only those contract-forbidden control characters with spaces;
preflight then reported 0/899 tokenization failures. The completed default
work-budget run admitted 5/803 true and 0/10,372 false validation pairs,
versus 34/803 and zero false for the separate shared-neighborhood method.
The short and long E5 passes took about 102 and 497 seconds respectively.
The smaller 298-article work sample had shown 45/331 true and zero false,
but did not generalize. This candidate is rejected for product activation.
