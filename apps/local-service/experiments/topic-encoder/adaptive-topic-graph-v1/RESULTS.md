# Known-corpus development result (2026-10-09)

The pooled development set has 200 train and 100 validation articles, from
v1/v2 fictional five-language corpora. Train has 400 same-development pairs,
19,500 different-development pairs, 800 same-family hard negatives and 40
exact gold Topics. Validation has 200, 4,750, 400 and 20 respectively.

| Rule | Train correct / 400 | Train false / 19,500 | Validation correct / 200 | Validation false / 4,750 | Exact validation Topics / 20 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fixed E5 complete-link 0.94 | 0 | 0 | 0 | 0 | 0 |
| Current 0.90/0.94 snapshot, no history | not run | not run | 0 | 0 | 0 |
| Selected zero-false triangle (0.86/0.88/0.92) | 3 | 0 | 0 | 0 | 0 |
| Exploratory triangle (0.86/0.88/0.88) | 183 | **10** | 118 | 0 | 7 in separate v1/v2 validation runs |
| One nearest-neighbor veto on exploratory triangle | 162 | **7** | 108 | 0 | 6 |

For the exploratory triangle, the pooled validation exact-Topic count was
seven (four in v1, three in v2), with no false mixed group. Its ten train
false pairs included at least seven same-family hard negatives: the separate
v1 train run had four false pairs, all hard; v2 had five false pairs, three
hard; the pooled run added one cross-corpus false pair. The nearest-neighbor
veto still left seven train false pairs, five of them hard, and two false
mixed train groups. The selected zero-false rule left 198/200 train Sources
and 100/100 validation Sources in separate groups.

The development tradeoff is real but not sufficient to activate. A cautious
selection matches essentially nothing; the setting with useful validation
coverage already mixed Topics in training. The validation slice is familiar
from prior research, and the zero validation errors do not estimate real-world
precision.

## One-shot independent v5 holdout

The code and all rule values above were frozen before the v5 file was opened.
Its exact SHA-256 is
`618c0f470f62a7f2904cfeba43012f540c199f700b9032a5145de75bde8da604`
(case-insensitive hexadecimal). It has 50 reports, ten five-report gold
Topics, 100 true pairs, 1,125 false pairs and 125 same-family hard negatives.
Every language/viewpoint combination occurs, but counts vary by cell.

| Frozen rule | True joins / 100 | False joins / 1,125 | Hard false / 125 | Exact Topics / 10 | Groups |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fixed E5 complete-link 0.94 | 0 | 0 | 0 | 0 | 50 |
| Current empty-history snapshot | 0 | 0 | 0 | 0 | 50 |
| Strict selected triangle 0.86/0.88/0.92 | 9 | 0 | 0 | 0 | 44 |
| Exploratory triangle 0.86/0.88/0.88 | 76 | 0 | 0 | 4 | 16 |
| Exploratory triangle plus nearest-neighbor veto | 63 | 0 | 0 | 3 | 20 |

The exploratory result is promising as a research direction, but its known
train failures remain: ten false pairs for the basic triangle and seven for
the veto. No setting was retuned after v5, and no product activation is
recommended. This 50-report synthetic result cannot establish behavior on
real pages, large catalogs, or differing publisher viewpoints. No production
code or user data changed.

## Second independent v6 holdout (no retuning)

After the rules above were frozen, an independent agent created a balanced
60-report, 12-development, five-language synthetic holdout. Exact JSONL SHA-256:
`032eaa490d0ae6b9067ec479be4a80b563229606f83ce0f43a1bc9efd4098aeb`.
The corpus has 120 true pairs, 1,650 false pairs, including 450 same-family
hard negatives. `evaluate-v6.js` reused the frozen rules without changing a
threshold or reading labels during grouping.

| Frozen rule | True joins / 120 | False joins / 1,650 | Hard false / 450 | Exact Topics / 12 |
| --- | ---: | ---: | ---: | ---: |
| Fixed E5 complete-link 0.94 | 0 | 0 | 0 | 0 |
| Current empty-history snapshot | 0 | 0 | 0 | 0 |
| Strict triangle | 21 | 0 | 0 | 0 |
| Exploratory triangle | 79 | **8** | **8** | 3 |
| Exploratory plus nearest-neighbor veto | 63 | 0 | 0 | 3 |

The eight exploratory false joins created three mixed Topics. The veto removed
them on v6 but had seven false train joins, so it is not validated for live
admission. The strict rule again left most true reports separate. This v6
result reinforces the precision/coverage tension; it is not permission to
select a rule on v6 or migrate existing discussions. The v6 set is now spent
as a one-shot holdout for these graph rules.
