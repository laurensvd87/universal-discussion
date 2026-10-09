# Synthetic attention to GlobeSumm: frozen transfer diagnostic

The frozen transfer run is complete; see [RESULTS.md](RESULTS.md). It did
not establish useful real-event grouping or product readiness.

This is private, offline research under ADR-065. It asks whether the event
representation fitted on original fictional reports transfers to a real
multilingual event corpus. It does not change the local service or extension.
No article text, URLs, individual scores, vectors, or fitted weights are saved
or printed. The 293 selected test articles are not embedded or scored.

## Frozen procedure

1. Check the exact GlobeSumm input SHA-256 from ADR-065 and the existing
   `real-event-eval` parser and whole-event selection. Use only its already
   selected 150-article validation split. Require the selected split counts
   749 train, 150 validation, 293 test. Neither synthetic training nor
   calibration reads GlobeSumm labels.
2. Check the original A/B synthetic corpus byte hashes through the v3 adapter.
   Use its fixed 162-report fit and 54-report calibration split. Embed the
   synthetic reports with the packaged E5 title plus 384 lead characters and
   at most 64 content-token states. Fit `event-token-pool-v3` dynamic attention
   for 40 steps in RAM.
3. Calibrate `local-contrast-gate-v1` on those 54 fictional reports exactly as
   its development protocol specifies. Do not adjust its thresholds from any
   GlobeSumm labels.
4. Embed only the 150 selected GlobeSumm validation titles and bounded leads
   with the same E5 input. Apply the unchanged attention weights and all three
   predeclared gate variants: triangle, double-support and seed-expand.
   Output aggregate direct and grouped event counts, cross-language counts,
   nearest same-event retrieval counts, timings, and code/data/model digests.

The corpus has gold event labels but no trustworthy same-story family or
viewpoint labels. Its category is only a rough proxy for a hard negative, and
its event boundary may not match the product Topic boundary. The model input
is an offline title/short-lead surrogate, not the current browser capture
representation. Validation was used by earlier experiments, so this is a
transfer diagnostic, **not independent validation**. No promotion or test
split follows from this result alone. Underlying publisher rights remain
unresolved for product use.

Run from the repository root with Node 24 or later, after independent review
and a freezing commit:

```powershell
node apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/scope.test.js
node apps/local-service/experiments/topic-encoder/synthetic-to-globesumm-v1/run.js --private-dir C:\\private\\corpus --input C:\\private\\corpus\\news_only.json
```

Both paths must be explicit absolute paths. The private directory must resolve
outside Git; the regular input file must resolve below it and have the pinned
bytes. A fixed failure code is printed on error, with no path or corpus text.
The program denies external capabilities before opening any file. Keep even
the aggregate result private until reviewed.
