# RAM-only GlobeSumm diagonal adapter: exploratory result

Date: 2026-10-09. The independently reviewed protocol, source guard and
three core tests were committed and pushed as `9ebf2ef` before one private,
local ADR-065 evaluation. The exact 14,972,999-byte GlobeSumm source hash,
packaged E5 asset/model hashes and execution-source hashes were verified.
Of the already selected 749 train reports, 475 whole-event-disjoint reports
fitted a 384-parameter diagonal adapter in RAM for 40 steps (450 static
triplets); 274 train reports calibrated the unchanged double-support gate.
The 150-article validation was scored once as a **reused exploratory split**.
The selected 293 test reports and 3,495 unselected reports were not embedded.
No article text, labels, URLs, content digests, vectors or learned weights
were saved, printed, committed or sent to a provider.

| Representation, separately calibrated | True admitted edges / 803 | False admitted edges / 10,372 | Rank-1 true neighbor / 150 | Complete events / 13 | Mixed groups | Singletons / 150 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw pooled E5 | 35 | 0 | 147 | 0 | 0 | 104 |
| Trained diagonal adapter | **126** | **0** | 147 | 0 | 0 | 67 |

All admitted true edges were cross-language. The diagonal result is a
substantial pair-admission improvement on this *same* exploratory split,
but the predeclared continuation screen **failed** because it required at
least one complete event and found none. More importantly, its real-train
calibration saw **zero eligible different-event negative candidates**
for this topology and used the specified zero contrast floor; that is weak
negative coverage, not evidence that zero false joins will generalize.
Raw E5 calibration saw only two such negatives. The result therefore does
not establish safe real-world Topic identity. A complete-event metric may
also be too strict for the product's precision-first, partial-coverage goal;
any alternative metric must be declared before a fresh independent test,
not used to retroactively pass this screen.

This is not a product model. GlobeSumm's event labels may differ from app
Topics, no cross-publisher viewpoint gold exists, the split has informed
earlier experiments, and the title+384-lead input differs from live browser
capture. Publisher/product-training rights and a separate owner/Trust live
activation gate remain. No retained field, service matcher, Topic,
discussion, extension or permission changed. The learned 384 values existed
only in process RAM and were not shipped or stored.

## Retrospective partial-coverage comparison, same validation

The owner subsequently clarified the research choice in ADR-069: correct
partial discussion reach may count if false Topic exposure does not worsen
against the same-case E5 baseline. An offline `--coverage` run reused the
exact 150 validation articles and the original train fit/calibration. The
private source still matched ADR-065's exact size and SHA-256. No selected
test article was embedded or scored. The coverage evaluator cross-checked
the runner's direct edges, false grouped pairs and singleton counts.

| Validation metric | Raw pooled E5 | Diagonal adapter |
| --- | ---: | ---: |
| Correct direct edges | 35 | 126 |
| Correct grouped pairs, including transitive | 57 | 214 |
| Articles in pure multi-page groups | 46/150 | 83/150 |
| Other correct pages per possible root, mean | 0.76 | 2.85 |
| False direct / grouped pairs | 0 / 0 | 0 / 0 |
| Articles exposed to a mixed group | 0 | 0 |
| Complete events | 0/13 | 0/13 |

All grouped true pairs are cross-language. The 150 validation inputs have
150 distinct exact title-and-lead keys; duplicate-adjusted *exact-input*
counts and means therefore equal the article counts above. These keys do
not establish 150 independent publishers or editorial sources. The
adapter reaches 37 more articles in pure groups and 157 more correct grouped
pairs with no observed increase in false or mixed exposure on this reused
slice. This satisfies the owner's *relative exploratory* research criterion
on these cases, while the original frozen complete-event screen remains
failed. The adapter's calibration had zero eligible negative candidates,
and both methods observed zero false joins on only 10,372 different-event
validation pairs. Neither result establishes safe precision outside this
split. There is no publisher or viewpoint gold and the title-plus-384-lead
input is not the current live body-derived E5 input. A fresh independent,
rights-cleared comparison remains necessary before any activation decision.
