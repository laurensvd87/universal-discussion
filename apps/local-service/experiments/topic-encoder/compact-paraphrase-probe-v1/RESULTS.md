# Compact multilingual encoder comparison

2026-10-10. No provider calls, private corpus uploads, saved article/vector
artifacts or production-model replacement. Official model assets live in
named TEMP outside Git. Five focused calibration/grouping tests pass.

## Reused synthetic comparison

Calibration A+B216, development C108, already spent v6 holdout60. Select
each model's own floor at >=98% calibration pair precision/minimum20 true
pairs. Same strongest-edge complete-link for all. Counts below came from
the first normalized-output run; the common helper now explicitly renormalizes
vectors before scoring, a numerical guard, not a tuned decision rule.

| Encoder | C nearest event correct /108 | C correct grouped pairs | C pure grouped pages | C wrong grouped pairs | v6 nearest correct /60 | v6 correct grouped pairs | v6 pure pages | v6 wrong grouped pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| E5 body512 | 66 | 0 | 0 | 0 | 59 | 0 | 0 | 0 |
| E5 body128 control | 63 | 0 | 0 | 0 | 59 | 0 | 0 | 0 |
| Paraphrase MiniLM body128 | 107 | 25 | 35 | 0 | 60 | 23 | 29 | 0 |

E5's calibration found no non-abstaining floor under this rule; those zeros
are not evidence that E5 cannot retrieve topic neighbors. MiniLM's floor
was0.8993663320334453. All synthetic splits have prior research exposure,
and authored writing styles cannot establish real publisher/viewpoint safety.
Inference on384 short reports: E5-51249.1s, E5-12844.6s, MiniLM-12846.2s
in separate runs; concurrent research/process load makes this non-browser
timing exploratory. The model is118,412,398bytes plus9,081,518byte tokenizer;
it has replacement-sized footprint, not an installed second extension model.

## Reused real development, common admission policy

Same approved private GlobeSumm corpus,274 calibration reports and150
previously exposed validation reports. Both use normalized body prefixes;
E5 uses512tokens and MiniLM its documented128. Calibration floors are
0.9040571956970354 and0.666950201245198 respectively. Each is calibrated
separately at >=98% observed pair precision and then frozen. This is a
like-policy encoder comparison, unlike the metric agent's support graph.

| Encoder | Nearest correct /150 | Direct true / false pairs | Correct / wrong grouped pairs | Pure / mixed-group pages |
| --- | ---: | ---: | ---: | ---: |
| E5 body512 | 143 | 99 /1 | 54 /1 | 62 /2 |
| Paraphrase MiniLM body128 | **150** | **629 /8** | **455 /0** | **134 /0** |

All803 gold same-event pairs on this slice are cross-language. The eight
wrong directly eligible MiniLM edges demonstrate why pair-only scoring is
insufficient; complete-link rejected their mixed-group combinations here.
That does not guarantee rejection on a larger/different catalog. The model
has not been fine-tuned on this corpus, but its cutoff was calibrated there.

Development freeze:
`8fa2f9f57ae0e70e191062a37fc3f28e4348bd28ad0a571cc894932bfec86190`.
The frozen runner verified its exact source hashes/cutoffs before the shared
fresh cohort: 296 reports, 24 whole events, 1,748 true pairs, all cross-language.
No cutoff or implementation changed after this measurement.

| Encoder | Nearest correct /296 | Direct true / false pairs | Correct / wrong grouped pairs | Pure / mixed-group pages |
| --- | ---: | ---: | ---: | ---: |
| E5 body512 | 261 | 168 /6 | 78 /4 | 116 /7 |
| Paraphrase MiniLM body128 | **293** | **1,182 /43** | **743 /8** | **236 /10** |

MiniLM reaches many more same-event articles, but its eight wrong grouped
pairs exceed E5's four and mixed-page exposure rises from seven to ten.
Its lower wrong-pair *fraction* (about 1.07% vs 4.88%) does not erase the
extra false exposure. It is promising encoder research, not a no-worse
safety win, and is **not installed in the extension**. In particular, this
does not justify silently replacing E5 or adding a second browser model.

GlobeSumm lacks real opposing-viewpoint and independent-publisher gold;
corpus body prefixes are not rendered Chrome captures. A new model cannot
recover its coordinates from stored E5 vectors: practical activation would
need model-versioned recapture and separate mixed-space handling. Existing
E5 sources/comments remain untouched. This is neither release nor source-
rights clearance.
