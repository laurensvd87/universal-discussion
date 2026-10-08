# Multilingual hard-negative projection v3 — frozen negative

This is an offline synthetic experiment. It trains on 200 invented articles:
80 from `multilingual-train-v1/train.jsonl` and 120 from the two frozen
`multilingual-train-v2/train-part-*.jsonl` files. The 16 training families and
40 developments are disjoint from both validation sets. The independently
authored v2 validation slice was scored only after the method, grid, cutoff
rule and training-selected parameters were frozen. The previously seen v1
validation is diagnostic development data, not a fresh check. Neither the
sealed v3 holdout nor Luna test/challenge was opened.

Packaged multilingual E5 embeds each title and at most 384 NFKC-normalized
lead characters into one 384D vector. V3 trains a contrastive matrix:
mean same-family adjacent-development difference covariance minus mean
same-development difference covariance, including opposing viewpoints. Its
eight largest positive eigendirections define a capped, identity-anchored
low-rank residual. This emphasizes dimensions that separate adjacent events
without suppressing difference directions, unlike v2's signed residual.
The fixed strength grid is `0, .25, .5, 1, 2, 4`. The chosen strength
maximizes training true-pair admissions at a cutoff strictly above **every**
training false score plus a fixed `0.002` safety gap; ties choose the smaller
strength. Only training determines the projection and operating cutoff.

Run from the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/multilingual-projection-v3/core.test.js
node apps/local-service/experiments/topic-encoder/multilingual-projection-v3/run.js
```

The runner verifies every frozen input SHA-256 and packaged asset, regenerates
`model.generated.json`, and prints aggregate training and validation scores.
The artifact contains eight axes, eigenvalues, train-selected strength and
threshold, and hashes. It contains no article text, labels, per-article vectors
or owner data. Size: 65,148 bytes; SHA-256
`9596a8613bf291c8cd7bef68324541f09a17ed3b03cdfbeec28e4ddbf8ce58c6`.

The training method was frozen before opening validation: `core.js` SHA-256
`c8f996aea55b02e329f70ad3af6a685f7b28237a2ef642c5f79c18ffdb346205`;
the pre-validation `run.js` SHA-256 was
`5fbccc71b913da6f4807ce1bd63474e5ef66fa5cd9933aa8a63842fa169ab34a`.
After that freeze, only the independently frozen v2 validation hash and
expected 60-row count were filled in `run.js`. V3 selected strength `2` and
cutoff `0.9225352811234278` on training alone. Raw E5 and frozen v2 use
their original v1-training zero-false cutoffs (`0.9237644546740477` and
`0.9018908538184703`), so the comparison preserves their earlier operating
points. They were not retuned on the expanded training corpus.

## Results (2026-10-08)

| Slice and measure | Raw E5 | V2 projection | V3 projection |
| --- | ---: | ---: | ---: |
| 200-page train TP / total | 3/400 | 88/400 | 7/400 |
| 200-page train FP / total | 0/19,500 | 4/19,500 | 0/19,500 |
| Seen v1 validation rank 1; cross-language rank 1 | 38/40; 40/40 | 38/40; 40/40 | 38/40; 40/40 |
| Seen v1 validation TP; FP; hard FP | 1/80; 0/700; 0/100 | 31/80; 6/700; 6/100 | 1/80; 0/700; 0/100 |
| Fresh v2 validation rank 1; cross-language rank 1 | 54/60; 59/60 | 55/60; 59/60 | 54/60; 59/60 |
| Fresh v2 validation TP; FP; hard FP | 0/120; 0/1,650; 0/300 | 9/120; 0/1,650; 0/300 | 0/120; 0/1,650; 0/300 |
| Fresh v2 exact gold Topics; mixed groups | 0/12; 0 | 0/12; 0 | 0/12; 0 |

All true pairs in both validation sets are cross-language because each precise
development has one article per language. On fresh v2 validation, the
per-language rank-1 counts for raw and v3 are English 11/12, Dutch 11/12,
German 11/12, French 10/12, Spanish 11/12. V2 is English 12/12, Dutch
11/12, German 11/12, French 10/12, Spanish 11/12. Cross-language-only rank 1
is 12/12 for each language except French 11/12, for all three methods.
Pairwise threshold edges are partitioned by connected components for the
reported exact-Topic and mixed-group diagnostics; none recovers a full gold
Topic on fresh validation. No unmatched singleton cases exist in these sets.

V3 avoided false admissions on these synthetic slices by admitting almost
nothing; it did not improve the practical event grouping result. It is frozen
as a negative, not an activation candidate. V2's zero fresh-slice false pairs
do not erase its six previously observed adjacent-event false pairs. No live
matcher, retained representation, Topic, permission, provider or model asset
changed.

SHA-256 inputs: v1 train
`008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b`;
v2 train parts
`94a14a36b016795b504e22be9c5c3e1aadb372bdd6d013b9b791e09ac5d81254`,
`7240a9848cee76a2857a737740e4f280f9a9cd7c15d1b38689c9246ff2160db6`;
v1 validation
`fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53`;
v2 validation
`ef9f405df2f8c98054e4f5b465f4fec3d06287d537e9a08be3455ce36d35db99`.
Packaged E5 model
`f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`;
tokenizer `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`.
