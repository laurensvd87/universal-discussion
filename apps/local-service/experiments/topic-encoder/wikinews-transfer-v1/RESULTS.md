# Cross-corpus transfer: Wikinews to synthetic viewpoints (2026-10-09)

The runner trained the existing in-memory diagonal metric on 737 Wikinews
articles and chose its strength and cutoff on 207 separate Wikinews validation
articles. The synthetic validation corpus was opened only after this freeze.
The same packaged local E5 embedded both corpora in separate inference calls.
No article text, URL, vector or learned weight was saved or sent to a provider.

The frozen synthetic set contains 60 short reports, five languages, 12 exact
developments in four adjacent-event families, and differing viewpoints. It
has 120 true same-development pairs, 1,650 false pairs, including 300
same-family hard negatives. The Wikinews validation chose strength 1 with
cutoff 0.897529; separately calibrated raw E5 used 0.895295. Neither value
was tuned on the synthetic labels.

| Rule | Pair true / 120 | Pair false / 1,650 | Whole-Topic true / 120 | Whole-Topic false / 1,650 | Exact gold Topics / 12 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raw E5 at fixed 0.94 | 0 | 0 | 0 | 0 | 0 |
| Raw E5 at Wikinews-calibrated 0.895295 | 28 | **1** | 20 | 0 | 0 |
| Learned metric at Wikinews-calibrated 0.897529 | 35 | **1** | 22 | 0 | 0 |

Both false pair admissions were same-family adjacent-event negatives. The
complete-link Topic rule avoided these joins in this small test, yet the
learned metric recovered only 22/120 true Topic pairs and no complete
five-report development. The gain over equally calibrated raw E5 is two
whole-Topic pairs. Candidate retrieval remains stronger: for the learned
metric, a same-development report ranks first for 56/60 articles, and within
the top three for 59/60. Cross-language nearest true partner ranks first for
59/60. Admission, not candidate discovery, remains the limiting problem.

This is a negative transfer result for product activation. The independent
corpus is synthetic and small, so the figures do not estimate real publisher
error rates or prove that genuine opposing opinions will match. The Wikinews
training corpus links editions of its own articles, which is a different task.
No model, threshold or grouping change was applied to the app.
