# Real cross-publisher Topic benchmark candidates (2026-10-09)

Status: JRC CSV owner-approved and acquired for private local research on
2026-10-09; no product training or release approval. See
[ADR-068](../decisions/ADR-068-jrc-cross-publisher-local-benchmark.md).

## Why another benchmark is needed

The current synthetic multilingual tests measure same-development recovery and
adjacent-event mistakes, but their wording and publisher diversity are artificial.
The previously approved Wikinews corpus links editions of Wikinews reports; it
does not by itself establish cross-publisher, opposing-viewpoint Topic quality.
No offline synthetic score currently authorizes a live matcher or discussion
migration under ADR-064/067.

The owner's current local catalog was inspected read-only and only aggregate
counts were printed: 144 Sources, 143 Source links, 19 multi-Source Topics,
largest group three. Among 142 embedded Sources there were 250 cross-Topic
pairs at cosine >= 0.90, 74 at >= 0.92, and 27 at >= 0.94. Existing Topic
membership is *not* ground truth: those counts neither prove false joins nor
missed joins. No URL, title, vector, contribution or token from the local
database was copied into this repository.

## Candidate A: EU Joint Research Centre UA-RU News

The [official dataset entry](https://data.europa.eu/data/datasets/fc214973-ce7f-401f-ad6d-2a08fa97cd1d?locale=en)
describes 4,251 June-2024 news articles in 110 manually curated clusters.
Its description says two analysts removed irrelevant articles and merged and
split thematic groups. This is unusually close to the app's *specific story*
clustering problem and could test multiple outlets and languages. However, it
is restricted to one geopolitical domain and month, so even a good result
would not validate products, health, entertainment or general web pages.

The portal's [public metadata API](https://data.europa.eu/api/hub/search/datasets/fc214973-ce7f-401f-ad6d-2a08fa97cd1d)
lists one CSV distribution marked CC BY 4.0. Its English description lists
article GUID, location entities, publication date, language, original URL,
title, integer cluster label and analyst-written cluster description; it
does **not** list full article bodies. We inspected metadata only and did not
download the CSV at that point. The CSV was subsequently obtained under the
owner's explicit private-local approval; its hash and aggregate inspection
are recorded in ADR-068. The distribution's CC BY label does not by itself settle
rights over original publisher headlines or commercial model training. The
domain/month and gold-label granularity also need review. Before obtaining
the CSV, request explicit owner approval for private local research. Product
training/release would need a separate rights review.

## Candidate B: SemEval-2022 Task 8

The [official ACL paper](https://aclanthology.org/2022.semeval-1.155/)
describes a multilingual news-article similarity task. It could be a useful
pair-ranking benchmark, especially for cross-language retrieval. Its graded
article similarity is not automatically the binary same-storyline label needed
for a shared discussion route. Article acquisition and publisher rights must
be checked separately from the paper's license; no downloader or publisher
content is pulled into this project by this note.

## Proposed evaluation, if separately approved

1. Freeze a candidate matcher, weights, thresholds and corpus parser before
   labels are opened. Do not tune on the final test split.
2. Score pair retrieval, hard same-Topic admission, full gold-group recovery,
   same-family/adjacent-event false joins, and abstentions separately.
3. Split by story family and publisher where metadata permits, not random
   article pairs from the same event. Audit language and viewpoint coverage.
4. Replay insertion/deletion and a large same-Topic cohort to check stable
   routing without an arbitrary page-count cap. Count affected conversation
   roots separately; do not mutate the owner's live data.
5. Keep original articles, URLs and derived vectors outside Git and provider
   requests. Publish only aggregate metrics and error categories unless rights
   clearance explicitly allows more.

The first [aggregate-only JRC result](../apps/local-service/experiments/topic-encoder/jrc-story-v1/RESULTS.md)
has now rejected title-only E5 at the frozen 0.90/0.94 admission gates after
false exploratory-validation joins. It does not settle body-E5 performance,
and the selected test split remains sealed. Next research needs a materially
different, predeclared event-evidence method and a better independent
cross-publisher/viewpoint benchmark; do not tune repeatedly on five
validation labels. Product training, any new retained representation and
live matcher activation still require separate rights, owner and Trust
decisions.
