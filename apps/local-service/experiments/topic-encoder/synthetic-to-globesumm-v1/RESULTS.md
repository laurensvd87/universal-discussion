# Synthetic-to-GlobeSumm transfer: exploratory validation result

Date: 2026-10-09. The runner was independently reviewed, its private-path
scope regression was fixed/tested, and the exact code was committed and
pushed as `0e1fa59` before the one approved local-only ADR-065 run. It
verified the private GlobeSumm file's exact 14,972,999 bytes and SHA-256
`8C296A8D1B0F344AD477C2541ACBF010F220D1695F63EBCE35700BF5C4CF392D`.
The synthetic A/B fit/calibration and frozen three v1 local-contrast rules
were unchanged. Only the previously selected 150 validation articles were
embedded and scored; the selected 293 test articles were not embedded.
No article text, URL, row label, pair score, vector or model weight was
saved, printed, committed, or sent to a provider.

| Rule | Correct direct edges / 803 | False direct edges / 10,372 | Complete events / 13 | Mixed groups |
| --- | ---: | ---: | ---: | ---: |
| Triangle | 16 | 0 | 0 | 0 |
| Double support | 15 | 0 | 0 | 0 |
| Seed + expansion | 3 | 0 | 0 | 0 |

The learned representation retrieved a true same-event article first for
**145/150** articles (top three: 147/150), but double support admitted only
**15/803** same-event pairs (1.9%), with 129/150 articles remaining
singletons and no complete event. All admitted pairs were cross-language;
this corpus's selected true pairs were all cross-language. The zero observed
false joins are not a precision guarantee with so few admissions. The
result is worse on this reused validation split than the prior GlobeSumm
local-neighborhood research's 34/803 true and zero false pairs, although
the methods/input and selection details are not a controlled head-to-head
product comparison.

This is **not independent validation**: the split has informed earlier
research, GlobeSumm labels may not equal the product's Topic boundary, and
it has no reliable viewpoint or same-story family gold. Input was the
offline title+384-character lead surrogate, not live browser body capture.
The synthetic-fitted attention/local-contrast path does not provide useful
real-event grouping here and is rejected for live promotion. The private
corpus remains outside Git; publisher/product-training rights remain
unresolved. No Topic, service, stored vector, discussion, extension or
permission changed.
