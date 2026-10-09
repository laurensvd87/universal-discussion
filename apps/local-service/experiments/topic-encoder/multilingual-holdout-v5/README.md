# Multilingual synthetic holdout v5

This independent offline holdout contains 50 original fictional reports: ten precise developments across five invented entity families, with two distinct developments per family. Each development is reported in English, Dutch, German, French, and Spanish. The five reports cover supportive, critical, neutral, skeptical, and consumer/public viewpoints.

Viewpoint assignment varies by development. Every language occurs in every
viewpoint at least once, but the 25 language-viewpoint cells are **not evenly
balanced**: observed counts range from one to four reports per cell. This is
less confounded than a fixed language-to-viewpoint assignment, but still a
limitation for interpreting aggregate results. Reports within a development
are intended to describe the same event; the two developments in a family
share an entity background but are intended to be separate events. Before
freezing, an independent agent read all 50 titles/bodies and found the ten
five-report developments internally consistent and the paired family events
distinct. Three wording problems it identified were corrected. This audit
is not human gold labeling and does not establish real-world accuracy.

All entities, places, people, and events are fictional. The prose is original and contains no private data. This is synthetic holdout material, not gold evidence of matching quality. Each JSONL line has exactly `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`; `split` is `holdout`. Observed bodies have 52–75 whitespace-delimited words.

The frozen file SHA-256 is
`618c0f470f62a7f2904cfeba43012f540c199f700b9032a5145de75bde8da604`.
Run `node --test --test-isolation=none apps/local-service/experiments/topic-encoder/multilingual-holdout-v5/integrity.test.js`
from the repository root for the exact-byte and structural checks. Its
topic labels are synthetic supervision; results must not be treated as a
publisher-validated benchmark.
