# Multilingual E5 metric shadow v1 — frozen negative

This offline experiment uses only the SHA-pinned 80 training and 40
family-disjoint validation articles in `multilingual-train-v1`. It computes
one packaged multilingual E5 vector per page from the title and at most 384
normalized lead characters. The 384 positive diagonal metric weights are
trained on the 160 same-development pairs and 200 same-family,
adjacent-development negative pairs in training. L2 regularization anchors
weights to identity. The zero-false pair cutoff for each representation is
selected from **training negatives only**. Validation is used for reporting,
not epoch, hyperparameter or cutoff selection. No sealed holdout, Luna article
or challenge file is read.

Run from the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/multilingual-metric-v1/core.test.js
node apps/local-service/experiments/topic-encoder/multilingual-metric-v1/run.js
```

The second command hashes the two frozen input files, uses the already
packaged model without network access, regenerates `model.generated.json`,
and prints aggregate scores. The artifact holds metric weights and hashes,
no article text, per-page vectors, owner data or labels. It is preserved for
reproduction only; this negative candidate is not proposed for activation.

## Frozen development result, 2026-10-08

| Validation metric | Raw E5 | Learned metric |
| --- | ---: | ---: |
| True partner rank 1, all candidates | 38/40 | 38/40 |
| True partner top 3 | 40/40 | 40/40 |
| Cross-language-only true partner rank 1 | 40/40 | 40/40 |
| True pairs admitted at train-zero-false cutoff | 1/80 | 1/80 |
| False pairs admitted | 0/700 | 0/700 |
| Same-family adjacent-event false pairs admitted | 0/100 | 0/100 |

Per-language rank 1 was English 6/8, Dutch 8/8, German 8/8, French 8/8,
Spanish 8/8 for both methods. The single admitted true pair was French–Spanish.
Every language had cross-language-only rank 1 of 8/8. Training admitted 3/160
true pairs and zero false pairs for both methods. Validation has no unmatched
singleton pages, so this run cannot measure that abstention case. These invented
articles are too small and regular to establish real-page calibration.

Raw train cutoff: `0.9237644546740477`; learned train cutoff:
`0.923744930581057`. The learned coefficients range from
`0.9978072379398191` to `1.0019922618189074`, with L2 distance
`0.010082923766461036` from identity. There is no meaningful gain, and this
method is frozen as a negative result. No threshold, retained representation,
Topic membership, migration or live code changes follow.

SHA-256: packaged model
`f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`;
tokenizer `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`;
metric artifact `69ab8e5346181cec95c7727fd5ab6f81e93318c92671dcc5ea592c54af774cd9`.
Training and validation input hashes are pinned in `run.js` and the corpus README.
