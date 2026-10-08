# Multilingual low-rank E5 projection v2 — frozen negative

This offline experiment uses only the frozen `multilingual-train-v1` train and
family-disjoint validation JSONL files. It embeds each invented article with
the already packaged multilingual E5 model, using its title and at most 384
normalized lead characters. It does not read the v3 holdout, Luna test or
challenge, owner pages, or any provider. No production matcher, stored vector,
permission, threshold, or Topic is changed.

The vector-only trainer forms a contrastive symmetric scatter matrix from
160 same-development positive pairs (including opposing viewpoints) and 200
same-family adjacent-development hard negatives. Eight deterministic leading
absolute eigendirections form a regularized residual around the original 384D
unit vector. This mixes dimensions; it is not a diagonal metric. Residual
strength is chosen from the fixed grid `0, .25, .5, 1, 2, 4` by maximizing
**training** true admissions with a training-zero-false cutoff; ties prefer
the smaller strength. The operating threshold is strictly above the maximum
training false-pair score. Validation is scored once for reporting; it does
not select a parameter or threshold.

Run from repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/multilingual-projection-v2/core.test.js
node apps/local-service/experiments/topic-encoder/multilingual-projection-v2/run.js
```

The runner checks exact input hashes and packaged assets, regenerates
`model.generated.json`, and prints complete aggregate metrics. The artifact
contains only eight 384D axes, eight eigenvalues, input/model hashes and the
training-selected strength. It contains no article text, labels, per-article
vectors, or owner data. It is 64,944 bytes, SHA-256
`78d2f22b2d3ba0bcce6c3439601f40cee70ea8069be6575c468daeebf1cafa63`.

## Measured development result (2026-10-08)

| Measure | Raw E5 | Trained projection |
| --- | ---: | ---: |
| Train cutoff, selected from train false pairs | 0.9237644546740477 | 0.9018908538184703 |
| Train true/false admissions | 3/160; 0/3,000 | 54/160; 0/3,000 |
| Validation rank 1 | 38/40 | 38/40 |
| Validation cross-language-only rank 1 | 40/40 | 40/40 |
| Validation true pair admissions | 1/80 | 31/80 |
| Validation false pair admissions | 0/700 | **6/700** |
| Validation same-family adjacent-event false admissions | 0/100 | **6/100** |

All 80 validation true pairs are cross-language because each development has
one article per language. The trained 31 true admissions are cross-language;
the six false admissions are adjacent-event cross-language pairs. Per-language
rank 1 for both representations is English 6/8 and each of Dutch, German,
French and Spanish 8/8. Every language is 8/8 for cross-language-only rank 1.
There are no unmatched singleton articles in this corpus, so unmatched
abstention is not measured.

The training-selected strength is 4. Better training recall did not transfer
without false joins. Under ADR-064's precision-first rule this is a negative
result, frozen for reproduction only. This small synthetic family-disjoint
validation cannot calibrate real page identity or authorize activation.

SHA-256 input files: train
`008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b`,
validation
`fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53`.
Packaged E5 model
`f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`;
tokenizer `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`.
