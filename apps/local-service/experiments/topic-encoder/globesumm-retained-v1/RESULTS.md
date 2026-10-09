# GlobeSumm retained-representation development result (2026-10-09)

The approved private corpus SHA-256 was checked as
`8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`.
The established deterministic whole-event selection has 749 train reports,
150 validation reports, 293 selected test reports, and 3,495 previously
unselected reports. Only train and validation were embedded. The latter two
pools remain untouched; no independent sample was created because the
validation result failed the promotion condition.

## 384-character lead-only surrogate

Train-only selection over 12 predeclared policies chose title weight `0.08`,
shared-neighborhood weight `0.04`, and pair/group seed cutoff
`0.9537341859360372`. This is a score, not a calibrated same-event
probability. Group expansion checks all cross-group scores and has no fixed
Topic member cap.

| Measure | Train | Validation |
| --- | ---: | ---: |
| E5 top-three contains a true-event report | 710/749 | 149/150 |
| Admitted direct true pairs | 13/4,536 | 0/803 |
| Admitted direct false pairs | 0/275,590 | 0/10,372 |
| Same-category direct false pairs | 0/43,458 | 0/1,682 |
| Joined true pairs in whole groups | 12/4,536 | 0/803 |
| Joined false pairs in whole groups | 0/275,590 | 0/10,372 |
| False mixed groups | 0 | 0 |
| Complete gold events recovered | 0/59 | 0/13 |
| Predicted groups | 737 | 150 |

An unchanged 384-character body-E5 cosine `0.94` pair diagnostic admitted 5/4,536 true
train pairs and 0/803 true validation pairs, with zero false pairs on each.
The prior unchanged **title-plus-lead** E5 cosine `0.94` diagnostic on the
same validation split also admitted 0/803 true and zero false pairs. Thus
this strict threshold shows no validation difference between the two inputs;
it cannot quantify their broader representation quality or precision at
other operating points. It is not a tuned alternative to the graph rule.

The most productive policy rejected by the train precision gate would have
joined 259 true train pairs but also 23 false pairs in eight mixed groups,
including 14 same-category false joins. This illustrates the nearby-event
risk; it was not applied to validation. Embedding 899 reports took about
76 seconds; the complete train/validation run took about 79 seconds on this
Windows machine. This brute-force graph materializes every pair, and its
group checks are not an incremental scalability result. This 384-character
body vector is not the live 4,096-character input policy.

## 4,096-character body-input pass

The same 749 train and 150 validation reports were parsed with a normalized
body prefix of up to 4,096 characters. The adapter retains its original
first-384-character duplicate key, so event selection and split counts are
unchanged. Packaged E5 still has a 512-token cap. The 12-policy train-only
selection chose title weight `0.08`, neighborhood support weight `0.08`,
and cutoff `1.0062902465169392`. No validation label changed that choice.

| Measure | Train | Validation |
| --- | ---: | ---: |
| E5 top-three contains a true-event report | 718/749 | 150/150 |
| Admitted direct true pairs | 14/4,536 | 1/803 |
| Admitted direct false pairs | 0/275,590 | 0/10,372 |
| Same-category direct false pairs | 0/43,458 | 0/1,682 |
| Joined true pairs in whole groups | 14/4,536 | 1/803 |
| Joined false pairs in whole groups | 0/275,590 | 0/10,372 |
| False mixed groups | 0 | 0 |
| Complete gold events recovered | 0/59 | 0/13 |
| Predicted groups | 735 | 149 |

Unchanged body-E5 cosine `0.94` admitted 15/4,536 true train pairs and
0/803 true validation pairs, with zero false pairs in both splits. The
longer body pass took about 501 seconds of embedding and 512 seconds total
with 80-report chunks. Its best rejected train policy mixed 13 groups and
joined 31 false pairs, including 18 same-category pairs. It was not applied
to validation. Relative to the 384-character surrogate, the longer input
adds just one safe validation join; this does not establish a useful Topic
matcher or a general input-length effect.

The result is decisively negative for **this candidate**: validation
retrieval is high, but safe group admission is near zero. It does not prove that
retained title and vector fields fundamentally cannot support better Topic
matching. GlobeSumm event labels and same-category negatives are imperfect
proxies for the product's exact cross-publisher Topic identity. No model
weights, raw corpus content, or vector artifacts were saved. Product use of
this corpus remains subject to separate rights, Trust, retention, migration,
and live activation decisions.
