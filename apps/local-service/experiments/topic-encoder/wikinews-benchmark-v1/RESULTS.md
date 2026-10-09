# Wikinews multilingual offline baseline (2026-10-09)

The owner approved this corpus for private local research only. The 45,258,115-byte
input passed bounded schema validation. SHA-256:
`b03da8d71ada96779e860e29a523a7e9f8bf5de3b595b45fd3c12d53b81958fa`.
It contains 15,200 records across 5,240 Wikinews `pageid` event groups. We
excluded 127 empty-body records. The deterministic whole-event compute sample
contains 1,200 eligible records, 392 events, and 32 languages. Events are kept
whole among eligible records, but any empty-body records were excluded first.
The remaining
13,873 eligible records were unscored. This is a compute budget, not a maximum
number of Sources allowed in a Topic.

The packaged local E5 model embedded each selected title plus 384 body characters
in about 110 seconds. The frozen complete-link cosine 0.94 baseline gave:

| Candidate pool | Articles/events | Same-event pairs joined | Different-event pairs joined | Groups |
| --- | ---: | ---: | ---: | ---: |
| Train only | 737 / 253 | 16 / 1,126 | 3 / 270,090 | 718 |
| Validation only | 207 / 66 | 9 / 328 | 0 / 20,993 | 199 |
| Test only | 256 / 73 | 9 / 534 | 0 / 32,106 | 247 |
| Entire sample, exploratory | 1,200 / 392 | 34 / 1,988 | 3 / 717,412 | 1,164 |

Every same-event pair in this selected sample is cross-language. The three
pooled false joins also shared at least one broad Wikinews category. Category
overlap is only a weak proxy for a nearby topic. One exact title/lead duplicate has conflicting
event labels, which limits certainty about the gold labels; the aggregate
benchmark does not establish whether that pair was among the three joins.

Retrieval is substantially better than automatic admission: within the
event-disjoint test pool, a true-event partner is the nearest article for
240/254 eligible queries and within the first three for 245/254. If candidate
search is restricted to another language, the true partner is nearest for
253/254. This diagnostic restriction is not an automatic Topic rule. The
0.94 grouping admits only 9/534 true test pairs. The held-out test split was
scored only for this predeclared baseline; do not tune a new model against it.

The dataset links Wikinews editions across languages. It does not directly
test independent publishers, different viewpoints, or adjacent event families.
The false joins and low recall reject the baseline as an activation candidate.
No product code, model weights, page content, vectors, or source URLs were
saved by this experiment.
