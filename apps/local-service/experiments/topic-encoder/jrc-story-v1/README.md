# JRC UA-RU News story benchmark harness

Offline, aggregate-only research harness for the owner-approved private copy
of [JRC UA-RU News](https://data.europa.eu/data/datasets/fc214973-ce7f-401f-ad6d-2a08fa97cd1d?locale=en).
The official catalog describes 4,251 articles and 110 manually curated
clusters. This harness does not alter production Topic matching, retain any
new representation, call a provider, access the network, or download data.
The coding agent did not score private data; the lead later scored train and
one exploratory validation split. See [results](RESULTS.md). The test remains
unopened.

The CLI accepts only the exact owner-verified CSV header, in order:
`guid,georsscountry,entity_list,pubdate,language,link,title,LABEL,LABEL_description`.
`LABEL` is treated as the gold cluster, `title` as the only model input, and
the hostname of `link` as a **coarse source proxy**. Different URL hosts do
not prove independent publishers or opposing viewpoints. Invalid or absent
HTTP(S) links cannot contribute to cross-host pair metrics. The CSV parser
handles quoted commas, line breaks, and doubled quotes; it requires UTF-8,
caps the input at 16 MiB, rows at 10,000, and any cell at 100,000 characters.
The approved CSV is pinned to SHA-256
`05cbdc609102ef026accc5ad5c9d7202b1c0718a651448132ad04b1bb4396ab2`.

`--inspect` checks the hash/schema and prints aggregate counts without
loading E5. `--audit` likewise loads no model and emits only fixed aggregate
leakage-risk counts. `--score` first selects entire `LABEL` clusters in deterministic
hash order under a 1,200-title **compute budget**, with the largest cluster
reserved first. It then assigns each selected cluster wholly to train,
validation, or test using a deterministic greedy 60/20/20 article target,
with label-count balance as a secondary term. The largest selected cluster
goes to train when that best preserves the article target. A large cluster
is included whole or left unscored; no Topic
member limit is imposed. The packaged E5 model embeds titles alone, using
its `body` input mode with the title as that sole text. The lexical comparator
is Unicode title-token Jaccard. Frozen, untuned diagnostics report E5 cosine
at 0.94 and 0.90, lexical Jaccard at 0.50, and top-three true-cluster
retrieval. Pair scores consider only distinct valid URL hosts. No threshold
is selected after seeing train, validation, or test results.

For each requested split, the score report also gives aggregate fixed-gate
metrics for cross-host pairs in different languages, for non-identical
NFKC/case/whitespace-normalized titles, and after excluding that split's
largest label. Each slice reports positive/negative denominators, true/false
admissions, and eligible/found top-three retrieval. This isolates obvious
inflation from repeated titles and one very large label without changing
the gates or silently dropping those Sources from the main score.

A diagnostic connected-component calculation unions cross-host edges above
each fixed gate. It reports component count, mixed-label components, labels
recovered as one exact pure component, and true/false grouped pairs across
**all** articles in the split (including same-host pairs connected through
other hosts). Connected components can amplify one false edge into many
false grouped pairs. This is a whole-partition diagnostic, not the product's
Topic routing or a validated hard-admission policy.

`--score` requires `--split train|validation|test` and embeds/evaluates only
that requested split. A train invocation neither embeds nor scores validation
or test titles. The CSV is parsed to form the split and inspect aggregates;
the held-out titles remain unused by the model until an explicit later
invocation for their split.

Example from the repository root (substitute the private local path):

```powershell
node apps/local-service/experiments/topic-encoder/jrc-story-v1/run.js --dry-run
node apps/local-service/experiments/topic-encoder/jrc-story-v1/core.test.js
node apps/local-service/experiments/topic-encoder/jrc-story-v1/run.js --inspect --private-dir C:\private\jrc --input C:\private\jrc\UA_RU_news.csv
node apps/local-service/experiments/topic-encoder/jrc-story-v1/run.js --audit --private-dir C:\private\jrc --input C:\private\jrc\UA_RU_news.csv
node apps/local-service/experiments/topic-encoder/jrc-story-v1/run.js --score --private-dir C:\private\jrc --input C:\private\jrc\UA_RU_news.csv --split train
```

Both paths must be absolute; the input must be a regular file inside the
named private directory, and that directory must be outside Git. The
output contains only aggregate counts, timings, hashes, and fixed error
codes. Titles, URLs, entities, cluster labels, row IDs, per-row vectors,
and group assignments stay in process memory and are never logged or saved.
Only fictional CSV records generated inside `core.test.js` are committed.

The approved file passed a read-only aggregate `--inspect` on 2026-10-09:
4,251 rows, 110 labels, 1,514 valid URL hosts, 39 language values, and no
missing host or language. The deterministic compute selection contains 1,200
titles from 26 whole labels. It includes the full 423-row largest label;
train/validation/test comprise 702/286/212 titles and 16/5/5 labels.
The other 3,051 titles and 84 labels are unscored. This inspection did not
load E5 or evaluate any matching rule.

The audit predeclares two exact-duplicate normalizations. Titles use NFKC,
Unicode lowercase with `ß`/final-sigma folding, punctuation-to-space, and
collapsed whitespace. URLs use the parsed HTTP(S) URL, remove fragments and
only `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid` tracking parameters, then
sort remaining query entries. It counts exact normalized title/URL pairs
across different labels and across proposed splits. For near-title risk it
compares different-label articles no more than seven parsed calendar days
apart and requires Unicode token Jaccard at least 0.8 with at least three
shared tokens. At most six million candidate pairs are compared; `truncated`
flags an incomplete scan. Unparseable dates are counted and excluded from
that near-title test. Description overlap uses the same token rule between
distinct labels and counts high-risk pairs across splits. The report also
summarizes the largest label's article count, date span, distinct date days,
URL-host count, and repeated-title pair count. No title, URL, label,
description, date, or example leaves the process.

These checks are machine proxies. The audit deliberately returns
`eventDisjointnessVerified:false` even when every duplicate count is zero:
paraphrases, shared developments with different wording, and broad human
labels need separate review. The audit cannot certify holdout independence.

The approved file's aggregate-only audit on 2026-10-09 found zero
cross-label exact-title pairs, zero cross-label normalized-URL pairs, and
zero near-title pairs among 3,698,885 date-bounded cross-label comparisons
(not truncated). It found zero high-overlap description pairs; all 4,251
publication dates parsed, and no label had conflicting description variants.
The largest 423-row label spans 18 days and nine
distinct dates, with 253 distinct URL hosts and 708 repeated normalized-title
pairs **inside** that label. This reinforces the concern that its scope may
be broader than a precise event-level Topic. The audit still does not verify
event disjointness. One exploratory validation score followed; no test score did.

JRC's labels were curated as story clusters, but the 423-row largest label
observed in the private file raises a granularity question for this app's
precise event-level Topics. This benchmark measures agreement with those
labels, not product Topic identity or real publisher independence. This
exploratory title-only baseline does not definitively adjudicate cross-label event leakage or
establish viewpoint-independent publisher coverage. Its different-language
slice and connected-component proxy do not validate a live Topic matcher.
Local
research approval does not grant product training, release, or publisher
article rights. Any real-data result needs that separate review.
