# ADR-068: JRC cross-publisher news benchmark — private local research

Status: **owner-approved for private local research only** on 2026-10-09.

## Scope and provenance

The owner explicitly approved downloading and evaluating the one EU Joint
Research Centre UA-RU News CSV locally after the provenance and rights caveats
in the [benchmark note](../research/TOPIC_MATCHING_REAL_BENCHMARK_2026-10-09.md)
were presented. The [official dataset entry](https://data.europa.eu/data/datasets/fc214973-ce7f-401f-ad6d-2a08fa97cd1d?locale=en)
describes 4,251 June-2024 news records in 110 analyst-curated clusters. The
[portal metadata API](https://data.europa.eu/api/hub/search/datasets/fc214973-ce7f-401f-ad6d-2a08fa97cd1d)
marks the CSV distribution CC BY 4.0. This metadata is not a determination of
rights in each publisher headline, nor permission for product training or
release.

The file was obtained from the official JRC distribution
`https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/EMM/UA-RUNews/UA_RU_news.csv`
into a private Windows Temp directory outside Git. It is 1,952,279 bytes and
has SHA-256 `05cbdc609102ef026accc5ad5c9d7202b1c0718a651448132ad04b1bb4396ab2`.
The header is `guid,georsscountry,entity_list,pubdate,language,link,title,LABEL,LABEL_description`.
Content-free local inspection found 4,251 rows, 110 nonempty labels, 39
language values and 1,514 distinct URL hosts; no title, URL, label value,
article text or vector was emitted. Group sizes range from 2 to 423. A URL
host is not necessarily a distinct editorial publisher.
Further aggregate, case-insensitive raw-title inspection found 3,358 distinct
title groups, leaving 893 surplus rows across 442 repeated-title groups (all
within one label; maximum multiplicity 21). All 4,251 publication dates
parsed. Headline repetition can inflate retrieval and apparent cross-host agreement;
report duplicate-resistant slices separately.

## Research boundaries

Only offline, aggregate-only evaluation is approved. The CSV, row-level
derived data, URLs, titles, label assignments and vectors stay outside Git,
logs, the running local service, the extension and AI-provider requests. Code
and fictional fixtures may be committed; aggregate metrics and error
categories may be reported. Do not save model weights or ship a model trained
on this corpus. No live Topic assignment, discussion migration, additional
retained representation, new capture permission, crawling, deployment or
publication follows from this approval. The ADR-064/067 owner/Trust activation
gate and a separate publisher-rights review remain binding.

Use cluster-disjoint development/test partitions and preserve a final holdout.
Measure cross-host and cross-language same-label retrieval separately from
hard Topic admission, false joins and complete-group recovery. The largest
label contains 423 records: a label may represent a broad theme or developing
story rather than the app's desired exact discussion Topic. This is a research
proxy, not unquestioned ground truth. The file contains titles, not full page
content or verified stance labels, and is confined to one geopolitical domain
and month. Avoid turning an offline compute sample into any product Topic-size
cap. Existing production E5/body matching cannot be claimed validated by a
title-only result.

## First offline result and decision

The [aggregate-only JRC pilot](../apps/local-service/experiments/topic-encoder/jrc-story-v1/RESULTS.md)
used a deterministic 1,200-title/26-label whole-cluster compute sample.
Train contained 702 titles/16 labels; fixed title-E5 cosine 0.90 made
27,793 same-label and zero different-label cross-host pair admissions there,
but completely recovered only 2/16 labels. The approved, content-free
pre-validation audit found no normalized cross-label title/URL duplicate,
near-title candidate or high-overlap description pair. It explicitly did
**not** verify event disjointness or publisher independence.

The unchanged rule was then scored once on the 286-title/five-label
exploratory validation split. Cosine 0.90 made 22 different-label pair
admissions and, after connected-component grouping, 687 false grouped pairs;
cosine 0.94 still made one false pair. Cross-language hard-match recall was
particularly weak despite high candidate retrieval. **Reject this title-only
rule for live Topic admission.** Do not choose a new threshold from these
five validation labels and treat them as an untouched holdout. The test split
remains unopened. This result neither validates nor directly falsifies the
production body-E5 input; the representation is different. No product code,
stored Source, Topic or discussion was changed.
