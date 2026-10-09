# Offline pair verifier v2: failed usefulness screen (2026-10-09)

The frozen full-coordinate symmetric logistic verifier was run once on
project-created synthetic v2 train and family-disjoint validation only. Its
predeclared zero-observed-false-pair cutoff was `0.9823565024010124`. It
passed the pair portion of the usefulness screen (70/120 true admissions,
0/1,650 false) but recovered only **1/12 complete developments**, below the
required 2/12. The candidate is therefore **rejected**. No weights or
vectors were saved, no parameters or gate were retuned, and no test/holdout,
Wiki, JRC, GlobeSumm or user data was embedded or scored.

Training used 120 fictional reports from 24 developments in eight families:
240 positive same-development pairs and 600 same-family different-
development hard negatives. Validation used 60 reports from 12 developments
in four other families. The frozen synthetic corpus integrity check passed
before the run. The model used the existing packaged E5 title-plus-384-
character-lead input; these are not the live extension's body-derived
retained vectors.

| Synthetic family-disjoint development rule | Pair true / 120 | Pair false / 1,650 | Pair precision | Pair recall | Complete developments / 12 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full-coordinate verifier at selected cutoff | **70** | **0** | 100% | 58.3% | **1** |
| Raw E5 fixed 0.94 | 0 | 0 | No admissions | 0% | 0 |
| Raw E5 at prior Wiki cutoff 0.895295 | 28 | 1 | 96.6% | 23.3% | 0 |

All 70 admitted true verifier pairs were cross-language (70/120 possible),
and 0/300 same-family hard negatives were admitted. Its fixed first-fit
complete-link grouping produced 34 provisional groups, zero mixed groups,
39 true and zero false grouped pairs. The prior Wiki-cutoff raw E5 reference
produced 43 groups, 20 true and zero false grouped pairs: its one false
*pair-gate* admission did not become a false *group* join. Pair-level gain
alone did not meet the predeclared whole-development criterion; reports of
the same event remain fragmented.

Embedding took about 9.0 seconds and total local runtime about 10.1
seconds. Because the threshold is the maximum negative **from this same
validation slice** plus 0.002, its zero false admissions cannot estimate
independent precision. The stronger pair recall suggests that full-coordinate
information may help on this synthetic geometry, but this run cannot
separate feature resolution from training/optimizer effects relative to v1.
Synthetic v2 retains language/viewpoint correlations and does not establish
opposing-viewpoint or independent-publisher robustness. No live activation or
fresh-holdout use is warranted by this failed screen.
