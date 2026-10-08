# Multilingual pair v4: frozen offline negative result

This isolated research scorer combines two transient packaged E5 views (title plus the first 384 normalized lead characters, and title alone) with exact numeric and capitalized-name overlap. A small class-balanced linear logistic model learns from only v1 TRAIN and both v2 TRAIN parts: 200 fictional reports, 40 precise events. It weighs same-family adjacent-event negatives during fit. The admission cutoff is the highest TRAIN negative score plus a fixed 0.05 score margin. A pair can abstain; no fixed top-K membership limit or global outside-source veto is used. There is no service, database, extension, provider or model download change.

Run `node apps/local-service/experiments/topic-encoder/multilingual-pair-v4/core.test.js` for the focused feature and training check. `run.js train` creates the model artifact once and `run.js validate` checks frozen source/data hashes before one independent validation score. Both commands use only the already packaged E5 assets, and retain neither article text nor embeddings in the artifacts. The generated model contains six numeric weights and a cutoff; the validation artifact contains aggregate counts.

| Frozen split | True pairs admitted | False pairs admitted | Same-family false pairs | Cross-language true pairs | Opposing-view true pairs | Complete events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| TRAIN | 32/400 | 0/19,500 | 0/800 | 32/400 | 26/345 | 3/40 |
| v2 VALIDATION | 2/120 | 0/1,650 | 0/300 | 2/120 | 1/108 | 0/12 |

The raw focus E5 and title E5 baselines, each cut above its highest TRAIN negative, accepted 2/400 true TRAIN pairs and 0/120 true v2 VALIDATION pairs; both had zero false admissions on these splits. The v4 scorer improves those baselines slightly but recovers no whole validation event. It is therefore a negative activation result. In particular, zero false pairs on a small fictional split does not establish real-page precision. The name cue is intentionally simple and can miss translated entities or pick up sentence-initial words; it is not a calibrated event identifier. This experiment does not score the sealed multilingual v3 holdout or v1 validation.

The first validation command reached its shape guard and stopped before embedding or scoring because it expected 40 rows rather than the 60 specified by the v2 corpus structure. Only that guard was corrected; fitted weights and cutoff stayed fixed. The corrected source hash was recorded before the single validation scoring pass.

Frozen SHA-256 hashes:

```text
core.js + run.js concatenated  d0e7c4046526f829a71eaf74beb33b1c28ecbae002ded303cd3842e9812de482
model.generated.json          b4245968b20882faf3e4a14e3c73900160ec58215ac1c6a5cebf4dbc017a552a
validation.generated.json     3e713978709cbcb6e0d5e0d950a62b19a7c7ab2a230620ebb7cb7883b7e7f646
```
