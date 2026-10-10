# Body-input transfer — aggregate one-shot result

2026-10-10. The protocol and source/asset hash inventory were independently
reviewed, committed as `49d4f00`, and pushed before private corpus access.
The post-commit dry run verified the frozen inputs without opening the corpus.
One network-denied local run then checked the corpus hash, reconstructed and
excluded the 1,192-article original selection, the 298-article preliminary
selection and the 292-article new-event title/lead selection, plus whole events
sharing their exact normalized title/lead key. The fixed hash order selected
**300 other articles in 24 events** from 3,121 available articles in 245
events. No article text, URL, row, vector or trained weight was saved or
printed.

The unchanged 384-coordinate diagonal adapter was fit on the original 475
title-plus-384-lead training articles. Both methods were separately calibrated
on body-only E5 vectors from the original 274 calibration articles. The
selected new events used body-only vectors from a normalized 4,096-character
GlobeSumm article prefix, rather than title/lead. Both methods used the same
double-support graph and the same 300 articles. This is a **surrogate** for,
not an exact reproduction of, the extension's rendered article extraction.

| Same 300 new-event body-prefix reports | Raw body E5 | Diagonal body E5 |
| --- | ---: | ---: |
| Correct direct edges | 17 | **180** |
| Correct grouped pairs / 1,792 available | 20 | **255** |
| Articles in pure multi-page groups | 29 | **135** |
| False direct edges / grouped pairs | 0 / 0 | **1 / 1** |
| Articles exposed in mixed groups | 0 | **2** |
| Complete events / 24 | 0 | 0 |
| Singleton groups | 271 | 163 |

All 1,792 same-event pairs were cross-language. There were 43,058
different-event pairs, including 6,842 same-category hard negatives. One
different-event pair was joined by the adapter, though no hard negative was.
The raw-body E5 calibration had only four eligible negative candidates; the
adapter calibration had **none** and retained its frozen zero threshold. Thus
neither observed zero nor one false join estimates production precision.

The ADR-069 exploratory *relative* decision is **not met**: same-event reach
improved sharply, but false grouping and mixed-group exposure worsened on the
same cases. The adapter remains a promising research representation, not an
approved automatic Topic router or live toggle. This is another slice of the
same GlobeSumm corpus, not independently sourced publisher/viewpoint gold.
Existing Chrome vectors, root-post migrations, legal rights to product-trained
parameters, and real browser input are untested here. No extension, backend,
SQLite, canonical Topic or discussion route changed. The optional dashboard
preview is read-only and deliberately has no producer from this experiment.
