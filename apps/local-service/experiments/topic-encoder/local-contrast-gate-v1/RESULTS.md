# Local contrast gate v1: development-only result

Date: 2026-10-09. The reviewed protocol, six focused tests, and runner were
committed and pushed as `f0afc6d` before one aggregate-only development run.
It reused the frozen v3 162-report fit and 54-report calibration partitions,
then evaluated all three predeclared variants on the separate 108-report
five-language C1+C2+C3 development set. The 105-report v5 holdout remained
unopened. Exact code, model, and corpus digests were emitted by the runner;
no article rows, text, scores, vectors or weights were saved or printed.

| Gate | True edges / 270 | Cross-language true / 252 | False edges / 5,508 | Complete events / 18 | Mixed groups | Predeclared screen |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Triangle | 85 | 69 | 1 | 3 | 1 | Fail |
| Double support | 84 | 69 | 0 | 2 | 0 | Fail |
| Seed + expansion | 50 | 43 | 0 | 2 | 0 | Fail |

The one false triangle edge was a within-family hard negative. Double
support's calibration had 13 eligible negative candidates and set a local
contrast threshold of `0.035684307832309387`; the same threshold applied
to seed expansion. The frozen screen required zero false edges and mixed
groups, at least 81 true edges, 63 cross-language true edges, and four
complete events. **No variant passed.** The cautious double-support rule
shows that local evidence can admit many correct pairs where the v3 global
gate admitted none, but its 2/18 complete-event result misses the specified
usefulness floor. Its zero false joins are an observation on a small,
fictional development set, not a precision or real-web guarantee.

No v5 holdout evaluation or live activation follows. Further research may
use these development results to design a *new* group-attachment rule, but
must test it against independently authored data before making claims. The
five-neighbor candidate search was experimental; it is not a fixed maximum
Topic size and has not been shown to scale to a large catalog. No live
matcher, stored vector, Topic, discussion, extension, or permission changed.
