# New-event diagonal comparison — aggregate one-shot result

2026-10-10. Protocol and source/asset hash inventory were independently
reviewed, committed and pushed as `d034dec` before opening the private
GlobeSumm file. A post-commit dry run verified all hashes without private
read. The single offline run then verified the corpus bytes and reconstructed
both prior selections: the 1,192-article main cohort and the separate
298-article preliminary cohort. It excluded their whole events and any
remaining event sharing an exact normalized title/384-character-lead key
with either cohort. A predeclared hash order selected **292 articles in 23
other events**. These reports had not been embedded or scored by the known
project experiments, although corpus-wide metadata had been inspected.
After exclusions, 3,426 articles in 269 events were eligible before the
300-article work budget. The corpus SHA-256 was
`8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`;
the packaged E5 model SHA-256 was
`f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.
The full reviewed source/asset inventory is fixed in
[`reviewed-source-sha256.json`](reviewed-source-sha256.json).

The unchanged 384-parameter diagonal adapter fit on the original 475
training articles; it and raw E5 were separately calibrated on the original
274 calibration articles. Neither fit nor threshold used the new-event
labels. Both methods used the same packaged E5 title-plus-384-lead input and
the same double-support graph. No model weight, article, URL, row label or
vector was saved or printed.

| Same 292 new-event reports | Raw E5 | Diagonal adapter |
| --- | ---: | ---: |
| Correct direct edges | 44 | **213** |
| Correct grouped pairs / 1,785 available | 60 | **324** |
| Articles in pure multi-page groups | 66 | **151** |
| False direct edges / grouped pairs | 0 / 0 | 0 / 0 |
| Articles in mixed groups | 0 | 0 |
| Complete events / 23 | 0 | 0 |
| Singleton groups | 226 | 141 |

There were 40,701 different-event pairs, including 7,704 same-category hard
negative pairs; no false direct or grouped pair was observed for either
method on this selected slice. All correct grouped pairs were cross-language.
The diagonal calibration again had **zero eligible negative candidates** and
used its frozen zero floor; raw E5 had two. Thus the observed zero-false
count is encouraging but not a calibrated precision estimate. Exact-input
deduplication left 292 distinct keys, which does not prove independent
publishers or viewpoints. No full event was recovered.

The preregistered ADR-069 *exploratory relative* screen is met on these
cases: both correct group reach and pure multi-page article reach improved,
without an observed increase in false exposure. This is a stronger
new-event result within **the same GlobeSumm corpus**, not an independently
sourced, cross-publisher or opposing-viewpoint validation. Earlier
corpus-level inspection, possible family/template overlap, and GlobeSumm
event-label granularity remain limitations. The offline title/lead input is
not the extension's rendered body-prefix vector. Root-route churn and real
app discussion behavior were not measured. GlobeSumm publisher rights do
not clear trained-weight product use. No service, extension, database,
dashboard or Topic route was changed. A read-only shadow preview can be
prepared separately, but applying this adapter to live user Sources or
switching canonical discussion routes requires distinct owner/Trust/data-
rights and migration decisions.
